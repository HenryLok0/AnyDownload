const { Downloader, checkNeedDynamic } = require('../src/downloader');
const yargs = require('yargs');
const ora = require('ora').default;
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs-extra');
const inquirerImport = require('inquirer');
const cosmiconfig = require('cosmiconfig').cosmiconfigSync;
const chalk = require('chalk');

// Compatible with inquirer v8/v9
const inquirer = inquirerImport.prompt ? inquirerImport : inquirerImport.default;

const MSG = {
    provideUrl: 'Please enter the website URL to download:',
    checking: 'Checking website type...',
    detectedDynamic: 'Dynamic site detected, using browser rendering...',
    detectedStatic: 'Static site detected, downloading directly...',
    downloading: 'Downloading: ',
    done: 'Website download complete!',
    saved: 'All content saved to',
    failedList: 'Failed resources:',
    summary: 'Summary:',
    total: 'Total',
    success: 'Success',
    fail: 'Fail',
    size: 'Total size',
    time: 'Elapsed',
    robots: 'Checking robots.txt...',
    robotsBlocked: 'Blocked by robots.txt, skipped (use --ignore-robots to override)',
    disk: 'Checking disk space...',
    diskLow: 'Low disk space, aborting download.',
    openIndex: 'Open homepage in browser after download?',
    homepage: 'Homepage path:',
    pause: 'Press "p" to pause, "r" to resume, "c" to cancel.'
};

let config = {};
try {
    const explorer = cosmiconfig('websitedownloader');
    const result = explorer.search();
    if (result && result.config) config = result.config;
} catch {}

const argv = yargs
    .usage('Usage: $0 <website-url> [options]')
    .option('delay', { alias: 'd', type: 'number', description: 'Delay between downloads (ms)', default: config.delay || 1000 })
    .option('user-agent', { alias: 'u', type: 'string', description: 'User-Agent', default: config['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })
    .option('auto', { alias: 'A', type: 'boolean', description: 'Auto detect static/dynamic', default: config.auto !== undefined ? config.auto : true })
    .option('recursive', { alias: 'r', type: 'boolean', description: 'Recursively download same-domain pages', default: config.recursive || false })
    .option('max-depth', { alias: 'm', type: 'number', description: 'Max recursion depth', default: config['max-depth'] || 1 })
    .option('cookie', { type: 'string', description: 'Cookie', default: config.cookie })
    .option('output', { alias: 'o', type: 'string', description: 'Custom output folder', default: config.output })
    .option('verbose', { type: 'boolean', description: 'Show verbose log', default: config.verbose || false })
    .option('ignore-robots', { type: 'boolean', description: 'Ignore robots.txt', default: config['ignore-robots'] || false })
    .option('retry', { type: 'number', description: 'Retry count for failed downloads', default: config.retry || 3 })
    .option('type', { type: 'string', description: 'Download only specific resource types (image,css,js,html,media,all)', default: config.type || 'all' })
    .option('open', { type: 'boolean', description: 'Open homepage after download', default: config.open || false })
    .option('concurrency', { type: 'number', description: 'Max concurrent downloads', default: config.concurrency || 5 })
    .option('filter', { type: 'string', description: 'Regex to filter resource URLs', default: config.filter })
    .option('headless', { type: 'boolean', description: 'Use headless browser', default: config.headless !== false })
    .option('browser', { type: 'string', description: 'Browser type (puppeteer/playwright)', default: config.browser || 'puppeteer' })
    .help()
    .argv;

async function getUrlIfMissing(url) {
    if (url) return url;
    const answer = await inquirer.prompt([{ type: 'input', name: 'url', message: MSG.provideUrl }]);
    return answer.url;
}

(async () => {
    let url = await getUrlIfMissing(argv._[0]);
    if (!url) {
        console.error(MSG.provideUrl);
        process.exit(1);
    }

    const outputDir = argv.output || 'downloaded_site';
    const host = new URL(url).host.replace(/[:\/\\]/g, '_');
    const folder = path.join(outputDir, host);

    // New: If the folder already exists, delete it first
    if (fs.existsSync(folder)) {
        try {
            await fs.remove(folder);
            console.log(`已刪除舊的資料夾：${folder}`);
        } catch (err) {
            console.error(`刪除資料夾失敗：${folder}`, err);
            process.exit(1);
        }
    }

    const spinner = ora(MSG.downloading + url).start();
    const startTime = Date.now();

    // Disk space check (only available on Linux)
    spinner.text = MSG.disk;
    try {
        if (os.platform() === 'linux' && fs.statvfs) {
            const stat = await fs.statvfs(folder);
            if (stat && stat.f_bavail * stat.f_frsize < 100 * 1024 * 1024) {
                spinner.fail(MSG.diskLow);
                process.exit(1);
            }
        }
    } catch {}

    // robots.txt check
    if (!argv['ignore-robots']) {
        spinner.text = MSG.robots;
        try {
            const robotsUrl = new URL('/robots.txt', url).href;
            const res = await require('axios').get(robotsUrl, { timeout: 5000 });
            if (res.status === 200 && res.data.includes('Disallow: /')) {
                spinner.warn(MSG.robotsBlocked);
                process.exit(0);
            }
        } catch {}
    }

    let dynamic = false;
    if (argv.auto) {
        spinner.text = MSG.checking;
        dynamic = await checkNeedDynamic(url, argv['user-agent']);
        spinner.text = dynamic ? MSG.detectedDynamic : MSG.detectedStatic;
    } else {
        dynamic = argv.dynamic;
    }

    // Log file
    const logFile = path.join(folder, 'download.log');
    function log(msg) {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    }

    // Report
    const reportFile = path.join(folder, 'report.html');
    function writeReport(downloader) {
        const html = `
        <html><head><title>Download Report</title></head><body>
        <h1>Download Report</h1>
        <ul>
            <li>Total: ${downloader.successCount + downloader.failCount}</li>
            <li>Success: ${downloader.successCount}</li>
            <li>Fail: ${downloader.failCount}</li>
            <li>Total size: ${(downloader.downloadedBytes / 1024).toFixed(1)} KB</li>
        </ul>
        <h2>Failed Resources</h2>
        <ul>
            ${downloader.failedResources.map(r => `<li>${r.url} (${r.error})</li>`).join('')}
        </ul>
        </body></html>
        `;
        fs.writeFileSync(reportFile, html);
    }

    const downloader = new Downloader({
        delay: argv.delay,
        userAgent: argv['user-agent'],
        dynamic,
        recursive: argv.recursive,
        maxDepth: argv['max-depth'],
        cookie: argv.cookie,
        outputDir,
        verbose: argv.verbose,
        retry: argv.retry,
        type: argv.type,
        gzip: true,
        concurrency: argv.concurrency,
        filterRegex: argv.filter,
        headless: argv.headless,
        browserType: argv.browser,
        onResource: (resourceUrl, idx, total, speed, eta) => {
            let barMsg = `(${idx}/${total}) ${resourceUrl}`;
            if (speed) barMsg += ` | ${chalk.cyan(speed + '/s')}`;
            if (eta) barMsg += ` | ETA: ${chalk.yellow(eta + 's')}`;
            spinner.text = barMsg;
            if (argv.verbose) log(barMsg);
        },
        onError: (errMsg) => {
            if (argv.verbose) log('[ERROR] ' + errMsg);
        }
    });

    // CLI pause/resume/cancel
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    console.log(MSG.pause);
    process.stdin.on('data', key => {
        if (key === 'p') {
            downloader.pause();
            spinner.text = 'Paused...';
        } else if (key === 'r') {
            downloader.resume();
            spinner.text = 'Resumed...';
        } else if (key === 'c') {
            downloader.cancel();
            spinner.fail('Cancelled by user.');
            process.exit(0);
        } else if (key === '\u0003') {
            process.exit();
        }
    });

    try {
        await downloader.downloadWebsite(url);
        spinner.succeed(MSG.done);
        writeReport(downloader);
        console.log(`${MSG.saved} ${folder}`);
        // Summary
        console.log(`\n${MSG.summary}`);
        console.log(`${MSG.total}: ${downloader.successCount + downloader.failCount}`);
        console.log(`${MSG.success}: ${downloader.successCount}`);
        console.log(`${MSG.fail}: ${downloader.failCount}`);
        console.log(`${MSG.size}: ${(downloader.downloadedBytes / 1024).toFixed(1)} KB`);
        console.log(`${MSG.time}: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        // Homepage path
        const indexPath = path.join(folder, 'index.html');
        console.log(`${MSG.homepage} ${indexPath}`);
        // Open homepage
        let openHome = argv.open;
        if (!argv.open) {
            const answer = await inquirer.prompt([{
                type: 'confirm',
                name: 'open',
                message: MSG.openIndex,
                default: false
            }]);
            openHome = answer.open;
        }
        if (openHome) {
            const openPath = process.platform === 'win32' ? indexPath.replace(/\\/g, '/') : indexPath;
            if (process.platform === 'win32') {
                exec(`start "" "${openPath}"`);
            } else if (process.platform === 'darwin') {
                exec(`open "${openPath}"`);
            } else {
                exec(`xdg-open "${openPath}"`);
            }
        }
        // Failed list
        if (downloader.failedResources.length) {
            console.log('\n' + MSG.failedList);
            downloader.failedResources.forEach(r => {
                if (argv.verbose && r.error) {
                    console.log(`${r.url} (${r.error})`);
                } else {
                    console.log(r.url || r);
                }
            });
        }
        if (argv.verbose) log('Download finished.');
    } catch (error) {
        spinner.fail('Download failed: ' + (error.message || error));
        log('[FATAL] ' + (error.message || error));
        process.exit(1);
    }
})();