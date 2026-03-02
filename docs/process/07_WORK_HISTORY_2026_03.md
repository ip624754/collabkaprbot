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
