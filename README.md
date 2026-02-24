# Collabka PR (@collabkaprbot)

Serverless Telegram‑бот для аккуратных коллабораций **бренд ↔ креатор**:
витрина (workspace) → запрос → диалог → статус → результат.

Документация (START HERE): `docs/README.md`.
Source of truth по текущему состоянию: `docs/00_CURRENT_STATE.md`.

> В репозитории есть legacy‑доки про старое ядро (BeautyCollabBot) — они помечены как **legacy reference** и не являются истиной.

---

## 1) Env vars
Скопируй `.env.example` и задай переменные (в Vercel):
- `APP_ENV` = `prod` или `dev`
- `BOT_TOKEN`, `BOT_USERNAME`
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- prod hardening: `WEBHOOK_SECRET_TOKEN`, `CRON_SECRET`, `SUPER_ADMIN_TG_IDS`
- support (опционально): `SUPPORT_CHAT_ID`

Полный список ENV — в `docs/00_CURRENT_STATE.md` (1:1 с `src/lib/config.js`).

---

## 2) DB migrations (exactly‑once)

```bash
npm i
npm run migrate
```

`npm run migrate` использует `migrations/run.js` и таблицу `schema_migrations`:
- применяет каждую миграцию **ровно один раз**
- проверяет **checksum** (если старую миграцию кто-то отредактировал — мигратор упадёт)

Если база уже существовала и миграции применялись раньше без трекинга — см. `docs/11_MIGRATIONS_PACK.md` и `migration_pack/README.md`.

---

## 3) Deploy to Vercel
1) Push repo в GitHub
2) Import в Vercel
3) Set env vars

Webhook endpoint:
- `POST /api/webhook`

Health:
- `GET /api/health` возвращает `{ ok: true }` + контрольные метрики

---

## 4) Set Telegram webhook
После деплоя:

```bash
curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_VERCEL_DOMAIN/api/webhook" \
  -d "secret_token=$WEBHOOK_SECRET_TOKEN"
```

---

## 5) Cron tick
Endpoints:
- `POST /api/cron/giveaways-tick`
- `POST /api/cron/broadcast-tick`

Auth (prod):
- `Authorization: Bearer $CRON_SECRET`

Пример:

```bash
curl -s -X POST "https://YOUR_VERCEL_DOMAIN/api/cron/giveaways-tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Dev mode (local polling)

```bash
npm i
node scripts/dev-polling.js
```

---

## Files
- `src/bot/bot.js` — handlers/menus/flows
- `src/bot/cron.js` — cron ticks + locks
- `src/db/*.js` — Postgres pool + queries
- `src/lib/redis.js` — Upstash Redis REST client
- `api/webhook.js` — Vercel webhook
- `api/health.js` — health/metrics
- `api/cron/*` — cron routes
