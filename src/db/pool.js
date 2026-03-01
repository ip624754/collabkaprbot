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

const PG_POOL_MAX = Number(process.env.PG_POOL_MAX || 1);
const PG_CONN_TIMEOUT_MS = Number(process.env.PG_CONN_TIMEOUT_MS || 10000); // 10s на случай cold start
const PG_IDLE_TIMEOUT_MS = Number(process.env.PG_IDLE_TIMEOUT_MS || 5000); // 5s (было 30s)
const PG_STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000);

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

const PG_OPTIONS = (() => {
  const ms = Math.floor(Number(PG_STATEMENT_TIMEOUT_MS));
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  // Guaranteed server-side timeout. This is more reliable than a best-effort "SET" in connect hook.
  return `-c statement_timeout=${ms}`;
})();

export const pool = new Pool({
  connectionString: CFG.DATABASE_URL,
  ssl: CFG.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: true },
  options: PG_OPTIONS,
  
  // Serverless optimization
  max: PG_POOL_MAX, 
  connectionTimeoutMillis: PG_CONN_TIMEOUT_MS,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  
  // Node.js specific: allows the process to exit even if the pool has idle clients
  allowExitOnIdle: true 
});

// Global query wrapper: add a log marker when PG cancels a query due to statement_timeout.
// (No behavior changes; we only add structured logs to help ops/support.)
{
  const _q = pool.query.bind(pool);
  pool.query = (...args) => {
    const p = _q(...args);
    if (p && typeof p.then === 'function') {
      return p.catch((e) => {
        if (isStatementTimeoutErr(e)) logStatementTimeout(e, { scope: 'pool.query' });
        throw e;
      });
    }
    return p;
  };
}

// Auto-set statement_timeout on every new connection
pool.on('connect', (client) => {
  // Wrap per-client query as well (covers pool.connect() + transactions).
  try {
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
  } catch {}

  const ms = Number(PG_STATEMENT_TIMEOUT_MS);
  if (Number.isFinite(ms) && ms > 0) {
    // Best-effort: never throw from connect hook.
    client.query(`set statement_timeout to ${Math.floor(ms)}`)
      .catch((e) => {
        try { console.warn('[pg] statement_timeout failed', { message: String(e?.message || e) }); } catch {}
      });
  }
});

// Silent error handler to prevent crash on backend errors
pool.on('error', (err) => {
  try {
    console.error('[pg.pool.error]', { message: String(err?.message || err), code: err?.code || null });
  } catch {}
});

export async function pingDb() {
  try {
    const r = await pool.query('select 1 as ok');
    return r.rows?.[0]?.ok === 1;
  } catch (e) {
    return false;
  }
}
