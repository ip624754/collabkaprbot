import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DIRECTORY_PUBLIC_WORKSPACE_ACTIONS,
  DIRECTORY_SEARCH_ACTIONS,
} from '../src/bot/domains/directory/actions.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const callbacks = read('src/bot/domains/directory/callbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

for (const fragment of [
  'handleDirectorySearchCallback',
  'handleDirectoryPublicWorkspaceCallback',
  'directory_search:',
  'directory_public_workspace:',
  'const directoryDomainDeps = {',
]) {
  assert.ok(bot.includes(fragment), `bot wiring missing: ${fragment}`);
}

assert.match(ownership, /DIRECTORY_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /['"]directory_search['"]/);
assert.match(contracts, /['"]directory_public_workspace['"]/);

for (const action of [...DIRECTORY_SEARCH_ACTIONS, ...DIRECTORY_PUBLIC_WORKSPACE_ACTIONS]) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(
    bot,
    new RegExp(`if\\s*\\(\\s*p\\.a\\s*===\\s*['"]${escaped}['"]\\s*\\)`),
    `${action} must not retain a direct legacy branch in bot.js`
  );
}

assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/db\/queries\.js['"]/);
assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/lib\/redis\.js['"]/);
assert.match(callbacks, /directory_domain\.missing_dependency:/);
assert.match(callbacks, /directory_domain\.unreachable_search_action:/);
assert.match(callbacks, /directory_domain\.unreachable_public_workspace_action:/);
assert.match(callbacks, /resolveBmBrandContext/);
assert.match(callbacks, /renderProfileMatchingResults/);
assert.match(callbacks, /renderWsPublicProfile/);
assert.match(callbacks, /isWorkspaceContactsUnlocked/);
assert.match(callbacks, /a:wsp_contact_unlock/);
assert.match(callbacks, /return true;/);

assert.match(callbacks, /if\s*\(p\.a === 'a:wsp_contact_unlock'\)/, 'directory public-workspace owner must contain contact unlock');
assert.doesNotMatch(bot, /if\s*\(p\.a === 'a:wsp_contact_unlock'\)/, 'contact unlock must not retain a legacy branch');
assert.doesNotMatch(callbacks, /if\s*\(p\.a === 'a:wsp_lead_new'\)/, 'directory domain must not own lead acquisition');

console.log('PASS STEP590E3C directory/public workspace bounded-domain source contract');
