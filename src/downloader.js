const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const { URL } = require('url');
const crypto = require('crypto');
const mime = require('mime-types');
const { pipeline } = require('stream');
const { promisify } = require('util');
const undici = require('undici');
const EventEmitter = require('events');
const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');

const streamPipeline = promisify(pipeline);

async function checkNeedDynamic(url, userAgent) {
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': userAgent }
        });
        const html = res.data;
        if (html.length < 5000 || /<div id="app"|ng-app|window\.__INITIAL_STATE__|<script src="\/_next\//.test(html)) {
            return true;
        }
        return false;
    } catch {
        return true;
    }
}

function normalizeUrl(u, base) {
    try {
        return new URL(u, base).href;
    } catch {
        return null;
    }
}

function getFilenameFromUrl(resourceUrl, contentType = '') {
    const pathname = new URL(resourceUrl).pathname;
    let filename = path.basename(pathname);
    if (!filename || filename === '/') filename = 'index';
    // Add extension if missing
    if (!path.extname(filename) && contentType) {
        const ext = mime.extension(contentType);
        if (ext) filename += '.' + ext;
    }
    return filename;
}

function hashUrl(url) {
    return crypto.createHash('sha1').update(url).digest('hex');
}

class Downloader extends EventEmitter {
    constructor(options = {}) {
        super();
        this.delay = options.delay || 1000;
        this.userAgent = options.userAgent;
        this.dynamic = options.dynamic || false;
        this.onResource = options.onResource || (() => {});
        this.onError = options.onError || (() => {});
        this.concurrency = options.concurrency || 5;
        this.cookie = options.cookie || '';
        this.failedResources = [];
        this.successCount = 0;
        this.failCount = 0;
        this.downloadedBytes = 0;
        this.visited = new Set();
        this.recursive = options.recursive || false;
        this.maxDepth = options.maxDepth || 1;
        this.outputDir = options.outputDir || path.join(__dirname, '..', 'downloaded_site');
        this.verbose = options.verbose || false;
        this.retry = options.retry || 3;
        this.type = options.type || 'all';
        this.gzip = options.gzip !== false;
        this.resourceHashSet = new Set();
        this.filterRegex = options.filterRegex ? new RegExp(options.filterRegex) : null;
        this.headless = options.headless !== false;
        this.browserType = options.browserType || 'puppeteer';
        this.paused = false;
        this.cancelled = false;
        this.resumeCallback = null;
        this.proxy = options.proxy || null;
        this.speedLimit = options.speedLimit || 0;
        this.resumeDownload = options.resumeDownload || false;
        this.sitemapEnabled = options.sitemapEnabled || false;
        this.rateLimit = options.rateLimit || null;
        this.timeout = options.timeout || 30000;
        this.maxFileSize = options.maxFileSize || 0;
        this.retryDelay = options.retryDelay || 1000;
        this.validateSSL = options.validateSSL !== false;
        this.followRedirects = options.followRedirects !== false;
        this.maxRedirects = options.maxRedirects || 5;
        this.keepOriginalUrls = options.keepOriginalUrls || false;
        this.cleanUrls = options.cleanUrls || false;
        this.ignoreErrors = options.ignoreErrors || false;
        this.parallelLimit = options.parallelLimit || 5;
        this.downloadQueue = [];
        this.activeDownloads = 0;
        this.totalSize = 0;
        this.startTime = Date.now();
        this.lastProgressUpdate = Date.now();
        this.progressInterval = options.progressInterval || 1000;
    }

    pause() {
        this.paused = true;
    }
    resume() {
        this.paused = false;
        if (this.resumeCallback) this.resumeCallback();
    }
    cancel() {
        this.cancelled = true;
    }

    async generateSitemap() {
        if (!this.sitemapEnabled) return;
        
        const sitemap = new SitemapStream({ hostname: this.baseUrl });
        const pipeline = sitemap.pipe(createGzip());
        
        for (const url of this.visited) {
            sitemap.write({ url, changefreq: 'daily', priority: 0.7 });
        }
        
        sitemap.end();
        const data = await streamToPromise(pipeline);
        await fs.writeFile(path.join(this.outputDir, 'sitemap.xml.gz'), data);
    }

    async downloadWithResume(url, filePath) {
        if (!this.resumeDownload) {
            return this.downloadResource(url, filePath);
        }

        const fileExists = await fs.pathExists(filePath);
        if (!fileExists) {
            return this.downloadResource(url, filePath);
        }

        const stat = await fs.stat(filePath);
        const headers = { 'Range': `bytes=${stat.size}-` };
        
        try {
            const response = await axios.get(url, { headers, responseType: 'stream' });
            const writer = fs.createWriteStream(filePath, { flags: 'a' });
            await streamPipeline(response.data, writer);
        } catch (error) {
            if (error.response?.status === 416) {
                // File already complete
                return;
            }
            throw error;
        }
    }

    async downloadWithSpeedLimit(url, filePath) {
        if (!this.speedLimit) {
            return this.downloadResource(url, filePath);
        }

        const response = await axios.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);
        const reader = response.data;
        
        let downloaded = 0;
        const startTime = Date.now();
        
        reader.on('data', (chunk) => {
            downloaded += chunk.length;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = downloaded / elapsed;
            
            if (speed > this.speedLimit) {
                const delay = (downloaded / this.speedLimit) - elapsed;
                if (delay > 0) {
                    reader.pause();
                    setTimeout(() => reader.resume(), delay * 1000);
                }
            }
        });
        
        await streamPipeline(reader, writer);
    }

    async downloadWithProxy(url, filePath) {
        if (!this.proxy) {
            return this.downloadResource(url, filePath);
        }

        const proxyConfig = {
            target: url,
            changeOrigin: true,
            ...this.proxy
        };

        const proxyMiddleware = createProxyMiddleware(proxyConfig);
        // Implementation of proxy download logic
    }

    async validateResource(url, filePath) {
        if (!this.validateSSL) return true;
        
        try {
            const response = await axios.head(url);
            const contentType = response.headers['content-type'];
            const contentLength = response.headers['content-length'];
            
            if (this.maxFileSize && contentLength > this.maxFileSize) {
                throw new Error('File size exceeds limit');
            }
            
            return true;
        } catch (error) {
            if (this.ignoreErrors) return false;
            throw error;
        }
    }

    async cleanUrl(url) {
        if (!this.cleanUrls) return url;
        
        const parsed = new URL(url);
        parsed.search = ''; // Remove query parameters
        parsed.hash = ''; // Remove hash
        return parsed.toString();
    }

    async downloadWebsite(url, depth = 0, baseDir = null) {
        if (this.visited.has(url) || this.cancelled) return;
        this.visited.add(url);

        const host = new URL(url).host.replace(/[:\/\\]/g, '_');
        baseDir = baseDir || path.join(this.outputDir, host);
        await fs.ensureDir(baseDir);

        if (this.sitemapEnabled) {
            await this.generateSitemap();
        }

        let html;
        if (this.dynamic) {
            html = await this.fetchDynamicHtml(url);
        } else {
            html = await this.fetchStaticHtml(url);
        }

        const $ = cheerio.load(html);
        let resources = [];

        // 1. Images, CSS, JS, manifest, webp, avif
        $('img[src],link[rel="stylesheet"][href],script[src],link[rel="manifest"][href]').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('href');
            if (src && !src.startsWith('data:')) resources.push(src);
            // srcset
            if ($(el).attr('srcset')) {
                $(el).attr('srcset').split(',').forEach(item => {
                    const s = item.trim().split(' ')[0];
                    if (s && !s.startsWith('data:')) resources.push(s);
                });
            }
        });
        // favicon
        $('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('data:')) resources.push(href);
        });
        // Fonts
        $('link[rel="preload"][as="font"],style').each((_, el) => {
            if ($(el).attr('href')) resources.push($(el).attr('href'));
            // CSS @font-face
            if (el.tagName === 'style') {
                const css = $(el).html();
                const fontUrls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1]);
                fontUrls.forEach(fu => { if (!fu.startsWith('data:')) resources.push(fu); });
            }
        });
        // Video/Audio
        $('video[src],audio[src],source[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('data:')) resources.push(src);
        });
        // iframe, object, embed
        $('iframe[src],object[data],embed[src]').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data');
            if (src && !src.startsWith('data:')) resources.push(src);
        });
        // inline style background-image
        $('[style]').each((_, el) => {
            const style = $(el).attr('style');
            const matches = [...style.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)];
            matches.forEach(m => {
                if (m[1] && !m[1].startsWith('data:')) resources.push(m[1]);
            });
        });

        // Filter duplicate, invalid, existing files, types, regular expressions
        resources = resources
            .map(r => normalizeUrl(r, url))
            .filter(r => !!r)
            .filter(r => {
                const hash = hashUrl(r);
                if (this.resourceHashSet.has(hash)) return false;
                this.resourceHashSet.add(hash);
                // Resource type filter
                if (this.type !== 'all') {
                    const ext = path.extname(r).toLowerCase();
                    if (this.type === 'image' && !/\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i.test(ext)) return false;
                    if (this.type === 'css' && ext !== '.css') return false;
                    if (this.type === 'js' && ext !== '.js') return false;
                    if (this.type === 'html' && !/\.html?$/i.test(ext)) return false;
                    if (this.type === 'media' && !/\.(mp4|mp3|ogg|wav|webm|m4a|aac)$/i.test(ext)) return false;
                }
                if (this.filterRegex && !this.filterRegex.test(r)) return false;
                return true;
            });

        // Resume: Skip the existing file
        resources = resources.filter(r => {
            const filename = getFilenameFromUrl(r);
            const savePath = path.join(baseDir, filename);
            return !fs.existsSync(savePath);
        });

        // 5. Recursively fetch same-domain a[href]
        let pageLinks = [];
        if (this.recursive && depth < this.maxDepth) {
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                const abs = normalizeUrl(href, url);
                if (abs && abs.startsWith(new URL(url).origin) && !this.visited.has(abs)) {
                    pageLinks.push(abs);
                }
            });
        }

        // Fix all resource paths in HTML
        resources.forEach(resource => {
            const abs = resource;
            if (!abs) return;
            const filename = getFilenameFromUrl(abs);
            $(`[src="${abs}"]`).attr('src', filename);
            $(`[href="${abs}"]`).attr('href', filename);
            // srcset
            $('[srcset]').each((_, el) => {
                let srcset = $(el).attr('srcset');
                if (!srcset) return;
                let newSrcset = srcset.split(',').map(item => {
                    let [s, size] = item.trim().split(' ');
                    if (normalizeUrl(s, url) === abs) s = filename;
                    return size ? `${s} ${size}` : s;
                }).join(', ');
                $(el).attr('srcset', newSrcset);
            });
        });

        await fs.writeFile(path.join(baseDir, this._getPageFilename(url)), $.html());

        // Progress bar
        const bar = new cliProgress.SingleBar({
            format: 'Downloading [{bar}] {percentage}% | {value}/{total} | {filename} | {speed}/s | ETA: {eta}s | {success} ok, {fail} fail, {size} KB',
            hideCursor: true
        }, cliProgress.Presets.shades_classic);
        bar.start(resources.length, 0, { filename: '', success: 0, fail: 0, size: 0, speed: 0, eta: 0 });

        let idx = 0;
        let lastTime = Date.now();
        let lastBytes = 0;

        const downloadResource = async (resource, idx) => {
            let attempt = 0;
            const abs = resource;
            if (!abs) {
                bar.increment({ filename: 'invalid', success: this.successCount, fail: ++this.failCount, size: (this.downloadedBytes / 1024).toFixed(1) });
                this.failedResources.push({ url: resource, error: 'Invalid URL' });
                this.onError && this.onError(`Invalid URL: ${resource}`);
                return;
            }
            let filename = getFilenameFromUrl(abs);
            const savePath = path.join(baseDir, filename);
            while (attempt < this.retry) {
                if (this.cancelled) return;
                if (this.paused) {
                    await new Promise(resolve => this.resumeCallback = resolve);
                }
                try {
                    this.onResource(abs, idx + 1, resources.length);
                    // Resume: Skip the existing file
                    if (fs.existsSync(savePath)) {
                        bar.increment({ filename, success: ++this.successCount, fail: this.failCount, size: (this.downloadedBytes / 1024).toFixed(1) });
                        return;
                    }
                    const res = await undici.request(abs, {
                        method: 'GET',
                        headers: {
                            'User-Agent': this.userAgent,
                            ...(this.cookie ? { Cookie: this.cookie } : {}),
                            'Accept-Encoding': this.gzip ? 'gzip, deflate, br' : undefined
                        },
                        maxRedirections: 5
                    });
                    const contentType = res.headers['content-type'] || '';
                    filename = getFilenameFromUrl(abs, contentType);
                    const fileStream = fs.createWriteStream(savePath);
                    await streamPipeline(res.body, fileStream);
                    const stat = await fs.stat(savePath);
                    this.downloadedBytes += stat.size;
                    this.successCount++;
                    // Speed and ETA
                    const now = Date.now();
                    const elapsed = (now - lastTime) / 1000;
                    const speed = elapsed > 0 ? ((this.downloadedBytes - lastBytes) / 1024 / elapsed).toFixed(1) : 0;
                    const eta = speed > 0 ? ((resources.length - (idx + 1)) * stat.size / 1024 / speed).toFixed(1) : 0;
                    lastTime = now;
                    lastBytes = this.downloadedBytes;
                    bar.increment({ filename, success: this.successCount, fail: this.failCount, size: (this.downloadedBytes / 1024).toFixed(1), speed, eta });
                    await new Promise(r => setTimeout(r, this.delay));
                    return;
                } catch (err) {
                    attempt++;
                    if (attempt >= this.retry) {
                        this.failCount++;
                        let msg = err.message;
                        if (msg.includes('403')) msg += ' (Permission denied, maybe anti-bot)';
                        if (msg.includes('429')) msg += ' (Too many requests, try slower)';
                        if (msg.match(/cloudflare|captcha/i)) msg += ' (Cloudflare/captcha detected)';
                        bar.increment({ filename: 'fail', success: this.successCount, fail: this.failCount, size: (this.downloadedBytes / 1024).toFixed(1), speed: 0, eta: 0 });
                        this.failedResources.push({ url: abs, error: msg });
                        this.onError && this.onError(`Failed: ${abs} (${msg})`);
                    }
                }
            }
        };

        // Speed ​​limit and maximum simultaneous connections
        let resIdx = 0;
        const runBatch = async () => {
            while (resIdx < resources.length && !this.cancelled) {
                const batch = [];
                for (let c = 0; c < this.concurrency && resIdx < resources.length; c++, resIdx++) {
                    batch.push(downloadResource(resources[resIdx], resIdx));
                }
                await Promise.all(batch);
            }
        };
        await runBatch();
        bar.stop();

        // Recursively download same-domain pages
        for (const link of pageLinks) {
            await this.downloadWebsite(link, depth + 1, baseDir);
        }
    }

    _getPageFilename(url) {
        const u = new URL(url);
        let filename = u.pathname.replace(/\/$/, '') || 'index';
        filename = filename.replace(/[\/\\?%*:|"<>]/g, '_');
        if (!filename.endsWith('.html')) filename += '.html';
        return filename;
    }

    async fetchStaticHtml(url) {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': this.userAgent,
                ...(this.cookie ? { Cookie: this.cookie } : {}),
                'Accept-Encoding': this.gzip ? 'gzip, deflate, br' : undefined
            }
        });
        return res.data;
    }

    async fetchDynamicHtml(url) {
        if (this.browserType === 'puppeteer') {
            const browser = await puppeteer.launch({ headless: this.headless ? 'new' : false });
            const page = await browser.newPage();
            await page.setUserAgent(this.userAgent);
            if (this.cookie) {
                await page.setExtraHTTPHeaders({ Cookie: this.cookie });
            }
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            const html = await page.content();
            await browser.close();
            return html;
        }
        // Expandable Playwright
        throw new Error('Only puppeteer supported now');
    }
}

module.exports = { Downloader, checkNeedDynamic };