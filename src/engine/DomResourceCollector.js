/**
 * Collect resource URLs visible in the rendered DOM (images, background-image).
 */
async function collectDomResourceUrls(page) {
    return page.evaluate(() => {
        const urls = new Set();
        document.querySelectorAll('img[src]').forEach((img) => {
            if (img.src && !img.src.startsWith('data:')) urls.add(img.src);
        });
        document.querySelectorAll('source[src]').forEach((el) => {
            if (el.src && !el.src.startsWith('data:')) urls.add(el.src);
        });
        document.querySelectorAll('*').forEach((el) => {
            const bg = getComputedStyle(el).backgroundImage;
            if (!bg || bg === 'none') return;
            const matches = bg.matchAll(/url\(["']?([^"')]+)["']?\)/g);
            for (const m of matches) {
                if (m[1] && !m[1].startsWith('data:')) urls.add(m[1]);
            }
        });
        return [...urls];
    });
}

module.exports = { collectDomResourceUrls };
