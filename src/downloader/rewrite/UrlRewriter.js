const cheerio = require('cheerio');
const { normalizeUrl } = require('../../utils/url');
const { rewriteCss } = require('../parsers/CssParser');

class UrlRewriter {
    constructor(pageUrl, pathMapper, mirrorPageRelPath) {
        this.pageUrl = pageUrl;
        this.pathMapper = pathMapper;
        const raw = mirrorPageRelPath ?? pathMapper.getMirrorRelPagePath(pageUrl);
        this.mirrorPageRelPath = String(raw || '').replace(/\\/gu, '/');
    }

    _rewriteAsset(raw) {
        const abs = normalizeUrl(raw, this.pageUrl);
        if (!abs) return null;
        let u;
        try {
            u = new URL(abs);
        } catch {
            return null;
        }
        if (u.hostname !== this.pathMapper.baseUrl.hostname) {
            return this.pathMapper.toLocalPath(abs);
        }
        return this.pathMapper.relativeAssetHref(this.mirrorPageRelPath, abs);
    }

    _rewriteAnchorNav(absUrlStr) {
        let u;
        try {
            u = new URL(absUrlStr);
        } catch {
            return null;
        }
        if (u.hostname !== this.pathMapper.baseUrl.hostname) {
            return null;
        }
        const navOnly = `${u.origin}${u.pathname}${u.search}`;
        let pageRel = this.pathMapper.relativePageHref(this.mirrorPageRelPath, navOnly);
        if (!pageRel) return null;
        if (u.hash) pageRel += u.hash;
        return pageRel;
    }

    rewriteHtml(html) {
        const $ = cheerio.load(html);

        $('img[src], img[data-src], script[src], source[src], iframe[src], embed[src], object[data]').each((_, el) => {
            const tag = el.tagName?.toLowerCase();
            if (tag === 'img') {
                const src = $(el).attr('src');
                if (src && !src.startsWith('data:') && !src.startsWith('#')) {
                    const local = this._rewriteAsset(src);
                    if (local) $(el).attr('src', local);
                }
                const ds = $(el).attr('data-src');
                if (ds && !ds.startsWith('data:') && !ds.startsWith('#')) {
                    const local = this._rewriteAsset(ds);
                    if (local) $(el).attr('data-src', local);
                }
                return;
            }
            const attr = tag === 'object' ? 'data' : 'src';
            const orig = $(el).attr(attr);
            if (!orig || orig.startsWith('data:') || orig.startsWith('#')) return;
            const local = this._rewriteAsset(orig);
            if (local) $(el).attr(attr, local);
        });

        $('link[href]').each((_, el) => {
            const relTokens = String($(el).attr('rel') || '')
                .toLowerCase()
                .split(/\s+/u)
                .filter(Boolean);

            const orig = $(el).attr('href');
            if (!orig || orig.startsWith('data:')) return;

            if (relTokens.includes('canonical')) {
                const abs = normalizeUrl(orig, this.pageUrl);
                if (!abs) return;
                const rew = this._rewriteAnchorNav(abs);
                if (rew) $(el).attr('href', rew);
                return;
            }

            const absMaybe = normalizeUrl(orig, this.pageUrl);
            if (absMaybe) {
                try {
                    const ux = new URL(absMaybe);
                    const extHint = relTokens.includes('dns-prefetch') || relTokens.includes('preconnect');
                    if (extHint && ux.hostname !== this.pathMapper.baseUrl.hostname) return;
                } catch {
                    /* noop */
                }
            }

            const local = this._rewriteAsset(orig);
            if (local) $(el).attr('href', local);
        });

        $('script[src]').each((_, el) => {
            $(el).removeAttr('crossorigin');
            $(el).removeAttr('integrity');
        });

        $('link[rel="stylesheet"], link[rel="modulepreload"]').each((_, el) => {
            $(el).removeAttr('crossorigin');
            $(el).removeAttr('integrity');
        });

        $('[srcset]').each((_, el) => {
            const srcset = $(el).attr('srcset');
            if (!srcset) return;
            const updated = srcset.split(',').map((item) => {
                const parts = item.trim().split(/\s+/);
                const src = parts[0];
                const local = this._rewriteAsset(src);
                if (!local) return item.trim();
                return parts.length > 1 ? `${local} ${parts.slice(1).join(' ')}` : local;
            }).join(', ');
            $(el).attr('srcset', updated);
        });

        $('[style]').each((_, el) => {
            const style = $(el).attr('style');
            if (!style) return;
            const newStyle = style.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (full, raw) => {
                const abs = normalizeUrl(raw, this.pageUrl);
                if (!abs) return full;
                let rel;
                try {
                    const u = new URL(abs);
                    rel = u.hostname !== this.pathMapper.baseUrl.hostname
                        ? this.pathMapper.toLocalPath(abs)
                        : this.pathMapper.relativeAssetHref(this.mirrorPageRelPath, abs);
                } catch {
                    return full;
                }
                return rel ? `url("${rel}")` : full;
            });
            $(el).attr('style', newStyle);
        });

        $('style').each((_, el) => {
            const css = $(el).html() || '';
            $(el).html(rewriteCss(css, this.pageUrl, this.pathMapper, {
                mirrorContextPath: this.mirrorPageRelPath
            }));
        });

        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') ||
                href.startsWith('tel:') || href.startsWith('javascript:')) return;

            /* Cross-origin navigations stay absolute (e.g. GitHub links). */
            const abs = normalizeUrl(href, this.pageUrl);
            if (!abs) return;

            try {
                const u = new URL(abs);
                if (u.hostname !== this.pathMapper.baseUrl.hostname) return;
            } catch {
                return;
            }

            const rew = this._rewriteAnchorNav(abs);
            if (rew) $(el).attr('href', rew);
        });

        return $.html();
    }

    rewriteCssContent(cssText, cssUrl, mirrorContextPath) {
        return rewriteCss(cssText, cssUrl, this.pathMapper, {
            mirrorContextPath: mirrorContextPath || this.mirrorPageRelPath
        });
    }
}

module.exports = UrlRewriter;
