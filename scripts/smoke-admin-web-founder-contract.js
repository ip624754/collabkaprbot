import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  "function founderSensitivityMeta(kind = 'routine')",
  'function founderControlCards(model = {})',
  'function controlSurfaceLabel(value)',
  'function controlSurfaceStateLabel(value)',
  'Семантика безопасности',
  'Фаундерское web-действие',
  'Применить: завершить все web-сессии',
  'Фаундерское действие применено: все web-сессии закрыты, включая текущую сессию.',
  'Подтверждение обязательно для чувствительных действий',
  'Только для фаундера: обзор только для чтения, границы риска и один чувствительный web-контроль',
  'Когда идти в раздел «Система»',
  'Контур только для Telegram',
  'Параметры Founder Sale',
]) {
  assert.ok(webJs.includes(token), `admin-web STEP535P founder polish must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-founder-badges',
  '.aw-founder-safety-card',
  '.aw-founder-action-rail',
  '.aw-founder-risk-sensitive',
  '.aw-badge.is-warn',
]) {
  assert.ok(css.includes(token), `admin-web STEP535P founder CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step545'), 'admin shell asset URLs must be cache-busted to step545');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535P'), 'current state must mention STEP535P');

const workHistory = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(workHistory.includes('STEP535P'), 'work history must mention STEP535P');

console.log('✅ smoke admin-web founder RU copy consistency + final polish OK');
