import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = read('src/db/queries.js');
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

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Users cohort counters / mini topline',
  'usersCohortCounterCards',
  'aw-cohort-topline',
  'Mini topline считает cohort-срезы на сервере',
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
