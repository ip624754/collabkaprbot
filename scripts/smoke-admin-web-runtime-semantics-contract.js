import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'function runtimeActionabilityClass(value)',
  'function runtimeActionabilityLabel(value)',
  'function runtimeCardLabel(value)',
  'function runtimeTextLabel(value)',
  'function runtimeItemMeaning(item = {})',
  'function runtimeItemNextStep(item = {}, fallback = \'\')',
  'Пауза ≠ поломка',
  'setup-gap ≠ runtime error',
  'Следующий шаг:',
  'Опционально для delivery',
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
  '.aw-badge.is-info',
]) {
  assert.ok(css.includes(token), `runtime semantics CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535w'), 'admin shell asset URLs must be cache-busted to step535w');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535Q'), 'current state must mention STEP535Q');

console.log('✅ smoke admin-web runtime semantics + actionability contract OK');
