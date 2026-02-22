# Techpassport Collabka v1.0.3 (Telegra.ph) — compat mirror

> ⚠️ Compatibility mirror: основной файл — docs/process/04_legacy_techpassport_collabka_v1_0_3_telegra.md.
>
> Оставлено для старых ссылок. Актуальное состояние PR бота описано в docs/00_CURRENT_STATE.md.

---

# Техпаспорт Collabka (BeautyCollabBot) v1.0.3 — Telegra.ph

> ⚠️ **Legacy reference (v1.0.3):** часть деталей может не совпадать с текущим PR ботом.
> Source of truth: `docs/00_CURRENT_STATE.md` (2026-02-22).


## PR Bot deltas (2026-02-20) — читать перед использованием legacy-описаний
- `/api/health`: cron last_run + audit-throttle counters (Redis-only, fail-open).
- Audit write-shedding: `AUDIT_DB_THROTTLE_*` (снижаем INSERT в `workspace_audit`).
- Broadcast: `/api/cron/broadcast-tick`, URL-кнопки (до 3), shortcuts `gw_/bp_/offer_`, links “в слово” (entities → HTML).
- `/start` role-gate: `ui_mode` (Redis), payload priority, fail-open.
- Cron auth: `Authorization: Bearer <CRON_SECRET>` (в legacy может встречаться `CRON_KEY`).

> Документ для владельца и тех.команды: **архитектура**, **модули**, **схемы флоу**, **ENV**, **миграции**, **тестирование**, **релиз-чеклист**.

---

## Оглавление
1. Назначение и границы системы
2. Архитектура и деплой
3. Структура репозитория
4. Роли и права доступа
5. Основные модули и флоу (блок-схемы)
   - 5.1 Подключение канала (Workspace)
   - 5.2 Giveaways (создание → публикация → участие → проверка → завершение → розыгрыш → итоги)
   - 5.3 Barter Marketplace (офферы → лента → карточка → inbox → тред)
   - 5.4 Brand Pass (credits) и анти-спам
   - 5.5 Telegram Stars (оплаты)
   - 5.6 Модерация и репорты
   - 5.7 ✅ Верификация (feature-flag)
6. Postgres: сущности и связи
7. Redis: ключи и TTL
8. ENV: переменные и назначение
9. Миграции: список и назначение
10. Сценарии тестирования (E2E)
11. Релиз-чеклист (prod)
12. Troubleshooting

---

## 1) Назначение и границы системы
**Collabka** — Telegram-бот для организации коллабораций в бьюти-нише:
- конкурсы/розыгрыши внутри Telegram-каналов
- бартер-биржа офферов (креаторы ↔ бренды)
- inbox-треды для сделок
- монетизация через Telegram Stars (PRO/Brand Pass/Featured/Matching)
- модерация и анти-абьюз
- опционально: ✅ верификация

**Не входит:** внешние CRM, аналитика через GA, KYC, хранение медиа (кроме file_id Telegram).

---

## 2) Архитектура и деплой
**Runtime:** Node.js (ESM), библиотека grammy.

**Деплой:** Vercel serverless.

**Точки входа:**
- `POST /api/webhook` — Telegram webhook updates
- `GET/POST /api/cron/giveaways-tick` — cron-триггер для завершений/розыгрышей
- `GET /api/dev-polling` — dev-only polling (если включено)

**Данные:**
- Postgres (Neon) — основное хранилище
- Redis (Upstash REST) — сессии/черновики/локи/TTL-кэш

**Принцип:** бот stateless, все состояния пользователя в Redis/DB.

---

## 3) Структура репозитория
- `api/`
  - `webhook.js` — вход webhook, передаёт update в bot
  - `cron/giveaways-tick.js` — cron endpoint
  - `dev-polling.js` — polling для dev
- `src/`
  - `bot/bot.js` — меню, роутинг, callbacks, payments, verification/mod
  - `bot/cron.js` — задачи/тикер giveaway
  - `bot/draft.js` — drafts + expectText
  - `bot/helpers.js` — утилиты
  - `db/pool.js` — pg pool
  - `db/queries.js` — все SQL запросы
  - `lib/config.js` — конфиг/ENV
- `migrations/`
  - `001_*.sql … 010_*.sql`
  - `run.js` — миграционный runner

---

## 4) Роли и права доступа
**User roles:**
- Creator/Owner: владелец канала (workspace)
- Brand: пользователь без воркспейсов, покупает credits для первого контакта

**Admin roles:**
- Super Admin: `SUPER_ADMIN_TG_IDS`
- Network Moderator: таблица `network_moderators`

**Права:**
- управление каналом: только owner (+ опционально curators)
- модерация: только moderator
- админка: только super admin

---

## 5) Модули и флоу (блок-схемы)

### 5.1 Подключение канала (Workspace)
```
User /start
  -> "Подключить канал"
     -> бот просит переслать пост из канала
        -> пользователь forwards message
           -> бот извлекает sender_chat/forward_from_chat
              -> создаёт workspaces + workspace_settings
              -> сохраняет active workspace (Redis)
              -> показывает меню канала
```

Ключевые проверки:
- бот должен быть админом канала
- username канала может быть null (приватный)

---

### 5.2 Giveaways (полный цикл)
```
Owner: Создать конкурс
  -> Draft (Redis)
     -> Настройки: приз/победители/дедлайн/спонсоры/авто
        -> Preview
           -> Publish to channel
              -> Participants join via deeplink
                 -> "Участвовать"
                    -> Entry created
                 -> "Проверить участие"
                    -> check sponsors (getChatMember)
                    -> mark eligible

Cron tick / Manual end
  -> status ENDED
  -> draw winners (deterministic seed)
  -> store winners + audit
  -> owner preview
  -> publish results
```

Детерминированность:
- seed строится из стабильных параметров конкурса
- audit хранит хэши пула

---

### 5.3 Barter Marketplace
```
Creator publishes offer
  -> offer ACTIVE
  -> appears in feed

Brand/Creator opens offer
  -> "Написать"
     -> getOrCreate thread
        -> if new: maybe charge brand credit
        -> show Inbox thread

Thread
  -> messages stored
  -> close/reopen via UI
```

---

### 5.4 Brand Pass (credits) — анти-спам
```
Brand wants to DM first time
  -> if thread exists: free
  -> else:
     if user has NO workspaces:
       require brand_credits > 0
       charge 1
     create thread
```

Принцип:
- кредиты списываются **только при создании нового треда**
- повторные сообщения в существующем треде бесплатны

---

### 5.5 Telegram Stars (оплаты)
```
User clicks "Buy" (PRO/credits/featured/etc)
  -> create pay-session (Redis)
  -> sendInvoice with payload
  -> on successful_payment:
       read pay-session
       apply DB changes
       delete pay-session
```

Типы покупок:
- PRO для workspace
- Brand credits packs
- Brand plan
- Featured placements
- Matching requests

---

### 5.6 Модерация и репорты
```
User submits report
  -> barter_reports OPEN

Moderator:
  -> view queue
  -> freeze offer / close thread
  -> resolve report
```

---

### 5.7 ✅ Верификация (feature-flag)
**Включается:** `VERIFICATION_ENABLED=true`.

User flow:
```
Menu -> ✅ Верификация
  -> choose kind (creator/brand)
     -> instructions
        -> user sends text
           -> upsert user_verifications PENDING
           -> notify moderators
```

Moderator flow:
```
Mod menu -> ✅ Верификации (N)
  -> list pending
     -> view card
        -> Approve
        -> Reject (asks reason)
           -> set REJECTED + reason
           -> notify user
```

Отображение:
- ✅ бейдж в ленте офферов
- ✅ в карточке оффера
- ✅ у собеседника в Inbox

Rolling safety:
- если таблицы verifications нет, при включённом флаге бот fallback’ится на старые запросы.

---

## 6) Postgres: сущности и связи (сводно)
| Сущность | Назначение | Ключи/связи |
|---|---|---|
| users | все пользователи | tg_id unique |
| workspaces | привязанные каналы | owner_user_id -> users |
| workspace_settings | настройки канала | workspace_id PK |
| giveaways | конкурсы | workspace_id |
| giveaway_entries | участия | giveaway_id + user_id |
| giveaway_winners | победители | giveaway_id |
| barter_offers | офферы | workspace_id |
| barter_threads | треды сделок | offer_id + buyer_user_id unique |
| barter_messages | сообщения | thread_id |
| barter_reports | жалобы | offer_id/thread_id |
| network_moderators | модераторы | user_id |
| featured_placements | платные места | workspace_id |
| matching_requests | подбор | requester_user_id |
| user_verifications | верификация | user_id PK |

---

## 7) Redis: ключи и TTL
| Key | Назначение | TTL |
|---|---|---|
| expect:<tgId> | ожидаемый ввод (wizard) | 10–30 мин |
| draft:<tgId> | черновики создания | 30–60 мин |
| active_ws:<tgId> | выбранный канал | 7–30 дней |
| pay:<tgId> | сессия оплаты | 15–30 мин |
| lock:giveaways_tick | lock cron | 1–3 мин |
| elig_cache:<gw>:<u>:<chat> | кэш проверки подписок | 1–10 мин |

---

## 8) ENV: переменные и назначение

### Базовые
| ENV | Пример | Назначение |
|---|---|---|
| APP_ENV | prod | namespace Redis |
| BOT_TOKEN | 123:ABC | Telegram token |
| BOT_USERNAME | CollabkaBot | username бота |
| DATABASE_URL | postgres:// | Neon Postgres |
| UPSTASH_REDIS_REST_URL | https://... | Redis REST |
| UPSTASH_REDIS_REST_TOKEN | ... | Redis token |
| CRON_KEY | secret | защита cron |
| SUPER_ADMIN_TG_IDS | 123,456 | супер-админы |

### Монетизация (Stars)
| ENV | Назначение |
|---|---|
| PRO_STARS_PRICE | цена PRO |
| BRAND_CREDITS_PACK_* | пакеты credits |
| FEATURED_STARS_PRICE | цена featured |
| MATCH_STARS_PRICE | цена matching |

### Флаги
| ENV | Назначение |
|---|---|
| VERIFICATION_ENABLED | включает ✅ верификацию |

---

## 9) Миграции: список и назначение
> Точный список может отличаться по репозиторию; ниже — логика по этапам.

| № | Файл | Назначение |
|---:|---|---|
| 001 | init | users/workspaces/settings |
| 002 | giveaways | giveaways таблицы |
| 003 | sponsors | sponsors/entries |
| 004 | barter offers | офферы |
| 005 | barter threads/messages | inbox |
| 006 | credits/plans | Brand Pass/Plan |
| 007 | moderation | reports/mods |
| 008 | featured/matching | paid features |
| 009 | ux/fields | доп.поля |
| 010 | user_verifications | ✅ верификация |

Запуск миграций:
```bash
node migrations/run.js
```

---

## 10) Сценарии тестирования (E2E)

### A) Smoke
1) `/start` → меню открывается
2) Подключение канала через forward
3) Создание оффера → появляется в бирже
4) Кнопка “Написать” → создаёт тред

### B) Giveaways
1) Создать конкурс draft → publish
2) Участник: join → check eligibility
3) Завершить → draw winners → publish results

### C) Credits
1) Пользователь без workspace (brand) пытается написать → требует credits
2) Купить credits (Stars) → баланс вырос
3) Написать → credits списались
4) Повторное открытие того же треда → не списывает

### D) Moderation
1) Отправить report
2) Модератор открывает queue
3) Freeze offer / resolve

### E) Verification (flag)
1) `VERIFICATION_ENABLED=false` → пункта нет
2) Включить flag → появляется пункт
3) User submits verification
4) Moderator sees queue, approve
5) В бирже появляется ✅

---

## 11) Релиз-чеклист (prod)

### Перед деплоем
- [ ] Node 20+ на Vercel
- [ ] Neon DB создан
- [ ] Upstash Redis создан
- [ ] `.env` заполнен

### Деплой
- [ ] GitHub → Vercel
- [ ] setWebhook на `/api/webhook`
- [ ] CRON настроен на `/api/cron/giveaways-tick`

### После деплоя
- [ ] run migrations `node migrations/run.js`
- [ ] smoke test: start, workspace, offer, inbox
- [ ] если нужен verification:
  - [ ] `VERIFICATION_ENABLED=true`
  - [ ] модераторы в `network_moderators`

---

## 12) Troubleshooting

### Бот не видит подписку на спонсора
- бот не админ в sponsor chat/channel
- sponsor приватный без доступа

### Cron запускается дважды
- проверь Redis lock и расписание Vercel

### Stars оплата не засчитывается
- pay-session TTL истёк до оплаты
- payload mismatch

### Verification не показывает ✅
- флаг выключен
- миграции не прогнаны
- user_verifications статус не APPROVED

---

**Конец техпаспорта.**


