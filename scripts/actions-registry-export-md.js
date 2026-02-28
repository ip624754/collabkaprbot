// STEP101: Export action registry to Markdown (for docs/audits)
// - Ensures src/bot/actionRegistry.js covers all `a:*` callback actions found in code.
// - Emits a ready-to-paste Markdown document with a table: action → type → guard
//
// Usage:
//   node scripts/actions-registry-export-md.js --out docs/02_ACTION_KEYS_REGISTRY.md
//   node scripts/actions-registry-export-md.js            # prints to stdout
//

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTION_REGISTRY, getActionMeta, listActionKeysSorted } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('--')) return null;
  return v;
}

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
    // Ignore prefix markers like "a:adm_" used in startsWith checks.
    if (k.endsWith('_')) continue;
    found.add(k);
  }
  return found;
}

function scanActionsInCode() {
  const scanDirs = [
    path.join(root, 'src', 'bot'),
    path.join(root, 'src'), // safe: sometimes literals live outside bot/
  ];
  const inCode = new Set();
  for (const d of scanDirs) {
    for (const file of walkJsFiles(d)) {
      let txt = '';
      try {
        txt = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const a of extractActionsFromText(txt)) inCode.add(a);
    }
  }
  return inCode;
}

function escapeMd(text) {
  return String(text).replaceAll('|', '\\|');
}

function buildMarkdown({ inCode, missing, extra }) {
  const keys = listActionKeysSorted();

  // Counts by type/guard
  const typeCount = new Map();
  const guardCount = new Map();
  for (const k of keys) {
    const meta = getActionMeta(k);
    typeCount.set(meta.type, (typeCount.get(meta.type) || 0) + 1);
    guardCount.set(meta.guard, (guardCount.get(meta.guard) || 0) + 1);
  }

  const typeRows = [...typeCount.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const guardRows = [...guardCount.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const lines = [];
  lines.push('# Action Keys Registry — Collabka PR (@collabkaprbot)');
  lines.push('');
  lines.push('> AUTO-GENERATED. Do not edit by hand.');
  lines.push('>');
  lines.push('> Regenerate: `npm run actions:md`');
  lines.push('');
  lines.push('');
  lines.push(`- Actions in code: **${inCode.size}**`);
  lines.push(`- Actions in registry: **${Object.keys(ACTION_REGISTRY || {}).length}**`);
  lines.push('');

  if (missing.length) {
    lines.push('## ❌ Missing in registry (present in code)');
    lines.push('');
    for (const a of missing) lines.push(`- \`${a}\``);
    lines.push('');
  }
  if (extra.length) {
    lines.push('## ⚠️ Extra in registry (not found in code)');
    lines.push('');
    for (const a of extra) lines.push(`- \`${a}\``);
    lines.push('');
  }

  lines.push('## Summary by type');
  lines.push('');
  lines.push('| Type | Count |');
  lines.push('|---|---:|');
  for (const [t, c] of typeRows) lines.push(`| ${escapeMd(t)} | ${c} |`);
  lines.push('');

  lines.push('## Summary by guard');
  lines.push('');
  lines.push('| Guard | Count |');
  lines.push('|---|---:|');
  for (const [g, c] of guardRows) lines.push(`| ${escapeMd(g)} | ${c} |`);
  lines.push('');

  lines.push('## Actions table');
  lines.push('');
  lines.push('| Action | Type | Guard |');
  lines.push('|---|---|---|');
  for (const a of keys) {
    const meta = getActionMeta(a);
    lines.push(`| \`${escapeMd(a)}\` | ${escapeMd(meta.type)} | ${escapeMd(meta.guard)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

function main() {
  const outPathArg = argValue('--out');
  const printOnly = process.argv.includes('--stdout') || !outPathArg;

  const inCode = scanActionsInCode();
  const inRegistry = new Set(Object.keys(ACTION_REGISTRY || {}));
  const missing = [...inCode].filter(a => !inRegistry.has(a)).sort();
  const extra = [...inRegistry].filter(a => !inCode.has(a)).sort();

  const md = buildMarkdown({ inCode, missing, extra });

  if (!printOnly) {
    const outAbs = path.resolve(root, outPathArg);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, md, 'utf8');
    console.log(`Wrote: ${path.relative(root, outAbs)}`);
  } else {
    process.stdout.write(md);
  }

  if (missing.length) {
    console.error(`\nFAIL: registry is missing ${missing.length} action key(s). Update src/bot/actionRegistry.js`);
    process.exit(2);
  }
}

main();
