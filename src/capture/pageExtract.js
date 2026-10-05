/**
 * Runs inside the captured page via page.evaluate.
 * Copies the selected subtree and the page's own CSS. Does not call any model.
 */
function extractFragmentInPage() {
    const COMPUTED_PROPS = [
        'color', 'background-color', 'background-image', 'background-size', 'background-position',
        'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
        'display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'border-radius',
        'box-shadow', 'opacity', 'overflow', 'flex-direction', 'flex-wrap', 'justify-content',
        'align-items', 'gap', 'object-fit', 'max-width', 'min-height'
    ];

    function absolutizeCssUrls(css, base) {
        if (!css) return '';
        return String(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, _q, raw) => {
            const token = String(raw || '').trim();
            if (!token || token.startsWith('data:') || token.startsWith('blob:') || token.startsWith('#')) {
                return full;
            }
            try {
                return 'url("' + new URL(token, base).href + '")';
            } catch (err) {
                return full;
            }
        });
    }

    function rulesToText(rules, base) {
        let out = '';
        for (let i = 0; i < rules.length; i += 1) {
            const rule = rules[i];
            if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
                try {
                    out += rulesToText(rule.styleSheet.cssRules, rule.styleSheet.href || base);
                } catch (err) {
                    /* Cross-origin import is fetched later from its href. */
                }
                continue;
            }
            try {
                out += absolutizeCssUrls(rule.cssText, base) + '\n';
            } catch (err) {
                /* Skip a rule the browser will not serialize. */
            }
        }
        return out;
    }

    function cssPath(el) {
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
            let index = 1;
            let sib = node.previousElementSibling;
            while (sib) {
                if (sib.tagName === node.tagName) index += 1;
                sib = sib.previousElementSibling;
            }
            parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
            node = node.parentElement;
        }
        return parts.join(' > ');
    }

    function labelFor(el) {
        const id = el.id ? '#' + el.id : '';
        const classes = el.classList && el.classList.length
            ? '.' + Array.prototype.slice.call(el.classList, 0, 3).join('.')
            : '';
        return el.tagName.toLowerCase() + id + classes;
    }

    function absolutizeSrcset(value) {
        return String(value || '').split(',').map((part) => {
            const bits = part.trim().split(/\s+/);
            if (!bits[0] || bits[0].startsWith('data:') || bits[0].startsWith('blob:')) return part.trim();
            try {
                bits[0] = new URL(bits[0], document.baseURI).href;
            } catch (err) {
                /* Leave an unparseable token unchanged. */
            }
            return bits.join(' ');
        }).join(', ');
    }

    function absolutizeElementUrls(el) {
        ['src', 'poster', 'data-src', 'href', 'xlink:href'].forEach((attr) => {
            const value = el.getAttribute(attr);
            if (!value || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('#')) return;
            try {
                el.setAttribute(attr, new URL(value, document.baseURI).href);
            } catch (err) {
                /* Keep the authored value. */
            }
        });
        if (el.hasAttribute('srcset')) {
            el.setAttribute('srcset', absolutizeSrcset(el.getAttribute('srcset')));
        }
        if (el.hasAttribute('style')) {
            el.setAttribute('style', absolutizeCssUrls(el.getAttribute('style'), document.baseURI));
        }
    }

    function cloneNodeSafe(node) {
        if (!node) return null;
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        if (node.id === 'anydownload-picker-host') return null;
        const tag = node.tagName.toLowerCase();
        if (tag === 'script' || tag === 'noscript') return null;
        if (tag === 'iframe' || tag === 'frame' || tag === 'object' || tag === 'embed') return null;
        if (tag === 'link') {
            const rel = (node.getAttribute('rel') || '').toLowerCase();
            if (/\bstylesheet\b|\bpreload\b|\bmodulepreload\b|\bprefetch\b/.test(rel)) return null;
        }
        const clone = node.cloneNode(false);
        absolutizeElementUrls(clone);
        Array.prototype.slice.call(clone.attributes).forEach((attr) => {
            if (/^on/i.test(attr.name)) clone.removeAttribute(attr.name);
        });
        ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster'].forEach((attr) => {
            const value = clone.getAttribute(attr);
            if (value && /^\s*javascript:/i.test(value)) clone.removeAttribute(attr);
        });
        if (node.shadowRoot) {
            node.shadowRoot.childNodes.forEach((child) => {
                const next = cloneNodeSafe(child);
                if (next) clone.appendChild(next);
            });
        }
        node.childNodes.forEach((child) => {
            const next = cloneNodeSafe(child);
            if (next) clone.appendChild(next);
        });
        return clone;
    }

    function applyComputed(source, clone) {
        if (!source || !clone || source.nodeType !== 1 || clone.nodeType !== 1) return;
        const computed = getComputedStyle(source);
        const bits = [];
        COMPUTED_PROPS.forEach((prop) => {
            const value = computed.getPropertyValue(prop);
            if (value) bits.push(prop + ':' + value);
        });
        if (bits.length) clone.setAttribute('style', bits.join(';'));
        const sourceChildren = [];
        source.childNodes.forEach((child) => {
            if (child.nodeType === 1 && child.id !== 'anydownload-picker-host') sourceChildren.push(child);
        });
        const cloneChildren = [];
        clone.childNodes.forEach((child) => {
            if (child.nodeType === 1) cloneChildren.push(child);
        });
        const count = Math.min(sourceChildren.length, cloneChildren.length);
        for (let i = 0; i < count; i += 1) applyComputed(sourceChildren[i], cloneChildren[i]);
    }

    const selected = window.__anydownloadSelection;
    if (!selected || selected.nodeType !== 1) return null;
    let source = selected.tagName === 'HTML' ? document.body : selected;
    if (!source) return null;

    const chunks = [];
    const failedStylesheetHrefs = [];
    Array.prototype.forEach.call(document.styleSheets, (sheet) => {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch (err) {
            if (sheet.href) failedStylesheetHrefs.push(sheet.href);
            return;
        }
        chunks.push(rulesToText(rules, sheet.href || document.baseURI));
    });

    const bodyComputed = getComputedStyle(document.body);
    const bodyStyle = [
        'background-color:' + bodyComputed.backgroundColor,
        'color:' + bodyComputed.color,
        'font-family:' + bodyComputed.fontFamily
    ].join(';');

    let bodyClass = '';
    let fragmentHtml = '';
    if (source.tagName === 'BODY') {
        bodyClass = source.className || '';
        const holder = document.createElement('div');
        source.childNodes.forEach((child) => {
            const next = cloneNodeSafe(child);
            if (next) holder.appendChild(next);
        });
        if (chunks.join('').trim().length < 40) applyComputed(source, holder);
        fragmentHtml = holder.innerHTML;
    } else {
        const clone = cloneNodeSafe(source);
        if (!clone) return null;
        if (chunks.join('').trim().length < 40) applyComputed(source, clone);
        fragmentHtml = clone.outerHTML;
    }

    return {
        html: fragmentHtml,
        css: chunks.join('\n'),
        label: labelFor(source),
        selector: window.__anydownloadSelector || cssPath(source),
        bodyStyle,
        bodyClass,
        failedStylesheetHrefs
    };
}

module.exports = { extractFragmentInPage };
