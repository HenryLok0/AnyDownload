const fs = require('fs-extra');
const os = require('os');
const path = require('path');

describe('desktop task output deletion', () => {
    const sourceUrl = 'https://example.com/';
    let root;
    let directory;

    beforeEach(async () => {
        jest.resetModules();
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'anydownload-delete-test-'));
        directory = path.join(root, 'archives', 'example.com');
    });

    afterEach(async () => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        await fs.remove(root);
    });

    function task(id, fields = {}) {
        return { id, url: sourceUrl, mode: 'download', status: 'success', outputDir: directory, ...fields };
    }

    async function saveArchive(target, contents, manifest = { sourceUrl }) {
        await fs.outputFile(path.join(target, 'index.html'), contents);
        await fs.writeJson(path.join(target, 'anydownload.json'), manifest);
    }

    async function loadDesktop(tasks) {
        await fs.outputJson(path.join(root, 'userData', 'tasks.json'), tasks);
        const handlers = new Map();
        const ready = Promise.resolve();
        const showMessageBox = jest.fn().mockResolvedValue({ response: 2 });
        jest.doMock('electron', () => ({
            app: {
                on: jest.fn(),
                whenReady: () => ready,
                getPath: name => path.join(root, name)
            },
            BrowserWindow: function () {
                this.loadFile = jest.fn();
                this.loadURL = jest.fn();
                this.on = jest.fn();
            },
            Menu: { setApplicationMenu: jest.fn() },
            ipcMain: {
                handle: (name, handler) => handlers.set(name, handler),
                on: jest.fn()
            },
            dialog: { showMessageBox }
        }));
        require('../electron-main.js');
        await ready;
        return {
            showMessageBox,
            deleteTasks: (...ids) => handlers.get('delete-tasks')(null, ids),
            getTasks: handlers.get('get-tasks')
        };
    }

    test('skips a superseded download and allows its current owner to remove the files', async () => {
        const current = task('current', { archiveId: 'current-version' });
        const previous = task('previous', { archiveId: 'previous-version' });
        await saveArchive(directory, 'current archive', { sourceUrl, archiveId: current.archiveId });
        const desktop = await loadDesktop([current, previous]);

        expect(await desktop.deleteTasks(previous.id)).toBe(true);
        expect(desktop.getTasks()).toEqual([current]);
        expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toBe('current archive');

        expect(await desktop.deleteTasks(current.id)).toBe(true);
        expect(desktop.getTasks()).toEqual([]);
        expect(await fs.pathExists(directory)).toBe(false);
    });

    test('protects a managed replacement published while a legacy deletion was awaiting confirmation', async () => {
        await saveArchive(directory, 'legacy archive');
        const desktop = await loadDesktop([task('legacy')]);
        const { prepareArchiveStorage } = require('../src/downloader/storage/ArchiveStorage');
        const replacement = await prepareArchiveStorage(directory, 'overwrite');
        try {
            await saveArchive(replacement.directory, 'replacement archive', { sourceUrl, archiveId: 'new-owner' });
            desktop.showMessageBox.mockImplementationOnce(async () => {
                await replacement.commit();
                return { response: 2 };
            });

            expect(await desktop.deleteTasks('legacy')).toBe(true);
            expect(desktop.getTasks()).toEqual([]);
            expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toBe('replacement archive');
        } finally {
            await replacement.dispose();
        }
    });

    test('does not remove an ambiguous legacy archive referenced through a directory junction', async () => {
        await saveArchive(directory, 'legacy archive');
        const alias = path.join(root, 'alias');
        await fs.symlink(path.dirname(directory), alias, 'junction');
        const desktop = await loadDesktop([
            task('direct'),
            task('alias', { outputDir: path.join(alias, path.basename(directory)) })
        ]);

        expect(await desktop.deleteTasks('direct', 'alias')).toBe(true);
        expect(desktop.getTasks()).toEqual([]);
        expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toBe('legacy archive');
    });

    test('allows deletion of a unique legacy archive whose manifest matches the task', async () => {
        await saveArchive(directory, 'legacy archive');
        const desktop = await loadDesktop([task('legacy', { url: 'https://example.com' })]);

        expect(await desktop.deleteTasks('legacy')).toBe(true);
        expect(desktop.getTasks()).toEqual([]);
        expect(await fs.pathExists(directory)).toBe(false);
    });

    test('removes a successful picked bundle without deleting the surrounding archive', async () => {
        await saveArchive(directory, 'site archive');
        const picked = path.join(directory, 'pick-2026-11-16T00-00-00-000Z');
        await fs.outputFile(path.join(picked, 'index.html'), 'picked fragment');
        const desktop = await loadDesktop([task('pick', { mode: 'pick', outputDir: picked })]);

        expect(await desktop.deleteTasks('pick')).toBe(true);
        expect(desktop.getTasks()).toEqual([]);
        expect(await fs.pathExists(picked)).toBe(false);
        expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toBe('site archive');
    });

    test.each(['missing', 'malformed', 'different source'])('preserves files with a %s legacy manifest', async (kind) => {
        await fs.outputFile(path.join(directory, 'index.html'), 'existing archive');
        const manifestPath = path.join(directory, 'anydownload.json');
        if (kind === 'malformed') await fs.writeFile(manifestPath, '{');
        if (kind === 'different source') await fs.writeJson(manifestPath, { sourceUrl: 'https://example.com/another-page' });
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const desktop = await loadDesktop([task('legacy')]);

        expect(await desktop.deleteTasks('legacy')).toBe(true);
        expect(desktop.getTasks()).toEqual([]);
        expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toBe('existing archive');
    });

    test('removes failed and running rows without removing their shared output root', async () => {
        await fs.outputFile(path.join(directory, 'index.html'), 'existing archive');
        const sharedRoot = path.dirname(directory);
        const desktop = await loadDesktop([
            task('failed-download', { status: 'error', outputDir: sharedRoot }),
            task('failed-pick', { mode: 'pick', status: 'error', outputDir: sharedRoot }),
            task('running-discovery', { mode: 'discovery', status: 'running', outputDir: sharedRoot })
        ]);

        expect(await desktop.deleteTasks('failed-download', 'failed-pick', 'running-discovery')).toBe(true);
        expect(desktop.getTasks()).toEqual([]);
        expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toBe('existing archive');
    });
});
