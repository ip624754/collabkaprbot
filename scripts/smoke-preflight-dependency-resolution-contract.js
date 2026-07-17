import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});

const missing = [];
for (const dep of deps) {
  try {
    require.resolve(dep, { paths: [ROOT] });
  } catch {
    missing.push(dep);
  }
}

if (missing.length) {
  console.error(`FAIL: declared dependencies not resolvable by entrypoint: ${missing.join(', ')}`);
  process.exit(2);
}

for (const expected of ['@upstash/qstash', '@upstash/redis', 'grammy']) {
  if (deps.includes(expected)) {
    require.resolve(expected, { paths: [ROOT] });
  }
}

console.log(`OK: ${deps.length} declared dependencies resolve by package entrypoint.`);
