import assert from 'node:assert/strict';
import fs from 'node:fs';

const botSource = fs.readFileSync('src/bot/bot.js', 'utf8');
const queriesSource = fs.readFileSync('src/db/queries.js', 'utf8');

for (const token of [
  'inviteRewardPendingReasonLabel',
  'Почему баллы в ожидании',
  'окно подтверждения: ${INVITE_JOIN_RULE.confirmationHours} часа',
  'окно подтверждения: ${INVITE_ACTIVATION_RULE.confirmationHours} часов',
  'Баллы в ожидании пока нельзя использовать.',
  'Баллы в ожидании не входят в доступный баланс до конца проверки.',
]) {
  assert.ok(botSource.includes(token), `pending user contract missing: ${token}`);
}

// Admin diagnostics retain dense operational overdue language until STEP586G.
for (const token of [
  'Pending overdue',
  'Join pending overdue',
  'Activation pending overdue',
  'overdueHours',
]) {
  assert.ok(`${botSource}\n${queriesSource}`.includes(token), `pending operator contract missing: ${token}`);
}

console.log('OK: invite pending resolution contract');
