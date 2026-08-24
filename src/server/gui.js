const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { SiteDownloader } = require('../downloader');
const { applyPreset } = require('../cli/presets');
const {
    computePercent,
    updateEmaMs,
    estimateEtaMs,
    formatDuration,
    truncateUrl
} = require('../cli/downloadTimeline');
const { startPreview } = require('./PreviewServer');

const previewServers = new Map();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rootDir = path.join(__dirname, '..', '..');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(rootDir, 'views'));
app.use(express.static(path.join(rootDir, 'public')));

app.get('/', (req, res) => {
    res.render('index');
});

function mapPreset(preset) {
    return applyPreset({}, preset || 'page');
}

function buildOptions(body) {
    const preset = mapPreset(body.preset || 'page');
    let loginForm = null;
    let loginCredentials = null;
    try {
        if (body.loginForm) loginForm = JSON.parse(body.loginForm);
        if (body.loginCredentials) loginCredentials = JSON.parse(body.loginCredentials);
    } catch {
        // ignore invalid JSON
    }

    const base = {
        outputDir: body.output || 'downloaded_site',
        userAgent: body.userAgent,
        cookie: body.cookie,
        mode: body.mode || body.engineMode ||
            (body.dynamic === true || body.dynamic === 'true' ? 'render' : 'auto'),
        dynamic: body.dynamic === true || body.dynamic === 'true',
        autoDynamic: body.autoDynamic !== false && body.autoDynamic !== 'false',
        browserType: body.browser || body.browserType || 'playwright',
        browser: body.browserEngine || 'chromium',
        headless: body.headless !== false && body.headless !== 'false',
        extraWait: Number(body.wait) || 2000,
        recursive: body.recursive === true || body.recursive === 'true' || preset.recursive,
        maxDepth: Number(body.maxDepth) || preset.maxDepth || 1,
        useSitemap: body.sitemap === true || body.sitemap === 'true' || preset.useSitemap,
        ignoreRobots: body.ignoreRobots === true || body.ignoreRobots === 'true',
        concurrency: Number(body.concurrency) || 5,
        delay: Number(body.delay) || 500,
        retry: Number(body.retry) || 3,
        filterRegex: body.filter || body.filterRegex || null,
        proxy: body.proxy || null,
        type: body.type || 'all',
        blockExternalAssets: body.blockExternalAssets === true || body.blockExternalAssets === 'true',
        blockAssetPatterns: body.blockAssetPatterns || body.blockAsset || null,
        timeout: Number(body.timeout) || 30000,
        loginUrl: body.loginUrl || null,
        loginForm,
        loginCredentials,
        verbose: body.verbose === true || body.verbose === 'true',
        legacyFlatPages: body.legacyFlatPages === true || body.legacyFlatPages === 'true',
        onError: (msg) => {
            io.emit('download-error', { message: msg });
        }
    };

    const siteStartedAt = Date.now();
    let lastDoneAt = siteStartedAt;
    let emaMsPerItem = null;
    let currentPeak = 0;
    let lastCompleted = 0;
    let lastDownloadedBytes = 0;

    function emitSocketProgress(payload) {
        const now = Date.now();
        const elapsedMs = now - siteStartedAt;
        const pct = payload.percent != null
            ? payload.percent
            : computePercent(lastCompleted, currentPeak);
        let speedKb = '';
        if (payload.downloadedBytes != null && elapsedMs > 500) {
            const kbPerSec = (payload.downloadedBytes / 1024) / (elapsedMs / 1000);
            if (Number.isFinite(kbPerSec) && kbPerSec > 0) {
                speedKb = `${kbPerSec.toFixed(1)} KB/s`;
            }
        }
        io.emit('download-progress', {
            current: lastCompleted,
            total: Math.max(currentPeak, 1),
            file: payload.file || '',
            phase: payload.phase || '',
            visitedCount: payload.visitedCount ?? 0,
            percent: pct,
            elapsedMs,
            elapsedFormatted: formatDuration(elapsedMs),
            etaMs: payload.etaMs != null ? payload.etaMs : null,
            etaFormatted: payload.etaMs != null && payload.etaMs > 0 ? formatDuration(payload.etaMs) : '',
            detailShort: truncateUrl(payload.file || '', 96),
            speed: speedKb,
            eta: payload.etaSec != null ? `${payload.etaSec}s` : ''
        });
    }

    base.onDownloadProgress = (p) => {
        if (p.type === 'page-prepare') {
            currentPeak = 0;
            lastCompleted = 0;
            lastDoneAt = Date.now();
            emitSocketProgress({
                file: p.url,
                phase: 'page-prepare',
                visitedCount: p.visitedCount,
                percent: 0,
                etaMs: null,
                downloadedBytes: lastDownloadedBytes
            });
            return;
        }
        if (p.type === 'page-fetch-start') {
            currentPeak = 0;
            lastCompleted = 0;
            lastDoneAt = Date.now();
            emitSocketProgress({
                file: p.url,
                phase: 'page-fetch',
                visitedCount: p.visitedCount,
                percent: 0,
                etaMs: null,
                downloadedBytes: lastDownloadedBytes
            });
            return;
        }
        if (p.type === 'page-html-saved') {
            lastDoneAt = Date.now();
            emitSocketProgress({
                file: p.url,
                phase: 'page-assets',
                percent: 0,
                etaMs: null,
                downloadedBytes: lastDownloadedBytes
            });
            return;
        }
        if (p.type === 'asset-start') {
            currentPeak = Math.max(currentPeak, p.peakQueue || 0, p.queueLength || 0);
            emitSocketProgress({
                file: p.url,
                phase: 'asset',
                percent: computePercent(lastCompleted, currentPeak),
                downloadedBytes: lastDownloadedBytes
            });
            return;
        }
        if (p.type === 'asset-done') {
            const now = Date.now();
            emaMsPerItem = updateEmaMs(emaMsPerItem, now - lastDoneAt);
            lastDoneAt = now;
            currentPeak = Math.max(currentPeak, p.peakQueue || 0);
            lastCompleted = p.completed || 0;
            lastDownloadedBytes = p.downloadedBytes || lastDownloadedBytes;
            const etaMs = estimateEtaMs(emaMsPerItem, p.completed, currentPeak);
            emitSocketProgress({
                file: p.url,
                phase: 'asset',
                percent: computePercent(p.completed, currentPeak),
                etaMs,
                etaSec: etaMs != null ? Math.ceil(etaMs / 1000) : null,
                downloadedBytes: lastDownloadedBytes
            });
            return;
        }
        if (p.type === 'pipeline-complete') {
            currentPeak = Math.max(currentPeak, p.peakQueue || 0);
            lastCompleted = currentPeak;
            lastDownloadedBytes = p.downloadedBytes || lastDownloadedBytes;
            emitSocketProgress({
                file: '',
                phase: 'pipeline-complete',
                percent: currentPeak > 0 ? 100 : 0,
                etaMs: 0,
                downloadedBytes: lastDownloadedBytes
            });
        }
    };

    return base;
}

app.post('/api/download', async (req, res) => {
    const body = req.body;
    if (!body.url) {
        return res.json({ success: false, error: 'Please provide a website URL' });
    }

    try {
        const outputDir = body.output || 'downloaded_site';
        const host = new URL(body.url).host.replace(/[:\/\\]/g, '_');
        const folder = path.join(outputDir, host);

        if (await fs.pathExists(folder)) {
            await fs.remove(folder);
        }

        const downloader = new SiteDownloader(buildOptions(body));
        const result = await downloader.downloadWebsite(body.url);

        io.emit('download-complete');
        res.json({
            success: true,
            folder: result.outputDir,
            stats: {
                success: result.successCount,
                fail: result.failCount,
                bytes: result.downloadedBytes
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message || 'Download failed'
        });
    }
});

app.post('/api/open-folder', (req, res) => {
    const { folder } = req.body;
    if (!folder) return res.json({ success: false, error: 'Folder required' });
    const absoluteFolder = path.resolve(folder);
    if (!fs.existsSync(absoluteFolder)) {
        return res.json({ success: false, error: 'Folder not found' });
    }
    const cmd = process.platform === 'win32'
        ? `start "" "${absoluteFolder}"`
        : process.platform === 'darwin'
            ? `open "${absoluteFolder}"`
            : `xdg-open "${absoluteFolder}"`;
    exec(cmd, (err) => {
        res.json(err ? { success: false, error: err.message } : { success: true });
    });
});

app.post('/api/open-website', async (req, res) => {
    const { folder } = req.body;
    if (!folder) return res.json({ success: false, error: 'Folder required' });

    const absoluteFolder = path.resolve(folder);
    if (!(await fs.pathExists(absoluteFolder))) {
        return res.json({ success: false, error: 'Folder not found' });
    }

    try {
        let entry = previewServers.get(absoluteFolder);
        if (!entry) {
            const { server, url } = await startPreview(absoluteFolder, { open: true });
            entry = { server, url };
            previewServers.set(absoluteFolder, entry);
        } else {
            const { openBrowser } = require('./PreviewServer');
            openBrowser(entry.url);
        }
        res.json({ success: true, previewUrl: entry.url });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

function startServer() {
    return new Promise((resolve) => {
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            const url = `http://localhost:${PORT}`;
            console.log(`Web GUI running at ${url}`);
            resolve(url);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                server.listen(PORT + 1, () => {
                    const url = `http://localhost:${PORT + 1}`;
                    console.log(`Web GUI running at ${url}`);
                    resolve(url);
                });
            } else {
                console.error(err);
            }
        });
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer };
