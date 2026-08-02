import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'aw-users-rails-stack',
  'aw-priority-rail',
  'aw-cohort-rail',
  'aw-preset-rail',
  'aw-filter-rail',
  'aw-action-ready-rail',
  'renderUsersOperatorPresetCards',
  'renderUsersSliceActionCards',
]) {
  assert.ok(webJs.includes(token), `admin-web users rails hierarchy must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-rails-stack',
  '.aw-priority-rail',
  '.aw-cohort-rail',
  '.aw-preset-rail',
  '.aw-filter-rail',
  '.aw-action-ready-rail',
]) {
  assert.ok(css.includes(token), `users rails hierarchy CSS must include ${token}`);
}

console.log('✅ smoke admin-web users rails hierarchy compression contract OK');
