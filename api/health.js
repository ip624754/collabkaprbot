import { CFG } from '../src/lib/config.js'; 

function resolveHealthTier(req) {
  try {
    const direct = req?.query && typeof req.query === 'object'
      ? (req.query.tier ?? req.query.view ?? (req.query.fast ? 'fast' : null))
      : null;
    const rawDirect = String(direct || '').trim().toLowerCase();
    if (rawDirect === 'fast' || rawDirect === 'ops' || rawDirect === 'operator') return 'fast';
    if (rawDirect === 'full') return 'full';
  } catch {
    // ignore
  }

  try {
    if (typeof req?.url === 'string' && req.url) {
      const u = new URL(req.url, 'http://localhost');
      const raw = String(
        u.searchParams.get('tier')
          || u.searchParams.get('view')
          || (u.searchParams.has('fast') ? 'fast' : '')
      ).trim().toLowerCase();
      if (raw === 'fast' || raw === 'ops' || raw === 'operator') return 'fast';
      if (raw === 'full') return 'full';
    }
  } catch {
    // ignore
  }

  return 'full';
}

function attachHealthTier(out, tier) {
  const next = { ...out, health_tier: tier === 'fast' ? 'fast' : 'full' };
  if (tier === 'fast') {
    next.operator_fast_path = {
      full_tier_available: true,
      included_sections: ['redis', 'support', 'ops', 'payments', 'system_status', 'no_go_reasons'],
      omitted_sections: ['cron', 'broadcast', 'qstash', 'mon', 'ref', 'audit'],
      note: 'Fast operator summary. Open /api/health without tier=fast for full drill-down.',
    };
  }
  return next;
}

function buildFastHealthOut(base) {
  return attachHealthTier({
    ok: base.ok,
    ts: base.ts,
    env: base.env,
    redis: base.redis,
    support: base.support,
    ops: base.ops,
    payments: base.payments,
  }, 'fast');
}

// Simple health endpoint (no secrets).
// Must never throw (fail-open), even if Redis is unavailable.
export default async function handler(_req, res) {
  const healthTier = resolveHealthTier(_req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Health-Tier', healthTier);

  const now = new Date();
  const day = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)

  const base = {
    ok: true,
    ts: now.toISOString(),
    env: CFG.APP_ENV,
    redis: {
      configured: !!(CFG.UPSTASH_REDIS_REST_URL && CFG.UPSTASH_REDIS_REST_TOKEN),
      read_ok: null,
      write_ok: null,
      latency_ms: null,
      last_error: null,
    },
    support: {
      configured:
        (!!String(CFG.SUPPORT_CHAT_ID || '').trim()) ||
        (Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.length > 0),
      chat_configured: !!String(CFG.SUPPORT_CHAT_ID || '').trim(),
          },
    ops: {
      alert_summary_min: Number(CFG.OPS_ALERT_SUMMARY_MIN || 0),
      window_sec: Number(CFG.OPS_ALERT_SUMMARY_SEC || 0),
      targets_count: null,
      last_sent_at: null,
      top_reasons: null,
      digest_preview: null,
      alert_buffer_max: Number(CFG.OPS_ALERT_BUFFER_MAX || 0),
      silent: !!CFG.OPS_ALERT_SILENT,
      pending: null,
          },
    payments: {
      accept_default: !!CFG.PAYMENTS_ACCEPT_DEFAULT,
      auto_apply_default: !!CFG.PAYMENTS_AUTO_APPLY_DEFAULT,
      match_feat_auto_apply_enabled: !!CFG.MATCH_FEAT_AUTO_APPLY_ENABLED,
      // Keep legacy field for backwards-compat.
      fallback_apply_enabled: !!CFG.PAYMENTS_FALLBACK_APPLY_ENABLED,
      fallback_apply_env_enabled: !!CFG.PAYMENTS_FALLBACK_APPLY_ENABLED,
      fallback_apply_runtime_enabled: null,
      fallback_apply_effective: null,
      fallback_apply_runtime: null,
      payload_hmac_key_configured: !!String(CFG.PAYMENTS_PAYLOAD_HMAC_KEY || '').trim(),
      payload_hmac_key_len: String(CFG.PAYMENTS_PAYLOAD_HMAC_KEY || '').trim().length,
      payload_hmac_minlen: 32,
      payload_hmac_minlen_ok: String(CFG.PAYMENTS_PAYLOAD_HMAC_KEY || '').trim().length >= 32,
      payload_allow_unsigned: !!CFG.PAYMENTS_FALLBACK_ALLOW_UNSIGNED,
      payload_issues_today: null,
      orphaned_autoheal_enabled: !!CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED,
      orphaned_autoheal_batch: Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_BATCH || 0),
      orphaned_autoheal_min_age_sec: Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 0),
      orphaned_autoheal_chain_max: Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX || 0),
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
    qstash: {
      official_publish_deliver_last_at: null,
      official_publish_verify_last_at: null,
      reschedule_failed: { day, today_count: null, last_at: null, last_where: null, last_payload: null },
      official_publish_stuck: {
        day,
        today_count: null,
        last_at: null,
        last_offer_id: null,
        last_age_sec: null,
        last_via: null,
      },
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

  function makeCronBase(enabled = false) {
    return {
      enabled: !!enabled,
      giveaways_tick: null,
      broadcast_tick: null,
      ig_verify_tick: null,
      audit_flush_tick: null,
    };
  }

  function makeBroadcastBase() {
    return {
      cooldown_until: null,
      retry_after_sec: null,
      broadcast_id: null,
      cooldown_source: null,
      last_429_at: null,
      last_429_reason: null,
      qstash_last_delivery_at: null,
      pending_deliveries: null,
      counters: null,
      hard_skip: null,
      db_overload: { day, today_count: null, last_at: null, last_where: null },
      tick_deferred_redis: { day, today_count: null, last_at: null, last_where: null },
    };
  }

  function makeRefBase() {
    return {
      day: null,
      today: { ig: 0, tg: 0 },
      total: { ig: 0, tg: 0 },
    };
  }

  // Redis is optional for /api/health (so it stays useful in minimal envs).
  if (!CFG.UPSTASH_REDIS_REST_URL || !CFG.UPSTASH_REDIS_REST_TOKEN) {
    base.redis.configured = false;
    base.redis.read_ok = false;
    base.redis.write_ok = false;
    base.redis.latency_ms = null;
    base.redis.last_error = 'not_configured';
    const fullOut = attachHealthTier({ ...base, cron: makeCronBase(false), broadcast: makeBroadcastBase(), ref: makeRefBase(), audit: auditBase }, healthTier);
    const out = healthTier === 'fast' ? buildFastHealthOut(base) : fullOut;
    const st = computeSystemStatus(out);
    out.system_status = st.system_status;
    out.no_go_reasons = st.no_go_reasons;
    res.status(200).json(out);
    return;
  }

  function sanitizePrefix(p) {
    return String(p || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  }


  function computeSystemStatus(out) {
    try {
      const reasons = [];

      const add = (code, severity, value = null, threshold = null, hint = '') => {
        const o = {
          code: String(code || 'unknown'),
          severity: String(severity || 'P2'),
          value: value === undefined ? null : value,
        };
        if (threshold !== null && threshold !== undefined) o.threshold = threshold;
        if (hint) o.hint = String(hint).slice(0, 220);
        reasons.push(o);
      };

      const redisReadOk = out?.redis?.read_ok;
      const redisWriteOk = out?.redis?.write_ok;

      if (redisReadOk === false) {
        add(
          'redis_read_not_ok',
          'P0',
          false,
          null,
          'Redis read failed. Проверь UPSTASH_REDIS_REST_URL/TOKEN, лимиты/квоты и доступность Upstash.'
        );
      }
      if (redisWriteOk === false) {
        add(
          'redis_write_not_ok',
          'P0',
          false,
          null,
          'Redis write failed. В проде мутации должны fail-closed — сначала восстановить Redis/токен/квоты.'
        );
      }

      // Payments: HMAC key config is a hard precondition for safe payload verification.
      const hmacConfigured = out?.payments?.payload_hmac_key_configured;
      const hmacLen = out?.payments?.payload_hmac_key_len ?? null;
      const hmacMin = out?.payments?.payload_hmac_minlen ?? 32;
      const hmacOk = out?.payments?.payload_hmac_minlen_ok;

      if (hmacConfigured === false) {
        add(
          'payments_payload_hmac_key_missing',
          'P0',
          false,
          null,
          'PAYMENTS_PAYLOAD_HMAC_KEY не задан. Задай ключ ≥ 32 символов и перезапусти деплой.'
        );
      } else if (hmacOk === false) {
        add(
          'payments_payload_hmac_minlen_not_ok',
          'P0',
          hmacLen,
          hmacMin,
          'PAYMENTS_PAYLOAD_HMAC_KEY слишком короткий. Рекомендуется ключ ≥ 32 символов.'
        );
      }

      // Payments fallback apply should remain OFF in normal ops; if effective, treat as NO_GO.
      const fbEffective = out?.payments?.fallback_apply_effective;
      const fbEnv = out?.payments?.fallback_apply_env_enabled;
      const fbRt = out?.payments?.fallback_apply_runtime_enabled;
      if (fbEffective === true || fbEnv === true) {
        add(
          'payments_fallback_apply_effective',
          'P1',
          { effective: true, env: !!fbEnv, runtime: !!fbRt },
          null,
          'Fallback apply должен быть OFF по умолчанию. Используй только на инцидент/хвосты и обязательно выключай.'
        );
      }

      // P1/P2 operational thresholds (from readiness guidance)
      const deferred = Number(out?.broadcast?.tick_deferred_redis?.today_count ?? NaN);
      if (Number.isFinite(deferred) && deferred > 50) {
        add(
          'broadcast_tick_deferred_redis_high',
          'P2',
          deferred,
          50,
          'Много defer при Redis-down. Проверь Redis, затем перезапусти broadcast tick (или дождись восстановления).'
        );
      }

      const resched = Number(out?.qstash?.reschedule_failed?.today_count ?? NaN);
      if (Number.isFinite(resched) && resched > 10) {
        add(
          'qstash_reschedule_failed_high',
          'P2',
          resched,
          10,
          'QStash reschedule падает: проверь ключи QStash/лимиты, а также DB overload и retry headers.'
        );
      }

      const stuck = Number(out?.qstash?.official_publish_stuck?.today_count ?? NaN);
      if (Number.isFinite(stuck) && stuck > 5) {
        add(
          'qstash_official_publish_stuck_high',
          'P2',
          stuck,
          5,
          'OFFICIAL publish часто застревает. Проверь права канала/IDEMPOTENCY token-lock и очередь публикаций.'
        );
      }

      return {
        system_status: reasons.length ? 'NO_GO' : 'GO',
        no_go_reasons: reasons,
      };
    } catch {
      return {
        system_status: 'NO_GO',
        no_go_reasons: [
          {
            code: 'health_compute_failed',
            severity: 'P0',
            hint: 'Ошибка вычисления GO/NO_GO. Проверь /api/health на исключения и совместимость полей.',
          },
        ],
      };
    }
  }

  try {
    const { redis, k } = await import('../src/lib/redis.js');

    // Redis probe (best-effort): helps operators distinguish "Redis not configured" vs "Redis degraded".
    try {
      const t0 = Date.now();
      const probeKey = k(['health', 'redis_probe']);
      let writeOk = false;
      let readOk = false;
      let lastErr = null;

      try {
        await redis.set(probeKey, now.toISOString(), { ex: 60 });
        writeOk = true;
      } catch (e) {
        lastErr = String(e?.message || e);
      }

      try {
        const v = await redis.get(probeKey);
        readOk = v !== null && v !== undefined;
      } catch (e) {
        lastErr = lastErr || String(e?.message || e);
      }

      base.redis.configured = true;
      base.redis.write_ok = !!writeOk;
      base.redis.read_ok = !!readOk;
      base.redis.latency_ms = Math.max(0, Date.now() - t0);
      base.redis.last_error = lastErr ? String(lastErr).slice(0, 160) : null;
    } catch {
      base.redis.configured = true;
      base.redis.read_ok = false;
      base.redis.write_ok = false;
      base.redis.latency_ms = null;
      base.redis.last_error = 'probe_failed';
    }


    // Ops alert buffer status (Redis-only).
    try {
      const pendingOps = Number(await redis.llen(k(['ops', 'alerts', 'ops', 'd', day]))) || 0;
      base.ops.pending = { ops: pendingOps };
    } catch {
      // ignore
    }

// Ops digest: targets + last flush time + top reasons (sample).
try {
  const targets = base.support.chat_configured
    ? 1
    : (Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS.length : 0);
  base.ops.targets_count = Number(targets) || 0;
} catch {
  // ignore
}

try {
  const lastRaw = await redis.get(k(['ops', 'alerts', 'ops', 'last_sent']));
  const sec = Number(lastRaw) || 0;
  if (sec > 0) base.ops.last_sent_at = new Date(sec * 1000).toISOString();
} catch {
  // ignore
}

try {
  // Sample a small tail to avoid heavy parsing.
  const raw = await redis.lrange(k(['ops', 'alerts', 'ops', 'd', day]), 0, 30);
  const by = {};
  const tail = [];
  for (const it of raw || []) {
    try {
      const o = typeof it === 'string' ? JSON.parse(it) : it;
      const rr = String(o?.reason || 'error');
      by[rr] = (by[rr] || 0) + 1;

      if (tail.length < 5) {
        tail.push({
          ts: o?.ts ? String(o.ts).slice(0, 19) : null,
          reason: rr.slice(0, 64),
          kind: o?.kind ? String(o.kind).slice(0, 32) : null,
          title: o?.title ? String(o.title).slice(0, 90) : null,
        });
      }
    } catch {
      // ignore
    }
  }
  const top = Object.entries(by)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 5);
  base.ops.top_reasons = top.length ? Object.fromEntries(top) : null;

  // Human-friendly preview for dashboards (Redis-only).
  // Keep it small and stable: top reasons + last few events.
  base.ops.digest_preview = {
    day,
    pending: base.ops?.pending?.ops ?? null,
    last_sent_at: base.ops?.last_sent_at ?? null,
    top: top.slice(0, 3).map(([r, c]) => ({ reason: String(r).slice(0, 64), count: Number(c) || 0 })),
    last: tail,
  };
} catch {
  // ignore
}

// Payments ops (Redis-only): runtime fallback flag + payload signature issue counters.
    try {
      const rtKey = k(['sys', 'pay_fallback_apply']);
      const v = await redis.get(rtKey);
      let obj = (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
      if (!obj && typeof v === 'string') {
        try {
          const o2 = JSON.parse(v);
          if (o2 && typeof o2 === 'object' && !Array.isArray(o2)) obj = o2;
        } catch {
          // ignore
        }
      }

      let ttlSec = null;
      try {
        if (typeof redis.ttl === 'function') ttlSec = Number(await redis.ttl(rtKey));
      } catch {
        ttlSec = null;
      }

      const runtimeEnabled = !!(obj && obj.enabled);
      base.payments.fallback_apply_runtime_enabled = runtimeEnabled;
      base.payments.fallback_apply_effective = !!(base.payments.fallback_apply_env_enabled || runtimeEnabled);
      // For convenience, reflect effective state in legacy field too.
      base.payments.fallback_apply_enabled = base.payments.fallback_apply_effective;

      base.payments.orphaned_autoheal_effective = !!(
        CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && base.payments.fallback_apply_effective
      );

      if (runtimeEnabled) {
        base.payments.fallback_apply_runtime = {
          at: obj?.at || null,
          expAt: obj?.expAt || null,
          ttlSec: Number.isFinite(ttlSec) ? ttlSec : (obj?.ttlSec || null),
          byTgId: obj?.byTgId || null,
          byUser: obj?.byUser || null,
          reason: obj?.reason || null,
        };
      } else {
        base.payments.fallback_apply_runtime = null;
      }
    } catch {
      // ignore
    }

    try {
      const buckets = ['unsigned', 'bad_sig', 'bad_format', 'hmac_error', 'other'];
      const keys = buckets.map((b) => k(['ops', 'payments', 'payload', b, 'd', day]));
      const vals = await Promise.all(keys.map((kk) => redis.get(kk)));
      const out = {};
      for (let i = 0; i < buckets.length; i++) out[buckets[i]] = Number(vals[i] || 0) || 0;
      base.payments.payload_issues_today = out;
    } catch {
      // ignore
    }

    if (healthTier === 'fast') {
      const out = buildFastHealthOut(base);
      const st = computeSystemStatus(out);
      out.system_status = st.system_status;
      out.no_go_reasons = st.no_go_reasons;
      res.status(200).json(out);
      return;
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
    let broadcast = makeBroadcastBase();

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

      // Pending deliveries snapshot (Redis-only; written by cron broadcastTick)
      try {
        const snapRaw = await redis.get(k(['broadcast', 'pending_deliveries']));
        if (!snapRaw) {
          broadcast.pending_deliveries = null;
        } else {
          let snap = snapRaw;
          if (typeof snapRaw === 'string') {
            try {
              snap = JSON.parse(snapRaw);
            } catch {
              snap = null;
            }
          }
          if (snap && typeof snap === 'object') {
            const bid = Number(snap.broadcast_id ?? snap.broadcastId) || null;
            const pc = Number(snap.pending_count ?? snap.pendingCount ?? snap.pending) || 0;
            broadcast.pending_deliveries = {
              ts: snap.ts || null,
              broadcast_id: bid,
              pending_count: pc,
            };
          } else {
            broadcast.pending_deliveries = null;
          }
        }
      } catch {
        // ignore
      }

      let untilMs = Number(untilRaw) || 0;
      const bid = Number(bidRaw) || 0;
      broadcast.broadcast_id = bid > 0 ? bid : null;
      broadcast.last_429_at = lastAt || null;
      broadcast.last_429_reason = lastReason || null;

      // Fallback: if global cooldown_until is missing but broadcast_id is known,
      // try per-broadcast cooldown key (Redis-only; no DB).
      if (!untilMs && bid > 0) {
        try {
          const perRaw = await redis.get(k(['broadcast', String(bid), 'cooldown_until']));
          const perMs = Number(perRaw) || 0;
          if (perMs > 0) {
            untilMs = perMs;
            broadcast.cooldown_source = 'redis_per_broadcast';
          }
        } catch {
          // ignore
        }
      }

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

// Hard-skip metrics (Redis-only; no DB).
try {
  const ttlDays = Number(process.env.BROADCAST_HARD_SKIP_TTL_DAYS || 90) || 90;
  const recentKey = k(['broadcast', 'hard_skip', 'recent']);
  const recentLen = Number(await redis.llen(recentKey)) || 0;
  const [hsSetCnt, hsHitCnt, hsUnskipCnt] = await readMany([
    k(['broadcast', 'hard_skip', 'set', 'd', day]),
    k(['broadcast', 'hard_skip', 'hit', 'd', day]),
    k(['broadcast', 'hard_skip', 'unskip', 'd', day]),
  ]);
  broadcast.hard_skip = {
    ttl_days: ttlDays,
    recent_len: recentLen,
    counters: {
      day,
      set: Number(hsSetCnt) || 0,
      hit: Number(hsHitCnt) || 0,
      unskip: Number(hsUnskipCnt) || 0,
    },
  };
} catch {
  // ignore
}


// Broadcast DB overload metrics (Redis-only; emitted by qstash/broadcast-deliver.js on load-shedding).
try {
  const [cntRaw, lastAt, lastWhere] = await readMany([
    k(['ops', 'reasons', 'broadcast_db_overload', 'd', day]),
    k(['ops', 'reasons', 'broadcast_db_overload', 'last_at']),
    k(['ops', 'reasons', 'broadcast_db_overload', 'last_where']),
  ]);
  broadcast.db_overload = {
    day,
    today_count: Number(cntRaw) || 0,
    last_at: lastAt || null,
    last_where: lastWhere || null,
  };
} catch {
  // ignore
}

// Broadcast tick deferred due to Redis degraded (Redis-only; emitted by cron broadcastTick fail-closed).
try {
  const [cntRaw, lastAt, lastWhere] = await readMany([
    k(['ops', 'reasons', 'broadcast_tick_deferred_redis', 'd', day]),
    k(['ops', 'reasons', 'broadcast_tick_deferred_redis', 'last_at']),
    k(['ops', 'reasons', 'broadcast_tick_deferred_redis', 'last_where']),
  ]);
  broadcast.tick_deferred_redis = {
    day,
    today_count: Number(cntRaw) || 0,
    last_at: lastAt || null,
    last_where: lastWhere || null,
  };
} catch {
  // ignore
}

      if (untilMs > 0) {
        if (!broadcast.cooldown_source) broadcast.cooldown_source = 'redis_global';
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

    // QStash: breadcrumbs + reschedule/stuck metrics (Redis-only; no DB)
    try {
      base.qstash.official_publish_deliver_last_at = (await redis.get(k(['qstash', 'official_publish_deliver', 'last_at']))) || null;
    } catch {
      // ignore
    }
    try {
      base.qstash.official_publish_verify_last_at = (await redis.get(k(['qstash', 'official_publish_verify', 'last_at']))) || null;
    } catch {
      // ignore
    }

    try {
      const [cntRaw, lastAt, lastWhere, lastPayload] = await readMany([
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'd', day]),
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_at']),
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_where']),
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_payload']),
      ]);
      base.qstash.reschedule_failed = {
        day,
        today_count: Number(cntRaw) || 0,
        last_at: lastAt || null,
        last_where: lastWhere || null,
        last_payload: lastPayload || null,
      };
    } catch {
      // ignore
    }

    try {
      const [cntRaw, lastAt, lastOfferId, lastAgeSec, lastVia] = await readMany([
        k(['ops', 'reasons', 'official_publish_stuck', 'd', day]),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_at']),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_offer_id']),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_age_sec']),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_via']),
      ]);
      base.qstash.official_publish_stuck = {
        day,
        today_count: Number(cntRaw) || 0,
        last_at: lastAt || null,
        last_offer_id: lastOfferId || null,
        last_age_sec: lastAgeSec !== null && lastAgeSec !== undefined ? Number(lastAgeSec) || 0 : null,
        last_via: lastVia || null,
      };
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

    const out = attachHealthTier({

      ...base,
      cron: {
        ...makeCronBase(true),
        giveaways_tick: giveawaysTick || null,
        broadcast_tick: broadcastTick || null,
        ig_verify_tick: igVerifyTick || null,
        audit_flush_tick: auditFlushTick || null,
      },
      broadcast,
      ref,
      audit,

    }, healthTier);
    const st = computeSystemStatus(out);
    out.system_status = st.system_status;
    out.no_go_reasons = st.no_go_reasons;
    res.status(200).json(out);
  } catch {
    base.redis.configured = true;
    base.redis.read_ok = false;
    base.redis.write_ok = false;
    base.redis.latency_ms = null;
    base.redis.last_error = 'redis_unavailable';

    const fullOut = attachHealthTier({

      ...base,
      cron: { ...makeCronBase(true), error: 'redis_unavailable' },
      broadcast: makeBroadcastBase(),
      ref: makeRefBase(),
      audit: auditBase,

    }, healthTier);
    const out = healthTier === 'fast' ? buildFastHealthOut(base) : fullOut;
    const st = computeSystemStatus(out);
    out.system_status = st.system_status;
    out.no_go_reasons = st.no_go_reasons;
    res.status(200).json(out);
  }
}
