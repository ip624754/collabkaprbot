import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const readModels = read('src/lib/adminWeb/readModels.js');
assert.ok(readModels.includes('runtimeWarnings: Number(runtime?.summaryCards?.check || 0) || 0,'), 'overview summary must derive runtimeWarnings from runtime.summaryCards.check');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'function overviewRuntimeWarnings(model = {}) {',
  "const summaryCheck = Number(runtime?.summaryCards?.check || 0) || 0;",
  "if (overallState === 'ok') return 0;",
  'const warnings = overviewRuntimeWarnings(model);',
  'Runtime warnings</span><strong>${overviewRuntimeWarnings(model)}</strong>',
]) {
  assert.ok(webJs.includes(token), `overview runtime truth contract must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP545'), 'current state must mention STEP545');

const history = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(history.includes('STEP545'), 'work history must mention STEP545');

console.log('✅ smoke admin-web overview runtime truth contract OK');
