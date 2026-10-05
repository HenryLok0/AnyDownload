const PICKER_TEXT = {
    en: {
        parent: 'Parent',
        child: 'Child',
        export: 'Export',
        cancel: 'Cancel',
        hint: 'Click a block. Parent widens it up the page structure. Child narrows it. Export stays on this computer.'
    },
    'zh-TW': {
        parent: '上一層',
        child: '下一層',
        export: '匯出',
        cancel: '取消',
        hint: '點選區塊。上一層會沿頁面結構擴大範圍，下一層會縮小。匯出只存在這台電腦。'
    },
    ja: {
        parent: '親へ',
        child: '子へ',
        export: '書き出し',
        cancel: 'キャンセル',
        hint: 'ブロックをクリック。親へで範囲を広げ、子へで狭めます。書き出しはこのパソコン内だけです。'
    },
    ko: {
        parent: '상위',
        child: '하위',
        export: '내보내기',
        cancel: '취소',
        hint: '블록을 클릭하세요. 상위는 범위를 넓히고 하위는 좁힙니다. 내보내기는 이 컴퓨터에만 저장됩니다.'
    }
};

function pickerLabels(locale) {
    const key = String(locale || 'en').toLowerCase();
    if (key.startsWith('zh')) return PICKER_TEXT['zh-TW'];
    if (key.startsWith('ja')) return PICKER_TEXT.ja;
    if (key.startsWith('ko')) return PICKER_TEXT.ko;
    return PICKER_TEXT.en;
}

/**
 * Installed in the target page before navigation.
 * The page argument is the label set; nothing is sent off the machine.
 */
function installPicker(labels) {
    const text = {
        parent: 'Parent',
        child: 'Child',
        export: 'Export',
        cancel: 'Cancel',
        hint: 'Click a block. Parent widens it up the page structure. Child narrows it.'
    };
    if (labels && typeof labels === 'object') {
        Object.keys(text).forEach((key) => {
            if (labels[key]) text[key] = String(labels[key]);
        });
    }
    if (document.getElementById('anydownload-picker-host')) return;

    const host = document.createElement('div');
    host.id = 'anydownload-picker-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = [
        '.box{position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,.15);pointer-events:none;box-sizing:border-box;}',
        '.panel{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto;',
        'background:#0f172a;color:#f8fafc;font:13px/1.4 sans-serif;padding:10px 12px;border-radius:10px;',
        'box-shadow:0 8px 24px rgba(0,0,0,.28);max-width:min(560px,calc(100vw - 24px));}',
        '.hint{margin:0 0 8px;color:#cbd5e1;}',
        '.label{font-family:ui-monospace,monospace;font-size:12px;margin-bottom:8px;word-break:break-all;}',
        '.row{display:flex;gap:8px;flex-wrap:wrap;}',
        'button{font:inherit;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;background:#1e293b;color:#f8fafc;}',
        'button.primary{background:#2563eb;}',
        'button:disabled{opacity:.45;cursor:default;}'
    ].join('');
    shadow.appendChild(style);

    const box = document.createElement('div');
    box.className = 'box';
    shadow.appendChild(box);

    const panel = document.createElement('div');
    panel.className = 'panel';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = text.hint;
    const label = document.createElement('div');
    label.className = 'label';
    const row = document.createElement('div');
    row.className = 'row';
    panel.appendChild(hint);
    panel.appendChild(label);
    panel.appendChild(row);
    shadow.appendChild(panel);

    let pinned = document.body || document.documentElement;
    let sent = false;

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

    function describe(el) {
        if (!el || el.nodeType !== 1) return '';
        const id = el.id ? '#' + el.id : '';
        const classes = el.classList && el.classList.length
            ? '.' + Array.prototype.slice.call(el.classList, 0, 3).join('.')
            : '';
        const rect = el.getBoundingClientRect();
        return el.tagName.toLowerCase() + id + classes + '  ' + Math.round(rect.width) + '×' + Math.round(rect.height);
    }

    function moveBox(el) {
        if (!el || el.nodeType !== 1) {
            box.style.display = 'none';
            return;
        }
        const rect = el.getBoundingClientRect();
        box.style.display = 'block';
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = Math.max(rect.width, 0) + 'px';
        box.style.height = Math.max(rect.height, 0) + 'px';
    }

    function pin(el) {
        let next = el;
        if (!next || next.nodeType !== 1 || next === document.documentElement) next = document.body;
        if (!next || next.id === 'anydownload-picker-host') return;
        const root = next.getRootNode && next.getRootNode();
        if (root && root.host && root instanceof ShadowRoot) next = root.host;
        pinned = next;
        window.__anydownloadSelection = next;
        window.__anydownloadSelector = cssPath(next);
        label.textContent = describe(next);
        moveBox(next);
        parentBtn.disabled = !next.parentElement || next.parentElement === document.documentElement || next === document.body;
        childBtn.disabled = !next.firstElementChild;
    }

    function targetFromEvent(event) {
        const path = event.composedPath ? event.composedPath() : [];
        for (let i = 0; i < path.length; i += 1) {
            if (path[i] && path[i].id === 'anydownload-picker-host') return null;
        }
        const first = path[0] || event.target;
        if (!first || first.nodeType !== 1) return null;
        const root = first.getRootNode && first.getRootNode();
        if (root && root.host && root instanceof ShadowRoot) return root.host;
        return first;
    }

    function signal(kind) {
        if (sent || typeof window.__anydownloadSignal !== 'function') return;
        sent = true;
        label.textContent = kind === 'export' ? '…' : label.textContent;
        window.__anydownloadSignal(kind);
    }

    function makeButton(caption, className, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = caption;
        if (className) button.className = className;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    const parentBtn = makeButton(text.parent, '', () => {
        if (pinned && pinned.parentElement && pinned.parentElement !== document.documentElement) {
            pin(pinned === document.body ? document.body : pinned.parentElement);
        }
    });
    const childBtn = makeButton(text.child, '', () => {
        if (pinned && pinned.firstElementChild) pin(pinned.firstElementChild);
    });
    const exportBtn = makeButton(text.export, 'primary', () => signal('export'));
    const cancelBtn = makeButton(text.cancel, '', () => signal('cancel'));
    row.appendChild(parentBtn);
    row.appendChild(childBtn);
    row.appendChild(exportBtn);
    row.appendChild(cancelBtn);

    window.addEventListener('mousemove', (event) => {
        const target = targetFromEvent(event);
        if (!target || target === pinned) return;
        moveBox(target);
    }, true);

    window.addEventListener('click', (event) => {
        const target = targetFromEvent(event);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        pin(target);
    }, true);

    window.addEventListener('keydown', (event) => {
        const typing = event.target && (
            event.target.tagName === 'INPUT' ||
            event.target.tagName === 'TEXTAREA' ||
            event.target.isContentEditable
        );
        if (typing) return;
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            parentBtn.click();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            childBtn.click();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            signal('export');
        } else if (event.key === 'Escape') {
            event.preventDefault();
            signal('cancel');
        }
    }, true);

    window.addEventListener('scroll', () => moveBox(pinned), true);
    window.addEventListener('resize', () => moveBox(pinned));

    const mount = () => {
        if (!document.documentElement) return;
        document.documentElement.appendChild(host);
        pin(document.body || document.documentElement);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
}

module.exports = {
    PICKER_TEXT,
    installPicker,
    pickerLabels
};
