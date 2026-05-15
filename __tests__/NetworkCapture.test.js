const NetworkCapture = require('../src/engine/NetworkCapture');

describe('NetworkCapture', () => {
    test('captures valid http responses', () => {
        const cap = new NetworkCapture();
        cap.add({
            url: 'https://example.com/style.css',
            status: 200,
            contentType: 'text/css',
            body: Buffer.from('body{}')
        });
        expect(cap.getAll()).toHaveLength(1);
    });

    test('skips data urls', () => {
        const cap = new NetworkCapture();
        cap.add({
            url: 'data:text/css,body{}',
            status: 200,
            contentType: 'text/css',
            body: Buffer.alloc(0)
        });
        expect(cap.getAll()).toHaveLength(0);
    });
});
