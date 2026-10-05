/**
 * Scroll the open page and click a few expanders so late content is requested.
 * The function is sent into the page, so the limits and filters live inside it.
 */
async function revealInPage() {
    function canReveal(el) {
        if (!el || el.disabled) return false;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select') return false;
        if (typeof el.closest === 'function' && el.closest('form')) return false;
        const type = String(el.getAttribute ? (el.getAttribute('type') || '') : '').toLowerCase();
        if (type === 'submit' || type === 'reset') return false;
        const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (/pay|buy|login|log in|sign in|sign up|delete|checkout|subscribe|password|captcha/i.test(text)) {
            return false;
        }
        return true;
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const root = document.scrollingElement || document.documentElement || document.body;
    const step = Math.max((window.innerHeight || 800) * 0.85, 400);
    let y = 0;
    for (let i = 0; i < 24; i++) {
        y += step;
        window.scrollTo(0, y);
        await wait(180);
        const height = (root && root.scrollHeight) || 0;
        if (y >= height - 10) break;
    }
    window.scrollTo(0, 0);

    const start = location.href;
    const nodes = Array.from(document.querySelectorAll(
        'button, summary, [role="button"], [aria-expanded="false"]'
    ));
    let clicks = 0;
    for (const el of nodes) {
        if (clicks >= 12) break;
        if (!canReveal(el)) continue;
        if (typeof el.click === 'function') el.click();
        clicks += 1;
        await wait(250);
        if (location.href !== start) {
            history.back();
            await wait(300);
            break;
        }
    }
    window.scrollTo(0, 0);
}

async function revealLazyContent(page) {
    if (!page || typeof page.evaluate !== 'function') return;
    const start = typeof page.url === 'function' ? page.url() : '';
    await page.evaluate(revealInPage);
    const now = typeof page.url === 'function' ? page.url() : start;
    if (start && now && now !== start && typeof page.goto === 'function') {
        await page.goto(start, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
}

module.exports = {
    revealInPage,
    revealLazyContent
};
