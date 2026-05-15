const { mergeCookieHeader, cookiesToHeader } = require('../src/utils/cookies');

describe('cookies utils', () => {
    test('cookiesToHeader serializes cookie objects', () => {
        expect(cookiesToHeader([{ name: 'a', value: '1' }, { name: 'b', value: '2' }]))
            .toBe('a=1; b=2');
    });

    test('mergeCookieHeader dedupes by name', () => {
        expect(mergeCookieHeader('a=old', 'a=new; c=3')).toBe('a=new; c=3');
    });
});
