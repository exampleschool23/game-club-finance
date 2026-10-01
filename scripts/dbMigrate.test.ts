import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const read = (relative: string) => readFileSync(path(relative), 'utf8');
// PSQL=true stands in for a client that exists, so checks before any query can run offline.
const migrate = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('bash', [path('scripts/db-migrate.sh'), ...args], {
    env: { NODE_ENV: 'test', PATH: process.env.PATH, PSQL: 'true', ...env },
  });

let dir = '';
const migrationsDir = (files: string[]) => {
  dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  for (const file of files) writeFileSync(join(dir, file), 'select 1;\n');
  return dir;
};
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('database migration runner', () => {
  it('ships a valid bash script', () => {
    const result = spawnSync('bash', ['-n', path('scripts/db-migrate.sh')]);
    expect(result.status, result.stderr.toString()).toBe(0);
  });

  it('rejects missing or unknown arguments before connecting', () => {
    for (const args of [[], ['postgresql://x', '--bogus'], ['postgresql://x', '--mark-applied'], ['postgresql://x', '--dry-run', 'extra']]) {
      const result = migrate(args);
      expect(result.status).not.toBe(0);
      expect(result.stderr.toString()).toMatch(/Usage:/);
    }
  });

  it('requires a psql client', () => {
    const result = migrate(['postgresql://x'], { PSQL: 'missing-psql-client' });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/Missing tool: missing-psql-client/);
  });

  it('refuses an empty folder or duplicate versions', () => {
    const empty = migrate(['postgresql://x'], { MIGRATIONS_DIR: migrationsDir([]) });
    expect(empty.status).not.toBe(0);
    expect(empty.stderr.toString()).toMatch(/No migrations found/);
    rmSync(dir, { recursive: true, force: true });

    const duplicate = migrate(['postgresql://x'], { MIGRATIONS_DIR: migrationsDir(['001_a.sql', '001_b.sql']) });
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr.toString()).toMatch(/Duplicate migration versions: 001/);
  });

  it('sees every committed migration, with unique versions', () => {
    const files = readdirSync(path('migrations')).filter((file) => file.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^[0-9]+_[A-Za-z0-9_]+\.sql$/);
    const versions = files.map((file) => file.split('_')[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('records each migration in the CLI history in the same transaction', () => {
    const script = read('scripts/db-migrate.sh');
    expect(script).toMatch(/supabase_migrations\.schema_migrations/);
    expect(script).toMatch(/sql -1 [^\n]*-f "\$dir\/\$file" -f - /);
    // psql does not substitute variables in -c strings, so inserts must arrive on stdin.
    expect(script).not.toMatch(/-c "insert/);
    expect(script).toMatch(/Unrecorded earlier migrations/);
  });

  it('documents the runner instead of supabase db push', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/scripts\/db-migrate\.sh "postgresql:\/\/[^"]+" --dry-run/);
    expect(readme).not.toMatch(/^supabase db push$/m);
    expect(read('docs/agents/database.md')).toMatch(/scripts\/db-migrate\.sh <db-url>/);
  });
});
