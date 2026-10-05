const {
    absolutizeCssUrls,
    assetFileName,
    buildOfflineDocument,
    collectHtmlAssetUrls,
    isVisualAsset,
    rewriteCssUrls,
    rewriteHtmlAssets,
    stripActiveContent
} = require('../src/capture/fragmentBundle');
const { buildShotPlan } = require('../src/capture/FragmentSession');
const { pickerLabels } = require('../src/capture/pickerSource');

describe('fragment bundle', () => {
    test('rewrites copied image urls and leaves real links alone', () => {
        const html = '<section class="card"><img src="https://cdn.example/a.png" srcset="https://cdn.example/a.png 1x, https://cdn.example/b.png 2x"><a href="https://example.com/about">A</a></section>';
        const map = new Map([
            ['https://cdn.example/a.png', 'assets/0.png'],
            ['https://cdn.example/b.png', 'assets/1.png']
        ]);
        const out = rewriteHtmlAssets(html, map);
        expect(out).toContain('src="assets/0.png"');
        expect(out).toContain('assets/1.png 2x');
        expect(out).toContain('https://example.com/about');
        expect(out).toContain('class="card"');
        expect(collectHtmlAssetUrls(html)).toEqual([
            'https://cdn.example/a.png',
            'https://cdn.example/a.png',
            'https://cdn.example/b.png'
        ]);
    });

    test('rewrites css urls that were made absolute', () => {
        const css = absolutizeCssUrls(
            '@font-face{src:url("/font.woff2")} .card:hover{background:url("/bg.png")}',
            'https://example.com/card.css'
        );
        const map = new Map([
            ['https://example.com/font.woff2', 'assets/0.woff2'],
            ['https://example.com/bg.png', 'assets/1.png']
        ]);
        const out = rewriteCssUrls(css, map);
        expect(out).toContain('url("assets/0.woff2")');
        expect(out).toContain('url("assets/1.png")');
        expect(out).toContain(':hover');
    });

    test('builds a document that points at the copied stylesheet', () => {
        const html = buildOfflineDocument({
            fragmentHtml: '<section id="hero" onclick="steal()">Hello</section><iframe src="https://evil.example"></iframe><p>© Ada</p>',
            bodyStyle: 'background-color:rgb(0,0,0)',
            bodyClass: 'dark',
            title: 'section#hero',
            sourceUrl: 'https://example.com/hero'
        });
        expect(html).toContain('href="fragment.css"');
        expect(html).toContain('<section id="hero">Hello</section>');
        expect(html).toContain('class="dark"');
        expect(html).not.toContain('<script');
        expect(html).toContain('id="anydownload-notice"');
        expect(html).toContain('https://example.com/hero');
        expect(html).toContain('© Ada');
        expect(html).not.toMatch(/onclick|javascript:|<iframe/i);
    });

    test('strips event handlers, javascript urls, and frames', () => {
        const out = stripActiveContent(
            '<div onclick="alert(1)"><a href="javascript:alert(1)">x</a><iframe src="https://evil.example"></iframe><p>© Ada</p></div>'
        );
        expect(out).not.toMatch(/onclick|javascript:|<iframe/i);
        expect(out).toContain('© Ada');
        expect(out).toContain('>x<');
    });

    test('names visual assets and ignores other responses', () => {
        expect(isVisualAsset('font/woff2', 'https://example.com/font.woff2')).toBe(true);
        expect(isVisualAsset('text/html', 'https://example.com/about')).toBe(false);
        expect(assetFileName('https://cdn.example/a.png', 'image/png', 3)).toMatch(/^3-[a-f0-9]{10}\.png$/);
    });

    test('plans hover, focus, and three widths', () => {
        expect(buildShotPlan().map((shot) => shot.file)).toEqual([
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
        expect(buildShotPlan({ captureStates: false, captureViewports: false })).toEqual([
            expect.objectContaining({ file: 'states/desktop-default.png' })
        ]);
    });

    test('picker labels stay local to the chosen language', () => {
        expect(pickerLabels('zh-TW').parent).toBe('上一層');
        expect(pickerLabels('en').export).toBe('Export');
    });
});
