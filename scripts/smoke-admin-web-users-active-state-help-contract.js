import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  "if (parts[1] === 'help') return { page: 'help' };",
  "label: 'Помощь'",
  "navCaption: 'операторский мануал'",
  'function renderSidebarNav(session = {}, route = routeInfo())',
  'function helpView(session)',
  'Быстрый старт',
  'Как читать Users',
  'Как читать Runtime',
  'Безопасные действия',
  'Частые вопросы',
  'Активный срез:',
  'syncUsersUrlState(window.__usersState, { replace: true });',
]) {
  assert.ok(webJs.includes(token), `admin-web STEP535D must include ${token}`);
}
assert.ok(webJs.includes('return next;'), 'users URL reader must keep sparse URL patch instead of forcing defaults');
assert.ok(!webJs.includes('return normalizeUsersState(next);'), 'users URL reader must not clobber in-memory state with normalized defaults');

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-help-grid',
  '.aw-help-card',
  '.aw-help-list',
  '.aw-toast-host',
  'top: 86px;',
]) {
  assert.ok(css.includes(token), `admin-web STEP535D CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535k'), 'admin shell asset URLs must be cache-busted to step535k');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535D'), 'current state must mention STEP535D');

console.log('✅ smoke admin-web users active-state sync + help surface contract OK');
