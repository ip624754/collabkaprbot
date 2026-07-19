import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const CANONICAL_DOCS = [
  'docs/backoffice/README.md',
  'docs/backoffice/BACKOFFICE_CURRENT_SURFACE_INVENTORY.md',
  'docs/backoffice/BACKOFFICE_OPERATOR_JOB_MAP.md',
  'docs/backoffice/BACKOFFICE_AUTHORIZATION_MUTATION_MATRIX.md',
  'docs/backoffice/BACKOFFICE_READ_MODEL_AND_API_ARCHITECTURE.md',
  'docs/backoffice/BACKOFFICE_TARGET_INFORMATION_ARCHITECTURE.md',
  'docs/backoffice/BACKOFFICE_WIREFRAMES.md',
  'docs/backoffice/ADR_001_KEEP_STATIC_ADMIN_COLLAPSED_API_NO_ORM.md',
  'docs/backoffice/BACKOFFICE_SURFACE_MANIFEST.json',
  'docs/audit/STEP588_BACKOFFICE_PRODUCTIZATION_AUDIT.md',
  'docs/roadmap/STEP589_BACKOFFICE_IMPLEMENTATION_ROADMAP.md',
  'docs/process/07_WORK_HISTORY_STEP588.md',
];

for (const rel of CANONICAL_DOCS) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const manifest = JSON.parse(read('docs/backoffice/BACKOFFICE_SURFACE_MANIFEST.json'));
assert.equal(manifest.step, 'STEP588', 'manifest must identify STEP588');
assert.equal(manifest.baseline, 'STEP586H1', 'manifest must bind to STEP586H1 baseline');
assert.equal(manifest.architecture.orm, false, 'backoffice architecture must not introduce an ORM');
assert.equal(manifest.architecture.serverless_admin_entrypoints, 3, 'admin API must remain collapsed to three serverless entrypoints');
assert.equal(manifest.architecture.client, 'static_es_module_spa', 'current static ES module SPA must remain the accepted client architecture');
assert.equal(manifest.architecture.api_strategy, 'collapsed_section_action_endpoints', 'admin API strategy must remain section/action based');

for (const decision of [
  'keep_static_admin',
  'keep_collapsed_api',
  'no_orm',
  'no_framework_rewrite',
  'telegram_remains_authoritative_for_risky_mutations',
  'durable_audit_required_before_sensitive_web_writes',
]) {
  assert.ok(manifest.decisions.includes(decision), `manifest must preserve decision: ${decision}`);
}

const packageJson = JSON.parse(read('package.json'));
const dependencyNames = new Set([
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
]);
for (const forbiddenOrm of ['prisma', '@prisma/client', 'sequelize', 'typeorm', 'drizzle-orm', 'knex']) {
  assert.ok(!dependencyNames.has(forbiddenOrm), `STEP588 must not add ORM/query-builder dependency: ${forbiddenOrm}`);
}
assert.equal(packageJson.dependencies?.pg, '^8.12.0', 'canonical direct node-postgres dependency must remain unchanged');

const adminEntrypoints = fs.readdirSync(path.join(ROOT, 'api'))
  .filter((name) => /^admin-web-.*\.js$/.test(name))
  .sort();
assert.deepEqual(
  adminEntrypoints,
  ['admin-web-auth.js', 'admin-web-read.js', 'admin-web-write.js'],
  'admin API surface must remain exactly auth/read/write',
);

const html = read('admin.html');
const cssVersion = html.match(/\/styles\/admin-web\.css\?v=([A-Za-z0-9._-]+)/)?.[1] || '';
const jsVersion = html.match(/\/scripts\/admin-web\.js\?v=([A-Za-z0-9._-]+)/)?.[1] || '';
assert.ok(cssVersion, 'admin CSS must use a non-empty cache-bust token');
assert.ok(jsVersion, 'admin JS must use a non-empty cache-bust token');
assert.equal(cssVersion, jsVersion, 'admin CSS and JS cache-bust tokens must match');

const writeApi = read('api/admin-web-write.js');
for (const allowedAction of manifest.write_actions.filter((action) => action !== 'revoke_all')) {
  assert.ok(writeApi.includes(`'${allowedAction}'`), `admin write API must retain declared bounded action: ${allowedAction}`);
}
for (const forbiddenAction of [
  'apply_payment',
  'grant_plan',
  'grant_credits',
  'ban_user',
  'set_deal_stage',
  'accept_application',
  'draw_giveaway',
  'start_broadcast',
  'publish_broadcast',
]) {
  assert.ok(
    !new RegExp(`action\\s*===\\s*['\"]${forbiddenAction}['\"]`).test(writeApi),
    `sensitive mutation must remain outside web write surface: ${forbiddenAction}`,
  );
}

const targetIa = read('docs/backoffice/BACKOFFICE_TARGET_INFORMATION_ARCHITECTURE.md');
for (const section of ['Коллаборации', 'Операции', 'Платежи', 'Коммуникации']) {
  assert.ok(targetIa.includes(section), `target information architecture must cover ${section}`);
}

const roadmap = read('docs/roadmap/STEP589_BACKOFFICE_IMPLEMENTATION_ROADMAP.md');
for (const step of manifest.next_steps) {
  assert.ok(roadmap.includes(step), `STEP589 roadmap must include ${step}`);
}
assert.ok(
  roadmap.includes('24') && roadmap.includes('STEP587'),
  'implementation roadmap must preserve observation and release-gate preconditions',
);

console.log('✅ smoke backoffice productization contract OK');
