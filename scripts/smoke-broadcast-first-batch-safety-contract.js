#!/usr/bin/env node
import fs from 'fs';
const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const checks = [
  [bot.includes('buildBroadcastFirstBatchSafetyText'), 'bot.js missing buildBroadcastFirstBatchSafetyText'],
  [bot.includes('buildBroadcastNextActionHints'), 'bot.js missing buildBroadcastNextActionHints'],
  [bot.includes('Проверка первой партии'), 'bot.js missing First-batch safety block'],
  [bot.includes('Следующее действие'), 'bot.js missing Next action hints block'],
  [bot.includes('дождись первой партии'), 'bot.js missing first-batch guidance copy'],
];
const failed = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
if (failed.length) {
  console.error('STEP565 smoke failed');
  for (const msg of failed) console.error('-', msg);
  process.exit(1);
}
console.log('STEP565 smoke ok');
