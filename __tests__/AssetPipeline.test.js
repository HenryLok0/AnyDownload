const AssetPipeline = require('../src/downloader/AssetPipeline');

describe('AssetPipeline', () => {
    test('_headers includes Referer and Origin from page URL', () => {
        const pipeline = new AssetPipeline({ userAgent: 'TestAgent/1.0' });
        const pageUrl = 'https://henrylok.me/';
        const resourceUrl = 'https://henrylok.me/assets/index-abc.js';
        const headers = pipeline._headers(pageUrl, resourceUrl);

        expect(headers.Referer).toBe(pageUrl);
        expect(headers.Origin).toBe('https://henrylok.me');
        expect(headers['User-Agent']).toBe('TestAgent/1.0');
        expect(headers.Accept).toBeTruthy();
    });

    test('favicon failure is optional and does not increment failCount', async () => {
        const pipeline = new AssetPipeline({ retry: 1, delay: 0 });
        pipeline._downloadToFile = jest.fn().mockRejectedValue(new Error('HTTP 404'));

        await pipeline._downloadOne({
            url: 'https://example.com/favicon.ico',
            pageUrl: 'https://example.com/',
            baseDir: '/tmp'
        }, 0, 1);

        expect(pipeline.failCount).toBe(0);
        expect(pipeline.optionalFailures).toHaveLength(1);
    });

    test('hasCriticalFailures when all non-optional assets fail', () => {
        const pipeline = new AssetPipeline();
        pipeline.failCount = 2;
        pipeline.successCount = 0;
        expect(pipeline.hasCriticalFailures()).toBe(true);

        pipeline.successCount = 1;
        expect(pipeline.hasCriticalFailures()).toBe(false);
    });
});
