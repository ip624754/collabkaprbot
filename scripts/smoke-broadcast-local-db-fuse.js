import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const target = path.join(ROOT, 'api', 'qstash', 'broadcast-deliver.js');

const src = fs.readFileSync(target, 'utf8');

function findIndex(needle) {
  return src.indexOf(needle);
}

function assertHas(needle, msg) {
  assert.ok(findIndex(needle) >= 0, msg);
}

assertHas('let localDbDegradedUntilMs = 0;', 'Expected module-level local DB fuse state');
assertHas('function getLocalDbOverloadFuseTtlMs()', 'Expected local fuse TTL helper');
assertHas('function getLocalDbOverloadFuseUntilMs', 'Expected local fuse getter helper');
assertHas('function armLocalDbOverloadFuse', 'Expected local fuse arm helper');
assertHas('armLocalDbOverloadFuse();', 'Expected local fuse arming on Redis fuse write failure');
assertHas("where: 'local_fuse_precheck'", 'Expected local fuse precheck response marker');
assertHas('local_fuse: Boolean(localFuse)', 'Expected response payload to flag local fuse');

const idxLocalPrecheck = findIndex('const localFuseUntilMs = getLocalDbOverloadFuseUntilMs();');
const idxRedisPrecheck = findIndex('const v = await redis.get(dbOverloadFuseKey());');
const idxDbTouch = findIndex('bcRow = await db.getBroadcast(broadcastId);');
assert.ok(idxLocalPrecheck >= 0, 'Expected local fuse precheck in handler');
assert.ok(idxRedisPrecheck >= 0, 'Expected Redis fuse precheck in handler');
assert.ok(idxDbTouch >= 0, 'Expected DB getBroadcast touch in handler');
assert.ok(idxLocalPrecheck < idxRedisPrecheck, 'Expected local fuse precheck before Redis fuse read');
assert.ok(idxLocalPrecheck < idxDbTouch, 'Expected local fuse precheck before DB touch');

const respondBlockStart = findIndex('async function respondDbOverload({');
const respondBlockEnd = findIndex('async function respondDbOverloadFuse({');
assert.ok(respondBlockStart >= 0 && respondBlockEnd > respondBlockStart, 'Expected respondDbOverload block');
const respondBlock = src.slice(respondBlockStart, respondBlockEnd);
assert.match(
  respondBlock,
  /await redis\.set\(dbOverloadFuseKey\([\s\S]*?\}\s*catch\s*\{\s*armLocalDbOverloadFuse\(\);\s*\}/,
  'Expected Redis fuse write failure to arm local fuse'
);

console.log('✅ smoke broadcast local DB fuse contract OK');
