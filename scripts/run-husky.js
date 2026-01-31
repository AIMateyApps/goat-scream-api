#!/usr/bin/env node

const { readFileSync } = require('fs');
const { dirname, join } = require('path');
const { spawnSync } = require('child_process');

let huskyPackagePath;
try {
  huskyPackagePath = require.resolve('husky/package.json');
} catch {
  console.log('husky not installed, skipping prepare step');
  process.exit(0);
}

const packageJson = JSON.parse(readFileSync(huskyPackagePath, 'utf8'));
const binField = packageJson.bin;

const binRelativePath = typeof binField === 'string' ? binField : binField && binField.husky;

if (!binRelativePath) {
  console.error('Unable to locate husky binary definition');
  process.exit(1);
}

const huskyExecutable = join(dirname(huskyPackagePath), binRelativePath);

const result = spawnSync(process.execPath, [huskyExecutable], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
