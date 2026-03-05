# Collabka PR — FEATURES (QStash/Publish/Contacts/Infra/Neon)

Собрано автоматически для NotebookLM. Обновлено: 2026-03-04 18:19:55 UTC

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
