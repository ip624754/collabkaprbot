#!/usr/bin/env node
import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'fs';
const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const db = readQueryImplementationSource();
const checks = [
  [bot.includes('Итог доставки'), 'bot.js missing Post-run report text'],
  [bot.includes('buildBroadcastPostRunReport'), 'bot.js missing buildBroadcastPostRunReport'],
  [bot.includes('основные причины'), 'bot.js missing dominant reasons summary'],
  [db.includes('listBroadcastPostRunReasonRows'), 'queries.js missing listBroadcastPostRunReasonRows'],
  [db.includes("count(*) filter (where status = 'retry')"), 'queries.js missing retry breakdown'],
];
const failed = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
if (failed.length) {
  console.error('STEP564 smoke failed');
  for (const msg of failed) console.error('-', msg);
  process.exit(1);
}
console.log('STEP564 smoke ok');
