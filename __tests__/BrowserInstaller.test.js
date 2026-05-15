const { isPeerInstalled, missingPeerError, INSTALL_HINT } = require('../src/engine/BrowserInstaller');

describe('BrowserInstaller', () => {
    test('isPeerInstalled detects playwright when bundled', () => {
        expect(isPeerInstalled('playwright')).toBe(true);
    });

    test('missingPeerError for puppeteer mentions optional install', () => {
        const err = missingPeerError('puppeteer');
        expect(err.message).toContain(INSTALL_HINT.puppeteer);
    });
});
