const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const mime = require('mime-types');
const { exec } = require('child_process');

function findIndexFile(rootDir) {
    const index = path.join(rootDir, 'index.html');
    if (fs.existsSync(index)) return index;
    const files = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));
    if (files.length) return path.join(rootDir, files[0]);
    return null;
}

async function resolveSiteRoot(dir) {
    const root = path.resolve(dir);
    if (!(await fs.pathExists(root))) {
        throw new Error(`Folder not found: ${root}`);
    }
    if (findIndexFile(root)) return root;

    const entries = await fs.readdir(root, { withFileTypes: true });
    const candidates = [];
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const child = path.join(root, ent.name);
        if (findIndexFile(child)) candidates.push(child);
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
        throw new Error(
            `Multiple site folders with index.html. Specify one, e.g.: ${candidates[0]}`
        );
    }
    throw new Error(
        `No index.html in ${root}. Use the host folder, e.g. ${path.join(root, 'example.com')}`
    );
}

function resolveFile(rootDir, urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    let relative = decoded.replace(/^\//, '') || 'index.html';
    if (relative.endsWith('/')) relative += 'index.html';

    const candidate = path.normalize(path.join(rootDir, relative));
    const root = path.normalize(rootDir);
    if (!candidate.startsWith(root)) return null;
    return candidate;
}

/** Last URL path segment; empty for `/`. */
function lastPathSegmentDecoded(urlPath) {
    const decoded = decodeURIComponent((urlPath || '').split('?')[0]);
    const segs = decoded.replace(/^\/+/u, '').split('/').filter(Boolean);
    return segs.pop() || '';
}

/**
 * Plain paths like `/learn` → `<root>/learn/index.html` then `<root>/learn.html`.
 */
async function resolveExtensionlessHtml(rootDir, urlPath) {
    const decoded = decodeURIComponent((urlPath || '').split('?')[0]).replace(/^\/+/u, '');
    if (!decoded) return null;
    const leaf = lastPathSegmentDecoded(urlPath);
    if (leaf.includes('.')) return null;

    const indexUnder = path.normalize(path.join(rootDir, decoded, 'index.html'));
    const dotted = path.normalize(path.join(rootDir, `${decoded}.html`));
    const root = path.normalize(rootDir);
    const inside = (p) => p.startsWith(root) && p !== root;
    if (inside(indexUnder) && await fs.pathExists(indexUnder)) return indexUnder;
    if (inside(dotted) && await fs.pathExists(dotted)) return dotted;
    return null;
}

class PreviewServer {
    constructor(rootDir, options = {}) {
        this.rootDir = path.resolve(rootDir);
        this.port = options.port || 0;
        this.spaFallback = options.spaFallback !== false;
        this.server = null;
    }

    async start() {
        if (!(await fs.pathExists(this.rootDir))) {
            throw new Error(`Folder not found: ${this.rootDir}`);
        }

        this.server = http.createServer(async (req, res) => {
            try {
                const urlPath = (req.url || '/').split('?')[0];

                if (urlPath === '/index.html') {
                    res.writeHead(302, { Location: '/' });
                    res.end();
                    return;
                }

                let filePath = resolveFile(this.rootDir, urlPath);

                if (!filePath || !(await fs.pathExists(filePath))) {
                    const extless = await resolveExtensionlessHtml(this.rootDir, urlPath);
                    if (extless) filePath = extless;
                }

                if (!filePath || !(await fs.pathExists(filePath))) {
                    if (this.spaFallback) {
                        const indexFile = findIndexFile(this.rootDir);
                        if (indexFile && !urlPath.includes('.')) {
                            filePath = indexFile;
                        }
                    }
                }

                if (!filePath || !(await fs.pathExists(filePath))) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found');
                    return;
                }

                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    const indexInDir = findIndexFile(filePath);
                    if (!indexInDir) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('Not found');
                        return;
                    }
                    filePath = indexInDir;
                }

                const contentType = mime.lookup(filePath) || 'application/octet-stream';
                const data = await fs.readFile(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(err.message || 'Server error');
            }
        });

        return new Promise((resolve, reject) => {
            this.server.listen(this.port, '127.0.0.1', () => {
                const addr = this.server.address();
                this.port = addr.port;
                resolve(this.getUrl());
            });
            this.server.on('error', reject);
        });
    }

    getUrl() {
        return `http://127.0.0.1:${this.port}/`;
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.server) return resolve();
            this.server.close(() => resolve());
        });
    }
}

function openBrowser(url) {
    const cmd = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;
    exec(cmd);
}

async function startPreview(rootDir, options = {}) {
    const siteRoot = await resolveSiteRoot(rootDir);
    const server = new PreviewServer(siteRoot, options);
    const url = await server.start();
    const openUrl = server.getUrl();
    if (options.open !== false) {
        openBrowser(openUrl);
    }
    return { server, url: openUrl };
}

module.exports = {
    PreviewServer,
    startPreview,
    openBrowser,
    findIndexFile,
    resolveSiteRoot,
    resolveExtensionlessHtml
};
