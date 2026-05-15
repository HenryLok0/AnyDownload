const Crawler = require('../src/downloader/Crawler');
const { sameHostname, sameOrigin } = require('../src/utils/url');

describe('Crawler', () => {
    test('collectPageLinks follows same hostname only, not subdomains', () => {
        const crawler = new Crawler();
        const html = `
            <a href="https://example.com/about">about</a>
            <a href="https://easeparkhk.example.com/">subdomain</a>
            <a href="https://privai.example.com/app">another</a>
        `;
        const links = crawler.collectPageLinks(html, 'https://example.com/');
        expect(links.some(l => l.includes('example.com/about'))).toBe(true);
        expect(links.some(l => l.includes('easeparkhk'))).toBe(false);
        expect(links.some(l => l.includes('privai'))).toBe(false);
    });
});

describe('url.sameHostname vs sameOrigin', () => {
    test('sameOrigin treats subdomains as same site', () => {
        expect(sameOrigin('https://easeparkhk.example.com/', 'https://example.com/')).toBe(true);
    });

    test('sameHostname requires exact hostname match', () => {
        expect(sameHostname('https://easeparkhk.example.com/', 'https://example.com/')).toBe(false);
        expect(sameHostname('https://example.com/about', 'https://example.com/')).toBe(true);
    });
});
