# Collabka PR — CORE (README/BOOT/CURRENT_STATE/LAUNCH/HANDOFF)

Собрано автоматически для NotebookLM. Обновлено: 2026-02-28 12:06 UTC


---

## SOURCE: `docs/README.md`

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


---

## SOURCE: `docs/00_BOOT.md`

# 00 — BOOT (якорь контекста)

1) Мы в **serverless** (Vercel) → никаких “долгих” процессов, всё пакетами.
2) **Neon** экономим: не добавляй лишние DB-запросы в горячие UI-рендеры (меню/кнопки).
3) Любая “тяжёлая” операция: **SQL-side**, а не вытягивание 10–50k строк в Node.
4) В кронах всегда: **Redis token-lock** (safe unlock) + где критично **PG advisory lock**.
5) Внешние сайд‑эффекты (пост в канал / публикация результатов / remove): сначала **reserve/lock**, потом отправка.
6) Любое изменение статуса — **атомарно** (SQL guard / `WHERE ... RETURNING`, guard по полям типа `winners_drawn_at`).
7) Winner selection — **детерминированно** (seed+hash), воспроизводимо, без `random()` в Node.
8) Ошибка → лучше “мягко остановиться” (runtime guard), чем получить hard-kill Vercel.
9) Cron notify не должен тормозить batch: `withTimeout(~5s)` на Telegram notify.
10) Миграции только через **migrations/run.js** (exactly-once, checksum), без ручных ALTER в проде.
11) Каждый патч: **маленький**, обратимый, артефакты: **FULL zip + Hotfix zip + git-apply patch** + список файлов + QA чеклист + обновление доков (минимум: `docs/00_CURRENT_STATE.md` + `docs/process/07_WORK_HISTORY_*.md`).
12) UX принцип: **кнопка видна**, доступ гейтится внутри фичи, CTA ведёт туда, где решить проблему.
13) Держим стиль **Jobs/Vitalik/Woz**: просто, прозрачно, детерминированно, без магии.

14) Support (SUPPORT_CHAT_ID): бот **должен быть админом** в support-группе; ручной ответ — только **reply на подсказку**; шаблоны — через кнопки.
15) Ops alerts: единый поток + digest, по умолчанию **quiet**; новые алерты — только через `queueOpsAlert` (без спама).
16) Rolling-upgrade: любые новые колонки/таблицы — с graceful fallback по `42703/42P01`, код можно деплоить до миграции.
17) Telegram rate-limit: 429 → Redis cooldown + возобновление; никаких «дожимов»/ретраев в цикле в одном запросе.
18) `callback_data` ≤ 64 байта: держим ключи короткими; если нужен контекст — токен → payload в Redis (TTL).

## См. также
- `01_SECURITY_INVARIANTS.md` — инварианты безопасности/монетизации (payments, кредиты/разлок, ownership-in-SQL, deep-links, cron).


---

## SOURCE: `docs/00_CURRENT_STATE.md`

# 00 — CURRENT STATE (Collabka PR / @collabkaprbot) — 2026-02-28

**Purpose:** единый *source of truth* snapshot, чтобы продолжать работу в новом чате без потери контекста.

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
- Winners draw: детерминированно/воспроизводимо, guards по статусам (`winners_drawn_at`, транзакции).
- Миграции: только `migrations/run.js` (exactly-once + checksum).
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

Что проверяет (эвристика): если клавиатура содержит back‑кнопку (`⬅️ Назад/Отмена/Админка`), то рядом обязаны быть **и** `📋 Меню`, **и** `🏠 Home` (или используется `navKb/kbNavRow`).

Опционально для жёсткого аудита: `NAVLINT_STRICT=1 npm run lint:nav` — начнёт требовать `📋 Меню + 🏠 Home` даже для клавиатур, где есть back‑кнопка, но Menu/Home не планировались.


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
- Навигация: на экране “🛰 QStash статус” кнопка “⬅️ Назад” ведёт в 👑 Админку, “📋 Меню” — в пользовательское меню.

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

Дополнительно (Instagram OAuth, сейчас UI скрыт):
- `IG_OAUTH_UI_ENABLED` (0/1) — если 0, то **и UI, и `/api/ig/oauth/*` закрыты (404)**
- `IG_OAUTH_ENABLED` (0/1)
- `IG_OAUTH_CLIENT_ID`
- `IG_OAUTH_CLIENT_SECRET`
- `PUBLIC_BASE_URL`
- `IG_TOKEN_ENC_KEY`


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
- **PAYMENTS**: `PAYMENTS_ACCEPT_DEFAULT` `PAYMENTS_AUTO_APPLY_DEFAULT` `PAYMENTS_FALLBACK_APPLY_ENABLED` `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED` `PAYMENTS_ORPHANED_AUTOHEAL_BATCH` `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC`
- **FOUNDER**: `FOUNDER_BRAND_12M_CREDITS` `FOUNDER_BRAND_12M_PRICE` `FOUNDER_BRAND_3M_CREDITS` `FOUNDER_BRAND_3M_PRICE` `FOUNDER_CREATOR_12M_PRICE` `FOUNDER_SALE_DEADLINE` `FOUNDER_SALE_ENABLED`
- **INTRO**: `INTRO_COST_PER_INTRO` `INTRO_DAILY_LIMIT` `INTRO_DAILY_LIMIT_UNVERIFIED` `INTRO_RATE_LIMIT` `INTRO_RATE_WINDOW_SEC` `INTRO_RETRY_AFTER_HOURS` `INTRO_RETRY_ENABLED` `INTRO_RETRY_EXPIRES_DAYS` `INTRO_RETRY_NOTIFY` `INTRO_TRIAL_CREDITS`
- **AUDIT**: `AUDIT_DB_ENABLED` `AUDIT_DB_THROTTLE_ENABLED` `AUDIT_DB_THROTTLE_LIMIT` `AUDIT_DB_THROTTLE_PREFIXES` `AUDIT_DB_THROTTLE_WINDOW_SEC`
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
- **OFFICIAL**: `OFFICIAL_1D_PRICE` `OFFICIAL_30D_PRICE` `OFFICIAL_7D_PRICE` `OFFICIAL_CHANNEL_ID` `OFFICIAL_CHANNEL_USERNAME` `OFFICIAL_MANUAL_DEFAULT_DAYS` `OFFICIAL_PUBLISH_ENABLED` `OFFICIAL_PUBLISH_MODE`
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

### Payments: TTL сессии оплаты (чтобы не ловить ORPHANED)

- `PAYMENT_SESSION_TTL_MIN=360` — TTL (в минутах) для Redis-сессий оплаты `pay_*` (контекст счёта: wsId/ret/packId и т.д.).
  Если TTL слишком короткий и пользователь оплачивает поздно, возможен статус ORPHANED `missing_session`.
  Диапазон: 10..1440 минут (10 минут .. 24 часа).

### Payments: fallback apply без pay_* сессии (anti-ORPHANED)

- `PAYMENTS_FALLBACK_APPLY_ENABLED=1` — если Redis-сессия оплаты `pay_*` истекла, бот всё равно применит оплату по `invoice_payload` (без ручной очереди).
- `PAYMENTS_FALLBACK_APPLY_ENABLED=0` — строгий режим: без `pay_*` сессии оплата станет ORPHANED `missing_session`.

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

Расширение System Notice (STEP188), по-прежнему **Redis-only** и **без рассылки**.

- Новые поля `sys:notice`:
  - `target` — `all` / `brand` / `creator`,
  - `ctaLabel` / `ctaUrl` — опциональная URL‑кнопка,
  - `expiresAt` — auto‑expire (epoch seconds; можно вводить ISO со смещением).
- Показ пользователям:
  - после `expiresAt` — не показываем,
  - `target!=all` — показываем только целевой роли (роль определяем по Redis: `ui_mode` + `bm_mode`),
  - если `ctaUrl` задан — добавляется URL‑кнопка.


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


---

## SOURCE: `docs/91_PROD_LAUNCH_30MIN.md`

# PROD LAUNCH за 30 минут (one‑pager)

Цель: безопасно выкатить **текущую версию бота** в прод и убедиться, что критические контуры (платежи/кредиты/разлок/диалоги/cron) работают.

> Важно: **IG OAuth сейчас временно скрыт** (см. `23_IG_CONNECT_WORKLOG_AND_RESUME.md`). На запуск продакшена это не влияет.

---

## 0) Перед стартом (2 минуты)

- У тебя есть доступы: **Vercel**, **Neon (DB)**, **Upstash Redis**, **QStash**, **Telegram Bot**.
- Знаешь прод‑домен (пример): `https://collabkaprbot.vercel.app`

---

## 1) ENV: обязательный минимум (5 минут)

Проверь в Vercel → Project → Settings → Environment Variables (обычно для **Production + Preview**).

### База и инфраструктура
- `DATABASE_URL` (Neon)
- `REDIS_URL` / `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (если используется REST)
- `CRON_SECRET` (для `/api/cron/*`)
- `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (если используется QStash)

### Telegram
- `BOT_TOKEN`
- `ADMIN_IDS` (через запятую)

### Монетизация/лимиты (примерно)
- `INTRO_DAILY_LIMIT_UNVERIFIED`
- `INTRO_DAILY_LIMIT`

### Фиче‑флаги (важно для безопасного запуска)
- любые `*_ENABLED`/runtime flags должны быть **в ожидаемом состоянии**
- IG: `IG_OAUTH_UI_ENABLED` должен быть **0/false** (если хотим скрыть IG)

> Если сомневаешься — сначала выключай спорные флаги, а потом включай по одному.

---

## 2) Миграции БД (5 минут)

- Применить новые миграции (Neon).
- Быстрый sanity: таблицы/колонки на месте, ошибок нет.

**Правило:** миграции должны быть **idempotent / safe**, без разрушения данных.

---

## 3) Деплой на Vercel (3 минуты)

- Deploy (или Redeploy).
- Убедись, что сборка зелёная и нет runtime ошибок.

---

## 4) Health check (2 минуты)

Открой:

- `GET /api/health`

Ожидаем:
- `ok=true`
- видны статусы **DB/Redis**
- нет ошибок по “critical path”

Если health красный — **стоп**, не зовём пользователей.

---

## 5) Cron / очереди (5 минут)

### Cron endpoints
Если используешь Vercel Cron/Upstash Scheduler:
- дергает `POST /api/cron/...` с заголовком/параметром `CRON_SECRET`

Проверка:
- вручную дерни `POST /api/cron/...` (с секретом) и убедись, что:
  - возвращает `ok`
  - повторный вызов не ломает (idempotency/locks)

### QStash
- проверь, что QStash подписывает запросы и эндпоинты принимают их
- убедись, что jobs не дублируются (dedup/locks)

---

## 6) Мини‑смоук тест (8–10 минут)

Сделай по одному сценарию “бренд” и “креатор”.

### Креатор
- `/start` → выбрать роль → открыть профиль
- заполнить/обновить контакты (если включено структурное)
- создать заявку/offer (если это часть флоу)
- “Предпросмотр витрины” должен открываться без ошибок

### Бренд
- `/start` → бренд → поиск креатора/вход в витрину
- отправить запрос / начать диалог
- проверить, что не происходит “слёта” статусов при нажатии кнопок в неправильном порядке
- разлок контактов (если включено) — списание кредита 1 раз, повторный разлок не списывает

Если есть smoke‑пакеты — используй их:
- `smoke-tests_short.md`
- `smoke-tests_full.md`

---

## 7) “OK to invite users” критерии (1 минута)

Можно звать пользователей, если:
- `/api/health` зелёный
- миграции применены
- смоук тест “бренд+креатор” пройден
- cron/очереди не дублируют и не падают
- критические фичи под флагами (если что) можно быстро выключить

---

## 8) Rollback (на всякий случай)

- Vercel: откат на предыдущий deployment
- runtime flags: выключить спорные фичи (самый быстрый safe‑mode)
- при подозрении на дубль списаний: временно отключить разлок/платежи (флагом), разобрать логи

---

## 9) Где смотреть проблемы

- Vercel logs (runtime errors)
- `/api/health` (метрики/DB/Redis)
- admin/support чат (если есть)
- документы:
  - `13_RUNBOOK_RELEASE.md`
  - `90_OWNER_RUNBOOK.md`


---

## SOURCE: `docs/15_NEW_CHAT_HANDOFF.md`

# 15 — NEW CHAT HANDOFF (copy‑paste) — 2026-02-22

Цель: чтобы в новом чате ассистент **сразу** попал в контекст и работал без регрессий.

---

## 1) Что загрузить в новый чат
1) **FULL project zip** (актуальный snapshot репозитория)
2) (Опционально) отдельный **docs zip** — если хочешь грузить только доки (но в FULL zip они уже есть)
3) (Опционально) список env‑переменных, которые включены в проде (без секретов)

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
Я продолжаю работу над Collabka PR Bot (@collabkaprbot).

Я загрузил:
- полный архив репозитория (FINAL snapshot)
- доки в папке docs/ (актуальные)

Инварианты:
- Vercel serverless, Neon бережём
- не добавлять лишние DB‑запросы в горячие UI пути (меню/кнопки)
- любые изменения маленькие, обратимые, без ломки прода

Текущее состояние (важное):
- /api/health: cron last_run + метрики audit throttle
- audit write‑shedding (ENV‑гейт) для снижения INSERT в workspace_audit
- broadcast: URL‑кнопки до 3, deep-link shortcuts (gw/bp/offer), шаблоны кнопок, ссылки “в слово”, финальный экран рассылки с кнопками
- broadcast: 429-safe курсор + Redis cooldown (пауза) + **DB fuse** `broadcasts.cooldown_until` при деградации Redis + cooldown виден в /api/health
- Contacts / Brand Pass: structured contacts (`profile_contacts` JSONB) + opt-in UI для креатора + приоритет structured→контакт (текстом) + unlock DB-truth (см. `docs/20_CONTACTS_MODEL.md`)
- Anti-bypass: телефоны в тексте маскируем и цифрами, и **словами** (до unlock)
- Break-glass (Admin): при Redis down супер‑админ может открыть allowlist (payments/users/audit) через `bg=1` + ops alert
- Creator → Каталог брендов: «✍️ Написать заявку» включает явный режим ввода + «❌ Отмена ввода» (без “тишины”)
- Brand Inbox: «✅ Принять» — точка списания (status=new→in_progress). До принятия доступны только ✅ Принять / ⛔ Спам / 🗑 Удалить; нельзя «Ответить/Шаблоны/В работу/Закрыть». В карточке показываем баланс кредитов (Redis-only).
- Giveaways: «➕ Новый розыгрыш» без подключённого канала показывает gate‑экран (подключить/выбрать канал) + корректный back
- UX polish: очистка полей через кнопки `🧹 Очистить` (без упоминания “-”), “legacy/старое” не показываем пользователю
- /start role gate: если нет ui_mode (Redis) и нет payload → короткая развилка (Бренд/Креатор), fail‑open
- Official publish (@collabka_offers): анти‑дубли token-lock + DB-reserve PUBLISHING (stale rescue) + runbook doc 19
- Founder Sale: экран акции + Stars purchase + runtime управление из админки + deep-link fs_* + маркетинг шаблоны
- Cron safety: token-based Redis locks + SQL atomic guards на статусных переходах; notify ограничены по времени (withTimeout ~5s)

Пожалуйста:
1) прочитай docs/README.md → затем docs/00_BOOT.md → затем docs/00_CURRENT_STATE.md
2) перечисли 3–7 самых рисковых зон регрессий
3) предложи следующий микро‑шаг без расширения поверхности и без лишних DB‑запросов в меню

Формат результата для любого изменения:
- FULL zip + Hotfix zip (только изменённые файлы) + git‑apply patch
- список изменённых файлов + что поменялось
- QA чеклист
---

---

## 3) Мини‑смоук, который ассистент должен предложить
- `/api/health` (ok/cron/audit)
- broadcast (создать тест → tick вручную → “завершена” с кнопками)
- /start (новый юзер видит роль, deep‑links не ломаются)

---

## 4) Быстрый шаблон промпта
Если хочется прям “как надо” — используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`


---
