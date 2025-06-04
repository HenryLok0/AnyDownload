const { Downloader, checkNeedDynamic } = require('../src/downloader');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('axios');
jest.mock('puppeteer');
jest.mock('playwright');

describe('Downloader', () => {
  let downloader;
  const testUrl = 'https://example.com';
  const testOutputDir = 'test_output';

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    fs.ensureDir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
    fs.stat.mockResolvedValue({ size: 1000 });
    fs.pathExists.mockResolvedValue(false);
    
    // Create new downloader instance for each test
    downloader = new Downloader({
      outputDir: testOutputDir,
      userAgent: 'test-agent',
      dynamic: false,
      recursive: false,
      maxDepth: 1
    });
  });

  afterEach(() => {
    // Cleanup
    jest.resetAllMocks();
  });

  describe('URL Validation', () => {
    test('should validate correct URLs', () => {
      const validUrl = 'https://example.com';
      const result = new URL(validUrl);
      expect(result.href).toBe(validUrl + '/'); // URL constructor adds trailing slash
    });

    test('should reject invalid URLs', () => {
      expect(() => new URL('not-a-url')).toThrow();
      expect(() => new URL('')).toThrow();
      expect(() => new URL(null)).toThrow();
    });
  });

  describe('Dynamic Mode Detection', () => {
    test('should detect dynamic websites', async () => {
      axios.get.mockResolvedValue({
        data: '<div id="app"></div><script src="/_next/"></script>'
      });

      const result = await checkNeedDynamic(testUrl, 'test-agent');
      expect(result).toBe(true);
    });

    test('should detect static websites', async () => {
      // Mock a static website response with a large HTML content
      const staticHtml = '<html><body>' + 'Static content'.repeat(1000) + '</body></html>';
      axios.get.mockResolvedValue({
        data: staticHtml
      });

      const result = await checkNeedDynamic(testUrl, 'test-agent');
      expect(result).toBe(false);
    });
  });

  describe('Resource Download', () => {
    test('should download static HTML content', async () => {
      const mockHtml = '<html><body>Test content</body></html>';
      axios.get.mockResolvedValue({ data: mockHtml });

      await downloader.downloadWebsite(testUrl);

      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining(testOutputDir));
    });

    test('should handle download errors gracefully', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      downloader.onError = jest.fn();

      await expect(downloader.downloadWebsite(testUrl)).rejects.toThrow();
      expect(downloader.onError).toHaveBeenCalled();
    });
  });

  describe('Resource Processing', () => {
    test('should extract resources from HTML', async () => {
      const mockHtml = `
        <html>
          <head>
            <link rel="stylesheet" href="/style.css">
            <script src="/script.js"></script>
          </head>
          <body>
            <img src="/image.jpg">
          </body>
        </html>
      `;
      axios.get.mockResolvedValue({ data: mockHtml });
      downloader.onResource = jest.fn();

      await downloader.downloadWebsite(testUrl);

      expect(downloader.onResource).toHaveBeenCalled();
    });

    test('should respect resource type filters', async () => {
      downloader.type = 'image';
      const mockHtml = `
        <html>
          <body>
            <img src="/image.jpg">
            <link rel="stylesheet" href="/style.css">
          </body>
        </html>
      `;
      axios.get.mockResolvedValue({ data: mockHtml });
      downloader.onResource = jest.fn();

      await downloader.downloadWebsite(testUrl);

      expect(downloader.onResource).toHaveBeenCalled();
    });
  });

  describe('Recursive Download', () => {
    test('should respect max depth setting', async () => {
      downloader.recursive = true;
      downloader.maxDepth = 2;
      const mockHtml = '<a href="/page1">Link</a>';
      axios.get.mockResolvedValue({ data: mockHtml });

      await downloader.downloadWebsite(testUrl);

      expect(downloader.visited.size).toBeLessThanOrEqual(3); // Original + max 2 levels
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      downloader.onError = jest.fn();

      await expect(downloader.downloadWebsite(testUrl)).rejects.toThrow();
      expect(downloader.onError).toHaveBeenCalled();
    });

    test('should handle invalid URLs', async () => {
      await expect(downloader.downloadWebsite('invalid-url')).rejects.toThrow();
    });
  });

  describe('Progress Tracking', () => {
    test('should track download progress', async () => {
      const mockHtml = `
        <html>
          <body>
            <img src="/image.jpg">
            <link rel="stylesheet" href="/style.css">
          </body>
        </html>
      `;
      axios.get.mockResolvedValue({ data: mockHtml });
      downloader.onResource = jest.fn();
      
      // Mock the downloadResource method to simulate resource downloads
      downloader.downloadResource = jest.fn().mockImplementation(async (url, index) => {
        downloader.onResource(url, index, 2, '100 KB/s', '1s');
        return true;
      });

      await downloader.downloadWebsite(testUrl);
      expect(downloader.onResource).toHaveBeenCalled();
    });
  });
}); 