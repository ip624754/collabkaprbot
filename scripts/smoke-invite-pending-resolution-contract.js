import fs from 'node:fs';

const files = [
  'src/bot/bot.js',
  'src/db/queries.js',
  'docs/00_CURRENT_STATE.md',
  'docs/process/07_WORK_HISTORY_STEP574.md',
];
const content = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
for (const token of [
  'inviteRewardPendingReasonLabel',
  'Awaiting join confirmation',
  'Awaiting activation confirmation',
  'Pending overdue',
  'Join pending overdue',
  'Activation pending overdue',
  'overdueHours',
  'STEP574 — Pending Reward Resolution Polish',
]) {
  if (!content.includes(token)) {
    console.error('Missing token:', token);
    process.exit(1);
  }
}
console.log('OK: invite pending resolution contract');
