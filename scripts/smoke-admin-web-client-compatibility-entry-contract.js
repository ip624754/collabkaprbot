import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('admin.html');
const entry = read('scripts/admin-web.js');
const aggregate = readAdminWebSource();

assert.equal((html.match(/<script\b/g) || []).length, 1, 'admin shell keeps one JS asset');
assert.ok(/<script type="module" src="\/scripts\/admin-web\.js\?v=20260802-step(?:590h|592)"><\/script>/.test(html), 'admin shell keeps stable entry URL with bounded cache bust');
for (const id of ['overview', 'users', 'payments', 'comms', 'founder', 'runtime']) {
  assert.ok(entry.includes(`./admin-web/${id}.js`), `entry imports ${id} module`);
}
for (const token of [
  'function routeInfo()',
  'async function render()',
  'function bindShell()',
  'function bindLogin()',
  "window.addEventListener('popstate'",
  'render();',
]) {
  assert.ok(entry.includes(token), `compatibility entry preserves ${token}`);
}
for (const token of [
  'function overviewView(',
  'function usersView(',
  'function paymentsView(',
  'function commsView(',
  'function founderView(',
  'function runtimeView(',
]) {
  assert.equal(entry.includes(token), false, `view implementation moved out of entry: ${token}`);
  assert.ok(aggregate.includes(token), `aggregate source preserves ${token}`);
}
console.log('✅ STEP590H admin-web compatibility entry contract OK');
