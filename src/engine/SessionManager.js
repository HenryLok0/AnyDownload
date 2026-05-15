const fs = require('fs-extra');
const path = require('path');

class SessionManager {
    constructor(sessionDir) {
        this.sessionDir = sessionDir;
        this.cookieFile = sessionDir ? path.join(sessionDir, 'cookies.json') : null;
        this.storageFile = sessionDir ? path.join(sessionDir, 'storage.json') : null;
    }

    async loadCookies() {
        if (!this.cookieFile || !(await fs.pathExists(this.cookieFile))) {
            return [];
        }
        return fs.readJson(this.cookieFile);
    }

    async saveCookies(cookies) {
        if (!this.cookieFile) return;
        await fs.ensureDir(path.dirname(this.cookieFile));
        await fs.writeJson(this.cookieFile, cookies, { spaces: 2 });
    }

    async loadStorage() {
        if (!this.storageFile || !(await fs.pathExists(this.storageFile))) {
            return {};
        }
        return fs.readJson(this.storageFile);
    }

    async saveStorage(storage) {
        if (!this.storageFile) return;
        await fs.ensureDir(path.dirname(this.storageFile));
        await fs.writeJson(this.storageFile, storage, { spaces: 2 });
    }

    cookiesToHeader(cookies) {
        if (!Array.isArray(cookies)) return '';
        return cookies
            .map(c => `${c.name}=${c.value}`)
            .join('; ');
    }
}

module.exports = SessionManager;
