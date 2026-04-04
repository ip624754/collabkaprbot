#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const callbacksSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'routes', 'callbacks.js'), 'utf8');
const gwAccessRouteSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'routes', 'gwAccess.js'), 'utf8');
const gwAccessSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'gwAccess.js'), 'utf8');
const actionRegistrySource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'actionRegistry.js'), 'utf8');

const gwAccessRoutePos = callbacksSource.indexOf("if (a === 'a:gw_access' || a.startsWith('a:gw_access_')) return 'gw_access';");
const genericGwRoutePos = callbacksSource.indexOf("if (a.startsWith('a:gw_')) return 'gw';");
assert.ok(gwAccessRoutePos >= 0, 'callbacks router must map gw_access family to dedicated route');
assert.ok(genericGwRoutePos > gwAccessRoutePos, 'gw_access route must resolve before generic gw route');

assert.ok(gwAccessRouteSource.includes("action !== 'a:gw_access'"), 'gw_access route must narrow to extracted family only');
assert.ok(gwAccessRouteSource.includes("action !== 'a:gw_access_recheck'"), 'gw_access route must handle recheck action');
assert.ok(gwAccessRouteSource.includes("action !== 'a:gw_access_checkme'"), 'gw_access route must handle checkme action');
assert.ok(gwAccessRouteSource.includes("action !== 'a:gw_access_user_prompt'"), 'gw_access route must handle user prompt action');
assert.ok(gwAccessRouteSource.includes('await renderGwAccess({ ctx, gwId, ownerUserId, redis, db, safeEditOrReply, forceRecheck: false });'), 'gw_access route must inject project-level safeEditOrReply into access render entry');
assert.ok(gwAccessRouteSource.includes('await setExpectText(ctx.from.id, { type: \'gw_access_userid\', gwId });'), 'gw_access route must preserve prompt -> expectText contract');

assert.ok(botSource.includes("import { handleGwAccessRoute } from './routes/gwAccess.js';"), 'bot must import extracted gw_access route');
assert.ok(botSource.includes('gw_access: (ctx2, p2, u2) => handleGwAccessRoute(ctx2, p2, u2, {'), 'bot must wire gw_access handler into callback dispatcher');
assert.ok(!botSource.includes("if (p.a === 'a:gw_access') {"), 'legacy bot callback block must no longer handle a:gw_access');
assert.ok(!botSource.includes("if (p.a === 'a:gw_access_recheck') {"), 'legacy bot callback block must no longer handle a:gw_access_recheck');
assert.ok(!botSource.includes("if (p.a === 'a:gw_access_checkme') {"), 'legacy bot callback block must no longer handle a:gw_access_checkme');
assert.ok(!botSource.includes("if (p.a === 'a:gw_access_user_prompt') {"), 'legacy bot callback block must no longer handle a:gw_access_user_prompt');


assert.ok(actionRegistrySource.includes('"a:gw_access_user_prompt": { type: ACTION_TYPES.OPS, guard: ACTION_GUARD.REQUIRE_REDIS }'), 'gw_access user prompt must require Redis because the flow is input-stateful');
assert.ok(!gwAccessSource.includes('async function safeAnswerCb('), 'gw_access module must not keep a local bare callback ack helper');
assert.ok(!gwAccessSource.includes('async function safeEditOrReply('), 'gw_access module must use project-level safeEditOrReply instead of a divergent local helper');
assert.ok(gwAccessSource.includes("if (ctx?.callbackQuery?.id) await ctx.answerCallbackQuery({ text: 'Нет доступа.' }).catch(() => {});"), 'gw_access no-access path must send one final no-access feedback');
assert.ok(!gwAccessSource.includes('await safeAnswerCb(ctx);'), 'gw_access render paths must not pre-ack before final feedback');
assert.ok(botSource.includes('safeEditOrReply,'), 'bot must pass project-level safeEditOrReply into the extracted gw_access family');

console.log('smoke-gw-access-route-contract: OK');
