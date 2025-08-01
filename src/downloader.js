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
const { createGzip, createGunzip, createInflate } = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const playwright = require('playwright');

// Add brotli decompression support
const brotli = require('brotli');

const streamPipeline = promisify(pipeline);

// Check if a string is a valid URL
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

// Check if dynamic rendering is needed for a URL
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

// Normalize a URL relative to a base URL
function normalizeUrl(u, base) {
    if (typeof u !== 'string' || typeof base !== 'string') {
        return null;
    }
    try {
        const absoluteUrl = new URL(u, base).href;
        if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
            return null;
        }
        return absoluteUrl;
    } catch (e) {
        return null;
    }
}

// Get filename from URL, add extension if missing
function getFilenameFromUrl(resourceUrl, contentType = '') {
    const url = new URL(resourceUrl);
    let filepath = url.pathname;
    
    // Remove leading slash if exists
    if (filepath.startsWith('/')) {
        filepath = filepath.substring(1);
    }
    
    // If path is empty or just '/', use 'index'
    if (!filepath || filepath === '/') {
        filepath = 'index';
    }
    
    // Add extension if missing
    if (!path.extname(filepath) && contentType) {
        const ext = mime.extension(contentType);
        if (ext) filepath += '.' + ext;
    }
    
    // Replace invalid characters
    filepath = filepath.replace(/[\\?%*:|"<>]/g, '_');
    
    return filepath;
}

// Hash a URL for deduplication
function hashUrl(url) {
    return crypto.createHash('sha1').update(url).digest('hex');
}

class Downloader extends EventEmitter {
    constructor(options = {}) {
        super();
        // Download options
        this.delay = options.delay || 1000;
        this.userAgent = options.userAgent;
        this.dynamic = options.dynamic || false;
        this.onResource = options.onResource || (() => { });
        this.onError = options.onError || (() => { });
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

    // Generate sitemap.xml.gz if enabled
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

    // Download with resume support
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

    // Download with speed limit
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

    // Download with proxy (not implemented)
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
        // Proxy download logic to be implemented
    }

    // Validate resource (SSL, file size)
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

    // Clean URL (remove query/hash)
    async cleanUrl(url) {
        if (!this.cleanUrls) return url;

        const parsed = new URL(url);
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    }

    // Main website download logic
    async downloadWebsite(url, depth = 0, baseDir = null) {
        console.log('[DEBUG] url received in downloadWebsite:', url);
        if (this.visited.has(url) || this.cancelled) return;
        this.visited.add(url);

        const host = new URL(url).host.replace(/[:\/\\]/g, '_');
        baseDir = baseDir || path.join(this.outputDir, host);
        await fs.ensureDir(baseDir);

        if (this.sitemapEnabled) {
            await this.generateSitemap();
        }

        let html;
        try {
            if (this.dynamic) {
                console.log('[DEBUG] Dynamic mode enabled, fetching dynamic HTML...');
                html = await this.fetchDynamicHtml(url);
            } else {
                console.log('[DEBUG] Static mode enabled, fetching static HTML...');
                html = await this.fetchStaticHtml(url);
            }
        } catch (error) {
            console.error('[DEBUG] Error fetching HTML:', error);
            this.onError && this.onError(error.message);
            throw error;
        }

        const $ = cheerio.load(html);
        let resources = [];

        // Collect resources
        $('img[src],link[rel="stylesheet"][href],script[src],link[rel="manifest"][href]').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('href');
            if (src && !src.startsWith('data:')) resources.push(src);
            if ($(el).attr('srcset')) {
                $(el).attr('srcset').split(',').forEach(item => {
                    const s = item.trim().split(' ')[0];
                    if (s && !s.startsWith('data:')) resources.push(s);
                });
            }
        });
        $('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('data:')) resources.push(href);
        });
        $('link[rel="preload"][as="font"],style').each((_, el) => {
            if ($(el).attr('href')) resources.push($(el).attr('href'));
            if (el.tagName === 'style') {
                const css = $(el).html();
                const fontUrls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1]);
                fontUrls.forEach(fu => { if (!fu.startsWith('data:')) resources.push(fu); });
            }
        });
        $('video[src],audio[src],source[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('data:')) resources.push(src);
        });
        $('iframe[src],object[data],embed[src]').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data');
            if (src && !src.startsWith('data:')) resources.push(src);
        });
        $('[style]').each((_, el) => {
            const style = $(el).attr('style');
            const matches = [...style.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)];
            matches.forEach(m => {
                if (m[1] && !m[1].startsWith('data:')) resources.push(m[1]);
            });
        });

        // Debug: print raw resources
        console.log('[DEBUG] Raw resources found by Cheerio before initial processing:', resources.length, resources);

        // Manual collection for debugging
        let rawCollectedResources = [];
        for (const resource of resources) {
            rawCollectedResources.push(resource);
        }
        resources = rawCollectedResources;

        // 新增：取得本地儲存路徑（支援外部資源）
        const getLocalPathForResource = (absUrl) => {
            try {
                const urlObj = new URL(absUrl);
                // 外部資源存 external/域名/路徑
                if (urlObj.hostname !== baseUrl.hostname) {
                    return path.join('external', urlObj.hostname, urlObj.pathname.replace(/^\//, '')).replace(/\\/g, '/');
                } else {
                    // 主站資源維持原本結構
                    return urlObj.pathname.replace(/^\//, '');
                }
            } catch {
                return null;
            }
        };

        // 取代 HTML 內所有資源連結為本地路徑
        $('img[src],link[rel="stylesheet"][href],script[src],link[rel="manifest"][href]').each((_, el) => {
            const attr = $(el).attr('src') ? 'src' : 'href';
            const orig = $(el).attr(attr);
            if (orig && !orig.startsWith('data:') && !orig.startsWith('#')) {
                const abs = normalizeUrl(orig, url);
                const localPath = getLocalPathForResource(abs);
                if (localPath) $(el).attr(attr, localPath);
            }
        });
        // 取代 srcset
        $('[srcset]').each((_, el) => {
            const srcset = $(el).attr('srcset');
            if (srcset) {
                const newSrcset = srcset.split(',').map(item => {
                    const [src, size] = item.trim().split(' ');
                    if (src && !src.startsWith('data:') && !src.startsWith('#')) {
                        const abs = normalizeUrl(src, url);
                        const localPath = getLocalPathForResource(abs);
                        if (localPath) {
                            return size ? `${localPath} ${size}` : localPath;
                        }
                    }
                    return item;
                }).join(', ');
                $(el).attr('srcset', newSrcset);
            }
        });
        // 取代 style 內的背景圖
        $('[style]').each((_, el) => {
            const style = $(el).attr('style');
            if (style) {
                const newStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, sUrl) => {
                    if (!sUrl.startsWith('data:') && !sUrl.startsWith('#')) {
                        const abs = normalizeUrl(sUrl, url);
                        const localPath = getLocalPathForResource(abs);
                        if (localPath) {
                            return `url(\"${localPath}\")`;
                        }
                    }
                    return match;
                });
                $(el).attr('style', newStyle);
            }
        });

        // 收集所有資源（不論主域名或外部）
        resources = resources
            .map(r => normalizeUrl(r, url))
            .filter(r => !!r)
            .filter(r => {
                const hash = hashUrl(r);
                if (this.resourceHashSet.has(hash)) return false;
                this.resourceHashSet.add(hash);
                return true;
            });

        // Type and regex filters
        resources = resources.filter(r => {
            if (this.type !== 'all') {
                const ext = path.extname(r).toLowerCase();
                const isFiltered = (this.type === 'image' && !/\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i.test(ext)) ||
                    (this.type === 'css' && ext !== '.css') ||
                    (this.type === 'js' && ext !== '.js') ||
                    (this.type === 'html' && !/\.html?$/i.test(ext)) ||
                    (this.type === 'media' && !/\.(mp4|mp3|ogg|wav|webm|m4a|aac)$/i.test(ext));
                return !isFiltered;
            }
            return true;
        });

        resources = resources.filter(r => {
            if (this.filterRegex && !this.filterRegex.test(r)) {
                return false;
            }
            return true;
        });

        // Save HTML file
        const baseUrl = new URL(url);
        const hostDir = baseUrl.host.replace(/[:\/\\]/g, '_');
        
        // Function to convert absolute URL to relative path
        const getRelativePath = (absUrl) => {
            if (!absUrl) return null;
            try {
                const targetUrl = new URL(absUrl);
                // Check if it's from the same domain or a subdomain
                if (targetUrl.hostname === baseUrl.hostname || 
                    targetUrl.hostname.endsWith('.' + baseUrl.hostname) ||
                    baseUrl.hostname.endsWith('.' + targetUrl.hostname)) {
                    // Get the path relative to the base directory
                    const targetPath = targetUrl.pathname;
                    // Remove leading slash and ensure it's relative
                    return targetPath.startsWith('/') ? targetPath.substring(1) : targetPath;
                }
            } catch (e) {
                return null;
            }
            return null;
        };

        // Convert all resource URLs to local paths using getLocalPathForResource
        $('a[href],img[src],link[rel="stylesheet"][href],script[src],link[rel="manifest"][href]').each((_, el) => {
            const attr = $(el).attr('src') ? 'src' : 'href';
            const orig = $(el).attr(attr);
            if (orig && !orig.startsWith('data:') && !orig.startsWith('#')) {
                const abs = normalizeUrl(orig, url);
                const localPath = getLocalPathForResource(abs);
                if (localPath) {
                    $(el).attr(attr, localPath);
                }
            }
        });

        // Handle srcset attributes
        $('[srcset]').each((_, el) => {
            const srcset = $(el).attr('srcset');
            if (srcset) {
                const newSrcset = srcset.split(',').map(item => {
                    const [src, size] = item.trim().split(' ');
                    if (src && !src.startsWith('data:') && !src.startsWith('#')) {
                        const abs = normalizeUrl(src, url);
                        const localPath = getLocalPathForResource(abs);
                        if (localPath) {
                            return size ? `${localPath} ${size}` : localPath;
                        }
                    }
                    return item;
                }).join(', ');
                $(el).attr('srcset', newSrcset);
            }
        });

        // Handle background images in style attributes
        $('[style]').each((_, el) => {
            const style = $(el).attr('style');
            if (style) {
                const newStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, sUrl) => {
                    if (!sUrl.startsWith('data:') && !sUrl.startsWith('#')) {
                        const abs = normalizeUrl(sUrl, url);
                        const localPath = getLocalPathForResource(abs);
                        if (localPath) {
                            return `url("${localPath}")`;
                        }
                    }
                    return match;
                });
                $(el).attr('style', newStyle);
            }
        });

        await fs.writeFile(path.join(baseDir, this._getPageFilename(url)), $.html());

        // Download resources
        let resIdx = 0;
        const downloadResource = async (resource, idx) => {
            let attempt = 0;
            const abs = resource;
            if (!abs) {
                this.failCount++;
                this.failedResources.push({ url: resource, error: 'Invalid URL' });
                this.onError && this.onError(`Invalid URL: ${resource}`);
                return;
            }
            // 使用 getLocalPathForResource 決定本地儲存路徑
            let localPath = getLocalPathForResource(abs);
            if (!localPath) {
                this.failCount++;
                this.failedResources.push({ url: resource, error: 'Invalid URL' });
                this.onError && this.onError(`Invalid URL: ${resource}`);
                return;
            }
            
            // 確保檔案有正確的副檔名
            const contentType = '';
            const ext = mime.extension(contentType);
            if (ext && !localPath.endsWith('.' + ext)) {
                localPath += '.' + ext;
            }
            
            const savePath = path.join(baseDir, localPath);
            
            // Ensure the directory exists
            await fs.ensureDir(path.dirname(savePath));

            while (attempt < this.retry) {
                if (this.cancelled) return;
                if (this.paused) {
                    await new Promise(resolve => this.resumeCallback = resolve);
                }

                try {
                    // Update progress
                    const now = Date.now();
                    const elapsed = (now - this.startTime) / 1000;
                    const speed = elapsed > 0 ? (this.downloadedBytes / 1024 / elapsed).toFixed(1) : 0;
                    const eta = speed > 0 ? ((resources.length - (idx + 1)) * 1024 / speed).toFixed(1) : 0;
                    
                    this.onResource(abs, idx + 1, resources.length, speed, eta);

                    if (fs.existsSync(savePath)) {
                        this.successCount++;
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
                    const contentEncoding = res.headers['content-encoding'] || '';
                    const fileStream = fs.createWriteStream(savePath);
                    
                    // Handle compression based on content-encoding header
                    let streamToWrite;
                    if (contentEncoding === 'gzip') {
                        streamToWrite = res.body.pipe(createGunzip());
                    } else if (contentEncoding === 'deflate') {
                        streamToWrite = res.body.pipe(createInflate());
                    } else if (contentEncoding === 'br') {
                        // For brotli, we need to handle it differently since it's not a stream
                        try {
                            const chunks = [];
                            for await (const chunk of res.body) {
                                chunks.push(chunk);
                            }
                            const buffer = Buffer.concat(chunks);
                            const decompressed = brotli.decompress(buffer);
                            if (decompressed) {
                                await fs.writeFile(savePath, decompressed);
                            } else {
                                // If brotli decompression fails, write the original buffer
                                await fs.writeFile(savePath, buffer);
                            }
                            const stat = await fs.stat(savePath);
                            this.downloadedBytes += stat.size;
                            this.successCount++;
                            await new Promise(r => setTimeout(r, this.delay));
                            return;
                        } catch (brotliError) {
                            console.log(`[DEBUG] Brotli decompression failed for ${abs}, writing original buffer`);
                            // If brotli decompression fails, try to write the original buffer
                            const chunks = [];
                            for await (const chunk of res.body) {
                                chunks.push(chunk);
                            }
                            const buffer = Buffer.concat(chunks);
                            await fs.writeFile(savePath, buffer);
                            const stat = await fs.stat(savePath);
                            this.downloadedBytes += stat.size;
                            this.successCount++;
                            await new Promise(r => setTimeout(r, this.delay));
                            return;
                        }
                    } else {
                        streamToWrite = res.body;
                    }

                    await streamPipeline(streamToWrite, fileStream);
                    
                    const stat = await fs.stat(savePath);
                    this.downloadedBytes += stat.size;
                    this.successCount++;
                    
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
                        this.failedResources.push({ url: abs, error: msg });
                        this.onError && this.onError(`Failed: ${abs} (${msg})`);
                    }
                }
            }
        };

        // Download resources with concurrency
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

        // Recursively download same-domain pages
        if (this.recursive && depth < this.maxDepth) {
            const pageLinks = [];
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                const abs = normalizeUrl(href, url);
                if (abs && abs.startsWith(new URL(url).origin) && !this.visited.has(abs)) {
                    if (this.filterRegex && !this.filterRegex.test(abs)) return;
                    pageLinks.push(abs);
                }
            });

            for (const link of pageLinks) {
                await this.downloadWebsite(link, depth + 1, baseDir);
            }
        }
    }

    // Get filename for a page
    _getPageFilename(url) {
        const u = new URL(url);
        let filename = u.pathname.replace(/\/$/, '') || 'index';
        filename = filename.replace(/[\/\\?%*:|"<>]/g, '_');
        if (!filename.endsWith('.html')) filename += '.html';
        return filename;
    }

    // Fetch static HTML
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

    // Puppeteer login logic
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

            // Check if login succeeded
            const currentUrl = page.url();
            const pageContent = await page.content();

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

    // Fetch dynamic HTML using Puppeteer or Playwright (all features supported)
    async fetchDynamicHtml(url) {
        console.log('[DEBUG] Inside fetchDynamicHtml for URL:', url);

        // Puppeteer branch
        if (this.browserType === 'puppeteer') {
            const browser = await puppeteer.launch({ headless: this.headless ? 'new' : false });
            const page = await browser.newPage();
            await page.setUserAgent(this.userAgent);
            if (this.cookie) {
                await page.setExtraHTTPHeaders({ Cookie: this.cookie });
            }

            try {
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

        // Playwright branch (all features supported)
        if (this.browserType === 'playwright') {
            const browser = await playwright.chromium.launch({ headless: this.headless !== false });
            const context = await browser.newContext({
                userAgent: this.userAgent,
                ...(this.cookie ? { extraHTTPHeaders: { Cookie: this.cookie } } : {})
            });
            const page = await context.newPage();

            try {
                // Login logic for Playwright (same as Puppeteer)
                if (this.loginUrl && this.loginForm && this.loginCredentials) {
                    console.log('[DEBUG] Attempting to login with Playwright...');
                    await page.goto(this.loginUrl);

                    // Fill login form
                    for (const [field, value] of Object.entries(this.loginForm)) {
                        await page.fill(field, this.loginCredentials[value]);
                    }

                    // Submit form
                    await Promise.all([
                        page.waitForNavigation(),
                        page.click('button[type="submit"]')
                    ]);

                    // Check if login succeeded
                    const currentUrl = page.url();
                    const pageContent = await page.content();
                    if (currentUrl === this.loginUrl ||
                        pageContent.includes('error') ||
                        pageContent.includes('invalid') ||
                        pageContent.includes('incorrect')) {
                        throw new Error('invalid_credentials');
                    }
                    console.log('[DEBUG] Playwright login completed successfully');
                }

                await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

                // Wait for a fixed duration
                await page.waitForTimeout(5000);

                const html = await page.content();
                await browser.close();
                return html;
            } catch (error) {
                await browser.close();
                console.log('[DEBUG] Error in Playwright fetchDynamicHtml:', error.message);
                throw error;
            }
        }

        throw new Error('Only puppeteer and playwright supported now');
    }
}

module.exports = { Downloader, checkNeedDynamic };