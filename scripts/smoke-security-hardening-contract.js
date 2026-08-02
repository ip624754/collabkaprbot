import { readQueryImplementationSource } from './lib/query-source-reader.js';
import { readCronImplementationSource } from './lib/cron-source-reader.js';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const repo = process.cwd();
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

const webhook = read('api/webhook.js');
assert.ok(webhook.includes("import { timingSafeEq } from '../src/lib/adminWeb/common.js';"), 'webhook must import timingSafeEq');
assert.ok(webhook.includes("!timingSafeEq(token, CFG.WEBHOOK_SECRET_TOKEN)"), 'webhook must use timingSafeEq for secret compare');
assert.ok(!webhook.includes("String(token) !== String(CFG.WEBHOOK_SECRET_TOKEN)"), 'webhook must not use plain string compare');

const cronRouter = read('api/cron_router.js');
assert.ok(cronRouter.includes("import { timingSafeEq } from '../src/lib/adminWeb/common.js';"), 'cron_router must import timingSafeEq');
assert.ok(cronRouter.includes("!timingSafeEq(token, CFG.CRON_SECRET)"), 'cron_router must use timingSafeEq for secret compare');
assert.ok(!cronRouter.includes("token !== String(CFG.CRON_SECRET)"), 'cron_router must not use plain string compare');

const bot = read('src/bot/bot.js');
assert.ok(bot.includes('This guard is load-shedding only, not the primary concurrency invariant.'), 'degraded click guard boundary note must stay documented');
assert.ok(bot.includes("`a:brand_app_accept`, `a:wsp_contact_unlock`"), 'guarded critical actions must stay documented');

const queries = readQueryImplementationSource();
const giveawayAtomicCore = read('src/db/giveawayAtomicCore.js');
assert.ok(giveawayAtomicCore.includes("return { status: 'locked' };"), 'atomic giveaway draw must explicitly surface locked status');

const cron = readCronImplementationSource(repo);
assert.ok(cron.includes("if (r.status === 'locked') {"), 'cron must explicitly branch on locked giveaway draw status');
assert.ok(cron.includes('expected fail-fast path, not a silent success'), 'cron locked-path comment must stay explicit');

console.log('smoke-security-hardening-contract: OK');
