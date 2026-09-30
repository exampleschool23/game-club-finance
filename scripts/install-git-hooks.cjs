// Points git at the repository's .githooks directory. Runs from `npm install`
// (the `prepare` script) and quietly does nothing outside a git checkout or in
// CI/Vercel builds, so installs there never fail.
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

if (process.env.CI || process.env.VERCEL || !existsSync(join(root, '.git'))) {
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
} catch {
  // Git is unavailable; hooks stay optional.
}
