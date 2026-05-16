const PathMapper = require('../src/downloader/storage/PathMapper');

describe('PathMapper', () => {
    test('maps same-origin paths', () => {
        const mapper = new PathMapper('https://example.com/index.html');
        expect(mapper.toLocalPath('https://example.com/assets/style.css')).toBe('assets/style.css');
    });

    test('maps external paths', () => {
        const mapper = new PathMapper('https://example.com/index.html');
        const local = mapper.toLocalPath('https://cdn.example.net/lib/app.js');
        expect(local).toContain('external/cdn.example.net');
    });

    test('adds extension from content type', () => {
        const mapper = new PathMapper('https://example.com/');
        expect(mapper.ensureExtension('assets/file', 'image/png')).toBe('assets/file.png');
    });

    test('getMirrorRelPagePath: root, nested clean routes, docs', () => {
        const m = new PathMapper('https://react.dev/');
        expect(m.getMirrorRelPagePath('https://react.dev/')).toBe('index.html');
        expect(m.getMirrorRelPagePath('https://react.dev/learn')).toBe('learn/index.html');
        expect(m.getMirrorRelPagePath('https://react.dev/learn/')).toBe('learn/index.html');
        expect(m.getMirrorRelPagePath('https://react.dev/reference/react/hooks')).toBe(
            'reference/react/hooks/index.html'
        );
        expect(m.getMirrorRelPagePath('https://react.dev/terms.html')).toBe('terms.html');
    });

    test('relativeBetweenMirrorFiles prefixes ./ when needed', () => {
        const rel = PathMapper.relativeBetweenMirrorFiles('learn/index.html', '_next/static/chunk.js');
        expect(rel).toBe('../_next/static/chunk.js');
    });

    test('relativePageHref: nested page to sibling section', () => {
        const m = new PathMapper('https://example.com/learn/');
        expect(m.relativePageHref('learn/foo/index.html', 'https://example.com/learn/bar')).toBe('../bar/');
    });

    test('relativePageHref from deep page to home', () => {
        const m = new PathMapper('https://example.com/');
        expect(m.relativePageHref('reference/react/index.html', 'https://example.com/')).toBe('../../');
    });

    test('relativeAssetHref from subdirectory page', () => {
        const m = new PathMapper('https://example.com/learn/');
        const href = m.relativeAssetHref('learn/index.html', 'https://example.com/_next/static/x.js');
        expect(href).toBe('../_next/static/x.js');
    });
});
