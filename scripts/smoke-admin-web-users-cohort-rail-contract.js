import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = readQueryImplementationSource();
for (const token of [
  'USERS_DIRECTORY_COHORTS',
  'cohortView',
  'dormant_payers',
  'paid_no_channel',
  'plan_no_channel',
  'fresh_brands',
  'quiet_creators',
]) {
  assert.ok(queries.includes(token), `queries must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
assert.ok(apiRead.includes('cohort_view'), 'admin-web read API must include cohort_view for users surfaces');

const webJs = readAdminWebSource();
for (const token of [
  'Когорты и готовые срезы',
  'usersCohortView',
  'data-users-cohort',
  'Спящие плательщики',
  'Тихие креаторы',
  'usersCohortView · Cohort view идёт через тот же server contract',
]) {
  assert.ok(webJs.includes(token), `admin-web users cohort rail UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-cohort-rail',
  '.aw-priority-pills',
  '.aw-priority-pill',
]) {
  assert.ok(css.includes(token), `admin-web users cohort rail CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP518'), 'current state must mention STEP518');

console.log('✅ smoke admin-web users cohort rail contract OK');
