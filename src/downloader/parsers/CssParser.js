const { normalizeUrl } = require('../../utils/url');
const PathMapper = require('../storage/PathMapper');

const URL_PATTERN = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
const IMPORT_PATTERN = /@import\s+(?:url\(\s*)?['"]?([^'");\s]+)['"]?\s*\)?[^;]*;/gi;

function extractUrls(cssText, baseUrl) {
    if (!cssText || typeof cssText !== 'string') return [];

    const found = new Set();

    let match;
    const urlRe = new RegExp(URL_PATTERN.source, 'gi');
    while ((match = urlRe.exec(cssText)) !== null) {
        const abs = normalizeUrl(match[1], baseUrl);
        if (abs) found.add(abs);
    }

    const importRe = new RegExp(IMPORT_PATTERN.source, 'gi');
    while ((match = importRe.exec(cssText)) !== null) {
        const abs = normalizeUrl(match[1], baseUrl);
        if (abs) found.add(abs);
    }

    return Array.from(found);
}

function toRewrittenHref(abs, pathMapper, mirrorContextPathPosix) {
    try {
        const u = new URL(abs);
        if (u.hostname !== pathMapper.baseUrl.hostname) {
            return pathMapper.toLocalPath(abs);
        }
        const assetMir = pathMapper.toMirrorRelPath(abs);
        if (!assetMir) return null;
        if (mirrorContextPathPosix) {
            return PathMapper.relativeBetweenMirrorFiles(mirrorContextPathPosix.replace(/\\/gu, '/'), assetMir);
        }
        return pathMapper.toLocalPath(abs);
    } catch {
        return null;
    }
}

function rewriteCss(cssText, baseUrl, pathMapper, options = {}) {
    if (!cssText) return cssText;

    const mirrorCtx = options.mirrorContextPath
        ? String(options.mirrorContextPath).replace(/\\/gu, '/')
        : null;

    let result = cssText.replace(URL_PATTERN, (full, rawUrl) => {
        const abs = normalizeUrl(rawUrl, baseUrl);
        if (!abs) return full;
        const local = toRewrittenHref(abs, pathMapper, mirrorCtx);
        if (!local) return full;
        return `url("${local}")`;
    });

    result = result.replace(IMPORT_PATTERN, (full, rawUrl) => {
        const abs = normalizeUrl(rawUrl, baseUrl);
        if (!abs) return full;
        const local = toRewrittenHref(abs, pathMapper, mirrorCtx);
        if (!local) return full;
        return `@import url("${local}");`;
    });

    return result;
}

module.exports = {
    extractUrls,
    rewriteCss
};
