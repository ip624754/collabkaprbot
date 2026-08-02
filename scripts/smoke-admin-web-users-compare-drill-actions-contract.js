import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'renderUsersCompareDrillActions',
  'renderUsersCompareDrillActions',
  'data-users-compare-action="export_pins"',
  'data-users-compare-action="copy_pins_tg_ids"',
  'data-users-compare-action="open_top_problem"',
  'runUsersPinnedExportAction',
  'runUsersPinnedBulkCopyAction',
  'openUsersCompareDrillTarget',
]) {
  assert.ok(webJs.includes(token), `admin-web compare drill actions must include ${token}`);
}

const readModels = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'problemScore',
  'problemDesc',
  'isDormantPayer',
  'compareProblemDescriptor',
]) {
  assert.ok(readModels.includes(token), `readModels compare drill actions must include ${token}`);
}

const exportJs = read('src/lib/adminWeb/usersExport.js');
assert.ok(exportJs.includes("scope: 'ids_snapshot'"), 'users export must support ids_snapshot');
assert.ok(exportJs.includes("'_pinned'"), 'users export filename must mention pinned snapshot');

const apiRead = read('api/admin-web-read.js');
assert.ok(apiRead.includes("ids=${Array.isArray(exportPayload.userIds) ? exportPayload.userIds.length : 0}"), 'users export audit reason must include ids count');

const css = read('styles/admin-web.css');
assert.ok(css.includes('.aw-compare-drill-grid'), 'compare drill actions CSS must include .aw-compare-drill-grid');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP526'), 'current state must mention STEP526');

console.log('✅ smoke admin-web users compare drill actions contract OK');
