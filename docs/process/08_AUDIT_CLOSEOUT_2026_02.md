# 08 — AUDIT CLOSEOUT — 2026-02-25

Этот документ фиксирует закрытие последнего аудита “утечка номеров / обход оплаты” и связанные риски.

## Источник аудита
- Экспорт: `Export text - УтечканомеровиобходоплатыCollabkaPR.m4a (25_02_2026).txt`

## Что было выявлено и что сделали

### 1) Обход paywall: телефон написан словами в `profile_about`
**Риск:** креатор пишет номер “плюс семь девять…” без цифр → редактирование ссылок/цифр не срабатывает → контакт утечёт до unlock.  
**Фикс:** STEP119 — в `redactContactsInText` добавлена маскировка телефонов, написанных словами (консервативно, только если получается 10–15 цифр).  
**Статус:** закрыто.

### 2) Broadcast 429: Redis-only cooldown при деградации Redis прожигает Neon
**Риск:** при 429 и Redis write fail cron продолжает tick и делает дорогую выборку recipients из БД.  
**Фикс:** STEP120 — DB fuse: `broadcasts.cooldown_until`/`cooldown_reason` + ранний выход из `broadcastTick` до polling recipients при Redis down/empty.  
**Статус:** закрыто.

### 3) Ops устойчивость: нужен break-glass allowlist при Redis down
**Риск:** строгий `REQUIRE_REDIS` guard блокирует даже админские ops-экраны при деградации Redis.  
**Фикс:** STEP121 — break-glass allowlist для супер‑админа (payments/users/audit), двойное подтверждение (`bg=1`), ops alert (digest).  
**Статус:** закрыто.

### 4) Orphaned payments auto-heal: “тихие” кейсы validation_failed/manual_review
**Риск:** cron находит orphaned payment, но strict validation не проходит → кейс зависает без видимого сигнала.  
**Фикс:** STEP122 — ops alerts `autoheal_validation_failed` / `autoheal_manual_required_failed` + пометка `note=autoheal_manual_required:<reason>`.  
**Статус:** закрыто (как optional hardening).

## Минимальная QA матрица (после деплоя)
1) До unlock: `profile_about` с “плюс семь девять …” → номер скрыт.
2) Broadcast: смоделировать 429 + Redis write fail → в DB ставится `cooldown_until`, следующий tick выходит без выборки recipients.
3) Redis down: обычные mutating actions блокируются; супер‑админ может открыть allowlist через двойной клик; отправляется ops alert.
4) Orphaned payment с неверной суммой/валютой → autoheal не применяет, пишет note и шлёт ops alert.

