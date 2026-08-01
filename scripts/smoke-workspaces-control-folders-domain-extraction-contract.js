import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_CALLBACK_ACTIONS } from '../src/bot/domains/workspaces/actions.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const callbacks = read('src/bot/domains/workspaces/callbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

for (const fragment of [
  'handleWorkspaceControlCallback',
  'handleWorkspaceFolderCallback',
  'workspace_control:',
  'workspace_folders:',
  'const workspaceDomainDeps = {',
]) {
  assert.ok(bot.includes(fragment), `bot wiring missing: ${fragment}`);
}

assert.match(ownership, /WORKSPACE_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /['"]workspace_control['"]/);
assert.match(contracts, /['"]workspace_folders['"]/);

for (const action of WORKSPACE_CALLBACK_ACTIONS) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(
    bot,
    new RegExp(`if\\s*\\(\\s*p\\.a\\s*===\\s*['"]${escaped}['"]\\s*\\)`),
    `${action} must not retain a direct legacy branch in bot.js`
  );
}

assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/db\/queries\.js['"]/);
assert.doesNotMatch(callbacks, /from ['"]\.\.\/\.\.\/\.\.\/lib\/redis\.js['"]/);
assert.match(callbacks, /workspace_domain\.missing_dependency:/);
assert.match(callbacks, /workspace_domain\.unreachable_control_action:/);
assert.match(callbacks, /workspace_domain\.unreachable_folder_action:/);
assert.match(callbacks, /db\.auditWorkspace/);
assert.match(callbacks, /getFolderAccess/);
assert.match(callbacks, /isWorkspaceDisconnected/);
assert.match(callbacks, /return true;/);

console.log('PASS STEP590E3A workspace control/folders bounded-domain source contract');
