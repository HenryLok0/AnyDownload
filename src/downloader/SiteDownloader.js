const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const { SitemapStream } = require('sitemap');
const { createGzip } = require('zlib');
const { AnyDownloadEngine } = require('../engine');
const { isValidUrl } = require('../utils/url');
const { mergeCookieHeader, cookiesToHeader } = require('../utils/cookies');
const { extractFromHtml } = require('./parsers/HtmlParser');
const PathMapper = require('./storage/PathMapper');
const UrlRewriter = require('./rewrite/UrlRewriter');
const AssetPipeline = require('./AssetPipeline');
const Crawler = require('./Crawler');

async function checkNeedDynamic(url, userAgent) {
    return AnyDownloadEngine.needsRender(url, userAgent);
}

class SiteDownloader extends EventEmitter {
    constructor(options = {}) {
        super();
        this.outputDir = options.outputDir || path.join(process.cwd(), 'downloaded_site');
        this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.engineMode = options.mode || options.engineMode ||
            (options.dynamic ? 'render' : (options.autoDynamic === false ? 'static' : 'auto'));
        this.browserType = options.browserType || options.provider || 'playwright';
        this.browser = options.browser || 'chromium';
        this.headless = options.headless !== false;
        this.extraWait = options.extraWait || options.wait || 2000;
        this.recursive = options.recursive || false;
        this.maxDepth = options.maxDepth || 1;
        this.useSitemap = options.useSitemap || options.sitemapEnabled || false;
        this.ignoreRobots = options.ignoreRobots || false;
        this.verbose = options.verbose || false;
        this.loginUrl = options.loginUrl || null;
        this.loginForm = options.loginForm || null;
        this.loginCredentials = options.loginCredentials || null;
        this.cookie = options.cookie || '';
        this.onResource = options.onResource || (() => {});
        this.onDownloadProgress = typeof options.onDownloadProgress === 'function'
            ? options.onDownloadProgress
            : null;
        this.onError = options.onError || (() => {});
        this.cancelled = false;
        this.legacyFlatPages = options.legacyFlatPages === true;

        this.crawler = new Crawler({
            recursive: this.recursive,
            maxDepth: this.maxDepth,
            useSitemap: this.useSitemap,
            ignoreRobots: this.ignoreRobots,
            filterRegex: options.filterRegex,
            userAgent: this.userAgent
        });

        this.pipelineOptions = {
            concurrency: options.concurrency || 5,
            delay: options.delay || 500,
            retry: options.retry || 3,
            retryDelay: options.retryDelay || 1000,
            timeout: options.timeout || 30000,
            maxRedirects: options.maxRedirects || 5,
            followRedirects: options.followRedirects !== false,
            maxFileSize: options.maxFileSize || 0,
            userAgent: this.userAgent,
            cookie: this.cookie,
            proxy: options.proxy,
            type: options.type || 'all',
            filterRegex: options.filterRegex,
            verbose: this.verbose,
            onResource: this.onResource,
            onDownloadProgress: this.onDownloadProgress,
            onError: this.onError
        };

        this.successCount = 0;
        this.failCount = 0;
        this.downloadedBytes = 0;
        this.failedResources = [];
        this.visited = new Set();
    }

    cancel() {
        this.cancelled = true;
    }

    _createEngine() {
        return new AnyDownloadEngine({
            mode: this.engineMode,
            userAgent: this.userAgent,
            cookie: this.cookie,
            extraWait: this.extraWait,
            renderProvider: this.browserType,
            browser: this.browser,
            headless: this.headless,
            loginUrl: this.loginUrl,
            loginForm: this.loginForm,
            loginCredentials: this.loginCredentials,
            maxFileSize: this.pipelineOptions.maxFileSize,
            timeout: this.pipelineOptions.timeout,
            proxy: this.pipelineOptions.proxy
        });
    }

    async _writeSitemap(baseDir) {
        if (!this.useSitemap || !this.visited.size || !baseDir) return;
        const baseUrl = new URL([...this.visited][0]).origin;
        const sitemap = new SitemapStream({ hostname: baseUrl });
        const gzip = createGzip();
        const chunks = [];

        for (const u of this.visited) {
            sitemap.write({ url: u, changefreq: 'daily', priority: 0.7 });
        }
        sitemap.end();

        await new Promise((resolve, reject) => {
            sitemap.pipe(gzip)
                .on('data', c => chunks.push(c))
                .on('end', resolve)
                .on('error', reject);
        });

        await fs.writeFile(
            path.join(baseDir, 'sitemap.xml.gz'),
            Buffer.concat(chunks)
        );
    }

    async _fetchAndDownloadAssets(url, baseDir, engineMode) {
        const pathMapper = new PathMapper(url);
        const pipelineOptions = { ...this.pipelineOptions };
        let html;
        let capture = null;
        let domUrls = [];
        let usedEngine = engineMode;

        const engine = this._createEngine();
        try {
            if (this.onDownloadProgress) {
                this.onDownloadProgress({
                    type: 'page-fetch-start',
                    url,
                    visitedCount: this.visited.size
                });
            }
            const result = await engine.fetchPage(url, { mode: engineMode });
            html = result.html;
            capture = result.capture;
            domUrls = result.domUrls || [];
            usedEngine = result.engine || engineMode;
            if (result.cookies) {
                pipelineOptions.cookie = mergeCookieHeader(
                    pipelineOptions.cookie,
                    cookiesToHeader(result.cookies)
                );
            }
            if (this.verbose && result.engine) {
                console.log(`[AnyDownload] Engine: ${result.engine}`);
            }
        } finally {
            await engine.close();
        }

        const pipeline = new AssetPipeline(pipelineOptions);

        if (capture) {
            await pipeline.saveCapturedResponses(capture, url);
        }

        if (domUrls.length) {
            pipeline.enqueueMany(domUrls, url);
        }

        const { resources } = extractFromHtml(html, url);
        pipeline.enqueueMany(resources, url);

        const pageMirrorPath = this.legacyFlatPages
            ? pathMapper.getPageFilename(url)
            : pathMapper.getMirrorRelPagePath(url);
        const rewriter = new UrlRewriter(url, pathMapper, pageMirrorPath);
        const rewrittenHtml = rewriter.rewriteHtml(html);
        const pageDest = path.join(baseDir, pageMirrorPath);
        await fs.ensureDir(path.dirname(pageDest));
        await fs.writeFile(pageDest, rewrittenHtml, 'utf8');

        if (this.onDownloadProgress) {
            this.onDownloadProgress({ type: 'page-html-saved', url });
        }

        await pipeline.run(baseDir);

        const shouldFallback = engineMode === 'auto' &&
            usedEngine !== 'render' &&
            pipeline.hasCriticalFailures() &&
            AnyDownloadEngine.htmlNeedsRender(html)

        if (shouldFallback) {
            if (this.verbose) {
                console.log('[AnyDownload] Static assets failed; retrying with render engine');
            }
            return this._fetchAndDownloadAssets(url, baseDir, 'render');
        }

        return { html, pipeline, usedEngine };
    }

    async downloadPage(url, depth, baseDir) {
        if (this.cancelled || this.visited.has(url)) return;
        this.visited.add(url);
        this.crawler.markVisited(url);

        if (this.onDownloadProgress) {
            this.onDownloadProgress({
                type: 'page-prepare',
                url,
                visitedCount: this.visited.size
            });
        }

        const allowed = await this.crawler.checkRobots(url);
        if (!allowed) {
            if (this.verbose) console.log(`Blocked by robots.txt: ${url}`);
            return;
        }

        const { html, pipeline } = await this._fetchAndDownloadAssets(url, baseDir, this.engineMode);

        this.successCount += pipeline.successCount;
        this.failCount += pipeline.failCount;
        this.downloadedBytes += pipeline.downloadedBytes;
        this.failedResources.push(...pipeline.failedResources);

        const nextUrls = await this.crawler.discover(url, html, depth);
        for (const next of nextUrls) {
            if (!this.cancelled) {
                await this.downloadPage(next, depth + 1, baseDir);
            }
        }
    }

    async downloadWebsite(url) {
        if (!isValidUrl(url)) {
            throw new Error('Invalid URL');
        }

        const hostDir = new PathMapper(url).getHostDir(url);
        const baseDir = path.join(this.outputDir, hostDir);
        await fs.ensureDir(baseDir);

        await this.downloadPage(url, 0, baseDir);
        if (this.cancelled) {
            const err = new Error('Cancelled by user');
            err.code = 'CANCELLED';
            throw err;
        }
        await this._writeSitemap(baseDir);

        return {
            outputDir: baseDir,
            successCount: this.successCount,
            failCount: this.failCount,
            downloadedBytes: this.downloadedBytes,
            failedResources: this.failedResources,
            visited: [...this.visited]
        };
    }
}

module.exports = { SiteDownloader, checkNeedDynamic };
