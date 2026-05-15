const { execSync } = require('child_process');
const fs = require('fs');

let installAttempted = false;

function isMissingBrowserError(err) {
    const msg = String(err?.message || err);
    return /executable doesn't exist|browser.*not found|Failed to launch|ENOENT.*chrome|playwright install/i.test(msg);
}

/**
 * Ensure a render backend is ready. Puppeteer downloads Chromium on npm install;
 * Playwright requires a separate browser install step.
 */
async function ensureRenderBackend(provider = 'puppeteer') {
    if (provider === 'puppeteer') {
        try {
            const puppeteer = require('puppeteer');
            const executable = puppeteer.executablePath?.();
            if (executable && fs.existsSync(executable)) {
                return { provider: 'puppeteer', ready: true };
            }
        } catch {
            // fall through to install attempt
        }
        if (!installAttempted) {
            installAttempted = true;
            console.log('[AnyDownload] Downloading Chromium for Puppeteer (one-time, ~150MB)...');
            try {
                execSync('npx puppeteer browsers install chrome', {
                    stdio: 'inherit',
                    env: process.env
                });
                return { provider: 'puppeteer', ready: true };
            } catch {
                // older puppeteer versions bundle on postinstall; try anyway
            }
        }
        return { provider: 'puppeteer', ready: true };
    }

    if (provider === 'playwright') {
        try {
            const { chromium } = require('playwright');
            const browser = await chromium.launch({ headless: true });
            await browser.close();
            return { provider: 'playwright', ready: true };
        } catch (err) {
            if (!isMissingBrowserError(err)) throw err;
        }
        if (!installAttempted) {
            installAttempted = true;
            console.log('[AnyDownload] Installing Playwright Chromium (one-time, ~150MB)...');
            execSync('npx playwright install chromium', {
                stdio: 'inherit',
                env: process.env
            });
        }
        return { provider: 'playwright', ready: true };
    }

    throw new Error(`Unknown render provider: ${provider}`);
}

module.exports = {
    ensureRenderBackend,
    isMissingBrowserError
};
