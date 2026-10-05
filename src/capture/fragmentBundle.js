const crypto = require('crypto');
const path = require('path');
const cheerio = require('cheerio');

const VISUAL_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico', '.bmp',
    '.woff', '.woff2', '.ttf', '.otf', '.eot'
]);

const TYPE_EXT = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
    'image/bmp': '.bmp',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
    'font/ttf': '.ttf',
    'font/otf': '.otf',
    'application/font-woff': '.woff',
    'application/font-woff2': '.woff2',
    'application/x-font-ttf': '.ttf',
    'application/vnd.ms-fontobject': '.eot'
};

function contentTypeBase(contentType) {
    return String(contentType || '').split(';')[0].trim().toLowerCase();
}

function extnameFromUrl(raw) {
    try {
        const ext = path.extname(new URL(raw).pathname).toLowerCase();
        return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
    } catch {
        return '';
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
}

/**
 * Resolve url() tokens against a stylesheet or document base.
 * Mirrors the copy used inside the page extractor.
 */
function absolutizeCssUrls(css, base) {
    if (!css) return '';
    return String(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, _q, raw) => {
        const token = String(raw || '').trim();
        if (!token || token.startsWith('data:') || token.startsWith('blob:') || token.startsWith('#')) {
            return full;
        }
        try {
            return `url("${new URL(token, base).href}")`;
        } catch {
            return full;
        }
    });
}

function collectCssUrls(css) {
    const urls = [];
    if (!css) return urls;
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    let match;
    while ((match = re.exec(css))) {
        const token = String(match[2] || '').trim();
        if (!token || token.startsWith('data:') || token.startsWith('blob:') || token.startsWith('#')) continue;
        urls.push(token);
    }
    return urls;
}

function pushUrl(list, raw) {
    const token = raw != null ? String(raw).trim() : '';
    if (!token || token.startsWith('data:') || token.startsWith('blob:') || token.startsWith('#')) return;
    list.push(token);
}

function collectHtmlAssetUrls(html) {
    const urls = [];
    if (!html) return urls;
    const $ = cheerio.load(html);
    $('img[src], source[src], img[data-src], video[poster], image[href], image').each((_, el) => {
        const node = $(el);
        pushUrl(urls, node.attr('src'));
        pushUrl(urls, node.attr('data-src'));
        pushUrl(urls, node.attr('poster'));
        pushUrl(urls, node.attr('href'));
        pushUrl(urls, node.attr('xlink:href'));
    });
    $('use').each((_, el) => {
        const href = $(el).attr('href') || $(el).attr('xlink:href');
        if (href && !String(href).startsWith('#')) pushUrl(urls, href);
    });
    $('[srcset]').each((_, el) => {
        String($(el).attr('srcset') || '').split(',').forEach((part) => {
            const token = part.trim().split(/\s+/)[0];
            pushUrl(urls, token);
        });
    });
    $('[style]').each((_, el) => {
        collectCssUrls($(el).attr('style')).forEach((url) => urls.push(url));
    });
    return urls;
}

function lookupLocal(map, raw) {
    const token = String(raw || '').trim();
    if (!token) return null;
    if (map.has(token)) return map.get(token);
    try {
        const href = new URL(token).href;
        if (map.has(href)) return map.get(href);
    } catch {
        /* keep the original token */
    }
    return null;
}

function rewriteCssUrls(css, map) {
    if (!css) return '';
    return String(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, _q, raw) => {
        const local = lookupLocal(map, raw);
        return local ? `url("${local}")` : full;
    });
}

function rewriteSrcset(value, map) {
    return String(value || '').split(',').map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return trimmed;
        const bits = trimmed.split(/\s+/);
        const local = lookupLocal(map, bits[0]);
        if (local) bits[0] = local;
        return bits.join(' ');
    }).join(', ');
}

function rewriteHtmlAssets(html, map) {
    if (!html) return '';
    const $ = cheerio.load(html);
    $('img[src], source[src], img[data-src], video[poster], image, use, [srcset], [style]').each((_, el) => {
        const node = $(el);
        ['src', 'data-src', 'poster', 'href', 'xlink:href'].forEach((attr) => {
            const local = lookupLocal(map, node.attr(attr));
            if (local) node.attr(attr, local);
        });
        if (node.attr('srcset')) node.attr('srcset', rewriteSrcset(node.attr('srcset'), map));
        if (node.attr('style')) node.attr('style', rewriteCssUrls(node.attr('style'), map));
    });
    const body = $('body');
    if (body.length) return body.html() || '';
    return $.root().html() || '';
}

function isStylesheet(contentType, url) {
    const ct = contentTypeBase(contentType);
    if (ct.includes('text/css')) return true;
    return extnameFromUrl(url) === '.css';
}

function isVisualAsset(contentType, url) {
    const ct = contentTypeBase(contentType);
    if (ct.startsWith('image/') || ct.startsWith('font/')) return true;
    if (ct.includes('font') || ct === 'application/vnd.ms-fontobject') return true;
    return VISUAL_EXT.has(extnameFromUrl(url));
}

function assetFileName(absUrl, contentType, index) {
    const fromType = TYPE_EXT[contentTypeBase(contentType)] || '';
    const fromUrl = extnameFromUrl(absUrl);
    const ext = VISUAL_EXT.has(fromUrl) ? fromUrl : (fromType || fromUrl || '');
    const hash = crypto.createHash('sha1').update(String(absUrl)).digest('hex').slice(0, 10);
    return `${index}-${hash}${ext}`;
}

function buildOfflineDocument({ fragmentHtml, bodyStyle, bodyClass, title }) {
    const classAttr = bodyClass ? ` class="${escapeAttr(bodyClass)}"` : '';
    const styleAttr = bodyStyle ? ` style="${escapeAttr(bodyStyle)}"` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || 'Captured fragment')}</title>
<link rel="stylesheet" href="fragment.css">
</head>
<body${classAttr}${styleAttr}>
<!-- Local capture. Markup and CSS were copied from the page, not regenerated. -->
${fragmentHtml || ''}
</body>
</html>
`;
}

function buildStatesPage(items) {
    const cards = (items || []).map((item) => `
    <figure>
      <figcaption>${escapeHtml(item.title)}</figcaption>
      <img src="${escapeAttr(item.file)}" alt="${escapeAttr(item.title)}">
    </figure>`).join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Captured states</title>
<style>
  body { margin: 24px; font-family: sans-serif; background: #f4f4f5; color: #18181b; }
  h1 { font-size: 18px; }
  .grid { display: flex; flex-wrap: wrap; gap: 16px; }
  figure { margin: 0; background: #fff; border: 1px solid #e4e4e7; padding: 8px; max-width: 100%; }
  figcaption { font-size: 13px; margin-bottom: 8px; }
  img { max-width: 360px; height: auto; display: block; }
</style>
</head>
<body>
<h1>Captured states</h1>
<p>Screenshots of the same block at desktop, tablet, and mobile widths, including hover and focus. The live fragment is <a href="index.html">index.html</a>.</p>
<div class="grid">
${cards}
</div>
</body>
</html>
`;
}

function hostDirName(pageUrl) {
    try {
        return new URL(pageUrl).host.replace(/[^\w.-]+/g, '_') || 'site';
    } catch {
        return 'site';
    }
}

module.exports = {
    absolutizeCssUrls,
    assetFileName,
    buildOfflineDocument,
    buildStatesPage,
    collectCssUrls,
    collectHtmlAssetUrls,
    escapeAttr,
    escapeHtml,
    hostDirName,
    isStylesheet,
    isVisualAsset,
    rewriteCssUrls,
    rewriteHtmlAssets
};
