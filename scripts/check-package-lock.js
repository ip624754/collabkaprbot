import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

if (!lock || typeof lock !== 'object') {
  console.error('[package-lock] missing or invalid package-lock.json');
  process.exit(2);
}

const lockRoot = (lock.packages && lock.packages['']) || {};
const pkgDeps = pkg.dependencies || {};
const lockDeps = lockRoot.dependencies || {};

const pkgNames = Object.keys(pkgDeps).sort();
const lockNames = Object.keys(lockDeps).sort();

if (JSON.stringify(pkgNames) !== JSON.stringify(lockNames)) {
  console.error('[package-lock] dependency set mismatch between package.json and package-lock.json');
  console.error('package.json:', pkgNames.join(', '));
  console.error('package-lock:', lockNames.join(', '));
  process.exit(2);
}

for (const name of pkgNames) {
  if (String(pkgDeps[name]) !== String(lockDeps[name])) {
    console.error(`[package-lock] version drift for ${name}: package.json=${pkgDeps[name]} package-lock=${lockDeps[name]}`);
    process.exit(2);
  }
}

console.log('[package-lock] OK');
