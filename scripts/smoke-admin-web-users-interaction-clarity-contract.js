import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'Сортировка и приоритет',
  'Счётчики выше только показывают картину, а сами chips ниже сразу переключают рабочую когорту.',
  'Карточки ниже сразу переключают рабочий срез без ручной сборки контролов.',
  'Сейчас активен: <strong>${escapeHtml(activePresetMeta.label)}</strong>.',
  'Срез: <strong>${escapeHtml(currentSliceLabel)}</strong>',
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
  '.aw-priority-pills',
  '.aw-cohort-counter-card.is-active',
]) {
  assert.ok(css.includes(token), `users interaction clarity CSS must include ${token}`);
}
assert.ok(css.includes('cursor: pointer;'), 'interactive cohort cards must retain an explicit pointer affordance');

console.log('✅ smoke admin-web users interaction clarity / duplicate-state compression contract OK');
