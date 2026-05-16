const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const { SiteDownloader } = require('../src/downloader');

const FIXTURE_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'site');

function startFixtureServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let filePath = path.join(FIXTURE_DIR, req.url === '/' ? 'index.html' : req.url.replace(/^\//, ''));
            filePath = filePath.split('?')[0];
            fs.readFile(filePath)
                .then((data) => {
                    const ext = path.extname(filePath);
                    const types = {
                        '.html': 'text/html',
                        '.css': 'text/css',
                        '.png': 'image/png'
                    };
                    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
                    res.end(data);
                })
                .catch(() => {
                    res.writeHead(404);
                    res.end('Not found');
                });
        });
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
        });
    });
}

describe('SiteDownloader integration', () => {
    let server;
    let baseUrl;
    /** Isolated subfolder so afterAll does not delete other suites' test-output/* dirs when Jest runs workers in parallel. */
    const outputDir = path.join(__dirname, '..', 'test-output', 'sitedownloader-integration');

    beforeAll(async () => {
        const started = await startFixtureServer();
        server = started.server;
        baseUrl = started.baseUrl;
        await fs.ensureDir(outputDir);
    });

    afterAll(async () => {
        if (server) server.close();
        await fs.remove(outputDir).catch(() => {});
    });

    test('downloads html, css, and images from fixture site', async () => {
        const downloader = new SiteDownloader({
            outputDir,
            dynamic: false,
            autoDynamic: false,
            recursive: false
        });

        const result = await downloader.downloadWebsite(baseUrl + '/');
        expect(result.successCount).toBeGreaterThan(0);

        const hostDir = new URL(baseUrl).host.replace(/[:\/\\]/g, '_');
        const siteDir = path.join(outputDir, hostDir);

        expect(await fs.pathExists(path.join(siteDir, 'css', 'main.css'))).toBe(true);
        expect(await fs.pathExists(path.join(siteDir, 'img', 'logo.png'))).toBe(true);
    }, 30000);
});
