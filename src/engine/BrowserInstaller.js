const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const INSTALL_HINT = {
    puppeteer: 'npm install puppeteer',
    playwright: 'npm install -g anydownload'
};

function tryRequire(moduleName) {
    try {
        return require(moduleName);
    } catch {
        return null;
    }
}

function isPeerInstalled(provider) {
    if (provider === 'puppeteer') return !!tryRequire('puppeteer');
    if (provider === 'playwright') return !!tryRequire('playwright');
    return false;
}

function missingPeerError(provider) {
    if (provider === 'playwright') {
        return new Error(
            'Playwright is not available. Reinstall with: npm install -g anydownload'
        );
    }
    return new Error(
        `Render mode requires a browser package.\n` +
        `  Bundled: Playwright (default)\n` +
        `  Optional: ${INSTALL_HINT.puppeteer}\n` +
        `(You selected: ${provider}. Run: ${INSTALL_HINT[provider] || INSTALL_HINT.puppeteer})`
    );
}

/**
 * Install Chromium with the Playwright package shipped inside anydownload.
 * `npx playwright install` from the user's folder downloads a different Playwright.
 */
function nodeBinary() {
    if (process.versions && process.versions.electron) {
        return process.env.npm_node_execpath || 'node';
    }
    return process.execPath;
}

function installPlaywrightChromium() {
    let cli;
    try {
        cli = require.resolve('playwright/cli.js');
    } catch {
        throw new Error('Playwright is not installed. Reinstall with: npm install -g anydownload');
    }
    execFileSync(nodeBinary(), [cli, 'install', 'chromium'], {
        stdio: 'inherit',
        env: process.env,
        cwd: path.dirname(cli)
    });
}

function isMissingBrowserError(err) {
    const msg = String(err?.message || err);
    return /executable doesn't exist|browser.*not found|Failed to launch|ENOENT.*chrome|playwright install/i.test(msg);
}

async function ensureRenderBackend(provider = 'playwright') {
    const normalized = (provider || 'playwright').toLowerCase();

    if (normalized === 'playwright') {
        if (process.versions && process.versions.electron) {
            return { provider: 'playwright', ready: true };
        }
        
        const playwright = tryRequire('playwright');
        if (!playwright) throw missingPeerError('playwright');
        try {
            const browser = await playwright.chromium.launch({ headless: true });
            await browser.close();
        } catch (err) {
            if (isMissingBrowserError(err)) {
                console.log('[AnyDownload] Downloading Playwright Chromium...');
                try {
                    installPlaywrightChromium();
                    const browser = await playwright.chromium.launch({ headless: true });
                    await browser.close();
                } catch (installErr) {
                    throw new Error(
                        'Playwright browsers are missing. Reinstall with: npm install -g anydownload\n' +
                        (installErr.message || installErr)
                    );
                }
            } else {
                throw err;
            }
        }
        return { provider: 'playwright', ready: true };
    }

    if (normalized === 'puppeteer') {
        const puppeteer = tryRequire('puppeteer');
        if (!puppeteer) throw missingPeerError('puppeteer');
        const executable = puppeteer.executablePath?.();
        if (executable && !fs.existsSync(executable)) {
            throw new Error(
                'Puppeteer is installed but Chromium is missing. Run: npx puppeteer browsers install chrome'
            );
        }
        return { provider: 'puppeteer', ready: true };
    }

    throw new Error(`Unknown render provider: ${provider}`);
}

module.exports = {
    ensureRenderBackend,
    installPlaywrightChromium,
    isMissingBrowserError,
    isPeerInstalled,
    missingPeerError,
    INSTALL_HINT
};
