import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function runNpm(scriptName) {
  const res = spawnSync(npmCmd, ["run", scriptName], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function runNodeCheck(relPath) {
  const abs = path.join(ROOT, relPath);
  const res = spawnSync(process.execPath, ["--check", abs], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function logHeader(title) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${title} ===`);
}

logHeader("Preflight: actions registry");
runNpm("actions:check");

logHeader("Preflight: actions registry docs (must be up to date)");
const regDocPath = path.join(ROOT, "docs", "02_ACTION_KEYS_REGISTRY.md");
const before = readTextSafe(regDocPath);
runNpm("actions:md");
const after = readTextSafe(regDocPath);

if (before !== after) {
  // eslint-disable-next-line no-console
  console.error(
    "\n[preflight] docs/02_ACTION_KEYS_REGISTRY.md changed during generation.\n" +
      "Commit the updated file (or fix the registry scripts) and re-run preflight."
  );
  process.exit(2);
}

logHeader("Preflight: migration pack (must be up to date)");
const packPath = path.join(ROOT, "migration_pack", "00_mark_all_applied.sql");
const packBefore = readTextSafe(packPath);
runNpm("gen:migration-pack");
const packAfter = readTextSafe(packPath);

if (packBefore !== packAfter) {
  // eslint-disable-next-line no-console
  console.error(
    "\n[preflight] migration_pack/00_mark_all_applied.sql changed during generation.\n" +
      "Commit the updated file (or fix scripts/gen-mark-all-applied.js) and re-run preflight."
  );
  process.exit(2);
}

logHeader("Preflight: navigation lint");
runNpm("lint:nav");

logHeader("Preflight: redact tests");
runNpm("test:redact");

logHeader("Preflight: public render contact leak gate");
runNpm("lint:public-contacts");

logHeader("Preflight: redis atomicity grep gate");
runNpm("lint:redis-atomic");

logHeader("Preflight: redis TTL hygiene gate");
runNpm("lint:redis-ttl");

logHeader("Preflight: redis.js exports gate");
runNpm("lint:redis-exports");

logHeader("Preflight: portable paths gate (ZIP/Windows-safe)");
runNpm("lint:portable-paths");

logHeader("Preflight: Node syntax check (node --check)");
const nodeCheckCandidates = [
  "src/bot/bot.js",
  "src/bot/cron.js",
  "src/bot/routes/callbacks.js",
  "src/bot/payments/starsHandlers.js",
  "api/webhook.js",
  "api/cron_router.js",
  "api/health.js",
  "migrations/run.js",
  "scripts/preflight.js",
  "scripts/smoke-degraded-rate-limit.js",
  "src/db/queries.js",
  "src/lib/redis.js",
  "src/lib/tgApi.js",
];

const nodeCheckList = [];
for (const rel of nodeCheckCandidates) {
  if (fs.existsSync(path.join(ROOT, rel))) nodeCheckList.push(rel);
}

// Optional: if api/qstash exists, check all .js handlers there too.
const qstashDir = path.join(ROOT, "api", "qstash");
if (fs.existsSync(qstashDir) && fs.statSync(qstashDir).isDirectory()) {
  for (const f of fs.readdirSync(qstashDir)) {
    if (f.endsWith(".js")) nodeCheckList.push(path.join("api", "qstash", f));
  }
}

if (nodeCheckList.length === 0) {
  // eslint-disable-next-line no-console
  console.warn("[preflight] No JS entrypoints found for node --check (skipping)");
} else {
  for (const rel of nodeCheckList) {
    // eslint-disable-next-line no-console
    console.log(`[preflight] node --check ${rel}`);
    runNodeCheck(rel);
  }
}

logHeader("Preflight: smoke degraded rate-limit");
const smokePath = path.join(ROOT, "scripts", "smoke-degraded-rate-limit.js");
if (fs.existsSync(smokePath)) {
  const res = spawnSync(process.execPath, [smokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[preflight] scripts/smoke-degraded-rate-limit.js not found (skipping)");
}

// eslint-disable-next-line no-console
console.log("\n✅ Preflight OK");
