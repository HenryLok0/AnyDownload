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
});
