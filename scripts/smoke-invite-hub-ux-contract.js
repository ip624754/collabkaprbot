import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');

assert.ok(botSource.includes("📨 <b>Инвайты</b>"), 'Invite hub must use the new Инвайты heading');
assert.ok(botSource.includes('Activation rate:'), 'Invite hub must expose activation rate');
assert.ok(botSource.includes('Activation rule: <b>completed profile</b>'), 'Invite hub must expose activation rule');
assert.ok(botSource.includes('Recent invited contacts'), 'Invite hub must expose recent invited contacts');
assert.ok(botSource.includes("{ text: '📊 Статистика', callback_data: 'a:share_perf' }"), 'Invite hub must expose Statistics entrypoint');
assert.ok(botSource.includes("{ text: '💎 Баллы', callback_data: 'a:share_points' }"), 'Invite hub must expose Points entrypoint');
assert.ok(botSource.includes("{ text: '📄 История', callback_data: 'a:share_history' }"), 'Invite hub must expose History entrypoint');
assert.ok(botSource.includes("{ text: '🎁 Обменять', callback_data: 'a:share_rewards' }"), 'Invite hub must expose Redeem entrypoint');
assert.ok(botSource.includes("{ text: '🔗 Ссылка', callback_data: 'a:share_link' }"), 'Invite hub must expose Link screen entrypoint');
assert.ok(botSource.includes("{ text: '🧾 Инвайт-карта', callback_data: 'a:share_card' }"), 'Invite hub must expose Invite card entrypoint');
assert.ok(botSource.includes('Быстрый путь — кнопка <b>Пригласить</b> ниже.'), 'Invite hub must keep the short action-first intro');
assert.ok(!botSource.includes('<b>Actions</b>'), 'Invite hub must not keep the old action prose block');
assert.ok(!botSource.includes('Use <b>Share invite</b> for the fastest Telegram-native flow.'), 'Old English invite intro must be removed');

console.log('OK: invite hub IA contract');
