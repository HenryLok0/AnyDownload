const axios = require('axios');

/**
 * AnyDownload native static engine — no browser binaries required.
 * Fetches HTML over HTTP and relies on HtmlParser + CssParser for assets.
 */
class StaticEngine {
    constructor(options = {}) {
        this.userAgent = options.userAgent || 'Mozilla/5.0 (compatible; AnyDownload/2.0)';
        this.cookie = options.cookie || '';
        this.timeout = options.timeout || 30000;
        this.maxRedirects = options.maxRedirects || 5;
    }

    async fetchPage(url) {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': this.userAgent,
                ...(this.cookie ? { Cookie: this.cookie } : {}),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            timeout: this.timeout,
            maxRedirects: this.maxRedirects,
            validateStatus: s => s >= 200 && s < 400
        });
        return {
            html: String(res.data),
            capture: null,
            engine: 'static'
        };
    }

    async close() {
        // no-op
    }
}

module.exports = StaticEngine;
