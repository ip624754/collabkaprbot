import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');
const registrySource = fs.readFileSync(path.join(root, 'src', 'bot', 'actionRegistry.js'), 'utf8');
const queriesSource = fs.readFileSync(path.join(root, 'src', 'db', 'queries.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(root, 'migrations', '046_invite_reward_ledger.sql'), 'utf8');

assert.ok(botSource.includes('a:share_redeem'), 'Invite rewards CTA callback missing');
assert.ok(botSource.includes('a:share_redeem_do'), 'Invite rewards confirm callback missing');
assert.ok(botSource.includes('Collabka points:'), 'Invite screen/profile should expose Collabka points readout');
assert.ok(botSource.includes('renderInviteRewardsLines'), 'Invite rewards render helper missing');
assert.ok(botSource.includes('loadInviteRewardsStateForUser'), 'Invite rewards state loader missing');
assert.ok(registrySource.includes('"a:share_redeem"'), 'Action registry missing a:share_redeem');
assert.ok(registrySource.includes('"a:share_redeem_do"'), 'Action registry missing a:share_redeem_do');
assert.ok(queriesSource.includes('export async function processInviteRewardsForInvitee'), 'Invite rewards invitee processor missing');
assert.ok(queriesSource.includes('export async function processInviteRewardsForReferrer'), 'Invite rewards referrer processor missing');
assert.ok(queriesSource.includes('export async function getInviteRewardsSummary'), 'Invite rewards summary helper missing');
assert.ok(queriesSource.includes('export async function redeemInviteReward'), 'Invite rewards redeem helper missing');
assert.ok(queriesSource.includes('invite_reward_ledger'), 'Invite reward ledger table must be referenced');
assert.ok(migrationSource.includes('create table if not exists invite_reward_ledger'), 'Invite rewards migration missing ledger table');
assert.ok(migrationSource.includes("reward_type in ('invite_join', 'invite_activation', 'pro_7d', 'pro_30d')"), 'Invite rewards migration missing reward_type contract');
assert.ok(migrationSource.includes("status in ('pending', 'confirmed', 'rejected', 'redeemed')"), 'Invite rewards migration missing status contract');

console.log('OK: invite rewards contract');
