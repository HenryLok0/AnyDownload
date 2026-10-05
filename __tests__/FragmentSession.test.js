const fs = require('fs');
const fse = require('fs-extra');
const http = require('http');
const os = require('os');
const path = require('path');
const { FragmentSession } = require('../src/capture/FragmentSession');
const { installPicker, pickerLabels } = require('../src/capture/pickerSource');

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/card.css">
</head>
<body>
  <section class="card" id="hero" tabindex="0">
    <img src="/pixel.png" alt="dot">
    <h1>Hello capture</h1>
    <script>window.secret = 1</script>
  </section>
</body>
</html>`;

const CSS = `@font-face{font-family:Fake;src:url("/font.woff2")}
.card{width:220px;padding:16px;background:#fff;color:#111}
.card:hover{background:#123456;color:#fff}
.card:focus{outline:4px solid #ff0000}
@media (max-width:600px){.card{width:120px}}`;

function chromiumReady() {
    try {
        const { chromium } = require('playwright');
        return fs.existsSync(chromium.executablePath());
    } catch {
        return false;
    }
}

function startFixture() {
    const server = http.createServer((req, res) => {
        const pathname = (req.url || '/').split('?')[0];
        if (pathname === '/pixel.png') {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(PNG);
            return;
        }
        if (pathname === '/font.woff2') {
            res.writeHead(200, { 'Content-Type': 'font/woff2' });
            res.end(Buffer.from('wOFF2fake'));
            return;
        }
        if (pathname === '/card.css') {
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
            res.end(CSS);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGE);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                server,
                url: `http://127.0.0.1:${server.address().port}/`
            });
        });
    });
}

const ready = chromiumReady();
const describeCapture = ready ? describe : describe.skip;

describeCapture('local fragment capture', () => {
    jest.setTimeout(120000);
    let server;
    let url;
    let outputDir;

    beforeAll(async () => {
        const started = await startFixture();
        server = started.server;
        url = started.url;
        outputDir = await fse.mkdtemp(path.join(os.tmpdir(), 'anydownload-pick-'));
    });

    afterAll(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));
        if (outputDir) await fse.remove(outputDir);
    });

    test('picker parent moves up the tree', async () => {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            await page.exposeBinding('__anydownloadSignal', async () => {});
            await page.addInitScript(installPicker, pickerLabels('zh-TW'));
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            const result = await page.evaluate(() => {
                document.querySelector('#hero h1').click();
                const before = window.__anydownloadSelection.tagName;
                const parentBtn = document.getElementById('anydownload-picker-host').shadowRoot.querySelector('button');
                parentBtn.click();
                return {
                    before,
                    afterId: window.__anydownloadSelection.id,
                    parentLabel: parentBtn.textContent
                };
            });
            expect(result.before).toBe('H1');
            expect(result.afterId).toBe('hero');
            expect(result.parentLabel).toBe('上一層');
        } finally {
            await browser.close();
        }
    });

    test('copies the block, its css, image, and font, plus state screenshots', async () => {
        const session = new FragmentSession({
            outputDir,
            headless: true,
            selector: '#hero',
            extraWait: 0,
            captureStates: true,
            captureViewports: true
        });
        const result = await session.run(url);
        const html = await fse.readFile(path.join(result.outputDir, 'index.html'), 'utf8');
        const css = await fse.readFile(path.join(result.outputDir, 'fragment.css'), 'utf8');
        const meta = await fse.readJson(path.join(result.outputDir, 'meta.json'));
        const assets = await fse.readdir(path.join(result.outputDir, 'assets'));

        expect(html).toContain('Hello capture');
        expect(html).toContain('assets/');
        expect(html).not.toContain('window.secret');
        expect(css).toContain(':hover');
        expect(css).toContain('@media');
        expect(css).toMatch(/url\("assets\/.+\.woff2"\)/);
        expect(assets.some((name) => name.endsWith('.png'))).toBe(true);
        expect(assets.some((name) => name.endsWith('.woff2'))).toBe(true);
        expect(meta.transport).toBe('local');
        expect(meta.screenshotErrors).toEqual([]);
        expect(meta.screenshots.map((shot) => shot.file)).toEqual([
            'states/desktop-default.png',
            'states/desktop-hover.png',
            'states/desktop-focus.png',
            'states/tablet-default.png',
            'states/tablet-hover.png',
            'states/tablet-focus.png',
            'states/mobile-default.png',
            'states/mobile-hover.png',
            'states/mobile-focus.png'
        ]);
        for (const shot of meta.screenshots) {
            const bytes = await fse.readFile(path.join(result.outputDir, shot.file));
            expect(bytes.length).toBeGreaterThan(50);
        }
    });
});
