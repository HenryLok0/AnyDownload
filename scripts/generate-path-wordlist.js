#!/usr/bin/env node
/**
 * Regenerates data/path-wordlist.txt (~2000 probe segments for -p --path-deep).
 *   npm run generate-path-wordlist
 */
const fs = require('fs');
const path = require('path');

const TARGET_PER_BUCKET = 1000;
const dataDir = path.join(__dirname, '..', 'data');
const outFile = path.join(dataDir, 'path-wordlist.txt');
const hiddenOnlyFile = path.join(dataDir, 'path-wordlist-hidden.txt');
const commonOnlyFile = path.join(dataDir, 'path-wordlist-common.txt');

function capList(orderedUnique, target) {
    return orderedUnique.length > target ? orderedUnique.slice(0, target) : orderedUnique;
}

function buildHiddenWordlist() {
    const seen = new Set();
    const ordered = [];
    const add = (s) => {
        if (!s || typeof s !== 'string' || s.includes('..')) return;
        const t = s.trim().replace(/^\/+/, '');
        if (!t || seen.has(t)) return;
        seen.add(t);
        ordered.push(t);
    };

    const singles = [
        'page', 'mypage', 'my', 'me', 'cv', 'resume', 'portfolio', 'home', 'index', 'site', 'web',
        'blog', 'demo', 'test', 'tmp', 'old', 'new', 'wip', 'draft', 'secret', 'private', 'hidden',
        'stuff', 'misc', 'main', 'landing', 'welcome', 'start', 'hub', 'links', 'link', 'bio',
        'profile', 'about-me', 'aboutme', 'contact-me', 'hire-me', 'works', 'projects', 'gallery',
        'photos', 'pics', 'art', 'design', 'dev', 'local', 'playground', 'sandbox', 'experiment',
        'prototype', 'v0', 'beta-page', 'under-construction', 'coming-soon', 'offline', 'archive-me',
        'notes', 'journal', 'diary', 'stash', 'vault', 'personal', 'family', 'friends', 'fun',
        'random', 'other', 'extra', 'side', 'alt', 'backup-page', 'mirror', 'clone', 'copy',
        'v1-page', 'v2-page', 'en', 'zh', 'tw', 'hk', 'us', 'uk', 'jp', 'kr'
    ];
    singles.forEach(add);

    const keyboard = ['qwe', 'asd', 'zxc', 'abc', 'xxx', 'aaa', 'bbb', 'ccc', 'qqq', 'www', 'eee',
        'foo', 'bar', 'baz', 'qux', 'test1', 'test2', 'demo1', 'demo2', 'a', 'b', 'c', 'x', 'y', 'z'];
    keyboard.forEach(add);

    for (let i = 0; i <= 99; i++) add(String(i));
    for (const n of ['000', '001', '007', '123', '404', '500', '999']) add(n);

    const myTail = ['site', 'page', 'blog', 'cv', 'home', 'work', 'projects', 'photos', 'links', 'bio',
        'profile', 'resume', 'portfolio', 'app', 'web', 'shop', 'store', 'world', 'life', 'story'];
    for (const t of myTail) {
        add(`my-${t}`);
        add(`my${t}`);
        add(`my/${t}`);
    }

    const pageTail = ['home', 'about', 'contact', 'cv', 'resume', 'work', 'projects', 'gallery', 'blog',
        'main', 'index', 'draft', 'preview', 'test', 'demo', 'old', 'new', 'v1', 'v2'];
    for (const t of pageTail) {
        add(`page-${t}`);
        add(`page/${t}`);
    }

    for (let i = 1; i <= 120; i++) {
        add(`page${i}`);
        add(`page-${i}`);
        add(`page/${i}`);
        add(`p${i}`);
        add(`p/${i}`);
    }

    for (let i = 1; i <= 80; i++) {
        add(`my-page-${i}`);
        add(`subpage${i}`);
        add(`sub/${i}`);
    }

    const cvTail = ['en', 'zh', 'tw', 'pdf', 'html', 'old', 'new', '2024', '2025', '2026'];
    for (const t of cvTail) add(`cv-${t}`);

    const devPages = ['dev-page', 'dev-site', 'dev-blog', 'local-dev', 'staging-page', 'preview-page',
        'test-page', 'temp-page', 'scratch-pad', 'not-ready', 'do-not-share', 'unlisted', 'noindex',
        'friends-only', 'members-only', 'invite-only', 'beta-access', 'early-access', 'internal-only'];
    devPages.forEach(add);

    const personal = ['resume-en', 'resume-zh', 'portfolio-2024', 'portfolio-2025', 'my-cv', 'my-resume',
        'my-portfolio', 'my-works', 'my-projects', 'my-gallery', 'my-photos', 'my-links', 'linktree',
        'link-in-bio', 'card', 'vcard', 'business-card', 'hire', 'freelance', 'consulting'];
    personal.forEach(add);

    return capList(ordered, TARGET_PER_BUCKET);
}

function buildCommonWordlist() {
    const seen = new Set();
    const ordered = [];
    const add = (s) => {
        if (!s || typeof s !== 'string' || s.includes('..')) return;
        const t = s.trim().replace(/^\/+/, '');
        if (!t || seen.has(t)) return;
        seen.add(t);
        ordered.push(t);
    };

    const topSite = [
        'admin', 'api', 'login', 'dashboard', 'console',
        'about', 'contact', 'privacy', 'terms', 'tos', 'legal', 'faq', 'help', 'support', 'docs',
        'documentation', 'blog', 'news', 'press', 'media', 'team', 'careers', 'jobs', 'pricing',
        'plans', 'features', 'product', 'products', 'shop', 'store', 'cart', 'checkout', 'account',
        'login', 'logout', 'register', 'signup', 'signin', 'search', 'sitemap', 'robots.txt',
        'sitemap.xml', 'sitemap_index.xml', 'feed', 'rss', 'atom.xml', 'favicon.ico', 'manifest.json',
        'site.webmanifest', 'humans.txt', 'security.txt', '.well-known/security.txt',
        'home', 'index', 'main', 'default', 'status', 'health', 'healthz', 'ready', 'live', 'metrics'
    ];
    topSite.forEach(add);

    const pre = ['admin', 'api', 'app', 'sys', 'internal', 'private', 'staging', 'dev', 'beta', 'public',
        'static', 'assets', 'cdn', 'media', 'upload', 'download', 'backup', 'config', 'settings'];
    const suf = [
        'login', 'logout', 'list', 'detail', 'view', 'edit', 'create', 'panel', 'dashboard', 'console',
        'doc', 'docs', 'help', 'status', 'health', 'metrics', 'report', 'export', 'import', 'backup',
        'logs', 'audit', 'debug', 'search', 'users', 'roles', 'tokens', 'auth', 'verify', 'reset',
        'upload', 'download', 'data', 'batch', 'queue', 'job', 'task', 'worker', 'cache', 'deploy',
        'build', 'release', 'history', 'version', 'issue', 'v1', 'v2', 'v3', 'oauth', 'sso',
        'graphql', 'rest', 'webhook', 'cron', 'portal', 'wiki', 'kb', 'intranet', 'vpn', 'cms'
    ];
    for (const p of pre) {
        for (const s of suf) {
            add(`${p}-${s}`);
            add(`${p}/${s}`);
        }
    }

    const cms = ['wp-admin', 'wp-login.php', 'wp-content', 'wp-includes', 'phpmyadmin', 'server-status',
        'swagger', 'swagger.json', 'swagger-ui', 'swagger-ui.html', 'openapi.json', 'api-docs',
        'graphiql', 'graphql', '_next', 'vite', 'webpack', 'node_modules', '.git', '.git/HEAD',
        '.git/config', '.env', '.env.local', '.env.production'];
    cms.forEach(add);

    for (const p of ['api', 'v1', 'v2', 'v3', 'rest', 'graphql']) {
        for (const s of ['users', 'posts', 'items', 'orders', 'events', 'files', 'auth', 'me', 'health', 'status']) {
            add(`${p}/${s}`);
        }
    }

    for (let i = 1; i <= 50; i++) add(`blog/${i}`);
    for (let i = 1; i <= 30; i++) add(`post/${i}`);
    for (let i = 1; i <= 20; i++) add(`page/${i}`);

    const extras = ['404', '500', 'error', 'errors', 'archive', 'archives', 'tags', 'categories',
        'subscribe', 'unsubscribe', 'newsletter', 'callback', 'oauth2', 'authorize', 'token',
        'session', 'sessions', 'invoice', 'invoices', 'payment', 'payments', 'order', 'orders',
        'redir', 'redirect', 'go', 'out', 'track', 'analytics', 'pixel', 'beacon', 'webhooks'];
    extras.forEach(add);

    return capList(ordered, TARGET_PER_BUCKET);
}

function writeWordlistFile(filePath, headerLines, lines) {
    const header = headerLines.join('\n') + '\n\n';
    fs.writeFileSync(filePath, header + lines.join('\n') + '\n');
}

const hidden = buildHiddenWordlist();
const common = buildCommonWordlist();
const mergedSet = new Set();
const merged = [];
for (const line of [...hidden, ...common]) {
    if (!mergedSet.has(line)) {
        mergedSet.add(line);
        merged.push(line);
    }
}

writeWordlistFile(hiddenOnlyFile, [
    '# Maintainer slice: hidden / personal / dev-style paths (~1000)',
    '# Merged into path-wordlist.txt by generate-path-wordlist.js'
], hidden);

writeWordlistFile(commonOnlyFile, [
    '# Maintainer slice: common public / admin / API paths (~1000)',
    '# Merged into path-wordlist.txt by generate-path-wordlist.js'
], common);

writeWordlistFile(outFile, [
    '# Path probe wordlist for anydownload -p --path-deep',
    `# Hidden/personal: ${hidden.length} | Common/public: ${common.length} | Merged unique: ${merged.length}`,
    '# Override: --path-txt <file> or ./path.txt in cwd',
    '# Regenerate: npm run generate-path-wordlist'
], merged);

console.log('Wrote', outFile, 'merged:', merged.length, '(hidden:', hidden.length, 'common:', common.length + ')');
