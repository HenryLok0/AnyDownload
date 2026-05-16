const fs = require('fs');
const path = require('path');

const wordlistPath = path.join(__dirname, '..', 'data', 'path-wordlist.txt');

function loadLines() {
    return fs.readFileSync(wordlistPath, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
}

describe('bundled path wordlist', () => {
    test('has at least 1800 probe segments', () => {
        expect(loadLines().length).toBeGreaterThanOrEqual(1800);
    });

    test('includes hidden and common sentinel paths', () => {
        const lines = new Set(loadLines());
        for (const token of ['mypage', 'cv', 'qwe', '000', 'page', 'my', 'admin', 'sitemap.xml']) {
            expect(lines.has(token)).toBe(true);
        }
    });
});
