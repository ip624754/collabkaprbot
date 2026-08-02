import { redis, k, incrWithExpireOnFirst } from '../../lib/redis.js';

function broadcastQuarantineCountKey(broadcastId, userId) {
  return k(['broadcast', String(broadcastId), 'qcnt', String(userId)]);
}

export async function resetBroadcastQuarantineCount(broadcastId, userId) {
  try {
    await redis.del(broadcastQuarantineCountKey(broadcastId, userId));
  } catch {}
}

export async function bumpBroadcastQuarantineCount(broadcastId, userId) {
  try {
    const key = broadcastQuarantineCountKey(broadcastId, userId);
    const v = await incrWithExpireOnFirst(key, 24 * 60 * 60);
    return Number(v) || 0;
  } catch {
    return 0;
  }
}


function broadcast429DistinctUsersKey(broadcastId) {
  return k(['broadcast', String(broadcastId), '429users']);
}

function getGlobal429WindowSec() {
  const v = Number(process.env.BROADCAST_GLOBAL_429_WINDOW_SEC || 60) || 60;
  return Math.max(10, Math.min(600, v));
}

export function getGlobal429Threshold() {
  const v = Number(process.env.BROADCAST_GLOBAL_429_THRESHOLD || 6) || 6;
  return Math.max(2, Math.min(50, v));
}

export async function bumpBroadcast429DistinctUsers(broadcastId, userId) {
  try {
    const key = broadcast429DistinctUsersKey(broadcastId);
    const ttlSec = getGlobal429WindowSec();
    const lua = [
      "redis.call('SADD', KEYS[1], ARGV[1])",
      "redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))",
      "return redis.call('SCARD', KEYS[1])",
    ].join('; ');
    const n = await redis.eval(lua, [key], [String(userId), String(ttlSec)]);
    return Number(n) || 0;
  } catch {
    return 0;
  }
}

export function getQuarantineThreshold() {
  const v = Number(process.env.BROADCAST_QUARANTINE_THRESHOLD || 3) || 3;
  return Math.max(2, Math.min(10, v));
}

export function getQuarantineSec() {
  const v = Number(process.env.BROADCAST_QUARANTINE_SEC || 1200) || 1200;
  return Math.max(60, Math.min(6 * 3600, v));
}
