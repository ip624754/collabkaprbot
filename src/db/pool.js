import pg from 'pg'; 
import { CFG } from '../lib/config.js';

const { Pool } = pg;

// Postgres pool hardening for serverless (Neon + Vercel):
//
// 1. PG_POOL_MAX = 1. 
//    В Serverless одна функция обрабатывает один запрос. Нам не нужен пул на 10 соединений.
//
// 2. PG_IDLE_TIMEOUT_MS = 5000 (5 sec). 
//    Критично для Neon! Если соединение висит долго (30 сек), Neon считает базу активной 
//    и списывает Compute Units. Мы закрываем его быстро.
//
// 3. statement_timeout = 15s.
//    Убиваем зависшие запросы, чтобы бот не висел вечно.
//
// IMPORTANT (Neon pooler):
// Не передаём statement_timeout через startup options (например `options: -c statement_timeout=...`).
// Neon pooler отклоняет такие параметры как "unsupported startup parameter".
//
// IMPORTANT (pg@8 deprecation):
// Не вызываем client.query() внутри pool.on('connect') — pg@8.12+ выдаёт
// DeprecationWarning "Calling client.query() when the client is already executing",
// потому что pg-pool сразу после connect отдаёт клиента pending query.
// Вместо этого SET statement_timeout выполняется лениво через обёртки pool.connect / pool.query.

const PG_POOL_MAX = Number(process.env.PG_POOL_MAX || 1);
const PG_CONN_TIMEOUT_MS = Number(process.env.PG_CONN_TIMEOUT_MS || 10000);
const PG_IDLE_TIMEOUT_MS = Number(process.env.PG_IDLE_TIMEOUT_MS || 5000);
const PG_STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000);

// ── Helpers ──────────────────────────────────────────────────────────

function isStatementTimeoutErr(err) {
  const code = String(err?.code || '');
  if (code === '57014') return true; // query_canceled (statement_timeout)
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('statement timeout') || msg.includes('canceling statement');
}

function logStatementTimeout(err, ctx = {}) {
  try {
    console.warn('[db.statement_timeout]', {
      code: err?.code || null,
      message: String(err?.message || err),
      ...ctx
    });
  } catch {}
}

// ── Pool ─────────────────────────────────────────────────────────────

export const pool = new Pool({
  connectionString: CFG.DATABASE_URL,
  ssl: CFG.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: true },

  // Serverless optimization
  max: PG_POOL_MAX,
  connectionTimeoutMillis: PG_CONN_TIMEOUT_MS,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,

  // Node.js specific: allows the process to exit even if the pool has idle clients
  allowExitOnIdle: true
});

// ── Lazy statement_timeout ───────────────────────────────────────────
// SET runs once per physical connection, on first real usage (not in connect event).
// This avoids the pg@8 deprecation warning about concurrent client.query calls.

function sanitizeStatementTimeoutMs(raw) {
  const v = Math.floor(Number(raw));
  if (!Number.isFinite(v) || v <= 0) return 0;
  // Guardrails: avoid accidental extreme values (keeps Neon safe).
  const MIN = 1000;      // 1s
  const MAX = 600000;    // 10m
  if (v < MIN) return MIN;
  if (v > MAX) return MAX;
  return v;
}

const _stmtMs = sanitizeStatementTimeoutMs(PG_STATEMENT_TIMEOUT_MS);

async function ensureStatementTimeout(client) {
  if (!_stmtMs || client._stmtTimeoutSet) return;
  try {
    // Prefer parameterized set_config (no string interpolation in SET utility statements).
    await client.query("select set_config('statement_timeout', $1, false)", [String(_stmtMs)]);
    client._stmtTimeoutSet = true;
    client._stmtTimeoutMs = _stmtMs;
  } catch (e) {
    // Fallback for any pooler quirks: safe because _stmtMs is sanitized integer.
    try {
      await client.query(`SET statement_timeout TO ${_stmtMs}`);
      client._stmtTimeoutSet = true;
      client._stmtTimeoutMs = _stmtMs;
    } catch (e2) {
      try { console.warn('[pg] statement_timeout init failed', { message: String(e2?.message || e2) }); } catch {}
    }
  }
}

// ── Wrap client.query for timeout logging ────────────────────────────

function wrapClientQuery(client) {
  if (client._queryWrapped) return;
  const _cq = client.query.bind(client);
  client.query = (...args) => {
    const p = _cq(...args);
    if (p && typeof p.then === 'function') {
      return p.catch((e) => {
        if (isStatementTimeoutErr(e)) logStatementTimeout(e, { scope: 'client.query' });
        throw e;
      });
    }
    return p;
  };
  client._queryWrapped = true;
}

// ── Override pool.connect: SET + wrap after client is fully ready ─────

const _originalConnect = pool.connect.bind(pool);
pool.connect = async function () {
  const client = await _originalConnect();
  wrapClientQuery(client);
  await ensureStatementTimeout(client);
  return client;
};

// ── Override pool.query: route through pool.connect for lazy SET ──────
// pool.query() internally acquires a client, runs query, releases.
// By routing through our pool.connect(), we ensure SET runs first.

const _origPoolQuery = pool.query.bind(pool);
pool.query = async function (text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

// ── Error handler ────────────────────────────────────────────────────

pool.on('error', (err) => {
  try {
    console.error('[pg.pool.error]', { message: String(err?.message || err), code: err?.code || null });
  } catch {}
});

// ── Ping ─────────────────────────────────────────────────────────────

export async function pingDb() {
  try {
    const r = await pool.query('select 1 as ok');
    return r.rows?.[0]?.ok === 1;
  } catch (e) {
    return false;
  }
}
