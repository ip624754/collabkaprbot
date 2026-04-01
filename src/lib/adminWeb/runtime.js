import { CFG } from '../config.js';
import { pingDb } from '../../db/pool.js';
import { redis, k } from '../redis.js';

export async function getRuntimeSummary() {
  const out = {
    env: String(CFG.APP_ENV || 'dev'),
    publicBaseUrl: !!String(CFG.PUBLIC_BASE_URL || '').trim(),
    botConfigured: !!String(CFG.BOT_TOKEN || '').trim() && !!String(CFG.BOT_USERNAME || '').trim(),
    superAdminsConfigured: Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.length > 0,
    adminWebEnabled: !!CFG.ADMIN_WEB_ENABLED,
    adminWebConfigured: !!String(CFG.ADMIN_WEB_SECRET || '').trim() && !!String(CFG.ADMIN_WEB_SESSION_SECRET || '').trim(),
    db: { ok: false },
    redis: { configured: !!(CFG.UPSTASH_REDIS_REST_URL && CFG.UPSTASH_REDIS_REST_TOKEN), ok: false },
    qstash: {
      configured: !!String(CFG.QSTASH_TOKEN || CFG.QSTASH_CURRENT_SIGNING_KEY || '').trim(),
    },
    notes: [],
    ts: new Date().toISOString(),
  };

  try {
    out.db.ok = await pingDb();
  } catch {
    out.db.ok = false;
  }

  if (out.redis.configured) {
    try {
      const probeKey = k(['admin_web_runtime_probe']);
      await redis.set(probeKey, '1', { ex: 30 });
      const value = await redis.get(probeKey);
      out.redis.ok = String(value || '') === '1';
    } catch {
      out.redis.ok = false;
    }
  }

  if (!out.publicBaseUrl) out.notes.push('PUBLIC_BASE_URL not configured');
  if (!out.adminWebConfigured) out.notes.push('ADMIN_WEB secret/session env not configured');
  if (!out.db.ok) out.notes.push('Database ping failed');
  if (out.redis.configured && !out.redis.ok) out.notes.push('Redis probe failed');

  return out;
}
