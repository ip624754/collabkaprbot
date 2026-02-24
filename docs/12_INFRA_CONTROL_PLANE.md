# 12 — Control Plane Infra (Cron / Serverless)

## Проблема serverless
На Vercel один и тот же cron/endpoint может стартовать параллельно:
- повтор вызова,
- холодный старт + ещё одна копия,
- сетевые повторы.

Это ведёт к:
- двойному draw победителей,
- двойной рассылке,
- race conditions и лишним CU в Neon.

## Решение (многоуровневая защита от дублей)

Цель: даже если cron вызовется параллельно, Redis TTL истечёт, или будет сетевой ретрай — система должна оставаться **идемпотентной**.

### 1) Redis locks (Upstash) — token-based (safe unlock)
Глобальные замки на tick:
- `lock:giveaways_tick`
- `lock:broadcast_tick`

Реализация **token-based**: lock снимается только если token совпадает (Lua CAS). Это защищает от сценария:
TTL истёк → новый инстанс взял лок → старый инстанс в `finally` сделал `DEL` и случайно снял **чужой** лок.

### 2) Redis per-entity locks (когда есть внешние сайд‑эффекты)
Для операций, которые делают **внешний сайд‑эффект** (пост в канал, публикация результатов), добавляем per-entity lock:
- `lock:giveaway:<id>` (публикация результатов)
- `lock:official:<offerId>` (публикация/обновление/снятие поста в официальном канале)

### 3) SQL atomic guards (WHERE ... RETURNING)
Для статусных переходов и «одиночных» действий используем атомарные апдейты вида:
`UPDATE ... SET ... WHERE <ожидаемое_состояние> RETURNING id`

Это страховка на случай параллельного тика/ретрая, даже если Redis дал “дырку”.

Примеры:
- end giveaway: `WHERE status IN (...)`
- publish results: `WHERE status='WINNERS_DRAWN' AND results_message_id IS NULL`
- expire official: `WHERE status='ACTIVE'`
- broadcast transitions: `WHERE status='PENDING'` / `WHERE status='RUNNING'`

### 4) Postgres advisory lock (transaction-scoped) + row lock
Для *самой критической* операции — draw winners — внутри транзакции:
- `pg_try_advisory_xact_lock(giveaway_id)`
- `SELECT ... FOR UPDATE` по строке giveaway

Гарантия:
- один giveaway может быть “нарисован” только один раз,
- даже если Redis вырубится или будет race на уровне функций.

## Deterministic winners
Победители выбираются на стороне SQL:
- `seed = giveaway_id + ':' + ends_at_iso`
- `ORDER BY sha256(seed + ':' + user_id)` (через `pgcrypto.digest`)
- fallback: `md5` если pgcrypto ещё не стоит (временно).

Плюсы:
- 0 PRNG в Node
- 0 вытягивания 50k user_id в память
- воспроизводимо (audit-friendly)

## Broadcast: 429 cooldown + курсор
Для рассылок важно не «прожигать» Telegram rate-limit и не терять получателей.

Правила:
- На `429 Too Many Requests` **не двигаем курсор** (чтобы не пропустить user).
- Ставим **cooldown в Redis**:
  - per-broadcast: `broadcast:<id>:cooldown_until`
  - global (для DB-free early-exit): `broadcast:cooldown_until` + `broadcast:cooldown_broadcast_id`
- Следующие тики **выходят раньше**, без DB polling, пока `now < broadcast:cooldown_until`.
- `/api/health` показывает cooldown + счётчики:
  - `broadcast.last_429_at`, `broadcast.last_429_reason`
  - `broadcast.counters.cooldown_set` / `cooldown_skip` за текущий день

## Cron: notify не должен стопорить batch
Уведомления в Telegram (notify в канал/DM) могут зависать. Чтобы тик не «залипал» на одном сообщении:
- оборачиваем notify в `withTimeout(~5s)`
- при таймауте/ошибке — продолжаем обработку остальных, без hard-fail.

## Official channel publish: reserve до отправки
Публикация/обновление поста в официальном канале — внешний сайд‑эффект. Чтобы не словить дубль при деградации Redis:
- делаем **DB-reserve до отправки**: `official_posts.status='PUBLISHING'` (есть stale rescue)
- потом отправляем/редактируем сообщение
- после успеха записываем `message_id` и переводим статус в `ACTIVE`

Подробный runbook: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.

## Audit logs и стоимость Neon
`workspace_audit` и `giveaway_audit` пишутся в Postgres. При активной работе (особенно lead/folders) частые `INSERT` могут заметно жечь CU на Neon.

### Рекомендованный guardrail (без влияния на UX)
Включаем write-shedding только для «шумных» действий через Redis rate-limit (остальные действия логируются как раньше).

ENV:
- `AUDIT_DB_ENABLED=true` — включить/выключить DB-аудит целиком.
- `AUDIT_DB_THROTTLE_ENABLED=true` — включить троттлинг.
- `AUDIT_DB_THROTTLE_LIMIT=60` + `AUDIT_DB_THROTTLE_WINDOW_SEC=60` — максимум записей на (workspace × prefix) в окно.
- `AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_` — какие действия считаем «шумными» (можно расширять точечно).

### Как наблюдать эффект
Смотри `/api/health`:
- `audit.throttle.suppressed_today_total`
- `audit.throttle.suppressed_today_by_prefix`

Это Redis-only метрики: Neon не трогаем.

---

## Ops alerts (анти-спам) в Support чате

Системные алерты (payments + cron + прочее) приходят в тот же чат, что и поддержка (`SUPPORT_CHAT_ID`). Это единый «операторский инбокс».

Чтобы чат не засыпало, алерты идут **дайджестом**:
- `OPS_ALERT_SUMMARY_MIN=10` — не чаще 1 раза в N минут.
- `OPS_ALERT_SILENT=1` — «тихий режим»: в чат летят только события уровня error/failed.
- В сообщении алерта есть кнопки: **💳 ORPHANED** (список) и **🧾 #payment** (карточка платежа в админке бота).
  Плюс кнопка **👑 Админка**.

### Готовые профили (low/medium/high saving)
**LOW (мягко):**
```
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=600
```

**MEDIUM (баланс, по умолчанию):**
```
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=180
```

**HIGH (жёстко, максимум экономии):**
```
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=60
```

### Расширение префиксов (если suppressed = 0, а Neon всё равно жрёт)
Если видишь в `/api/health`, что `suppressed_today_total = 0`, но по ощущениям/Neon CU всё равно дорогие, значит список префиксов слишком узкий.

Пример расширенного набора для “операционки”:
```
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.,brand.
```

Стратегия: сначала включаем троттлинг (MEDIUM) → смотрим `/api/health` → точечно правим `PREFIXES` и лимиты.
