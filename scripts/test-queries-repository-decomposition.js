import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const manifestPath = path.join(ROOT, 'docs', 'architecture', 'STEP590F_QUERY_EXPORT_MANIFEST.json');
const facadePath = path.join(ROOT, 'src', 'db', 'queries.js');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

assert(manifest.step === 'STEP590F', 'manifest step mismatch');
assert(manifest.publicExportCount === 328, 'manifest public export count must remain 328');
assert(Array.isArray(manifest.modules) && manifest.modules.length === 9, 'expected nine bounded repositories');
assert(new Set(manifest.publicExports).size === 328, 'manifest public exports must be unique');

const facade = fs.readFileSync(facadePath, 'utf8');
assert(facade.split('\n').length < 450, 'compatibility facade must remain thin');
assert(!/\bpool\s*\.\s*(?:query|connect)\s*\(/.test(facade), 'facade must not own DB execution');
assert(!/\b(?:begin|commit|rollback)\b/i.test(facade), 'facade must not own transaction logic');
assert(!/`[\s\S]*?\b(?:select|insert|update|delete)\b/i.test(facade), 'facade must not contain SQL');

const facadeExports = [];
for (const match of facade.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/repositories\/([A-Za-z0-9_-]+)\.js['"]/g)) {
  const names = match[1].split(',').map((s) => s.trim()).filter(Boolean);
  facadeExports.push(...names);
}
assert(facadeExports.length === 328, `facade must expose 328 names, got ${facadeExports.length}`);
assert(new Set(facadeExports).size === 328, 'facade exports must be unique');
assert(JSON.stringify(facadeExports) === JSON.stringify(manifest.publicExports), 'facade export order/name parity drift');

let reconstructed = '';
const publicFromModules = [];
for (const mod of manifest.modules) {
  const rel = `src/db/repositories/${mod.name}.js`;
  const source = read(rel);
  const begin = `// BEGIN MOVED QUERY BODY: ${mod.name}\n`;
  const end = `// END MOVED QUERY BODY: ${mod.name}\n`;
  const startIdx = source.indexOf(begin);
  const endIdx = source.indexOf(end);
  assert(startIdx >= 0, `${rel}: missing moved-body begin marker`);
  assert(endIdx > startIdx, `${rel}: missing moved-body end marker`);
  let body = source.slice(startIdx + begin.length, endIdx);

  for (const internalName of manifest.internalCrossRepositoryExports?.[mod.name] || []) {
    body = body.replace(
      new RegExp(`(^|\\n)export\\s+(async\\s+function|function)\\s+${internalName}\\b`),
      `$1$2 ${internalName}`
    );
  }
  reconstructed += body;

  const declared = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1])
    .filter((name) => !(manifest.internalCrossRepositoryExports?.[mod.name] || []).includes(name));
  assert(JSON.stringify(declared) === JSON.stringify(mod.publicExports), `${rel}: public export list drift`);
  publicFromModules.push(...declared);
  assert(!source.includes("from '../queries.js'"), `${rel}: repository must not import compatibility facade`);
}

assert(sha256(reconstructed) === manifest.bodySha256, 'moved query body changed: SQL/signature/transaction parity failed');
assert(JSON.stringify(publicFromModules) === JSON.stringify(manifest.publicExports), 'repository public export parity drift');


// Every named cross-repository import must resolve to a real module export.
// This catches ESM-instantiation failures that `node --check` cannot detect.
const repositoryDir = path.join(ROOT, 'src', 'db', 'repositories');
const repositoryFiles = fs.readdirSync(repositoryDir)
  .filter((name) => name.endsWith('.js'))
  .sort();
const repositoryExportMap = new Map();
for (const name of repositoryFiles) {
  const source = fs.readFileSync(path.join(repositoryDir, name), 'utf8');
  const exports = new Set(
    [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)]
      .map((match) => match[1])
  );
  for (const block of source.matchAll(/^export\s*\{([\s\S]*?)\}\s*;?$/gm)) {
    for (const item of block[1].split(',')) {
      const clean = item.trim();
      if (!clean) continue;
      exports.add(clean.split(/\s+as\s+/).at(-1).trim());
    }
  }
  repositoryExportMap.set(name, exports);
}
for (const name of repositoryFiles) {
  const source = fs.readFileSync(path.join(repositoryDir, name), 'utf8');
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+\.js)['"]/g)) {
    const targetName = match[2];
    const targetExports = repositoryExportMap.get(targetName);
    assert(targetExports, `${name}: imported repository target does not exist: ${targetName}`);
    for (const item of match[1].split(',')) {
      const clean = item.trim();
      if (!clean) continue;
      const importedName = clean.split(/\s+as\s+/)[0].trim();
      assert(
        targetExports.has(importedName),
        `${name}: ${targetName} does not export named import ${importedName}`
      );
    }
  }
}

const allowedDirectRepositoryImportRoots = new Set(['src/db/repositories']);
for (const top of ['src', 'api', 'migrations']) {
  const topAbs = path.join(ROOT, top);
  if (!fs.existsSync(topAbs)) continue;
  const stack = [topAbs];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, abs).replaceAll('\\', '/');
      if (rel.startsWith('src/db/repositories/')) continue;
      const source = fs.readFileSync(abs, 'utf8');
      assert(!/from\s*['"][^'"]*db\/repositories\//.test(source), `${rel}: application code bypasses queries.js compatibility facade`);
    }
  }
}

for (const rel of [
  'src/bot/bot.js',
  'src/bot/jobs/auditFlushJob.js',
  'src/bot/jobs/broadcastJob.js',
  'src/bot/jobs/giveawayJob.js',
  'src/bot/jobs/instagramVerificationJob.js',
  'src/lib/officialPublishVerify.js',
  'api/qstash/monetization-retry.js',
  'api/qstash/broadcast-deliver.js',
]) {
  assert(read(rel).includes('queries.js'), `${rel}: expected compatibility-facade import missing`);
}

console.log(`✅ STEP590F repository decomposition tests OK (${assertions} assertions)`);
