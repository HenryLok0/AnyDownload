const { normalizeLocale } = require('../src/main/mainLocales');

describe('mainLocales.normalizeLocale', () => {
    test('maps zh variants to zh-TW', () => {
        expect(normalizeLocale('zh-CN')).toBe('zh-TW');
        expect(normalizeLocale('zh-TW')).toBe('zh-TW');
    });

    test('falls back unknown to en', () => {
        expect(normalizeLocale('xx')).toBe('en');
    });

    test('supports primary locales', () => {
        expect(normalizeLocale('ja')).toBe('ja');
        expect(normalizeLocale('ko')).toBe('ko');
        expect(normalizeLocale('en')).toBe('en');
    });
});
