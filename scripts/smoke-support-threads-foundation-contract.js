import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from "fs";

const q = readQueryImplementationSource();
const b = fs.readFileSync("src/bot/bot.js", "utf8");
const m = fs.readFileSync("migrations/047_support_threads.sql", "utf8");

function need(haystack, needle, label) {
  if (!haystack.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

need(m, "create table if not exists support_threads", "support migration table");
need(q, "export async function openOrTouchSupportThreadForUser", "thread open/touch helper");
need(q, "export async function bindSupportThreadToSupportMessage", "thread bind helper");
need(q, "export async function markSupportThreadOperatorReply", "thread operator reply helper");
need(b, "a:adm_support_reply_cancel", "support reply cancel callback");
need(b, "if (p.a === 'a:adm_support_reply')", "support reply callback handler");
need(b, "if (p.a === 'a:adm_support_qr')", "support quick reply callback handler");
need(b, "db.openOrTouchSupportThreadForUser", "support thread create/touch integration");
need(b, "db.bindSupportThreadToSupportMessage", "support thread binding integration");
need(b, "db.markSupportThreadOperatorReply", "support operator reply integration");
need(b, "|th:${", "support thread callback payload binding");

console.log("ok");
