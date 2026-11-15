const fs = require('fs-extra');
const path = require('path');

const operations = new Map();
const activeBaseDownloads = new Map();

async function withDestinationLock(key, work) {
    const previous = operations.get(key);
    let release;
    const current = new Promise(resolve => { release = resolve; });
    operations.set(key, current);

    try {
        await previous;
        return await work();
    } finally {
        release();
        if (operations.get(key) === current) operations.delete(key);
    }
}

function localTimestamp(date) {
    return [
        date.getFullYear() % 100,
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes()
    ].map(value => String(value).padStart(2, '0')).join('');
}

async function tryReserveDirectory(directory) {
    try {
        await fs.mkdir(directory);
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
    }
}

async function prepareTimestampedStorage(destination, key) {
    return withDestinationLock(key, async () => {
        if (await tryReserveDirectory(destination)) {
            let release;
            const pending = new Promise(resolve => { release = resolve; });
            activeBaseDownloads.set(key, pending);
            return {
                directory: destination,
                async commit(beforePublish) {
                    beforePublish?.();
                    return destination;
                },
                dispose: async () => {
                    if (activeBaseDownloads.get(key) === pending) activeBaseDownloads.delete(key);
                    release();
                }
            };
        }

        const prefix = `${destination}_${localTimestamp(new Date())}`;
        let directory = prefix;
        for (let suffix = 2; !(await tryReserveDirectory(directory)); suffix++) {
            directory = `${prefix}_${suffix}`;
        }
        return {
            directory,
            async commit(beforePublish) {
                beforePublish?.();
                return directory;
            },
            async dispose() {}
        };
    });
}

async function statIfExists(directory) {
    try {
        return await fs.lstat(directory);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

async function prepareOverwriteStorage(destination, key) {
    const workspace = await fs.mkdtemp(path.join(path.dirname(destination), '.anydownload-'));
    const directory = path.join(workspace, 'archive');
    const backup = path.join(workspace, 'previous');
    try {
        await fs.mkdir(directory);
    } catch (error) {
        await fs.remove(workspace).catch(() => {});
        throw error;
    }
    let committed = false;
    let disposed = false;
    let keepBackup = false;

    return {
        directory,
        async commit(beforePublish) {
            return withDestinationLock(key, async () => {
                if (committed) return destination;
                if (disposed || keepBackup) throw new Error('Archive storage is no longer available');

                await activeBaseDownloads.get(key);
                const existing = await statIfExists(destination);
                if (existing && !existing.isDirectory()) {
                    const error = new Error(`Archive destination is not a directory: ${destination}`);
                    error.code = 'ARCHIVE_TARGET_NOT_DIRECTORY';
                    error.archivePath = destination;
                    throw error;
                }
                // Verify the staged archive exists before moving the previous copy.
                if (!(await fs.lstat(directory)).isDirectory()) {
                    throw new Error(`Staged archive is not a directory: ${directory}`);
                }
                beforePublish?.();
                if (existing) await fs.rename(destination, backup);
                try {
                    await fs.rename(directory, destination);
                } catch (error) {
                    if (existing) {
                        try {
                            if (await statIfExists(destination)) {
                                throw new Error('Archive destination was taken during the replacement');
                            }
                            await fs.rename(backup, destination);
                        } catch (rollbackError) {
                            keepBackup = true;
                            const failure = new Error(
                                `Could not replace archive: ${error.message}. Could not restore it: ${rollbackError.message}. Previous archive is at ${backup}`
                            );
                            failure.code = 'ARCHIVE_BACKUP_RETAINED';
                            failure.backupPath = backup;
                            failure.cause = error;
                            throw failure;
                        }
                    }
                    throw error;
                }
                committed = true;
                return destination;
            });
        },
        async dispose() {
            disposed = true;
            if (!keepBackup) await fs.remove(workspace).catch(() => {});
        }
    };
}

async function prepareArchiveStorage(destination, rule) {
    if (!path.isAbsolute(destination)) throw new Error('Archive destination must be absolute');
    destination = path.resolve(destination);
    const parent = path.dirname(destination);
    if (parent === destination) throw new Error('Archive destination cannot be a filesystem root');
    if (rule !== 'timestamp' && rule !== 'overwrite') throw new Error(`Unknown storage rule: ${rule}`);

    await fs.ensureDir(parent);
    const key = process.platform === 'win32' ? destination.toLowerCase() : destination;
    if (rule === 'timestamp') return prepareTimestampedStorage(destination, key);
    return prepareOverwriteStorage(destination, key);
}

module.exports = { prepareArchiveStorage };
