const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { SiteDownloader } = require('../downloader');
const { applyPreset } = require('../cli/presets');
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

    return {
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
        timeout: Number(body.timeout) || 30000,
        loginUrl: body.loginUrl || null,
        loginForm,
        loginCredentials,
        verbose: body.verbose === true || body.verbose === 'true',
        onResource: (url, idx, total, speed, eta) => {
            io.emit('download-progress', {
                current: idx,
                total,
                file: url,
                speed: speed ? `${speed} KB/s` : '',
                eta: eta ? `${eta}s` : ''
            });
        },
        onError: (msg) => {
            io.emit('download-error', { message: msg });
        }
    };
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Web GUI running at http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        server.listen(PORT + 1, () => {
            console.log(`Web GUI running at http://localhost:${PORT + 1}`);
        });
    } else {
        console.error(err);
    }
});
