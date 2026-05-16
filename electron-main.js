const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { SiteDownloader } = require('./src/downloader');
const PathDiscovery = require('./src/discovery/PathDiscovery');
const TaskManager = require('./src/core/TaskManager');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let taskManager;

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

app.whenReady().then(() => {
    taskManager = new TaskManager(app.getPath('userData'));
    createWindow();
    
    // IPC bridge
    ipcMain.handle('get-tasks', () => {
        return taskManager.getTasks();
    });

    ipcMain.handle('open-task-folder', async (event, folderPath) => {
        if (folderPath && fs.existsSync(folderPath)) {
            await shell.openPath(folderPath);
            return true;
        }
        return false;
    });

    ipcMain.handle('export-tasks', async (event, taskIds) => {
        if (!mainWindow) return false;
        
        const tasksToExport = taskManager.getTasks().filter(t => taskIds.includes(t.id));
        if (tasksToExport.length === 0) return false;

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Tasks as ZIP',
            defaultPath: 'AnyDownload_Export.zip',
            filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
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
            title: 'Delete Tasks',
            message: `Are you sure you want to delete ${tasksToDelete.length} task(s)?`,
            detail: 'You can choose to also delete the downloaded files from your disk.',
            buttons: ['Cancel', 'Remove from List Only', 'Delete Files and Remove'],
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

    ipcMain.on('start-task', async (event, config) => {
        console.log('Main process received start-task:', config);
        
        const task = taskManager.addTask({
            url: config.url,
            mode: config.mode,
            outputDir: config.mode === 'download' ? (config.output || 'downloaded_site') : 'discovery_results'
        });

        if (mainWindow) {
            mainWindow.webContents.send('task-update', task);
        }
        
        if (config.mode === 'download') {
            const downloader = new SiteDownloader({
                outputDir: config.output || 'downloaded_site',
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

            try {
                const result = await downloader.downloadWebsite(config.url);
                const updatedTask = taskManager.updateTask(task.id, { 
                    status: 'success', 
                    percent: 100,
                    outputDir: result.outputDir 
                });
                if (mainWindow) {
                    mainWindow.webContents.send('task-update', updatedTask);
                    mainWindow.webContents.send('task-done', { success: true });
                }
            } catch (err) {
                const updatedTask = taskManager.updateTask(task.id, { status: 'error' });
                if (mainWindow) {
                    mainWindow.webContents.send('task-update', updatedTask);
                    mainWindow.webContents.send('task-progress', {
                        status: 'error',
                        url: err.message || err.toString(),
                        size: '-',
                        time: '-'
                    });
                    mainWindow.webContents.send('task-done', { success: false, error: err.message });
                }
            }
        } else if (config.mode === 'discovery') {
            const discovery = new PathDiscovery({
                pathDeep: config.pathDeep,
                pathProbeDepth: config.pathProbeDepth,
                useRender: !config.pathNoRender,
                pathSeedsFile: config.pathSeeds || null,
                pathTxtOverride: config.pathTxt || null,
                delay: config.delay || 500,
                concurrency: config.concurrency || 5,
                timeout: config.timeout,
                maxDepth: config.maxDepth
            });

            try {
                const results = await discovery.discover(config.url);
                const updatedTask = taskManager.updateTask(task.id, { 
                    status: 'success',
                    percent: 100,
                    size: `${results.paths.length} paths`
                });

                if (mainWindow) {
                    mainWindow.webContents.send('task-update', updatedTask);
                    for (const entry of results.paths) {
                        mainWindow.webContents.send('task-progress', {
                            status: 'success',
                            url: entry.url,
                            size: `Sources: ${entry.sources.join(',')}`,
                            time: entry.status ? `HTTP ${entry.status}` : '-'
                        });
                    }
                    mainWindow.webContents.send('task-done', { success: true });
                }
            } catch (err) {
                const updatedTask = taskManager.updateTask(task.id, { status: 'error' });
                if (mainWindow) {
                    mainWindow.webContents.send('task-update', updatedTask);
                    mainWindow.webContents.send('task-progress', {
                        status: 'error',
                        url: err.message || err.toString(),
                        size: '-',
                        time: '-'
                    });
                    mainWindow.webContents.send('task-done', { success: false, error: err.message });
                }
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
