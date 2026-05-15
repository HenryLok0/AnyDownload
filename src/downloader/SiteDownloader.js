const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const { SitemapStream } = require('sitemap');
const { createGzip } = require('zlib');
const { AnyDownloadEngine } = require('../engine');
const { isValidUrl } = require('../utils/url');
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
        this.engineMode = options.engineMode ||
            (options.dynamic ? 'render' : (options.autoDynamic === false ? 'static' : 'auto'));
        this.browserType = options.browserType || options.provider || 'puppeteer';
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
        this.onError = options.onError || (() => {});
        this.cancelled = false;

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

    async _writeSitemap() {
        if (!this.useSitemap || !this.visited.size) return;
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
            path.join(this.outputDir, 'sitemap.xml.gz'),
            Buffer.concat(chunks)
        );
    }

    async downloadPage(url, depth, baseDir) {
        if (this.cancelled || this.visited.has(url)) return;
        this.visited.add(url);
        this.crawler.markVisited(url);

        const allowed = await this.crawler.checkRobots(url);
        if (!allowed) {
            if (this.verbose) console.log(`Blocked by robots.txt: ${url}`);
            return;
        }

        const pathMapper = new PathMapper(url);
        const pipeline = new AssetPipeline(this.pipelineOptions);
        let html;
        let capture = null;

        const engine = this._createEngine();
        try {
            const result = await engine.fetchPage(url, { mode: this.engineMode });
            html = result.html;
            capture = result.capture;
            if (this.verbose && result.engine) {
                console.log(`[AnyDownload] Engine: ${result.engine}`);
            }
        } finally {
            await engine.close();
        }

        const { resources } = extractFromHtml(html, url);
        pipeline.enqueueMany(resources, url);

        if (capture) {
            await pipeline.saveCapturedResponses(capture, url, baseDir);
        }

        const rewriter = new UrlRewriter(url, pathMapper);
        const rewrittenHtml = rewriter.rewriteHtml(html);
        const pageFile = pathMapper.getPageFilename(url);
        await fs.ensureDir(baseDir);
        await fs.writeFile(path.join(baseDir, pageFile), rewrittenHtml, 'utf8');

        await pipeline.run(baseDir);

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
        await this._writeSitemap();

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
