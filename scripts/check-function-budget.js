import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');

const WARN_BUDGET = Number.parseInt(process.env.VERCEL_HOBBY_FUNCTION_BUDGET_WARN || '9', 10);
const FAIL_BUDGET = Number.parseInt(process.env.VERCEL_HOBBY_FUNCTION_BUDGET_FAIL || '11', 10);
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
const IGNORE_DIRS = new Set([
  '_ig_oauth_parked',
  '_parked',
  '__tests__',
  '__mocks__',
  'node_modules',
]);

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!EXTENSIONS.has(path.extname(entry.name))) continue;
      out.push(abs);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

const files = walkFiles(API_DIR)
  .map(rel)
  .filter((p) => p.startsWith('api/'))
  .sort();

const count = files.length;
console.log(`[function-budget] Deployable API entrypoints: ${count}`);
for (const f of files) console.log(` - ${f}`);
console.log(`[function-budget] warn>=${WARN_BUDGET}, fail>=${FAIL_BUDGET} (Hobby hard limit is 12)`);

if (count >= FAIL_BUDGET) {
  console.error(
    `\n[function-budget] FAIL: ${count} deployable api entrypoints detected. ` +
    `This is too close to / beyond the Vercel Hobby limit. Reduce api/* entrypoints before deploy.`
  );
  process.exit(2);
}

if (count >= WARN_BUDGET) {
  console.warn(
    `\n[function-budget] WARNING: ${count} deployable api entrypoints detected. ` +
    `You are approaching the Vercel Hobby limit; keep parked/disabled routes out of api/.`
  );
}

console.log('[function-budget] OK');
