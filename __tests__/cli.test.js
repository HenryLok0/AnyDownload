const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');

describe('CLI', () => {
    test('accepts bare domain as URL (not as subcommand)', () => {
        const result = spawnSync(process.execPath, [CLI, 'example.com', '--help'], {
            encoding: 'utf8',
            timeout: 10000
        });
        expect(result.stderr).not.toMatch(/unknown command ['"]example\.com['"]/i);
    });

    test('shows help without unknown command error', () => {
        const result = spawnSync(process.execPath, [CLI, 'download', '--help'], {
            encoding: 'utf8',
            timeout: 10000
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/Download a website/i);
        expect(result.stdout).toMatch(/--mode/);
    });
});
