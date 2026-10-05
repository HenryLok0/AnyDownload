const PlaywrightAdapter = require('../src/engine/adapters/PlaywrightAdapter');

describe('PlaywrightAdapter.goto', () => {
    test('a busy page still finishes after the document loads', async () => {
        const adapter = new PlaywrightAdapter();
        const calls = [];
        const page = {
            goto: async (_url, opts) => {
                calls.push(opts.waitUntil);
            },
            waitForLoadState: async () => {
                throw new Error('Timeout 8000ms exceeded');
            },
            waitForTimeout: async () => {
                calls.push('extra');
            }
        };

        await adapter.goto(page, 'https://hktt.henrylok.me/', {
            waitUntil: 'networkidle',
            extraWait: 10
        });

        expect(calls).toEqual(['domcontentloaded', 'extra']);
    });
});
