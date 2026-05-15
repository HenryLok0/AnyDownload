const playwright = require('playwright');
const NetworkCapture = require('../NetworkCapture');

const BROWSER_MAP = {
    chromium: 'chromium',
    chrome: 'chromium',
    firefox: 'firefox',
    webkit: 'webkit',
    safari: 'webkit'
};

class PlaywrightAdapter {
    constructor(options = {}) {
        this.headless = options.headless !== false;
        this.userAgent = options.userAgent;
        this.cookie = options.cookie;
        this.proxy = options.proxy;
        this.timeout = options.timeout || 60000;
        this.browserName = BROWSER_MAP[options.browser] || 'chromium';
        this.browser = null;
        this.context = null;
        this.capture = new NetworkCapture({ maxFileSize: options.maxFileSize });
    }

    async launch() {
        const launcher = playwright[this.browserName];
        if (!launcher) {
            throw new Error(`Unsupported Playwright browser: ${this.browserName}`);
        }
        this.browser = await launcher.launch({ headless: this.headless });
        const contextOptions = {
            userAgent: this.userAgent
        };
        if (this.cookie) {
            contextOptions.extraHTTPHeaders = { Cookie: this.cookie };
        }
        if (this.proxy) {
            try {
                const proxyUrl = new URL(this.proxy);
                contextOptions.proxy = {
                    server: `${proxyUrl.protocol}//${proxyUrl.host}`
                };
            } catch {
                contextOptions.proxy = { server: this.proxy };
            }
        }
        this.context = await this.browser.newContext(contextOptions);
    }

    async newPage() {
        if (!this.context) await this.launch();
        return this.context.newPage();
    }

    enableNetworkCapture(page, capture = this.capture) {
        capture.reset();
        page.on('response', async (response) => {
            try {
                const url = response.url();
                const status = response.status();
                const headers = response.headers();
                const contentType = headers['content-type'] || '';
                let body = Buffer.alloc(0);
                try {
                    body = await response.body();
                } catch {
                    // Some responses cannot be buffered
                }
                capture.add({ url, status, contentType, body, headers });
            } catch {
                // Ignore capture errors
            }
        });
        return capture;
    }

    async goto(page, url, options = {}) {
        const waitUntil = options.waitUntil || 'networkidle';
        await page.goto(url, {
            waitUntil,
            timeout: options.timeout || this.timeout
        });
        if (options.extraWait) {
            await page.waitForTimeout(options.extraWait);
        }
    }

    async getContent(page) {
        return page.content();
    }

    async getUrl(page) {
        return page.url();
    }

    async fill(page, selector, value) {
        await page.fill(selector, value).catch(async () => {
            await page.locator(selector).fill(value);
        });
    }

    async click(page, selector) {
        await page.click(selector).catch(async () => {
            await page.locator(selector).first().click();
        });
    }

    async waitForNavigation(page, options = {}) {
        await page.waitForLoadState('networkidle', {
            timeout: options.timeout || this.timeout
        }).catch(() => {});
    }

    async screenshot(page, filePath) {
        await page.screenshot({ path: filePath, fullPage: true });
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = PlaywrightAdapter;
