# 24 — IG INTEGRATION (OAUTH ONLY) — SPEC v3 — 2026-02-27

**Назначение:** интеграция Instagram как:
- **trust‑signal** (Verified badge виден бренду *до* unlock),
- **контакт‑канал** (handle + ссылка видны *только после* unlock),
- **платформа** (stats/publish/automations на базе Graph API — позже),

при этом без утечек аккаунтов креаторов и без влияния на монетизацию.

> ✅ На текущем этапе **OAuth‑подключение и Verified badge доступны на FREE**. Никаких paywall/PRO-гейтов для креаторов. Монетизация остаётся на уровне unlock контактов.

> ⚠️ CURRENT STATUS (prod): **интеграция временно скрыта из UI** из‑за ограничений/блокировок со стороны Meta.
> Код и эндпоинты сохранены, но кнопка подключения в боте **не показывается**, пока не восстановим доступ к Pages через OAuth.
> Подробности/пост‑мортем и план возврата: `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`.

Связанные документы:
- `docs/01_SECURITY_INVARIANTS.md`
- `docs/12_INFRA_CONTROL_PLANE.md`
- `docs/20_CONTACTS_MODEL.md`
- `docs/10_QSTASH_RUNBOOK.md` (паттерны: подпись, деградации; для будущих PRO джоб)

> ⚠️ В этом SPEC **нет Level B (комментарии/коды)**. Публичная comment‑верификация создаёт bypass (бренд может собрать список usernames на посте) и **не используется**.

---

## 0) Инварианты (жёстко)

1) **Никаких IG API** в hot paths (меню/хабы/витрина/кнопки). Только async / по явному действию.
2) **Монетизация не зависит от IG API.** Unlock/кредиты/платежи живут отдельно.
3) **IG handle = контакт ⇒ paywall.** До unlock нельзя раскрывать `@handle`, url, `ig_user_id`.
4) **Verified badge = trust signal.** Его можно показывать до unlock, но без контакта.
5) Токены **не логируем**, **не отправляем в клиент**, **храним шифрованно**.
6) Redis down → **fail‑open** для UI (покажем “временно недоступно”), DB down → **fail‑closed** для connect/disconnect.

---

## 1) Цели и не‑цели

### Цели
- Верификация креатора через **официальный OAuth** (Meta/Instagram Graph).
- Verified badge появляется **только** после успешного OAuth.
- Бренду до unlock виден **только** бейдж (без контакта).
- Минимальный “plumbing” для следующих шагов: stats cache / one‑click publish.

### Не‑цели (на STEP140A)
- Insights/stats (это следующий шаг, cache 24h).
- Публикация/DM/авто‑воронки.
- Любая публичная comment‑верификация.

---

## 2) UX‑контракт (что видят стороны)

### Бренд ДО unlock
- `Instagram: ✅ Verified` (если подключено)
- **Никаких** `@handle`, ссылок, username, id.

### Бренд ПОСЛЕ unlock (в contact‑pack)
- `@handle`
- `https://instagram.com/<handle>`
- (позже) stats из кэша

### Креатор (owner)
- Статус: `Не подключено` / `Подключено` / `Ошибка` / `Истекло`
- Отображаем свой `@handle`
- Кнопки: `🔗 Вход через Meta` / `Почему так?` / `❌ Отключить`

---

## 3) OAuth Flow (минимальный)

### 3.1 Entry: кнопка в боте
Бот показывает кнопку `🔗 Вход через Meta`.

По нажатию бот выдаёт **URL‑кнопку** (внешняя ссылка):
- `PUBLIC_BASE_URL/api/ig/oauth/start?t=<one_time_token>`

`one_time_token` создаётся ботом и хранится в Redis (TTL 10 минут). Это заменяет веб‑логин и жёстко связывает браузер‑флоу с `wsId`.

### 3.2 Start endpoint
`/api/ig/oauth/start`:
- consume `t` (one‑time)
- создаёт `state` (nonce), кладёт в Redis (TTL 10 минут)
- делает `302` на Meta OAuth URL

### 3.3 Callback
`/api/ig/oauth/callback`:
- проверяет `state` (существует, не истёк, одноразовый)
- меняет `code → access_token` (и при возможности → long‑lived)
- запрашивает Graph профиль (минимум: `ig_user_id`, `username`, `account_type`)
- сохраняет привязку и включает Verified
- `302` обратно в “returnTo” (или на нейтральную страницу “Готово, вернись в Telegram”)

### 3.4 Disconnect
`/api/ig/oauth/disconnect`:
- только owner
- снимает Verified
- удаляет/инвалидирует токены

---

## 4) Endpoints (контракты)

### GET `/api/ig/oauth/start`
- **Auth:** `t=<one_time_token>` (Redis TTL 10m, consume once)
- **Side effects:** создать `state` в Redis, redirect на OAuth

### GET `/api/ig/oauth/callback`
- **Auth:** `state` (Redis TTL 10m, consume once)
- **Side effects:** upsert связку в БД, включить verified

### POST `/api/ig/oauth/disconnect`
- **Auth:** `t=<one_time_token>` (или отдельная owner‑сессия, если появится веб‑кабинет)
- **Side effects:** revoke/disconnect

### GET `/api/ig/oauth/status`
- **Auth:** только owner (через `t`)
- **Returns:** status + `@handle` (только owner)

> Вариант на будущее: если появится полноценный web‑кабинет, `t` можно заменить на нормальную сессию. Для STEP140A достаточно one‑time token.

---

## 5) Состояния (state machine)

- `NONE` — не подключено
- `PENDING` — стартовали OAuth (state создан), ждём callback
- `CONNECTED` — verified активен
- `ERROR` — ошибка на callback/обмене/Graph
- `DISCONNECTED` — отключено пользователем
- `EXPIRED` — ревокнули/истекло (в STEP140A можно не детектить активно; просто ставим при явной ошибке Graph)

Правило: **Verified badge = (status == CONNECTED)**.

---

## 6) Data model

### 6.1 Новая таблица: `ig_oauth_accounts`
Одна запись на `ws_id`.

Минимальные поля:
- `ws_id bigint primary key`
- `ig_user_id text not null`
- `ig_username text not null`
- `account_type text null` (creator/business/personal/unknown)
- `status text not null` (см. state machine)
- `access_token_enc text not null` (шифртекст)
- `token_expires_at timestamptz null`
- `scope text null`
- `connected_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `last_error_code text null`
- `last_error_msg_short text null`
- `last_error_at timestamptz null`

### 6.2 Совместимость с текущей витриной/контактами
Для UI и paywall‑логики сохраняем **public‑флаги** в `workspace_settings.profile_contacts`:

`profile_contacts.ig`:
- `verified: boolean`
- `verified_at: timestamptz`
- `verified_method: 'oauth'`
- `handle: string` (контакт; выдаём только после unlock)
- `url: string` (контакт; выдаём только после unlock)

**Важно:** любые ответы бренду используют существующую redaction/paywall‑логику (см. `docs/20_CONTACTS_MODEL.md`). До unlock `handle/url` должны быть вычищены.

---

## 7) Redis keys (минимум)

### 7.1 One‑time link token (из Telegram)
- `ig_oauth:link:<token>` (TTL 10m) → `{ wsId, ownerUserId, returnTo }`

### 7.2 OAuth state
- `ig_oauth:state:<nonce>` (TTL 10m) → `{ wsId, ownerUserId, returnTo, code_verifier? }`

### 7.3 Идемпотентность (опционально)
- `ig_oauth:lock:ws:<wsId>` (TTL 30s) — чтобы два callback’а не перетёрли статус

---

## 8) Security

- **State обязателен** (anti‑CSRF) и строго одноразовый.
- `t` (one‑time link) строго одноразовый.
- Токен шифруем: `IG_TOKEN_ENC_KEY` (32 bytes), алгоритм AES‑GCM (или libsodium sealed box).
- В логах допускается только `cid`/`wsId` и короткий `error_code` (без токенов/урлов).
- Минимальный scope: только то, что реально нужно на STEP140A.

---

## 9) Rollout

Feature flag:
- `IG_OAUTH_ENABLED=1` (включать endpoints)
- `IG_OAUTH_UI_ENABLED=1` (показывать кнопку подключения в боте)

По умолчанию:
- `IG_OAUTH_ENABLED=0` → всё выключено.
- `IG_OAUTH_ENABLED=1` + `IG_OAUTH_UI_ENABLED=0` → **UI скрыт**, но эндпоинты доступны (для диагностики и ручных тестов).

---

## 10) Минимальный file plan (для реализации STEP140A)

> Это список **минимальных** файлов/правок в стиле текущего репо (Vercel `api/`, monolith‑bot, `src/db/queries.js`).

### Добавить
- `api/ig/oauth/start.js`
- `api/ig/oauth/callback.js`
- `api/ig/oauth/status.js`
- `api/ig/oauth/disconnect.js`
- `migrations/041_ig_oauth_accounts.sql`
- `src/lib/igOAuth.js` (формирование OAuth URL, обмен code→token, Graph запрос профиля)
- `src/lib/cryptoBox.js` (encrypt/decrypt токена)

### Изменить
- `src/lib/config.js`
  - добавить env: `IG_OAUTH_ENABLED`, `IG_OAUTH_CLIENT_ID`, `IG_OAUTH_CLIENT_SECRET`, `IG_OAUTH_REDIRECT_URI`, `IG_TOKEN_ENC_KEY`
- `src/db/queries.js`
  - `upsertIgOauthAccount(wsId, ...)`
  - `getIgOauthAccount(wsId)`
  - `disconnectIgOauthAccount(wsId)`
  - `setWsIgContactsFromOauth(wsId, { verified, verified_at, handle, url, method:'oauth' })`
- `src/bot/bot.js`
  - добавить экран/кнопку `🔗 Подключить Instagram (PRO)` (owner)
  - генерировать `one_time_token` (uuid) + писать `ig_oauth:link:<token>` в Redis
  - отдавать URL‑кнопку: `PUBLIC_BASE_URL/api/ig/oauth/start?t=<token>`
- `src/bot/actionRegistry.js`
  - зарегистрировать новые action keys (навигация + disconnect), затем обновить `docs/02_ACTION_KEYS_REGISTRY.md` командой `npm run actions:md`

### Не трогать (на STEP140A)
- Любые механики comment‑верификации, cron, QStash check‑now.

---

## 11) QA (для будущего STEP140A)

- Бренд до unlock видит только `Verified` без контакта.
- После unlock — контакт‑пакет содержит `@handle` и url.
- Callback без state / с протухшим state / повторный state → отказ.
- Disconnect снимает verified и чистит токен.
- В логах нет токенов.
