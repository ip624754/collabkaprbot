import pg from 'pg';
import { CFG } from '../lib/config.js';

const { Pool } = pg;

// Postgres pool hardening for serverless:
// - connectionTimeoutMillis: avoid hanging forever on cold starts / DNS / network issues
// - idleTimeoutMillis: recycle idle clients
// - statement_timeout: cancel long-running queries server-side (prevents pool exhaustion on app-level timeouts)
//
// All values can be overridden via env.
const PG_POOL_MAX = Number(process.env.PG_POOL_MAX || 10);
const PG_CONN_TIMEOUT_MS = Number(process.env.PG_CONN_TIMEOUT_MS || 5000);
const PG_IDLE_TIMEOUT_MS = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000);
const PG_STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000);

export const pool = new Pool({
  connectionString: CFG.DATABASE_URL,
  ssl: CFG.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: Number.isFinite(PG_POOL_MAX) && PG_POOL_MAX > 0 ? PG_POOL_MAX : 10,
  connectionTimeoutMillis: Number.isFinite(PG_CONN_TIMEOUT_MS) && PG_CONN_TIMEOUT_MS > 0 ? PG_CONN_TIMEOUT_MS : 5000,
  idleTimeoutMillis: Number.isFinite(PG_IDLE_TIMEOUT_MS) && PG_IDLE_TIMEOUT_MS > 0 ? PG_IDLE_TIMEOUT_MS : 30000
});

pool.on('connect', (client) => {
  const ms = Number(PG_STATEMENT_TIMEOUT_MS);
  if (Number.isFinite(ms) && ms > 0) {
    // Best-effort: never throw from connect hook.
    client.query(`set statement_timeout to ${Math.floor(ms)}`).catch(() => {});
  }
});

pool.on('error', (err) => {
  try {
    console.error('[pg.pool.error]', { message: String(err?.message || err), code: err?.code || null });
  } catch {}
});

export async function pingDb() {
  const r = await pool.query('select 1 as ok');
  return r.rows?.[0]?.ok === 1;
}
