function readParam(req, name) {
  try {
    if (req?.query && Object.prototype.hasOwnProperty.call(req.query, name)) {
      const raw = req.query[name];
      return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
    }
    if (typeof req?.url === 'string' && req.url) {
      const u = new URL(req.url, 'http://localhost');
      return u.searchParams.get(name) || '';
    }
  } catch {
    // ignore malformed URL/query
  }
  return '';
}

function hasParam(req, name) {
  try {
    if (req?.query && Object.prototype.hasOwnProperty.call(req.query, name)) return true;
    if (typeof req?.url === 'string' && req.url) {
      return new URL(req.url, 'http://localhost').searchParams.has(name);
    }
  } catch {
    // ignore
  }
  return false;
}

export function resolveHealthView(req) {
  const raw = String(
    readParam(req, 'mode')
    || readParam(req, 'view')
    || readParam(req, 'tier')
  ).trim().toLowerCase();

  if (raw === 'live' || raw === 'liveness' || hasParam(req, 'live')) return 'liveness';
  if (
    raw === 'full'
    || raw === 'diagnostics'
    || raw === 'admin'
    || hasParam(req, 'full')
    || hasParam(req, 'diagnostics')
  ) return 'diagnostics';
  return 'readiness';
}

export function healthStatusCode(systemStatus) {
  return String(systemStatus || '').toUpperCase() === 'GO' ? 200 : 503;
}

export function buildLivenessPayload(now = new Date()) {
  return {
    ok: true,
    status: 'alive',
    check: 'liveness',
    ts: now.toISOString(),
  };
}

function checkState(ok, configured = true) {
  if (!configured) return 'not_configured';
  if (ok === true) return 'ok';
  if (ok === false) return 'unavailable';
  return 'unknown';
}

export function buildPublicReadinessPayload(out = {}) {
  const ready = String(out?.system_status || '').toUpperCase() === 'GO';
  return {
    ok: ready,
    status: ready ? 'ready' : 'not_ready',
    check: 'readiness',
    ts: out?.ts || new Date().toISOString(),
    system_status: ready ? 'GO' : 'NO_GO',
    checks: {
      database: checkState(out?.database?.read_ok, out?.database?.configured !== false),
      redis: checkState(
        out?.redis?.read_ok === true && out?.redis?.write_ok === true,
        out?.redis?.configured !== false
      ),
      payment_payload_verification: out?.payments?.payload_hmac_minlen_ok === true ? 'ok' : 'unavailable',
    },
    reason_codes: Array.isArray(out?.no_go_reasons)
      ? out.no_go_reasons.map((row) => String(row?.code || 'unknown')).filter(Boolean).slice(0, 20)
      : [],
  };
}

function sanitizeErrorLike(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[BOT_TOKEN]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/(^|\s)@[A-Za-z0-9_]{4,32}\b/g, '$1[USERNAME]')
    .replace(/\b\d{6,20}\b/g, '[ID]')
    .slice(0, 180);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export function sanitizeHealthDiagnostics(out = {}) {
  const next = clone(out);

  if (next?.qstash?.ping) {
    next.qstash.ping.last_nonce_present = !!next.qstash.ping.last_nonce;
    delete next.qstash.ping.last_nonce;
  }
  if (next?.qstash?.reschedule_failed) delete next.qstash.reschedule_failed.last_payload;
  if (next?.qstash?.official_publish_stuck) delete next.qstash.official_publish_stuck.last_offer_id;

  for (const branch of ['accept', 'unlock', 'official', 'intro']) {
    const row = next?.mon?.[branch];
    if (!row) continue;
    delete row.last_app_id;
    delete row.last_ws_id;
    delete row.last_offer_id;
  }

  if (next?.ops?.digest_preview?.tail) delete next.ops.digest_preview.tail;
  if (next?.ops?.digest_preview?.last) delete next.ops.digest_preview.last;
  if (next?.payments?.fallback_apply_runtime) {
    delete next.payments.fallback_apply_runtime.byTgId;
    delete next.payments.fallback_apply_runtime.byUser;
    delete next.payments.fallback_apply_runtime.reason;
  }
  if (next?.redis) next.redis.last_error = sanitizeErrorLike(next.redis.last_error);

  const scrubErrors = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'last_error' || key === 'error' || key === 'message') {
        node[key] = sanitizeErrorLike(value);
      } else if (value && typeof value === 'object') {
        scrubErrors(value);
      }
    }
  };
  scrubErrors(next);

  next.health_view = 'diagnostics';
  next.diagnostics_access = 'admin_session';
  return next;
}
