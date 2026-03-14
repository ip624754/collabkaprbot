import fs from "node:fs"; 
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const require = createRequire(import.meta.url);

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function getDeclaredDependencies() {
  const pkg = readJsonSafe(path.join(ROOT, "package.json"));
  if (!pkg || typeof pkg !== "object") return [];
  return Object.keys(pkg.dependencies || {}).filter(Boolean).sort();
}

function getMissingLocalDependencies() {
  const deps = getDeclaredDependencies();
  if (deps.length === 0) return [];

  return deps.filter((dep) => {
    try {
      require.resolve(`${dep}/package.json`, { paths: [ROOT] });
      return false;
    } catch {
      return true;
    }
  });
}

function assertDependenciesInstalled() {
  const deps = getDeclaredDependencies();
  if (deps.length === 0) return;

  const missing = getMissingLocalDependencies();
  if (missing.length === 0) return;

  const hasNodeModules = fs.existsSync(path.join(ROOT, "node_modules"));
  const installHint = hasNodeModules ? "npm install" : "npm ci";
  const missingPreview = missing.slice(0, 8).join(", ");
  const extra = missing.length > 8 ? ` (+${missing.length - 8} more)` : "";

  console.error(
    "\n[preflight] Missing local npm dependencies required for full preflight.\n" +
      (hasNodeModules
        ? "Some declared packages are not resolvable from this checkout.\n"
        : "This looks like a bare snapshot without node_modules.\n") +
      `Missing: ${missingPreview}${extra}\n` +
      `Run \`${installHint}\` in the project root, then re-run preflight.\n` +
      "Failing fast before late smoke checks so the issue is explicit and operator-friendly."
  );
  process.exit(2);
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

logHeader("Preflight: local npm dependencies");
assertDependenciesInstalled();

logHeader("Preflight: ENV baseline contract");
runNpm("smoke:env-baseline-contract");

logHeader("Preflight: creator current-channel contract");
runNpm("smoke:creator-current-channel-contract");

logHeader("Preflight: Telegram share URL compatibility contract");
runNpm("smoke:share-url-compat-contract");

logHeader("Preflight: Brand Inbox accept-point contract");
runNpm("smoke:brand-inbox-accept-contract");

logHeader("Preflight: Contacts / Brand Pass anti-bypass contract");
runNpm("smoke:contacts-brand-pass-contract");

logHeader("Preflight: no-channel gates contract");
runNpm("smoke:no-channel-gate-contract");

logHeader("Preflight: input mode cancel/reset contract");
runNpm("smoke:input-mode-contract");

logHeader("Preflight: what-next / back-navigation contract");
runNpm("smoke:what-next-backnav-contract");

logHeader("Preflight: QStash dedup sanitize contract");
runNpm("smoke:qstash-dedup-sanitize-contract");

logHeader("Preflight: brand application super-admin OPS COPY contract");
runNpm("smoke:brand-app-ops-copy-contract");

logHeader("Preflight: brand application accept UX / post-accept flow contract");
runNpm("smoke:brand-app-accept-ux-contract");

logHeader("Preflight: brand deal stage + navigation contract");
runNpm("smoke:brand-deal-stage-nav-contract");

logHeader("Preflight: brand deal card density contract");
runNpm("smoke:brand-deal-density-contract");

logHeader("Preflight: brand application card density contract");
runNpm("smoke:brand-app-density-contract");

logHeader("Preflight: creator application dialog density contract");
runNpm("smoke:creator-app-dialog-density-contract");

logHeader("Preflight: creator applications list density contract");
runNpm("smoke:creator-apps-list-density-contract");

logHeader("Preflight: creator-side brand leads density contract");
runNpm("smoke:creator-leads-density-contract");

logHeader("Preflight: creator-side lead entrypoints contract");
runNpm("smoke:creator-leads-entrypoints-contract");

logHeader("Preflight: brand applications list density contract");
runNpm("smoke:brand-apps-list-density-contract");

logHeader("Preflight: brand Inbox density contract");
runNpm("smoke:brand-inbox-density-contract");

logHeader("Preflight: brand-side lead entrypoints contract");
runNpm("smoke:brand-lead-entrypoints-contract");

logHeader("Preflight: brand-side lead follow-ups contract");
runNpm("smoke:brand-lead-followups-contract");

logHeader("Preflight: brand-side brand-app notices contract");
runNpm("smoke:brand-app-notices-contract");

logHeader("Preflight: creator-side brand-app notices contract");
runNpm("smoke:creator-app-notices-contract");

logHeader("Preflight: creator-side brand-app chat entry/fallback contract");
runNpm("smoke:creator-app-chat-entrypoints-contract");

logHeader("Preflight: creator-side brand-app reply completion contract");
runNpm("smoke:creator-app-reply-completion-contract");

logHeader("Preflight: creator-side brand-app reply runtime guard contract");
runNpm("smoke:creator-app-reply-runtime-guard-contract");

logHeader("Preflight: creator-side brand-app local-context contract");
runNpm("smoke:creator-app-local-context-contract");
runNpm("smoke:brand-app-reply-entrypoints-contract");

logHeader("Preflight: empty / no-history / first-message states contract");
runNpm("smoke:empty-state-contract");

logHeader("Preflight: creator catalog open-path contract");
runNpm("smoke:creator-brands-home-open-contract");

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

logHeader("Preflight: smoke admin ops keyboard/actions contract");
const adminOpsContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-ops-contract.js");
if (fs.existsSync(adminOpsContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminOpsContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[preflight] scripts/smoke-admin-ops-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin comms keyboard/footer contract");
const adminCommsContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-comms-contract.js");
if (fs.existsSync(adminCommsContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminCommsContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-comms-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin system keyboard/footer contract");
const adminSystemContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-system-contract.js");
if (fs.existsSync(adminSystemContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminSystemContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-system-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin founder contract");
const adminFounderContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-founder-contract.js");
if (fs.existsSync(adminFounderContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminFounderContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-founder-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin payments contract");
const adminPaymentsContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-payments-contract.js");
if (fs.existsSync(adminPaymentsContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminPaymentsContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-payments-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin payments fallback contract");
const adminPaymentsFallbackContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-payments-fallback-contract.js");
if (fs.existsSync(adminPaymentsFallbackContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminPaymentsFallbackContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-payments-fallback-contract.js not found (skipping)");
}


logHeader("Preflight: smoke admin QStash status contract");
const adminQStashStatusContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-qstash-status-contract.js");
if (fs.existsSync(adminQStashStatusContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminQStashStatusContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-qstash-status-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin hard-skip contract");
const adminHardSkipContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-hard-skip-contract.js");
if (fs.existsSync(adminHardSkipContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminHardSkipContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-hard-skip-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin users contract");
const adminUsersContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-users-contract.js");
if (fs.existsSync(adminUsersContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminUsersContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-users-contract.js not found (skipping)");
}


logHeader("Preflight: smoke admin user card + note contract");
const adminUserCardNoteContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-user-card-note-contract.js");
if (fs.existsSync(adminUserCardNoteContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminUserCardNoteContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-user-card-note-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin audit + metrics + moderators contract");
const adminAuditMetricsModeratorsContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-audit-metrics-moderators-contract.js");
if (fs.existsSync(adminAuditMetricsModeratorsContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminAuditMetricsModeratorsContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-audit-metrics-moderators-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin outbox contract");
const adminOutboxContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-outbox-contract.js");
if (fs.existsSync(adminOutboxContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminOutboxContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-outbox-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin DM templates contract");
const adminDmTemplatesContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-dm-templates-contract.js");
if (fs.existsSync(adminDmTemplatesContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminDmTemplatesContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-dm-templates-contract.js not found (skipping)");
}

logHeader("Preflight: smoke admin notice composer/runtime contract");
const adminNoticeContractSmokePath = path.join(ROOT, "scripts", "smoke-admin-notice-contract.js");
if (fs.existsSync(adminNoticeContractSmokePath)) {
  const res = spawnSync(process.execPath, [adminNoticeContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-admin-notice-contract.js not found (skipping)");
}

logHeader("Preflight: staging health/admin JSON shape");
const healthAdminShapePath = path.join(ROOT, "scripts", "smoke-health-admin-shape.js");
if (fs.existsSync(healthAdminShapePath)) {
  if (isProdAppEnv()) {
    console.warn('[preflight] scripts/smoke-health-admin-shape.js skipped in prod APP_ENV');
  } else {
    const res = spawnSync(process.execPath, [healthAdminShapePath], {
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
  console.warn("[preflight] scripts/smoke-health-admin-shape.js not found (skipping)");
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

logHeader("Preflight: smoke broadcast local DB fuse contract");
const broadcastLocalDbFuseSmokePath = path.join(ROOT, "scripts", "smoke-broadcast-local-db-fuse.js");
if (fs.existsSync(broadcastLocalDbFuseSmokePath)) {
  const res = spawnSync(process.execPath, [broadcastLocalDbFuseSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-broadcast-local-db-fuse.js not found (skipping)");
}

logHeader("Preflight: smoke payments autoheal chain contract");
const paymentsAutohealChainSmokePath = path.join(ROOT, "scripts", "smoke-payments-autoheal-chain-contract.js");
if (fs.existsSync(paymentsAutohealChainSmokePath)) {
  const res = spawnSync(process.execPath, [paymentsAutohealChainSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-payments-autoheal-chain-contract.js not found (skipping)");
}


logHeader("Preflight: smoke start role-gate contract");
const startRoleGateContractSmokePath = path.join(ROOT, "scripts", "smoke-start-role-gate-contract.js");
if (fs.existsSync(startRoleGateContractSmokePath)) {
  const res = spawnSync(process.execPath, [startRoleGateContractSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-start-role-gate-contract.js not found (skipping)");
}

logHeader("Preflight: smoke brand application accept SQL contract");
const brandAppAcceptSqlSmokePath = path.join(ROOT, "scripts", "smoke-brand-app-accept-sql-contract.js");
if (fs.existsSync(brandAppAcceptSqlSmokePath)) {
  const res = spawnSync(process.execPath, [brandAppAcceptSqlSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-brand-app-accept-sql-contract.js not found (skipping)");
}

logHeader("Preflight: smoke ws channel disconnect contract");
const wsChannelDisconnectSmokePath = path.join(ROOT, "scripts", "smoke-ws-channel-disconnect-contract.js");
if (fs.existsSync(wsChannelDisconnectSmokePath)) {
  const res = spawnSync(process.execPath, [wsChannelDisconnectSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-ws-channel-disconnect-contract.js not found (skipping)");
}

logHeader("Preflight: smoke official publish check-now contract");
const officialPublishCheckNowSmokePath = path.join(ROOT, "scripts", "smoke-official-publish-check-now-contract.js");
if (fs.existsSync(officialPublishCheckNowSmokePath)) {
  const res = spawnSync(process.execPath, [officialPublishCheckNowSmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-official-publish-check-now-contract.js not found (skipping)");
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


logHeader("Preflight: smoke footer/back/list-return consistency contract");
const footerBackConsistencySmokePath = path.join(ROOT, "scripts", "smoke-footer-back-consistency-contract.js");
if (fs.existsSync(footerBackConsistencySmokePath)) {
  const res = spawnSync(process.execPath, [footerBackConsistencySmokePath], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
} else {
  console.warn("[preflight] scripts/smoke-footer-back-consistency-contract.js not found (skipping)");
}

// eslint-disable-next-line no-console
console.log("\n✅ Preflight OK");
