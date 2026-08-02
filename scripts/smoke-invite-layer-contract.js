import { readQueryImplementationSource } from './lib/query-source-reader.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStartPayload } from '../src/bot/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');
const registrySource = fs.readFileSync(path.join(root, 'src', 'bot', 'actionRegistry.js'), 'utf8');
const queriesSource = readQueryImplementationSource();

assert.ok(botSource.includes("bot.command('invite'"), 'Missing /invite command');
assert.ok(botSource.includes("bot.inlineQuery(/^invite"), 'Missing invite inlineQuery handler');
assert.ok(botSource.includes("if (p.a === 'a:share_link')"), 'Missing share_link callback');
assert.ok(botSource.includes("if (p.a === 'a:share_card')"), 'Missing share_card callback');
assert.ok(botSource.includes('switch_inline_query'), 'Invite keyboard must expose inline share CTA');
assert.ok(registrySource.includes('"a:share_link"'), 'Action registry must contain a:share_link');
assert.ok(registrySource.includes('"a:share_card"'), 'Action registry must contain a:share_card');
assert.ok(queriesSource.includes('export function buildInviteCodeFromTelegramUserId'), 'Invite code helper missing');
assert.ok(queriesSource.includes('export function buildInviteStartParam'), 'Invite start-param helper missing');
assert.ok(queriesSource.includes('export async function attemptInviteAttribution'), 'Invite attribution storage helper missing');
assert.ok(queriesSource.includes('member_invites'), 'Invite repo must reference member_invites table');

const parsedInline = parseStartPayload('/start ii_ABC123');
assert.equal(parsedInline?.type, 'invite', 'parseStartPayload must classify ii_ payload as invite');
assert.equal(parsedInline?.startParam, 'ii_ABC123', 'parseStartPayload must preserve inline invite param');

const parsedLink = parseStartPayload('/start il_ABC123');
assert.equal(parsedLink?.type, 'invite', 'parseStartPayload must classify il_ payload as invite');

const parsedCard = parseStartPayload('/start ic_ABC123');
assert.equal(parsedCard?.type, 'invite', 'parseStartPayload must classify ic_ payload as invite');

console.log('OK: invite layer contract');
