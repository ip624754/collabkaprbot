# Collabka PR — FEATURES (QStash/Publish/Contacts/Infra/Neon)

Собрано автоматически для NotebookLM. Обновлено: 2026-03-13 09:50:21 UTC

---

## SOURCE: `docs/10_QSTASH_RUNBOOK.md`

# 10 — QSTASH RUNBOOK (Setup / Rollout / Troubleshooting) — 2026-02-25

Назначение: документ «как включать и обслуживать QStash» без сюрпризов.

Сейчас QStash используется для **Broadcast fan-out**:
- cron `broadcast_tick` только **энкьюит** delivery‑jobs
- доставка делается воркером `POST /api/qstash/broadcast-deliver`
- идемпотентность держим через **DB guard** (`broadcast_sent_log`) + QStash dedup-id

---

## 1) Где взять значения для ENV

⚠️ Важно про зависимости:
- пакет `@upstash/qstash` должен быть в `package.json` → `dependencies`
- если его нет (например, применили hotfix zip без обновления `package.json`), то QStash‑фичи автоматически **выключаются**, но бот **не падает**


### QSTASH_TOKEN
Это Bearer‑token для публикации задач в QStash.

Где взять:
- Upstash Console → **QStash** → раздел **Token** → скопировать.

### QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY
Это секреты для проверки подписи входящих запросов (`Upstash-Signature`).

Где взять:
- Upstash Console → **QStash** → раздел **Signing Keys** → скопировать **оба** ключа:
  - `current` — активный сейчас
  - `next` — для seamless‑ротации (мы всегда держим его в env заранее)

Важно:
- эти значения **не придумываем** и **не генерим** сами — только копируем из Upstash.
- ключи считаются секретами (не логировать, не коммитить).

---

## 2) Как добавить ENV в Vercel

Vercel → Project → **Settings → Environment Variables**:

1) Добавь переменные:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`

2) Рекомендуемые окружения:
   - **Production**: обязательно
   - **Preview**: желательно (чтобы тестировать безопасно до прод)
   - **Development**: по желанию (если гоняешь локально через vercel dev)

3) Сохрани и сделай redeploy.

---

## 3) Как включить/выключить fan-out (важно)

В этом проекте нет отдельного ENV `FF_BROADCAST_QSTASH_FANOUT`.

Переключатель сделан как **runtime toggle в Redis**:
- ключ: `sys:broadcast_qstash_fanout`
- по умолчанию **OFF**

### Способ A (рекомендованный): из админки бота
1) Открой **👑 Админка**
2) Нажми кнопку:
   - `📣 QStash fan-out: ON/OFF`

### Способ B (ручной): напрямую в Redis
- поставить `sys:broadcast_qstash_fanout = "1"` → ON
- поставить `"0"` или удалить ключ → OFF

---

## 4) Быстрый self-check (10 секунд): Admin → QStash статус → signed ping

Зачем: быстро проверить, что:
- `QSTASH_TOKEN` работает (мы можем публиковать job)
- подпись `Upstash-Signature` валидируется (signing keys корректные)
- воркер доступен и доходит до нашего приложения

Шаги:
1) Открой **👑 Админка**
2) Нажми **🛰 QStash статус**
3) Нажми **🧪 Send signed ping**
4) Подожди 1–3 секунды и обнови экран статуса

Ожидаемое:
- `Ping enqueued` обновился (это мы записали в Redis на стороне бота)
- `Ping received` обновился (это пришёл подписанный запрос от QStash и прошёл verify)
- `ping status: OK`

Если `Ping received` не обновляется:
- проверяй signing keys (`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`)
- проверь, что `CFG.PUBLIC_BASE_URL` верный (QStash доставляет по абсолютному URL)

---

## 5) Рекомендуемый rollout (без регрессий)


### После деплоя
1) Держим fan-out **OFF**.
2) Прогоняем `smoke-tests_short.md`.
3) Проверяем `/api/health` (ok + cron метрики).

### Включение
1) Создай тестовый broadcast на маленькую аудиторию (5–20).
2) Включи fan-out **на 5–10 минут**.
3) Проверяй:
   - QStash: jobs публикуются/выполняются
   - `/api/health`: `broadcast.qstash_last_delivery_at` обновляется
   - Нет дублей у получателей (DB guard)

### Масштабирование
- 10% → 50% → 100% (по времени/уверенности).

### Rollback
- Переключи fan-out **OFF** — cron вернётся к старому пути.
- Воркеры могут дообработать уже опубликованные jobs (или они уйдут в ретраи/DLQ по политике).

---

## 6) Политика деградаций (фиксировано)

- **Redis down → fail-open**
  - воркер продолжает доставку
  - cooldown/метрики становятся best-effort

- **DB down → fail-closed**
  - воркер НЕ отправляет без DB guard
  - возвращает 5xx → QStash ретраит позже

- **Non-retryable Telegram → 2xx + mark failed non_retryable**
  - `blocked/chat not found/deactivated` помечаем `non_retryable=true`
  - возвращаем 200, чтобы не было бесконечных ретраев

---

## 7) Troubleshooting (быстро)

### Ошибка: `qstash_token_missing`
- не задан `QSTASH_TOKEN` в окружении

### Ошибка: `qstash_lib_missing`
- в деплое отсутствует npm‑пакет `@upstash/qstash`
- решение: добавить в `package.json` → `dependencies` и сделать redeploy

### Ошибка: `signature_invalid` / 401
- не задан(ы) signing keys
- неверные ключи (взяты не из того проекта/аккаунта)
- тело запроса проверяется не как raw body

### Массовые 429
- снизь flow control (rate/parallelism)
- проверь cooldown контур (Redis best-effort)

Поведение системы при 429 (важно):
- 429 **не является non-retryable** — получатели не “вылетают навсегда”.
- Воркер ставит **Redis cooldown** (broadcast-level) и **сам перепубликует job** с задержкой.
- Чтобы не сжигать Neon CU в момент массовых 429: воркер сначала проверяет cooldown **до DB reads**.
- Пер-recipient защита: повторные 429 по одному и тому же пользователю переводятся в **quarantine** (status=`quarantined`, retry_after_until увеличен).

Тюнинг quarantine:
- `BROADCAST_QUARANTINE_THRESHOLD` (default 3)
- `BROADCAST_QUARANTINE_SEC` (default 1200)

Микро-оптимизация воркера (Redis memo):
- `QSTASH_BC_COOLDOWN_MEMO_TTL_MS` (default 1500)

### Jobs в DLQ
- смотри `last_error` в DB (`broadcast_sent_log`)
- для `non_retryable=true` — это ожидаемо (пользователь заблокировал бота)


---

## SOURCE: `docs/12_INFRA_CONTROL_PLANE.md`

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
- `lock:ig_verify_tick`

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
- На `429 Too Many Requests` **не теряем получателя**:
  - пишем в DB `broadcast_sent_log.status='deferred'` + `retry_after_until`
  - двигаем scan-курсор вперёд (чтобы один “тяжёлый” uid не стопорил рассылку)
  - deferred доставляется позже, когда `retry_after_until <= now()`
- Если один и тот же получатель ловит `429` **N раз подряд**, переводим в **quarantine**:
  - DB: `broadcast_sent_log.status='quarantined'`
  - `retry_after_until` продлевается на `BROADCAST_QUARANTINE_SEC`
  - цель: не жечь тики на “проблемных” чатах
- Ставим **cooldown**:
  - fast path (Redis):
    - per-broadcast: `broadcast:<id>:cooldown_until`
    - global (для DB-free early-exit): `broadcast:cooldown_until` + `broadcast:cooldown_broadcast_id`
  - fallback fuse (DB, только если Redis недоступен):
    - `broadcasts.cooldown_until`, `broadcasts.cooldown_reason`
- Следующие тики **выходят раньше**:
  - обычно без DB polling (Redis-global)
  - при деградации Redis — после одного лёгкого `getActiveBroadcast` (без polling recipients)
- `/api/health` показывает cooldown + счётчики:
  - `broadcast.last_429_at`, `broadcast.last_429_reason`
  - `broadcast.counters.cooldown_set` / `cooldown_skip` за текущий день
  - `broadcast.counters.defer_set` (сколько раз поставили per-recipient defer)
  - `broadcast.counters.defer_wait` (сколько раз ждали deferred без новых получателей)
  - `broadcast.counters.quarantine_set` (сколько раз включали quarantine)

### Broadcast: QStash fan-out (serverless-safe)
Опциональный режим доставки рассылок через Upstash QStash:

- cron `broadcast_tick` **не шлёт** Telegram сам — он только **энкьюит** задачи доставки.
- доставка идёт через endpoint воркера: `POST /api/qstash/broadcast-deliver`.
- endpoint обязан проверять `Upstash-Signature` (JWT подпись). Верификация подписи делается по raw body (нельзя `JSON.stringify(object)`).
- идемпотентность: DB-truth в `broadcast_sent_log` + статусы `queued/sending/retry/deferred/quarantined/sent/failed/blocked`.

Политика деградаций (как обычно по проекту):
- Redis down → fail-open (cooldown best-effort, но DB guard остаётся главным).
- DB down → fail-closed (воркер не отправляет без DB guard, QStash ретраит позже).
- non-retryable Telegram ошибки → `2xx` + `non_retryable=true` (QStash не гоняет бесконечные ретраи).

Runtime toggle (Redis): `sys:broadcast_qstash_fanout`.

Runbook (env + rollout/rollback): `docs/10_QSTASH_RUNBOOK.md`.

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
- `AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.` — какие действия считаем «шумными» (можно расширять точечно).

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

Payments auto-heal (ORPHANED `missing_session`) дополнительно пишет алерты (дайджестом):
- `autoheal_validation_failed` — строгая валидация не прошла → помечаем `autoheal_manual_required:*` (manual review).
- `autoheal_manual_required_failed` — постоянный non-applied кейс (unsupported_payload/bad_input/user_mismatch/...).
- `autoheal_failed` — ошибки/исключения в тике.
- `autoheal_notify_failed` — apply прошёл, но уведомить пользователя не удалось.

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


---

## SOURCE: `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`

# 18 — Экономим Neon: Audit DB Throttle (write‑shedding) + мониторинг

## Зачем это нужно
В Collabka много действий, которые могут создавать *очень много* audit‑записей (особенно в `workspace_audit`). На дешёвом Neon это быстро превращается в лишние DB‑write и расход CU.

Решение: **резать только шумные audit‑события** через Redis rate‑limit (write‑shedding), *не трогая* основные продуктовые функции и не добавляя DB‑запросы в горячие UI пути.

Параллельно мы считаем **Redis‑only метрики подавления** и показываем их в `/api/health`, чтобы видеть эффект и не резать лишнее.

---

## Базовые правила (инварианты)
1) `ANALYTICS_ENABLED=false` — держим выключенным (иначе `events` добавляют DB‑write).
2) Throttle режет **только `auditWorkspace()`** (таблица `workspace_audit`).
3) **Конкурсы/розыгрыши** логируются отдельно (обычно `giveaway_audit`) и **не попадают** под этот throttle. Если когда‑то начнут жечь — делаем отдельный throttle для `auditGiveaway()` отдельным маленьким патчем.
4) Всё **safe-by-default**: если Redis недоступен — бот не падает; audit‑записи под throttle-prefix **дропаются (fail‑closed)**, а `/api/health` продолжает отвечать.

---

## Как включать на Vercel (ENV)
Минимальный набор переменных:

- `AUDIT_DB_THROTTLE_ENABLED=true|false`
- `AUDIT_DB_THROTTLE_WINDOW_SEC=60` (обычно 60 сек)
- `AUDIT_DB_THROTTLE_LIMIT=<число>`
- `AUDIT_DB_THROTTLE_PREFIXES=<список префиксов через запятую>`

Пример (стартовый, рекомендуемый):

```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=180
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.,brand.
```

> Важно: префиксы — это *только* те audit‑ключи, которые реально пишутся у тебя в `auditWorkspace(prefix+...)`.

---

## 3 готовых профиля (LOW / MEDIUM / HIGH)
Ориентир: лимит действует **на (prefix × окно времени)**, без кардинальности по workspace (метрики подавления тоже без wsId).

### 1) LOW saving (мягко, почти без потерь)
```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=600
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.
```
Подходит, если хочешь слегка успокоить всплески, но сохранять почти всё.

### 2) MEDIUM saving (баланс, обычно оптимально)
```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=180
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.
```
Рекомендуемый старт на 1–2 дня.

### 3) HIGH saving (жёстко, максимум экономии)
```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=60
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.
```
Если Neon реально горит — режем сильнее, история становится более “агрегированной”.

---

## Как смотреть эффект (только Redis, без DB)
Открой:

- `https://<твой-домен>/api/health`

И смотри блок:

- `audit.throttle.day` — день (UTC, `YYYYMMDD`)
- `audit.throttle.suppressed_today_total` — сколько audit‑insert подавлено сегодня
- `audit.throttle.suppressed_today_by_prefix` — подавление по префиксам

Быстрые ориентиры:
- **0–100/день** → почти не режет (можно LOW или вообще выключить)
- **1k–10k/день** → экономия уже заметная (MEDIUM обычно норм)
- **10k+/день** → много шума → HIGH уместен (если Neon страдает)

---

## Как расширять префиксы “по уму” (без гаданий)
Правильный порядок:

1) Ставим **MEDIUM** и 3 базовых префикса: `lead.,folders.,ws.profile_`.
2) Делаем активность 1–2 часа или 1 день.
3) Смотрим `/api/health → audit.throttle.suppressed_today_by_prefix`.
4) Если Neon всё ещё жрёт, а подавление маленькое — расширяем список префиксов точечно:

Реально часто шумят (если у тебя есть такие действия):
- `deal.`
- `inbox.`
- `brand.`

Пример расширения (баланс):
```env
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.,brand.
```

Если у тебя много действий по командам/инвайтам/таскам — добавляем **только после того, как увидим метрики**, например:
- `team.` / `invite.`
- `task.`

---

## Откат (если вдруг “перерезали”)
Откат мгновенный, без деплоя:

```env
AUDIT_DB_THROTTLE_ENABLED=false
```

Либо ослабляем:
- поднять `AUDIT_DB_THROTTLE_LIMIT`
- сократить список `AUDIT_DB_THROTTLE_PREFIXES`

---

## Что считать “готово”
- В `/api/health` видишь `audit.throttle.suppressed_*`.
- При активных кликах цифры растут.
- Neon перестал “болеть”, а UX не изменился.



---

## SOURCE: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`

# 19 — Official publish idempotency (анти-дубли)

Этот документ фиксирует, как устроена защита от дублей при публикации/обновлении/снятии офферов в официальный канал (например, **@collabka_offers**) в serverless среде.

## Почему вообще возможны дубли
- Два клика подряд (модер/две вкладки/двое модеров).
- Ретраи/повторные вызовы в serverless, когда предыдущий вызов ещё не завершился.
- TTL Redis‑лока истёк, второй процесс вошёл параллельно.

Главный риск — **двойной пост в канале** (внешний сайд‑эффект), который потом уже “не откатить” автоматически.

---

## Слои защиты (как сейчас реализовано)

### 1) Redis token‑lock per offer (быстрый взаимный эксклюзив)
- Ключ: `lock:official:<offerId>` (через `k(['lock','official', offerId])`)
- TTL: ~180s
- Лок **token‑based**: процесс снимает лок только если token совпадает → старый процесс не может удалить чужой лок после истечения TTL.

**Что даёт:** режет параллельные клики/ретраи почти до нуля.

### 2) DB‑reserve до отправки (железная страховка)
Перед любым `sendMessage/ editMessageText ...` делаем атомарный reserve в Postgres:
- `official_posts.status = 'PUBLISHING'`
- Если уже есть свежий `PUBLISHING` → **не продолжаем**, показываем “⏳ уже публикуется”.
- Если `PUBLISHING` “завис” (старше ~10 минут по `updated_at`) → разрешаем **перехват** и повтор публикации.

**Что даёт:** даже если Redis деградирует/недоступен, БД не позволит двум процессам одновременно “публиковать”.


### 2.1) STEP129: AbortSignal timeout на Telegram API (защита от hard-kill)
Мы ограничиваем ожидание ответа от Telegram (например ~5–6 секунд), используя `AbortSignal` (поддерживается grammY).

**Зачем:** если Telegram/сеть подвисают, serverless среда (Vercel) может жёстко убить функцию по таймауту. Локальный timeout позволяет быстрее перейти в обработку ошибки и не зависнуть в `PUBLISHING`.

### 2.2) STEP129: self-heal через channel_post update (закрываем “пост отправился, но message_id не сохранился”)
Даже если функция умерла *после* успешной отправки поста, Telegram всё равно доставит webhook‑апдейт `channel_post`/`edited_channel_post`.
Бот парсит `оффер #<id>` из текста/подписи и атомарно прикрепляет `message_id` в БД (`status → ACTIVE`).

**Зачем:** сокращает “дедлок” пользователя и повышает устойчивость без внешних очередей.

### 2.3) STEP214: активный self-heal (QStash verify) против “зависло в PUBLISHING”
Иногда serverless может умереть **после DB-reserve** (`status='PUBLISHING'`) и до того, как:
- успели сохранить `message_id` в БД,
- или пришёл `channel_post` webhook.

Результат: UI “залипает” в `⏳ Публикуется` и прячет действия.

Решение: после успешного reserve мы **ставим отложенную QStash‑задачу** `/api/qstash/official-publish-verify`:
- если в Redis уже известен `message_id` (по `channel_post` или сразу после `sendMessage`) — прикрепляем его в БД (переводим в `ACTIVE`),
- если `message_id` так и не появился — сбрасываем статус обратно в `PENDING` + пишем `last_error=selfheal_publish_stuck:*`, чтобы не блокировать очередь.

ENV (опционально):
- `OFFICIAL_PUBLISH_SELFHEAL_DELAY_SEC` (default 90)
- `OFFICIAL_PUBLISH_SELFHEAL_MIN_AGE_SEC` (default 75)
- `OFFICIAL_PUBLISH_SELFHEAL_MSGID_TTL_SEC` (default 3d)

> Важно: это best-effort механизм. Он не создаёт новых внешних сайд‑эффектов и не ломает публикацию, если QStash не настроен.

### 3) Финализация
После успешной публикации:
- сохраняем `message_id`
- переводим статус в `ACTIVE`

При ошибке:
- сохраняем `last_error`
- делаем best‑effort откат статуса (чтобы не зависнуть в `PUBLISHING`).

---

## Что увидит оператор (UX)
- Если идёт публикация: **⏳ Публикуется**
- Повторный клик: “⏳ Уже публикуется… попробуй позже”

---

## Что делать, если что-то пошло не так

### A) В канале появился дубль поста
1) В БД смотри канонический `message_id`:
   ```sql
   select offer_id, status, message_id, updated_at, last_error
   from official_posts
   where offer_id = $1;
   ```
2) В канале **удали лишнее сообщение вручную** (оставь то, чей `message_id` записан в БД).
3) В боте нажми **“🔄 Обновить пост”** — чтобы привести текст/кнопки к актуальному виду.

> Важно: DB‑reserve + token‑lock должны сильно снизить шанс дубля. Если он всё же случился — обычно это след “старого” поведения или ручная публикация вне бота.

### B) Зависло в `PUBLISHING`
1) Обычно это само разруливается быстро: локальный timeout + self‑heal по `channel_post` должны вернуть `ACTIVE`/разблокировать кнопку.
2) Если всё же висит — подожди 1–2 минуты и попробуй снова.
3) Если висит >10 минут — повторная публикация должна разрешиться (stale rescue по `updated_at`).
4) Если всё равно не проходит — проверь `last_error` в `official_posts` и права бота в канале.

### C) Права бота в канале / ошибки Telegram
- Если Telegram возвращает ошибку (нет прав, не админ, cannot edit, etc.) — исправь права и повтори.
- После восстановления прав достаточно нажать “✅ Опубликовать”/“🔄 Обновить”.

---

## Быстрый чек (для релиза/оператора)
- Два быстрых клика “✅ Опубликовать” → в канале **1 пост**, второй клик сообщает “уже публикуется”.
- Два быстрых клика “🔄 Обновить” → в канале **1 обновление**, без дублей.
- Два быстрых клика “📴 Снять” → одно снятие, второй клик “уже выполняется”.

## STEP405 — Manual check-now
- Added moderator-only `🩺 Проверить статус` action for `PUBLISHING`.
- The action reuses the same safe verify/self-heal logic as `/api/qstash/official-publish-verify`.
- It never republishes the offer and never bypasses the official publish token-lock.


---

## SOURCE: `docs/20_CONTACTS_MODEL.md`

# 20 — CONTACTS MODEL (Brand Pass / paywall / structured contacts)

Этот документ фиксирует **консистентную модель контактов**: где они живут, как вводятся, что считается источником истины и **когда** что показывается (до/после unlock).

Цель: монетизация контактов без bypass и без лишних DB‑запросов в hot paths.

---

## 1) TL;DR (самое важное)

- **Креатору НЕ нужно заполнять всё.** Достаточно **1 контакта** (рекомендуем Telegram). Телефон — **не обязателен**.
- **Источник истины (P2):** `workspace_settings.profile_contacts` (JSONB).
- **Legacy остаётся (для совместимости):** `workspace_settings.profile_contact` (свободный текст) продолжает работать. В UI это просто «✏️ Контакт», без слова legacy.
- **Приоритет после unlock:** structured → если пусто, показываем контакт (текстом).
- **До unlock:** контакты и внешние ссылки скрыты; `profile_about` проходит redaction (включая телефоны **цифрами и словами**).

---

## 2) Где хранятся контакты

### 2.1 Legacy поля (совместимость)
В `workspace_settings` исторически:
- `profile_contact` — свободный текст “Контакт”
- `profile_ig` — IG username
- `profile_portfolio_urls` — массив ссылок

Эти поля **не удаляем**, чтобы старые профили не ломались.

### 2.2 Structured container (P2, shipped)
В `workspace_settings`:
- `profile_contacts jsonb not null default '{}'`
- `profile_contacts_v int not null default 1`

Формат v1:
```json
{
  "tg": "username_without_at",
  "email": "name@domain.com",
  "phone": "+79991234567",
  "site": "https://example.com",
  "other": "опционально"
}
```

**Почему JSONB:** нулевые миграционные риски, не меняем архитектуру hot paths, можно расширять формат версионированием.

---

## 3) Правила ввода (валидация/нормализация на входе)

Ввод идёт через UI креатора **📇 Контакты (структурно)** и сохраняется в `profile_contacts`.

### 3.1 Telegram
Принимаем:
- `@user`
- `t.me/user`
- `https://t.me/user`

Сохраняем:
- `user` (без `@`, trim, lower‑case)

Базовые проверки:
- допустимые символы: латиница/цифры/`_`
- длина: 3..32

### 3.2 Email
- проверка “похоже на email” (`name@domain.tld`)
- сохраняем lower‑case

### 3.3 Phone
- очищаем: пробелы/скобки/дефисы/emoji
- нормализуем в `+digits`
- длина цифр: 10..15

### 3.4 Website
- если нет схемы, добавляем `https://`
- `t.me/*`, `@user`, `tg://*` **не считаем сайтом** (подсказываем перенести в TG)

### 3.5 Очистка
- UI: кнопки `🧹 Очистить` / `🧹 Очистить поле` (консистентный способ, без специальных символов).
- Для совместимости в коде поддерживается ввод `-` как скрытый шорткат (в UI не подсвечиваем).

---

## 4) UI для креатора (opt‑in, без ломки)

### 4.1 Где находится
`Профиль` → кнопка **`📇 Контакты (X/4)`**.

Внутри:
- Telegram username (рекомендуется)
- Email (опционально)
- Phone (не обязателен)
- Website (опционально)
- Очистить поле

Есть подсказки:
- “Достаточно 1 контакта — обычно Telegram. Телефон не обязателен.”
- “Приоритет после разлока: структурные → (если пусто) Контакт.”

### 4.2 Контакт (текстом) — совместимость
На главном экране профиля есть поле **`✏️ Контакт`** — это свободный текст (историческая совместимость).

Внутренне хранится в `workspace_settings.profile_contact` и используется как fallback, если `profile_contacts` пуст.

UX‑правило: мы **не** заставляем креатора заполнять всё — достаточно 1 контакта (обычно Telegram).

### 4.3 Кнопка “✨ Перенести из «Контакт»” (опционально)
Внутри **📇 Контакты (структурно)** есть кнопка **только если** `✏️ Контакт` не пуст.

Перенос работает **только при однозначном распознавании**:
- один тип (tg/email/phone/site)
- одно значение

Если в тексте намешано несколько контактов/типов — перенос **откажется**, чтобы не ошибиться.

**Важно:** перенос не перетирает уже заполненное поле (если поле занято — просим сделать вручную).

---

## 5) Что показываем бренду (paywall / unlock)

### 5.1 До unlock
- раздел “Контакты” показывает **🔒 скрыто**
- Instagram/портфолио тоже скрыты (чтобы не обходили монетизацию)
- `profile_about` прогоняется через `redactContactsInText()` (url/t.me/email/@/phones → скрыто)

### 5.2 После unlock
Показываем полный контакт‑пакет:
- Structured (если заполнен): TG / email / phone / site / other
- Legacy `profile_contact` (если есть)
- IG / портфолио (в виде ссылок)

**Приоритет:**
1) **Structured** (если заполнен хотя бы один из полей)
2) **Legacy** (если structured пуст)

**Кнопка “💬 Написать”** (brand-facing):
- 1) `https://t.me/<profile_contacts.tg>`
- 2) fallback контакт (текстом) (если распознан как t.me/https/mailto)
- 3) structured `site`

### 5.3 Owner / curator preview
- Owner всегда видит свои контакты.
- Curator preview показывает контакты **de‑linkified** (не кликабельно), чтобы помогать модерации, но не раскрывать ссылки.

---

## 6) Инварианты безопасности (что нельзя ломать)

- Unlock контактов — **DB‑truth** + **PG advisory lock** + атомарное списание кредитов (exactly‑once).
- Redis — только кеш/TTL. Если Redis упал, допускается DB fallback **только** для проверки unlock (fail‑safe).
- До unlock никаких “частичных” утечек: ни текстом, ни кнопками, ни entity‑линками.

См. также: `docs/01_SECURITY_INVARIANTS.md`.

---

## 7) Миграции / файлы

- Схема: `migrations/038_workspace_profile_contacts.sql`.
- Основная логика:
  - чтение/рендер витрины: `src/bot/bot.js` (`renderWsPublicProfile`)
  - ввод/валидация: `src/bot/bot.js` (экран `📇 Контакты (структурно)`)
  - анти‑bypass редакт: `src/bot/redactContacts.js`

---

## 8) Быстрый QA (ручной)

1) Креатор: открыть `📇 Контакты` → заполнить только TG → сохранение ок.
2) Креатор: попытаться указать `t.me/user` в Website → получить подсказку и отказ.
3) Бренд без unlock: витрина → контакты скрыты, about редактится, IG/портфолио скрыты.
4) После unlock: structured показывается; если structured пуст — показывается fallback “Контакт” (свободный текст). “💬 Написать” ведёт на TG при наличии `profile_contacts.tg`.
5) Curator preview: контакты видны, но не кликабельны.


---

## SOURCE: `docs/21_IG_VERIFY_RUNBOOK.md`

# 21 — IG VERIFY RUNBOOK (Level B) — токен + media_id — 2026-02-26

> ⚠️ **LEGACY / НЕ РЕКОМЕНДУЕТСЯ К ВКЛЮЧЕНИЮ:** Level B (комментарии с кодом под постом) создаёт bypass — бренд может собрать публичные usernames на verification‑посте.
> 
> Текущая стратегия проекта: **OAuth‑верификация (Level A / PRO)**. Этот runbook оставлен только как reference/экспериментальный вариант.

Этот runbook нужен, чтобы **включить Level B IG verification** (код‑коммент под нашим verification‑постом) в проде.

Нужно получить:
- `IG_VERIFY_ACCESS_TOKEN` — токен для чтения комментариев к нашему verification‑посту.
- `IG_VERIFY_MEDIA_ID` — ID media (поста), под которым креаторы оставляют комментарии с кодом.

> Важно: это **не OAuth креатора**. Это токен *нашего* профессионального IG аккаунта (через Page), чтобы читать комментарии к нашему посту.

---

## 0) Предусловия (без этого не взлетит)

1) Instagram аккаунт **Professional** (Business или Creator).
2) Он **привязан к Facebook Page** (Page‑backed IG account).
3) Есть доступ к Meta/FB аккаунту, который **админит эту Page**.
4) В Meta for Developers есть App (можно отдельный “Collabka Ops”).

---

## 1) Быстрый путь (рекомендуемый для старта): Graph API Explorer

Цель: быстро получить валидный токен и найти media id нужного поста.

### Шаг 1 — App + продукты
В Meta for Developers:
1) Создай App (обычно тип “Business”).
2) Добавь **Instagram Graph API** (или “Instagram” → “Instagram Graph API”, в зависимости от UI Meta).

### Шаг 2 — токен и permissions
В Graph API Explorer:
1) Выбери своё App.
2) Сгенерируй **User access token** для FB‑пользователя, который админит нужную Page.
3) Выставь permissions (минимум для чтения комментариев):
   - `instagram_basic`
   - `instagram_manage_comments`
   - `pages_show_list`
   - `pages_read_engagement`

Получившийся токен можно использовать как `IG_VERIFY_ACCESS_TOKEN`.

> Практика: чаще всего удобнее использовать **Page access token**, полученный из этого user token (см. ниже) — он лучше ложится на “Page‑backed IG” кейс.

---

## 2) Рекомендуемый вариант токена: Page access token (из user token)

1) Получи список страниц и их Page access tokens:

- `GET /me/accounts?fields=id,name,access_token,instagram_business_account`

2) В ответе найди нужную Page:
- возьми `access_token` → это **Page access token** (его и ставим в `IG_VERIFY_ACCESS_TOKEN`).
- возьми `instagram_business_account.id` → это `IG_USER_ID`.

Если `instagram_business_account` не вернулся:
- проверь, что IG аккаунт реально привязан к этой Page,
- проверь permissions из шага 1,
- иногда помогает запросить поля явнее: `GET /<PAGE_ID>?fields=instagram_business_account`.

---

## 3) Как получить `IG_VERIFY_MEDIA_ID`

Нужен media id **нашего** verification‑поста (желательно pinned).

1) Получи список последних постов:

- `GET /<IG_USER_ID>/media?fields=id,permalink,caption,timestamp&limit=50`

2) Найди verification‑пост:
- по `permalink` (самый надёжный),
- или по `caption` (например, там есть “verification / COLLABKA”).

3) Возьми `id` найденного поста → это `IG_VERIFY_MEDIA_ID`.

---

## 4) Валидация (обязательная)

Проверь, что по токену реально читаются комментарии и есть `username` автора:

- `GET /<IG_VERIFY_MEDIA_ID>/comments?fields=id,text,username,timestamp&limit=5`

Если видишь `text` и `username` — всё ок.

---

## 5) ENV в проде

В Vercel (или где держишь ENV) выставь:

```bash
IG_VERIFY_TICK_ENABLED=1
IG_VERIFY_ACCESS_TOKEN=...  # НЕ коммить, только в ENV
IG_VERIFY_MEDIA_ID=...
# optional
IG_VERIFY_COMMENTS_LIMIT=50
```

И настрой cron, который дергает:
- `GET/POST /api/cron/ig-verify-tick` с `Authorization: Bearer <CRON_SECRET>`

Рекомендуемая частота: раз в 10–15 минут.

---

## 6) Проверка в проде (после деплоя)

1) Открой `/api/health` и проверь:
   - `cron.ig_verify_tick.last_run`
   - `cron.ig_verify_check.last_run`

2) В TG админке: **👑 Админ‑панель → 📸 IG verify статус**
   - `Configured (Graph): OK`
   - видны `Tick last_run` и `Check-now last_run`

---

## 7) Траблшутинг (типовые ошибки)

### `not_configured`
Нет одного из ENV: `IG_VERIFY_TICK_ENABLED`, `IG_VERIFY_ACCESS_TOKEN`, `IG_VERIFY_MEDIA_ID`.

### `IG comments fetch failed: 400/401`
Обычно это:
- токен протух/отозван,
- не хватает permissions,
- media id неверный или не принадлежит нашему IG.

### `username` пустой
Значит токен/эндпоинт не отдаёт поле `username` (обычно из‑за прав или неправильного типа токена).
Решение:
- проверь permissions,
- попробуй использовать **Page access token** (см. раздел 2).

---

## 8) Security notes

- Никогда не вставляй `IG_VERIFY_ACCESS_TOKEN` в код/репозиторий/логи.
- Храни только в ENV.
- При подозрении на утечку — **сразу ротируй** токен.


---

## SOURCE: `docs/22_IG_GRAPH_OAUTH_2026.md`

# 22 — Instagram Graph OAuth (Business/Creator) — Runbook — 2026-02-27

Этот документ описывает **официальный** путь подключить Instagram через **Meta OAuth (Business Login)**, чтобы получить доступ к:
- профилю профессионального IG аккаунта (username, account_type),
- публикациям / комментариям / insights (в следующих шагах).

> Важно: это работает **только** для Instagram **Business или Creator** аккаунтов, которые **привязаны к Facebook Page**.
> Личные IG аккаунты Graph API не поддерживает.

⚠️ Реальность UX: даже если цель — Instagram, **вход почти всегда идёт через Meta** (и иногда выглядит как Facebook‑логин). Это нормальный официальный флоу для Page‑backed IG.

## 0) Что понадобится

- Instagram аккаунт в режиме **Professional (Business/Creator)**.
- Привязка IG → **Facebook Page** (Page-backed IG).
- Доступ к Meta Developers и Facebook аккаунту, который админит эту Page.
- Публичный домен твоего бота (например `https://your-domain.com`) — нужен для redirect URI.

## 1) Подготовка Instagram

1) Instagram → **Settings → Account → Switch to professional account**
2) Выбери **Creator** или **Business**
3) **Свяжи с Facebook Page** (обязательно)
4) Проверь, что Page реально привязана (в Meta/FB business settings видно связь)

## 2) Создание приложения Meta (Business)

1) Зайди в Meta for Developers (developers.facebook.com)
2) Create App → выбери тип **Business**
3) Заполни name/email, при наличии выбери Business Account
4) В Products добавь:
   - **Instagram Platform / Instagram Graph API**
   - **Facebook Login for Business** (если Meta UI просит)

## 3) OAuth настройки

### 3.1 Redirect URI
В настройках Login/Instagram добавь redirect URI:

- `https://<твой-домен>/api/ig/oauth/callback`

Redirect должен совпадать **точно** (включая https, слэши, путь).

### 3.2 Scopes (минимум для STEP140A)
Для базового connect + определения IG username обычно достаточно:

- `instagram_basic`
- `pages_show_list`
- `pages_read_engagement`

Практика (важно для Business Manager / Business Portfolio): часто без `business_management` Meta отдаёт **0 страниц** в `GET /me/accounts` даже при наличии `pages_show_list`.
Поэтому для стабильного получения страниц добавляем:

- `business_management`

Для будущих шагов:
- комментарии: `instagram_manage_comments`
- insights: `instagram_manage_insights`
- публикация: `instagram_content_publish` (в UI может отображаться как `instagram_content_publishing`)

> Для продакшена расширенные permissions обычно требуют **App Review**.

## 4) Токены: short-lived → long-lived

- После OAuth ты получаешь **short-lived user token** (обычно ~1 час).
- Его меняешь на **long-lived token** (обычно ~60 дней).
- Long-lived токен нужно **обновлять** (refresh) до истечения.

В нашем проекте токен хранится **шифрованно** (см. `IG_TOKEN_ENC_KEY`) и не попадает в логи.

## 5) Как Graph находит IG аккаунт (через Page)

Цепочка всегда такая:

1) Получить Pages пользователя: `GET /me/accounts`
2) Для Page получить `instagram_business_account`
3) По `ig_user_id` запросить `username`, `account_type`

Если `instagram_business_account` не находится — значит IG **не привязан** к Page или ты смотришь не ту Page.

Если `GET /me/accounts` возвращает `pages=0`:
- проверь, что permissions реально выданы (в Meta → Permissions & Features должен быть статус хотя бы “Ready for testing”)
- проверь, что FB‑пользователь добавлен в роли приложения (Admin/Developer/Tester)
- попробуй добавить `business_management` и повторить OAuth
- если Meta пишет “У вас нет доступа” — это уже ограничение/блокировка на стороне Meta (часто лечится Business Verification + App Review/Advanced access)

## 6) Checklist перед запуском

- IG профессиональный (Business/Creator)
- IG привязан к Facebook Page
- В Meta App добавлен redirect URI
- App находится хотя бы в dev/test mode и user добавлен как tester/admin
- В ENV проекта выставлены:
  - `IG_OAUTH_ENABLED=1`
  - `IG_OAUTH_CLIENT_ID=...`
  - `IG_OAUTH_CLIENT_SECRET=...`
  - `PUBLIC_BASE_URL=https://...`
  - `IG_TOKEN_ENC_KEY=...` (секрет, 32+ символов)

## 7) Частые ошибки

- **redirect_uri mismatch** → разные слэши/домен/протокол
- **no instagram_business_account** → IG не привязан к Page или нет прав на Page
- **pages=0** при `pages_show_list` → часто не хватает `business_management` или Meta не выдала доступ (роли/verification/review)
- **insufficient permissions** → нет нужных scopes или App Review не пройден
- **token expired** → нужно refresh long-lived или повторить OAuth



---

## SOURCE: `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`

# 23 — Instagram интеграция: что сделали, что сломалось у Meta и как вернуться — 2026-02-27

Этот файл — **для владельца проекта** и для будущих итераций.

Цель документа:
- зафиксировать, **какие шаги/файлы уже есть в коде**,
- объяснить, **почему сейчас IG‑интеграция скрыта**,
- дать **чёткий план возврата**, когда появится время/доступы.

> TL;DR: Comment‑верификацию (Level B) решили не использовать из‑за утечек username. Перешли на OAuth‑only (Level A), но Meta начала возвращать `pages=0` и местами блокировать доступ. Поэтому **UI скрыли**, а в STEP383 ещё и **убрали `api/ig/oauth/*` из deploy surface** (чтобы не тратить лимит Vercel Hobby). Код/миграции/доки оставили как parked-context.

---

## 1) Что было сделано (по шагам)

### 1.1 Legacy / эксперименты (Level B — комментарии)
Сделано как отдельный слой (cron + QStash), но **стратегически не включаем**.

- STEP137: cron tick `/api/cron/ig-verify-tick`
- STEP138: “⚡ Проверить сейчас” (QStash job на 1 workspace)
- STEP139: runbook + админ‑экран статуса IG verify

Док/спека:
- `docs/21_IG_VERIFY_RUNBOOK.md` (помечено как legacy)

### 1.2 OAuth‑only (Level A)
Цель: Verified badge как trust‑signal (до unlock), а `@handle` — только после unlock.

- миграция: `migrations/041_ig_oauth_accounts.sql`
- эндпоинты:
  - `GET /api/ig/oauth/start?t=...`
  - `GET /api/ig/oauth/callback?code=...&state=...`
  - `GET /api/ig/oauth/status` (диагностика)
  - `POST /api/ig/oauth/disconnect` (отвязка)
  - ⚠️ baseline до STEP382: если `IG_OAUTH_UI_ENABLED=0` → все эти роуты закрывались (404)
  - ✅ baseline STEP383: `api/ig/oauth/*` вообще не деплоятся на Vercel Hobby
- шифрование токена через `IG_TOKEN_ENC_KEY`

Док/спека:
- `docs/spec/24_IG_INTEGRATION_SPEC.md`
- `docs/22_IG_GRAPH_OAUTH_2026.md`

### 1.3 UX‑микро‑шлифовка
Чтобы не пугать словом Facebook:
- кнопка: **«🔗 Вход через Meta»**
- пояснение: почему так (Meta/FB = официальный вход для Page‑backed IG)

### 1.4 Отвязка пользователем
Добавлена возможность отключить IG прямо из бота:
- удаляем токен/связку
- выключаем Verified

---

## 2) Что сейчас (текущее состояние)

### 2.1 Почему скрыли кнопку в боте
Дополнительно в STEP383 убрали сами `api/ig/oauth/*` entrypoint-ы из deploy surface: это сняло 4 serverless function из бюджета Hobby и убрало ненужный публичный API-контур.

Meta начала:
- возвращать `pages=0` на `GET /me/accounts` даже при `pages_show_list` и `pages_read_engagement`,
- иногда показывать “У вас нет доступа” и блокировать доступ к страницам/приложению.

В результате “подключение” превращалось в лотерею и плохой UX.

**Решение:**
- UI “Верифицировать IG / Подключить Instagram” **скрыт**
- пользователю показываем: **«Эта функция пока недоступна»**
- код/миграции не удаляем, чтобы быстро вернуться позже,
- но **/api/ig/oauth/* закрыты (404)** пока `IG_OAUTH_UI_ENABLED=0` (нет “теневого API”).

### 2.2 Что остаётся включённым
- Существующий продуктовый UX (контакты/разлок/заявки/бренд‑инбокс/рассылки/официальные публикации) — без IG.
- Миграция `041_ig_oauth_accounts.sql` в базе уже применена — это ок (не мешает).

---

## 3) Что именно ломалось (симптомы)

1) На стороне callback мы видели:
- `debug: me=<id> · pages=0`
- perms granted: `pages_show_list, instagram_basic, pages_read_engagement, public_profile`

2) В окне Meta флоу пользователь:
- выбирает Page и IG аккаунт,
- подтверждает,
- Meta пишет “пользователь связан с приложением”,
- но обратно в бот мы приходим без страниц.

3) В некоторые моменты Meta показывала «У вас нет доступа» к Page/приложению.

Вывод: проблема в основном **не в коде**, а в том, какие ассеты/права Meta реально выдаёт и как она их режет по ролям/верификациям.

---

## 4) Как вернуться к IG OAuth (план)

### 4.1 Проверка Meta‑стороны (самое важное)
1) Убедись, что IG аккаунт **Professional (Business/Creator)**.
2) Убедись, что IG **привязан** к Facebook Page (в самом IG: Edit Profile → Page).
3) В Meta App:
   - Use case: **Instagram API with Facebook login** (это тот, что даёт Graph‑цепочку через Pages)
   - Redirect URI совпадает 1‑в‑1: `https://<domain>/api/ig/oauth/callback`
4) Permissions:
   - минимум: `instagram_basic`, `pages_show_list`, `pages_read_engagement`
   - **практически обязательно** (для Business Portfolio): `business_management`
5) Роли приложения:
   - для dev/test: добавь себя как Admin/Developer/Tester
6) Быстрый тест без нашего кода:
   - возьми token в Graph API Explorer
   - дерни `GET /me/accounts?fields=id,name,instagram_business_account`
   - если здесь `data=[]`, то бот тоже ничего не найдёт.

Если Meta блокирует доступ/ассеты:
- скорее всего понадобится **Business Verification** + **Advanced access / App Review** для части permissions.

### 4.2 Проверка нашей стороны (после Meta)
1) ENV (Vercel):
   - `IG_OAUTH_ENABLED=1`
   - `IG_OAUTH_UI_ENABLED=1` (пока это 0 — кнопку не покажем)
   - `IG_OAUTH_CLIENT_ID=...`
   - `IG_OAUTH_CLIENT_SECRET=...`
   - `PUBLIC_BASE_URL=https://...`
   - `IG_TOKEN_ENC_KEY=...` (32+ символов)

2) Smoke:
- открыть `GET /api/ig/oauth/status` через одноразовый `t` (бот выдаёт ссылку)
- пройти OAuth → убедиться, что в БД появилась запись `ig_oauth_accounts` и что в `profile_contacts.ig.verified=true`

### 4.3 Rollback/безопасность
- Даже если IG снова включим, **контакт остаётся paywalled** (до unlock — никакого `@handle`).
- Все ошибки в IG‑флоу должны быть **fail‑closed** (не включаем Verified “по ощущениям”).
- Токены не логируем.

---

## 5) Мини‑чеклист: “включаем обратно за 15 минут”

1) В Meta `GET /me/accounts` показывает хотя бы одну Page.
2) У Page есть `instagram_business_account.id`.
3) В ENV включаем `IG_OAUTH_UI_ENABLED=1`.
4) В боте: профиль креатора → “Вход через Meta” → callback → ✅ Verified.
5) Бренд до unlock видит только “Instagram: ✅ Verified”.

---

## 6) Где смотреть код

- OAuth endpoints: `api/ig/oauth/*`
- крипто/токены: `src/lib/*` (внутри проекта)
- bot UI: `src/bot/bot.js` (экраны профиля)
- модель контактов/paywall: `docs/20_CONTACTS_MODEL.md`



## 4) Что нужно, чтобы вернуть IG OAuth

Минимальный план возврата:
- вернуть `api/ig/oauth/start|callback|status|disconnect` в deploy surface,
- убедиться, что укладываемся в лимит функций (или перейти на Pro / объединить роуты),
- заново проверить `IG_OAUTH_*`, `IG_TOKEN_ENC_KEY`, `PUBLIC_BASE_URL`,
- прогнать ручной smoke Meta flow.

Пока это не сделано, продуктовый baseline такой: **Instagram = обычная ссылка/контакт после unlock, без OAuth**.


---

## SOURCE: `docs/24_WHAT_NEXT_BLOCKS_STYLEGUIDE.md`

# What-Next Blocks — Styleguide (UX)

Этот документ фиксирует единый стиль “что делать дальше” (what-next) блоков, чтобы UX был предсказуемым и без тупиков.

## Принципы
1) **Всегда 2–3 явных кнопки**: основное действие, “⬅️ Назад” (если есть return-to), плюс escape-hatch `📋 Меню` и/или `🏠 Home`.
2) **Без “тишины”**: после любого действия — подтверждение + следующий понятный ход.
3) **Fail-safe**: если состояние не позволяет действие (нет кредита, статус не тот) — показываем понятную причину и предлагаем альтернативу.
4) **Консистентные названия (как в runtime сейчас)**:
   - `📋 Меню` — переход в роль-хаб / меню текущего режима
   - `⬅️ Назад` — возвращает в предыдущий экран (через `ret` / backCb)
   - `🏠 Home` — хаб по роли / безопасный escape hatch
   - `❌ Отмена` / `❌ Отмена ввода` — явный выход из текстового режима

## Шаблоны
### Успех
- Заголовок: ✅ Готово
- 1 строка: что сделано (коротко)
- Кнопки: `⬅️ Назад` (если есть return-to), `📋 Меню`, `🏠 Home`

### Ошибка (recoverable)
- Заголовок: ⚠️ Не получилось
- 1 строка: причина (без тех. деталей)
- 1 строка: что сделать
- Кнопки: `🔁 Повторить`, `📋 Меню`, `🏠 Home`

### Gate (нет доступа/условий)
- Заголовок: 🔒 Доступ ограничен
- 1 строка: что нужно (например, канал/подписка/кредит)
- Кнопки: `⭐ Оформить/Купить` или recovery CTA, затем `📋 Меню` / `🏠 Home`


## Практический контракт (STEP428)
- Для обычных экранов используй единый footer helper `navKb()` / `kbNavRow()`: `⬅️ Назад` (если есть), затем `📋 Меню`, затем `🏠 Home`.
- Для текстового режима используй `navKbInput()`: `⬅️ Назад` (если есть), `❌ Отмена`, `🏠 Home`.
- Для gate/done/more-screen не прячь escape-hatch: если экран не закрывает сценарий полностью, пользователь должен видеть хотя бы `📋 Меню` и `🏠 Home`.
- Не смешивай старую формулировку `📋 Открыть меню` с текущим runtime-лейблом `📋 Меню`, чтобы docs и смоуки не расходились.


---

## SOURCE: `docs/31_FEEDS_VITRINES_CATALOGS.md`

# 31 — Discovery surfaces: витрина / лента / каталог (как это устроено)

Этот документ фиксирует, **где и что пользователь “смотрит”** в боте и почему это **не бесконечный скролл как в Instagram**.

Цель:
- единый язык для команды/поддержки/публичных объяснений;
- понимать, что является “feed”, что является “profile”, и какие у нас гарантии по производительности.

---

## 1) Что есть сейчас в боте

### A) Витрина креатора (публичный профиль канала)
**Что это:** одна публичная карточка конкретного канала/креатора (workspace).

**Как обычно открывают:**
- по ссылке/поделиться;
- из ленты офферов (бренд увидел оффер → открыл → дальше может открыть витрину);
- из поиска креаторов (кнопка типа `🔎 Поиск креаторов`).

**Важно:** это **не “лента профилей”**, а точка просмотра **одного** профиля.

---

### B) Лента креаторов для брендов (UGC / Офферы)
**Что это:** feed для бренда, но элементы ленты — это **офферы/карточки креаторов**, а не “профили подряд”.

**Путь в UI:**
- Бренд → `📰 Лента креаторов` (дальше возможны фильтры/подбор).

**Зачем так:** бренд обычно выбирает **по офферу/упаковке**, а профиль открывает уже точечно.

---

### C) Каталог брендов для креаторов
**Что это:** feed “в обратную сторону”: креатор листает **бренды**, которые заполнили профиль (обычно “4/4”).

**Путь в UI:**
- Креатор → `🏷 Каталог брендов`.

**Дальше:** креатор открывает карточку бренда и отправляет заявку.

---

### Итог (в одну строку)
- Бренды смотрят **ленту офферов креаторов**.
- Креаторы смотрят **каталог брендов**.
- “Витрина” — это **карточка одного профиля**.

---

## 2) Если в ленте 1000 элементов — как это грузится

Ничего “сразу 1000” **не грузится**.

### Лента креаторов (для брендов)
- выдача **постраничная**;
- используем `limit` + `offset` (размер страницы небольшой);
- навигация кнопками `⬅️/➡️`.

### Каталог брендов (для креаторов)
- тоже выдача **постраничная**;
- оптимизация без тяжёлого `COUNT(*)`: берём `PAGE_SIZE + 1`, чтобы понять “есть ли ещё”;
- навигация кнопками `⬅️/➡️`.

**Важно:** это сознательный дизайн под serverless и экономию Neon: никаких “бесконечных скроллов” и тяжёлых count’ов в горячем UX.

---

## 3) Почему это безопаснее для продакшена

- Горячие экраны (рендер меню/хабов/карточек) **не должны** триггерить лишние DB‑запросы.
- Пагинация кнопками даёт контролируемую нагрузку.
- Для каталога брендов используем `PAGE_SIZE+1` вместо count — это дешевле и стабильнее.

---

## 4) Официальный канал (@collabka_offers) и “автопост ленты”

Сейчас “автопоста как ленты” **нет**.

Причина: официальный канал — это зона, где важны:
- качество (анти‑спам),
- идемпотентность (анти‑дубли),
- управляемые лимиты.

Если когда‑то делать автопост — только в формате **дайджеста/featured/жёстких критериев** и с token‑lock.


---

## SOURCE: `docs/90_OWNER_RUNBOOK.md`

# 90 — Owner Runbook: как управлять проектом в проде — 2026-03-11

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
- Broadcast: `broadcast.db_overload`, `broadcast.tick_deferred_redis`, `broadcast.pending_deliveries`
- QStash: `qstash.reschedule_failed`, `qstash.official_publish_stuck`
- New hardening watchlist: local DB fuse, orphaned autoheal chain, manual official verify

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

#### Как читать новые hardening-сигналы
- **Broadcast local DB fuse**: если в `broadcast.db_overload` видны `local_fuse_active=true` / `local_fuse_until_ms`, это значит, что тёплый инстанс сам short-circuit'ит повторные доставочные вызовы после `DB overload + Redis write fail`. Это нормальный защитный режим; не надо вручную “добивать” доставку в этот момент.
- **Payments orphaned autoheal chain**: смотри `payments.orphaned_autoheal_chain_max`. Это не сигнал аварии сам по себе, а visibility, что большой хвост `ORPHANED/missing_session` теперь разгребается bounded цепочкой, а не только по одному batch за cron tick.
- **Official Publish manual verify**: если пост застрял в `PUBLISHING`, первый безопасный путь — `🩺 Проверить статус` из карточки official publish. Он не делает повторную публикацию; он только синхронизирует status / safe self-heal.


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
## 9) Короткий operator playbook: что делать, если…

### 9.1 Broadcast / DB overload + Redis degraded
1) Открой `/api/health`.
2) Смотри `broadcast.db_overload`, `broadcast.tick_deferred_redis`, `broadcast.pending_deliveries`.
3) Если local fuse активен — **не** жми повторные deliver/replay вручную; дай short-circuit/cooldown сработать.
4) Если проблема не проходит — смотри Ops digest / Vercel logs и уже потом эскалируй как infra incident.

### 9.2 Большой хвост orphaned payments
1) Открой `/api/health` и проверь payments block.
2) Помни: first batch идёт из cron, хвост может продолжаться bounded chain-drain worker'ом.
3) Не включай runtime `Payments fallback apply` без явного инцидента и причины.
4) Если хвост не уменьшается — смотри ops alert / qstash worker logs, а не пытайся “передёргивать” apply вручную массово.

### 9.3 Official Publish stuck in `PUBLISHING`
1) Открой карточку публикации.
2) Сначала нажми `🩺 Проверить статус`.
3) Только если status уже синхронизирован и есть реальная необходимость — используй следующие operator actions.
4) Не делай повторную публикацию “на всякий случай”, пока safe verify не отработал.

Ссылки:
- `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`


## 9) Instagram (на потом)

Сейчас IG‑интеграция скрыта.
Когда вернёшься:
- см. `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`
- см. `docs/22_IG_GRAPH_OAUTH_2026.md`


---

## SOURCE: `docs/92_PROD_ENV_BASELINE.md`

# Production ENV baseline

Этот документ фиксирует **рекомендованный baseline ENV для продакшена** и то, как быстро проверить, что всё применилось.

> Секреты (TOKEN/URL/KEY) никогда не коммитим в репо. Здесь только имена переменных и рекомендуемые значения.

---

## 1) Главное

- Payments fallback по умолчанию OFF.
- Включение fallback — только **временно** из админки (runtime TTL).
- HMAC подпись payload обязательна.
- Broadcast защищён: quarantine + global threshold + hard-skip.
- Neon защищён: statement_timeout + conn_timeout.
- Audit не теряется: Redis buffer + flush.

---

## 2) Recommended ENV (без секретов)

### Core
- `NODE_ENV=production`
- `LOG_LEVEL=info`
- `BOT_TOKEN=<set>`
- `PUBLIC_BASE_URL=<set>`
- `WEBHOOK_SECRET_TOKEN=<set>`
- `CRON_SECRET=<set>`
- `SUPPORT_CHAT_ID=<set>`
- `SUPER_ADMIN_TG_IDS=<set>`

### Neon / Postgres
- `DATABASE_URL=<set>`
- `PG_POOL_MAX=10`
- `PG_IDLE_TIMEOUT_MS=10000`
- `PG_CONN_TIMEOUT_MS=10000`
- `PG_STATEMENT_TIMEOUT_MS=15000`

### Upstash Redis
- `UPSTASH_REDIS_REST_URL=<set>`
- `UPSTASH_REDIS_REST_TOKEN=<set>`

### Upstash QStash
- `QSTASH_TOKEN=<set>`
- `QSTASH_CURRENT_SIGNING_KEY=<set>`
- `QSTASH_NEXT_SIGNING_KEY=<set>`
- `QSTASH_RETRY_MAX=5`

### Payments (Stars)
- `PAYMENTS_PROVIDER_TOKEN=<set>`
- `PAYMENTS_PAYLOAD_HMAC_KEY=<32+ bytes secret>`
- `PAYMENTS_PAYLOAD_HMAC_LEN=10`
- `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0`
- `PAYMENTS_FALLBACK_APPLY_ENABLED=0`

### Broadcast
- `BROADCAST_QUARANTINE_THRESHOLD=3`
- `BROADCAST_QUARANTINE_SEC=1200`
- `BROADCAST_GLOBAL_429_THRESHOLD=6`
- `BROADCAST_GLOBAL_429_WINDOW_SEC=60`
- `BROADCAST_HARD_SKIP_TTL_DAYS=90`

### Audit buffer
- `AUDIT_DB_ENABLED=true`
- `AUDIT_BUFFER_ENABLED=true`
- `AUDIT_BUFFER_ON_DB_ERROR=true`
- `AUDIT_BUFFER_MAX_LEN=5000`
- `AUDIT_BUFFER_TTL_SEC=604800`
- `AUDIT_BUFFER_FLUSH_BATCH=250`
- `AUDIT_BUFFER_FLUSH_MAX_MS=4500`

### Instagram (parked / не используем в prod baseline)
- `IG_OAUTH_ENABLED=false`
- `IG_ROUTES_ENABLED=false`
- `IG_OAUTH_UI_ENABLED=false`
- `IG_VERIFY_TICK_ENABLED=false`

> В STEP383 `api/ig/oauth/*` убраны из deploy surface. Эти ENV оставляем как legacy baseline / на случай будущего возврата.

---

## 3) Как работает управление fallback (ENV vs Admin runtime)

Итоговый флаг:
- `fallback_apply_effective = (fallback_apply_env_enabled) OR (fallback_apply_runtime_enabled)`

Правильный дефолт:
- ENV=OFF (`PAYMENTS_FALLBACK_APPLY_ENABLED=0`)
- runtime=OFF
- effective=OFF

Включение из админки:
- включаешь на 2h/12h/24h → runtime становится ON → effective ON
- TTL истекает → runtime снова OFF

---

## 4) Проверка после изменения ENV

1) Сделай redeploy Production.
2) Открой `/api/health` и проверь:
   - `payments.payload_hmac_key_configured: true`
   - `payments.fallback_apply_effective: false` (в норме)
3) Для проверки админки:
   - включи fallback на 2h
   - `/api/health` должен показать `fallback_apply_runtime_enabled: true` и `fallback_apply_effective: true`
   - выключи fallback → оба снова false


---

## SOURCE: `docs/94_PROD_READINESS_PACK.md`

# 94 — Production Readiness Pack (GO/NO‑GO + Incident Cookbook)

Цель: одна “операторская” точка правды — **как понять, что прод зелёный**, и **что делать при деградациях** (Redis/Neon/QStash/Payments), без угадываний.

Ссылки:
- Запуск за 30 минут: `docs/91_PROD_LAUNCH_30MIN.md`
- ENV baseline: `docs/92_PROD_ENV_BASELINE.md`
- Deploy checklist: `docs/93_PROD_DEPLOY_CHECKLIST.md`
- Owner runbook: `docs/90_OWNER_RUNBOOK.md`
- QStash runbooks: `docs/10_QSTASH_RUNBOOK.md`, `docs/10_QSTASH_RUNBOOK.md`
- Official publish: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- Security invariants: `docs/01_SECURITY_INVARIANTS.md`

---

## 1) GO / NO‑GO (за 60 секунд)

### GO (можно звать пользователей), если:
1) `/api/health`:
   - `ok=true`
   - `system_status="GO"` и `no_go_reasons.length == 0`  ← **главный агрегат**
   - `redis.read_ok=true` и `redis.write_ok=true`
   - `payments.payload_hmac_key_configured=true` и `payments.payload_hmac_minlen_ok=true`
   - `payments.fallback_apply_effective=false` (baseline)
   - `broadcast.db_overload.today_count` не растёт (единичные всплески ок)
   - `qstash.reschedule_failed.today_count == 0`
   - `qstash.official_publish_stuck.today_count == 0`
   - `broadcast.pending_deliveries` либо отсутствует, либо `pending_count` небольшой и **снижается**
2) В админке → **🧰 Операции**:
   - нет красных баннеров (если есть — действовать по подсказке)
   - если показан баннер “Payments fallback apply ENABLED” — это должно быть осознанно и временно
   - при сомнениях нажать **`🧾 Flush ops digest`** (получить актуальную сводку)
3) Мини‑смоук (5–10 минут): “креатор + бренд” (см. `91_PROD_LAUNCH_30MIN.md`).

### NO‑GO (не зовём пользователей), если:
- `/api/health.system_status="NO_GO"` → смотри `no_go_reasons[].hint` (что делать)
- `redis.write_ok=false` и планируется массовая операция (broadcast/cron fan‑out)
- `payments.payload_hmac_key_configured=false` или `payments.payload_hmac_minlen_ok=false`
- `payments.fallback_apply_effective=true` **без осознанного инцидента** (случайно включили)
- быстро растут counters: `broadcast.db_overload.today_count`, `qstash.reschedule_failed.today_count`, `qstash.official_publish_stuck.today_count`
- `broadcast.pending_deliveries.pending_count` долго не снижается (и/или snapshot старый) → сначала разобраться, потом трафик

## 2) Что мониторить каждый день (коротко)

### 2.1 `/api/health` (главный индикатор)
Начинай с агрегатов:
- `system_status` + `no_go_reasons[]` — готовность и **подсказки действий**
- `ops.digest_preview` — короткая “человеческая” сводка (последние причины/события)

Дальше — по блокам:
- `redis.*` — read/write/latency/last_error
- `payments.*` — HMAC ok + fallback effective + payload issues
- `broadcast.pending_deliveries` — snapshot pending доставок (раннее обнаружение “залипов”)
- `broadcast.db_overload` — load‑shedding (429) по DB overload
- `broadcast.tick_deferred_redis` — tick был отложен из‑за Redis degraded
- `qstash.reschedule_failed` — случаи, когда reschedule не удался
- `qstash.official_publish_stuck` — verify обнаружил stuck в `PUBLISHING`

### 2.2 Админка → 🧰 Операции
Это “человеческая витрина” для health + ops:
- красные баннеры = **действовать**
- жёлтые/информ = **наблюдать**
- кнопка **`🧾 Flush ops digest`** — принудительно отправить сводку сейчас (полезно после инцидента/деплоя)

### 2.3 Админка → ⚙️ Система → 🧱 Hard-skip
Если delivery “жрёт” попытки на мёртвых чатах:
- `🧾 Последние пропуски` → фильтры по reason + `🗒 Export last 200`
- ориентир: всплеск `bot_blocked/chat_not_found/user_deactivated` объясняет “почему доставка не идёт”

---

## 3) Incident Cookbook (что делать по симптомам)

### 3.0 Матрица микрофиксов (Symptom → Microfix → Verify → Rollback)

> Идея: **не думать в инцидент**. Открыл `/api/health` или Admin→Ops → нашёл симптом → сделал ровно один микрошаг → проверил → откатил/зафиксировал.

| Symptom (health / Ops) | Microfix (без ломки) | Verify (что стало лучше) | Rollback |
|---|---|---|---|
| **Redis degraded**: `redis.write_ok=false` / баннер “Redis degraded” | 1) **Не запускать массовое** (broadcast/фан-аут).<br>2) Проверить Upstash (лимиты/токен/latency).<br>3) Дождаться восстановления (не “лечить деньгами”). | `redis.read_ok/write_ok=true`, `redis.last_error=null` и перестаёт расти `broadcast.tick_deferred_redis.today_count`. | Ничего “особого” не откатываем — просто возвращаемся к штатному режиму после восстановления Redis. |
| **Broadcast tick deferred** растёт | Это следствие Redis degraded → см. строку выше. Дополнительно: временно **не стартовать новые рассылки**. | Счётчик перестал расти; новые тики идут штатно. | — |
| **DB overload**: рост `broadcast.db_overload.today_count` / таймауты Neon | 1) Дать системе “остыть” (delivery уже делает `429 + Retry-After + jitter`).<br>2) На время инцидента **не запускать большие рассылки**.<br>3) Проверить Neon compute/коннекты/pool. | Перестаёт расти `broadcast.db_overload.today_count`, исчезают DB timeout в логах. | При необходимости: временно выключить/уменьшить fan-out (runtime), отменить/отложить рассылку. |
| **QStash reschedule failed**: `qstash.reschedule_failed.today_count>0` | 1) Проверить QStash токен/подпись/HMAC.<br>2) Если растёт — считать риск “задачи могут не перепланироваться” и снижать активность (рассылки/паблиш). | Счётчик перестаёт расти; новые reschedule успешны. | Переключить контуры на “ручной режим” (минимальная активность) до восстановления QStash. |
| **Official publish stuck**: `qstash.official_publish_stuck.today_count>0` | Следовать `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.<br>Правило: **лучше подвиснуть, чем задублировать**. Не менять статусы руками. | `official_publish_stuck` не растёт; очередь уходит; verify “самовосстановил”. | Откат: отключить публикации (`OFFICIAL_PUBLISH_ENABLED=false`) до разбирательства. |
| **Payments HMAC missing/short**: `payments.payload_hmac_minlen_ok=false` | **NO‑GO.** Исправить ENV `PAYMENTS_PAYLOAD_HMAC_KEY` (≥32 байт) и redeploy. Не включать fallback. | `/api/health.payments.payload_hmac_minlen_ok=true` + `payload_issues_today.bad_sig=0`. | Вернуться к предыдущему деплою / исправить ENV и повторить. |
| **Оплата прошла, но “не применилось”** (missing Redis pay_* session) | Включить **runtime fallback apply** **временно** через админку (см. 3.5). | `payments.fallback_apply_runtime_enabled=true` (на окно), хвосты применяются; затем вернуть OFF. | Нажать **Disable** в админке (и убедиться что `fallback_apply_effective=false`, если ENV=OFF). |
| **Payments fallback apply ENABLED**: `payments.fallback_apply_effective=true` / баннер в Ops | 1) Если это **не инцидент** — сразу выключить runtime fallback в админке.<br>2) Если инцидент — убедиться, что есть `reason` + TTL/окно и после окна вернуть OFF. | В Ops исчезает баннер (или становится “OK”), `/api/health.payments.fallback_apply_effective=false`. | Disable runtime fallback; при необходимости откатить к baseline env (ENV=0). |
| **Broadcast pending “залип”**: `broadcast.pending_deliveries.pending_count>0` и не падает | 1) Открыть `/api/health.ops.digest_preview` и Admin→Ops (при необходимости нажать `🧾 Flush ops digest`).<br>2) Проверить Hard-skip HITs (всплеск мёртвых чатов) + DB overload counters.<br>3) Не стартовать новые большие рассылки до стабилизации. | `pending_count` начинает снижаться; не растёт `db_overload`; нет лавины reschedule failed. | Откат: остановить/отложить рассылку; после стабилизации повторить меньшими батчами. |
| **Hard-skip HITs spike**: резкий рост пропусков (бот блокируют/чаты мёртвые) | 1) Admin→System→Hard-skip → `🧾 Последние пропуски` + фильтры по reason.<br>2) Если причина `bot_blocked` — это ожидаемо; не “лечится”.<br>3) Если `unknown/other` растёт — смотреть delivery ошибки и лимиты. | Рост стабилизируется; понятно, почему доставка не проходит; новые попытки не жрут ресурсы. | При необходимости: вручную снять skip для конкретного tgId (точечно) или сократить TTL только для теста. |
| **Payload issues** растут: `payments.payload_issues_today.bad_sig/unsigned/bad_format` | Остановить эксперименты/маркетинг-пейлоады, проверить сигнатуру/HMAC и формат payload. Это **не лечится fallback’ом**. | Счётчики перестают расти; новые оплаты проходят без ошибок. | Откатить последние изменения payload/каталога; вернуть базовый каталог. |
| **Audit buffer** растёт: `audit.buffer.len` ↑ | Если Redis OK: дать буферу догрузиться (он batch). Если DB перегружен: сначала лечить DB overload. | `audit.buffer.len` падает к 0; нет новых `audit.buffer.on_db_error`. | Временно снизить активность/рассылки; если нужно — усилить throttle (см. `docs/18_...`). |


### 3.1 Redis degraded (read/write fail)
**Симптомы:**
- `/api/health.redis.write_ok=false` или баннер “Redis degraded”
- кнопки/кулдауны/локи ведут себя нестабильно

**Тактика:**
1) **Не запускать массовые операции.** Broadcast tick уже fail‑closed при Redis degraded.
2) Проверить Upstash: лимиты, токен, endpoint, latency.
3) Если нужно временно “снять нагрузку”:
   - уменьшить внешние входы (на период инцидента)
4) После восстановления Redis:
   - убедиться, что `redis.read_ok/write_ok=true`
   - проверить, что `broadcast.tick_deferred_redis` не растёт.

**Чего не делать:**
- не включать “магические” флаги на деньги/разлок “наугад”.

---

### 3.2 Neon / DB overload (шторм, таймауты, лимиты подключений)
**Симптомы:**
- рост `broadcast.db_overload.today_count`
- в логах: timeouts / connection limit / ECONNRESET на DB

**Тактика:**
1) Broadcast delivery уже делает load‑shedding (`429 + Retry-After`). Дай системе “остыть”.
2) Проверь Neon: compute, коннекты, pooler, statement_timeout.
3) На период инцидента:
   - не запускать большие рассылки
   - избегать тяжёлых админ‑операций

---

### 3.3 QStash reschedule failed
**Симптомы:**
- `qstash.reschedule_failed.today_count > 0`
- баннер в Admin→Ops

**Тактика:**
1) Проверить QStash: токен/ключи подписи, rate limits, outage.
2) Если сбой продолжается — считать риск “задачи могут не перепланироваться”.
3) Дальше действовать по конкретному контуру:
   - broadcast: смотреть `broadcast.db_overload` + cooldown
   - official publish: смотреть stuck verify

---

### 3.4 Official publish stuck (verify нашёл `PUBLISHING` слишком долго)
**Симптомы:**
- `qstash.official_publish_stuck.today_count > 0`
- last_offer_id/age/via в health

**Тактика:**
1) Открыть `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
2) Запустить verify endpoint (если предусмотрен) или дождаться автопрохода cron
3) Главное правило: **лучше “подвиснуть”, чем задублировать публикацию**.
4) Если нужно ручное вмешательство — только через прописанный runbook (без “перекинуть статус руками” наугад).

---

### 3.5 Payments incident (runtime fallback apply) — короткий runbook

**Когда это нужно:** Stars‑платёж успешно пришёл, но Redis `pay_*` session отсутствует/истекла (редкий хвост при деградации/таймаутах).
**Что это НЕ делает:** не “разрешает” неподписанные/битые payload’ы и не обходит DB‑guards.

#### Preconditions (перед включением)
1) `/api/health.payments.payload_hmac_minlen_ok == true` (иначе **NO‑GO**).
2) `payments.payload_issues_today.bad_sig == 0` и `unsigned == 0` (если растут — сначала лечим подпись/формат).
3) Убедись, что ENV baseline **OFF**: `PAYMENTS_FALLBACK_APPLY_ENABLED=0` (иначе runtime‑Disable не выключит effective).

#### Включение (строго time‑boxed)
1) Админка → **⚙️ Система** → **🧯 Fallback** (Payments fallback apply).
2) Нажми:
   - `🟢 2h (incident)` — для короткого хвоста (рекомендовано по умолчанию),
   - `🟢 12h (backlog)` — если накопились хвосты,
   - `🟢 24h (migration)` — только под миграции/долгую чистку.
3) Проверь `/api/health`:
   - `payments.fallback_apply_runtime_enabled == true`
   - `payments.fallback_apply_effective == true`

#### Мониторинг (пока включено)
- В Admin→Ops появится баннер “Payments: fallback apply ENABLED”.
- Смотри `payments.payload_issues_today.*` — они не должны расти.

#### Выключение (обязательно)
1) Админка → **⚙️ Система** → **🧯 Fallback** → `🧹 Disable`
2) Проверь `/api/health`:
   - `payments.fallback_apply_runtime_enabled == false`
   - `payments.fallback_apply_effective == false` (если ENV=OFF)

#### Если стало хуже
- Немедленно `Disable`, и разбираем причину: подпись payload, каталог/amount/currency, Redis деградация или DB overload.


---

## 4) Rollback (без паники)
1) Vercel: откат на прошлый deployment.
2) Runtime flags: выключить спорные фичи (особенно деньги/паблиш/массовые операции).
3) Проверить `/api/health` и Admin→Ops, что стало зелёным.

---

## 5) Мини‑DoD для релиза
Релиз считается готовым, если:
- docs обновлены (`00_CURRENT_STATE` + `WORK_HISTORY`)
- есть FULL+HOTFIX+PATCH+files list+QA
- `/api/health` зелёный на preview/prod
- смоук “креатор+бренд” пройден


---

## SOURCE: `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`

# 01 — Operator Incident Playbook (STEP406)

Короткий файл для владельца/оператора после hardening шагов STEP403–STEP405.

## 1) Где смотреть первым делом

1. `/api/health`
2. `Admin → Ops / System / Official Publish card`
3. Только потом — Vercel logs / QStash logs

Правило: **сначала health и safe operator action, потом ручные повторы**.

---

## 2) Broadcast: DB overload + Redis degraded

### Сигналы
- `broadcast.db_overload`
- `broadcast.tick_deferred_redis`
- `broadcast.pending_deliveries`
- `broadcast.db_overload.local_fuse_active=true` / `local_fuse_until_ms`

### Что это значит
Если local fuse активен, тёплый инстанс уже short-circuit'ит повторные доставочные вызовы без нового DB touch. Это защитный режим, а не “сломанный deliver”.

### Что делать
1. Открой `/api/health`.
2. Проверь, что local fuse / cooldown действительно видны.
3. Не жми manual replay/deliver “на всякий случай”.
4. Дай fuse/cooldown истечь.
5. Если проблема не уходит — смотри ops digest и infra logs.

---

## 3) Payments: большой хвост `ORPHANED / missing_session`

### Сигналы
- payments block в `/api/health`
- `payments.orphaned_autoheal_chain_max`
- ops alerts / worker logs по `orphaned_autoheal`

### Что это значит
Система теперь умеет разбирать большой хвост bounded chain-drain'ом: cron делает first leg, worker продолжает ограниченную цепочку.

### Что делать
1. Не увеличивай batch руками.
2. Не включай runtime `Payments fallback apply` без явного инцидента.
3. Дай chain-drain доработать и смотри health/ops.
4. Если backlog не уменьшается — проверяй worker/qstash path, а не запускай массовые ручные apply.

---

## 4) Official Publish stuck в `PUBLISHING`

### Сигналы
- карточка official post долго остаётся в `PUBLISHING`
- модератор не видит финальный state

### Что делать
1. Открой карточку публикации.
2. Нажми `🩺 Проверить статус`.
3. Дай safe verify/self-heal синхронизировать state:
   - ACTIVE через breadcrumb/message_id
   - либо safe reset в PENDING, если publish реально завис
4. Не делай republish “на всякий случай”, пока не отработал safe verify.

---

## 5) Чего не делать

- Не включать спорные runtime флаги без причины.
- Не делать manual replay/deliver, если health уже показывает protective fuse/cooldown.
- Не лечить `PUBLISHING` повторной публикацией до `🩺 Проверить статус`.
- Не включать payment fallback apply как “универсальную кнопку починки”.

---

## 6) Основные ссылки

- `docs/90_OWNER_RUNBOOK.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`


---

## SOURCE: `docs/ops/02_HEALTH_ONE_SCREEN.md`

# 02 — `/api/health` one-screen operator guide (STEP429)

Короткая шпаргалка: что смотреть в `/api/health` **сверху вниз**, без импровизации.

## 1) Сначала смотри только это
1. `ok`
2. `system_status`
3. `no_go_reasons[]`
4. `ops.digest_preview`

Правило: если `system_status = NO_GO`, сначала прочитай `no_go_reasons[].hint`, а не жми кнопки “на удачу”.

---

## 2) Что означает каждый верхний блок

### `ok`
- `true` — endpoint жив, JSON собрался.
- `false` / exception — сначала infra/debug, а не ручные replays.

### `system_status`
- `GO` — baseline выглядит безопасно.
- `NO_GO` — есть явный стоп-фактор для релиза / трафика.

### `no_go_reasons[]`
Это список **конкретных причин**, почему сейчас нельзя считать прод зелёным.
Ищи поля:
- `code`
- `value`
- `threshold`
- `hint`

`hint` — это первый безопасный ход.

### `ops.digest_preview`
Это короткая operator-сводка: последние причины, топ-спайки, свежие тревоги.
Если нужен свежий срез после инцидента — в админке жми `🧾 Flush ops digest`.

---

## 3) Дальше смотри по контурам

### Redis
Смотри:
- `redis.read_ok`
- `redis.write_ok`
- `redis.latency_ms`
- `redis.last_error`

Если Redis degraded:
- не запускай массовые операции;
- mutating callbacks должны оставаться fail-closed;
- сначала восстанови Redis, потом трогай рассылки/ручные apply.

### Payments
Смотри:
- `payments.payload_hmac_key_configured`
- `payments.payload_hmac_minlen_ok`
- `payments.fallback_apply_env_enabled`
- `payments.fallback_apply_runtime_enabled`
- `payments.fallback_apply_effective`
- `payments.payload_issues_today.*`

Первый safe action:
- если fallback effective включён без инцидента — выключить runtime fallback в админке;
- если HMAC key не configured / слишком короткий — это **NO-GO**, лечится ENV + redeploy.

### Broadcast
Смотри:
- `broadcast.pending_deliveries`
- `broadcast.db_overload.*`
- `broadcast.tick_deferred_redis.*`
- `broadcast.cooldown_until` / `retry_after_sec`

Первый safe action:
- при overload / cooldown не стартуй новые рассылки;
- дай системе самой short-circuit / reschedule path отработать.

### QStash / Official Publish
Смотри:
- `qstash.reschedule_failed.*`
- `qstash.official_publish_stuck.*`
- `broadcast.pending_deliveries` вместе с qstash counters

Первый safe action:
- для stuck publish сначала `🩺 Проверить статус`, а не republish;
- для reschedule failed — проверить QStash keys / delivery path, а не дёргать ручные повторы пачками.

### Ops / Audit visibility
Смотри:
- `ops.digest_preview`
- `audit.buffer.*` (если есть)
- operator banners в Admin → Ops

Первый safe action:
- если есть красный баннер в админке, действуй по нему раньше, чем по логам.

---

## 4) Быстрые safe actions по симптомам

### `system_status = NO_GO`
1. Прочитать `no_go_reasons[].hint`.
2. Не звать пользователей и не запускать новые mass actions.
3. Устранить ровно верхнюю причину, потом обновить `/api/health`.

### `payments.fallback_apply_effective = true`
1. Убедиться, что это осознанный инцидентный режим.
2. Если нет — выключить runtime fallback.
3. Проверить, что effective снова `false`.

### `broadcast.pending_deliveries.pending_count` завис
1. Посмотреть `db_overload`, `tick_deferred_redis`, `ops.digest_preview`.
2. Проверить Hard-skip HITs report.
3. Не стартовать новые большие broadcast.

### `qstash.official_publish_stuck.today_count > 0`
1. Открыть карточку публикации.
2. Нажать `🩺 Проверить статус`.
3. Не делать republish до verify/self-heal.

---

## 5) Чего не делать
- Не лечить `NO_GO` ручными реплеями “на всякий случай”.
- Не включать fallback apply как универсальную кнопку починки.
- Не давить новые рассылки во время cooldown / DB overload.
- Не обходить `🩺 Проверить статус` ручной перепубликацией.

---

## 6) Связанные документы
- `docs/90_OWNER_RUNBOOK.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`


---

## SOURCE: `docs/process/10_RELEASE_PREFLIGHT.md`

# 10 — Release Preflight (QA fast) — 2026-02-28

Цель: перед деплоем/мерджем быстро прогонять минимальный набор проверок, чтобы не ловить “сюрпризы” в проде.

## Команда

```bash
npm ci
npm run preflight
# или
npm run qa:fast
```

> Если работаешь из свежего ZIP/snapshot checkout без `node_modules`, сначала обязательно поставь зависимости. Начиная с STEP420 preflight валится на этом сразу и явно, а не позже внутри deep smoke/import chain.

## Что проверяет

1) `actions:check`  
   Гарантирует, что все callback action keys, которые реально используются в UI/боте, присутствуют в `src/bot/actionRegistry.js` (и guard-логика согласована).

2) `actions:md` + check “не грязно”  
   Генерирует `docs/02_ACTION_KEYS_REGISTRY.md` и проверяет, что файл **не изменился** по сравнению с текущим содержимым.  
   Если изменился — значит документация реестра устарела: нужно закоммитить обновлённый файл.

3) `lint:nav`  
   Проверяет, что в ключевых экранах нет “тупиков” навигации (footer/back‑ряд соблюдён по стандарту).

4) `test:redact`  
   Проверяет, что маскирование контактов работает корректно (не утечки email/phone/etc. в публичных местах).

5) `lint:public-contacts`  
   Grep‑gate на регрессии в **публичных (brand‑facing) рендерах**: запрещает возвращать прямое отображение пользовательского текста, который может содержать контакты, до unlock.  
   Сейчас проверяет два ключевых инварианта в `src/bot/bot.js`:
   - `renderBxPublicView`: `barter_offers.description` редактируется для non‑owners до unlock.
   - `renderWsPublicProfile`: `ws.profile_about` редактируется для non‑owners до revealContacts.

6) `lint:redis-atomic`  
   Grep‑gate на регрессии: запрещает возвращать в runtime‑код неатомарные связки Redis-команд (например `LPUSH+LTRIM(+EXPIRE)`, `INCR+EXPIRE`, `LRANGE+LTRIM`) вне `src/lib/redis.js`.  
   Это защищает от “immortal keys” и race‑окон, которые мы уже один раз закрывали.

7) `lint:redis-ttl`  
   Grep‑gate на регрессии: запрещает появление `redis.set(a, b)` без TTL (двухаргументный `set`) в runtime‑коде.  
   Исключения (намеренно persistent) должны быть явно помечены комментарием `TTL-LINT: ...`.

8) `lint:redis-exports`  
   Защита от build‑regression: гарантирует, что `src/lib/redis.js` экспортирует обязательные helper’ы (`incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`).  
   Это предотвращает падение на Vercel при загрузке ESM модулей с ошибкой вида `does not provide an export named ...`.

9) **Node syntax check (`node --check`)**  
   Запускает `node --check` по ключевым entrypoint‑ам (`src/bot/bot.js`, `api/webhook.js`, `api/cron_router.js`, и т.д.), чтобы ловить **SyntaxError на cold start** (например, случайный literal newline внутри строки `'...'`) ещё **до** деплоя.

10) **Admin → Ops keyboard/actions contract smoke**  
   Source-level smoke `scripts/smoke-admin-ops-contract.js` проверяет, что экран `Админка → Операции` сохраняет операторский контракт: основные кнопки (`Пользователи/Платежи/Рассылка/Аудит/Метрики`), служебные действия (`Flush ops digest`, `Clear pending snapshot`), footer (`Админка / Меню / Home`), confirm-flow очистки snapshot и health-кнопку только за `PUBLIC_BASE_URL`. Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

11) **Admin → Comms keyboard/footer contract smoke**  
   Source-level smoke `scripts/smoke-admin-comms-contract.js` проверяет, что экран `Админка → Коммуникации` сохраняет операторский контракт: primary row (`Объявление / Шаблоны DM`), `Outbox`, условный gate `Офиц.канал (${pending})` только при `OFFICIAL_PUBLISH_ENABLED`, а также footer (`Админка / Меню / Home`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

12) **Admin → System keyboard/footer contract smoke**  
   Source-level smoke `scripts/smoke-admin-system-contract.js` проверяет, что экран `Админка → Система` сохраняет операторский контракт: summary-строки (`Платежи`, `Match/Feat auto-apply`, `Payments fallback apply`, `Broadcast fan-out (QStash)`, `Founder Sale`), keyboard rows для payment toggles / Match-Feat+Fallback / QStash / Hard-skip / Founder / moderators / gift subscription и footer (`Админка / Меню / Home`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

13) **Admin → Founder Sale contract smoke**  
   Source-level smoke `scripts/smoke-admin-founder-contract.js` проверяет отдельный operator-flow `Админка → Founder Sale`: summary/status блок (`Источник настроек`, `ENABLED`, `DEADLINE`, `STATUS`, `⏳ Осталось`, `Цены / кредиты`), control rows (`toggle`, `Дедлайн/Цены`, `Кредиты/Сброс`, `Ссылки/Тексты`), footer (`Система / Меню / Home`), а также helper screens `Founder Sale — ссылки` и `Founder Sale — тексты (copy/paste)` с presets `fs_offers_a/fs_offers_b/fs_gw_brand/fs_gw_creator`. Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

14) **Admin → Notice composer/runtime contract smoke**  
   Source-level smoke `scripts/smoke-admin-notice-contract.js` проверяет отдельный operator-flow `Админка → Объявление`: summary/status блок (`STATUS`, `SEVERITY`, `TARGET`, `EXPIRES`, `CTA`, `VERSION`, preview текста), control rows (`toggle/severity`, `target/expire`, `CTA/text`, `clear/publish`), footer (`Коммуникации / Меню / Home`) и runtime-contract (`clearExpectText/clearDraft` на входе, `severity/target` cycles, composer prompts для `CTA/Expire/Text`, publish requires text + `version++` + `active=true`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

15) **Admin → Outbox contract smoke**  
   Source-level smoke `scripts/smoke-admin-outbox-contract.js` проверяет отдельный operator-flow `Админка → Outbox`: list/view экраны (`Outbox`, `Redis-only`, privacy hint для non-DM, per-entry кнопки, pagination, `Очистить`, footer `Коммуникации / Меню / Home`), quick-actions (`Карточка / Написать / Повторить / Заметка / В шаблон`) и callback/confirm-flow (`clearExpectText` на входе, DM-only guard для repeat/save-to-template, preview send controls, `Очистить Outbox?` confirm screen, clear → rerender list). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

16) **Admin → DM Templates contract smoke**  
   Source-level smoke `scripts/smoke-admin-dm-templates-contract.js` проверяет отдельный operator-flow `Админка → Шаблоны DM`: list/view экраны (`Шаблоны сообщений (DM)`, `Источник`, `Версия`, `Обновлено`, per-template buttons, `Новый шаблон`, `Сбросить к дефолту`, pagination, `Вставить`, footer `Коммуникации / Меню / Home`), add/edit/delete/reset flow (`clearExpectText`, стабильные prompts, confirm screens, `version++`, возвраты в list/view) и связку с `Outbox → В шаблон` (`Открыть шаблон / Шаблоны DM / Outbox`, DM-only guard, clipping warning). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

17) **Admin → Payments contract smoke**  
   Source-level smoke `scripts/smoke-admin-payments-contract.js` проверяет отдельный operator-flow `Админка → Payments`: list-screen (`Payments • STATUS`, `Платежей нет.`, per-payment buttons, ORPHANED-only `Auto-heal missing_session`, pagination, `Операции`), detail-screen (`Payment #id`, `Status/Kind/User/Amount/Created`, spoiler-блоки `Charge/Payload/Note`, условный `Apply (manual)`, `К списку / Операции`) и callback/runtime contract (`a:admin_payments/view/apply/autoheal`, `clearExpectText`, strict validation, DB claim before apply, block/error alerts, auto-heal только для `ORPHANED missing_session`, summary alert). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

18) **Admin → Payments Fallback contract smoke**  
   Source-level smoke `scripts/smoke-admin-payments-fallback-contract.js` проверяет отдельный operator-flow `Админка → Payments fallback apply`: summary/status блок (`EFFECTIVE / ENV / RUNTIME`, TTL hint, инцидентный guidance, runtime details `Enabled by / At / Until / Reason`), control rows (`2h incident / 12h backlog / 24h migration`, условный `Disable`) и footer (`Система / Админка / Меню / Home`). Дополнительно валидируются callback/runtime contract `a:admin_pay_fb / a:admin_pay_fb_set / a:admin_pay_fb_off` (admin gate, `setPaymentsFallbackRuntime`, success/failure toasts) и связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

19) **Admin → QStash Status contract smoke**  
   Source-level smoke `scripts/smoke-admin-qstash-status-contract.js` проверяет отдельный operator-flow `Админка → QStash статус`: summary/status экран (`🛰 QStash — статус`, `Lib`, `ENV token/signing/base_url`, `Fan-out`, `Broadcast tick`, `Worker last delivery`, `Ping received/enqueued`, `Broadcast cooldown`), keyboard/footer (`Send signed ping`, `Fan-out toggle`, `Система / Меню / Home`) и callback/runtime contract `a:admin_qstash_status / a:admin_qstash_ping` (admin gate, missing lib/token/base_url screens, Redis breadcrumbs `last_enqueued_*`, `qstashPublishJSON` с `signed_ping` + dedup/timeout, success rerender). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

20) **Admin → Hard-skip contract smoke**  
   Source-level smoke `scripts/smoke-admin-hard-skip-contract.js` проверяет отдельный operator-flow `Админка → Hard-skip (dead chats)`: home/hits/view экраны (configured TTL, `Найти TG ID`, `Последние пропуски`, filters, `Export last 200`, quick TG buttons, `Снять hard-skip`) и их фактическую навигацию/footer. Дополнительно валидируются callback/runtime contract `a:hs_home / a:hs_hits / a:hs_find / a:hs_view / a:hs_unskip / a:hs_hits_export` (`hs_find` expectText/backCb, bounded export helper `adminHardSkipHitsExport`, TXT export document + rerender toast) и связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

21) **Admin → Users contract smoke**  
   Source-level smoke `scripts/smoke-admin-users-contract.js` проверяет operator-flow `Админка → Пользователи`: list-screen (`Пользователи · фильтр · стр`, spoiler-строку поиска, empty-state, DM-only quick actions `Карточка / Написать / Заметка` при 1–5 результатах, filter/search/reset/export/pagination, `Операции`), search/reset callbacks (`a:admin_users / a:admin_users_search / a:admin_users_reset`, `clearExpectText`, сохранённый Redis-query, footer `Система / Меню / Home`) и CSV export contract (`a:adm_ucsv`, `exportUsersDirectory`, стабильный header/filename/caption, truncation warning, back buttons `К списку / Админка`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

22) **Admin → User Card + Note contract smoke**  
   Source-level smoke `scripts/smoke-admin-user-card-note-contract.js` проверяет operator-flow `Админка → User Card + Note`: card-screen (`Карточка пользователя`, ID/TG ID/Username/Роли, DM-safe snippet/tags block, actions `Скопировать ID / Написать / Заметка / Подарить подписку`, revoke/ban toggles, back buttons `К списку / Операции`), note-screen (`Заметка (admin)`, DM-only guard, tags summary + toggle rows, `Изменить текст / Очистить всё / К карточке`, optional return-route button, footer `Коммуникации|Операции / Меню / Home`), note callbacks (`a:adm_ucard / a:adm_unote / a:adm_unote_edit / a:adm_unote_clear_q / a:adm_unote_clear / a:adm_unote_tag`) и `expectText` flow `adm_user_note` (`clear/cancel`, save helper с metadata, возврат в `Карточка/Заметка`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

23) **Broadcast deliver → local DB overload fuse contract smoke**  
   Source-level smoke `scripts/smoke-broadcast-local-db-fuse.js` проверяет, что в `api/qstash/broadcast-deliver.js` есть warm-instance local fuse для редкого сценария `DB overloaded + Redis unavailable`: module-level state `localDbDegradedUntilMs`, helpers `getLocalDbOverloadFuseTtlMs/getLocalDbOverloadFuseUntilMs/armLocalDbOverloadFuse`, arming local fuse только при провале записи Redis-fuse, precheck `local_fuse_precheck` **до** Redis fuse read и **до** `db.getBroadcast(...)`, а `respondDbOverloadFuse(...)` маркирует путь флагом `local_fuse`. Это ловит регресс, при котором warm instance продолжает жечь Neon, хотя Redis уже недоступен и локальный short-circuit должен сработать.

11. `npm run smoke:payments-autoheal-chain-contract`

   Source-level smoke `scripts/smoke-payments-autoheal-chain-contract.js` проверяет bounded chain-drain для больших очередей `ORPHANED missing_session`: `src/lib/config.js` должен экспортировать `PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX`, `/api/health` — показывать `payments.orphaned_autoheal_chain_max`, `src/bot/cron.js` — публиковать first-leg continuation (`action='orphaned_autoheal'`, `chain_depth=1`, `chain_source='cron'`, `dedup=mon:autoheal:*`) только на полном batch, а `api/qstash/monetization-retry.js` — иметь worker branch `orphaned_autoheal`, который повторно claim’ит batch через `claimOrphanedMissingSessionPaymentsForAutoheal(...)`, self-reenqueue’ит следующую bounded leg с depth-limit/dedup и не трогает existing exactly-once guards fallback-apply. Это ловит тихий регресс, при котором backlog снова разбирается только по одному batch за tick или цепочка уходит в бесконечный reenqueue.

24) **ENV baseline contract smoke**  
   Source-level smoke `scripts/smoke-env-baseline-contract.js` проверяет, что `.env.example`, `docs/92_PROD_ENV_BASELINE.md` и `src/lib/config.js#assertEnv()` не расходятся по текущему prod/release baseline: используются актуальные имена `PUBLIC_BASE_URL` / `SUPER_ADMIN_TG_IDS`, в example присутствуют критичные QStash / payments / broadcast / audit / parked-IG ключи, а безопасные дефолты `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0` и `PAYMENTS_FALLBACK_APPLY_ENABLED=0` не разъехались. Если рядом есть локальный prod-like `.env*`, smoke дополнительно падает сразу на missing required keys вместо позднего runtime сюрприза.

25) **Creator current-channel contract smoke**  
   Source-level smoke `scripts/smoke-creator-current-channel-contract.js` фиксирует текущую creator IA: `📋 Меню` = current-channel menu, top row `🔁 Сменить канал` + `📂 Текущий канал`, `ws_open = Работа с каналом`, `ws_settings = Настройки канала`, quick verification entrypoint живёт в settings как `✅ Верификация аккаунта`, а creator current/no-active screens не протекают role-switch/share/verification utility CTA обратно в рабочее меню.

26) **Telegram share URL compatibility contract smoke**  
   Source-level smoke `scripts/smoke-share-url-compat-contract.js` проверяет совместимый share contract для `📨 Отправить` и curator invite `📤 Поделиться`: share URL должен оставаться в формате `t.me/share/url?url=<U+2060>&text=...`, без регресса к `...share/url?text=...` или `url=&text=...`, а связанные action keys должны сохранять свои guards. Это ловит очень неприятные Telegram-client regressions, когда кнопка выглядит живой, но при нажатии «молчит».

## Дополнительный ранний gate (STEP420)

Перед всеми deep smoke `scripts/preflight.js` теперь делает **local dependency install guard**:
- читает declared dependencies из `package.json`;
- проверяет, что они реально резолвятся из текущего checkout;
- если зависимостей локально нет, падает сразу с явным install hint (`npm ci` / `npm install`).

Это не runtime-check и не бизнес-логика. Цель только одна: свежий архив/снимок должен ломаться сразу и понятно, а не через поздний `ERR_MODULE_NOT_FOUND` внутри staging smoke.

## После зелёного preflight: быстрый operator sanity (1 минута)

Preflight ловит regressions до деплоя, но после выкладки оператор должен помнить ещё три практических правила:
- если health показывает `broadcast.db_overload.local_fuse_active=true`, не жми повторные deliver/replay — local fuse уже защищает warm instance от лишнего DB touch;
- если виден большой хвост `ORPHANED/missing_session`, помни про bounded chain-drain (`payments.orphaned_autoheal_chain_max`) и не включай runtime fallback apply без явного инцидента;
- если Official Publish завис в `PUBLISHING`, первый safe action — `🩺 Проверить статус`, а не manual republish.

См. также:
- `docs/90_OWNER_RUNBOOK.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`

## Если preflight упал

- На `Missing local npm dependencies required for full preflight` → это install/tooling issue, а не runtime-regression: запусти `npm ci` (или `npm install`, если checkout частично установлен), затем повтори preflight.
- На `actions:md changed` → закоммить `docs/02_ACTION_KEYS_REGISTRY.md` и повторить.
- На `lint:nav` → поправить клавиатуру/футер по `docs/process/09_ADMIN_UX_STANDARD.md`.
- На `test:redact` → поправить редактирование/маскирование, не допуская “полных” контактов.
- На `lint:public-contacts` → проверь публичные карточки/витрины: пользовательский текст (описания) должен идти через `redactContactsInText` до unlock.
- На `lint:redis-atomic` → перенести операции на helpers из `src/lib/redis.js` (или на Lua‑атомарность), не оставлять fallback‑цепочки.
- На `lint:redis-ttl` → добавь TTL (`{ ex: ... }`) для `redis.set`, либо явно отметь intentional persistence комментарием `TTL-LINT: ...`.
- На `lint:redis-exports` → проверь `src/lib/redis.js`: в нём должны быть named exports для `incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`.
- На `Admin → Ops keyboard/actions contract` → проверь `renderAdminOps()` и confirm-flow `a:admin_ops_pending_clear`, затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons.
- На `Admin → Comms keyboard/footer contract` → проверь `renderAdminComms()` и gate `OFFICIAL_PUBLISH_ENABLED`, затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons/footer.
- На `Admin → System keyboard/footer contract` → проверь `renderAdminSystem()` и состав operator rows (`payments/match-fallback/qstash/hard-skip/founder/moderators/gift`), затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons/footer.
- На `Admin → Founder Sale contract` → проверь `renderAdminFounder()` + helper screens `renderAdminFounderLinks()/renderAdminFounderTexts()` и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons/footer/deep-link presets.
- На `Admin → Notice composer/runtime contract` → проверь `renderAdminSysNotice()`, callback handlers `a:admin_notice*` и `expectText` flow (`admin_notice_text/cta/expire`), чтобы не потерять кнопки, footer, publish-guard, `version++`, `active=true` и post-save follow-up сообщения.
- На `Admin → Outbox contract` → проверь `renderAdminOutbox()/renderAdminOutboxView()`, callback handlers `a:admin_outbox*`, DM-only guard для `repeat/save-to-template`, preview buttons, clear-confirm screen и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/footer actions.
- На `Admin → DM Templates contract` → проверь `renderAdminDmTemplates()/renderAdminDmTemplateView()`, callback handlers `a:admin_umsg_tpl*`, add/edit/delete/reset prompts и confirm flows, `adm_outbox_tpl_label` связку с `Outbox → В шаблон`, а затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/footer actions.
- На `Admin → Payments contract` → проверь `renderAdminPayments()/renderAdminPaymentView()`, helper’ы `adminApplyPayment()/adminAutoHealPayments()`, callbacks `a:admin_payments/view/apply/autoheal`, strict validation + DB claim before apply, ORPHANED-only `missing_session` auto-heal и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/back actions.
- На `Admin → Payments Fallback contract` → проверь `renderAdminPaymentsFallback()`, callbacks `a:admin_pay_fb / a:admin_pay_fb_set / a:admin_pay_fb_off`, preset TTL buttons, `setPaymentsFallbackRuntime(...)`, success/failure toasts и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/footer actions.
- На `Admin → User Card + Note contract` → проверь `renderAdminUserCard()/renderAdminUserNote()`, callbacks `a:adm_ucard / a:adm_unote*`, DM-only guard и `expectText` flow `adm_user_note` (`clear/cancel/save`), а также синхронизируй `src/bot/actionRegistry.js` с реальным составом card/note/footer actions.
- На `Broadcast deliver → local DB overload fuse contract` → проверь `api/qstash/broadcast-deliver.js`: наличие module-level `localDbDegradedUntilMs`, helpers `getLocalDbOverloadFuseTtlMs/getLocalDbOverloadFuseUntilMs/armLocalDbOverloadFuse`, arming local fuse **только** при провале `redis.set(dbOverloadFuseKey(), ...)`, precheck `local_fuse_precheck` **до** `redis.get(dbOverloadFuseKey())` и **до** `db.getBroadcast(...)`, а также `respondDbOverloadFuse(..., localFuse=true)`/`local_fuse` marker в JSON-ответе.
- На `Payments orphaned autoheal chain contract` → проверь `src/lib/config.js` и `/api/health` (`PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX`, `payments.orphaned_autoheal_chain_max`), затем `src/bot/cron.js` (first-leg enqueue только при `cand.length >= batch`, `action='orphaned_autoheal'`, `chain_depth=1`, `dedup=mon:autoheal:*`) и `api/qstash/monetization-retry.js` (worker branch `orphaned_autoheal`, repeated claim через `claimOrphanedMissingSessionPaymentsForAutoheal(...)`, self-reenqueue with depth-limit/dedup, без слома `_validateStarsPaymentStrict`/`applyPaymentFallbackNoSession` exactly-once guard’ов).
- На `Admin → QStash Status contract` → проверь `renderAdminQStashStatus()`, callbacks `a:admin_qstash_status / a:admin_qstash_ping`, summary/status lines (`Lib / ENV / Fan-out / Broadcast tick / Ping / Broadcast cooldown`), keyboard/footer (`Send signed ping / Fan-out toggle / Система / Меню / Home`), missing-lib/token/base_url helper screens, `qstashPublishJSON` payload (`signed_ping`, `qping:*`, `retries=0`, `timeout=10s`) и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/back/footer actions.

## Дальше после preflight

Если preflight прошёл — сделай короткий “2 минуты” чек перед деплоем: `docs/16_RELEASE_CHECKLIST.md`.

---

## Redis TTL smoke check (опционально, 1 минута)

Зачем: быстро поймать **"immortal keys" (TTL = -1)** на ключах, которые обязаны истекать (rate‑limit / locks / буферы). Это страховка от регрессий вида `INCR` без `EXPIRE`.

Требования:
- локально установлен `redis-cli`
- есть доступ к Redis URL (обычно `REDIS_URL`, `rediss://...`)

### 1) Проверка связи

```bash
redis-cli -u "$REDIS_URL" PING
```

### 2) Rate limit keys (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'rl:*' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL rl key: $k";
    done
```

### 3) Audit buffer locks / inflight markers (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'audit:*:flush_lock' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL audit lock: $k";
    done
```

### 4) Ops alerts buffers (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'ops:*' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL ops key: $k";
    done
```

Ожидаемый результат: **пусто** (ничего не печатает). Если видишь `IMMORTAL ...` — это сигнал, что какой‑то путь пишет ключи без TTL, и его нужно чинить до релиза.

## Принцип

Preflight **не меняет прод-логику**. Это dev‑инструмент для уверенного релиза (Zero regressions).


- На `Admin → Audit / Metrics / Moderators contract` → проверь `renderAdminAudit()/sendAdminAuditExport()/renderAdminMetrics()/renderAdminModerators()`, callbacks `a:aud* / a:admin_metrics / a:admin_mod_*`, `expectText` flows `aud_search` и `admin_add_mod_username`, а затем синхронизируй `src/bot/actionRegistry.js` с реальным составом back/footer/confirm actions.

- `scripts/smoke-official-publish-check-now-contract.js` — protects Official Publish operator `check now` / safe verify path.

- На `ENV baseline contract smoke` → синхронизируй `.env.example`, `docs/92_PROD_ENV_BASELINE.md` и `src/lib/config.js#assertEnv()`, не возвращай obsolete names (`BOT_WEBHOOK_URL`, `SUPER_ADMIN_IDS`) и не ослабляй safe defaults `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0` / `PAYMENTS_FALLBACK_APPLY_ENABLED=0`.
- На `Creator current-channel contract smoke` → проверь `mainMenuCreatorCurrentKb()`, `renderCreatorCurrentMenu()`, `renderRoleHub()`, `wsMenuKb()` и `wsSettingsKb()`, чтобы current-channel IA не откатилась к pre-STEP413 модели и не потащила role-switch/share/verification обратно в рабочий creator menu.
- На `Telegram share URL compatibility contract smoke` → проверь `sendWsShareTextMessage()` и `a:cur_invite`: должен оставаться совместимый формат `t.me/share/url?url=<U+2060>&text=...`, без text-only или empty-url вариантов.
- На `Brand Inbox accept-point contract smoke` → проверь `renderBrandAppView()`, `startBrandAppReply()`, `acceptBrandApplication()` и `brand_app_reply` expectText flow: до accept доступны только `✅ Принять / ⛔ Спам / 🗑 Удалить`, после accept открываются `✍️ Ответить / ⚡ Шаблоны / 💬 В работу / ✅ Закрыть`, а `✅ Принять` остаётся единственной spending transition.
- На `Contacts / Brand Pass anti-bypass contract smoke` → проверь `renderWsPublicProfile()`, `renderBrandLeadDialog()`, `renderWsProfileContactsStructured()` и IG templates: контакты/канал должны быть скрыты до unlock, Redis остаётся primary cache, DB fallback допустим только при degraded Redis, а reveal priority остаётся `structured → legacy → site`.
- На `No-channel gate contract smoke` → проверь `renderGwNewWorkspacePicker()`, `renderGwNewGate()`, handler `a:gw_new` и `renderBrandApply()`: missing/stale workspace обязан вести в явный recovery screen (`🚀 Подключить канал / 📣 Мои каналы / 📣 Выбрать канал`) без silent dead-end.
- На `Input mode cancel/reset contract smoke` → проверь `renderBrandApply()`, `renderBrandApplyPreview()`, callbacks `a:brand_apply*`, expectText branch `brand_apply` и structured contacts clear-menu: `✍️ Написать заявку` должен явно включать input mode, `❌ Отмена ввода` должна снимать его, а после сохранения черновика не должно оставаться stuck `expectText`.
- На `What-next / back-navigation contract smoke` → проверь shared helpers `navKb() / navKbInput() / kbNavRow()` и high-signal recovery screens (`renderGwNewGate`, brand-apply done/more, accepted-app done/more, brand-apply preview): footer должен оставаться предсказуемым (`⬅️ Назад`, `📋 Меню`, `🏠 Home`) без drift к stale label `📋 Открыть меню` или silent dead-end.


---
