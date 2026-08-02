import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'fs';

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    console.error(`Missing: ${label} -> ${needle}`);
    process.exit(1);
  }
}

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const db = readQueryImplementationSource();

assertContains(bot, 'buildBroadcastDraftRecap', 'draft recap helper');
assertContains(bot, 'Что будет отправлено', 'preview recap heading');
assertContains(bot, 'Черновик', 'composer recap heading');
assertContains(bot, 'Тестовая выборка: первые', 'preview-only warning');
assertContains(bot, 'Аудитория по умолчанию', 'advanced remembered default hint');
assertContains(db, 'listBroadcastAudienceSample', 'sample audience query');

console.log('OK: broadcast draft recap contract markers found.');
