#!/usr/bin/env node
import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'fs';
const bot = fs.readFileSync('src/bot/bot.js', 'utf8');
const db = readQueryImplementationSource();
const reg = fs.readFileSync('src/bot/actionRegistry.js', 'utf8');
function ok(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }
ok(bot.includes('a:admin_support_set'), 'missing support set callback');
ok(reg.includes('"a:admin_support_set"'), 'missing action registry support set');
ok(db.includes('setSupportThreadStatusForAdmin'), 'missing db status setter');
ok(bot.includes('getSupportQuickReplyTemplates'), 'missing support canned template helper');
ok(bot.includes('🔓 Переоткрыть'), 'missing reopen button');
ok(bot.includes('✅ Закрыть тикет'), 'missing close button');
console.log('ok: support close/reopen + canned replies contract present');
