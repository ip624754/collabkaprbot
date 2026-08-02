import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = readQueryImplementationSource();
for (const token of [
  'getUsersDirectoryCohortCounters',
  'USERS_DIRECTORY_COHORT_WHERE',
  'total_count',
  'dormant_payers_count',
  'quiet_creators_count',
]) {
  assert.ok(queries.includes(token), `queries must include ${token}`);
}

const readModels = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'getUsersDirectoryCohortCounters',
  'cohortCounters',
  'cohortTopline',
]) {
  assert.ok(readModels.includes(token), `readModels must include ${token}`);
}

const webJs = readAdminWebSource();
for (const token of [
  'Маленькие счётчики по когортам',
  'usersCohortCounterCards',
  'aw-cohort-topline',
  'Счётчики выше только показывают картину',
]) {
  assert.ok(webJs.includes(token), `admin-web users cohort counters UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-cohort-topline',
  '.aw-cohort-counter-card',
  '.aw-cohort-counter-card.is-active',
]) {
  assert.ok(css.includes(token), `admin-web users cohort counters CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP519'), 'current state must mention STEP519');

console.log('✅ smoke admin-web users cohort counters contract OK');
