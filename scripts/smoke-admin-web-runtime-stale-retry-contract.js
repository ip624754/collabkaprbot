import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const cfg = read('src/lib/config.js');
for (const token of [
  'QSTASH_URL: process.env.QSTASH_URL ||',
  'QSTASH_TOKEN: process.env.QSTASH_TOKEN ||',
  'QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY ||',
  'QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY ||',
]) {
  assert.ok(cfg.includes(token), `config must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
for (const token of [
  'const STALE_RETRY_SIGNAL_SEC = 24 * 60 * 60;',
  'const retrySignalStale = !!retrySignalPresent',
  'Последний retry сигнал старый',
  'stale retry',
  'QSTASH_URL',
  'QSTASH_NEXT_SIGNING_KEY',
]) {
  assert.ok(runtime.includes(token), `runtime must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step543b'), 'admin shell asset URLs must be cache-busted to step543b');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535S'), 'current state must mention STEP535S');

const history = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(history.includes('STEP535S'), 'work history must mention STEP535S');

console.log('✅ smoke admin-web runtime stale retry contract OK');
