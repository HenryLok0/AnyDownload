const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const mime = require('mime-types');
const { exec } = require('child_process');
const { loadReplayIndex, matchReplayUrl } = require('../downloader/replayStore');
const { rewriteRuntimeUrls } = require('../downloader/rewrite/mirrorHref');

const ENTRY_FILE = 'anydownload.json';

const PREVIEW_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
].join('; ');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const COPY_LIMITS = 'This copy does not include login, paywalls, CAPTCHA, encrypted video, or data that changes after download.';

function copyrightBanner(sourceUrl) {
    const source = sourceUrl ? ` Source: ${escapeHtml(sourceUrl)}.` : '';
    return `<div id="anydownload-notice" style="display:block;box-sizing:border-box;margin:0;padding:8px 12px;background:#111;color:#fff;font:13px/1.4 sans-serif;">Personal offline copy for your own viewing. Do not republish.${source} ${COPY_LIMITS}</div>`;
}

function replayBootstrap(urls, sourceUrl) {
    const list = JSON.stringify(urls || []).replace(/</g, '\\u003c');
    const source = JSON.stringify(sourceUrl || '').replace(/</g, '\\u003c');
    return `<script id="anydownload-replay">(function(){
var saved=${list};
var sourceUrl=${source};
var matchReplayUrl=${matchReplayUrl.toString()};
function abs(input){try{var raw=typeof input==="string"?input:(input&&input.url)||"";return new URL(raw,location.href).href.split("#")[0];}catch(e){return "";}}
function note(url){var box=document.getElementById("anydownload-notice");if(!box){document.addEventListener("DOMContentLoaded",function(){note(url);});return;}if(box.getAttribute("data-missing")==="1")return;box.setAttribute("data-missing","1");box.appendChild(document.createTextNode(" No saved response for "+url+"."));}
function replay(url){return "/__anydownload/replay?u="+encodeURIComponent(url);}
function cross(url){try{return !!url&&new URL(url).origin!==location.origin;}catch(e){return false;}}
function savedFor(input){return matchReplayUrl(abs(input),saved,sourceUrl,location.origin);}
var orig=window.fetch;
if(orig){window.fetch=function(input,init){var hit=savedFor(input);if(hit)return orig.call(this,replay(hit),{method:"GET",credentials:"same-origin"});var url=abs(input);if(cross(url)){note(url);return Promise.resolve(new Response('{"error":"This offline copy has no saved response."}',{status:404,headers:{"content-type":"application/json"}}));}return orig.apply(this,arguments);};}
var open=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url){var hit=savedFor(url);if(hit)return open.call(this,"GET",replay(hit),arguments[2]!==false);var absUrl=abs(url);if(cross(absUrl)){note(absUrl);return open.call(this,"GET","/__anydownload/missing",arguments[2]!==false);}return open.apply(this,arguments);};
})();</script>`;
}

function rootExternalRefs(text) {
    return String(text)
        .replace(/((?:href|src)=["'])external\//g, '$1/external/')
        .replace(/url\(\s*(['"]?)external\//g, 'url($1/external/');
}

function injectPreviewNotice(html, sourceUrl, replayUrls) {
    if (!html) return html;
    const shim = html.includes('id="anydownload-replay"') ? '' : replayBootstrap(replayUrls, sourceUrl);
    let out = html;
    if (shim) {
        if (/<head[^>]*>/i.test(out)) {
            out = out.replace(/<head[^>]*>/i, (open) => open + shim);
        } else {
            out = shim + out;
        }
    }
    if (out.includes('id="anydownload-notice"')) return out;
    const banner = copyrightBanner(sourceUrl);
    if (/<body[^>]*>/i.test(out)) {
        return out.replace(/<body[^>]*>/i, (open) => open + banner);
    }
    return banner + out;
}

function isInsideRoot(rootDir, filePath) {
    const rel = path.relative(path.resolve(rootDir), path.resolve(filePath));
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function sendReplay(rootDir, replayMap, reqUrl, res) {
    const target = reqUrl.searchParams.get('u') || '';
    const hit = replayMap.get(target);
    if (!hit) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error":"This offline copy has no saved response."}');
        return;
    }
    const filePath = path.resolve(rootDir, hit.file);
    if (!isInsideRoot(rootDir, filePath) || !(await fs.pathExists(filePath))) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error":"This offline copy has no saved response."}');
        return;
    }
    const type = (hit.contentType || mime.lookup(filePath) || 'application/octet-stream').split(';')[0];
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
        'Content-Type': type,
        'Content-Security-Policy': PREVIEW_CSP,
        'Cache-Control': 'no-store'
    });
    res.end(data);
}

async function readPreviewMeta(rootDir) {
    const empty = { entryPath: null, sourceUrl: '' };
    try {
        const data = await fs.readJson(path.join(rootDir, ENTRY_FILE));
        const sourceUrl = data && typeof data.sourceUrl === 'string' ? data.sourceUrl : '';
        const entry = data && data.entryPath;
        if (typeof entry !== 'string' || !entry.startsWith('/') || entry === '/') {
            return { entryPath: null, sourceUrl };
        }
        if (entry.includes('..') || entry.includes('\\')) return { entryPath: null, sourceUrl };

        const rel = entry.replace(/^\/+/, '');
        const candidate = rel.endsWith('/')
            ? path.join(rootDir, rel, 'index.html')
            : path.join(rootDir, rel);
        if (!isPathUnderRoot(rootDir, candidate)) return { entryPath: null, sourceUrl };
        if (!(await fs.pathExists(candidate))) return { entryPath: null, sourceUrl };
        const entryPath = rel.endsWith('/') || path.extname(rel)
            ? (entry.startsWith('/') ? entry : `/${entry}`)
            : `/${rel}/`;
        return { entryPath, sourceUrl };
    } catch {
        return empty;
    }
}

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

const SKIP_HOST_SEARCH = new Set(['node_modules', '.git', 'dist', 'dist-electron']);

/** Look under startDir for `<host>/index.html`, a few levels deep. */
async function findHostFolders(hostName, startDir, maxDepth = 3) {
    const want = String(hostName || '').toLowerCase();
    if (!want) return [];
    const root = path.resolve(startDir);
    const found = [];

    async function scan(dir, depth) {
        if (depth > maxDepth || found.length >= 5) return;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const ent of entries) {
            if (!ent.isDirectory() || SKIP_HOST_SEARCH.has(ent.name)) continue;
            const child = path.join(dir, ent.name);
            if (ent.name.toLowerCase() === want && await fs.pathExists(path.join(child, 'index.html'))) {
                found.push(child);
                if (found.length >= 5) return;
            }
            if (depth < maxDepth) await scan(child, depth + 1);
        }
    }

    await scan(root, 0);
    return found;
}

/** Resolved path stays under root (covers Windows drive-letter case drift). */
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

function resolveFile(rootDir, urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    let relative = decoded.replace(/^\//, '') || 'index.html';
    if (relative.endsWith('/')) relative += 'index.html';

    const candidate = path.normalize(path.join(rootDir, relative));
    if (!isPathUnderRoot(rootDir, candidate)) return null;
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
    const inside = (p) => isPathUnderRoot(rootDir, p) && p !== path.resolve(rootDir);
    if (inside(indexUnder) && await fs.pathExists(indexUnder)) return indexUnder;
    if (inside(dotted) && await fs.pathExists(dotted)) return dotted;
    return null;
}

/**
 * Nested HTML pages sometimes resolve bundles relative to the page path, producing
 * /learn/_next/... while files live at /_next/... Scan path segments for shared roots.
 */
async function resolveSharedBundlePath(rootDir, urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/u, '');
    if (!decoded) return null;

    const parts = decoded.split('/').filter(p => p.length && p !== '.' && p !== '..');
    if (!parts.length) return null;

    const tryFromSegment = async (marker) => {
        const idx = parts.indexOf(marker);
        if (idx < 0) return null;
        const tail = parts.slice(idx).join('/');
        const candidate = path.normalize(path.join(rootDir, tail));
        if (!isPathUnderRoot(rootDir, candidate)) return null;
        if (await fs.pathExists(candidate)) {
            const st = await fs.stat(candidate);
            if (st.isFile()) return candidate;
        }
        return null;
    };

    const nextPath = await tryFromSegment('_next');
    if (nextPath) return nextPath;

    const viteAssets = await tryFromSegment('assets');
    if (viteAssets) return viteAssets;

    /** CRA / some Next setups: `./static/...` under a nested page → `/route/static/...`. */
    const staticPath = await tryFromSegment('static');
    if (staticPath) return staticPath;

    const externalPath = await tryFromSegment('external');
    if (externalPath) return externalPath;

    /**
     * Public files referenced without a leading slash (e.g. `./next.svg` on `/blog/`
     * → `/blog/next.svg`). If that path misses on disk but the same suffix exists at
     * site root, serve it. Skip `.html` to avoid stealing real nested pages.
     */
    if (parts.length >= 2) {
        const leaf = parts[parts.length - 1];
        if (
            leaf.includes('.') &&
            !leaf.endsWith('.html') &&
            !leaf.endsWith('.htm')
        ) {
            const tail = parts.slice(1).join('/');
            const candidate = path.normalize(path.join(rootDir, tail));
            if (
                isPathUnderRoot(rootDir, candidate) &&
                (await fs.pathExists(candidate))
            ) {
                const st = await fs.stat(candidate);
                if (st.isFile()) return candidate;
            }
        }
    }

    return null;
}

class PreviewServer {
    constructor(rootDir, options = {}) {
        this.rootDir = path.resolve(rootDir);
        this.port = options.port || 0;
        this.spaFallback = options.spaFallback !== false;
        this.entryPathOption = options.entryPath;
        this.sourceUrlOption = options.sourceUrl;
        this.entryPath = null;
        this.sourceUrl = '';
        this.replayMap = new Map();
        this.server = null;
    }

    async start() {
        if (!(await fs.pathExists(this.rootDir))) {
            throw new Error(`Folder not found: ${this.rootDir}`);
        }

        if (this.entryPathOption !== undefined) {
            this.entryPath = this.entryPathOption;
            this.sourceUrl = this.sourceUrlOption || '';
        } else {
            const meta = await readPreviewMeta(this.rootDir);
            this.entryPath = meta.entryPath;
            this.sourceUrl = meta.sourceUrl;
        }
        this.replayMap = await loadReplayIndex(this.rootDir);

        this.server = http.createServer(async (req, res) => {
            try {
                const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
                const urlPath = reqUrl.pathname;

                if (urlPath === '/__anydownload/replay') {
                    await sendReplay(this.rootDir, this.replayMap, reqUrl, res);
                    return;
                }
                if (urlPath === '/__anydownload/missing') {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end('{"error":"This offline copy has no saved response."}');
                    return;
                }
                if ((urlPath === '/' || urlPath === '/index.html') && this.entryPath && this.entryPath !== '/') {
                    res.writeHead(302, { Location: this.entryPath });
                    res.end();
                    return;
                }

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
                    const aliased = await resolveSharedBundlePath(this.rootDir, urlPath);
                    if (aliased) filePath = aliased;
                }

                if (!filePath || !(await fs.pathExists(filePath))) {
                    if (this.spaFallback) {
                        const indexFile = findIndexFile(this.rootDir);
                        const isApi = urlPath === '/api' || urlPath.startsWith('/api/');
                        if (indexFile && !urlPath.includes('.') && !isApi) {
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
                const isHtml = String(contentType).startsWith('text/html');
                const headers = { 'Content-Type': contentType };
                let body = data;
                if (isHtml) {
                    headers['Content-Security-Policy'] = PREVIEW_CSP;
                    body = Buffer.from(rootExternalRefs(injectPreviewNotice(
                        data.toString('utf8'),
                        this.sourceUrl,
                        Array.from(this.replayMap.keys())
                    )), 'utf8');
                } else if (String(contentType).includes('css')) {
                    body = Buffer.from(rootExternalRefs(data.toString('utf8')), 'utf8');
                } else if (String(contentType).includes('javascript')) {
                    let siteHost = '';
                    try {
                        siteHost = new URL(this.sourceUrl).host;
                    } catch {
                        siteHost = '';
                    }
                    body = Buffer.from(rewriteRuntimeUrls(data.toString('utf8'), siteHost), 'utf8');
                }
                res.writeHead(200, headers);
                res.end(body);
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
        const entry = this.entryPath && this.entryPath !== '/' ? this.entryPath : '/';
        return `http://127.0.0.1:${this.port}${entry}`;
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
    resolveExtensionlessHtml,
    resolveSharedBundlePath,
    findHostFolders
};
