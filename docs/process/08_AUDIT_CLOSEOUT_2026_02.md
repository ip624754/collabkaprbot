# 08 — AUDIT CLOSEOUT (2026‑02)

Этот документ фиксирует закрытие внешнего аудита (утечки контактов / обход оплаты / деградации Redis / 429 broadcast).
Цель: быстрый reference для повторной рецензии.

## 1) Findings → Fixes

### A) Phone bypass “словами” в `profile_about`
**Риск:** креатор может написать телефон словами (например, «плюс семь девять…») и обойти маскирование ссылок/цифр.

**Фикс:** STEP119 — добавлен консервативный детектор “телефон словами” в `redactContactsInText`.
- Срабатывает только при уверенной нормализации в 10–15 цифр.
- Не трогает обычные фразы/числа (ложные срабатывания минимизируем).

**Проверка:** `npm run test:redact`.

### B) Broadcast 429 + деградация Redis может прожечь Neon
**Риск:** если Redis недоступен/не пишет cooldown, cron продолжит делать DB polling recipients.

**Фикс:** STEP120 — DB fuse в `broadcasts.cooldown_until`.
- При 429: Redis cooldown (как обычно) + DB fuse (если Redis write fail).
- При tick: Redis-first; если Redis недоступен — учитываем DB fuse и выходим до тяжёлых выборок.

### C) Degraded Redis: строгие guards могут “отрезать руки” админам
**Риск:** при Redis down нельзя сделать emergency‑действия (payments/users/audit), даже если они DB‑safe.

**Фикс:** STEP121 — break‑glass allowlist.
- По умолчанию все `require_redis` callbacks блокируются (fail‑closed).
- Супер‑админ может открыть только allowlisted экраны через двойное подтверждение (`bg=1`).
- Каждое использование логируется как ops alert (anti‑spam digest).

### D) Auto‑heal payments: validation_failed / manual_required не должны быть “тихими”
**Риск:** орфанные/подозрительные платежи остаются без внимания.

**Фикс:** STEP122 — ops alert при `validation_failed` и `autoheal_manual_required` (без изменения apply‑логики).

### E) Inbox UX: “потеря” заявки при ранних статусных действиях
**Риск:** бренд может нажать «💬 В работу» до ✅ Принять, заявка исчезает из вкладки 🆕 и выглядит как “пропала”.

**Фикс:** STEP124 — до принятия доступны только ✅ Принять / ⛔ Спам / 🗑 Удалить; остальные действия недоступны (UI + guard).
Дополнительно: фикс креаторской кнопки «💬 Написать бренду» (без “тишины”).

## 2) Мини‑QA матрица (перед релизом)

1) **Phone words:** в `profile_about` написать «плюс семь девять…» → до unlock скрыто.
2) **Broadcast 429:** искусственно получить 429 → появляется cooldown; при Redis write fail тик не делает polling recipients.
3) **Redis down:** обычный юзер не может выполнить `require_redis` callback; супер‑админ может открыть allowlist только через `bg=1`, и приходит ops alert.
4) **Auto‑heal:** создать кейс “invalid payload” → payment помечен manual_required + ops alert.
5) **Inbox:** новая заявка (status=new): доступны только ✅/Spam/Delete; «В работу» недоступно.
6) **Creator notify:** после ✅ Принять креатор жмёт «💬 Написать бренду» → открывается понятный экран (нет “тишины”).

## 3) Где смотреть в коде
- Phone redaction: `src/bot/redactContacts.js` (+ тесты `scripts/test-redactContactsInText.js`).
- Broadcast cooldown fuse: `src/bot/cron.js`, DB поля: `migrations/039_broadcast_cooldown_db_fuse.sql`.
- Break‑glass: guard/middleware в `src/bot/bot.js`, allowlist в `src/bot/actionRegistry.js`.
- Ops alerts auto‑heal: `src/bot/cron.js` (autoHealOrphanedPayments).
- Inbox accept gate: `src/bot/bot.js` (brand_app_* handlers).
