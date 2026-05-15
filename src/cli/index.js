#!/usr/bin/env node

const { program } = require('commander');
const ora = require('ora').default;
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const inquirerImport = require('inquirer');
const cosmiconfig = require('cosmiconfig').cosmiconfigSync;
const { version } = require('../../package.json');
const { SiteDownloader } = require('../downloader');
const { applyPreset } = require('./presets');

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
    openIndex: 'Open homepage in browser?',
    homepage: 'Homepage:'
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
        engineMode: merged.autoDynamic === false || merged.autoDynamic === 'false'
            ? 'static'
            : (merged.engineMode || (merged.dynamic === true ? 'render' : 'auto')),
        dynamic: merged.dynamic === true,
        autoDynamic: merged.autoDynamic !== false && merged.autoDynamic !== 'false',
        browserType: merged.browser || merged.browserType || 'puppeteer',
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
        onError: merged.onError
    };
}

async function runWizard() {
    const answers = await inquirer.prompt([
        { type: 'input', name: 'url', message: MSG.provideUrl },
        {
            type: 'list',
            name: 'preset',
            message: 'Download mode:',
            choices: [
                { name: 'Single page + assets', value: 'page' },
                { name: 'Full site (depth 2)', value: 'full' },
                { name: 'Mirror (depth 5)', value: 'mirror' }
            ]
        },
        { type: 'input', name: 'output', message: 'Output folder:', default: 'downloaded_site' },
        {
            type: 'list',
            name: 'browser',
            message: 'Browser engine:',
            choices: ['puppeteer', 'playwright']
        }
    ]);
    return answers;
}

async function runDownload(url, opts) {
    url = normalizeInputUrl(url);
    if (!url) {
        console.error(MSG.provideUrl);
        process.exit(1);
    }

    const downloaderOpts = buildDownloaderOptions(opts);
    const downloader = new SiteDownloader(downloaderOpts);
    const spinner = ora(MSG.downloading + url).start();
    const startTime = Date.now();

    try {
        const result = await downloader.downloadWebsite(url);
        spinner.succeed(MSG.done);
        console.log(`${MSG.saved} ${result.outputDir}`);
        console.log(`\n${MSG.summary}:`);
        console.log(`${MSG.success}: ${result.successCount}`);
        console.log(`${MSG.fail}: ${result.failCount}`);
        console.log(`${MSG.size}: ${(result.downloadedBytes / 1024).toFixed(1)} KB`);
        console.log(`${MSG.time}: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

        const hostDir = new URL(url).host.replace(/[:\/\\]/g, '_');
        let homepage = path.join(opts.output || 'downloaded_site', hostDir, 'index.html');
        if (!(await fs.pathExists(homepage))) {
            const files = (await fs.readdir(result.outputDir)).filter(f => f.endsWith('.html'));
            if (files.length) homepage = path.join(result.outputDir, files[0]);
        }
        console.log(`${MSG.homepage} ${homepage}`);

        if (result.failedResources.length) {
            console.log('\n' + MSG.failedList);
            result.failedResources.forEach(r => console.log(r.url || r));
        }

        if (opts.open && homepage && await fs.pathExists(homepage)) {
            const cmd = process.platform === 'win32'
                ? `start "" "${homepage}"`
                : process.platform === 'darwin'
                    ? `open "${homepage}"`
                    : `xdg-open "${homepage}"`;
            exec(cmd);
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

program
    .name('anydownload')
    .description('Download websites for offline browsing')
    .version(version)
    .argument('[url]', 'URL to download')
    .option('-o, --output <dir>', 'Output folder', config.output || 'downloaded_site')
    .option('--preset <name>', 'Preset: page | full | mirror', config.preset || 'page')
    .option('--wizard', 'Interactive setup wizard')
    .option('--gui', 'Start web GUI')
    .option('-r, --recursive', 'Download linked pages')
    .option('-m, --max-depth <n>', 'Recursion depth', '1')
    .option('-d, --dynamic', 'Force render engine (headless browser)')
    .option('--engine-mode <mode>', 'static | render | auto (default: auto)', 'auto')
    .option('--no-auto-dynamic', 'Use static engine only (same as --engine-mode static)')
    .option('--browser <engine>', 'Render backend: puppeteer | playwright', config.browser || 'puppeteer')
    .option('--browser-engine <name>', 'chromium | firefox | webkit', 'chromium')
    .option('--wait <ms>', 'Extra wait after page load', '2000')
    .option('--sitemap', 'Use sitemap + generate sitemap.xml.gz')
    .option('--ignore-robots', 'Ignore robots.txt')
    .option('-v, --verbose', 'Verbose output')
    .option('--concurrency <n>', 'Concurrent downloads', '5')
    .option('--delay <ms>', 'Delay between downloads', '500')
    .option('--filter <regex>', 'Filter URLs by regex')
    .option('--open', 'Open homepage after download')
    .option('--headless', 'Headless browser', true);

program
    .command('advanced')
    .description('Advanced download options')
    .argument('<url>', 'URL to download')
    .option('-o, --output <dir>', 'Output folder', 'downloaded_site')
    .option('--proxy <url>', 'Proxy server URL')
    .option('--type <type>', 'Resource type: all|image|css|js|html|media', 'all')
    .option('--retry <n>', 'Retry count', '3')
    .option('--timeout <ms>', 'Request timeout', '30000')
    .action(async (url, opts) => {
        await runDownload(url, {
            ...program.opts(),
            ...opts,
            preset: 'page',
            output: opts.output
        });
    });

const parsed = program.parse(process.argv);
const opts = program.opts();
const subcommand = parsed.args[0] === 'advanced' ? 'advanced' : null;
let url = subcommand === 'advanced' ? parsed.args[1] : parsed.args[0];

if (opts.gui) {
    startGui();
    process.exit(0);
}

(async () => {
    if (subcommand === 'advanced') return;

    let runOpts = { ...opts, output: opts.output };

    if (opts.wizard || !url) {
        const answers = await runWizard();
        url = answers.url;
        runOpts = { ...runOpts, ...answers };
    }

    if (url) {
        await runDownload(url, runOpts);
    } else {
        program.help();
    }
})();
