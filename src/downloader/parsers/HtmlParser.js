const cheerio = require('cheerio');
const { normalizeUrl } = require('../../utils/url');

const RESOURCE_SELECTORS = [
    'img[src]',
    'img[data-src]',
    'link[rel="stylesheet"][href]',
    'link[rel="preload"][href]',
    'link[rel="prefetch"][href]',
    'link[rel="modulepreload"][href]',
    'link[rel="icon"][href]',
    'link[rel="shortcut icon"][href]',
    'link[rel="apple-touch-icon"][href]',
    'link[rel="image_src"][href]',
    'script[src]',
    'script[type="module"][src]',
    'link[rel="manifest"][href]',
    'video[src]',
    'video[poster]',
    'audio[src]',
    'source[src]',
    'track[src]',
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
            const src = $(el).attr('src') ||
                $(el).attr('href') ||
                $(el).attr('data') ||
                $(el).attr('poster');
            if (src) add(src);
        });
    });

    $('link[rel="preload"][as="font"], link[rel="preload"][as="style"], link[rel="preload"][as="image"], link[rel="preload"][as="script"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) add(href);
    });

    $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
        const content = $(el).attr('content');
        if (content) add(content);
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
