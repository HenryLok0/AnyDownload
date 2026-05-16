const EMA_ALPHA = 0.35;

function truncateUrl(url, maxLen = 64) {
    if (!url || url.length <= maxLen) return url || '';
    return `${url.slice(0, maxLen - 1)}…`;
}

/** Human-readable duration from milliseconds */
function formatDuration(ms) {
    if (ms == null || Number.isNaN(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return `${m}m ${r}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
}

function computePercent(completed, peakQueue) {
    const denom = Math.max(peakQueue || 0, 1);
    const pct = Math.round((100 * (completed || 0)) / denom);
    return Math.min(99, Math.max(0, pct));
}

/**
 * @param {number|null} prevEma
 * @param {number} gapMs ms since previous completed asset (or since site start for first)
 */
function updateEmaMs(prevEma, gapMs) {
    if (gapMs <= 0 || !Number.isFinite(gapMs)) return prevEma;
    if (prevEma == null) return gapMs;
    return EMA_ALPHA * gapMs + (1 - EMA_ALPHA) * prevEma;
}

function estimateEtaMs(emaMsPerItem, completed, peakQueue) {
    if (emaMsPerItem == null || !Number.isFinite(emaMsPerItem)) return null;
    const remaining = Math.max(0, (peakQueue || 0) - (completed || 0));
    const raw = emaMsPerItem * remaining;
    if (raw > 24 * 60 * 60 * 1000) return null;
    return raw;
}

function buildSpinnerText({
    phaseLabel,
    detailUrl,
    elapsedMs,
    percent,
    etaMs,
    visitedCount
}) {
    const elapsed = formatDuration(elapsedMs);
    const eta = etaMs != null && etaMs > 0 ? formatDuration(etaMs) : '—';
    const pageHint = visitedCount > 0 ? ` · pages visited ${visitedCount}` : '';
    const line1 = `${phaseLabel}${pageHint}`;
    const line2 = `Runtime ${elapsed} · ETA ~${eta} · ${percent}% · ${truncateUrl(detailUrl)}`;
    return `${line1}\n${line2}`;
}

/**
 * @param {object} opts
 * @param {import('ora').Ora | null} opts.spinner
 * @param {boolean} opts.noProgress
 * @param {number} opts.siteStartedAt
 */
function createDownloadTimeline(opts = {}) {
    const { spinner, noProgress, siteStartedAt } = opts;
    const startedAt = siteStartedAt ?? Date.now();
    const isTTY = Boolean(process.stderr.isTTY);
    const state = {
        lastDoneAt: startedAt,
        emaMsPerItem: null,
        currentPercent: 0,
        currentPeak: 0,
        lastCompleted: 0,
        currentPhase: 'Starting…',
        currentUrl: '',
        visitedCount: 0,
        assetDoneNonTTY: 0
    };

    function handle(payload) {
        if (noProgress) return;

        const now = Date.now();
        const elapsedMs = now - startedAt;

        if (payload.type === 'page-fetch-start') {
            state.currentPhase = 'Fetching page';
            state.currentUrl = payload.url || '';
            state.visitedCount = payload.visitedCount ?? state.visitedCount;
            state.currentPeak = 0;
            state.lastCompleted = 0;
            state.currentPercent = 0;
            const text = buildSpinnerText({
                phaseLabel: state.currentPhase,
                detailUrl: state.currentUrl,
                elapsedMs,
                percent: 0,
                etaMs: null,
                visitedCount: state.visitedCount
            });
            if (spinner && isTTY) spinner.text = text;
            else if (!isTTY) {
                process.stderr.write(`[AnyDownload] ${state.currentPhase}: ${truncateUrl(state.currentUrl, 120)}\n`);
            }
            return;
        }

        if (payload.type === 'page-html-saved') {
            state.currentPhase = 'Saving assets';
            state.currentUrl = payload.url || '';
            state.currentPeak = 0;
            state.lastCompleted = 0;
            state.currentPercent = 0;
            state.assetDoneNonTTY = 0;
            state.lastDoneAt = now;
            const text = buildSpinnerText({
                phaseLabel: state.currentPhase,
                detailUrl: state.currentUrl,
                elapsedMs,
                percent: 0,
                etaMs: null,
                visitedCount: state.visitedCount
            });
            if (spinner && isTTY) spinner.text = text;
            return;
        }

        if (payload.type === 'asset-start') {
            state.currentPhase = 'Downloading';
            state.currentUrl = payload.url || '';
            state.currentPeak = Math.max(state.currentPeak, payload.peakQueue || 0, payload.queueLength || 0);
            const pct = computePercent(state.lastCompleted, state.currentPeak);
            const text = buildSpinnerText({
                phaseLabel: state.currentPhase,
                detailUrl: state.currentUrl,
                elapsedMs,
                percent: pct,
                etaMs: estimateEtaMs(state.emaMsPerItem, state.lastCompleted, state.currentPeak),
                visitedCount: state.visitedCount
            });
            if (spinner && isTTY) spinner.text = text;
            return;
        }

        if (payload.type === 'asset-done') {
            const gap = now - state.lastDoneAt;
            state.lastDoneAt = now;
            state.emaMsPerItem = updateEmaMs(state.emaMsPerItem, gap);
            state.currentPeak = Math.max(state.currentPeak, payload.peakQueue || 0);
            state.lastCompleted = payload.completed || 0;
            state.currentPercent = computePercent(payload.completed, state.currentPeak);
            state.currentUrl = payload.url || '';
            const remaining = Math.max(0, state.currentPeak - payload.completed);
            const etaMs = estimateEtaMs(state.emaMsPerItem, payload.completed, state.currentPeak);

            const text = buildSpinnerText({
                phaseLabel: 'Downloading',
                detailUrl: state.currentUrl,
                elapsedMs,
                percent: state.currentPercent,
                etaMs,
                visitedCount: state.visitedCount
            });
            if (spinner && isTTY) spinner.text = text;
            else if (!isTTY) {
                state.assetDoneNonTTY++;
                if (state.assetDoneNonTTY % 10 === 0 || remaining === 0) {
                    process.stderr.write(
                        `[AnyDownload] Assets ${payload.completed}/${state.currentPeak} (~${state.currentPercent}%) · runtime ${formatDuration(elapsedMs)}\n`
                    );
                }
            }
            return;
        }

        if (payload.type === 'pipeline-complete') {
            state.currentPeak = Math.max(state.currentPeak, payload.peakQueue || 0);
            state.currentPercent = state.currentPeak > 0 ? 100 : 0;
            const text = buildSpinnerText({
                phaseLabel: 'Page assets done',
                detailUrl: state.currentUrl,
                elapsedMs,
                percent: state.currentPercent,
                etaMs: 0,
                visitedCount: state.visitedCount
            });
            if (spinner && isTTY) spinner.text = text;
        }
    }

    return { handle };
}

module.exports = {
    createDownloadTimeline,
    truncateUrl,
    formatDuration,
    computePercent,
    updateEmaMs,
    estimateEtaMs,
    EMA_ALPHA
};
