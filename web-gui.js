const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const { Downloader } = require('./src/downloader');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// API download route
app.post('/api/download', async (req, res) => {
    const opts = req.body;
    if (!opts.url) {
        return res.json({ success: false, error: 'Please provide a website URL' });
    }

    try {
        const outputDir = opts.output || 'downloaded_site';
        const host = new URL(opts.url).host.replace(/[:\/\\]/g, '_');
        const folder = path.join(outputDir, host);

        // Remove old folder if exists
        if (fs.existsSync(folder)) {
            await fs.remove(folder);
        }

        // Create downloader instance with options
        const downloader = new Downloader({
            ...opts,
            outputDir,
            recursive: opts.recursive === 'true',
            maxDepth: Number(opts.maxDepth) || 1,
            delay: Number(opts.delay) || 1000,
            concurrency: Number(opts.concurrency) || 5,
            retry: Number(opts.retry) || 3,
            headless: opts.headless === 'true',
            dynamic: opts.dynamic === 'true',
            type: opts.type || 'all',
            onResource: (resourceUrl, idx, total, speed, eta) => {
                // Emit progress updates to connected clients
                io.emit('download-progress', {
                    current: idx,
                    total: total,
                    file: resourceUrl,
                    speed: speed ? `${speed} KB/s` : 'Calculating...',
                    eta: eta ? `${eta}s` : 'Calculating...'
                });
            }
        });

        // Start download
        await downloader.downloadWebsite(opts.url);
        
        // Notify completion
        io.emit('download-complete');
        res.json({ 
            success: true, 
            folder,
            message: 'Download completed successfully'
        });
    } catch (error) {
        console.error('Download error:', error);
        res.json({ 
            success: false, 
            error: error.message || 'An error occurred during download'
        });
    }
});

// API open website route
app.post('/api/open-website', async (req, res) => {
    const { folder } = req.body;
    if (!folder) {
        return res.json({ success: false, error: '請提供網站資料夾路徑' });
    }

    try {
        // 使用絕對路徑
        const absoluteFolder = path.resolve(folder);
        const indexFile = path.join(absoluteFolder, 'index.html');
        
        console.log('嘗試開啟檔案:', indexFile);

        if (!fs.existsSync(indexFile)) {
            console.log('找不到檔案:', indexFile);
            return res.json({ success: false, error: '找不到網站首頁檔案' });
        }

        // 使用系統預設瀏覽器開啟網站
        const { exec } = require('child_process');
        const platform = process.platform;
        let command;

        if (platform === 'win32') {
            // Windows 使用 file:// 協議
            const fileUrl = `file:///${indexFile.replace(/\\/g, '/')}`;
            command = `start "" "${fileUrl}"`;
        } else if (platform === 'darwin') {
            command = `open "${indexFile}"`;
        } else {
            command = `xdg-open "${indexFile}"`;
        }

        console.log('執行命令:', command);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('開啟網站錯誤:', error);
                console.error('錯誤輸出:', stderr);
                return res.json({ success: false, error: error.message });
            }
            console.log('命令輸出:', stdout);
            res.json({ success: true });
        });
    } catch (error) {
        console.error('開啟網站錯誤:', error);
        res.json({ success: false, error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Web GUI running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is in use, trying port ${PORT + 1}...`);
        server.listen(PORT + 1, () => {
            console.log(`Web GUI running at http://localhost:${PORT + 1}`);
            console.log('Press Ctrl+C to stop the server');
        });
    } else {
        console.error('Server error:', err);
    }
});