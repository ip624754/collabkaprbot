import assert from 'node:assert/strict';
import { readBroadcastDeliveryImplementationSource, readBroadcastDeliveryOrchestrationSource } from './lib/broadcast-delivery-source-reader.js';

const src = readBroadcastDeliveryImplementationSource();
const orchestration = readBroadcastDeliveryOrchestrationSource();

function findIndex(needle) {
  return src.indexOf(needle);
}
function findOrchestrationIndex(needle) {
  return orchestration.indexOf(needle);
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

const idxLocalPrecheck = findOrchestrationIndex('const localFuseUntilMs = getLocalDbOverloadFuseUntilMs();');
const idxRedisPrecheck = findOrchestrationIndex('const v = await redis.get(dbOverloadFuseKey());');
const idxDbTouch = findOrchestrationIndex('bcRow = await db.getBroadcast(broadcastId);');
assert.ok(idxLocalPrecheck >= 0, 'Expected local fuse precheck in handler');
assert.ok(idxRedisPrecheck >= 0, 'Expected Redis fuse precheck in handler');
assert.ok(idxDbTouch >= 0, 'Expected DB getBroadcast touch in handler');
assert.ok(idxLocalPrecheck < idxRedisPrecheck, 'Expected local fuse precheck before Redis fuse read');
assert.ok(idxLocalPrecheck < idxDbTouch, 'Expected local fuse precheck before DB touch');

const respondBlockStart = findIndex('export async function respondDbOverload({');
const respondBlockEnd = findIndex('export async function respondDbOverloadFuse({');
assert.ok(respondBlockStart >= 0 && respondBlockEnd > respondBlockStart, 'Expected respondDbOverload block');
const respondBlock = src.slice(respondBlockStart, respondBlockEnd);
assert.match(
  respondBlock,
  /await redis\.set\(dbOverloadFuseKey\([\s\S]*?\}\s*catch\s*\{\s*armLocalDbOverloadFuse\(\);\s*\}/,
  'Expected Redis fuse write failure to arm local fuse'
);

console.log('✅ smoke broadcast local DB fuse contract OK');
