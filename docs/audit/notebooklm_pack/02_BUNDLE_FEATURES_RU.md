# Collabka PR — FEATURES (QStash/Publish/Contacts/Infra/Security/IG/Neon)

Собрано автоматически для NotebookLM. Обновлено: 2026-02-28 14:45 UTC


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

## SOURCE: `docs/01_SECURITY_INVARIANTS.md`

# 01 — SECURITY INVARIANTS (Collabka PR / @collabkaprbot)

Этот документ фиксирует **неизменяемые инварианты** безопасности и монетизации.
Если правка затрагивает деньги/кредиты/доступы — сначала сверяемся с этим файлом.

---

## A) Payments (Telegram Stars / оплаты)

1) В `pre_checkout_query` **обязательна** валидация:
   - формат `invoice_payload` (строгая схема),
   - `currency`,
   - `total_amount` (сумма должна соответствовать продукту/плану).
2) В `successful_payment` делаем **повторную** валидацию (защита от повторов/краевых кейсов).
2.1) Идемпотентность apply — **на уровне Postgres**:
   - payments ledger хранит `telegram_payment_charge_id` (unique) и (опционально) `provider_payment_charge_id` (unique);
   - перед любыми сайд‑эффектами payment должен быть **claimed** (status `APPLYING`) через atomic `UPDATE ... WHERE status != 'APPLIED'`.
   Это защищает от гонок при Telegram retries и параллельных apply (cron/admin/user).
3) Любая auto-heal логика (cron / fallback apply) работает **fail-safe** и использует ту же строгую валидацию, что и `pre_checkout_query`/`successful_payment`:
   - если валидация не проходит → **не применять**,
   - пометить как `ORPHANED` / `manual_required` / `validation_failed` + ops alert.
   - auto-heal **не трогает** слишком свежие платежи (min-age: `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC`), чтобы избежать гонок с задержанными webhook/ретраями.
4) Ручной apply из админки:
   - запрещён при невалидной сумме/валюте/пейлоаде,
   - фиксируем причину в audit/логах.

---

## B) Credits & paid unlock (контакты / Brand Pass)

5) Unlock контактов **exactly-once**: источником истины является **Postgres**.
   - используем **PG advisory lock** на пару `(brand_user_id, workspace_id)`,
   - делаем атомарную транзакцию: *activate unlock* + *списание кредита*.
6) Повторный клик внутри окна unlock **не списывает** повторно (0 rows → no charge).
7) Anti-bypass в текстах профиля/описания (до unlock):
   - маскируем `http(s)://`, `t.me/*`, email, `@handle`, **телефоны** (как текст, так и entity-linkify).
   - телефоны маскируем и в виде цифр, и в виде **словами** (например: «плюс семь девять…»).

7.1) Структурированные контакты (P2, shipped):
- `workspace_settings.profile_contacts` (JSONB) — единый контейнер контактов (версия формата: `profile_contacts_v`).
- Ввод валидируем/нормализуем **на сохранении** (tg/email/phone/site), чтобы не играть в “постфактум” правки в рендере.
- UX: достаточно **1** контакта (обычно Telegram). Email/Website — опционально. Phone — не обязателен.
- Показ: structured показываем **только после unlock** (или в owner/curator preview).
- Приоритет после unlock: **structured → (если пусто) контакт (текстом)** (`profile_contact`, `profile_ig`, `profile_portfolio_urls`).
- Перенос «Контакт» → structured — только по явной кнопке и только при **однозначном распознавании** (один тип, одно значение).
  - если в «Контакт» несколько типов/вариантов — отказываемся и просим заполнить вручную;
  - если целевое поле уже заполнено — не перетираем.
7.2) Redis — только быстрый кеш/TTL/UX:
   - при деградации Redis используем DB fallback **только для проверки unlock**,
   - при восстановлении Redis — best-effort “healing” ключей.

7.3) Brand Inbox (заявки креаторов → бренду) — защита монетизации:
- Точка списания — только кнопка **✅ Принять** (status `new` → `in_progress`).
- До принятия действия «✍️ Ответить» / «⚡ Шаблоны» должны быть **недоступны** (UI и callback‑guard), чтобы не было обхода списания.
- До принятия также **нельзя** переводить заявку в «💬 В работу / ✅ Закрыть» (иначе создаёт путаницу и ‘исчезновение’ из вкладки 🆕). Разрешены только ✅ Принять, ⛔ Спам, 🗑 Удалить.
- Принятие **idempotent**: повторный клик не списывает повторно и не шлёт повторные уведомления (DB‑truth + транзакция).
- Баланс кредитов в карточке заявки показываем **Redis‑only** (без DB fallback), чтобы не грузить Neon.

---

## C) Ownership / Access control (dangerous actions)

8) Для чувствительных сущностей (лиды, заявки, заметки, сделки, приватные экраны) ownership должен проверяться **в SQL**:
   - `... WHERE id = $1 AND actor_user_id ∈ allowed_set ...`
   - без паттерна “взяли по id → потом проверили в JS”.
9) Опасные действия с глобальным эффектом (delete, assign, publish, apply) — дополнительно **role-gate**:
   - owner/curator/admin (и только по необходимости).
10) Любая “мягкая деградация” (fail-open) **не может** раскрывать платные/приватные данные.
10.1) В degraded mode Redis: **mutating callbacks** должны быть fail-closed (отклоняем выполнение),
     кроме строго allowlisted действий, которые safe-by-design и опираются на DB truth (например, paid-unlock).

10.2) Реестр callback actions — единая точка правды:
   - `src/bot/actionRegistry.js` (тип action: view/edit/pay/admin/ops + guard mode)
   - проверка консистентности: `npm run actions:check` (должен проходить перед релизом)
   - экспорт для аудитов/доков (Markdown): `npm run actions:md` → `docs/02_ACTION_KEYS_REGISTRY.md`

10.3) Break-glass (Admin-only) при Redis down:
   - по умолчанию все `REQUIRE_REDIS` callbacks блокируются (fail-closed),
   - но супер‑админ может открыть *строго ограниченный* allowlist экранов (payments/users/audit),
   - только через двойное подтверждение (`bg=1`),
   - и каждое использование отправляет ops alert (digest anti-spam).

---

## D) Deep-links / callback_data

11) `payload` всегда в приоритете; `/start` может быть fail-open **только для UX-развилки**, не для денег/доступов.
12) Deep-link на приватный объект допускается только если:
   - есть DB-ownership check, или
   - ссылка стейтлесс подписана и привязана к actor.
13) `callback_data` ≤ 64 bytes:
   - контекст выносим в Redis token → payload (TTL),
   - токены одноразовые/с TTL и не дают “чужой” доступ без DB-ownership.

---

## E) Cron / Idempotency / Outbox

14) В cron: **Redis token-lock** (safe unlock) + где критично **PG advisory lock**.
15) Внешние сайд‑эффекты: сначала reserve/lock в DB, потом отправка (outbox-подход).
16) Статусы меняем атомарно (`WHERE ... RETURNING`, guards по полям типа `*_at`).

**Важно про миграции:** любые новые таблицы/колонки и бизнес-изменения схемы — только через `migrations/run.js` (exactly-once). `migration_pack/` — аварийные ручные скрипты и не должен считаться “доставкой” новых бизнес-миграций.


---

## F) Hot paths / Neon cost

17) В горячих UI путях (меню/рендер кнопок/хабы) **не добавляем** DB-чтения без измерения.
18) Redis-first кеши допустимы, но деньги/доступы всё равно закреплены DB-инвариантами (см. B).

Мини‑регрессия, которую обязаны ловить перед релизом: прогнать `npm run test:redact` (маскирование ссылок/email/@/телефонов в тексте профиля).

---

## G) Logging / Alerts / Health

19) Новые алерты — только через единый механизм (тихий режим по умолчанию).
20) `/api/health` обязан оставаться “непадающим” и показывать ключевые деградации (cooldown, stuck locks, cron last_run).

---

## H) Admin bypass (строго)

21) Админ-bypass допустим только в явных местах и всегда логируется (audit).
22) Админ не должен открывать платное/приватное без следа — любые ручные apply фиксируются.

---

### Красные флаги (не принимать PR без исправления)
- “Fail-open” попал в деньги/кредиты/контакты/платные данные.
- Fetch-by-id без ownership в SQL для чувствительных сущностей.
- Повторные списания при повторном клике/ретраях.
- Ретраи/циклы в одном serverless запросе.
- Новые DB-чтения в меню/кнопках/рендере без очень жёсткого обоснования.


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

## SOURCE: `docs/neon/README.md`

# Neon history (контекст)

Эта папка хранит **исторический контекст** по переездам/схемам/фиксам Neon.

Файл `ИСТОРИЯ_НЕОН.txt` — это “сырой” рабочий лог/дамп, который удобно отдавать внешнему аудитору
вместе с `docs/11_MIGRATIONS_PACK.md`.

Важно:
- Это **не** миграция и **не** источник правды для схемы.
- Источник правды по применению миграций: `migrations/*.sql` + `migrations/run.js`.


---

## SOURCE: `docs/neon/ИСТОРИЯ_НЕОН.txt`

-- QUERY TRUNCATED
-- MicroGiveaways Bot schema (v0.9)

create table if not exists users (
  id bigserial primary key,
  tg_id bigint not null unique,
  tg_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id bigserial primary key,
  owner_user_id bigint not null references users(id) on delete cascade,
  title text not null,
  channel_id bigint not null,
  channel_username text,
  created_at timestamptz not null default now(),
  unique(owner_user_id, channel_id)
);

create table if not exists workspace_settings (
  workspace_id bigint primary key references workspaces(id) on delete cascade,
  network_enabled boolean not null default false,
  curator_enabled boolean not null default false,
  auto_draw_default boolean not null default false,
  auto_publish_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_curators (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  added_by_user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table if not exists workspace_audit (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  actor_user_id bigint not null references users(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_audit_ws_time on workspace_audit(workspace_id, created_at desc);
create index if not exists idx_workspace_audit_actor_time on workspace_audit(actor_user_id, created_at desc);

create table if not exists giveaways (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  status text not null default 'DRAFT',
  prize_value_text text,
  winners_count int not null default 1,
  ends_at timestamptz,
  auto_draw boolean not null default false,
  auto_publish boolean not null default false,
  published_chat_id bigint,
  published_message_id bigint,
  winners_drawn_at timestamptz,
  results_published_at timestamptz,
  results_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_giveaways_workspace on giveaways(workspace_id, created_at desc);
create index if not exists idx_giveaways_status on giveaways(status);

create table if not exists giveaway_sponsors (
  id bigserial primary key,
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  position int not null,
  sponsor_text text not null
);

create index if not exists idx_gw_sponsors_gw on giveaway_sponsors(giveaway_id, position);

create table if not exists giveaway_entries (
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  is_eligible boolean not null default false,
  last_checked_at timestamptz,
  primary key (giveaway_id, user_id)
);

create index if not exists idx_gw_entries_gw on giveaway_entries(giveaway_id);
create index if not exists idx_gw_entries_eligible on giveaway_entries(giveaway_id, is_eligible);

create table if not exists giveaway_winners (
  id bigserial primary key,
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  place int not null,
  created_at timestamptz not null default now(),
  unique(giveaway_id, place),
  unique(giveaway_id, user_id)
);

create table if not exists giveaway_audit (
  id bigserial primary key,
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  actor_user_id bigint references users(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_giveaway_audit_gw_time on giveaway_audit(giveaway_id, created_at desc);

-- Optional: network sponsors (future barters marketplace)
create table if not exists network_sponsors (
  id bigserial primary key,
  category text,
  title text not null,
  contact text,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);


-- MicroGiveaways Bot schema (v0.9)

create table if not exists users (
  id bigserial primary key,
  tg_id bigint not null unique,
  tg_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id bigserial primary key,
  owner_user_id bigint not null references users(id) on delete cascade,
  title text not null,
  channel_id bigint not null,
  channel_username text,
  created_at timestamptz not null default now(),
  unique(owner_user_id, channel_id)
);

create table if not exists workspace_settings (
  workspace_id bigint primary key references workspaces(id) on delete cascade,
  network_enabled boolean not null default false,
  curator_enabled boolean not null default false,
  auto_draw_default boolean not null default false,
  auto_publish_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_curators (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  added_by_user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table if not exists workspace_audit (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  actor_user_id bigint not null references users(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_audit_ws_time on workspace_audit(workspace_id, created_at desc);
create index if not exists idx_workspace_audit_actor_time on workspace_audit(actor_user_id, created_at desc);

create table if not exists giveaways (
  id bigserial primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  status text not null default 'DRAFT',
  prize_value_text text,
  winners_count int not null default 1,
  ends_at timestamptz,
  auto_draw boolean not null default false,
  auto_publish boolean not null default false,
  published_chat_id bigint,
  published_message_id bigint,
  winners_drawn_at timestamptz,
  results_published_at timestamptz,
  results_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_giveaways_workspace on giveaways(workspace_id, created_at desc);
create index if not exists idx_giveaways_status on giveaways(status);

create table if not exists giveaway_sponsors (
  id bigserial primary key,
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  position int not null,
  sponsor_text text not null
);

create index if not exists idx_gw_sponsors_gw on giveaway_sponsors(giveaway_id, position);

create table if not exists giveaway_entries (
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  is_eligible boolean not null default false,
  last_checked_at timestamptz,
  primary key (giveaway_id, user_id)
);

create index if not exists idx_gw_entries_gw on giveaway_entries(giveaway_id);
create index if not exists idx_gw_entries_eligible on giveaway_entries(giveaway_id, is_eligible);

create table if not exists giveaway_winners (
  id bigserial primary key,
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  place int not null,
  created_at timestamptz not null default now(),
  unique(giveaway_id, place),
  unique(giveaway_id, user_id)
);

create table if not exists giveaway_audit (
  id bigserial primary key,
  giveaway_id bigint not null references giveaways(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  actor_user_id bigint references users(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  crea
  
  
  DO $$
BEGIN
  -- Для barter_threads
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='barter_threads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='barter_threads' AND column_name='deleted_by_user_ids') THEN
      ALTER TABLE barter_threads ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
  END IF;

  -- Для brand_leads
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='brand_leads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_leads' AND column_name='deleted_by_user_ids') THEN
      ALTER TABLE brand_leads ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
  END IF;

  -- Для brand_applications (с проверкой на существование таблицы)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='brand_applications') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_applications' AND column_name='deleted_by_user_ids') THEN
      ALTER TABLE brand_applications ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  -- Для barter_threads
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='barter_threads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='barter_threads' AND column_name='deleted_by_user_ids') THEN
      ALTER TABLE barter_threads ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
  END IF;

  -- Для brand_leads
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='brand_leads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_leads' AND column_name='deleted_by_user_ids') THEN
      ALTER TABLE brand_leads ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
  END IF;

  -- Для brand_applications
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='brand_applications') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_applications' AND column_name='deleted_by_user_ids') THEN
      ALTER TABLE brand_applications ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
  END IF;
END
$$ LANGUAGE plpgsql;


DO '
BEGIN
  -- same content, but with doubled single quotes if any
END;
' LANGUAGE plpgsql;


-- 1. Включаем криптографию для детерминированных розыгрышей
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Таблица событий (Outbox)
CREATE TABLE event_outbox (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING, DONE, DEAD
    attempts INTEGER DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого выбора задач воркером
CREATE INDEX idx_outbox_worker ON event_outbox (status, next_attempt_at) 
WHERE status = 'PENDING';

-- 3. Таблица аудита
CREATE TABLE audit_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID,
    entity_type TEXT NOT NULL, -- 'giveaway', 'user', 'system'
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для аналитики
CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);

-- 4. Оптимизация для Giveaway
CREATE INDEX idx_giveaways_expiration ON giveaways (status, ends_at) 
WHERE status IN ('ACTIVE', 'RUNNING');

CREATE INDEX idx_entries_draw ON giveaway_entries (giveaway_id, is_eligible);



-- Collabka migration pack: mark all current migrations as applied
-- Use ONLY if your DB schema is already up-to-date (e.g. you ran migrations manually before).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations(name, checksum) VALUES ('001_init.sql', '2e0913e8ddaf69983643d5c5a0c6c9984f37d0bdac2d407d21a5524051a971a0') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('002_barters.sql', 'ce99f9e5e593d9852e1db2bb22a5951816f1da51aebab6a27411f75cdb603c02') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('003_barters_ideal.sql', '26b3316b8fa78c109249d3d38a23d7888137d1e92d72c9009f8ff00d8efd5875') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('004_final_pack.sql', '7e214d45460706a1a66e0977e1c6f113e45223f83b135cb971b5301906b795e4') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('005_brand_pass.sql', '59e13a4c7d21f0edd031574c93945810ca88af610624a8fd671d159dd729cf07') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('006_brand_plan.sql', '857d2c224c9c5e332d0f9ff7dcc80e2c98f60dedbd3ad836a50cf02dd47e0171') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('007_matching.sql', '0034226974621aa85207b5ce0160b143acc82e69ccc8855de645313342b002f7') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('008_featured.sql', 'efd11e88811b11aff18e9aa47bac3d4715205e3c3c613c98ae1d97a3f06669b5') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('009_crm_stage.sql', '8446a1357e56ef3e24dcd968d471af99c7a70ed3f5911c98c29e21faf7452acc') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('010_user_verifications.sql', '5a8d2236639c76d79a7498c5ac6bc4aaa91be84e0d553cdfd084debb50cd9ff9') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('011_stars_payments.sql', 'acfa7ccbdfcb6fd7f85da445534edcc8933ba449ee5535436916354b6a207223') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('012_payments_ledger.sql', 'c749d0d047377d05ef23d4eb23c69084c8fff72fdcc902fc396ed294b65722bc') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('013_payments_extras.sql', '6405254225375609d23a7e69b8cf9535a1626d6b555bbe6f19201b08db504a0b') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('014_intro_trial_daily_limits.sql', 'd2701864ea15bc5ea3b543d0600390773553fcf805638d784260d22a873611bf') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('015_barter_thread_proofs.sql', '97ab38d51350c6348660d5fcc63aae631a6eb3a05472334b8127d1bf239e7e6b') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('016_channel_folders_and_editors.sql', '8895619b272938e3fdfbd806785fb16578ed2cdf2dba23662f72572536b90b98') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('017_analytics_events.sql', 'cd193899d2508dac200fb0e188bba3303220b49dace8bb7c489b53273559613d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('018_official_channel_posts.sql', '560d50a66313ec122a95b554fc7247ace68658c84fe901c7fb74ba53149995a4') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('019_intro_retry_credits.sql', 'e3a17d890ffb2f82770878f8ca35ec1f4f8eaf3fa3dd07650454ac68b6125ddf') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('020_profile_matrix_ig_tg_deals.sql', '89b49e8dedf438c7c11dd1e99a49f4114c6742cb68d428ad793f18acf9ec0a5d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('021_brand_leads.sql', '083d997375e209b79cd6108b6eee1392b519387fbe5b20b0544691d61b5bbe9d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('022_profile_matrix_match_indexes.sql', '7e4b2edb600b25af869b58f419d8981fa23af6fcaca994ae47d6638090a9dde4') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('023_barter_offer_media.sql', '7460110405aac5cb91a4438953adb993bbd5cc33ac1b0e33358d5a07869d5427') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('024_brand_profiles.sql', 'fea11a1d066c6893317ace74f7b70252b53fce8cf73a1e6c7a7c5d9234a889a9') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('025_giveaways_media.sql', '413ec2b9af6d12eecdabfa1a1ca4685dbba406d9fe358c2b8938a78041b58245') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('026_brand_managers.sql', '61ecbdb6848206737b1d7935ba5cf95dac2d7d6c87cb117084a01118da877e6d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('027_brand_applications.sql', '1046ef08d7925a8bae2fd21b90bf6534e02027613055a0cb39a7c1309274d0db') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('028_barter_offers_meta.sql', 'a1f81c3fdeb885693fe47e1b47abafb37050341550dafda1f2c5c3b27fd8564e') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('029_barter_threads_triage_status.sql', 'cff3f1199d89bbf8779232cad7cb6975660e0cf8290adc3ae7ccfa70289ac41b') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('030_broadcasts.sql', '5daffd79a078bce86c20238dd0aa579ca8bdef0ed6c736a21a558857fd6975ce') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('031_brand_leads_assignment.sql', '439b378d246d70f11799aaa350e747bcc774946e80c1dd71f5617149faba6fdf') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('032_soft_delete.sql', 'c105cad1b808962caf3af89058076c6b4f27ff87a571e64382472f83bb531736') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('033_user_ban.sql', '0ad442783d8da3d2b80e18459bc2f6ad718f0507b6668260591e1a4b319d44d5') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('034_SQL Migration Neon Postgres.sql', 'c2eb9d2d1fe5cdcc658a45fbd38d72a7ee0cb0644fe79f06d18d34ce3b1de892') ON CONFLICT (name) DO NOTHING;



-- Collabka migration pack: reconcile/repair (idempotent)
-- Purpose:
--   Bring ANY database to a minimum required infra state without conflicts.
--   Safe to run multiple times.
--
-- Includes:
--   - pgcrypto extension (for deterministic SHA-256 draws)
--   - event_outbox + indexes (reliable delivery)
--   - audit_events + indexes (immutable audit trail)
--   - soft-delete columns: deleted_by_user_ids (jsonb) on key tables
--   - giveaway performance indexes

-- 1) Crypto extension (sha256)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Outbox (reliable events)
CREATE TABLE IF NOT EXISTS event_outbox (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, DONE, DEAD
  attempts INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_worker
  ON event_outbox (status, next_attempt_at)
  WHERE status = 'PENDING';

-- 3) Audit (immutable events log)
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  entity_type TEXT NOT NULL, -- 'giveaway', 'user', 'system'
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_events (entity_type, entity_id);

-- 4) Giveaway performance indexes (safe, partial)
CREATE INDEX IF NOT EXISTS idx_giveaways_expiration
  ON giveaways (status, ends_at)
  WHERE status IN ('ACTIVE', 'RUNNING');

CREATE INDEX IF NOT EXISTS idx_entries_draw
  ON giveaway_entries (giveaway_id, is_eligible);

-- 5) Soft delete columns (safe add)
ALTER TABLE IF EXISTS barter_threads
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS brand_leads
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS brand_applications
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;


CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE INDEX IF NOT EXISTS idx_entries_draw ON giveaway_entries (giveaway_id, is_eligible);

SELECT indexdef 
FROM pg_indexes 
WHERE indexname = 'idx_entries_draw';

-- Track gifted Brand Pass credits separately from purchased/trial.
-- Allows safe revoke of gifts without touching purchased credits.

alter table users
  add column if not exists brand_credits_gifted int not null default 0;

create index if not exists idx_users_brand_credits_gifted on users(brand_credits_gifted);


-- Brand Pass: persistent contacts unlocks (DB fallback when Redis is down)

create table if not exists brand_contact_unlocks (
  id bigserial primary key,
  brand_user_id int not null references users(id) on delete cascade,
  workspace_id int not null references workspaces(id) on delete cascade,
  unlocked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_user_id, workspace_id)
);

create index if not exists idx_brand_contact_unlocks_brand_until
  on brand_contact_unlocks (brand_user_id, unlocked_until desc);

create index if not exists idx_brand_contact_unlocks_ws_until
  on brand_contact_unlocks (workspace_id, unlocked_until desc);


-- Harden payments idempotency: unique provider charge id (best-effort)
-- Telegram Stars provides both telegram_payment_charge_id and provider_payment_charge_id.
-- We already dedupe by telegram_payment_charge_id; this adds an extra safety net.

create unique index if not exists uq_stars_payments_provider_charge
  on stars_payments (provider_payment_charge_id)
  where provider_payment_charge_id is not null;

create unique index if not exists uq_payments_provider_charge
  on payments (provider_payment_charge_id)
  where provider_payment_charge_id is not null;


-- Harden payments idempotency: unique provider charge id (best-effort)
-- Telegram Stars provides both telegram_payment_charge_id and provider_payment_charge_id.
-- We already dedupe by telegram_payment_charge_id; this adds an extra safety net.

create unique index if not exists uq_stars_payments_provider_charge
  on stars_payments (provider_payment_charge_id)
  where provider_payment_charge_id is not null;

create unique index if not exists uq_payments_provider_charge
  on payments (provider_payment_charge_id)
  where provider_payment_charge_id is not null;
  
  
  
  -- 037_broadcast_sent_log_retry_after.sql
-- Broadcast per-recipient retry_after (defer recipients that hit Telegram 429)
-- Goal: one "heavy" recipient must NOT stall the whole broadcast forever.

alter table broadcast_sent_log
  add column if not exists retry_after_until timestamptz;

create index if not exists idx_broadcast_sent_log_deferred_retry
  on broadcast_sent_log (broadcast_id, retry_after_until)
  where status = 'deferred';
  
  
  
  -- STEP105: Structured profile contacts (read-only support)
--
-- Goal: add an optional structured contacts container to workspace_settings.
-- In STEP105 we only READ these contacts (no creator UI changes yet).

alter table workspace_settings
  add column if not exists profile_contacts jsonb not null default '{}'::jsonb;

alter table workspace_settings
  add column if not exists profile_contacts_v int not null default 1;



-- 039_broadcast_cooldown_db_fuse.sql
-- DB fuse for broadcast 429 cooldown when Redis is unavailable.
-- Goal: avoid expensive recipient polling in Neon during cooldown.

alter table broadcasts
  add column if not exists cooldown_until timestamptz,
  add column if not exists cooldown_reason text;

create index if not exists idx_broadcasts_cooldown_until on broadcasts(cooldown_until);




-- 040_broadcast_fanout_qstash.sql
-- QStash fan-out delivery: extend broadcast_sent_log to support queue/worker retries
-- Keep backwards-compatible with legacy direct-send cron.

alter table broadcast_sent_log
  add column if not exists attempts int not null default 0,
  add column if not exists non_retryable boolean not null default false,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz;

-- Pending statuses are used by QStash delivery worker.
-- (No CHECK constraint: keep schema permissive for future extensions.)

create index if not exists idx_broadcast_sent_log_pending
  on broadcast_sent_log (broadcast_id, status)
  where status in ('queued','sending','retry','deferred','quarantined');

create index if not exists idx_broadcast_sent_log_sending_stale
  on broadcast_sent_log (broadcast_id, last_attempt_at)
  where status = 'sending';



-- STEP141: IG OAuth accounts (Level A, OAuth-only)
-- Store IG professional account binding + encrypted token per workspace.
-- Invariants:
-- - No tokens in logs
-- - Tokens stored encrypted (app-level)
-- - Brands never see handle before unlock (enforced in bot rendering)

create table if not exists ig_oauth_accounts (
  ws_id bigint primary key references workspaces(id) on delete cascade,
  ig_user_id text not null,
  ig_username text not null,
  account_type text null,
  status text not null default 'CONNECTED',
  access_token_enc text not null,
  token_expires_at timestamptz null,
  scope text null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ig_oauth_accounts_ig_user_id_idx on ig_oauth_accounts(ig_user_id);


---

## SOURCE: `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`

# 23 — Instagram интеграция: что сделали, что сломалось у Meta и как вернуться — 2026-02-27

Этот файл — **для владельца проекта** и для будущих итераций.

Цель документа:
- зафиксировать, **какие шаги/файлы уже есть в коде**,
- объяснить, **почему сейчас IG‑интеграция скрыта**,
- дать **чёткий план возврата**, когда появится время/доступы.

> TL;DR: Comment‑верификацию (Level B) решили не использовать из‑за утечек username. Перешли на OAuth‑only (Level A), но Meta начала возвращать `pages=0` и местами блокировать доступ. Поэтому **UI скрыли** и **закрыли OAuth API (404)**, код/миграции оставили.

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
  - ⚠️ если `IG_OAUTH_UI_ENABLED=0` → все эти роуты **закрыты (404)**
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



---
