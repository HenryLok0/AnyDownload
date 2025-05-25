const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Frontend page
app.get('/', (req, res) => {
  res.render('index');
});

// Added: API download route
app.post('/api/download', async (req, res) => {
  const opts = req.body;
  if (!opts.url) return res.json({ success: false, error: 'No URL' });

  try {
    const { Downloader } = require('./src/downloader');
    const outputDir = opts.output || 'downloaded_site';
    const host = new URL(opts.url).host.replace(/[:\/\\]/g, '_');
    const folder = path.join(outputDir, host);

    // Remove old folder
    if (fs.existsSync(folder)) await fs.remove(folder);

    const downloader = new Downloader({
      ...opts,
      outputDir,
      recursive: opts.recursive,
      maxDepth: Number(opts.maxDepth) || 1,
      delay: Number(opts.delay) || 1000,
      concurrency: Number(opts.concurrency) || 5,
      retry: Number(opts.retry) || 3,
      headless: opts.headless,
      dynamic: opts.dynamic,
      type: Array.isArray(opts.type) ? opts.type[0] : opts.type // Only take one type (adjust as needed)
    });

    await downloader.downloadWebsite(opts.url);
    res.json({ success: true, folder });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web GUI running at http://localhost:${PORT}`);
});