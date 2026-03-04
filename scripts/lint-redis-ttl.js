// Preflight grep-gate: prevent introducing Redis keys without TTL by accident.
//
// Why:
// - A "set without TTL" can become an immortal key and cost money (memory) or create stale state.
// - Some keys ARE intentionally persistent (runtime flags, admin notes). Those must be
//   explicitly annotated with a comment.
//
// Scope:
// - This is a DEV guardrail. It does NOT affect production runtime.
// - This guard checks for simple single-line patterns `redis.set(a, b)` (two args).
//   Multi-line calls should always include options `{ ex: ... }` and are intentionally rare.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGET_DIRS = ['src', 'api'];
const EXT = new Set(['.js', '.mjs', '.cjs']);

// Allow direct Redis primitives inside the helper implementation.
const ALLOW_FILES = new Set([
  path.join(ROOT, 'src', 'lib', 'redis.js'),
]);

const ALLOW_MARKER = 'TTL-LINT:';

function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.vercel') continue;
        stack.push(p);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (EXT.has(ext)) out.push(p);
      }
    }
  }
  return out;
}

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split(/\r?\n/);
}

function addProblem(problems, file, lines, i, note) {
  const from = Math.max(0, i - 2);
  const to = Math.min(lines.length, i + 3);
  const snippet = lines
    .slice(from, to)
    .map((ln, idx) => `${String(from + idx + 1).padStart(5, ' ')} | ${ln}`)
    .join('\n');
  problems.push({ file, i: i + 1, note, snippet });
}

function isAllowed(lines, i) {
  const cur = lines[i] || '';
  const prev = lines[i - 1] || '';
  const prev2 = lines[i - 2] || '';
  return cur.includes(ALLOW_MARKER) || prev.includes(ALLOW_MARKER) || prev2.includes(ALLOW_MARKER);
}

function scanFile(file, problems) {
  if (ALLOW_FILES.has(file)) return;
  const lines = readLines(file);

  // Detect simple two-arg calls `redis.set(a, b)` (single line) and require TTL or explicit marker.
  const twoArg = /\bredis\.set\(\s*[^,]+,\s*[^,\)]+\)\s*/u;
  const threeArg = /\bredis\.set\(\s*[^,]+,\s*[^,]+,\s*/u;

  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (!s.includes('redis.set(')) continue;
    if (!twoArg.test(s)) continue;
    if (threeArg.test(s)) continue; // has opts
    if (isAllowed(lines, i)) continue;

    addProblem(
      problems,
      file,
      lines,
      i,
      'redis.set(a, b) without TTL detected. Add `{ ex: <ttlSec> }` or annotate intentional persistence with `// TTL-LINT: allow-persistent`.'
    );
  }
}

function main() {
  const problems = [];
  for (const d of TARGET_DIRS) {
    const dir = path.join(ROOT, d);
    for (const f of listFiles(dir)) {
      scanFile(f, problems);
    }
  }

  if (!problems.length) {
    // eslint-disable-next-line no-console
    console.log('✅ lint:redis-ttl OK');
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`\n❌ lint:redis-ttl FAILED — found ${problems.length} issue(s)\n`);
  for (const p of problems) {
    // eslint-disable-next-line no-console
    console.error(`- REDIS_SET_WITHOUT_TTL: ${path.relative(ROOT, p.file)}:${p.i}`);
    // eslint-disable-next-line no-console
    console.error(`  ${p.note}`);
    // eslint-disable-next-line no-console
    console.error(p.snippet + '\n');
  }
  process.exit(2);
}

main();
