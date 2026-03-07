#!/usr/bin/env node
 
import fs from 'node:fs';
import path from 'node:path';

function log(line = '') {
  // eslint-disable-next-line no-console
  console.log(line);
}

function warn(line = '') {
  // eslint-disable-next-line no-console
  console.warn(line);
}

const repoRoot = process.cwd();
const checklistRel = 'smoke-tests_short.md';
const checklistPath = path.join(repoRoot, checklistRel);

log('============================================');
log(' Collabka PR — SMOKE TESTS (SHORT)');
log('============================================');
log('');
log('Quick reminders (top 4):');
log('  1) GET /api/health → ok:true + cron.* + audit.buffer.*');
log('  2) Admin UI sanity: Ops/Comms/Outbox/Users loads (no dead-ends)');
log('  3) Redis degraded UX: monetization CTA visible; actions safe');
log('  4) Input-mode escape: ❌ Отмена + "отмена/cancel/стоп/stop"');
log('');
log(`Checklist source: ./${checklistRel}`);
log('');

try {
  const md = fs.readFileSync(checklistPath, 'utf8');
  log(md.trimEnd());
} catch (e) {
  warn(`ERROR: cannot read ./${checklistRel}`);
  warn(String(e?.message || e));
  process.exitCode = 1;
}

log('');
log('Refs:');
log('  - docs/16_RELEASE_CHECKLIST.md');
log('  - docs/13_RUNBOOK_RELEASE.md');
log('');
