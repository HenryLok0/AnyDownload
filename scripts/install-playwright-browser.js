#!/usr/bin/env node
/**
 * Postinstall: download Playwright Chromium for render mode.
 * Skip in CI or when PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1.
 */
const { installPlaywrightChromium } = require('../src/engine/BrowserInstaller');

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' || process.env.CI) {
    console.log('[AnyDownload] Skipping Playwright browser download (CI or SKIP set).');
    process.exit(0);
}

try {
    require.resolve('playwright');
} catch {
    console.log('[AnyDownload] Playwright not installed; skip browser download.');
    process.exit(0);
}

console.log('[AnyDownload] Installing Playwright Chromium (~150MB, one-time)...');
try {
    installPlaywrightChromium();
} catch (err) {
    console.warn('[AnyDownload] Playwright browser install failed. Reinstall with: npm install -g anydownload');
    console.warn(err.message || err);
    process.exit(0);
}
