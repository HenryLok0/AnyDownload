/**
 * Preview serves the mirror from the site root. Asset URLs use that root
 * (`/assets/...`, `/external/host/...`) so the same path works on every page.
 */

function toMirrorHref(localPath) {
    if (!localPath) return null;
    const rel = String(localPath).replace(/\\/g, '/').replace(/^\/+/u, '');
    if (!rel || rel.split('/').includes('..')) return null;
    return `/${rel}`;
}

function mapRuntimeUrl(host, pathPart, siteHost) {
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    if (host.toLowerCase() === String(siteHost || '').toLowerCase()) return path;
    return `/external/${host}${path}`;
}

/**
 * Point absolute URLs inside scripts at the saved mirror.
 * Origin-only strings are left unchanged. Page links in HTML are not passed here.
 */
function rewriteRuntimeUrls(text, siteHost) {
    if (!text || !siteHost) return text;
    const plain = text.replace(
        /https?:\/\/([^/\s"'<>\\]+)(\/[^\s"'<>\\]*)?/gi,
        (full, host, pathPart) => (pathPart ? mapRuntimeUrl(host, pathPart, siteHost) : full)
    );
    return plain.replace(
        /https?:\\\/\\\/([^\\/\s"'<>]+)((?:\\\/[^\s"'<>\\]*)+)/gi,
        (full, host, escapedPath) => {
            const pathPart = escapedPath.replace(/\\\//g, '/');
            return mapRuntimeUrl(host, pathPart, siteHost).replace(/\//g, '\\/');
        }
    );
}

module.exports = {
    toMirrorHref,
    rewriteRuntimeUrls
};
