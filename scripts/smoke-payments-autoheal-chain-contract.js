import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readCronImplementationSource } from './lib/cron-source-reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const monRetryPath = path.join(ROOT, 'api', 'qstash', 'monetization-retry.js');
const configPath = path.join(ROOT, 'src', 'lib', 'config.js');
const healthPath = path.join(ROOT, 'api', 'health.js');

const monRetrySrc = fs.readFileSync(monRetryPath, 'utf8');
const cronSrc = readCronImplementationSource(ROOT);
const configSrc = fs.readFileSync(configPath, 'utf8');
const healthSrc = fs.readFileSync(healthPath, 'utf8');

assert.ok(
  configSrc.includes('PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX'),
  'Expected PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX in src/lib/config.js'
);
assert.ok(
  healthSrc.includes('orphaned_autoheal_chain_max'),
  'Expected /api/health payments section to expose orphaned_autoheal_chain_max'
);

assert.ok(
  monRetrySrc.includes("action: 'orphaned_autoheal'"),
  'Expected monetization-retry self-reenqueue payload action'
);
assert.ok(
  monRetrySrc.includes("if (action === 'orphaned_autoheal')"),
  'Expected monetization-retry worker action handler for orphaned_autoheal'
);
assert.ok(
  monRetrySrc.includes('const cand = await db.claimOrphanedMissingSessionPaymentsForAutoheal(batch, minAgeSec);'),
  'Expected worker batch claim for orphaned missing_session payments'
);
assert.ok(
  monRetrySrc.includes('const maxDepth = orphanedAutohealChainMax();'),
  'Expected worker depth-limit guard for autoheal chain'
);
assert.match(
  monRetrySrc,
  /deduplicationId:\s*`mon:autoheal:\$\{chain\}:\$\{nextDepth\}`/,
  'Expected worker self-reenqueue dedup mon:autoheal:${chain}:${nextDepth}'
);
assert.match(
  monRetrySrc,
  /if \(cand\.length >= batch\) \{[\s\S]*?await queueOrphanedAutohealNext\(\{ chainId, chainDepth, source: chainSource \}\);/,
  'Expected worker to enqueue next chain leg when full batch was claimed'
);

assert.ok(
  cronSrc.includes("action: 'orphaned_autoheal'"),
  'Expected cron to publish orphaned_autoheal continuation task'
);
assert.match(
  cronSrc,
  /if \(cand\.length >= batch && Number\(CFG\.PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX \|\| 0\) > 0\) \{[\s\S]*?chain_depth: 1,[\s\S]*?chain_source: 'cron'/,
  'Expected cron to start chain-drain only on full batch and with depth=1'
);
assert.match(
  cronSrc,
  /deduplicationId:\s*`mon:autoheal:\$\{chainId\}:1`/,
  'Expected cron first chain leg dedup mon:autoheal:${chainId}:1'
);

console.log('✅ smoke payments autoheal chain contract OK');
