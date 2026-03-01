# 13 — Runbook: Deploy / Smoke tests / Rollback

Быстрый чек “2 минуты перед деплоем”: `docs/16_RELEASE_CHECKLIST.md`.

## Перед деплоем
1) ENV:
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`
- (рекомендовано) `PG_POOL_MAX=1`, `PG_IDLE_TIMEOUT_MS=5000`

2) Миграции:
```bash
node migrations/run.js
```

## Vercel Hobby: лимит по количеству функций (важно)
- На Hobby плане деплой падает, если в проекте больше **12** serverless functions.
- Поэтому cron endpoints у нас не плодятся файлами `api/cron/*.js`.
- Все cron URL остаются привычными (`/api/cron/*`), но через `vercel.json` они прокидываются на единый роутер `api/cron_router.js`.
- Добавляешь новый cron‑тик → добавь `job=...` в `api/cron_router.js` (и при необходимости rewrite для legacy URL).


## Smoke tests (short)
Каноничный чек: `./smoke-tests_short.md` (10–15 минут).

Удобная команда (печатает чеклист + короткие напоминания):
```bash
npm run smoke:short
```

Дополнительно (по желанию, технический sanity перед/после):
1) `node --check src/bot/bot.js`
2) `node --check src/bot/cron.js`
3) `node migrations/run.js --dry-run` → должно быть “skip all” (если миграций не было).

## Smoke tests (full)
- Одновременный двойной запуск tick (две вкладки) → только один draw.
- Большой пул (10k entries) → cron работает без OOM.
- Отрубить pgcrypto (или новая база без extension) → fallback md5 работает.
- Broadcast: 429 от Telegram → батч останавливается и продолжает на следующем tick.

## Rollback (быстрый)
- Отключить авто-дроу: `auto_draw=false` на giveaways (или флагом если введёшь).
- Отключить cron внешнего триггера (QStash).
- Для проблемной миграции: *не откатываем DDL*, фикс — новой миграцией.
