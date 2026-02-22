import { CFG } from '../src/lib/config.js';

// Simple health endpoint (no secrets).
// Optional: show last cron ticks from Redis (no DB).
export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const base = {
    ok: true,
    ts: new Date().toISOString(),
    env: CFG.APP_ENV,
    support: {
      configured: !!String(CFG.SUPPORT_CHAT_ID || '').trim() || (Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.length > 0),
      chat_configured: !!String(CFG.SUPPORT_CHAT_ID || '').trim(),
    },
    ops: {
      alert_summary_min: Number(CFG.OPS_ALERT_SUMMARY_MIN || 0),
      alert_buffer_max: Number(CFG.OPS_ALERT_BUFFER_MAX || 0),
      silent: !!CFG.OPS_ALERT_SILENT,
      pending: null,
    },
    payments: {
      accept_default: !!CFG.PAYMENTS_ACCEPT_DEFAULT,
      auto_apply_default: !!CFG.PAYMENTS_AUTO_APPLY_DEFAULT,
      match_feat_auto_apply_enabled: !!CFG.MATCH_FEAT_AUTO_APPLY_ENABLED,
      fallback_apply_enabled: !!CFG.PAYMENTS_FALLBACK_APPLY_ENABLED,
      orphaned_autoheal_enabled: !!CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED,
      orphaned_autoheal_batch: Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_BATCH || 0),
      session_ttl_min: Number(CFG.PAYMENT_SESSION_TTL_MIN || 0),
      session_ttl_sec: Number(CFG.PAYMENT_SESSION_TTL_SEC || 0)
    }
  };

  const auditBase = {
    enabled: !!CFG.AUDIT_DB_ENABLED,
    throttle: {
      enabled: !!CFG.AUDIT_DB_THROTTLE_ENABLED,
      suppressed_today_total: null,
      suppressed_today_by_prefix: null,
    }
  };

  // Redis is optional for /api/health (so it stays useful in minimal envs).
  if (!CFG.UPSTASH_REDIS_REST_URL || !CFG.UPSTASH_REDIS_REST_TOKEN) {
    res.status(200).json({ ...base, cron: { enabled: false }, audit: auditBase });
    return;
  }

  function sanitizePrefix(p) {
    return String(p || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  }

  try {
    const { redis, k } = await import('../src/lib/redis.js');

    // Ops alert buffer status (Redis-only).
    try {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const pendingOps = Number(await redis.llen(k(['ops', 'alerts', 'ops', 'd', day]))) || 0;
      base.ops.pending = { ops: pendingOps };
    } catch {
      // ignore
    }

    const [giveawaysTick, broadcastTick] = await Promise.all([
      redis.get(k(['cron', 'giveaways_tick', 'last_run'])),
      redis.get(k(['cron', 'broadcast_tick', 'last_run'])),
    ]);

    // Optional: show current broadcast 429 cooldown (Redis-only; no DB).
    // Useful even if the last tick didn't run in "cooldown" mode yet.
    let broadcast = { cooldown_until: null, retry_after_sec: null, broadcast_id: null };
    try {
      const bid = Number(broadcastTick?.broadcast_id || 0);
      if (bid > 0) {
        const raw = await redis.get(k(['broadcast', bid, 'cooldown_until']));
        const untilMs = Number(raw) || 0;
        broadcast.broadcast_id = bid;
        if (untilMs > 0) {
          broadcast.cooldown_until = new Date(untilMs).toISOString();
          if (untilMs > Date.now()) {
            broadcast.retry_after_sec = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
          } else {
            broadcast.retry_after_sec = 0;
          }
        }
      }
    } catch {
      // ignore
    }

    // Optional audit throttle metrics (Redis-only; no DB)
    let audit = auditBase;
    if (CFG.AUDIT_DB_ENABLED && CFG.AUDIT_DB_THROTTLE_ENABLED) {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)
      const prefixes = Array.isArray(CFG.AUDIT_DB_THROTTLE_PREFIXES) ? CFG.AUDIT_DB_THROTTLE_PREFIXES : [];

      const totalKey = k(['audit', 'throttle', 'suppressed', day]);
      const totalRaw = await redis.get(totalKey);
      const total = Number(totalRaw) || 0;

      const byPrefix = {};
      await Promise.all(
        prefixes
          .filter(Boolean)
          .map(async (p) => {
            const key = k(['audit', 'throttle', 'suppressed', 'p', sanitizePrefix(p), day]);
            const v = Number(await redis.get(key)) || 0;
            byPrefix[p] = v;
          })
      );

      audit = {
        ...auditBase,
        throttle: {
          ...auditBase.throttle,
          day,
          suppressed_today_total: total,
          suppressed_today_by_prefix: byPrefix,
        }
      };
    }

    // Lightweight acquisition counters (Redis-only; no DB)
    let ref = { day: null, today: { ig: 0, tg: 0 }, total: { ig: 0, tg: 0 } };
    try {
      const day2 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const [igT, tgT, igD, tgD] = await Promise.all([
        redis.get(k(['ref', 'src', 'ig', 'total'])),
        redis.get(k(['ref', 'src', 'tg', 'total'])),
        redis.get(k(['ref', 'src', 'ig', 'd', day2])),
        redis.get(k(['ref', 'src', 'tg', 'd', day2])),
      ]);
      ref = {
        day: day2,
        today: { ig: Number(igD) || 0, tg: Number(tgD) || 0 },
        total: { ig: Number(igT) || 0, tg: Number(tgT) || 0 },
      };
    } catch {
      // ignore
    }
    // Acquisition role breakdown (Redis-only): source x role (brand/creator).
    // Counts are incremented when user selects a role for the first time (ui_mode was not set).
    try {
      const day3 = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const srcs = ["ig", "tg", "direct"];
      const roles = ["brand", "creator"];

      const keys = [];
      for (const src of srcs) {
        for (const role of roles) {
          keys.push(k(["ref", "role", src, role, "total"]));
          keys.push(k(["ref", "role", src, role, "d", day3]));
        }
      }

      const vals = await Promise.all(keys.map((kk) => redis.get(kk)));
      const byRole = { day: day3, today: {}, total: {} };
      let i = 0;
      for (const src of srcs) {
        byRole.total[src] = {};
        byRole.today[src] = {};
        for (const role of roles) {
          const totalV = vals[i++];
          const dayV = vals[i++];
          byRole.total[src][role] = Number(totalV) || 0;
          byRole.today[src][role] = Number(dayV) || 0;
        }
      }

      ref = { ...ref, by_role: byRole };
    } catch {
      // ignore
    }


    res.status(200).json({
      ...base,
      cron: {
        enabled: true,
        giveaways_tick: giveawaysTick || null,
        broadcast_tick: broadcastTick || null,
      },
      broadcast,
      ref,
      audit,
    });
  } catch (_e) {
    res.status(200).json({
      ...base,
      cron: { enabled: true, error: 'redis_unavailable' },
      broadcast: { cooldown_until: null, retry_after_sec: null, broadcast_id: null },
      ref: { day: null, today: { ig: 0, tg: 0 }, total: { ig: 0, tg: 0 } },
      audit: auditBase,
    });
  }
}
