import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PATHS = Object.freeze({
  monetizationRetry: 'src/jobs/monetizationRetry/worker.js',
  officialPublishDeliver: 'src/jobs/officialPublish/deliverWorker.js',
  officialPublishVerify: 'src/jobs/officialPublish/verifyWorker.js',
  qstashPing: 'src/jobs/qstashPing/worker.js',
});

export function getStep590G3WorkerPaths() {
  return { ...PATHS };
}

export function readStep590G3WorkerSource(name, root = DEFAULT_ROOT) {
  const rel = PATHS[name];
  if (!rel) throw new Error(`unknown_step590g3_worker:${name}`);
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

export function readMonetizationRetryWorkerSource(root = DEFAULT_ROOT) {
  return readStep590G3WorkerSource('monetizationRetry', root);
}

export function readOfficialPublishDeliverWorkerSource(root = DEFAULT_ROOT) {
  return readStep590G3WorkerSource('officialPublishDeliver', root);
}

export function readOfficialPublishVerifyWorkerSource(root = DEFAULT_ROOT) {
  return readStep590G3WorkerSource('officialPublishVerify', root);
}

export function readQStashPingWorkerSource(root = DEFAULT_ROOT) {
  return readStep590G3WorkerSource('qstashPing', root);
}
