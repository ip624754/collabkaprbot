import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "scripts", "lint-portable-paths.js");
const source = fs.readFileSync(sourcePath, "utf8");

const windowsScriptPath = "C:\\GitHub\\collabkaprbot\\scripts\\lint-portable-paths.js";
const windowsFileUrl = pathToFileURL(windowsScriptPath);
const legacyPathname = windowsFileUrl.pathname;
const legacyResolved = path.win32.resolve(path.win32.dirname(legacyPathname), "..");
const canonicalResolved = path.win32.resolve(path.win32.dirname(windowsScriptPath), "..");

const checks = [
  [
    "uses fileURLToPath(import.meta.url)",
    /fileURLToPath\(import\.meta\.url\)/.test(source),
  ],
  [
    "imports fileURLToPath from node:url",
    /import\s*\{\s*fileURLToPath\s*\}\s*from\s*["']node:url["']/.test(source),
  ],
  [
    "does not derive filesystem path from URL pathname",
    !/new URL\(import\.meta\.url\)\.pathname/.test(source),
  ],
  [
    "canonical Windows root remains a single drive path",
    canonicalResolved === "C:\\GitHub\\collabkaprbot",
  ],
  [
    "legacy URL pathname demonstrates the duplicated-drive hazard",
    legacyResolved !== canonicalResolved,
  ],
  [
    "portable path lint still resolves from the script directory",
    /const ROOT = path\.resolve\(__dirname,\s*["']\.\.["']\)/.test(source),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

if (failed.length > 0) {
  for (const [name] of failed) {
    console.error(`FAIL: ${name}`);
  }
  process.exit(1);
}

console.log(
  `PASS STEP590E1H4 portable-paths Windows root contract (${checks.length} assertions)`
);
