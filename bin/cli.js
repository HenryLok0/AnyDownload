#!/usr/bin/env node

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
const pkg = require('../package.json');
const { program } = require('commander');
const { version } = require('../package.json');

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
    pause: 'Press "p" to pause, "r" to resume, "c" to cancel.',
    updateAvailable: 'Update available! Run npm install -g anydownload to update.',
    proxyError: 'Proxy server error:',
    speedLimit: 'Speed limit:',
    resumeDownload: 'Resume download:',
    sitemapGenerated: 'Sitemap generated:',
    validationError: 'Resource validation error:',
    cleaningUrls: 'Cleaning URLs...',
    parallelLimit: 'Parallel download limit:',
    timeout: 'Timeout:',
    retryDelay: 'Retry delay:',
    maxFileSize: 'Maximum file size:',
    validateSSL: 'SSL validation:',
    followRedirects: 'Follow redirects:',
    maxRedirects: 'Maximum redirects:',
    keepOriginalUrls: 'Keep original URLs:',
    cleanUrls: 'Clean URLs:',
    ignoreErrors: 'Ignore errors:'
};

let config = {};
try {
    const explorer = cosmiconfig('websitedownloader');
    const result = explorer.search();
    if (result && result.config) config = result.config;
} catch {}

// Create CLI program
program
    .version(version)
    .description('A powerful website downloader')
    .argument('[url]', 'URL to download')
    .option('--gui', 'Start the web graphical interface')
    .option('-o, --output <dir>', 'Custom output folder', config.output || 'downloaded_site')
    .option('-r, --recursive', 'Recursively download same-domain pages', config.recursive || false)
    .option('-m, --max-depth <number>', 'Set recursion depth', config['max-depth'] || 1)
    .option('-t, --type <type>', 'Download specific resource types', config.type || 'all')
    .option('-d, --dynamic', 'Enable dynamic mode', config.dynamic || false)
    .option('-v, --verbose', 'Show detailed logs', config.verbose || false)
    .option('--ignore-robots', 'Ignore robots.txt', config['ignore-robots'] || false)
    .option('--retry <number>', 'Retry count for failed downloads', config.retry || 3)
    .option('--concurrency <number>', 'Maximum concurrent downloads', config.concurrency || 5)
    .option('--delay <number>', 'Delay between downloads (ms)', config.delay || 1000)
    .option('--filter <regex>', 'Regex to filter resource URLs', config.filter)
    .option('--headless', 'Use headless browser', config.headless !== false)
    .option('--browser <type>', 'Choose browser engine (puppeteer/playwright)', config.browser || 'puppeteer')
    .option('--proxy <url>', 'Use proxy server', config.proxy)
    .option('--speed-limit <number>', 'Download speed limit (KB/s)', config.speedLimit || 0)
    .option('--resume', 'Enable resume download', config.resumeDownload || false)
    .option('--sitemap', 'Generate sitemap', config.sitemapEnabled || false)
    .option('--timeout <number>', 'Request timeout (ms)', config.timeout || 30000)
    .option('--max-file-size <number>', 'Maximum file size (MB)', config.maxFileSize || 0)
    .option('--retry-delay <number>', 'Retry delay (ms)', config.retryDelay || 1000)
    .option('--no-validate-ssl', 'Disable SSL validation', config.validateSSL !== false)
    .option('--no-follow-redirects', 'Disable redirect following', config.followRedirects !== false)
    .option('--max-redirects <number>', 'Maximum redirects', config.maxRedirects || 5)
    .option('--keep-original-urls', 'Keep original URLs', config.keepOriginalUrls || false)
    .option('--clean-urls', 'Clean URLs', config.cleanUrls || false)
    .option('--ignore-errors', 'Ignore errors', config.ignoreErrors || false)
    .option('--parallel-limit <number>', 'Parallel download limit', config.parallelLimit || 5);

// Parse arguments first
program.parse(process.argv);

const options = program.opts();
const urlArgument = program.args[0]; // Get the URL argument if provided

// If --gui is enabled, start the web GUI and open browser
if (options.gui) {
    console.log('Starting web GUI...');
    // Use spawn to run the web-gui.js as a detached process
    const { spawn } = require('child_process');
    const webGuiPath = path.join(__dirname, '..', 'web-gui.js');
    console.log('Web GUI path:', webGuiPath);
    
    // Create a promise to wait for the server to start
    const serverStarted = new Promise((resolve) => {
        const guiProcess = spawn('node', [webGuiPath], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let port = 3000;
        guiProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);
            if (output.includes('Web GUI running at http://localhost:')) {
                const match = output.match(/http:\/\/localhost:(\d+)/);
                if (match) {
                    port = parseInt(match[1]);
                    resolve(port);
                }
            }
        });

        guiProcess.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        guiProcess.unref();
    });

    // Wait for server to start and then open browser
    serverStarted.then((port) => {
        const url = `http://localhost:${port}`;
        console.log(`Opening browser at ${url}...`);
        let command;
        if (process.platform === 'win32') {
            command = `start "" "${url}"`;
        } else if (process.platform === 'darwin') {
            command = `open "${url}"`;
        } else {
            command = `xdg-open "${url}"`;
        }
        exec(command, (error) => {
            if (error) {
                console.error(`Failed to open browser: ${error}`);
            }
        });
    });

    // Exit the main process immediately
    process.exit(0);
} else {
    // Original download logic
    async function runDownload(url) {
        if (!url) {
            const answer = await inquirer.prompt([{ type: 'input', name: 'url', message: MSG.provideUrl }]);
            url = answer.url;
        }

        if (!url) {
            console.error(MSG.provideUrl);
            process.exit(1);
        }

        // Ensure URL has protocol
        if (typeof url === 'string' && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const downloader = new Downloader({
            ...options,
            userAgent: options['user-agent'] || config['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            cookie: options.cookie || config.cookie,
            outputDir: options.output,
            verbose: options.verbose,
            recursive: options.recursive,
            maxDepth: parseInt(options.maxDepth),
            type: options.type,
            dynamic: options.dynamic,
            ignoreRobots: options.ignoreRobots,
            retry: parseInt(options.retry),
            concurrency: parseInt(options.concurrency),
            delay: parseInt(options.delay),
            filterRegex: options.filter,
            headless: options.headless,
            browserType: options.browser,
            proxy: options.proxy,
            speedLimit: parseInt(options.speedLimit),
            resumeDownload: options.resume,
            sitemapEnabled: options.sitemap,
            timeout: parseInt(options.timeout),
            maxFileSize: parseInt(options.maxFileSize) * 1024 * 1024,
            retryDelay: parseInt(options.retryDelay),
            validateSSL: options.validateSSL,
            followRedirects: options.followRedirects,
            maxRedirects: parseInt(options.maxRedirects),
            keepOriginalUrls: options.keepOriginalUrls,
            cleanUrls: options.cleanUrls,
            ignoreErrors: options.ignoreErrors,
            parallelLimit: parseInt(options.parallelLimit)
        });

        const spinner = ora(MSG.downloading + url).start();
        const startTime = Date.now();

        try {
            await downloader.downloadWebsite(url);
            spinner.succeed(MSG.done);
            console.log(`${MSG.saved} ${options.output}`);
            
            // Summary
            console.log(`\n${MSG.summary}`);
            console.log(`${MSG.total}: ${downloader.successCount + downloader.failCount}`);
            console.log(`${MSG.success}: ${downloader.successCount}`);
            console.log(`${MSG.fail}: ${downloader.failCount}`);
            console.log(`${MSG.size}: ${(downloader.downloadedBytes / 1024).toFixed(1)} KB`);
            console.log(`${MSG.time}: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            
            // Homepage path (fix: use host subfolder)
            const urlObj = new URL(url); // Parse the URL
            const hostDir = urlObj.host.replace(/[:\/\\]/g, '_'); // Replace invalid chars
            const indexPath = path.join(options.output, hostDir, 'index.html'); // Correct homepage path
            console.log(`${MSG.homepage} ${indexPath}`);
            
            // Open homepage
            let openHome = options.open;
            // Check if options.open is explicitly set (true or false), otherwise prompt
            if (options.open === undefined) {
                 const answer = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'open',
                    message: MSG.openIndex,
                    default: false
                }]);
                openHome = answer.open;
            }
            
            if (openHome) {
                // Check if index.html exists
                if (!fs.existsSync(indexPath)) {
                    console.log('[DEBUG] index.html not found, cannot open homepage.'); // Debug output
                } else {
                    // Windows: use original path, do not replace backslash
                    if (process.platform === 'win32') {
                        console.log('[DEBUG] Opening homepage on Windows:', indexPath); // Debug output
                        exec(`start "" "${indexPath}"`);
                    } else if (process.platform === 'darwin') {
                        console.log('[DEBUG] Opening homepage on macOS:', indexPath); // Debug output
                        exec(`open "${indexPath}"`);
                    } else {
                        console.log('[DEBUG] Opening homepage on Linux:', indexPath); // Debug output
                        exec(`xdg-open "${indexPath}"`);
                    }
                }
            }
            
            // Failed list
            if (downloader.failedResources.length) {
                console.log('\n' + MSG.failedList);
                downloader.failedResources.forEach(r => {
                    if (options.verbose && r.error) {
                        console.log(`${r.url} (${r.error})`);
                    } else {
                        console.log(r.url || r);
                    }
                });
            }
        } catch (error) {
            spinner.fail('Download failed: ' + (error.message || error));
            process.exit(1);
        }
    }
    // Run the download logic with the provided URL argument
    runDownload(urlArgument);
}

// Removed original program.parse(process.argv) call here