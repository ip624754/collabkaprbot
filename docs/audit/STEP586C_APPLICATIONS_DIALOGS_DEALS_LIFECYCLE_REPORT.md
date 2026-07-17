# STEP586C — Applications, Dialogs and Deals Lifecycle Report

**Date:** 2026-07-18  
**Status:** IMPLEMENTED / LOCAL QA  
**Mode:** HEAVY  
**Baseline:** STEP586B FULL  
**Next STEP:** STEP586D — Invite Center Language and Mechanism Honesty

## 1. Outcome

STEP586C gives Collabka one user-facing collaboration lifecycle:

```text
Оффер / профиль → Заявка → Диалог → Сделка → Этап / закрытие
```

The words now follow state instead of screen history:

- a request before acceptance is a `заявка`;
- message exchange is a `диалог`;
- a `сделка` exists only after authoritative acceptance evidence;
- an accepted deal has an `этап`, not a user-facing internal `stage`.

Callbacks and destinations remain unchanged. The STEP changes copy, state-derived labels, source contracts and accepted-deal guards.

## 2. Product-language changes

### 2.1 Menus and navigation

Canonical labels:

- `💬 Диалоги` — offer conversation threads;
- `📨 Заявки` — requests before acceptance;
- `🤝 Сделки` — accepted applications with work stages.

The old visible `Inbox`, `📥 Inbox`, `📝 Заявки` and `📌 Сделки` variants were removed from the active lifecycle surfaces.

### 2.2 Creator and brand symmetry

Creator-side copy now distinguishes:

- applications sent to brands;
- applications received from brands;
- offer conversations;
- accepted deals.

Brand-side copy now distinguishes:

- offer conversations;
- incoming applications;
- accepted deals.

A creator application receipt points the brand to `Заявки`, not to `Диалоги`.

### 2.3 State-derived object titles

Creator application cards no longer call every state a dialog.

The title is derived from source state:

- `📨 Заявка #…` before acceptance;
- `💬 Диалог по заявке #…` when correspondence exists without deal evidence;
- `🤝 Сделка #…` only when deal evidence exists.

The deal-stage block is rendered only when `meta.deal_stage` is present.

### 2.4 Dialog and deal surfaces

The dialog list explains its real scope: correspondence around offers. Its empty state points application flows to `Заявки`.

Deal filters use one visible vocabulary:

- `💬 Переговоры`;
- `🤝 Договорились`;
- `💳 Оплата`;
- `✅ Завершено`;
- `🗑 Остановлено`;
- `📌 Все`.

Deal screens use `Этап`, not `Стадия`.

### 2.5 Notifications and payment follow-ups

Acceptance notices state the real transition:

```text
Заявка принята.
Сделка открыта. Переписка продолжается в боте.
```

Payment success copy points to `💬 Диалоги` without changing payment behavior, callback destinations or credit economics.

## 3. Security finding and fix

### Finding

During lifecycle review, the direct `a:brand_deal_set` callback path was found to rely on an application ID and did not perform the same explicit brand-access assertion before the stage mutation.

That was an abuse-path risk: a forged callback must never be enough to mutate a deal by ID.

### Runtime guard

STEP586C adds one accepted-deal invariant:

```text
accepted_by_user_id > 0 AND deal_stage exists
```

Deal-only view, reply, template and stage-mutation paths reject pre-acceptance applications and return to the application card.

The stage mutation handler now:

1. loads an actor-scoped application;
2. verifies brand/application access;
3. verifies accepted-deal evidence;
4. only then attempts the write.

### SQL guard

Deal list/count/filter queries now require both authoritative fields.

`setBrandApplicationDealStage()` also requires accepted-deal evidence in its `WHERE` clause. The existing `set_by_user_id` and `set_at` audit trail remains intact.

This is defense in depth. UI copy alone is not treated as a state boundary.

## 4. Preserved invariants

STEP586C does not change:

- callback values or handler identities;
- application acceptance pricing;
- Brand Plan or credit economics;
- application creation rules;
- message persistence format;
- role and manager permissions;
- DB schema or migrations;
- payment apply logic;
- QStash delivery mechanism;
- Telegram webhook behavior.

## 5. Source enforcement

Added:

```bash
npm run smoke:applications-dialogs-deals-lifecycle-contract
```

The guard checks:

- canonical menu labels on existing callbacks;
- dialog-list scope and empty-state routing;
- state-derived creator card titles;
- deal UI gating;
- accepted-only runtime and SQL guards;
- access verification before stage mutation;
- accepted transition wording;
- payment follow-up semantics;
- continued presence of lifecycle callback identities.

The command is included in `preflight:source`.

Existing source contracts were updated only where they intentionally asserted old lifecycle labels.

## 6. QA truth boundary

### Verified locally

- canonical `npm run preflight:source`: PASS;
- callback consistency: zero unresolved actions;
- dependency/runtime preflight: PASS;
- STEP586C lifecycle contract: PASS;
- targeted creator, brand, application, dialog and deal contracts: PASS;
- accepted-application typed SQL contract: PASS;
- runtime proof spine: PASS;
- staging acceptance source contract: PASS;
- changed JavaScript syntax: PASS;
- complete project JavaScript syntax sweep: PASS;
- package-lock consistency: PASS;
- dependency audit: zero high-severity vulnerabilities;
- FULL and BROWSER_HOTFIX archive integrity: PASS.

### Not verified

- live Telegram creator/brand traversal;
- mobile wrapping and button truncation;
- Vercel Preview or production deployment;
- live Neon accepted-deal queries;
- live QStash acceptance notification;
- real-user comprehension;
- remote STEP584 evidence.

Source and local runtime checks do not prove live UX.

## 7. Decision

STEP586C is ready for browser application and source review.

The next bounded implementation is:

> **STEP586D — Invite Center Language and Mechanism Honesty**

Do not mix monetization taxonomy or callback renaming into STEP586D.
