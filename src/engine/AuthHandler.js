class AuthHandler {
    constructor(options = {}) {
        this.loginUrl = options.loginUrl || null;
        this.loginForm = options.loginForm || null;
        this.loginCredentials = options.loginCredentials || null;
    }

    get enabled() {
        return Boolean(this.loginUrl && this.loginForm && this.loginCredentials);
    }

    async login(engine, page) {
        if (!this.enabled) return;

        await engine.goto(page, this.loginUrl, { waitUntil: 'networkidle', timeout: 60000 });

        for (const [selector, credentialKey] of Object.entries(this.loginForm)) {
            const value = this.loginCredentials[credentialKey];
            if (value != null) {
                await engine.fill(page, selector, String(value));
            }
        }

        await engine.click(page, 'button[type="submit"], input[type="submit"], [type="submit"]');
        await engine.waitForNavigation(page, { timeout: 30000 });

        const currentUrl = await engine.getUrl(page);
        const content = await engine.getContent(page);

        if (currentUrl === this.loginUrl ||
            /error|invalid|incorrect/i.test(content)) {
            throw new Error('invalid_credentials');
        }
    }
}

module.exports = AuthHandler;
