# HARDCORE Security Audit — Collabka PR Bot STEP94
## Payments · Contacts · Ownership · Anti-Bypass

**Архив:** `collabkaprbot_FULL_STEP94_security_invariants_docs.zip`  
**Дата:** 2026-02-24  
**Cтек:** Vercel serverless · Neon Postgres · Upstash Redis · grammY · Node.js (ESM)  
**Размер:** 29 598 строк bot.js (+353 vs STEP88) · 5 741 строк queries.js (+200) · 444 action keys  
**Baseline:** docs/01_SECURITY_INVARIANTS.md (новый), docs/00_BOOT.md, docs/00_CURRENT_STATE.md

---

## 1. Executive Summary

STEP94 — **крупный security hardening** поверх STEP88. Три критических улучшения:

1. **Payment validation** (`_validateStarsPaymentStrict`): теперь payload, amount и currency проверяются в `pre_checkout_query`, `successful_payment` И `adminApplyPayment`. Pre-checkout **reject при несовпадении** (STEP88: always true).

2. **Contact unlock DB-truth** (`brand_contact_unlocks` таблица + `unlockWorkspaceContactsWithCredits`): PG advisory lock + atomic TX (charge + unlock в одной транзакции). STEP88: Redis-only без DB-истины. Теперь Redis = кэш, DB = source of truth.

3. **Ownership-in-SQL** (`getBrandLeadForActor`, `getBrandApplicationForActor`): unsafe getById заменены на safe getters с ownership в SQL. Wrapper `getLeadForActorSafe` / `getBrandAppForActorSafe`.

**Найденные проблемы (3):**
- **MED:** `payments_fallback.js` (cron autoheal) НЕ вызывает `_validateStarsPaymentStrict` — может apply платёж с неверной суммой
- **MED:** Телефонные номера по-прежнему НЕ маскируются в `redactContactsInText` (наследие STEP88)
- **LOW:** `CONTACT_UNLOCK_COST` / `CONTACT_UNLOCK_TTL_DAYS` / `BRAND_CREDITS_CACHE_TTL_SEC` отсутствуют в ENV-секции docs

**Вердикт: 9.5/10 — production-ready.** Два рекомендуемых фикса.

---

## 2. Machine List #1 — ALL ACTION KEYS (444 keys)

Сохраняется структура из STEP88 (те же 444 ключа). Ниже — ключевые группы с проверками.

### Contact/Paywall (4 keys) — CRITICAL monetization gates
| Action | Тип | Gate | Файл:строка | Изменения STEP94 |
|--------|-----|------|-------------|-----------------|
| `a:wsp_contact_req` | paywall | brand user + balance check | bot.js:20090 | brandCreditsCached → Redis-first |
| `a:wsp_contact_unlock` | pay | owner bypass + PG advisory + atomic TX | bot.js:20150 | **NEW: `db.unlockWorkspaceContactsWithCredits`** |
| `a:wsp_open` | view | Redis cache + **DB fallback** | bot.js:20063 | **NEW: `isWorkspaceContactsUnlocked` DB fallback** |
| `a:wsp_lead_new` | create | brand profile + rate limit | bot.js:20261 | unchanged |

### Payment Actions (8 keys) — NEW validation
| Action | Gate STEP94 | Файл |
|--------|------------|------|
| `a:founder_buy` | `_validateStarsPaymentStrict` in pre_checkout + successful_payment | bot.js:17967/18000 |
| `a:brand_plan_buy` | same | bot.js:17967 |
| `a:brand_buy` | same | bot.js:17967 |
| `a:ws_pro_buy` | same | bot.js:17967 |
| `a:match_buy` | same | bot.js:17967 |
| `a:feat_buy` | same | bot.js:17967 |
| `a:off_buy` | same | bot.js:17967 |
| `a:admin_pay_apply` | `_validateStarsPaymentStrict` + fail-safe block | bot.js:29258 |

### Admin (42 keys) — gate: `isSuperAdminTg` (116 checks)
All admin actions: `a:admin_home` (bot.js:23006), `a:adm_gift*`, `a:bc_*` (broadcast), `a:aud*` (audit), `a:mod_*` (moderation). Each checked at handler entry.

### Brand (68 keys) — owner/manager gate
Brand Profile, Brand Plan, Brand Apps/Deals, Brand Directory, Brand Team/Managers. All gated by userId or bm resolution.

### Creator (85 keys) — owner/curator gate
Workspace, Profile, Settings, Offers, Leads, Folders. All gated by `getWorkspace(ownerUserId, wsId)` or `isCuratorForWorkspace`.

### Barter (72 keys) — participant check
Feed, Inbox, Thread, Reply, Triage, Proofs. Gated by `getBarterThreadForUser`.

### Giveaway (55 keys) — owner or public
Create/edit/draw: owner. Join/check: public.

### Other (nav/support/utility)
`a:home`, `a:menu`, `a:guide`, `a:support*`, `a:role_pick`, `a:founder`, `a:nd/nop/more`.

---

## 3. Machine List #2 — ALL LINK/CONTACT SURFACES

### 3.1 Contact Masking Pipeline (bot.js:114-155)
| Строки | Что маскируется | Regex | Замена |
|--------|----------------|-------|--------|
| 120-123 | `https?://...` URLs | `urlRe` | 🔒 ссылка скрыта |
| 126-129 | `t.me/...` `telegram.me/...` | `tmeRe` | 🔒 ссылка скрыта |
| 132-135 | `instagram.com` `vk.com` `youtube.com` | `socialRe` | 🔒 ссылка скрыта |
| 138-141 | `user@domain.com` emails | `emailRe` | 🔒 email скрыт |
| 144-147 | `@handle` (3-32 chars) | `atRe` | 🔒@скрыто |
| **—** | **Телефоны (+7 999...)** | **НЕТ** | **⚠️ НЕ МАСКИРУЕТСЯ** |

### 3.2 deLinkifyText (bot.js:7196-7207)
Replaces `@` → `＠`, `.` → `․` to break Telegram auto-linkification. Used for curator preview.

### 3.3 URL Buttons (gated)
| Строки | Кнопка | Кто видит | Gate |
|--------|--------|-----------|------|
| 8430-8433 | 📣 TG канал / 📸 IG / 🗂 Портфолио | brand | `linksEnabled` (= `revealContacts && !isCuratorPreview`) |
| 20229-20240 | Contact Pack URL buttons | brand | paid unlock (Redis + DB) |
| 4839 | 🔗 brand_link URL button | creator | public (brand's own link) |
| 14672+ | Broadcast URL buttons | all recipients | admin-created |

### 3.4 Text Surfaces (channel/IG/contact shown in text)
| Строки | Контекст | Gate |
|--------|----------|------|
| 8166-8170 | vitrina IG line | `linksEnabled` → else "🔒 скрыто" |
| 8183-8195 | vitrina portfolio lines | `revealContacts` → else "🔒 скрыто" |
| 8291 | vitrina "О себе" text | `redactContactsInText` if `!revealContacts` |
| 8913 | brand lead dialog — channel | `contactsUnlocked` Redis check → else "🔒 скрыто" |
| 10562 | lead reply to brand | `contactsLockedHintHtml` (no real contacts) |
| 7210-7250 | `formatWsContactCard` — full card | Called only for owner/curator (with deLinkify for curators) |
| 29014 | admin user card | `isSuperAdminTg` gate |

---

## 4. Machine List #3 — ALL PAYWALL/GATING/IDENTITY CHECKS

### 4.1 Contact Reveal Gates (STEP94: DB-backed)
| Check | Файл:строки | Условие | Fallback |
|-------|-------------|---------|----------|
| Redis cache `wsp_contact:{ws}:{user}` | bot.js:8088-8093 | `redis.get(key)` truthy | **DB fallback** |
| DB fallback `isWorkspaceContactsUnlocked` | bot.js:8097-8100 | `brand_contact_unlocks WHERE unlocked_until > now()` | false (fail-safe) |
| Redis heal after DB hit | bot.js:8103-8104 | If DB=true, sets Redis cache | best-effort |
| `revealContacts` composite | bot.js:8107 | `isPreview \|\| unlocked \|\| opts.revealContacts` | — |
| `linksEnabled` | bot.js:8109 | `revealContacts && !isCuratorPreview` | — |

### 4.2 Credit/Payment Gates (STEP94: validated)
| Check | Файл:строки | Условие |
|-------|-------------|---------|
| `_validateStarsPaymentStrict` | bot.js:914-935 | currency=XTR + amount matches product catalog + optional payer match |
| `_isSafeInvoicePayload` | bot.js:771-777 | ASCII alnum+underscore only, ≤128 bytes |
| `_expectedStarsForInvoicePayload` | bot.js:799-912 | Per-kind payload parsing + price lookup from CFG/Redis overrides |
| `unlockWorkspaceContactsWithCredits` | queries.js:584-683 | PG advisory lock + atomic INSERT/UPDATE + credit WHERE guard |
| `getOrCreateBarterThreadWithCredits` | queries.js:2043 | cost + trial + dailyLimit |
| `spendBrandCredits` | queries.js:515-555 | `WHERE brand_credits >= $2` atomic |
| `getBrandCreditsCached` | bot.js:44-71 | Redis-first, DB fallback, 60s TTL |

### 4.3 Ownership Checks
| Check | Файл | Тип |
|-------|------|-----|
| `getLeadForActorSafe` | bot.js:8654-8660 | **SAFE** (SQL ownership) |
| `getBrandLeadForActor` | queries.js:4427-4465 | **SAFE** (ownership in WHERE: owner/brand/manager/curator) |
| `getBrandAppForActorSafe` | bot.js:8662-8668 | **SAFE** (SQL ownership) |
| `getBrandApplicationForActor` | queries.js:4795+ | **SAFE** (ownership in WHERE) |
| `getWorkspace(ownerUserId, wsId)` | queries.js | **SAFE** (WHERE owner_user_id=$1) |
| `getBarterThreadForUser` | queries.js | **SAFE** (WHERE buyer/seller=$2) |
| `getBrandLeadById` | queries.js:4420 | **UNSAFE** — used only by admin (`isSuperAdminTg` gated) |
| `getWorkspaceAny` | queries.js:3944 | **UNSAFE** — used after ownership verified in caller |
| `getPaymentById` | queries.js:3316 | **UNSAFE** — admin-only |

### 4.4 Admin Gate
`isSuperAdminTg(tgId)` — bot.js:327 — **116 uses**. All admin/broadcast/moderation/audit/payment actions gated.

### 4.5 Redis Degradation Behavior
| Scenario | Behavior | Safe? |
|----------|----------|-------|
| `redis.get(wsp_contact:*)` fails | DB fallback `isWorkspaceContactsUnlocked` | ✅ fail-safe |
| `redis.set(wsp_contact:*)` fails | DB-truth preserved, Redis heals on next check | ✅ |
| `getBrandCreditsCached` Redis fails | Falls through to `db.getBrandCredits` | ✅ fail-open to DB |
| `redis.get(lock:*)` fails | Lock not acquired → operation skips tick | ✅ |
| `getPaymentsRuntimeFlags` Redis fails | Default flags from CFG | ✅ |

---

## 5. Role/Permission Matrix

| Роль | Источник прав | Ownership check | Contact access | Payment validation |
|------|---------------|-----------------|----------------|--------------------|
| **Brand owner** | `users.id` + `ui_mode` | `getBrandLeadForActor` (SQL) | Paid unlock (PG advisory + credits) | `_validateStarsPaymentStrict` |
| **Brand manager** | `brand_managers.manager_user_id` | Included in `getBrandLeadForActor` WHERE | Via own credits | Same |
| **Creator owner** | `workspaces.owner_user_id` | `getWorkspace(owner, ws)` | Sees own contacts | `_validateStarsPaymentStrict` |
| **Curator** | `workspace_curators.user_id` | Included in `getBrandLeadForActor` WHERE | deLinkified (plain) | N/A |
| **Admin** | `SUPER_ADMIN_TG_IDS` env | `isSuperAdminTg` → bypass to `getById` | Full | `_validateStarsPaymentStrict` in admin apply |
| **Support** | `SUPPORT_CHAT_ID` | N/A | Sees ticket text only | N/A |
| **End-user** | `users.tg_id` | None | None | N/A |

---

## 6. Dialog System Map

### 6.1 Brand ↔ Creator (Vitrina Contact Unlock) — **STEP94 hardened**
```
Brand → a:wsp_open → renderWsPublicProfile
  └→ Redis check wsp_contact:{ws}:{user}
  └→ (fail) DB fallback: brand_contact_unlocks WHERE unlocked_until > now()
  └→ (fail) contacts hidden

Brand → a:wsp_contact_unlock
  └→ owner bypass (free)
  └→ Redis idempotency check
  └→ db.unlockWorkspaceContactsWithCredits:
       ├→ pg_advisory_xact_lock(hashtext('wsp_contact:{ws}:{user}'))
       ├→ INSERT brand_contact_unlocks ON CONFLICT WHERE expired → UPDATE
       ├→ UPDATE users SET brand_credits -= cost WHERE brand_credits >= cost
       └→ COMMIT (atomic)
  └→ Redis cache SET (best-effort)
  └→ Contact Pack sent to brand
```

### 6.2 Payment Flow — **STEP94 hardened**
```
Invoice → pre_checkout_query
  └→ _validateStarsPaymentStrict(payload, currency, totalAmount)
     ├→ _isSafeInvoicePayload (ASCII only, ≤128)
     ├→ _expectedStarsForInvoicePayload (per-kind price lookup)
     └→ amount === expected → accept | reject with error_message

Telegram charges → successful_payment
  └→ recordStarsPayment (old ledger, ON CONFLICT DO NOTHING)
  └→ insertPayment (new ledger)
  └→ _validateStarsPaymentStrict (REPEAT validation)
     └→ fail → ORPHANED + ops alert + user message
  └→ apply by kind (credits/plan/PRO/founder)
  └→ markApplied

Admin → a:admin_pay_apply
  └→ _validateStarsPaymentStrict → fail → ERROR status + block
  └→ apply if valid

Cron autoheal → applyPaymentFallbackNoSession
  └→ ⚠️ NO _validateStarsPaymentStrict call
```

### 6.3 Brand Leads / Support / Barter
Unchanged from STEP88. See previous audit.

---

## 7. Monetization Gates Table

| Что скрываем | Где формируется | Условие открытия | Exactly-once | Риск |
|--------------|----------------|-------------------|-------------|------|
| Channel/IG/Portfolio на витрине | bot.js:8430 `linksEnabled` | `brand_contact_unlocks.unlocked_until > now()` | PG advisory lock + INSERT ON CONFLICT WHERE expired | **LOW** |
| About text (URL/@/email) | bot.js:8291 `redactContactsInText` | `revealContacts` | same | **MED** (phone bypass) |
| Contact Pack (post-unlock) | bot.js:20199-20240 | After `unlockWorkspaceContactsWithCredits` | same | **LOW** |
| Channel in lead dialog | bot.js:8913 | Redis `wsp_contact` check | Redis cache | **LOW** |
| Barter thread @username | bot.js:12618 | Paid intro | `getOrCreateBarterThreadWithCredits` | **LOW** |
| PRO features | queries.js:734 `isWorkspacePro` | `workspace_settings.pro_until > now()` | payment validation | **LOW** |
| Brand Plan features | queries.js `isBrandPlanActive` | `users.brand_plan_until > now()` | payment validation | **LOW** |

---

## 8. Top 10 Bypass Vectors

### #1 ⚠️ CRON AUTOHEAL SKIPS PAYMENT VALIDATION (MEDIUM)
**Воспроизведение:** Attacker creates invoice with correct payload format but pays fewer Stars than expected (possible via Telegram API edge case or modified client). Payment goes ORPHANED (missing_session). Cron `autoHealOrphanedPayments` → `applyPaymentFallbackNoSession` applies without checking amount.  
**Impact:** Credits/plan applied for underpayment.  
**Место:** `src/bot/cron.js:410` calls `applyPaymentFallbackNoSession` which does NOT call `_validateStarsPaymentStrict`.  
**Вероятность:** Very low (pre_checkout now rejects, but legacy ORPHANED records could exist).  
**Фикс:** See Fix #1 below.

### #2 ⚠️ PHONE NUMBERS NOT REDACTED (MEDIUM)
**Воспроизведение:** Creator writes "+7 999 123 45 67" in `profile_about`.  
**Результат:** Brand sees phone without paying.  
**Место:** `redactContactsInText()` bot.js:114-155 — no phone regex.  
**Фикс:** See Fix #2 below.

### #3 ✅ CALLBACK REPLAY: `a:wsp_contact_unlock` (LOW → FIXED)
**STEP88:** Redis-only idempotency (could double-charge on Redis failure).  
**STEP94:** PG advisory lock + `INSERT ON CONFLICT WHERE expired` → **exactly-once guaranteed**.  
**Вердикт:** FIXED.

### #4 ✅ PRE_CHECKOUT VALIDATION (LOW → FIXED)
**STEP88:** Always `answerPreCheckoutQuery(true)`.  
**STEP94:** `_validateStarsPaymentStrict` → reject with error message.  
**Вердикт:** FIXED.

### #5 ✅ ADMIN APPLY WITHOUT VALIDATION (LOW → FIXED)
**STEP88:** No validation on manual apply.  
**STEP94:** `_validateStarsPaymentStrict` in `adminApplyPayment` → fail-safe block.  
**Вердикт:** FIXED.

### #6 ✅ REDIS DEGRADATION LEAKS CONTACTS (LOW → FIXED)
**STEP88:** Redis fail → `unlocked = false` (safe, but no DB fallback → paid users lose access).  
**STEP94:** Redis fail → DB fallback `isWorkspaceContactsUnlocked` → heal Redis.  
**Вердикт:** FIXED.

### #7 ✅ DEEP-LINK `/start ws_123` (LOW)
Opens vitrina with contacts hidden (Redis + DB check). No bypass.

### #8 ✅ FORWARD CONTACT PACK (LOW — by design)
Contact Pack message forwarded retains URL buttons. Accepted: brand paid for access.

### #9 ✅ CURATOR SEES CONTACTS (LOW)
Curator preview uses `deLinkifyText` (@ → ＠, . → ․). Not clickable.

### #10 ✅ DOUBLE SPEND ON RETRY (LOW → FIXED)
STEP88: `spendBrandCredits` atomic but Redis-only lock.  
STEP94: PG advisory lock + `INSERT ON CONFLICT WHERE expired` → 0 rows if already active.

---

## 9. Payments Hardening Table

| Product | Expected Stars | Payload Schema | Validated in | Risk |
|---------|---------------|----------------|-------------|------|
| PRO | `CFG.PRO_STARS_PRICE` | `pro_<wsId>_<userId>_<token>` | pre_checkout + successful_payment + admin_apply | **LOW** |
| Brand Pass S/M/L | `BRAND_TOPUP_*_PRICE` | `brand_<userId>_<S\|M\|L>_<token>` | same | **LOW** |
| Brand Plan start/pro | `BRAND_PLAN_*_PRICE` | `bplan_<userId>_<start\|pro>_<token>` | same | **LOW** |
| Matching S/M/L | `MATCH_*_PRICE` | `match_<userId>_<S\|M\|L>_<token>` | same | **LOW** |
| Featured 1/7/30d | `FEATURED_*_PRICE` | `feat_<userId>_<days>_<token>` | same | **LOW** |
| Official publish | `OFFICIAL_*_PRICE` | `offpub_<userId>_<offerId>_<days>_<token>` | same | **LOW** |
| Founder 3m/12m | `FOUNDER_*_PRICE` (Redis override) | `founder_brand_3m\|12m_<userId>_<token>` | same | **LOW** |
| Cron autoheal | — | — | ⚠️ **NOT VALIDATED** (`payments_fallback.js`) | **MEDIUM** |

---

## 10. Ownership-in-SQL Audit

### Safe (ownership in SQL WHERE)
| Function | File | Pattern |
|----------|------|---------|
| `getBrandLeadForActor` | queries.js:4427 | `WHERE owner/brand/manager/curator` |
| `getBrandApplicationForActor` | queries.js:4795 | `WHERE owner/brand/manager/curator` |
| `getWorkspace(owner, ws)` | queries.js | `WHERE owner_user_id=$1 AND id=$2` |
| `getBarterThreadForUser` | queries.js | `WHERE buyer/seller=$2` |
| `unlockWorkspaceContactsWithCredits` | queries.js:584 | `pg_advisory_xact_lock` + atomic TX |
| `spendBrandCredits` | queries.js:515 | `WHERE brand_credits >= $2` |
| `isWorkspaceContactsUnlocked` | queries.js:559 | `WHERE brand_user_id=$1 AND workspace_id=$2` |

### Unsafe getById (acceptable — gated in callers)
| Function | File | Caller Gate |
|----------|------|-------------|
| `getBrandLeadById` | queries.js:4420 | Only via `getLeadForActorSafe` → `isSuperAdminTg` |
| `getBrandApplicationById` | queries.js:4789 | Only via `getBrandAppForActorSafe` → `isSuperAdminTg` |
| `getWorkspaceAny` | queries.js:3944 | Used after ownership verified in caller |
| `getPaymentById` | queries.js:3316 | Admin-only handlers |
| `getUserById` | queries.js:4355 | Non-sensitive (no contacts) |
| `getGiveawayById` | queries.js:1441 | Public data (giveaway info) |

---

## 11. Docs ↔ Code Mismatches

| # | Документ | Расхождение | Критичность |
|---|----------|-------------|-------------|
| 1 | `00_CURRENT_STATE.md` ENV list | `CONTACT_UNLOCK_COST`, `CONTACT_UNLOCK_TTL_DAYS`, `BRAND_CREDITS_CACHE_TTL_SEC` — не указаны в секции ENV | Medium |
| 2 | `01_SECURITY_INVARIANTS.md` §B.5 | Документирует PG advisory lock — ✅ реализовано в `unlockWorkspaceContactsWithCredits` | OK |
| 3 | `01_SECURITY_INVARIANTS.md` §A.3 | "auto-heal fail-safe" — ⚠️ fallback apply НЕ вызывает strict validation | Medium |
| 4 | `00_CURRENT_STATE.md` | `brand_contact_unlocks` таблица не упомянута | Low |

---

## 12. Fixes (2 рекомендации)

### FIX-1: Добавить validation в cron autoheal (RECOMMENDED)
**Проблема:** `applyPaymentFallbackNoSession` не валидирует сумму/валюту.  
**Файл:** `src/bot/cron.js`, функция `autoHealOrphanedPayments`, после строки 410  
```diff
 // Inside autoHealOrphanedPayments, before calling applyPaymentFallbackNoSession:
+      // Hardening: skip if amount/currency don't match current catalog.
+      try {
+        const v = await _validateStarsPaymentStrict({
+          payload: String(pay.invoice_payload || ''),
+          currency: String(pay.currency || 'XTR'),
+          totalAmount: Number(pay.total_amount || 0),
+          payerUserId: Number(pay.user_id || 0) || null,
+        });
+        if (!v.ok) {
+          await db.setPaymentStatus(pay.id, 'ERROR', `autoheal_validation_failed:${v.reason}`);
+          failed++;
+          continue;
+        }
+      } catch {}
```
**Реализация:** Экспортировать `_validateStarsPaymentStrict` из bot.js (или дублировать валидационную логику в payments_fallback.js). Либо передать как параметр в cron.  
**Риск:** Low (only affects ORPHANED payments with note `missing_session`).  
**QA:** Создать тестовый ORPHANED платёж с неверной суммой → убедиться что autoheal НЕ применяет.

### FIX-2: Маскировка телефонов (RECOMMENDED, same as STEP88)
**Файл:** `src/bot/bot.js`, `redactContactsInText`, после emailRe (~строка 141)
```diff
+  // phone numbers (international + local)
+  const phoneRe = /(?:\+?\d{1,3}[\s\u00a0.-]?)?\(?\d{2,4}\)?[\s\u00a0.-]?\d{2,4}[\s\u00a0.-]?\d{2,4}(?:[\s\u00a0.-]?\d{2,4})?/g;
+  if (phoneRe.test(s)) {
+    redacted = true;
+    s = s.replace(phoneRe, '🔒 номер скрыт');
+  }
```
**Риск:** Low (может зацепить цены/даты в тексте — протестировать).  
**QA:** Витрина с "+7 999 123 45 67" в about → зайти как бренд без unlock → убедиться "🔒 номер скрыт".

---

## 13. QA Test Matrix (35 сценариев)

### Payment Validation (NEW in STEP94)
| # | Сценарий | Ожидание |
|---|----------|----------|
| 1 | pre_checkout с правильным payload/amount | `answerPreCheckoutQuery(true)` |
| 2 | pre_checkout с неверной суммой | `answerPreCheckoutQuery(false)` + log |
| 3 | pre_checkout с `currency != XTR` | reject |
| 4 | pre_checkout с invalid payload chars | reject |
| 5 | successful_payment с amount mismatch | ORPHANED + ops alert + user message |
| 6 | successful_payment duplicate (Telegram retry) | ON CONFLICT DO NOTHING, apply if not yet APPLIED |
| 7 | admin apply на ORPHANED с mismatched amount | ERROR status + "Apply заблокирован" |
| 8 | admin apply на уже APPLIED | "Уже применён ✅" |

### Contact Unlock DB-Truth (NEW in STEP94)
| # | Сценарий | Ожидание |
|---|----------|----------|
| 9 | Brand unlocks contacts (first time) | Credits charged, `brand_contact_unlocks` row created, Redis cached |
| 10 | Brand re-clicks unlock (active) | "Уже открыто ✅", no charge (INSERT ON CONFLICT: 0 rows) |
| 11 | Redis down → brand opens vitrina | DB fallback: contacts shown if `unlocked_until > now()` |
| 12 | Redis down → brand unlocks | PG advisory lock handles concurrency, Redis heals |
| 13 | Redis restored → vitrina | Redis cache healed from DB |
| 14 | Unlock expires (TTL) → brand re-opens | Contacts hidden, needs to pay again |
| 15 | Owner opens own vitrina | "Это твоя витрина ✅", no charge |
| 16 | `CONTACT_UNLOCK_COST=0` | Free unlock, DB record still created |
| 17 | Brand with 0 credits tries unlock | "Нужны кредиты" → Brand Pass |
| 18 | Concurrent unlock requests (same brand+ws) | PG advisory lock serializes → exactly-once |

### Text Redaction
| # | Сценарий | Ожидание |
|---|----------|----------|
| 19 | About with URL | "🔒 ссылка скрыта" |
| 20 | About with @handle | "🔒@скрыто" |
| 21 | About with email | "🔒 email скрыт" |
| 22 | About with phone number | ⚠️ NOT masked (until FIX-2) |
| 23 | About clean text | unchanged |

### Brand Lead Dialog
| # | Сценарий | Ожидание |
|---|----------|----------|
| 24 | Brand opens lead dialog without unlock | Channel = "🔒 скрыто" |
| 25 | Brand with unlocked contacts opens dialog | Channel = "@username" |
| 26 | Creator sends template reply | Brand gets lockHint + unlock button (no contact leak) |

### Ownership/Access
| # | Сценарий | Ожидание |
|---|----------|----------|
| 27 | Non-owner tries lead_view | `getBrandLeadForActor` → null → "Заявка не найдена" |
| 28 | Non-admin tries `a:admin_home` | "Нет доступа" |
| 29 | Manager accesses brand's lead | Allowed (in SQL WHERE) |
| 30 | Curator accesses workspace lead | Allowed (in SQL WHERE + curator_enabled) |

### Redis Degradation
| # | Сценарий | Ожидание |
|---|----------|----------|
| 31 | Redis fully down → vitrina render | DB fallback for contacts, `getBrandCreditsCached` falls to DB |
| 32 | Redis down → contact unlock | PG advisory lock works, Redis SET fails silently |
| 33 | Redis down → payment pre_checkout | `getPaymentsRuntimeFlags` → default from CFG |
| 34 | Redis down → cron tick | Lock acquisition fails → tick skips (safe) |

### Cron Autoheal
| # | Сценарий | Ожидание |
|---|----------|----------|
| 35 | ORPHANED payment with correct amount | Applied successfully |

---

## 14. Security Improvements vs STEP88

| Area | STEP88 | STEP94 | Status |
|------|--------|--------|--------|
| pre_checkout validation | Always true | `_validateStarsPaymentStrict` | ✅ FIXED |
| successful_payment validation | None | `_validateStarsPaymentStrict` | ✅ FIXED |
| Admin apply validation | None | `_validateStarsPaymentStrict` | ✅ FIXED |
| Contact unlock DB-truth | Redis-only | `brand_contact_unlocks` + PG advisory | ✅ FIXED |
| Contact unlock exactly-once | `spendBrandCredits` atomic | TX: advisory lock + INSERT ON CONFLICT + charge | ✅ FIXED |
| Redis degradation contacts | fail-safe (hidden) | DB fallback + heal | ✅ FIXED |
| Ownership in SQL | getById + JS check | `getForActorSafe` (SQL WHERE) | ✅ FIXED |
| Brand credits hot-path | Direct DB read | Redis-first cache (60s TTL) | ✅ NEW |
| Phone redaction | Not masked | Not masked | ⚠️ OPEN |
| Cron autoheal validation | None | None | ⚠️ OPEN |

---

## Итоговая оценка

| Категория | STEP88 | STEP94 |
|-----------|--------|--------|
| Payment safety | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Contact gating | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐⭐ (DB-truth) |
| Credit economy exactly-once | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (PG advisory) |
| Redis degradation | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (DB fallback + heal) |
| Ownership-in-SQL | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (safe getters) |
| Text redaction | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ (phones still open) |
| Observability | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Documentation | ⭐⭐⭐⭐ | ⭐⭐⭐⭐½ (01_SECURITY_INVARIANTS.md) |

**Overall: 9.5/10** — Major hardening ship. Two remaining items (phone redaction + cron validation) are both low-probability, medium-impact.
