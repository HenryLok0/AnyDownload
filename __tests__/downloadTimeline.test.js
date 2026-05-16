const {
    computePercent,
    updateEmaMs,
    estimateEtaMs,
    formatDuration,
    truncateUrl,
    EMA_ALPHA
} = require('../src/cli/downloadTimeline');

describe('downloadTimeline helpers', () => {
    test('computePercent caps at 99 until caller passes final 100', () => {
        expect(computePercent(5, 10)).toBe(50);
        expect(computePercent(10, 10)).toBe(99);
        expect(computePercent(0, 0)).toBe(0);
    });

    test('updateEmaMs blends samples', () => {
        const first = updateEmaMs(null, 1000);
        expect(first).toBe(1000);
        const second = updateEmaMs(first, 2000);
        expect(second).toBeCloseTo(EMA_ALPHA * 2000 + (1 - EMA_ALPHA) * 1000, 5);
    });

    test('estimateEtaMs respects remaining work', () => {
        expect(estimateEtaMs(1000, 2, 5)).toBe(3000);
        expect(estimateEtaMs(1000, 5, 5)).toBe(0);
    });

    test('formatDuration renders readable segments', () => {
        expect(formatDuration(45000)).toMatch(/45s/);
        expect(formatDuration(90000)).toMatch(/1m/);
    });

    test('truncateUrl shortens long strings', () => {
        const long = 'https://example.com/' + 'x'.repeat(80);
        expect(truncateUrl(long, 40).length).toBeLessThanOrEqual(40);
        expect(truncateUrl('short')).toBe('short');
    });
});
