import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMPLEMENTATION_FILES = [
  'src/bot/jobs/cronRuntime.js',
  'src/bot/jobs/giveawayJob.js',
  'src/bot/jobs/broadcastJob.js',
  'src/bot/jobs/instagramVerificationJob.js',
  'src/bot/jobs/auditFlushJob.js',
];

export function readCronImplementationSource(root = DEFAULT_ROOT) {
  return IMPLEMENTATION_FILES
    .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'))
    .join('\n');
}

export function getCronImplementationFiles() {
  return [...IMPLEMENTATION_FILES];
}
