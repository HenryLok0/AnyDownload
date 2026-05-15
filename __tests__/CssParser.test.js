const { extractUrls, rewriteCss } = require('../src/downloader/parsers/CssParser');
const PathMapper = require('../src/downloader/storage/PathMapper');

describe('CssParser', () => {
    const base = 'https://example.com/css/main.css';

    test('extracts url() references', () => {
        const css = 'body { background: url(../img/bg.png); } .x { background: url("fonts/a.woff2"); }';
        const urls = extractUrls(css, base);
        expect(urls).toContain('https://example.com/img/bg.png');
        expect(urls).toContain('https://example.com/css/fonts/a.woff2');
    });

    test('extracts @import', () => {
        const css = '@import url("theme.css"); @import "reset.css";';
        const urls = extractUrls(css, base);
        expect(urls.some(u => u.includes('theme.css'))).toBe(true);
        expect(urls.some(u => u.includes('reset.css'))).toBe(true);
    });

    test('rewrites css urls to local paths', () => {
        const css = 'body { background: url(../img/bg.png); }';
        const mapper = new PathMapper('https://example.com/page.html');
        const out = rewriteCss(css, base, mapper);
        expect(out).toContain('url("img/bg.png")');
    });
});
