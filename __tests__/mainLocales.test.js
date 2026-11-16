const { mainT, normalizeLocale, setMainLocale } = require('../src/main/mainLocales');

describe('mainLocales.normalizeLocale', () => {
    test.each([
        ['zh-CN', 'zh-CN'],
        ['ZH_cn', 'zh-CN'],
        ['zh-Hans-CN', 'zh-CN'],
        ['zh-TW', 'zh-TW'],
        ['zh-Hant', 'zh-TW'],
        ['zh', 'zh-TW']
    ])('maps %s to %s', (locale, expected) => {
        expect(normalizeLocale(locale)).toBe(expected);
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

describe('mainLocales.mainT', () => {
    afterEach(() => setMainLocale('en'));

    test.each([
        ['zh-CN', '确定要删除 2 个任务吗？'],
        ['zh-TW', '確定要刪除 2 個任務嗎？']
    ])('uses the active Chinese locale (%s) in native dialogs', (locale, expected) => {
        setMainLocale(locale);
        expect(mainT('deleteTasksMessage', { count: 2 })).toBe(expected);
    });
});
