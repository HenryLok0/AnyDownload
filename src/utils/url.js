const { URL } = require('url');
const crypto = require('crypto');

function isValidUrl(url) {
    if (typeof url !== 'string') return false;
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function normalizeUrl(u, base) {
    if (typeof u !== 'string' || typeof base !== 'string') return null;
    const trimmed = u.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('#')) {
        return null;
    }
    try {
        const absoluteUrl = new URL(trimmed, base).href;
        if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
            return null;
        }
        return absoluteUrl;
    } catch {
        return null;
    }
}

function hashUrl(url) {
    return crypto.createHash('sha1').update(url).digest('hex');
}

function sameOrigin(urlA, urlB) {
    try {
        const a = new URL(urlA);
        const b = new URL(urlB);
        if (a.hostname === b.hostname) return true;
        if (a.hostname.endsWith('.' + b.hostname) || b.hostname.endsWith('.' + a.hostname)) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function getOrigin(url) {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

module.exports = {
    isValidUrl,
    normalizeUrl,
    hashUrl,
    sameOrigin,
    getOrigin
};
