const path = require('path');
const fs = require('fs-extra');
const { SiteDownloader } = require('../src/downloader');
const NetworkCapture = require('../src/engine/NetworkCapture');

jest.mock('../src/engine', () => {
    const NetworkCapture = require('../src/engine/NetworkCapture');
    class MockAnyDownloadEngine {
        constructor() {}
        async fetchPage(url) {
            const capture = new NetworkCapture();
            capture.add({
                url: 'https://spa.test/assets/app.js',
                status: 200,
                contentType: 'application/javascript',
                body: Buffer.from('window.__APP__ = true;')
            });
            capture.add({
                url: 'https://spa.test/assets/app.css',
                status: 200,
                contentType: 'text/css',
                body: Buffer.from('body { margin: 0; }')
            });
            return {
                html: `<html><head>
                    <link rel="stylesheet" href="/assets/app.css">
                    <script type="module" src="/assets/app.js"></script>
                </head><body>SPA</body></html>`,
                capture,
                cookies: [{ name: 'sid', value: 'abc123' }],
                engine: 'render'
            };
        }
        async close() {}
        static htmlNeedsRender() { return true; }
    }
    return { AnyDownloadEngine: MockAnyDownloadEngine };
});

describe('SiteDownloader render capture path', () => {
    const outputDir = path.join(__dirname, '..', 'test-output', 'render');

    beforeEach(async () => {
        await fs.ensureDir(outputDir);
    });

    afterEach(async () => {
        await fs.remove(outputDir).catch(() => {});
    });

    test('writes captured css and js without HTTP re-download', async () => {
        const downloader = new SiteDownloader({
            outputDir,
            mode: 'render',
            verbose: false
        });

        const result = await downloader.downloadWebsite('https://spa.test/');
        const siteDir = path.join(outputDir, 'spa.test');

        expect(result.successCount).toBeGreaterThanOrEqual(2);
        expect(await fs.pathExists(path.join(siteDir, 'assets', 'app.js'))).toBe(true);
        expect(await fs.pathExists(path.join(siteDir, 'assets', 'app.css'))).toBe(true);

        const js = await fs.readFile(path.join(siteDir, 'assets', 'app.js'), 'utf8');
        expect(js).toContain('__APP__');

        const indexHtml = await fs.readFile(path.join(siteDir, 'index.html'), 'utf8');
        expect(indexHtml).toContain('<base href="./">');
        expect(indexHtml).toContain('src="assets/app.js"');
    });
});
