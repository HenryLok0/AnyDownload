const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { prepareArchiveStorage } = require('../src/downloader/storage/ArchiveStorage');

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
