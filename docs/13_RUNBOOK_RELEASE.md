# 13 — Runbook: Deploy / Smoke tests / Rollback

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

## Smoke tests (short)
1) `node --check src/bot/bot.js`
2) `node --check src/bot/cron.js`
3) `node migrations/run.js --dry-run` → должно быть “skip all”.
4) `GET /api/cron/giveaways-tick` (или POST) с `Authorization: Bearer <CRON_SECRET>` → 200 OK.
5) `GET /api/cron/broadcast-tick` (или POST) с Bearer → 200 OK.
6) Support: user → 💬 Поддержка → тикет приходит в `SUPPORT_CHAT_ID` с кнопками → быстрый шаблон отправляет ответ.
7) Support: ✍️ Ответить → reply на подсказку → ответ уходит пользователю + подтверждение ✅.
8) Создать giveaway → дождаться ENDED → проверить WINNERS_DRAWN; повторный запуск tick не меняет winners.

## Smoke tests (full)
- Одновременный двойной запуск tick (две вкладки) → только один draw.
- Большой пул (10k entries) → cron работает без OOM.
- Отрубить pgcrypto (или новая база без extension) → fallback md5 работает.
- Broadcast: 429 от Telegram → батч останавливается и продолжает на следующем tick.

## Rollback (быстрый)
- Отключить авто-дроу: `auto_draw=false` на giveaways (или флагом если введёшь).
- Отключить cron внешнего триггера (QStash).
- Для проблемной миграции: *не откатываем DDL*, фикс — новой миграцией.
