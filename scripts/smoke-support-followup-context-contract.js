#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bot = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'bot.js'), 'utf8');
const queries = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'queries.js'), 'utf8');
function must(s, needle, label) {
  if (!s.includes(needle)) {
    console.error(`missing: ${label}`);
    process.exit(1);
  }
}
must(bot, 'support_followup', 'support followup redis key');
must(bot, 'Можешь просто ответить следующим сообщением', 'user-facing followup copy');
must(bot, 'forwardSupportUserFollowup', 'followup forwarding helper');
must(bot, 'clearSupportFollowupContext(ctx.from.id)', 'clear followup on navigation/send');
must(queries, 'markSupportThreadUserFollowup', 'db thread user followup updater');
console.log('ok: support follow-up context contract present');
