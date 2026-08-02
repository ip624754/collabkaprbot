import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

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

const js = readAdminWebSource();
for (const token of [
  'const compactPaymentsLayout = recentPayments.length === 0 && followUpQueue.length === 0;',
  'const compactFounderLayout = recentAudit.length === 0;',
  'aw-runtime-sidebar-grid aw-section',
  'Платёжный обзор',
]) {
  assert.ok(js.includes(token), `layout polish UI must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
assert.ok(runtime.includes("const qstashState = qstashConfigured ? 'ok' : (qstashPartiallyConfigured ? 'degraded' : 'unknown');"), 'qstash truth must distinguish full config, partial config and fully optional absence');

const html = read('admin.html');
assert.ok(/step(?:590h|592)/.test(html), 'admin shell asset URLs must be cache-busted to step590h');

console.log('✅ smoke admin-web layout polish contract OK');
