const fs = require('fs-extra');
const path = require('path');
const { extractFragmentInPage } = require('./pageExtract');
const { installPicker, pickerLabels } = require('./pickerSource');
const {
    absolutizeCssUrls,
    assetFileName,
    buildOfflineDocument,
    buildStatesPage,
    collectCssUrls,
    collectHtmlAssetUrls,
    hostDirName,
    isStylesheet,
    isVisualAsset,
    rewriteCssUrls,
    rewriteHtmlAssets
} = require('./fragmentBundle');

const VIEWPORTS = [
    { id: 'desktop', width: 1280, height: 800 },
    { id: 'tablet', width: 768, height: 1024 },
    { id: 'mobile', width: 390, height: 844 }
];

const MAX_ASSETS = 200;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

function cancelledError() {
    const err = new Error('Capture cancelled');
    err.code = 'CANCELLED';
    return err;
}

function buildShotPlan({ captureStates, captureViewports } = {}) {
    const viewports = captureViewports === false ? [VIEWPORTS[0]] : VIEWPORTS;
    const states = captureStates === false ? ['default'] : ['default', 'hover', 'focus'];
    const shots = [];
    viewports.forEach((viewport) => {
        states.forEach((state) => {
            const title = viewport.id.charAt(0).toUpperCase() + viewport.id.slice(1) + ' · ' + state;
            shots.push({
                id: viewport.id,
                width: viewport.width,
                height: viewport.height,
                state,
                file: `states/${viewport.id}-${state}.png`,
                title
            });
        });
    });
    return shots;
}

async function runQueue(queue, limit, worker) {
    if (!queue.length) return;
    let active = 0;
    let index = 0;
    await new Promise((resolve, reject) => {
        const next = () => {
            if (index >= queue.length && active === 0) {
                resolve();
                return;
            }
            while (active < limit && index < queue.length) {
                const item = queue[index];
                index += 1;
                active += 1;
                Promise.resolve()
                    .then(() => worker(item))
                    .then(() => {
                        active -= 1;
                        next();
                    })
                    .catch(reject);
            }
        };
        next();
    });
}

async function forcePseudo(page, selector, pseudo) {
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector
    });
    if (!nodeId) {
        await session.detach().catch(() => {});
        throw new Error('Element not found for state ' + pseudo);
    }
    await session.send('CSS.forcePseudoState', {
        nodeId,
        forcedPseudoClasses: [pseudo]
    });
    return async () => {
        try {
            await session.send('CSS.forcePseudoState', {
                nodeId,
                forcedPseudoClasses: []
            });
        } catch {
            /* Node may already be gone after a resize. */
        }
        await session.detach().catch(() => {});
    };
}

/**
 * Opens a local browser, lets the user pick one block, and writes that block
 * with its original CSS, images, and fonts. Nothing is uploaded.
 */
class FragmentSession {
    constructor(options = {}) {
        this.outputDir = options.outputDir || 'picked_site';
        this.headless = options.headless === true;
        this.selector = options.selector || null;
        this.extraWait = Number.isFinite(options.extraWait) ? options.extraWait : 2000;
        this.timeout = options.timeout || 60000;
        this.locale = options.locale || 'en';
        this.captureStates = options.captureStates !== false;
        this.captureViewports = options.captureViewports !== false;
        this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
        this.browser = null;
        this.context = null;
        this.cancelled = false;
        this._signal = null;
    }

    cancel() {
        this.cancelled = true;
        if (this._signal) this._signal('cancel');
        if (this.browser) this.browser.close().catch(() => {});
    }

    async run(url) {
        if (this.cancelled) throw cancelledError();
        if (this.headless && !this.selector) {
            throw new Error('A visible window is required unless a CSS selector is provided');
        }
        const playwright = loadPlaywright();
        this.onStatus('Opening page');
        this.browser = await playwright.chromium.launch({ headless: this.headless });
        try {
            if (this.cancelled) throw cancelledError();
            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 800 },
                reducedMotion: 'reduce'
            });
            const page = await this.context.newPage();
            if (!this.selector) {
                await page.exposeBinding('__anydownloadSignal', async (_source, message) => {
                    if (this._signal) this._signal(String(message || ''));
                });
                await page.addInitScript(installPicker, pickerLabels(this.locale));
            }
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });
            await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
            if (this.extraWait > 0) await page.waitForTimeout(this.extraWait);
            if (this.cancelled) throw cancelledError();

            if (this.selector) {
                await page.locator(this.selector).first().waitFor({
                    state: 'attached',
                    timeout: this.timeout
                });
                const found = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return false;
                    window.__anydownloadSelection = el;
                    window.__anydownloadSelector = sel;
                    return true;
                }, this.selector);
                if (!found) throw new Error('Selector not found: ' + this.selector);
            } else {
                this.onStatus('Waiting for selection');
                await this._waitForDecision(page);
            }
            if (this.cancelled) throw cancelledError();

            this.onStatus('Saving fragment');
            const extracted = await page.evaluate(extractFragmentInPage);
            if (!extracted || !extracted.html) throw new Error('No element selected');
            await page.evaluate(() => {
                const host = document.getElementById('anydownload-picker-host');
                if (host) host.style.display = 'none';
            }).catch(() => {});

            const dir = this._outputDir(url);
            await fs.ensureDir(path.join(dir, 'states'));
            const shots = await this._captureShots(page, extracted.selector, dir);
            const written = await this._writeBundle(dir, url, extracted, shots);
            return written;
        } finally {
            const browser = this.browser;
            this.browser = null;
            this.context = null;
            if (browser) await browser.close().catch(() => {});
        }
    }

    _outputDir(url) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return path.join(path.resolve(this.outputDir), hostDirName(url), `pick-${stamp}`);
    }

    _waitForDecision(page) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (err) => {
                if (settled) return;
                settled = true;
                this._signal = null;
                page.off('close', onClose);
                if (err) reject(err);
                else resolve();
            };
            const onClose = () => finish(cancelledError());
            this._signal = (message) => {
                if (message === 'cancel') finish(cancelledError());
                else finish();
            };
            page.on('close', onClose);
            if (this.cancelled) finish(cancelledError());
        });
    }

    async _captureShots(page, selector, dir) {
        if (!selector) return [];
        const plan = buildShotPlan({
            captureStates: this.captureStates,
            captureViewports: this.captureViewports
        });
        this.onStatus('Capturing states');
        for (const shot of plan) {
            if (this.cancelled) throw cancelledError();
            const absPath = path.join(dir, shot.file);
            let release = async () => {};
            try {
                await page.setViewportSize({ width: shot.width, height: shot.height });
                await page.waitForTimeout(120);
                const locator = page.locator(selector).first();
                await locator.waitFor({ state: 'visible', timeout: 5000 });
                if (shot.state === 'hover' || shot.state === 'focus') {
                    release = await forcePseudo(page, selector, shot.state);
                }
                await locator.screenshot({ path: absPath });
                shot.ok = true;
            } catch (err) {
                shot.ok = false;
                shot.error = err && err.message ? err.message : String(err);
            } finally {
                await release().catch(() => {});
            }
        }
        return plan;
    }

    async _writeBundle(dir, pageUrl, extracted, shots) {
        const map = new Map();
        const failed = [];
        let css = extracted.css || '';
        let truncated = false;
        const queue = [];
        const seen = new Set();

        const enqueue = (raw) => {
            if (!raw || seen.size >= MAX_ASSETS) {
                if (raw && seen.size >= MAX_ASSETS) truncated = true;
                return;
            }
            let href = String(raw).trim();
            try {
                href = new URL(href).href;
            } catch {
                return;
            }
            if (!/^https?:/i.test(href) || seen.has(href)) return;
            seen.add(href);
            queue.push(href);
        };

        collectCssUrls(css).forEach(enqueue);
        collectHtmlAssetUrls(extracted.html).forEach(enqueue);
        (extracted.failedStylesheetHrefs || []).forEach(enqueue);

        let assetIndex = 0;
        await runQueue(queue, 4, async (assetUrl) => {
            if (this.cancelled) throw cancelledError();
            try {
                const response = await this.context.request.get(assetUrl, {
                    timeout: 15000,
                    failOnStatusCode: false
                });
                if (!response.ok()) {
                    failed.push(assetUrl);
                    return;
                }
                const body = await response.body();
                const contentType = response.headers()['content-type'] || '';
                if (body.length > MAX_ASSET_BYTES) {
                    failed.push(assetUrl);
                    return;
                }
                if (isStylesheet(contentType, assetUrl)) {
                    const extra = absolutizeCssUrls(body.toString('utf8'), assetUrl);
                    css += '\n' + extra;
                    collectCssUrls(extra).forEach(enqueue);
                    return;
                }
                if (!isVisualAsset(contentType, assetUrl)) {
                    failed.push(assetUrl);
                    return;
                }
                const name = assetFileName(assetUrl, contentType, assetIndex);
                assetIndex += 1;
                await fs.outputFile(path.join(dir, 'assets', name), body);
                map.set(assetUrl, `assets/${name}`);
            } catch {
                failed.push(assetUrl);
            }
        });

        const fragmentHtml = rewriteHtmlAssets(extracted.html, map);
        const fragmentCss = '/* Copied from the live page. Not regenerated. */\n' + rewriteCssUrls(css, map);
        const savedShots = shots.filter((shot) => shot.ok);
        const html = buildOfflineDocument({
            fragmentHtml,
            bodyStyle: extracted.bodyStyle,
            bodyClass: extracted.bodyClass,
            title: extracted.label,
            sourceUrl: pageUrl
        });
        await fs.ensureDir(dir);
        await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
        await fs.writeFile(path.join(dir, 'fragment.css'), fragmentCss, 'utf8');
        await fs.writeFile(path.join(dir, 'states.html'), buildStatesPage(savedShots), 'utf8');
        const meta = {
            sourceUrl: pageUrl,
            selector: extracted.selector,
            label: extracted.label,
            capturedAt: new Date().toISOString(),
            transport: 'local',
            note: 'Original HTML and CSS were copied on this computer. They were not regenerated by a model.',
            assetCount: map.size,
            truncated,
            failedAssets: failed,
            screenshots: savedShots.map((shot) => ({
                file: shot.file,
                viewport: shot.id,
                state: shot.state,
                width: shot.width,
                height: shot.height
            })),
            screenshotErrors: shots.filter((shot) => !shot.ok).map((shot) => ({
                file: shot.file,
                error: shot.error
            }))
        };
        await fs.writeJson(path.join(dir, 'meta.json'), meta, { spaces: 2 });
        return {
            outputDir: dir,
            selector: extracted.selector,
            label: extracted.label,
            assetCount: map.size,
            screenshotCount: savedShots.length
        };
    }
}

function loadPlaywright() {
    try {
        return require('playwright');
    } catch {
        throw new Error('Playwright is not installed. Run: npm install playwright');
    }
}

module.exports = {
    FragmentSession,
    buildShotPlan,
    VIEWPORTS
};
