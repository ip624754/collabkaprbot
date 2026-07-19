import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('admin.html');
const cssMatch = html.match(/\/styles\/admin-web\.css\?v=([A-Za-z0-9._-]+)/);
const jsMatch = html.match(/\/scripts\/admin-web\.js\?v=([A-Za-z0-9._-]+)/);

assert.ok(cssMatch?.[1], 'admin shell must cache-bust admin css with a non-empty version token');
assert.ok(jsMatch?.[1], 'admin shell must cache-bust admin web js with a non-empty version token');
assert.equal(cssMatch[1], jsMatch[1], 'admin css and js must use the same cache-bust version token');

console.log(`✅ smoke admin-web asset cache-bust contract OK (${cssMatch[1]})`);
