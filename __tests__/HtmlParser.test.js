const { extractFromHtml } = require('../src/downloader/parsers/HtmlParser');

describe('HtmlParser', () => {
    test('extracts module scripts and preload links', () => {
        const html = `
            <html><head>
            <link rel="preload" as="style" href="/assets/app.css">
            <script type="module" src="/assets/app.js"></script>
            </head><body></body></html>`;
        const { resources } = extractFromHtml(html, 'https://example.com/');
        expect(resources.some(u => u.includes('app.css'))).toBe(true);
        expect(resources.some(u => u.includes('app.js'))).toBe(true);
    });

    test('extracts stylesheets and images', () => {
        const html = `
            <html><head>
            <link rel="stylesheet" href="/css/site.css">
            </head><body>
            <img src="/img/logo.png" srcset="/img/logo@2x.png 2x">
            <div style="background:url(/img/bg.jpg)"></div>
            </body></html>`;
        const { resources } = extractFromHtml(html, 'https://example.com/');
        expect(resources.some(u => u.includes('site.css'))).toBe(true);
        expect(resources.some(u => u.includes('logo.png'))).toBe(true);
        expect(resources.some(u => u.includes('bg.jpg'))).toBe(true);
    });
});
