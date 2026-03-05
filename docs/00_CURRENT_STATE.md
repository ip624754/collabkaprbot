# 00 — CURRENT STATE (Collabka PR / @collabkaprbot) — 2026-03-05

**STEP330:** Giveaway publish idempotency — `a:gw_publish` now does reserve→send→commit with Redis token-lock + Redis breadcrumb for the sent channel message. If the post is sent but DB commit fails, retry finalizes **without** sending again (no duplicates). Intermediate status: `PUBLISHING`.

**STEP327:** Anti-bypass offer title — for brands before unlock, offer **title** is redacted via `redactContactsInText` (same as description). Feed titles and share-text are also redacted to prevent contact leakage.

**STEP326:** Broadcast hard-skip list for permanently dead chats (blocked/chat not found/deactivated) + admin report screen «🧱 Пропуски/ошибки» in broadcast view.

**STEP324:** Silent-catch hardening → digest ops alerts in the most expensive infra paths (Redis Lua eval failures + QStash publish failures + official publish reschedule enqueue failure).

**STEP320:** NotebookLM audit prompt condensed (strict, copy/+paste) and synced in `docs/audit/notebooklm_pack/04_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` (canonical) and `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`.
## Staff audit

Для staff‑аудита (и NotebookLM) используем единый стартовый манифест:
- `docs/audit_staff/00_AUDIT_START_MANIFEST.md`

Он фиксирует **текущее**: Instagram OAuth/verify выключены, Instagram — только ссылка/контакт (скрыт до unlock), верификация — только ручная через заявку.

NotebookLM pack (≤50 текстовых файлов):
- Источники: `docs/audit/notebooklm_pack/` (00–07: md/txt, код и миграции в бандлах).
- Генерация ZIP: `npm run gen:notebooklm-sources` → `dist/NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip`.

---


**Purpose:** единый *source of truth* snapshot, чтобы продолжать работу в новом чате без потери контекста.

### Snapshot: верификация / Instagram (сейчас)
- **Instagram OAuth / IG verification:** выключено через ENV (routes/UI/cron). Instagram остаётся только как **обычная ссылка/контакт** в карточке креатора.
- **Единственная “верификация” в продукте:** ручная (заявка → модерация → approve/reject).
- Контакты (в т.ч. Instagram) **не раскрываются бренду до unlock**.


### ENV cheat‑sheet (Vercel)
См. `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` — один экран, можно копипастить.

---


## 0.05) Выводы последнего регресс-аудита + watchlist

Snapshot: **2026-03-03** (STEP274 Dual-role mode hardening) — P0 не найдено; шаринг (U+2060 workaround), degraded‑навигация поддержки и anti‑bypass для IG Templates подтверждены; Brand Manager UX и dual‑role переключения режимов приведены к fail‑open (без лишних DB‑запросов в меню/хабах).

Рисковые зоны (если трогаешь — обязателен `npm run preflight` + ручной smoke):
1) **Share-URL workaround:** не убирать формат `t.me/share/url?url=<U+2060>&text=...` — иначе часть Telegram‑клиентов снова “молчит” на кнопках шаринга.
2) **Support при Redis degraded:** `a:support` / `a:support_push` должны оставаться `guard: NONE` (поток ввода `a:support_write` может быть `REQUIRE_REDIS`). Reply-to-user из support-группы: промпт без ForceReply + «❌ Отмена»; при Redis degraded не оставляем активные «reply сюда» промпты.
3) **IG Templates anti-bypass:** не вставлять `@username`, “ссылка в профиле”, портфолио/внешние ссылки и любые контакты; только CTA через витрину/заявку в боте.
4) **Brand Inbox atomics:** до `✅ Принять` доступны только `✅ Принять / ⛔ Спам / 🗑 Удалить`; переход `new → in_progress` строго атомарный (DB‑truth).
5) **`/api/health` + cron:** новые cron‑задачи — через `api/cron_router.js`, с lock+throttle и отражением в health без лишних DB‑запросов.
6) **Official publish:** token‑lock + DB‑reserve `PUBLISHING` + async deliver через QStash (`/api/qstash/official-publish-deliver`). UI делает reserve+enqueue, воркер отправляет в канал и фиксирует `ACTIVE`. Менять только маленькими патчами (риск дублей в @collabka_offers).
7) **Account tombstone/anonymize:** удаление аккаунта (`a:acc_del_do`) — DB‑truth, чистит PII (users/brand_profiles/workspace_settings), скрывает витрины из каталога и отзывает роли (manager/editor/curator). Важно: `upsertUser()` не должен снова записать `tg_username`, если `is_deleted=true`. Доступ для удалённых пользователей: только `♻️ Восстановить` / `💬 Поддержка`.
8) **Hot UI DB‑reads:** в меню/хабах не добавлять новые SQL‑чтения; Redis‑first, DB только на клике/DB‑truth путях.
8) **Role‑specific UX (Creator vs Brand):** в режиме Creator не показывать brand‑only кнопки ("📰 Лента креаторов", фильтры/подбор) и не писать текст, который выглядит как инструкция открыть brand‑раздел; формулировки должны быть: "бренды увидят в ленте (режим Brand)".
9) **Brand Manager (команда бренда):** вход в «🧑‍💼 Я менеджер бренда» всегда виден, но доступ проверяется **на клике** (гейт внутри bm‑flow). В меню/🏠 Home не делать дополнительных SQL‑проверок “canManager”; при отсутствии доступа показывать одну консистентную подсказку (не “отозван”, а “не добавили/доступ отозван”).
10) **Dual-role (Creator + Brand + Manager):** переключение роли не должно оставлять “полу‑состояния”. При `a:ui_mode_set` всегда очищать brand‑manager state (bm_mode + active brand). В Redis degraded role switch должен быть **fail‑open** (выбранный режим показываем сразу), даже если его нельзя сохранить.
11) **Brand/Manager return-to (ret) UX:** в списках "📝 Заявки" и "📌 Сделки" кнопка "⬅️ Назад" должна возвращать: владелец → в роль‑меню (a:menu), менеджер → в 📥 Inbox (a:bx_inbox). См. audit report 07.
12) **Creator ↔ Curator (кураторский кабинет):** в UI использовать название «🧹 Кабинет куратора» (не «Кураторы блогера»); toggle режима куратора должен использовать `v:0/1` (не `v=...`); при Redis degraded кураторская навигация должна быть доступна (guard NONE), а invite/input/anti-spam send должны fail-closed с понятным сообщением. В ключевых сценариях “куратор обработал → владелец увидел → что дальше” должны быть явные подсказки (без тупиков). См. audit report 08/09.
13) **Curator ↔ Brand Leads (очередь заявок):** в кураторском режиме должны быть явные подсказки “Что дальше” (очередь → карточка → действия). Возврат из карточки в `📨 Очередь заявок` должен сохранять фильтр назначения (`af: all/my/free`). В кураторском просмотре не показывать кликабельные контакты/URL. См. audit report 10.
14) **Brand Leads (team notifications):** уведомления по жизненному циклу заявки (новая/взята/ответ/смена статуса/сообщение бренда) должны быть самодостаточными ("Что дальше"), без добавления новых действий и без спама (только при реальном изменении). См. audit report 11.
15) **Manual replies: return-to-card:** после ручного ответа (owner `lead_reply` и brand `brand_app_reply`) оператор должен попадать обратно в карточку заявки/треда (не на отдельную «квитанцию»). Это снижает тупики и ускоряет дальнейшие действия.
16) **Creator UI wording (context):** в подсказках креатора не оставлять brand‑термины без контекста. Упоминание «Inbox» должно быть пояснено как «входящие бренда внутри этого бота». См. audit report 13.
17) **Brand Leads (brand-side signals):** бренд должен получать самодостаточные сообщения “что дальше” при ответе креатора/куратора и при ручной смене статуса заявки (без подсказок обхода unlock/контактов). См. audit report 14.
18) **Brand Leads (brand reply receipt):** после ручного ответа бренда креатору (blead_reply) квитанция бренду должна содержать короткий блок «Что дальше» и оставаться самодостаточной, без новых действий. См. audit report 15.
19) **«Что дальше» copy consistency:** новые тексты с блоком «Что дальше» делать по единому гайду, чтобы не разъезжались формулировки и не появлялись намёки на контакты/обход unlock. См. `docs/24_WHAT_NEXT_BLOCKS_STYLEGUIDE.md` и smoke `docs/audit/16_...`.
20) **Folders: Editors disabled by default:** чтобы не плодить лишние роли/вопросы и не добавлять DB‑чтения в hot Menu, UI/роль `👥 Editors` выключены по умолчанию. Включение только через `WORKSPACE_EDITORS_ENABLED=1`. См. audit report 17.

21) **STEP286 hotfix:** исправлен `SyntaxError: Invalid or unexpected token` на cold start (newline внутри `'...'` в сообщении `a:folders_my`). Теперь используется экранирование \n\n.

22) **STEP287 preflight: node --check:** `npm run preflight` теперь прогоняет `node --check` по ключевым entrypoint‑ам и ловит SyntaxError ещё до деплоя (страховка от регрессий типа STEP286).
23) **Giveaways & Offers E2E smoke:** держим быстрый end-to-end smoke (gate + wizard + финальные экраны), чтобы после деплоя быстро поймать тупики/возвраты в розыгрышах и офферах. См. audit report 20 и секцию 13 в `smoke-tests_short.md`.

24) **Broadcast E2E smoke:** держим быстрый end‑to‑end smoke (gate + создание + cooldown), чтобы после деплоя быстро ловить тупики и проверки 429/cooldown в рассылках. См. audit report 21 и секцию 14 в `smoke-tests_short.md`.

25) **Admin UX sweep (input-mode escape hatch):** `📋 Меню` / `🏠 Home` теперь best‑effort сбрасывают `expectText` (не залипаем в режиме ввода), а входы в ключевые админ‑разделы очищают ожидание ввода. См. audit report 22.

26) **Menu/Home hot UI cache (Neon-saving):** на `📋 Меню` / `🏠 Home` используем best‑effort Redis‑кеш (TTL 5 мин) для role flags (moderator/curator/editor) и списка workspaces креатора. Это убирает 2–3 SQL на каждый клик по меню в нормальном режиме. При деградации Redis — fail‑open: работаем по DB‑truth как раньше. См. audit report 28.

**STEP310:** `a:main_menu` переведён на `getRoleFlagsCached` (без лишних SQL в навигации). Добавлена инвалидация кеша role flags при изменении ролей (модератор/куратор/редактор) — best‑effort `redis.del` (DB остаётся source of truth).

**STEP311:** migrations cleanup — правило имён миграций расширено до `NNN..._name.sql` (>=3 цифры, чтобы не упереться в 999), а из раннера убран/не используется `normalizedSql` (dead field; checksum остаётся нормализованным LF+trimEnd).

27) **Redis TTL hygiene gate:** в `npm run preflight` добавлен grep‑gate `lint:redis-ttl` — запрещаем появление `redis.set(a, b)` без TTL в runtime‑коде. Исключения (намеренно persistent) должны быть явно помечены `TTL-LINT: ...`. См. audit report 30.

**STEP312:** `statement_timeout` hardening — установка таймаутов через parameterized `set_config(..., $1, ...)` + безопасный fallback на legacy `SET` (значение санитизируется).

**STEP313:** acquisition totals (`ref:*:total`) теперь bounded: TTL 365 дней по умолчанию (ENV `ACQ_TOTAL_TTL_DAYS`, `0` = хранить навсегда). Day‑buckets остаются с TTL 60 дней.

**STEP314:** деградация Redis — унифицированы тексты «кеш/сессии недоступны» (единый copy‑блок), fail‑closed middleware для `guard: REQUIRE_REDIS` показывает консистентный HTML‑экран + stateless allowlist (`s:menu/s:home/s:help/s:reset_input`).

**STEP318:** Broadcast 429 cooldown — set cooldown делается атомарно (Lua) для per‑broadcast и global ключей, воркеры (cron + QStash deliver) уважают паузу; `/api/health` показывает `broadcast.cooldown_until` (с Redis fallback на per‑broadcast ключ при частичных ключах).

**STEP325:** Broadcast 429 anti-stall — если один получатель повторно ловит 429 (по счётчику `BROADCAST_QUARANTINE_THRESHOLD`), его доставка помечается `blocked` (non‑retryable), чтобы рассылка не зависала в `pending` навсегда. Глобальный cooldown ставится только при burst 429 по нескольким получателям: считаем distinct получателей за окно `BROADCAST_GLOBAL_429_WINDOW_SEC`, порог `BROADCAST_GLOBAL_429_THRESHOLD`.


28) **STEP301 micro consistency (P3):** в админской рассылке (экран «🔗 Кнопки») шаблоны и действия выровнены в 2×2, добавлен явный admin‑footer (⬅️ Админка / 📋 Меню / 🏠 Home); в `api/qstash/broadcast-deliver.js` убран scope‑shadow `url` в cooldown‑ветке (используем `deliverUrl`); в `redactContactsInText` убран паттерн `.test()+.replace()` на глобальных regex — теперь один проход `replace` + проверка изменения строки (без stateful edge‑кейсов).

Audit report (one-time scan): `docs/audit/04_CREATOR_UI_BRAND_ACTION_KEYS_AUDIT_2026_03.md`.

Audit report (Brand Manager system): `docs/audit/05_BRAND_MANAGER_SYSTEM_AUDIT_2026_03.md`.

Audit report (Dual-role mode switching): `docs/audit/06_DUAL_ROLE_MODE_SWITCH_AUDIT_2026_03.md`.

Audit report (Brand/Manager nav + ret): `docs/audit/07_BRAND_MANAGER_NAV_RET_AUDIT_2026_03.md`.

Audit report (Creator/Curator system): `docs/audit/08_CREATOR_CURATOR_SYSTEM_AUDIT_2026_03.md`.

Audit report (Creator/Curator what-next UX): `docs/audit/09_CREATOR_CURATOR_WHAT_NEXT_UX_2026_03.md`.

Audit report (Curator/Brand Leads what-next UX): `docs/audit/10_CURATOR_BRAND_LEADS_WHAT_NEXT_UX_2026_03.md`.

Audit report (Brand Leads team notifications UX): `docs/audit/11_BRAND_LEADS_TEAM_NOTIFICATIONS_UX_2026_03.md`.

Audit report (Manual reply return-to-card UX): `docs/audit/12_MANUAL_REPLY_RETURN_TO_CARD_UX_2026_03.md`.

Audit report (Creator UI Inbox wording context): `docs/audit/13_CREATOR_UI_INBOX_WORDING_CONTEXT_UX_2026_03.md`.

Audit report (Brand Leads brand-side what-next UX): `docs/audit/14_BRAND_LEADS_BRAND_SIDE_WHAT_NEXT_UX_2026_03.md`.

Audit report (Brand Leads brand reply receipt what-next UX): `docs/audit/15_BRAND_LEADS_BRAND_REPLY_RECEIPT_WHAT_NEXT_UX_2026_03.md`.

Audit report (Brand Leads E2E smoke): `docs/audit/16_BRAND_LEADS_E2E_SMOKE_2026_03.md`.

Audit report (Folders Editors disabled): `docs/audit/17_FOLDERS_EDITORS_DISABLED_BY_DEFAULT_2026_03.md`.

Audit report (STEP286 hotfix invalid token): `docs/audit/18_STEP286_HOTFIX_INVALID_TOKEN_2026_03.md`.

Audit report (STEP287 preflight node --check): `docs/audit/19_STEP287_PREFLIGHT_NODE_CHECK_2026_03.md`.

Audit report (Giveaways & Offers E2E smoke): `docs/audit/20_GIVEAWAYS_OFFERS_E2E_SMOKE_2026_03.md`.

Audit report (Broadcast E2E smoke): `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md`.

Audit report (Admin UX sweep): `docs/audit/22_ADMIN_UX_SWEEP_2026_03.md`.

Audit report (Broadcast confirm idempotency): `docs/audit/27_BROADCAST_CONFIRM_IDEMPOTENCY_2026_03.md`.

Audit report (Menu/Home hot UI cache): `docs/audit/28_MENU_HOME_HOT_CACHE_2026_03.md`.

Audit report (RateLimit & Redis TTL hardening): `docs/audit/29_RATE_LIMIT_AND_REDIS_TTL_HARDENING_2026_03.md`.


---

## 0) Security invariants (must-not-break)
См. `01_SECURITY_INVARIANTS.md`. Ключевое на текущий момент:
- Payments: валидация payload/amount/currency в `pre_checkout` и `successful_payment` (fail-safe apply).
- Contacts unlock: DB truth + advisory lock (exactly-once), Redis только кеш/TTL.
- Ownership: safe-getters с ownership внутри SQL для лидов/заявок и опасных действий.
- Redis degraded mode: mutating callbacks работают **fail-closed** (кроме строго allowlisted DB-safe действий). Guard использует строгий реестр `src/bot/actionRegistry.js`.
  - Break-glass (Admin): при Redis down супер‑админ может открыть *строго ограниченный* allowlist экранов (payments/users/audit) через двойное подтверждение (`bg=1`). Каждое использование логируется в ops alerts.
  - STEP128: stateless fallback UI (callback `s:*`) — минимальная навигация, которая работает даже при Redis down и не делает Redis/DB вызовов.
  - STEP129: official publish anti-timeout — AbortSignal timeout на Telegram API + self-heal по `channel_post` (прикрепляем `message_id`, если функция умерла после отправки).
  - Markdown экспорт реестра action keys для аудитов: `npm run actions:md` → `docs/02_ACTION_KEYS_REGISTRY.md`.
- STEP202: синхронизирован реестр `src/bot/actionRegistry.js` с фактически используемыми callback‑ключами (админ‑разделы/notice/outbox/templates/ack). `npm run actions:check`/`actions:md` проходят чисто.
- STEP203: добавлен быстрый релиз‑preflight: `npm run preflight` (alias `npm run qa:fast`) — гоняет `actions:check`, `actions:md` (и проверяет, что `docs/02_ACTION_KEYS_REGISTRY.md` не “грязный”), `lint:nav`, `test:redact`. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP287: релиз‑preflight усилен `node --check` по ключевым JS entrypoint‑ам (ловит SyntaxError на cold start **до** Vercel). См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP204: Outbox стал “центром поддержки”: из записи можно `✉️ Повторить` (с предпросмотром), открыть `📝 Заметку` с возвратом в Outbox и сохранить текст как `📌 шаблон` (DM-only).
- STEP234: Outbox privacy hardening — если админ открыл Outbox не в личке с ботом (group/supergroup/channel), текстовые snippet’ы скрываются (🔒), а `✉️ Повторить` отключён (чтобы исключить случайные утечки/путаницу).
- STEP235: Neon timeout hardening — Postgres pool задаёт `statement_timeout` для сессии через `SET statement_timeout` в connect hook (ENV `PG_STATEMENT_TIMEOUT_MS`, default 15000) + добавляет явный лог‑маркер `db.statement_timeout` при отмене запроса по таймауту (помогает ops/support). Важно: в Neon pooler нельзя передавать `statement_timeout` через startup options.
- STEP242: Heavy TX hardening — в “тяжёлых” транзакциях (например, draw+finalize победителей розыгрыша) дополнительно ставим `SET LOCAL statement_timeout` сразу после `BEGIN` (defense-in-depth против частичных деплоев/нестандартных пулов). По умолчанию берём `PG_STATEMENT_TIMEOUT_MS` (опционально можно переопределить `PG_HEAVY_TX_STATEMENT_TIMEOUT_MS`).
- STEP236: Audit flush cooldown — при DB outage audit-flush больше не “долбит” Postgres каждую минуту: после requeue или DB‑ошибки ставим короткий cooldown (ENV `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC`, default 120) и cron временно возвращает `skipped: requeue_cooldown`. В `/api/health` добавлен `audit.buffer.requeue_cooldown_ttl_sec`.
- STEP239: Anti-bypass offer text — для бренда до unlock **заголовок и описание** оффера проходят через `redactContactsInText` (скрываем ссылки/почту/телефоны/@handles). `redactContactsInText` усилен против обхода через `＠` (U+FF20) и `․` (U+2024).
- STEP240: Lead notes tags persist — теги `#brief/#urgent/...` в curator notes теперь извлекаются и сохраняются в БД: `brand_leads.meta.curator_notes[].tags` (и агрегируются в `brand_leads.meta.tags` для будущей фильтрации). UI больше не обязан парсить текст.
- STEP241: Hotfix build-compat — импорты из `src/lib/redis.js` переведены на namespace (`import * as R`) с безопасными fallback для опциональных helper’ов (`incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`), чтобы частичные деплои/слияния не падали на Vercel с ошибкой «does not provide an export named ...». Поведение прод-логики не меняем, только устраняем crash при загрузке модулей.
- STEP205: Polishing Comms — единые лимиты Telegram по длине текста (emoji-safe), предупреждения в предпросмотре, лимиты для System Notice и CTA (без регрессий).
- STEP206: закреплён короткий релиз‑протокол “2 минуты”: `npm run preflight` + `/api/health` + 2–3 клика по админ‑экранам (Comms/Outbox/Users). См. `docs/16_RELEASE_CHECKLIST.md`.
- STEP207: hotfix — исправлен SyntaxError (invalid RegExp) в `normalizeNoticeCtaLabel` (CTA label), который мог ломать запуск на Vercel.
- STEP208: migrations fail-fast — раннер `migrations/run.js` и генератор pack (`scripts/gen-mark-all-applied.js`) принимают только `NNN..._name.sql` (>=3 цифры) и **падают**, если в `migrations/` есть любой “левый” `.sql` (защита от случайного копирования `migration_pack/*.sql`).
- STEP209: action guards v2 — в `src/bot/actionRegistry.js` добавлены guard-типы `db_truth` / `queue_first` (вместо размытого `none` для критичных DB-truth путей), middleware в `src/bot/bot.js` кэширует `redisOk` для этих guard’ов, доки синхронизированы и перегенерирован `docs/02_ACTION_KEYS_REGISTRY.md`.
- STEP210: anti-click-storm при Redis down — добавлен локальный in-memory limiter (TTL ~8s) для `✅ Принять` и `🔓 Разлок контактов`, чтобы при деградации Redis избежать “клик‑шторма” и спайков нагрузки на Postgres/Neon.
- STEP211: payments strict validation — auto-heal/ручной apply не применяют Stars‑платежи с невалидным payload/суммой/валютой; admin auto-heal помечает «manual_required» и останавливает retry‑петли; в строгой валидации поддержаны legacy токены (Brand Pass numeric credits, Brand Plan basic/max).
- STEP212: Instagram routes kill‑switch — `IG_ROUTES_ENABLED` (0/1) закрывает весь `/api/ig/*` (включая IG cron) 404, даже если роуты присутствуют; по умолчанию следует `IG_OAUTH_UI_ENABLED`.
- STEP213: Monetization UI при Redis down (P0) — кнопки списания не исчезают из UI: «🔓 Контакты» всегда показывается (даже при 0/unknown балансе в Redis), проверки кредитов — на клике (DB-truth). Для навигации разрешены read-only экраны `a:brand_apps`, `a:bx_inbox`, `a:bx_thread` даже при деградации Redis; redis-getters для UI режима/manager mode/active ws сделаны fail-open (не падают).
- STEP214: Official publish anti-stuck — после DB-reserve (`PUBLISHING`) ставим отложенную QStash‑проверку `/api/qstash/official-publish-verify`: если известен `message_id` (Redis breadcrumb) — прикрепляем и переводим в `ACTIVE`, иначе сбрасываем статус обратно в `PENDING` + логируем `last_error` (разблокируем UI/очередь). См. `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.
- STEP215: Audit buffer flush — suppressed workspace audit события (AUDIT_DB_THROTTLE) больше не теряются: складываем в Redis list и батчим в Postgres через cron `/api/cron/audit-flush-tick`. В `/api/health` добавлен `audit.buffer.*` (len/enqueued/flushed/last_flush).
- STEP216: expectText TTL + escape hatch — режим ввода текста больше не может “залипнуть навсегда”: `expectText` получает `_startedAt` и общий лимит жизни (ENV `EXPECT_TEXT_MAX_LIFETIME_SEC`, default 2h). В text-input футере добавлен явный выход «❌ Отмена» (в `📋 Меню`), а в приватном чате можно набрать `отмена/cancel/стоп/stop`.
- STEP217: post-deploy hardening — канонизировали короткий smoke после деплоя: обновлён `./smoke-tests_short.md` (добавлен input-mode `❌ Отмена/отмена` + audit flush tick + акцент на Redis degraded/монетизацию). В `docs/16_RELEASE_CHECKLIST.md` и `docs/13_RUNBOOK_RELEASE.md` добавлены ссылки на этот smoke.
- STEP218: `npm run smoke:short` — микро-команда для релиза: печатает `./smoke-tests_short.md` + 4 ключевые проверки и ссылки на релизные доки (без влияния на прод-логику).
- STEP220: Vercel Hobby лимит по функциям (≤12) — cron endpoints агрегированы через один роутер `api/cron_router.js`, а старые URL `/api/cron/*` продолжают работать через `vercel.json` rewrites. Новые cron‑тики добавляем как `job=...` внутри роутера, а не как новый файл в `api/`.

- STEP221: Admin DM UX — в системных/админских сообщениях пользователю кнопки `📋 Открыть меню` и `💬 Поддержка` открывают экраны **новым сообщением** (не затирают текст‑квитанцию). В админке (`a:adm_umsg`) кнопки уложены сеткой 2×N. Также починен путь cron router под rewrites.
- STEP223: исправление `a:menu_push` — при нажатии «Открыть меню» создаётся отдельное UI‑сообщение (`⌛ Открываю меню…`) и все edit‑рендеры привязываются к нему.
- STEP224: hotfix push‑экранов — `a:menu_push` больше не использует `Object.create(ctx)` (устранён источник ошибок контекста), а `a:support_push` всегда отвечает новым сообщением (`reply`), не попадая в общий error‑handler.
- STEP226: Audit P1 + антикаскад (Neon/Redis) — включена проверка SSL сертификата для Neon (`rejectUnauthorized:true`), rate limiter сделан атомарным (Lua `INCR+EXPIRE` + `ok/allowed` совместимость), а для `✅ Принять` добавлены: PG `pg_try_advisory_xact_lock` (fail-fast при параллельных кликах) + короткий DB timeout и UX «⏳ В обработке…» при Redis degraded (без штормов).
- STEP227: Admin DM UX v2 — системное/админское сообщение пользователю больше не превращается в тупик: под квитанцией всегда остаются `🏠 Главное меню` + `💬 Поддержка`, а `✅ Принято` убирает только себя (не снимает всю клавиатуру).
- STEP228: Audit hardening (money + anti-cascade) — закрыты: F-8 (unknown numeric pack → 0), N-1 (убран non-atomic fallback rate limiter → fail-open), N-2 (unlock contacts переведён на `pg_try_advisory_xact_lock` + `busy` UX), F-5 (ops alerts buffer атомарный Lua), F-7 (IG verify comments с пагинацией до 5 страниц).
- STEP229: Audit buffer flush (lossless) — flush переведён на двухфазную схему Redis list (queue→inflight→ack) без потерь при DB outage; добавлен stuck-requeue (ENV `AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC`) и токен-лок (ENV `AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC`). `/api/health` теперь показывает `audit.buffer.queue_len/inflight_len/inflight_age_sec` и `requeued_today_total`.
- STEP230: Final atomic sweep + health polish — добиты остатки неатомарных связок Redis (INCR+EXPIRE, LPUSH+LTRIM) в счётчиках/буферах (cron counters, acquisition buckets, admin outbox, curator notes, broadcast quarantine); `/api/health` переписан и вылечен (SyntaxError/скобки), вывод стабилен даже при Redis degraded.
- STEP245: Cleanup — убраны backward-compat shims, которые содержали non-atomic паттерны (даже как dead-code). В коде используем только атомарные helper’ы из `src/lib/redis.js` и прямые named imports.

- STEP231: Release preflight — добавлен мини‑runbook “Redis TTL smoke check” (без KEYS, через SCAN + TTL), чтобы перед релизом быстро ловить `TTL=-1` на ключах, которые обязаны истекать. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP246: Release preflight — добавлен grep‑gate `lint:redis-atomic`, который запрещает возвращать в runtime‑код неатомарные связки Redis-команд (LPUSH+LTRIM, INCR+EXPIRE, LRANGE+LTRIM) вне `src/lib/redis.js`. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP247: Release preflight — добавлен grep‑gate `lint:public-contacts`, который предотвращает регрессии “утечки контактов через пользовательский текст” в публичных карточках (offer description / storefront about) до unlock. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP248: Release preflight — добавлен gate `lint:redis-exports`, который гарантирует наличие обязательных named exports в `src/lib/redis.js` (`incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`) и предотвращает падение Vercel на ESM импортах (`does not provide an export named ...`). Дополнительно: в 3 файлах (`bot.js/cron.js/queries.js`) используем namespace import с **atomic/no-op fallback**, чтобы даже при частичном cherry‑pick’е бот не падал на старте. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP250: Repo sync fix — `src/lib/redis.js` теперь реально экспортирует `incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim` (Lua/atomic), а `api/qstash/broadcast-deliver.js` больше не использует non-atomic `INCR+EXPIRE` (переведено на helper). Это чинит падение preflight (`lint:redis-exports`, `lint:redis-atomic`) и исключает Vercel build/regression. Также обновлён `docs/02_ACTION_KEYS_REGISTRY.md`, чтобы `npm run preflight` не оставлял “грязный” diff.
- STEP252: Vercel deprecation hardening — убрали использование query‑getter’а в `/api/*` (cron_router + IG OAuth) и перешли на `new URL(...).searchParams` чтобы не ловить Node `[DEP0169] url.parse()`. В `src/db/pool.js` — безопасная инициализация `statement_timeout` без гонки (устраняет warning про concurrent `client.query()`).
- STEP253: Admin DM (свободный текст) hotfix — исправлен crash в обработчике `adm_user_msg_text` (ReferenceError из-за “висящих” переменных) и сделана подстановка placeholders best‑effort, чтобы админ всегда получал предпросмотр/подтверждение и сообщение реально уходило пользователю.
- STEP254: UX-полировка кнопок под админ‑сообщением — унифицировано «✅ Понятно», исправлен ack без “пустого сообщения”, и приведены в консистентный вид кнопки «📋 Открыть меню» / «💬 Поддержка» (включая best‑effort распознавание старых сообщений без `src:admmsg`).
- STEP255: Шаблон текста под админ‑сообщением — добавлен явный блок «Что дальше» (3 пункта) и синхронизирован предпросмотр админа с тем, что увидит пользователь (меньше путаницы, без изменения логики/кнопок).
- STEP256: Admin DM текст-предсказуемость — заголовок «🟦 Сообщение от администратора…» и выбор отправки: стандартно (с блоком «Что дальше») или коротко (без блока), при этом кнопки под квитанцией остаются теми же.
- STEP257: «Поделиться витриной» — ссылка на витрину перенесена в конец текста (коротко/подробно), чтобы URL не светился в превью чата; шаринг использует единый генератор plain текста.
- STEP262: Витрина (предпросмотр) — кнопки разделены на «Действия» (🔗 Поделиться / 📌 IG шаблоны) и «Мои площадки» (канал/Instagram/портфолио) с аккуратной сеткой 2×N; для владельца кнопка канала переименована в «📣 Мои каналы». Шаринг витрины переведён на `t.me/share/url?text=...` (без `url=`) для стабильной работы во всех клиентах.
- STEP232–STEP233: NotebookLM audit (docs‑only) — подготовлен понятный docs‑pack для аудита по текущему состоянию (без кода), добавлены входной индекс и отдельный prompt для docs‑only. См. `docs/audit/05_NOTEBOOKLM_DOCS_ONLY_ENTRYPOINT_2026_03.md`.







26) **Telegram callback_data ≤ 64 bytes:** динамические кнопки могут молча исчезать, если callback_data > 64 байт. Держим callbacks компактными (short ret-коды `bd/ba`, укороченные action keys `a:bms`, `a:ca`, убираем дублирующие параметры). **STEP308:** добавлен auto‑hydration: если `callback_data` всё же превышает лимит, бот заменяет его на короткий `a:h|h:<token>` и сохраняет исходный callback в Redis (`cbh`, TTL по `CB_HYDRATION_TTL_SEC`). При отсутствии токена/Redis — fail‑open: показываем «кнопка устарела» и даём переход в меню.

27) **Broadcast bc_confirm idempotency (Redis degraded):** подтверждение рассылки (`a:bc_confirm`) должно быть безопасно к двойному клику даже при деградации Redis. Используем fail-fast PG advisory xact lock + короткое DB dedup‑окно (без миграций), чтобы не создавать 2 рассылки из одного draft. См. audit report 27.

28) **rateLimit & Redis TTL hardening:** в инфраструктурном `rateLimit()` убран non‑atomic fallback `INCR+EXPIRE` (который может оставлять ключи без TTL). При деградации Redis — fail‑open, без полуприсваиваний. Brand‑manager state (`bm_mode`, `bm_active_brand`) пишется с длинным TTL (365d), чтобы не жить “вечно”. См. audit report 29.

29) **Payments ledger anti-cascade + users soft-delete:** финансовые таблицы (`stars_payments`, `payments`) **не должны** терять историю при удалении пользователя. `user_id` FK переведены на `ON DELETE RESTRICT`, а вместо физического удаления пользователя используем soft-delete (`users.is_deleted/deleted_at`, опционально `deactivated_at`). См. audit report 31.

30) **Stateless degraded: reset input:** в safe-mode (кнопки `s:*`) добавлена кнопка «🔄 Сбросить ввод». Очистка `expectText/draft` — best-effort: если Redis недоступен, `s:reset_input` показывает предупреждение и не пишет «сброшено». См. audit report 32.

31) **Migration pack sync (preflight gate):** `migration_pack/00_mark_all_applied.sql` авто‑генерируется из `migrations/` (checksum нормализован: LF + `trimEnd`) и теперь проверяется в `npm run preflight` (файл не должен меняться при `npm run gen:migration-pack`). Это предотвращает дрейф pack’а и ложные попытки прогнать уже применённые миграции.

32) **Official publish mini-outbox (QStash):** публикация в @collabka_offers теперь идёт через reserve→enqueue→deliver: операторский клик ставит запись в `PUBLISHING` и ставит задачу в QStash; воркер делает Telegram send/edit и переводит в `ACTIVE` (self-heal verify остаётся страховкой на случай serverless hard-kill). **STEP316:** enqueue/dedup привязан к DB‑reserve (`updated_at`), а при успешном Telegram send/edit и падении на DB‑финализации статус больше не откатываем в `PENDING` — оставляем `PUBLISHING` + Redis breadcrumb + ускоренный verify, чтобы избежать дублей.

33) **PG statement_timeout parameterization:** установка `statement_timeout` теперь делается через `set_config()` с параметром (без интерполяции), с безопасным fallback на `SET/SET LOCAL` при нестандартном поведении pooler’а.

## 1) Платформа и компоненты

### Runtime / hosting
- **Vercel serverless** (stateless функции)
- **Neon Postgres** (дёшево, но бережём CU)
- **Upstash Redis** (locks / краткоживущие состояния / счётчики)
- **QStash / cron** → дергает `/api/cron/*` по расписанию (через `vercel.json` rewrites на единый роутер `api/cron_router.js` — это держит нас в лимите Vercel Hobby по кол-ву функций)

Neon hardening:
- `PG_STATEMENT_TIMEOUT_MS` (default **15000**) — глобальный `statement_timeout` для всех запросов (ставим лениво на connect через **parameterized** `select set_config('statement_timeout', $1, false)`; fallback — `SET statement_timeout TO <ms>`). Для критичных монетизационных транзакций дополнительно используем короткий **transaction-scoped** `select set_config('statement_timeout', $1, true)` (fallback — `SET LOCAL statement_timeout TO <ms>`) как circuit breaker.
- `PG_HEAVY_TX_STATEMENT_TIMEOUT_MS` (optional) — отдельный таймаут для “тяжёлых” транзакций (giveaways draw/finalize). Если не задан, используется `PG_STATEMENT_TIMEOUT_MS`.

### Control Plane (cron endpoints)

> Реализация на Vercel Hobby: один serverless endpoint `api/cron_router.js` + rewrites в `vercel.json` (чтобы не раздувать число функций).
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
- `mon.retry`: breadcrumbs по воркеру монетизации (последний запуск ретрая)
- `mon.intro`: breadcrumbs по интро (💬 Написать) — последний attempt/результат
- `mon.accept`: breadcrumbs по ✅ Принять (Brand Inbox) — последний attempt/результат
- `mon.unlock`: breadcrumbs по 🔓 Разлок контактов — последний attempt/результат
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

Политика TTL:
- `ref:*:d:<YYYYMMDD>` (day buckets) — TTL 60 дней.
- `ref:*:total` (totals) — TTL по умолчанию **365 дней** (bounded memory). Можно отключить TTL и хранить totals “навсегда”: `ACQ_TOTAL_TTL_DAYS=0`.

#### Monetization retry breadcrumbs
После STEP171 воркер `POST /api/qstash/monetization-retry` пишет в Redis “следы” для ops‑наблюдаемости:
- `/api/health.mon.retry.last_at`
- `/api/health.mon.retry.last_action`
- `/api/health.mon.retry.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.retry.last_error` (короткий код причины)

Это помогает быстро увидеть, что QStash‑ретраи реально отрабатывают (и не “молчат”).
Формат short‑code/маскирование/запись ключей централизованы в `src/lib/monDiag.js`.

#### Intro breadcrumbs (💬 Написать)
После STEP179 интро (клик `a:bx_msg` и/или воркер `POST /api/qstash/monetization-retry` с `action=intro_open`) пишет Redis‑breadcrumbs:
- `/api/health.mon.intro.last_at`
- `/api/health.mon.intro.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.intro.last_error` (короткий код)
- `/api/health.mon.intro.last_offer_id` (masked)

Цель: одним взглядом видеть “интро живо / блок (paywall/limit) / ошибка”, не трогая Neon.
Формат short‑code/маскирование/запись ключей централизованы в `src/lib/monDiag.js`.


#### Accept breadcrumbs (✅ Принять)
После STEP183 клики `a:brand_app_accept` и/или воркер `POST /api/qstash/monetization-retry` (action=`brand_app_accept`) пишут Redis‑breadcrumbs:
- `/api/health.mon.accept.last_at`
- `/api/health.mon.accept.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.accept.last_error` (короткий код)
- `/api/health.mon.accept.last_app_id` (masked)
- `/api/health.mon.accept.last_source` (`click` / `worker`)

Цель: одним взглядом видеть “✅ Принять живо / уже в очереди / paywall / ошибка”, не трогая Neon.

#### Unlock breadcrumbs (🔓 Разлок контактов)
После STEP183 клики `a:wsp_contact_unlock` и/или воркер `POST /api/qstash/monetization-retry` (action=`wsp_contact_unlock`) пишут Redis‑breadcrumbs:
- `/api/health.mon.unlock.last_at`
- `/api/health.mon.unlock.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.unlock.last_error` (короткий код)
- `/api/health.mon.unlock.last_ws_id` (masked)
- `/api/health.mon.unlock.last_source` (`click` / `worker`)

Цель: быстро видеть “разлок отрабатывает / в очереди / недостаточно кредитов / ошибка”, без DB.

---

## 3) Инварианты безопасности

- Serverless = только пакетная обработка, никаких “вечных” циклов.
- Cron: **Redis token-lock** (safe unlock) + где критично **PG advisory lock** + SQL guards на статусных переходах.
- Winners draw: детерминированно/воспроизводимо, guards по статусам (`winners_drawn_at`, транзакции). Seed считается по **отсортированным eligible user ids** (order‑independent).
- Миграции: только `migrations/run.js` (exactly-once + checksum). Checksum считается по **нормализованному SQL** (LF + `trimEnd`) для устойчивости к CRLF/LF и «финальному переводу строки», при этом раннер совместим со старыми checksum значениями.
- Migration pack (Neon move/emergency): `migration_pack/00_mark_all_applied.sql` обновлён под миграции до `041_*.sql`; `migration_pack/01_reconcile.sql` расширен как safety‑net. Pack‑файлы **не** дублируем в `migrations/`.
- STEP163: добавлен генератор `npm run gen:migration-pack` (скрипт `scripts/gen-mark-all-applied.js`) — пересчитывает sha256 из `migrations/` и обновляет `migration_pack/00_mark_all_applied.sql` детерминированно.
- Горячие UI-пути: **не добавлять DB-запросы** в рендер меню/кнопок без сильного обоснования.

---

## 4) Ключевые продуктовые зоны

### A0) Discovery surfaces: витрина / лента / каталог (STEP157 docs-only)
Это не одна ‘инста-лента’. В боте есть 3 разные поверхности просмотра:
- **Витрина креатора** — публичная карточка *одного* профиля (workspace), открывается по ссылке/из ленты/из поиска.
- **Лента креаторов для брендов** — feed из **офферов/карточек креаторов**, а не из профилей подряд.
- **Каталог брендов для креаторов** — feed брендов, обычно только с заполненным профилем (4/4).

UX guardrail:
- В режиме **Creator** в меню `🎬 UGC / Офферы` **не показываем** кнопку `📰 Лента креаторов` (это Brand‑режим). Бренды открывают ленту через `🏷 Для брендов` / Brand меню.

Производительность/UX:
- Лента: пагинация `limit/offset` + кнопки `⬅️/➡️`.
- Каталог: `PAGE_SIZE+1` без тяжёлого `COUNT(*)`.

Подробно: `docs/31_FEEDS_VITRINES_CATALOGS.md`.

Публичное объяснение (для постов/FAQ): `docs/public/11_feeds_and_discovery_ru.md`.

### A) Brand Team UX V4
Принцип: **кнопка видна всегда**, доступ гейтится *внутри* фичи, есть “Почему так?” и корректный back через `ret`.
Подробно: `docs/14_BRAND_TEAM_UX_V4.md`.


### A1) Brand Pass / credits balance — Redis-only UI (STEP153–155)
Политика: в **горячих экранах** баланс кредитов **не читаем из DB**. Показываем только то, что есть в Redis:
- Brand Inbox (карточка заявки `status=new`)
- Публичная витрина креатора (`renderWsPublicProfile`)
- Диалог по заявке бренда (`renderBrandLeadDialog`)
- Brand hub (`bx_open`, `ws=0`)

Если Redis‑кеша нет → показываем `💳 Кредиты: —` (и CTA на покупку/операцию), **без** fallback в Neon.

Redis keys:
- `brand_credits:<brandUserId>` — short TTL (`BRAND_CREDITS_CACHE_TTL_SEC`, default **60s**)
- `brand_credits_snap:<brandUserId>` — snapshot для гидрации (`BRAND_CREDITS_SNAP_TTL_SEC`, default **90d**)

Прогрев/гидрация:
- на входе в hub используем `getBrandCreditsRedisOnly({ warm:true })` → продлевает TTL и обновляет snapshot
- если короткий ключ пуст — гидратим из `brand_credits_snap:*` (всё ещё Redis‑only)

Обновление кеша (best‑effort):
- после мутаций кредитов (покупка/accept/unlock/интро) вызываем `setBrandCreditsCache(brandUserId, newBalance)`

STEP166 (P0): **монетизация не должна “умирать” из‑за Redis/прочерка**.
- CTA **✅ Принять** и **🔓 Разлок контактов** показываем всегда (даже если баланс = `—`).
- Проверка баланса/списание — **только на клике** (DB truth + idempotency).
- В реестре действий `src/bot/actionRegistry.js` `a:brand_app_accept` не требует Redis (иначе accept блокируется при деградации Redis).

STEP167 (P0): **anti-ORPHANED платежи + буфер против гонок cron**.
- Auto-heal ORPHANED `missing_session` теперь **не трогает** слишком свежие платежи (по умолчанию ~5 минут).
- ENV: `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC` (0..3600, default 300).
- UX при `missing_session`: если auto-heal включён, бот сообщает, что попробует применить оплату автоматически в течение ~N минут.

STEP171 (P0): **Monetization circuit breaker** (Neon slow → без таймаутов в UI)
- Для критичных списаний (✅ Принять / 🔓 Разлок контактов) ставим короткий timeout на DB‑операции.
- Если Neon отвечает медленно → показываем «⏳ В обработке…» и ставим безопасный ретрай в QStash: `POST /api/qstash/monetization-retry`.
- Ретрай идемпотентен: exact‑once списание держим на уровне SQL guards / advisory lock.
- ENV:
  - `MONETIZATION_CB_TIMEOUT_MS` (default 2000)
  - `MONETIZATION_QSTASH_DELAY_SEC` (default 10)
  - `MONETIZATION_NOTIFY_TTL_SEC` (default 90d)



STEP174 (P0/P1): **Optimistic accept/unlock** (queue‑first + token‑lock)
- Если QStash retry настроен, то критичные списания (✅ Принять / 🔓 Разлок контактов) выполняются **через очередь**, без ожидания синхронного DB‑write.
- На клике берём **Redis token‑lock** (safe lock) на ~10 минут и публикуем задачу в QStash (dedup). UI сразу показывает «⏳ В обработке…» + кнопку обновления.
- Воркер `POST /api/qstash/monetization-retry` выполняет DB‑truth мутацию идемпотентно, обновляет Redis кеши и **best‑effort** освобождает token‑lock (или он сам истечёт по TTL).
- Fail‑open: если Redis недоступен или QStash не настроен — остаётся прежний синхронный путь (и STEP171 circuit breaker на таймауты).

ENV:
- `MONETIZATION_TOKEN_LOCK_TTL_SEC` (default **600**, min 60, max 3600) — TTL token‑lock для “optimistic queue‑first”.


STEP175 (P1): **UI anti-spam по token‑lock** (Redis-only)
- Пока активен monetization token‑lock, **скрываем кнопки списания** в UI и показываем “pending”:
  - Brand Inbox карточка заявки (`status=new`): скрываем **✅ Принять**, показываем «⏳ …в обработке» + «🔄 Обновить».
  - Витрина (locked contacts): скрываем CTA на разлок контактов, показываем «⏳ …в обработке» + «🔄 Обновить».
  - Экран разлока (`a:wsp_contact_req`): если разлок уже в очереди — не показываем кнопку списания повторно.
- Реализация: **только Redis GET** по ключам `mon:lock:*` (без DB‑чтений в этих рендерах).


STEP176 (P0/P1): **Intro open hardening** (token-lock + circuit breaker + optional QStash commit)
- Клик «💬 Написать» (это интро = открытие нового диалога) защищён от дублей и зависаний:
  - берём Redis token‑lock `mon:lock:intro_open:<offerId>:<buyerUserId>` (TTL ~10м)
  - быстрый sync‑путь остаётся (как раньше), но при транзиентных ошибках/timeout → «⏳ В обработке…»
- При медленном Neon задача ставится в QStash (`action=intro_open` → `POST /api/qstash/monetization-retry`, dedup).
  Воркер открывает диалог/списывает кредиты идемпотентно и шлёт Telegram‑уведомление с кнопкой “Открыть диалог”.
- UI anti‑spam: пока token‑lock активен, в `renderBxPublicView` скрываем «💬 Написать» и показываем “pending” + кнопки “Inbox/Обновить” (Redis‑only, без DB).


STEP177 (P0/P1): **Intro fail-open guard (Redis degraded safe)**
- Действие `a:bx_msg` (клик «💬 Написать») переведено на fail-open guard (без fail-closed блокировок на входе), чтобы при деградации Redis кнопка не становилась “мёртвой”.
- При недоступном Redis продолжаем работать через короткий DB timeout (circuit breaker) и/или QStash retry (dedup), показывая пользователю понятный pending UI.


STEP178 (P0): **Intro DB exact-once guard (advisory lock)**
- В `getOrCreateBarterThreadWithCredits()` добавлен `pg_advisory_xact_lock` по паре `(offer_id, buyer_user_id)` + повторная проверка существующего треда после lock.
- Цель: исключить гонки/дубли при двойном клике и параллельных вызовах (sync + QStash), а также убрать ложные ответы типа “paywall/limit” если тред уже создан другим запросом.


STEP180 (P1): **Monetization diagnostics helper** (`src/lib/monDiag.js`)
- Централизовали утилиты: short‑code, маскирование id, запись Redis breadcrumbs (`mon.retry`, `mon.intro`).
- Цель: убрать дублирование и исключить дрейф форматов/ключей/TTL, без изменения продуктовой логики.

STEP181 (P1): **Pending UX standardization (Redis-only)**
- Привели “pending” состояния к одному стандарту в ключевых монетизационных кликах:
  - ✅ Принять (Brand Inbox)
  - 🔓 Разлок контактов (витрина / экран разлока)
  - 💬 Интро (Написать)
- Везде быстрые кнопки: **📥 Inbox + 🔄 Обновить** (и **💳 Купить ещё** там, где уместно).
- В рендерах pending используем только **Redis token‑lock / breadcrumbs** (без DB‑чтений в UI).




### A2) Unified navigation footer (STEP160)
Во всех экранах (кроме корневых меню и safety-mode `s:*`) используется единый footer‑ряд:
- **⬅️ Назад** — возврат в предыдущий экран (return-to)
- **📋 Меню** — хаб текущей роли (Creator/Brand)
- **🏠 Home** — home-hub (переключение ролей/быстрый старт)

Технически: helper’ы `navKb(backCb)` и `kbNavRow(kb, backCb)` в `src/bot/bot.js`.
Цель: убрать путаницу “⬅️ Меню” и исключить тупики/скачки навигации (в т.ч. в админских экранах, PRO/папках, Brand Team, поиске креаторов, шагах розыгрыша).

#### A2.1) Авто‑проверка консистентности footer’ов (STEP161)
Чтобы футеры больше не “расползались”, добавлен маленький линтер без зависимостей:
- `scripts/lint-footer-nav.js`
- запуск: `npm run lint:nav`

Что проверяет (эвристика): если клавиатура содержит back‑кнопку (`⬅️ Назад/Отмена/Админка/Операции/Коммуникации/Система`), то рядом обязаны быть **и** `📋 Меню`, **и** `🏠 Home` (или используется `navKb/kbNavRow/kbAdminFooter`).

Опционально для жёсткого аудита: `NAVLINT_STRICT=1 npm run lint:nav` — начнёт требовать `📋 Меню + 🏠 Home` даже для клавиатур, где есть back‑кнопка, но Menu/Home не планировались.


### B) Broadcast (рассылки)
Состояние (актуально):
- Тик может запускаться по расписанию (обычно 1 раз/час) или вручную (QStash “Run it manually”).
- Поддержка контента:
  - текст (включая “ссылку в слово”: Telegram entities → HTML)
  - фото / видео / GIF / документ (подпись — по желанию)
  - альбомы не поддерживаются (одно сообщение = один пост)
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

Опционально (P3, расширение поверхности):
- QStash fan-out доставка (serverless-safe): cron только энкьюит задачи, доставляет воркер `POST /api/qstash/broadcast-deliver`.
- Воркер fan-out при 429:
  - **не помечает non-retryable** (получатели не “теряются”)
  - пишет `deferred/quarantined` и **сам перепубликует job** с `delaySec`
  - проверяет Redis cooldown **до DB reads** (защита Neon от лавины)
  - micro-memo: `QSTASH_BC_COOLDOWN_MEMO_TTL_MS`
- Runtime toggle (Redis): `sys:broadcast_qstash_fanout` (по умолчанию OFF).
- Setup/rollout: `docs/10_QSTASH_RUNBOOK.md`.
- Admin self-check: 👑 Админка → 🛰 QStash статус → 🧪 Send signed ping (endpoint `POST /api/qstash/ping`).
- Структура 👑 Админки (STEP200): 3 экрана — 🧰 Операции / 💬 Коммуникации / ⚙️ Система (только UX, без смены логики).
- Admin UX Standard (STEP201): `docs/process/09_ADMIN_UX_STANDARD.md` — правила футеров/названий/рядов кнопок + фиксы консистентности по админ‑экранам.
- Навигация: на экране “🛰 QStash статус” кнопка “⬅️ Система” ведёт в 👑 Админка → ⚙️ Система, “📋 Меню” — в пользовательское меню.

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

### E) Instagram (OAuth) — временно выключено

План был: **OAuth-only** (без комментариев/кодов), где:
- **Verified badge** = trust-signal (можно показывать до unlock)
- **@handle/ссылка** = контакт и выдаётся только **после unlock**

Но на практике Meta начала возвращать `pages=0` и местами блокировать доступ к Pages/приложению.
Чтобы не ломать UX и не тормозить запуск, мы:
- **скрыли кнопку IG подключения в профиле** (пользователь видит “функция пока недоступна”)
- **оставили код/миграции**, чтобы вернуться позже, но **закрыли OAuth API при скрытом UI**:
  - если `IG_OAUTH_UI_ENABLED=0` → `/api/ig/oauth/*` возвращает **404** (нет “теневого API”)
  - master kill‑switch: `IG_ROUTES_ENABLED=0` → **весь** `/api/ig/*` (включая cron) возвращает **404** (даже если роуты физически есть)

Доки:
- Runbook: `docs/22_IG_GRAPH_OAUTH_2026.md`
- Пост‑мортем + план возврата: `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`
- Спека: `docs/spec/24_IG_INTEGRATION_SPEC.md`

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

> Примечание: `CONTACT_UNLOCK_COST`, `CONTACT_UNLOCK_TTL_DAYS`, `BRAND_CREDITS_CACHE_TTL_SEC`, `BRAND_CREDITS_SNAP_TTL_SEC`, `BRAND_APP_ACCEPT_COST` читаются напрямую в `src/bot/bot.js` (не через `CFG`).

Instagram (текущий режим: **только ссылка в карточке**, OAuth/верификация выключены):
- `IG_OAUTH_UI_ENABLED=0` — прячет UI подключения и закрывает `/api/ig/oauth/*`.
- `IG_OAUTH_ENABLED=0` — OAuth не стартует даже при случайном доступе к UI.
- `IG_ROUTES_ENABLED=0` — kill‑switch: закрывает весь `/api/ig/*` и IG cron.
- `IG_VERIFY_TICK_ENABLED=0` — выключает legacy verify‑cron по комментариям.
- `IG_OAUTH_CLIENT_ID/SECRET`, `IG_VERIFY_ACCESS_TOKEN`, `IG_VERIFY_MEDIA_ID` — можно оставить пустыми, пока UI скрыт.
- `IG_TOKEN_ENC_KEY` — <b>строгий</b>: только <code>hex64</code> (32 bytes) или <code>base64/base64url</code> (>=32 bytes). Если включишь IG OAuth (UI+routes) без валидного ключа — OAuth будет заблокирован как misconfigured.
> Instagram как ссылка/поле профиля остаётся; показывается брендам только после unlock (контакты скрыты до оплаты).


- **BOT**: `BOT_ID` `BOT_TOKEN` `BOT_USERNAME` `BOT_VARIANT`
- **APP**: `APP_ENV`
- **DATABASE**: `DATABASE_URL`
- **UPSTASH**: `UPSTASH_REDIS_REST_TOKEN` `UPSTASH_REDIS_REST_URL`
- **CRON**: `CRON_SECRET`
- **SUPER**: `SUPER_ADMIN_TG_IDS`
- **SUPPORT**: `SUPPORT_CHAT_ID`
- **OPS**: `OPS_ALERT_BUFFER_MAX` `OPS_ALERT_SILENT` `OPS_ALERT_SUMMARY_MIN`
- **PAYMENT**: `PAYMENT_SESSION_TTL_MIN`
- **CONTACTS**: `CONTACT_UNLOCK_COST` `CONTACT_UNLOCK_TTL_DAYS` `BRAND_CREDITS_CACHE_TTL_SEC` `BRAND_CREDITS_SNAP_TTL_SEC`
- **PAYMENTS**: `PAYMENTS_ACCEPT_DEFAULT` `PAYMENTS_AUTO_APPLY_DEFAULT` `PAYMENTS_FALLBACK_APPLY_ENABLED` `PAYMENTS_PAYLOAD_HMAC_KEY` `PAYMENTS_PAYLOAD_HMAC_LEN` `PAYMENTS_FALLBACK_ALLOW_UNSIGNED` `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED` `PAYMENTS_ORPHANED_AUTOHEAL_BATCH` `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC`
- **FOUNDER**: `FOUNDER_BRAND_12M_CREDITS` `FOUNDER_BRAND_12M_PRICE` `FOUNDER_BRAND_3M_CREDITS` `FOUNDER_BRAND_3M_PRICE` `FOUNDER_CREATOR_12M_PRICE` `FOUNDER_SALE_DEADLINE` `FOUNDER_SALE_ENABLED`
- **INTRO**: `INTRO_COST_PER_INTRO` `INTRO_DAILY_LIMIT` `INTRO_DAILY_LIMIT_UNVERIFIED` `INTRO_RATE_LIMIT` `INTRO_RATE_WINDOW_SEC` `INTRO_RETRY_AFTER_HOURS` `INTRO_RETRY_ENABLED` `INTRO_RETRY_EXPIRES_DAYS` `INTRO_RETRY_NOTIFY` `INTRO_TRIAL_CREDITS`
- **AUDIT**: `AUDIT_DB_ENABLED` `AUDIT_DB_THROTTLE_ENABLED` `AUDIT_DB_THROTTLE_LIMIT` `AUDIT_DB_THROTTLE_PREFIXES` `AUDIT_DB_THROTTLE_WINDOW_SEC` `AUDIT_BUFFER_ENABLED` `AUDIT_BUFFER_ON_DB_ERROR` `AUDIT_BUFFER_MAX_LEN` `AUDIT_BUFFER_TTL_SEC` `AUDIT_BUFFER_FLUSH_BATCH` `AUDIT_BUFFER_FLUSH_MAX_MS` `AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC` `AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC` `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC`
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
- **OFFICIAL**: `OFFICIAL_1D_PRICE` `OFFICIAL_30D_PRICE` `OFFICIAL_7D_PRICE` `OFFICIAL_CHANNEL_ID` `OFFICIAL_CHANNEL_USERNAME` `OFFICIAL_MANUAL_DEFAULT_DAYS` `OFFICIAL_PUBLISH_ENABLED` `OFFICIAL_PUBLISH_MODE` `OFFICIAL_PUBLISH_SELFHEAL_DELAY_SEC` `OFFICIAL_PUBLISH_SELFHEAL_MIN_AGE_SEC` `OFFICIAL_PUBLISH_SELFHEAL_MSGID_TTL_SEC`
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
- До ✅ Принять (status=new) скрываем ‘💬 В работу / ✅ Закрыть’ — чтобы не было сценария ‘переместил и потерял’. Доступны только: ✅ Принять, ⛔ Спам, 🗑 Удалить.
- В статусе `new` рядом с подсказкой показываем **баланс кредитов** (Redis‑only, без DB fallback). Если кэша нет — показываем «—» и предлагаем открыть Brand Pass.
- Кнопка креатора «💬 Написать бренду» открывает экран отправки сообщения. Если кеш/сессии временно недоступны — показываем понятное сообщение и кнопку «📨 Открыть заявку» (без ‘тишины’).



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
- `AUDIT_DB_THROTTLE_PREFIXES` — какие audit-события считаем шумными.
  - Default (guardrail): `lead.,folders.,ws.profile_,deal.,inbox.`
  - Можно расширять точечно после метрик в `/api/health`
- Поведение при деградации Redis: для событий, попавших под throttle-prefix, аудит **fail-closed** (просто дропаем запись), чтобы не “сжечь” Neon лишними INSERT.

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


### Последние критичные изменения (2026-03-01)
- **Instagram OAuth/верификация отключены** (сейчас Instagram — только ссылка в карточке креатора, без OAuth). Для полной “заморозки” IG выставить: `IG_OAUTH_UI_ENABLED=0`, `IG_OAUTH_ENABLED=0`, `IG_ROUTES_ENABLED=0`, `IG_VERIFY_TICK_ENABLED=0`.
- **Ручная верификация — единственная активная** (заявка → очередь модерации → approve/reject). ✅-бейдж — внутри бота (не Telegram-эмоджи) и влияет на UX/лимиты.
- **Admin → User сообщения (DM) приведены к канону “квитанция без тупиков”**: `🏠 Главное меню` / `💬 Поддержка` всегда остаются, `✅ Принято` убирает только себя.
- **Audit hardening:** SSL verify для Neon, rate limiter атомарный Lua (fail-open при деградации), ops alerts атомарный Lua.
- **Audit flush lossless:** очередь `audit:*` теперь двухфазная `queue → inflight → ack` с auto‑requeue при “залипании”.
- **Финальный sweep Redis TTL:** убраны остатки неатомарных связок (`INCR+EXPIRE`, `LPUSH+LTRIM`) и добавлен preflight “Redis TTL smoke check” (docs/process/10_RELEASE_PREFLIGHT.md).

- `/api/health`: cron last_run + безопасные Redis-метрики
- Audit write-shedding (ENV-гейт) + счётчики suppressed в health
- Broadcast: URL-кнопки до 3, deep-link shortcuts, шаблоны кнопок, ссылки “в слово”, финальный экран с кнопками
- Role gate на `/start` (Redis `ui_mode`, payload priority, fail-open)

- Contacts / Brand Pass (P2): structured contacts (`profile_contacts` JSONB) + opt-in UI + перенос из «Контакт» + явные подсказки (см. `docs/20_CONTACTS_MODEL.md`).

- Anti-bypass: телефоны, написанные **словами**, маскируем в `profile_about` до unlock (STEP119).
- Broadcast 429: Redis cooldown + **DB fuse** `broadcasts.cooldown_until` при деградации Redis (STEP120).
- Admin break-glass: при Redis down супер‑админ может открыть allowlist (payments/users/audit) через `bg=1` + ops alert (STEP121).
- Payments auto-heal: ops alerts при `validation_failed` / `manual_required` (STEP122).
- Brand Inbox UX: до ✅ Принять (status=new) доступны только ✅ Принять / ⛔ Спам / 🗑 Удалить; фикс креаторского CTA «💬 Написать бренду» (STEP124).

- Official channel publish: token-lock + DB-reserve (PUBLISHING) для защиты от дублей
- Broadcast: Redis cooldown на 429 + отображение cooldown в `/api/health`
- Cron: token-based locks (safe unlock) + SQL atomic guards на критичных статусных переходах
- Cron: Telegram notify обёрнуты в `withTimeout(~5s)` чтобы тик не “залипал”
- Brand Pass UX: «💳 Купить ещё» из витрины креатора → Brand Pass → кнопка «⬅️ Вернуться к витрине».
- Creator → заявки брендам: «✍️ Написать заявку» включает явный режим ввода + «❌ Отмена ввода» (без “тишины”).
- Brand Inbox: «✅ Принять» — точка списания (exactly‑once), до принятия нельзя «Ответить/Шаблоны»; показываем баланс кредитов (Redis-only).
- Brand Inbox guards (STEP317): при отправке сообщений (brand reply / creator chat) повторно проверяем DB‑status и никогда не двигаем `new → in_progress` без ✅ Принять (без скрытых обходов).
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


## STEP190 — Admin: шаблоны DM для сообщений пользователям (Redis-only CRUD)

Расширили STEP187: шаблоны для “✉️ Написать пользователю” больше не хардкод.

- Хранение: **только Redis** (key `sys:admin_dm_templates`).
- Админка: `👑 Админка → 📌 Шаблоны DM`
  - список шаблонов (пагинация),
  - **➕ Новый шаблон** (1-я строка — название кнопки, дальше — текст),
  - **✏️ Изменить / 🗑 Удалить**,
  - **♻️ Сбросить к дефолту** (удаляет кастомный набор из Redis).
- В карточке пользователя (`👑 Админка → Пользователи → Карточка → ✉️ Написать`) кнопки шаблонов берутся из Redis; если кастома нет или Redis недоступен — используем дефолтный набор.
- Без миграций и без DB‑логов: всё управление и хранение — Redis-only.


## STEP191 — Admin DM: плейсхолдеры в шаблонах + “📎 вставить” (Redis-only)

Расширили STEP190/STEP187: шаблоны и свободный текст теперь поддерживают плейсхолдеры, которые подставляются в предпросмотре и ещё раз при отправке.

- Плейсхолдеры (строгий allowlist):
  - `{{username}}` — `@username` получателя (если есть),
  - `{{user_id}}` — TG ID получателя,
  - `{{first_name}}` — имя (Telegram `first_name`, best-effort),
  - `{{role}}` — `brand/creator/unknown` (определяем только из Redis `ui_mode`),
  - `{{bot_name}}` — “Collabka PR”.
- Подстановка значений:
  - предпросмотр — показывает уже “развёрнутый” текст,
  - отправка — делает подстановку повторно (на случай изменений username/first_name).
- UI:
  - в “✉️ Написать” и в редакторе шаблонов добавлена кнопка **📎 Вставить** (подсказка + примеры).
- Без миграций/DB: всё остаётся Redis-only, без сканов Neon.



## STEP193 — Admin: Outbox лог отправок (Redis-only)

- В админке добавлен экран: `👑 Админка → 📤 Outbox`.
- Хранение: **только Redis** (list key `admin_outbox`, хранится как `mg:<env>:admin_outbox`), последние ~200 записей (LPUSH + LTRIM).
- Запись создаётся на каждую попытку отправки DM из STEP187 (шаблон или свободный текст):
  - время, кому, кто отправил,
  - статус `ok` / `failed`,
  - короткий snippet текста (до ~900 символов) + hash,
  - (если есть) название шаблона + использованные плейсхолдеры,
  - ошибка Telegram (коротко) при `failed`.
- Это не DB‑лог и не рассылка: **никаких миграций**, Neon не трогаем.
- В экране есть кнопка **«🧹 Очистить»** (с подтверждением).





## STEP204 — Outbox: быстрые действия (повтор / заметка / в шаблон)

Цель: превратить Outbox в “центр поддержки”, чтобы из истории отправок можно было сразу продолжить кейс.

- В просмотре записи Outbox (`📤 Outbox` → запись) добавлены действия:
  - **`✉️ Повторить`** — берём текст из snippet записи → предпросмотр → отправка. После отправки остаёмся в Outbox (return route).
  - **`📝 Заметка`** — открывает заметку/теги пользователя (STEP194/195) с кнопкой возврата в Outbox.
  - **`📌 В шаблон`** — сохраняет текст записи как новый DM‑шаблон (STEP190) по введённому названию.
- Safeties:
  - повтор/сохранение в шаблон доступны **только в DM** с ботом (в группах показываем подсказку), чтобы не светить текст/шаблоны;
  - без миграций и без DB‑сканов: используем Redis (outbox list + templates key + краткий return‑context для заметок).
## STEP194 — Admin: заметки в карточке пользователя (Redis-only)

- В карточке пользователя (`👑 Админка → Пользователи → Карточка`) добавили **заметку админа**:
  - в карточке показываем короткий snippet (только в DM, чтобы не светить заметки в группах),
  - отдельный экран `📝 Заметка (admin)` — ✏️ изменить / 🧹 очистить.
- Хранение: **только Redis** (key `mg:<env>:adm_user_note:<userId>`), без DB-миграций/таблиц.
- Редактирование: ввод одним сообщением через `expectText` (TTL 20 минут). Команды: `clear`, `/cancel`.
- Это внутренняя админ-фича для поддержки: на пользователей никак не влияет и не создаёт рассылок.



## STEP195 — Admin: теги к заметке (Redis-only, strict allowlist)

- В `📝 Заметка (admin)` добавлены **теги** (кнопками), чтобы быстро помечать пользователей без ручного текста.
- Теги — строгий allowlist (MVP): `VIP`, `SPAM?`, `FOLLOW`, `PAY`.
- Хранение: тот же Redis key `mg:<env>:adm_user_note:<userId>`, но теперь значение — объект:
  - `text` (может быть пустым),
  - `tags` (array),
  - `updatedAt`, `byAdminTgId`, `byAdminUsername`.
- Backward compatible: старые заметки-строки продолжают читаться (просто без тегов).
- Очистка: “🧹 Очистить всё” удаляет и текст и теги.



## STEP196 — Admin: индикатор заметок/тегов в списке пользователей (Redis-only)

- В `👑 Админка → 👥 Пользователи` добавили маркер **📝** и (опционально) 1–2 коротких тега прямо в списке.
- Показ — **только в DM** с ботом (в группах не показываем), чтобы внутренние пометки не “светились” случайно.
- Реализация: Redis-only bulk load для списка на странице (MGET если доступен; fallback на GET), Neon не трогаем.
- Для быстрых кнопок (если на странице 1–5 пользователей) добавили `📝` прямо в label кнопки карточки.



## STEP197 — Admin: быстрые действия из списка пользователей (DM-only)

- В `👑 Админка → 👥 Пользователи`, если на странице **1–5** результатов, показываем быстрые действия прямо в списке (только в DM):
  - `👤` — карточка пользователя,
  - `✉️` — написать пользователю (STEP187/190/191),
  - `📝` — заметка/теги (STEP194/195).
- Это ускоряет поддержку: можно сразу написать/пометить пользователя без захода в карточку.
- В групповых чатах быстрые действия не показываем, чтобы не светить внутренние элементы UI случайно.


## STEP198 — UX системных сообщений пользователям (admin DM + System Notice)

Цель: чтобы сообщения “от проекта” были максимально понятны и не путали пользователя кнопками.

- **Admin DM (STEP187):** сообщение приходит с явной шапкой “от администрации” и минимальными, однозначными CTA:
  - `🏠 Главное меню` → открыть меню **новым** UI‑сообщением (исходная “квитанция” остаётся как есть).
  - `💬 Поддержка` → открыть поддержку **новым** сообщением (квитанция не трогаем).
  - `✅ Принято` → убрать только кнопку `✅`, но оставить `🏠 Главное меню` + `💬 Поддержка` (нет “пустых сообщений без кнопок”).
  - Для этого в callback-data используем `|src:admmsg` (push‑обработчики не снимают reply_markup у квитанции).

- **System Notice (STEP188/189):**
  - при показе “1 раз на версию” кнопки унифицированы: `📋 Открыть меню` / `💬 Поддержка` / `✅ Понятно`,
  - добавлена возможность **открыть объявление повторно**: в `📋 Меню` и `🏠 Home` появляется кнопка `📣 Актуальное объявление` (только если notice активен, не истёк и таргет подходит роли). Нажатие показывает текущий notice, **не влияя** на `seen`.

- Всё остаётся **без рассылки** и **без DB**: только Redis, no-regressions.



## STEP199 — UX: “🧭 Быстрый старт” перенесён в Help/Support (меньше шума в меню)

Цель: убрать лишнюю “шумную” кнопку из основных хабов и оставить быстрый старт там, где его ожидают как справку.

- Убрали `🧭 Быстрый старт` из:
  - `📋 Меню` (Creator/Brand),
  - `🏠 Home`,
  - Curator Mode меню/кабинета.
- Быстрый старт остаётся доступен через:
  - `💬 Поддержка` (кнопка `🧭 Быстрый старт` внутри экрана поддержки),
    - примечание: из admin DM (push) поддержка намеренно минимальная и может не показывать `🧭 Быстрый старт`.
  - команду `/help`.
- Никаких миграций/DB — только перестановка кнопок. Zero regressions.

### Payments: TTL сессии оплаты (чтобы не ловить ORPHANED)

- `PAYMENT_SESSION_TTL_MIN=360` — TTL (в минутах) для Redis-сессий оплаты `pay_*` (контекст счёта: wsId/ret/packId и т.д.).
  Если TTL слишком короткий и пользователь оплачивает поздно, возможен статус ORPHANED `missing_session`.
  Диапазон: 10..1440 минут (10 минут .. 24 часа).

### Payments: fallback apply без pay_* сессии (anti-ORPHANED)

- `PAYMENTS_FALLBACK_APPLY_ENABLED=0` (default) — строгий режим: без `pay_*` сессии оплата станет ORPHANED `missing_session` (дальше — поддержка/ручная обработка).
- `PAYMENTS_FALLBACK_APPLY_ENABLED=1` — разрешить auto-apply по `invoice_payload`, если `pay_*` сессия истекла (использовать осознанно, обычно только при инцидентах).

**HMAC hardening (рекомендуется):**
- `PAYMENTS_PAYLOAD_HMAC_KEY=...` — секрет для подписи payload (HMAC-SHA256). Если задан, новые Stars-инвойсы подписываются (token+sig).
- `PAYMENTS_PAYLOAD_HMAC_LEN=10` — длина hex-подписи (6..16).
- `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0` (default) — не применять fallback для старых/неподписанных payload, если HMAC включён. Временно можно поставить `1`, чтобы “дожать” старые инвойсы.

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

- Показ баланса в горячих UX (вход в BX/Inbox/витрина) — <b>строго Redis-only</b>, без DB-fallback.
- Redis кеш баланса: короткий TTL ключ `brand_credits:<brandUserId>` + долгоживущий snapshot `brand_credits_snap:<brandUserId>`; при входе в brand-hub snapshot прогревается/обновляется, а короткий ключ гидратируется из snapshot при необходимости.

- В базе есть общий баланс `brand_credits` и отдельный остаток подарков `brand_credits_gifted`.
- При списании кредиты тратятся сначала из подарочных (уменьшается `brand_credits_gifted` до 0).
- Команда «🧾 забрать подарочные» снимает только остаток подарочных, не затрагивая купленные/триал.

---

## STEP187 — Admin: сообщения пользователям из карточки (MVP)

- В `👑 Админка → Пользователи → Карточка пользователя` добавлена кнопка **«✉️ Написать»**.
- Можно отправить:
  - **шаблонное** сообщение (6 быстрых шаблонов),
  - **свободный текст** (вводится в DM с ботом, затем предпросмотр и подтверждение).
- Без миграций/DB-логов: отправка — через Telegram `sendMessage`.
- Защита от двойных кликов: best‑effort Redis dedup на 60 сек по `(admin_tg_id, target_tg_id, hash(text))`.
- Лог отправки (best‑effort): в `SUPPORT_CHAT_ID` (если задан) иначе всем `SUPER_ADMIN_TG_IDS`.


## STEP188 — System Notice (Redis-only banner, без рассылки)

- В админке добавлен экран: `👑 Админка → 📣 Объявление`.
- Объявление хранится **только в Redis** (без DB), ключ: `sys:notice` (object):
  - `active` — показывать или нет,
  - `severity` — `info` / `warn` / `critical`,
  - `version` — номер версии (целое число),
  - `text` — текст объявления,
  - `updatedAt` — время последнего изменения (best-effort).
- Публикация: кнопка **«🚀 Опубликовать (новая версия)»** увеличивает `version` на 1 и включает `active=ON`.
- Показ пользователям: при входе в `📋 Меню` или `🏠 Home` бот делает **Redis-only** проверку:
  - если `active=ON`, `version>0` и у пользователя нет метки `seen` для этой версии — отправляет объявление отдельным сообщением и ставит `seen`.
  - `seen` ключ: `sys:notice:seen:<tg_id>:<version>` (TTL ~180 дней).
- Это **не broadcast**: нет массовой отправки и нет DB‑сканов; сообщение “подхватывается” только когда пользователь сам открывает меню/хаб.


## STEP189 — System Notice v2 (targeting + CTA + auto-expire)

Расширили System Notice (STEP188), всё ещё **Redis-only** и **без рассылки**.

- Новые поля `sys:notice`:
  - `target` — `all` / `brand` / `creator` (таргетинг по роли, определяем **только из Redis**: `ui_mode` + `bm_mode`),
  - `ctaLabel` / `ctaUrl` — опциональная URL‑кнопка,
  - `expiresAt` — auto‑expire (epoch seconds; в админке можно вводить ISO со смещением).
- В админке (`👑 Админка → 📣 Объявление`) добавлены кнопки:
  - **🎯 Кому** (циклом `all→brand→creator`),
  - **🔗 CTA** (label + URL),
  - **⏰ Expire** (дедлайн).
- Показ пользователям:
  - если объявление истекло (`expiresAt` в прошлом) — **не показываем**,
  - если `target!=all` — показываем только целевой роли,
  - если `ctaUrl` задан — добавляется URL‑кнопка в сообщении.


### Payments: auto-heal ORPHANED `missing_session` (cron + админка)

- `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED=1` — cron будет периодически пытаться авто-применять ORPHANED с `note=missing_session` (только безопасные типы: PRO / кредиты / Brand Plan / founder_brand_*).
- `PAYMENTS_ORPHANED_AUTOHEAL_BATCH=20` — сколько платежей чинить за один тик (0..100).
- `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC=300` — не трогать слишком свежие ORPHANED (моложе ~5 минут), чтобы избежать гонок/задержанных обновлений. Диапазон: 0..3600 сек.

- В админке: **Admin → Payments (ORPHANED)** → кнопка **Auto-heal missing_session**.

Auto-heal safeguards + ops alerts:
- Перед apply делает **строгую валидацию** payload/amount/currency. Если не проходит → помечает `note=autoheal_manual_required:<reason>` и шлёт ops alert `autoheal_validation_failed` (чтобы не было тихих ретраев).
- Для постоянных non-applied кейсов (unsupported_payload / bad_input / user_mismatch / missing_userid_or_wsid) → помечает `note=autoheal_manual_required:<reason>` и шлёт ops alert `autoheal_manual_required_failed`.
- Если apply прошёл, но user notify не удалось → ops alert `autoheal_notify_failed`.
- Исключения/ошибки в тикe → ops alert `autoheal_failed`.

Примечание: оплаты `offpub_*` (публикация в офиц.канал) остаются ручными по дизайну (модерация).


### STEP164 — NotebookLM audit pack (docs-only)
- Добавлен комплект для стороннего аудита: `docs/audit/*` (инструкция загрузки + промпт + audio focus).

### STEP165 — NotebookLM: workaround для .sql + генератор sources
- Добавлен генератор `npm run gen:notebooklm-sources`, который готовит папку/ZIP `dist/notebooklm_sources/`.
- В sources SQL миграции и migration_pack кладутся как `.txt` копии (`migrations_txt/*.sql.txt`), чтобы NotebookLM принимал файлы.
- Добавлен исторический контекст Neon: `docs/neon/ИСТОРИЯ_НЕОН.txt`.

---

## Repo sync note
- **STEP184:** архив репозитория и NotebookLM audit-pack синхронизированы с состоянием **STEP183** (без изменения поведения).
- **STEP185:** исправлено битое имя файла в `docs/neon/` (теперь реально `ИСТОРИЯ_НЕОН.txt`, как и указано в доках/аудит-паке).

### STEP186 — NotebookLM pack ≤50 files (NotebookLM50)
- NotebookLM лимит: максимум 50 файлов; .sql часто не загружается.

### STEP187 — Admin: user messages from user card
- Добавлена отправка сообщений пользователям из админки (из карточки пользователя): шаблоны + свободный текст + предпросмотр.
- Добавлен Redis dedup против случайных дублей.
- Добавлен curated pack: `docs/audit/notebooklm_pack/` (бандлы core/features/process + code bundle + migrations bundle).
- Генератор `npm run gen:notebooklm-sources` теперь собирает `dist/NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip` и валидирует лимит 50 файлов.

### STEP221 — Admin Comms UX + Cron router path fix
- Админские личные сообщения пользователю: кнопки `📋 Открыть меню` и `💬 Поддержка` больше не затирают текст.
  - Используются новые action keys: `a:menu_push` и `a:support_push`.
  - При нажатии бот снимает клавиатуру с исходного сообщения и открывает экран меню/поддержки отдельным сообщением.
- Админка → «✉️ Сообщение пользователю» (`a:adm_umsg`): быстрые шаблоны в 2 колонки + компактные ряды действий.
- Vercel Hobby: cron router лежит в `api/cron_router.js` (соответствует `vercel.json` rewrites).

### STEP223 — Fix: `a:menu_push` opens Menu reliably (no receipt overwrite)
- Исправлено поведение `a:menu_push`: теперь меню всегда рендерится в отдельное «UI-сообщение» (через placeholder `⌛ Открываю меню…`).
- Исходное админское/системное сообщение остаётся «квитанцией» и не перезаписывается.
- Добавлен safe-fallback: если placeholder не удалось отправить — бот открывает меню обычным способом.


---

## Recent STEPs (2026‑03)

### STEP252 — Vercel: fix deprecations / rewrites consistency
- Приведены в порядок проблемные места после обновлений Vercel (совместимость/депрекейты).

### STEP253 — Admin DM: free text sending fixed (no silent fail)
- Исправлен крэш в обработчике `expectText: adm_user_msg_text` → сообщение теперь реально уходит пользователю.

### STEP254 — Admin message receipt: кнопки стали предсказуемыми
- Под админ‑сообщением у пользователя стабильно: `📋 Открыть меню / 💬 Поддержка / ✅ Понятно`.
- `✅ Понятно` аккуратно снимает только ack, не ломая навигацию.

### STEP255 — Admin message: блок «Что дальше» (шаблон)
- В конец админ‑сообщения добавлен короткий блок, объясняющий 3 кнопки.

### STEP256 — Admin message: опция «коротко» без блока «Что дальше»
- В предпросмотре админа две отправки: стандартно и коротко, без изменения клавиатуры.

### STEP257 — Витрина: шаринг коротко/подробно, URL в конце
- В сообщениях шаринга ссылка переносится в конец, чтобы не светиться в первых строках превью.

### STEP262 — Витрина: предпросмотр как продукт (кнопки по смыслу)
- В owner‑preview выделены блоки: **Действия** (`🔗 Поделиться`, `📌 IG шаблоны`) и **Мои площадки** (сеткой).
- Для владельца label канала: `📣 Мои каналы`.

### STEP263 — IG templates: anti‑bypass (без @handles и «ссылка в профиле»)
- В IG‑шаблонах убраны любые `@...` (канал/IG) и упоминания «ссылка в TG‑профиле».
- Шаблоны оставлены полезными: только описание оффера + ниши/форматы + портфолио (если есть) + ссылка на витрину/заявку.

### STEP264 — Витрина: «📨 Отправить» снова работает во всех Telegram‑клиентах
- Некоторые клиенты игнорируют `https://t.me/share/url?text=...` (кнопка выглядит как ссылка, но нажатие ничего не делает).
- Для совместимости `📨 Отправить` использует `t.me/share/url?url=<invisible>&text=<plain>`.
- В `url=` передаём невидимый символ U+2060 (WORD JOINER), чтобы у получателя не появлялась «ссылка первой строкой».

### STEP265 — Support: fail‑open навигация при деградации Redis
- В `actionRegistry` действия `a:support` и `a:support_push` больше не требуют Redis (guard=NONE).
- Запись в поддержку (`a:support_write`) по‑прежнему требует Redis (expectText), поэтому безопасность/инварианты не нарушены.
- Это убирает прод‑UX баг: в деградации Redis кнопка «💬 Поддержка» не должна вести в общий error‑экран.

### STEP266 — Curators: «📤 Поделиться» приглашением не должна “молчать”
- В `a:cur_invite` (приглашение куратора ссылкой) кнопка шаринга использовала `t.me/share/url?url=&text=...`.
- Некоторые Telegram‑клиенты игнорируют share‑URL с пустым `url=` → нажатие выглядит как “ничего не происходит”.
- Для совместимости выставлен `t.me/share/url?url=<invisible>&text=<plain>` (U+2060 WORD JOINER в `url=`).

### STEP267 — IG templates menu: убрать явные Channel/Profile (только ссылка на бота)
- В меню `📌 Шаблоны для Instagram` больше не показываем строки `Канал:` и `Профиль:` (не подсказываем обход через @handles).
- Оставляем только безопасную ссылку на витрину/заявку: `Ссылка на витрину → Открыть витрину`.
- Шаблоны (Stories/Пост/DM/Bio) по‑прежнему anti‑bypass: без `@...`, без «ссылка в профиле», контакт только через витрину.
