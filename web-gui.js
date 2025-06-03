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