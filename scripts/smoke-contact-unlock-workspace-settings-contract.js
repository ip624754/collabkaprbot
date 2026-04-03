import fs from 'fs';
import assert from 'assert';

const src = fs.readFileSync('src/db/queries.js', 'utf8');
const fnStart = src.indexOf('export async function unlockWorkspaceContactsWithCredits');
assert.ok(fnStart >= 0, 'unlockWorkspaceContactsWithCredits() must exist');
const fnSlice = src.slice(fnStart, fnStart + 5000);
assert.ok(/left join workspace_settings s on s\.workspace_id = ws\.id/s.test(fnSlice), 'contact unlock pre-check must join workspace_settings for profile_* fields');
assert.ok(/select ws\.channel_username,\s*s\.profile_contact,\s*s\.profile_ig,\s*s\.profile_portfolio_urls,\s*s\.profile_contacts/s.test(fnSlice), 'contact unlock pre-check must read channel from workspaces and profile fields from workspace_settings');
assert.ok(!/select channel_username, profile_contact, profile_ig, profile_portfolio_urls, profile_contacts\s+from workspaces/s.test(fnSlice), 'contact unlock pre-check must not read profile_* fields directly from workspaces');
console.log('✅ smoke contact-unlock workspace_settings contract OK');
