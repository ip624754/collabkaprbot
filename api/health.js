import { CFG } from '../src/lib/config.js';

// Simple health endpoint (no secrets).
// Must never throw (fail-open), even if Redis is unavailable.
export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const now = new Date();
  const day = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)

  const base = {
    ok: true,
    ts: now.toISOString(),
    env: CFG.APP_ENV,
    support: {
      configured:
        (!!String(CFG.SUPPORT_CHAT_ID || '').trim()) ||
        (Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.length > 0),
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
      orphaned_autoheal_effective: !!(
        CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && CFG.PAYMENTS_FALLBACK_APPLY_ENABLED
      ),
      session_ttl_min: Number(CFG.PAYMENT_SESSION_TTL_MIN || 0),
      session_ttl_sec: Number(CFG.PAYMENT_SESSION_TTL_SEC || 0),
    },
    mon: {
      retry: { last_at: null, last_action: null, last_status: null, last_error: null },
      intro: { last_at: null, last_status: null, last_error: null, last_offer_id: null },
      accept: {
        last_at: null,
        last_status: null,
        last_error: null,
        last_app_id: null,
        last_source: null,
      },
      unlock: {
        last_at: null,
        last_status: null,
        last_error: null,
        last_ws_id: null,
        last_source: null,
      },
      official: { last_at: null, last_offer_id: null, last_source: null },
    },
  };

  const auditBase = {
    enabled: !!CFG.AUDIT_DB_ENABLED,
    throttle: {
      enabled: !!CFG.AUDIT_DB_THROTTLE_ENABLED,
      day: null,
      suppressed_today_total: null,
      suppressed_today_by_prefix: null,
    },
    buffer: {
      enabled: !!CFG.AUDIT_BUFFER_ENABLED,
      day: null,
      len: null,
      queue_len: null,
      inflight_len: null,
      inflight_age_sec: null,
      requeue_cooldown_ttl_sec: null,
      enqueued_today_total: null,
      flushed_today_total: null,
      requeued_today_total: null,
      last_flush: null,
    },
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
      const pendingOps = Number(await redis.llen(k(['ops', 'alerts', 'ops', 'd', day]))) || 0;
      base.ops.pending = { ops: pendingOps };
    } catch {
      // ignore
    }

    // Monetization breadcrumbs (Redis-only)
    async function readMany(keys) {
      const vals = await Promise.all(keys.map((kk) => redis.get(kk)));
      return vals.map((v) => (v === undefined ? null : v));
    }

    try {
      const [lastAt, lastStatus, lastError, lastAppId, lastSource] = await readMany([
        k(['mon', 'accept', 'last_at']),
        k(['mon', 'accept', 'last_status']),
        k(['mon', 'accept', 'last_error']),
        k(['mon', 'accept', 'last_app_id']),
        k(['mon', 'accept', 'last_source']),
      ]);
      base.mon.accept.last_at = lastAt || null;
      base.mon.accept.last_status = lastStatus || null;
      base.mon.accept.last_error = lastError || null;
      base.mon.accept.last_app_id = lastAppId || null;
      base.mon.accept.last_source = lastSource || null;
    } catch {
      // ignore
    }

    try {
      const [lastAt, lastStatus, lastError, lastWsId, lastSource] = await readMany([
        k(['mon', 'unlock', 'last_at']),
        k(['mon', 'unlock', 'last_status']),
        k(['mon', 'unlock', 'last_error']),
        k(['mon', 'unlock', 'last_ws_id']),
        k(['mon', 'unlock', 'last_source']),
      ]);
      base.mon.unlock.last_at = lastAt || null;
      base.mon.unlock.last_status = lastStatus || null;
      base.mon.unlock.last_error = lastError || null;
      base.mon.unlock.last_ws_id = lastWsId || null;
      base.mon.unlock.last_source = lastSource || null;
    } catch {
      // ignore
    }

    try {
      const [lastAt, lastOfferId, lastSource] = await readMany([
        k(['mon', 'official', 'last_at']),
        k(['mon', 'official', 'last_offer_id']),
        k(['mon', 'official', 'last_source']),
      ]);
      base.mon.official.last_at = lastAt || null;
      base.mon.official.last_offer_id = lastOfferId || null;
      base.mon.official.last_source = lastSource || null;
    } catch {
      // ignore
    }

    try {
      const [lastAt, lastAction, lastStatus, lastError] = await readMany([
        k(['mon', 'retry', 'last_at']),
        k(['mon', 'retry', 'last_action']),
        k(['mon', 'retry', 'last_status']),
        k(['mon', 'retry', 'last_error']),
      ]);
      base.mon.retry.last_at = lastAt || null;
      base.mon.retry.last_action = lastAction || null;
      base.mon.retry.last_status = lastStatus || null;
      base.mon.retry.last_error = lastError || null;
    } catch {
      // ignore
    }

    try {
      const [lastAt, lastStatus, lastError, lastOfferId] = await readMany([
        k(['mon', 'intro', 'last_at']),
        k(['mon', 'intro', 'last_status']),
        k(['mon', 'intro', 'last_error']),
        k(['mon', 'intro', 'last_offer_id']),
      ]);
      base.mon.intro.last_at = lastAt || null;
      base.mon.intro.last_status = lastStatus || null;
      base.mon.intro.last_error = lastError || null;
      base.mon.intro.last_offer_id = lastOfferId || null;
    } catch {
      // ignore
    }

    // Cron ticks (Redis-only)
    const [giveawaysTick, broadcastTick, igVerifyTick, auditFlushTick] = await readMany([
      k(['cron', 'giveaways_tick', 'last_run']),
      k(['cron', 'broadcast_tick', 'last_run']),
      k(['cron', 'ig_verify_tick', 'last_run']),
      k(['cron', 'audit_flush_tick', 'last_run']),
    ]);

    // Broadcast cooldown + counters (Redis-only; no DB)
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
      const [untilRaw, bidRaw, lastAt, lastReason] = await readMany([
        k(['broadcast', 'cooldown_until']),
        k(['broadcast', 'cooldown_broadcast_id']),
        k(['broadcast', 'last_429_at']),
        k(['broadcast', 'last_429_reason']),
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

      // counters written by cron tick
      const [setCnt, skipCnt, deferSetCnt, deferWaitCnt, quarSetCnt] = await readMany([
        k(['broadcast', 'cooldown_set', 'd', day]),
        k(['broadcast', 'cooldown_skip', 'd', day]),
        k(['broadcast', 'defer_set', 'd', day]),
        k(['broadcast', 'defer_wait', 'd', day]),
        k(['broadcast', 'quarantine_set', 'd', day]),
      ]);

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
          broadcast.retry_after_sec = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
        } else {
          broadcast.retry_after_sec = 0;
        }
      }
    } catch {
      // ignore
    }

    // Audit throttle metrics (Redis-only; no DB)
    let audit = { ...auditBase };
    if (CFG.AUDIT_DB_ENABLED && CFG.AUDIT_DB_THROTTLE_ENABLED) {
      const prefixes = Array.isArray(CFG.AUDIT_DB_THROTTLE_PREFIXES) ? CFG.AUDIT_DB_THROTTLE_PREFIXES : [];

      try {
        const totalKey = k(['audit', 'throttle', 'suppressed', day]);
        const totalRaw = await redis.get(totalKey);
        const total = Number(totalRaw) || 0;

        const byPrefix = {};
        await Promise.all(
          prefixes
            .filter(Boolean)
            .map(async (p) => {
              const kk = k(['audit', 'throttle', 'suppressed', 'p', sanitizePrefix(p), day]);
              const v = Number(await redis.get(kk)) || 0;
              byPrefix[p] = v;
            })
        );

        audit.throttle = {
          ...audit.throttle,
          day,
          suppressed_today_total: total,
          suppressed_today_by_prefix: byPrefix,
        };
      } catch {
        // ignore
      }
    }

    // Audit buffer metrics (Redis-only; no DB)
    if (CFG.AUDIT_BUFFER_ENABLED) {
      try {
        const nowS = Math.floor(Date.now() / 1000);
        const [qLenRaw, iLenRaw, sinceRaw, cooldownTtlRaw, enqRaw, flRaw, rqRaw, lastFlush] = await Promise.all([
          redis.llen(k(['audit', 'buffer', 'ws'])),
          redis.llen(k(['audit', 'buffer', 'ws', 'inflight'])),
          redis.get(k(['audit', 'buffer', 'ws', 'inflight_since'])),
          redis.ttl(k(['audit', 'buffer', 'ws', 'requeue_cooldown'])),
          redis.get(k(['audit', 'buffer', 'enqueued', day])),
          redis.get(k(['audit', 'buffer', 'flushed', day])),
          redis.get(k(['audit', 'buffer', 'requeued', day])),
          redis.get(k(['audit', 'buffer', 'last_flush'])),
        ]);

        const queue_len = Number(qLenRaw) || 0;
        const inflight_len = Number(iLenRaw) || 0;

        let inflight_age_sec = null;
        const since = Number(sinceRaw) || 0;
        if (inflight_len > 0 && since > 0) inflight_age_sec = Math.max(0, nowS - since);

        audit.buffer = {
          ...audit.buffer,
          day,
          len: queue_len + inflight_len,
          queue_len,
          inflight_len,
          inflight_age_sec,
          requeue_cooldown_ttl_sec: (Number(cooldownTtlRaw) > 0 ? Number(cooldownTtlRaw) : null),
          enqueued_today_total: Number(enqRaw) || 0,
          flushed_today_total: Number(flRaw) || 0,
          requeued_today_total: Number(rqRaw) || 0,
          last_flush: lastFlush || null,
        };
      } catch {
        // ignore
      }
    }

    // Acquisition counters (Redis-only)
    let ref = { day: null, today: { ig: 0, tg: 0 }, total: { ig: 0, tg: 0 } };
    try {
      const [igT, tgT, igD, tgD] = await readMany([
        k(['ref', 'src', 'ig', 'total']),
        k(['ref', 'src', 'tg', 'total']),
        k(['ref', 'src', 'ig', 'd', day]),
        k(['ref', 'src', 'tg', 'd', day]),
      ]);
      ref = {
        day,
        today: { ig: Number(igD) || 0, tg: Number(tgD) || 0 },
        total: { ig: Number(igT) || 0, tg: Number(tgT) || 0 },
      };
    } catch {
      // ignore
    }

    // Acquisition role breakdown (Redis-only): source x role (brand/creator).
    try {
      const srcs = ['ig', 'tg', 'direct'];
      const roles = ['brand', 'creator'];

      const keys = [];
      for (const src of srcs) {
        for (const role of roles) {
          keys.push(k(['ref', 'role', src, role, 'total']));
          keys.push(k(['ref', 'role', src, role, 'd', day]));
        }
      }

      const vals = await Promise.all(keys.map((kk) => redis.get(kk)));
      const byRole = { day, today: {}, total: {} };
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
  } catch {
    res.status(200).json({
      ...base,
      cron: { enabled: true, error: 'redis_unavailable' },
      broadcast: { cooldown_until: null, retry_after_sec: null, broadcast_id: null },
      ref: { day: null, today: { ig: 0, tg: 0 }, total: { ig: 0, tg: 0 } },
      audit: auditBase,
    });
  }
}
