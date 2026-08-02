import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/architecture/STEP590G1_CRON_EXPORT_MANIFEST.json'), 'utf8'));
const facade = fs.readFileSync(path.join(ROOT, manifest.facadePath), 'utf8');
const router = fs.readFileSync(path.join(ROOT, manifest.baseline.routerPath), 'utf8');

function must(condition, message) {
  if (!condition) throw new Error(message);
}

must(manifest.publicExportCount === 12, 'public export count drift');
must(manifest.routerJobCount === 4, 'router job count drift');
must(facade.includes("from './jobs/index.js'"), 'bounded jobs index missing from façade');
must(!facade.includes('async function'), 'implementation leaked into cron façade');
must(!facade.includes('redis.'), 'Redis runtime leaked into cron façade');
must(router.includes("from '../src/bot/cron.js'"), 'cron router bypasses compatibility façade');
for (const job of manifest.routerJobs) must(router.includes(`case '${job}'`), `router job missing: ${job}`);
for (const name of manifest.publicExports) must(facade.includes(name), `facade export missing: ${name}`);
for (const mod of manifest.modules) must(fs.existsSync(path.join(ROOT, mod.file)), `bounded module missing: ${mod.file}`);

console.log('✅ STEP590G1 cron compatibility façade contract OK');
