#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const targets = [
  path.join(projectRoot, '.next', 'cache'),
  path.join(projectRoot, '.next', 'server'),
  path.join(projectRoot, '.next', 'static', 'chunks'),
  path.join(projectRoot, '.next', 'static', 'css'),
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
}

console.log('Cleaned stale Next.js dev cache.');
