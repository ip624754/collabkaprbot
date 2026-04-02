import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Нажми чип — порядок применится сразу и зафиксируется в текущем срезе.',
  'Счётчики сверху только показывают объём. Саму когорту выбирай чипами ниже.',
  'Счётчики не меняют срез и не дублируют управление.',
  'Нажми карточку — весь рабочий срез переключится сразу. Активный пресет показывается в верхней строке состояния.',
  'Пользователи · рабочий список',
  'Сортировка: <strong>${escapeHtml(sortMeta.label)}</strong>',
]) {
  assert.ok(webJs.includes(token), `users interaction clarity UI must include ${token}`);
}
for (const removed of [
  'Порядок: <strong>${escapeHtml(sortMeta.label)}</strong>',
  'id="usersSortBy"',
  'Активный пресет:',
]) {
  assert.ok(!webJs.includes(removed), `users interaction clarity should remove duplicate state token ${removed}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-priority-pills-main',
  '.aw-cohort-counter-card.is-active',
]) {
  assert.ok(css.includes(token), `users interaction clarity CSS must include ${token}`);
}
assert.ok(!css.includes('.aw-cohort-counter-card:hover,'), 'cohort counter cards should no longer look hover-clickable');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP533'), 'current state must mention STEP533');

console.log('✅ smoke admin-web users interaction clarity / duplicate-state compression contract OK');
