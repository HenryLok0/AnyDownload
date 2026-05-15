const UrlRewriter = require('../src/downloader/rewrite/UrlRewriter');
const PathMapper = require('../src/downloader/storage/PathMapper');

describe('UrlRewriter', () => {
    test('rewrites same-origin asset links in html', () => {
        const pageUrl = 'https://example.com/page.html';
        const rewriter = new UrlRewriter(pageUrl, new PathMapper(pageUrl));
        const html = '<link rel="stylesheet" href="/css/site.css"><img src="/img/a.png">';
        const out = rewriter.rewriteHtml(html);
        expect(out).toContain('href="css/site.css"');
        expect(out).toContain('src="img/a.png"');
    });
});
