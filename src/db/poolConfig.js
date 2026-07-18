const DEFAULTS = Object.freeze({
  poolMax: 1,
  connectTimeoutMs: 10000,
  idleTimeoutMs: 5000,
  statementTimeoutMs: 15000,
});

export const DB_CONNECT_RETRY_POLICY = Object.freeze({
  maxRetries: 1,
  baseDelayMs: 150,
  jitterMs: 100,
});

function intEnv(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseDatabaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return { configured: false, valid: false, hostname: '', params: null };
  try {
    const u = new URL(value);
    return { configured: true, valid: true, hostname: String(u.hostname || '').toLowerCase(), params: u.searchParams };
  } catch {
    return { configured: true, valid: false, hostname: '', params: null };
  }
}

function isNeonHostname(hostname) {
  return String(hostname || '').endsWith('.neon.tech');
}

function isPooledNeonHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!isNeonHostname(h)) return null;
  return /(^|[.-])pooler([.-]|$)/.test(h) || h.includes('-pooler.');
}

export function getDbPoolConfigSnapshot(env = process.env) {
  const parsed = parseDatabaseUrl(env.DATABASE_URL);
  const neon = parsed.valid ? isNeonHostname(parsed.hostname) : null;
  const pooled = parsed.valid ? isPooledNeonHostname(parsed.hostname) : null;
  const poolMax = intEnv(env.PG_POOL_MAX, DEFAULTS.poolMax, { min: 1, max: 50 });
  const connectTimeoutMs = intEnv(env.PG_CONN_TIMEOUT_MS, DEFAULTS.connectTimeoutMs, { min: 100, max: 120000 });
  const idleTimeoutMs = intEnv(env.PG_IDLE_TIMEOUT_MS, DEFAULTS.idleTimeoutMs, { min: 100, max: 600000 });
  const statementTimeoutMs = intEnv(env.PG_STATEMENT_TIMEOUT_MS, DEFAULTS.statementTimeoutMs, { min: 0, max: 600000 });
  const warnings = [];

  if (parsed.configured && !parsed.valid) warnings.push('database_url_invalid');
  if (neon === true && pooled === false) warnings.push('database_url_unpooled');
  if (poolMax !== 1) warnings.push('database_pool_max_not_serverless_safe');
  if (connectTimeoutMs < 3000) warnings.push('database_connect_timeout_aggressive');

  return {
    configured: parsed.configured,
    url_valid: parsed.valid,
    provider: neon === true ? 'neon' : (parsed.valid ? 'other' : null),
    pooled_url: pooled,
    tls_verify_full: parsed.params ? String(parsed.params.get('sslmode') || '').toLowerCase() === 'verify-full' : null,
    channel_binding_verify_full: parsed.params ? String(parsed.params.get('channel_binding') || '').toLowerCase() === 'verify-full' : null,
    pool_max: poolMax,
    connect_timeout_ms: connectTimeoutMs,
    idle_timeout_ms: idleTimeoutMs,
    statement_timeout_ms: statementTimeoutMs,
    connect_retry: {
      enabled: DB_CONNECT_RETRY_POLICY.maxRetries > 0,
      max_retries: DB_CONNECT_RETRY_POLICY.maxRetries,
      base_delay_ms: DB_CONNECT_RETRY_POLICY.baseDelayMs,
      jitter_ms: DB_CONNECT_RETRY_POLICY.jitterMs,
    },
    warnings,
  };
}

export const DB_POOL_CONFIG = Object.freeze(getDbPoolConfigSnapshot(process.env));
