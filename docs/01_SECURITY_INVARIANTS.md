# 01 — SECURITY INVARIANTS (Collabka PR / @collabkaprbot)

Этот документ фиксирует **неизменяемые инварианты** безопасности и монетизации.
Если правка затрагивает деньги/кредиты/доступы — сначала сверяемся с этим файлом.

---

## A) Payments (Telegram Stars / оплаты)

1) В `pre_checkout_query` **обязательна** валидация:
   - формат `invoice_payload` (строгая схема),
   - `currency`,
   - `total_amount` (сумма должна соответствовать продукту/плану).
2) В `successful_payment` делаем **повторную** валидацию (защита от повторов/краевых кейсов).
2.1) Идемпотентность apply — **на уровне Postgres**:
   - payments ledger хранит `telegram_payment_charge_id` (unique) и (опционально) `provider_payment_charge_id` (unique);
   - перед любыми сайд‑эффектами payment должен быть **claimed** (status `APPLYING`) через atomic `UPDATE ... WHERE status != 'APPLIED'`.
   Это защищает от гонок при Telegram retries и параллельных apply (cron/admin/user).
3) Любая auto-heal логика (cron / fallback apply) работает **fail-safe** и использует ту же строгую валидацию, что и `pre_checkout_query`/`successful_payment`:
   - если валидация не проходит → **не применять**,
   - пометить как `ORPHANED` / `manual_required` / `validation_failed` + ops alert.
4) Ручной apply из админки:
   - запрещён при невалидной сумме/валюте/пейлоаде,
   - фиксируем причину в audit/логах.

---

## B) Credits & paid unlock (контакты / Brand Pass)

5) Unlock контактов **exactly-once**: источником истины является **Postgres**.
   - используем **PG advisory lock** на пару `(brand_user_id, workspace_id)`,
   - делаем атомарную транзакцию: *activate unlock* + *списание кредита*.
6) Повторный клик внутри окна unlock **не списывает** повторно (0 rows → no charge).
7) Anti-bypass в текстах профиля/описания (до unlock):
   - маскируем `http(s)://`, `t.me/*`, email, `@handle`, **телефоны** (как текст, так и entity-linkify).

7.1) Структурированные контакты (roadmap P2):
   - `workspace_settings.profile_contacts` (JSONB) — единый контейнер контактов.
   - ввод валидируем/нормализуем на входе (tg/email/phone/site), без “постфактум” правок в рендере.
   - показываем **только после unlock** (или в owner preview), до unlock не “подсвечиваем” детали.
   - legacy-поля остаются совместимыми (не ломаем существующие профили).
   - перенос legacy → structured делаем только по явной кнопке и только при **однозначном распознавании** (если в тексте несколько типов/вариантов — отказываемся, просим заполнить вручную).

7) Redis — только быстрый кеш/TTL/UX:
   - при деградации Redis используем DB fallback **только для проверки unlock**,
   - при восстановлении Redis — best-effort “healing” ключей.

---

## C) Ownership / Access control (dangerous actions)

8) Для чувствительных сущностей (лиды, заявки, заметки, сделки, приватные экраны) ownership должен проверяться **в SQL**:
   - `... WHERE id = $1 AND actor_user_id ∈ allowed_set ...`
   - без паттерна “взяли по id → потом проверили в JS”.
9) Опасные действия с глобальным эффектом (delete, assign, publish, apply) — дополнительно **role-gate**:
   - owner/curator/admin (и только по необходимости).
10) Любая “мягкая деградация” (fail-open) **не может** раскрывать платные/приватные данные.
10.1) В degraded mode Redis: **mutating callbacks** должны быть fail-closed (отклоняем выполнение),
     кроме строго allowlisted действий, которые safe-by-design и опираются на DB truth (например, paid-unlock).

10.2) Реестр callback actions — единая точка правды:
   - `src/bot/actionRegistry.js` (тип action: view/edit/pay/admin/ops + guard mode)
   - проверка консистентности: `npm run actions:check` (должен проходить перед релизом)
   - экспорт для аудитов/доков (Markdown): `npm run actions:md` → `docs/02_ACTION_KEYS_REGISTRY.md`

---

## D) Deep-links / callback_data

11) `payload` всегда в приоритете; `/start` может быть fail-open **только для UX-развилки**, не для денег/доступов.
12) Deep-link на приватный объект допускается только если:
   - есть DB-ownership check, или
   - ссылка стейтлесс подписана и привязана к actor.
13) `callback_data` ≤ 64 bytes:
   - контекст выносим в Redis token → payload (TTL),
   - токены одноразовые/с TTL и не дают “чужой” доступ без DB-ownership.

---

## E) Cron / Idempotency / Outbox

14) В cron: **Redis token-lock** (safe unlock) + где критично **PG advisory lock**.
15) Внешние сайд‑эффекты: сначала reserve/lock в DB, потом отправка (outbox-подход).
16) Статусы меняем атомарно (`WHERE ... RETURNING`, guards по полям типа `*_at`).

**Важно про миграции:** любые новые таблицы/колонки и бизнес-изменения схемы — только через `migrations/run.js` (exactly-once). `migration_pack/` — аварийные ручные скрипты и не должен считаться “доставкой” новых бизнес-миграций.


---

## F) Hot paths / Neon cost

17) В горячих UI путях (меню/рендер кнопок/хабы) **не добавляем** DB-чтения без измерения.
18) Redis-first кеши допустимы, но деньги/доступы всё равно закреплены DB-инвариантами (см. B).

Мини‑регрессия, которую обязаны ловить перед релизом: прогнать `npm run test:redact` (маскирование ссылок/email/@/телефонов в тексте профиля).

---

## G) Logging / Alerts / Health

19) Новые алерты — только через единый механизм (тихий режим по умолчанию).
20) `/api/health` обязан оставаться “непадающим” и показывать ключевые деградации (cooldown, stuck locks, cron last_run).

---

## H) Admin bypass (строго)

21) Админ-bypass допустим только в явных местах и всегда логируется (audit).
22) Админ не должен открывать платное/приватное без следа — любые ручные apply фиксируются.

---

### Красные флаги (не принимать PR без исправления)
- “Fail-open” попал в деньги/кредиты/контакты/платные данные.
- Fetch-by-id без ownership в SQL для чувствительных сущностей.
- Повторные списания при повторном клике/ретраях.
- Ретраи/циклы в одном serverless запросе.
- Новые DB-чтения в меню/кнопках/рендере без очень жёсткого обоснования.
