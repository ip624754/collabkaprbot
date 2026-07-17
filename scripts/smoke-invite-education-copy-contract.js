import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');

assert.ok(botSource.includes('<b>Как читать статистику</b>'), 'invite performance screen must explain how to read stats');
assert.ok(botSource.includes('• <b>Приглашено</b> — пользователи, которые пришли по твоей ссылке.'), 'invite performance screen must explain invited');
assert.ok(botSource.includes('• <b>Активировано</b> — пользователи, которые заполнили основной профиль.'), 'invite performance screen must explain activated');
assert.ok(botSource.includes('• Конверсия показывает, какая доля приглашённых реально активировалась.'), 'invite performance screen must explain activation rate');

assert.ok(botSource.includes('<b>Как работают баллы</b>'), 'invite points screen must explain point mechanics');
assert.ok(botSource.includes('• Баллы начисляются за валидную активацию, а не за простой переход по ссылке.'), 'invite points screen must reject raw-open framing');
assert.ok(botSource.includes('• Своя ссылка и уже существующие пользователи не учитываются.'), 'invite points screen must explain self/existing-user exclusions');
assert.ok(botSource.includes('• <b>В ожидании</b> — баллы ждут подтверждения и пока не тратятся.'), 'invite points screen must explain pending');
assert.ok(botSource.includes('• <b>Доступно</b> — баллы уже можно обменять на PRO внутри Collabka.'), 'invite points screen must explain available');
assert.ok(botSource.includes('• <b>Обменяно</b> — баллы уже списаны за активированную награду.'), 'invite points screen must explain redeemed');

assert.ok(botSource.includes('<b>Как работает обмен</b>'), 'redeem screen must explain redeem mechanics');
assert.ok(botSource.includes('• Обмениваются только баллы из строки <b>Доступно</b>.'), 'redeem screen must explain spendable balance');
assert.ok(botSource.includes('• Баллы <b>В ожидании</b> сначала должны подтвердиться.'), 'redeem screen must explain pending is not redeemable');
assert.ok(botSource.includes('• После обмена баллы переходят в строку <b>Обменяно</b>, а PRO активируется внутри Collabka.'), 'redeem screen must explain redeemed outcome');

assert.ok(!botSource.includes('How points work'), 'English explainer heading should not leak into RU-first invite surfaces');
assert.ok(!botSource.includes('How redeem works'), 'English redeem explainer heading should not leak into RU-first invite surfaces');

console.log('OK: invite education copy contract');
