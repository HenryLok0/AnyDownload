const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const undici = require('undici');
const { ProxyAgent } = undici;
const { pipeline } = require('stream');
const { promisify } = require('util');
const { createGunzip, createInflate, createBrotliDecompress } = require('zlib');
const mime = require('mime-types');
const { hashUrl } = require('../utils/url');
const { extractUrls, rewriteCss } = require('./parsers/CssParser');
const PathMapper = require('./storage/PathMapper');

const streamPipeline = promisify(pipeline);

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
        this.cancelled = false;
    }

    _headers() {
        const headers = {};
        if (this.userAgent) headers['User-Agent'] = this.userAgent;
        if (this.cookie) headers.Cookie = this.cookie;
        headers['Accept-Encoding'] = 'gzip, deflate, br';
        return headers;
    }

    _requestOptions() {
        const opts = {
            method: 'GET',
            headers: this._headers(),
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
            js: /\.js$/i,
            html: /\.html?$/i,
            media: /\.(mp4|mp3|ogg|wav|webm|m4a|aac)$/i
        };
        const rule = rules[this.type];
        return rule ? rule.test(ext) : true;
    }

    enqueue(url, pageUrl, meta = {}) {
        if (!url || this.seen.has(hashUrl(url))) return;
        if (this.filterRegex && !this.filterRegex.test(url)) return;
        if (!this._passesTypeFilter(url)) return;
        this.seen.add(hashUrl(url));
        this.queue.push({ url, pageUrl, ...meta });
    }

    enqueueMany(urls, pageUrl) {
        urls.forEach(u => this.enqueue(u, pageUrl));
    }

    async validateResource(url) {
        try {
            const res = await axios.head(url, {
                headers: this._headers(),
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

    async _downloadToFile(url, savePath) {
        if (await fs.pathExists(savePath)) {
            const stat = await fs.stat(savePath);
            this.downloadedBytes += stat.size;
            return { contentType: mime.lookup(savePath) || '', fromCache: true };
        }

        await this.validateResource(url);

        const res = await undici.request(url, this._requestOptions());

        if (res.statusCode < 200 || res.statusCode >= 400) {
            throw new Error(`HTTP ${res.statusCode}`);
        }

        const contentType = res.headers['content-type'] || '';
        const encoding = res.headers['content-encoding'] || '';

        await fs.ensureDir(path.dirname(savePath));
        const fileStream = fs.createWriteStream(savePath);

        let bodyStream = res.body;
        if (encoding === 'gzip') bodyStream = res.body.pipe(createGunzip());
        else if (encoding === 'deflate') bodyStream = res.body.pipe(createInflate());
        else if (encoding === 'br') bodyStream = res.body.pipe(createBrotliDecompress());

        await streamPipeline(bodyStream, fileStream);
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

    async _downloadOne(item, index, total) {
        const { url, pageUrl, body, contentType: presetType } = item;
        const pathMapper = new PathMapper(pageUrl);
        const localPath = pathMapper.toLocalPath(url);

        for (let attempt = 0; attempt < this.retry; attempt++) {
            if (this.cancelled) return;
            try {
                this.onResource(url, index + 1, total);

                let localPathWithExt = pathMapper.ensureExtension(localPath, presetType || '');
                let savePath = path.join(item.baseDir, localPathWithExt);
                await fs.ensureDir(path.dirname(savePath));

                let contentType = presetType || '';
                if (body) {
                    await fs.writeFile(savePath, body);
                    const stat = await fs.stat(savePath);
                    this.downloadedBytes += stat.size;
                } else {
                    const result = await this._downloadToFile(url, savePath);
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
                    this.failCount++;
                    this.failedResources.push({ url, error: err.message });
                    this.onError(`Failed: ${url} (${err.message})`);
                } else {
                    await new Promise(r => setTimeout(r, this.retryDelay));
                }
            }
        }
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

    async saveCapturedResponses(capture, pageUrl, baseDir) {
        for (const entry of capture.getAll()) {
            if (entry.url === pageUrl) continue;
            this.enqueue(entry.url, pageUrl, {
                body: entry.body,
                contentType: entry.contentType,
                baseDir
            });
        }
    }
}

module.exports = AssetPipeline;
