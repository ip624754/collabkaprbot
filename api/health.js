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
      orphaned_autoheal_min_age_sec: Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 0),
      orphaned_autoheal_effective: !!(CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && CFG.PAYMENTS_FALLBACK_APPLY_ENABLED),
      session_ttl_min: Number(CFG.PAYMENT_SESSION_TTL_MIN || 0),
      session_ttl_sec: Number(CFG.PAYMENT_SESSION_TTL_SEC || 0)
    },
    // Monetization retry breadcrumbs (Redis-only)
    // Filled by /api/qstash/monetization-retry worker.
    mon: {
      retry: {
        last_at: null,
        last_action: null,
        last_status: null,
        last_error: null,
      },
      // Intro breadcrumbs (Redis-only)
      // Filled by click handler (a:bx_msg) and/or /api/qstash/monetization-retry worker.
      intro: {
        last_at: null,
        last_status: null,
        last_error: null,
        last_offer_id: null,
      },
      // Accept (✅ Принять) breadcrumbs (Redis-only)
      accept: {
        last_at: null,
        last_status: null,
        last_error: null,
        last_app_id: null,
        last_source: null,
      },
      // Unlock (🔓 Контакты) breadcrumbs (Redis-only)
      unlock: {
        last_at: null,
        last_status: null,
        last_error: null,
        last_ws_id: null,
        last_source: null,
      },
      // Official publish self-heal breadcrumbs (Redis-only)
      official: {
        last_at: null,
        last_offer_id: null,
        last_source: null,
      }
    }
  };

  const auditBase = {
    enabled: !!CFG.AUDIT_DB_ENABLED,
    throttle: {
      enabled: !!CFG.AUDIT_DB_THROTTLE_ENABLED,
      suppressed_today_total: null,
      suppressed_today_by_prefix: null,
    },
    buffer: {
      enabled: !!CFG.AUDIT_BUFFER_ENABLED,
      len: null,
      day: null,
      enqueued_today_total: null,
      flushed_today_total: null,
      last_flush: null,
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

    // Accept breadcrumbs (Redis-only)
    try {
      const [lastAt, lastStatus, lastError, lastAppId, lastSource] = await Promise.all([
        redis.get(k(['mon', 'accept', 'last_at'])),
        redis.get(k(['mon', 'accept', 'last_status'])),
        redis.get(k(['mon', 'accept', 'last_error'])),
        redis.get(k(['mon', 'accept', 'last_app_id'])),
        redis.get(k(['mon', 'accept', 'last_source'])),
      ]);
      base.mon.accept.last_at = lastAt || null;
      base.mon.accept.last_status = lastStatus || null;
      base.mon.accept.last_error = lastError || null;
      base.mon.accept.last_app_id = lastAppId || null;
      base.mon.accept.last_source = lastSource || null;
    } catch {
      // ignore
    }

    // Unlock breadcrumbs (Redis-only)
    try {
      const [lastAt, lastStatus, lastError, lastWsId, lastSource] = await Promise.all([
        redis.get(k(['mon', 'unlock', 'last_at'])),
        redis.get(k(['mon', 'unlock', 'last_status'])),
        redis.get(k(['mon', 'unlock', 'last_error'])),
        redis.get(k(['mon', 'unlock', 'last_ws_id'])),
        redis.get(k(['mon', 'unlock', 'last_source'])),
      ]);
      base.mon.unlock.last_at = lastAt || null;
      base.mon.unlock.last_status = lastStatus || null;
      base.mon.unlock.last_error = lastError || null;
      base.mon.unlock.last_ws_id = lastWsId || null;
      base.mon.unlock.last_source = lastSource || null;
    } catch {
      // ignore
    }

    // Official publish breadcrumbs (Redis-only)
    try {
      const [lastAt, lastOfferId, lastSource] = await Promise.all([
        redis.get(k(['mon', 'official', 'last_at'])),
        redis.get(k(['mon', 'official', 'last_offer_id'])),
        redis.get(k(['mon', 'official', 'last_source'])),
      ]);
      base.mon.official.last_at = lastAt || null;
      base.mon.official.last_offer_id = lastOfferId || null;
      base.mon.official.last_source = lastSource || null;
    } catch {
      // ignore
    }

    // Monetization retry breadcrumbs (Redis-only)
    try {
      const [lastAt, lastAction, lastStatus, lastError] = await Promise.all([
        redis.get(k(['mon', 'retry', 'last_at'])),
        redis.get(k(['mon', 'retry', 'last_action'])),
        redis.get(k(['mon', 'retry', 'last_status'])),
        redis.get(k(['mon', 'retry', 'last_error'])),
      ]);
      base.mon.retry.last_at = lastAt || null;
      base.mon.retry.last_action = lastAction || null;
      base.mon.retry.last_status = lastStatus || null;
      base.mon.retry.last_error = lastError || null;
    } catch {
      // ignore
    }

    // Intro breadcrumbs (Redis-only)
    try {
      const [lastAt, lastStatus, lastError, lastOfferId] = await Promise.all([
        redis.get(k(['mon', 'intro', 'last_at'])),
        redis.get(k(['mon', 'intro', 'last_status'])),
        redis.get(k(['mon', 'intro', 'last_error'])),
        redis.get(k(['mon', 'intro', 'last_offer_id'])),
      ]);
      base.mon.intro.last_at = lastAt || null;
      base.mon.intro.last_status = lastStatus || null;
      base.mon.intro.last_error = lastError || null;
      base.mon.intro.last_offer_id = lastOfferId || null;
    } catch {
      // ignore
    }

    const [giveawaysTick, broadcastTick, igVerifyTick, auditFlushTick] = await Promise.all([
      redis.get(k(['cron', 'giveaways_tick', 'last_run'])),
      redis.get(k(['cron', 'broadcast_tick', 'last_run'])),
      redis.get(k(['cron', 'ig_verify_tick', 'last_run'])),,
      redis.get(k(['cron', 'audit_flush_tick', 'last_run'])),
    ]);

    // Optional: show current broadcast 429 cooldown + counters (Redis-only; no DB).
    // Global keys exist even when we early-exit before DB polling.
    let broadcast = {
      cooldown_until: null,
      retry_after_sec: null,
      broadcast_id: null,
      cooldown_source: null,
      last_429_at: null,
      last_429_reason: null,
      qstash_last_delivery_at: null,
      counters: null,
    };
    try {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const [untilRaw, bidRaw, lastAt, lastReason, setCnt, skipCnt, deferSetCnt, deferWaitCnt, quarSetCnt] = await Promise.all([
        redis.get(k(['broadcast', 'cooldown_until'])),
        redis.get(k(['broadcast', 'cooldown_broadcast_id'])),
        redis.get(k(['broadcast', 'last_429_at'])),
        redis.get(k(['broadcast', 'last_429_reason'])),
        redis.get(k(['broadcast', 'cooldown_set', 'd', day])),
        redis.get(k(['broadcast', 'cooldown_skip', 'd', day])),
        redis.get(k(['broadcast', 'defer_set', 'd', day])),
        redis.get(k(['broadcast', 'defer_wait', 'd', day])),
        redis.get(k(['broadcast', 'quarantine_set', 'd', day])),
      ]);

      try {
        broadcast.qstash_last_delivery_at = (await redis.get(k(['qstash', 'broadcast_deliver', 'last_at']))) || null;
      } catch {
        broadcast.qstash_last_delivery_at = null;
      }

      const untilMs = Number(untilRaw) || 0;
      const bid = Number(bidRaw) || 0;

      broadcast.broadcast_id = bid > 0 ? bid : null;
      broadcast.last_429_at = lastAt || null;
      broadcast.last_429_reason = lastReason || null;
      broadcast.counters = {
        day,
        cooldown_set: Number(setCnt) || 0,
        cooldown_skip: Number(skipCnt) || 0,
        defer_set: Number(deferSetCnt) || 0,
        defer_wait: Number(deferWaitCnt) || 0,
        quarantine_set: Number(quarSetCnt) || 0,
      };

      if (untilMs > 0) {
        broadcast.cooldown_source = 'redis_global';
        broadcast.cooldown_until = new Date(untilMs).toISOString();
        if (untilMs > Date.now()) {
          broadcast.retry_after_sec = Math.max(
            1,
            Math.ceil((untilMs - Date.now()) / 1000)
          );
        } else {
          broadcast.retry_after_sec = 0;
        }
      } else {
        // Fallback: per-broadcast key (legacy; useful if global key expired).
        const bid2 = Number(broadcastTick?.broadcast_id || 0);
        if (bid2 > 0) {
          const raw = await redis.get(k(['broadcast', bid2, 'cooldown_until']));
          const untilMs2 = Number(raw) || 0;
          broadcast.broadcast_id = bid2;
          if (untilMs2 > 0) {
            broadcast.cooldown_source = 'redis_per_broadcast';
            broadcast.cooldown_until = new Date(untilMs2).toISOString();
            if (untilMs2 > Date.now()) {
              broadcast.retry_after_sec = Math.max(
                1,
                Math.ceil((untilMs2 - Date.now()) / 1000)
              );
            } else {
              broadcast.retry_after_sec = 0;
            }
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
    // Optional audit buffer metrics (Redis-only; no DB)
    if (CFG.AUDIT_BUFFER_ENABLED) {
      try {
        const dayB = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)
        const [lenRaw, enqRaw, flRaw, lastFlush] = await Promise.all([
          redis.llen(k(['audit', 'buffer', 'ws'])),
          redis.get(k(['audit', 'buffer', 'enqueued', dayB])),
          redis.get(k(['audit', 'buffer', 'flushed', dayB])),
          redis.get(k(['audit', 'buffer', 'last_flush'])),
        ]);

        audit = {
          ...audit,
          buffer: {
            ...audit.buffer,
            day: dayB,
            len: Number(lenRaw) || 0,
            enqueued_today_total: Number(enqRaw) || 0,
            flushed_today_total: Number(flRaw) || 0,
            last_flush: lastFlush || null,
          }
        };
      } catch {
        // ignore
      }
    }


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
        ig_verify_tick: igVerifyTick || null,
              audit_flush_tick: auditFlushTick || null,
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
