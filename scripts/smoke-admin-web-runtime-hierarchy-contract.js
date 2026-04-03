import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  'Общий статус',
  'Главный runtime-сигнал',
  'Control plane snapshot',
  'Как читать этот экран',
  'paused ',
  'summaryCards.ok',
]) {
  assert.ok(js.includes(token), `runtime hierarchy UI must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
for (const token of [
  'statusHierarchy',
  'incidentStrip',
  'controlSnapshot',
  'summaryCards',
  'buildStatusHierarchy',
  'deriveIncidentStrip',
]) {
  assert.ok(runtime.includes(token), `runtime summary must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-runtime-summary-grid',
  '.aw-runtime-incident',
  '.aw-runtime-controls-grid',
  '.aw-runtime-footnote',
]) {
  assert.ok(css.includes(token), `runtime styles must include ${token}`);
}

console.log('✅ smoke admin-web runtime hierarchy contract OK');
