import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTION_REGISTRY } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BOT_ROOT = path.join(ROOT, 'src', 'bot');
const BOT_FILE = path.join(BOT_ROOT, 'bot.js');
const CALLBACKS_FILE = path.join(BOT_ROOT, 'routes', 'callbacks.js');

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
      const abs = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile() && e.name.endsWith('.js')) out.push(abs);
    }
  }
  return out.sort();
}

function readText(abs) {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

function extractActions(text) {
  const out = new Set();
  const re = /\ba:([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const action = `a:${m[1]}`;
    if (!action.endsWith('_')) out.add(action);
  }
  return out;
}

function extractExactHandlers(text) {
  const handled = new Set();
  const patterns = [
    /p\.a\s*===\s*'([^']+)'/g,
    /p\.a\s*===\s*"([^"]+)"/g,
    /String\(p\?\.a\s*\|\|\s*''\)\s*===\s*'([^']+)'/g,
    /String\(p\?\.a\s*\|\|\s*""\)\s*===\s*"([^"]+)"/g,
    /action\s*===\s*'([^']+)'/g,
    /action\s*===\s*"([^"]+)"/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const action = String(m[1] || '');
      if (action.startsWith('a:')) handled.add(action);
    }
  }
  return handled;
}

function extractAliasMap(botText) {
  const out = new Map();
  const block = botText.match(/const _aliasA = \{([\s\S]*?)\n\s*\};/);
  if (!block) return out;
  const re = /'([^']+)'\s*:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    const from = String(m[1] || '');
    const to = String(m[2] || '');
    if (from.startsWith('a:') && to.startsWith('a:')) out.set(from, to);
  }
  return out;
}

const botFiles = walkJsFiles(BOT_ROOT);
const referenced = new Set();
for (const abs of botFiles) {
  if (path.basename(abs) === 'actionRegistry.js') continue;
  for (const action of extractActions(readText(abs))) referenced.add(action);
}

const registryKeys = new Set(Object.keys(ACTION_REGISTRY || {}));
const botText = readText(BOT_FILE);
const callbacksText = readText(CALLBACKS_FILE);
const exactHandled = new Set();
for (const abs of botFiles) {
  const text = readText(abs);
  for (const action of extractExactHandlers(text)) exactHandled.add(action);
}
const aliasMap = extractAliasMap(botText);

const missingInRegistry = [...referenced].filter((a) => !registryKeys.has(a)).sort();
const unresolved = [...referenced]
  .filter((a) => !exactHandled.has(a) && !aliasMap.has(a))
  .sort();
const badAliasTargets = [...aliasMap.entries()]
  .filter(([, to]) => !registryKeys.has(to) || !exactHandled.has(to))
  .sort((a, b) => a[0].localeCompare(b[0]));
const registryOnly = [...registryKeys].filter((a) => !referenced.has(a)).sort();

console.log(`Callback refs in bot-layer source: ${referenced.size}`);
console.log(`Registry keys: ${registryKeys.size}`);
console.log(`Exact handled actions: ${exactHandled.size}`);
console.log(`Legacy aliases: ${aliasMap.size}`);
console.log('');

if (missingInRegistry.length) {
  console.log('MISSING IN REGISTRY (referenced in source):');
  for (const action of missingInRegistry) console.log(`  - ${action}`);
  console.log('');
}

if (unresolved.length) {
  console.log('UNRESOLVED CALLBACKS (referenced, but neither exact-handled nor aliased):');
  for (const action of unresolved) console.log(`  - ${action}`);
  console.log('');
}

if (badAliasTargets.length) {
  console.log('BROKEN ALIAS TARGETS:');
  for (const [from, to] of badAliasTargets) console.log(`  - ${from} -> ${to}`);
  console.log('');
}

if (registryOnly.length) {
  console.log(`INFO: registry-only action keys (no current source refs): ${registryOnly.length}`);
}

if (missingInRegistry.length || unresolved.length || badAliasTargets.length) {
  console.error('\nFAIL: callback consistency guard found source-level drift.');
  process.exit(2);
}

console.log('\nOK: every bot-layer callback reference is registered and either exact-handled or explicitly aliased.');
