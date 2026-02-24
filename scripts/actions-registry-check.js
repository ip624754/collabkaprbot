// STEP100: Actions registry check & dump
// - Ensures src/bot/actionRegistry.js covers all `a:*` callback actions found in code.
// - Prints a sorted machine list: action → type → guard
//
// Usage:
//   node scripts/actions-registry-check.js
//   npm run actions:check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTION_REGISTRY, getActionMeta, listActionKeysSorted } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function walkJsFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
    }
  }
  return out;
}

function extractActionsFromText(text) {
  const re = /\ba:([A-Za-z0-9_]+)/g;
  const found = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const k = `a:${m[1]}`;
    if (k.endsWith('_')) continue; // ignore prefix markers like "a:adm_" used in startsWith checks
    found.add(k);
  }
  return found;
}

const scanDirs = [
  path.join(root, 'src', 'bot'),
  path.join(root, 'src'), // sometimes action literals may live outside bot/ (rare but safe)
];

const inCode = new Set();
for (const d of scanDirs) {
  for (const file of walkJsFiles(d)) {
    let txt = '';
    try { txt = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const a of extractActionsFromText(txt)) inCode.add(a);
  }
}

const inRegistry = new Set(Object.keys(ACTION_REGISTRY || {}));

const missing = [...inCode].filter(a => !inRegistry.has(a)).sort();
const extra = [...inRegistry].filter(a => !inCode.has(a)).sort();

console.log(`Actions in code:     ${inCode.size}`);
console.log(`Actions in registry: ${inRegistry.size}`);
console.log('');

if (missing.length) {
  console.log('MISSING in registry (present in code):');
  for (const a of missing) console.log(`  - ${a}`);
  console.log('');
}
if (extra.length) {
  console.log('EXTRA in registry (not found in code):');
  for (const a of extra) console.log(`  - ${a}`);
  console.log('');
}

console.log('MACHINE LIST — ACTIONS (sorted):');
for (const a of listActionKeysSorted()) {
  const meta = getActionMeta(a);
  console.log(`${a}\t${meta.type}\t${meta.guard}`);
}

if (missing.length) {
  console.error(`\nFAIL: registry is missing ${missing.length} action key(s). Update src/bot/actionRegistry.js`);
  process.exit(2);
}
console.log('\nOK: registry covers all actions found in code.');
