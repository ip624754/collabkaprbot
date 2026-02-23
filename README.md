# Collabka PR Bot (@collabkaprbot) (v1.3.19)


> Source of truth docs: `docs/README.md` → `docs/00_CURRENT_STATE.md`

UGC/Collab CRM в Telegram:
- Workspaces = ваши каналы (профиль создателя)
- Публичная витрина по deep-link (IG → TG)
- Лиды/запросы от брендов: Inbox + статусы + история
- 🎬 UGC/офферы: лента, размещение, управление и Inbox
- 🎁 Розыгрыши (опционально): спонсоры, проверка условий, статистика
- Кураторская модель (опционально) + инвайты
- Прозрачность: детерминированный PRNG (seedHash), audit trail
- Монетизация: PRO (Stars) + Brand Pass/Plan (анти-спам)
- Модерация: очередь жалоб + audit

> Stack: Node.js (ESM) + grammY + Postgres + Upstash Redis (REST). Designed for Vercel.

## 1) Env vars
Set these in Vercel (Project Settings → Environment Variables):
- `APP_ENV` = `prod` or `dev`
- `BOT_TOKEN`, `BOT_USERNAME`
- `DATABASE_URL`
- Postgres pool hardening (optional): `PG_POOL_MAX`, `PG_CONN_TIMEOUT_MS`, `PG_IDLE_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- required for prod hardening: `WEBHOOK_SECRET_TOKEN`, `CRON_SECRET`, `SUPER_ADMIN_TG_IDS`, `SUPPORT_CHAT_ID`
- ops alerts tuning: `OPS_ALERT_SILENT`, `OPS_ALERT_SUMMARY_MIN`, `OPS_ALERT_BUFFER_MAX`
- payments support: `PAY_SUPPORT_TEXT` (shown on `/paysupport`)
- optional rate limiting (infra): `RATE_LIMIT_ENABLED`, `BX_MSG_RATE_LIMIT`, `BX_MSG_RATE_WINDOW_SEC`, `INTRO_RATE_LIMIT`, `INTRO_RATE_WINDOW_SEC`
- optional: `BOT_ID`, `PRO_STARS_PRICE`, `PRO_DURATION_DAYS`

## 2) DB migration
Run once (locally) or via a one-off script in your environment:

```bash
npm i
npm run migrate
```

`npm run migrate` использует `migrations/run.js` и таблицу `schema_migrations`:
- применяет каждую миграцию **ровно один раз**
- проверяет **checksum** (если старую миграцию кто-то отредактировал — мигратор упадёт)

Если база уже существовала и миграции применялись раньше без трекинга — см. `migration_pack/README.md` (или `docs/11_MIGRATIONS_PACK.md`).

## 3) Deploy to Vercel
1) Push repo to GitHub
2) Import to Vercel
3) Set env vars

Webhook endpoint:
- `POST /api/webhook`

Test health:
- `GET /api/health` returns `{ ok: true }`

## 4) Set Telegram webhook
After deploy:

```bash
curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_VERCEL_DOMAIN/api/webhook" \
  -d "secret_token=$WEBHOOK_SECRET_TOKEN"
```

Webhook protection is required in prod. Use `secret_token` on setWebhook and validate it in `api/webhook.js`.

## 5) Cron tick
Endpoints (GET or POST):
- `/api/cron/giveaways-tick`
- `/api/cron/broadcast-tick`

Auth (prod):
- `Authorization: Bearer $CRON_SECRET`

Example:
```bash
curl -s -X GET "https://YOUR_VERCEL_DOMAIN/api/cron/giveaways-tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Configure Vercel Cron (dashboard) or QStash to call ticks on schedule.

What it does:
- Giveaways tick: ends giveaways, draws winners (deterministic), sends notify (safe).
- Broadcast tick: sends 1 batch per tick, 429-safe cursor + Redis cooldown.

## 6) Bot UX (MVP)
- Add workspace: connect a channel by forwarding any post from that channel (bot must be admin)
- New giveaway: prize → winners count → sponsors (up to 10) → deadline → publish
- Participant: `/start gw_<id>` shows status + “🔄 Check”
- Owner: stats + export usernames + access check (bot admin?) + audit logs

## Dev mode (local polling)
```bash
npm i
node scripts/dev-polling.js
```

## Files
- `src/bot/bot.js` — handlers, menus, create flow, eligibility, stats
- `src/bot/cron.js` — tick logic + lock
- `src/bot/prng.js` — deterministic PRNG + seedHash
- `src/db/*.js` — Postgres pool + queries
- `src/lib/redis.js` — Upstash Redis REST client
- `api/webhook.js` — Vercel webhook
- `api/cron/giveaways-tick.js` — Vercel cron route
