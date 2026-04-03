import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const runtime = read('src/lib/adminWeb/runtime.js');
for (const token of [
  'semanticLabelForState',
  'actionabilityForState',
  'actionabilityLabel',
  'decorateRuntimeItem',
  'decorateConfigPresence',
  'nextStepForSource',
  'infoOnly',
]) {
  assert.ok(runtime.includes(token), `runtime semantics layer must include ${token}`);
}

const webJs = read('scripts/admin-web.js');
for (const token of [
  'function runtimeActionabilityClass(value)',
  'function runtimeActionabilityLabel(value)',
  'Paused ≠ silent bug',
  'Missing ≠ degraded',
  'Следующий шаг:',
  'Справочно',
  'Incident modes',
]) {
  assert.ok(webJs.includes(token), `runtime UI semantics pass must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-status.info',
  '.aw-runtime-card-head',
  '.aw-runtime-action',
  '.aw-config-main',
  '.aw-config-meta',
  '.aw-config-state-wrap',
]) {
  assert.ok(css.includes(token), `runtime semantics CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535g'), 'admin shell asset URLs must be cache-busted to step535g');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535E'), 'current state must mention STEP535E');

console.log('✅ smoke admin-web runtime semantics + actionability contract OK');
