import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('admin.html');
assert.match(html, /\/styles\/admin-web\.css\?v=20260403-step535k/, 'admin shell must cache-bust admin css');
assert.match(html, /\/scripts\/admin-web\.js\?v=20260403-step535k/, 'admin shell must cache-bust admin web js');

console.log('✅ smoke admin-web asset cache-bust contract OK');
