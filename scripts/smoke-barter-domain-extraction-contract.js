import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BARTER_CALLBACK_ACTIONS } from '../src/bot/domains/barter/actions.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const callbacks = read('src/bot/domains/barter/callbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

for (const fragment of [
  'handleBarterDiscoveryCallback',
  'handleBarterOfficialCallback',
  'handleBarterConversationCallback',
  'handleBarterOfferCallback',
  'barter_discovery:',
  'barter_official:',
  'barter_conversations:',
  'barter_offers:',
  'const barterDomainDeps = {',
]) {
  assert.ok(bot.includes(fragment), `bot wiring missing: ${fragment}`);
}

assert.match(ownership, /BARTER_CALLBACK_ROUTE_DEFINITIONS/);
for (const routeId of [
  'barter_discovery',
  'barter_official',
  'barter_conversations',
  'barter_offers',
]) {
  assert.match(contracts, new RegExp(`['"]${routeId}['"]`));
}

for (const action of BARTER_CALLBACK_ACTIONS) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(
    bot,
    new RegExp(`if\\s*\\(p\\.a\\s*===\\s*['"]${escaped}['"]\\)`),
    `${action} must not retain a direct legacy branch in bot.js`
  );
}

for (const action of ['a:off_buy', 'a:off_buy_home']) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(bot, new RegExp(`if\\s*\\(p\\.a\\s*===\\s*['"]${escaped}['"]\\)`));
}

assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/db\/queries\.js['"]/);
assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/lib\/redis\.js['"]/);
assert.match(callbacks, /barter_domain\.missing_dependency:/);
assert.match(callbacks, /barter_domain\.unreachable_action:/);
assert.match(callbacks, /db\.auditBarterOffer/);
assert.match(callbacks, /db\.getOrCreateBarterThreadWithCredits/);
assert.match(callbacks, /queueOfficialPublishToOfficialChannel/);
assert.match(callbacks, /verifyOfficialPublishState/);
assert.match(callbacks, /renderBxOfferPreviewStep/);
assert.match(callbacks, /return true;/);

console.log('PASS STEP590E2 barter bounded-domain source contract');
