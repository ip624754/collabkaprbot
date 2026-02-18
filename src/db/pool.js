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

export const pool = new Pool({
  connectionString: CFG.DATABASE_URL,
  ssl: CFG.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  
  // Serverless optimization
  max: PG_POOL_MAX, 
  connectionTimeoutMillis: PG_CONN_TIMEOUT_MS,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  
  // Node.js specific: allows the process to exit even if the pool has idle clients
  allowExitOnIdle: true 
});

// Auto-set statement_timeout on every new connection
pool.on('connect', (client) => {
  const ms = Number(PG_STATEMENT_TIMEOUT_MS);
  if (Number.isFinite(ms) && ms > 0) {
    // Best-effort: never throw from connect hook.
    client.query(`set statement_timeout to ${Math.floor(ms)}`).catch(() => {});
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
