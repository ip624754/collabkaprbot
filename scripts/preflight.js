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
const mode = String(process.argv[2] || "full").trim().toLowerCase();

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
    "\n[preflight] Missing local npm dependencies required for deps/runtime preflight.\n" +
      (hasNodeModules
        ? "Some declared packages are not resolvable from this checkout.\n"
        : "This looks like a bare snapshot without node_modules.\n") +
      `Missing: ${missingPreview}${extra}\n` +
      `Run \`${installHint}\` in the project root, then re-run \`npm run preflight:deps\` (or full preflight).\n` +
      "Source-only preflight can still run without local dependencies."
  );
  process.exit(2);
}

function runNpm(scriptName) {
  const res = spawnSync(npmCmd, ["run", scriptName], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function runNodeCheck(relPath) {
  const abs = path.join(ROOT, relPath);
  const res = spawnSync(process.execPath, ["--check", abs], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function runOptionalNodeScript(title, relPath, { env = process.env, skipWhenProd = false } = {}) {
  logHeader(title);
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`[preflight] ${relPath} not found (skipping)`);
    return;
  }
  if (skipWhenProd && isProdAppEnv(env.APP_ENV)) {
    console.warn(`[preflight] ${relPath} skipped in prod APP_ENV`);
    return;
  }
  const res = spawnSync(process.execPath, [absPath], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function verifyGeneratedFile({ title, targetPath, regenerateScript, changedMessage }) {
  logHeader(title);
  const abs = path.join(ROOT, targetPath);
  const before = readTextSafe(abs);
  runNpm(regenerateScript);
  const after = readTextSafe(abs);
  if (before !== after) {
    console.error(`\n[preflight] ${changedMessage}`);
    process.exit(2);
  }
}

function logHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function isProdAppEnv(value = process.env.APP_ENV) {
  const env = String(value || "").trim().toLowerCase();
  return env === "prod" || env === "production";
}

function buildNodeCheckList() {
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

  for (const rel of baseCandidates) addCandidate(rel);
  scanDir("api", { maxDepth: 2 });
  scanDir("migrations", { maxDepth: 1 });
  scanDir(path.join("src", "bot", "routes"), { maxDepth: 2 });
  scanDir(path.join("src", "bot", "payments"), { maxDepth: 2 });
  scanDir(path.join("src", "lib"), { maxDepth: 1 });
  scanDir("scripts", {
    maxDepth: 1,
    include: (rel) => {
      const base = path.basename(rel);
      return base.startsWith("smoke-") || base.startsWith("test-");
    },
  });

  return Array.from(nodeCheckSet).sort();
}

const SOURCE_NPM_CHECKS = [
  ["Preflight (source-only): ENV baseline contract", "smoke:env-baseline-contract"],
  ["Preflight (source-only): package-lock release consistency", "check:package-lock"],
  ["Preflight (source-only): Vercel Hobby function budget", "check:function-budget"],
  ["Preflight (source-only): creator current-channel contract", "smoke:creator-current-channel-contract"],
  ["Preflight (source-only): Telegram share URL compatibility contract", "smoke:share-url-compat-contract"],
  ["Preflight (source-only): Brand Inbox accept-point contract", "smoke:brand-inbox-accept-contract"],
  ["Preflight (source-only): Contacts / Brand Pass anti-bypass contract", "smoke:contacts-brand-pass-contract"],
  ["Preflight (source-only): no-channel gates contract", "smoke:no-channel-gate-contract"],
  ["Preflight (source-only): input mode cancel/reset contract", "smoke:input-mode-contract"],
  ["Preflight (source-only): what-next / back-navigation contract", "smoke:what-next-backnav-contract"],
  ["Preflight (source-only): QStash dedup sanitize contract", "smoke:qstash-dedup-sanitize-contract"],
  ["Preflight (source-only): brand application super-admin OPS COPY contract", "smoke:brand-app-ops-copy-contract"],
  ["Preflight (source-only): brand application accept UX / post-accept flow contract", "smoke:brand-app-accept-ux-contract"],
  ["Preflight (source-only): brand deal stage + navigation contract", "smoke:brand-deal-stage-nav-contract"],
  ["Preflight (source-only): brand deal card density contract", "smoke:brand-deal-density-contract"],
  ["Preflight (source-only): brand application card density contract", "smoke:brand-app-density-contract"],
  ["Preflight (source-only): creator application dialog density contract", "smoke:creator-app-dialog-density-contract"],
  ["Preflight (source-only): creator applications list density contract", "smoke:creator-apps-list-density-contract"],
  ["Preflight (source-only): creator-side brand leads density contract", "smoke:creator-leads-density-contract"],
  ["Preflight (source-only): creator-side lead entrypoints contract", "smoke:creator-leads-entrypoints-contract"],
  ["Preflight (source-only): brand applications list density contract", "smoke:brand-apps-list-density-contract"],
  ["Preflight (source-only): brand Inbox density contract", "smoke:brand-inbox-density-contract"],
  ["Preflight (source-only): brand-side lead entrypoints contract", "smoke:brand-lead-entrypoints-contract"],
  ["Preflight (source-only): brand-side lead follow-ups contract", "smoke:brand-lead-followups-contract"],
  ["Preflight (source-only): brand-side brand-app notices contract", "smoke:brand-app-notices-contract"],
  ["Preflight (source-only): creator-side brand-app notices contract", "smoke:creator-app-notices-contract"],
  ["Preflight (source-only): creator-side brand-app chat entry/fallback contract", "smoke:creator-app-chat-entrypoints-contract"],
  ["Preflight (source-only): creator-side brand-app reply completion contract", "smoke:creator-app-reply-completion-contract"],
  ["Preflight (source-only): creator-side brand-app reply runtime guard contract", "smoke:creator-app-reply-runtime-guard-contract"],
  ["Preflight (source-only): new-dialog terminology consistency contract", "smoke:new-dialog-terminology-contract"],
  ["Preflight (source-only): home copy contract", "smoke:home-copy-contract"],
  ["Preflight (source-only): selection pilot contract", "smoke:selection-pilot-contract"],
  ["Preflight (source-only): Telegram copy hotfix wave 1 contract", "smoke:copy-wave1-contract"],
  ["Preflight (source-only): public landing contract", "smoke:landing-contract"],
  ["Preflight (source-only): admin web shell contract", "smoke:admin-web-shell-contract"],
  ["Preflight (source-only): admin web WHATWG URL contract", "smoke:admin-web-whatwg-url-contract"],
  ["Preflight (source-only): admin web runtime contract", "smoke:admin-web-runtime-contract"],
  ["Preflight (source-only): admin web payments contract", "smoke:admin-web-payments-contract"],
  ["Preflight (source-only): admin web payments follow-up contract", "smoke:admin-web-payments-followup-contract"],
  ["Preflight (source-only): admin web comms contract", "smoke:admin-web-comms-contract"],
  ["Preflight (source-only): admin web founder contract", "smoke:admin-web-founder-contract"],
  ["Preflight (source-only): admin web login contract", "smoke:admin-web-login-contract"],
  ["Preflight (source-only): admin web users export contract", "smoke:admin-web-users-export-contract"],
  ["Preflight (source-only): admin web users bulk utility contract", "smoke:admin-web-users-bulk-contract"],
  ["Preflight (source-only): admin web users filter rail v2 contract", "smoke:admin-web-users-filter-rail-contract"],
  ["Preflight (source-only): admin web users hierarchy polish contract", "smoke:admin-web-users-hierarchy-contract"],
  ["Preflight (source-only): admin web users priority rail contract", "smoke:admin-web-users-priority-rail-contract"],
  ["Preflight (source-only): admin web users cohort rail contract", "smoke:admin-web-users-cohort-rail-contract"],
  ["Preflight (source-only): admin web users cohort counters contract", "smoke:admin-web-users-cohort-counters-contract"],
  ["Preflight (source-only): admin web users follow-up rail contract", "smoke:admin-web-users-followup-rail-contract"],
  ["Preflight (source-only): admin web users row quick actions contract", "smoke:admin-web-users-row-actions-contract"],
  ["Preflight (source-only): admin web users sticky controls / pagination contract", "smoke:admin-web-users-sticky-pagination-contract"],
  ["Preflight (source-only): admin web users saved operator presets contract", "smoke:admin-web-users-saved-presets-contract"],
  ["Preflight (source-only): admin control surface contract", "smoke:admin-control-surface-contract"],
  ["Preflight (source-only): creator-side brand-app local-context contract", "smoke:creator-app-local-context-contract"],
  ["Preflight (source-only): brand-side brand-app reply entrypoints contract", "smoke:brand-app-reply-entrypoints-contract"],
  ["Preflight (source-only): empty / no-history / first-message states contract", "smoke:empty-state-contract"],
  ["Preflight (source-only): creator catalog open-path contract", "smoke:creator-brands-home-open-contract"],
  ["Preflight (source-only): actions registry", "actions:check"],
  ["Preflight (source-only): navigation lint", "lint:nav"],
  ["Preflight (source-only): redact tests", "test:redact"],
  ["Preflight (source-only): public render contact leak gate", "lint:public-contacts"],
  ["Preflight (source-only): redis atomicity grep gate", "lint:redis-atomic"],
  ["Preflight (source-only): redis TTL hygiene gate", "lint:redis-ttl"],
  ["Preflight (source-only): redis.js exports gate", "lint:redis-exports"],
  ["Preflight (source-only): portable paths gate (ZIP/Windows-safe)", "lint:portable-paths"],
  ["Preflight (source-only): admin ops keyboard/actions contract", "smoke:admin-ops-contract"],
  ["Preflight (source-only): admin comms contract", "smoke:admin-comms-contract"],
  ["Preflight (source-only): admin system contract", "smoke:admin-system-contract"],
  ["Preflight (source-only): admin founder contract", "smoke:admin-founder-contract"],
  ["Preflight (source-only): admin payments contract", "smoke:admin-payments-contract"],
  ["Preflight (source-only): admin payments fallback contract", "smoke:admin-payments-fallback-contract"],
  ["Preflight (source-only): admin QStash status contract", "smoke:admin-qstash-status-contract"],
  ["Preflight (source-only): admin hard-skip contract", "smoke:admin-hard-skip-contract"],
  ["Preflight (source-only): admin users contract", "smoke:admin-users-contract"],
  ["Preflight (source-only): admin user card + note contract", "smoke:admin-user-card-note-contract"],
  ["Preflight (source-only): admin audit + metrics + moderators contract", "smoke:admin-audit-metrics-moderators-contract"],
  ["Preflight (source-only): admin outbox contract", "smoke:admin-outbox-contract"],
  ["Preflight (source-only): admin DM templates contract", "smoke:admin-dm-templates-contract"],
  ["Preflight (source-only): admin notice composer/runtime contract", "smoke:admin-notice-contract"],
  ["Preflight (source-only): broadcast local DB fuse contract", "smoke:broadcast-local-db-fuse"],
  ["Preflight (source-only): payments autoheal chain contract", "smoke:payments-autoheal-chain-contract"],
  ["Preflight (source-only): start role-gate contract", "smoke:start-role-gate-contract"],
  ["Preflight (source-only): brand application accept SQL contract", "smoke:brand-app-accept-sql-contract"],
  ["Preflight (source-only): ws channel disconnect contract", "smoke:ws-channel-disconnect-contract"],
  ["Preflight (source-only): official publish check-now contract", "smoke:official-publish-check-now-contract"],
  ["Preflight (source-only): footer/back/list-return consistency contract", "smoke:footer-back-consistency-contract"],
  ["Preflight (source-only): package-lock drift gate", "check:package-lock"],
];

function runSourceChecks() {
  for (const [title, scriptName] of SOURCE_NPM_CHECKS) {
    logHeader(title);
    runNpm(scriptName);
  }

  verifyGeneratedFile({
    title: "Preflight (source-only): actions registry docs (must be up to date)",
    targetPath: path.join("docs", "02_ACTION_KEYS_REGISTRY.md"),
    regenerateScript: "actions:md",
    changedMessage:
      "docs/02_ACTION_KEYS_REGISTRY.md changed during generation.\nCommit the updated file (or fix the registry scripts) and re-run preflight.",
  });

  verifyGeneratedFile({
    title: "Preflight (source-only): migration pack (must be up to date)",
    targetPath: path.join("migration_pack", "00_mark_all_applied.sql"),
    regenerateScript: "gen:migration-pack",
    changedMessage:
      "migration_pack/00_mark_all_applied.sql changed during generation.\nCommit the updated file (or fix scripts/gen-mark-all-applied.js) and re-run preflight.",
  });

  logHeader("Preflight (source-only): Node syntax check (node --check)");
  const nodeCheckList = buildNodeCheckList();
  if (nodeCheckList.length === 0) {
    console.warn("[preflight] No JS entrypoints found for node --check (skipping)");
  } else {
    for (const rel of nodeCheckList) {
      console.log(`[preflight] node --check ${rel}`);
      runNodeCheck(rel);
    }
  }

  runOptionalNodeScript(
    "Preflight (source-only): smoke admin ops render",
    path.join("scripts", "smoke-admin-ops-render.js")
  );

  runOptionalNodeScript(
    "Preflight (source-only): broadcast overload invariants",
    path.join("scripts", "test-broadcast-overload-invariants.js")
  );

  runOptionalNodeScript(
    "Preflight (source-only): IG templates leak invariants",
    path.join("scripts", "test-ig-templates-no-contacts.js")
  );

  logHeader("Preflight (source-only): smoke health/admin shape");
  console.warn("[preflight] smoke-health-admin-shape moved to preflight:deps (skipping in source-only mode)");

  logHeader("Preflight (source-only): staging fault injection (Redis down)");
  console.warn("[preflight] smoke-fault-injection moved to preflight:deps (skipping in source-only mode)");

  logHeader("Preflight (source-only): smoke degraded rate-limit");
  console.warn("[preflight] smoke-degraded-rate-limit moved to preflight:deps (skipping in source-only mode)");
}

function runDepsChecks() {
  logHeader("Preflight (deps/runtime): local npm dependencies");
  assertDependenciesInstalled();

  const stagingEnv = {
    ...process.env,
    APP_ENV: process.env.APP_ENV || "staging",
    SIMULATE_REDIS_DOWN: "1",
  };

  runOptionalNodeScript(
    "Preflight (deps/runtime): staging health/admin JSON shape",
    path.join("scripts", "smoke-health-admin-shape.js"),
    { env: stagingEnv, skipWhenProd: true }
  );

  runOptionalNodeScript(
    "Preflight (deps/runtime): staging health fast-tier contract",
    path.join("scripts", "smoke-health-fast-contract.js"),
    { env: stagingEnv, skipWhenProd: true }
  );

  runOptionalNodeScript(
    "Preflight (deps/runtime): staging fault injection (Redis down)",
    path.join("scripts", "smoke-fault-injection.js"),
    { env: stagingEnv, skipWhenProd: true }
  );

  runOptionalNodeScript(
    "Preflight (deps/runtime): smoke degraded rate-limit",
    path.join("scripts", "smoke-degraded-rate-limit.js")
  );
}

if (mode === "full") {
  runSourceChecks();
  runDepsChecks();
  console.log("\n✅ Preflight OK");
  process.exit(0);
}

if (mode === "source") {
  runSourceChecks();
  console.log("\n✅ Preflight (source-only) OK");
  process.exit(0);
}

if (mode === "deps") {
  runDepsChecks();
  console.log("\n✅ Preflight (deps/runtime) OK");
  process.exit(0);
}

console.error(`[preflight] Unknown mode: ${mode}. Use full, source, or deps.`);
process.exit(2);
