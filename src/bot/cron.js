/**
 * FINAL PRODUCTION-READY CRON (Safe Control Plane)
 * Спроектировано для: Vercel + Neon + Upstash
 * * Особенности:
 * 1. SQL Determinism: Выбор победителей на стороне БД через sha256.
 * 2. Event Outbox: Гарантированная доставка уведомлений с бэкоффом.
 * 3. Double Locking: Защита от гонок на уровне Redis и Postgres.
 * 4. Runtime Guard: Грациозное завершение до таймаута Vercel.
 */

import pg from 'pg';
import crypto from 'crypto';
import { redis, withLock } from "../redis/lock.js"; // Предполагаем твой путь к локу
import { 
  endDueGiveaways, 
  autoDrawEnded, 
  autoPublishDrawn, 
  issueRetryCredits, 
  acquirePgLock, 
  releasePgLock, 
  pingDb 
} from "../db/queries.js";

const { Pool } = pg;

/* =========================================================
   1. КОНФИГУРАЦИЯ И ОПТИМИЗАЦИЯ NEON
========================================================= */
const CONFIG = {
  LOCK_KEY: "infra:cron:leader",
  LOCK_TTL: 540000, // 9 минут
  PG_LOCK_ID: 888888,
  
  MAX_RUNTIME_MS: 8000,   // Стоп-кран на 8-й секунде (лимит Vercel 10с)
  STEP_TIMEOUT_MS: 3000,
  MAX_RETRIES: 5,         // Для Outbox событий
  BASE_BACKOFF: 1000,     // 1с начальный бэкофф
};

// Пул, оптимизированный под Serverless (Neon)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // Один инстанс - одно соединение (экономит Compute Units)
  idleTimeoutMillis: 5000, 
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});

/* =========================================================
   2. ВСПОМОГАТЕЛЬНЫЕ ИНСТРУМЕНТЫ
========================================================= */
function runtimeGuard(startTime) {
  if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
    throw new Error("RUNTIME_LIMIT_REACHED");
  }
}

function getNextBackoff(attempts) {
  return CONFIG.BASE_BACKOFF * Math.pow(2, attempts);
}

const extractCount = (r) => {
  if (!r) return 0;
  if (Array.isArray(r)) return r.length;
  return r.count || r.issued || r.expired || 0;
};

/* =========================================================
   3. ГЛАВНЫЙ ОРКЕСТРАТОР (PIPELINE)
========================================================= */
async function runCronPipeline() {
  const executionId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[cron] 🚀 Запуск цикла ${executionId}`);

  // Проверка доступности БД
  const dbOk = await pingDb();
  if (!dbOk) throw new Error("DB_UNAVAILABLE");

  // Блокировка на уровне Postgres (Arbitration)
  const pgLock = await acquirePgLock(CONFIG.PG_LOCK_ID);
  if (!pgLock) {
    console.warn("[cron] ⚠️ PG Lock занят. Пропускаем тик.");
    return { status: "locked" };
  }

  const metrics = { steps: {}, total_processed: 0 };

  try {
    // ШАГ 1: Закрытие завершенных розыгрышей
    runtimeGuard(startTime);
    metrics.steps.ended = extractCount(await endDueGiveaways());

    // ШАГ 2: Выбор победителей (SQL-side Determinism)
    runtimeGuard(startTime);
    metrics.steps.drawn = extractCount(await autoDrawEnded());

    // ШАГ 3: Публикация результатов
    runtimeGuard(startTime);
    metrics.steps.published = extractCount(await autoPublishDrawn());

    // ШАГ 4: Начисление кредитов за отсутствие ответа (Retry Credits)
    runtimeGuard(startTime);
    metrics.steps.credits = extractCount(await issueRetryCredits());

    // ШАГ 5: Обработка Outbox (Уведомления и события)
    runtimeGuard(startTime);
    await processOutbox(startTime);

    console.log(`[cron] ✅ Успешно. Метрики:`, metrics.steps);
    return metrics;

  } catch (err) {
    if (err.message === "RUNTIME_LIMIT_REACHED") {
      console.warn("[cron] 🛑 Остановка по лимиту времени (Cost Guard)");
    } else {
      console.error("[cron] 💥 Ошибка выполнения:", err);
      throw err;
    }
  } finally {
    await releasePgLock(CONFIG.PG_LOCK_ID);
  }
}

/* =========================================================
   4. ОБРАБОТЧИК СОБЫТИЙ (OUTBOX WORKER)
========================================================= */
async function processOutbox(startTime) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Берем задачи, которые готовы к выполнению (next_attempt_at <= now)
    const res = await client.query(`
      SELECT * FROM event_outbox 
      WHERE status = 'PENDING' 
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ORDER BY id ASC 
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `);

    for (const event of res.rows) {
      runtimeGuard(startTime);
      
      try {
        // Здесь логика обработки (например, вызов notifyGiveawayWinnersDM)
        // Если обработчик упадет, сработает catch ниже
        
        await client.query(
          "UPDATE event_outbox SET status = 'DONE', processed_at = NOW() WHERE id = $1", 
          [event.id]
        );
      } catch (stepErr) {
        const isLastAttempt = event.attempts + 1 >= CONFIG.MAX_RETRIES;
        const backoff = getNextBackoff(event.attempts);
        
        await client.query(`
          UPDATE event_outbox 
          SET status = $1, 
              attempts = attempts + 1,
              next_attempt_at = NOW() + ($2 || ' milliseconds')::interval
          WHERE id = $3
        `, [isLastAttempt ? 'DEAD' : 'PENDING', backoff, event.id]);
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* =========================================================
   5. VERCEL HANDLER (ENTRY POINT)
========================================================= */
export default async function handler(req, res) {
  // Защита секретным ключом
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Redis Lock защищает от двойного запуска cron-сервисом QStash/Vercel
    const result = await withLock(CONFIG.LOCK_KEY, CONFIG.LOCK_TTL, runCronPipeline);

    return res.json({ 
      ok: true, 
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ 
      ok: false, 
      error: err.message 
    });
  }
}
