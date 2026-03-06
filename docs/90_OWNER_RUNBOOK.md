# 90 — Owner Runbook: как управлять проектом в проде — 2026-02-27

Этот документ — **операционная шпаргалка для владельца**.

Цель: чтобы ты мог быстро:
- понять “что где включается”,
- безопасно деплоить/катить хотфиксы,
- видеть состояние системы,
- не ловить дубли/регрессии в serverless.

---

## 1) Где что живёт

- **Vercel**: деплой serverless функций (`api/*`) + runtime для бота.
- **Neon Postgres**: вся truth‑логика (деньги, unlock, статусы, логи отправки, winners, и т.д.).
- **Upstash Redis**: locks, TTL‑состояния, счётчики, быстрые флаги.
- **QStash**: cron / async fan‑out (рассылки) / “ручные” джобы.

---

## 2) Главные принципы (которые держат прод живым)

1) **DB = источник истины.** Redis — только ускорение/UX.
2) Любая операция с внешним сайд‑эффектом (TG send, publish) должна быть **идемпотентной**:
   - token‑lock (Redis) + DB‑reserve (Postgres) там, где критично.
3) При Redis down: UI может быть fail‑open, но **мутации/деньги** — fail‑closed.
4) Не добавлять лишние DB‑запросы в горячие UI пути.

Ссылки:
- `docs/01_SECURITY_INVARIANTS.md`
- `docs/12_INFRA_CONTROL_PLANE.md`

---

## 3) Ежедневная проверка “всё ок”

### 3.1 `/api/health`

#### Что смотреть в health (сигналы деградации)
- Redis: `redis.read_ok` / `redis.write_ok` + `last_error`
- Payments: `payments.payload_hmac_minlen_ok`, `payments.fallback_apply_effective`
- Broadcast: `broadcast.db_overload`, `broadcast.tick_deferred_redis`
- QStash: `qstash.reschedule_failed`, `qstash.official_publish_stuck`

Cookbook: `docs/94_PROD_READINESS_PACK.md`.

Открываешь раз в день (или после деплоя):
- `system_status` + `no_go_reasons[]` (если NO_GO — делай то, что написано в `hint`)
- `ok:true`, `redis.read_ok/write_ok:true`
- `cron.*.last_run` (giveaways/broadcast)
- `ops.digest_preview` (быстро понять, “что болит” без захода в логи)
- если была рассылка — `broadcast.pending_deliveries` + counters (deferred/db_overload)
- если включён audit throttle — `audit.throttle.*` на месте

Полезные кнопки:
- Admin → 🧰 Операции → `🧾 Flush ops digest` (принудительно отправить сводку)
- Admin → ⚙️ Система → 🧱 Hard-skip → `🧾 Последние пропуски` (+ фильтры/экспорт)

Staging проверка деградаций:
- `SIMULATE_REDIS_DOWN=1` (только staging/dev) — быстро проверить fail-open/fail-closed (см. readiness pack).


### 3.2 Support chat (OPS)
Если подключён `SUPPORT_CHAT_ID`, то туда приходят:
- алерты по cron/payments (дайджестом)
- кнопки быстрых переходов (админка/карточки)

---

## 4) ENV: что обязательно и что опасно

### 4.1 Must-have (без этого бот не стартует)
- `BOT_TOKEN`, `BOT_USERNAME`
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `SUPER_ADMIN_TG_IDS`
- `CRON_SECRET`

### 4.2 Cost control
- `ANALYTICS_ENABLED=false` (держим выключенным)
- `AUDIT_DB_THROTTLE_ENABLED=true` + лимиты (см. `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`)

### 4.3 Флаги, которые лучше включать осознанно
- `OFFICIAL_PUBLISH_ENABLED` (публикации в официальный канал)
- `INTRO_RETRY_*` (ретраи интро)
- QStash fan‑out рассылок: `sys:broadcast_qstash_fanout` (runtime в Redis)

Полный список env и источники: `docs/00_CURRENT_STATE.md`.

---

## 5) Миграции (Neon) — безопасный порядок

Правило: миграции делаем **exactly‑once**.

- Runner: `node migrations/run.js`
- Runbook: `docs/11_MIGRATIONS_PACK.md`

Рекомендованный порядок:
1) применить миграции (Neon)
2) деплой кода (Vercel)
3) smoke‑тест

Если миграция уже применена — повторный запуск runner ничего не сломает (есть таблица применённых миграций + checksum).

---

## 6) Cron / QStash

### 6.1 Cron endpoints
- `/api/cron/giveaways-tick`
- `/api/cron/broadcast-tick`

Всегда защищены `Authorization: Bearer <CRON_SECRET>`.

### 6.2 Где смотреть расписание
В Upstash QStash / Vercel Cron — где у тебя настроено.

Важно: cron может стартовать параллельно → поэтому в коде есть token‑locks.

Ссылки:
- `docs/12_INFRA_CONTROL_PLANE.md`
- `docs/10_QSTASH_RUNBOOK.md`

---

## 7) Релизы (как “по уму”)

Перед деплоем:
- `npm run actions:check`
- `npm run test:redact`
- `node --check src/bot/bot.js` и `src/bot/cron.js`
- если есть миграции — `node migrations/run.js`

После деплоя:
- `smoke-tests_short.md`
- `/api/health` — убедиться, что `ok:true`

Ссылки:
- `docs/16_RELEASE_CHECKLIST.md`
- `docs/13_RUNBOOK_RELEASE.md`

---

## 8) Если “что-то сломалось”

> Операторская “шпаргалка” по симптомам: `docs/94_PROD_READINESS_PACK.md` → **3.0 Матрица микрофиксов**.
> Payments хвосты (missing session): там же → **3.5 runtime fallback apply** (включать только временно).


### 8.1 Redis down
- UI может частично работать.
- Любые опасные действия должны fail‑closed.
- Проверить `/api/health` и логи Vercel.

### 8.2 Подозрение на дубли (публикации/рассылки)
- Official publish: см. `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- Broadcast: см. `docs/00_CURRENT_STATE.md` (429/cooldown/deferred/quarantine)

### 8.3 Рост стоимости Neon
- включить/усилить audit throttle (см. `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`)
- проверить, не добавили ли DB‑запросы в меню/рендер

---

## 9) Instagram (на потом)

Сейчас IG‑интеграция скрыта.
Когда вернёшься:
- см. `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`
- см. `docs/22_IG_GRAPH_OAUTH_2026.md`
