# Collabka PR — PROCESS & WORK HISTORY

Собрано автоматически для NotebookLM. Обновлено: 2026-03-04 18:19:55 UTC

---

## SOURCE: `docs/process/07_WORK_HISTORY_2026_02.md`

# 07 — WORK HISTORY (timeline notes) — 2026-02

Этот файл — **сырой конспект** истории работ/решений, чтобы быстро восстановить контекст.

- **Не является source of truth.**
- Source of truth: **код** + `docs/00_CURRENT_STATE.md` + `docs/01_SECURITY_INVARIANTS.md`.

---

## Короткая выжимка (для быстрого восстановления контекста)

- STEP98–101: payments idempotency + fail-closed guard + action registry (аудит/железобетон)
- STEP105–106: structured contacts (profile_contacts) + UI креатора
- STEP137–139: IG verify Level B (cron + check-now + админ статус) — оставлено как legacy
- STEP140–148: IG OAuth-only (Level A) — реализовано, но Meta начала резать доступ к Pages (`pages=0`), поэтому…
- STEP149: IG UI **скрыт** (функция временно недоступна), остальной прод готовим к запуску

- STEP153: Brand Inbox (карточка заявки `status=new`) — баланс кредитов в UI **строго Redis-only**, без DB fallback; кеш обновляется после accept/платежей через `UPDATE ... RETURNING`.
- STEP154: Витрина креатора + диалог по заявке + brand hub (`bx_open`, `ws=0`) — баланс **строго Redis-only**, при пустом кеше показываем `—` (без чтения из Neon).
- STEP155: Добавлен Redis snapshot `brand_credits_snap:*` + прогрев/гидрация (всё Redis-only) и единый UI helper для блока “💳/🔓/trial”.
- STEP156 (docs-only): зафиксировали STEP153–155 в `00_CURRENT_STATE`/`WORK_HISTORY` + процесс: каждый следующий STEP обновляет доки.
- STEP157 (docs-only): описали поверхности просмотра (витрина/лента/каталог) + пагинацию; добавили публичный текст `docs/public/11_feeds_and_discovery_ru.md`.
- STEP158 (docs-only): добавили короткий блок в публичный one‑pager и FAQ со ссылкой на `docs/public/11_feeds_and_discovery_ru.md` (чтобы объяснение было “в одном месте” и без длинных сообщений).
- STEP159: админ-навигация (QStash статус): кнопка “⬅️ Назад” возвращает в 👑 Админку, “📋 Меню” — в пользовательское меню; убран дубликат Home в кураторском кабинете.
- STEP160: мини-аудит footer‑рядов: везде единый низ (⬅️ Назад / 📋 Меню / 🏠 Home) через `navKb`/`kbNavRow`; выровнены PRO/папки/Brand Team/поиск креаторов/шаги розыгрыша + gw_access + fallback replies.
- STEP161: добавлен линтер `npm run lint:nav` (scripts/lint-footer-nav.js), который ловит регрессии footer’ов; дополнительно добили несколько мест, где был `📋 Меню` без `🏠 Home`, чтобы lint проходил и UX был консистентным.
- STEP163: добавлен генератор `npm run gen:migration-pack` для `migration_pack/00_mark_all_applied.sql` (sha256 как в `migrations/run.js`), чтобы pack всегда совпадал с текущими миграциями.
- STEP208: migrations fail-fast — `migrations/run.js` и `scripts/gen-mark-all-applied.js` принимают только `NNN..._name.sql` (>=3 цифры) и падают, если в `migrations/` есть “левые” `.sql` (защита от случайного копирования `migration_pack/*.sql`).
- STEP209: action guards v2 — в `src/bot/actionRegistry.js` добавлены guard-типы `db_truth`/`queue_first` для критичных DB-truth путей (монетизация/ручной apply), обновлён middleware и доки.
- STEP210: anti-click-storm при Redis down — локальный in-memory limiter (TTL ~8s) на критичных DB-truth/queue-first кликах (`✅ Принять` / `🔓 Разлок контактов`).

- STEP226–230: audit hardening + антикаскад — SSL verify для Neon, атомарный rate limiter (Lua), `pg_try_advisory_xact_lock` в монетизации (accept/unlock), атомарные Redis буферы/счётчики (Lua), IG verify pagination, `/api/health` вылечен.
- STEP231: release preflight “Redis TTL smoke check” — короткая проверка `TTL=-1` (immortal keys) на expiring‑ключах через SCAN+TTL (док‑runbook).


Подробности по IG: `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`.


так смотри теперь в доках  мы все отобразили как что у нас теперь по контактам как ус роенго потому что мы делали аудит и поэтому по рекомендации меняли обновлялои, короче надо эту работу завфиксировать. 

вот аудит от которого мы обновляил работу

и потом мы начали работу:

Прочитал их “аудио-аудит”. В целом это нормальный разбор с правильными направлениями, но местами они драматизируют, и часть “критики” у нас уже закрыта последними шагами (DB-truth для unlock, ownership-in-SQL, strict validation оплат). 

Export text - Устранениедублейо…

Что у них сказано правильно (и это реально важно)

Fail-open только для UX, а все мутации/деньги — fail-closed.
Если Redis недоступен, нельзя “угадывать контекст” для опасных действий. Это правильный принцип. 

Export text - Устранениедублейо…

Идемпотентность оплат должна быть “железом” на уровне Postgres, а не “на честном слове” payload’а/Redis.
Идея про уникальный идентификатор фактической транзакции + INSERT ... ON CONFLICT DO NOTHING — прям топ-практика для serverless/ретраев. 

Export text - Устранениедублейо…

429 в рассылках: опасно держать всё на одном глобальном cooldown, если это реально стопорит курсор и жжёт CU.
Их идея “пер-получатель retry later / DLQ” — правильная стратегически, но это уже не микро-фикс. 

Export text - Устранениедублейо…

Санитайзер контактов в свободном тексте — кошки-мышки, и как долгосрочная защита монетизации лучше структурированные поля + валидация на сохранении. 

Export text - Устранениедублейо…


(При этом как временная мера — текущий redaction + тесты — это всё равно must-have.)

Где они перегнули / что уточнить

Про “злоумышленник отправит callback без UI” — в реальности callback приходит кликом по кнопке, но replay через старые/пересланные сообщения — да, реальный вектор.
То есть проблема не “любой отправит что угодно”, а “кнопка из прошлого может жить долго и быть использована в момент деградации Redis”. 

Export text - Устранениедублейо…

Про “payload неуникальный → бесконечные кредиты” — это возможно только если у нас нет DB-барьера на уровне платежа.
Strict-валидация (pre_checkout/successful) сильно снижает риск, но не заменяет DB-идемпотентность по charge_id.

Мой вывод

Разбор полезный. Я бы сформулировал приоритеты так:

P0 (надо сделать)

DB-идемпотентность оплат по Telegram charge id
Добавить unique constraint и проводить apply через ON CONFLICT DO NOTHING (и в successful_payment, и в cron autoheal, и в manual apply). Это “неубиваемая” гарантия в serverless.

Fail-closed guard для всех мутирующих a:* при Redis down
Не переписывая роутер: простой “классификатор actions” + middleware:

view можно оставить fail-open

edit/pay/admin/support ops — fail-closed, если контекст/Redis недоступен

исключения — только там, где ownership и разрешения полностью доказываются DB-safe getters.

P1 (хорошо бы)

Broadcast 429: не стопорить всё целиком
Если сейчас действительно курсор замирает и cron часто делает DB-poll — лучше идти итеративно:

сперва убрать лишние DB-проверки во время cooldown (Redis-until → ранний выход)

потом добавить “per user retry_after” или “quarantine list” (упрощённый DLQ), не меняя архитектуру целиком.

P2 (дорожная карта)

Структурированные контакты + валидация на входе
Это правильная финальная модель, но это уже изменение UX/схемы данных. Делать лучше отдельным этапом, аккуратно, без ломки.

Если ты согласен — логичный следующий микро-шаг по “железобетону монетизации” это P0.1: unique charge_id в payments (одна миграция + 2–3 места в apply). Потом P0.2: fail-closed middleware для мутирующих action-кейсов.


Ок — сделал оба шага по порядку, с проверяемыми артефактами.

STEP98 — P0.1 Payments: unique charge_id + DB-claim APPLYING (anti double-apply)
Что сделано

DB-claim перед выдачей: добавлен атомарный claimPaymentApplying() → ставит status='APPLYING' и не даёт двум раннерам (Telegram retry / cron / admin) одновременно выполнить сайд-эффекты.

Фикс пропущенной функции: добавлен getPaymentByTelegramChargeId() (в коде уже вызывался).

Claim добавлен в 4 критичных пути apply:

successful_payment (перед любыми авто-выдачами)

Admin → Apply (manual)

Admin → Auto-heal missing_session

cron auto-heal ORPHANED missing_session

Миграция: добавлен дополнительный unique safety-net на provider_payment_charge_id (partial unique, только NOT NULL).

Артефакты STEP98

FULL ZIP

Hotfix ZIP

PATCH (git apply)

Changed files list

QA checklist

Изменённые файлы:

migrations/036_payments_provider_charge_unique.sql

src/db/queries.js

src/bot/bot.js

src/bot/cron.js

docs/00_CURRENT_STATE.md

docs/01_SECURITY_INVARIANTS.md

STEP99 — P0.2 Fail-closed middleware для мутирующих callback actions при Redis down
Что сделано

В callback-router добавлен fail-closed guard:

если action выглядит мутирующим (*_do/_set/_apply/_del/_assign/...) → делаем лёгкую проверку Redis (GET health key)

если Redis недоступен → показываем alert и не выполняем действие

Исключения (allowlist, DB-safe):

a:wsp_contact_unlock (paid-unlock на DB-truth)

a:admin_pay_apply, a:admin_pay_autoheal (админка payments)

Артефакты STEP99

FULL ZIP

Hotfix ZIP

PATCH (git apply)

Changed files list

QA checklist

Изменённые файлы:

src/bot/bot.js

docs/00_CURRENT_STATE.md

docs/01_SECURITY_INVARIANTS.md

Если хочешь “совсем железобетон” следующим микро-шагом: сделать явную карту типов action keys (view/edit/pay/admin/ops) в одном месте (константа/таблица), чтобы middleware работал не по эвристике _do/_set/..., а по строгому реестру (и это же можно использовать для будущих аудитов и machine lists).


давай “совсем железобетон” следующим микро-шагом: сделать явную карту типов action keys (view/edit/pay/admin/ops) в одном месте (константа/таблица), чтобы middleware работал не по эвристике _do/_set/..., а по строгому реестру (и это же можно использовать для будущих аудитов и machine lists).

Сделал STEP100 — “совсем железобетон” реестр action keys (типы + guard) в одном месте + инструмент для machine list / аудитов. Middleware теперь работает строго по реестру, без эвристики _do/_set/....

Артефакты STEP100

FULL ZIP

Hotfix ZIP (только изменения)

PATCH (git apply)

Список изменённых файлов

QA чеклист

Что добавилось/как пользоваться

Source of truth: src/bot/actionRegistry.js
action → type (view/edit/pay/admin/ops/other) → guard (none/require_redis)

Проверка покрытия: npm run actions:check

сканирует код на все a:*

проверяет, что всё внесено в реестр

печатает machine list (sorted): action type guard (это можно прямо в аудит вставлять)

Если хочешь следующим микро-шагом — добавлю “экспорт в markdown” (готовая таблица для доков/аудитов) одной командой, чтобы вообще без ручной работы.


давай следующим микро-шагом — добавлю “экспорт в markdown” (готовая таблица для доков/аудитов) одной командой, чтобы вообще без ручной работы.

Сделал STEP101 — экспорт action registry в Markdown одной командой (готовая таблица для доков/аудитов, без ручной работы).

Что добавилось

npm run actions:md генерирует docs/02_ACTION_KEYS_REGISTRY.md (auto-generated):

считает actions “в коде” vs “в реестре”

если реестр неполный — падает (fail-fast)

выводит summary по type/guard + полную таблицу action → type → guard

Скрипт: scripts/actions-registry-export-md.js

Доки: добавлены ссылки/пояснения в docs/README.md, docs/01_SECURITY_INVARIANTS.md, docs/00_CURRENT_STATE.md

Артефакты STEP101

FULL ZIP

Hotfix ZIP

PATCH (git apply)

Список изменённых файлов

QA чеклист

Changed files

scripts/actions-registry-export-md.js

package.json

docs/02_ACTION_KEYS_REGISTRY.md (новый auto-generated)

docs/README.md

docs/01_SECURITY_INVARIANTS.md

docs/00_CURRENT_STATE.md


Думаю, оба пункта правильные, просто важно держать их в “правильном масштабе”: P1 — реально можно и нужно сделать итеративно без риска, а P2 — это уже продуктово-схемный рефактор, его лучше планировать отдельным этапом.

P1: Broadcast 429 — “не стопорить всё целиком”

Это “хорошо бы” превращается в надо, если сейчас при 429:

cron продолжает часто тикать и делает DB-poll в ожидании,

курсор рассылки замирает и система “жжёт” Neon,

/api/health не даёт ясной картины “мы в cooldown”.

Как сделать по уму, микро-шагами (без расширения поверхности)

Шаг 1 (самый безопасный, почти без риска): Redis-until → ранний выход

При 429 ставим broadcast:cooldown_until_ts в Redis (и last_429_at, last_429_reason).

В начале cron-тика: если now < cooldown_until → return сразу, без походов в DB.

/api/health показывает cooldown_until и “сколько тиков пропущено”.

Это обычно даёт 80% эффекта: снимает DB-нагрузку и “дребезг”.

Шаг 2 (серединка): per-recipient retry_after

Не блокировать весь батч из-за одного “тяжёлого” получателя:

сохраняем в Redis broadcast:retry_after:<userId> или <chatId>

при формировании очередного батча пропускаем тех, у кого retry_after > now

Курсор продолжает идти по остальным (если модель рассылки это позволяет).

Шаг 3 (упрощённый DLQ / quarantine list)

Если один и тот же получатель ловит 429/ошибку N раз — кладём в quarantine на X минут/часов.

Потом отдельным низкочастотным cron его “дожимает”.

Главная мысль: не ломать архитектуру. Просто добавляем “умный пропуск” и “дешёвое ожидание”.

P2: Структурированные контакты + валидация на входе

Это действительно “финальная правильная модель”, но она:

меняет UX (как креатор вводит данные),

меняет схему (новые поля/таблица),

требует миграции/обратной совместимости.

Почему это стоит делать, но отдельным этапом

Санитайзер текста — всегда игра в обходы. Мы уже сильно укрепили (редакт + тесты), но:

структурные поля дают простую гарантию: “контакты живут в одном месте, легко скрывать/открывать”.

валидация делается на сохранении, а не в рендере.

“Самый безопасный” путь без ломки

Добавить опциональные поля контактов (пустые по умолчанию).

На UI показывать/просить заполнить поля, но старый текст профиля не ломать.

В отображении: до unlock показывать “контакты скрыты”, после unlock — показывать структурированные поля + (опционально) отсанитайзенный текст.

Постепенный backfill из “о себе” — только best-effort, без обязательности.

Мой вердикт

P1 я бы делал следующим после нашей “монетизационной брони”, потому что это чистая надёжность + экономика, почти без продуктовых рисков. Начать с Redis-cooldown early exit.

P2 — держать в roadmap, но запускать только когда готовы тронуть UX/схему. Текущий анти-bypass + тесты уже дают хороший уровень, но структурка — это “конечная точка”.

Если хочешь — следующим STEP я сделаю P1 Шаг 1 (Redis cooldown early exit + health counters + QA + артефакты) — это прям идеальный микро-патч.


давай следующим STEP я сделаю P1 Шаг 1 (Redis cooldown early exit + health counters + QA + артефакты) — это прям идеальный микро-патч.

Сделал STEP102 — Broadcast 429: Redis cooldown early-exit (без DB polling) + health counters. Теперь при активном cooldown cron вообще не лезет в Neon за getActiveBroadcast() и сразу делает skip на Redis-данных.

Что изменилось

src/bot/cron.js

На 429 пишем global ключи:

broadcast:cooldown_until, broadcast:cooldown_broadcast_id

breadcrumbs: broadcast:last_429_at, broadcast:last_429_reason

дневные счётчики: broadcast:cooldown_set:d:YYYYMMDD, broadcast:cooldown_skip:d:YYYYMMDD

broadcastTick() теперь делает EARLY EXIT по broadcast:cooldown_until до любых DB вызовов.

api/health.js

/api/health читает global cooldown + counters напрямую из Redis (и оставляет fallback на старый per-broadcast ключ).

Доки обновлены:

docs/12_INFRA_CONTROL_PLANE.md

docs/00_CURRENT_STATE.md

Артефакты STEP102

FULL ZIP

Hotfix ZIP (только изменения)

PATCH (git apply)

Список изменённых файлов

QA чеклист

Если хочешь следующим микро-шагом (P1 шаг 2) — сделаем per-recipient retry_after (чтобы один “тяжёлый” получатель не стопорил весь батч), тоже аккуратно и без расширения поверхности.


давай следующим микро-шагом (P1 шаг 2) — сделаем per-recipient retry_after (чтобы один “тяжёлый” получатель не стопорил весь батч), тоже аккуратно и без расширения поверхности.


Сделал STEP103 — Broadcast per-recipient retry_after: один “тяжёлый” получатель с 429 больше не залипает и не стопорит рассылку бесконечно.

Что поменялось

DB-truth deferral на 429: при 429 мы пишем в broadcast_sent_log:

status='deferred'

retry_after_until=now()+retry_after

Scan-курсор двигается вперёд, поэтому следующий тик продолжает рассылку дальше, а deferred догоняются позже (когда окно истечёт).

Если fresh получателей нет, но есть deferred “ещё не пора” → тик возвращает skip: deferred_wait и ставит Redis cooldown до ближайшего retry (и это видно в /api/health).

/api/health теперь показывает дополнительные счётчики:

broadcast.counters.defer_set

broadcast.counters.defer_wait

Важно

Нужна миграция: 037_broadcast_sent_log_retry_after.sql (node migrations/run.js).

Артефакты STEP103

FULL ZIP

Hotfix ZIP (только изменения)

PATCH (git apply)

Список изменённых файлов

QA чеклист

Если хочешь следующим микро-шагом (P1 шаг 3 “лайт”): сделать quarantine для получателей, которые N раз подряд уходят в deferred (чтобы совсем не жечь тики на “проблемных” чатах), тоже аккуратно и без расширения поверхности

ок давай следующим микро-шагом (P1 шаг 3 “лайт”): сделать quarantine для получателей, которые N раз подряд уходят в deferred (чтобы совсем не жечь тики на “проблемных” чатах), тоже аккуратно и без расширения поверхности.

Готово — STEP104 (P1 шаг 3 “лайт”): добавил quarantine для получателей, которые N раз подряд уходят в deferred (429), чтобы не жечь тики на “проблемных” чатах. Без расширения поверхности: без новых таблиц/миграций, переиспользуем broadcast_sent_log.retry_after_until и добавили новый статус quarantined.

Что сделано

При 429:

пишем deferred как раньше (retry_after_until)

ведём Redis-счётчик “сколько deferral подряд” для (broadcast_id, user_id)

если счётчик ≥ BROADCAST_QUARANTINE_THRESHOLD → переводим запись в DB в status='quarantined' и удлиняем retry_after_until минимум до now + BROADCAST_QUARANTINE_SEC

listBroadcastUnsentRecipients() и getNextBroadcastDeferredRetryMs() теперь учитывают оба статуса: deferred и quarantined

/api/health показывает новый счётчик: broadcast.counters.quarantine_set

Документация обновлена (инфра + текущий стейт)

ENV (опционально)

BROADCAST_QUARANTINE_THRESHOLD (по умолчанию 3)

BROADCAST_QUARANTINE_SEC (по умолчанию 1200 = 20 минут, чтобы не блокировать пайплайн часами)

Артефакты STEP104

FULL ZIP

Hotfix ZIP (только изменения)

PATCH (git apply)

Список изменённых файлов

QA чеклист

Изменённые файлы:

src/bot/cron.js

src/db/queries.js

api/health.js

docs/12_INFRA_CONTROL_PLANE.md

docs/00_CURRENT_STATE.md

как на счет этого? P2 (дорожная карта) Структурированные контакты + валидация на входе Это правильная финальная модель, но это уже изменение UX/схемы данных. Делать лучше отдельным этапом, аккуратно, без ломки. можешь сначала все тщательно продумать спланировать посмотреть, найти наиболее сбалансированый и консистентный подход для нащего состояния и варианта по уму как мы делаем давай сначала все спланируй проверь и затем уже как надо сделаем, все очень аккуратно точно праивльно


Да, структурированные контакты + валидация на входе — это реально “финальная правильная модель” для монетизации, и её можно внедрить очень аккуратно, без ломки текущего UX и без увеличения DB-нагрузки в hot paths.

Я посмотрел текущее состояние кода (профиль креатора хранится в workspace_settings через profile_contact / profile_ig / profile_portfolio_urls / profile_about, показ бренду идёт через renderWsPublicProfile, unlock контактов — DB-truth + Redis кеш). Это позволяет сделать P2 эволюционно, не “переписывая систему”.

Цели P2

Контакты перестают жить в свободном тексте (или, по крайней мере, перестают быть источником истины).

Всё “контактное/линковое” хранится в одном месте и показывается только после unlock.

Ввод контактов проходит валидацию/нормализацию на входе, а не “постфактум редакт” в рендере.

Без регрессий: старые профили продолжают работать, “Контакт” остаётся как legacy, ничего не отваливается.

Ключевой баланс: как сделать без лишних DB-запросов

Мы уже делаем left join workspace_settings при загрузке витрины. Значит добавление одного JSONB-поля в workspace_settings:

не добавляет новых запросов

не меняет hot path архитектуру

даёт единый “контейнер” контактов без новых таблиц/джойнов

Рекомендованная схема (самая безопасная)

В workspace_settings:

profile_contacts jsonb not null default '{}'

(опционально) profile_contacts_v int not null default 1 — чтобы версионировать формат без боли

Структура JSON (v1):

{
  "tg": "username_without_at",
  "email": "name@domain.com",
  "phone": "+79991234567",
  "site": "https://example.com",
  "other": "опционально, коротко"
}

Почему так:

JSONB даёт гибкость и минимальные миграции

можно хранить пусто → ничего не ломаем

легко валидировать в коде

UX-план без ломки (поэтапно)
Этап 1 (самый безопасный): “Read-only support” без UI изменений

STEP105 (планируемый)

миграция: добавить profile_contacts (+ опционально profile_contacts_v)

расширить getWorkspace/getWorkspaceAny select list (просто поле, без новых запросов)

брендовый unlock/contact-pack и витрина:

если profile_contacts заполнен → показываем его после unlock

если пуст → продолжаем показывать legacy (profile_contact, profile_ig, portfolio)

ничего для креатора не меняем, риски минимальные

✅ Результат: мы уже можем “переключиться” на структурку там, где она есть, не трогая UX.

Этап 2: Новый раздел “Контакты” для креатора (opt-in)

STEP106 (планируемый)

в a:ws_profile добавляем кнопку: “📇 Контакты (структурно)”

внутри — отдельные кнопки:

“Telegram username”

“Email”

“Phone”

“Website”

“Очистить поле”

каждое поле вводится через expectText как сейчас, но:

валидируем

нормализуем

сохраняем в profile_contacts

legacy поле profile_contact оставляем, но помечаем как “старое” (можно потом скрыть/перенести)

✅ Результат: креаторы начинают заполнять структурку добровольно; ничего не ломаем.

Этап 3: Мягкая миграция legacy → structured (без крон-магии)

STEP107 (опционально)
Добавляем для креатора кнопку:

“✨ Перенести из ‘Контакт’ в структурный формат”

Логика:

если profile_contact распознался как @/t.me → tg

если email → email

если телефон → phone

если url → site
После переноса можно:

либо оставить legacy как есть

либо предложить очистить legacy (кнопкой) — чтобы больше не было обходов

✅ Результат: плавный переход без “авто-выдумывания” и без фоновых задач.

Валидация “на входе” (что именно проверяем)

tg: принимает @user, t.me/user, https://t.me/user → сохраняем user (без @), проверяем длину/символы

email: базовая проверка name@domain.tld

phone: вычищаем мусор (пробелы/скобки/дефисы/emoji), нормализуем в +digits, минимальная длина 10–15 цифр

site: если нет схемы — добавляем https://, запрещаем tg:// как сайт, но t.me уводим в tg-поле

Важно: redactContactsInText остаётся как “страховка” для profile_about, но источник истины становится profile_contacts.

Показ бренду и контакт-пакет

До unlock: вообще не показываем profile_contacts (ни текстом, ни кнопками)

После unlock:

показываем аккуратный блок “Контакты”

URL-кнопки: максимум 3 (как сейчас) — выбираем приоритетом:

Telegram (канал или tg-контакт)

Instagram

Website/Portfolio (первый)

Email/phone — лучше без url-кнопок (только текст), чтобы не было лишних “кликабельных сюрпризов”.

migration_pack — нужно ли обновлять?

На старте нет, если твой стандартный путь — node migrations/run.js.

Но если ты хочешь “максимально пуленепробиваемо” для аварийного сценария, когда кто-то запускает migration_pack/01_reconcile.sql и забывает миграции — тогда можно добавить туда 1 строку alter table workspace_settings add column if not exists profile_contacts jsonb... как safety-net. Это я бы делал отдельным микро-шагом, чтобы не смешивать.

Риски и как их убрать

Риск: креаторы продолжают пихать контакты в “О себе” → у нас уже есть редакт + тесты, плюс можно добавить мягкое предупреждение “лучше заполнить структурный раздел”.

Риск: “двойной источник” (legacy + structured) → решается правилом отображения:

structured имеет приоритет

legacy показываем только если structured пуст

Как предлагаю двигаться дальше

Сначала STEP105: только миграция + read-only поддержка structured в витрине/контакт-пакете (нулевой UX-риск).

Потом STEP106: UI для креатора на ввод структурных контактов.

Потом (по желанию) STEP107: перенос legacy → structured одной кнопкой.

Если ок — я следующим шагом сделаю STEP105 с артефактами (FULL ZIP + Hotfix + PATCH + files list + QA), максимально маленький и обратимый.


ок , отлично давай делать как сказал все по уму , ок следующим шагом сделаю STEP105 с артефактами (FULL ZIP + Hotfix + PATCH + files list + QA), максимально маленький и обратимый.

Сделал STEP105 (P2 roadmap start) — Structured contacts container (read-only): добавили workspace_settings.profile_contacts (JSONB) и научили витрину/контакт-пакет читать структурные контакты только после unlock (или в owner preview). UX для креаторов пока не трогали — полностью обратимо и без ломки.

Что сделано

✅ Миграция: migrations/038_workspace_profile_contacts.sql
Добавляет:

profile_contacts jsonb not null default '{}'

profile_contacts_v int not null default 1

✅ src/db/queries.js: getWorkspaceAny/getWorkspace/listWorkspaces/findWorkspaceByChannelUsername теперь возвращают profile_contacts.

✅ src/bot/bot.js:

В витрине: если profile_contacts заполнен → показываем его только после unlock.

Кнопка 💬 Написать после unlock теперь приоритетно ведёт на https://t.me/<profile_contacts.tg> (если есть), иначе — на legacy contact.

В “Контакт-пакете” после unlock добавлены строки из structured.

✅ Доки обновлены: docs/00_CURRENT_STATE.md, docs/01_SECURITY_INVARIANTS.md.

migration_pack не трогал — для STEP105 это не нужно (всё идёт через migrations/run.js). Если захочешь “аварийный safety-net” в pack — сделаем отдельным микро-шагом.

Артефакты STEP105

FULL ZIP

Hotfix ZIP (только изменения)

PATCH (git apply)

Список изменённых файлов

QA чеклист

Изменённые файлы:

migrations/038_workspace_profile_contacts.sql (new)

src/db/queries.js

src/bot/bot.js

docs/00_CURRENT_STATE.md

docs/01_SECURITY_INVARIANTS.md




---

## Продолжение (актуализация до STEP117)

- **STEP106** — UI креатора для структурных контактов (opt‑in): «📇 Контакты (структурно)», валидация/нормализация на входе.
- **STEP107** — кнопка переноса из свободного текста «✏️ Контакт» в структурные поля (только при однозначном распознавании, без перетирания).
- **STEP108** — UX‑подсказки: «достаточно 1 контакта (обычно TG), телефон не обязателен», явный приоритет structured → (если пусто) контакт (текстом).
- **STEP109** — фиксация модели контактов в доках + добавлен `docs/20_CONTACTS_MODEL.md`, сохранены аудит STEP94 и история работ в `docs/process/*`.

- **STEP110** — Creator → заявка бренду: явный режим ввода (expectText) после «✍️ Написать заявку» + «❌ Отмена ввода».
- **STEP111** — Brand Pass: кнопка «💳 Купить ещё» из витрины креатора + «⬅️ Вернуться к витрине» после покупки.
- **STEP112** — Brand Inbox: защита монетизации — сначала **✅ Принять** (списание), до принятия нельзя «Ответить/Шаблоны».
- **STEP113** — Brand Inbox: подсказка “Твой баланс: …” рядом с ✅ Принять (Redis-only, без DB fallback).

- **STEP114** — Giveaways: gate‑экран при создании розыгрыша без доступного канала (как у офферов), чистка stale `active_ws`, корректный back.
- **STEP115** — UX polish: убрали “legacy/старое” из UI, добавили кнопку `🧹 Очистить` для поля «✏️ Контакт», скрыли подсказки про “-” (оставили как неявный шорткат для совместимости).
- **STEP116** — Sweep: убрали “молчаливые тупики” на популярных кнопках/переходах, добавили понятные подсказки и кнопки назад/меню/home; очистка IG/портфолио/описания тоже через `🧹 Очистить`.
- **STEP117** — Унификация текстов гейтов для новичка (короткий единый стиль без перегруза).

---

## Продолжение (актуализация до STEP124)

- **STEP118** — привели docs в порядок под актуальный snapshot (contacts model / handoff / README / process).
- **STEP119** — anti‑bypass: маскирование телефонов, написанных **словами** в `profile_about` (defense-in-depth до unlock).
- **STEP120** — Broadcast 429: добавлен **DB fuse** `broadcasts.cooldown_until` на случай деградации Redis (ранний exit до polling recipients).
- **STEP121** — Break‑glass allowlist для супер‑админа при Redis down (двойное подтверждение `bg=1` + ops alert), остальное fail‑closed.
- **STEP122** — Ops alerts для auto‑heal ORPHANED payments при `validation_failed`/`manual_required` (без изменения apply-логики).
- **STEP123** — Docs closeout по аудиту (консистентность доков с кодом + процессный файл audit closeout).
- **STEP124** — Inbox polish: до ✅ Принять (status=new) доступны только ✅ Принять / ⛔ Спам / 🗑 Удалить; запрет «💬 В работу/✅ Закрыть» до принятия; исправлен креаторский CTA «💬 Написать бренду» (без “тишины”).
---

## STEP162 — Migration pack refresh (Neon move safety)
- Обновили `migration_pack/00_mark_all_applied.sql`: теперь покрывает весь текущий набор миграций **до `041_*.sql`** и актуальные sha256 checksums.
- Обновили `migration_pack/01_reconcile.sql`: расширили idempotent repair (pgcrypto/outbox/audit + safety‑net для broadcast/qstash/brand pass/structured contacts/payments).
- Убрали дубли `migrations/00_mark_all_applied.sql` и `migrations/01_reconcile.sql`, чтобы раннер `migrations/run.js` не применял pack‑скрипты как обычные миграции (особенно опасно на fresh DB).
- Доки синхронизированы: `docs/11_MIGRATIONS_PACK.md`, `docs/00_CURRENT_STATE.md`.

## STEP163 — Generator for `00_mark_all_applied.sql` (migration_pack)
- Добавили `scripts/gen-mark-all-applied.js`: читает `migrations/*.sql`, считает sha256 как в `migrations/run.js`, генерирует `migration_pack/00_mark_all_applied.sql`.
- Добавили команды: `npm run gen:migration-pack` и алиас `npm run gen:mark-all-applied`.
- Обновили доки: `docs/11_MIGRATIONS_PACK.md`, `docs/00_CURRENT_STATE.md`.


- STEP164 (docs-only): добавлен NotebookLM audit pack (`docs/audit/*`): порядок загрузки, промпт аудита, текст для аудиопересказа.

## STEP165 — NotebookLM: SQL workaround + sources generator (docs-only + tooling)
- NotebookLM часто блокирует `.sql` → добавили txt-копии для загрузки: `migrations_txt/*.sql.txt` и `migration_pack_txt/*.sql.txt`.
- Добавили команду `npm run gen:notebooklm-sources`: генерит `dist/notebooklm_sources/` и (best-effort) `dist/NOTEBOOKLM_AUDIT_SOURCES.zip`.
- Добавили `docs/neon/NEON_HISTORY_RAW.txt` как доп. контекст по Neon (не миграция).

## STEP166 — P0: Monetization CTAs survive Redis degradation
- **Не прячем CTA из‑за “💳 Кредиты: —”**: действия списания (✅ Принять / 🔓 Разлок) доступны всегда.
- Проверка баланса и списание происходят **только на клике** (DB truth, idempotent SQL).
- `a:brand_app_accept` в `src/bot/actionRegistry.js` переведён на guard `NONE`, чтобы accept не блокировался при Redis down.
- Экран запроса разлока контактов на витрине (`a:wsp_contact_req`) больше не скрывает кнопку разлока при неизвестном балансе.

## STEP167 — Payments: anti-ORPHANED + anti-race buffer (serverless-safe)
- Добавлен буфер для auto-heal ORPHANED `missing_session`: **не трогаем слишком свежие платежи** (по умолчанию 5 минут).
  - ENV: `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC` (0..3600, default 300).
- Cron auto-heal (`src/bot/cron.js`) и ручной auto-heal в админке теперь **пропускают** платежи моложе min-age.
- UX: при `missing_session` пользователю показываем, что бот попробует применить оплату автоматически в течение ~N минут (если auto-heal эффективен).
- `/api/health` показывает `orphaned_autoheal_min_age_sec` и `orphaned_autoheal_effective`.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/01_SECURITY_INVARIANTS.md`.


## STEP168 — Audit DB: fail-closed на деградации Redis + расширили throttle-prefixes
- `auditWorkspace()` больше не делает **fail-open** при ошибках Redis rate-limit: если Redis недоступен, события под `AUDIT_DB_THROTTLE_PREFIXES` **дропаются** (fail-closed), чтобы не “сжечь” Neon всплеском `INSERT`.
- Расширили default `AUDIT_DB_THROTTLE_PREFIXES`: теперь в guardrail входят `deal.` и `inbox.` (помимо `lead.`/`folders.`/`ws.profile_`).
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/12_INFRA_CONTROL_PLANE.md`, `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`.


## STEP169 — Broadcast/QStash: 429 retryable + quarantine + cooldown fast-path (Neon-safe)
- В воркере `POST /api/qstash/broadcast-deliver` 429 **не помечается non-retryable**: получатели не “вылетают навсегда”.
- Добавили per-recipient quarantine на повторных 429 (Redis counter → DB `status='quarantined'`, `retry_after_until` продлевается).
  - ENV: `BROADCAST_QUARANTINE_THRESHOLD` (default 3), `BROADCAST_QUARANTINE_SEC` (default 1200).
- Чтобы не сжигать Neon CU на массовых 429: cooldown проверяется **до DB reads** (Redis-only) + micro-memo `QSTASH_BC_COOLDOWN_MEMO_TTL_MS`.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/10_QSTASH_RUNBOOK.md`.


## STEP170 — Instagram OAuth: kill-switch (UI hidden → API closed)
- Закрыли “теневое API”: если `IG_OAUTH_UI_ENABLED=0`, то все роуты `/api/ig/oauth/*` возвращают **404** ещё до выполнения логики.
- Это не влияет на прод‑функции (IG UI и так скрыт), но уменьшает поверхность атаки и исключает неожиданные вызовы эндпоинтов “в обход UI”.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`.


## STEP171 — Monetization circuit breaker: 2s timeout → «в обработке» + QStash retry
- Для критичных списаний (✅ Принять / 🔓 Разлок контактов) добавили короткий timeout на DB‑вызовы.
- При TIMEOUT/транзиентных ошибках: UI отвечает «⏳ В обработке…» и ставит задачу в QStash (dedup) на `POST /api/qstash/monetization-retry`.
- Воркер делает DB‑truth мутацию и best‑effort обновляет Redis‑кеши (`brand_credits`, `wsp_contact`) + отправляет уведомления в Telegram.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP189 — System Notice v2: targeting + CTA + auto-expire (Redis-only)
- Расширили объект `sys:notice` (Redis-only): добавлены `target` (`all/brand/creator`), `ctaLabel/ctaUrl` (URL‑кнопка), `expiresAt` (epoch seconds).
- Админка: новые действия **🎯 Кому**, **🔗 CTA**, **⏰ Expire** (всё без DB).
- Показ пользователям по-прежнему 1 раз на версию:
  - если `expiresAt` в прошлом — не показываем,
  - если `target!=all` — показываем только целевой роли (определяем по Redis: `ui_mode` + `bm_mode`),
  - если `ctaUrl` задан — добавляем URL‑кнопку.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP190 — Admin: DM templates CRUD (Redis-only)
- Добавили управление шаблонами для админ‑DM из STEP187: `👑 Админка → 📌 Шаблоны DM`.
- Хранение: Redis object `sys:admin_dm_templates` (без DB).
- CRUD:
  - ➕ новый шаблон (1-я строка — название, дальше текст),
  - ✏️ редактирование,
  - 🗑 удаление,
  - ♻️ сброс к дефолту (удаляет ключ в Redis).
- В `✉️ Написать` шаблоны подтягиваются из Redis; если кастома нет / Redis деградировал — используем дефолтный набор.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP191 — Admin DM: placeholders + “📎 Вставить” (Redis-only)
- Добавили плейсхолдеры в шаблоны админ‑DM и в свободный текст:
  - `{{username}}`, `{{user_id}}`, `{{first_name}}`, `{{role}}`, `{{bot_name}}`.
- Подстановка значений:
  - в предпросмотре показываем уже “развёрнутый” текст,
  - при отправке подставляем повторно (best-effort; username/first_name берём через Telegram `getChat`, роль — из Redis `ui_mode`).
- Добавили кнопку **📎 Вставить**:
  - в “✉️ Написать”,
  - в списке/карточке шаблона,
  - в экранах добавления/редактирования шаблонов.
- Без миграций/DB: хранение шаблонов и вся логика остаются Redis-only.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.



## STEP172 — /api/health: mon.retry (Redis-only)
- Добавили в `/api/health` блок `mon.retry` с полями `last_at` и `last_action`.
- Данные берутся **только из Redis** (ключи пишет воркер `POST /api/qstash/monetization-retry`).
- Цель: быстро видеть, что воркер отрабатывает и QStash‑ретраи не “молчат”, без DB‑запросов.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP173 — /api/health: mon.retry.last_status + last_error (Redis-only)
- Расширили breadcrumbs воркера монетизации (QStash retry): добавили поля `last_status` (`ok` / `skipped` / `error`) и `last_error` (короткий код).
- Все значения пишутся/читаются **только через Redis**:
  - воркер `POST /api/qstash/monetization-retry` записывает `mon:retry:last_status` / `mon:retry:last_error` (best-effort).
  - `/api/health` читает эти ключи и отражает в `mon.retry`.
- Цель: видеть не только “было ли”, но и “успешно/пропущено/ошибка”, без DB‑нагрузки.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP174 — Optimistic monetization: Redis token-lock (~10m) + QStash commit
- Перевели критичные клики монетизации на “queue‑first” режим (если QStash настроен):
  - ✅ Принять заявку бренда (`a:brand_app_accept`)
  - 🔓 Разлок контактов на витрине (`a:wsp_contact_unlock`)
- На клике берём **Redis token‑lock** (safe lock) и публикуем задачу в `POST /api/qstash/monetization-retry` (dedup).
  - Повторные клики в окне lock → «⏳ Уже в обработке…» без дублей.
- Воркер (QStash) best‑effort освобождает lock по токену после обработки (или ждём TTL).
- Fail‑open: если Redis/QStash недоступен — остаётся синхронный DB‑truth путь (и STEP171 circuit breaker на таймауты).
- ENV:
  - `MONETIZATION_TOKEN_LOCK_TTL_SEC` (default 600) — TTL token‑lock.

- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP175 — UI anti-spam: hide monetization CTAs while token-lock active (Redis-only)
- В Brand Inbox карточке `status=new`: если token‑lock `mon:lock:brand_app_accept:<appId>` активен, скрываем **✅ Принять** и показываем «⏳ …в обработке» + «🔄 Обновить».
- В витрине (locked contacts): если token‑lock `mon:lock:wsp_contact_unlock:<wsId>:<brandUserId>` активен, скрываем CTA разлока и показываем “pending” + «🔄 Обновить».
- В экране `a:wsp_contact_req`: если разлок уже в очереди — не показываем кнопку списания повторно.
- Всё сделано **без DB**: только Redis GET по ключам `mon:lock:*`.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.
## STEP176 — Intro (💬 Написать): token-lock + circuit breaker + QStash commit + pending UI
- Для клика «💬 Написать» (интро = новый диалог, списание кредитов) добавили защиту “как у монетизации”:
  - Redis token‑lock `mon:lock:intro_open:<offerId>:<buyerUserId>` (anti-double-click)
  - короткий timeout на DB‑операцию (circuit breaker)
  - при TIMEOUT/транзиентных ошибках → ставим `action=intro_open` в `POST /api/qstash/monetization-retry` (dedup) и показываем UI «⏳ В обработке…».
- Воркер QStash:
  - выполняет `getOrCreateBarterThreadWithCredits()` идемпотентно
  - обновляет Redis `brand_credits` кеш (best-effort)
  - шлёт Telegram‑уведомление с кнопкой “Открыть диалог” или “Купить кредиты”/“Лимит”
  - освобождает token‑lock по токену (best-effort) или ждём TTL.
- UI anti‑spam на карточке оффера (`renderBxPublicView`): если token‑lock активен, скрываем «💬 Написать», показываем “pending” + Inbox/Обновить (Redis-only).
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP177 — Intro: fail-open guard (Redis degraded safe)
- `a:bx_msg` переведён на `guard=NONE`, чтобы при деградации Redis интро не блокировалось на входе.
- При проблемах Redis token-lock может быть недоступен, но остаётся краткий sync‑путь (circuit breaker) и QStash retry (dedup) с понятным pending UI.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP178 — Intro DB exact-once: pg advisory lock по (offer_id, buyer_user_id)
- В `getOrCreateBarterThreadWithCredits()` добавили `pg_advisory_xact_lock` по паре `(offer_id, buyer_user_id)` и повторную проверку треда после lock.
- Это делает интро “железобетонным” при double-click и параллельных вызовах (sync + QStash): один тред, одно списание, без ложных paywall/limit ответов.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP179 — /api/health: mon.intro breadcrumbs (Redis-only)
- Добавили в `/api/health` блок `mon.intro`:
  - `last_at`
  - `last_status` (`ok` / `skipped` / `error`)
  - `last_error` (короткий код)
  - `last_offer_id` (masked)
- Все значения пишутся/читаются **только через Redis**:
  - клик `a:bx_msg` (интро) записывает breadcrumbs best‑effort.
  - воркер `POST /api/qstash/monetization-retry` (action=`intro_open`) тоже обновляет breadcrumbs.
- Цель: видеть “интро живо / блок (paywall/limit) / ошибка” одним взглядом, без DB‑нагрузки.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP180 — Монетизационные breadcrumbs: общий helper `src/lib/monDiag.js`
- Вынесли общие утилиты диагностики в один модуль:
  - short‑code нормализация (`toMonCode`)
  - маскирование ID (`maskId`)
  - запись Redis breadcrumbs (`setMonRetryMeta`, `setMonRetryDiag`, `setMonIntroDiag`)
- Подключили helper в:
  - `src/bot/bot.js` (интро attempt/результат)
  - `api/qstash/monetization-retry.js` (воркер retry + intro_open)
- Цель: убрать дублирование и исключить “дрейф” форматов/ключей/TTL, без изменения продуктовой логики.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP181 — Pending UX standardization: Inbox + Refresh (Redis-only)
- Привели “pending” UI к единому стандарту для ключевых кликов монетизации:
  - ✅ Принять заявку бренда: единый текст “⏳ В обработке…” + кнопки **📥 Inbox / 🔄 Обновить**.
  - 🔓 Разлок контактов: единый pending экран (Inbox/Обновить + **💳 Купить ещё**) и общий helper внутри обработчика.
  - 💬 Интро: pending UI приведён к стандарту (Inbox/Обновить), включая карточку оффера (кнопки вместо “⏳ Интро…”).
- В pending-рендерах — **только Redis** (token-lock/breadcrumbs), без лишних DB-чтений в UI.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP182 — /api/health: mon.accept + mon.unlock breadcrumbs (Redis-only)
- Добавили в `/api/health` два новых блока наблюдаемости:
  - `mon.accept` (✅ Принять, Brand Inbox):
    - `last_at`
    - `last_status` (`ok` / `skipped` / `error`)
    - `last_error` (короткий код)
    - `last_app_id` (masked)
  - `mon.unlock` (🔓 Разлок контактов):
    - `last_at`
    - `last_status` (`ok` / `skipped` / `error`)
    - `last_error` (короткий код)
    - `last_ws_id` (masked)
- Запись breadcrumbs — **best-effort и Redis-only**:
  - клик‑обработчики (`a:brand_app_accept`, `a:wsp_contact_unlock`) пишут attempt/результат.
  - воркер `POST /api/qstash/monetization-retry` (actions `brand_app_accept` / `wsp_contact_unlock`) пишет итог воркера.
- Общий формат/ключи/TTL централизованы в `src/lib/monDiag.js`.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.



## STEP183 — /api/health: mon.accept + mon.unlock last_source (Redis-only)
- В блоки `/api/health.mon.accept` и `/api/health.mon.unlock` добавили поле:
  - `last_source` (`click` / `worker`)
- Значение пишется **только в Redis**, best-effort:
  - клик‑обработчики монетизации пишут `last_source=click`
  - воркер `POST /api/qstash/monetization-retry` пишет `last_source=worker`
- Цель: мгновенно видеть в `/api/health`, что “последнее обновление” пришло от клика в боте или от фонового воркера.
- Общий формат/ключи/TTL централизованы в `src/lib/monDiag.js`.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP184 — Repo + Audit packs synced to STEP183 snapshot
- Сверили архив репозитория пользователя с `FULL_STEP183` и привели к **точно такому же** состоянию (код + доки + миграции).
- Обновили audit-pack (NotebookLM sources) на базе актуальных `docs/` + `migrations/` + `migration_pack/`.
- Этот шаг **не меняет поведение** по сравнению с STEP183; это чисто синхронизация артефактов/доков.

## STEP185 — docs/neon: fix broken filename (mojibake)
- Исправили битое имя файла в `docs/neon/`: теперь файл называется `docs/neon/NEON_HISTORY_RAW.txt` (ASCII, чтобы ZIP не ломался на Windows) (UTF‑8), как и указано в `docs/neon/README.md`.
- Обновили audit-pack (NotebookLM sources), чтобы туда тоже попал файл с правильным именем.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

### STEP186 — NotebookLM pack ≤50 files (no .sql), bundled sources
- Added `docs/audit/notebooklm_pack/` with curated bundles for NotebookLM (≤50 files, .md/.txt only).
- Added code bundle + migrations bundle as text for NotebookLM.
- Updated `scripts/gen-notebooklm-sources.js` to output `dist/NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip` and enforce 50-file limit.
- Updated `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` with NotebookLM constraints.


## STEP187 — Admin: send message to user from user card (MVP)
- В `👑 Админка → Пользователи → Карточка пользователя` добавлена кнопка **«✉️ Написать»**.
- Два режима:
  - шаблоны (6 кнопок: ack/need/done/wip/pay/limit) → предпросмотр → подтверждение;
  - свободный текст (в DM с ботом) → предпросмотр → подтверждение.
- Без миграций: отправка напрямую через Telegram `sendMessage`.
- Best‑effort анти‑дубликат: Redis dedup на 60 сек по `(admin_tg_id, target_tg_id, hash(text))`.
- Best‑effort лог отправки: в `SUPPORT_CHAT_ID` (если задан) иначе всем `SUPER_ADMIN_TG_IDS`.


## STEP188 — Admin: System Notice (Redis-only banner, без рассылки)
- В админке добавлен экран **«📣 Объявление»** для управления системным сообщением проекта.
- Хранение: **только Redis** (object key `sys:notice`): `active`, `severity`, `version`, `text`, `updatedAt`.
- Публикация: кнопка **«🚀 Опубликовать (новая версия)»** увеличивает `version` и включает `active`.
- Показ пользователям: при входе в `📋 Меню` / `🏠 Home` бот отправляет объявление **1 раз на версию** (seen‑ключи в Redis с TTL ~180d).
- Никакой рассылки/сканов по базе: это пассивное сообщение, не трогающее Neon.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.



## STEP189 — Admin: System Notice v2 (targeting + CTA + auto-expire, Redis-only)
- Расширили System Notice (STEP188): добавили `target` (all/brand/creator), `ctaLabel/ctaUrl` и `expiresAt` (auto-expire).
- Таргетинг роли — строго Redis-only (по `ui_mode` + `bm_mode`), без DB.
- В админке в экран «📣 Объявление» добавлены кнопки: 🎯 Кому, 🔗 CTA, ⏰ Expire.
- Показ пользователям: 1 раз на версию, не показываем если истекло, CTA-кнопка если задана.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP190 — Admin: DM шаблоны (Redis-only CRUD)
- Шаблоны для «✉️ Написать пользователю» вынесены из хардкода в Redis.
- Админка: `👑 Админка → 📌 Шаблоны DM`:
  - список + пагинация,
  - ➕ новый (1-я строка — label, дальше текст),
  - ✏️ edit / 🗑 delete,
  - ♻️ reset к дефолту.
- В карточке пользователя кнопки шаблонов подтягиваются из Redis; при отсутствии/деградации Redis — fallback на дефолтный набор.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP191 — Admin DM: плейсхолдеры + кнопка “📎 Вставить” (strict allowlist)
- Добавили плейсхолдеры для шаблонов и свободного текста: `{{username}}`, `{{user_id}}`, `{{first_name}}`, `{{role}}`, `{{bot_name}}`.
- Подстановка делается в предпросмотре и повторно при отправке (best-effort).
- Добавлена подсказка/кнопка “📎 Вставить” в экранах шаблонов и в композере сообщений.
- Dedup (anti-double-click) теперь считается по финальному тексту после подстановки.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP193 — Admin: Outbox лог отправок (Redis-only)
- Добавили экран `👑 Админка → 📤 Outbox` — журнал последних отправок админских DM.
- Хранение: Redis list `admin_outbox` (LPUSH + LTRIM), последние ~200 записей.
- Записываем результат каждой попытки отправки DM (STEP187):
  - ok/failed, время, получатель, админ,
  - snippet текста + hash,
  - (если есть) шаблон/плейсхолдеры,
  - ошибка Telegram (коротко) при failed.
- Добавили очистку Outbox с подтверждением.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP194 — Admin: заметки в карточке пользователя (Redis-only)
- В карточке пользователя (`👑 Админка → Пользователи → Карточка`) добавили строку **«📝 Заметка»** (показываем короткий snippet).
- Кнопка **«📝 Заметка»** открывает экран заметки (только в DM с ботом):
  - ✏️ изменить (ввод одним сообщением через `expectText`)
  - 🧹 очистить (с подтверждением)
- Хранение: **только Redis** (key `mg:<env>:adm_user_note:<userId>`), без таблиц и миграций.
- Безопасность: содержимое заметок показываем/редактируем только в **личном чате** с ботом, чтобы не светить заметки в группах.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP195 — Admin: теги к заметке пользователя (Redis-only, strict allowlist)
- Добавили теги к `📝 Заметка (admin)` (переключатели кнопками).
- Теги (MVP allowlist): `VIP`, `SPAM?`, `FOLLOW`, `PAY`.
- Хранение: тот же Redis key `mg:<env>:adm_user_note:<userId>`, теперь объект `{ text, tags, updatedAt, byAdmin... }`.
- Совместимость: если в Redis лежит старая заметка-строка — продолжаем отображать (tags пустые).
- Очистка “🧹 Очистить всё” удаляет и текст и теги.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP196 — Admin: маркер заметки/тегов в каталоге пользователей (Redis-only)
- В `👑 Админка → 👥 Пользователи` добавили индикатор `📝` и короткие теги (до 2) прямо в списке.
- Показ пометок — только в **личном чате** с ботом (в группах не показываем).
- Реализация Redis-only: bulk load заметок для текущей страницы (MGET если доступен; fallback на GET), Neon не трогаем.
- Для быстрого доступа (когда на странице 1–5 пользователей) добавили `📝` в label кнопок перехода в карточку.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP197 — Admin: быстрые действия из списка пользователей (DM-only)
- В `👑 Админка → 👥 Пользователи`, когда на странице 1–5 результатов, показываем быстрые действия прямо в списке (только в DM):
  - `👤` карточка,
  - `✉️` написать,
  - `📝` заметка.
- Цель: ускорить поддержку без лишних переходов, при этом не расширяя поверхность (всё уже существующие экраны/действия).
- В группах быстрые действия не показываем.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP198 — UX: системные сообщения пользователям (admin DM + System Notice)
- Привели “сообщения от проекта” к понятному и минимальному UX:
  - Admin DM (STEP187): `📋 Открыть меню` / `💬 Поддержка` / `✅ Понятно` (ack убирает кнопки).
  - System Notice (STEP188/189): те же кнопки, без лишних `Home` под сообщением.
- Добавили “📣 Актуальное объявление” в `📋 Меню` и `🏠 Home` (показывается только если notice активен/не истёк и таргет подходит роли).
  Нажатие открывает текущее объявление повторно (не влияет на `seen`).
- Всё Redis-only, без миграций и без DB-сканов. Zero regressions.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP199 — UX: “🧭 Быстрый старт” перенесён в Help/Support
- Убрали кнопку `🧭 Быстрый старт` из основных хабов (`📋 Меню`, `🏠 Home`, Curator Mode), чтобы не мешала в рабочем UI.
- Доступ к гайду сохранён в “правильном” месте:
  - `💬 Поддержка` → кнопка `🧭 Быстрый старт`,
  - `/help`.
- Только перестановка кнопок, без миграций и без новых DB-запросов. Zero regressions.
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP200 — UX: 👑 Админка разнесена на 3 экрана (Операции / Коммуникации / Система)
- Главный экран `👑 Админ-панель` теперь короткий: 3 раздела:
  - `🧰 Операции` (пользователи/платежи/рассылка/аудит/метрики),
  - `💬 Коммуникации` (объявление/шаблоны DM/outbox/офиц.канал),
  - `⚙️ Система` (тумблеры, QStash, модераторы, подарки, Founder).
- Логика/коллбеки прежние: это чистый UX-рефактор, без миграций и без изменения данных. Zero regressions.
- Навигация: “⬅️” на экранах теперь ведёт в соответствующий раздел (например `🛰 QStash статус` → `⬅️ Система`).
- Тумблеры (`прием платежей`, `автовыдача`, `match/feat`, `fan-out`) после переключения возвращают в `⚙️ Система` (чтобы не прыгать в корень).
- Доки синхронизированы: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP201 — Admin UX Standard + единые футеры (Menu/Home) по админ‑экранам
- Добавлен документ‑правило: `docs/process/09_ADMIN_UX_STANDARD.md`.
  - фиксируем: какие “⬅️” куда ведут, escape‑ряд `📋 Меню` + `🏠 Home`, и базовые правила раскладки кнопок.
- В `src/bot/bot.js` добавлен helper `kbAdminFooter(kb, backText, backCb)` и применён в админ‑флоу (users/comms/outbox/templates/notice/support).
- Привели админ‑клавиатуры к стандарту: на экранах с админским back теперь всегда есть `📋 Меню` + `🏠 Home` (убираем “тупики”).
- Обновлён линтер футеров `scripts/lint-footer-nav.js`:
  - учитывает back‑кнопки `⬅️ Операции/Коммуникации/Система`;
  - распознаёт `kbAdminFooter(...)` как “OK”.
- Технический фикс: восстановлена корректная структура `renderAdminUserCard` (устранён “битый” фрагмент, который мог ломать парсинг/рантайм).
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP202 — Action Registry Sync (админские callback keys + экспорт docs)
- `npm run actions:check` раньше падал: после STEP190–201 добавились новые callback action keys (админ‑секции, System Notice, Outbox, CRUD шаблонов, плейсхолдеры, user ack).
- Обновлён `src/bot/actionRegistry.js`: добавлены недостающие ключи и выставлены корректные `type/guard` (fail‑closed при Redis down только там, где нужно).
- Перегенерирован авто‑документ: `docs/02_ACTION_KEYS_REGISTRY.md` (`npm run actions:md`).
- Результат: `actions:check`/`actions:md` проходят чисто; реестр снова является единственным source of truth для guard/machine list.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP203 — Preflight QA одной командой перед релизом
- Добавлен `npm run preflight` (alias `npm run qa:fast`).
- Preflight прогоняет: `actions:check` → `actions:md` (и проверяет, что `docs/02_ACTION_KEYS_REGISTRY.md` **не изменился**) → `lint:nav` → `test:redact`.
- Реализация: `scripts/preflight.js` (node, без bash‑зависимостей).
- Чтобы проверка “docs не грязный” была реальной, экспорт action‑registry в Markdown сделан **детерминированным**:
  - `scripts/actions-registry-export-md.js` больше не встраивает timestamp в output.
- Добавлен документ: `docs/process/10_RELEASE_PREFLIGHT.md`.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP204 — Outbox как центр поддержки (repeat / заметка / в шаблон)
- В просмотре записи `📤 Outbox` добавлены быстрые действия:
  - `✉️ Повторить` — prefill текстом из snippet → предпросмотр → отправка; после отправки остаёмся в Outbox (return route).
  - `📝 Заметка` — открывает заметку/теги пользователя (STEP194/195) и добавляет кнопку возврата в Outbox.
  - `📌 В шаблон` — сохранить текст записи как новый DM-шаблон (STEP190) по названию, введённому админом.
- Safeties:
  - repeat/в шаблон доступны только в DM с ботом (в группах показываем подсказку), чтобы не светить текст/шаблоны.
  - всё Redis-only: никаких миграций/таблиц/сканов Neon.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP205 — Polishing Comms: лимиты/валидация длины сообщений (emoji-safe) + предупреждения
- Введены единые лимиты Telegram по длине текста:
  - жёсткий верхний лимит `4096` (Telegram),
  - безопасный бюджет `3500` для тел, которые оборачиваются заголовком/футером (Admin DM / System Notice).
- Все клипы сделаны **emoji-safe** (по Unicode code points), чтобы не ломать суррогатные пары.
- Admin DM (шаблоны / свободный текст / Outbox repeat):
  - предпросмотр показывает предупреждение при обрезании (и отдельное предупреждение, если в тексте есть URL),
  - при сохранении/редактировании шаблонов показываем предупреждение, если текст пришлось обрезать.
- System Notice:
  - текст клипается emoji-safe (без “message is too long”),
  - CTA label/url клипается до `32/512`, показываем предупреждение если что-то было обрезано.
- Всё Redis-only, без миграций и без сканов Neon. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP206 — Release protocol: “2 минуты перед деплоем” (каноничный чеклист)
- Закреплён один короткий релиз‑чеклист: `docs/16_RELEASE_CHECKLIST.md`.
- Чеклист включает:
  - `npm run preflight` (или `npm run qa:fast`),
  - проверку `GET /api/health`,
  - 2–3 клика в админке (Comms / Outbox / Users) как быстрый sanity UI.
- `docs/process/10_RELEASE_PREFLIGHT.md` дополнен ссылкой на каноничный чек.
- `docs/13_RUNBOOK_RELEASE.md` теперь явно ссылается на “2 минуты” чеклист как на быстрый вход.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP207 — Hotfix: Vercel SyntaxError (invalid RegExp) в CTA label
- Исправлен `SyntaxError: Invalid regular expression: missing /` при старте (Vercel/Node ESM).
- Причина: в `src/bot/bot.js` в `normalizeNoticeCtaLabel` попал literal newline внутри RegExp.
- Теперь CTA label нормализуется emoji-safe: убираем `\r`, схлопываем whitespace в одну строку и клипаем до лимита.
- Без миграций. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP209 — Action guards v2 (require_redis vs db_truth/queue_first) + docs sync
- В `src/bot/actionRegistry.js` расширили guard-модель:
  - `require_redis` — fail-closed при Redis down,
  - `db_truth` — DB-truth идемпотентные действия (можно исполнять даже при Redis down),
  - `queue_first` — DB-truth путь с оптимистичным UX через очередь (QStash) при норме,
  - `none` — безопасная навигация/просмотр.
- Переклассифицированы ключевые монетизационные action keys:
  - `a:brand_app_accept` и `a:wsp_contact_unlock` → `queue_first`.
  - ручные платежные админские пути (`admin_pay_apply`/`admin_pay_autoheal`) → `db_truth`.
- В `src/bot/bot.js` middleware теперь кэширует `redisOk` в `ctx.state.redisOk` для `require_redis/db_truth/queue_first` (подготовка к следующему STEP210: локальный anti-click-storm при Redis down).
- Перегенерирован авто-документ `docs/02_ACTION_KEYS_REGISTRY.md` (`npm run actions:md`), обновлены `docs/01_SECURITY_INVARIANTS.md` и `docs/00_CURRENT_STATE.md`.


## STEP210 — Anti-click-storm при Redis down (локальный предохранитель)
- Проблема: при деградации Redis недоступны token-lock/часть rate-limit путей → пользователь/админ может нажать кнопку 5–10 раз подряд.
  Postgres защитит от двойного списания (SQL guards), но Neon можно “заспайкать” шквалом транзакций.
- Решение: добавлен best-effort **in-memory limiter** (Map + TTL ~8 секунд) на стороне bot runtime:
  - включается **только если `ctx.state.redisOk === false`**;
  - ключ: `tgId + action + resourceId`;
  - защищаем 2 самые “дорогие” кнопки:
    - `a:brand_app_accept` (✅ Принять),
    - `a:wsp_contact_unlock` (🔓 Разлок контактов).
- UX: вместо “тишины” — toast `⏳ Уже обрабатываем. Обнови через 10–30 сек.` при повторных кликах в TTL-окно.
- Без миграций. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP211 — Payments strict validation: auto-heal/apply (P0)
- Усилена строгая валидация Stars‑платежей по `invoice_payload/currency/total_amount` (единая с webhook‑валидацией).
- В strict‑валидации поддержаны legacy варианты payload:
  - Brand Pass: numeric credits token (только если совпадает с известными пакетами),
  - Brand Plan: `basic/max` нормализуются в `start/pro`.
- Admin auto-heal (`a:admin_pay_autoheal`) теперь:
  - валидирует платёж **до** claim/apply,
  - для невалидных/неприменимых кейсов выставляет `note=autoheal_manual_required:<reason>`, чтобы остановить retry‑петли.
- Bugfix: manual apply Brand Plan больше не пытается активировать неизвестный plan (`basic/max`), всегда активируем `start/pro`.
- Без миграций. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP212 — Instagram routes kill-switch (P1 security)
- Цель: убрать “теневую поверхность” IG API на сервере, даже если UI скрыт.
- Добавлен ENV `IG_ROUTES_ENABLED` (0/1) — **master kill‑switch** для всего `/api/ig/*` (включая IG cron).
  - Если переменная не задана — по умолчанию следует `IG_OAUTH_UI_ENABLED` (zero regressions).
- Все IG OAuth endpoints (`/api/ig/oauth/*`) теперь требуют `IG_ROUTES_ENABLED=1` **и** `IG_OAUTH_UI_ENABLED=1`, иначе возвращают 404.
- IG cron `/api/cron/ig-verify-tick` тоже закрывается (404), если `IG_ROUTES_ENABLED=0`.
- Без миграций. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP213 — Monetization UI при Redis down (P0): кнопки не исчезают
- Проблема (из аудита): при деградации Redis баланс мог быть `0/—`, и в нескольких местах UI **прятал** кнопки списания (например «🔓 Контакты»), что выглядело как поломка монетизации.
- Решение: в UI теперь **никогда не скрываем** monetization CTA из-за `0/unknown` Redis-баланса.
  - Витрина (`renderWsPublicProfile`): «🔓 Контакты» показывается всегда; если нужно — рядом «💳 Купить ещё».
  - Brand replies (`brandReplyKb`) и карточка lead’а бренда: аналогично — «Контакты» не исчезают, а проверки кредитов выполняются на клике (DB-truth).
- Для того чтобы бренд мог попасть в монетизационные экраны даже при Redis down, разрешили read‑only навигацию:
  - `a:brand_apps`, `a:bx_inbox`, `a:bx_thread` → guard `none` (без fail-closed).
- Harden: ключевые Redis‑getters UI состояния (`ui_mode`, `cur_mode`, `active_ws`, `bm_mode`, `bm_active_brand`) сделаны **fail-open** (try/catch), чтобы бот не падал на простых экранах при Redis outage.
- Без миграций. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP214 — Official publish anti-stuck (active self-heal)
- Проблема: в serverless при жёстком kill/таймауте возможно “залипание” `official_posts.status='PUBLISHING'` после DB-reserve.
  UX: карточка оффера показывает `⏳ Публикуется` и прячет действия; модеру/владельцу приходится ждать stale‑rescue (~10 минут) или разбираться вручную.
- Решение (best-effort, zero regressions):
  - после успешного reserve мы ставим отложенную QStash‑задачу `/api/qstash/official-publish-verify` (ENV: `OFFICIAL_PUBLISH_SELFHEAL_DELAY_SEC`, `OFFICIAL_PUBLISH_SELFHEAL_MIN_AGE_SEC`),
  - сохраняем Redis breadcrumb `official:pub:msgid:<offerId>` из двух источников:
    - сразу после `sendMessage` (как только получили `message_id`),
    - из `channel_post`/`edited_channel_post` webhook (до DB attach),
  - воркер пытается прикрепить `message_id` в БД (`atomicAttachOfficialPostMessageId`), а если его нет — сбрасывает статус в `PENDING` с `last_error=selfheal_publish_stuck:*` (разблокирует UI/очередь).
- Добавлены breadcrumbs в `/api/health`: `mon.official.*`.
- Без миграций. Zero regressions.
- Docks sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`, обновлён `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.


## STEP215 — Audit log buffering (Redis list → batch flush в Postgres)
- Проблема: `AUDIT_DB_THROTTLE` экономит Neon CU, но suppressed audit‑события (workspace_audit) раньше **терялись** (return null).
- Решение:
  - при подавлении (rate-limit `!allowed`) добавляем событие в Redis list `audit:buffer:ws` (bounded: `AUDIT_BUFFER_MAX_LEN`, TTL `AUDIT_BUFFER_TTL_SEC`);
  - при временных DB‑ошибках (кроме “таблица не существует”) — тоже best‑effort буферим (если `AUDIT_BUFFER_ON_DB_ERROR=1`);
  - новый cron endpoint `/api/cron/audit-flush-tick` батчами переносит буфер в Postgres (`workspace_audit`) через `jsonb_to_recordset`, пишет breadcrumbs `audit.buffer.last_flush`.
- Наблюдаемость:
  - `/api/health` → `audit.buffer.*` (len/enqueued/flushed/last_flush) + `cron.audit_flush_tick`.
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`, обновлён `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`.


## STEP216 — expectText TTL + escape hatch (P1 UX hardening)
- Проблема: режим ожидания текста (`expectText`) может затянуться/путать пользователя, если в обработчиках шагов мы многократно “пере-армим” ожидание (особенно при ошибках/невалидном вводе).
- Решение (Redis-only, zero regressions):
  - `setExpectText()` теперь автоматически добавляет `_startedAt` и ограничивает **общую** жизнь сессии ожидания (по умолчанию 2 часа, ENV `EXPECT_TEXT_MAX_LIFETIME_SEC`). Даже если обработчик пере-установит ожидание, TTL будет обрезан так, чтобы суммарно не превышать лимит.
  - В text-input режиме показан явный “выход” в меню: футер `navKbInput` добавляет кнопку `❌ Отмена` (ведёт в `📋 Меню`) + `🏠 Home`.
  - В приватном чате добавлен текстовый escape hatch: если пользователь в режиме ввода и пишет `отмена/cancel/стоп/stop` — ожидание сбрасывается и показывается навигация.
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP217 — Post-deploy hardening: каноничный smoke-tests_short (input-mode + redis degraded)
- Обновлён `smoke-tests_short.md`:
  - добавлен явный чек по input-mode (`expectText`): `❌ Отмена` и текстовый escape hatch `отмена/cancel/стоп/stop`;
  - добавлен чек для audit buffer flush (STEP215): `audit_flush_tick.last_run`, `audit.buffer.*`;
  - акцентировано, что при Redis degraded ключевые монетизационные CTA и навигация остаются “живыми” (нет тупика).
- `docs/16_RELEASE_CHECKLIST.md` теперь явно рекомендует пройти `smoke-tests_short.md` сразу после деплоя (10–15 минут).
- `docs/13_RUNBOOK_RELEASE.md` ссылается на `smoke-tests_short.md` как на каноничный короткий прогон.
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP218 — Release UX: `npm run smoke:short` (печать короткого smoke-чека)
- Добавлена микро-команда `npm run smoke:short` → `node scripts/smoke-short.js`.
  - Скрипт печатает `smoke-tests_short.md`, добавляет 4 ключевых напоминания (health/admin UI/redis degraded/expectText escape) и ссылки на релизные доки.
- Обновлены релизные документы:
  - `docs/16_RELEASE_CHECKLIST.md` — добавлена рекомендация запускать `npm run smoke:short` после деплоя.
  - `docs/13_RUNBOOK_RELEASE.md` — добавлен блок с командой.
- Без миграций. Zero regressions (не влияет на runtime бота).
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP220 — Vercel Hobby лимит по кол-ву функций: cron router + rewrites (без конфликта имён)
- Проблема: на Vercel Hobby деплой падает, если в Deployment больше **12** serverless functions (`No more than 12 Serverless Functions...`).
- Решение: cron endpoints агрегированы в **один** serverless handler `api/cron_router.js`.
  - Поддерживаем старые URL (`/api/cron/broadcast-tick`, `/api/cron/giveaways-tick`, `/api/cron/ig-verify-tick`, `/api/cron/audit-flush-tick`) через `vercel.json` rewrites.
  - Также `/api/cron?job=...` и `/api/cron` прокидываются на роутер.
- Примечание: имя `cron_router.js` выбрано специально, чтобы не путаться с `src/bot/cron.js`.
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/13_RUNBOOK_RELEASE.md`, `docs/16_RELEASE_CHECKLIST.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP221 — Admin DM UX: menu/support открываются новым сообщением + компоновка кнопок + cron_router path fix
- Пользовательские системные DM от админа: `📋 Открыть меню` / `💬 Поддержка` теперь не редактируют исходный текст.
  - Новые callbacks: `a:menu_push`, `a:support_push`.
  - Best-effort: убираем reply_markup у исходного сообщения, затем отправляем меню/поддержку отдельным сообщением.
- Админка `a:adm_umsg`: шаблоны выводятся сеткой 2×N, а действия сгруппированы по 2 в ряд (меньше «простыни»).
- Исправление Vercel rewrites: cron router файл находится в `api/cron_router.js` (вместо `api/cron/cron_router.js`).
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`, + обновлён `docs/02_ACTION_KEYS_REGISTRY.md`.

## STEP223 — Fix: `a:menu_push` ошибка при нажатии «Открыть меню» в системном DM
- Симптом: пользователь нажимает `📋 Открыть меню` в админском DM и получает общий экран ошибки (act: `a:menu_push`).
- Причина: часть меню-рендереров делает edit-based UI; при `ctxPush.callbackQuery=null` контекст мог попадать в нецелевое сообщение.
- Решение:
  - `a:menu_push` теперь создаёт отдельное UI-сообщение (`⌛ Открываю меню…`) и «привязывает» все edit-рендеры к нему.
  - Исходное сообщение остаётся квитанцией (reply_markup снимаем best-effort).
  - Safe-fallback: если placeholder не отправился — открываем меню стандартным путём.
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.


## STEP224 — Hotfix: `a:menu_push`/`a:support_push` (push UI) больше не падают в общий error-handler
- Симптом: после STEP221 часть пользователей всё ещё ловила общий экран ошибки при клике `📋 Открыть меню` или `💬 Поддержка` в админском/системном DM (act: `a:menu_push` / `a:support_push`).
- Причина: использование `Object.create(ctx)` могло ломать методы Context (grammY) и приводить к выбросу исключения при `reply/edit` внутри push‑обработчиков.
- Решение:
  - Добавлен helper `makeUiCtxForMessage()` — создаёт «UI‑контекст», который редактирует строго конкретное UI‑сообщение через `ctx.api.editMessageText/editMessageReplyMarkup`.
  - `a:menu_push`: создаёт UI‑сообщение и вызывает `renderRoleHub()` через `makeUiCtxForMessage()` (без клонирования ctx).
  - `a:support_push`: всегда отправляет поддержку **новым сообщением** через `ctx.reply`, а при редком фейле — fallback на `safeEditOrReply`.
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`.

## STEP226 — Audit P1 + антикаскад (Redis degraded → Neon safe)
- Закрыт P1 (до деплоя):
  - **F-1**: включена проверка SSL сертификата для Neon Postgres (`rejectUnauthorized:true`).
  - **F-2**: rate limiter в Redis сделан атомарным (Lua `INCR+EXPIRE`), ключи не могут остаться без TTL; добавлен `ok` для совместимости с существующими call-sites.
- Антикаскад при Redis degraded:
  - **F-4**: `acceptBrandApplicationWithCharge()` получил PG `pg_try_advisory_xact_lock(appId, brandUserId)` (fail-fast, без очереди ожидающих `FOR UPDATE`).
  - **D-2**: при Redis degraded (и/или включённом async retry) на критичные монетизационные DB вызовы ставим короткий timeout и `SET LOCAL statement_timeout` внутри транзакций; при TIMEOUT показываем UX «⏳ В обработке…» вместо ошибки, чтобы не провоцировать клик‑шторм.
- Без миграций. Zero regressions.
- Изменённые файлы:
  - `src/db/pool.js`
  - `src/lib/redis.js`
  - `src/db/queries.js`
  - `src/bot/bot.js`
  - `docs/00_CURRENT_STATE.md`
  - `docs/process/07_WORK_HISTORY_2026_02.md`


## STEP227 — Admin DM UX v2: квитанция без тупиков (src=admmsg)
- Пользовательские DM от админа теперь максимально однозначны:
  - футер текста: `Дальше выбери действие кнопками ниже.`
  - кнопки: `🏠 Главное меню` / `💬 Поддержка` / `✅ Принято`.
  - в callback-data добавлен маркер `|src:admmsg`.
- `a:usr_ack|src:admmsg` больше не оставляет “пустую квитанцию”: убирает только кнопку `✅`, оставляя `🏠 Главное меню` + `💬 Поддержка`.
- `a:menu_push|src:admmsg` и `a:support_push|src:admmsg` **не снимают** reply_markup у квитанции (в отличие от других сервисных сообщений).
- `a:support_push|src:admmsg` открывает минимальный экран поддержки (без `🧭 Быстрый старт`), чтобы не отвлекать пользователя.
- Без миграций. Zero regressions.
- Изменённые файлы:
  - `src/bot/bot.js`
  - `docs/00_CURRENT_STATE.md`
  - `docs/process/09_ADMIN_UX_STANDARD.md`
  - `docs/process/07_WORK_HISTORY_2026_02.md`

## STEP228 — Audit hardening: закрываем остатки (money + anti-cascade)
- Закрыты оставшиеся critical/near-critical находки из переаудита STEP226 без изменения продуктовой логики:
  - **F-8**: `brandPackCredits()` больше не принимает неизвестные numeric packs (legacy) — теперь строго catalog-only (unknown → 0).
  - **N-1**: в `rateLimit()` убран non-atomic fallback `INCR+EXPIRE` (который мог создавать immortal keys). При ошибке `EVAL`/Redis деградации — **fail-open**.
  - **N-2**: `unlockWorkspaceContactsWithCredits()` переведён на `pg_try_advisory_xact_lock` (fail-fast). При параллельном клике возвращаем `error:'busy'`, UI показывает «⏳ В обработке…» (alreadyQueued).
  - **F-5**: ops alerts buffer (`LPUSH+LTRIM+EXPIRE`) сделан атомарным через Lua, чтобы не было race при конкурентных алертах.
  - **F-7**: IG verify comments теперь читаются с пагинацией (`paging.next`) до 5 страниц (покрывает 200+ комментариев).
- Без миграций. Zero regressions.
- Изменённые файлы:
  - `src/bot/payments_fallback.js`
  - `src/lib/redis.js`
  - `src/db/queries.js`
  - `src/bot/bot.js`
  - `src/bot/opsAlerts.js`
  - `src/bot/cron.js`
  - `docs/00_CURRENT_STATE.md`
  - `docs/process/07_WORK_HISTORY_2026_02.md`

## STEP229 — Audit flush lossless: inflight + stuck-requeue (закрываем LRANGE/LTRIM race без потерь)
- Проблема (аудит F-3): flush буфера `audit:buffer:ws` делал `LRANGE → INSERT → LTRIM`.
  При конкурентном `RPUSH` между `LRANGE` и `LTRIM` возможно **потерять событие** (trim удалит “новое” без записи в Postgres).
- Решение (Zero regressions, без миграций): двухфазная схема **queue → inflight → ack**.
  - Новые ключи Redis:
    - `audit:buffer:ws:inflight` — события “в обработке”,
    - `audit:buffer:ws:inflight_since` — unix-ts (sec) когда inflight стал не пустым,
    - `audit:buffer:ws:flush_lock` — токен-лок флаша (safe unlock).
  - Алгоритм флаша:
    1) берём токен-лок (`AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC`, default 15s);
    2) если `inflight` “застрял” (age ≥ `AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC`, default 180s) или потеряна метка `inflight_since` — **requeue**: переносим всё из inflight обратно в head очереди (с сохранением порядка);
    3) если inflight не пуст — обрабатываем его первым; иначе атомарно переносим batch из queue в inflight (Lua: `LPOP(q) → RPUSH(inflight)`, set `inflight_since` при первом захвате);
    4) вставляем в Postgres батчем (как раньше);
    5) ack: `LTRIM(inflight, n, -1)`, и если inflight пуст — удаляем `inflight_since`.
  - При DB outage: события остаются в inflight (lossless) и будут дофлашены позже.
  - При crash между extract и insert: inflight будет автоматически requeue’нут после таймаута.
- Наблюдаемость:
  - `/api/health` теперь показывает `audit.buffer.len = queue_len + inflight_len`,
    а также `queue_len`, `inflight_len`, `inflight_age_sec`, `requeued_today_total`.
  - `audit.buffer.last_flush` расширен: `requeued`, `stuck_age_sec`, `queue_len`, `inflight_len`.
- Без миграций. Zero regressions.
- Изменённые файлы:
  - `src/db/queries.js`
  - `src/lib/config.js`
  - `api/health.js`
  - `docs/00_CURRENT_STATE.md`
  - `docs/process/07_WORK_HISTORY_2026_02.md`


## STEP230 — Финальный прогон: остатки неатомарных связок + полировка /api/health (без новых механизмов)
- Цель: добить хвосты после STEP228/229 до «почти 10/10» без изменения продуктовой логики.
- Закрыто:
  - Убраны оставшиеся неатомарные пары Redis-команд (risk: immortal keys / race в bounded lists):
    - `INCR+EXPIRE` → atomic Lua helpers (`incrWithExpireOnFirst` / `incrWithExpire`) в `src/lib/redis.js`.
    - `LPUSH+LTRIM(+EXPIRE)` → atomic helper `lpushTrim()`.
  - Применено в местах:
    - Cron counters (`src/bot/cron.js`): дневные/служебные счётчики и broadcast quarantine count теперь не могут “залипнуть” без TTL.
    - Acquisition counters (`src/bot/bot.js`): daily buckets (`ref:src:*:d:YYYYMMDD`, `ref:role:*:d:YYYYMMDD`) теперь ставят TTL атомарно.
    - Admin outbox (`src/bot/bot.js`): запись в Redis list (`admin_outbox`) теперь atomic `LPUSH+LTRIM`.
    - Curator giveaway notes (`src/bot/bot.js`): history list (`cur_gw_notes:*`) теперь atomic `LPUSH+LTRIM+EXPIRE`.
    - QStash broadcast deliver quarantine counter (`api/qstash/broadcast-deliver.js`) — atomic `INCR+EXPIRE-on-first`.
    - Audit throttle/buffer metrics (`src/db/queries.js`) — atomic `INCR/INCRBY + EXPIRE-on-first`.
- Полировка наблюдаемости:
  - `/api/health.js` переписан и вылечен (раньше был SyntaxError и поломанные скобки) — теперь стабильно отдаёт JSON и не падает.
- Без миграций. Zero regressions.
- Изменённые файлы:
  - `src/lib/redis.js`
  - `src/bot/bot.js`
  - `src/bot/cron.js`
  - `src/db/queries.js`
  - `api/qstash/broadcast-deliver.js`
  - `api/health.js`
  - `docs/00_CURRENT_STATE.md`
  - `docs/process/07_WORK_HISTORY_2026_02.md`


---

## SOURCE: `docs/process/07_WORK_HISTORY_2026_03.md`

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


---
