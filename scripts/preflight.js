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

function isProdAppEnv(value = process.env.APP_ENV) {
  const env = String(value || '').trim().toLowerCase();
  return env === 'prod' || env === 'production';
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

logHeader("Preflight: package-lock drift gate");
const lockCheckPath = path.join(ROOT, 'scripts', 'check-package-lock.js');
if (fs.existsSync(lockCheckPath)) {
  const res = spawnSync(process.execPath, [lockCheckPath], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
} else {
  console.warn('[preflight] scripts/check-package-lock.js not found (skipping)');
}

logHeader("Preflight: Node syntax check (node --check)");

// Keep a small explicit base list, then expand via safe directory scans for entrypoints.
const baseCandidates = [
  "src/bot/bot.js",
  "src/bot/cron.js",
  "src/bot/routes/callbacks.js",
  "src/bot/payments/starsHandlers.js",
  "api/webhook.js",
  "api/cron_router.js",
  "api/health.js",
  "migrations/run.js",
  "scripts/preflight.js",
  "src/db/queries.js",
];

const nodeCheckSet = new Set();

function addCandidate(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) nodeCheckSet.add(rel);
}

function scanDir(relDir, { maxDepth = 2, include = () => true } = {}) {
  const absDir = path.join(ROOT, relDir);
  if (!fs.existsSync(absDir)) return;
  if (!fs.statSync(absDir).isDirectory()) return;

  const walk = (curRel, depth) => {
    const curAbs = path.join(ROOT, curRel);
    for (const name of fs.readdirSync(curAbs)) {
      const nextRel = path.join(curRel, name);
      const nextAbs = path.join(ROOT, nextRel);
      const st = fs.statSync(nextAbs);
      if (st.isDirectory()) {
        if (depth < maxDepth) walk(nextRel, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      if (!nextRel.endsWith(".js")) continue;
      if (!include(nextRel)) continue;
      nodeCheckSet.add(nextRel);
    }
  };

  walk(relDir, 0);
}

// base candidates
for (const rel of baseCandidates) addCandidate(rel);

// All API routes (including api/qstash/*)
scanDir("api", { maxDepth: 2 });

// Migrations (all .js)
scanDir("migrations", { maxDepth: 1 });

// Bot sub-entrypoints
scanDir(path.join("src", "bot", "routes"), { maxDepth: 2 });
scanDir(path.join("src", "bot", "payments"), { maxDepth: 2 });

// lib (small and high-risk for export regressions)
scanDir(path.join("src", "lib"), { maxDepth: 1 });

// scripts: only smoke/test helpers (avoid checking every helper script)
scanDir("scripts", {
  maxDepth: 1,
  include: (rel) => {
    const base = path.basename(rel);
    return base.startsWith("smoke-") || base.startsWith("test-");
  },
});

const nodeCheckList = Array.from(nodeCheckSet).sort();

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

logHeader("Preflight: smoke admin ops render");
const adminOpsSmokePath = path.join(ROOT, "scripts", "smoke-admin-ops-render.js");
if (fs.existsSync(adminOpsSmokePath)) {
  const res = spawnSync(process.execPath, [adminOpsSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[preflight] scripts/smoke-admin-ops-render.js not found (skipping)");
}

logHeader("Preflight: staging fault injection (Redis down)");
const faultInjectionPath = path.join(ROOT, "scripts", "smoke-fault-injection.js");
if (fs.existsSync(faultInjectionPath)) {
  if (isProdAppEnv()) {
    console.warn('[preflight] scripts/smoke-fault-injection.js skipped in prod APP_ENV');
  } else {
    const res = spawnSync(process.execPath, [faultInjectionPath], {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        APP_ENV: process.env.APP_ENV || 'staging',
        SIMULATE_REDIS_DOWN: '1',
      },
    });
    if (res.status !== 0) {
      process.exit(res.status ?? 1);
    }
  }
} else {
  console.warn("[preflight] scripts/smoke-fault-injection.js not found (skipping)");
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

logHeader("Preflight: broadcast overload invariants");
const invPath = path.join(ROOT, "scripts", "test-broadcast-overload-invariants.js");
if (fs.existsSync(invPath)) {
  const res = spawnSync(process.execPath, [invPath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[preflight] scripts/test-broadcast-overload-invariants.js not found (skipping)");
}

logHeader("Preflight: IG templates leak invariants");
const igInvPath = path.join(ROOT, "scripts", "test-ig-templates-no-contacts.js");
if (fs.existsSync(igInvPath)) {
  const res = spawnSync(process.execPath, [igInvPath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[preflight] scripts/test-ig-templates-no-contacts.js not found (skipping)");
}


// eslint-disable-next-line no-console
console.log("\n✅ Preflight OK");
