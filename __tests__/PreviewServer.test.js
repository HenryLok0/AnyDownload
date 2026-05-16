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

    test('/learn maps to learn/index.html before SPA fallback', async () => {
        await fs.ensureDir(path.join(rootDir, 'learn'));
        await fs.writeFile(
            path.join(rootDir, 'learn', 'index.html'),
            '<html><body>Learn</body></html>'
        );

        server = new PreviewServer(rootDir, { spaFallback: true });
        const baseUrl = await server.start();

        const htmlLearn = await fetch(`${baseUrl}learn`).then(r => r.text());
        expect(htmlLearn).toContain('Learn');

        const htmlSlash = await fetch(`${baseUrl}learn/`).then(r => r.text());
        expect(htmlSlash).toContain('Learn');

        /* No folder: still SPA */
        const htmlUnknown = await fetch(baseUrl + 'no-such/route').then(r => r.text());
        expect(htmlUnknown).toContain('Home');
    });

    test('nested URL /React/_next/static/… serves site-root _next (Next-like bundles)', async () => {
        await fs.ensureDir(path.join(rootDir, '_next', 'static'));
        await fs.writeFile(
            path.join(rootDir, '_next', 'static', 'site.css'),
            'body{color:red}'
        );
        await fs.ensureDir(path.join(rootDir, 'React'));
        await fs.writeFile(
            path.join(rootDir, 'React', 'index.html'),
            '<html><body>Nested</body></html>'
        );

        server = new PreviewServer(rootDir);
        const baseUrl = await server.start();

        const direct = await fetch(`${baseUrl}_next/static/site.css`).then(r => r.text());
        expect(direct).toContain('red');

        const nestedWrong = `${baseUrl}React/_next/static/site.css`;
        const nested = await fetch(nestedWrong).then(r => r.text());
        expect(nested).toContain('red');
    });

    test('nested …/assets/… serves site-root assets (Vite-style)', async () => {
        await fs.ensureDir(path.join(rootDir, 'vitepage'));
        await fs.writeFile(
            path.join(rootDir, 'vitepage', 'index.html'),
            '<html><body>V</body></html>'
        );

        server = new PreviewServer(rootDir);
        const baseUrl = await server.start();

        const nested = await fetch(`${baseUrl}vitepage/assets/app.js`).then(r => r.text());
        expect(nested).toContain('ok');
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
