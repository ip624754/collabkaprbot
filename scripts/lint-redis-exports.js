import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const redisPath = path.join(ROOT, 'src', 'lib', 'redis.js');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function hasNamedExport(src, name) {
  // Accept:
  //  - export function name(
  //  - export async function name(
  //  - export const name =
  //  - export { name }
  const re = new RegExp(
    String.raw`(^|\n)\s*export\s+(async\s+)?function\s+${name}\s*\(|` +
      String.raw`(^|\n)\s*export\s+const\s+${name}\s*=|` +
      String.raw`(^|\n)\s*export\s*\{[^\}]*\b${name}\b[^\}]*\}`,
    'm'
  );
  return re.test(src);
}

const required = ['incrWithExpireOnFirst', 'incrWithExpire', 'lpushTrim'];

let src = '';
try {
  src = read(redisPath);
} catch {
  // eslint-disable-next-line no-console
  console.error(`[lint:redis-exports] Missing file: ${redisPath}`);
  process.exit(2);
}

const missing = required.filter((n) => !hasNamedExport(src, n));
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    `[lint:redis-exports] Missing required named exports in src/lib/redis.js: ${missing.join(
      ', '
    )}`
  );
  // eslint-disable-next-line no-console
  console.error(
    `Fix: ensure src/lib/redis.js exports { ${missing.join(', ')} } (named exports).`
  );
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('✅ redis.js exports OK');
