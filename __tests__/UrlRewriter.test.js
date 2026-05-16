const UrlRewriter = require('../src/downloader/rewrite/UrlRewriter');
const PathMapper = require('../src/downloader/storage/PathMapper');

describe('UrlRewriter', () => {
    test('root page: scripts and preload keep site-root-relative shape', () => {
        const pageUrl = 'https://example.com/';
        const pathMapper = new PathMapper(pageUrl);
        const rewriter = new UrlRewriter(pageUrl, pathMapper);
        const html = `<html><head>
            <link rel="modulepreload" href="/assets/chunk.js" crossorigin>
            <script type="module" src="/assets/index.js" crossorigin integrity="sha384-x"></script>
        </head><body></body></html>`;
        const out = rewriter.rewriteHtml(html);
        expect(out).toContain('href="./assets/chunk.js"');
        expect(out).toContain('src="./assets/index.js"');
        expect(out).not.toContain('crossorigin');
        expect(out).not.toContain('integrity');
    });

    test('nested mirror page reaches _next with correct relative prefix', () => {
        const pageUrl = 'https://example.com/learn';
        const pathMapper = new PathMapper(pageUrl);
        const rewriter = new UrlRewriter(pageUrl, pathMapper, 'learn/index.html');
        const html = `<html><head>
            <link rel="modulepreload" href="/_next/static/chunk.js">
            <script type="module" src="/assets/index.js"></script>
        </head><body>
            <a href="/reference/react">Ref</a>
            <a href="https://github.com/facebook/react">GH</a>
        </body></html>`;
        const out = rewriter.rewriteHtml(html);
        expect(out).toContain('href="../_next/static/chunk.js"');
        expect(out).toContain('src="../assets/index.js"');
        expect(out).toContain('href="../reference/react/"');
        expect(out).toContain('href="https://github.com/facebook/react"');
    });

    test('does not inject base href', () => {
        const pageUrl = 'https://example.com/';
        const pathMapper = new PathMapper(pageUrl);
        const rewriter = new UrlRewriter(pageUrl, pathMapper);
        const html = '<html><head></head><body></body></html>';
        const out = rewriter.rewriteHtml(html);
        expect(out).not.toMatch(/<base\s/i);
    });
});
