#!/usr/bin/env node
/**
 * Postinstall: download Playwright Chromium for render mode.
 * Skip in CI or when PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1.
 */
const { execSync } = require('child_process');

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
    execSync('npx playwright install chromium', {
        stdio: 'inherit',
        env: process.env
    });
} catch (err) {
    console.warn('[AnyDownload] Playwright browser install failed. Run: npx playwright install chromium');
    console.warn(err.message || err);
    process.exit(0);
}
