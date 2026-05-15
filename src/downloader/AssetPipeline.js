const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const undici = require('undici');
const { ProxyAgent } = undici;
const { pipeline } = require('stream');
const { promisify } = require('util');
const mime = require('mime-types');
const { hashUrl } = require('../utils/url');
const { extractUrls, rewriteCss } = require('./parsers/CssParser');
const PathMapper = require('./storage/PathMapper');

const streamPipeline = promisify(pipeline);

const OPTIONAL_RESOURCE = /(?:favicon|banner)\.(ico|png|svg|gif|jpe?g|webp)$/i;

class AssetPipeline {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 5;
        this.delay = options.delay || 500;
        this.retry = options.retry || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.timeout = options.timeout || 30000;
        this.maxRedirects = options.maxRedirects || 5;
        this.followRedirects = options.followRedirects !== false;
        this.maxFileSize = options.maxFileSize || 0;
        this.userAgent = options.userAgent;
        this.cookie = options.cookie;
        this.proxy = options.proxy;
        this.type = options.type || 'all';
        this.filterRegex = options.filterRegex || null;
        this.verbose = options.verbose || false;
        this.onResource = options.onResource || (() => {});
        this.onError = options.onError || (() => {});

        this.queue = [];
        this.seen = new Set();
        this.successCount = 0;
        this.failCount = 0;
        this.downloadedBytes = 0;
        this.failedResources = [];
        this.optionalFailures = [];
        this.cancelled = false;
    }

    _isOptionalResource(url, pageUrl) {
        if (OPTIONAL_RESOURCE.test(url)) return true;
        if (!pageUrl) return false;
        try {
            const pageHost = new URL(pageUrl).hostname;
            const resourceHost = new URL(url).hostname;
            return pageHost !== resourceHost;
        } catch {
            return false;
        }
    }

    _hasBody(body) {
        if (!body) return false;
        return Buffer.isBuffer(body) ? body.length > 0 : body.length > 0;
    }

    _findQueueItem(url) {
        const key = hashUrl(url);
        return this.queue.find(item => hashUrl(item.url) === key);
    }

    _acceptHeader(url) {
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        if (ext === '.css') return 'text/css,*/*;q=0.1';
        if (ext === '.js' || ext === '.mjs') return '*/*';
        if (/\.(png|jpe?g|gif|svg|webp|ico|avif|woff2?|ttf|eot)$/i.test(ext)) {
            return 'image/*,*/*;q=0.8';
        }
        return 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    }

    _headers(pageUrl, resourceUrl) {
        const headers = {
            Accept: this._acceptHeader(resourceUrl || pageUrl)
        };
        if (this.userAgent) headers['User-Agent'] = this.userAgent;
        if (this.cookie) headers.Cookie = this.cookie;
        if (pageUrl) {
            headers.Referer = pageUrl;
            try {
                headers.Origin = new URL(pageUrl).origin;
            } catch {
                // ignore invalid page URL
            }
        }
        return headers;
    }

    _requestOptions(pageUrl, resourceUrl) {
        const opts = {
            method: 'GET',
            headers: this._headers(pageUrl, resourceUrl),
            maxRedirections: this.followRedirects ? this.maxRedirects : 0,
            headersTimeout: this.timeout,
            bodyTimeout: this.timeout
        };
        if (this.proxy) {
            opts.dispatcher = new ProxyAgent(this.proxy);
        }
        return opts;
    }

    _passesTypeFilter(url) {
        if (this.type === 'all') return true;
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        const rules = {
            image: /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i,
            css: /\.css$/i,
            js: /\.(js|mjs)$/i,
            html: /\.html?$/i,
            media: /\.(mp4|mp3|ogg|wav|webm|m4a|aac)$/i,
            font: /\.(woff2?|ttf|otf|eot)$/i
        };
        const rule = rules[this.type];
        return rule ? rule.test(ext) : true;
    }

    enqueue(url, pageUrl, meta = {}) {
        if (!url) return;
        if (this.filterRegex && !this.filterRegex.test(url)) return;
        if (!this._passesTypeFilter(url)) return;

        const key = hashUrl(url);
        if (this.seen.has(key)) {
            if (this._hasBody(meta.body)) {
                const existing = this._findQueueItem(url);
                if (existing) {
                    existing.body = meta.body;
                    existing.contentType = meta.contentType || existing.contentType;
                }
            }
            return;
        }

        this.seen.add(key);
        this.queue.push({ url, pageUrl, ...meta });
    }

    enqueueMany(urls, pageUrl) {
        urls.forEach(u => this.enqueue(u, pageUrl));
    }

    async validateResource(url, pageUrl) {
        try {
            const res = await axios.head(url, {
                headers: this._headers(pageUrl, url),
                timeout: this.timeout,
                maxRedirects: this.maxRedirects,
                validateStatus: s => s < 500
            });
            const len = Number(res.headers['content-length'] || 0);
            if (this.maxFileSize && len && len > this.maxFileSize) {
                throw new Error('File size exceeds limit');
            }
            return true;
        } catch {
            return true;
        }
    }

    async _removeEmptyParentDir(savePath) {
        try {
            const dir = path.dirname(savePath);
            if (!dir || dir === '.' || dir === savePath) return;
            const entries = await fs.readdir(dir);
            if (entries.length === 0) {
                await fs.rmdir(dir);
            }
        } catch {
            // ignore cleanup errors
        }
    }

    async _downloadToFile(url, savePath, pageUrl) {
        if (await fs.pathExists(savePath)) {
            const stat = await fs.stat(savePath);
            this.downloadedBytes += stat.size;
            return { contentType: mime.lookup(savePath) || '', fromCache: true };
        }

        await this.validateResource(url, pageUrl);

        const res = await undici.request(url, this._requestOptions(pageUrl, url));

        if (res.statusCode < 200 || res.statusCode >= 400) {
            throw new Error(`HTTP ${res.statusCode}`);
        }

        const contentType = res.headers['content-type'] || '';

        await fs.ensureDir(path.dirname(savePath));
        const fileStream = fs.createWriteStream(savePath);
        await streamPipeline(res.body, fileStream);

        const stat = await fs.stat(savePath);
        this.downloadedBytes += stat.size;
        return { contentType, fromCache: false };
    }

    async _processCssFile(cssUrl, savePath, pageUrl) {
        const text = await fs.readFile(savePath, 'utf8');
        const pathMapper = new PathMapper(pageUrl);
        const nested = extractUrls(text, cssUrl);
        nested.forEach(u => this.enqueue(u, pageUrl));

        const rewritten = rewriteCss(text, cssUrl, pathMapper);
        await fs.writeFile(savePath, rewritten, 'utf8');
    }

    _recordFailure(url, error, optional) {
        const entry = { url, error };
        if (optional) {
            this.optionalFailures.push(entry);
            if (this.verbose) {
                this.onError(`Optional skip: ${url} (${error})`);
            }
        } else {
            this.failCount++;
            this.failedResources.push(entry);
            this.onError(`Failed: ${url} (${error})`);
        }
    }

    async _downloadOne(item, index, total) {
        const { url, pageUrl, body, contentType: presetType } = item;
        const pathMapper = new PathMapper(pageUrl);
        const localPath = pathMapper.toLocalPath(url);
        const optional = this._isOptionalResource(url, pageUrl);
        let savePath = null;

        for (let attempt = 0; attempt < this.retry; attempt++) {
            if (this.cancelled) return;
            try {
                this.onResource(url, index + 1, total);

                let localPathWithExt = pathMapper.ensureExtension(localPath, presetType || '');
                savePath = path.join(item.baseDir, localPathWithExt);

                let contentType = presetType || '';
                if (this._hasBody(body)) {
                    await fs.ensureDir(path.dirname(savePath));
                    await fs.writeFile(savePath, body);
                    const stat = await fs.stat(savePath);
                    this.downloadedBytes += stat.size;
                } else {
                    const result = await this._downloadToFile(url, savePath, pageUrl);
                    contentType = result.contentType || contentType;
                    if (!path.extname(savePath) && contentType) {
                        const ext = mime.extension(contentType);
                        if (ext) {
                            const withExt = `${savePath}.${ext}`;
                            await fs.move(savePath, withExt, { overwrite: true });
                            savePath = withExt;
                        }
                    }
                }

                const isCss = (contentType || '').includes('text/css') ||
                    url.endsWith('.css') ||
                    savePath.endsWith('.css');
                if (isCss) {
                    await this._processCssFile(url, savePath, pageUrl);
                }

                this.successCount++;
                if (this.delay) await new Promise(r => setTimeout(r, this.delay));
                return;
            } catch (err) {
                if (attempt >= this.retry - 1) {
                    if (savePath) await this._removeEmptyParentDir(savePath);
                    this._recordFailure(url, err.message, optional);
                } else {
                    await new Promise(r => setTimeout(r, this.retryDelay));
                }
            }
        }
    }

    hasCriticalFailures() {
        return this.failCount > 0 && this.successCount === 0;
    }

    async run(baseDir) {
        let processed = 0;

        while (processed < this.queue.length && !this.cancelled) {
            const batchEnd = Math.min(processed + this.concurrency, this.queue.length);
            const batch = [];
            for (let i = processed; i < batchEnd; i++) {
                const item = { ...this.queue[i], baseDir };
                batch.push(this._downloadOne(item, i, this.queue.length));
            }
            await Promise.all(batch);
            processed = batchEnd;
        }
    }

    async saveCapturedResponses(capture, pageUrl) {
        for (const entry of capture.getAll()) {
            if (entry.url === pageUrl) continue;
            this.enqueue(entry.url, pageUrl, {
                body: entry.body,
                contentType: entry.contentType
            });
        }
    }
}

module.exports = AssetPipeline;
