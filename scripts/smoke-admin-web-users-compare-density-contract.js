import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'STEP527: compare density polish',
  'aw-users-sticky-shell',
  'aw-users-rails-stack',
  'aw-compare-rail-density',
  'aw-action-card-compact',
]) {
  assert.ok(webJs.includes(token), `admin-web compare density polish must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-sticky-shell',
  '.aw-users-rails-stack',
  '.aw-compare-rail-density',
  '.aw-action-card-compact',
  '.aw-compare-card-meta',
]) {
  assert.ok(css.includes(token), `compare density CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP527'), 'current state must mention STEP527');

console.log('✅ smoke admin-web users compare density polish contract OK');
