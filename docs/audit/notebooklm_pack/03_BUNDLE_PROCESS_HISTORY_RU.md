# Collabka PR — PROCESS & WORK HISTORY

Собрано автоматически для NotebookLM. Обновлено: 2026-02-28 12:06 UTC


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
- Добавили `docs/neon/ИСТОРИЯ_НЕОН.txt` как доп. контекст по Neon (не миграция).

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
- Админка: новые действия **🎯 Кому**, **🔗 CTA**, **⏰ Expire**.
- Показ пользователям 1 раз на версию:
  - если `expiresAt` в прошлом — не показываем,
  - если `target!=all` — показываем только целевой роли (Redis: `ui_mode` + `bm_mode`),
  - если `ctaUrl` задан — добавляем URL‑кнопку.
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
- Исправили битое имя файла в `docs/neon/`: теперь файл называется `ИСТОРИЯ_НЕОН.txt` (UTF‑8), как и указано в `docs/neon/README.md`.
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


---
