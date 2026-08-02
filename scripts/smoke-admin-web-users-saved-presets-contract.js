import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'Сохранённые операторские пресеты',
  'data-users-preset',
  'usersOperatorPresets',
  'detectUsersOperatorPreset',
  'dormant_payers_followup',
  'quiet_creators_watch',
]) {
  assert.ok(webJs.includes(token), `admin-web users saved presets UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-preset-rail',
  '.aw-preset-grid',
  '.aw-preset-card',
]) {
  assert.ok(css.includes(token), `admin-web users saved presets CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP523'), 'current state must mention STEP523');

console.log('✅ smoke admin-web users saved operator presets contract OK');
