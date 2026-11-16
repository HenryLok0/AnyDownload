const fs = require('fs-extra');
const path = require('path');

const operations = new Map();
const activeTimestampDownloads = new Map();
const fragmentDirectoryName = /^pick-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/u;

function normalizeArchiveDirectory(directory) {
    if (!path.isAbsolute(directory)) throw new Error('Archive destination must be absolute');
    const normalized = path.resolve(directory);
    const parent = path.dirname(normalized);
    const name = process.platform === 'win32'
        ? path.basename(normalized).replace(/[. ]+$/u, '')
        : path.basename(normalized);
    if (parent === normalized || !name) throw new Error('Archive destination cannot be a filesystem root');
    return path.join(parent, name);
}

async function resolveArchiveDirectory(directory) {
    const parent = await fs.realpath(path.dirname(directory));
    return path.join(parent, path.basename(directory));
}

function directoryKey(directory) {
    return process.platform === 'win32' ? directory.toLowerCase() : directory;
}

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

async function withArchiveDirectoryLock(directory, work) {
    const actualDirectory = await resolveArchiveDirectory(normalizeArchiveDirectory(directory));
    const key = directoryKey(actualDirectory);
    return withDestinationLock(key, async () => {
        await activeTimestampDownloads.get(key);
        return work(actualDirectory);
    });
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

async function reserveTimestampedDirectory(directory, key) {
    if (!await tryReserveDirectory(directory)) return null;

    let release;
    const pending = new Promise(resolve => { release = resolve; });
    activeTimestampDownloads.set(key, pending);
    return {
        directory,
        async commit(beforePublish) {
            beforePublish?.();
            return directory;
        },
        async dispose() {
            if (activeTimestampDownloads.get(key) === pending) activeTimestampDownloads.delete(key);
            release();
        }
    };
}

async function prepareTimestampedStorage(destination, key) {
    return withDestinationLock(key, async () => {
        const base = await reserveTimestampedDirectory(destination, key);
        if (base) return base;

        const prefix = `${destination}_${localTimestamp(new Date())}`;
        for (let suffix = 1; ; suffix++) {
            const directory = suffix === 1 ? prefix : `${prefix}_${suffix}`;
            const candidateKey = directoryKey(directory);
            const candidate = await withDestinationLock(candidateKey, () => reserveTimestampedDirectory(directory, candidateKey));
            if (candidate) return candidate;
        }
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

async function preserveFragmentDirectories(previousArchive, replacement) {
    const entries = await fs.readdir(previousArchive, { withFileTypes: true });
    for (const entry of entries) {
        if (!fragmentDirectoryName.test(entry.name) || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
        const previousFragment = path.join(previousArchive, entry.name);
        const replacementFragment = path.join(replacement, entry.name);
        if (await statIfExists(replacementFragment)) {
            const error = new Error(`Cannot replace archive because a saved fragment has the same path: ${previousFragment}`);
            error.code = 'ARCHIVE_FRAGMENT_COLLISION';
            error.archivePath = previousFragment;
            throw error;
        }
        await fs.copy(previousFragment, replacementFragment, { dereference: false, overwrite: false, errorOnExist: true });
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

                await activeTimestampDownloads.get(key);
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
                if (existing) await preserveFragmentDirectories(destination, directory);
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
    destination = normalizeArchiveDirectory(destination);
    if (rule !== 'timestamp' && rule !== 'overwrite') throw new Error(`Unknown storage rule: ${rule}`);

    await fs.ensureDir(path.dirname(destination));
    destination = await resolveArchiveDirectory(destination);
    const key = directoryKey(destination);
    if (rule === 'timestamp') return prepareTimestampedStorage(destination, key);
    return prepareOverwriteStorage(destination, key);
}

module.exports = { prepareArchiveStorage, withArchiveDirectoryLock };
