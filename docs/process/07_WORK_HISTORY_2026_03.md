## STEP406

- Docs-only polish after hardening steps 403–405.
- Updated `docs/00_CURRENT_STATE.md`, `docs/90_OWNER_RUNBOOK.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.
- Added `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md` as a short incident/what-to-do sheet for:
  - Broadcast `DB overload + Redis degraded` / local DB fuse
  - Payments orphaned autoheal chain-drain visibility
  - Official Publish `🩺 Проверить статус`
- No runtime code/schema/action keys changed.

## STEP399 (Admin Hard-skip contract smoke) — 2026-03-10

### Зачем
`Админка → Hard-skip (dead chats)` — отдельный Redis-only operator-flow для dead chats, HITs и manual unskip. Здесь легко словить тихий регресс: пропажа quick TG buttons, фильтров/экспорта, `hs_find` expectText/back route или action key drift в `ACTION_REGISTRY`.

### Что сделано
- Добавлен `scripts/smoke-admin-hard-skip-contract.js`.
- Smoke фиксирует source-level контракт:
  - home-screen `🧱 Hard-skip (dead chats)`: configured TTL, `🔎 Найти TG ID`, `🧾 Последние пропуски`, per-entry quick buttons, pagination, footer `⬅️ Система / ⬅️ Админка`;
  - hits-screen `🧾 Hard-skip HITs (пропуски)`: filter/window line, today top reasons, filters, `🗒 Export last 200`, quick TG buttons, pagination, footer `⬅️ Система / ⬅️ Админка`;
  - view-screen `🧱 Hard-skip status`: no-hard-skip vs hard-skip states, `🧹 Снять hard-skip`, `⬅️ Назад`, footer `⬅️ Система / 📋 Меню / 🏠 Home`.
- Smoke дополнительно валидирует callback/runtime contract:
  - `a:hs_home`, `a:hs_hits`, `a:hs_find`, `a:hs_view`, `a:hs_unskip`, `a:hs_hits_export`;
  - `hs_find` expectText (`type: 'hs_find'`, parse TG ID digits, stable invalid prompt, rerender status view);
  - bounded export helper `adminHardSkipHitsExport(reasonFilter, limit)`;
  - TXT export document + rerender toast `📤 Export ready:*`.
- Во время аудита найден реальный хвост: кнопка `🗒 Export last 200` и `a:hs_hits_export` уже были в UI/registry, но callback отсутствовал. Добавлен минимальный handler `a:hs_hits_export` без новых DB-read:
  - берёт bounded Redis export helper,
  - отдаёт TXT через `InputFile`,
  - сохраняет навигацию `🧾 HITs / ⬅️ Система / 📋 Меню / 🏠 Home`,
  - возвращает в hits-screen с toast.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-hard-skip-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `src/bot/bot.js`
- `scripts/smoke-admin-hard-skip-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check src/bot/bot.js`
- `node --check scripts/smoke-admin-hard-skip-contract.js`
- `node scripts/smoke-admin-hard-skip-contract.js`
- `npm run smoke:admin-hard-skip-contract`
- `APP_ENV=production node scripts/preflight.js`

## STEP398 (Admin QStash Status contract smoke) — 2026-03-10

### Зачем
`Админка → QStash статус` — отдельный operator-flow для self-check и диагностики QStash fan-out/ping. Здесь легко словить тихий регресс: исчезновение summary/status строк, rename action keys, выпадение ping helper screens или разрыв навигации `Система / Меню / Home`.

### Что сделано
- Добавлен `scripts/smoke-admin-qstash-status-contract.js`.
- Smoke фиксирует source-level контракт `renderAdminQStashStatus()`:
  - summary/status экран: `🛰 QStash — статус`, `Lib (@upstash/qstash)`, `ENV token/signing/base_url`, `Fan-out (Redis)`, `Broadcast tick last_run`, `Worker last delivery`, `Ping received/enqueued`, `Broadcast cooldown`;
  - keyboard/footer: `🧪 Send signed ping`, `📣 Fan-out: ON/OFF`, `⬅️ Система / 📋 Меню / 🏠 Home`.
- Smoke дополнительно валидирует callback/runtime contract:
  - `a:admin_qstash_status` и `a:admin_qstash_ping`;
  - admin gate + initial toast `Пинг отправляю…`;
  - missing-lib / missing-token / missing-base-url helper screens с `⬅️ Назад`;
  - Redis breadcrumbs `qstash:ping:last_enqueued_at/nonce`;
  - `qstashPublishJSON(...)` с payload `kind=signed_ping`, `dedup=qping:*`, `retries=0`, `timeout=10s`;
  - успешный ping делает rerender `renderAdminQStashStatus(ctx)`.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-qstash-status-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `scripts/smoke-admin-qstash-status-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-admin-qstash-status-contract.js`
- `node scripts/smoke-admin-qstash-status-contract.js`
- `npm run smoke:admin-qstash-status-contract`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP397 — Admin → Payments Fallback contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-payments-fallback-contract.js`: source-level smoke на отдельный operator-flow `Админка → Payments fallback apply`.
- Smoke фиксирует summary/status контракт экрана: `EFFECTIVE / ENV / RUNTIME`, TTL hint при runtime enable, инцидентный guidance и runtime details `Enabled by / At / Until / Reason`.
- Отдельно зафиксирован control/runtime contract: preset rows `🟢 2h (incident) / 🟢 12h (backlog) / 🟢 24h (migration)`, условный `🧹 Disable`, footer `⬅️ Система / ⬅️ Админка / 📋 Меню / 🏠 Home`, а также callbacks `a:admin_pay_fb / a:admin_pay_fb_set / a:admin_pay_fb_off` (admin gate, `setPaymentsFallbackRuntime`, success/failure toasts).
- Smoke валидирует связанные записи в `src/bot/actionRegistry.js`, чтобы тихие rename/remove/re-guard поломки `Admin → Payments fallback apply` ловились до деплоя.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- В `package.json` добавлен `smoke:admin-payments-fallback-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-payments-fallback-contract.js` → `✅ smoke admin-payments-fallback contract OK`
- `npm run smoke:admin-payments-fallback-contract` → тот же результат
- `npm run preflight` → новый smoke проходит вместе с остальными source-level guardrails
- ручной sanity: `Админка → Система → 🧯 Fallback`, затем проверить preset TTL buttons, `🧹 Disable`, строки `EFFECTIVE / ENV / RUNTIME` и footer-навигацию

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).


## STEP396 — Admin → Payments contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-payments-contract.js`: source-level smoke на отдельный operator-flow `Админка → Payments`.
- Smoke фиксирует контракт list-screen: заголовок `💳 Payments • STATUS`, empty-state `Платежей нет.`, per-payment view buttons, ORPHANED-only action `🔁 Auto-heal missing_session`, pagination и `⬅️ Операции`.
- Отдельно зафиксирован detail/runtime contract: экран `Payment #id` со строками `Status/Kind/User/Amount/Created`, spoiler-блоками `Charge/Payload/Note`, условным `✅ Apply (manual)`, `⬅️ К списку / ⬅️ Операции`, а также callback/flow `a:admin_payments/view/apply/autoheal` (`clearExpectText`, strict validation, DB claim before apply, block/error alerts, auto-heal только для `ORPHANED missing_session`, summary alert).
- Smoke валидирует связанные записи в `src/bot/actionRegistry.js`, чтобы тихие rename/remove/re-guard поломки `Admin → Payments` ловились до деплоя.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- В `package.json` добавлен `smoke:admin-payments-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-payments-contract.js` → `✅ smoke admin-payments contract OK`
- `npm run smoke:admin-payments-contract` → тот же результат
- `npm run preflight` → новый smoke проходит вместе с остальными source-level guardrails
- ручной sanity: `Админка → Операции → 💰 Платежи`, открыть один платёж, затем проверить `✅ Apply (manual)`, `🔁 Auto-heal missing_session`, pagination и возвраты `К списку / Операции`

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).


## STEP394 — Admin → Outbox contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-outbox-contract.js`: source-level smoke на отдельный operator-flow `Админка → Outbox`.
- Smoke фиксирует контракт list/view экранов `Outbox`: заголовок `📤 Outbox`, строку `Redis-only`, privacy hint для non-DM (`🔒 Скрыто...`), per-entry кнопки, pagination, `🧹 Очистить` и footer `⬅️ Коммуникации / 📋 Меню / 🏠 Home`.
- Отдельно зафиксирован view/actions contract: `👤 Карточка / ✉️ Написать`, условные `✉️ Повторить / 📝 Заметка / 📌 В шаблон`, а также callback/confirm-flow `a:admin_outbox*` (clearExpectText на входе, DM-only guard для repeat/save-to-template, preview send controls, `🧹 Очистить Outbox?`, clear → rerender list).
- Smoke валидирует связанные записи в `src/bot/actionRegistry.js`, чтобы тихие rename/remove/re-guard поломки `Admin → Outbox` ловились до деплоя.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- В `package.json` добавлен `smoke:admin-outbox-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-outbox-contract.js` → `✅ smoke admin-outbox contract OK`
- `npm run smoke:admin-outbox-contract` → тот же результат
- `npm run preflight` → новый smoke проходит вместе с остальными source-level guardrails
- ручной sanity: `Админка → Коммуникации → 📤 Outbox`, открыть запись, затем проверить `✉️ Повторить`, `📌 В шаблон`, `🧹 Очистить` confirm-flow и footer-навигацию

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).


## STEP392 — Admin → Founder Sale contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-founder-contract.js`: source-level smoke на отдельный operator-flow `Админка → Founder Sale`.
- Smoke фиксирует контракт главного экрана `Founder Sale`: summary/status блок (`Источник настроек`, `ENABLED`, `DEADLINE`, `STATUS`, `⏳ Осталось`, `💰 Цены / кредиты`) и control rows (`ENABLED toggle`, `🗓 Дедлайн / 💰 Цены`, `💳 Кредиты / ♻️ Сброс к ENV`, `🔗 Ссылки / 📝 Тексты`, footer `⬅️ Система / 📋 Меню / 🏠 Home`).
- Дополнительно smoke валидирует marketing helper screens `Founder Sale — ссылки` и `Founder Sale — тексты (copy/paste)`: forwarding-safe note, A/B deep-link presets `fs_offers_a/fs_offers_b/fs_gw_brand/fs_gw_creator`, быстрый copy line `🔥 Founder Sale: <link>` и footer-навигацию между `Founder Sale / Система / Меню / Home`.
- Smoke валидирует связанные записи в `src/bot/actionRegistry.js`, чтобы тихие rename/remove/re-guard поломки `Admin → Founder Sale` ловились до деплоя.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- В `package.json` добавлен `smoke:admin-founder-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-founder-contract.js` → `✅ smoke admin-founder contract OK`
- `npm run preflight` → новый smoke проходит вместе с остальными guardrails
- ручной sanity: `Админка → Система → 🔥 Founder Sale`, затем `🔗 Ссылки` и `📝 Тексты` показывают те же operator controls / helper texts / footer navigation

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).


## STEP391 — Admin → System keyboard/footer contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-system-contract.js`: source-level smoke на контракт `Админка → Система`.
- Smoke проверяет summary-строки экрана (`Платежи`, `Match/Feat auto-apply`, `Payments fallback apply`, `Broadcast fan-out (QStash)`, `Founder Sale`) и keyboard rows: `💳 Прием / ⚙️ Автовыдача`, `🎯🔥 Match/Feat / 🧯 Fallback`, `📣 QStash fan-out / 🛰 QStash статус`, `🧱 Hard-skip (dead chats)`, `🔥 Founder Sale`, `➕ Модератор / 📋 Модераторы`, `🎁 Подарить подписку`, footer `⬅️ Админка / 📋 Меню / 🏠 Home`.
- Smoke валидирует связанные записи в `src/bot/actionRegistry.js`, чтобы тихие rename/remove/re-guard поломки `Admin → System` ловились до деплоя.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- В `package.json` добавлен `smoke:admin-system-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-system-contract.js` → `✅ smoke admin-system keyboard/footer contract OK`
- `npm run preflight` → новый smoke проходит вместе с остальными guardrails
- ручной sanity: `Админка → Система` показывает те же summary-строки, operator rows и footer

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).


## STEP390 — Admin → Comms keyboard/footer contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-comms-contract.js`: source-level smoke на контракт `Админка → Коммуникации`.
- Smoke проверяет заголовок/описание, primary keyboard (`📣 Объявление`, `📌 Шаблоны DM`, `📤 Outbox`), условный gate `📣 Офиц.канал (${pending})` только при `OFFICIAL_PUBLISH_ENABLED`, footer `⬅️ Админка / 📋 Меню / 🏠 Home` и связанные записи в `src/bot/actionRegistry.js`.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- В `package.json` добавлен `smoke:admin-comms-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-comms-contract.js` → `✅ smoke admin-comms keyboard/footer contract OK`
- `npm run preflight` → новый smoke проходит вместе с остальными guardrails
- ручной sanity: `Админка → Коммуникации` показывает те же operator-кнопки и footer; `Офиц.канал` появляется только при включённом `OFFICIAL_PUBLISH_ENABLED`

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).


## STEP389 — Admin → Ops keyboard/actions contract smoke

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-admin-ops-contract.js`: source-level smoke на контракт `Админка → Операции`.
- Smoke проверяет состав основного operator keyboard: `👥 Пользователи`, `💰 Платежи`, `📣 Рассылка`, `📜 Аудит`, `📈 Метрики`, `🧾 Flush ops digest`, `🧹 Clear pending snapshot`, footer `⬅️ Админка / 📋 Меню / 🏠 Home` и health URL-кнопку только за `PUBLIC_BASE_URL`.
- Отдельно зафиксирован confirm-flow `a:admin_ops_pending_clear`: `✅ Очистить snapshot` + `⬅️ Операции` + footer.
- Smoke валидирует связанные записи в `src/bot/actionRegistry.js`, чтобы тихие rename/remove/re-guard поломки callback action keys ловились ещё до деплоя.
- `scripts/preflight.js` теперь включает этот smoke как обязательный guard.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

QA / как проверить
- `node scripts/smoke-admin-ops-contract.js` → `✅ smoke admin-ops keyboard/actions contract OK`
- `npm run preflight` → новый smoke проходит вместе с остальными guardrails
- ручной sanity: `Админка → Операции` показывает те же operator-кнопки и confirm-flow очистки snapshot

Риск регрессий: **низкий** (source/preflight/docs only; без новых DB reads, без изменения runtime UX/logic).

## STEP388 — Preflight smoke for /api/health operator JSON contract + deploy workflow docs

Дата: 2026-03-10

Что сделано
- Добавлен `scripts/smoke-health-admin-shape.js`: staging/dev smoke на стабильный операторский контракт `/api/health` при `SIMULATE_REDIS_DOWN=1`.
- Smoke проверяет ключевые поля, на которые завязаны operator checks и dashboards: `system_status`, `no_go_reasons[{code,severity,hint}]`, `ops.digest_preview`, `ops.pending`, `broadcast.pending_deliveries`, `broadcast.hard_skip`, `broadcast.db_overload`, `broadcast.tick_deferred_redis`, `qstash.reschedule_failed`, `qstash.official_publish_stuck`, `payments.fallback_apply_effective`, `payments.payload_hmac_minlen_ok`.
- `scripts/preflight.js` теперь запускает новый smoke в non-prod и безопасно skip-ает его в `prod/production`, как и fault-injection smoke.
- `/api/health` нормализован по shape: ветки `not_configured` и `redis_unavailable` теперь возвращают тот же базовый `broadcast/ref/cron` контракт, без тихого исчезновения операторских полей.
- Обновлены `docs/91_PROD_LAUNCH_30MIN.md` и `docs/93_PROD_DEPLOY_CHECKLIST.md` с пошаговым workflow перед Vercel deploy.

QA / как проверить
- `node scripts/smoke-health-admin-shape.js` → `✅ smoke health/admin JSON shape OK`
- `node scripts/smoke-fault-injection.js` → degraded-path остаётся fail-open
- `npm run preflight` → оба smoke проходят
- `APP_ENV=production npm run preflight` → оба staging smoke корректно skip-аются в prod env

Риск регрессий: **низкий** (health/admin-only; без новых DB reads, без UI/ботовых callback изменений).

## STEP387 — Preflight: staging fault-injection smoke

Дата: 2026-03-09

Что сделано
- `scripts/preflight.js` теперь запускает `scripts/smoke-fault-injection.js`, который принудительно включает `SIMULATE_REDIS_DOWN=1` и валидирует staging/dev degraded-path без реального Redis/DB.
- Smoke проверяет два инварианта: (1) Redis calls падают с `code=SIMULATED_REDIS_DOWN`; (2) `/api/health` не падает и отдаёт `ok=true`, `system_status=NO_GO`, `no_go_reasons[]`, `redis.read_ok=false`, `redis.write_ok=false`.
- Для безопасности preflight автоматически пропускает этот smoke при `APP_ENV=prod|production`, чтобы не ломать операторский контур и не создавать ложный prod-fail на реальном окружении.

Почему это безопасно
- Нет новых DB-read, callback/action keys, ENV-контрактов или runtime-веток прода.
- Используется уже существующий smoke-скрипт; меняется только coverage preflight перед деплоем.
- Ловим регресс fail-open/fail-closed поведения Redis degraded до выкладки, а не на живом `/api/health`.

QA
- `node scripts/smoke-fault-injection.js`
- `npm run preflight`
- опционально: `APP_ENV=production npm run preflight` → smoke корректно skip-ается, а не падает


## STEP386 — Admin Ops regression smoke

Дата: 2026-03-07

Что сделано
- Вынесен pure text builder `src/bot/adminOpsText.js` для экрана `Админка → Операции`; сам `renderAdminOps()` продолжает только собирать Redis-only данные и клавиатуру.
- Добавлен `scripts/smoke-admin-ops-render.js`:
  - проверяет рендер OK/degraded/probe-failed вариантов без Telegram/Redis/DB;
  - проверяет guard по исходнику `renderAdminOps()` (переменные `r/key` остаются в scope функции, а pending snapshot остаётся под `if (r && key)`).
- `scripts/preflight.js` теперь запускает этот smoke; `scripts/smoke-short.js` напоминает проверить `Ops` вместе с остальными admin-экранами.

Почему это безопасно
- Нет новых DB-read и нет новых callback/action keys.
- Продуктовый UX не меняется: тот же текст/баннеры/кнопки, только собраны через тестируемый helper.
- Ловим повторный регресс до деплоя, а не после открытия `a:admin_ops` на проде.

QA
- `node scripts/smoke-admin-ops-render.js`
- `npm run preflight`
- ручная проверка: `👑 Админка → 🧰 Операции` открывается и при Redis OK, и при degraded path без error-screen.


## STEP385 — Admin Ops scope hotfix

Дата: 2026-03-07

Что сломалось
- `Админка → Операции` (`a:admin_ops`) падала с `ReferenceError: r is not defined`.
- Причина: в `renderAdminOps()` переменные `r` / `key` были объявлены через `let` внутри outer `try`, а блок `Broadcast pending snapshot` использовал их уже после выхода из этого блока.

Что сделано
- В `src/bot/bot.js` переменные `r` / `key` подняты на уровень функции `renderAdminOps()`.
- Redis-only блоки (`probe`, ops banners, `Broadcast pending snapshot`) продолжают работать по прежней логике; изменён только scope переменных.

Почему это безопасно
- Нет новых DB-read.
- Нет изменений бизнес-логики, action keys, ENV, schema или маршрутов.
- Hotfix маленький и полностью обратимый.

QA
- `node --check src/bot/bot.js`
- ручная проверка: `👑 Админка → 🧰 Операции` открывается без `cid/act/err`-экрана; `Broadcast pending snapshot` и ops banners рендерятся как раньше.


## STEP383 — IG OAuth parked from deploy surface (Vercel Hobby function budget)
Date: 2026-03-07

Scope:
- removed `api/ig/oauth/start|callback|status|disconnect` from deploy surface
- kept IG OAuth context as parked docs/migrations only
- synced docs/boot/current-state/release/env/handoff with parked baseline

Why:
- deploy was blocked by Vercel Hobby `<=12 serverless functions` limit
- IG OAuth is not used in current product baseline and UI was already hidden
- smallest safe fix is to stop deploying unused IG OAuth entrypoints instead of touching core flows

Impact:
- frees 4 function entrypoints from `api/`
- no change to payments/broadcast/official publish/brand inbox flows
- Instagram remains a normal profile link/contact after unlock
- restoring OAuth later will require reintroducing the routes (or consolidating them) and re-running Meta smoke

## 2026-03-07

### STEP382 — Ops clarity + media timeout
- Добавлены ENV guardrails `TG_HTTP_TIMEOUT_MS` (default 5500ms) и `TG_HTTP_MEDIA_TIMEOUT_MS` (default 15000ms).
- `src/lib/tgApi.js`: общий AbortSignal timeout helper для raw Telegram fetch.
- `src/bot/cron.js`: broadcast text/media sends теперь идут с timeout; для media используется отдельный, более длинный timeout.
- `src/bot/bot.js`: official publish media sends переведены на `TG_HTTP_MEDIA_TIMEOUT_MS`, текстовые send/edit оставлены на базовом timeout.
- Admin → `🧰 Операции`: добавлен блок `Broadcast pending snapshot` с явной подписью `Redis snapshot only; не DB truth`.
- `🧹 Clear pending snapshot` теперь идёт через confirm-screen и очищает только Redis snapshot `broadcast.pending_deliveries`.
- Admin → `🧱 Hard-skip`: на home/view экранах показывается configured TTL (`BROADCAST_HARD_SKIP_TTL_DAYS`).
- `scripts/check-package-lock.js` + `package-lock.json`: preflight теперь валится при drift между `package.json` и `package-lock.json`.

Риск регрессий: **низкий** (без новых DB-read в hot UI; изменения ограничены timeout guardrails, Redis-only ops visibility и preflight/docs).


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
  - `docs/21_IG_VERIFY_RUNBOOK.md`
  - `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`
  - `docs/audit/05_NOTEBOOKLM_DOCS_ONLY_ENTRYPOINT_2026_03.md`
  - `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`
- Обновлён `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` и индекс `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md`.

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
- в шаринге витрины `sendWsShareTextMessage` используем `https://t.me/share/url?url=<invisible>&text=...` для максимальной совместимости (и без “ссылки первой строкой”).

Как проверить (smoke):
- Creator → `👁 Предпросмотр`:
  - первая строка кнопок: `🔗 Поделиться` + `📌 IG шаблоны`;
  - ниже — ссылки на площадки аккуратно, 2 в ряд (если есть);
  - внизу — `⬅️ Назад / 📋 Меню / 🏠 Home`.
- Нажать `📌 IG шаблоны` → открыть меню шаблонов.
- Нажать `🔗 Поделиться` → выбрать short/long → `📨 Отправить` → должен открываться стандартный share sheet (выбор чата), текст начинается не с URL.
- В brand view (после unlock) — кнопки площадок остаются, но label канала = `📣 Telegram канал`.

Риск регрессий: **низкий** (изменение только раскладки inline‑кнопок и URL шаринга, без новых DB/Redis путей).


### STEP263 — IG шаблоны: убираем подсказки обхода (без @handles и «ссылка в профиле»)
Задача:
- IG‑шаблоны должны помогать креатору копипастить текст в сторис/пост/DM, но не должны подсказывать обход монетизации (контакты/ник/канал).

Изменения:
- В `buildWsIgTemplate` и `buildWsIgDmRaw` убраны любые идентификаторы вида `@...` (канал/IG) и фразы «(ссылка в TG‑профиле)/(ссылка из профиля)».
- Шаблоны стали “бот‑центричными”: связь только через витрину/заявку (`wsBrandLink(wsId)`), без контактов.
- Заглушки сделаны нейтральными: `Портфолио: —`, `заявка: —` (на случай если link не сгенерировался), без упоминаний профиля.

Как проверить (smoke):
- Creator → `📌 IG шаблоны`:
  - `Stories/Пост/DM/Bio` не содержат `@username` и не содержат слов «в TG‑профиле/из профиля».
  - Везде, где требуется CTA — только ссылка на витрину/заявку в Telegram.

Риск регрессий: **низкий** (только текстовые шаблоны; логика витрины/разлока не затронута).


### STEP264 — Fix: «📨 Отправить» в шаринге витрины не “молчит”
Симптом:
- В некоторых Telegram‑клиентах кнопка `📨 Отправить` (t.me/share/url) выглядит как ссылка, но при нажатии не открывает share‑sheet (ощущается как “ничего не происходит”).

Причина:
- Часть клиентов игнорирует share‑URL без параметра `url=` (вариант `.../share/url?text=...`).

Фикс:
- Перешли на `t.me/share/url?url=<invisible>&text=<plain>`.
- В `url=` передаём невидимый символ U+2060 (WORD JOINER), чтобы у получателя не появлялась “ссылка первой строкой”, а текст начинался с приветствия.

Как проверить (smoke):
- Creator → `🔗 Поделиться витриной` → `📄 Коротко`/`📄 Подробно` → нажать `📨 Отправить`.
- Должен открыться стандартный share‑sheet (выбор чата).
- В предпросмотре отправляемого текста первые строки — приветствие/оффер; строка `🔗 Витрина: ...` остаётся в конце.

Риск регрессий: **низкий** (меняется только URL кнопки шаринга).


### STEP265 — Fix: «💬 Поддержка» не должна падать при деградации Redis
Симптом:
- В режиме деградации Redis навигационные кнопки (в т.ч. `💬 Поддержка`) могли вести в общий error‑экран из‑за `REQUIRE_REDIS` guard на саму навигацию.

Фикс:
- В `src/bot/actionRegistry.js` для `a:support` и `a:support_push` выставлен `guard: NONE` (fail‑open).
- `a:support_write` оставлен `REQUIRE_REDIS`, потому что поток ввода/expectText реально зависит от Redis.

Как проверить (smoke):
- В preview окружении временно отключить Redis (невалидный `REDIS_URL`).
- Нажать `💬 Поддержка` из меню и из админ‑квитанции.
- Ожидание: открывается экран поддержки/инфо, без `⚠️ Произошла ошибка`.

Риск регрессий: **низкий** (меняются только guards для навигации).


### STEP266 — Fix: Curators invite share «📤 Поделиться» не должна “молчать”
Симптом:
- В некоторых Telegram‑клиентах кнопка `📤 Поделиться` в приглашении куратора (экран `a:cur_invite`) выглядит как ссылка, но при нажатии ничего не делает.

Причина:
- Использовался `https://t.me/share/url?url=&text=...` с пустым `url=` — часть клиентов игнорирует такой формат.

Фикс:
- Перевели на совместимый формат `t.me/share/url?url=<invisible>&text=<plain>`.
- В `url=` передаём невидимый символ U+2060 (WORD JOINER), чтобы:
  - share‑sheet открывался стабильно;
  - не появлялась “ссылка первой строкой” в текстовом превью.

Как проверить (smoke):
- Owner → Настройки витрины → Кураторы → `👤 Пригласить ссылкой`.
- Нажать `📤 Поделиться` → должен открыться стандартный share‑sheet (выбор чата).

Риск регрессий: **низкий** (меняется только URL кнопки шаринга).


### STEP267 — UX/Security: IG templates menu без `Канал:`/`Профиль:` (только ссылка на витрину)
Симптом:
- В экране `📌 Шаблоны для Instagram` показывались строки `Канал: @...` и `Профиль: @...`, что является явной подсказкой для обхода (контакты/handles до unlock).

Фикс:
- В `renderWsIgTemplatesMenu` убрали вывод `Канал:` и `Профиль:`.
- Оставили только безопасный CTA: `Ссылка на витрину → Открыть витрину` (HTML anchor).

Как проверить (smoke):
- Открыть `📌 IG шаблоны` в owner‑preview/профиле витрины.
- Ожидание: нет строк `Канал:`/`Профиль:`; есть только ссылка на витрину и кнопки форматов (Stories/Пост/DM/Bio).

Риск регрессий: **низкий** (меняется только текст экрана, логика кнопок не тронута).


### STEP268 — Docs: зафиксированы выводы регресс-аудита + watchlist (для новых чатов)
Цель:
- Чтобы при старте нового чата ассистент всегда видел актуальные “рисковые зоны” и не наступал на регрессионные грабли.

Что сделано:
- `docs/00_CURRENT_STATE.md`: добавлен раздел `0.05) Выводы последнего регресс-аудита + watchlist` (список рисков 1–7, smoke‑правило).
- `docs/00_BOOT.md`: добавлена короткая ссылка на watchlist.
- `docs/15_NEW_CHAT_HANDOFF.md`: в шаге чтения доков добавлено явное указание прочитать watchlist внутри `00_CURRENT_STATE`.

Как проверить (smoke):
- Открыть `docs/00_BOOT.md` → есть пункт про watchlist.
- Открыть `docs/00_CURRENT_STATE.md` → раздел `0.05` присутствует и содержит 7 рисков.
- Открыть `docs/15_NEW_CHAT_HANDOFF.md` → пункт (1) упоминает watchlist.

Риск регрессий: **нулевой** (docs-only).

### STEP292 — Admin UX sweep (Users / Payments / Outbox / System)
Цель:
- “Вылизать” UX админки: не залипать в режиме ввода (expectText), иметь предсказуемые выходы `📋 Меню / 🏠 Home`, и сбрасывать ожидание ввода при входе в ключевые админ‑разделы.

Что исправили:
- `a:menu` и `a:menu_push` теперь best‑effort делают `clearExpectText()` перед рендером меню (escape hatch из input‑mode).
- `a:home` теперь best‑effort делает `clearExpectText()` перед рендером Home.
- Входы в ключевые админ‑разделы очищают ожидание ввода: `admin_notice`, `adm_gift`, `admin_outbox`, `admin_outbox_v`, `admin_payments`, `admin_pay_view`, `admin_pay_apply`, `admin_pay_autoheal`.
- Экран ввода заметки админа (`a:adm_unote`) приведён к admin‑стандарту навигации (footer `⬅️ Пользователи` + `📋 Меню` + `🏠 Home`).

Docs:
- Добавлен audit report: `docs/audit/22_ADMIN_BROADCAST_AUDIT_AND_POLISH_2026_03.md`.
- `docs/00_CURRENT_STATE.md` обновлён (watchlist + ссылки на audit 21/22).

QA:
- В админке открыть любой input‑шаг (поиск пользователей / заметка / т.п.), нажать `📋 Меню` → отправить текст: он не должен обрабатываться как продолжение input‑шага.
- Аналогично с `🏠 Home`.
- Перейти в `👑 Админка → 💰 Платежи / 📤 Outbox / 📣 Рассылки / ⚙️ Система` после input‑шага: ожидание ввода должно быть сброшено.
- `npm run preflight` проходит.

Риск регрессий: **низкий** (UX‑hardening, без изменения бизнес‑логики; DB‑нагрузка не увеличивается).


### STEP269 — Security/Monetization: IG templates без портфолио/внешних ссылок (anti-bypass)
Симптом:
- В IG шаблонах (особенно `🖼️ Пост` и `💬 DM бренду`) показывалась строка `Портфолио: <url>` из `profile_portfolio_urls[0]`.
- На практике портфолио часто ведёт на linktree/агрегаторы контактов → это подсказка/обход воронки и монетизации.

Фикс:
- `buildWsIgTemplate`: удалены любые упоминания портфолио/внешних ссылок из шаблонов.
- `buildWsIgDmRaw`: удалены строки `Портфолио/Примеры` из вариантов DM.
- Hint для Bio: убрана формулировка “link-in-bio” (не подсказываем обход), оставили нейтральное “Можно поставить в bio”.

Docs:
- `docs/00_CURRENT_STATE.md`: пункт watchlist про IG templates расширен (включая запрет на портфолио/внешние ссылки).

Как проверить (smoke):
- Owner → `📌 IG шаблоны` → открыть `🖼️ Пост` и `💬 DM бренду`.
- Ожидание: в тексте нет строк `Портфолио:`/`Примеры:` и нет внешних ссылок кроме start-link витрины.

Риск регрессий: **низкий** (только текст шаблонов, логика/кнопки не тронуты).


### STEP270 — UX: Creator UGC/Офферы меню без кнопки «📰 Лента креаторов» (brand-only)
Симптом:
- В режиме **Creator** в меню `🎬 UGC / Офферы` показывалась кнопка `📰 Лента креаторов`.
- При нажатии открывался экран `renderBxBrandOnlyNotice` («доступно только в режиме Brand»), что путало и выглядело как тупик.

Фикс:
- В `bxMenuKb` убрали кнопку `📰 Лента креаторов` для creator‑меню.
- Перестроили сетку кнопок в creator‑меню: `Inbox / Создать офер` и `Мои офферы / Каталог брендов`.
- В `renderBxOpen` обновили описание действий (убрали пункт «посмотреть выдачу глазами бренда», добавили «Каталог брендов»).

Docs:
- `docs/00_CURRENT_STATE.md`: добавлен UX‑guardrail в разделе discovery surfaces (Лента креаторов — brand-only).

Как проверить (smoke):
- Creator → открыть `🎬 UGC / Офферы` по своему workspace.
- Ожидание: кнопки `📥 Inbox`, `➕ Создать офер`, `📦 Мои офферы`, `🏷 Каталог брендов` присутствуют; `📰 Лента креаторов` отсутствует.
- Brand → `🏷 Для брендов` / Brand меню: `📰 Лента креаторов` по‑прежнему доступна.

Риск регрессий: **низкий** (только UI‑кнопки/текст; без новых DB/Redis вызовов).


### STEP271 — UX copy: Creator UGC/Офферы без brand-only терминов (после удаления кнопки)
Симптом:
- После STEP270 кнопка `📰 Лента креаторов` была убрана из creator‑меню, но текст в `🎬 UGC / Офферы` продолжал ссылаться на «📰 Лента креаторов» как на понятие/поверхность.
- Это могло снова путать креатора (создаёт ощущение, что где-то должна быть эта лента/кнопка).

Фикс:
- `renderBxOpen` (creator):
  - В ветке `network_enabled=false` уточнили формулировку: сеть нужна, чтобы **публиковать офферы в сеть (чтобы их видели бренды)**, без обещания «видеть ленту» креатором.
  - В списке действий заменили строку про «📰 Лента креаторов» на нейтральную: «бренды увидят твой оффер в ленте (в режиме Brand)».

Docs:
- `docs/00_CURRENT_STATE.md`: watchlist расширен пунктом про Role‑specific UX (в Creator не показывать brand‑only кнопки/инструкции).

Как проверить (smoke):
- Creator → открыть `🎬 UGC / Офферы` по своему workspace.
  - Если сеть выключена: текст говорит про публикацию в сеть для брендов (без «видеть ленту»).
  - Если сеть включена: в bullets нет фразы «открой ленту/📰 Лента креаторов»; есть «бренды увидят… (в режиме Brand)».

Риск регрессий: **нулевой/низкий** (изменён только текст, без влияния на логику/БД/Redis).


### STEP272 — Audit: brand-only action keys не попадают в Creator UI (workspace flows)
Цель:
- Один раз системно проверить, что в Creator UI (workspace экраны: `ws_open/profile/settings`, `bx_open` и т.п.) нет кнопок, которые ведут в Brand-only разделы.

Сделано:
- Проведён grep по `src/bot/bot.js` на brand-only action keys (лента/фильтры/подбор; brand inbox/deals/plan/pass/profile; brand managers).
- Результат зафиксирован в отчёте: `docs/audit/04_CREATOR_UI_BRAND_ACTION_KEYS_AUDIT_2026_03.md`.
- Дополнительно: в `renderWsOpen` обновлена подсказка (убрали ссылку на «📰 лента» для creator, оставили только creator‑релевантные действия).

Docs:
- `docs/00_CURRENT_STATE.md`: добавлена ссылка на audit report в watchlist.

Как проверить (smoke):
- Creator → открыть `📣 Мои каналы` → выбрать канал.
- Ожидание: в подсказке `ws_open` нет «📰 лента».
- Creator → `🎬 UGC / Офферы`: нет кнопки `📰 Лента креаторов`.

Риск регрессий: **низкий** (audit docs + текст подсказки; без новых DB/Redis вызовов).


### STEP273 — Brand Manager system audit + UX hardening (no DB in menus/hubs)
Цель:
- “Вылизать” систему работы бренда с менеджером: доступы, тексты, кнопки и гейты.
- Убрать сценарии “кнопка есть → раздел недоступен” и убрать лишние DB‑запросы в горячих UI путях (📋 Меню / 🏠 Home).

Найдено:
1) В `renderMainMenu` (📋 Меню) был лишний SQL‑чтение `db.listBrandsForManager()` ради показа кнопки «🧑‍💼 Я менеджер бренда». Это противоречит принципу “hot UI DB‑reads — нет”.
2) В нескольких местах сообщение для менеджера без доступа называлось “Доступ менеджера отозван”, что путает тех, кого **никогда не добавляли** (это не баг логики, но UX‑шум).
3) В 🏠 Home рисовалась “менеджерская” подсказка с DB‑lookup активного бренда — лишняя нагрузка для хаба.

Фикс:
- `mainMenuCreatorKb` и `mainMenuBrandKb`: кнопка «🧑‍💼 Я менеджер бренда» теперь **всегда видна**, без DB‑проверки в рендере меню. Доступ проверяется внутри `a:bm_home` (гейт на клике).
- `renderMainMenu`: удалены вызовы `db.listBrandsForManager()` в рендере 📋 Меню.
- `renderHomeHub`: убран DB‑lookup “canManager/активный бренд” из рендера хаба; переключатель “Менеджер бренда” показывается только если режим уже включён (без DB), а вход — через меню.
- Введён единый текст `bmNoAccessHtml()` и заменены все варианты “отозван” на “не добавили/доступ отозван” (одна консистентная подсказка).

Docs:
- `docs/00_CURRENT_STATE.md`: watchlist расширен пунктом про Brand Manager UX и ссылкой на audit report.

Как проверить (smoke):
- Любой пользователь (Creator/Brand) → 📋 Меню: видит кнопку «🧑‍💼 Я менеджер бренда».
- Нажать «🧑‍💼 Я менеджер бренда» без прав → показывается консистентный гейт‑текст (не “отозван” в одиночку).
- Для реального менеджера: «🧑‍💼 Я менеджер бренда» → (если брендов несколько) выбор бренда → открывается brand Inbox.
- Проверить, что 📋 Меню и 🏠 Home не делают `db.listBrandsForManager()` (только на клике `a:home_mode|m:brand_manager`).

Риск регрессий: **низкий** (изменения UI/копирайт + удаление лишних DB‑чтений в меню/хабе; критичная логика списаний/паблиша не тронута).


### STEP274 — Dual-role mode switching hardening (Creator + Brand + Brand Manager)
Цель:
- Прогнать “двойные роли” (Brand owner + Manager + Creator) и убедиться, что переключение режимов не создаёт “полу‑состояния”.
- В Redis degraded режиме role switch должен быть fail‑open (не блокировать пользователя).

Найдено:
1) `renderHomeHub` вычислял effective mode с приоритетом `bm_mode`. Если пользователь переключал UI на Creator, но `bm_mode` оставался включённым, Home/Guide могли показывать “Менеджер бренда” (полу‑состояние).
2) `a:ui_mode_set` и часть `bm_*` действий были `REQUIRE_REDIS`, что могло блокировать переключение роли при Redis outage.
3) `clearBmActiveBrand()` делал `redis.del()` без try/catch → потенциальный crash при Redis degraded.

Фикс:
- `actionRegistry`: `a:ui_mode_set`, `a:bm_mode_set`, `a:bm_pick_brand`, `a:bm_set_brand` переведены на `guard: NONE` (безопасные действия; Redis — только best‑effort).
- `a:ui_mode_set`: всегда очищаем brand‑manager state (`disableBrandManagerState`) при переключении режима.
- `clearBmActiveBrand` и `disableBrandManagerState`: try/catch (не падаем при Redis degraded).
- `renderMainMenu`: добавлен `modeOverride`, чтобы сразу показать выбранный режим даже если Redis не сохраняет state.

Docs:
- `docs/00_CURRENT_STATE.md`: watchlist расширен пунктом про dual-role и ссылкой на audit report.
- `docs/audit/06_DUAL_ROLE_MODE_SWITCH_AUDIT_2026_03.md`: отчёт аудита.

Как проверить (smoke):
- Пользователь-менеджер: `🧑‍💼 Я менеджер бренда` → выйти `✨ Я Creator / канал` → ожидание: Home/Меню показывает Creator (не “Менеджер бренда”).
- Redis degraded (Preview): `🏷 Я бренд`/`✨ Creator` клики не уходят в общий error; выбранный режим отображается сразу (best‑effort).

Риск регрессий: **низкий** (guards + Redis state cleanup + локальный override в рендере меню).


### STEP275 — Brand/Manager UX: Back/Menu/Home return-to consistency (Inbox / Deals / Accept)
Цель:
- Прогнать “бренд ↔ менеджер” ключевые экраны: **📥 Inbox / 🔎 поиск / ✅ принятие заявок**.
- Убрать сценарий “после действия вернуло не туда” (особенно для Brand Manager).

Найдено:
1) В списках **📝 Заявки** и **📌 Сделки** footer `⬅️ Назад` возвращал в `🎬 UGC/Офферы` (`a:bx_open|ws:0`), хотя вход чаще был из 📋 Меню.
   - Для менеджера бренда это ощущалось как “прыжок в чужой раздел”, потому что его базовый экран — **📥 Inbox**.

Фикс:
- `renderBrandAppsList` и `renderBrandDealsList`:
  - вычисляем `hubBackCb` по роли:
    - **manager** → `a:bx_inbox|ws:0|p:0|h:mm`
    - **owner** → `a:menu`
  - и передаём в `kbNavRow(kb, hubBackCb)`.
- Никаких новых SQL/Redis чтений в hot UI путях; только коррекция return-to.

Docs:
- `docs/00_CURRENT_STATE.md`: watchlist расширен пунктом про Brand/Manager return-to.
- `docs/audit/07_BRAND_MANAGER_NAV_RET_AUDIT_2026_03.md`: отчёт аудита.

Как проверить (smoke):
- Brand owner: 📋 Меню → 📝 Заявки → `⬅️ Назад` ведёт в 📋 Меню (или Back не показывается и используется 📋 Меню).
- Brand manager: 📋 Меню → 📝 Заявки → `⬅️ Назад` ведёт в 📥 Inbox.
- Аналогично для 📌 Сделки.
- В карточке заявки: `✅ Принять` → карточка открывается как `💬 В работе`, `⬅️ Назад` возвращает в список.

Риск регрессий: **низкий** (только footer return-to; бизнес-логика/списания не затронуты).

### STEP276 — Creator ↔ Curator UX hardening (grep audit + guards + degraded Redis)
Цель:
- Прогнать “креатор ↔ куратор” систему: кабинет куратора, управление кураторами у владельца канала, тексты/кнопки/возвраты.
- Убрать UX‑путаницу и скрытые поломки.
- В Redis degraded: навигация куратора должна оставаться доступной; потенциально спамные действия — fail‑closed с понятным сообщением.

Найдено:
1) **Баг callback parsing:** кнопка toggle режима куратора использовала `v=...` вместо `v:...` → `parseCb` игнорировал параметр, toggle не работал.
2) **Путаница в UI‑лейбле:** “🧹 Кураторы блогера” показывалось кураторам как вход в кабинет → неверная ментальная модель.
3) **Лишний fail‑closed при Redis degraded:** ряд кураторских view‑экранов был `guard: REQUIRE_REDIS`, хотя они DB‑read/view‑only.
4) **Нарушение footer‑инварианта:** экран “куратор выключен владельцем” не имел `📋 Меню/🏠 Home`.

Фикс:
- `src/bot/bot.js`:
  - исправлен callback: `a:cur_mode_set|v:0/1|...`.
  - унифицирован лейбл входа для куратора: `🧹 Кабинет куратора` (в меню/хабах/подсказках).
  - добавлен `redisHealthOkQuick()` и дружелюбные гейты для invite/input/anti‑spam send (чтобы не заспамить владельца/канал при Redis down).
  - добавлены `📋 Меню` + `🏠 Home` в disabled‑workspace screen.
  - в DM‑уведомлении “куратор удалён” кнопка `💬 Поддержка` (вместо `Support`).
- `src/bot/actionRegistry.js`:
  - кураторские view/nav действия переведены в `guard: NONE` (fail‑open навигация); критичные “спамные” операции защищены внутренним redis health gate.

Docs:
- `docs/audit/08_CREATOR_CURATOR_SYSTEM_AUDIT_2026_03.md` — отчёт аудита.
- `docs/00_CURRENT_STATE.md` — watchlist расширен пунктом про Creator↔Curator.

Как проверить (smoke):
- Владелец: `👥 Кураторы канала` → включить/выключить кураторов → UI не падает при Redis degraded.
- Куратор: `🧹 Кабинет куратора` → открыть канал → открыть конкурс → toggle “🧹 Режим: ВКЛ/ВЫКЛ” работает.
- Куратор: `📣 Напомнить проверить` / `📩 Сообщение владельцу` при Redis degraded → показывает понятное “временно недоступно”, не отправляет.

Риск регрессий: **низкий** (тексты/guards/навигация; бизнес‑логика и монетизация не затронуты).

### STEP277 — Creator ↔ Curator “What next” UX polish (end-to-end сценарии)
Цель:
- Пройти креатор ↔ куратор по реальным сценариям “куратор обработал → владелец увидел → что делать дальше”.
- Убрать ситуации, когда новый человек не понимает следующий шаг.
- Не расширять поверхность и не добавлять DB‑чтений в горячие UI пути.

Сценарии:
1) Куратор назначен → получает DM → понимает, куда нажать дальше.
2) Кабинет куратора → канал → конкурс → “✅ Проверено/📝 Заметки/📩 Владельцу”.
3) Владелец получает “Апдейт от куратора” → сразу знает, что нажать и куда смотреть.
4) Владелец открыл конкурс → понимает, как использовать блок “Куратор”.

Фикс:
- `src/bot/bot.js`:
  - `renderCuratorHome`/`replyCuratorHome`: добавлен блок “Что делать” (3 шага) + расшифровка статусов.
  - `renderCuratorWorkspace`: добавлен блок “Что делать” + понятный текст при disabled‑curator.
  - `renderCuratorGiveawayOpen`: добавлен блок “Что дальше” с расшифровкой кнопок.
  - `a:cur_gw_check_q`/`a:cur_gw_note_q`: добавлены подсказки следующего шага.
  - `exp.type===curator_note`: ACK после сохранения заметки с “что дальше”.
  - `renderCuratorGiveawayOwnerNotifyQ`/`Send`: добавлено “что дальше” в подтверждение и в сообщение владельцу.
  - `renderGwOpen`: для владельца добавлен блок “Что дальше” в секции куратора.

Docs:
- `docs/audit/09_CREATOR_CURATOR_WHAT_NEXT_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist расширен ссылкой на audit 09.

Smoke:
- Куратор: `🧹 Кабинет куратора` → выбрать канал → открыть конкурс → ✅/📝/📩.
- Владелец: получить “Апдейт от куратора” → открыть конкурс → увидеть блок “Что дальше”.

Риск регрессий: **низкий** (copy/подсказки; бизнес‑логика не тронута).


### STEP278 — Curator ↔ Brand Leads “What next” UX polish (end-to-end)
Цель:
- Пройти разбор заявок брендов в кураторском режиме (очередь → карточка заявки → действия) и добавить явные подсказки «что делать дальше».
- Убрать мелкую UX-дыру: при возврате из карточки заявки в `📨 Очередь заявок` сохранять фильтр назначения (`📋 Все / 👤 Мои / 🆓 Свободные`).
- Не менять бизнес‑логику (статусы/шаблоны/аудит), не добавлять DB‑чтений в горячие UI пути.

Фикс:
- `src/bot/bot.js`:
  - `renderCuratorInbox`: добавлен блок “Что дальше” + легенда назначений (👤/📌).
  - `renderWsLeadsList`: если актор — куратор, добавлен role‑hint (что можно делать и что увидит владелец).
  - `renderLeadView`: для куратора добавлен блок “Что дальше” (назначение/шаблоны/статусы/заметки).
  - `a:cur_inbox` → `a:lead_view`: добавлен `af` в callback_data и возврат `Back` сохраняет фильтр (`a:cur_inbox|...|af:...`).
  - `sendLeadTemplateReply`: toast уточнён на “✅ Отправлено бренду”.

Docs:
- `docs/audit/10_CURATOR_BRAND_LEADS_WHAT_NEXT_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist расширен ссылкой на audit 10.

Smoke:
- Куратор: `🧹 Кабинет куратора` → `📨 Очередь заявок` → фильтр `📋/👤/🆓` → открыть заявку → Back возвращает с тем же фильтром.
- Куратор: в карточке → `👤 Взять себе` / отправить шаблон / `💬 В работу`.
- Владелец: открыть заявку и увидеть изменения (статус/назначение/заметки).

Риск регрессий: **низкий** (copy + сохранение одного параметра `af` в callback_data; бизнес‑логика не тронута).


### STEP279 — Brand Leads: Team notifications “What next” polish (owner/curators)
Цель:
- Пройти Brand Leads end-to-end по уведомлениям команды: “новая заявка / куратор взял / ответил / сменил статус / бренд написал → владелец понимает следующий шаг”.
- Не добавлять новых действий, только сделать тексты самодостаточными (“Что дальше”).
- Не добавлять DB-чтений в hot UI пути (меню/хабы).

Фикс:
- `src/bot/bot.js`:
  - DM о новой заявке: добавлен блок «Что дальше» (Открыть/Шаблоны/Ответить).
  - Уведомление о назначении (взял себе): формулировка “взята в работу” + «Что дальше».
  - Уведомление о шаблонном ответе: добавлены `Статус: from → to` (если реально изменился) + «Что дальше».
  - Manual смена статуса куратором: добавлено уведомление владельцу (и назначенному куратору, если отличается), без спама (только при реальном изменении).
  - Уведомление о сообщении от бренда: добавлен блок «Что дальше» (Открыть/Ответить).
  - Уведомление “владелец ответил”: добавлены `Статус: ...` (если был автопереход) + «Что дальше».

Docs:
- `docs/audit/11_BRAND_LEADS_TEAM_NOTIFICATIONS_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist расширен пунктом про team notifications + ссылка на audit 11.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

Smoke:
- Новая заявка → DM содержит «Что дальше».
- Куратор взял/переназначил → DM содержит «Что дальше».
- Ответ шаблоном → DM содержит статус (если изменился) + «Что дальше».
- Куратор сменил статус вручную → владельцу приходит DM “Статус изменён” (только если реально изменился).
- Бренд написал → DM содержит «Что дальше».
- Владелец ответил → кураторам приходит DM со сниппетом + «Что дальше».

Риск регрессий: **низкий** (copy/условия уведомлений; бизнес-логика не затронута).


### STEP280 — Manual replies: return-to-card (Brand Leads + Brand Apps) + small wording
Цель:
- Убрать лишний «квитанционный» экран после ручного ответа в 2 местах и возвращать оператора сразу в карточку заявки/треда (как после отправки шаблонов).
- Ничего не менять в бизнес‑логике; не добавлять DB‑чтений в hot UI путях.

Фикс:
- `src/bot/bot.js`:
  - `expectText: lead_reply` (владелец/суперадмин): после отправки ответа бренду сразу рендерит карточку заявки через `renderLeadView(back: status/page/ret)`.
    - Добавлен safe‑fallback: если рендер упал — показываем прежнюю квитанцию «✅ Ответ отправлен бренду» с кнопками «Открыть заявку / Заявки».
  - `expectText: brand_app_reply` (бренд): после доставки ответа креатору сразу рендерит карточку заявки через `renderBrandAppView(back: status/page)`.
    - Добавлен safe‑fallback на прежнюю квитанцию «✅ Ответ доставлен креатору».
  - `sendBrandAppTemplateReply`: toast поправлен на «✅ Отправлено креатору».

Docs:
- `docs/audit/12_MANUAL_REPLY_RETURN_TO_CARD_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про return‑to‑card после ручных ответов.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

Smoke:
- Lead: владелец → `✍️ Ответить` → отправить текст → сразу открывается карточка lead.
- Brand app: бренд → `✍️ Ответить` → отправить текст → сразу открывается карточка заявки.
- Brand app template: отправить шаблон → toast «✅ Отправлено креатору».

Риск регрессий: **низкий** (только UI‑поток после отправки; есть fallback на старое поведение).


### STEP281 — Creator UI wording: пояснение «Inbox бренда» (без логики)
Цель:
- В 1–2 местах Creator UI убрать/пояснить brand‑термин «Inbox бренда» без контекста.
- Не менять кнопки/потоки/бизнес‑логику; только wording.

Фикс:
- `src/bot/bot.js`:
  - В карточке заявки креатора (статус ≠ `new`) текст «…оно попадёт в Inbox бренда» заменён на пояснение «во входящие (Inbox) внутри этого бота».
  - В экране ввода «Сообщение бренду» текст «…доставлю в Inbox бренда» заменён на «доставлю бренду во входящие (Inbox) в этом боте».

Docs:
- `docs/audit/13_CREATOR_UI_INBOX_WORDING_CONTEXT_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про Creator UI wording + добавлена ссылка на audit 13.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

Smoke:
- Креатор: открыть свою заявку к бренду (статус ≠ `new`) → увидеть пояснение про «входящие бренда внутри бота».
- Креатор: `💬 Написать бренду` → увидеть экран ввода с тем же пояснением.

Риск регрессий: **минимальный** (изменён только текст).


### STEP282 — Brand Leads: brand-side “What next” signals (reply + manual status change)
Цель:
- Закрыть цикл по Brand Leads «в обратную сторону»: когда владелец/куратор **ответил** или **вручную сменил статус** → бренд получает понятный сигнал и знает следующий шаг.
- Без расширения набора действий: используем существующие кнопки (`💬 Диалог`, `🪟 Витрина`, навигация; контакты по unlock как и раньше).
- Без подсказок обхода unlock/контактов.

Фикс:
- `src/bot/bot.js`:
  - `sendLeadTemplateReply`: в сообщении бренду добавлен блок «Что дальше» (как продолжить переписку через `💬 Диалог → ✍️ Ответить` и где смотреть профиль через `🪟 Витрина`).
  - `expectText: lead_reply` (владелец): в сообщении бренду добавлен блок «Что дальше».
  - `a:lead_set` (ручная смена статуса): если статус реально изменился — бренд получает сообщение «Статус обновлён» + `from → to` + «Что дальше».

Docs:
- `docs/audit/14_BRAND_LEADS_BRAND_SIDE_WHAT_NEXT_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про brand-side signals + ссылка на audit 14.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

Smoke:
- Владелец/куратор: ответ (шаблон / вручную) → бренд получает сообщение с «Что дальше».
- Владелец/куратор: ручная смена статуса → бренд получает «Статус обновлён» + «Что дальше».

Риск регрессий: **низкий** (только текст + доп. уведомление в статус‑хендлере; hot UI пути не затронуты).


### STEP283 — Brand Leads: brand reply receipt “What next” (blead_reply)
Цель:
- После ручного ответа бренда креатору (`blead_reply`) убрать «квитанцию в одну строку» и сделать её самодостаточной за счёт короткого блока «Что дальше».
- Не добавлять новых действий/кнопок; использовать уже существующую кнопку `💬 Диалог`.

Фикс:
- `src/bot/bot.js`:
  - `expectText: blead_reply`: финальная квитанция бренду теперь включает блок «Что дальше» (открыть диалог / ждать ответ) и отправляется с `parse_mode: HTML`.

Docs:
- `docs/audit/15_BRAND_LEADS_BRAND_REPLY_RECEIPT_WHAT_NEXT_UX_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про brand reply receipt + ссылка на audit 15.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

Smoke:
- Бренд: открыть lead → `✍️ Ответить` → отправить текст → увидеть квитанцию с «Что дальше».
- Нажать `💬 Диалог` → открывается диалог по заявке.

Риск регрессий: **минимальный** (изменён только текст квитанции; логика доставки не тронута).


### STEP284 — Brand Leads: E2E smoke + единый гайд «Что дальше» (copy consistency)
Цель:
- Финально «закрыть цикл» по Brand Leads на уровне проверок и документации.
- Зафиксировать единые правила для блока «Что дальше», чтобы дальнейшие тексты были консистентны и не создавали намёков на обход unlock/контактов.

Изменения (docs-only):
- Добавлен единый гайд по формату и запретам: `docs/24_WHAT_NEXT_BLOCKS_STYLEGUIDE.md`.
- Добавлен короткий end‑to‑end smoke Brand Leads: `docs/audit/16_BRAND_LEADS_E2E_SMOKE_2026_03.md`.
- `smoke-tests_short.md` дополнен секцией 12 с ссылкой на полный сценарий.
- `docs/README.md` — добавлены ссылки на гайд и smoke.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про copy consistency + добавлена ссылка на audit 16.

Smoke:
- Запускать по `docs/audit/16_BRAND_LEADS_E2E_SMOKE_2026_03.md` (10–12 минут).

Риск регрессий: **нулевой** (код не менялся).


### STEP285 — Folders: disable Editors UI by default (owner-only)
Цель:
- Убрать из UI роль `👥 Editors` для папок, чтобы не плодить лишние сущности/вопросы.
- Не ломать прод: папки остаются owner-only, а legacy кнопки Editors (если где-то остались) не должны создавать invite и должны отвечать предсказуемо.
- Убрать лишнее DB-чтение из hot Menu render (если Editors не используются).

Фикс:
- `src/bot/bot.js`:
  - `getRoleFlags`: проверка `hasAnyWorkspaceEditorRole` выполняется только если `WORKSPACE_EDITORS_ENABLED=1` (иначе `isFolderEditor=false`).
  - `getFolderAccess`: доступ folder-editor запрещён, если `WORKSPACE_EDITORS_ENABLED` выключен.
  - `foldersHomeKb`: кнопка `👥 Editors` показывается только при включённом флаге.
  - callbacks `a:ws_editors`/invite/add/remove: при выключенном флаге возвращают «Отключено.»

Docs:
- `docs/audit/17_FOLDERS_EDITORS_DISABLED_BY_DEFAULT_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про Editors disabled + ссылка на audit 17.
- `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` — добавлен ENV `WORKSPACE_EDITORS_ENABLED`.

Smoke:
- Owner: Workspace → `📁 Папки` → нет кнопки `👥 Editors`.
- Папки owner работают как раньше.

Риск регрессий: **низкий** (папки owner не тронуты; добавлена только защита/флаг и убран лишний DB read в меню по умолчанию).


### STEP286 — Hotfix: Vercel cold-start SyntaxError after STEP285 (folders message newline)
Симптом:
- На Vercel `SyntaxError: Invalid or unexpected token` при старте (ESM compile).

Причина:
- В `src/bot/bot.js` в `a:folders_my` в сообщении для режима “Editors выключены” попал literal newline внутри строки `'...'`.

Фикс:
- `src/bot/bot.js`: сообщение переписано в однострочную строку с `\n\n` (escapes), чтобы модуль корректно компилировался.

Docs:
- `docs/audit/18_STEP286_HOTFIX_INVALID_TOKEN_2026_03.md` — отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist + ссылка на audit 18.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

QA:
- `node --check src/bot/bot.js` проходит.
- В боте `📁 Папки` (Editors выключены) показывает корректный текст.

Риск регрессий: **нулевой/минимальный** (фикс синтаксиса в одном сообщении).


### STEP287 — Release Preflight: add `node --check` (SyntaxError gate)
Контекст:
- На STEP285/286 был реальный прод‑инцидент: Vercel падал на cold start с `SyntaxError: Invalid or unexpected token` из‑за синтаксической мелочи (literal newline внутри строки).

Цель:
- Ловить такие ошибки **до деплоя** одной командой `npm run preflight`.

Изменения:
- `scripts/preflight.js`:
  - добавлен шаг **Node syntax check**: прогон `node --check` по ключевым entrypoint‑ам (bot/cron/api/migrations и т.д.).
  - если существует `api/qstash/`, проверяются все `api/qstash/*.js` автоматически.

Docs:
- `docs/process/10_RELEASE_PREFLIGHT.md` — добавлен пункт 8 про `node --check`.
- `docs/16_RELEASE_CHECKLIST.md` — уточнение, что preflight теперь ловит SyntaxError до Vercel.
- `docs/audit/19_STEP287_PREFLIGHT_NODE_CHECK_2026_03.md` — короткий отчёт.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про preflight `node --check`.

QA:
- `npm run preflight` проходит.
- (опционально) при синтаксической ошибке в любом entrypoint preflight падает на этапе `node --check`.

Риск регрессий: **нулевой** (dev‑инструмент, runtime не менялся).


### STEP288 — Giveaways & Offers: E2E smoke (docs-only)
Цель:
- Зафиксировать быстрый end‑to‑end smoke по двум публичным контурам: **Giveaways** и **Offers**.
- Ловить UX‑тупики/возвраты/гейты **после каждого деплоя** за 10–15 минут, без чтения кода.

Изменения (docs-only):
- Добавлен полный сценарий: `docs/audit/20_GIVEAWAYS_OFFERS_E2E_SMOKE_2026_03.md`.
- `smoke-tests_short.md` дополнен секцией 13 со ссылкой на полный сценарий.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про Giveaways/Offers smoke + добавлена ссылка на audit 20.

QA:
- Открыть `smoke-tests_short.md` и убедиться, что ссылка на `docs/audit/20_...` корректна.
- Прогнать сценарии A–D на prod/staging (10–15 минут).

Риск регрессий: **нулевой** (код не менялся).

### STEP289 — Broadcast: E2E smoke (docs-only)
Цель:
- Зафиксировать быстрый end‑to‑end smoke по рассылкам (Broadcast), чтобы убедиться, что gate без канала, создание с кнопками и механизм 429/cooldown работают предсказуемо и без тупиков.

Изменения (docs-only):
- Добавлен полный сценарий: `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md`.
- `smoke-tests_short.md` дополнен секцией 14 с кратким описанием и ссылкой на полный сценарий.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про Broadcast smoke.
- `docs/process/07_WORK_HISTORY_2026_03.md` — этот шаг.

QA:
- Открыть `smoke-tests_short.md` и убедиться, что ссылка на `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md` корректна.
- Прогнать сценарии A–C на prod/staging (10–15 минут).

Риск регрессий: **нулевой** (docs-only).

### STEP290 — Broadcast E2E smoke: clarify admin (docs-only)
Цель:
- Исправить E2E‑сценарий рассылок: только **администраторы** (super‑admin) создают рассылки, а не владельцы workspace.

Изменения (docs-only):
- В `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md` заменены упоминания owner на администратор в пред‑условиях и сценарии B; уточнено, что создание рассылок не зависит от владения каналом.

QA:
- Открыть `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md` и убедиться, что пред‑условия говорят о «администраторе» и в сценарии B также фигурирует администратор.
- Прогнать smoke‑тест при необходимости, используя админский контур.

Риск регрессий: **нулевой** (docs-only).


### STEP293 — Broadcast prompt polish (admin UX)
Цель:
- Сделать стартовый экран «📣 Новая рассылка» максимально предсказуемым: подпись у медиа **по желанию**, документ поддерживается, напоминание про «1 сообщение = 1 пост» и запрет альбомов.
- Привести кнопки к стандартной навигации: `❌ Отмена` / `⬅️ Админка` / `📋 Меню` / `🏠 Home`.

Изменения:
- `src/bot/bot.js`: обновлён текст подсказки в `a:bc_start`, перестроена клавиатура; в сообщении об ошибке неподдерживаемого формата уточнён список типов и добавлена правильная навигация.
- `docs/00_CURRENT_STATE.md`: секция Broadcast обновлена по поддерживаемым типам (text + фото/видео/GIF/документ), убраны неверные упоминания poll.
- `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md`: добавлены примечания про подпись и запрет альбомов.
- `docs/audit/23_BROADCAST_PROMPT_POLISH_2026_03.md`: короткий отчёт.

QA:
- 👑 Админка → 📣 Рассылки → `📣 Новая рассылка`: текст и кнопки как в подсказке; `❌ Отмена` возвращает в админку и сбрасывает режим ввода.
- Отправить фото **без подписи**: должно сохраниться как контент.
- Отправить неподдерживаемый тип (стикер/голос): получить понятный отказ + кнопки навигации.

Риск регрессий: **низкий** (тексты/клавиатура + один экран ошибки).


### STEP296 — callback_data hardening (P1) + admin callback UX (P2)
Цель:
- Убрать риск “тихих” кнопок из‑за лимита Telegram `callback_data <= 64 bytes` (Brand Manager pick brand, Curator audit, Brand filters).
- Устранить паттерн двойного `answerCallbackQuery()` (чтобы non-admin/deny сообщения не терялись).

Изменения:
- Brand Manager: кнопки выбора бренда переведены на компактный callback `a:bms` + compact `ret` (`bd/ba`).
- Curator audit: добавлен компактный callback `a:ca` (короче `a:cur_audit`) + укороченные ключи (без конфликтов с `p.a`).
- Brand filters: в `a:bx_fpick`/`a:bx_fset` убрано дублирование `pg`/`p` (меньше байт).
- Admin callbacks: убран паттерн “answerCallbackQuery дважды” для `Нет доступа.` (в admin handlers).

Доки:
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про callback_data лимит.
- `docs/audit/26_CALLBACK_DATA_HARDENING_2026_03.md` — отчёт и QA.

QA:
- Brand Manager: длинный tg_id (10 цифр) + ret=brand_deals → кнопка выбора бренда должна отображаться и нажиматься.
- Curator: `📜 Журнал` → переключения/пагинация должны работать, кнопки не исчезают.
- Brand filters: значения 10+ символов в picker → кнопки должны оставаться кликабельными.
- Admin: попытка нажать admin action non-admin → должен увидеть “Нет доступа.”.

Риск регрессий: низкий (изменения точечные, добавлены алиасы для обратной совместимости).


### STEP297 — Broadcast confirm idempotency (Redis degraded) — DB dedup + advisory lock
Контекст:
- В админском контуре рассылок `a:bc_confirm` мог создать **две** рассылки при двойном клике, если Redis деградировал (rateLimit не срабатывал) или два обработчика параллельно прочитали один draft.

Цель:
- Сделать подтверждение рассылки best‑effort идемпотентным **на стороне БД**, без миграций и без ожидания блокировок (fail‑fast в Neon).

Изменения:
- `src/db/queries.js`:
  - добавлена `createBroadcastIdempotent()`:
    - `pg_try_advisory_xact_lock(hashtext('bc_confirm:<admin_user_id>'))` (fail‑fast);
    - dedup‑окно 45 сек: если найден идентичный `PENDING` broadcast, возвращаем его (не создаём новый);
    - иначе создаём новый broadcast сразу с `total_count`.
- `src/bot/bot.js`:
  - `a:bc_confirm`: заменён `createBroadcast + updateBroadcast(total_count)` на `createBroadcastIdempotent(totalCount)`;
  - добавлен UX для `busy`: «⏳ Уже создаю рассылку…».

Docs:
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про bc_confirm идемпотентность.
- `docs/audit/27_BROADCAST_CONFIRM_IDEMPOTENCY_2026_03.md` — отчёт и QA.

QA:
- Double‑click по `✅ Отправить` → создаётся **одна** рассылка.
- При деградации Redis (rateLimit не срабатывает) double‑click всё равно не создаёт дубль.

Риск регрессий: низкий (затрагивает только admin confirm‑путь; cron/delivery не менялись).


### STEP298 — Menu/Home hot UI cache (Redis TTL 5m) — Neon-saving
Контекст:
- В горячих UI путях `📋 Меню` / `🏠 Home` было 2–3 SQL из `getRoleFlags()` + 1 SQL из `db.listWorkspaces()` (creator hub).

Цель:
- Снизить нагрузку на Neon, не меняя бизнес‑логику: сделать best‑effort Redis‑кеш с TTL 5 минут для role flags и списка workspaces.

Изменения:
- `src/bot/bot.js`:
  - добавлены `getRoleFlagsCached()` / `listWorkspacesCached()` / `invalidateWorkspacesCache()`;
  - `a:menu`, `a:menu_push`, `a:home`, `a:home_hint_ack` используют кешированную версию role flags;
  - creator hub в `renderRoleHub()` использует кешированный список workspaces;
  - `renderWsOpen()` принимает `opts.showCurator` и избегает лишнего SQL (используем уже известный флаг);
  - при `setup_forward` (подключение канала) кеш списка workspaces инвалидируется.
- Docs:
  - `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про Menu/Home hot cache.
  - `docs/audit/28_MENU_HOME_HOT_CACHE_2026_03.md` — отчёт и QA.

QA:
- Открыть `📋 Меню`/`🏠 Home` много раз подряд: после первого прогрева DB‑запросы должны резко уменьшиться.
- Подключить новый канал → он должен быть виден сразу (кеш сброшен).
- При Redis degraded меню должно продолжать работать (DB‑fallback).

Риск регрессий: низкий (кеш влияет только на UI, права/действия остаются DB‑truth).


### STEP299 — RateLimit fallback hardening + TTL for bm state
Контекст:
- В аудите отмечено, что fallback в `rateLimit()` использует неатомарный `INCR+EXPIRE` и при частичных сбоях может оставлять ключи **без TTL**.
- Также обнаружены “вечные” ключи состояния brand‑manager режима (`bm_mode`, `bm_active_brand`) без TTL.

Цель:
- Убрать возможность появления ключей без TTL из-за fallback.
- Сделать bm state “долгоживущим, но не вечным” (long TTL).

Изменения:
- `src/lib/redis.js`:
  - `rateLimit()` использует только атомарный Lua `INCR` + `EXPIRE` on first hit.
  - при деградации Redis / недоступности скриптов — **fail-open** (без non-atomic fallback).
- `src/bot/bot.js`:
  - `bm_mode` и `bm_active_brand` теперь записываются с TTL **365 дней** (refresh на запись).

Docs:
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про rateLimit/TTL hardening.
- `docs/audit/29_RATE_LIMIT_AND_REDIS_TTL_HARDENING_2026_03.md` — отчёт и QA.

QA:
- `npm run preflight` проходит.
- В нормальном режиме rateLimit работает как раньше.
- При деградации Redis rateLimit fail-open и не создаёт ключи без TTL.
- Brand manager state пишет ключи с TTL (можно проверить TTL выборочно через SCAN/TTL).

Риск регрессий: низкий (инфраструктурный helper + TTL на двух ключах).


### STEP300 — Redis TTL hygiene gate (preflight)
Контекст:
- После P3 замечаний аудита важно не допустить возврата `redis.set(a, b)` без TTL в runtime‑код.

Цель:
- Добавить dev‑guardrail, который ловит двухаргументный `redis.set` (без `{ ex: ... }`) **до деплоя**.

Изменения:
- Добавлен `scripts/lint-redis-ttl.js` и `npm run lint:redis-ttl`.
- `npm run preflight` теперь включает `lint:redis-ttl`.
- В `src/bot/bot.js` помечены intentional‑persistent точки комментарием `TTL-LINT: ...`.

Docs:
- `docs/process/10_RELEASE_PREFLIGHT.md` — добавлен пункт `lint:redis-ttl`.
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про TTL hygiene gate.
- `docs/audit/30_REDIS_TTL_HYGIENE_GATE_2026_03.md` — отчёт.

QA:
- `npm run preflight` проходит.
- В коде нет новых `redis.set(a, b)` без TTL, кроме помеченных intentional‑persistent точек.

Риск регрессий: **нулевой** (dev‑guardrail + комментарии).



### STEP301 — P3 micro consistency cleanups (Broadcast UI + QStash + redactContacts)
Контекст:
- В P3 части аудита отмечались мелкие места с потенциальной хрупкостью/неконсистентностью (layout кнопок в broadcast, scope-shadow `url` в qstash deliver, `.test()+.replace()` на /g regex в redaction).

Цель:
- Добить аккуратную консистентность **без изменения бизнес‑логики** и без расширения поверхности.

Изменения:
- `src/bot/bot.js`:
  - экран «📣 Рассылка → 🔗 Кнопки»: шаблоны/действия выровнены в **2×2** (две в ряд), добавлена явная навигация **⬅️ Админка / 📋 Меню / 🏠 Home**.
- `api/qstash/broadcast-deliver.js`:
  - убран scope‑shadow переменной `url` в cooldown‑ветке (используем `deliverUrl`, не перекрывая handler‑level `url`).
- `src/bot/redactContacts.js`:
  - убран паттерн `.test()+.replace()` для global regex: теперь единый `replace` + проверка `next !== s` (избавляемся от stateful `lastIndex` и лишних проходов).
- Docs:
  - `docs/00_CURRENT_STATE.md` и `docs/process/07_WORK_HISTORY_2026_03.md` обновлены.

QA:
- Админка → 📣 Рассылка → 🔗 Кнопки:
  - шаблоны и «✅ Готово» в 2×2; footer‑кнопки ведут в Админку/Меню/Home.
- Broadcast delivery:
  - при cooldown (429) репаблишится как раньше; PAUSED path не ломается.
- Redaction:
  - строка с 2+ ссылками/handles → всё скрывается; без пропусков при повторных вызовах.

Риск регрессий: нулевой (UI/layout + микро‑рефакторинг helpers).


### STEP302 — Payments FK hardening + users soft-delete flags
Контекст:
- NotebookLM audit подсветил риск: `stars_payments.user_id` и `payments.user_id` были созданы с `ON DELETE CASCADE`.
- При физическом удалении пользователя это может стереть финансовую историю (charge ids / ledger) и нарушить auditability и идемпотентность.

Цель:
- Сделать так, чтобы финансовые логи **никогда** не удалялись каскадом.
- Ввести явные флаги soft-delete/deactivate на `users`, чтобы “удаление” делалось безопасно (без `DELETE FROM users`).

Изменения:
- `migrations/042_payments_fk_hardening.sql`
  - заменяет FK `user_id` в `stars_payments` и `payments` на `ON DELETE RESTRICT` (idempotent; если уже не cascade — ничего не делает).
  - operator refs (`applying_by_user_id`, `applied_by_user_id`) остаются `ON DELETE SET NULL`.
- `migrations/043_users_soft_delete.sql`
  - добавляет `users.is_deleted`, `users.deleted_at`
  - добавляет опционально `users.deactivated_at`, `users.deactivated_reason`

Docs:
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про payments anti-cascade + soft-delete.
- `docs/audit/31_PAYMENTS_FK_HARDENING_SOFT_DELETE_USERS_2026_03.md` — короткая фиксация причины/решения.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- `npm run preflight` проходит.
- `node migrations/run.js`:
  - повторный запуск идемпотентен.
  - в DB после применения: hard-delete пользователя с существующими платежами должен быть ограничен FK.

Риск регрессий: низкий (только миграции + docs; бизнес‑логика не менялась).


### STEP303 — Stateless fallback: reset input + silent clear (expectText/draft)
Контекст:
- NotebookLM audit подсветил UX‑риск: при деградации Redis/стейтлесс‑экранах пользователь может “залипнуть” в режиме ввода (expectText/draft), а safe-mode навигация не всегда даёт гарантированный сброс.

Цель:
- В degraded safe-mode дать пользователю явную кнопку **«🔄 Сбросить ввод»**.
- На любых кликах `s:*` делать silent best‑effort очистку `expectText/draft`, не создавая лог‑спам при Redis down.

Изменения:
- `src/bot/bot.js`:
  - `kbStatelessFallback()` теперь всегда добавляет кнопку `🔄 Сбросить ввод` (`s:reset_input`).
  - `handleStatelessCallback()` делает silent best‑effort очистку `expectText/draft` через `redis.del()` (без console.error).
  - добавлен экран `s:reset_input`: чистит состояние и возвращает в «Меню (безопасный режим)».
  - в break‑glass confirm клавиатуру добавлена `🔄 Сбросить ввод`.
  - fail‑closed сообщение при `guard: REQUIRE_REDIS` теперь показывает расширенную safe‑клавиатуру (menu/home/help + reset).

Docs:
- `docs/00_CURRENT_STATE.md` — watchlist дополнен пунктом про stateless reset input.
- `docs/audit/32_STATELESS_INPUT_RESET_2026_03.md` — фиксация причины/решения.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- В safe-mode (кнопки `s:*`) нажать `🔄 Сбросить ввод` → показывает меню safe-mode.
- После восстановления Redis пользователь не должен оставаться “в вводе” из старого контекста.
- Break-glass confirm экран содержит кнопку `🔄 Сбросить ввод`.

Риск регрессий: низкий (UI‑escape hatch + best‑effort очистка state, без DB/бизнес‑логики).


### STEP304 — Migration runner: checksum normalization (LF + trimEnd)
Контекст:
- NotebookLM audit подсветил хрупкость checksum: конвертация CRLF/LF или «финальный перевод строки» могут дать checksum mismatch и валить деплой, хотя SQL по смыслу не менялся.

Цель:
- Устранить ложные checksum mismatch из-за EOL/EOF whitespace.
- Сохранить fail-closed для реальных правок миграций.
- Не требовать никаких DB-миграций/ручных правок `schema_migrations`.

Изменения:
- `migrations/run.js`:
  - checksum теперь считается по нормализованному SQL: EOL → LF, затем `trimEnd()`.
  - для обратной совместимости раннер принимает уже записанные checksum (legacy) в нескольких вариантах (raw/lf/crlf/normalized + типовые «final newline» варианты).
  - при применении новых миграций в `schema_migrations` сохраняется **нормализованный** checksum.
- `scripts/gen-mark-all-applied.js`:
  - checksum в generated pack теперь тоже считается по нормализованному SQL (в синке с раннером).

Docs:
- `docs/00_CURRENT_STATE.md` — пункт про миграции дополнен пояснением про checksum normalization.
- `docs/audit/33_MIGRATION_RUNNER_CHECKSUM_NORMALIZATION_2026_03.md` — фиксация причины/решения.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- `node migrations/run.js --dry-run` работает.
- Повторный `node migrations/run.js` на уже применённой базе не должен падать из-за CRLF/LF или «перевода строки в конце файла».
- Любая реальная правка текста миграции (не whitespace-only) по-прежнему даёт checksum mismatch (fail-closed).

Риск регрессий: низкий (локальная логика checksum; выполнение SQL не менялось).


### STEP305 — Migration pack sync: preflight enforces `00_mark_all_applied.sql`
Контекст:
- После STEP304 checksum normalization важно, чтобы `migration_pack/00_mark_all_applied.sql` не отставал от `migrations/` (иначе mark-all-applied может содержать удалённые миграции или не включать новые).

Изменения:
- `migration_pack/00_mark_all_applied.sql` регенерирован через `npm run gen:migration-pack` (содержит актуальный список миграций и нормализованные checksum).
- `scripts/preflight.js`: добавлен guardrail — preflight запускает `gen:migration-pack` и валится, если pack‑файл изменился (аналогично проверке `docs/02_ACTION_KEYS_REGISTRY.md`).

Docs:
- `docs/00_CURRENT_STATE.md` — добавлен пункт про migration pack preflight gate.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- `npm run gen:migration-pack` не должен оставлять diff в `migration_pack/00_mark_all_applied.sql`.
- `npm run preflight` проходит.
- В pack присутствуют последние миграции (на момент STEP305 — до `043_...`), и нет удалённых/переименованных файлов.

Риск регрессий: минимальный (dev‑tooling + regenerated pack; runtime‑логика не затронута).



### STEP306 — Degraded UX hardening: честный `s:reset_input` + support-reply без ForceReply
Контекст:
- В stateless safe-mode кнопка `s:reset_input` всегда писала «✅ Ввод сброшен», даже если Redis был недоступен и состояние ввода фактически не очищалось.
- В support-группе промпт для ответа пользователю использовал `force_reply`, а при сбоях Redis мог оставлять “висящие” триггеры и вводить админа в заблуждение.

Изменения:
- `src/bot/bot.js`:
  - `s:reset_input` теперь **честный**: пытается очистить `expectText/draft` и показывает «✅» только если операции прошли; при ошибке Redis — предупреждение («сброс не выполнен»).
  - Reply-to-user в support-группе больше **не использует ForceReply**: промпт обычным сообщением + inline-кнопка `❌ Отмена`.
  - Fail-closed по UX: если запись reply‑сессии в Redis не удалась, промпт сразу помечается как “не активен” (редактируется), чтобы не было ложного «ответь сюда».
  - Добавлен `a:adm_support_reply_cancel` для явной отмены reply‑сессии (best-effort; при Redis degraded отмена не подтверждается и это явно показывается).

- `src/bot/actionRegistry.js`:
  - добавлен `a:adm_support_reply_cancel` (guard: `NONE`, чтобы можно было “прибрать UI” даже при деградации Redis).

Docs:
- `docs/00_CURRENT_STATE.md` — уточнено поведение safe-mode reset input и support reply prompt.
- `docs/02_ACTION_KEYS_REGISTRY.md` — регенерирован (включает новый action key).
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- Degraded safe-mode: нажать «🔄 Сбросить ввод» → при доступном Redis видеть «✅ Ввод сброшен», при недоступном — «⚠️ Сброс не выполнен».
- Support-группа: `✍️ Ответить` → промпт без ForceReply, кнопка `❌ Отмена` редактирует промпт в «Отменено».
- При искусственном падении Redis во время старта reply‑сессии: промпт должен редактироваться в «кеш недоступен / сессия не активна».

Риск регрессий: низкий (локальные UX-правки; денег/SQL не затронуто).
### STEP307 — Official publish mini-outbox: reserve → enqueue → deliver (QStash)
Контекст:
- Синхронная публикация в @collabka_offers (DB reserve `PUBLISHING` → Telegram send/edit → DB `ACTIVE`) в serverless может быть прервана (hard-kill), что оставляет зависшие состояния или ведёт к дублям при повторных кликах.
- Нужна развязка “операторский клик” и “сетевой вызов Telegram” без ломки существующей схемы статусов/lock’ов.

Изменения:
- `src/bot/bot.js`:
  - добавлен `queueOfficialPublishToOfficialChannel(...)`: делает **DB reserve** (`atomicReserveOfficialPublish`) + ставит задачу в QStash deliver, без синхронного Telegram send в UI‑пути.
  - добавлен `enqueueOfficialPublishDeliverJob(...)` (dedup по offerId+минуте) и `deliverOfficialPublishReserved(...)` (реальная отправка в канал + фиксация `ACTIVE`).
  - места вызова публикации (`a:off_pub`, `a:off_upd`, admin apply `offpub_`) переведены на queue‑путь; при отсутствии QStash — fallback на legacy синхронный publish (чтобы не ломать прод при недонастроенной QStash).
- `api/qstash/official-publish-deliver.js`:
  - новый worker‑endpoint: проверка подписи QStash, вызов `deliverOfficialPublishReserved`, best‑effort reschedule при `locked`.

Docs:
- `docs/00_CURRENT_STATE.md` — обновлён пункт про official publish (reserve+enqueue+deliver).
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- Нажать `✅ Опубликовать` / `♻️ Обновить` в карточке оффера: статус уходит в `PUBLISHING`, UI не ждёт Telegram send.
- Проверить, что QStash доставляет POST на `/api/qstash/official-publish-deliver` и после выполнения статус становится `ACTIVE` (message_id заполнен).
- При двойном клике/повторной попытке: вторая попытка не должна создавать дубль (reserve guard + offer lock).
- При искусственном `locked` (параллельные действия): deliver worker должен перекинуть задачу с задержкой (retry), без спама/ошибок.

Риск регрессий: средний-низкий (затронута только публикация в официальный канал; остальные потоки не менялись).


### STEP308 — Hydration tokens для длинной навигации: авто‑fix callback_data > 64 (fail-open)
Контекст:
- Telegram жёстко ограничивает `callback_data` до 64 байт. При превышении кнопки могут исчезать или давать `button_data_invalid`.
- Раньше мы держали callbacks “вручную компактными” (short-коды, сокращение ret и т.п.), но это не гарантирует защиту при росте параметров/ID/фильтров.

Изменения:
- `src/bot/bot.js`:
  - добавлен авто‑sanitizer перед любым `editMessageText/reply`: если в inline‑клавиатуре найдено `callback_data` > 64 байт, оно заменяется на короткий `a:h|h:<token>`, а исходный callback сохраняется в Redis (`cbh:<tgId>:<token>`, TTL `CB_HYDRATION_TTL_SEC`).
  - обработчик callback-query умеет “разгидрировать” `a:h|h:<token>`: достаёт исходный callback из Redis и продолжает обработку как обычно.
  - fail-open: если Redis недоступен или токен протух — показываем экран «Кнопка устарела» с переходом в меню/home (вместо silent-fail).
- `src/bot/actionRegistry.js`:
  - добавлен служебный action `a:h` (guard: `NONE`) — чтобы `npm run actions:check` оставался чистым.

Docs:
- `docs/00_CURRENT_STATE.md` — пункт про `callback_data` дополнен описанием auto‑hydration.
- `docs/02_ACTION_KEYS_REGISTRY.md` — регенерирован (включает `a:h`).
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- Сделать кнопку с искусственно длинным `callback_data` (или воспроизвести любой экран, где есть длинные параметры):
  1) При рендере клавиатуры бот не должен падать; кнопки должны отображаться.
  2) Нажатие на такую кнопку должно работать (через rehydrate из Redis).
  3) Если токен протух/Redis down — должна появиться «Кнопка устарела» + кнопки «📋 Меню / 🏠 Home», без ошибок/спиннера.

Риск регрессий: низкий (изменения локальны: только safeEditOrReply и rehydrate branch, без DB и без денег).


### STEP309 — Tombstone/anonymize для удаления аккаунта (PII wipe + restore gate)
Контекст:
- Софт‑делит (`is_deleted/deleted_at`) сам по себе не решает приватность: если продолжать записывать `tg_username` при каждом /start, PII “возвращается”.
- При удалении аккаунта нужно удалить/обнулить чувствительные поля (контакты/профили), но сохранить финучёт и историю (платежи/аудит) для отчётности.
- Решение должно быть serverless‑friendly, DB‑truth, без дополнительных SQL в hot UI.

Изменения:
- `src/db/queries.js`:
  - `upsertUser()` обновлён: если `users.is_deleted=true`, **не** перезаписывает `tg_username` из Telegram апдейтов (PII не “воскресает”).
  - добавлены `tombstoneUser(userId)` и `restoreUser(userId)`:
    - `tombstoneUser` в транзакции ставит `is_deleted=true`, `deleted_at`, чистит `tg_username`, обнуляет `brand_profiles`, скрывает витрины (wipe `workspace_settings` профиля/контактов + `network_enabled=false`), удаляет IG OAuth accounts для owned workspaces, отзывает edge‑роли (`brand_managers`, `workspace_editors`, `workspace_curators`), чистит `user_verifications.submitted_text`.
    - `restoreUser` возвращает `is_deleted=false` (без восстановления PII) — пользователь выбирает роль заново.
- `src/bot/bot.js`:
  - добавлен экран‑гейт `renderAccountDeletedGate`.
  - `/start` и callback‑обработчик: если `is_deleted=true` — показываем гейт; разрешены только `♻️ Восстановить` и `💬 Поддержка`.
  - в `💬 Поддержка` добавлена кнопка `🗑 Удалить аккаунт` → подтверждение → `tombstoneUser`.
  - `a:acc_restore` восстанавливает аккаунт и сбрасывает role‑hints в Redis (best‑effort).
- `src/bot/actionRegistry.js`:
  - добавлены action keys: `a:acc_del_q` (NONE), `a:acc_del_do` (DB_TRUTH), `a:acc_restore` (DB_TRUTH).
- Docs:
  - `docs/02_ACTION_KEYS_REGISTRY.md` — регенерирован.
  - `docs/00_CURRENT_STATE.md` — добавлен пункт про tombstone.
  - `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- В `💬 Поддержка` нажать `🗑 Удалить аккаунт` → confirm → видим экран «Аккаунт удалён» с `♻️ Восстановить`.
- После удаления сделать `/start`: должен показываться экран удалённого аккаунта (без попадания в меню/хаб).
- Нажать `♻️ Восстановить`: должен открыться выбор роли (без ошибок), `ui_mode/bm_mode/cur_mode` best‑effort очищены.
- Проверить, что после удаления `tg_username` больше не “возвращается” в БД при последующих апдейтах (важно для приватности).

Риск регрессий: низкий‑средний (затронуты /start и общий callback‑гейт; изменения узкие, DB‑truth, без влияния на деньги).


### STEP310 — Role flags cache: main_menu cached + инвалидация при изменении ролей (Neon‑safe)
Контекст:
- Audit STEP304 отмечал: `a:main_menu` использует uncached `getRoleFlags` (лишние DB‑reads в навигации) и что role‑cache TTL может давать 5‑минутную “путаницу” после изменений ролей.
- Хотим: ноль новых SQL в горячих UI путях и предсказуемость после admin/role‑операций.

Изменения:
- `src/bot/bot.js`:
  - `a:main_menu` → `getRoleFlagsCached(...)` (best‑effort Redis‑кеш; при Redis degraded fallback на DB‑truth как раньше).
  - добавлен helper `invalidateRoleFlagsCache(userId)` (удаляет оба варианта ключа `cache:role_flags:<userId>:0/1`, чтобы не зависеть от `WORKSPACE_EDITORS_ENABLED`).
  - инвалидация кеша вызывается **после** role‑мутаций:
    - `db.addNetworkModerator` / `db.removeNetworkModerator`
    - `db.addCurator` / `db.removeCurator` (включая curator invite / curator self‑leave)
    - `db.addWorkspaceEditor` / `db.removeWorkspaceEditor` (включая editor invite)

Docs:
- `docs/00_CURRENT_STATE.md` — доп. примечание про STEP310 (main_menu cached + invalidate role_flags on role mutations).
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен этот STEP.

QA:
- Открыть `📋 Меню` → `🔄 Обновить` (a:main_menu): UI рендерится как раньше.
- Добавить/удалить модератора через админку: у целевого пользователя “Модератор” должен появляться/исчезать сразу (без ожидания TTL).
- Добавить/удалить куратора/редактора папок: доступ/кнопки должны обновляться сразу после операции.
- При Redis degraded: операции ролей продолжают работать (DB‑truth), кеш‑инвалидация best‑effort, без падений.

Риск регрессий: низкий (локальные изменения; только Redis del + замена одного вызова в навигации).


### STEP311 — Migrations cleanup: allow 3+ digits + remove dead normalizedSql
Контекст:
- В fail-fast правилах миграций был жёсткий regex `^\d{3}_.+\.sql$` → потенциально упираемся в потолок `999_...`.
- В раннере миграций оставалось “мертвое” поле `normalizedSql` (не используется; только шум в коде).

Изменения:
- `migrations/run.js`:
  - regex расширен до `^\d{3,}_.+\.sql$`.
  - убрано поле `normalizedSql` из `checksumCandidates()` (dead field; checksum по‑прежнему считается от нормализованного `LF + trimEnd`).
- `scripts/gen-mark-all-applied.js`:
  - regex расширен до `^\d{3,}_.+\.sql$` (в sync с раннером).
  - обновлены тексты ошибок (паттерн/regex).

Docs:
- `docs/00_CURRENT_STATE.md` — добавлен STEP311 + уточнён паттерн миграций.
- `docs/11_MIGRATIONS_PACK.md` — обновлён паттерн (>=3 digits) и regex.
- `docs/process/07_WORK_HISTORY_2026_02.md` + `docs/process/07_WORK_HISTORY_2026_02.md` — уточнено описание STEP208 (>=3 digits), чтобы не противоречило текущему раннеру.

QA:
- `node migrations/run.js --dry-run` не ругается на список миграций.
- `node scripts/gen-mark-all-applied.js --dry-run` не падает и использует новый regex.

Риск регрессий: низкий (меняем только regex фильтрации имён файлов и убираем dead-code поле).


### STEP312 — PG statement_timeout hardening: parameterized set_config + safe fallback
Контекст:
- Audit STEP304 отмечал, что `statement_timeout` устанавливается через строковую интерполяцию в SQL (`SET ... ${ms}`), что потенциально опасно (инъекции/ошибки форматирования) и хрупко в serverless.
- Хотим: сохранить текущую семантику (таймауты работают), но делать установку **параметризуемой**, и оставить fallback на прежний `SET` на случай quirks Neon/pooler.

Изменения:
- `src/db/pool.js`:
  - `ensureStatementTimeout()` теперь использует `select set_config('statement_timeout', $1, false)` с параметром.
  - добавлены guardrails (sanitize/clamp) для значения таймаута.
  - fallback: если `set_config` не сработал — пробуем legacy `SET statement_timeout TO <ms>` (значение уже санитизировано).
- `src/db/queries.js`:
  - `txSetLocalStatementTimeout()` теперь ставит **transaction-scoped** таймаут через `select set_config('statement_timeout', $1, true)`.
  - все тяжёлые транзакции, где ранее был `SET LOCAL statement_timeout TO ${stm}`, переведены на `txSetLocalStatementTimeout(...)`.
  - fallback внутри helper — `SET LOCAL ...` (значение санитизировано).

Docs:
- `docs/00_CURRENT_STATE.md` — уточнено, что таймауты ставим через parameterized `set_config` + fallback.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP312.

QA:
- Запустить любое действие, которое делает DB query через `pool.query` → в логах не появляется ошибок и нет предупреждений про `statement_timeout`.
- Прогнать критичные TX (например: accept brand application / unlock contacts / broadcast confirm) → транзакции работают, при выставленном маленьком `PG_*_STATEMENT_TIMEOUT_MS` запросы корректно отменяются (код 57014).
- При эмуляции ошибки `set_config` (например, ручной подменой SQL на неверный) — должен сработать fallback на `SET` (без краша).

Риск регрессий: низкий (семантика таймаутов сохранена; добавлена параметризация и fallback).


### STEP313 — Acquisition counters: bounded Redis totals TTL (ACQ_TOTAL_TTL_DAYS)
Контекст:
- Audit STEP304 отмечал, что часть “acquisition” счётчиков (`ref:*:total`) может жить без TTL, что в целом плохо как практика (risk of unbounded memory), даже если ключей мало.
- Хотим: сделать поведение явным и управляемым, не трогая Neon и не добавляя DB‑reads.

Изменения:
- `src/lib/config.js`:
  - добавлен `ACQ_TOTAL_TTL_DAYS` (default `365`).
  - `0` означает “хранить totals навсегда” (без TTL).
- `src/bot/bot.js`:
  - `trackAcqSource()` и `trackAcqRole()` переведены с `redis.incr(totalKey)` на `incrWithExpireOnFirst(totalKey, ttlSec)`.
  - TTL берётся из `CFG.ACQ_TOTAL_TTL_DAYS` (в секундах). Day‑buckets (`...:d:<YYYYMMDD>`) остаются с TTL 60 дней.

Docs:
- `docs/00_CURRENT_STATE.md` — описана политика TTL для `ref:*`.
- `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` — добавлен ключ `ACQ_TOTAL_TTL_DAYS`.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP313.

QA:
- Открыть `/start src_tg` и `/start src_ig` → `/api/health` показывает рост `ref.*`.
- Нажать выбор роли (brand/creator) → растёт `ref.by_role`.
- (Опционально) проверить TTL у `ref:*:total` в Redis: при `ACQ_TOTAL_TTL_DAYS=365` у totals должен быть TTL; при `0` — TTL отсутствует.

Риск регрессий: низкий (best‑effort Redis‑трекинг; логика `/start` не блокируется даже при Redis degraded).


### STEP314 — Degraded UX copy consistency + fail-open navigation via stateless allowlist
Контекст:
- В разных местах при деградации Redis встречались разные формулировки про «кеш/сессии», что путало пользователей и админов.
- Инвариант: mutating callbacks должны fail-closed при Redis degraded, а навигация должна оставаться доступной (fail-open) через allowlist безопасных действий.

Изменения:
- `src/bot/bot.js`:
  - введён единый блок копирайта `DEGRADED_COPY` (line/tips/tipsShort) и переиспользован в safe-mode (`s:*`) экранах.
  - сообщение fail-closed middleware (для `guard: REQUIRE_REDIS`) теперь HTML‑консистентное и использует тот же copy + кнопки `s:*` (меню/home/help/reset).
  - при ошибке открытия чата заявки (не удалось `setExpectText` из-за Redis) кнопки выхода переведены на stateless safe-mode (`s:menu/s:home/s:help/s:reset_input`) и сообщение унифицировано.
  - support-group reply prompt: уточнён текст «кеш/сессии недоступны» и добавлен единый поясняющий line.

Docs:
- `docs/00_CURRENT_STATE.md` — добавлен STEP314 (и синхронизирован блок recent steps).
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP314.

QA:
- Смоделировать Redis degraded (выключить Upstash ENV/подменить URL) и нажать:
  - любой `guard: REQUIRE_REDIS` action → должен показывать единый экран «Временно недоступно» + `s:*` кнопки.
  - `s:menu/s:home/s:help/s:reset_input` → тексты и подсказки консистентны.
  - попытка открыть чат заявки (креатор → чат) при Redis down → не тупик, выдаёт safe-mode кнопки.

Риск регрессий: очень низкий (copy/UX в деградации; без изменения DB‑логики).

## STEP315 — Repo sync to STEP314 baseline (docs parity)

- Removed stray files not present in STEP314 (.env.example + extra audit docs).
- Restored missing `docs/process/07_WORK_HISTORY_2026_02.md`.
- Reverted `smoke-tests_short.md` to baseline.
- NOTE: Neon history filename is canonical (`docs/neon/NEON_HISTORY_RAW.txt`); older ZIPs may show mojibake due to archive encoding.


## STEP316 — Official publish deliver: reserve-based dedup + no revert after TG success

Контекст:
- Mini-outbox (QStash) уже убрал синхронный Telegram send из UI, но оставался риск дублей при падении между успешным Telegram send/edit и DB финализацией (`ACTIVE`).
- При таком падении прежняя логика могла откатить статус обратно в `PENDING`, из-за чего оператор мог повторить публикацию и получить дубль в канале.

Изменения:
- `src/bot/bot.js`:
  - enqueue deliver теперь использует deduplicationId, привязанный к DB‑reserve `updated_at` (reserveAt/reserveEpoch) вместо minute-only.
  - deliver worker читает Redis breadcrumb `official:pub:msgid:<offerId>` и при отсутствии `message_id` предпочитает edit/attach вместо отправки нового сообщения.
  - перед DB финализацией всегда пишется breadcrumb (`pre_db`).
  - если Telegram send/edit уже успешен, но DB финализация упала: **не откатываем** в `PENDING` — оставляем `PUBLISHING`, пишем `last_error`, ставим ускоренный verify (delaySec=20) и возвращаем ACK (без QStash retry).
- `api/qstash/official-publish-deliver.js`:
  - delayed reschedule на `locked` теперь сохраняет dedup base (offerId+action+reserveKey), чтобы не плодить параллельные deliver задачи.

Docs:
- `docs/00_CURRENT_STATE.md` — уточнён пункт про official publish idempotency после STEP316.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP316.

QA:
- Смоделировать падение DB на шаге `setOfficialPostActive` (например, временно ломая DB ENV) при рабочем Telegram:
  - публикация должна оставить `PUBLISHING` (не `PENDING`), а в Redis должен появиться breadcrumb `official:pub:msgid:<offerId>`.
  - через ~20–90 секунд verify должен попытаться прикрепить `message_id` и перевести в `ACTIVE`.
- Двойной клик «Опубликовать» / повторный enqueue в течение одного reserve — не должен давать несколько deliver задач (dedup reserve-based).

Риск регрессий: низкий (локальные изменения в official publish; без влияния на меню/хабы и без новых DB‑reads в UI).

## STEP317 — Brand Inbox: accept-only transition + server-side guards (no bypass)

Контекст:
- В Brand Inbox «✅ Принять» — единственная точка списания и перехода `new → in_progress`.
- До этого шага в коде оставались “подстраховочные” автопереходы в `in_progress` при отправке сообщений (brand reply / creator chat), которые теоретически могли дать обход (при stale expectText / crafted updates).

Изменения:
- `src/bot/bot.js`:
  - `expectText: brand_app_reply` теперь **перед отправкой** заново грузит заявку из DB и **fail-closed**, если `status=new` (просит нажать ✅ Принять; не шлёт и не пишет в тред).
  - `expectText: brand_app_chat_send` (сообщение бренду от креатора) теперь **fail-closed**, если `status=new` (бренд ещё не принял), и не пишет в тред.
  - Удалены автопереходы `new → in_progress` из send-flow: статус больше никогда не меняется “по пути” — только через ✅ Принять.
- `src/db/queries.js`:
  - `updateBrandApplicationStatus()` усилен guard’ом: `in_progress/closed` нельзя поставить, пока текущий `status=new` (spam можно всегда).
  - `markBrandApplicationReplied()` теперь обновляет запись только если `status != new`.

Docs:
- `docs/00_CURRENT_STATE.md` — добавлена строка про server-side guards на отправке сообщений.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP317.

QA:
- Открыть заявку `status=new` и попытаться:
  - через старую кнопку/подмену callback открыть «✍️ Ответить/⚡ Шаблоны» → должно вернуть в карточку с подсказкой «Сначала ✅ Принять».
  - отправить сообщение в режиме `brand_app_reply` при `status=new` (симулируя stale expectText) → сообщение **не уходит**, бот требует ✅ Принять.
  - открыть чат креатора `💬 Написать бренду` при `status=new` → чат не открывается, показывается карточка.

Риск регрессий: низкий (локальные guards в Brand Inbox; без затрагивания меню/хабов и без новых DB‑reads в горячих UI путях).


## STEP318 — Broadcast 429 cooldown: Redis cooldown + /api/health pause signal

Цель:
- При Telegram 429 поставить **Redis cooldown** (с TTL), чтобы рассылка не долбила Telegram.
- На следующих тиках cron и в QStash deliver — **уважать паузу** (без лишних DB‑пуллов в Neon).
- `/api/health` должен показывать, что рассылка на паузе (Redis-only).

Изменения:
- `src/bot/cron.js`:
  - `setBroadcastCooldown()` переведён на атомарный Lua: выставляет **per‑broadcast** ключ `broadcast:<id>:cooldown_until` и **global** ключи `broadcast:cooldown_until` + `broadcast:cooldown_broadcast_id` консистентно (TTL считается от finalUntil).
  - `getBroadcastCooldownUntilMs()` теперь имеет fallback: если per‑broadcast ключ отсутствует, но global cooldown активен и принадлежит этому broadcastId — возвращаем global until.
- `api/health.js`:
  - broadcast cooldown блок теперь имеет Redis-only fallback: если global `cooldown_until` пуст, но известен `broadcast_id`, читаем per‑broadcast `broadcast:<id>:cooldown_until` и показываем его.

Docs:
- `docs/00_CURRENT_STATE.md` — добавлен STEP318 (broadcast cooldown idempotency + health signal).
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP318.

QA:
- Запустить рассылку и искусственно словить Telegram 429 (или подставить мок/лимит):
  - должен выставиться `broadcast:cooldown_until` и `broadcast:<id>:cooldown_until` (TTL > retry_after).
  - `broadcast_tick` на паузе должен выходить early (до выборки recipients) и писать `reason=cooldown`.
  - `/api/health` должен показать `broadcast.cooldown_until` и `retry_after_sec>0`.
  - В fan-out режиме `/api/qstash/broadcast-deliver` при активной паузе должен republish с delay и без Telegram send.

Риск регрессий: низкий (только broadcast cooldown plumbing; без влияния на меню/хабы).


## STEP319 — NotebookLM audit sources pack (text-only, ≤50 files)

Цель:
- Дать “внешнему аудитору / NotebookLM” **актуальные источники** без перегруза.
- Уложиться в лимит: **≤50 файлов**, только **текстовые** форматы (md/txt), без .sql.

Изменения:
- Обновлён `docs/audit/notebooklm_pack/`:
  - `docs/audit/notebooklm_pack/01_BUNDLE_CORE_RU.md`, `docs/audit/notebooklm_pack/02_BUNDLE_FEATURES_RU.md`, `docs/audit/notebooklm_pack/03_BUNDLE_PROCESS_HISTORY_RU.md` — пересобраны из текущих доков (с актуальным timestamp).
  - `docs/audit/notebooklm_pack/06_CODE_BUNDLE.txt` — обновлён (включает ключевой код: bot/db/redis/api/qstash/migrations runner).
  - `docs/audit/notebooklm_pack/07_MIGRATIONS_ALL.sql.txt` — обновлён (включает все `migrations/*.sql` и `migration_pack/*` как текст).
- Генерация ZIP для загрузки в NotebookLM: `npm run gen:notebooklm-sources` (script `scripts/gen-notebooklm-sources.js`).
  - Output: `dist/NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip`.

QA:
- `npm run gen:notebooklm-sources` проходит и пишет `OK: N files (<=50)`.
- В `docs/audit/notebooklm_pack/` нет файлов с расширением `.sql` (только .md / .txt).
- Bundle-файлы содержат актуальные STEP316–STEP318 изменения (official publish outbox, hydration tokens, broadcast cooldown).

Риск регрессий: нулевой (docs-only + audit pack; runtime не затронут).


## STEP320 — NotebookLM: короткий “жёсткий” аудит‑промпт (copy/paste)

Цель:
- Дать один компактный промпт, который можно **прямо вставить** в NotebookLM.
- Сохранить строгость: только факты из файлов, доказательства, repro, минимальные фиксы.

Изменения:
- Обновлён канонический файл промпта для NotebookLM пакета:
  - `docs/audit/notebooklm_pack/04_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`
- Синхронизирован “верхний” промпт (чтобы не было расхождений):
  - `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`

Docs:
- `docs/00_CURRENT_STATE.md` — обновлён STEP320 и ссылка на канонический prompt.
- `docs/process/07_WORK_HISTORY_2026_03.md` — добавлен STEP320.

QA:
- Открыть `docs/audit/notebooklm_pack/04_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` и убедиться, что он:
  - короткий (без простыней),
  - требует proof (path + фрагмент ≤25 слов + search‑phrase),
  - задаёт жёсткий формат отчёта и чек‑лист критичных зон.
- Проверить, что `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` идентичен каноническому.

Риск регрессий: нулевой (docs-only).


## STEP321 — Giveaways: стабилизация seed (order‑independent eligible ids)

Дата: 2026-03-05

Контекст:
- Детерминированность winners draw нарушалась, если `eligibleUserIds` приходили из БД в разном порядке.

Изменения:
- `src/bot/prng.js`: `makeSeed()` теперь сортирует копию `eligibleUserIds` перед `join()` → seed/eligibleHash зависят только от набора участников, а не от порядка выдачи.

QA:
- Запустить локально quick-check: два массива с одинаковыми id в разном порядке должны давать одинаковый `eligibleHash`/`seedHash`.
- Smoke: `/api/cron/giveaways-tick` (dry run/лог) — winners остаются воспроизводимыми.

Риск регрессий: нулевой/минимальный (изменение влияет только на seed hashing, без UI/DB).


## STEP322 — Payments fallback hardening: default‑off + HMAC payload signature

Дата: 2026-03-05

Цель:
- Убрать риск “auto-apply по payload без сессии” как дефолт.
- Добавить крипто‑гарантию, что payload “наш” (когда fallback включён).

Изменения:
- `src/lib/config.js`
  - `PAYMENTS_FALLBACK_APPLY_ENABLED` теперь **default=0** (строгий режим).
  - Добавлены ENV:
    - `PAYMENTS_PAYLOAD_HMAC_KEY`
    - `PAYMENTS_PAYLOAD_HMAC_LEN` (6..16, default 10)
    - `PAYMENTS_FALLBACK_ALLOW_UNSIGNED` (default 0)
- `src/bot/bot.js`
  - Новые Stars-инвойсы (PRO / Brand Pass / Brand Plan / Founder Sale) подписывают token: `tokenRaw + hmac(payloadNoSig)` (hex, длина по ENV).
  - Redis `pay_*` сессии сохраняются по **подписанному** token, чтобы match в `successful_payment` не ломался.
- `src/bot/payments_fallback.js`
  - При наличии `PAYMENTS_PAYLOAD_HMAC_KEY` fallback требует валидную подпись (иначе reject; legacy можно временно разрешить `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=1`).
  - Добавлен DB‑чек: payment row принадлежит payer + charge_id совпадает (money path → fail‑closed).
  - Явно запрещён fallback для `offpub_*` (manual/moderation).

Docs:
- `docs/00_CURRENT_STATE.md` — обновлены правила fallback + описаны новые ENV для подписи.

QA:
- `node --check src/bot/bot.js src/bot/payments_fallback.js src/lib/config.js`
- Инвойс создание:
  - купить PRO / Brand Pass / Brand Plan / Founder Sale → payload остаётся ASCII/≤128 и проходит `_isSafeInvoicePayload`.
  - `pay_*` ключ в Redis соответствует token из payload (подписанному).
- Fallback:
  - при `PAYMENTS_PAYLOAD_HMAC_KEY` и `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0`: неподписанный payload → `unsigned_payload` (не применяет).
  - подписанный payload → применяет, пишет note с `...:hmac`.
- По умолчанию (`PAYMENTS_FALLBACK_APPLY_ENABLED=0`) поведение прод‑безопасное: missing_session → ORPHANED, без авто‑выдачи.

Риск регрессий: низкий (меняет только invoice payload token и fallback путь; основной happy-path по Redis-сессии сохраняется).


## STEP323 — IG_TOKEN_ENC_KEY hardening: no weak-key fallback

Дата: 2026-03-05

Цель:
- Убрать небезопасный режим, когда `IG_TOKEN_ENC_KEY` мог быть “короткой строкой”, а ключ фактически получался через `sha256(строка)`.
- При неверной конфигурации — **жёстко блокировать IG OAuth**, но не ломать прод (пока UI скрыт).

Изменения:
- `src/lib/config.js`
  - Добавлен строгий парсинг `IG_TOKEN_ENC_KEY`: принимаем только `hex64` (32 bytes) или `base64/base64url` (>=32 bytes).
  - Введены поля: `IG_TOKEN_ENC_KEY_BYTES`, `IG_TOKEN_ENC_KEY_VALID`, `IG_TOKEN_ENC_KEY_KIND`, `IG_OAUTH_READY`.
  - `assertEnv()` больше не блокирует весь бот из‑за IG, пока UI/routes скрыты; fail-fast только при публичном включении (UI+routes).
- `src/lib/cryptoBox.js`
  - Убрана sha256‑деривация из “плохого ключа”. Теперь при невалидном ключе кидаем `IG_TOKEN_ENC_KEY_invalid`.
- `api/ig/oauth/*`
  - При невалидном `IG_TOKEN_ENC_KEY` отвечаем `503/500 misconfigured` и отправляем ops‑alert (dedup 6h).
- `src/bot/bot.js`
  - В UI-кнопке OAuth добавлено явное сообщение “misconfigured” (без DB-чтений) при невалидном ключе.

Docs:
- `docs/00_CURRENT_STATE.md` — уточнён строгий формат `IG_TOKEN_ENC_KEY`.

QA:
- `node --check src/lib/config.js src/lib/cryptoBox.js api/ig/oauth/start.js api/ig/oauth/callback.js api/ig/oauth/status.js api/ig/oauth/disconnect.js`
- (Если IG UI включён) открыть `/api/ig/oauth/start?...`:
  - при валидном ключе — 302 на Meta authorize
  - при невалидном — 503 + ops alert в SUPPORT/админам

Риск регрессий: низкий (IG сейчас скрыт; изменения затрагивают только IG oauth + крипто-бокс).

## 2026-03-05

### STEP324 — Ops digest for expensive silent-catch paths
- Добавлен `src/lib/opsDigest.js`: лёгкий Redis-only буфер для ops-событий без Telegram API (anti-spam dedup через NX key).
- `src/lib/qstash.js`: при ошибках `publishJSON` теперь пишем digest ops alert `qstash_publish_failed` (и пробрасываем ошибку дальше).
- `src/lib/redis.js`: при падении Lua `eval` в ключевых helper’ах пишем digest ops alert `redis_lua_failed`:
  - `consumeOnce` (atomic getdel→eval→GET+DEL fallback),
  - `releaseLock` (token-lock safety),
  - `rateLimit` (fallback=memory when Redis degraded),
  - `incrWithExpireOnFirst` (non-atomic fallback).
- `/api/qstash/official-publish-deliver`: если не удалось enqueue delayed retry при `locked`, пишем digest ops alert `qstash_reschedule_failed`.

Риск регрессий: **низкий** (код затрагивает только error paths; success-path и UX не меняются).

## STEP325 — Broadcast: per-recipient 429 skip + global burst detection

Дата: 2026-03-05

Цель:
- Убрать риск, когда один проблемный получатель держит рассылку в статусе `pending` бесконечно (вечные `deferred/quarantined` по 429).
- При этом не ломать защиту от глобального 429: cooldown нужен, но только если это реально burst по нескольким чатам.

Изменения:
- `api/qstash/broadcast-deliver.js`
  - 429 обработка теперь разделяет два сценария:
    - **per-recipient 429**: считаем повторные 429 на конкретного получателя (`BROADCAST_QUARANTINE_THRESHOLD`). Если достигли порога — помечаем доставку как `blocked` (non‑retryable), чтобы рассылка могла завершиться.
    - **global 429 burst**: считаем distinct получателей, получивших 429 за короткое окно (`BROADCAST_GLOBAL_429_WINDOW_SEC`). Если достигли `BROADCAST_GLOBAL_429_THRESHOLD` — ставим global cooldown через `setBroadcastCooldown()`.
  - Добавлены Redis ключи для distinct 429 users (`broadcast:<id>:429users`) с TTL.

ENV (опционально):
- `BROADCAST_GLOBAL_429_THRESHOLD` (default `6`) — сколько distinct 429 получателей за окно считаем «глобальным» лимитом.
- `BROADCAST_GLOBAL_429_WINDOW_SEC` (default `60`) — окно для distinct 429 получателей.

Docs:
- `docs/00_CURRENT_STATE.md` — добавлено описание STEP325 (anti‑stall для broadcast 429).

QA:
- `node --check api/qstash/broadcast-deliver.js`
- Смоук (ручной):
  - Запусти рассылку в режиме QStash fan‑out.
  - (Тестовый режим) Временно выставь `BROADCAST_QUARANTINE_THRESHOLD=2` и воспроизведи 429 на одном chat (например, ограниченный чат/частые отправки).
    - ожидаемо: запись `broadcast_sent_log` для этого user → `status='blocked'`, рассылка может перейти в `DONE` без вечного `deferred_wait`.
  - (Burst тест) Временно выставь `BROADCAST_GLOBAL_429_THRESHOLD=2` и добейся 429 на двух разных chat в пределах минуты.
    - ожидаемо: `setBroadcastCooldown` ставит `broadcast.cooldown_until`, а deliver jobs уходят в delayed retry.

Риск регрессий: низкий (меняется только 429 error-path; success-path рассылки не трогаем).


## STEP326 — Broadcast: hard skip list for dead chats + admin report

Дата: 2026-03-05

Цель:
- Не тратить QStash/Telegram попытки на заведомо «мёртвые» чаты (bot blocked / chat not found / user deactivated).
- Дать в админке отчёт «кого и почему пропустили» (по конкретной рассылке).

Изменения:
- `src/bot/cron.js`
  - Добавлен Redis-only hard-skip список по `tg_id` с TTL (`BROADCAST_HARD_SKIP_TTL_DAYS`, default 90).
  - При enqueue (QStash fan-out) и при legacy direct-send: получатели из hard-skip **не отправляются**, вместо этого сразу логируются как `blocked` с `last_error=hard_skip:<reason>`.
  - При permanent Telegram errors (по desc: blocked/chat not found/deactivated) — автоматически добавляем `tg_id` в hard-skip.
- `api/qstash/broadcast-deliver.js`
  - Перед claim/send проверяем hard-skip; если есть — логируем `blocked` и завершаем job `200 OK`.
  - При non-retryable Telegram errors — добавляем `tg_id` в hard-skip (только для известных permanent причин).
- `src/db/queries.js`
  - `logBroadcastBlocked()` (upsert) — терминальная фиксация blocked c `non_retryable=true` и `last_error`.
  - `countBroadcastDeliveryStats()` теперь возвращает `hard_skipped` (subset blocked, `last_error like 'hard_skip:%'`).
  - `listBroadcastBlockedDeliveries()` — список blocked получателей для админ-отчёта.
- `src/bot/bot.js`
  - В карточке рассылки показываем `blocked` и `hard-skip` счётчики.
  - Добавлена кнопка `🧱 Пропуски/ошибки` → экран отчёта по blocked/hard-skip (пагинация + табы).

ENV:
- `BROADCAST_HARD_SKIP_TTL_DAYS` (default `90`) — сколько дней держим hard-skip запись по tg_id.

QA:
- `node --check src/bot/cron.js api/qstash/broadcast-deliver.js src/bot/bot.js src/db/queries.js`
- Ручной smoke:
  - На активной рассылке зайти в `Админка → Операции → 📣 Рассылка → #id` и открыть `🧱 Пропуски/ошибки`.
  - Имитировать permanent ошибку (заблокированный чат) и убедиться:
    - запись в `broadcast_sent_log` становится `blocked` с `last_error` (а для hard-skip: `hard_skip:<reason>`),
    - последующие рассылки для этого tg_id пропускают отправку и сразу логируют `hard_skip:*` без попытки Telegram send.

Риск регрессий: низкий (изменения только в broadcast error-path + admin-экраны; success-path рассылки не трогаем).



## STEP331 — Giveaways: results auto-publish idempotency (reserve-before-send)

Дата: 2026-03-05

Контекст:
- Auto publish результатов (cron `autoPublishDrawn`) мог отправить новый пост в канал, а затем упасть на DB commit → следующий тик мог отправить ещё один (дубли), особенно когда edit оригинального анонса невозможен и используется send.

Цель:
- Сделать auto-publish результатов идемпотентным: **сначала** DB-claim, потом TG edit/send, потом DB-finalize. При падении после TG — повторные тики не отправляют снова, а только завершают commit.

Изменения:
- `src/db/queries.js`
  - `listDrawnGiveawaysToPublish`: берём и claimed записи (`results_message_id=0`) для recovery.
  - `atomicClaimGiveawayResultsPublishing`: claim `results_message_id=0` только если ещё `WINNERS_DRAWN` и `results_message_id IS NULL`.
  - `atomicReleaseGiveawayResultsClaim`: release claim обратно в NULL, если send не удалось.
  - `atomicFinalizeGiveawayResultsPublish`: finalize только если claim удержан (`results_message_id=0`).
- `src/bot/cron.js`
  - `autoPublishDrawn`: reserve-before-send + Redis breadcrumb `gw:results:sent:<gwId>` (TTL 7 дней).
  - Recovery: если `results_message_id=0`, сначала пытаемся finalize по breadcrumb; если breadcrumb нет — делаем безопасный edit оригинального анонса (без нового send).

ENV:
- нет

QA:
- `npm run preflight`
- Ручной smoke (по возможности):
  1) Завести розыгрыш с `auto_publish=true`, довести до `WINNERS_DRAWN`.
  2) Дождаться крона: результаты публикуются (edit или send).
  3) При временных DB сбоях: повторные тики не должны создавать дубли, а должны дожимать finalize.

Риск регрессий: низкий (cron-only path; UI/монетизация не меняются).

## STEP330 — Giveaways: publish idempotency (reserve → send → commit)

Дата: 2026-03-05

Контекст:
- `a:gw_publish` раньше делал create→send→update. Если функция умирала после `send*` (или падал DB update), повтор мог создать дубль или оставить запись в `DRAFT`.

Цель:
- Сделать публикацию идемпотентной: повторный клик не отправляет второй пост, а **дожимает** фиксацию в DB.

Изменения:
- `src/bot/bot.js`
  - Token-lock `lock:gw_publish:<wsId>:<tgId>` (30s) против двойных кликов.
  - В черновик пишем `draft.gw_id` при первом create → все ретраи используют один giveaway.
  - Перед отправкой ставим `status='PUBLISHING'`.
  - После успешного отправления в канал пишем Redis breadcrumb `gw:publish:sent:<gwId>` = `{ chat_id, message_id }` с TTL 7 дней.
  - Если DB commit упал после отправки — показываем кнопку «📣 Опубликовать ещё раз». Повторная попытка увидит breadcrumb и завершит DB update + audit **без** повторного отправления в канал.

ENV:
- нет

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) Нажать «📣 Опубликовать» дважды быстро → второй клик должен ответить «⏳ Уже публикуется…», в канал уходит **один** пост.
  2) Если поймал сообщение «Пост отправлен, но не сохранён. Нажми ещё раз.» → нажать «📣 Опубликовать ещё раз»:
     - ожидаемо: второй пост **не** отправляется,
     - giveaway открывается как опубликованный.

Риск регрессий: низкий (меняется только publish-path розыгрышей; success-path участника/проверок не трогаем).

## STEP327 — Anti-bypass: offer title redaction (monetization safety)

Дата: 2026-03-05

Контекст:
- До unlock (Brand Pass) контакты должны быть скрыты. Раньше редактировалось только `description`, но контакт мог утечь через `title` (например, `@username` или ссылка в заголовке).

Цель:
- Закрыть утечку контактов через заголовок оффера в публичной карточке и ленте, без DB-reads в hot UI.

Изменения:
- `src/bot/bot.js`
  - `renderBxPublicView`: для non-owner до unlock прогоняем `o.title` через `redactContactsInText` (аналогично `description`).
  - `renderBxFeed`: заголовок в ленте креаторов всегда проходит через `redactContactsInText` (feed не знает unlock per-offer и не должен показывать контакты в title вообще).
  - `offerShareUrl`: share-text также редактирует title через `redactContactsInText`, чтобы контакты не утекали через share-url.
- `docs/00_CURRENT_STATE.md`
  - Добавлен STEP327 в шапку и уточнено, что анти-bypass применяется к title+description.

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) Создай оффер с `@username` / ссылкой / email в **title** и любой description.
  2) Открой этот оффер в brand-mode **до unlock**:
     - ожидаемо: в карточке и в ленте заголовок показывает «🔒 … скрыто»/маскировку, контактов нет.
  3) Сделай unlock (Brand Pass) и открой карточку снова:
     - ожидаемо: title в карточке показывается как есть (контакты допустимы после unlock), контакты отображаются по правилам unlock.
  4) Нажми “поделиться”/share:
     - ожидаемо: share-text не содержит контактов, даже если они были в title.

Риск регрессий: низкий (только отображение текста; success-path и монетизация не меняются).

## STEP333 — Neon cost: cached workspaces list in `ensureWorkspaceForOwner` and «📣 Мои каналы»

Дата: 2026-03-05

Контекст:
- В проекте уже есть `listWorkspacesCached()` (TTL 5 мин) для Menu/Home hot path (Neon-saving), но ряд частых переходов всё ещё делал прямой `db.listWorkspaces()`.

Цель:
- Убрать лишние DB‑reads в частых UI переходах, без изменения бизнес-логики и без риска деградации при Redis down.

Изменения:
- `src/bot/bot.js`
  - `ensureWorkspaceForOwner`: используем `listWorkspacesCached(ownerUserId)`.
  - Safety: если кеш вернул пустой список — один раз перепроверяем `db.listWorkspaces()` (чтобы избежать stale‑empty UX gate при частичных сбоях/неуспешной инвалидации).
  - `renderWsList` («📣 Мои каналы»): аналогично — кеш + DB double-check на пустом результате.
- `docs/00_CURRENT_STATE.md`
  - Добавлен STEP333 (Neon cost hardening) и уточнён пункт про hot UI кеш workspaces.

ENV:
- нет

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) Открыть `📋 Меню` → «📣 Мои каналы» → убедиться, что список рендерится.
  2) Подключить новый канал через `🚀 Подключить канал` → открыть «📣 Мои каналы» и убедиться, что канал появился (инвалидация кеша срабатывает).

Риск регрессий: низкий (read-only path + best-effort кеш; при Redis degraded всё работает по DB‑truth).

## STEP334 — Neon cost: cache Barter feed COUNT(*) per filter (Redis, TTL 60s)

Дата: 2026-03-05

Контекст:
- `renderBxFeed` делал `db.countNetworkBarterOffers()` на каждый рендер страницы (включая пагинацию). По мере роста таблицы это начинает ощутимо жечь Neon CU.

Цель:
- Сохранить текущий UX (точная пагинация по total), но убрать повторяющиеся COUNT(*) запросы на каждом переходе страниц.

Изменения:
- `src/bot/bot.js`
  - Добавлен best‑effort Redis cache для total count в ленте:
    - ключ: `cache:bx:feed_count:<sha1>` (sha1 от нормализованных фильтров)
    - TTL: 60 секунд (`BX_FEED_COUNT_CACHE_TTL_SEC`)
  - `renderBxFeed`: total берём через `countNetworkBarterOffersCached(filter)`.
  - При Redis degraded/ошибках кеша: fail‑open — считаем через DB-truth как раньше.
- `docs/00_CURRENT_STATE.md`
  - Добавлен STEP334 в шапку и уточнено, что COUNT(*) в bx_feed кешируется (Neon-saving).

ENV:
- нет

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) Открыть «📰 Лента креаторов» с дефолтными фильтрами.
  2) Переходить страницами (⬅️/➡️) — навигация работает как раньше.
  3) Поменять фильтр → пагинация пересчитывается (другой cache key).
  4) (Опционально) при Redis degraded: лента всё равно открывается (fallback на DB).

Риск регрессий: низкий (best-effort кеш; DB-truth fallback; бизнес-логика не меняется).

## STEP335 — Infra: namespace brand_apply rate-limit Redis keys

Дата: 2026-03-05

Контекст:
- В `sendBrandApplyDraft()` rate-limit ключи (`brand_apply:*`, `brand_apply_ws:*`) были “сырыми” строками и обходили общий namespace через `k([...])`.
- Если окружения (prod/preview) когда-то делят один Redis — возможны коллизии лимитов и неочевидные блокировки.

Цель:
- Привести rate-limit ключи к единому неймспейсу проекта (`mg:<APP_ENV>:...`), без изменения логики/лимитов.

Изменения:
- `src/bot/bot.js`
  - `rlPairKey` → `k(['rl','brand_apply', userId, brandUserId])`
  - `rlWsKey` → `k(['rl','brand_apply_ws', wsId, brandUserId])`
- `docs/00_CURRENT_STATE.md`
  - Добавлен STEP335 в шапку.

ENV:
- нет

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) От креатора открыть карточку бренда → «📝 Оставить заявку» → написать текст → «✅ Отправить».
  2) Повторить отправку 4 раза подряд → должен сработать лимит “3 заявки / 6 часов” (как раньше).
  3) Для одного и того же канала (`wsId`) повторить много раз → лимит “5 / 6 часов” (как раньше).

Риск регрессий: низкий (меняются только ключи Redis, лимиты/UX прежние).

## STEP336 — Admin: manage Broadcast hard-skip list (browse recent + unskip)

Дата: 2026-03-05

Контекст:
- STEP326 добавил hard-skip список “мёртвых” чатов (Redis-only, per tg_id) + отчёт внутри конкретной рассылки.
- Нужно управлять этим списком как оператор: быстро проверить tg_id и снять hard-skip, если пользователь “ожил” или ошибка была ложной.

Цель:
- Добавить в админке (Admin → System) простой control-plane:
  - посмотреть последние hard-skip записи,
  - найти запись по tg_id,
  - снять hard-skip одной кнопкой.
- Без SCAN/KEYS (serverless/Upstash-safe) и без DB-запросов.

Изменения:
- `src/bot/cron.js`
  - `setBroadcastHardSkip()` теперь дополнительно пишет запись в Redis list `mg:<env>:broadcast:hard_skip:recent` (LPUSH+LTRIM, max 1000, TTL такой же как у hard-skip).
  - Это даёт “recent index” для админского просмотра без тяжёлых операций по Redis.
- `src/bot/bot.js`
  - Admin → System: добавлена кнопка `🧱 Hard-skip (dead chats)`.
  - Экран `a:hs_home`: показывает recent list (страницы) + быстрые кнопки `tg:<id>`.
  - `a:hs_find`: ввод tg_id через expectText → переход в `a:hs_view`.
  - `a:hs_view`: показывает статус hard-skip + reason + TTL.
  - `a:hs_unskip`: удаляет key hard-skip (Redis DEL) и возвращает в карточку.
- `src/bot/actionRegistry.js`
  - Добавлены новые action keys: `a:hs_home`, `a:hs_find`, `a:hs_view`, `a:hs_unskip`.
- `docs/00_CURRENT_STATE.md`
  - Добавлен STEP336 в шапку.

ENV:
- нет

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) Админка → Система → `🧱 Hard-skip (dead chats)` → открыть список (стр.1).
  2) Нажать `🔎 Найти TG ID` → ввести tg_id → убедиться, что виден статус.
  3) Если статус hard-skip активен → нажать `🧹 Снять hard-skip` → статус становится “нет hard-skip”.
  4) (Опционально) Запустить рассылку/доставку на tg_id: убеждаемся, что после unskip он больше не пропускается по hard-skip.

Риск регрессий: низкий (только админская часть + best-effort индекс; core broadcast/send логика не меняется).


## STEP337 — Payments ops: runtime TTL control for fallback apply

Дата: 2026-03-05

Контекст:
- `PAYMENTS_FALLBACK_APPLY_ENABLED` по умолчанию должен быть `0` (строгий режим), но иногда при инцидентах нужно временно включить fallback apply (без redeploy).
- Требование: управлять через админку, Redis-only, с TTL и без DB.

Цель:
- Добавить runtime override: включать/выключать fallback apply на время (2h/12h/24h) из админки.
- Эффективное состояние: `ENV OR runtime`.
- Использовать в bot + cron + admin auto-heal, чтобы поведение было единым.

Изменения:
- `src/lib/paymentsOps.js`
  - Добавлен Redis TTL flag `mg:<env>:sys:pay_fallback_apply` (object + EX).
  - Экспорт: `isPaymentsFallbackApplyEnabled()`, `getPaymentsFallbackApplyState()`, `setPaymentsFallbackRuntime()`.
- `src/bot/bot.js`
  - `Admin → System`: добавлена строка статуса и кнопка `🧯 Fallback: ON/OFF`.
  - Новый экран `🧯 Payments fallback apply` с кнопками включения на TTL и отключения.
  - Все проверки `CFG.PAYMENTS_FALLBACK_APPLY_ENABLED` в money paths заменены на effective (`env OR runtime`).
  - Admin auto-heal теперь доступен при runtime enable (без ENV=1).
- `src/bot/cron.js`
  - `autoHealOrphanedPayments` теперь запускается, если effective fallback apply включен (env OR runtime).
- `docs/00_CURRENT_STATE.md`
  - Добавлено описание runtime override из админки.

ENV:
- нет (runtime хранится в Redis)

QA:
- `node --check src/bot/bot.js`
- Ручной smoke:
  1) Админка → Система → `🧯 Fallback: OFF` → открыть экран → включить на 2h.
  2) Вернуться в `⚙️ Система` → статус должен стать `ON (runtime)`.
  3) Нажать `Disable` → статус возвращается в `OFF`.
  4) (Опционально) На тестовом платеже с истекшей `pay_*` сессией убедиться, что fallback применяется только когда runtime включён.

Риск регрессий: низкий (меняется только gating на effective flag + админский control-plane; DB-truth пути не меняются).


## STEP338 — Payments ops: observability for unsigned/invalid payload (digest + /api/health)

Дата: 2026-03-05

Контекст:
- После STEP322 payload подписывается HMAC (опционально), а fallback может отклонять неподписанные/невалидные payload.
- Нужно видеть это в режиме оператора: сколько таких случаев, и понимать, это “старые инвойсы” или потенциальная атака/мисконфиг.

Цель:
- Добавить Redis-only счётчики по проблемам подписи payload.
- Добавить ops-digest для потенциально опасных кейсов (bad_sig/hmac_error/bad_format).
- Вывести всё в `/api/health` (без DB).

Изменения:
- `src/lib/paymentsOps.js`
  - Добавлены счётчики `mg:<env>:ops:payments:payload:<bucket>:d:<YYYYMMDD>` с TTL 14 дней.
  - Экспорт: `recordPaymentsPayloadIssue()` + `getPaymentsPayloadIssueCounts()`.
- `src/bot/payments_fallback.js`
  - При reject по подписи/формату payload пишет `recordPaymentsPayloadIssue()` (best-effort).
  - Если разрешены unsigned legacy payload — тоже пишет в счётчик (без спама).
- `api/health.js`
  - Добавлено: `payments.fallback_apply_runtime_*` + `payments.fallback_apply_effective`.
  - Добавлено: `payments.payload_issues_today` (unsigned/bad_sig/bad_format/hmac_error/other).
- `docs/00_CURRENT_STATE.md`
  - Описана observability секция.

ENV:
- нет

QA:
- `node --check api/health.js`
- `node --check src/bot/payments_fallback.js`
- Ручной smoke:
  1) Если `PAYMENTS_PAYLOAD_HMAC_KEY` задан и `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0`: подать в fallback неподписанный payload → он отклоняется, а `/api/health` увеличивает `payments.payload_issues_today.unsigned`.
  2) Подать payload с неверной подписью → увеличивается `bad_sig`, и появляется событие в ops-digest.

Риск регрессий: низкий (только best-effort метрики/алерты; money-path остаётся fail-closed).

## STEP339 — Ops digest: расширение на “дорогие” падения (PG/cron_router/QStash)

Цель: убрать “тихие” провалы в местах, где оператору важно видеть причину (без спама, Redis-only буфер, отправка дайджестом).

Что сделано
- `api/cron_router.js`: при падении роутера крона — пишем событие в ops digest (`cron_router_failed`, dedup по job).
- `src/db/pool.js`: при `statement_timeout` и при `pool.on('error')` — пишем в ops digest (`pg_statement_timeout`, `pg_pool_error`).
  Также алертим, если не удалось установить `statement_timeout` на соединении (`pg_stmt_timeout_init_failed`).
- `api/qstash/broadcast-deliver.js`: в top-level catch добавлен ops digest (`qstash_bc_deliver_failed`, dedup по broadcastId).

QA
- Принудительно вызвать ошибку в cron (невалидный job / throw внутри tick) → /api/health показывает рост ops.pending, а cron tick отправляет дайджест в OPS.
- Смоделировать `statement_timeout` (уменьшить PG_STATEMENT_TIMEOUT_MS и выполнить тяжёлый запрос в админке) → появляется digest `pg_statement_timeout`.
- Смоделировать crash в broadcast-deliver (искусственно бросить exception) → digest `qstash_bc_deliver_failed` появляется и дедупится.

## STEP340 — /api/health: operator-friendly (Redis-only) + hard-skip counters

Цель: сделать health более “операторским”, без DB и без риска падений, чтобы быстрее понимать: что происходит с ops digest, broadcast cooldown и hard-skip.

Что сделано
- `/api/health`:
  - добавлены `ops.last_sent_at`, `ops.targets_count`, `ops.top_reasons` (sample), `ops.window_sec`.
  - добавлен блок `broadcast.hard_skip` (TTL, recent_len, counters: set/hit/unskip for today).
- Broadcast hard-skip counters (Redis-only):
  - `setBroadcastHardSkip()` инкрементит `broadcast:hard_skip:set:d:<day>`.
  - при пропуске доставки из hard-skip инкрементим `broadcast:hard_skip:hit:d:<day>` (cron + qstash worker).
  - при снятии hard-skip из админки инкрементим `broadcast:hard_skip:unskip:d:<day>`.

QA
- `GET /api/health` → видны новые поля `ops.*` и `broadcast.hard_skip.*`.
- Сделать hard-skip (blocked/chat not found/deactivated) → растёт `broadcast.hard_skip.counters.set`.
- Запустить рассылку на hard-skip tg_id → растёт `broadcast.hard_skip.counters.hit`.
- Снять hard-skip из админки → растёт `broadcast.hard_skip.counters.unskip`.


## STEP341 — Giveaway winners reproducibility pack (audit metadata)

Дата: 2026-03-05

Цель: чтобы любой розыгрыш можно было воспроизвести/проверить “на бумаге” без догадок.

Что сделано
- Добавлен единый набор версий/лейблов (`src/lib/gwRepro.js`) для audit payload:
  - `algo_version`, `seed_version`
  - методы хеширования `pool_hash_method`, `winners_hash_method`
- Auto-draw (SQL tx) `drawAndFinalizeGiveawayWinnersAtomic`:
  - в `gw.winners_drawn` добавлены `algo_version`, `seed_version`, `ends_at_iso_used`
  - добавлены `pool_hash` (и отдельно `eligible_pool_hash`, `entries_pool_hash`) + counts
  - добавлен `winners_hash` (place-order)
  - для `gw.winners_drawn_skipped` (no_entries) тоже пишем версии/ends_at_iso_used
- Manual draw (JS PRNG) `a:gw_draw_do`:
  - в `gw.winners_drawn` добавлены `algo_version`, `seed_version`, `ends_at_iso_used`
  - добавлены `pool_hash` + `winners_hash` (sha256)

Важно
- Никаких миграций: всё хранится в `giveaway_audit.payload`.
- Никаких новых DB-reads в hot UI путях (изменения только в draw path).

QA
1) Авто-розыгрыш (cron): довести giveaway до `ENDED` с `auto_draw=true` → после draw в `giveaway_audit` для action=`gw.winners_drawn` должны появиться поля:
   - `algo_version`, `seed_version`, `ends_at_iso_used`, `pool_hash`, `winners_hash`.
2) Ручной draw (кнопка): тот же набор полей появляется в audit.
3) Повторный draw не создаёт второй `gw.winners_drawn` (idempotency сохраняется).

## STEP342 — Prod ENV baseline + payments ops semantics (docs)

- Added `docs/92_PROD_ENV_BASELINE.md` (recommended prod env checklist, no secrets)
- Updated `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` with production baseline values + semantics (ENV vs runtime)
- Updated `docs/00_CURRENT_STATE.md` with payments fallback ops control semantics
- No code changes.

QA:
- Open `/api/health` and confirm payments fallback shows `fallback_apply_effective=false` when `PAYMENTS_FALLBACK_APPLY_ENABLED=0`.
- Toggle fallback in admin for 2h and confirm `/api/health` shows `fallback_apply_runtime_enabled=true` and `fallback_apply_effective=true`.

## STEP343 — Prod docs pack (deploy checklist)

- Added `docs/93_PROD_DEPLOY_CHECKLIST.md` (operator checklist: /api/health + admin runtime controls)
- Updated `docs/README.md` (Production section)
- Updated `docs/91_PROD_LAUNCH_30MIN.md` (links to env baseline + deploy checklist)
- Updated `docs/15_NEW_CHAT_HANDOFF.md` (include prod docs section)

QA:
- Follow `docs/93_PROD_DEPLOY_CHECKLIST.md` and confirm /api/health + admin checks.
## STEP344 — Portable paths gate + Neon history filename fix (docs-only)

Дата: 2026-03-05

Проблема:
- Один файл в `docs/neon` имел не-UTF8/битый заголовок внутри ZIP и из-за этого FULL ZIP мог не распаковываться (“File name too long”, особенно на Windows).

Что сделано:
- Переименован исторический файл в ASCII: `docs/neon/NEON_HISTORY_RAW.txt`
- Обновлён `docs/neon/README.md`
- Добавлен `scripts/lint-portable-paths.js` и подключён в `npm run preflight` как gate `lint:portable-paths`
- Обновлён `docs/00_CURRENT_STATE.md` (ops note про ZIP/Windows-safe)

QA:
1) `npm run preflight` проходит (включая portable-paths gate).
2) FULL ZIP распаковывается на Windows (без “File name too long”).

## STEP345 — Payments fallback exactly-once (atomic tx)

Дата: 2026-03-05

Проблема:
- Fallback apply (когда истекла `pay_*` сессия) выполнял: DB-check → apply сайд‑эффектов → `markPaymentApplied()`.
- В serverless (ретраи Telegram / параллельный раннер) возможна гонка: двойное начисление или “частично применили → упали → применили ещё раз”.

Что сделано:
- `src/bot/payments_fallback.js`: fallback apply переведён на **одну** DB‑транзакцию:
  - `SELECT payments ... FOR UPDATE NOWAIT` (если строка занята — `reason=locked`, без ожидания).
  - строгая валидация: `user_id`, `telegram_payment_charge_id` (если передан), и `invoice_payload` (нормализованно, с учётом подписи).
  - apply сайд‑эффектов (credits/plan/PRO) выполняется **внутри** tx.
  - `status='APPLIED'` выставляется **в том же tx** (note сохраняется).
- Для PRO добавлен безопасный upsert в `workspace_settings` (на случай отсутствующей строки).
- `docs/00_CURRENT_STATE.md`: отражена атомарность fallback apply.

QA:
1) Два параллельных вызова fallback по одному `paymentId` → один применяет, второй возвращает `locked`, double‑apply нет.
2) Несовпадение `invoice_payload` или charge id → `payload_mismatch` / `charge_id_mismatch`, ничего не применено.
3) PRO fallback: без ownership на workspace → `no_ws_access`.
4) Brand topup / plan / founder: сумма должна совпасть с каталогом (amount_mismatch → fail‑closed).


## STEP346 — Giveaways winners draw: REPEATABLE READ snapshot + audit cutoff

Дата: 2026-03-05

Проблема:
- В `READ COMMITTED` внутри draw‑транзакции пул `giveaway_entries` мог измениться между выборкой победителей и вычислением метрик воспроизводимости (pool hash/count).
- Это ухудшает “аудитопригодность”: победители остаются детерминированными, но метаданные пула могут выглядеть как будто “не совпали”.

Что сделано:
- `src/db/queries.js`: `drawAndFinalizeGiveawayWinnersAtomic()` теперь стартует транзакцию как `BEGIN ISOLATION LEVEL REPEATABLE READ` → весь draw видит **один** snapshot.
- В audit payload (`gw.winners_drawn` и `gw.winners_drawn_skipped`) добавлены: `tx_isolation` и `snapshot_ts` (UTC).
- `computePoolHash()` расширен: добавлен `max(joined_at)` (UTC ISO). В audit добавлены `pool_cutoff_joined_at`, `eligible_max_joined_at`, `entries_max_joined_at`.

QA:
1) Во время draw добавить entry/поменять eligibility (параллельным действием) → победители и pool‑метаданные остаются согласованными (один snapshot).
2) Повторный draw: возвращается `already_drawn` или `locked`, дублей нет.


## STEP347 — /api/health redis probe + баннер в админке (ops)

Дата: 2026-03-05

Проблема:
- При деградации/отключении Redis админ видел «странности» (тумблеры/кеши/троттлы), но было трудно понять причину быстро.
- `a:admin_ops` был `REQUIRE_REDIS`, что делало диагностику хуже именно в момент деградации.

Что сделано:
- `api/health.js`: добавлен блок `redis` (configured/read_ok/write_ok/latency_ms/last_error) через лёгкий probe `SET+GET` (TTL 60s), endpoint остаётся fail-open.
- `src/bot/actionRegistry.js`: `a:admin_ops` переведён в guard `NONE`.
- `src/bot/bot.js`: экран «🧰 Админка → Операции» показывает баннер статуса Redis (OK/degraded/not configured) и (если есть `PUBLIC_BASE_URL`) добавляет кнопку `🩺 /api/health`.

Риск регрессий:
- Низкий: изменения затрагивают только ops-диагностику. Все probe операции — best-effort и не блокируют UI.

QA:
1) При нормальном Redis — баннер «Redis OK».
2) При неверном токене Redis — баннер «Redis degraded», `/api/health` отдаёт `redis.write_ok=false`.
3) При отсутствии Redis env — `/api/health` показывает `not_configured`, админка показывает «Redis не настроен».


## STEP348 — Broadcast deliver load-shedding при деградации DB (429 + Retry-After)

Дата: 2026-03-05

Проблема:
- При проблемах Neon/DB (таймауты/коннекты/лимиты) `/api/qstash/broadcast-deliver` падал 500 и QStash мог быстро ретраить, создавая «шторм» и ещё сильнее нагружая DB.

Что сделано:
- `api/qstash/broadcast-deliver.js`: добавлен детектор `isDbOverloadError()` (сетевые ошибки + типовые PG коды/сообщения).
- На DB overload мы отвечаем `HTTP 429` и выставляем `Retry-After` + `Upstash-Retry-After` (в секундах), чтобы QStash корректно бэк‑оффился.
- Добавлен ops-digest breadcrumb `broadcast_db_overload` (Redis-only, dedup per broadcast), чтобы видеть проблему в алертах без спама.
- Критичные DB-reads (`getBroadcast`, `claimBroadcastDelivery`) теперь обёрнуты: при overload — 429 вместо crash.

Риск регрессий:
- Низкий/средний: логика трогает только QStash delivery endpoint. При нормальной DB поведение не меняется.

QA:
1) Смоделировать DB outage (невалидный DATABASE_URL на preview): endpoint возвращает 429 и `Retry-After`.
2) При восстановлении DB — рассылка продолжает доставку.
3) Нет дублей: мы не делаем self-republish на DB overload, а полагаемся на retry policy QStash.

---

## STEP349 — Ops polish: expose broadcast DB overload metrics in /api/health + Admin→Ops

Что сделано:
- В `api/qstash/broadcast-deliver.js` при DB overload (load‑shedding) записываем Redis‑метрики: счётчик за день и `last_at/last_where`.
- В `/api/health` добавлен блок `broadcast.db_overload` (Redis-only): `today_count`, `last_at`, `last_where`.
- В «🧰 Админка → Операции» добавлен баннер “Broadcast: DB overload” рядом со статусом Redis (best-effort).

Риск регрессий:
- Низкий: изменения затрагивают только qstash endpoint (degraded path) и ops‑экраны/health (read-only).

QA:
1) На preview с неверным `DATABASE_URL` дернуть `api/qstash/broadcast-deliver` с валидным payload → получаем 429 + Retry‑After.
2) Открыть `/api/health` → увидеть `broadcast.db_overload.today_count >= 1` и `last_at`.
3) Открыть «🧰 Админка → Операции» → увидеть баннер “Broadcast: DB overload”.


## STEP350 — Fix: свободный ответ в SUPPORT-группе (adm_support_reply) не должен падать в главное меню

Дата: 2026-03-05

Проблема:
- В SUPPORT-группе «✍️ Ответить» запускал сессию, но свободный текст часто не доходил до пользователя:
  - админ отвечал reply на сам тикет (а не на подсказку) → сессия не матчилась,
  - в forum-группах подсказка могла отправиться не в тот топик,
  - при любом “неправильном” сообщении бот падал в дефолтный путь и постил «главное меню» в группу.

Что сделано:
- `src/bot/bot.js`:
  - при старте `a:adm_support_reply` сохраняем `originMsgId` (id тикета) и `threadId` (topic id),
  - подсказка отправляется в тот же topic (`message_thread_id`) при наличии,
  - в обработчике текста принимаем reply <b>и на тикет</b>, и на подсказку (`promptMsgId`),
  - если сессия активна, но сообщение не reply на нужное — показываем короткую подсказку и не постим «главное меню».

Риск регрессий:
- Низкий: изменения касаются только support-группы и только для супер-админов при активной reply-сессии.

QA:
1) В SUPPORT-группе открыть тикет → нажать «✍️ Ответить» → сделать Reply прямо на тикет и отправить текст → пользователь получает DM «Ответ поддержки», в группе приходит подтверждение.
2) В forum/supergroup с топиками: тикет в topic → «✍️ Ответить» → подсказка появляется в том же topic; reply на тикет работает.
3) При активной сессии отправить обычное сообщение <i>без Reply</i> → бот выдаёт подсказку (не меню) и предлагает «❌ Отмена».
## STEP351 — RateLimit: in-memory fallback + circuit breaker при деградации Redis (anti-Neon-exhaust)

Дата: 2026-03-05

Проблема:
- Ранее `rateLimit()` при падении Redis/Lua `EVAL` работал в режиме unlimited **fail-open**.
- Это безопасно с точки зрения TTL (не создаём “вечные” ключи), но опасно по нагрузке: при Redis outage спам/шторм может ударить в Neon (connection exhaustion / CU burn).

Что сделано:
- `src/lib/redis.js`:
  - добавлен короткий circuit‑breaker: если Redis rateLimit EVAL падает, на `RATE_LIMIT_FALLBACK_DEGRADED_MS` пропускаем попытки EVAL и используем fallback,
  - fallback — best‑effort **in‑memory limiter** (bounded LRU-ish Map), только на деградации Redis,
  - по‑прежнему **не используем** non‑atomic `INCR+EXPIRE` fallback (не создаём ключи без TTL).

ENV (опционально):
- `RATE_LIMIT_FALLBACK_DEGRADED_MS` (default 10000)
- `RATE_LIMIT_FALLBACK_MAX_KEYS` (default 2000)

Риск регрессий:
- Низкий: изменения активируются только при Redis деградации; в нормальном режиме всё работает как раньше.

QA:
1) Нормальный Redis: rateLimit ограничивает как раньше.
2) Эмулировать Redis EVAL error (невалидный UPSTASH токен / отключить Redis): первые вызовы логируют `redis_lua_failed`, дальше в течение окна деградации rateLimit обслуживается из памяти.
3) Убедиться, что при деградации Redis нет unlimited fail-open: после превышения `limit` получаем `allowed=false` (best-effort, per-warm-instance).

## STEP352 — Ops visibility: QStash reschedule failures + OFFICIAL publish stuck (health + admin banners)

Дата: 2026-03-05

Проблема:
- `qstashPublishJSON()` при enqueue delayed retry может падать (например, из-за неверного токена/сетевых ошибок). Ранее это было видно только в digest (и не всегда), а в `/api/health` и Admin→Ops это не отражалось.
- “OFFICIAL publish stuck” (self-heal в `/api/qstash/official-publish-verify`) может происходить, но оператору нужен быстрый сигнал в health/admin.

Что сделано:
- `api/qstash/official-publish-deliver.js`:
  - при `qstash_reschedule_failed` добавлены Redis-only счётчики/last_* (`ops:reasons:qstash_reschedule_failed:*`).
- `api/qstash/official-publish-verify.js`:
  - если reschedule verify-ретрая не удалось — пишем те же метрики + `queueOpsDigestSafe(reason=qstash_reschedule_failed)`.
  - при self-heal “publish stuck” пишем Redis-only метрики `ops:reasons:official_publish_stuck:*` (last_offer_id, last_age_sec, last_via).
- `api/health.js`:
  - добавлен блок `qstash.*` (breadcrumbs deliver/verify + `reschedule_failed` + `official_publish_stuck`).
- `src/bot/bot.js`:
  - Admin→Ops теперь показывает баннеры для `QStash: reschedule failed` и `OFFICIAL: publish stuck`.
  - заодно исправлен баг области видимости (`redis/k`), из-за которого Admin→Ops мог падать в общий catch и всегда писать “probe failed”.

Риск регрессий:
- Низкий: изменения Redis-only, `/api/health` по-прежнему без DB чтений, логика публикации не менялась.

QA:
1) Открыть «🧰 Админка → Операции» — экран должен грузиться и показывать реальный статус Redis (не “probe failed”).
2) Открыть `/api/health` — в JSON есть блок `qstash.reschedule_failed` и `qstash.official_publish_stuck`.
3) (Preview) Поставить неверный `UPSTASH_QSTASH_TOKEN`, инициировать OFFICIAL publish (или verify retry) → `/api/health.qstash.reschedule_failed.today_count` растёт; в Admin→Ops появляется баннер.
4) Если был случай stuck: после self-heal `/api/health.qstash.official_publish_stuck.*` заполнен (offer_id/age/via) и баннер виден в Admin→Ops.

## STEP353 — Contacts unlock: no-charge when contact pack empty (anti “sell air”)

Дата: 2026-03-05

Проблема:
- Разлок контактов мог списать кредиты Brand Pass, даже если у креатора реально нет контактов/ссылок (например, портфолио-массив содержит пустые строки, или профиль был очищен после того, как бренд открыл экран).
- Это создаёт риск жалоб (“списали, а контактов нет”) и потенциальных чарджбеков.

Что сделано:
- `src/db/queries.js`:
  - `unlockWorkspaceContactsWithCredits()` перед активацией unlock в одной транзакции проверяет, что в workspace есть хотя бы 1 revealable поле: `channel_username` / `profile_contact` / `profile_ig` / непустой `profile_portfolio_urls[]` / структурные контакты (`profile_contacts.tg/email/phone/site/other`).
  - если контактов нет → возврат `{ ok:false, error:'no_contacts' }` (без списания и без unlock записи).
  - если витрина удалена/не найдена → `{ ok:false, error:'missing_ws' }`.
- `src/bot/bot.js`:
  - обработка `no_contacts`/`missing_ws` в `a:wsp_contact_unlock`: показываем понятный экран и подтверждаем, что **списания не было**.
  - доп.: нормализуем `profile_portfolio_urls` (фильтруем пустые строки), чтобы не показывать разлок “ради пустого портфолио”.
- `api/qstash/monetization-retry.js`:
  - воркер `wsp_contact_unlock` обрабатывает `no_contacts`/`missing_ws` и уведомляет бренд-актора (списаний нет), освобождает token-lock как обычно.

Риск регрессий:
- Низкий: изменения затрагивают только путь “🔓 Разлок контактов” (money-path) и улучшают UX при неконсистентных данных.

QA:
1) Workspace без контактов/IG/портфолио/канала: нажатие «🔓 Разлок» → сообщение “Контактов пока нет, списания не было”, баланс не меняется.
2) Workspace с портфолио, но массив содержит пустые строки: unlock CTA не должен появляться только из-за пустых значений; при клике списания нет (no_contacts).
3) Нормальный workspace с контактами: разлок списывает 1 кредит (если нужно), ставит unlock, витрина показывает контакт‑пакет.
4) Async retry включен: при no_contacts воркер шлёт бренд-актору сообщение “списания не было”, и unlock не активируется.


### STEP354 — Broadcast tick fail-closed when Redis is degraded
- Cron `broadcastTick()` теперь **не делает DB polling**, если Redis недоступен: возвращает `skip/deferred` и пишет ops-метрики `broadcast_tick_deferred_redis` (today_count + last_*).
- Зачем: при Redis down мы теряем lock/cooldown/runtime flags; падение в legacy sync-send может перегрузить Neon и упереться в таймауты Vercel.
- Наблюдаемость: `/api/health.broadcast.tick_deferred_redis` + баннер в «🧰 Админка → Операции».

Риск регрессий: **низкий** (затрагивает только cron broadcast tick и только при деградации Redis; в нормальном режиме поведение не меняется).


### STEP355 — Auto-heal ORPHANED payments: batch claim via SKIP LOCKED
- Выборка платежей для auto-heal (только `missing_session`) теперь делается через один SQL: `FOR UPDATE SKIP LOCKED` + перевод в `APPLYING` + `RETURNING`.
- Зачем: при перекрытии крона/ретраях не тратить ресурсы на одни и те же записи и не нагружать Neon лишними read+claim циклами.
- Семантика денег не меняется: apply по‑прежнему exactly-once (STEP345), здесь только конкурентность/экономия.

Риск регрессий: **низкий** (затрагивает только cron auto-heal; горячие UI пути не меняются).


### STEP356 — Degraded rate-limit becomes stricter (Redis down protection)
- Когда `rateLimit()` переходит в in-memory fallback (Redis Lua/EVAL сломан), лимит в degraded‑режиме режется (по умолчанию ÷5; ENV `RATE_LIMIT_FALLBACK_LIMIT_DIV`).
- Зачем: в serverless много инстансов → суммарная пропускная способность in-memory limiter может стать слишком большой; в degraded режиме лучше защитить Neon/DB.

Риск регрессий: **низкий/средний** (влияет только при деградации Redis; может стать больше 429/лимитов в плохие минуты — это ожидаемо и лучше, чем перегруз БД).


### STEP357 — Payments safety banners (HMAC + fallback apply)
- `/api/health.payments` теперь показывает длину HMAC ключа и флаг `payload_hmac_minlen_ok` (рекомендуемый минимум 32 символа).
- В «🧰 Админка → Операции» добавлены баннеры:
  - 🚨 если HMAC ключ отсутствует,
  - ⚠️ если ключ слишком короткий,
  - 🚨 если включён `fallback apply` (env/runtime).
- Зачем: минимизировать человеческие ошибки в ENV и ускорить диагностику перед запуском.

Риск регрессий: **минимальный** (health/admin-only; без DB reads).


## 2026-03-05
- STEP345: Payments fallback apply made exactly-once (row-lock + one TX); HMAC/amount checks tightened.
- STEP346: Giveaways winners draw moved to REPEATABLE READ snapshot + audit reproducibility fields.
- STEP347: `/api/health` redis read/write probes + Admin→Ops Redis degraded banner.
- STEP348: Broadcast delivery load-shedding: 429 + Retry-After on DB overload.
- STEP349: Ops metrics for broadcast DB overload surfaced in health + Admin→Ops banner.
- STEP350: Support “free text reply” fixed for forum topics; reply accepted to ticket or prompt; no dump to main menu.
- STEP351: RateLimit hardening — bounded in-memory fallback + circuit-breaker when Redis EVAL fails.
- STEP352: Ops visibility — `qstash_reschedule_failed` + `official_publish_stuck` in health + Admin→Ops banners.
- STEP353: Contacts unlock safety — do not charge credits if contact pack is empty; portfolio URLs normalized.
- STEP354: Broadcast tick fail-closed when Redis degraded; emits `broadcast_tick_deferred_redis` (health + Admin→Ops).
- STEP355: Payments orphaned auto-heal batching via `FOR UPDATE SKIP LOCKED` to avoid duplicate work.
- STEP356: Degraded rate-limit stricter (default ÷5 via `RATE_LIMIT_FALLBACK_LIMIT_DIV`).
- STEP357: Payments safety visibility — health exposes HMAC minlen + key length; Admin→Ops banners for missing/short HMAC key and fallback enabled.
- STEP358: Prod readiness pack — new `94_PROD_READINESS_PACK.md` (GO/NO‑GO + incident cookbook) + prod docs updated.

Риск регрессий: **нет** (docs-only в STEP358).


## STEP359 (docs consistency sweep) — 2026-03-05
- Привели ссылки/нумерацию документации к консистентному виду (public/, neon/, smoke-tests), добавили compat placeholders (audit 22/24/25, audit_staff manifest).


## STEP360 (broadcast db_overload jitter) — 2026-03-06
- При `db_overload` в `broadcast-deliver` возвращаем 429 + `Retry-After` **с джиттером** (по умолчанию 0–15с; ENV `BROADCAST_DB_BACKOFF_JITTER_SEC`).
- Зачем: при восстановлении Neon/DB и массовых ретраях QStash избегаем “громового стада” (thundering herd) и распределяем нагрузку.

Риск регрессий: **минимальный** (меняется только задержка ретрая при DB overload; основной happy-path не трогаем).


## STEP361 (broadcast db_overload fuse) — 2026-03-06
- При детекте `db_overload` ставим Redis‑ключ‑предохранитель `ops:fuse:db_overload` (TTL ~50с; ENV `BROADCAST_DB_OVERLOAD_FUSE_TTL_SEC`).
- При наличии fuse в начале `broadcast-deliver` сразу отвечаем 429 + Retry‑After (с jitter) **до любых DB обращений**.
- Зачем: защитить Neon/pool от повторных попыток подключения во время частичной деградации и быстрее стабилизировать систему.

Риск регрессий: **минимальный** (меняется только поведение при DB overload; в нормальном режиме fuse не активен).


## STEP362 (stdout fallback for ops events) — 2026-03-06
- В `queueOpsDigest` добавлен резервный канал: если Redis недоступен (dedup/buffer), событие пишется в stdout как JSON (`t=ops_event`).
- Дополнительно: при падении Redis в `broadcast_db_overload` метриках пишем компактный JSON breadcrumb в stdout.
- Зачем: при полном outage Redis не теряем “почему/где” для инцидента — это облегчает разбор по логам Vercel.

Риск регрессий: **минимальный** (только логирование в degraded путях; бизнес‑логика не меняется).


## STEP363 (payments handlers extracted) — 2026-03-06
- Декомпозиция: Stars payments обработчики вынесены из монолита `src/bot/bot.js` в модуль `src/bot/payments/starsHandlers.js`.
- Вынесено без изменения логики: `/paysupport`, `pre_checkout_query`, `message:successful_payment`.
- Зачем: уменьшить “площадь” монолита и снизить риск регрессий при будущих правках платежей/бота.

Риск регрессий: **низкий** (перемещение кода + dependency injection; поведение не меняется).


## STEP364 (broadcast pending deliveries in /api/health) — 2026-03-06
- Cron `broadcastTick()` writes a Redis-only snapshot of pending deliveries (`broadcast:pending_deliveries`, TTL 30 min) when it already computes `countBroadcastPendingDeliveries()`.
- `/api/health` now exposes `broadcast.pending_deliveries` (Redis-only) so operators can spot "stuck" deliveries early without any DB reads in health.
- When there is no active broadcast, the snapshot key is cleared (best-effort) to avoid stale data.

Риск регрессий: **минимальный** (только Redis-visibility; бизнес‑логика broadcast не меняется).


## STEP365 (Admin→Ops: flush ops digest button) — 2026-03-06
- В `🧰 Админка → Операции` добавлена кнопка `🧾 Flush ops digest` (`a:admin_ops_flush`).
- Action имеет guard `NONE` (экран Ops должен оставаться доступным при Redis degraded) и работает best-effort.
- При нажатии вызываем `flushOpsAlerts(getBot().api, 'ops', { force: true })` и показываем результат (sent/events или skipped+reason) прямо на экране Ops.
- Без DB-чтений: только Redis lock/buffer + отправка сообщения в ops targets.

Риск регрессий: **минимальный** (admin-only UX; нет изменений в продуктовых потоках; при Redis outage — корректный soft-fail).


## STEP366 (Preflight: smoke degraded rate-limit + extra node-check) — 2026-03-06
- `scripts/preflight.js` расширен:
  - добавлен `node --check` для `src/bot/payments/starsHandlers.js` (страховка против ESM/syntax регрессий после вынесения обработчиков платежей).
  - добавлен запуск `scripts/smoke-degraded-rate-limit.js`.
- Новый smoke `scripts/smoke-degraded-rate-limit.js`:
  - не требует реальных Upstash ключей;
  - симулирует Redis HTTP failure через `globalThis.fetch = () => throw`;
  - вызывает `rateLimit()` и проверяет, что включается **in-memory fallback** и лимит становится **строже** (default ÷5 через `RATE_LIMIT_FALLBACK_LIMIT_DIV`).

Риск регрессий: **нулевой** для прод‑runtime (dev/CI only); добавляет только проверки перед деплоем.


## STEP367 (Preflight: broadcast overload invariants) — 2026-03-06
- Добавлен `scripts/test-broadcast-overload-invariants.js` и подключён в `scripts/preflight.js`.
- Скрипт проверяет инварианты overload‑веток в `api/qstash/broadcast-deliver.js`:
  - ответ **429** при `db_overload` и при активном fuse;
  - выставление `Retry-After` + `Upstash-Retry-After` (через `setQStashRetryAfterHeaders`);
  - наличие полей `retry_after_sec`, `base_backoff_sec`, `jitter_sec` в JSON;
  - jitter считается через `randIntInclusive(0, jitterMax)`.

Риск регрессий: **нулевой** (dev/CI only); прод‑поведение broadcast не меняется.


## STEP368 (Contacts redaction anti-bypass) — 2026-03-06
- Усилены тесты `scripts/test-redactContactsInText.js` (расширено покрытие bypass-паттернов):
  - `t . me / ...` (пробелы вокруг точки/слэша)
  - zero‑width символы внутри `t.me` (например `t\u200B.\u200Cme/...`)
  - `instagram (dot) com/...`
  - `@ handle` с пробелом
  - obfuscated email: `user (at) example (dot) com` и `Email: user at example dot com`
  - `+7 (999) 123 45 67`
  - добавлен негативный кейс против ложноположительных: `Email marketing ...` без `email:`
- Минимально усилен `src/bot/redactContacts.js` (без изменения общей архитектуры):
  - нормализация zero‑width (`\u200B/\u200C/\u200D/\u2060/\uFEFF`) для анти‑bypass
  - `t.me` regex допускает пробелы/невидимые разделители вокруг точки и слэша
  - `instagram (dot) com/...` ловится как social link
  - `@`-handle regex допускает пробелы/невидимые разделители после `@`
  - obfuscated email ловится:
    - bracket‑вариант всегда (`(at)/(dot)`/`[at]/[dot]`/`{at}/{dot}`)
    - word‑вариант только при явном триггере `email:`/`почта:` (уменьшаем риск ложноположительных)

Риск регрессий: **низкий** (regex‑усиление в redaction‑хелпере + расширение тестов). Горячие UI пути и DB не затронуты.


## STEP369 (Docs armor: runtime fallback runbook + microfix matrix) — 2026-03-06
- Обновлён `docs/94_PROD_READINESS_PACK.md`:
  - добавлена секция **3.0 Матрица микрофиксов** (Symptom → Microfix → Verify → Rollback) для основных деградаций (Redis/DB/QStash/Official publish/Payments/Audit).
  - переписан payments-инцидент как короткий runbook **runtime fallback apply** (preconditions по HMAC/payload issues, включение через Admin→System→🧯 Fallback, мониторинг, обязательное выключение, rollback).
- Обновлён `docs/90_OWNER_RUNBOOK.md`: добавлена явная ссылка на `94` (матрица + runbook) в разделе “если что-то сломалось”.
- Обновлён `docs/README.md`: в “Что нового” уточнено, что readiness pack включает матрицу микрофиксов и runbook fallback apply.
- Обновлён `docs/00_CURRENT_STATE.md`: добавлен STEP369 (docs-only).

Риск регрессий: **нулевой** (docs-only; поведение продакшена не изменено).


## STEP370 (Health GO/NO_GO aggregator) — 2026-03-06
- Обновлён `/api/health`: добавлены поля:
  - `system_status: "GO" | "NO_GO"`
  - `no_go_reasons[]` (массив объектов `{code,value,threshold}` для операторского разбора)
- Правило NO_GO (строго Redis-only; без DB):
  - `redis.read_ok === false` или `redis.write_ok === false`
  - `payments.payload_hmac_minlen_ok === false`
  - `payments.fallback_apply_effective === true` (или env-enabled)
  - пороги: `broadcast.tick_deferred_redis.today_count > 50`, `qstash.reschedule_failed.today_count > 10`, `qstash.official_publish_stuck.today_count > 5`

Риск регрессий: **нулевой** (только добавлены новые поля в health; existing поля не менялись).
## STEP371 (Staging fault-injection: simulate Redis down) — 2026-03-06
- Добавлен флаг ENV `SIMULATE_REDIS_DOWN=1` (только staging/dev; **в prod игнорируется**).
- `src/lib/redis.js`: при включённом флаге все методы Redis принудительно возвращают ошибку `code=SIMULATED_REDIS_DOWN` (через Proxy), чтобы проверять fail-open/fail-closed поведение без реального падения Upstash.
- Добавлен ручной smoke `scripts/smoke-fault-injection.js`:
  - валидирует, что fault injection реально включён (`redis.__simulated_down === true`)
  - проверяет, что Redis вызовы падают с `SIMULATED_REDIS_DOWN`
  - проверяет, что `/api/health` **не падает** и отдаёт `system_status=NO_GO` + причины
- `.env.example`: добавлена подсказка для staging.

Риск регрессий: **нулевой в prod** (флаг не может сработать в `APP_ENV=prod/production`). На staging/preview — включается только вручную для тестов.



## STEP372 (Broadcast hard-skip HIT log + admin report) — 2026-03-06
- Расширена наблюдаемость hard-skip (dead chats): теперь фиксируем не только SET (когда добавили TG ID в hard-skip), но и HIT — когда рассылка реально пропускает отправку из-за существующего hard-skip.
- `src/bot/cron.js`:
  - добавлен Redis список `broadcast:hard_skip:hit_recent` (trim до 2000, TTL 14d)
  - добавлен helper `logBroadcastHardSkipHit(tgId, reason, {broadcastId,userId,via})`
  - cron `broadcastTick()` логирует HIT при пропуске в fanout и non-fanout режимах.
- `api/qstash/broadcast-deliver.js`: при раннем hard-skip (race-friendly) логируем HIT (via `qstash`).
- Админский отчёт:
  - `src/bot/bot.js`: добавлен экран `🧾 Hard-skip HITs (пропуски)` (`a:hs_hits|p:*`) и кнопка `🧾 Последние пропуски` в `a:hs_home`.
  - `src/bot/actionRegistry.js` + `docs/02_ACTION_KEYS_REGISTRY.md`: добавлен action `a:hs_hits` (admin, guard none).

Риск регрессий: **низкий** (Redis-only логирование + новый admin-экран; прод бизнес-логика не менялась, DB в hot UI не затрагивалась).


## STEP373 (Admin→Ops: payments fallback runtime banner details) — 2026-03-06
- Усилен баннер `Payments: fallback apply ENABLED` в `🧰 Админка → Операции`:
  - при runtime-включении fallback (через админку) показываем детали: `since`, `until`, `by` (tgId/user), `reason`.
  - добавлена явная подсказка “как выключить” (через `⚙️ Админка → Система → Payments fallback apply → runtime OFF`).
- Инварианты: **без DB** (Redis-only), экран Ops остаётся доступным при деградации Redis (best-effort banners).

Риск регрессий: **низкий** (UI/текстовые баннеры на admin-экране; бизнес-логика payments не менялась).


## STEP374 (/api/health: NO_GO reasons normalized + hints) — 2026-03-06
- Усилен агрегатор GO/NO_GO в `/api/health`:
  - `no_go_reasons[]` теперь содержит операторские объекты `{code,severity,value,threshold?,hint}`.
  - добавлен отдельный P0‑reason `payments_payload_hmac_key_missing`, если `PAYMENTS_PAYLOAD_HMAC_KEY` не задан.
  - для ключевых причин добавлены короткие подсказки (hint), включая проверки Redis и пороговые метрики.
- Инварианты: endpoint по‑прежнему **never throw** и остаётся **Redis-only** (без DB).

Риск регрессий: **нулевой** (добавлены/расширены поля в health; прод‑логика не менялась).


## STEP375 (Redaction: reduce math-like false positives for phone-in-words) — 2026-03-06
- `src/bot/redactContacts.js`: word-phone детектор стал строже, если **нет явных phone‑триггеров** (`тел/номер/whatsapp/...`) и мы сработали только по `плюс`:
  - редактируем только типичную RU mobile форму с префиксом страны: `+7 9xx...` / `8 9xx...` (в виде слов, например `плюс семь девять ...`).
  - при наличии phone‑триггеров сохраняем более широкий режим (10–15 цифр), чтобы не ослаблять защиту в явном “телефонном” контексте.
- `scripts/test-redactContactsInText.js`: добавлены тесты:
  - строгий кейс без phone‑триггера должен редактироваться;
  - “плюс семь восемь…” как пример/математика не должен редактироваться.

Риск регрессий: **низкий** (изменения изолированы в redaction‑хелпере + тесты; DB/hot UI не затронуты).


## STEP376 (IG templates: no-contact-leak invariants) — 2026-03-06
- Добавлен тест `scripts/test-ig-templates-no-contacts.js`:
  - извлекает из `src/bot/bot.js` функции `buildWsIgTemplate` и `buildWsIgDmRaw` (без импорта всего bot.js, чтобы избежать побочных эффектов).
  - прогоняет шаблоны на “опасных” данных (email/phone/@handle/portfolio) и валидирует, что шаблоны не содержат контактов и внешних ссылок (кроме bot deep-link `t.me/...start=wsp_...`).
- `scripts/preflight.js`: подключён новый тест как обязательный preflight guard.

Риск регрессий: **нулевой** (dev/CI only; прод‑runtime не менялся).


## STEP377 (Preflight: expanded node-check coverage for entrypoints) — 2026-03-06
- `scripts/preflight.js`: расширено покрытие `node --check`:
  - добавлен безопасный скан всех `api/**/*.js` (включая `api/qstash/*`)
  - добавлен скан `migrations/*.js`
  - добавлен скан `src/lib/*.js` (частая зона экспорт/ESM регрессий)
  - добавлен скан `src/bot/routes/*.js` и `src/bot/payments/*.js`
  - добавлен скан `scripts/test-*.js` и `scripts/smoke-*.js`
- Цель: ловить синтакс/ESM-export проблемы **до** деплоя (dev/CI only).

Риск регрессий: **нулевой** (dev/CI only; прод‑runtime не менялся).


## STEP378 (Hard-skip HITs: filters/export + top reasons today) — 2026-03-06

### Зачем
- Оператору нужно быстро понимать **кого/почему** пропускаем из‑за dead chats, и иметь быстрый экспорт для разборов.
- В инциденте/массовой рассылке важно видеть “top reasons today” без тяжёлых сканов.

### Что сделано
- Добавлены per‑reason day counters для hard-skip HITs (Redis-only, TTL 14d):
  - `mg:<env>:broadcast:hard_skip:hit_reason:d:<YYYYMMDD>:bot_blocked`
  - `...:chat_not_found`
  - `...:user_deactivated`
  - `...:unknown` / `...:other`
- Экран `Admin → System → 🧱 Hard-skip → 🧾 Последние пропуски`:
  - фильтры по причине (кнопки с today‑счётчиками),
  - `🗒 Export last 200` (отправляет таблицу в этот чат, чанкуется до лимита сообщений),
  - отображение “Сегодня: …” (top reasons today).
- Добавлен action key: `a:hs_hits_export` (admin-only, guard none).

### Файлы
- `src/bot/cron.js`
- `src/bot/bot.js`
- `src/bot/actionRegistry.js`
- `docs/02_ACTION_KEYS_REGISTRY.md`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- В админке открыть `🧱 Hard-skip` → `🧾 Последние пропуски`: фильтры переключаются, список меняется.
- Нажать `🗒 Export last 200` → приходит таблица(ы) в чат админа, затем UI возвращается на экран HITs.
- При Redis degraded экран даёт понятное сообщение, не падает.


## STEP379 (/api/health: ops digest preview for dashboards) — 2026-03-06

### Зачем
- Быстрый “human preview” прямо в `/api/health`, чтобы мониторинг/дашборды видели не только counters, но и короткий сэмпл последних ops-событий.

### Что сделано
- В `/api/health` добавлено `ops.digest_preview` (Redis-only; bounded):
  - `day`, `pending`, `last_sent_at`
  - `top`: top-3 reasons из буфера `ops:alerts:ops:d:<day>`
  - `last`: последние 5 событий (ts/reason/kind/title), с жёсткими лимитами по длинам
- Для извлечения используется короткий `LRANGE 0..30`; endpoint остаётся “never throw”.

### Файлы
- `api/health.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `/api/health` отдаёт `ops.digest_preview` при наличии событий в ops-буфере.
- При пустом буфере `ops.digest_preview.top=[]` и `last=[]` (или null), без ошибок.
- При Redis degraded endpoint остаётся доступным и не бросает исключения.
## STEP380 (Readiness pack + NotebookLM audit baseline refresh) — 2026-03-06

### Зачем
После серии укреплений (STEP364–379) нужен “единый операторский источник правды” и актуальный audit baseline для NotebookLM.

### Что сделано
- Обновлён `docs/94_PROD_READINESS_PACK.md`:
  - GO/NO‑GO через `system_status` + `no_go_reasons[].hint`
  - добавлены новые сигналы: `broadcast.pending_deliveries`, `ops.digest_preview`
  - расширена матрица микрофиксов (pending stuck / hard-skip spike / fallback enabled)
  - добавлены ссылки на операторские кнопки/экраны: `🧾 Flush ops digest`, Hard-skip HITs report
- Обновлён `docs/90_OWNER_RUNBOOK.md` — короткий блок “что смотреть ежедневно” под новые поля health/ops.
- Обновлены audit-доки: `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` и `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` (baseline STEP380, новые поля health/ops).
- Обновлены `docs/README.md`, `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_03.md`.

### Файлы
- `docs/94_PROD_READINESS_PACK.md`
- `docs/90_OWNER_RUNBOOK.md`
- `docs/README.md`
- `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md`
- `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`
- `docs/audit/notebooklm_pack/04_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `docs/94_PROD_READINESS_PACK.md` упоминает все новые поля health (system_status/no_go_reasons/pending_deliveries/digest_preview) и операторские экраны.
- `docs/audit/*` содержит актуальный промпт и актуальные правила для pack (≤50 файлов).


## STEP393 (Admin Notice composer/runtime contract smoke) — 2026-03-10

### Зачем
`Админка → Объявление` — это отдельный operator-flow с Redis-only runtime-настройками и `expectText` composer-ветками. Здесь легко словить “тихий” регресс: переименование callback/action key, потеря footer-навигации, выпадение prompt/follow-up текста или слом publish-guard (`version++`, `active=true`, publish только при наличии текста).

### Что сделано
- Добавлен `scripts/smoke-admin-notice-contract.js`.
- Smoke фиксирует source-level контракт `renderAdminSysNotice()`:
  - summary/status блок: `STATUS`, `SEVERITY`, `TARGET`, `EXPIRES`, `CTA`, `VERSION`, preview текста;
  - control rows: `toggle + severity`, `target + expire`, `CTA + text`, `clear + publish`;
  - footer: `⬅️ Коммуникации / 📋 Меню / 🏠 Home`.
- Smoke дополнительно валидирует runtime-contract callback/expect веток:
  - вход в `a:admin_notice` по‑прежнему очищает `expectText` и draft;
  - `severity` циклично ходит по `info/warn/critical`;
  - `target` циклично ходит по `all/brand/creator`;
  - composer prompts `CTA / Expire / Text` остаются стабильными;
  - publish guard по‑прежнему требует текст, делает `version++`, включает `active`, и после save/CTA/expire оставляет publish follow-up;
  - text input продолжает использовать Telegram-safe clipping (`clipCodepoints(..., TG_SAFE_BODY_MAX)`).
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-notice-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `scripts/smoke-admin-notice-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-admin-notice-contract.js`
- `node scripts/smoke-admin-notice-contract.js`
- `npm run smoke:admin-notice-contract`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP395 (Admin DM Templates contract smoke) — 2026-03-10

### Зачем
`Админка → Шаблоны DM` — отдельный Redis-only operator-flow, тесно связанный с `Admin → Outbox` через действие `📌 В шаблон`. Здесь легко словить тихий регресс: исчезновение кнопок/footer, rename callback/action key, выпадение add/edit/delete/reset prompts или разрыв обратных ссылок `Открыть шаблон / Шаблоны DM / Outbox`.

### Что сделано
- Добавлен `scripts/smoke-admin-dm-templates-contract.js`.
- Smoke фиксирует source-level контракт `renderAdminDmTemplates()`:
  - summary/list блок: `📌 Шаблоны сообщений (DM)`, `Источник`, `Версия`, `Обновлено`, empty-state/list heading;
  - controls: per-template buttons, `➕ Новый шаблон`, `♻️ Сбросить к дефолту`, pagination, `📎 Вставить`;
  - footer: `⬅️ Коммуникации / 📋 Меню / 🏠 Home`.
- Smoke дополнительно фиксирует `renderAdminDmTemplateView()`:
  - `ID`, `Название`, полный `<pre>` preview текста;
  - controls: `✏️ Изменить / 🗑 Удалить / 📎 Вставить / ⬅️ Назад`;
  - missing-template fallback + footer.
- Smoke валидирует callback/expectText контракт:
  - `a:admin_umsg_tpls/view/add/edit/del_q/del/reset_q/reset`;
  - `clearExpectText` на входе add/edit;
  - стабильные prompts для add/edit;
  - delete/reset confirm screens;
  - delete/add/edit продолжают делать `version++`;
  - связка `Outbox → 📌 В шаблон` сохраняет DM-only guard, кнопки `📌 Открыть шаблон / 📌 Шаблоны DM / 📤 Outbox` и clip warning.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-dm-templates-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `scripts/smoke-admin-dm-templates-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-admin-dm-templates-contract.js`
- `node scripts/smoke-admin-dm-templates-contract.js`
- `npm run smoke:admin-dm-templates-contract`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP400 (Admin Users contract smoke) — 2026-03-10

### Зачем
`Админка → Пользователи` — важный operator-flow с Redis-search state, фильтрами, быстрыми DM-actions и CSV export. Здесь легко словить тихий регресс: пропажа `Поиск/Сброс`, drift action keys для `Карточка/Написать/Заметка`, сломанный saved-query/footer или изменение CSV контракта.

### Что сделано
- Добавлен `scripts/smoke-admin-users-contract.js`.
- Smoke фиксирует source-level контракт:
  - list-screen `👥 Пользователи`: `Пользователи · фильтр · стр`, spoiler-строка поиска, empty-state, DM-only quick actions `👤 / ✉️ / 📝` при 1–5 результатах, filter rows, `🔎 Поиск`, условный `🧹 Сброс`, `📤 Export CSV`, pagination, `⬅️ Операции`;
  - search/reset callbacks `a:admin_users / a:admin_users_search / a:admin_users_reset`: `clearExpectText`, prompt `Введи @username или tg_id`, saved Redis-query, footer `⬅️ Система / 📋 Меню / 🏠 Home`;
  - CSV export contract `a:adm_ucsv`: helper `exportUsersDirectory`, стабильный header/filename/caption, truncation warning, back buttons `⬅️ К списку / ⬅️ Админка`.
- Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY`: `a:admin_users`, `a:admin_users_search`, `a:admin_users_reset`, `a:adm_ucard`, `a:adm_umsg`, `a:adm_unote`, `a:adm_ucsv`, `a:admin_ops`, `a:admin_sys`, `a:menu`, `a:home`.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-users-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `scripts/smoke-admin-users-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-admin-users-contract.js`
- `node scripts/smoke-admin-users-contract.js`
- `npm run smoke:admin-users-contract`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP401 (Admin User Card + Note contract smoke) — 2026-03-10

### Зачем
`Админка → User Card + Note` — detail-flow поверх каталога пользователей и Outbox return-route. Здесь легко словить тихий регресс: пропажа action keys `Карточка/Заметка`, дрейф кнопок `ban/revoke/gift`, утечка заметок вне DM, поломка tag-toggle/edit/clear flow или потеря возврата назад.

### Что сделано
- Добавлен `scripts/smoke-admin-user-card-note-contract.js`.
- Smoke фиксирует source-level контракт:
  - `renderAdminUserCard()` — заголовок `Карточка пользователя`, поля `ID / TG ID / Username / Роли / Регистрация / Обновлён`, DM-safe note/tags block, actions `Скопировать ID / Написать / Заметка / Подарить подписку`, revoke brand-plan/credits/PRO, ban/unban toggle, back buttons `К списку / Операции`;
  - `renderAdminUserNote()` — return-route helper, DM-only guard, note/tags summary, tag toggle allowlist, actions `Изменить текст / Очистить всё / К карточке`, optional `⬅️ Outbox`, section footer `Коммуникации|Операции / Меню / Home`;
  - callbacks `a:adm_ucard / a:adm_unote / a:adm_unote_edit / a:adm_unote_clear_q / a:adm_unote_clear / a:adm_unote_tag`;
  - `expectText` flow `adm_user_note` — DM re-guard, empty prompt, `clear/cancel` commands, save helper `setAdminUserNote(...)` с metadata и возврат в `Карточка/Заметка`.
- Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY`: `a:adm_ucard`, `a:adm_ucopy`, `a:adm_umsg`, `a:adm_unote*`, `a:adm_ugift`, `a:adm_urevoke_q`, `a:adm_uban_q`, `a:admin_users`, `a:admin_ops`, `a:admin_comms`, `a:menu`, `a:home`.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-user-card-note-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `scripts/smoke-admin-user-card-note-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-admin-user-card-note-contract.js`
- `node scripts/smoke-admin-user-card-note-contract.js`
- `npm run smoke:admin-user-card-note-contract`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP402 (Admin Audit / Metrics / Moderators contract smoke) — 2026-03-10

### Зачем
`Админка → Audit / Metrics / Moderators` — три операторских экрана с высоким риском тихих rename/remove/reguard регрессий: временные фильтры audit/export, day-window метрик и add/remove flow модераторов. Здесь полезнее закрыть контракт одним source-level smoke, чем разносить три почти одинаковых релизных шага.

### Что сделано
- Добавлен `scripts/smoke-admin-audit-metrics-moderators-contract.js`.
- Smoke фиксирует source-level контракт `renderAdminAudit()`:
  - title/search lines `Action / Workspace / User`, empty-state;
  - time filters `24ч / 7д / 30д / Всё`;
  - controls `🔎 Поиск / 🧹 Сброс / 📤 Export TXT / pagination / ⬅️ Операции`;
  - export helper `sendAdminAuditExport()` с header `Collabka PR — Global Audit Export`, stable filename/caption, payload clipping и back/menu/footer buttons;
  - callbacks `a:aud / a:aud_search / a:aud_reset / a:aud_export` и `expectText` flow `aud_search`.
- Smoke фиксирует source-level контракт `renderAdminMetrics()`:
  - summary blocks `Пользователи / Каналы / Конкурсы / Офферы / Payments / Активность`;
  - analytics-off fallback;
  - day-window controls `7д / 14д / 30д / 90д`;
  - footer `⬅️ Операции / 📋 Меню / 🏠 Home`;
  - callback `a:admin_metrics`.
- Smoke фиксирует source-level контракт `renderAdminModerators()`:
  - title/list/empty-state;
  - `➕ Добавить модератора` и per-row `🗑`;
  - footer `⬅️ Система / 📋 Меню / 🏠 Home`;
  - callbacks `a:admin_mod_list / a:admin_mod_add / a:admin_mod_rm` и `expectText` flow `admin_add_mod_username`.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:admin-audit-metrics-moderators-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `scripts/smoke-admin-audit-metrics-moderators-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-admin-audit-metrics-moderators-contract.js`
- `node scripts/smoke-admin-audit-metrics-moderators-contract.js`
- `npm run smoke:admin-audit-metrics-moderators-contract`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP403 (Broadcast deliver local in-memory DB overload fuse) — 2026-03-11

### Зачем
NotebookLM-аудит подсветил редкий, но дорогой для Neon сценарий: `broadcast-deliver` ловит DB overload, а Redis в этот же момент недоступен. В таком случае Redis-fuse не записывается, и следующий вызов на тёплом инстансе снова идёт в Redis/DB. Нужен короткий warm-instance local fuse, который short-circuit’ит повторные попытки **до** Redis-read и **до** любого DB touch.

### Что сделано
- В `api/qstash/broadcast-deliver.js` добавлен module-level state `localDbDegradedUntilMs`.
- Добавлены helper’ы:
  - `getLocalDbOverloadFuseTtlMs()`
  - `getLocalDbOverloadFuseUntilMs()`
  - `armLocalDbOverloadFuse()`
- В `respondDbOverload(...)` local fuse теперь активируется **только если** запись Redis-fuse (`redis.set(dbOverloadFuseKey(), ...)`) не удалась.
- В начале handler’а добавлен precheck `local_fuse_precheck`: если local fuse активен, запрос немедленно отвечает `429 + Retry-After` через `respondDbOverloadFuse(...)` **до** `redis.get(dbOverloadFuseKey())` и **до** `db.getBroadcast(...)`.
- `respondDbOverloadFuse(...)` расширен полями `retryAfterSec`, `localFuse`, а JSON-ответ теперь маркирует путь флагом `local_fuse`.
- Добавлен source-level smoke `scripts/smoke-broadcast-local-db-fuse.js`.
- `scripts/preflight.js` теперь запускает этот smoke обязательно.
- В `package.json` добавлен `npm run smoke:broadcast-local-db-fuse`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `api/qstash/broadcast-deliver.js`
- `scripts/smoke-broadcast-local-db-fuse.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check api/qstash/broadcast-deliver.js`
- `node --check scripts/smoke-broadcast-local-db-fuse.js`
- `node scripts/smoke-broadcast-local-db-fuse.js`
- `npm run smoke:broadcast-local-db-fuse`
- `node --check scripts/preflight.js`
- `APP_ENV=production node scripts/preflight.js`


## STEP404 (Payments orphaned auto-heal chain-drain / self-reenqueue) — 2026-03-11

### Зачем
NotebookLM-аудит подсветил не баг exactly-once, а throughput tail: при большом backlog `ORPHANED missing_session` cron разгребал только один batch за tick. Нужен bounded chain-drain, который ускоряет хвост без увеличения batch size и без ломки уже существующих claim/apply guard’ов.

### Что сделано
- В `src/lib/config.js` добавлен bounded env `PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX` (по умолчанию 3, максимум 12).
- В `/api/health` добавлено поле `payments.orphaned_autoheal_chain_max` для visibility.
- В `src/bot/cron.js` `autoHealOrphanedPayments()` по‑прежнему обрабатывает первый batch сам, но если claimed batch заполнен целиком, публикует continuation-задачу в `POST /api/qstash/monetization-retry`:
  - `action='orphaned_autoheal'`
  - `chain_depth=1`
  - `chain_source='cron'`
  - `dedup=mon:autoheal:${chainId}:1`
- В `api/qstash/monetization-retry.js` добавлен worker branch `orphaned_autoheal`:
  - повторно claim’ит batch через `claimOrphanedMissingSessionPaymentsForAutoheal(...)`
  - использует текущие safety-path’ы `_validateStarsPaymentStrict(...)` и `applyPaymentFallbackNoSession(...)`
  - при полном batch self-reenqueue’ит следующую bounded leg через `qstashPublishJSON(...)`
  - соблюдает depth-limit через `PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX`
  - пишет best-effort ops digest на notify/apply/chain enqueue failures
- Добавлен source-level smoke `scripts/smoke-payments-autoheal-chain-contract.js`.
- `scripts/preflight.js` теперь обязательно запускает этот smoke.
- В `package.json` добавлен `npm run smoke:payments-autoheal-chain-contract`.
- Обновлены `docs/00_CURRENT_STATE.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md`.

### Файлы
- `src/lib/config.js`
- `api/health.js`
- `src/bot/cron.js`
- `api/qstash/monetization-retry.js`
- `scripts/smoke-payments-autoheal-chain-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check src/bot/cron.js`
- `node --check api/qstash/monetization-retry.js`
- `node --check scripts/smoke-payments-autoheal-chain-contract.js`
- `node scripts/smoke-payments-autoheal-chain-contract.js`
- `npm run smoke:payments-autoheal-chain-contract`
- `APP_ENV=production node scripts/preflight.js`
- `APP_ENV=staging node scripts/preflight.js`

## STEP405
- Added Official Publish operator `🩺 Проверить статус` path with shared safe verify/self-heal helper.
- Added source-level smoke and preflight coverage for manual check-now contract.


## STEP407
- Public positioning polish без runtime-изменений.
- Обновлён `docs/public/00_product_overview_ru.md`: product overview теперь стартует как **система управления коллаборациями внутри Telegram**, а не как “просто бот”; сохранён канонический flow `витрина → запрос → диалог → статус сделки → результат`.
- Обновлён `docs/public/README_PUBLIC.md`: public pack теперь описывается как пакет материалов о системе, а бот зафиксирован как интерфейс доступа.
- Обновлён `docs/public/07_press_kit_ru.md`: новый tagline/elevator pitch, добавлен блок “это не просто бот”, усилен framing `creator pipeline / Brand Inbox / управляемость`, при этом без enterprise-overclaim.
- Обновлён `docs/public/05_publication_templates_ru.md`: добавлены канонические формулировки, обновлены short/pin/B2B шаблоны, чтобы будущие публикации не откатывали продукт в “ботик”.
- Обновлён `docs/public/06_telegraph_article_ru.md`: статья переведена на framing “система через Telegram”, добавлен раздел “почему это уже не просто бот”, без неподтверждённых рыночных цифр.
- Обновлён `docs/public/02_for_brands_ru.md`: усилен B2B language (`creator pipeline`, `Brand Inbox`, `прозрачность для команды`, `быстрее путь до сделки`) без обещаний готового white-label/private cabinet/advanced analytics.
- Обновлён `docs/public/03_faq_ru.md`: добавлены вопросы “бот или система?” и “можно ли private-формат?”, первый ответ переведён с `Collabka PR Bot` на `Collabka PR`.
- Мягко синхронизированы `docs/public/01_for_creators_ru.md` и `docs/public/04_tech_overview_ru.md`: в creator guide бот теперь описан как интерфейс работы в системе, а tech overview — как основа устойчивой рабочей системы для creator/brand flows.
- Обновлён `docs/00_CURRENT_STATE.md`.

### Файлы
- `docs/public/00_product_overview_ru.md`
- `docs/public/README_PUBLIC.md`
- `docs/public/07_press_kit_ru.md`
- `docs/public/05_publication_templates_ru.md`
- `docs/public/06_telegraph_article_ru.md`
- `docs/public/02_for_brands_ru.md`
- `docs/public/03_faq_ru.md`
- `docs/public/01_for_creators_ru.md`
- `docs/public/04_tech_overview_ru.md`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- Ручная проверка консистентности public wording: `система` как главное определение, `бот` как интерфейс доступа.
- Проверка, что в public docs нет жёстких обещаний white-label/private cabinet/advanced analytics/CRM integrations.
- Проверка markdown-структуры и внутренних относительных ссылок в `docs/public/*`.

## STEP408
- Added source-level contract smoke for `/start` onboarding / role-gate / payload-priority.
- New `scripts/smoke-start-role-gate-contract.js` fixes the current contract in tests instead of changing runtime: parser coverage for `gw_ / bp_ / offer_ / wsp_ / fs_ / ig_verify / src_*`, payload-first routing before role gate, fail-open Redis key read for `ui_mode`, and the short role picker `Ты бренд или креатор?`.
- Smoke also locks the strong-intent role switching semantics: `a:home_mode` must persist `creator|brand`, clear brand-manager + curator overlays, and only touch `db.listBrandsForManager()` on explicit click; `a:ui_mode_set` must keep clearing brand-manager state before `setUiMode()`.
- Added explicit guard for the cost invariant: `/start` hot-path must not regress to `resolveUiMode()`/`db.listBrandsForManager()` before the gate, so menu/home onboarding stays free of new DB reads.
- `setUiMode()` fail-open behavior is now covered directly by smoke (Redis write errors stay swallowed).
- Wired the new smoke into both `package.json` (`npm run smoke:start-role-gate-contract`) and `scripts/preflight.js`, so the contract is checked on every standard preflight.

### Файлы
- `scripts/smoke-start-role-gate-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_03.md`

### QA
- `node --check scripts/smoke-start-role-gate-contract.js`
- `node scripts/smoke-start-role-gate-contract.js`
- `npm run smoke:start-role-gate-contract`
- `npm run preflight`



## STEP409

Что делаем
- Добавить безопасный owner-flow `soft disconnect / reconnect workspace channel` без hard-delete и без новых DB-read в hot menu paths.

Что сделано
- `migrations/044_workspace_channel_disconnect.sql`
  - в `workspace_settings` добавлены `channel_connected boolean not null default true` и `channel_disconnected_at timestamptz`.
- `src/db/queries.js`
  - `listWorkspaces`, `getWorkspace`, `getWorkspaceAny`, `findWorkspaceByChannelUsername` теперь возвращают `channel_connected` / `channel_disconnected_at` с fail-open `coalesce(..., true)`.
  - добавлен helper `setWorkspaceChannelConnection(workspaceId, connected)`.
- `src/bot/bot.js`
  - в `Кураторы и сеть` добавлена owner-кнопка `⛔ Отключить канал`.
  - добавлены `renderWsDisconnected()` + `wsDisconnectedKb()` и разделение `📣 Мои каналы` / `📦 Неактивные каналы`.
  - `renderWsOpen()` для отключённого workspace теперь показывает специальный disabled screen вместо обычного ws-menu.
  - `renderWsSettings()`, `renderCuratorManage()`, `renderBxOpen()` и owner-view `renderWsLeadsList()` дружелюбно гейтят отключённый канал.
  - `ensureWorkspaceForOwner()` выбирает только активные каналы и в сценарии «есть только отключённые» ведёт в recovery flow.
  - callback handlers добавлены для `a:ws_list_inactive`, `a:ws_disconnect_q/do`, `a:ws_reconnect_q/do`.
  - в mutating creator entrypoints добавлены guards на отключённый канал: `a:bx_new`, `a:bx_publish`, `a:gw_new`, `a:gw_publish`.
  - workspace audit labels пополнены `ws.channel_disconnected` / `ws.channel_reconnected`.
- `src/bot/actionRegistry.js`
  - зарегистрированы новые action keys: `a:ws_list_inactive`, `a:ws_disconnect_q`, `a:ws_disconnect_do`, `a:ws_reconnect_q`, `a:ws_reconnect_do`.
- `scripts/smoke-ws-channel-disconnect-contract.js`
  - фиксирует migration/queries/UI/handlers/registry контракт STEP409.
- `scripts/preflight.js`
  - обязательно прогоняет новый smoke.
- `docs/00_CURRENT_STATE.md`
  - updated source-of-truth summary for STEP409.

Инварианты
- Отключение канала = только `soft disconnect`, не delete.
- История, профиль, audit и billing сохраняются.
- На disconnect сеть и куратор выключаются атомарно вместе с `channel_connected=false`.
- Reconnect не восстанавливает `network_enabled`/`curator_enabled` автоматически.
- Hot UI paths не получают новых DB-read: список workspaces как и раньше идёт через кешированный `listWorkspacesCached`; фильтрация active/inactive делается в памяти.

QA
- `npm run actions:check`
- `npm run actions:md`
- `npm run gen:migration-pack`
- `node --check src/bot/bot.js src/db/queries.js scripts/smoke-ws-channel-disconnect-contract.js`
- `node scripts/smoke-ws-channel-disconnect-contract.js`
- ручной smoke:
  1) `📣 Мои каналы` → `Кураторы и сеть` → `⛔ Отключить канал` → confirm.
  2) Канал исчезает из активного списка и появляется в `📦 Неактивные`.
  3) `ws_open` для отключённого канала показывает disabled screen с `🔌 Подключить снова / 👤 Профиль / 🧾 История`.
  4) `a:bx_new`, `a:gw_new`, `a:bx_publish`, `a:gw_publish` не пускают дальше и не создают новые сущности.
  5) `🔌 Подключить снова` возвращает канал в активный список; сеть и куратор остаются выключенными.

Риск регрессий
- Низкий-средний: затронут только creator workspace UX + один маленький DB helper + новый migration flag; hot menu/cache contract сохранён.
