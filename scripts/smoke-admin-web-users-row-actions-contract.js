import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'renderUserRowQuickActions',
  'data-user-quick',
  'open_card',
  'copy_tg_id',
  'copy_username',
  'toggle_basket',
  'runUserRowCopyAction',
]) {
  assert.ok(webJs.includes(token), `admin-web users row quick actions UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-row-actions',
  '.aw-row-action',
]) {
  assert.ok(css.includes(token), `admin-web users row quick actions CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP521'), 'current state must mention STEP521');

console.log('✅ smoke admin-web users row quick actions contract OK');
