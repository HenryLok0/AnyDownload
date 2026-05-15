const { normalizeUrl } = require('../../utils/url');

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

function rewriteCss(cssText, baseUrl, pathMapper) {
    if (!cssText) return cssText;

    let result = cssText.replace(URL_PATTERN, (full, rawUrl) => {
        const abs = normalizeUrl(rawUrl, baseUrl);
        if (!abs) return full;
        const local = pathMapper.toLocalPath(abs);
        if (!local) return full;
        return `url("${local}")`;
    });

    result = result.replace(IMPORT_PATTERN, (full, rawUrl) => {
        const abs = normalizeUrl(rawUrl, baseUrl);
        if (!abs) return full;
        const local = pathMapper.toLocalPath(abs);
        if (!local) return full;
        return `@import url("${local}");`;
    });

    return result;
}

module.exports = {
    extractUrls,
    rewriteCss
};
