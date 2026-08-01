import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPLICATION_CALLBACK_ACTIONS,
} from '../src/bot/domains/applications/actions.js';
import {
  LEAD_CALLBACK_ACTIONS,
} from '../src/bot/domains/leads/actions.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');
const appCallbacks = read('src/bot/domains/applications/callbacks.js');
const leadCallbacks = read('src/bot/domains/leads/callbacks.js');
const curatorCallbacks = read('src/bot/domains/curators/managementCallbacks.js');

assert.match(bot, /handleApplicationCreatorCallback/);
assert.match(bot, /handleApplicationBrandCallback/);
assert.match(bot, /handleApplicationDealsCallback/);
assert.match(bot, /handleLeadAcquisitionCallback/);
assert.match(bot, /handleLeadWorkflowCallback/);
assert.match(bot, /handleLeadAuditCallback/);
assert.match(bot, /application_creator:/);
assert.match(bot, /application_brand:/);
assert.match(bot, /application_deals:/);
assert.match(bot, /lead_acquisition:/);
assert.match(bot, /lead_workflow:/);
assert.match(bot, /lead_audit:/);

assert.match(ownership, /APPLICATION_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(ownership, /LEAD_CALLBACK_ROUTE_DEFINITIONS/);
for (const routeId of [
  'application_creator',
  'application_brand',
  'application_deals',
  'lead_acquisition',
  'lead_workflow',
  'lead_audit',
]) {
  assert.match(contracts, new RegExp(`['\"]${routeId}['\"]`));
}

for (const action of [...APPLICATION_CALLBACK_ACTIONS, ...LEAD_CALLBACK_ACTIONS]) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(
    bot,
    new RegExp(`if\\s*\\(p\\.a\\s*===\\s*['\"]${escaped}['\"]\\)`),
    `${action} must not retain a direct legacy branch in bot.js`
  );
}
assert.doesNotMatch(bot, /p\.a === 'a:cur_audit' \|\| p\.a === 'a:ca'/);
assert.doesNotMatch(bot, /if \(p\.a === 'a:cur_audit'\)/);
assert.match(curatorCallbacks, /if \(p\.a === 'a:cur_audit'\)/);

for (const source of [appCallbacks, leadCallbacks]) {
  assert.doesNotMatch(source, /from ['\"]\.\.\/\.\.\/\.\.\/db\/queries\.js['\"]/);
  assert.doesNotMatch(source, /from ['\"]\.\.\/\.\.\/\.\.\/lib\/redis\.js['\"]/);
  assert.match(source, /missing_dependency:/);
  assert.match(source, /return true;/);
}

assert.match(leadCallbacks, /p\.a === 'a:send_request_to_creator'/);
assert.match(leadCallbacks, /p\.a = 'a:wsp_lead_new'/);
assert.match(leadCallbacks, /p\.a === 'a:wsp_lead_new'/);
assert.match(leadCallbacks, /p\.a === 'a:ca'/);
assert.match(appCallbacks, /acceptBrandApplication\(ctx, u\.id, appId, back\)/);
assert.match(appCallbacks, /db\.setBrandApplicationDealStage/);
assert.match(leadCallbacks, /safeLeadWrite/);
assert.match(leadCallbacks, /renderCuratorAudit/);

console.log('PASS STEP590E1 applications/leads bounded-domain source contract');
