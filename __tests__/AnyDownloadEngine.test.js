const { AnyDownloadEngine } = require('../src/engine');

describe('AnyDownloadEngine', () => {
    test('needsRender detects SPA markers', async () => {
        const axios = require('axios');
        jest.spyOn(axios, 'get').mockResolvedValue({
            data: '<html><script src="/_next/static/ch.js"></script><div id="app"></div></html>'
        });
        const result = await AnyDownloadEngine.needsRender('https://example.com', 'test');
        expect(result).toBe(true);
        axios.get.mockRestore();
    });

    test('static mode returns html without capture', async () => {
        const axios = require('axios');
        jest.spyOn(axios, 'get').mockResolvedValue({
            data: '<html><link rel="stylesheet" href="/a.css"><body>Hello world with enough text content here.</body></html>'
        });
        const engine = new AnyDownloadEngine({ mode: 'static', userAgent: 'test' });
        const result = await engine.fetchPage('https://example.com');
        expect(result.engine).toBe('static');
        expect(result.html).toContain('Hello');
        expect(result.capture).toBeNull();
        axios.get.mockRestore();
    });
});
