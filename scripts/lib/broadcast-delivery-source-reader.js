import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMPLEMENTATION_FILES = [
  'src/jobs/broadcastDelivery/payload.js',
  'src/jobs/broadcastDelivery/cooldown.js',
  'src/jobs/broadcastDelivery/dbOverload.js',
  'src/jobs/broadcastDelivery/quarantine.js',
  'src/jobs/broadcastDelivery/hardSkip.js',
  'src/jobs/broadcastDelivery/receipt.js',
  'src/jobs/broadcastDelivery/delivery.js',
];

export function readBroadcastDeliveryImplementationSource(root = DEFAULT_ROOT) {
  return IMPLEMENTATION_FILES
    .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'))
    .join('\n');
}

export function readBroadcastDeliveryOrchestrationSource(root = DEFAULT_ROOT) {
  return fs.readFileSync(path.join(root, 'src/jobs/broadcastDelivery/delivery.js'), 'utf8');
}

export function getBroadcastDeliveryImplementationFiles() {
  return [...IMPLEMENTATION_FILES];
}
