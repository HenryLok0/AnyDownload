const axios = require('axios');
const StaticEngine = require('./StaticEngine');
const BrowserEngine = require('./BrowserEngine');
const { ensureRenderBackend } = require('./BrowserInstaller');

/**
 * AnyDownload's own download engine.
 *
 * Modes:
 *   static  — HTTP only, zero browser install (default, best for most sites)
 *   render  — Headless browser + network capture (JS-heavy sites)
 *   auto    — Try static first; use render only when the page looks dynamic
 */
class AnyDownloadEngine {
    constructor(options = {}) {
        this.mode = options.mode || options.engineMode || 'auto';
        this.userAgent = options.userAgent;
        this.cookie = options.cookie;
        this.timeout = options.timeout || 30000;
        this.extraWait = options.extraWait || 2000;
        this.renderProvider = options.renderProvider || options.browserType || 'puppeteer';
        this.browser = options.browser || 'chromium';
        this.headless = options.headless !== false;
        this.loginUrl = options.loginUrl;
        this.loginForm = options.loginForm;
        this.loginCredentials = options.loginCredentials;
        this.maxFileSize = options.maxFileSize || 0;
        this.proxy = options.proxy || null;
        this._static = new StaticEngine(options);
        this._render = null;
    }

    static htmlNeedsRender(html) {
        if (!html || html.length < 3000) return true;
        if (/<script[^>]+type=["']module["']/i.test(html)) return true;
        if (/<script[^>]+src=["'][^"']*\/assets\/[^"']+\.js/i.test(html)) return true;
        if (/<script[^>]+src=[^>]*(react|vue|angular|next|nuxt|vite)/i.test(html)) return true;
        if (/__NEXT_DATA__|ng-app|id=["'](app|root)["']|window\.__INITIAL_STATE__/i.test(html)) {
            return true;
        }
        const hasContent = /<link[^>]+stylesheet/i.test(html) || /<img\s/i.test(html);
        const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim();
        if (!hasContent && bodyText.length < 200) return true;
        return false;
    }

    static async needsRender(url, userAgent) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': userAgent || 'Mozilla/5.0' },
                timeout: 15000
            });
            return AnyDownloadEngine.htmlNeedsRender(String(res.data));
        } catch {
            return true;
        }
    }

    async _getRenderEngine() {
        if (!this._render) {
            await ensureRenderBackend(this.renderProvider);
            this._render = await BrowserEngine.create({
                provider: this.renderProvider,
                browser: this.browser,
                headless: this.headless,
                userAgent: this.userAgent,
                cookie: this.cookie,
                proxy: this.proxy,
                extraWait: this.extraWait,
                loginUrl: this.loginUrl,
                loginForm: this.loginForm,
                loginCredentials: this.loginCredentials,
                maxFileSize: this.maxFileSize,
                timeout: this.timeout
            });
        }
        return this._render;
    }

    async fetchPage(url, options = {}) {
        const mode = options.mode || this.mode;

        if (mode === 'static') {
            return this._static.fetchPage(url);
        }

        if (mode === 'render') {
            const engine = await this._getRenderEngine();
            const { html, capture } = await engine.fetchPage(url, options);
            return { html, capture, engine: 'render' };
        }

        // auto
        const needsRender = await AnyDownloadEngine.needsRender(url, this.userAgent);
        if (!needsRender) {
            try {
                return await this._static.fetchPage(url);
            } catch {
                // fallback to render if static fetch fails
            }
        }

        const engine = await this._getRenderEngine();
        const { html, capture } = await engine.fetchPage(url, options);
        return { html, capture, engine: 'render' };
    }

    async close() {
        if (this._render) {
            await this._render.close();
            this._render = null;
        }
        await this._static.close();
    }
}

module.exports = AnyDownloadEngine;
