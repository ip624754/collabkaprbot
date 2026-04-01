import fs from 'node:fs';

const files = [
  'api/admin-web-auth.js',
  'api/admin-web-read.js',
  'api/admin-web-write.js',
  'api/admin-web/auth/decision.js',
  'api/admin-web/auth/status.js',
  'api/admin-web/user.js',
  'api/admin-web/users.js',
  'api/health.js',
];

let bad = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  if (/req\.query/.test(s) || /url\.parse\(/.test(s)) bad.push(f);
}

if (bad.length) {
  console.error('WHATWG URL contract failed. Legacy query parsing found in:');
  for (const f of bad) console.error('-', f);
  process.exit(1);
}

console.log('OK: admin-web/health handlers avoid req.query and url.parse');
