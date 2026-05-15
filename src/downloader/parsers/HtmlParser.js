const cheerio = require('cheerio');
const { normalizeUrl } = require('../../utils/url');

const RESOURCE_SELECTORS = [
    'img[src]',
    'img[data-src]',
    'link[rel="stylesheet"][href]',
    'link[rel="preload"][href]',
    'link[rel="icon"][href]',
    'link[rel="shortcut icon"][href]',
    'link[rel="apple-touch-icon"][href]',
    'script[src]',
    'link[rel="manifest"][href]',
    'video[src]',
    'audio[src]',
    'source[src]',
    'iframe[src]',
    'object[data]',
    'embed[src]'
];

function extractFromHtml(html, pageUrl) {
    const $ = cheerio.load(html);
    const resources = new Set();

    const add = (raw) => {
        const abs = normalizeUrl(raw, pageUrl);
        if (abs) resources.add(abs);
    };

    RESOURCE_SELECTORS.forEach((selector) => {
        $(selector).each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('href') || $(el).attr('data');
            if (src) add(src);
        });
    });

    $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (!srcset) return;
        srcset.split(',').forEach((item) => {
            const src = item.trim().split(/\s+/)[0];
            if (src) add(src);
        });
    });

    $('style').each((_, el) => {
        const css = $(el).html() || '';
        const matches = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/gi)];
        matches.forEach((m) => add(m[1]));
    });

    $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const matches = [...style.matchAll(/url\(['"]?([^'")]+)['"]?\)/gi)];
        matches.forEach((m) => add(m[1]));
    });

    const links = [];
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const abs = normalizeUrl(href, pageUrl);
        if (abs) links.push(abs);
    });

    return {
        resources: Array.from(resources),
        links,
        $
    };
}

module.exports = { extractFromHtml };
