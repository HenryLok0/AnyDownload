const fs = require('fs-extra');
const path = require('path');
const AssetPipeline = require('../src/downloader/AssetPipeline');

describe('AssetPipeline capture merge', () => {
    const outputDir = path.join(__dirname, '..', 'test-output', 'capture');

    beforeEach(async () => {
        await fs.ensureDir(outputDir);
    });

    afterEach(async () => {
        await fs.remove(outputDir).catch(() => {});
    });

    test('updates queue item when capture body arrives after HTML enqueue', async () => {
        const pipeline = new AssetPipeline({ delay: 0, retry: 1 });
        const url = 'https://example.com/assets/app.js';
        const pageUrl = 'https://example.com/';
        const body = Buffer.from('console.log("captured");');

        pipeline.enqueue(url, pageUrl);
        pipeline.enqueue(url, pageUrl, { body, contentType: 'application/javascript' });

        pipeline._downloadToFile = jest.fn();

        await pipeline.run(outputDir);

        expect(pipeline._downloadToFile).not.toHaveBeenCalled();
        expect(await fs.pathExists(path.join(outputDir, 'assets', 'app.js'))).toBe(true);
        const saved = await fs.readFile(path.join(outputDir, 'assets', 'app.js'), 'utf8');
        expect(saved).toContain('captured');
        expect(pipeline.successCount).toBe(1);
    });

    test('saveCapturedResponses before enqueueMany uses captured bytes', async () => {
        const pipeline = new AssetPipeline({ delay: 0, retry: 1 });
        const pageUrl = 'https://example.com/';
        const capture = {
            getAll: () => [{
                url: 'https://example.com/assets/style.css',
                status: 200,
                contentType: 'text/css',
                body: Buffer.from('body { color: red; }')
            }]
        };

        await pipeline.saveCapturedResponses(capture, pageUrl);
        pipeline.enqueueMany(['https://example.com/assets/style.css'], pageUrl);

        pipeline._downloadToFile = jest.fn();
        await pipeline.run(outputDir);

        expect(pipeline._downloadToFile).not.toHaveBeenCalled();
        expect(await fs.pathExists(path.join(outputDir, 'assets', 'style.css'))).toBe(true);
    });
});
