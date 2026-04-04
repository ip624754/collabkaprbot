import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-card > strong',
  '.aw-card-subtle strong',
  '.aw-payments-layout.is-compact',
  '.aw-founder-layout.is-compact',
  '.aw-runtime-sidebar-grid',
]) {
  assert.ok(css.includes(token), `layout polish CSS must include ${token}`);
}

const js = read('scripts/admin-web.js');
for (const token of [
  'const compactPaymentsLayout = recentPayments.length === 0 && followUpQueue.length === 0;',
  'const compactFounderLayout = recentAudit.length === 0;',
  'aw-runtime-sidebar-grid aw-section',
  'Платёжный обзор',
]) {
  assert.ok(js.includes(token), `layout polish UI must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
assert.ok(runtime.includes("const qstashState = qstashConfigured ? 'ok' : 'unknown';"), 'qstash optional gap must not escalate overall runtime state to missing');

const html = read('admin.html');
assert.ok(html.includes('step535q'), 'admin shell asset URLs must be cache-busted to step535q');

console.log('✅ smoke admin-web layout polish contract OK');
