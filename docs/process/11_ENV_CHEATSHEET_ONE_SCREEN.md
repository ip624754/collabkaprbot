# 11 — ENV cheat‑sheet (Vercel) — one screen (2026‑03)

Цель: быстрый **copy/paste** конфиг для Vercel, который соответствует **текущему состоянию проекта**:
- **Instagram OAuth / IG verification выключены** (IG остаётся только как обычное поле‑ссылка в профиле креатора).
- **Ручная верификация включена** (заявка → модерация → approve/reject).
- **Audit buffer lossless** + **cooldown при DB outage** включаем для устойчивости.
- **Neon hardening**: `statement_timeout` включён (server‑side).

## Ключевые флаги (сейчас)

| Key | Prod value | Что делает |
|---|---:|---|
| `VERIFICATION_ENABLED` | `true` | Ручная верификация (единственная) |
| `IG_ROUTES_ENABLED` | `false` | Kill‑switch: закрывает `/api/ig/*` и IG‑cron |
| `IG_OAUTH_UI_ENABLED` | `false` | Прячет UI подключения IG OAuth |
| `IG_OAUTH_ENABLED` | `false` | Запрещает старт OAuth |
| `IG_VERIFY_TICK_ENABLED` | `false` | Выключает legacy comment‑verify cron |
| `WORKSPACE_EDITORS_ENABLED` | `0` | UI/роль Editors для папок (по умолчанию выключено) |

## Audit buffering / cooldown (устойчивость)

| Key | Prod value | Примечание |
|---|---:|---|
| `AUDIT_DB_ENABLED` | `true` | Пишем аудит в Postgres (как сейчас) |
| `AUDIT_DB_THROTTLE_ENABLED` | `true` | Рекомендуется: снижает INSERT‑шум |
| `AUDIT_DB_THROTTLE_LIMIT` | `60` | По умолчанию ок |
| `AUDIT_DB_THROTTLE_WINDOW_SEC` | `60` | По умолчанию ок |
| `AUDIT_DB_THROTTLE_PREFIXES` | `lead.,folders.,ws.profile_` | По умолчанию ок |
| `AUDIT_BUFFER_ENABLED` | `true` | Lossless Redis buffer → batch flush |
| `AUDIT_BUFFER_ON_DB_ERROR` | `true` | Буферим только при DB‑ошибках |
| `AUDIT_BUFFER_MAX_LEN` | `5000` | Защита от бесконечного роста |
| `AUDIT_BUFFER_TTL_SEC` | `604800` | 7 дней |
| `AUDIT_BUFFER_FLUSH_BATCH` | `250` | Баланс latency/стоимости |
| `AUDIT_BUFFER_FLUSH_MAX_MS` | `4500` | Не забиваем cron |
| `AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC` | `15` | Lock от параллельных flush |
| `AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC` | `180` | Anti‑stuck: requeue inflight |
| `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC` | `120` | STEP236: не “долбим” DB во время outage |

## Neon / Postgres hardening

> **Важно (Neon pooled / pgbouncer):** нельзя передавать startup‑параметры Postgres через `options` в `new Pool(...)`, через ENV `PGOPTIONS`, или через `DATABASE_URL` с `?options=...` — Neon pooler это отклонит. Настраиваем таймауты только SQL‑командами после подключения (`SET statement_timeout` в connect hook) и локально в тяжёлых TX (`SET LOCAL statement_timeout`).

| Key | Prod value | Примечание |
|---|---:|---|
| `PG_POOL_MAX` | `1` | Serverless‑safe |
| `PG_CONN_TIMEOUT_MS` | `10000` | |
| `PG_IDLE_TIMEOUT_MS` | `5000` | |
| `PG_STATEMENT_TIMEOUT_MS` | `15000` | STEP235: server‑side timeout |
| `PG_HEAVY_TX_STATEMENT_TIMEOUT_MS` | *(optional)* | STEP242: local `SET LOCAL statement_timeout` для тяжёлых TX (giveaways draw/finalize). Если не задан — используется `PG_STATEMENT_TIMEOUT_MS`. |

## Ключевые лимиты (пример актуального прод‑набора)

| Key | Prod value | Комментарий |
|---|---:|---|
| `INTRO_TRIAL_CREDITS` | `3` | |
| `INTRO_DAILY_LIMIT_UNVERIFIED` | `30` | как у тебя сейчас |
| `INTRO_DAILY_LIMIT` | `50` | как у тебя сейчас |
| `ACQ_TOTAL_TTL_DAYS` | `365` | TTL для `ref:*:total` (acquisition totals). `0` = хранить навсегда |
| `RATE_LIMIT_ENABLED` | `true` | infra включаем |

---


## Broadcast / QStash (429 защита)

| Key | Prod value | Примечание |
|---|---:|---|
| `BROADCAST_QUARANTINE_THRESHOLD` | `3` | Если один получатель ловит 429 N раз подряд — помечаем доставку `blocked` (чтобы рассылка не зависала). |
| `BROADCAST_QUARANTINE_SEC` | `1200` | Используется в reason/last_error (сколько «кварантин» в секундах). |
| `BROADCAST_GLOBAL_429_THRESHOLD` | `6` | Distinct получателей с 429 за окно → считаем глобальным лимитом и ставим cooldown. |
| `BROADCAST_GLOBAL_429_WINDOW_SEC` | `60` | Окно (сек) для distinct 429 получателей. |
| `BROADCAST_HARD_SKIP_TTL_DAYS` | `90` | TTL (в днях) для hard-skip списка «мёртвых» чатов (blocked/chat not found/deactivated). |
## Copy/paste block (Production recommended)

> Вставь в Vercel → Environment Variables (Production). Секреты заполни своими значениями.

```env
APP_ENV=prod
LOG_LEVEL=info
BOT_VARIANT=collab_girls

# Telegram
BOT_TOKEN=<set>
BOT_USERNAME=<set>
SUPER_ADMIN_TG_IDS=<comma-separated>

# Postgres
DATABASE_URL=<set>
# IMPORTANT (Neon pooled/pgbouncer): do NOT set PGOPTIONS and do NOT add ?options=... to DATABASE_URL.
PG_POOL_MAX=1
PG_CONN_TIMEOUT_MS=10000
PG_IDLE_TIMEOUT_MS=5000
PG_STATEMENT_TIMEOUT_MS=15000
PG_HEAVY_TX_STATEMENT_TIMEOUT_MS=

# Upstash Redis (REST)
UPSTASH_REDIS_REST_URL=<set>
UPSTASH_REDIS_REST_TOKEN=<set>

# Webhook/Cron protection (required in prod)
WEBHOOK_SECRET_TOKEN=<set>
CRON_SECRET=<set>

# Manual verification (the only one)
VERIFICATION_ENABLED=true

# Workspace folder editors (disabled by default)
WORKSPACE_EDITORS_ENABLED=0

# Instagram OAuth / verification (disabled)
IG_ROUTES_ENABLED=false
IG_OAUTH_UI_ENABLED=false
IG_OAUTH_ENABLED=false
IG_VERIFY_TICK_ENABLED=false

# Audit DB + buffering
AUDIT_DB_ENABLED=true
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_LIMIT=60
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_

AUDIT_BUFFER_ENABLED=true
AUDIT_BUFFER_ON_DB_ERROR=true
AUDIT_BUFFER_MAX_LEN=5000
AUDIT_BUFFER_TTL_SEC=604800
AUDIT_BUFFER_FLUSH_BATCH=250
AUDIT_BUFFER_FLUSH_MAX_MS=4500
AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC=15
AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC=180
AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC=120

# Rate limit (infra)
RATE_LIMIT_ENABLED=true

# Broadcast 429 protections (QStash fan-out)
BROADCAST_QUARANTINE_THRESHOLD=3
BROADCAST_QUARANTINE_SEC=1200
BROADCAST_GLOBAL_429_THRESHOLD=6
BROADCAST_GLOBAL_429_WINDOW_SEC=60
BROADCAST_HARD_SKIP_TTL_DAYS=90

# Intro limits
INTRO_TRIAL_CREDITS=3
INTRO_DAILY_LIMIT_UNVERIFIED=30
INTRO_DAILY_LIMIT=50
```
