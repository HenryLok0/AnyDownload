const path = require('path');
const fs = require('fs-extra');
const { ReplayIndex, matchReplayUrl } = require('../src/downloader/replayStore');

describe('ReplayIndex', () => {
    const rootDir = path.join(__dirname, '..', 'test-output', 'replay-index');

    beforeEach(async () => {
        await fs.remove(rootDir);
        await fs.ensureDir(rootDir);
    });

    afterEach(async () => {
        await fs.remove(rootDir).catch(() => {});
    });

    test('keeps query-string responses as separate files', async () => {
        const saved = path.join(rootDir, 'external', 'api.example.com', 'v1', 'forecast.json');
        await fs.outputFile(saved, '{"temp":18}');

        const index = new ReplayIndex();
        await index.add(
            rootDir,
            'https://api.example.com/v1/forecast?lat=1',
            saved,
            'application/json'
        );
        await index.add(
            rootDir,
            'https://api.example.com/v1/forecast?lat=2',
            saved,
            'application/json'
        );
        await fs.writeFile(saved, '{"temp":22}');
        await index.add(
            rootDir,
            'https://api.example.com/v1/forecast?lat=2',
            saved,
            'application/json'
        );
        await index.write(rootDir);

        const data = await fs.readJson(path.join(rootDir, 'anydownload-replay.json'));
        expect(data.responses).toHaveLength(2);
        const files = data.responses.map(row => row.file);
        expect(new Set(files).size).toBe(2);
        const second = data.responses.find(row => row.url.endsWith('lat=2'));
        expect(await fs.readFile(path.join(rootDir, second.file), 'utf8')).toBe('{"temp":22}');
    });

    test('points a path without a query at the saved file', async () => {
        const saved = path.join(rootDir, 'data', 'records.json');
        await fs.outputFile(saved, '[]');
        const index = new ReplayIndex();
        await index.add(rootDir, 'https://example.com/data/records.json', saved, 'application/json');
        await index.write(rootDir);
        const data = await fs.readJson(path.join(rootDir, 'anydownload-replay.json'));
        expect(data.responses[0].file).toBe('data/records.json');
    });

    test('maps a preview path back to the saved same-site response', () => {
        const saved = [
            'https://example.com/data/records.json',
            'https://api.example.com/v1/forecast?lat=1'
        ];
        expect(matchReplayUrl(
            'http://127.0.0.1:8765/data/records.json',
            saved,
            'https://example.com/weather',
            'http://127.0.0.1:8765'
        )).toBe('https://example.com/data/records.json');
        expect(matchReplayUrl(
            'https://api.example.com/v1/forecast?lat=1',
            saved,
            'https://example.com/weather',
            'http://127.0.0.1:8765'
        )).toBe('https://api.example.com/v1/forecast?lat=1');
        expect(matchReplayUrl(
            'https://api.example.com/v1/forecast?lat=9',
            saved,
            'https://example.com/weather',
            'http://127.0.0.1:8765'
        )).toBe('');
    });
});
