const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { SiteDownloader } = require('./src/downloader');
const PathDiscovery = require('./src/discovery/PathDiscovery');
const PathMapper = require('./src/downloader/storage/PathMapper');
const TaskManager = require('./src/core/TaskManager');
const { startPreview } = require('./src/server/PreviewServer');
const { setMainLocale, mainT } = require('./src/main/mainLocales');

const isDev = process.env.NODE_ENV === 'development';

/** User may type "example.com"; PathDiscovery normalizes with URL() and needs a scheme. */
function ensureHttpScheme(url) {
    const s = typeof url === 'string' ? url.trim() : '';
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
}

/** Avoid quit/relaunch loop while closing local preview HTTP server */
let allowAppQuitAfterPreviewDrain = false;

/**
 * Relative output must stay under root (blocks `..` escapes). Same idea as PreviewServer.isPathUnderRoot.
 */
function isPathUnderRoot(rootDir, candidateAbs) {
    const root = path.resolve(rootDir);
    const c = path.resolve(candidateAbs);
    if (process.platform === 'win32') {
        const rl = root.toLowerCase();
        const cl = c.toLowerCase();
        const sep = path.sep;
        return cl === rl || cl.startsWith(rl.endsWith(sep) ? rl : rl + sep);
    }
    const sep = path.sep;
    return c === root || c.startsWith(root + sep);
}

/** Fixed under Documents — stable across portable .exe cwd changes */
function getGuiDocumentOutputRoot() {
    return path.join(app.getPath('documents'), 'AnyDownload', 'output');
}

/**
 * Search `path.txt` here in GUI (CLI still defaults to process.cwd via PathDiscovery.pathTxtSearchDir).
 */
function getGuiPathTxtSearchDir() {
    return path.join(app.getPath('documents'), 'AnyDownload');
}

/**
 * Sidebar / downloader output: absolute paths untouched; relatives live under Documents/AnyDownload/output
 */
function resolveOutputPathForGui(userInput, fallbackRelName = 'downloaded_site') {
    const trimmed = userInput != null ? String(userInput).trim() : '';
    const rel = trimmed || fallbackRelName;
    if (path.isAbsolute(rel)) {
        return path.normalize(rel);
    }
    const root = getGuiDocumentOutputRoot();
    const resolved = path.normalize(path.join(root, rel));
    if (!isPathUnderRoot(root, resolved)) {
        throw new Error(`Output folder must stay under: ${root}`);
    }
    return resolved;
}

function legacyOutputFallbackForMigrate(t) {
    if (t.mode === 'discovery') return 'discovery_results';
    const o = t.outputDir != null ? String(t.outputDir).replace(/\\/g, '/').trim() : '';
    const base = o.split('/').filter(Boolean).pop() || o;
    if (base === 'discovery_results' || o === 'discovery_results' || o.endsWith('/discovery_results')) {
        return 'discovery_results';
    }
    return 'downloaded_site';
}

let mainWindow;
let taskManager;

/** taskId → active SiteDownloader (Stop / concurrent jobs) */
const activeDownloadsByTaskId = new Map();
/** taskId → AbortController for path-discovery (Stop cancels axios + crawl loops) */
const activeDiscoveryAbortByTaskId = new Map();

function isCancelledOrAbortLike(err, abortSignalMaybe) {
    if (abortSignalMaybe && abortSignalMaybe.aborted) return true;
    if (!err) return false;
    if (err.code === 'CANCELLED' || err.code === 'ERR_CANCELED') return true;
    if (err.name === 'CanceledError' || err.name === 'AbortError') return true;
    return Boolean(err.message && /cancel/i.test(err.message));
}

/** Live HTTP preview (`anydownload serve`); replaced or stopped on quit */
let previewServerInstance = null;

const PREVIEW_PORT = parseInt(process.env.ANYDOWNLOAD_PREVIEW_PORT || '8765', 10) || 8765;

/**
 * Persisted tasks may carry legacy cwd-relative folders; remap to Documents/AnyDownload/output
 */
function migrateLegacyRelativeOutputDirs() {
    try {
        for (const t of taskManager.getTasks()) {
            if (!t.outputDir || path.isAbsolute(t.outputDir)) continue;
            const fallback = legacyOutputFallbackForMigrate(t);
            taskManager.updateTask(t.id, { outputDir: resolveOutputPathForGui(t.outputDir, fallback) });
        }
    } catch (e) {
        console.error('migrateLegacyRelativeOutputDirs:', e);
    }
}

async function warnIfPlaywrightBrowserMissing(parentWin) {
    if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) return;
    try {
        const { chromium } = require('playwright');
        const exe = chromium.executablePath();
        if (exe && fs.existsSync(exe)) return;
    } catch (_) {
        /* chromium pack / path missing */
    }
    if (!parentWin) return;
    const installCmd = 'npx playwright install chromium';
    const { response } = await dialog.showMessageBox(parentWin, {
        type: 'warning',
        title: mainT('playwrightBrowserMissingTitle'),
        message: mainT('playwrightBrowserMissingMessage'),
        detail: mainT('playwrightBrowserMissingDetail', { cmd: installCmd }),
        buttons: [mainT('playwrightBtnOk'), mainT('playwrightBtnCopy')]
    });
    if (response === 1) {
        clipboard.writeText(installCmd);
    }
}

/** Graceful teardown of preview listener (Windows portable cwd irrelevant). */
function registerPreviewGracefulQuit() {
    app.on('before-quit', (event) => {
        if (!previewServerInstance || allowAppQuitAfterPreviewDrain) return;
        event.preventDefault();
        const srv = previewServerInstance;
        previewServerInstance = null;
        srv.stop()
            .catch(() => {})
            .finally(() => {
                allowAppQuitAfterPreviewDrain = true;
                app.quit();
            });
    });
    app.on('will-quit', () => {
        allowAppQuitAfterPreviewDrain = false;
    });
}

async function createWindow() {
    Menu.setApplicationMenu(null); // Hide default menu

    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        title: 'AnyDownload',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

registerPreviewGracefulQuit();

app.whenReady().then(() => {
    taskManager = new TaskManager(app.getPath('userData'));
    try {
        fs.mkdirSync(getGuiDocumentOutputRoot(), { recursive: true });
        fs.mkdirSync(getGuiPathTxtSearchDir(), { recursive: true });
    } catch (e) {
        console.error('mkdir GUI output root:', e);
    }
    migrateLegacyRelativeOutputDirs();

    createWindow();
    setTimeout(() => {
        warnIfPlaywrightBrowserMissing(mainWindow).catch(() => {});
    }, 1500);

    // IPC bridge
    ipcMain.on('set-app-locale', (_event, loc) => setMainLocale(loc));

    ipcMain.handle('get-tasks', () => {
        return taskManager.getTasks();
    });

    ipcMain.handle('get-gui-output-hints', () => ({
        documentOutputRoot: getGuiDocumentOutputRoot(),
        pathTxtSearchDir: getGuiPathTxtSearchDir(),
        defaultDownloadFolderName: 'downloaded_site'
    }));

    ipcMain.handle('open-task-folder', async (event, folderPath) => {
        if (folderPath && fs.existsSync(folderPath)) {
            await shell.openPath(folderPath);
            return true;
        }
        return false;
    });

    /** Same resolver as downloader; mkdir then open Explorer / Finder */
    ipcMain.handle('open-gui-output-folder', async (_event, userInput) => {
        try {
            const abs = resolveOutputPathForGui(userInput, 'downloaded_site');
            fs.mkdirSync(abs, { recursive: true });
            const openErr = await shell.openPath(abs);
            return { ok: !openErr, error: typeof openErr === 'string' && openErr.length > 0 ? openErr : undefined };
        } catch (pathErr) {
            const msg = pathErr && pathErr.message ? pathErr.message : String(pathErr);
            if (mainWindow) {
                dialog.showErrorBox(mainT('openOutputFolderFailed'), msg);
            }
            return { ok: false, error: msg };
        }
    });

    ipcMain.handle('export-tasks', async (event, taskIds) => {
        if (!mainWindow) return false;
        
        const tasksToExport = taskManager.getTasks().filter(t => taskIds.includes(t.id));
        if (tasksToExport.length === 0) return false;

        const result = await dialog.showSaveDialog(mainWindow, {
            title: mainT('exportTasksZipTitle'),
            defaultPath: 'AnyDownload_Export.zip',
            filters: [{ name: mainT('exportZipFilterName'), extensions: ['zip'] }]
        });

        if (result.canceled || !result.filePath) return false;

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(result.filePath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve(true));
            archive.on('error', (err) => reject(err));

            archive.pipe(output);

            for (const t of tasksToExport) {
                if (fs.existsSync(t.outputDir)) {
                    // Place each task's files in a subfolder named after the URL or ID
                    const folderName = t.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '_' + t.id.substring(0, 4);
                    archive.directory(t.outputDir, folderName);
                }
            }

            archive.finalize();
        });
    });

    ipcMain.handle('delete-tasks', async (event, taskIds) => {
        if (!mainWindow || !taskIds || taskIds.length === 0) return false;

        const tasksToDelete = taskManager.getTasks().filter(t => taskIds.includes(t.id));
        if (tasksToDelete.length === 0) return false;

        const result = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: mainT('deleteTasksTitle'),
            message: mainT('deleteTasksMessage', { count: tasksToDelete.length }),
            detail: mainT('deleteTasksDetail'),
            buttons: [
                mainT('btnCancel'),
                mainT('btnRemoveListOnly'),
                mainT('btnDeleteFilesAndRemove')
            ],
            defaultId: 0,
            cancelId: 0
        });

        if (result.response === 0) return false; // Cancelled

        const deleteFiles = result.response === 2;

        for (const t of tasksToDelete) {
            if (deleteFiles && fs.existsSync(t.outputDir)) {
                try {
                    fs.rmSync(t.outputDir, { recursive: true, force: true });
                } catch (e) {
                    console.error('Failed to delete folder:', e);
                }
            }
            taskManager.removeTask(t.id);
        }

        return true;
    });

    ipcMain.handle('select-folder', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            title: mainT('chooseFolderTitle'),
            properties: ['openDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    ipcMain.handle('select-file', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            title: mainT('chooseFileTitle'),
            properties: ['openFile'],
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    ipcMain.handle('cancel-all-downloads', async () => {
        const cancelledTaskIds = [...activeDownloadsByTaskId.keys()];
        cancelledTaskIds.forEach((tid) => {
            const downloader = activeDownloadsByTaskId.get(tid);
            if (downloader) downloader.cancel();
        });
        const cancelledDiscoveryTaskIds = [...activeDiscoveryAbortByTaskId.keys()];
        cancelledDiscoveryTaskIds.forEach((tid) => {
            const ctl = activeDiscoveryAbortByTaskId.get(tid);
            if (ctl) ctl.abort();
        });
        return { cancelledTaskIds, cancelledDiscoveryTaskIds };
    });

    ipcMain.handle('start-offline-preview', async (_event, folderPath) => {
        try {
            const root = resolveOutputPathForGui(folderPath != null ? folderPath : '', 'downloaded_site');
            await fs.promises.access(root).catch(() => {
                throw new Error(`Folder not found: ${root}`);
            });

            if (previewServerInstance) {
                await previewServerInstance.stop();
                previewServerInstance = null;
            }

            let result;
            try {
                result = await startPreview(root, { port: PREVIEW_PORT, open: false });
            } catch (firstErr) {
                if (firstErr && firstErr.code === 'EADDRINUSE') {
                    result = await startPreview(root, { port: 0, open: false });
                } else {
                    throw firstErr;
                }
            }
            previewServerInstance = result.server;
            const previewUrl = result.url;
            if (mainWindow) {
                await shell.openExternal(previewUrl);
            }
            return { ok: true, url: previewUrl };
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            if (mainWindow) {
                dialog.showErrorBox(mainT('previewFailed'), msg);
            }
            return { ok: false, error: msg };
        }
    });

    ipcMain.on('start-task', async (event, config) => {
        config = { ...config, url: ensureHttpScheme(config.url) };
        console.log('Main process received start-task:', config);

        let downloadOutAbs;
        let discoveryBaseAbs;
        try {
            downloadOutAbs = resolveOutputPathForGui(config.output || '', 'downloaded_site');
            discoveryBaseAbs = resolveOutputPathForGui('', 'discovery_results');
        } catch (pathErr) {
            const msg = pathErr && pathErr.message ? pathErr.message : String(pathErr);
            if (mainWindow) {
                dialog.showErrorBox(mainT('invalidOutputFolder'), msg);
            }
            return;
        }

        const initialOutputDir =
            config.mode === 'discovery' ? discoveryBaseAbs : downloadOutAbs;

        const task = taskManager.addTask({
            url: config.url,
            mode: config.mode,
            outputDir: initialOutputDir
        });

        if (mainWindow) {
            mainWindow.webContents.send('task-update', task);
        }

        if (config.mode === 'download') {
            const downloader = new SiteDownloader({
                outputDir: downloadOutAbs,
                preset: config.preset,
                mode: config.engineMode,
                extraWait: config.wait,
                browserType: config.browserType,
                headless: config.headless,
                maxDepth: config.maxDepth,
                recursive: config.recursive,
                useSitemap: config.useSitemap,
                ignoreRobots: config.ignoreRobots,
                legacyFlatPages: config.legacyFlatPages,
                concurrency: config.concurrency || 5,
                delay: config.delay || 500,
                timeout: config.timeout,
                type: config.type,
                onDownloadProgress: (p) => {
                    const total = Math.max(p.peakQueue || 0, p.queueLength || 0, 1);
                    const current = p.completed || 0;
                    const percent = p.percent != null ? p.percent : Math.round((current / total) * 100);

                    const updatedTask = taskManager.updateTask(task.id, {
                        percent: p.type === 'page-prepare' ? 0 : percent,
                        size: p.downloadedBytes ? `${(p.downloadedBytes / 1024 / 1024).toFixed(2)} MB` : task.size
                    });

                    if (mainWindow) {
                        mainWindow.webContents.send('task-update', updatedTask);
                        mainWindow.webContents.send('task-progress', {
                            status: p.type.includes('error') || p.success === false ? 'error' : (p.type.includes('start') ? 'downloading' : 'success'),
                            url: p.url || '',
                            size: p.downloadedBytes ? `${(p.downloadedBytes / 1024).toFixed(1)} KB` : '-',
                            downloadedBytesTotal: typeof p.downloadedBytes === 'number' ? p.downloadedBytes : undefined,
                            time: '-',
                            current,
                            total,
                            percent: p.type === 'page-prepare' ? 0 : percent,
                            phase: p.type
                        });
                    }
                },
                onError: (err) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('task-progress', {
                            status: 'error',
                            url: err.toString(),
                            size: '-',
                            time: '-'
                        });
                    }
                }
            });

            activeDownloadsByTaskId.set(task.id, downloader);

            try {
                const result = await downloader.downloadWebsite(config.url);
                const failCount = typeof result.failCount === 'number' ? result.failCount : 0;
                const mb = result.downloadedBytes
                    ? `${(result.downloadedBytes / 1024 / 1024).toFixed(2)} MB`
                    : '—';
                const updatedTask = taskManager.updateTask(task.id, {
                    status: 'success',
                    percent: 100,
                    outputDir: result.outputDir,
                    lastError: null,
                    resourceFailCount: failCount,
                    size: failCount > 0 ? `${mb} (${failCount})` : mb
                });
                if (mainWindow) {
                    mainWindow.webContents.send('task-update', updatedTask);
                    mainWindow.webContents.send('task-done', { success: true, taskId: task.id });
                }
            } catch (err) {
                const cancelled = Boolean(
                    err && (err.code === 'CANCELLED' || /cancel/i.test(err.message || ''))
                );
                const errMsg = err && err.message ? err.message : String(err);
                taskManager.updateTask(task.id, {
                    status: cancelled ? 'cancelled' : 'error',
                    lastError: cancelled ? null : errMsg
                });
                const finalTask = taskManager.getTasks().find((x) => x.id === task.id);
                if (mainWindow) {
                    if (finalTask) {
                        mainWindow.webContents.send('task-update', finalTask);
                    }
                    mainWindow.webContents.send('task-progress', {
                        status: cancelled ? 'cancelled' : 'error',
                        url: err.message || err.toString(),
                        size: '-',
                        time: '-'
                    });
                    mainWindow.webContents.send('task-done', {
                        success: false,
                        taskId: task.id,
                        cancelled,
                        error: cancelled ? undefined : (err.message || String(err))
                    });
                }
            } finally {
                activeDownloadsByTaskId.delete(task.id);
            }
        } else if (config.mode === 'discovery') {
            const discoveryAbort = new AbortController();
            activeDiscoveryAbortByTaskId.set(task.id, discoveryAbort);

            const discovery = new PathDiscovery({
                pathDeep: config.pathDeep,
                pathProbeDepth: config.pathProbeDepth,
                useRender: !config.pathNoRender,
                pathSeedsFile: config.pathSeeds || null,
                pathTxtOverride: config.pathTxt || null,
                pathTxtSearchDir: getGuiPathTxtSearchDir(),
                delay: config.delay || 500,
                concurrency: config.concurrency || 5,
                timeout: config.timeout,
                maxDepth: config.maxDepth,
                abortSignal: discoveryAbort.signal
            });

            try {
                if (mainWindow) {
                    mainWindow.webContents.send('task-progress', {
                        status: 'downloading',
                        url: config.url,
                        size: '-',
                        time: '-',
                        phase: 'discovery-start'
                    });
                }
                const results = await discovery.discover(config.url);
                const hostSlug = new PathMapper(config.url).getHostDir(config.url);
                const discoveryOutAbs = path.join(discoveryBaseAbs, hostSlug);
                await PathDiscovery.writeTxt(results, path.join(discoveryOutAbs, 'paths.txt'));

                const updatedTask = taskManager.updateTask(task.id, {
                    status: 'success',
                    percent: 100,
                    outputDir: discoveryOutAbs,
                    size: `${results.paths.length} paths`,
                    lastError: null,
                    resourceFailCount: 0
                });

                if (mainWindow) {
                    if (updatedTask) {
                        mainWindow.webContents.send('task-update', updatedTask);
                    }
                    mainWindow.webContents.send('task-progress', {
                        status: 'success',
                        url: `Path discovery: ${results.paths.length} URL(s) for ${config.url}`,
                        size: `${results.paths.length} paths`,
                        time: '-',
                        phase: 'discovery-complete',
                        total: results.paths.length,
                        current: results.paths.length,
                        percent: 100
                    });
                    mainWindow.webContents.send('task-done', { success: true, taskId: task.id });
                }
            } catch (err) {
                const cancelled = isCancelledOrAbortLike(err, discoveryAbort.signal);
                const errMsg = err && err.message ? err.message : String(err);
                taskManager.updateTask(task.id, {
                    status: cancelled ? 'cancelled' : 'error',
                    lastError: cancelled ? null : errMsg
                });
                const finalTask = taskManager.getTasks().find((x) => x.id === task.id);
                if (mainWindow) {
                    if (finalTask) {
                        mainWindow.webContents.send('task-update', finalTask);
                    }
                    mainWindow.webContents.send('task-progress', {
                        status: cancelled ? 'cancelled' : 'error',
                        url: err.message || err.toString(),
                        size: '-',
                        time: '-'
                    });
                    mainWindow.webContents.send('task-done', {
                        success: false,
                        taskId: task.id,
                        cancelled,
                        error: cancelled ? undefined : err.message || String(err)
                    });
                }
            } finally {
                activeDiscoveryAbortByTaskId.delete(task.id);
            }
        } else {
            const detail = `Unsupported mode: ${String(config.mode)}`;
            console.error('[AnyDownload]', detail);
            taskManager.updateTask(task.id, { status: 'error', size: detail, lastError: detail });
            const failTask = taskManager.getTasks().find((x) => x.id === task.id);
            if (mainWindow) {
                if (failTask) {
                    mainWindow.webContents.send('task-update', failTask);
                }
                mainWindow.webContents.send('task-progress', {
                    status: 'error',
                    url: detail,
                    size: '-',
                    time: '-'
                });
                mainWindow.webContents.send('task-done', {
                    success: false,
                    taskId: task.id,
                    error: detail
                });
            }
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
