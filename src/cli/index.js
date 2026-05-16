#!/usr/bin/env node

const { Command } = require('commander');
const ora = require('ora').default;
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const inquirerImport = require('inquirer');
const cosmiconfig = require('cosmiconfig').cosmiconfigSync;
const { version } = require('../../package.json');
const { SiteDownloader } = require('../downloader');
const { applyPreset } = require('./presets');
const { createDownloadTimeline } = require('./downloadTimeline');
const { startPreview, resolveSiteRoot } = require('../server/PreviewServer');
const PathDiscovery = require('../discovery/PathDiscovery');

const inquirer = inquirerImport.prompt ? inquirerImport : inquirerImport.default;

const MSG = {
    provideUrl: 'Enter the website URL to download:',
    downloading: 'Downloading: ',
    done: 'Download complete!',
    saved: 'Saved to',
    failedList: 'Failed resources:',
    summary: 'Summary',
    success: 'Success',
    fail: 'Failed',
    size: 'Total size',
    time: 'Elapsed',
    homepage: 'Homepage:',
    preview: 'Preview (HTTP):',
    previewHint: 'Tip: For SPAs, use --open or "anydownload serve <folder>". Do not double-click index.html (file:// breaks ES modules).',
    serving: 'Serving offline site at',
    openPrompt: 'Open offline preview in browser now? (Required for React/Vite — do not double-click index.html)',
    previewLater: 'To preview later, run:',
    output: 'Output:',
    mirrorSpaHint: 'Tip: For single-page portfolios (SPA), use preset "page" or Single page in wizard. Mirror crawls many links and subdomains.',
    pathDiscovering: 'Discovering site paths: ',
    pathDone: 'Path discovery complete',
    pathSaved: 'Paths saved to',
    pathSummary: 'Paths found'
};

let config = {};
try {
    const explorer = cosmiconfig('anydownload');
    const result = explorer.search();
    if (result?.config) config = result.config;
} catch {
    // ignore config errors
}

function normalizeInputUrl(url) {
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `https://${url}`;
    }
    return url;
}

function buildDownloaderOptions(opts) {
    const preset = applyPreset({}, opts.preset || 'page');
    const merged = { ...preset };
    for (const [key, val] of Object.entries(opts)) {
        if (val !== undefined && val !== null) merged[key] = val;
    }

    return {
        outputDir: merged.output || merged.outputDir || 'downloaded_site',
        userAgent: merged.userAgent || config.userAgent,
        cookie: merged.cookie || config.cookie,
        mode: merged.autoDynamic === false || merged.autoDynamic === 'false'
            ? 'static'
            : (merged.mode || merged.engineMode || (merged.dynamic === true ? 'render' : 'auto')),
        dynamic: merged.dynamic === true,
        autoDynamic: merged.autoDynamic !== false && merged.autoDynamic !== 'false',
        browserType: merged.browser || merged.browserType || 'playwright',
        browser: merged.browserEngine || 'chromium',
        headless: merged.headless !== false && merged.headless !== 'false',
        extraWait: parseInt(merged.wait, 10) || 2000,
        recursive: merged.recursive === true || merged.recursive === 'true' || preset.recursive === true,
        maxDepth: parseInt(merged.maxDepth, 10) || preset.maxDepth || 1,
        useSitemap: merged.sitemap === true || merged.useSitemap === true || preset.useSitemap === true,
        ignoreRobots: merged.ignoreRobots === true,
        verbose: merged.verbose === true,
        concurrency: parseInt(merged.concurrency, 10) || 5,
        delay: parseInt(merged.delay, 10) || 500,
        retry: parseInt(merged.retry, 10) || 3,
        filterRegex: merged.filter || null,
        proxy: merged.proxy || null,
        type: merged.type || 'all',
        timeout: parseInt(merged.timeout, 10) || 30000,
        maxFileSize: merged.maxFileSize ? parseInt(merged.maxFileSize, 10) * 1024 * 1024 : 0,
        onResource: merged.onResource,
        onError: merged.onError,
        legacyFlatPages: merged.legacyFlatPages === true,
        noProgress: merged.noProgress === true,
        onDownloadProgress: merged.onDownloadProgress
    };
}

async function runWizard() {
    const answers = await inquirer.prompt([
        { type: 'input', name: 'url', message: MSG.provideUrl },
        {
            type: 'list',
            name: 'preset',
            message: 'Download scope:',
            choices: [
                { name: 'Single page + assets', value: 'page' },
                { name: 'Full site (depth 2)', value: 'full' },
                { name: 'Mirror (depth 5)', value: 'mirror' }
            ]
        },
        {
            type: 'list',
            name: 'mode',
            message: 'Site type (engine):',
            choices: [
                { name: 'Auto — detect static vs SPA (recommended)', value: 'auto' },
                { name: 'Static — HTML/CSS only, no browser install', value: 'static' },
                { name: 'Render — React/Vite/SPA (uses headless browser)', value: 'render' }
            ]
        },
        { type: 'input', name: 'output', message: 'Output folder:', default: 'downloaded_site' }
    ]);

    answers.browser = 'playwright';
    return answers;
}

function getEffectiveMode(opts) {
    const dlOpts = buildDownloaderOptions(opts);
    return dlOpts.mode;
}

function buildServeCommand(outputDir, opts) {
    const folder = path.resolve(outputDir);
    const port = parseInt(opts.servePort, 10) || 8765;
    const portFlag = port !== 8765 ? ` -p ${port}` : '';
    return `anydownload serve "${folder}"${portFlag}`;
}

async function startPreviewAndWait(outputDir, opts, openBrowser = true) {
    const port = parseInt(opts.servePort, 10) || 8765;
    const folder = path.resolve(outputDir);
    const siteRoot = await resolveSiteRoot(folder);
    const serveCmd = buildServeCommand(outputDir, opts) + (openBrowser ? '' : ' --no-open');
    console.log(`\n> ${serveCmd}`);
    const { url: previewUrl } = await startPreview(siteRoot, { port, open: openBrowser });
    console.log(`${MSG.preview} ${previewUrl}`);
    console.log(`${MSG.serving} ${previewUrl} (Ctrl+C to stop)`);
    await new Promise(() => {});
}

async function promptRenderPreview(outputDir, opts) {
    if (opts.open || opts.serve) return;
    if (getEffectiveMode(opts) !== 'render') return;
    if (!process.stdin.isTTY) return;

    const { openPreview } = await inquirer.prompt([{
        type: 'confirm',
        name: 'openPreview',
        message: MSG.openPrompt,
        default: true
    }]);

    if (openPreview) {
        await startPreviewAndWait(outputDir, opts, true);
    } else {
        console.log(`\n${MSG.previewLater}`);
        console.log(`  ${buildServeCommand(outputDir, opts)}`);
        console.log(MSG.previewHint);
    }
}

async function runPathDiscovery(url, opts) {
    url = normalizeInputUrl(url);
    if (!url) {
        console.error(MSG.provideUrl);
        process.exit(1);
    }

    const dlOpts = buildDownloaderOptions(opts);
    const host = new URL(url).host.replace(/[:\/\\]/g, '_');
    const outBase = path.resolve(dlOpts.outputDir);
    const hostDir = path.join(outBase, host);
    const pathsFile = path.join(hostDir, 'paths.txt');

    const spinner = ora(MSG.pathDiscovering + url).start();
    const discovery = new PathDiscovery({
        userAgent: dlOpts.userAgent,
        timeout: dlOpts.timeout,
        maxDepth: Math.max(parseInt(opts.maxDepth, 10) || 3, 2),
        delay: dlOpts.delay,
        verbose: dlOpts.verbose,
        pathDeep: opts.pathDeep === true,
        useRender: opts.pathNoRender !== true,
        renderProvider: dlOpts.browserType || 'playwright'
    });

    try {
        const results = await discovery.discover(url);
        await PathDiscovery.writeTxt(results, pathsFile);
        spinner.succeed(MSG.pathDone);
        console.log(`${MSG.pathSaved} ${pathsFile}`);
        console.log(`${MSG.pathSummary}: ${results.total}`);
        if (Object.keys(results.bySource).length) {
            console.log('By source:', Object.entries(results.bySource)
                .map(([k, v]) => `${k}=${v}`).join(', '));
        }
    } catch (error) {
        spinner.fail('Path discovery failed: ' + (error.message || error));
        process.exit(1);
    }
}

async function runDownload(url, opts) {
    url = normalizeInputUrl(url);
    if (!url) {
        console.error(MSG.provideUrl);
        process.exit(1);
    }

    const dlOpts = buildDownloaderOptions(opts);
    console.log(`${MSG.output} ${path.resolve(dlOpts.outputDir)}`);

    const siteStartedAt = Date.now();
    const spinner = ora(MSG.downloading + url).start();

    const userProgressCb = dlOpts.onDownloadProgress;
    if (!dlOpts.noProgress) {
        const timeline = createDownloadTimeline({
            spinner,
            noProgress: false,
            siteStartedAt
        });
        dlOpts.onDownloadProgress = userProgressCb
            ? (p) => {
                timeline.handle(p);
                userProgressCb(p);
            }
            : timeline.handle.bind(timeline);
    }

    const downloader = new SiteDownloader(dlOpts);
    const startTime = siteStartedAt;

    try {
        const result = await downloader.downloadWebsite(url);
        spinner.succeed(MSG.done);
        console.log(`${MSG.saved} ${result.outputDir}`);
        console.log(`\n${MSG.summary}:`);
        console.log(`${MSG.success}: ${result.successCount}`);
        console.log(`${MSG.fail}: ${result.failCount}`);
        console.log(`${MSG.size}: ${(result.downloadedBytes / 1024).toFixed(1)} KB`);
        console.log(`${MSG.time}: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

        const indexInOutput = path.join(result.outputDir, 'index.html');
        const homepage = (await fs.pathExists(indexInOutput))
            ? indexInOutput
            : path.join(result.outputDir, (await fs.readdir(result.outputDir)).find(f => f.endsWith('.html')) || 'index.html');
        console.log(`${MSG.homepage} ${homepage}`);
        console.log(MSG.previewHint);

        const preset = opts.preset || 'page';
        if (preset === 'mirror' && getEffectiveMode(opts) === 'render') {
            console.log(`\n${MSG.mirrorSpaHint}`);
        }

        if (result.failedResources.length) {
            console.log('\n' + MSG.failedList);
            result.failedResources.forEach(r => console.log(r.url || r));
        }

        if ((opts.open || opts.serve) && result.outputDir) {
            await startPreviewAndWait(result.outputDir, opts, !!opts.open);
        } else if (result.outputDir) {
            await promptRenderPreview(result.outputDir, opts);
        }
    } catch (error) {
        spinner.fail('Download failed: ' + (error.message || error));
        process.exit(1);
    }
}

function startGui() {
    const webGuiPath = path.join(__dirname, '..', 'server', 'gui.js');
    const guiProcess = spawn('node', [webGuiPath], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    guiProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);
        if (output.includes('http://localhost:')) {
            const match = output.match(/http:\/\/localhost:\d+/);
            if (match) {
                const url = match[0];
                const cmd = process.platform === 'win32'
                    ? `start "" "${url}"`
                    : process.platform === 'darwin'
                        ? `open "${url}"`
                        : `xdg-open "${url}"`;
                exec(cmd);
            }
        }
    });

    guiProcess.unref();
    console.log('Web GUI starting at http://localhost:3000');
}

function addDownloadOptions(cmd) {
    return cmd
        .option('-o, --output <dir>', 'Output folder', config.output)
        .option('--preset <name>', 'Preset: page | full | mirror', config.preset || 'page')
        .option('--wizard', 'Interactive setup wizard')
        .option('--gui', 'Start web GUI')
        .option('-r, --recursive', 'Download linked pages')
        .option('-m, --max-depth <n>', 'Recursion depth', '1')
        .option('-d, --dynamic', 'Force render engine (headless browser)')
        .option('--mode <mode>', 'Engine: static | render | auto', 'auto')
        .option('--engine-mode <mode>', '(deprecated) use --mode')
        .option('--no-auto-dynamic', 'Use static engine only')
        .option('--browser <engine>', 'Render backend: playwright | puppeteer', config.browser || 'playwright')
        .option('--browser-engine <name>', 'chromium | firefox | webkit', 'chromium')
        .option('--wait <ms>', 'Extra wait after page load', '2000')
        .option('--sitemap', 'Use sitemap + generate sitemap.xml.gz')
        .option('--ignore-robots', 'Ignore robots.txt')
        .option('-v, --verbose', 'Verbose output')
        .option('--concurrency <n>', 'Concurrent downloads', '5')
        .option('--delay <ms>', 'Delay between downloads', '500')
        .option('--filter <regex>', 'Filter URLs by regex')
        .option('--type <type>', 'Resource type: all|image|css|js|html|media|font', 'all')
        .option('-p, --path', 'Discover site paths (sitemap, crawl, probes) and save paths.txt')
        .option('--path-deep', 'Extended wordlist + Wayback Machine URLs (slower)')
        .option('--path-no-render', 'Skip Playwright capture during path discovery')
        .option('--legacy-flat-pages', 'Flat page filenames in site root (old layout)')
        .option('--no-progress', 'Disable live progress timeline (useful for CI/logs)')
        .option('--open', 'Open offline preview via local HTTP server (required for SPAs)')
        .option('--serve', 'Start preview server after download (keeps running)')
        .option('--serve-port <port>', 'Preview server port', '8765')
        .option('--headless', 'Headless browser', true);
}

async function runServe(folder, opts) {
    const rootDir = path.resolve(folder);
    if (!(await fs.pathExists(rootDir))) {
        console.error('Folder not found: ' + rootDir);
        process.exit(1);
    }
    const port = parseInt(opts.port, 10) || 8765;
    const { url } = await startPreview(rootDir, { port, open: opts.open !== false });
    console.log(`${MSG.serving} ${url}`);
    console.log(MSG.previewHint);
    await new Promise(() => {});
}

const program = new Command();

program
    .name('anydownload')
    .description('Download websites for offline browsing')
    .version(version);

// Default command: anydownload example.com  OR  anydownload https://example.com
const downloadCmd = addDownloadOptions(
    program
        .command('download', { isDefault: true })
        .description('Download a website (default)')
        .argument('[url]', 'URL to download (e.g. example.com or https://example.com)')
);

downloadCmd.action(async (url) => {
    const opts = downloadCmd.opts();

    if (opts.gui) {
        startGui();
        return;
    }

    let runOpts = { ...opts };
    if (opts.output !== undefined) runOpts.output = opts.output;

    if (opts.wizard || !url) {
        const answers = await runWizard();
        url = answers.url;
        runOpts = { ...opts, ...answers, output: answers.output };
    }

    if (url) {
        if (runOpts.path) {
            await runPathDiscovery(url, runOpts);
        } else {
            await runDownload(url, runOpts);
        }
    } else {
        downloadCmd.help();
    }
});

program
    .command('serve')
    .description('Serve a downloaded folder over HTTP (for SPA offline preview)')
    .argument('<folder>', 'Path to downloaded site folder')
    .option('-p, --port <port>', 'Port number', '8765')
    .option('--no-open', 'Do not open browser')
    .action(async (folder, opts) => {
        await runServe(folder, opts);
    });

program
    .command('advanced')
    .description('Advanced download options')
    .argument('<url>', 'URL to download')
    .option('-o, --output <dir>', 'Output folder', 'downloaded_site')
    .option('--proxy <url>', 'Proxy server URL')
    .option('--type <type>', 'Resource type: all|image|css|js|html|media|font', 'all')
    .option('--retry <n>', 'Retry count', '3')
    .option('--timeout <ms>', 'Request timeout', '30000')
    .action(async (url, opts) => {
        await runDownload(url, {
            ...downloadCmd.opts(),
            ...opts,
            preset: 'page',
            output: opts.output
        });
    });

program.parse(process.argv);
