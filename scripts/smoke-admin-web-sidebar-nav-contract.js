import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const css = read('styles/admin-web.css');
const js = readAdminWebSource();
const html = read('admin.html');

for (const token of [
  '.aw-nav-group {',
  'display: grid;',
  '.aw-nav a:focus-visible',
  'outline: none;',
  'pointer-events: none;',
]) {
  assert.ok(css.includes(token), `sidebar nav CSS must include ${token}`);
}

for (const token of [
  'aw-nav-group',
  'aw-nav-group-label',
  'aw-nav-link-copy',
  'sectionGroups(session)',
]) {
  assert.ok(js.includes(token), `sidebar nav JS must include ${token}`);
}

assert.ok(/step(?:590h|592)/.test(html), 'admin shell asset cache-bust must be step590h');

console.log('✅ smoke admin-web sidebar nav contract OK');
