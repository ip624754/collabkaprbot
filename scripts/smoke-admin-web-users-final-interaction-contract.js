import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'showToast(',
  'awToastHost',
  'Ссылка на текущий срез Users скопирована.',
  'Сортировка и приоритет',
  'Карточки ниже сразу переключают рабочий срез',
  'Применить срез',
  'Сравнение и закрепление',
  'Утилиты для списков',
]) {
  assert.ok(webJs.includes(token), `users final interaction hotfix must include ${token}`);
}
assert.ok(!webJs.includes('Порядок: <strong>${escapeHtml(sortMeta.label)}</strong>'), 'duplicate order badge should be removed');

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-toast-host',
  '.aw-toast',
  '.aw-preset-cta',
]) {
  assert.ok(css.includes(token), `users final interaction hotfix CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP533A'), 'current state must mention STEP533A');

console.log('✅ smoke admin-web users final interaction hotfix contract OK');
