const axios = require('axios');
const { normalizeUrl, sameOrigin, getOrigin } = require('../utils/url');
const { extractFromHtml } = require('./parsers/HtmlParser');

class Crawler {
    constructor(options = {}) {
        this.recursive = options.recursive || false;
        this.maxDepth = options.maxDepth || 1;
        this.useSitemap = options.useSitemap || false;
        this.ignoreRobots = options.ignoreRobots || false;
        this.filterRegex = options.filterRegex || null;
        this.userAgent = options.userAgent;
        this.visited = new Set();
        this.robotsCache = new Map();
    }

    isVisited(url) {
        return this.visited.has(url);
    }

    markVisited(url) {
        this.visited.add(url);
    }

    async checkRobots(url) {
        if (this.ignoreRobots) return true;
        const origin = getOrigin(url);
        if (!origin) return true;
        if (this.robotsCache.has(origin)) {
            return this.robotsCache.get(origin);
        }
        try {
            const res = await axios.get(`${origin}/robots.txt`, {
                headers: { 'User-Agent': this.userAgent || 'AnyDownload' },
                timeout: 10000,
                validateStatus: s => s < 500
            });
            if (res.status !== 200) {
                this.robotsCache.set(origin, true);
                return true;
            }
            const path = new URL(url).pathname;
            const lines = String(res.data).split('\n');
            let applies = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (/^user-agent:\s*\*/i.test(trimmed)) applies = true;
                if (applies && /^disallow:\s*(.+)/i.test(trimmed)) {
                    const rule = trimmed.match(/^disallow:\s*(.+)/i)[1].trim();
                    if (rule && path.startsWith(rule)) {
                        this.robotsCache.set(origin, false);
                        return false;
                    }
                }
            }
            this.robotsCache.set(origin, true);
            return true;
        } catch {
            this.robotsCache.set(origin, true);
            return true;
        }
    }

    async fetchSitemapUrls(startUrl) {
        if (!this.useSitemap) return [];
        const origin = getOrigin(startUrl);
        if (!origin) return [];

        const candidates = [
            `${origin}/sitemap.xml`,
            `${origin}/sitemap_index.xml`
        ];
        const found = new Set();

        const parseXml = (xml) => {
            const locs = [...String(xml).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)];
            return locs.map(m => m[1].trim()).filter(Boolean);
        };

        for (const sitemapUrl of candidates) {
            try {
                const res = await axios.get(sitemapUrl, {
                    headers: { 'User-Agent': this.userAgent || 'AnyDownload' },
                    timeout: 15000
                });
                const urls = parseXml(res.data);
                for (const u of urls) {
                    if (u.endsWith('.xml')) {
                        try {
                            const sub = await axios.get(u, {
                                headers: { 'User-Agent': this.userAgent || 'AnyDownload' },
                                timeout: 15000
                            });
                            parseXml(sub.data).forEach(x => found.add(x));
                        } catch {
                            // skip sub-sitemap
                        }
                    } else if (sameOrigin(u, startUrl)) {
                        found.add(u);
                    }
                }
            } catch {
                // try next candidate
            }
        }
        return Array.from(found);
    }

    collectPageLinks(html, pageUrl) {
        const { links } = extractFromHtml(html, pageUrl);
        return links.filter(link => {
            if (!sameOrigin(link, pageUrl)) return false;
            if (this.filterRegex && !this.filterRegex.test(link)) return false;
            return true;
        });
    }

    async discover(startUrl, html, depth) {
        const next = [];
        if (!this.recursive || depth >= this.maxDepth) {
            return next;
        }

        const pageLinks = this.collectPageLinks(html, startUrl);
        for (const link of pageLinks) {
            const normalized = normalizeUrl(link, startUrl);
            if (normalized && !this.isVisited(normalized)) {
                next.push(normalized);
            }
        }

        if (depth === 0 && this.useSitemap) {
            const sitemapUrls = await this.fetchSitemapUrls(startUrl);
            for (const u of sitemapUrls) {
                const normalized = normalizeUrl(u, startUrl);
                if (normalized && !this.isVisited(normalized)) {
                    next.push(normalized);
                }
            }
        }

        return [...new Set(next)];
    }
}

module.exports = Crawler;
