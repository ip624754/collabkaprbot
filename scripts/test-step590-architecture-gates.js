import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStep590Architecture } from './lib/step590-architecture-gates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function evaluate(overrides = new Map()) {
  return evaluateStep590Architecture({ root: ROOT, overrides });
}

const baseline = evaluate();
assert(baseline.ok, `baseline architecture must pass: ${JSON.stringify(baseline.failures)}`);
assert(baseline.summary.failed === 0, 'baseline failed count must be zero');
assert(baseline.summary.checks >= 15, 'architecture gate must cover all protected surfaces');

const oversizedCron = evaluate(new Map([
  ['src/bot/cron.js', `${Array.from({ length: 60 }, (_, i) => `// ${i}`).join('\n')}\n`],
]));
assert(!oversizedCron.ok, 'oversized cron façade must fail');
assert(oversizedCron.failures.some((item) => item.gate === 'facade:cron' && item.message.includes('line limit')), 'cron line-limit failure must be classified');

const wrongOwner = evaluate(new Map([
  ['api/qstash/ping.js', "export { default } from '../../src/bot/bot.js';\n"],
]));
assert(!wrongOwner.ok, 'wrong QStash route owner must fail');
assert(wrongOwner.failures.some((item) => item.gate === 'route:api/qstash/ping.js' && item.message.includes('must delegate only')), 'route ownership failure must be classified');

const frontendCoupling = evaluate(new Map([
  ['scripts/admin-web/runtime.js', "export function createRuntimeModule(){ fetch('/api/admin-web-read'); return {}; }\n"],
]));
assert(!frontendCoupling.ok, 'view-level API coupling must fail');
assert(frontendCoupling.failures.some((item) => item.gate === 'frontend' && item.message.includes('orchestration boundary')), 'frontend coupling failure must be classified');

const lockDrift = evaluate(new Map([
  ['package-lock.json', JSON.stringify({ version: '0.0.0', packages: { '': { version: '0.0.0' } } })],
]));
assert(!lockDrift.ok, 'package-lock drift must fail');
assert(lockDrift.failures.some((item) => item.gate === 'package_lock_parity'), 'package-lock drift must be classified');

console.log(`[STEP590I] PASS — ${assertions} assertions`);
