import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

export const ADMIN_WEB_SOURCE_FILES = Object.freeze([
  'scripts/admin-web.js',
  'scripts/admin-web/overview.js',
  'scripts/admin-web/users.js',
  'scripts/admin-web/payments.js',
  'scripts/admin-web/comms.js',
  'scripts/admin-web/founder.js',
  'scripts/admin-web/runtime.js',
]);

export function readAdminWebSource() {
  return ADMIN_WEB_SOURCE_FILES
    .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
    .join('\n');
}
