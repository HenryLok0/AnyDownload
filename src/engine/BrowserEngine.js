const PuppeteerAdapter = require('./adapters/PuppeteerAdapter');
const PlaywrightAdapter = require('./adapters/PlaywrightAdapter');
const AuthHandler = require('./AuthHandler');

class BrowserEngine {
    constructor(adapter, options = {}) {
        this.adapter = adapter;
        this.auth = new AuthHandler(options);
        this.extraWait = options.extraWait || 2000;
    }

    static async create(options = {}) {
        const provider = (options.provider || options.browserType || 'playwright').toLowerCase();
        let adapter;
        if (provider === 'puppeteer') {
            adapter = new PuppeteerAdapter(options);
        } else if (provider === 'playwright') {
            adapter = new PlaywrightAdapter(options);
        } else {
            throw new Error(`Unsupported browser provider: ${provider}`);
        }
        await adapter.launch();
        return new BrowserEngine(adapter, options);
    }

    async newPage() {
        return this.adapter.newPage();
    }

    enableNetworkCapture(page) {
        return this.adapter.enableNetworkCapture(page);
    }

    async fetchPage(url, options = {}) {
        const page = await this.newPage();
        const capture = await Promise.resolve(this.adapter.enableNetworkCapture(page));

        try {
            if (this.auth.enabled && !options.skipLogin) {
                await this.auth.login(this.adapter, page);
            }

            await this.adapter.goto(page, url, {
                waitUntil: options.waitUntil || 'networkidle',
                timeout: options.timeout,
                extraWait: options.extraWait ?? this.extraWait
            });

            const html = await this.adapter.getContent(page);
            const cookies = await this.adapter.getCookies(page);
            let domUrls = [];
            if (typeof this.adapter.collectDomResourceUrls === 'function') {
                domUrls = await this.adapter.collectDomResourceUrls(page);
            }
            await this.adapter.closePage(page);
            return { html, capture, cookies, domUrls };
        } catch (error) {
            await this.adapter.closePage(page).catch(() => {});
            await this.adapter.close().catch(() => {});
            throw error;
        }
    }

    async goto(page, url, options) {
        return this.adapter.goto(page, url, options);
    }

    async getContent(page) {
        return this.adapter.getContent(page);
    }

    async getUrl(page) {
        return this.adapter.getUrl(page);
    }

    async fill(page, selector, value) {
        return this.adapter.fill(page, selector, value);
    }

    async click(page, selector) {
        return this.adapter.click(page, selector);
    }

    async waitForNavigation(page, options) {
        return this.adapter.waitForNavigation(page, options);
    }

    async screenshot(page, filePath) {
        return this.adapter.screenshot(page, filePath);
    }

    async close() {
        return this.adapter.close();
    }

    get capture() {
        return this.adapter.capture;
    }
}

module.exports = BrowserEngine;
