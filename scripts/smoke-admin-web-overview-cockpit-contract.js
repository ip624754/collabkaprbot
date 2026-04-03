import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'const SECTION_MANIFEST = {',
  "navCaption: 'командный вход'",
  "navCaption: 'люди и срезы'",
  "function renderSidebarNav(session = {}, route = routeInfo())",
  'overview_workspace',
  'Командный обзор',
  'Payments snapshot',
  'Последняя активность',
  'Границы этой поверхности',
  'Следующий owner-шаг',
  'syncOverviewWorkspace(nextWorkspace, { replace: true });',
]) {
  assert.ok(webJs.includes(token), `STEP535F overview cockpit must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-nav-caption',
  '.aw-overview-hero',
  '.aw-overview-workspace-grid',
  '.aw-workspace-tab',
  '.aw-boundary-card',
]) {
  assert.ok(css.includes(token), `STEP535F CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535q'), 'admin shell asset URLs must be cache-busted to step535q');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535F'), 'current state must mention STEP535F');

const workHistory = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(workHistory.includes('STEP535F'), 'work history must mention STEP535F');

console.log('✅ smoke admin-web overview cockpit + section manifest contract OK');
