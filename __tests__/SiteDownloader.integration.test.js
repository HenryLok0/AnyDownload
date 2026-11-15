const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const { SiteDownloader } = require('../src/downloader');

const FIXTURE_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'site');

function startFixtureServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            if (req.url === '/partial.html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<!doctype html><title>Updated site</title><img src="/missing.png">');
                return;
            }
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

        const meta = await fs.readJson(path.join(siteDir, 'anydownload.json'));
        expect(meta.entryPath).toBe('/');
        expect(await fs.pathExists(path.join(siteDir, 'css', 'main.css'))).toBe(true);
        expect(await fs.pathExists(path.join(siteDir, 'img', 'logo.png'))).toBe(true);
    }, 30000);

    test('keeps the existing copy and returns the new timestamped site directory', async () => {
        const options = {
            outputDir: path.join(outputDir, 'timestamp'),
            mode: 'static',
            storageRule: 'timestamp',
            delay: 1
        };
        const first = await new SiteDownloader(options).downloadWebsite(baseUrl + '/');
        const marker = path.join(first.outputDir, 'old-copy.txt');
        await fs.writeFile(marker, 'first snapshot');

        const second = await new SiteDownloader(options).downloadWebsite(baseUrl + '/');
        const suffix = path.basename(second.outputDir).slice(path.basename(first.outputDir).length);

        expect(suffix).toMatch(/^_\d{10}$/);
        expect(path.dirname(second.outputDir)).toBe(options.outputDir);
        expect(await fs.readFile(marker, 'utf8')).toBe('first snapshot');
        expect(await fs.pathExists(path.join(second.outputDir, 'index.html'))).toBe(true);
        expect(await fs.pathExists(path.join(second.outputDir, 'img', 'logo.png'))).toBe(true);
    }, 30000);

    test('overwrites the same site folder with fresh files after a successful download', async () => {
        const options = {
            outputDir: path.join(outputDir, 'overwrite'),
            mode: 'static',
            storageRule: 'overwrite',
            delay: 1
        };
        const first = await new SiteDownloader(options).downloadWebsite(baseUrl + '/');
        const obsolete = path.join(first.outputDir, 'old-copy.txt');
        const cachedCss = path.join(first.outputDir, 'css', 'main.css');
        await fs.writeFile(obsolete, 'previous snapshot');
        await fs.writeFile(cachedCss, 'stale asset');

        const second = await new SiteDownloader(options).downloadWebsite(baseUrl + '/');

        expect(second.outputDir).toBe(first.outputDir);
        expect(await fs.pathExists(obsolete)).toBe(false);
        expect(await fs.readFile(cachedCss, 'utf8')).not.toContain('stale asset');
        expect(await fs.readdir(options.outputDir)).toEqual([path.basename(second.outputDir)]);
    }, 30000);

    test('keeps the previous copy if a replacement download fails', async () => {
        const options = {
            outputDir: path.join(outputDir, 'failed-overwrite'),
            mode: 'static',
            storageRule: 'overwrite',
            delay: 1
        };
        const first = await new SiteDownloader(options).downloadWebsite(baseUrl + '/');
        const marker = path.join(first.outputDir, 'old-copy.txt');
        await fs.writeFile(marker, 'first snapshot');

        await expect(new SiteDownloader(options).downloadWebsite(baseUrl + '/missing.html')).rejects.toThrow('404');
        await expect(new SiteDownloader(options).downloadWebsite(baseUrl + '/partial.html')).rejects.toMatchObject({
            code: 'ARCHIVE_DOWNLOAD_INCOMPLETE',
            count: 1
        });
        expect(await fs.readFile(marker, 'utf8')).toBe('first snapshot');
        expect(await fs.readdir(options.outputDir)).toEqual([path.basename(first.outputDir)]);
    }, 30000);
});
