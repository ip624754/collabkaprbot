import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'focusUsersWorkingSlice(',
  'awCopySheetHost',
  'Сейчас активен:',
  'Открыть срез',
  'Открыл ручной режим копирования',
  'Ручное копирование списка',
]) {
  assert.ok(webJs.includes(token), `users preset/copy polish must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-copy-sheet-host',
  '.aw-copy-sheet',
  '.aw-users-sticky-shell.is-just-focused',
]) {
  assert.ok(css.includes(token), `users preset/copy polish CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535A'), 'current state must mention STEP535A');

console.log('✅ smoke admin-web users preset/copy polish contract OK');
