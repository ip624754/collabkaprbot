import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readJson(rel) {
  const abs = path.join(ROOT, rel);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function fail(msg) {
  console.error(`[package-lock-check] ${msg}`);
  process.exit(1);
}

const pkgPath = path.join(ROOT, 'package.json');
const lockPath = path.join(ROOT, 'package-lock.json');

if (!fs.existsSync(pkgPath)) fail('package.json missing');
if (!fs.existsSync(lockPath)) fail('package-lock.json missing');

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const rootPkg = lock?.packages?.[''] || {};

const wantDeps = pkg.dependencies || {};
const wantDevDeps = pkg.devDependencies || {};
const gotDeps = rootPkg.dependencies || {};
const gotDevDeps = rootPkg.devDependencies || {};

const cmp = (label, want, got) => {
  const wk = Object.keys(want).sort();
  const gk = Object.keys(got).sort();
  if (JSON.stringify(wk) !== JSON.stringify(gk)) {
    fail(`${label} keys drift: package.json=${wk.join(',') || '∅'} lock=${gk.join(',') || '∅'}`);
  }
  for (const k of wk) {
    if (String(want[k]) !== String(got[k])) {
      fail(`${label} version drift for ${k}: package.json=${want[k]} lock=${got[k]}`);
    }
  }
};

cmp('dependencies', wantDeps, gotDeps);
cmp('devDependencies', wantDevDeps, gotDevDeps);

console.log('[package-lock-check] OK');
