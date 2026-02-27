# DOCS — START HERE

Это актуальный комплект документации по проекту **Collabka PR**.

## 0) BOOT (всегда читаем сначала)
- `00_BOOT.md` — 10–15 строк, что нельзя забывать
- `01_SECURITY_INVARIANTS.md` — инварианты безопасности/монетизации (что нельзя ломать)
- `02_ACTION_KEYS_REGISTRY.md` — реестр action keys (AUTO-GENERATED, для аудитов; обновить: `npm run actions:md`)
- `15_NEW_CHAT_HANDOFF.md` — copy‑paste для старта нового чата
- `17_START_NEW_CHAT_PROMPT.md` — готовый промпт для старта нового чата

## 1) Текущее состояние (source of truth)
- `00_CURRENT_STATE.md` — единый snapshot по архитектуре/инфре/контрактам (source of truth)
- `91_PROD_LAUNCH_30MIN.md` — one‑pager: запуск продакшена за 30 минут
- `12_INFRA_CONTROL_PLANE.md` — Cron/Locks/Outbox/гарантии (Control Plane)
- `17_QSTASH_RUNBOOK.md` — QStash: где взять ключи/env, как включать fan-out, rollout/rollback
- `22_IG_GRAPH_OAUTH_2026.md` — IG Graph OAuth (Business/Creator): официальный OAuth через Meta (runbook)
- `23_IG_CONNECT_WORKLOG_AND_RESUME.md` — что уже сделано по IG, что сломалось у Meta и как вернуться
- `21_IG_VERIFY_RUNBOOK.md` — IG verify (Level B): legacy reference (не рекомендуем включать)
- `11_MIGRATIONS_PACK.md` — как безопасно поднять БД на Neon (exactly-once runner)
- `migration_pack/` — ручные SQL-скрипты для экстренной миграции/repair (см. `docs/11_MIGRATIONS_PACK.md`)
- `18_NEON_COST_SAVING_AUDIT_THROTTLE.md` — как экономить Neon: audit write-shedding + метрики в `/api/health`
- `19_OFFICIAL_PUBLISH_IDEMPOTENCY.md` — Official publish: анти‑дубли (token‑lock + DB‑reserve) + что делать при дубле
- `20_CONTACTS_MODEL.md` — модель контактов/монетизации (Brand Pass) + structured contacts + приоритеты/UX
- `13_RUNBOOK_RELEASE.md` + `16_RELEASE_CHECKLIST.md` — релизы/проверки
- `14_BRAND_TEAM_UX_V4.md` — UX “Менеджеры бренда” (кнопка всегда видна, гейт внутри)

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

## 2) SPEC / UX reference (актуально, но не является source of truth)
Папка: `docs/spec/`

> Старые файлы в корне docs/ (HOME_HUB_SPEC_V1.md, MENU_SPEC_V1.md и т.п.) оставлены как compat mirrors: внутри полный текст, чтобы старые ссылки не вели в пустышку.

- `20_HOME_HUB_SPEC.md` — HOME HUB + `/start` role-gate (`ui_mode`, payload priority, fail-open)
- `21_MENU_SPEC.md` — контракт навигации (Back/Menu/Home, `ret`)
- `22_OFFER_WIZARD_SPEC.md` — визард оффера (финальный экран без тупиков)
- `23_LEAD_NOTES_SPEC.md` — Curator Notes по заявкам брендов
- `24_IG_INTEGRATION_SPEC.md` — Instagram integration (OAuth only): trust badge + paywall + PRO hooks (Level B комментарии не используем)

## 2.5) Owner docs (для управления продом)
- `90_OWNER_RUNBOOK.md` — шпаргалка владельца: деплой/ENV/migrations/cron/health/инциденты

## 3) Protocol / Process (как работаем)
Папка: `docs/process/`

> Старые файлы с прежними именами оставлены как compat mirrors (внутри полный текст), чтобы старые ссылки не ломались.

- `01_HOW_TO_WORK_LIKE_SENIOR.md` — дисциплина артефактов/DoD/анти‑грабли
- `02_jobs_vitalik_woz_protocol.md` — Jobs/Vitalik/Woz: high-signal протокол
- `06_AUDIT_STEP94_HARDCORE.md` — reference аудит (источник рекомендаций/гипотез, не source of truth)
- `07_WORK_HISTORY_2026_02.md` — timeline заметки по шагам/решениям (для восстановления контекста)
- `08_AUDIT_CLOSEOUT_2026_02.md` — закрытие внешнего аудита (findings→fixes + мини‑QA)
- `03_legacy_tech_spec_collabka_v1_0_3.md` — базовая техспека (legacy reference)
- `04_legacy_techpassport_collabka_v1_0_3_telegra.md` — техпаспорт (legacy reference)
- `05_legacy_telegraph_article_and_manual.md` — telegraph‑статья/мануал (legacy reference)

## 4) Архив
Исторический docs-pack (2026-02-19) вынесен из репозитория, чтобы не путать с актуальным состоянием.
Если понадобится — восстановим из отдельного архива/релиза.

## Как использовать в новом чате
Открой `15_NEW_CHAT_HANDOFF.md` и следуй шагам: что загрузить и что вставить первым сообщением.

## Что нового в текущем snapshot (2026-02-25)
- `/api/health`: cron last_run + audit throttle counters (Redis-only) + видимый **broadcast cooldown** после 429.
- Экономия Neon: audit write-shedding (`AUDIT_DB_THROTTLE_*`) + готовые профили (`docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`).
- Broadcast надёжность: на 429 получатель **не теряется** (DB `deferred` + `retry_after_until`), scan-курсор идёт дальше, есть **Redis cooldown** + quarantine + счётчики в `/api/health`.
- Cron safety: **token-based Redis locks** (safe unlock) + SQL atomic guards на ключевых переходах (ended/publish/expire, broadcast transitions).
- Official publish (@collabka_offers): анти‑дубли **token‑lock + DB‑reserve `PUBLISHING`** (stale rescue) + runbook (`docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`).
- Contacts / Brand Pass (P2): structured contacts (`profile_contacts` JSONB) + opt‑in UI для креатора + перенос из «Контакт» (однозначно) + явные подсказки (TG рекомендован, остальное опционально) + кнопки очистки полей.
- Brand Inbox: «✅ Принять» — точка списания (exactly‑once). До принятия доступны только ✅ Принять/⛔ Спам/🗑 Удалить (нельзя Ответить/Шаблоны/В работу/Закрыть). Баланс кредитов в карточке (Redis-only).
- Brand Pass UX: «💳 Купить ещё» из витрины креатора → Brand Pass → «⬅️ Вернуться к витрине».
- Giveaways: «➕ Новый розыгрыш» без канала показывает gate‑экран (подключить/выбрать канал) + корректный back.
- Новичок UX: вместо “тишины” на устаревших кнопках — понятные подсказки + кнопки назад/меню/home; очистка полей через `🧹 Очистить` (без упоминания “-”).
- Founder Sale: экран акции + покупка Stars + runtime управление из админки + deep-link `fs_*` + маркетинг‑шаблоны.
- Cron throughput: уведомления (Telegram notify) ограничены по времени (`withTimeout ~5s`), тик не “залипает” на одном сообщении.

## Что нового в IG verify (2026-02-26)
- Level B: cron `/api/cron/ig-verify-tick` + ручной ускоритель “⚡ Проверить сейчас” через QStash.
- Runbook: `docs/21_IG_VERIFY_RUNBOOK.md`.
- Админка: экран “📸 IG verify статус” (ENV ok/miss, last cron run, last check-now run).

## Что нового по IG OAuth (2026-02-27)
- Спека обновлена: OAuth‑only, FREE, без “PRO” в UX.
- Из-за ограничений Meta интеграция **временно скрыта в UI** (запуск проекта без зависимости от IG).
- Добавлены документы: runbook + пост‑мортем + owner‑шпаргалка.