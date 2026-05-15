const NetworkCapture = require('../NetworkCapture');

function loadPuppeteer() {
    try {
        return require('puppeteer');
    } catch {
        throw new Error(
            'Puppeteer is not installed. For render mode run: npm install puppeteer'
        );
    }
}
const { collectDomResourceUrls } = require('../DomResourceCollector');

class PuppeteerAdapter {
    constructor(options = {}) {
        this.headless = options.headless !== false;
        this.userAgent = options.userAgent;
        this.cookie = options.cookie;
        this.proxy = options.proxy;
        this.timeout = options.timeout || 60000;
        this.browser = null;
        this.capture = new NetworkCapture({ maxFileSize: options.maxFileSize });
        this._cdpBodies = new Map();
    }

    async launch() {
        const args = [];
        if (this.proxy) {
            args.push(`--proxy-server=${this.proxy}`);
        }
        const puppeteer = loadPuppeteer();
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

    async enableNetworkCapture(page, capture = this.capture) {
        capture.reset();
        this._cdpBodies.clear();

        try {
            const client = await page.createCDPSession();
            await client.send('Network.enable');
            page._anydownloadCdp = client;
            page._anydownloadCdpRequests = new Map();
            client.on('Network.responseReceived', (params) => {
                page._anydownloadCdpRequests.set(params.requestId, params.response.url);
            });
            client.on('Network.loadingFinished', async (params) => {
                try {
                    const result = await client.send('Network.getResponseBody', {
                        requestId: params.requestId
                    });
                    const body = result.base64Encoded
                        ? Buffer.from(result.body, 'base64')
                        : Buffer.from(result.body);
                    if (body.length) {
                        this._cdpBodies.set(params.requestId, body);
                    }
                } catch {
                    // Response body not available
                }
            });
        } catch {
            // CDP unavailable; fall back to response.buffer() only
        }

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
                    // Fall back to CDP-captured body
                }
                if (!body.length && page._anydownloadCdp && page._anydownloadCdpRequests) {
                    const request = response.request();
                    for (const [reqId, reqUrl] of page._anydownloadCdpRequests.entries()) {
                        if (reqUrl === url && this._cdpBodies.has(reqId)) {
                            body = this._cdpBodies.get(reqId);
                            break;
                        }
                    }
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

    async getCookies(page) {
        return page.cookies();
    }

    async collectDomResourceUrls(page) {
        return collectDomResourceUrls(page);
    }

    async closePage(page) {
        if (page && !page.isClosed()) {
            await page.close();
        }
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
