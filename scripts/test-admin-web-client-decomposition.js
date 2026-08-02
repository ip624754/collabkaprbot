import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { ADMIN_WEB_SOURCE_FILES, readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(read('docs/architecture/STEP590H_ADMIN_WEB_MODULE_MANIFEST.json'));
const entry = read(manifest.entry);
const html = read('admin.html');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
let assertions = 0;
const ok = (value, message) => { assertions += 1; assert.ok(value, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };

const expectedModules = ['overview', 'users', 'payments', 'comms', 'founder', 'runtime'];
equal(manifest.version, 'STEP590H_v1', 'manifest version');
equal(manifest.entry, 'scripts/admin-web.js', 'entry path');
equal(manifest.asset, '/scripts/admin-web.js', 'public asset path');
equal(manifest.modules.length, expectedModules.length, 'bounded module count');
equal(ADMIN_WEB_SOURCE_FILES.length, expectedModules.length + 1, 'aggregate source file count');
const versionParts = (value) => String(value || '').split('.').map((part) => Number.parseInt(part, 10));
const versionAtLeast = (value, minimum) => {
  const actual = versionParts(value);
  const floor = versionParts(minimum);
  for (let i = 0; i < 3; i += 1) {
    if ((actual[i] || 0) > (floor[i] || 0)) return true;
    if ((actual[i] || 0) < (floor[i] || 0)) return false;
  }
  return true;
};
ok(versionAtLeast(pkg.version, '1.3.37'), 'package version must preserve STEP590H baseline');
equal(lock.version, pkg.version, 'lock version parity');
equal(lock.packages?.['']?.version, pkg.version, 'root lock package version parity');

const moduleScripts = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]);
equal(moduleScripts.length, 1, 'admin shell must expose one module entry asset');
ok(moduleScripts[0].startsWith('/scripts/admin-web.js?'), 'admin shell entry asset path');
ok(moduleScripts[0].includes('step590h'), 'admin shell cache bust must identify STEP590H');
ok(html.includes('/styles/admin-web.css?v=20260802-step590h'), 'CSS cache bust must align with STEP590H');

for (const [index, item] of manifest.modules.entries()) {
  equal(item.id, expectedModules[index], `module order ${index}`);
  ok(fs.existsSync(path.join(ROOT, item.path)), `${item.path} must exist`);
  const source = read(item.path);
  ok(entry.includes(`from './admin-web/${item.id}.js'`), `entry imports ${item.id}`);
  ok(source.includes(`export function ${item.factory}(ctx)`), `${item.id} factory export`);
  ok(source.includes(`BEGIN STEP590H MOVED SOURCE: ${item.id}`), `${item.id} moved-source start marker`);
  ok(source.includes(`END STEP590H MOVED SOURCE: ${item.id}`), `${item.id} moved-source end marker`);
  ok(Array.isArray(item.declarations) && item.declarations.length > 0, `${item.id} declarations manifest`);
  const start = `  // BEGIN STEP590H MOVED SOURCE: ${item.id}\n`;
  const end = `  // END STEP590H MOVED SOURCE: ${item.id}\n`;
  const inner = source.split(start)[1]?.split(end)[0] || '';
  const restored = inner.split(/(?<=\n)/).map((line) => line.trim() ? line.replace(/^  /, '') : line).join('');
  equal(sha256(restored), item.movedSourceSha256, `${item.id} exact moved-source SHA parity`);
  for (const declaration of item.declarations) {
    ok(source.includes(declaration), `${item.id} contains ${declaration}`);
  }
}

for (const token of [
  '/api/admin-web-auth?action=me',
  '/api/admin-web-read?section=overview',
  '/api/admin-web-read?section=users',
  '/api/admin-web-read?section=runtime',
  '/api/admin-web-read?section=payments',
  '/api/admin-web-read?section=comms',
  '/api/admin-web-read?section=founder',
  'history.pushState',
  'history.replaceState',
  'window.addEventListener(\'popstate\'',
]) {
  ok(readAdminWebSource().includes(token), `aggregate admin source preserves ${token}`);
}

ok(entry.split('\n').length < 3000, 'entry file must be materially smaller than the 4667-line baseline');
ok(manifest.modules.reduce((sum, item) => sum + Number(item.sourceLines || 0), 0) === 2636, 'manifest moved-line total');

console.log(`✅ STEP590H admin-web client decomposition tests OK (${assertions} assertions)`);
