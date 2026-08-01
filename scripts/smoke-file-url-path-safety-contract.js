import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const excludedDirectories = new Set([
  ".git",
  "node_modules",
]);

const excludedFiles = new Set([
  "scripts/smoke-file-url-path-safety-contract.js",
  "scripts/smoke-portable-paths-windows-root-contract.js",
]);

const unsafePattern = new RegExp(
  [
    "new\\s+URL\\s*\\(",
    "\\s*import\\.meta\\.url\\s*",
    "\\)",
    "\\s*\\.pathname",
  ].join("")
);

const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) continue;

    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (excludedFiles.has(relative)) continue;

    const source = fs.readFileSync(absolute, "utf8");

    source.split(/\r?\n/).forEach((line, index) => {
      if (unsafePattern.test(line)) {
        violations.push({
          file: relative,
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
}

walk(root);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(
      `FAIL ${violation.file}:${violation.line} — unsafe import.meta.url pathname conversion`
    );
    console.error(`  ${violation.text}`);
  }
  process.exit(1);
}

console.log(
  "PASS STEP590E1H5 repository file-URL path safety contract (0 unsafe conversions)"
);
