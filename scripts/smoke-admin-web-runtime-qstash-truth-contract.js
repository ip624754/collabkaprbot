import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'function runtimeCardLabel(value)',
  'function runtimeTextLabel(value)',
  'function runtimeItemIsQstashOptional(item = {})',
  'function runtimeItemHasProfileContactDrift(item = {})',
  'QSTASH_TOKEN и QSTASH_CURRENT_SIGNING_KEY сейчас опциональны для read-admin режима',
  'schema/query drift',
  'profile_contact',
  'Опционально для delivery',
]) {
  assert.ok(webJs.includes(token), `runtime truth alignment must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535s'), 'admin shell asset URLs must be cache-busted to step535s');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535S'), 'current state must mention STEP535S');

const history = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(history.includes('STEP535S'), 'work history must mention STEP535S');

console.log('✅ smoke admin-web runtime QStash truth contract OK');
