# 00 — CURRENT STATE (Collabka PR Bot) — 2026-02-22

**Purpose:** единый *source of truth* snapshot, чтобы продолжать работу в новом чате без потери контекста.

---

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
- На `429 Too Many Requests` курсор **не сдвигается** (получатель не теряется).
- Ставим **Redis cooldown** на `retry_after`, следующие тики делают `skip` до истечения.
- Cooldown виден в `/api/health` → `broadcast.cooldown`.

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

### Intro trial (для брендов)
- `INTRO_TRIAL_CREDITS=3` — разовый тест-бонус: **3** кредита на первые интро (чтобы бренду было проще попробовать). Для выключения: `INTRO_TRIAL_CREDITS=0`.


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

- Official channel publish: token-lock + DB-reserve (PUBLISHING) для защиты от дублей
- Broadcast: Redis cooldown на 429 + отображение cooldown в `/api/health`
- Cron: token-based locks (safe unlock) + SQL atomic guards на критичных статусных переходах
- Cron: Telegram notify обёрнуты в `withTimeout(~5s)` чтобы тик не “залипал”

Примечание: в корне репозитория есть `migration_pack/` — ручные SQL-скрипты для экстренного переноса/repair (не используются рантаймом).


## ENV

### Support / Ops (единый операторский чат)

- `SUPPORT_CHAT_ID=-100...` — приватная группа/чат, куда бот пересылает обращения пользователей (кнопка 💬 Поддержка) и куда же приходят системные алерты.
  Пользователь пишет **только боту**; в группу он не попадает.
- `OPS_ALERT_SUMMARY_MIN=10` — анти-спам для алертов: бот шлёт дайджест не чаще 1 раза в N минут (первый алерт в окне — сразу, дальше — суммарно).
- `OPS_ALERT_BUFFER_MAX=200` — максимум событий в буфере алертов (Redis-only).

### Smart Matching / Featured — авто-обработка оплат (Stars)

- `MATCH_FEAT_AUTO_APPLY_ENABLED=1` — после оплаты бот автоматически запускает Smart Matching / Featured (попросит бриф/контент).
- `MATCH_FEAT_AUTO_APPLY_ENABLED=0` — авто-режим выключен.
  - если `MATCH_FEAT_SELF_SERVICE_WHEN_AUTO_OFF=1` (рекомендуется) → бот не требует ручной обработки: после оплаты попросит бриф/контент и создаст заявку (self-service).
  - если `MATCH_FEAT_SELF_SERVICE_WHEN_AUTO_OFF=0` → оплаты match/feat попадают в очередь как ORPHANED и требуют ручной обработки.

- `MATCH_FEAT_SELF_SERVICE_WHEN_AUTO_OFF=1|0` — поведение при выключенном авто-режиме (см. выше).

### Payments: TTL сессии оплаты (чтобы не ловить ORPHANED)

- `PAYMENT_SESSION_TTL_MIN=360` — TTL (в минутах) для Redis-сессий оплаты `pay_*` (контекст счёта: wsId/ret/packId и т.д.).
  Если TTL слишком короткий и пользователь оплачивает поздно, возможен статус ORPHANED `missing_session`.
  Диапазон: 10..1440 минут (10 минут .. 24 часа).

### Payments: fallback apply без pay_* сессии (anti-ORPHANED)

- `PAYMENTS_FALLBACK_APPLY_ENABLED=1` — если Redis-сессия оплаты `pay_*` истекла, бот всё равно применит оплату по `invoice_payload` (без ручной очереди).
- `PAYMENTS_FALLBACK_APPLY_ENABLED=0` — строгий режим: без `pay_*` сессии оплата станет ORPHANED `missing_session`.

---

## Admin: подарки и отзыв подписок

- `👑 Админка → 🎁 Подарить подписку` — выдача подарков (Brand Plan Старт/Про, PRO Креатор).
- В этом же меню есть `⛔ Забрать / отменить подписку`:
  - забрать Brand Plan
  - забрать PRO
  - (опционально) обнулить кредиты (опасно)

### Payments: auto-heal ORPHANED `missing_session` (cron + админка)

- `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED=1` — cron будет периодически пытаться авто-применять ORPHANED с `note=missing_session` (только безопасные типы: PRO / кредиты / Brand Plan / founder_brand_*).
- `PAYMENTS_ORPHANED_AUTOHEAL_BATCH=20` — сколько платежей чинить за один тик (0..100).
- В админке: **Admin → Payments (ORPHANED)** → кнопка **Auto-heal missing_session**.

Примечание: оплаты `offpub_*` (публикация в офиц.канал) остаются ручными по дизайну (модерация).
