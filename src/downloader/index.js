const { SiteDownloader, checkNeedDynamic } = require('./SiteDownloader');
const AssetPipeline = require('./AssetPipeline');
const Crawler = require('./Crawler');

// Backward compatibility
const Downloader = SiteDownloader;

module.exports = {
    SiteDownloader,
    Downloader,
    checkNeedDynamic,
    AssetPipeline,
    Crawler
};
