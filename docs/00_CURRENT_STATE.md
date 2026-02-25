# 00 — CURRENT STATE (Collabka PR / @collabkaprbot) — 2026-02-25

**Purpose:** единый *source of truth* snapshot, чтобы продолжать работу в новом чате без потери контекста.

---

## 0) Security invariants (must-not-break)
См. `01_SECURITY_INVARIANTS.md`. Ключевое на текущий момент:
- Payments: валидация payload/amount/currency в `pre_checkout` и `successful_payment` (fail-safe apply).
- Contacts unlock: DB truth + advisory lock (exactly-once), Redis только кеш/TTL.
- Ownership: safe-getters с ownership внутри SQL для лидов/заявок и опасных действий.
- Redis degraded mode: mutating callbacks работают **fail-closed** (кроме строго allowlisted DB-safe действий). Guard использует строгий реестр `src/bot/actionRegistry.js`.
  - Break-glass (Admin): при Redis down супер‑админ может открыть *строго ограниченный* allowlist экранов (payments/users/audit) через двойное подтверждение (`bg=1`). Каждое использование логируется в ops alerts.
  - Markdown экспорт реестра action keys для аудитов: `npm run actions:md` → `docs/02_ACTION_KEYS_REGISTRY.md`.



## 1) Платформа и компоненты

### Runtime / hosting
- **Vercel serverless** (stateless функции)
- **Neon Postgres** (дёшево, но бережём CU)
- **Upstash Redis** (locks / краткоживущие состояния / счётчики)
- **QStash / cron** → дергает `/api/cron/*` по расписанию

### Control Plane (cron endpoints)
- `/api/cron/giveaways-tick` — закрытие конкурсов → draw winners → публикация → сервисные задачи
- `/api/cron/broadcast-tick` — рассылки: 1 batch за тик (дешевле для Neon)
- Защита: **CRON_SECRET** (Bearer)

---

## 2) Наблюдаемость

### `/api/health`
Возвращает JSON и **не падает**, даже если Redis недоступен (fail-open).

Что показываем:
- `cron.giveaways_tick` и `cron.broadcast_tick`: последний run (ts + summary)
- `audit.throttle`: метрики подавления audit-записей (если включено)
- `broadcast.cooldown`: активная пауза после `429 Too Many Requests` (если есть)
- `ref`: лёгкие счётчики источников входа (`/start src_tg` / `/start src_ig`) — today/total
- `ref.by_role`: разрез источника × роли (tg/ig/direct × brand/creator) — today/total


#### Audit throttle counters
Если включён `AUDIT_DB_THROTTLE_ENABLED=true`, то `/api/health` показывает:
- `audit.throttle.suppressed_today_total`
- `audit.throttle.suppressed_today_by_prefix`

Это **Redis-only** счётчики (Neon не трогаем).

#### Acquisition (откуда пришли)
Для трекинга входов используются лёгкие маркеры в ссылках:
- Telegram: `https://t.me/<bot>?start=src_tg`
- Instagram: `https://t.me/<bot>?start=src_ig`

Счётчики видны в `/api/health.ref` (и разрез по роли — в `ref.by_role`) и хранятся **только в Redis**.

---

## 3) Инварианты безопасности

- Serverless = только пакетная обработка, никаких “вечных” циклов.
- Cron: **Redis token-lock** (safe unlock) + где критично **PG advisory lock** + SQL guards на статусных переходах.
- Winners draw: детерминированно/воспроизводимо, guards по статусам (`winners_drawn_at`, транзакции).
- Миграции: только `migrations/run.js` (exactly-once + checksum).
- Горячие UI-пути: **не добавлять DB-запросы** в рендер меню/кнопок без сильного обоснования.

---

## 4) Ключевые продуктовые зоны

### A) Brand Team UX V4
Принцип: **кнопка видна всегда**, доступ гейтится *внутри* фичи, есть “Почему так?” и корректный back через `ret`.
Подробно: `docs/14_BRAND_TEAM_UX_V4.md`.

### B) Broadcast (рассылки)
Состояние (актуально):
- Тик может запускаться по расписанию (обычно 1 раз/час) или вручную (QStash “Run it manually”).
- Поддержка контента:
  - текст (включая “ссылку в слово”: Telegram entities → HTML)
  - 1 фото (альбомы не включали намеренно)
  - опрос (poll)
- Кнопки:
  - до **3** URL-кнопок, формат ввода: `Название | ссылка` (по строке)
  - поддержка shortcuts: `gw_123`, `bp_45`, `offer_777` → deep link `https://t.me/<bot>?start=...`
  - UI-пресеты на шаге “Кнопки”: 🎁 Конкурс / 🏷 Профиль / 🎬 Оффер
- Финальное сообщение “✅ Рассылка завершена” теперь **с кнопками** (нет тупика UX).

Надёжность / rate-limit:
- На `429 Too Many Requests` получатель **не теряется** и рассылка **не залипает** на одном uid:
  - пишем в DB `broadcast_sent_log.status='deferred'` + `retry_after_until`
  - двигаем scan-курсор вперёд (чтобы один “тяжёлый” получатель не стопорил весь батч)
  - deferred получатели догоняются позже, когда `retry_after_until <= now()`
- Если один и тот же получатель ловит `429` **N раз подряд**, включаем **quarantine**:
  - DB: `broadcast_sent_log.status='quarantined'`
  - `retry_after_until` продлевается на `BROADCAST_QUARANTINE_SEC`
  - порог: `BROADCAST_QUARANTINE_THRESHOLD`

- Ставим **cooldown** на `retry_after`:
  - fast path (Redis):
    - per-broadcast: `broadcast:<id>:cooldown_until`
    - global: `broadcast:cooldown_until` + `broadcast:cooldown_broadcast_id` (early-exit без DB polling)
  - fallback fuse (DB, только если Redis недоступен):
    - `broadcasts.cooldown_until`, `broadcasts.cooldown_reason`
- Пока cooldown активен:
  - обычно `broadcast_tick` делает `skip` **без обращения к Neon** (Redis-global)
  - при деградации Redis — `skip` после одного лёгкого `getActiveBroadcast` (без polling recipients)
- Cooldown и счётчики видны в `/api/health` → `broadcast`.
- В `/api/health` counters: `cooldown_set/cooldown_skip/defer_set/defer_wait/quarantine_set`.

Ключевые файлы:
- `src/bot/cron.js` — отправка и финальное сообщение
- `src/bot/bot.js` — wizard рассылок + шаблоны кнопок
- `src/bot/helpers.js` — `telegramEntitiesToHtml()`, `parseStartPayload()` (bp_/offer_)

### C) HomeHub / ui_mode и Role Gate
- `ui_mode` хранится в Redis (`brand` / `creator`).
- `/start`:
  - если есть payload (deep link) → payload **в приоритете**, gate не мешает
  - если payload нет и `ui_mode` не установлен → короткая развилка (Бренд/Креатор), затем редирект в HomeHub
  - Redis недоступен → fail-open, всё как раньше


### D) Official channel publish (@collabka_offers)
Используется для публикации офферов/анонсов в официальный канал.

Защита от дублей (idempotency):
- **Redis token-lock per offer** `lock:official:<offerId>` (TTL ~180s) — не даёт параллельным кликам/ретраям постить одно и то же.
- **DB-reserve до отправки**: `official_posts.status='PUBLISHING'` (stale rescue ~10 минут) — гарантирует единственность даже при деградации Redis.
- После успешной отправки сохраняем `message_id` и переводим статус в `ACTIVE`.

Оперативные действия при проблемах/дублях: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.

---

## 5) ENV (важные флаги)

- `ANALYTICS_ENABLED=false` — держим выключенным (меньше DB-write в `events`).

### Базовые обязательные (чтобы бот вообще запустился)

- `BOT_TOKEN` — токен Telegram-бота.
- `BOT_USERNAME` — username бота (без @).
- `DATABASE_URL` — Neon Postgres.
- `REDIS_URL` — Upstash Redis (locks, counters, сессии).
- `SUPER_ADMIN_TG_IDS` — список TG ID админов (через запятую).
- `CRON_SECRET` — секрет для вызова `/api/cron/*` (Bearer).

> Если используешь поддержку через группу: задай `SUPPORT_CHAT_ID` и **сделай бота админом** в этой группе, иначе он не увидит reply-сообщения.

### ENV: полный список (`src/lib/config.js` + доп. env в `src/bot/bot.js`)

Ниже перечислены **все** переменные окружения, которые читает проект через `src/lib/config.js`.
Дефолты и парсинг см. в коде (это источник истины).

> Примечание: `CONTACT_UNLOCK_COST`, `CONTACT_UNLOCK_TTL_DAYS`, `BRAND_CREDITS_CACHE_TTL_SEC`, `BRAND_APP_ACCEPT_COST` читаются напрямую в `src/bot/bot.js` (не через `CFG`).


- **BOT**: `BOT_ID` `BOT_TOKEN` `BOT_USERNAME` `BOT_VARIANT`
- **APP**: `APP_ENV`
- **DATABASE**: `DATABASE_URL`
- **UPSTASH**: `UPSTASH_REDIS_REST_TOKEN` `UPSTASH_REDIS_REST_URL`
- **CRON**: `CRON_SECRET`
- **SUPER**: `SUPER_ADMIN_TG_IDS`
- **SUPPORT**: `SUPPORT_CHAT_ID`
- **OPS**: `OPS_ALERT_BUFFER_MAX` `OPS_ALERT_SILENT` `OPS_ALERT_SUMMARY_MIN`
- **PAYMENT**: `PAYMENT_SESSION_TTL_MIN`
- **CONTACTS**: `CONTACT_UNLOCK_COST` `CONTACT_UNLOCK_TTL_DAYS` `BRAND_CREDITS_CACHE_TTL_SEC`
- **PAYMENTS**: `PAYMENTS_ACCEPT_DEFAULT` `PAYMENTS_AUTO_APPLY_DEFAULT` `PAYMENTS_FALLBACK_APPLY_ENABLED` `PAYMENTS_ORPHANED_AUTOHEAL_BATCH` `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED`
- **FOUNDER**: `FOUNDER_BRAND_12M_CREDITS` `FOUNDER_BRAND_12M_PRICE` `FOUNDER_BRAND_3M_CREDITS` `FOUNDER_BRAND_3M_PRICE` `FOUNDER_CREATOR_12M_PRICE` `FOUNDER_SALE_DEADLINE` `FOUNDER_SALE_ENABLED`
- **INTRO**: `INTRO_COST_PER_INTRO` `INTRO_DAILY_LIMIT` `INTRO_DAILY_LIMIT_UNVERIFIED` `INTRO_RATE_LIMIT` `INTRO_RATE_WINDOW_SEC` `INTRO_RETRY_AFTER_HOURS` `INTRO_RETRY_ENABLED` `INTRO_RETRY_EXPIRES_DAYS` `INTRO_RETRY_NOTIFY` `INTRO_TRIAL_CREDITS`
- **AUDIT**: `AUDIT_DB_ENABLED` `AUDIT_DB_THROTTLE_ENABLED` `AUDIT_DB_THROTTLE_LIMIT` `AUDIT_DB_THROTTLE_PREFIXES` `AUDIT_DB_THROTTLE_WINDOW_SEC`
- **BRAND**:
  - `BRAND_BANNER_FILE_ID` `BRAND_LEAD_RATE_LIMIT` `BRAND_LEAD_RATE_WINDOW_SEC` `BRAND_PLAN_BASIC_PRICE` `BRAND_PLAN_DURATION_DAYS` `BRAND_PLAN_MAX_PRICE` `BRAND_PLAN_PRO_CREDITS` `BRAND_PLAN_PRO_FEATURED_DAYS` `BRAND_PLAN_PRO_MATCH` `BRAND_PLAN_PRO_PRICE`
  - `BRAND_PLAN_START_CREDITS` `BRAND_PLAN_START_PRICE` `BRAND_PROFILE_REQUIRED` `BRAND_TOPUP_L_CREDITS` `BRAND_TOPUP_L_PRICE` `BRAND_TOPUP_M_CREDITS` `BRAND_TOPUP_M_PRICE` `BRAND_TOPUP_S_CREDITS` `BRAND_TOPUP_S_PRICE` `BRAND_VERIFY_REQUIRES_EXTENDED`
- **CREATOR**: `CREATOR_BRAND_APPLY_DAILY_LIMIT` `CREATOR_BRAND_APPLY_DAILY_WINDOW_SEC` `CREATOR_BRAND_APPLY_RATE_LIMIT` `CREATOR_BRAND_APPLY_RATE_WINDOW_SEC`
- **MATCH**: `MATCH_FEAT_AUTO_APPLY_ENABLED` `MATCH_L_COUNT` `MATCH_L_PRICE` `MATCH_M_COUNT` `MATCH_M_PRICE` `MATCH_S_COUNT` `MATCH_S_PRICE`
- **BARTER**: `BARTER_BUMP_COOLDOWN_HOURS` `BARTER_BUMP_COOLDOWN_HOURS_FREE` `BARTER_BUMP_COOLDOWN_HOURS_PRO` `BARTER_FEED_PAGE_SIZE` `BARTER_INBOX_PAGE_SIZE` `BARTER_MAX_ACTIVE_OFFERS_FREE` `BARTER_MAX_ACTIVE_OFFERS_PRO`
- **GIVEAWAY**: `GIVEAWAY_BANNER_FILE_ID` `GIVEAWAY_NOTIFY_CHANNEL_ON_END` `GIVEAWAY_NOTIFY_CHANNEL_ON_WINNERS` `GIVEAWAY_NOTIFY_OWNER_ON_END` `GIVEAWAY_NOTIFY_OWNER_ON_WINNERS` `GIVEAWAY_SPONSORS_MAX_FREE` `GIVEAWAY_SPONSORS_MAX_PRO`
- **BX**: `BX_MSG_RATE_LIMIT` `BX_MSG_RATE_WINDOW_SEC`
- **RATE**: `RATE_LIMIT_ENABLED`
- **WEBHOOK**: `WEBHOOK_SECRET_TOKEN`
- **ANALYTICS**: `ANALYTICS_ENABLED`
- **BANNER**: `BANNER_COOLDOWN_HOURS`
- **FEATURED**: `FEATURED_1D_PRICE` `FEATURED_30D_PRICE` `FEATURED_7D_PRICE` `FEATURED_MAX_SLOTS`
- **GUIDE**: `GUIDE_BANNER_FILE_ID`
- **MENU**: `MENU_BANNER_FILE_ID`
- **OFFICIAL**: `OFFICIAL_1D_PRICE` `OFFICIAL_30D_PRICE` `OFFICIAL_7D_PRICE` `OFFICIAL_CHANNEL_ID` `OFFICIAL_CHANNEL_USERNAME` `OFFICIAL_MANUAL_DEFAULT_DAYS` `OFFICIAL_PUBLISH_ENABLED` `OFFICIAL_PUBLISH_MODE`
- **ONBOARDING**: `ONBOARDING_V2_ENABLED`
- **PAY**: `PAY_SUPPORT_TEXT`
- **PRO**: `PRO_DURATION_DAYS` `PRO_PAYMENT_URL` `PRO_STARS_PRICE`
- **TG**: `TG_ACCESS_CHECK_CONCURRENCY`
- **VERIFICATION**: `VERIFICATION_ENABLED`
- **WORKSPACE**: `WORKSPACE_CURATORS_MAX_FREE` `WORKSPACE_CURATORS_MAX_PRO` `WORKSPACE_EDITOR_INVITE_TTL_MIN` `WORKSPACE_FOLDER_MAX_ITEMS_FREE` `WORKSPACE_FOLDER_MAX_ITEMS_PRO`


### Intro trial (для брендов)
- `INTRO_TRIAL_CREDITS=3` — разовый тест-бонус: **3** кредита на первые интро (чтобы бренду было проще попробовать). Для выключения: `INTRO_TRIAL_CREDITS=0`.


### Brand Pass: защита монетизации (контакты/ссылки)
- Витрина креатора для бренда по умолчанию показывает **без контактов**: канал / IG / портфолио скрыты до «🔓 Контакты».
- В свободном тексте профиля (описание) до unlock **редактируются** паттерны `@...`, `t.me/...`, `http(s)://...`, email, **телефоны (в цифрах и словами)** → показывается «🔒 … скрыто». Подробно: `docs/20_CONTACTS_MODEL.md`.
- После списания «🔓 Контакты» бренд видит полный **контакт‑пакет** (TG/IG/портфолио) + кнопки.
- STEP105 (P2 roadmap старт): добавлен контейнер **структурированных контактов** `workspace_settings.profile_contacts` (JSONB).
- Приоритет отображения после unlock: **структурные контакты → (если пусто) контакт (текстом)**.
  - На этом шаге это **read-only**: если поле заполнено — оно показывается **только после unlock**.
  - Legacy поля (`profile_contact`, `profile_ig`, `profile_portfolio_urls`) продолжают работать и используются, если `profile_contacts` пуст.
- Защита от повторного списания при деградации Redis: unlock фиксируется в DB (`brand_contact_unlocks.unlocked_until`), Redis остаётся как кеш/UX.
- STEP106: добавлен opt-in UI для креатора: «📇 Контакты (структурно)» в профиле. Ввод валидируется/нормализуется на входе и сохраняется в `profile_contacts`.
  - UX правило: достаточно **1** контакта (обычно Telegram). Email/Website — опционально. Phone — не обязателен.
- STEP107 (опционально): добавлена кнопка «✨ Перенести из «Контакт»» — переносит **одно** значение из `profile_contact` в `profile_contacts` (tg/email/phone/site) только если распознавание однозначное. Никакой авто-магии и без перетирания уже заполненных полей.
- STEP119: усилен anti‑bypass для телефонов в свободном тексте — маскируем номера, написанные **словами** (например: «плюс семь девять…»).
- STEP120: broadcast 429 cooldown: добавлен DB fuse `broadcasts.cooldown_until` на случай деградации Redis (без polling recipients).
- Баланс кредитов для Brand UI берём **Redis-first** (TTL ~60s, `BRAND_CREDITS_CACHE_TTL_SEC`) → меньше чтений Neon.

#### Brand Inbox (заявки креаторов → бренду)
- В карточке заявки кнопка **✅ Принять** — точка монетизации: открывает диалог и **списывает кредиты Brand Pass** (env: `BRAND_APP_ACCEPT_COST`, по умолчанию 1).
- До принятия (status=new) **нельзя** ответить/отправить шаблон (нельзя “обойти” списание). После принятия доступны «✍️ Ответить» и «⚡ Шаблоны».
- В статусе `new` рядом с подсказкой показываем **баланс кредитов** (Redis‑only, без DB fallback). Если кэша нет — показываем «—» и предлагаем открыть Brand Pass.



#### Creator → Каталог брендов (заявка бренду)
- Нажатие «✍️ Написать заявку» включает **режим ввода** (expectText) и показывает явный баннер «Режим ввода включён».
- Есть кнопка «❌ Отмена ввода» (сбрасывает только режим ввода, черновик не удаляет).


#### Giveaways (розыгрыши)
- «🎁 Розыгрыши → ➕ Новый розыгрыш» требует активный подключённый канал (витрину).
- Если `active_ws` устарел/канал недоступен — показываем **gate‑экран** с понятными CTA (подключить/выбрать канал) и корректным back; stale `active_ws` чистим в Redis.

### Founder Sale (promo)
- `FOUNDER_SALE_ENABLED=true|false`
- `FOUNDER_SALE_DEADLINE=2026-03-01T23:59:59+03:00` (МСК).

> Примечание: на UI дедлайн форматируется как «1 марта 23:59 (МСК)». Если задашь `...Z`, на UI покажется время в МСК (сдвинутое), что корректно, но может удивить.
- `FOUNDER_BRAND_3M_PRICE=1999`, `FOUNDER_BRAND_12M_PRICE=4999`, `FOUNDER_CREATOR_12M_PRICE=2499`
- `FOUNDER_BRAND_3M_CREDITS=100`, `FOUNDER_BRAND_12M_CREDITS=200`

**Runtime управление из админки (без деплоя):**
- `👑 Админка → 🔥 Founder Sale` — включает/выключает и позволяет менять дедлайн/цены/кредиты.
- Значения хранятся в Redis (override), при отсутствии override используются ENV.
- «Сброс к ENV» удаляет override и возвращает поведение к переменным окружения.

Рекомендация для прода: в ENV держать `FOUNDER_SALE_ENABLED=false`, а включать через админку (Redis override). Это защищает от случайного “sale ON” при деградации Redis.

**Deep-link для маркетинга:**
- `https://t.me/<BOT_USERNAME>?start=fs_<tag>` → сразу открывает экран Founder Sale (пример: `fs_offers_a`, `fs_offers_b`, `fs_gw_brand`, `fs_gw_creator`).
- Эти ссылки сохраняются при пересылке постов, поэтому их всегда дублируем в тексте.


### Audit DB throttling
- `AUDIT_DB_THROTTLE_ENABLED=true|false`
- `AUDIT_DB_THROTTLE_LIMIT`, `AUDIT_DB_THROTTLE_WINDOW_SEC`
- `AUDIT_DB_THROTTLE_PREFIXES` — какие audit-события считаем шумными (можно расширять точечно после метрик).

Подробный план и готовые профили: `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`.

---

## 6) Быстрый smoke (после деплоя)

1) `/api/health` отдаёт `ok:true`, есть `cron.*`.
2) Если включён audit throttle → `audit.throttle.suppressed_*` не ломает ответ.
3) Brand BX menu → “👔 Менеджеры бренда” видна, gate корректен, back через `ret` работает.
4) Broadcast:
   - создать тест-рассылку с 1 URL-кнопкой и deep-link shortcut
   - запустить tick вручную
   - убедиться: финальное сообщение “завершена” с кнопками.
5) Role gate:
   - новый юзер `/start` без payload → видит развилку
   - deep link `/start gw_...` работает напрямую.

---

## 7) Короткий список изменений за текущую сессию (для handoff)

- `/api/health`: cron last_run + безопасные Redis-метрики
- Audit write-shedding (ENV-гейт) + счётчики suppressed в health
- Broadcast: URL-кнопки до 3, deep-link shortcuts, шаблоны кнопок, ссылки “в слово”, финальный экран с кнопками
- Role gate на `/start` (Redis `ui_mode`, payload priority, fail-open)

- Contacts / Brand Pass (P2): structured contacts (`profile_contacts` JSONB) + opt-in UI + перенос из «Контакт» + явные подсказки (см. `docs/20_CONTACTS_MODEL.md`).

- Official channel publish: token-lock + DB-reserve (PUBLISHING) для защиты от дублей
- Broadcast: Redis cooldown на 429 + отображение cooldown в `/api/health`
- Cron: token-based locks (safe unlock) + SQL atomic guards на критичных статусных переходах
- Cron: Telegram notify обёрнуты в `withTimeout(~5s)` чтобы тик не “залипал”
- Brand Pass UX: «💳 Купить ещё» из витрины креатора → Brand Pass → кнопка «⬅️ Вернуться к витрине».
- Creator → заявки брендам: «✍️ Написать заявку» включает явный режим ввода + «❌ Отмена ввода» (без “тишины”).
- Brand Inbox: «✅ Принять» — точка списания (exactly‑once), до принятия нельзя «Ответить/Шаблоны»; показываем баланс кредитов (Redis-only).
- Giveaways: «➕ Новый розыгрыш» при отсутствии/проблеме канала показывает gate‑экран (как в офферах), без молчаливых тупиков.
- UX polish: убрали “legacy/старое” из UI, добавили кнопки `🧹 Очистить` (контакт/IG/портфолио/описание + structured поля); `-` остаётся скрытым шорткатом для совместимости.
- Sweep: в ключевых местах вместо “тишины” на устаревших кнопках показываем понятный экран + кнопки назад/меню/home.
- Copy унификация: тексты гейтов для новичка приведены к одному короткому шаблону (без перегруза).

Примечание: в корне репозитория есть `migration_pack/` — ручные SQL-скрипты для экстренного переноса/repair (не используются рантаймом).


## ENV

### Support / Ops (единый операторский чат)

- `SUPPORT_CHAT_ID=-100...` — приватная группа/чат, куда бот пересылает обращения пользователей (кнопка 💬 Поддержка) и куда же приходят системные алерты.
  Пользователь пишет **только боту**; в группу он не попадает.
- `OPS_ALERT_SUMMARY_MIN=10` — анти-спам для алертов: бот шлёт дайджест не чаще 1 раза в N минут (первый алерт в окне — сразу, дальше — суммарно).
- `OPS_ALERT_BUFFER_MAX=200` — максимум событий в буфере алертов (Redis-only).
- `OPS_ALERT_SILENT=1` — «тихий режим» (по умолчанию): в чат летят только <b>ошибки/фейлы</b> (error/failed), без инфо-шумов.

Поддержка «по-человечески» прямо из группы:
- В тикете есть кнопка <b>✍️ Ответить</b>.
- Бот пришлёт подсказку. Просто ответь (reply) на сообщение бота одним текстом — бот доставит пользователю.
- Отмена: ответь <code>/cancel</code>.

Быстрые шаблоны ответов (1 клик):
- В тикете рядом с «✍️ Ответить» есть кнопки: ✅ Принято / ❓ Нужны детали / ✅ Сделали / ⏳ В работе.
- Нажимаешь — бот сразу отправляет пользователю готовый ответ и пишет подтверждение в группу.

Важно про права в SUPPORT-чате:
- Бот должен быть <b>админом</b> в группе (или privacy mode у бота должен быть выключен), иначе Telegram может не присылать боту reply-сообщения админов, и «✍️ Ответить» работать не будет.


### Smart Matching / Featured — авто-обработка оплат (Stars)

- `MATCH_FEAT_AUTO_APPLY_ENABLED=1` — после оплаты бот автоматически запускает Smart Matching / Featured (попросит бриф/контент).
- `MATCH_FEAT_AUTO_APPLY_ENABLED=0` — авто-режим выключен: оплаты Smart Matching / Featured помечаются как **ORPHANED** и требуют ручной обработки в админке.

### Payments: TTL сессии оплаты (чтобы не ловить ORPHANED)

- `PAYMENT_SESSION_TTL_MIN=360` — TTL (в минутах) для Redis-сессий оплаты `pay_*` (контекст счёта: wsId/ret/packId и т.д.).
  Если TTL слишком короткий и пользователь оплачивает поздно, возможен статус ORPHANED `missing_session`.
  Диапазон: 10..1440 минут (10 минут .. 24 часа).

### Payments: fallback apply без pay_* сессии (anti-ORPHANED)

- `PAYMENTS_FALLBACK_APPLY_ENABLED=1` — если Redis-сессия оплаты `pay_*` истекла, бот всё равно применит оплату по `invoice_payload` (без ручной очереди).
- `PAYMENTS_FALLBACK_APPLY_ENABLED=0` — строгий режим: без `pay_*` сессии оплата станет ORPHANED `missing_session`.

### Payments hardening: защита от неверных счетов/сумм

- `pre_checkout_query` теперь **валидирует** `invoice_payload + total_amount + currency` до списания Stars.
- На `successful_payment` повторная валидация (защита от ретраев/краевых кейсов) → при несоответствии статус **ORPHANED** + алерт в OPS.
- Fallback apply (cron/админка) и ручной Apply в админке **блокируются**, если сумма/валюта не совпадают с ожидаемыми для продукта.

### Payments idempotency: защита от дублей apply (serverless)

- В payments ledger используется уникальный `telegram_payment_charge_id` (и дополнительный unique для `provider_payment_charge_id`).
- Перед любыми сайд‑эффектами (начисления/активации) payment **claim**-ится в DB статусом `APPLYING` (atomic update). Это защищает от Telegram retries и параллельного apply (cron/admin/user).

### Ownership-in-SQL (anti-bypass) для чувствительных сущностей

- Для лидов/заявок больше не используем паттерн «достали по id → потом проверили». В callback-router применяются safe-getters:
  - `db.getBrandLeadForActor(leadId, actorUserId)`
  - `db.getBrandApplicationForActor(appId, actorUserId)`
- Действия с глобальным эффектом по лидам (assign / soft-delete) дополнительно ограничены ролями: <b>owner/curator/admin</b>.
- Покупка размещения в офиц.канале (`a:off_buy`) получает оффер только через `db.getBarterOfferForOwner(ownerUserId, offerId)` (ownership в SQL).

---

## Admin: подарки и отзыв подписок

- `👑 Админка → 🎁 Подарить подписку` — выдача подарков (Brand Plan Старт/Про, PRO Креатор).
- После выдачи подарка получателю приходит сообщение с быстрыми действиями: перейти в режим Бренд (без принудительного переключения), открыть ⭐️ Brand Plan, поделиться ботом.
- В этом же меню есть `⛔ Забрать / отменить подписку`:
  - забрать Brand Plan (подписка)
  - забрать PRO
  - 🧾 забрать **подарочные** кредиты (только подарочные, купленные/триал не трогаем)
  - ⛔+🧾 забрать Brand Plan + подарочные кредиты
  - (опасно) обнулить кредиты (→0, всё)


Примечание про кредиты Brand Pass:
- UX: если открыть покупку из витрины креатора (кнопка «💳 Купить ещё»), в экране Brand Pass появляется «⬅️ Вернуться к витрине» (контекст wsId).

- В базе есть общий баланс `brand_credits` и отдельный остаток подарков `brand_credits_gifted`.
- При списании кредиты тратятся сначала из подарочных (уменьшается `brand_credits_gifted` до 0).
- Команда «🧾 забрать подарочные» снимает только остаток подарочных, не затрагивая купленные/триал.
### Payments: auto-heal ORPHANED `missing_session` (cron + админка)

- `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED=1` — cron будет периодически пытаться авто-применять ORPHANED с `note=missing_session` (только безопасные типы: PRO / кредиты / Brand Plan / founder_brand_*).
- `PAYMENTS_ORPHANED_AUTOHEAL_BATCH=20` — сколько платежей чинить за один тик (0..100).
- В админке: **Admin → Payments (ORPHANED)** → кнопка **Auto-heal missing_session**.

Auto-heal safeguards + ops alerts:
- Перед apply делает **строгую валидацию** payload/amount/currency. Если не проходит → помечает `note=autoheal_manual_required:<reason>` и шлёт ops alert `autoheal_validation_failed` (чтобы не было тихих ретраев).
- Для постоянных non-applied кейсов (unsupported_payload / bad_input / user_mismatch / missing_userid_or_wsid) → помечает `note=autoheal_manual_required:<reason>` и шлёт ops alert `autoheal_manual_required_failed`.
- Если apply прошёл, но user notify не удалось → ops alert `autoheal_notify_failed`.
- Исключения/ошибки в тикe → ops alert `autoheal_failed`.

Примечание: оплаты `offpub_*` (публикация в офиц.канал) остаются ручными по дизайну (модерация).
