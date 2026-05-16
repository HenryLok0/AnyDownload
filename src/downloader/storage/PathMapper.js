const path = require('path');
const mime = require('mime-types');

const WINDOWS_FORBIDDEN = /[<>"|?*%\\]/u;

const KNOWN_DOCUMENT_EXT = /\.(html|htm|php|pdf)$/iu;
const KNOWN_ASSET_EXT =
    /\.(js|mjs|cjs|css|map|png|jpe?g|gif|svg|webp|ico|bmp|avif|woff2?|ttf|otf|eot|mp4|mp3|wav|ogg|webm|m4a|aac|wasm|txt|xml|json|zip)$/iu;

function posix(p) {
    return String(p || '').replace(/\\/gu, '/');
}

class PathMapper {
    constructor(pageUrl) {
        this.pageUrl = pageUrl;
        this.baseUrl = new URL(pageUrl);
    }

    static _sanitizeSegment(segment) {
        if (!segment || segment === '.' || segment === '..') return null;
        if (WINDOWS_FORBIDDEN.test(segment)) return null;
        return segment.trim();
    }

    toMirrorRelPath(absUrlStr) {
        return this.toLocalPath(absUrlStr);
    }

    toLocalPath(resourceUrl) {
        try {
            const urlObj = new URL(resourceUrl);
            let localPath;
            if (urlObj.hostname !== this.baseUrl.hostname) {
                localPath = path.join('external', urlObj.hostname, urlObj.pathname.replace(/^\//u, ''));
            } else {
                localPath = urlObj.pathname.replace(/^\//u, '') || 'index';
            }
            return posix(localPath);
        } catch {
            return null;
        }
    }

    ensureExtension(localPath, contentType) {
        if (!localPath) return localPath;
        if (path.posix.extname(localPath)) return localPath;
        const ext = mime.extension(contentType || '');
        if (ext) return `${localPath}.${ext}`;
        return localPath;
    }

    static pathnameLooksLikeExistingFile(urlStr) {
        try {
            const tail = posix(new URL(urlStr).pathname.replace(/\/+$/gu, '').split('/').pop());
            return KNOWN_ASSET_EXT.test(tail) || KNOWN_DOCUMENT_EXT.test(tail);
        } catch {
            return false;
        }
    }

    /** Mirror path for a navigable HTML page (relative to mirror root). */
    getMirrorRelPagePath(urlStr) {
        let u;
        try {
            u = new URL(urlStr);
        } catch {
            return 'index.html';
        }
        if (u.hostname !== this.baseUrl.hostname) return 'index.html';

        let pathname = u.pathname.replace(/\/+$/gu, '') || '';
        const rawSegments = pathname.split('/').filter(Boolean);
        const segments = [];
        for (const s of rawSegments) {
            const clean = PathMapper._sanitizeSegment(s);
            if (clean) segments.push(clean);
        }

        if (!segments.length) return 'index.html';

        const last = segments[segments.length - 1];
        const isDocSuffix = KNOWN_DOCUMENT_EXT.test(last);
        const isAssetSuffix = KNOWN_ASSET_EXT.test(last) && !isDocSuffix;

        if (isAssetSuffix) {
            const dirSegs = segments.slice(0, -1).join('/');
            const fileSeg = segments[segments.length - 1];
            return dirSegs ? `${dirSegs}/${fileSeg}` : fileSeg;
        }

        if (isDocSuffix) return segments.join('/');

        return `${segments.join('/')}/index.html`;
    }

    /**
     * HTML page path → sibling asset/target file POSIX path (`href`).
     */
    static relativeBetweenMirrorFiles(fromMirrorPageRelPath, toMirrorAssetRelPath) {
        const fromMir = posix(fromMirrorPageRelPath);
        const toMir = posix(toMirrorAssetRelPath);
        if (!fromMir || !toMir) return null;
        const fromDirNorm = posix(path.posix.dirname(fromMir));
        const fromArg = !fromDirNorm || fromDirNorm === '.' ? '.' : fromDirNorm;

        let rel = posix(path.posix.relative(fromArg, toMir));
        if (rel !== '..' && !rel.startsWith('.')) rel = `./${rel}`;
        return rel;
    }

    /**
     * Same-host navigation `<a href>` from current mirror page → target URL.
     */
    relativePageHref(fromMirrorPageRelPath, targetAbsUrlStr) {
        try {
            const tgtUrl = new URL(targetAbsUrlStr, targetAbsUrlStr);
            if (tgtUrl.hostname !== this.baseUrl.hostname) return null;
        } catch {
            return null;
        }

        const tgtPm = new PathMapper(targetAbsUrlStr);
        const targetMirPath = posix(tgtPm.getMirrorRelPagePath(targetAbsUrlStr));
        const fromMir = posix(fromMirrorPageRelPath);

        const fromDirNorm = posix(path.posix.dirname(fromMir));
        const fromArg = !fromDirNorm || fromDirNorm === '.' ? '.' : fromDirNorm;

        if (targetMirPath === 'index.html') {
            const relRaw = posix(path.posix.relative(fromArg, '.'));
            if (!relRaw || relRaw === '.') return './';
            return `${relRaw.replace(/\/?$/u, '')}/`;
        }

        /* Clean URL routes stored as dirname/index.html */
        if (/\/index\.html$/u.test(targetMirPath)) {
            let tgtDir = path.posix.dirname(targetMirPath);
            tgtDir = !tgtDir || tgtDir === '.' ? '.' : posix(tgtDir);
            let relRaw = posix(path.posix.relative(fromArg, tgtDir));
            if (!relRaw || relRaw === '.') return './';
            return `${relRaw.replace(/\/?$/u, '')}/`;
        }

        let relRaw = posix(path.posix.relative(fromArg, targetMirPath));
        if (!relRaw || relRaw === '.') return './';
        if (relRaw !== '..' && !relRaw.startsWith('.')) relRaw = `./${relRaw}`;
        return relRaw;
    }

    /** Same-host asset/script/link `<src|href>` from current mirror page → resource URL */
    relativeAssetHref(fromMirrorPageRelPath, assetAbsUrlStr) {
        let u;
        try {
            u = new URL(assetAbsUrlStr);
            if (u.hostname !== this.baseUrl.hostname) return null;
        } catch {
            return null;
        }
        let assetMir = posix(this.toMirrorRelPath(assetAbsUrlStr));
        if (!assetMir) return null;
        return PathMapper.relativeBetweenMirrorFiles(fromMirrorPageRelPath, assetMir);
    }

    /** @deprecated flattened page name — tests only */
    getPageFilename(url) {
        const uh = new URL(url);
        let filename = uh.pathname.replace(/\/$/u, '') || 'index';
        filename = filename.replace(/[/\\?%*:|"<>]/gu, '_');
        if (!filename.endsWith('.html')) filename += '.html';
        return filename;
    }

    getHostDir(url) {
        return new URL(url).host.replace(/[/:\\]/gu, '_');
    }
}

module.exports = PathMapper;
