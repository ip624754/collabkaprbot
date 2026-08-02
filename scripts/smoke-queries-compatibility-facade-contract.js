import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/architecture/STEP590F_QUERY_EXPORT_MANIFEST.json'), 'utf8'));
const facade = fs.readFileSync(path.join(ROOT, 'src/db/queries.js'), 'utf8');

function must(condition, message) {
  if (!condition) throw new Error(message);
}

must(manifest.publicExportCount === 328, 'public export count drift');
must(manifest.modules.length === 9, 'repository count drift');
must(facade.includes("from './repositories/usersRepository.js'"), 'users repository missing from facade');
must(facade.includes("from './repositories/broadcastsRepository.js'"), 'broadcast repository missing from facade');
must(facade.includes("from './repositories/socialRepository.js'"), 'social repository missing from facade');
must(!facade.includes('pool.query'), 'SQL execution leaked into facade');
must(!facade.includes('pool.connect'), 'transaction ownership leaked into facade');

for (const mod of manifest.modules) {
  const file = path.join(ROOT, 'src', 'db', 'repositories', `${mod.name}.js`);
  must(fs.existsSync(file), `missing repository ${mod.name}`);
  const source = fs.readFileSync(file, 'utf8');
  must(source.includes(`BEGIN MOVED QUERY BODY: ${mod.name}`), `${mod.name}: missing body marker`);
}

console.log('✅ STEP590F compatibility façade contract OK');
