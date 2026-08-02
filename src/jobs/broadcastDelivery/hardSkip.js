import { k, incrWithExpireOnFirst } from '../../lib/redis.js';
import * as db from '../../db/queries.js';
import {
  getBroadcastHardSkipReason,
  logBroadcastHardSkipHit,
} from '../../bot/cron.js';
import { isDbOverloadError, respondDbOverload } from './dbOverload.js';
import { resetBroadcastQuarantineCount } from './quarantine.js';

export async function handleBroadcastHardSkip({ res, broadcastId, userId, tgId, attempt }) {
  const hardSkip = await getBroadcastHardSkipReason(tgId);
  if (!hardSkip) return false;

  try {
    await db.logBroadcastBlocked(broadcastId, userId, `hard_skip:${hardSkip}`);
    await resetBroadcastQuarantineCount(broadcastId, userId);
  } catch (e) {
    if (isDbOverloadError(e)) {
      await respondDbOverload({ res, broadcastId, userId, tgId, attempt, where: 'db_write', err: e });
      return true;
    }
    // DB down: fail-closed
    res.status(500).json({ ok: false, error: 'db_unavailable' });
    return true;
  }

  // Best-effort: counter for /api/health (bounded).
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await incrWithExpireOnFirst(k(['broadcast', 'hard_skip', 'hit', 'd', day]), 14 * 24 * 60 * 60);
  } catch {}

  // Best-effort: record HIT for admin report (Redis-only).
  try { await logBroadcastHardSkipHit(tgId, hardSkip, { broadcastId, userId, via: 'qstash' }); } catch {}

  res.status(200).json({ ok: true, skipped: true, reason: 'hard_skip' });
  return true;
}
