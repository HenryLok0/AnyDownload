const { revealInPage } = require('../src/engine/revealLazyContent');

describe('revealInPage', () => {
    const previous = {};

    afterEach(() => {
        for (const key of ['document', 'window', 'location', 'history']) {
            if (previous[key] === undefined) delete global[key];
            else global[key] = previous[key];
        }
    });

    test('scrolls and clicks expanders, and skips pay, login, and submit controls', async () => {
        previous.document = global.document;
        previous.window = global.window;
        previous.location = global.location;
        previous.history = global.history;

        const clicked = [];
        function control(tag, text, extra = {}) {
            return {
                tagName: tag,
                disabled: false,
                innerText: text,
                textContent: text,
                getAttribute: (name) => (extra.attr && extra.attr[name]) || '',
                closest: () => (extra.inForm ? {} : null),
                click() {
                    clicked.push(text);
                }
            };
        }

        global.document = {
            scrollingElement: { scrollHeight: 100 },
            querySelectorAll: () => [
                control('BUTTON', 'Show more'),
                control('BUTTON', 'Pay now'),
                control('BUTTON', 'Log in'),
                control('BUTTON', 'Submit', { inForm: true, attr: { type: 'submit' } }),
                control('SUMMARY', 'Details'),
                control('A', 'Next page')
            ]
        };
        global.window = { innerHeight: 800, scrollTo() {} };
        global.location = { href: 'https://example.com/page' };
        global.history = { back() {} };

        await revealInPage();
        expect(clicked).toEqual(['Show more', 'Details']);
    });
});
