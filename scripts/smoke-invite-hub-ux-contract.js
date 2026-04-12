import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');

assert.ok(botSource.includes('Activation rate:'), 'Invite hub must expose activation rate');
assert.ok(botSource.includes('Activation rule: <b>completed profile</b>'), 'Invite hub must expose activation rule');
assert.ok(botSource.includes('Recent invited contacts'), 'Invite hub must expose recent invited contacts');
assert.ok(botSource.includes('Link + copy'), 'Invite hub must expose Link + copy action');
assert.ok(botSource.includes('Invite card'), 'Invite hub must expose Invite card action');
assert.ok(botSource.includes('Invite history'), 'Invite hub must expose Invite history wording');
assert.ok(botSource.includes('More invited contacts: open <b>Invite history</b>.'), 'Invite hub must hint when more contacts exist');
assert.ok(botSource.includes('Use <b>Share invite</b> for the fastest Telegram-native flow.'), 'Invite hub must keep a short action-first intro');
assert.ok(!botSource.includes('<b>3 готовых варианта текста</b>'), 'Invite hub must no longer dump 3 ready invite texts on the main screen');
assert.ok(!botSource.includes('🔗 Show link'), 'Old Show link label must be removed from the invite hub');
assert.ok(!botSource.includes('🧾 Get invite card'), 'Old Get invite card label must be removed from the invite hub');

console.log('OK: invite hub UX contract');
