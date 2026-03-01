// Preflight grep-gate: prevent regressions that re-introduce known non-atomic Redis patterns
// into runtime code (src/**, api/**).
//
// Why:
// - We intentionally centralized bounded list operations and TTL counters into helpers in
//   src/lib/redis.js (Lua/atomic where possible).
// - Re-introducing sequences like LPUSH+LTRIM(+EXPIRE) or INCR+EXPIRE outside helpers is a
//   common footgun (race windows + immortal keys).
//
// This script is a DEV guardrail. It does NOT affect production runtime.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGET_DIRS = ['src', 'api'];
const EXT = new Set(['.js', '.mjs', '.cjs']);

// Allow direct Redis primitives only inside the atomic helper implementation.
const ALLOW_FILES = new Set([
  path.join(ROOT, 'src', 'lib', 'redis.js'),
]);

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

function within(a, b, win) {
  return Math.abs(a - b) <= win;
}

function addProblem(problems, type, file, lines, a, b, note) {
  const from = Math.max(0, Math.min(a, b) - 2);
  const to = Math.min(lines.length, Math.max(a, b) + 3);
  const snippet = lines
    .slice(from, to)
    .map((ln, i) => `${String(from + i + 1).padStart(5, ' ')} | ${ln}`)
    .join('\n');
  problems.push({ type, file, note, a: a + 1, b: b + 1, snippet });
}

function scanFile(file, problems) {
  if (ALLOW_FILES.has(file)) return;
  const lines = readLines(file);

  const lpush = [];
  const ltrim = [];
  const expire = [];
  const incr = [];
  const incrby = [];
  const lrange = [];
  const poolOptions = [];

  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (s.includes('redis.lpush(')) lpush.push(i);
    if (s.includes('redis.ltrim(')) ltrim.push(i);
    if (s.includes('redis.expire(')) expire.push(i);
    if (s.includes('redis.incr(')) incr.push(i);
    if (s.includes('redis.incrby(')) incrby.push(i);
    if (s.includes('redis.lrange(')) lrange.push(i);

    // Neon pooled/pgbouncer does NOT support startup options via Pool config.
    // Guard only the known pool config file, keep it strict.
    if (file.endsWith(path.join('src', 'db', 'pool.js'))) {
      const t = s.trim();
      const isComment = t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
      if (!isComment && /\boptions\s*:/u.test(s)) poolOptions.push(i);
    }
  }

  // Pattern A: LPUSH + LTRIM within a small window (bounded list race)
  for (const a of lpush) {
    for (const b of ltrim) {
      if (within(a, b, 25)) {
        addProblem(
          problems,
          'NON_ATOMIC_LPUSH_LTRIM',
          file,
          lines,
          a,
          b,
          'Use lpushTrim() helper (atomic/Lua) from src/lib/redis.js instead of direct LPUSH+LTRIM.'
        );
      }
    }
  }

  // Pattern B: INCR/INCRBY + EXPIRE within a window (immortal key risk)
  for (const a of [...incr, ...incrby]) {
    for (const b of expire) {
      if (within(a, b, 25)) {
        addProblem(
          problems,
          'NON_ATOMIC_INCR_EXPIRE',
          file,
          lines,
          a,
          b,
          'Use incrWithExpireOnFirst() / incrWithExpire() helpers from src/lib/redis.js.'
        );
      }
    }
  }

  // Pattern C: LRANGE + LTRIM within a larger window (list extraction race)
  for (const a of lrange) {
    for (const b of ltrim) {
      if (within(a, b, 120)) {
        addProblem(
          problems,
          'NON_ATOMIC_LRANGE_LTRIM',
          file,
          lines,
          a,
          b,
          'Use the audit inflight (queue→inflight→ack) flow; never do LRANGE+LTRIM in app code.'
        );
      }
    }
  }

  // Pattern D: Pool config must not contain startup options
  for (const i of poolOptions) {
    problems.push({
      type: 'NEON_POOL_OPTIONS_FORBIDDEN',
      file,
      note: 'Neon pooled (pgbouncer) rejects startup parameter options. Remove options: from Pool config.',
      a: i + 1,
      b: i + 1,
      snippet: `${String(i + 1).padStart(5, ' ')} | ${lines[i]}`,
    });
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
    console.log('✅ lint:redis-atomic OK');
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`\n❌ lint:redis-atomic FAILED — found ${problems.length} issue(s)\n`);
  for (const p of problems) {
    // eslint-disable-next-line no-console
    console.error(`- ${p.type}: ${path.relative(ROOT, p.file)}:${p.a}${p.a !== p.b ? `-${p.b}` : ''}`);
    // eslint-disable-next-line no-console
    console.error(`  ${p.note}`);
    // eslint-disable-next-line no-console
    console.error(p.snippet + '\n');
  }
  process.exit(2);
}

main();
