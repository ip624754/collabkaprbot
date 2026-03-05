import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Limits chosen to be safe across filesystems + zip tools.
// - Most filesystems allow 255 bytes for a single filename, but zip/unzip + UTF-8 can break earlier.
// - We keep a conservative guard to avoid "File name too long" and encoding mojibake issues.
const MAX_BASENAME_BYTES = 200;

// ASCII-only filenames across the repo (portable across Windows/macOS/Linux + zip tooling).
// Allow common safe chars only.
const ASCII_PRINTABLE_RE = /^[\x20-\x7E]+$/;

const SKIP_DIRS = new Set(["node_modules", ".vercel", ".git", ".next"]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(abs);
    } else if (e.isFile()) {
      checkPath(abs, e.name);
    }
  }
}

let bad = 0;

function checkPath(abs, base) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const bytes = Buffer.byteLength(base, "utf8");

  if (bytes > MAX_BASENAME_BYTES) {
    bad++;
    // eslint-disable-next-line no-console
    console.error(`[portable-paths] basename too long (${bytes} bytes): ${rel}`);
  }

  // Only enforce ASCII-safe on the basename. Paths can contain dirs like "docs/process".
  if (!ASCII_PRINTABLE_RE.test(base)) {
    bad++;
    // eslint-disable-next-line no-console
    console.error(`[portable-paths] non-ASCII or non-printable chars in filename: ${rel}`);
  }
}

walk(ROOT);

if (bad > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n[portable-paths] FAIL: ${bad} issue(s).`);
  process.exit(2);
}

// eslint-disable-next-line no-console
console.log("✅ portable-paths OK");
