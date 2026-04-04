import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const monDiag = read('src/lib/monDiag.js');
for (const token of [
  'export const STALE_RETRY_SIGNAL_SEC = 24 * 60 * 60;',
  'export function diagSignalAgeSec(',
  'export function isDiagSignalFresh(',
  "await redis.set(k(['mon', 'retry', 'last_at']), at, { ex: DIAG_TTL_SEC });",
]) {
  assert.ok(monDiag.includes(token), `monDiag must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
for (const token of [
  'getRetrySignalSnapshot',
  'retrySignalStale',
  'stale retry signal',
  'Последний retry сигнал старый',
  'signal_stale',
  'Если новых retry/QStash проблем нет',
]) {
  assert.ok(runtime.includes(token), `runtime must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP544'), 'current state must mention STEP544');

const history = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(history.includes('STEP544'), 'work history must mention STEP544');

console.log('✅ smoke admin-web runtime stale retry contract OK');
