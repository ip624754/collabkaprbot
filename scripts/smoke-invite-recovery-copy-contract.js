import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');

assert.ok(botSource.includes('function inviteStartNoticeKeyboard(result = null)'), 'invite start notice keyboard helper missing');
assert.ok(botSource.includes("kb.text('⬅️ К приглашениям', 'a:share').text('🏠 Домой', 'a:home');"), 'self-invite warning must expose recovery buttons');
assert.ok(botSource.includes('await ctx.reply(inviteStartNotice, { reply_markup: inviteStartNoticeKeyboard(inviteStartNoticeMeta) });'), 'start flow must reply with recovery keyboard for invite notices');
assert.ok(botSource.includes('• Приглашено: <b>${invitedCount}</b>') || botSource.includes('`• Приглашено: <b>${invitedCount}</b>`'), 'invite hub must use RU invited label');
assert.ok(botSource.includes('• Конверсия активации: <b>${escapeHtml(activationRate)}</b>') || botSource.includes('Конверсия активации'), 'invite surfaces must use RU activation rate label');
assert.ok(botSource.includes('<b>Сводка</b>'), 'invite surfaces must use RU summary heading');
assert.ok(botSource.includes('<b>Баллы</b>'), 'invite hub must show a concise points status block');
assert.ok(botSource.includes('<b>Последние приглашённые</b>'), 'invite surfaces must use RU recent contacts heading');
assert.ok(botSource.includes('Ссылка работает, но статистика приглашений временно не обновляется.'), 'degraded invite state must be explicit');

console.log('OK: invite recovery + RU copy contract');
