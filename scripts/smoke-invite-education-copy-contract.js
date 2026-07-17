import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');

assert.ok(botSource.includes('<b>Что считается</b>'), 'invite performance screen must explain counted events');
assert.ok(botSource.includes('• <b>Приглашён</b> — новый пользователь впервые запустил бот по твоей ссылке, и приглашение сохранилось за его аккаунтом.'), 'invite performance screen must define invited precisely');
assert.ok(botSource.includes('• <b>Активирован</b> — приглашённый заполнил основной профиль бренда или канала.'), 'invite performance screen must define activation precisely');
assert.ok(botSource.includes('• Конверсия показывает долю активированных среди приглашённых.'), 'invite performance screen must explain activation rate');
assert.ok(botSource.includes('<b>Что не считается</b>'), 'invite performance screen must state exclusions');

assert.ok(botSource.includes('<b>Как начисляются баллы</b>'), 'invite points screen must explain point mechanics');
assert.ok(botSource.includes('<b>+${INVITE_JOIN_RULE.points}</b> за первый запуск нового пользователя по твоей ссылке. В ожидании ${INVITE_JOIN_RULE.confirmationHours} часа.'), 'invite points screen must explain join reward and confirmation window');
assert.ok(botSource.includes('<b>+${INVITE_ACTIVATION_RULE.points}</b>, когда он заполнит основной профиль. В ожидании ${INVITE_ACTIVATION_RULE.confirmationHours} часов.'), 'invite points screen must explain activation reward and confirmation window');
assert.ok(botSource.includes('• Простой переход по ссылке баллы не начисляет.'), 'invite points screen must reject raw-open framing');
assert.ok(botSource.includes('• Своя ссылка и уже существующие аккаунты не учитываются.'), 'invite points screen must explain self/existing-user exclusions');
assert.ok(botSource.includes('• <b>В ожидании</b> — баллы проходят проверку и пока недоступны.'), 'invite points screen must explain pending');
assert.ok(botSource.includes('• <b>Доступно</b> — баллы можно использовать для награды.'), 'invite points screen must explain available');
assert.ok(botSource.includes('• <b>Использовано</b> — баллы уже списаны за полученную награду.'), 'invite points screen must explain used points');

assert.ok(botSource.includes('<b>Как используется баланс</b>'), 'rewards screen must explain redeem mechanics');
assert.ok(botSource.includes('• Потратить можно только баллы из строки <b>Доступно</b>.'), 'rewards screen must explain spendable balance');
assert.ok(botSource.includes('• После получения награды списанные баллы переходят в строку <b>Использовано</b>.'), 'rewards screen must explain used outcome');
assert.ok(botSource.includes('• Денежного вывода и перевода баллов другому пользователю нет.'), 'rewards screen must state non-cash boundary');

assert.ok(!botSource.includes('How points work'), 'English explainer heading should not leak into RU-first invite surfaces');
assert.ok(!botSource.includes('How redeem works'), 'English redeem explainer heading should not leak into RU-first invite surfaces');

console.log('OK: invite education copy contract');
