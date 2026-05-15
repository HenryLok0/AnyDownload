const UrlRewriter = require('../src/downloader/rewrite/UrlRewriter');
const PathMapper = require('../src/downloader/storage/PathMapper');

describe('UrlRewriter', () => {
    const pageUrl = 'https://example.com/';
    const pathMapper = new PathMapper(pageUrl);
    const rewriter = new UrlRewriter(pageUrl, pathMapper);

    test('injects base href when missing', () => {
        const html = '<html><head></head><body></body></html>';
        const out = rewriter.rewriteHtml(html);
        expect(out).toContain('<base href="./">');
    });

    test('rewrites module script and modulepreload to relative paths', () => {
        const html = `<html><head>
            <link rel="modulepreload" href="/assets/chunk.js" crossorigin>
            <script type="module" src="/assets/index.js" crossorigin integrity="sha384-x"></script>
        </head><body></body></html>`;
        const out = rewriter.rewriteHtml(html);
        expect(out).toContain('href="assets/chunk.js"');
        expect(out).toContain('src="assets/index.js"');
        expect(out).not.toContain('crossorigin');
        expect(out).not.toContain('integrity');
    });
});
