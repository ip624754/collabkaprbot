#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const facadeSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'routes', 'gwAccess.js'), 'utf8');
const giveawayCallbacks = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'giveaways', 'callbacks.js'), 'utf8');
const giveawayActions = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'giveaways', 'actions.js'), 'utf8');
const gwAccessSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'gwAccess.js'), 'utf8');
const actionRegistrySource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'actionRegistry.js'), 'utf8');

for (const action of ['a:gw_access', 'a:gw_access_recheck', 'a:gw_access_checkme', 'a:gw_access_user_prompt']) {
  assert.ok(giveawayActions.includes(`'${action}'`), `${action} must be owned by giveaway domain`);
}
assert.ok(giveawayCallbacks.includes('export async function handleGiveawayAccessCallback'), 'canonical access handler must live in giveaway domain');
assert.ok(giveawayCallbacks.includes('await renderGwAccess({ ctx, gwId, ownerUserId, redis, db, safeEditOrReply, forceRecheck: false });'), 'access render keeps shared edit helper');
assert.ok(giveawayCallbacks.includes("await setExpectText(ctx.from.id, { type: 'gw_access_userid', gwId });"), 'prompt keeps expectText contract');
assert.ok(facadeSource.includes('handleGiveawayAccessCallback as handleGwAccessRoute'), 'legacy route path is compatibility-only facade');
assert.ok(botSource.includes('handleGiveawayAccessCallback,'), 'bot imports giveaway bounded domain');
assert.ok(botSource.includes('giveaway_access: (ctx2, p2, u2) => handleGiveawayAccessCallback('), 'bot wires canonical giveaway access owner');
for (const action of ['a:gw_access', 'a:gw_access_recheck', 'a:gw_access_checkme', 'a:gw_access_user_prompt']) {
  assert.ok(!botSource.includes(`if (p.a === '${action}') {`), `${action} must not return to legacy dispatcher`);
}

assert.ok(actionRegistrySource.includes('"a:gw_access_user_prompt": { type: ACTION_TYPES.OPS, guard: ACTION_GUARD.REQUIRE_REDIS }'), 'input-stateful access prompt keeps Redis guard');
assert.ok(!gwAccessSource.includes('async function safeAnswerCb('), 'access renderer keeps no divergent callback ack helper');
assert.ok(!gwAccessSource.includes('async function safeEditOrReply('), 'access renderer uses project-level edit helper');
assert.ok(gwAccessSource.includes("if (ctx?.callbackQuery?.id) await ctx.answerCallbackQuery({ text: recoveryToast('giveaway'), show_alert: true }).catch(() => {});"), 'no-access path keeps classified final feedback');
assert.ok(gwAccessSource.includes("else await ctx.reply(recoveryPlain('giveaway'));"), 'message path keeps visible recovery response');

console.log('smoke-gw-access-route-contract: OK');
