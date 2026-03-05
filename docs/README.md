# DOCS — START HERE

Это актуальный комплект документации по проекту **Collabka PR**.

## 0) BOOT (всегда читаем сначала)
- `00_BOOT.md` — 10–15 строк, что нельзя забывать
- `01_SECURITY_INVARIANTS.md` — инварианты безопасности/монетизации (что нельзя ломать)
- `02_ACTION_KEYS_REGISTRY.md` — реестр action keys (AUTO-GENERATED, для аудитов; обновить: `npm run actions:md`)
- `15_NEW_CHAT_HANDOFF.md` — copy‑paste для старта нового чата
- `17_START_NEW_CHAT_PROMPT.md` — готовый промпт для старта нового чата

## 1) Текущее состояние (source of truth)
- `00_CURRENT_STATE.md` — единый snapshot по архитектуре/инфре/контрактам (**source of truth**)
- `91_PROD_LAUNCH_30MIN.md` — one‑pager: запуск продакшена за 30 минут
- `10_QSTASH_RUNBOOK.md` — QStash: ключи/env, rollout/rollback, типовые задачи
- `11_MIGRATIONS_PACK.md` — как безопасно поднять/чинить БД на Neon (exactly‑once runner)
- `neon/README.md` + `neon/ИСТОРИЯ_НЕОН.txt` — исторический контекст по Neon (для аудита/разбора; не source of truth)
- `12_INFRA_CONTROL_PLANE.md` — Cron/Locks/Outbox/гарантии (Control Plane)
- `13_RUNBOOK_RELEASE.md` + `16_RELEASE_CHECKLIST.md` — релизы/проверки
- `14_BRAND_TEAM_UX_V4.md` — UX “Менеджеры бренда” (кнопка всегда видна, гейт внутри)
- `18_NEON_COST_SAVING_AUDIT_THROTTLE.md` — как экономить Neon: audit write‑shedding + метрики в `/api/health`
- `19_OFFICIAL_PUBLISH_IDEMPOTENCY.md` — Official publish: анти‑дубли (token‑lock + DB‑reserve) + что делать при дубле
- `20_CONTACTS_MODEL.md` — контакты/монетизация (Brand Pass) + structured contacts + приоритеты/UX
- `31_FEEDS_VITRINES_CATALOGS.md` — как устроены витрина/лента/каталог и пагинация (без бесконечного скролла)

### Instagram (временно скрыто в UI)
- `22_IG_GRAPH_OAUTH_2026.md` — IG Graph OAuth (Business/Creator): официальный OAuth через Meta (runbook)
- `23_IG_CONNECT_WORKLOG_AND_RESUME.md` — что уже сделали, что сломалось у Meta и как вернуться
- `docs/spec/24_IG_INTEGRATION_SPEC.md` — текущая спека (OAuth‑only, UI скрыт флагом)
- `21_IG_VERIFY_RUNBOOK.md` — IG verify (Level B): legacy reference (не рекомендуем включать)

## 1.5) Публичные документы (для публикаций и объяснения пользователям)
Папка: `docs/public/`
- `README_PUBLIC.md` — индекс: что публиковать и куда
- `00_product_overview_ru.md` — что такое бот и зачем (маркетинг + “по‑человечески”)
- `01_for_creators_ru.md` — гайд для креаторов
- `02_for_brands_ru.md` — гайд для брендов/агентств
- `03_faq_ru.md` — FAQ
- `04_tech_overview_ru.md` — лёгкий тех‑обзор (для партнёров)
- `05_publication_templates_ru.md` — шаблоны постов/Telegraph
- `06_telegraph_article_ru.md` — большая Telegraph‑статья “под ключ”
- `07_press_kit_ru.md` — пресс‑кит/медиакит (готовые формулировки)
- `08_privacy_security_ru.md` — публичное объяснение приватности и безопасности
- `09_use_cases_ru.md` — сценарии/кейсы применения
- `10_brand_plan_explainer_ru.md` — простое объяснение Brand Plan/кредитов
- `11_feeds_and_discovery_ru.md` — где “лента/витрина/каталог” (простое объяснение)

## 2) SPEC / UX reference (актуально, но не является source of truth)
Папка: `docs/spec/`
- `20_HOME_HUB_SPEC.md` — HOME HUB + `/start` role‑gate (`ui_mode`, payload priority, fail‑open)
- `21_MENU_SPEC.md` — контракт навигации (Back/Menu/Home, `ret`)
- `22_OFFER_WIZARD_SPEC.md` — визард оффера (финальный экран без тупиков)
- `23_LEAD_NOTES_SPEC.md` — Curator Notes по заявкам брендов
- `24_IG_INTEGRATION_SPEC.md` — Instagram integration (OAuth‑only): trust badge + paywall (Level B комментарии не используем)

> Старые файлы‑зеркала в корне `docs/` (HOME_HUB_SPEC_V1.md, MENU_SPEC_V1.md и т.п.) оставлены как compat mirrors, чтобы старые ссылки не ломались.

## 2.5) Owner docs (для управления продом)
- `90_OWNER_RUNBOOK.md` — шпаргалка владельца: деплой/ENV/migrations/cron/health/инциденты

## 3) Protocol / Process (как работаем)
Папка: `docs/process/`
- `01_HOW_TO_WORK_LIKE_SENIOR.md` — дисциплина артефактов/DoD/анти‑грабли
- `02_jobs_vitalik_woz_protocol.md` — Jobs/Vitalik/Woz: high‑signal протокол
- `scripts/lint-footer-nav.js` — авто‑проверка footer‑навигации (запуск: `npm run lint:nav`)
- `06_AUDIT_STEP94_HARDCORE.md` — reference аудит (не source of truth)
- `07_WORK_HISTORY_2026_02.md` — timeline по шагам/решениям (для восстановления контекста)
- `08_AUDIT_CLOSEOUT_2026_02.md` — закрытие внешнего аудита (findings→fixes + мини‑QA)
- `03_legacy_tech_spec_collabka_v1_0_3.md` — базовая техспека (legacy reference)
- `04_legacy_techpassport_collabka_v1_0_3_telegra.md` — техпаспорт (legacy reference)
- `05_legacy_telegraph_article_and_manual.md` — telegraph‑статья/мануал (legacy reference)

## Как использовать в новом чате
Открой `15_NEW_CHAT_HANDOFF.md` и следуй шагам: что загрузить и что вставить первым сообщением.

## Что нового в текущем snapshot (2026-02-27)
- IG OAuth/verify: UI **скрыт** (launch‑safe). Документы и код оставлены, чтобы вернуться позже без потери контекста.
- One‑pager запуска: `91_PROD_LAUNCH_30MIN.md`.


## Аудит (NotebookLM / внешняя проверка)
- `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` — что загрузить, в каком порядке
- `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` — жёсткий промпт аудита
- `docs/audit/02_NOTEBOOKLM_AUDIO_RECAP_FOCUS_RU.md` — короткий текст для аудиопересказа

## Production
- `docs/91_PROD_LAUNCH_30MIN.md` — запуск продакшена за 30 минут (one‑pager)
- `docs/92_PROD_ENV_BASELINE.md` — baseline ENV для prod (без секретов) + проверка через /api/health
- `docs/93_PROD_DEPLOY_CHECKLIST.md` — операторский чеклист деплоя (health/admin)
