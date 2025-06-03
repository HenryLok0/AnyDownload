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

function isValidUrl(url) {
    if (typeof url !== 'string') {
        return false;
    }
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

async function checkNeedDynamic(url, userAgent) {
    if (!isValidUrl(url)) {
        throw new Error('Invalid URL');
    }
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
    // console.log('[DEBUG] normalizeUrl input - u:', u, 'base:', base); // More verbose input debug
    if (typeof u !== 'string' || typeof base !== 'string') {
        // console.log('[DEBUG] normalizeUrl: Invalid input type - u:', typeof u, 'base:', typeof base); // Debug input type
        // console.log('[DEBUG] normalizeUrl returning null: Invalid input type for u or base', 'u:', u, 'base:', base); // Debug null return
        return null;
    }
    try {
        // Use the base URL to resolve relative and protocol-relative URLs
        const absoluteUrl = new URL(u, base).href;
        // console.log('[DEBUG] normalizeUrl: Original:', u, 'Base:', base, 'Normalized:', absoluteUrl); // Debug normalized URL
        // Basic validation after normalization
        if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
             console.log('[DEBUG] normalizeUrl WARNING: Normalized URL does not start with http/https:', absoluteUrl, 'Original:', u, 'Base:', base); // Warning for unexpected normalization
             // Depending on desired behavior, might return null or the current absoluteUrl
             // For now, return null if it's not a web URL, as we only download web resources
             return null; // Treat as invalid if not http/https
        }
        // Temporarily remove isValidUrl check
        // if (!isValidUrl(absoluteUrl)) {
        //      console.log('[DEBUG] normalizeUrl: Normalized URL is invalid (isValidUrl check):', absoluteUrl, 'Original:', u); // Debug invalid normalized URL
        //      // console.log('[DEBUG] normalizeUrl returning null: Normalized URL is invalid', 'Normalized:', absoluteUrl, 'Original:', u); // Debug null return
        //      return null;
        // }
        return absoluteUrl;
    } catch (e) {
        console.log('[DEBUG] normalizeUrl: Error normalizing URL:', u, 'Base:', base, 'Error:', e.message); // Debug normalization error
        // console.log('[DEBUG] normalizeUrl returning null: Error normalizing URL', 'Original:', u, 'Base:', base, 'Error:', e.message); // Debug null return
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
        this.loginUrl = options.loginUrl || null;
        this.loginForm = options.loginForm || null;
        this.loginCredentials = options.loginCredentials || null;
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
        // Debug: print url received by downloadWebsite
        console.log('[DEBUG] url received in downloadWebsite:', url); // Debug output
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
            console.log('[DEBUG] Dynamic mode enabled, fetching dynamic HTML...'); // Debug output
            html = await this.fetchDynamicHtml(url);
        } else {
            console.log('[DEBUG] Static mode enabled, fetching static HTML...'); // Debug output
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

        // Debug: print raw resources found by Cheerio before initial processing
        console.log('[DEBUG] Raw resources found by Cheerio before initial processing:', resources.length, resources); // Debug output

        // Process and filter resources - Manual collection of raw resources for debugging
        let rawCollectedResources = [];
        console.log('[DEBUG] Starting manual raw resource collection...'); // Marker before manual loop
        for (const resource of resources) {
            rawCollectedResources.push(resource);
        }
        console.log('[DEBUG] Manual raw resource collection finished.', rawCollectedResources.length, rawCollectedResources); // Marker after manual loop

        // Temporarily assign rawCollectedResources back to resources for the rest of the flow
        resources = rawCollectedResources;

        // Debug: print resources after manual raw collection
        console.log('[DEBUG] Resources after manual raw collection:', resources.length, resources); // Debug output

        // Process and filter resources
        // Restore basic filtering chain
        resources = resources
            .map(r => normalizeUrl(r, url))
            .filter(r => {
                if (!r) console.log('[DEBUG] Filtered invalid or null URL after normalization:', r); // Debug invalid URL filter
                return !!r; // Remove null, undefined, empty string
            })
            .filter(r => {
                 const hash = hashUrl(r);
                 if (this.resourceHashSet.has(hash)) {
                     console.log('[DEBUG] Filtered duplicate resource:', r); // Debug duplicate filter
                     return false;
                 }
                 this.resourceHashSet.add(hash);
                 return true;
            });

        console.log('[DEBUG] Resources after normalize, invalid, and duplicate filter:', resources.length, resources); // Debug output

        // Now apply type and regex filters
        resources = resources.filter(r => {
            // Resource type filter
            if (this.type !== 'all') {
                const ext = path.extname(r).toLowerCase();
                const isFiltered = (this.type === 'image' && !/\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i.test(ext)) ||
                                   (this.type === 'css' && ext !== '.css') ||
                                   (this.type === 'js' && ext !== '.js') ||
                                   (this.type === 'html' && !/\.html?$/i.test(ext)) ||
                                   (this.type === 'media' && !/\.(mp4|mp3|ogg|wav|webm|m4a|aac)$/i.test(ext));
                if (isFiltered) console.log('[DEBUG] Filtered resource by type:', r, 'Type:', this.type); // Debug type filter
                return !isFiltered;
            }
            return true;
        });

        console.log('[DEBUG] Resources after type filter:', resources.length, resources); // Debug output

        resources = resources.filter(r => {
            if (this.filterRegex && !this.filterRegex.test(r)) {
                console.log('[DEBUG] Filtered resource by regex:', r, 'Regex:', this.filterRegex.source); // Debug regex filter
                return false;
            }
            return true;
        });

        console.log('[DEBUG] Resources after regex filter:', resources.length, resources); // Debug output

        // Resume: Skip the existing file
        resources = resources.filter(r => {
            const filename = getFilenameFromUrl(r);
            const savePath = path.join(baseDir, filename);
            const exists = fs.existsSync(savePath);
            if (exists) console.log('[DEBUG] Filtered existing file (resume): ', r); // Debug resume filter
            return !exists;
        });

        // Debug: print resources after final filtering:
        console.log('[DEBUG] Resources after final filtering:', resources.length, resources); // Debug output

        // 5. Recursively fetch same-domain a[href]
        let pageLinks = [];
        if (this.recursive && depth < this.maxDepth) {
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                const abs = normalizeUrl(href, url);
                if (abs && abs.startsWith(new URL(url).origin) && !this.visited.has(abs)) {
                    // Check if page link is filtered by regex
                    if (this.filterRegex && !this.filterRegex.test(abs)) {
                         console.log('[DEBUG] Filtered page link by regex:', abs, 'Regex:', this.filterRegex.source); // Debug regex filter for page links
                         return;
                    }
                    pageLinks.push(abs);
                } else if (abs && !abs.startsWith(new URL(url).origin)) {
                    console.log('[DEBUG] Filtered page link (external domain):', abs); // Debug external domain filter
                }
            });
        }

        // Debug: print page links after filtering
        console.log('[DEBUG] Page links after filtering:', pageLinks); // Debug output

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
                    // Use original normalizeUrl for fixing paths in HTML to match saved filenames
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
        // Update total based on the simplified resources list
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
            // Use getFilenameFromUrl with the normalized URL
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

    async handleLogin(page) {
        if (!this.loginUrl || !this.loginForm || !this.loginCredentials) return;

        console.log('[DEBUG] Attempting to login...');
        try {
            await page.goto(this.loginUrl);
            
            // Fill login form
            for (const [field, value] of Object.entries(this.loginForm)) {
                await page.type(field, this.loginCredentials[value]);
            }
            
            // Submit form
            await Promise.all([
                page.waitForNavigation(),
                page.click('button[type="submit"]')
            ]);

            // 檢查登入是否成功
            const currentUrl = page.url();
            const pageContent = await page.content();
            
            // 檢查是否仍在登入頁面或出現錯誤訊息
            if (currentUrl === this.loginUrl || 
                pageContent.includes('error') || 
                pageContent.includes('invalid') || 
                pageContent.includes('incorrect')) {
                throw new Error('invalid_credentials');
            }
            
            console.log('[DEBUG] Login completed successfully');
        } catch (error) {
            console.log('[DEBUG] Login failed:', error.message);
            if (error.message === 'invalid_credentials') {
                throw new Error('invalid_credentials');
            }
            throw new Error('login_failed');
        }
    }

    async fetchDynamicHtml(url) {
        console.log('[DEBUG] Inside fetchDynamicHtml for URL:', url);
        if (this.browserType === 'puppeteer') {
            const browser = await puppeteer.launch({ headless: this.headless ? 'new' : false });
            const page = await browser.newPage();
            await page.setUserAgent(this.userAgent);
            if (this.cookie) {
                await page.setExtraHTTPHeaders({ Cookie: this.cookie });
            }

            try {
                // Handle login if credentials are provided
                if (this.loginUrl) {
                    await this.handleLogin(page);
                }

                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

                // Wait for a fixed duration
                console.log('[DEBUG] Waiting for 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                console.log('[DEBUG] Finished waiting.');

                const html = await page.content();
                await browser.close();
                console.log('[DEBUG] Successfully fetched dynamic HTML. Length:', html.length);
                return html;
            } catch (error) {
                await browser.close();
                console.log('[DEBUG] Error in fetchDynamicHtml:', error.message);
                throw error;
            }
        }
        // Expandable Playwright
        throw new Error('Only puppeteer supported now');
    }
}

module.exports = { Downloader, checkNeedDynamic };