const cheerio = require('cheerio');
const { normalizeUrl } = require('../../utils/url');
const { rewriteCss } = require('../parsers/CssParser');

class UrlRewriter {
    constructor(pageUrl, pathMapper) {
        this.pageUrl = pageUrl;
        this.pathMapper = pathMapper;
    }

    _toLocal(raw) {
        const abs = normalizeUrl(raw, this.pageUrl);
        if (!abs) return null;
        return this.pathMapper.toLocalPath(abs);
    }

    rewriteHtml(html) {
        const $ = cheerio.load(html);

        const rewriteAttr = (el, attr) => {
            const orig = $(el).attr(attr);
            if (!orig || orig.startsWith('data:') || orig.startsWith('#')) return;
            const local = this._toLocal(orig);
            if (local) $(el).attr(attr, local);
        };

        $('img[src], img[data-src], link[href], script[src], source[src], iframe[src], embed[src], object[data]').each((_, el) => {
            const tag = el.tagName?.toLowerCase();
            if (tag === 'link' || tag === 'a') {
                rewriteAttr(el, 'href');
            } else if (tag === 'img') {
                rewriteAttr(el, 'src');
                rewriteAttr(el, 'data-src');
            } else {
                rewriteAttr(el, 'src');
                rewriteAttr(el, 'data');
            }
        });

        $('[srcset]').each((_, el) => {
            const srcset = $(el).attr('srcset');
            if (!srcset) return;
            const updated = srcset.split(',').map((item) => {
                const parts = item.trim().split(/\s+/);
                const src = parts[0];
                const local = this._toLocal(src);
                if (!local) return item.trim();
                return parts.length > 1 ? `${local} ${parts.slice(1).join(' ')}` : local;
            }).join(', ');
            $(el).attr('srcset', updated);
        });

        $('[style]').each((_, el) => {
            const style = $(el).attr('style');
            if (!style) return;
            const newStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/gi, (full, raw) => {
                const local = this._toLocal(raw);
                return local ? `url("${local}")` : full;
            });
            $(el).attr('style', newStyle);
        });

        $('style').each((_, el) => {
            const css = $(el).html() || '';
            $(el).html(rewriteCss(css, this.pageUrl, this.pathMapper));
        });

        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            const local = this._toLocal(href);
            if (local) $(el).attr('href', local);
        });

        return $.html();
    }

    rewriteCssContent(cssText, cssUrl) {
        return rewriteCss(cssText, cssUrl, this.pathMapper);
    }
}

module.exports = UrlRewriter;
