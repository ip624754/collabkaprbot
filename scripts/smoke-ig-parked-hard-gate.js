#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
const ACTIVE_DIRS = ['api', 'src', 'scripts', 'migrations'];
const SELF_REL = 'scripts/smoke-ig-parked-hard-gate.js';

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function rel(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

function exists(relPath) {
  return fs.existsSync(abs(relPath));
}

function readText(relPath) {
  return fs.readFileSync(abs(relPath), 'utf8');
}

function walkCodeFiles(relDir) {
  const start = abs(relDir);
  const out = [];
  if (!fs.existsSync(start)) return out;
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const entryAbs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '_ig_oauth_parked') continue;
        stack.push(entryAbs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!CODE_EXT.has(path.extname(entry.name))) continue;
      out.push(entryAbs);
    }
  }
  return out;
}

function assertImportFree(relPath) {
  const src = readText(relPath);
  const patterns = [
    /from\s+['"`][^'"`]*_ig_oauth_parked[^'"`]*['"`]/,
    /require\s*\(\s*['"`][^'"`]*_ig_oauth_parked[^'"`]*['"`]\s*\)/,
    /import\s*\(\s*['"`][^'"`]*_ig_oauth_parked[^'"`]*['"`]\s*\)/,
    /export\s+[^;]*from\s+['"`][^'"`]*_ig_oauth_parked[^'"`]*['"`]/,
  ];
  for (const rx of patterns) {
    assert.ok(!rx.test(src), `${relPath} must not import parked IG subtree into active source/deploy surface`);
  }
}

assert.ok(exists('_ig_oauth_parked/README.md'), '_ig_oauth_parked/README.md must exist');
assert.ok(exists('_ig_oauth_parked/api/ig/oauth/start.js'), 'parked start handler must stay in parked subtree');
assert.ok(exists('_ig_oauth_parked/api/ig/oauth/callback.js'), 'parked callback handler must stay in parked subtree');
assert.ok(exists('_ig_oauth_parked/lib/igOAuth.js'), 'parked IG helper must stay in parked subtree');
assert.ok(exists('_ig_oauth_parked/lib/cryptoBox.js'), 'parked crypto helper must stay in parked subtree');

assert.ok(!exists('api/ig/oauth'), 'api/ig/oauth must stay absent from active deploy surface');
assert.ok(!exists('src/lib/igOAuth.js'), 'src/lib/igOAuth.js must not return to active runtime tree');
assert.ok(!exists('src/lib/cryptoBox.js'), 'src/lib/cryptoBox.js must not return to active runtime tree');

const parkedReadme = readText('_ig_oauth_parked/README.md');
assert.ok(
  parkedReadme.includes('не импортировать') || parkedReadme.toLowerCase().includes('do not import'),
  '_ig_oauth_parked/README.md must explicitly forbid active imports'
);
assert.ok(parkedReadme.includes('deploy surface'), '_ig_oauth_parked/README.md must explicitly mention deploy surface');

const vercel = readText('vercel.json');
assert.ok(!/\/api\/ig\/oauth\b/.test(vercel), 'vercel.json must not expose /api/ig/oauth routes in the active deploy surface');
assert.ok(!/_ig_oauth_parked/.test(vercel), 'vercel.json must not rewrite into _ig_oauth_parked subtree');

const functionBudget = readText('scripts/check-function-budget.js');
assert.ok(functionBudget.includes("'_ig_oauth_parked'"), 'check-function-budget must continue to ignore _ig_oauth_parked subtree');

for (const dir of ACTIVE_DIRS) {
  for (const absPath of walkCodeFiles(dir)) {
    const p = rel(absPath);
    if (p === SELF_REL) continue;
    assertImportFree(p);
  }
}

console.log('smoke-ig-parked-hard-gate: OK');
