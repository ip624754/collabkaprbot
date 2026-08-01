import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "preflight.js"), "utf8");

const checks = [
  [
    "Windows uses cmd.exe/ComSpec",
    /process\.env\.ComSpec\s*\|\|\s*"cmd\.exe"/.test(source),
  ],
  [
    "Windows command uses /d /s /c",
    /args:\s*\["\/d",\s*"\/s",\s*"\/c",\s*`npm\.cmd run \$\{normalized\}`\]/.test(source),
  ],
  [
    "script names are allowlisted",
    /\^\[a-zA-Z0-9:_-\]\+\$/.test(source),
  ],
  [
    "spawn launch errors are surfaced",
    /if\s*\(res\.error\)/.test(source) &&
      /Failed to launch npm script/.test(source),
  ],
  [
    "null exit status is rejected",
    /if\s*\(res\.status == null\)/.test(source),
  ],
  [
    "legacy direct npm.cmd spawn is absent",
    !/spawnSync\(npmCmd,\s*\["run",\s*scriptName\]/.test(source),
  ],
  [
    "contract is part of source preflight",
    /smoke:preflight-windows-runner-contract/.test(source),
  ],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  for (const [name] of failed) {
    console.error(`FAIL: ${name}`);
  }
  process.exit(1);
}

console.log(`PASS STEP590E1H3 Windows preflight npm runner contract (${checks.length} assertions)`);
