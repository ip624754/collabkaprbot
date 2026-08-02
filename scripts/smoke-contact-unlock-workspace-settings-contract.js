#!/usr/bin/env node
import { readQueryImplementationSource } from './lib/query-source-reader.js';

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const src = readQueryImplementationSource(ROOT);

const fnStart = src.indexOf('export async function unlockWorkspaceContactsWithCredits');
assert.ok(fnStart >= 0, 'unlockWorkspaceContactsWithCredits must exist');
const nextExport = src.indexOf('export async function ', fnStart + 1);
const scope = src.slice(fnStart, nextExport > fnStart ? nextExport : undefined);

assert.ok(scope.includes('left join workspace_settings s on s.workspace_id = ws.id'), 'contact unlock guard must join workspace_settings for profile fields');
assert.ok(scope.includes('select ws.channel_username,'), 'contact unlock guard must read channel_username from workspaces alias ws');
assert.ok(scope.includes('s.profile_contact'), 'contact unlock guard must read profile_contact from workspace_settings');
assert.ok(scope.includes('s.profile_ig'), 'contact unlock guard must read profile_ig from workspace_settings');
assert.ok(scope.includes('s.profile_portfolio_urls'), 'contact unlock guard must read profile_portfolio_urls from workspace_settings');
assert.ok(scope.includes('s.profile_contacts'), 'contact unlock guard must read profile_contacts from workspace_settings');
assert.ok(!/select\s+channel_username,\s*profile_contact,\s*profile_ig,\s*profile_portfolio_urls,\s*profile_contacts\s+from\s+workspaces/i.test(scope), 'contact unlock guard must not read profile_* directly from workspaces');

console.log('smoke-contact-unlock-workspace-settings-contract: OK');
