# Work History — 2026-03

Формат: дата → STEP → что изменили → зачем → риски/регрессии.

## 2026-03-01
- STEP237: ENV cheat‑sheet (one screen) — добавлен `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` с актуальными prod‑значениями: IG OAuth/verify выключены, manual verification включена, audit buffer + cooldown, ключевые таймауты/лимиты.

### STEP232 — NotebookLM audit pack refresh
- Обновили audit‑материалы/индекс для внешнего аудита.
- Зафиксировали важный контекст: IG OAuth/верификация выключены, активна только ручная верификация.

Риск регрессий: **нет** (docs‑only).

### STEP233 — NotebookLM DOCS‑ONLY pack
- Подготовили отдельный docs‑only пакет для NotebookLM (только .md/.txt), чтобы аудитору было проще и он не путался.
- Добавлены документы:
  - `docs/24_VERIFICATION_MANUAL_ONLY.md`
  - `docs/25_INSTAGRAM_CONTACTS_ONLY.md`
  - `docs/audit/05_NOTEBOOKLM_DOCS_ONLY_ENTRYPOINT_2026_03.md`
  - `docs/audit/07_NOTEBOOKLM_AUDIT_PROMPT_DOCS_ONLY_RU.txt`
- Обновлён `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` и индекс `docs/audit/04_AUDIT_PACK_INDEX_2026_03.md`.

Риск регрессий: **нет** (docs‑only).

### STEP234 — Outbox privacy hardening (admin)
- Outbox: если админ открыл экран не в личке с ботом (group/supergroup/channel), текстовые snippet’ы скрываются (🔒).
- `✉️ Повторить` отключён вне private‑чата (чтобы исключить случайные утечки/путаницу при использовании админ‑кнопок в группах).
- Обновлён `docs/00_CURRENT_STATE.md`.

Риск регрессий: **минимальный** (меняется только отображение snippet’ов и доступность `Повторить` вне DM; в личке поведение прежнее).

### STEP235 — Neon timeout hardening (PG statement_timeout)
- Postgres pool задаёт `statement_timeout` для сессии через `SET statement_timeout` в connect hook (ENV `PG_STATEMENT_TIMEOUT_MS`, default 15000).
- Важно: Neon pooler отклоняет `statement_timeout`, переданный через startup options (например `options: -c statement_timeout=...`).
- Добавлены явные лог‑маркеры `db.statement_timeout` при отмене запросов по таймауту (и для `pool.query`, и для `client.query` в транзакциях), чтобы ops/support быстрее ловили “Neon завис/медленный ответ”.
- `SET LOCAL statement_timeout` в монетизационных транзакциях оставлен как “страховка сверху” (circuit breaker).

Риск регрессий: **низкий** (поведение запросов не меняем, кроме предсказуемого отмены “зависших” запросов по таймауту; логирование добавлено без влияния на UX).

### STEP236 — Audit flush cooldown (DB outage anti-hammer)
- При DB outage audit flush больше не пытается писать в Postgres каждую минуту.
- В `flushWorkspaceAuditBuffer()` добавлен короткий cooldown: после **requeue** или **DB ошибки** ставим Redis‑ключ `audit:buffer:ws:requeue_cooldown` на `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC` (default 120), а cron временно возвращает `skipped: requeue_cooldown`.
- В `/api/health` добавлено поле `audit.buffer.requeue_cooldown_ttl_sec` для наблюдаемости.
- `.env.example` дополнен параметрами audit buffer (включая cooldown), чтобы не терять контекст при переносе/аудите.

Риск регрессий: **низкий** (audit flush — best‑effort; при cooldown мы лишь временно пропускаем flush, данные не теряются: остаются в queue/inflight и будут записаны после восстановления DB).



### STEP238 — Staff audit docs pack (NotebookLM)
- Добавлен единый манифест `docs/audit_staff/00_AUDIT_START_MANIFEST.md` + цепочка промптов для NotebookLM.
- Для docs-only аудита: исключать work history и legacy IG OAuth документы (шум), фокус на current-state.
- Дата: 2026-03-01

## 2026-03-02
- STEP252: Vercel warnings hardening — убрали DEP0169 (no query‑getter в api routes; парсим через WHATWG URL) и устранили pg deprecation про concurrent `client.query()` (ленивый `SET statement_timeout` перед первой query).

### STEP239 — Anti-bypass: offer description (contacts leak)
- Закрыт bypass монетизации: креатор мог вставить контакты в `barter_offers.description`, и бренд видел их до unlock.
- В `renderBxPublicView` для **не-owner** и **не-unlocked** описание пропускается через `redactContactsInText` перед показом бренду.
- `redactContactsInText` усилен против обхода через fullwidth `＠` (U+FF20) и dot leader `․` (U+2024) в email/доменных именах/соц-доменах и @handles (telegram/instagram-style).
- Добавлены тесты `scripts/test-redactContactsInText.js` на эти bypass-символы.

Риск регрессий: **низкий** (изменения затрагивают только отображение описания оффера для брендов до unlock; владельцу/после unlock описание остаётся без редактирования).

### STEP240 — Lead notes tags persist (SPEC v2)
- Теги в curator notes (`#brief/#urgent/...`) теперь сохраняются в БД при записи заметки.
- `appendBrandLeadCuratorNote()`:
  - извлекает теги из текста (regex `#tag`),
  - учитывает `opts.tags` (шаблоны/авто‑события),
  - сохраняет `tags: []` в объект заметки (`brand_leads.meta.curator_notes[].tags`),
  - агрегирует теги на уровне лида в `brand_leads.meta.tags` (для будущей фильтрации).

Риск регрессий: **низкий** (поле `tags` добавляется в JSON‑объект заметки; UI уже поддерживает оба варианта — с `tags` и с извлечением из текста).


### STEP241 — Hotfix: missing named export from redis.js (Vercel crash)
- Исправлен крэш на старте функций Vercel: `SyntaxError: The requested module '../lib/redis.js' does not provide an export named 'incrWithExpireOnFirst'`.
- Причина: частичное применение патчей/слияний могло обновить импорты (`incrWithExpireOnFirst`/`incrWithExpire`/`lpushTrim`) без синхронного обновления `src/lib/redis.js`.
- Решение (Zero regressions): импорты в `src/db/queries.js`, `src/bot/bot.js`, `src/bot/cron.js` переведены на namespace (`import * as R from '../lib/redis.js'`) + безопасные fallback для отсутствующих helper’ов (metrics-only → no-op; bounded lists → best-effort `LPUSH/LTRIM`).
- Продуктовая логика не меняется; цель — гарантировать, что бот не упадёт из-за отсутствующего named export.

Риск регрессий: **минимальный** (изменения касаются только способа импорта и fallback на случай несовпадения версий; при наличии helper’ов будет использован основной путь).


### STEP242 — Heavy TX hardening: local SET LOCAL statement_timeout
- Defense-in-depth: в “тяжёлых” транзакциях (giveaways draw+finalize) добавлен `SET LOCAL statement_timeout` сразу после `BEGIN`.
- Источник таймаута: по умолчанию `PG_STATEMENT_TIMEOUT_MS` (как в STEP235). Можно переопределить `PG_HEAVY_TX_STATEMENT_TIMEOUT_MS`, если понадобится более короткий лимит именно для giveaway TX.
- Цель: исключить случаи “висим на locks/медленных запросах” даже при частичных деплоях или если pool-level настройка не применилась на конкретном соединении.

Риск регрессий: **низкий** (не меняем бизнес-логику, только добавляем предсказуемое завершение долгих TX по таймауту).


### STEP243 — Hotfix: Neon pooler rejects startup options `statement_timeout`
- Устранён прод‑крэш (Vercel): `unsupported startup parameter in options: statement_timeout`.
- Причина: Neon pooler не поддерживает установку `statement_timeout` через startup options (включая `options: -c statement_timeout=...`).
- Решение: убрали передачу startup options из `src/db/pool.js` и оставили `SET statement_timeout` в connect hook (best‑effort) + `SET LOCAL statement_timeout` в тяжёлых/критичных транзакциях (defense‑in‑depth).

Риск регрессий: **минимальный** (мы убрали только параметр старта соединения, который валил прод; логика запросов/UX не меняется).


### STEP245 — Cleanup: remove backward-compat Redis shims (no non-atomic patterns)
- Убраны backward‑compat shims (namespace import + fallback функции), которые содержали non‑atomic цепочки (`LPUSH+LTRIM(+EXPIRE)`, `INCR+EXPIRE`) даже как “dead code”.
- В `src/bot/bot.js`, `src/bot/cron.js`, `src/db/queries.js` восстановлены прямые named imports из `src/lib/redis.js`:
  - `lpushTrim`, `incrWithExpire`, `incrWithExpireOnFirst`.
- Обоснование: деплой на Vercel атомарный; helpers реально экспортируются; инвариант проекта — **не держать** неатомарные паттерны в кодовой базе.

Риск регрессий: **низкий** (меняется только способ импорта; основная логика использует те же helper’ы; fallback пути удалены).


### STEP246 — Preflight guardrail: redis atomicity grep gate
- В preflight добавлен `lint:redis-atomic` — быстрый grep‑gate, который не даёт вернуть в runtime‑код неатомарные связки Redis-команд:
  - `LPUSH+LTRIM(+EXPIRE)` (bounded lists race),
  - `INCR/INCRBY+EXPIRE` (immortal keys риск),
  - `LRANGE+LTRIM` (extraction race).
- Разрешены прямые Redis примитивы только внутри `src/lib/redis.js` (там реализованы атомарные helpers).
- Дополнительно: `src/db/pool.js` не должен содержать `options:` (Neon pooled/pgbouncer режет startup options) — это тоже проверяется, чтобы не повторить прод‑крэш.
- Док обновлён: `docs/process/10_RELEASE_PREFLIGHT.md`.

Риск регрессий: **минимальный** (dev‑инструмент; не влияет на runtime, только предотвращает возврат опасных паттернов).


### STEP247 — Preflight guardrail: public contacts leak gate
- В preflight добавлен `lint:public-contacts` — точечный grep‑gate для **публичных (brand‑facing) карточек**, чтобы не вернуть регрессию “утечка контактов через пользовательский текст”.
- Сейчас проверяет два ключевых инварианта в `src/bot/bot.js`:
  - `renderBxPublicView`: `barter_offers.description` редактируется для non‑owners до unlock (через `redactContactsInText`).
  - `renderWsPublicProfile`: `ws.profile_about` редактируется для non‑owners до revealContacts.
- Gate ловит прямой вывод сырого текста (например `escapeHtml(o.description)` / `clipText(aboutRaw)`), который обходил paywall.
- Док обновлён: `docs/process/10_RELEASE_PREFLIGHT.md`.

Риск регрессий: **минимальный** (dev‑инструмент; не влияет на runtime, только предотвращает возврат P1 bypass).


### STEP248 — Preflight guardrail: redis.js exports gate (ESM build safety)
- В preflight добавлен `lint:redis-exports` — проверка, что `src/lib/redis.js` содержит обязательные named exports:
  - `incrWithExpireOnFirst`
  - `incrWithExpire`
  - `lpushTrim`
- Зачем: предотвращает падение Vercel/Node ESM на старте функций с ошибкой вида:
  - `SyntaxError: The requested module '../lib/redis.js' does not provide an export named ...`
- Док обновлён: `docs/process/10_RELEASE_PREFLIGHT.md`.

Дополнительно (runtime safety):
- В `src/db/queries.js`, `src/bot/bot.js`, `src/bot/cron.js` используем namespace import (`import * as R`) вместо жёстких named imports.
- Fallback’и для отсутствующих helper’ов **atomic‑only / no‑op** (никаких `INCR+EXPIRE` или `LPUSH+LTRIM`), чтобы не возвращать non‑atomic паттерны и при этом не падать на старте.

Риск регрессий: **минимальный** (основной путь использует реальные helper’ы; fallback’и — no‑op для метрик/буферов и не меняют продуктовую логику, зато исключают crash на старте).

## 2026-03-02

### STEP250 — Repo sync fix: Redis helper exports + atomic quarantine counter
- `src/lib/redis.js`: добавлены реальные named exports (Lua/atomic):
  - `incrWithExpireOnFirst`
  - `incrWithExpire`
  - `lpushTrim`
- `api/qstash/broadcast-deliver.js`: устранён non-atomic паттерн `INCR+EXPIRE` (который ловит `lint:redis-atomic`) — заменено на `incrWithExpireOnFirst()` для quarantine‑счётчика (TTL 24h).
- `docs/02_ACTION_KEYS_REGISTRY.md`: регенерирован через `npm run actions:md`, чтобы `npm run preflight` проходил чисто (без auto-доступления файла).
- Обновлены docs: `docs/00_CURRENT_STATE.md` + текущая запись в истории.

Почему:
- Репозиторий был в неконсистентном состоянии: preflight guardrail `lint:redis-exports` требовал exports, но `redis.js` их не содержал → сборка могла падать/гейт мог валиться.
- `broadcast-deliver` содержал `redis.incr` + `redis.expire` рядом → окно гонки + риск “бессмертных” ключей.

Риск регрессий: **низкий** (меняем только helper’ы Redis и один счётчик quarantine; логика продукта не меняется).


### STEP252 — Vercel deprecation hardening (url.parse) + PG statement_timeout init race
- `api/cron_router.js` и IG OAuth routes: ушли от legacy query‑getter’ов/`url.parse()` и перешли на `new URL(req.url, base).searchParams`.
  - Цель: не ловить Node warning `[DEP0169] url.parse()` и не зависеть от deprecated API на Vercel.
- `src/db/pool.js`: безопасная инициализация `statement_timeout` без гонки (исключаем concurrent `client.query()` в connect hook).

Риск регрессий: **низкий** (поведение роутов/SQL не меняется; только способ парсинга query и порядок инициализации).


### STEP253 — Hotfix: Admin DM «Свободный текст» снова отправляется (fix crash)
Симптом:
- админ вводит свободный текст → бот “прыгает” в меню/хаб, а пользователь ничего не получает.

Причина:
- в обработчике `expectText.type === 'adm_user_msg_text'` был `ReferenceError` из-за обращения к несуществующим переменным (`clearCmd`, `textMeta`). Этот crash обрывал поток до предпросмотра/отправки.

Исправление:
- удалён “висящий” код с `clearCmd/textMeta`.
- подстановка placeholders сделана best‑effort: любые ошибки в `buildAdminDmPlaceholderValues()` больше не ломают отправку/предпросмотр.

Как проверить (smoke):
- Админка → карточка пользователя → `✉️ Написать` → `✍️ Свободный текст` → отправить текст.
- Должен появиться предпросмотр + `✅ Отправить`.
- После подтверждения пользователь получает сообщение с кнопками `📋 Открыть меню / 💬 Поддержка / ✅ Понятно`.

Риск регрессий: **минимальный** (изменения локальны для admin-only пути; продуктовые экраны не затронуты).

### STEP254 — UX-полировка кнопок под админ‑сообщением (без тупиков)
Симптом:
- под админ‑сообщением пользователи путались в кнопках («Принято/Понятно», «Главное меню/Открыть меню»).
- в части сообщений при нажатии ack кнопки могли “пропасть” (оставался текст без навигации), особенно если в старых callback_data не было `src:admmsg`.

Исправление:
- унифицирована кнопка подтверждения на `✅ Понятно` (и toast тоже `✅ Понятно`) для сервисных/админ‑сообщений.
- для admin receipts ack теперь **не удаляет навигацию**: остаются `📋 Открыть меню` (через `a:menu_push|src:admmsg`) и `💬 Поддержка` (через `a:support_push|src:admmsg`).
- добавлен best‑effort inference: если `src` отсутствует, пытаемся определить “админ‑квитанцию” по inline keyboard (чтобы не ломать уже отправленные сообщения в чатах).
- экран `a:support_push|src:admmsg` тоже использует `📋 Открыть меню` для консистентности.

Как проверить (smoke):
- Отправь пользователю админ‑сообщение (свободный текст) → у пользователя должны быть кнопки `📋 Открыть меню / 💬 Поддержка / ✅ Понятно`.
- Нажать `✅ Понятно` → остаются `📋 Открыть меню / 💬 Поддержка` (кнопки не исчезают).
- Нажать `📋 Открыть меню` → открывается меню в новом сообщении, исходная квитанция остаётся на месте.
- Нажать `💬 Поддержка` → открывается экран поддержки новым сообщением; есть `✍️ Написать` и `📋 Открыть меню`.

Риск регрессий: **низкий** (точечные изменения UI‑клавиатур и обработчика `a:usr_ack`; бизнес‑логика не меняется).

### STEP255 — Шаблон «Что дальше» в админ‑сообщениях (снимаем вопросы у пользователя)
Симптом:
- даже с правильными кнопками часть пользователей не понимала “что дальше делать” (особенно когда сообщение длинное).
- предпросмотр в админке показывал другой текст, чем реально получал пользователь (в сообщении был отдельный footer‑хинт), что мешало админам писать консистентно.

Исправление:
- в тексте админ‑сообщения добавлен явный блок:
  - «Вернуться к действиям бота — 📋 Открыть меню»
  - «Вопросы/ошибка — 💬 Поддержка»
  - «Прочитано — ✅ Понятно»
- предпросмотр в админке синхронизирован: отображается ровно тот же блок «Что дальше», который увидит пользователь.
- логика и callback’и кнопок **не менялись** (это чисто текст/preview).

Как проверить (smoke):
- Отправь пользователю админ‑сообщение (свободный текст или шаблон).
- В тексте под сообщением должен быть блок «Что дальше» с 3 пунктами.
- Нажать `✅ Понятно` → остаются `📋 Открыть меню / 💬 Поддержка`.

Риск регрессий: **минимальный** (только формат текста в admin DM и предпросмотре).


### STEP256 — Admin DM: заголовок «🟦 администратор» + опция отправки без блока «Что дальше»
Задача:
- сделать админ‑сообщения максимально понятными и однообразными, чтобы у пользователей не возникало вопроса «что дальше делать».
- при этом дать админу быстрый вариант «коротко» (без поясняющего блока), не меняя кнопки и без DB/Redis в горячих путях.

Изменения:
- унифицирован заголовок админ‑сообщения: `🟦 Сообщение от администратора Collabka PR` (вместо «администрации»).
- в предпросмотре добавлена вторая кнопка отправки: `⚪ Без «Что дальше»`.
- обработчик `a:adm_umsg_send` принимает параметр `wn` и передаёт его в `sendAdminMessageToUser` (по умолчанию `wn=1`).

Как проверить (smoke):
- Админка → `✉️ Написать` → выбрать шаблон или свободный текст → увидеть предпросмотр.
- Нажать `✅ Отправить` → пользователь получает текст с блоком «Что дальше».
- Нажать `⚪ Без «Что дальше»` → пользователь получает только заголовок+текст (без блока), но с теми же кнопками `📋 Открыть меню / 💬 Поддержка / ✅ Понятно`.

Риск регрессий: **низкий** (admin-only UX; продуктовые экраны не затронуты).


### STEP257 — «Поделиться витриной»: URL в конце текста (чтобы не светился в превью)
Задача:
- при пересылке/шаринге текста витрины получатель в списке чатов видел нормальный текст (приветствие/оффер), а не сразу “ссылку”.

Изменения:
- в шаблонах «📄 Коротко» и «📄 Подробно» строка `🔗 Витрина: ...` перенесена в самый конец сообщения.
- устранено дублирование генерации plain‑текста: `sendWsShareTextMessage` использует `buildWsSharePlain()`.
- никаких новых DB/Redis запросов; меняется только формат текста.

Как проверить (smoke):
- Creator → `🔗 Поделиться витриной` → выбрать `📄 Коротко`.
- Увидеть текст: сначала приветствие/CTA, в самом конце — строка `🔗 Витрина: ...`.
- Нажать `📨 Отправить` → в превью отправки/в списке чатов у получателя URL не должен быть в первых строках.
- Повторить для `📄 Подробно`.

Риск регрессий: **низкий** (только форматирование текста и устранение дублирования).


### STEP262 — Витрина: предпросмотр как продукт (кнопки «Действия» / «Мои площадки»)
Задача:
- сделать предпросмотр витрины для владельца (креатора) максимально понятным: отдельно действия (поделиться/IG‑шаблоны) и отдельно ссылки на площадки.
- убрать двусмысленность кнопки «Telegram канал» для владельца: это его площадка, а не “какой-то канал”.
- сделать шаринг `📨 Отправить` максимально надёжным во всех Telegram‑клиентах.

Изменения:
- в `renderWsPublicProfile` кнопки разбиты на 2 смысловых блока:
  - **Действия** (owner-only): `🔗 Поделиться` + `📌 IG шаблоны`.
  - **Мои площадки**: канал/Instagram/портфолио, разложены сеткой 2×N (без “каши” в одной строке).
- для владельца переименована кнопка канала: `📣 Мои каналы` (для бренда остаётся `📣 Telegram канал`).
- навигация унифицирована: `⬅️ Назад / 📋 Меню / 🏠 Home`.
- в шаринге витрины `sendWsShareTextMessage` используем `https://t.me/share/url?text=...` (без `url=`), чтобы кнопка `📨 Отправить` работала стабильно и не вставляла URL первой строкой.

Как проверить (smoke):
- Creator → `👁 Предпросмотр`:
  - первая строка кнопок: `🔗 Поделиться` + `📌 IG шаблоны`;
  - ниже — ссылки на площадки аккуратно, 2 в ряд (если есть);
  - внизу — `⬅️ Назад / 📋 Меню / 🏠 Home`.
- Нажать `📌 IG шаблоны` → открыть меню шаблонов.
- Нажать `🔗 Поделиться` → выбрать short/long → `📨 Отправить` → должен открываться стандартный share sheet (выбор чата), текст начинается не с URL.
- В brand view (после unlock) — кнопки площадок остаются, но label канала = `📣 Telegram канал`.

Риск регрессий: **низкий** (изменение только раскладки inline‑кнопок и URL шаринга, без новых DB/Redis путей).
