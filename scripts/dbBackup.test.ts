import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const read = (relative: string) => readFileSync(path(relative), 'utf8');
const run = (script: string, args: string[] = []) =>
  spawnSync('bash', [path(script), ...args], { env: { NODE_ENV: 'test', PATH: process.env.PATH } });

describe('database backup', () => {
  it('ships valid bash scripts', () => {
    for (const script of ['scripts/db-backup.sh', 'scripts/db-restore.sh']) {
      const result = spawnSync('bash', ['-n', path(script)]);
      expect(result.status, result.stderr.toString()).toBe(0);
    }
  });

  it('fails fast without configuration instead of dumping nothing', () => {
    const result = run('scripts/db-backup.sh');
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/Missing required variable/);
  });

  it('encrypts dumps and passes secrets to the workflow only through env', () => {
    const script = read('scripts/db-backup.sh');
    const flow = read('.github/workflows/db-backup.yml');
    expect(script).toMatch(/age -r/);
    expect(script).not.toMatch(/pg_dump[^\n]*>\s*[^"$]/);
    expect(script).toMatch(/"\$\{PG_DUMP:-pg_dump\}"/);
    expect(script).toMatch(/game-club-finance\/db-backups/);
    expect(flow).toMatch(/PG_DUMP: \/usr\/lib\/postgresql\/17\/bin\/pg_dump/);
    expect(flow).toMatch(/cron:/);
    expect(flow).toMatch(/workflow_dispatch/);
    expect(flow).toMatch(/if: failure\(\)/);
    expect(flow).not.toMatch(/run:[^\n]*\$\{\{\s*secrets\./);
  });

  it('requires an identity file and both arguments to restore', () => {
    expect(run('scripts/db-restore.sh').status).not.toBe(0);
    const result = run('scripts/db-restore.sh', ['a', 'b']);
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/AGE_IDENTITY_FILE/);
  });
});
