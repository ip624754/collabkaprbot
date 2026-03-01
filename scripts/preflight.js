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

logHeader("Preflight: navigation lint");
runNpm("lint:nav");

logHeader("Preflight: redact tests");
runNpm("test:redact");

logHeader("Preflight: public render contact leak gate");
runNpm("lint:public-contacts");

logHeader("Preflight: redis atomicity grep gate");
runNpm("lint:redis-atomic");

// eslint-disable-next-line no-console
console.log("\n✅ Preflight OK");
