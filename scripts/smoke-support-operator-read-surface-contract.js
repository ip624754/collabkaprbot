import fs from "fs";

const q = fs.readFileSync("src/db/queries.js", "utf8");
const b = fs.readFileSync("src/bot/bot.js", "utf8");
const r = fs.readFileSync("src/bot/actionRegistry.js", "utf8");

function need(haystack, needle, label) {
  if (!haystack.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

need(q, "export async function getSupportThreadBuckets", "support bucket query helper");
need(q, "export async function listSupportThreadsForAdmin", "support list query helper");
need(q, "export async function getSupportThreadByIdForAdmin", "support thread by id query helper");
need(b, "if (p.a === 'a:admin_support')", "support home callback handler");
need(b, "if (p.a === 'a:admin_support_list')", "support list callback handler");
need(b, "if (p.a === 'a:admin_support_view')", "support view callback handler");
need(b, "async function renderAdminSupportHome", "support home render");
need(b, "async function renderAdminSupportList", "support list render");
need(b, "async function renderAdminSupportThread", "support thread render");
need(b, "🆘 Поддержка", "support admin entry label");
need(r, '"a:admin_support": { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE }', "support home registry entry");
need(r, '"a:admin_support_list": { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE }', "support list registry entry");
need(r, '"a:admin_support_view": { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE }', "support view registry entry");

console.log("ok");
