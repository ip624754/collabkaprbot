# 27 — Broadcast confirm: DB idempotency (Redis degraded) — 2026-03-04

## Контекст

В админском контуре рассылок `✅ Отправить` (`a:bc_confirm`) раньше полагался на Redis‑rate‑limit.
При деградации Redis (или при двойном клике до очистки черновика) возможна гонка:

- два параллельных обработчика успевают прочитать один и тот же draft;
- оба вызывают `createBroadcast` → в БД появляются **две** рассылки.

Telegram/UX‑симптом: админ видит две рассылки в списке, и обе уйдут в аудиторию.

## Цель

Сделать best‑effort **DB‑идемпотентность** для `bc_confirm` без миграций (без новых колонок), сохранив serverless‑ограничения и не добавляя DB‑чтения в hot UI.

## Решение

Добавлена функция `db.createBroadcastIdempotent()`:

- берёт `pg_try_advisory_xact_lock(hashtext('bc_confirm:<admin_user_id>'))` (fail‑fast, без очереди ожидания в Neon);
- делает короткое dedup‑окно (по умолчанию 45 сек): ищет **идентичный** `PENDING` broadcast за последние N секунд (по audience/type/text/file/caption/buttons/total_count);
- если нашёл — возвращает существующую рассылку (`deduped=true`), не создавая новую;
- если не нашёл — создаёт новую запись с `total_count` сразу в INSERT.

В обработчике `a:bc_confirm`:

- заменён `createBroadcast + updateBroadcast(total_count)` на `createBroadcastIdempotent(totalCount)`;
- добавлен UX для `busy`: «⏳ Уже создаю рассылку…» (без падений/дубликатов).

## QA

1) Нормальный кейс:
- создать draft → `✅ Отправить` → создаётся 1 рассылка.

2) Double‑click:
- нажать `✅ Отправить` дважды быстро → в списке рассылок остаётся **одна** запись.

3) Redis degraded:
- эмулировать деградацию Redis (rateLimit может не сработать) → double‑click всё равно не создаёт дубль.

Риск регрессий: **низкий** (затрагивает только админский confirm‑путь). Не влияет на доставку cron/QStash.
