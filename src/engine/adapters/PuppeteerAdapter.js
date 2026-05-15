const puppeteer = require('puppeteer');
const NetworkCapture = require('../NetworkCapture');

class PuppeteerAdapter {
    constructor(options = {}) {
        this.headless = options.headless !== false;
        this.userAgent = options.userAgent;
        this.cookie = options.cookie;
        this.proxy = options.proxy;
        this.timeout = options.timeout || 60000;
        this.browser = null;
        this.capture = new NetworkCapture({ maxFileSize: options.maxFileSize });
    }

    async launch() {
        const args = [];
        if (this.proxy) {
            args.push(`--proxy-server=${this.proxy}`);
        }
        this.browser = await puppeteer.launch({
            headless: this.headless ? 'new' : false,
            args
        });
    }

    async newPage() {
        if (!this.browser) await this.launch();
        const page = await this.browser.newPage();
        if (this.userAgent) {
            await page.setUserAgent(this.userAgent);
        }
        if (this.cookie) {
            await page.setExtraHTTPHeaders({ Cookie: this.cookie });
        }
        return page;
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
                    body = await response.buffer();
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
        const waitUntil = options.waitUntil === 'networkidle' ? 'networkidle2' : (options.waitUntil || 'networkidle2');
        await page.goto(url, {
            waitUntil,
            timeout: options.timeout || this.timeout
        });
        if (options.extraWait) {
            await new Promise(r => setTimeout(r, options.extraWait));
        }
    }

    async getContent(page) {
        return page.content();
    }

    async getUrl(page) {
        return page.url();
    }

    async fill(page, selector, value) {
        await page.waitForSelector(selector, { timeout: 10000 }).catch(() => {});
        await page.type(selector, value, { delay: 20 });
    }

    async click(page, selector) {
        await page.click(selector).catch(async () => {
            await page.$eval(selector, el => el.click());
        });
    }

    async waitForNavigation(page, options = {}) {
        await page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: options.timeout || this.timeout
        }).catch(() => {});
    }

    async screenshot(page, filePath) {
        await page.screenshot({ path: filePath, fullPage: true });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = PuppeteerAdapter;
