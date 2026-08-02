import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'function runtimeCardLabel(value)',
  'function runtimeTextLabel(value)',
  'function runtimeItemIsQstashOptional(item = {})',
  'function runtimeItemHasProfileContactDrift(item = {})',
  'QStash настроен не полностью',
  'Для базового admin v1 это не блокер, но QStash publish/verify contour должен быть собран полностью, если нужен delivery/retry.',
  'schema/query drift',
  'profile_contact',
  'Partial config не считается production-ready QStash контуром.',
]) {
  assert.ok(webJs.includes(token), `runtime truth alignment must include ${token}`);
}

const html = read('admin.html');
assert.ok(/step(?:590h|592)/.test(html), 'admin shell asset URLs must be cache-busted to step590h');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535W'), 'current state must mention STEP535W');

const history = read('docs/process/07_WORK_HISTORY_2026_04.md');
assert.ok(history.includes('STEP535W'), 'work history must mention STEP535W');

console.log('✅ smoke admin-web runtime QStash truth contract OK');
