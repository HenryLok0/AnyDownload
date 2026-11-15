const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { prepareArchiveStorage, withArchiveDirectoryLock } = require('../src/downloader/storage/ArchiveStorage');

describe('archive storage', () => {
    let root;
    let destination;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'anydownload-archive-test-'));
        destination = path.join(root, 'df.qq.com');
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await fs.remove(root);
    });

    test('reserves the base folder first and resolves same-minute timestamp collisions', async () => {
        const date = new Date(2026, 10, 15, 23, 30);
        jest.spyOn(global, 'Date').mockImplementation(() => date);

        const first = await prepareArchiveStorage(destination, 'timestamp');
        try {
            expect(await first.commit()).toBe(destination);
            await fs.writeFile(path.join(first.directory, 'index.html'), 'original');

            const copies = await Promise.all([
                prepareArchiveStorage(destination, 'timestamp'),
                prepareArchiveStorage(destination, 'timestamp')
            ]);
            const reserved = await Promise.all(copies.map(async copy => {
                const directory = await copy.commit();
                await copy.dispose();
                return path.basename(directory);
            }));
            expect(reserved.sort()).toEqual([
                'df.qq.com_2611152330',
                'df.qq.com_2611152330_2'
            ]);
            expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('original');
        } finally {
            await first.dispose();
        }
    });

    test('cancelling an overwrite preserves the previous archive', async () => {
        const original = path.join(destination, 'index.html');
        await fs.outputFile(original, 'previous');
        const storage = await prepareArchiveStorage(destination, 'overwrite');

        await fs.writeFile(path.join(storage.directory, 'index.html'), 'unfinished');
        await storage.dispose();

        expect(await fs.readFile(original, 'utf8')).toBe('previous');
        expect(await fs.readdir(root)).toEqual(['df.qq.com']);
    });

    test('committing an overwrite replaces the whole archive', async () => {
        await fs.outputFile(path.join(destination, 'old.css'), 'previous');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        try {
            await fs.writeFile(path.join(storage.directory, 'index.html'), 'updated');
            expect(await storage.commit()).toBe(destination);
        } finally {
            await storage.dispose();
        }

        expect(await fs.readdir(root)).toEqual(['df.qq.com']);
        expect(await fs.readdir(destination)).toEqual(['index.html']);
        expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('updated');
    });

    test('preserves earlier fragment bundles when replacing the old site', async () => {
        const fragment = path.join(destination, 'pick-2026-11-15T15-30-00-000Z');
        await fs.outputFile(path.join(fragment, 'index.html'), 'saved fragment');
        await fs.outputFile(path.join(fragment, 'states', 'desktop-default.png'), 'screenshot');
        await fs.outputFile(path.join(destination, 'pick-plan', 'index.html'), 'old site page');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        try {
            await fs.writeFile(path.join(storage.directory, 'index.html'), 'new site');
            expect(await storage.commit()).toBe(destination);
        } finally {
            await storage.dispose();
        }

        expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('new site');
        expect(await fs.readFile(path.join(fragment, 'index.html'), 'utf8')).toBe('saved fragment');
        expect(await fs.readFile(path.join(fragment, 'states', 'desktop-default.png'), 'utf8')).toBe('screenshot');
        expect(await fs.pathExists(path.join(destination, 'pick-plan'))).toBe(false);
    });

    test('retains the prior site and fragment when the staged site has a fragment path collision', async () => {
        const fragmentName = 'pick-2026-11-15T15-30-00-000Z';
        const fragment = path.join(destination, fragmentName);
        await fs.outputFile(path.join(destination, 'index.html'), 'old site');
        await fs.outputFile(path.join(fragment, 'index.html'), 'saved fragment');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        try {
            await fs.outputFile(path.join(storage.directory, fragmentName, 'index.html'), 'new site page');
            await expect(storage.commit()).rejects.toMatchObject({
                code: 'ARCHIVE_FRAGMENT_COLLISION',
                archivePath: fragment
            });
        } finally {
            await storage.dispose();
        }

        expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('old site');
        expect(await fs.readFile(path.join(fragment, 'index.html'), 'utf8')).toBe('saved fragment');
    });

    test('waits for a fragment saving through a directory alias before copying it', async () => {
        const alias = path.join(root, 'alias');
        await fs.symlink(root, alias, 'junction');
        const viaAlias = path.join(alias, 'df.qq.com');
        const fragment = path.join('pick-2026-11-15T15-30-00-000Z', 'index.html');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        await fs.writeFile(path.join(storage.directory, 'index.html'), 'new site');

        let captureStarted;
        const started = new Promise(resolve => { captureStarted = resolve; });
        let finishCapture;
        const ready = new Promise(resolve => { finishCapture = resolve; });
        const capture = withArchiveDirectoryLock(viaAlias, async (directory) => {
            captureStarted(directory);
            await ready;
            await fs.outputFile(path.join(directory, fragment), 'saved fragment');
        });

        let replacement;
        try {
            expect(await Promise.race([started, capture])).toBe(destination);
            const stat = jest.spyOn(fs, 'lstat');
            replacement = storage.commit();
            await new Promise(resolve => setImmediate(resolve));
            expect(stat).not.toHaveBeenCalledWith(destination);
        } finally {
            finishCapture();
            try {
                await Promise.all([capture, replacement]);
            } finally {
                await storage.dispose();
            }
        }

        expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('new site');
        expect(await fs.readFile(path.join(destination, fragment), 'utf8')).toBe('saved fragment');
    });

    test('restores the previous archive when publishing the staged directory fails', async () => {
        const original = path.join(destination, 'index.html');
        await fs.outputFile(original, 'previous');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        const rename = fs.rename;
        const issue = new Error('failed to publish fixture');
        jest.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
            if (from === storage.directory) throw issue;
            return rename(from, to);
        });

        try {
            await expect(storage.commit()).rejects.toBe(issue);
        } finally {
            await storage.dispose();
        }
        expect(await fs.readFile(original, 'utf8')).toBe('previous');
        expect(await fs.readdir(root)).toEqual(['df.qq.com']);
    });

    test('retains a recoverable previous archive when rollback also fails', async () => {
        await fs.outputFile(path.join(destination, 'index.html'), 'previous');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        const backup = path.join(path.dirname(storage.directory), 'previous');
        const rename = fs.rename;
        jest.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
            if (from === storage.directory || from === backup) throw new Error('fixture rename failed');
            return rename(from, to);
        });

        try {
            await expect(storage.commit()).rejects.toMatchObject({
                code: 'ARCHIVE_BACKUP_RETAINED',
                backupPath: backup
            });
        } finally {
            await storage.dispose();
        }
        expect(await fs.readFile(path.join(backup, 'index.html'), 'utf8')).toBe('previous');
    });

    test('rejects overwriting a file at the destination', async () => {
        await fs.writeFile(destination, 'untouched');
        const storage = await prepareArchiveStorage(destination, 'overwrite');
        try {
            await expect(storage.commit()).rejects.toMatchObject({
                code: 'ARCHIVE_TARGET_NOT_DIRECTORY',
                archivePath: destination
            });
        } finally {
            await storage.dispose();
        }
        expect(await fs.readFile(destination, 'utf8')).toBe('untouched');
    });

    test('waits for a download that reserved the same base directory', async () => {
        const first = await prepareArchiveStorage(destination, 'timestamp');
        const second = await prepareArchiveStorage(destination, 'overwrite');
        const original = path.join(first.directory, 'index.html');
        try {
            await fs.writeFile(original, 'first');
            await fs.writeFile(path.join(second.directory, 'index.html'), 'second');
            const stat = jest.spyOn(fs, 'lstat');
            const publish = second.commit();
            await new Promise(resolve => setImmediate(resolve));
            expect(stat).not.toHaveBeenCalledWith(destination);

            await first.dispose();
            expect(await publish).toBe(destination);
            expect(await fs.readFile(original, 'utf8')).toBe('second');
        } finally {
            await first.dispose();
            await second.dispose();
        }
    });

    test('checks cancellation after waiting for the base directory', async () => {
        const first = await prepareArchiveStorage(destination, 'timestamp');
        const second = await prepareArchiveStorage(destination, 'overwrite');
        const original = path.join(first.directory, 'index.html');
        const cancellation = new Error('download cancelled');
        const beforePublish = jest.fn();
        try {
            await fs.writeFile(original, 'first');
            const publish = second.commit(beforePublish);
            const check = expect(publish).rejects.toBe(cancellation);
            await new Promise(resolve => setImmediate(resolve));
            expect(beforePublish).not.toHaveBeenCalled();

            beforePublish.mockImplementation(() => { throw cancellation; });
            await first.dispose();
            await check;
            expect(await fs.readFile(original, 'utf8')).toBe('first');
        } finally {
            await first.dispose();
            await second.dispose();
        }
    });
});
