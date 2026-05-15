function mergeCookieHeader(...parts) {
    const seen = new Map();
    for (const part of parts) {
        if (!part || typeof part !== 'string') continue;
        for (const chunk of part.split(';')) {
            const trimmed = chunk.trim();
            if (!trimmed) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const name = trimmed.slice(0, eq).trim();
            seen.set(name, trimmed);
        }
    }
    return [...seen.values()].join('; ');
}

function cookiesToHeader(cookies) {
    if (!cookies || !cookies.length) return '';
    if (typeof cookies === 'string') return cookies;
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

module.exports = { mergeCookieHeader, cookiesToHeader };
