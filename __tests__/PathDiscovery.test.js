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
            const s = String(url);
            if (s.includes('sitemap.xml')) {
                return Promise.resolve({
                    status: 200,
                    data: '<urlset><loc>https://example.com/about</loc><loc>https://other.com/hidden</loc></urlset>'
                });
            }
            if (s.includes('robots.txt')) {
                return Promise.resolve({
                    status: 200,
                    data: 'Sitemap: https://example.com/sitemap.xml\nDisallow: /private'
                });
            }
            if (s.includes('manifest.json') || s.includes('site.webmanifest')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (/\/(sw\.js|service-worker|serviceworker|firebase-messaging)/i.test(s)) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('example.com/') && !s.includes('.js')) {
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

    test('path seeds file probes user segments with probe-seed source', async () => {
        const seedDir = path.join(__dirname, '..', 'test-output', 'path-discovery-seeds');
        const seedFile = path.join(seedDir, 'seeds.txt');
        await fs.ensureDir(seedDir);
        await fs.writeFile(seedFile, '# ignore\nalpha-secret-route\n');

        axios.get.mockImplementation((url) => {
            const s = String(url);
            if (s.includes('manifest.json') || s.includes('site.webmanifest')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('sitemap')) {
                return Promise.resolve({ status: 200, data: '<urlset></urlset>' });
            }
            if (s.includes('robots.txt')) {
                return Promise.resolve({ status: 200, data: '' });
            }
            if (s.includes('/sw.js') || s.includes('service-worker') || s.includes('serviceworker') || s.includes('firebase-messaging')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('example.com/') && !s.includes('alpha-secret')) {
                return Promise.resolve({ status: 200, data: '<html></html>' });
            }
            return Promise.resolve({ status: 404, data: '' });
        });
        axios.head.mockImplementation((u) => {
            if (String(u).includes('alpha-secret-route')) return Promise.resolve({ status: 200 });
            return Promise.resolve({ status: 404 });
        });

        const discovery = new PathDiscovery({
            maxDepth: 1,
            delay: 0,
            useRender: false,
            pathSeedsFile: seedFile
        });
        const results = await discovery.discover('https://example.com/');
        await fs.remove(seedDir).catch(() => {});

        const seeded = results.paths.find(p => p.url.includes('alpha-secret-route'));
        expect(seeded).toBeTruthy();
        expect(seeded.sources).toContain('probe-seed');
    });

    test('pathProbeDepth 2 probes /prefix/word for discovered single-segment paths', async () => {
        axios.get.mockImplementation((url) => {
            const s = String(url);
            if (s.includes('manifest.json') || s.includes('site.webmanifest')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('sitemap.xml')) {
                return Promise.resolve({
                    status: 200,
                    data: '<urlset><loc>https://example.com/portal</loc></urlset>'
                });
            }
            if (s.includes('robots.txt')) {
                return Promise.resolve({ status: 200, data: '' });
            }
            if (s.includes('/sw.js') || s.includes('service-worker') || s.includes('serviceworker') || s.includes('firebase-messaging')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('example.com/') && !s.includes('portal/admin')) {
                return Promise.resolve({ status: 200, data: '<html></html>' });
            }
            return Promise.resolve({ status: 404, data: '' });
        });
        axios.head.mockImplementation((u) => {
            if (String(u).includes('/portal/admin')) return Promise.resolve({ status: 200 });
            return Promise.resolve({ status: 404 });
        });

        const discovery = new PathDiscovery({
            maxDepth: 1,
            delay: 0,
            useRender: false,
            pathProbeDepth: 2
        });
        const results = await discovery.discover('https://example.com/');
        const depth2 = results.paths.find(p => p.url.includes('portal/admin'));
        expect(depth2).toBeTruthy();
        expect(depth2.sources).toContain('probe-depth2');
    });

    test('default sw.js fetch extracts quoted path hints', async () => {
        axios.get.mockImplementation((url) => {
            const s = String(url);
            if (s.includes('manifest.json') || s.includes('site.webmanifest')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('sitemap')) {
                return Promise.resolve({ status: 200, data: '<urlset></urlset>' });
            }
            if (s.includes('robots.txt')) {
                return Promise.resolve({ status: 200, data: '' });
            }
            if (s.includes('/sw.js')) {
                return Promise.resolve({
                    status: 200,
                    data: 'workbox.precache([{url:"/offline-fallback"}]);'
                });
            }
            if (s.includes('service-worker') || s.includes('serviceworker') || s.includes('firebase-messaging')) {
                return Promise.resolve({ status: 404, data: '' });
            }
            if (s.includes('example.com/')) {
                return Promise.resolve({ status: 200, data: '<html></html>' });
            }
            return Promise.resolve({ status: 404, data: '' });
        });
        axios.head.mockResolvedValue({ status: 404 });

        const discovery = new PathDiscovery({ maxDepth: 1, delay: 0, useRender: false });
        const results = await discovery.discover('https://example.com/');
        const fromJs = results.paths.find(p => p.url.includes('offline-fallback'));
        expect(fromJs).toBeTruthy();
        expect(fromJs.sources.some(s => s === 'js')).toBe(true);
    });
});
