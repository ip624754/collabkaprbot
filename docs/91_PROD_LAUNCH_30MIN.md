# PROD LAUNCH за 30 минут (one‑pager)

> Дополнительно:
> - `docs/92_PROD_ENV_BASELINE.md` — baseline ENV для prod (без секретов)
> - `docs/93_PROD_DEPLOY_CHECKLIST.md` — операторский чеклист деплоя (health/admin)

> - `docs/94_PROD_READINESS_PACK.md` — GO/NO‑GO + incident cookbook (Redis/Neon/QStash/Payments)
Цель: безопасно выкатить **текущую версию бота** в прод и убедиться, что критические контуры (платежи/кредиты/разлок/диалоги/cron) работают.

> Важно: **IG OAuth сейчас parked и не деплоится** (см. `23_IG_CONNECT_WORKLOG_AND_RESUME.md`). На запуск продакшена это не влияет и помогает уложиться в лимит Vercel Hobby по функциям.

---

## 0) Перед стартом (2 минуты)

- У тебя есть доступы: **Vercel**, **Neon (DB)**, **Upstash Redis**, **QStash**, **Telegram Bot**.
- Знаешь прод‑домен (пример): `https://collabkaprbot.vercel.app`

---

## 1) ENV: обязательный минимум (5 минут)

Проверь в Vercel → Project → Settings → Environment Variables (обычно для **Production + Preview**).

### База и инфраструктура
- `DATABASE_URL` (Neon)
- `REDIS_URL` / `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (если используется REST)
- `CRON_SECRET` (для `/api/cron/*`)
- `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (если используется QStash)

### Telegram
- `BOT_TOKEN`
- `ADMIN_IDS` (через запятую)
- `TG_HTTP_TIMEOUT_MS` (default 5500)
- `TG_HTTP_MEDIA_TIMEOUT_MS` (default 15000)

### Монетизация/лимиты (примерно)
- `INTRO_DAILY_LIMIT_UNVERIFIED`
- `INTRO_DAILY_LIMIT`

### Фиче‑флаги (важно для безопасного запуска)
- любые `*_ENABLED`/runtime flags должны быть **в ожидаемом состоянии**
- IG: `IG_OAUTH_UI_ENABLED` должен быть **0/false** (если хотим скрыть IG)

> Если сомневаешься — сначала выключай спорные флаги, а потом включай по одному.

---

## 2) Миграции БД (5 минут)

- Применить новые миграции (Neon).
- Быстрый sanity: таблицы/колонки на месте, ошибок нет.

**Правило:** миграции должны быть **idempotent / safe**, без разрушения данных.

---

## 3) Деплой на Vercel (3 минуты)

- Deploy (или Redeploy).
- Убедись, что сборка зелёная и нет runtime ошибок.

---

## 3.5) Локальный preflight workflow перед Vercel deploy (2–3 минуты)

Запускай **локально/в CI до выкладки**:

```bash
npm install
npm run preflight
APP_ENV=production npm run preflight
```

Что это даёт:
- `npm run preflight` прогоняет обычные lint/test gates + staging smoke на degraded Redis path, стабильный `health/admin` JSON contract и source-level contracts `Админка → Операции` + `Админка → Коммуникации` + `Админка → Система` + `Админка → Founder Sale` + `Админка → QStash статус` + `Админка → Hard-skip` + `Админка → Пользователи` + `Админка → User Card + Note` + `Админка → Объявление` + `Админка → Outbox` + `Админка → Шаблоны DM` + `Админка → Payments` + `Админка → Payments fallback apply` (кнопки/action keys/footer/gates + helper screens/confirm flows/runtime prompts/strict apply contract) + warm-instance contract `Broadcast deliver → local DB overload fuse` (arming only when Redis fuse write fails; precheck before Redis/DB touch).
- `APP_ENV=production npm run preflight` проверяет, что staging smoke **безопасно skip-аются** в prod env и не пытаются делать fault-injection перед реальным релизом.

После этого можно делать deploy/redeploy на Vercel.

## 4) Health check (2 минуты)

Открой:

- `GET /api/health`

Ожидаем:
- `ok=true`
- видны статусы **DB/Redis** (`redis.read_ok/write_ok`)
- payments safety: `payments.payload_hmac_minlen_ok` и `payments.fallback_apply_effective`
- нет ошибок по “critical path”
- в Admin → Ops `Broadcast pending snapshot` выглядит ожидаемо (и при очистке помни: это только Redis snapshot)

Если health красный — **стоп**, не зовём пользователей.

---

## 5) Cron / очереди (5 минут)

### Cron endpoints
Если используешь Vercel Cron/Upstash Scheduler:
- дергает `POST /api/cron/...` с заголовком/параметром `CRON_SECRET`

Проверка:
- вручную дерни `POST /api/cron/...` (с секретом) и убедись, что:
  - возвращает `ok`
  - повторный вызов не ломает (idempotency/locks)

### QStash
- проверь, что QStash подписывает запросы и эндпоинты принимают их
- убедись, что jobs не дублируются (dedup/locks)

---

## 6) Мини‑смоук тест (8–10 минут)

Сделай по одному сценарию “бренд” и “креатор”.

### Креатор
- `/start` → выбрать роль → открыть профиль
- заполнить/обновить контакты (если включено структурное)
- создать заявку/offer (если это часть флоу)
- “Предпросмотр витрины” должен открываться без ошибок

### Бренд
- `/start` → бренд → поиск креатора/вход в витрину
- отправить запрос / начать диалог
- проверить, что не происходит “слёта” статусов при нажатии кнопок в неправильном порядке
- разлок контактов (если включено) — списание кредита 1 раз, повторный разлок не списывает

Если есть smoke‑пакеты — используй их:
- `smoke-tests_short.md`
- `smoke-tests_full.md`
- `npm run smoke:admin-notice-contract` — быстрый guard для `Админка → Объявление` (composer/runtime contract: кнопки, footer, publish/expectText flow)
- `npm run smoke:admin-outbox-contract` — быстрый guard для `Админка → Outbox` (list/view, callback/footer, repeat/template/clear confirm-flow)
- `npm run smoke:admin-payments-contract` — быстрый guard для `Админка → Payments` (list/detail, `Apply (manual)`, `Auto-heal missing_session`, callbacks/strict apply contract)
- `npm run smoke:payments-autoheal-chain-contract` — быстрый guard для chain-drain `ORPHANED missing_session` (cron first-leg enqueue → `action=orphaned_autoheal`, worker self-reenqueue, depth-limit/dedup, `/api/health` visibility)
- `npm run smoke:admin-payments-fallback-contract` — быстрый guard для `Админка → Payments fallback apply` (`EFFECTIVE/ENV/RUNTIME`, preset TTL buttons, runtime enable/disable callbacks, footer nav)

---

## 7) “OK to invite users” критерии (1 минута)

Можно звать пользователей, если:
- `/api/health` зелёный
- миграции применены
- смоук тест “бренд+креатор” пройден
- cron/очереди не дублируют и не падают
- критические фичи под флагами (если что) можно быстро выключить

---

## 8) Rollback (на всякий случай)

- Vercel: откат на предыдущий deployment
- runtime flags: выключить спорные фичи (самый быстрый safe‑mode)
- при подозрении на дубль списаний: временно отключить разлок/платежи (флагом), разобрать логи

---

## 9) Где смотреть проблемы

- Vercel logs (runtime errors)
- `/api/health` (метрики/DB/Redis)
- admin/support чат (если есть)
- документы:
  - `13_RUNBOOK_RELEASE.md`
  - `90_OWNER_RUNBOOK.md`

- `npm run smoke:admin-hard-skip-contract` — быстрый guard для `Админка → Hard-skip (dead chats)` (home/hits/view, filters/export, find/unskip, footer/nav)

- `npm run smoke:admin-users-contract` — быстрый guard для `Админка → Пользователи` (filters/search/reset/export/pagination + saved-query + CSV contract)
- `npm run smoke:admin-user-card-note-contract` — быстрый guard для `Админка → User Card + Note` (card fields/actions + DM-only notes/tags + edit/clear/tag/cancel flow)

- `npm run smoke:admin-audit-metrics-moderators-contract` — быстрый guard для `Админка → Audit / Metrics / Moderators` (audit filters/export/search + metrics windows + moderators add/remove/footer contract).

### STEP405
- If Official Publish looks stuck in `PUBLISHING`, moderators can use `🩺 Проверить статус` from the official card before attempting any manual replay.
