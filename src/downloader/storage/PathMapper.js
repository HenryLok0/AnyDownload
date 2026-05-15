const path = require('path');
const mime = require('mime-types');

class PathMapper {
    constructor(pageUrl) {
        this.pageUrl = pageUrl;
        this.baseUrl = new URL(pageUrl);
    }

    toLocalPath(resourceUrl) {
        try {
            const urlObj = new URL(resourceUrl);
            let localPath;
            if (urlObj.hostname !== this.baseUrl.hostname) {
                localPath = path.join('external', urlObj.hostname, urlObj.pathname.replace(/^\//, ''));
            } else {
                localPath = urlObj.pathname.replace(/^\//, '') || 'index';
            }
            return localPath.replace(/\\/g, '/');
        } catch {
            return null;
        }
    }

    ensureExtension(localPath, contentType) {
        if (!localPath) return localPath;
        if (path.extname(localPath)) return localPath;
        const ext = mime.extension(contentType || '');
        if (ext) return `${localPath}.${ext}`;
        return localPath;
    }

    getPageFilename(url) {
        const u = new URL(url);
        let filename = u.pathname.replace(/\/$/, '') || 'index';
        filename = filename.replace(/[\/\\?%*:|"<>]/g, '_');
        if (!filename.endsWith('.html')) filename += '.html';
        return filename;
    }

    getHostDir(url) {
        return new URL(url).host.replace(/[:\/\\]/g, '_');
    }
}

module.exports = PathMapper;
