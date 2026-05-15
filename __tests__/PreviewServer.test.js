const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const { PreviewServer, resolveSiteRoot, startPreview } = require('../src/server/PreviewServer');

describe('PreviewServer', () => {
    const rootDir = path.join(__dirname, '..', 'test-output', 'preview-server');
    let server;

    beforeEach(async () => {
        await fs.ensureDir(rootDir);
        await fs.writeFile(path.join(rootDir, 'index.html'), '<html><body>Home</body></html>');
        await fs.ensureDir(path.join(rootDir, 'assets'));
        await fs.writeFile(path.join(rootDir, 'assets', 'app.js'), 'console.log("ok");');
    });

    afterEach(async () => {
        if (server) await server.stop();
        await fs.remove(rootDir).catch(() => {});
    });

    test('serves static files with correct MIME', async () => {
        server = new PreviewServer(rootDir);
        const baseUrl = await server.start();

        const html = await fetch(baseUrl).then(r => r.text());
        expect(html).toContain('Home');

        const js = await fetch(baseUrl + 'assets/app.js').then(r => r.text());
        expect(js).toContain('ok');
    });

    test('SPA fallback returns index.html for unknown routes', async () => {
        server = new PreviewServer(rootDir, { spaFallback: true });
        const baseUrl = await server.start();

        const html = await fetch(baseUrl + 'some/client/route').then(r => r.text());
        expect(html).toContain('Home');
    });

    test('redirects /index.html to /', async () => {
        server = new PreviewServer(rootDir);
        const baseUrl = await server.start();

        const res = await fetch(baseUrl + 'index.html', { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
    });

    test('resolveSiteRoot picks single child folder with index.html', async () => {
        const parent = path.join(rootDir, 'parent');
        const child = path.join(parent, 'example.com');
        await fs.ensureDir(child);
        await fs.writeFile(path.join(child, 'index.html'), '<html><body>Child</body></html>');

        const resolved = await resolveSiteRoot(parent);
        expect(resolved).toBe(child);
    });

    test('startPreview resolves parent folder to site root', async () => {
        const parent = path.join(rootDir, 'serve-parent');
        const child = path.join(parent, 'example.com');
        await fs.ensureDir(child);
        await fs.writeFile(path.join(child, 'index.html'), '<html><body>Served</body></html>');

        const { server: previewServer, url } = await startPreview(parent, { open: false });
        server = previewServer;
        const html = await fetch(url).then(r => r.text());
        expect(html).toContain('Served');
        expect(url).toMatch(/\/$/);
    });
});
