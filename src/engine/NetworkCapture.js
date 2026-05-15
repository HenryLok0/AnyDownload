const { URL } = require('url');

class NetworkCapture {
    constructor(options = {}) {
        this.maxFileSize = options.maxFileSize || 0;
        this.responses = new Map();
    }

    reset() {
        this.responses.clear();
    }

    shouldCapture(url, status, contentLength) {
        if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
            return false;
        }
        if (status < 200 || status >= 400) {
            return false;
        }
        if (this.maxFileSize && contentLength && contentLength > this.maxFileSize) {
            return false;
        }
        try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return false;
            }
        } catch {
            return false;
        }
        return true;
    }

    add(entry) {
        const { url, status, contentType, body, headers } = entry;
        const size = body?.length || 0;
        if (!size) {
            return;
        }
        if (!this.shouldCapture(url, status, size)) {
            return;
        }
        this.responses.set(url, {
            url,
            status,
            contentType: contentType || '',
            body: body || Buffer.alloc(0),
            headers: headers || {}
        });
    }

    getAll() {
        return Array.from(this.responses.values());
    }

    getByMimePrefix(prefix) {
        return this.getAll().filter(r =>
            r.contentType && r.contentType.toLowerCase().startsWith(prefix)
        );
    }

    getDocument() {
        return this.getAll().find(r =>
            (r.contentType || '').includes('text/html')
        );
    }
}

module.exports = NetworkCapture;
