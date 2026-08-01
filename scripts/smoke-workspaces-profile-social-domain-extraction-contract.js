import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKSPACE_PROFILE_ACTIONS,
  WORKSPACE_SOCIAL_ACTIONS,
} from '../src/bot/domains/workspaces/actions.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const profileCallbacks = read('src/bot/domains/workspaces/profileCallbacks.js');
const socialCallbacks = read('src/bot/domains/workspaces/socialCallbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

for (const fragment of [
  'handleWorkspaceProfileCallback',
  'handleWorkspaceSocialCallback',
  'workspace_profile:',
  'workspace_social:',
  'const workspaceDomainDeps = {',
]) {
  assert.ok(bot.includes(fragment), `bot wiring missing: ${fragment}`);
}

assert.match(ownership, /WORKSPACE_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /['"]workspace_profile['"]/);
assert.match(contracts, /['"]workspace_social['"]/);

for (const action of [...WORKSPACE_PROFILE_ACTIONS, ...WORKSPACE_SOCIAL_ACTIONS]) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(
    bot,
    new RegExp(`if\\s*\\(\\s*p\\.a\\s*===\\s*['"]${escaped}['"]\\s*\\)`),
    `${action} must not retain a direct legacy branch in bot.js`
  );
}

for (const callbacks of [profileCallbacks, socialCallbacks]) {
  assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/db\/queries\.js['"]/);
  assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/lib\/redis\.js['"]/);
  assert.match(callbacks, /workspace_domain\.missing_dependency:/);
  assert.match(callbacks, /return true;/);
}

assert.match(profileCallbacks, /workspace_domain\.unreachable_profile_action:/);
assert.match(profileCallbacks, /db\.auditWorkspace/);
assert.match(profileCallbacks, /setExpectText/);
assert.match(socialCallbacks, /workspace_domain\.unreachable_social_action:/);
assert.match(socialCallbacks, /IG_OAUTH_UI_ENABLED/);
assert.match(socialCallbacks, /redis\.set/);

console.log('PASS STEP590E3B workspace profile/social bounded-domain source contract');
