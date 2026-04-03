import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'function founderSensitivityMeta(kind = \'routine\')',
  'function founderControlCards(model = {})',
  'Семантика безопасности',
  'Фаундерское web-действие',
  'Применить: завершить все web-сессии',
  'Фаундерское действие применено: все web-сессии закрыты, включая текущую.',
  'Подтверждение обязательно для чувствительных действий',
  'Только для фаундера: read-first обзор, границы риска и один чувствительный web-контроль',
]) {
  assert.ok(webJs.includes(token), `admin-web STEP535O founder semantics must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-founder-badges',
  '.aw-founder-safety-card',
  '.aw-founder-action-rail',
  '.aw-founder-risk-sensitive',
  '.aw-badge.is-warn',
]) {
  assert.ok(css.includes(token), `admin-web STEP535O founder CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535o'), 'admin shell asset URLs must be cache-busted to step535o');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535O'), 'current state must mention STEP535O');

const workHistory = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(workHistory.includes('STEP535O'), 'work history must mention STEP535O');

console.log('✅ smoke admin-web founder control safety semantics + confirmation polish OK');
