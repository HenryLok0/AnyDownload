const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

const REPLAY_FILE = 'anydownload-replay.json';
const REPLAY_DIR = 'anydownload-replay';
const MAX_QUERY_COPY = 15 * 1024 * 1024;

function replayKey(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.href;
    } catch {
        return '';
    }
}

function matchReplayUrl(requestUrl, savedList, sourceUrl, previewOrigin) {
    const saved = new Set(savedList || []);
    if (saved.has(requestUrl)) return requestUrl;
    let request;
    let sourceOrigin = '';
    try {
        request = new URL(requestUrl);
        if (sourceUrl) sourceOrigin = new URL(sourceUrl).origin;
    } catch {
        return '';
    }
    if (!previewOrigin || request.origin !== previewOrigin) return '';

    const key = request.pathname + request.search;
    let fallback = '';
    for (const item of saved) {
        try {
            const parsed = new URL(item);
            if (parsed.pathname + parsed.search !== key) continue;
            if (sourceOrigin && parsed.origin === sourceOrigin) return item;
            if (!fallback) fallback = item;
        } catch {
            // Skip entries that are not URLs.
        }
    }
    return fallback;
}

function isSafeRel(rel) {
    const normalized = String(rel || '').replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) return false;
    return !normalized.split('/').some(part => part === '..');
}

class ReplayIndex {
    constructor() {
        this.byUrl = new Map();
    }

    /**
     * Remember a saved file so preview can answer the same URL later.
     * Query strings are copied aside so two requests do not share one path.
     */
    async add(baseDir, url, savedAbsPath, contentType) {
        const key = replayKey(url);
        if (!key || !savedAbsPath) return;
        const rel = path.relative(baseDir, savedAbsPath).replace(/\\/g, '/');
        if (!isSafeRel(rel)) return;

        let file = rel;
        if (new URL(key).search) {
            const stat = await fs.stat(savedAbsPath).catch(() => null);
            if (!stat || stat.size > MAX_QUERY_COPY) return;
            const hash = crypto.createHash('sha1').update(key).digest('hex');
            const ext = path.posix.extname(rel);
            file = `${REPLAY_DIR}/${hash}${ext}`;
            await fs.copy(savedAbsPath, path.join(baseDir, file), { overwrite: true });
        }
        this.byUrl.set(key, { url: key, file, contentType: contentType || '' });
    }

    async write(baseDir) {
        if (!this.byUrl.size) return;
        await fs.writeJson(path.join(baseDir, REPLAY_FILE), {
            responses: Array.from(this.byUrl.values())
        });
    }
}

async function loadReplayIndex(rootDir) {
    const map = new Map();
    try {
        const data = await fs.readJson(path.join(rootDir, REPLAY_FILE));
        for (const row of data.responses || []) {
            if (!row || !row.url || !isSafeRel(row.file)) continue;
            map.set(row.url, row);
        }
    } catch {
        // Older downloads have no replay index.
    }
    return map;
}

module.exports = {
    ReplayIndex,
    loadReplayIndex,
    replayKey,
    REPLAY_FILE,
    isSafeRel,
    matchReplayUrl
};
