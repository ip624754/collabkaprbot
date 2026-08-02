import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const preflight = fs.readFileSync(path.join(ROOT, 'scripts/preflight.js'), 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/architecture/STEP590I_ARCHITECTURE_GATES_MANIFEST.json'), 'utf8')
);
const checker = fs.readFileSync(path.join(ROOT, 'scripts/check-step590-architecture-gates.js'), 'utf8');
const engine = fs.readFileSync(path.join(ROOT, 'scripts/lib/step590-architecture-gates.js'), 'utf8');

assert(pkg.scripts?.['check:architecture-gates'] === 'node scripts/check-step590-architecture-gates.js', 'check script must be canonical');
assert(pkg.scripts?.['test:architecture-gates'] === 'node scripts/test-step590-architecture-gates.js', 'test script must be canonical');
assert(pkg.scripts?.['smoke:architecture-gates-contract'] === 'node scripts/smoke-step590-architecture-gates-contract.js', 'smoke script must be canonical');
assert(pkg.scripts?.['report:architecture-health']?.includes('--report=artifacts/step590-architecture-health.json'), 'report script must use bounded artifact path');
assert(preflight.includes('check:architecture-gates'), 'source preflight must run architecture checker');
assert(preflight.includes('test:architecture-gates'), 'source preflight must run architecture mutation tests');
assert(preflight.includes('smoke:architecture-gates-contract'), 'source preflight must run architecture source contract');
assert(manifest.version === 'STEP590I_v1', 'manifest version must be STEP590I_v1');
assert(manifest.facades?.length === 2, 'queries and cron façades must be protected');
assert(manifest.routeOwnership?.length === 5, 'five QStash routes must have explicit owners');
assert(manifest.ownedDirectories?.length >= 6, 'bounded owner directories must be declared');
assert(manifest.frontend?.maxEntryLines === 2500, 'frontend entry budget must remain bounded');
assert(checker.includes('evaluateStep590Architecture'), 'CLI must use shared gate engine');
assert(engine.includes('route must delegate only'), 'engine must enforce exact route ownership');
assert(engine.includes('moved declaration returned to entry'), 'engine must prevent frontend re-monolithization');

console.log(`[STEP590I contract] PASS — ${assertions} assertions`);
