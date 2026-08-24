const AssetPipeline = require('../src/downloader/AssetPipeline');

describe('AssetPipeline', () => {
    test('_headers includes Referer and Origin from page URL', () => {
        const pipeline = new AssetPipeline({ userAgent: 'TestAgent/1.0' });
        const pageUrl = 'https://example.com/';
        const resourceUrl = 'https://example.com/assets/index-abc.js';
        const headers = pipeline._headers(pageUrl, resourceUrl);

        expect(headers.Referer).toBe(pageUrl);
        expect(headers.Origin).toBe('https://example.com');
        expect(headers['User-Agent']).toBe('TestAgent/1.0');
        expect(headers.Accept).toBeTruthy();
    });

    test('banner.png failure is optional and does not increment failCount', async () => {
        const pipeline = new AssetPipeline({ retry: 1, delay: 0 });
        pipeline._downloadToFile = jest.fn().mockRejectedValue(new Error('HTTP 404'));

        await pipeline._downloadOne({
            url: 'https://example.com/banner.png',
            pageUrl: 'https://example.com/',
            baseDir: '/tmp'
        }, 0, 1);

        expect(pipeline.failCount).toBe(0);
        expect(pipeline.optionalFailures).toHaveLength(1);
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

    test('cross-origin CDN failure is optional', async () => {
        const pipeline = new AssetPipeline({ retry: 1, delay: 0 });
        pipeline._downloadToFile = jest.fn().mockRejectedValue(new Error('HTTP 403'));

        await pipeline._downloadOne({
            url: 'https://fonts.gstatic.com/s/roboto/v1/font.woff2',
            pageUrl: 'https://example.com/',
            baseDir: '/tmp'
        }, 0, 1);

        expect(pipeline.failCount).toBe(0);
        expect(pipeline.optionalFailures).toHaveLength(1);
    });

    test('blockExternalAssets skips cross-origin URLs during enqueue', () => {
        const pipeline = new AssetPipeline({ blockExternalAssets: true });

        pipeline.enqueue('https://fonts.gstatic.com/s/roboto/v1/font.woff2', 'https://example.com/');

        expect(pipeline.queue).toHaveLength(0);
        expect(pipeline.seen.size).toBe(0);
    });

    test('blockAssetPatterns supports wildcard host/path patterns', () => {
        const pipeline = new AssetPipeline({
            blockAssetPatterns: ['unpkg.com/*', 'cdn.jsdelivr.net/*']
        });

        pipeline.enqueue('https://unpkg.com/react@18/umd/react.production.min.js', 'https://example.com/');
        pipeline.enqueue('https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js', 'https://example.com/');
        pipeline.enqueue('https://example.com/assets/app.js', 'https://example.com/');

        expect(pipeline.queue).toHaveLength(1);
        expect(pipeline.queue[0].url).toBe('https://example.com/assets/app.js');
    });

    test('blockAssetPatterns supports regex patterns', () => {
        const pipeline = new AssetPipeline({
            blockAssetPatterns: ['/fonts\\.(gstatic|googleapis)\\.com\\//i']
        });

        pipeline.enqueue('https://fonts.googleapis.com/css2?family=Roboto', 'https://example.com/');
        pipeline.enqueue('https://fonts.gstatic.com/s/roboto/v1/font.woff2', 'https://example.com/');
        pipeline.enqueue('https://example.com/main.css', 'https://example.com/');

        expect(pipeline.queue).toHaveLength(1);
        expect(pipeline.queue[0].url).toBe('https://example.com/main.css');
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
