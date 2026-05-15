const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const PathDiscovery = require('../src/discovery/PathDiscovery');

jest.mock('axios');

describe('PathDiscovery', () => {
    test('formatTxt includes header and paths', () => {
        const results = {
            startUrl: 'https://example.com/',
            total: 2,
            paths: [
                { url: 'https://example.com/', sources: ['seed'] },
                { url: 'https://example.com/about', sources: ['crawl', 'html'] }
            ],
            bySource: { seed: 1, crawl: 1, html: 1 }
        };
        const txt = PathDiscovery.formatTxt(results);
        expect(txt).toContain('https://example.com/');
        expect(txt).toContain('[crawl,html]');
        expect(txt).toContain('Total: 2');
    });

    test('writeTxt creates file on disk', async () => {
        const out = path.join(__dirname, '..', 'test-output', 'paths-txt');
        const file = path.join(out, 'paths.txt');
        await fs.remove(out).catch(() => {});
        await PathDiscovery.writeTxt({
            startUrl: 'https://example.com/',
            total: 1,
            paths: [{ url: 'https://example.com/', sources: ['seed'] }],
            bySource: { seed: 1 }
        }, file);
        const content = await fs.readFile(file, 'utf8');
        expect(content).toContain('example.com');
        await fs.remove(out);
    });

    test('discover merges sitemap and filters hostname', async () => {
        axios.get.mockImplementation((url) => {
            if (String(url).includes('sitemap.xml')) {
                return Promise.resolve({
                    status: 200,
                    data: '<urlset><loc>https://example.com/about</loc><loc>https://other.com/hidden</loc></urlset>'
                });
            }
            if (String(url).includes('robots.txt')) {
                return Promise.resolve({
                    status: 200,
                    data: 'Sitemap: https://example.com/sitemap.xml\nDisallow: /private'
                });
            }
            if (String(url).includes('example.com/') && !String(url).includes('.js')) {
                return Promise.resolve({
                    status: 200,
                    data: '<html><a href="/contact">contact</a></html>'
                });
            }
            return Promise.reject(new Error('not found'));
        });
        axios.head.mockImplementation(() => Promise.resolve({ status: 404 }));

        const discovery = new PathDiscovery({ maxDepth: 1, delay: 0, useRender: false });
        const results = await discovery.discover('https://example.com/');

        const urls = results.paths.map(p => p.url);
        expect(urls.some(u => u.includes('example.com/about'))).toBe(true);
        expect(urls.some(u => u.includes('other.com'))).toBe(false);
    }, 15000);

    test('_fetchWayback adds historical URLs when pathDeep', async () => {
        axios.get.mockResolvedValue({
            status: 200,
            data: [
                ['original'],
                ['https://example.com/old-page'],
                ['https://example.com/legacy']
            ]
        });

        const discovery = new PathDiscovery({ pathDeep: true, useRender: false });
        await discovery._fetchWayback('https://example.com/');
        const results = discovery.getResults('https://example.com/');

        const urls = results.paths.map(p => p.url);
        expect(urls.some(u => u.includes('old-page'))).toBe(true);
        expect(results.bySource.wayback).toBe(2);
    });
});
