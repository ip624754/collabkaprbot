# DOCS — START HERE

Это актуальный комплект документации по проекту **Collabka PR**.

## 0) BOOT (всегда читаем сначала)
- `process/07_WORK_HISTORY_STEP582.md` — актуальная дельта: восстановление callback/dependency preflight truth и границы локальной проверки
- `00_BOOT.md` — 10–15 строк, что нельзя забывать
- `01_SECURITY_INVARIANTS.md` — инварианты безопасности/монетизации (что нельзя ломать)
- `02_ACTION_KEYS_REGISTRY.md` — реестр action keys (AUTO-GENERATED, для аудитов; обновить: `npm run actions:md`)
- `15_NEW_CHAT_HANDOFF.md` — copy‑paste handoff для старта нового чата (canonical baseline context)
- `17_START_NEW_CHAT_PROMPT.md` — готовый промпт для старта нового чата (canonical behavior kernel, v3)
- `AI_NATIVE_WORKFLOW.md` — канонический CogniForge/STEP workflow для AI-assisted разработки Collabka
- `SYSTEM_INVARIANTS.md` — межмодульные инварианты runtime, Telegram, invites, giveaways, monetization, admin и docs
- `RISK_REGISTRY.md` — живой реестр технических, продуктовых и AI-governance рисков
- `CREATOR_OS_THESIS.md` — продуктовый north star: Creator Collaboration Operating System без broad rewrite
- `CHATGPT_COLLABKA_UPGRADE_NOTES.md` — состав и truth boundary STEP580 docs upgrade
- `25_TELEGRAM_UI_PATTERN_REUSE.md` — reusable объяснение Collabka-style Telegram UI pattern: single-surface router, Back/Menu/Home, edit-first, `ret`, push-vs-edit
- `26_SELECTION_UI_CONTRACT_RU.md` — канонический selection UI contract для русских picker/filter surfaces: мультивыбор, один выбор, toggle, нижний action block
- `27_SELECTION_SURFACE_INVENTORY_STEP479.md` — source-level inventory активных selection surfaces + выбор 2 low-risk pilot экранов для первого rollout
- `28_TELEGRAM_COPY_CLARITY_SWEEP_STEP481.md` — source-first review user-facing Telegram copy: где текст роботизирован, плотный, двусмысленный или требует новой строки / zero-state hint before narrow runtime hotfix
- `29_COPY_HOTFIX_WAVE1_STEP482A.md` — runtime copy hotfix wave 1: brand/catalog/BX filter screens + nearby zero-state/helper lines, without callback/DB/money changes
- `30_LANDING_IMPLEMENTATION_STEP484.md` — public landing runtime implementation: русский one-page вход в Collabka PR + FAQ + CTA в бот
- STEP480 runtime pilot applied on creator-side `Workspace Profile → 🎬 Форматы` (checkbox-style multi-select) and `Workspace Profile → 🧩 Режим` (radio-style single-choice); see `00_CURRENT_STATE.md` + `process/07_WORK_HISTORY_2026_03.md` for rollout details

## 1) Текущее состояние (source of truth)
- `00_CURRENT_STATE.md` — единый snapshot по архитектуре/инфре/контрактам (**source of truth**)
- `91_PROD_LAUNCH_30MIN.md` — one‑pager: запуск продакшена за 30 минут
- `10_QSTASH_RUNBOOK.md` — QStash: ключи/env, rollout/rollback, типовые задачи (canonical)
- `17_QSTASH_RUNBOOK.md` — compat mirror (старые ссылки)
- `11_MIGRATIONS_PACK.md` — как безопасно поднять/чинить БД на Neon (exactly‑once runner)
- `neon/README.md` + `docs/neon/NEON_HISTORY_RAW.txt` — исторический контекст по Neon (для аудита/разбора; не source of truth)
- `12_INFRA_CONTROL_PLANE.md` — Cron/Locks/Outbox/гарантии (Control Plane)
- `13_RUNBOOK_RELEASE.md` + `16_RELEASE_CHECKLIST.md` — релизы/проверки
- `14_BRAND_TEAM_UX_V4.md` — UX “Менеджеры бренда” (кнопка всегда видна, гейт внутри)
- `18_NEON_COST_SAVING_AUDIT_THROTTLE.md` — как экономить Neon: audit write‑shedding + метрики в `/api/health`
- `19_OFFICIAL_PUBLISH_IDEMPOTENCY.md` — Official publish: анти‑дубли (token‑lock + DB‑reserve) + что делать при дубле
- `20_CONTACTS_MODEL.md` — контакты/монетизация (Brand Pass) + structured contacts + приоритеты/UX
- `31_FEEDS_VITRINES_CATALOGS.md` — как устроены витрина/лента/каталог и пагинация (без бесконечного скролла)

### Instagram (parked / не деплоится в baseline)
- `22_IG_GRAPH_OAUTH_2026.md` — IG Graph OAuth (Business/Creator): runbook/архив для возможного возврата
- `23_IG_CONNECT_WORKLOG_AND_RESUME.md` — почему IG OAuth parked, как сняли его из deploy surface и как вернуться позже
- `docs/spec/24_IG_INTEGRATION_SPEC.md` — текущая спека (OAuth‑only, UI скрыт флагом)
- `21_IG_VERIFY_RUNBOOK.md` — IG verify (Level B): legacy reference (не рекомендуем включать)

## 1.5) Публичные документы (для публикаций и объяснения пользователям)
Папка: `docs/public/`
- `docs/public/README_PUBLIC.md` — индекс: что публиковать и куда
- `docs/public/00_product_overview_ru.md` — что такое бот и зачем (маркетинг + “по‑человечески”)
- `docs/public/01_for_creators_ru.md` — гайд для креаторов
- `docs/public/02_for_brands_ru.md` — гайд для брендов/агентств
- `docs/public/03_faq_ru.md` — FAQ
- `docs/public/04_tech_overview_ru.md` — лёгкий тех‑обзор (для партнёров)
- `docs/public/05_publication_templates_ru.md` — шаблоны постов/Telegraph
- `docs/public/06_telegraph_article_ru.md` — большая Telegraph‑статья “под ключ”
- `docs/public/07_press_kit_ru.md` — пресс‑кит/медиакит (готовые формулировки)
- `docs/public/08_privacy_security_ru.md` — публичное объяснение приватности и безопасности
- `docs/public/09_use_cases_ru.md` — сценарии/кейсы применения
- `docs/public/10_brand_plan_explainer_ru.md` — простое объяснение Brand Plan/кредитов
- `docs/public/11_feeds_and_discovery_ru.md` — где “лента/витрина/каталог” (простое объяснение)
- public landing runtime files live in repo root: `index.html`, `styles/landing.css`, `scripts/landing.js`, `assets/brand/*`, `assets/screenshots/*`


## 1.7) Smoke tests (в корне репо)
- `smoke-tests_short.md` — короткий smoke (ручной прогон)
- `smoke-tests_full.md` — полный smoke

## 2) SPEC / UX reference (актуально, но не является source of truth)
Папка: `docs/spec/`
- `docs/spec/20_HOME_HUB_SPEC.md` — HOME HUB + `/start` role‑gate (`ui_mode`, payload priority, fail‑open)
- `docs/spec/21_MENU_SPEC.md` — контракт навигации (Back/Menu/Home, `ret`)
- `docs/spec/22_OFFER_WIZARD_SPEC.md` — визард оффера (финальный экран без тупиков)
- `docs/spec/23_LEAD_NOTES_SPEC.md` — Curator Notes по заявкам брендов
- `docs/spec/24_IG_INTEGRATION_SPEC.md` — Instagram integration (OAuth‑only): trust badge + paywall (Level B комментарии не используем)

> Старые файлы‑зеркала в корне `docs/` (HOME_HUB_SPEC_V1.md, MENU_SPEC_V1.md и т.п.) оставлены как compat mirrors, чтобы старые ссылки не ломались.

## 2.5) Owner docs (для управления продом)
- `90_OWNER_RUNBOOK.md` — шпаргалка владельца: деплой/ENV/migrations/cron/health/инциденты
- `ops/01_OPERATOR_INCIDENT_PLAYBOOK.md` — короткий incident playbook
- `ops/02_HEALTH_ONE_SCREEN.md` — one-screen guide: как читать `/api/health` сверху вниз
- `ops/03_LIVE_RUNTIME_PASS_STEP471.md` — ручной Telegram runtime pass после STEP470–471 (списки + dialog-flow + терминология)

## 3) Protocol / Process (как работаем)
Папка: `docs/process/`
- `docs/process/01_HOW_TO_WORK_LIKE_SENIOR.md` — дисциплина артефактов/DoD/анти‑грабли
- `docs/process/02_jobs_vitalik_woz_protocol.md` — Jobs/Vitalik/Woz: high‑signal протокол
- `scripts/lint-footer-nav.js` — авто‑проверка footer‑навигации (запуск: `npm run lint:nav`)
- `docs/process/06_AUDIT_STEP94_HARDCORE.md` — reference аудит (не source of truth)
- `docs/process/07_WORK_HISTORY_2026_03.md` — timeline по шагам/решениям (актуально)
- `25_TELEGRAM_UI_PATTERN_REUSE.md` — отдельный reusable doc: как повторить Collabka UI-паттерн в другом Telegram-боте без потери архитектурных инвариантов
- `docs/process/07_WORK_HISTORY_2026_02.md` — архив (предыдущий период)
- `docs/process/08_AUDIT_CLOSEOUT_2026_02.md` — закрытие внешнего аудита (findings→fixes + мини‑QA)
- `docs/process/03_legacy_tech_spec_collabka_v1_0_3.md` — базовая техспека (legacy reference)
- `docs/process/04_legacy_techpassport_collabka_v1_0_3_telegra.md` — техпаспорт (legacy reference)
- `docs/process/05_legacy_telegraph_article_and_manual.md` — telegraph‑статья/мануал (legacy reference)

## Как использовать в новом чате
Сначала используй `17_START_NEW_CHAT_PROMPT.md` как ядро правил работы, затем `15_NEW_CHAT_HANDOFF.md` как живой baseline текущего цикла.

## Что нового в текущем snapshot (2026-07-17)

### STEP580 — CogniForge governance + Creator OS docs
- Добавлен project-specific AI-native workflow с FAST/STANDARD/HEAVY routing и Truth Boundary.
- Зафиксированы cross-system invariants и living risk registry.
- Добавлен Creator OS product thesis с incremental strategy и non-goals.
- Continuity baseline синхронизирован на STEP580; runtime-код не менялся.

- Платежи: fallback apply exactly‑once (DB lock) + safety visibility (HMAC minlen + баннеры в Admin→Ops).
- Giveaways: winners draw в REPEATABLE READ + audit метаданные воспроизводимости.
- Broadcast: DB overload load‑shedding (429+Retry‑After) + метрики в health + баннеры в админке; tick fail‑closed при Redis degraded.
- Ops: health/admin баннеры по `qstash_reschedule_failed` и `official_publish_stuck`.
- RateLimit: деградация Redis больше не даёт unlimited fail‑open; degraded режим стал строже.
- Новый операторский пакет: `94_PROD_READINESS_PACK.md` (GO/NO‑GO через `system_status/no_go_reasons` + матрица микрофиксов + runtime fallback runbook + `pending_deliveries`/`ops.digest_preview` + hard-skip отчёт + staging fault‑injection).
- Навигационный контракт what-next/back-nav теперь зафиксирован отдельным source-level smoke (`smoke:what-next-backnav-contract`) и синхронизирован с `docs/24_WHAT_NEXT_BLOCKS_STYLEGUIDE.md`.
- Добавлен one-screen guide `docs/ops/02_HEALTH_ONE_SCREEN.md` для `/api/health` и обновлён NotebookLM audit baseline STEP430.


## Аудит (NotebookLM / внешняя проверка)
- `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` — что загрузить, в каком порядке
- `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` — жёсткий промпт аудита
- `docs/audit/02_NOTEBOOKLM_AUDIO_RECAP_FOCUS_RU.md` — короткий текст для аудиопересказа

## Production
- `docs/91_PROD_LAUNCH_30MIN.md` — запуск продакшена за 30 минут (one‑pager)
- `docs/92_PROD_ENV_BASELINE.md` — baseline ENV для prod (без секретов) + проверка через /api/health
- `docs/93_PROD_DEPLOY_CHECKLIST.md` — операторский чеклист деплоя (health/admin)
- `docs/94_PROD_READINESS_PACK.md` — GO/NO‑GO + incident cookbook

- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md` — короткий what-to-do playbook после hardening шагов 403–405.
- `docs/ops/02_HEALTH_ONE_SCREEN.md` — one-screen guide по `/api/health` (STEP429).

- `docs/33_LANDING_VISUAL_POLISH_STEP486.md` — landing visual polish pack for the `Как это выглядит` section (real-screen product cards)


[STEP488] Landing icon system polish: replaced emoji landing icons with a consistent SVG icon set, added /assets/icons/landing/*.svg, and tightened landing icon spacing/styling without changing section structure or CTA behavior.

- `36_LANDING_ICON_HARDENING_STEP489.md` — landing icon overflow fix via inline SVG sprite and size hardening.


- `docs/37_LANDING_ICON_RENDER_HOTFIX_STEP490.md` — landing icon overflow/giant render hotfix using fixed-size CSS glyphs.

- `37_OG_PREVIEW_STEP491.md` — OG preview/social card implementation for landing share previews.


- `docs/38_LANDING_MICRO_POLISH_STEP493.md` — landing premium micro-polish: subtle card spotlight/depth, FAQ plasticity, and tighter section-intro hierarchy without redesign.

## STEP581 audit and roadmap

- `audit/STEP581_FULL_PROJECT_AUDIT_2026_07_17.md`
- `roadmap/COLLABKA_EXECUTION_ROADMAP_AFTER_STEP581.md`
- `AI_MULTI_MODEL_HANDOFF_CURRENT.md`
- `process/07_WORK_HISTORY_STEP581.md`

### STEP583 runtime proof

- `audit/STEP583_RUNTIME_PROOF_SPINE_REPORT.md`
- `process/07_WORK_HISTORY_STEP583.md`
- command: `npm run smoke:runtime-proof-spine`

### Staging acceptance

- `operations/STEP584_STAGING_RUNTIME_ACCEPTANCE_RUNBOOK.md` — safe remote preview/staging gate and evidence workflow.
- `audit/STEP584_STAGING_RUNTIME_ACCEPTANCE_PACK_REPORT.md` — implementation report and truth boundary.

## STEP585 — Conversation and UX language system

Canonical product-language documents:

- `product/COLLABKA_COPY_SYSTEM.md` — voice, message anatomy, button rules, errors, payments and review checklist;
- `product/TERMINOLOGY_REGISTRY.md` — one canonical term per role, object, lifecycle stage and paid product;
- `audit/STEP585_FULL_CONVERSATION_UX_LANGUAGE_AUDIT.md` — source-backed P0–P3 findings and readiness score;
- `audit/STEP585_MESSAGE_INVENTORY.md` — reviewed message/button surface families and scan boundary;
- `audit/STEP585_BUTTON_LABEL_INVENTORY.csv` — mechanical inventory of static button labels;
- `roadmap/STEP586_COPY_REFACTOR_ROADMAP.md` — bounded implementation waves STEP586A–H;
- `process/07_WORK_HISTORY_STEP585.md` — exact scope and Truth Boundary.

### STEP586A implementation

- `audit/STEP586A_COPY_SAFETY_TAXONOMY_REPORT.md` — exact runtime copy changes, security review and Truth Boundary;
- `process/07_WORK_HISTORY_STEP586A.md` — changed scope, preserved invariants and QA;
- command: `npm run smoke:copy-safety-taxonomy-contract`;
- ordinary-user infrastructure leakage is removed from the targeted branches while operator diagnostics retain technical truth.

Current next action: **STEP586B — Home, Menu and Role Navigation Contract**.

Live Telegram rendering, mobile wrapping and remote STEP584 staging acceptance remain unverified.
