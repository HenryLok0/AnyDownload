const { SiteDownloader, checkNeedDynamic } = require('../src/downloader');
const fs = require('fs-extra');
const axios = require('axios');

jest.mock('fs-extra');
jest.mock('axios');
jest.mock('../src/engine/BrowserEngine');

describe('SiteDownloader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fs.ensureDir.mockResolvedValue(undefined);
        fs.writeFile.mockResolvedValue(undefined);
        fs.pathExists.mockResolvedValue(false);
        fs.stat.mockResolvedValue({ size: 100 });
        fs.readFile.mockResolvedValue('body{}');
    });

    test('checkNeedDynamic returns true for short html', async () => {
        axios.get.mockResolvedValue({ data: '<html></html>' });
        const result = await checkNeedDynamic('https://example.com', 'test');
        expect(result).toBe(true);
    });

    test('creates downloader with defaults', () => {
        const dl = new SiteDownloader({ outputDir: 'out' });
        expect(dl.outputDir).toBe('out');
        expect(dl.engineMode).toBe('auto');
    });

    test('accepts mode option', () => {
        const dl = new SiteDownloader({ outputDir: 'out', mode: 'static' });
        expect(dl.engineMode).toBe('static');
    });
});
