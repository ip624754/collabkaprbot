import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStep590Architecture } from './lib/step590-architecture-gates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const reportArg = process.argv.find((arg) => arg.startsWith('--report='));
const reportPath = reportArg ? reportArg.slice('--report='.length).trim() : '';

const result = evaluateStep590Architecture({ root: ROOT });

for (const check of result.checks) {
  const meta = Number.isInteger(check.lines) ? ` lines=${check.lines}` : '';
  console.log(`[architecture-gates] ${check.status} ${check.gate}${meta}`);
}

if (result.failures.length) {
  console.error('\n[architecture-gates] FAIL');
  for (const failure of result.failures) {
    console.error(` - ${failure.gate} :: ${failure.path} :: ${failure.message}`);
  }
}

if (reportPath) {
  const abs = path.resolve(ROOT, reportPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
  console.log(`[architecture-gates] report=${path.relative(ROOT, abs).replace(/\\/g, '/')}`);
}

console.log(
  `[architecture-gates] summary checks=${result.summary.checks} passed=${result.summary.passed} failed=${result.summary.failed}`
);

process.exit(result.ok ? 0 : 2);
