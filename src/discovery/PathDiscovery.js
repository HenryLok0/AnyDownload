const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const Crawler = require('../downloader/Crawler');
const { normalizeUrl, sameHostname, getOrigin } = require('../utils/url');
const { isPeerInstalled } = require('../engine/BrowserInstaller');

const COMMON_PATHS = [
    '', 'robots.txt', 'sitemap.xml', 'sitemap_index.xml',
    'admin', 'login', 'api', 'api/v1', 'api/v2', 'dashboard',
    'wp-admin', 'wp-login.php', '.well-known/security.txt',
    'about', 'contact', 'blog', 'docs', 'privacy', 'terms',
    'feed', 'rss', 'atom.xml', 'favicon.ico', 'manifest.json',
    'assets', 'static', 'public', 'health', 'status',
    'swagger', 'swagger.json', 'api-docs', 'openapi.json', 'graphql',
    '.git/HEAD', '_next', 'vite', 'server-status'
];

const JS_PATH_REGEX = /["'](\/[a-zA-Z0-9_\-./?#%&=+~]{1,200})["']/g;
const HTML_PATH_COMMENT = /<!--\s*(\/[a-zA-Z0-9_\-./]+)\s*-->/g;
/** `navigator.serviceWorker.register('...')` and similar */
const SW_REGISTER_REGEX = /(?:serviceWorker|navigator\.serviceWorker)\.register\s*\(\s*["']([^"']+)["']/gi;
const IMPORT_SCRIPTS_REGEX = /importScripts\s*\(\s*((?:["'][^"']+["']\s*,?\s*)+)\)/g;

const DEFAULT_SW_PATHS = [
    'sw.js',
    'service-worker.js',
    'serviceworker.js',
    'firebase-messaging-sw.js'
];

/** Max extra requests for depth-2 prefix × word probes (rate-limited by this.delay). */
const DEPTH2_MAX_REQUESTS = 500;
const DEPTH2_MAX_PREFIXES = 25;
const DEPTH2_MAX_WORDS = 40;

class PathDiscovery {
    constructor(options = {}) {
        this.userAgent = options.userAgent || 'Mozilla/5.0 (compatible; AnyDownload/2.2)';
        this.timeout = options.timeout || 15000;
        this.maxDepth = options.maxDepth || 3;
        this.delay = options.delay != null ? options.delay : 200;
        this.concurrency = options.concurrency || 5;
        this.verbose = options.verbose || false;
        this.pathDeep = options.pathDeep === true;
        const rawDepth = parseInt(options.pathProbeDepth, 10);
        this.pathProbeDepth = Number.isFinite(rawDepth) && rawDepth >= 2 ? 2 : 1;
        this.pathSeedsFile = options.pathSeedsFile || null;
        /** Explicit `--path-txt`; if missing, `./path.txt` in cwd; else packaged wordlist. */
        this.pathTxtOverride = options.pathTxtOverride || null;
        this.useRender = options.useRender !== false;
        this.renderProvider = options.renderProvider || 'playwright';
        this.crawler = new Crawler({
            recursive: true,
            maxDepth: this.maxDepth,
            useSitemap: true,
            userAgent: this.userAgent
        });
        this.entries = new Map();
        this._jsUrls = new Set();
        this._serviceWorkerHints = new Set();
    }

    _add(url, source, meta = {}) {
        const normalized = normalizeUrl(url, url);
        if (!normalized) return;
        const existing = this.entries.get(normalized);
        if (existing) {
            if (!existing.sources.includes(source)) existing.sources.push(source);
            return;
        }
        this.entries.set(normalized, { url: normalized, sources: [source], ...meta });
    }

    async _runConcurrent(items, fn) {
        let processed = 0;
        while (processed < items.length) {
            const batchEnd = Math.min(processed + this.concurrency, items.length);
            const batch = items.slice(processed, batchEnd);
            await Promise.all(batch.map(fn));
            processed = batchEnd;
        }
    }

    async _fetchText(url) {
        const res = await axios.get(url, {
            headers: { 'User-Agent': this.userAgent },
            timeout: this.timeout,
            validateStatus: s => s < 500
        });
        if (res.status >= 400) return null;
        return String(res.data);
    }

    async _fetchRobots(startUrl) {
        const origin = getOrigin(startUrl);
        if (!origin) return;
        try {
            const text = await this._fetchText(`${origin}/robots.txt`);
            if (!text) return;
            for (const line of text.split('\n')) {
                const trimmed = line.trim();
                const sitemapMatch = trimmed.match(/^sitemap:\s*(.+)/i);
                if (sitemapMatch) {
                    const u = normalizeUrl(sitemapMatch[1].trim(), startUrl);
                    if (u && sameHostname(u, startUrl)) this._add(u, 'robots-sitemap');
                }
                const disallowMatch = trimmed.match(/^disallow:\s*(\S+)/i);
                if (disallowMatch) {
                    const p = disallowMatch[1].trim();
                    if (p && p !== '/') {
                        const u = normalizeUrl(p, startUrl);
                        if (u && sameHostname(u, startUrl)) this._add(u, 'robots-hint');
                    }
                }
                const allowMatch = trimmed.match(/^allow:\s*(\S+)/i);
                if (allowMatch) {
                    const p = allowMatch[1].trim();
                    if (p) {
                        const u = normalizeUrl(p, startUrl);
                        if (u && sameHostname(u, startUrl)) this._add(u, 'robots-hint');
                    }
                }
            }
        } catch {
            // robots optional
        }
    }

    async _fetchSitemap(startUrl) {
        const urls = await this.crawler.fetchSitemapUrls(startUrl);
        for (const u of urls) {
            if (sameHostname(u, startUrl)) this._add(u, 'sitemap');
        }
    }

    async _fetchWayback(startUrl) {
        if (!this.pathDeep) return;
        try {
            const host = new URL(startUrl).hostname;
            const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}/*&output=json&fl=original&collapse=urlkey&limit=500`;
            const res = await axios.get(api, {
                timeout: this.timeout * 2,
                headers: { 'User-Agent': this.userAgent },
                validateStatus: s => s < 500
            });
            if (!Array.isArray(res.data) || res.data.length < 2) return;
            for (let i = 1; i < res.data.length; i++) {
                const row = res.data[i];
                const original = Array.isArray(row) ? row[0] : row;
                if (!original) continue;
                const u = normalizeUrl(original, startUrl);
                if (u && sameHostname(u, startUrl)) this._add(u, 'wayback');
            }
        } catch (err) {
            if (this.verbose) console.log(`Wayback skipped: ${err.message}`);
        }
    }

    _parseHtmlExtras(html, pageUrl) {
        if (!html) return;
        const $ = cheerio.load(html);

        $('link[rel="canonical"], link[rel="alternate"]').each((_, el) => {
            const href = $(el).attr('href');
            const u = normalizeUrl(href, pageUrl);
            if (u && sameHostname(u, pageUrl)) this._add(u, 'html-meta');
        });

        $('form[action]').each((_, el) => {
            const u = normalizeUrl($(el).attr('action'), pageUrl);
            if (u && sameHostname(u, pageUrl)) this._add(u, 'form');
        });

        $('button[formaction]').each((_, el) => {
            const u = normalizeUrl($(el).attr('formaction'), pageUrl);
            if (u && sameHostname(u, pageUrl)) this._add(u, 'form');
        });

        let m;
        HTML_PATH_COMMENT.lastIndex = 0;
        while ((m = HTML_PATH_COMMENT.exec(html)) !== null) {
            const u = normalizeUrl(m[1], pageUrl);
            if (u && sameHostname(u, pageUrl)) this._add(u, 'html-meta');
        }

        SW_REGISTER_REGEX.lastIndex = 0;
        while ((m = SW_REGISTER_REGEX.exec(html)) !== null) {
            const u = normalizeUrl(m[1], pageUrl);
            if (u && sameHostname(u, pageUrl)) this._serviceWorkerHints.add(u);
        }
    }

    async _fetchManifest(startUrl) {
        const origin = getOrigin(startUrl);
        if (!origin) return;
        for (const manifestPath of ['manifest.json', 'site.webmanifest']) {
            try {
                const text = await this._fetchText(`${origin}/${manifestPath}`);
                if (!text) continue;
                const data = JSON.parse(text);
                if (data.start_url) {
                    const u = normalizeUrl(data.start_url, startUrl);
                    if (u && sameHostname(u, startUrl)) this._add(u, 'manifest');
                }
                if (data.scope) {
                    const u = normalizeUrl(data.scope, startUrl);
                    if (u && sameHostname(u, startUrl)) this._add(u, 'manifest');
                }
                const icons = data.icons || [];
                for (const icon of icons) {
                    if (icon.src) {
                        const u = normalizeUrl(icon.src, startUrl);
                        if (u && sameHostname(u, startUrl)) this._add(u, 'manifest');
                    }
                }
            } catch {
                // skip invalid manifest
            }
        }
    }

    _extractJsPaths(text, baseUrl) {
        if (!text || text.length > 2_000_000) return;
        let match;
        JS_PATH_REGEX.lastIndex = 0;
        while ((match = JS_PATH_REGEX.exec(text)) !== null) {
            const p = match[1];
            if (p.startsWith('//') || p.includes('${')) continue;
            const u = normalizeUrl(p, baseUrl);
            if (u && sameHostname(u, baseUrl)) this._add(u, 'js');
        }
    }

    _collectImportScriptUrls(text, baseUrl) {
        const urls = [];
        if (!text || text.length > 500_000) return urls;
        let block;
        IMPORT_SCRIPTS_REGEX.lastIndex = 0;
        while ((block = IMPORT_SCRIPTS_REGEX.exec(text)) !== null) {
            const inner = block[1];
            for (const um of inner.matchAll(/["']([^"']+)["']/g)) {
                const q = um[1];
                if (!q || q.includes('${')) continue;
                const u = normalizeUrl(q, baseUrl);
                if (u && sameHostname(u, baseUrl)) {
                    if (!urls.includes(u)) urls.push(u);
                    this._add(u, 'sw-import');
                }
            }
        }
        return urls;
    }

    async _fetchServiceWorkers(startUrl) {
        const origin = getOrigin(startUrl);
        if (!origin) return;

        const candidates = new Set(this._serviceWorkerHints);
        for (const rel of DEFAULT_SW_PATHS) {
            const abs = normalizeUrl(`/${rel.replace(/^\//, '')}`, startUrl);
            if (abs && sameHostname(abs, startUrl)) candidates.add(abs);
        }

        await this._runConcurrent([...candidates], async (swUrl) => {
            const text = await this._fetchText(swUrl);
            if (!text || text.length < 8) return;
            this._extractJsPaths(text, startUrl);
            const imports = this._collectImportScriptUrls(text, startUrl).slice(0, 5);
            
            await this._runConcurrent(imports, async (impUrl) => {
                try {
                    const js = await this._fetchText(impUrl);
                    if (js) this._extractJsPaths(js, startUrl);
                } catch {
                    // skip
                }
            });
            if (this.delay) await new Promise(r => setTimeout(r, this.delay));
        });
    }

    async _fetchSourceMaps(startUrl) {
        const jsList = [...this._jsUrls].slice(0, 20);
        await this._runConcurrent(jsList, async (jsUrl) => {
            const mapUrl = jsUrl.replace(/\.m?js(\?.*)?$/i, '.map$1');
            if (mapUrl === jsUrl) return;
            try {
                const text = await this._fetchText(mapUrl);
                if (!text) return;
                const data = JSON.parse(text);
                const sources = data.sources || [];
                for (const src of sources) {
                    if (!src || src.startsWith('webpack:')) continue;
                    const u = normalizeUrl(src, startUrl);
                    if (u && sameHostname(u, startUrl)) this._add(u, 'sourcemap');
                    else if (src.startsWith('/')) {
                        const rel = normalizeUrl(src, startUrl);
                        if (rel && sameHostname(rel, startUrl)) this._add(rel, 'sourcemap');
                    }
                }
            } catch {
                // no sourcemap
            }
            if (this.delay) await new Promise(r => setTimeout(r, this.delay));
        });
    }

    async _bfsCrawl(startUrl) {
        const queue = [{ url: startUrl, depth: 0 }];
        const visited = new Set();

        while (queue.length > 0) {
            const batchSize = Math.min(this.concurrency, queue.length);
            const currentBatch = queue.splice(0, batchSize);

            await Promise.all(currentBatch.map(async ({ url, depth }) => {
                const key = normalizeUrl(url, startUrl);
                if (!key || visited.has(key)) return;
                visited.add(key);
                this._add(key, depth === 0 ? 'seed' : 'crawl');

                if (depth >= this.maxDepth) return;

                try {
                    const html = await this._fetchText(key);
                    if (!html) return;

                    this._parseHtmlExtras(html, startUrl);
                    const links = this.crawler.collectPageLinks(html, startUrl);
                    for (const link of links) {
                        this._add(link, 'html');
                        if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 });
                    }

                    if (/\.js(\?|$)/i.test(key)) {
                        this._jsUrls.add(key);
                        this._extractJsPaths(html, startUrl);
                    } else {
                        const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
                            .map(m => normalizeUrl(m[1], key))
                            .filter(Boolean)
                            .slice(0, 15);
                        for (const scriptUrl of scriptUrls) {
                            if (!sameHostname(scriptUrl, startUrl)) continue;
                            this._jsUrls.add(scriptUrl);
                            try {
                                const js = await this._fetchText(scriptUrl);
                                if (js) this._extractJsPaths(js, startUrl);
                            } catch {
                                // skip
                            }
                        }
                    }
                } catch {
                    // skip
                }
                if (this.delay) await new Promise(r => setTimeout(r, this.delay));
            }));
        }
    }

    _resolveWordlistFile() {
        if (this.pathTxtOverride) {
            const abs = path.resolve(this.pathTxtOverride);
            if (fs.existsSync(abs)) return abs;
            if (this.verbose) console.warn(`path-txt: file not found: ${abs}, trying cwd path.txt then default`);
        }
        const cwdPathTxt = path.join(process.cwd(), 'path.txt');
        if (fs.existsSync(cwdPathTxt)) return cwdPathTxt;
        return path.join(__dirname, '..', '..', 'data', 'path-wordlist.txt');
    }

    _loadDeepWordlist() {
        const file = this._resolveWordlistFile();
        try {
            const lines = fs.readFileSync(file, 'utf8').split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#'));
            return [...new Set([...COMMON_PATHS, ...lines])];
        } catch {
            return COMMON_PATHS;
        }
    }

    /** Use expanded wordlist for depth-2 picks when --path-deep, --path-txt, or ./path.txt exists. */
    _useExtendedWordlistForDepth2() {
        if (this.pathDeep) return true;
        if (this.pathTxtOverride) return true;
        return fs.existsSync(path.join(process.cwd(), 'path.txt'));
    }

    async _probePaths(startUrl, segments, sourceTag) {
        const origin = getOrigin(startUrl);
        if (!origin) return;

        await this._runConcurrent(segments, async (segment) => {
            const target = segment ? `${origin}/${segment.replace(/^\//, '')}` : `${origin}/`;
            const u = normalizeUrl(target, startUrl);
            if (!u || !sameHostname(u, startUrl)) return;

            try {
                const res = await axios.head(u, {
                    headers: { 'User-Agent': this.userAgent },
                    timeout: this.timeout,
                    maxRedirects: 5,
                    validateStatus: () => true
                });
                if (res.status >= 200 && res.status < 400) {
                    this._add(u, sourceTag, { status: res.status });
                }
            } catch {
                try {
                    const res = await axios.get(u, {
                        headers: { 'User-Agent': this.userAgent },
                        timeout: this.timeout,
                        maxRedirects: 5,
                        validateStatus: s => s < 500
                    });
                    if (res.status >= 200 && res.status < 400) {
                        this._add(u, sourceTag, { status: res.status });
                    }
                } catch {
                    // not found
                }
            }
            if (this.delay) await new Promise(r => setTimeout(r, this.delay));
        });
    }

    async _probeCommonPaths(startUrl) {
        await this._probePaths(startUrl, COMMON_PATHS, 'probe');
    }

    async _probeDeepPaths(startUrl) {
        if (!this.pathDeep) return;
        const wordlist = this._loadDeepWordlist();
        const extra = wordlist.filter(p => !COMMON_PATHS.includes(p));
        await this._probePaths(startUrl, extra, 'probe-deep');
    }

    async _probeUserSeeds(startUrl) {
        if (!this.pathSeedsFile) return;
        const abs = path.resolve(this.pathSeedsFile);
        if (!(await fs.pathExists(abs))) {
            if (this.verbose) console.warn(`path-seeds: file not found: ${abs}`);
            return;
        }
        const raw = await fs.readFile(abs, 'utf8');
        const segments = [...new Set(
            raw.split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l.length && !l.startsWith('#'))
        )];
        if (!segments.length) return;
        await this._probePaths(startUrl, segments, 'probe-seed');
    }

    _collectDepth2ProbePrefixes(startUrl) {
        const prefixes = new Set();
        let hostname;
        try {
            hostname = new URL(startUrl).hostname;
        } catch {
            return [];
        }
        for (const { url } of this.entries.values()) {
            try {
                const u = new URL(url);
                if (u.hostname !== hostname) continue;
                let pathname = u.pathname.replace(/\/+$/, '') || '/';
                if (pathname === '/') continue;
                const segs = pathname.split('/').filter(Boolean);
                if (segs.length !== 1) continue;
                const segment = segs[0];
                if (segment.includes('.') || segment.startsWith('_')) continue;
                if (segment.startsWith('.') && segment !== '.well-known') continue;
                prefixes.add(segment);
            } catch {
                // skip malformed
            }
        }
        return [...prefixes].sort().slice(0, DEPTH2_MAX_PREFIXES);
    }

    _depth2ProbeWords() {
        const wl = this._useExtendedWordlistForDepth2()
            ? this._loadDeepWordlist()
            : COMMON_PATHS;
        const picks = wl.filter(seg =>
            typeof seg === 'string' &&
            seg.length >= 2 &&
            !seg.includes('/') &&
            !seg.startsWith('#') &&
            !seg.includes('..')
        );
        const uniq = [...new Set(picks)];
        return uniq.slice(0, DEPTH2_MAX_WORDS);
    }

    async _probeDepth2Prefixes(startUrl) {
        if (this.pathProbeDepth < 2) return;
        const prefixes = this._collectDepth2ProbePrefixes(startUrl);
        const words = this._depth2ProbeWords();
        if (!prefixes.length || !words.length) return;

        const segmentsSet = new Set();
        let count = 0;
        outer: for (const p of prefixes) {
            for (const w of words) {
                if (count >= DEPTH2_MAX_REQUESTS) break outer;
                segmentsSet.add(`${p}/${w}`);
                count++;
            }
        }
        const segments = [...segmentsSet];
        if (segments.length) await this._probePaths(startUrl, segments, 'probe-depth2');
    }

    async _renderEnhance(startUrl) {
        if (!this.useRender) return;
        const hasBrowser = isPeerInstalled('playwright') || isPeerInstalled('puppeteer');
        if (!hasBrowser) return;
        try {
            const AnyDownloadEngine = require('../engine/AnyDownloadEngine');
            const engine = new AnyDownloadEngine({
                mode: 'render',
                renderProvider: this.renderProvider,
                browserType: this.renderProvider,
                userAgent: this.userAgent,
                timeout: this.timeout
            });
            const { capture } = await engine.fetchPage(startUrl);
            await engine.close();
            if (capture?.getAll) {
                for (const entry of capture.getAll()) {
                    const u = entry.url;
                    if (u && sameHostname(u, startUrl)) this._add(u, 'render');
                }
            }
        } catch (err) {
            if (this.verbose) console.log(`Render path discovery skipped: ${err.message}`);
        }
    }

    async discover(startUrl) {
        startUrl = normalizeUrl(startUrl, startUrl);
        if (!startUrl) throw new Error('Invalid URL');

        this._serviceWorkerHints.clear();

        await this._fetchRobots(startUrl);
        await this._fetchSitemap(startUrl);
        if (this.pathDeep) await this._fetchWayback(startUrl);
        await this._fetchManifest(startUrl);
        await this._bfsCrawl(startUrl);
        await this._fetchServiceWorkers(startUrl);
        await this._fetchSourceMaps(startUrl);
        await this._probeCommonPaths(startUrl);
        await this._probeDeepPaths(startUrl);
        await this._probeUserSeeds(startUrl);
        await this._probeDepth2Prefixes(startUrl);
        await this._renderEnhance(startUrl);

        return this.getResults(startUrl);
    }

    getResults(startUrl) {
        const sorted = [...this.entries.values()].sort((a, b) => a.url.localeCompare(b.url));
        const bySource = {};
        for (const entry of sorted) {
            for (const src of entry.sources) {
                bySource[src] = (bySource[src] || 0) + 1;
            }
        }
        return { startUrl, paths: sorted, total: sorted.length, bySource };
    }

    static formatTxt(results) {
        const lines = [
            `# AnyDownload path discovery — ${results.startUrl}`,
            `# Generated: ${new Date().toISOString()}`,
            `# Total: ${results.total}`,
            ''
        ];
        for (const entry of results.paths) {
            const tags = entry.sources.join(',');
            const status = entry.status ? ` [status:${entry.status}]` : '';
            lines.push(`${entry.url}  [${tags}]${status}`);
        }
        return lines.join('\n') + '\n';
    }

    static async writeTxt(results, filePath) {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, PathDiscovery.formatTxt(results), 'utf8');
        return filePath;
    }
}

module.exports = PathDiscovery;
