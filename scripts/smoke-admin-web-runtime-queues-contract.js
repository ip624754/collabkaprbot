import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = readAdminWebSource();
for (const token of [
  'Очереди и retry',
  'Активная очередь',
  'Проблемы retry',
  'Окна охлаждения',
  'Справочно',
  'aw-runtime-queues-grid',
  'aw-runtime-retry-feed',
]) {
  assert.ok(js.includes(token), `runtime queues UI must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
for (const token of [
  'queueClarity',
  'buildQueueClarity',
  'ops_digest',
  'audit_buffer',
  'broadcast_delivery',
  'retry_monitor',
  'retrySignals',
]) {
  assert.ok(runtime.includes(token), `runtime queues summary must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-runtime-queues-grid',
  '.aw-runtime-retry-feed',
  '.aw-runtime-queue-card',
]) {
  assert.ok(css.includes(token), `runtime queues styles must include ${token}`);
}

console.log('✅ smoke admin-web runtime queues contract OK');
