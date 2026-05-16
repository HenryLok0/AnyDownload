const AssetPipeline = require('../src/downloader/AssetPipeline');

describe('AssetPipeline onDownloadProgress', () => {
    test('emits asset-done once per completed queue item and pipeline-complete', async () => {
        const events = [];
        const pipeline = new AssetPipeline({
            delay: 0,
            retry: 1,
            onDownloadProgress: (p) => events.push(p.type)
        });

        pipeline.enqueue('https://example.com/a.js', 'https://example.com/', {
            body: Buffer.from('a'),
            contentType: 'application/javascript'
        });
        pipeline.enqueue('https://example.com/b.css', 'https://example.com/', {
            body: Buffer.from('body{}'),
            contentType: 'text/css'
        });

        pipeline._downloadToFile = jest.fn();

        const outputDir = require('path').join(__dirname, '..', 'test-output', 'pipeline-progress');
        await require('fs-extra').ensureDir(outputDir);
        await pipeline.run(outputDir);

        const starts = events.filter(t => t === 'asset-start').length;
        const dones = events.filter(t => t === 'asset-done').length;
        expect(starts).toBe(2);
        expect(dones).toBe(2);
        expect(events[events.length - 1]).toBe('pipeline-complete');
    });
});
