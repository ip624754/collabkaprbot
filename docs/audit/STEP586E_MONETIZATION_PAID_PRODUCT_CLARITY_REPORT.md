# STEP586E — Monetization and Paid Product Clarity Report

**Date:** 2026-07-18
**Status:** IMPLEMENTED / LOCAL QA
**Mode:** HEAVY
**Baseline:** STEP586D FULL
**Next STEP:** STEP586F — Access, Error and Empty-State Recovery

## 1. Outcome

STEP586E gives Collabka one source-backed language for paid products without changing prices, payment provider, callback identities, ledger semantics or entitlement application.

Canonical user-facing product objects:

- `Brand Plan` — time-bounded subscription for a brand;
- `Кредиты` — expendable internal brand units;
- `PRO канала` — time-bounded creator entitlement for one selected channel;
- `Умный подбор` — one-time paid matching service;
- `Продвижение` — one-time paid visibility service;
- `Founder Sale` — campaign name, not a separate entitlement type;
- `Размещение в официальном канале` — separate moderated placement service.

The purchase screens now state the amount in Stars, the exact result, scope or duration, the next action and the delayed-application recovery boundary.

## 2. Source-confirmed findings resolved

### 2.1 False credit-spend claim

Old copy said Stars or credits were used only for new dialogs. Source mechanics also spend credits when a brand accepts an application and opens a deal, and may spend credits to unlock contacts.

The current user contract states all three spend families and also states that messages inside an already-open dialog are free.

### 2.2 Hardcoded credit-pack labels

Some visible pack titles contained fixed quantities even though pack quantity and price are runtime configuration values. A configuration change could therefore make the button disagree with the invoice.

Pack labels are now derived from the same runtime configuration objects used to create the invoice.

### 2.3 Hardcoded creator PRO duration

Old copy described creator PRO as a month or thirty days while runtime already exposes `PRO_DURATION_DAYS`. The visible duration and invoice title now derive from the runtime value.

### 2.4 Brand Plan tier ambiguity

Source currently gives both Brand Plan tiers the same product-tool entitlement surface. The confirmed difference is price and the number of credits included at activation. The screen now says this directly rather than implying an unverified feature split.

### 2.5 Refund and delayed-application boundary

No automatic refund implementation was found in the reviewed bot payment path. The system has payment ledger, retry/fallback application and operator support. It does not have a user-triggered automatic refund path.

Payment screens now state:

```text
Платёж не применился: /paysupport.
Автоматического возврата нет.
```

This is a mechanism statement, not a legal-policy substitute.

### 2.6 Missing payment catalog dependencies

The extracted Stars payment handler referenced `MATCH_TIERS`, `FEATURED_DURATIONS` and `BRAND_PLANS`, but the bundle did not receive those catalogs through dependency injection.

That created a source-confirmed runtime `ReferenceError` risk on paid matching, promotion and Brand Plan application paths. STEP586E passes all three catalogs explicitly from `bot.js` into `starsHandlers.js` and adds a source guard for the dependency boundary.

No price, payload, entitlement or transaction rule changed in this fix.


### 2.7 Telegram invoice field limits

Adding product detail and recovery text can make an invoice invalid even when the payment mechanism is correct. Telegram limits an invoice title to 32 characters and its description to 255 characters.

STEP586E now builds both fields through bounded code-point helpers. The result keeps the recovery boundary, clips only when needed and prevents copy expansion from breaking invoice creation.

### 2.8 Parsed but non-authoritative Brand Plan config keys

`CFG.BRAND_PLAN_PRO_MATCH` and `CFG.BRAND_PLAN_PRO_FEATURED_DAYS` are parsed, but the reviewed active entitlement path does not consume them. The active mechanism uses the matching catalog plus `BRAND_PLAN_INCLUDED_*` constants in `bot.js`.

STEP586E does not make the unused keys authoritative because that would change entitlement behavior inside a copy STEP. User copy follows the mechanism that actually runs. A later ENV-governance STEP should either remove the stale keys or migrate the mechanism to them with an explicit economic decision and runtime acceptance.

## 3. User-facing changes

### 3.1 Creator PRO

The channel screen now states:

- exact Stars price;
- exact configured duration;
- selected-channel scope;
- current free and PRO limits;
- current bump cooldown;
- that creator PRO does not include Brand Plan or brand credits.

### 3.2 Brand credits

Credit screens now state:

- credits are internal expendable units, not money or a subscription;
- exact configured quantity and Stars price for each pack;
- current spend actions and configured costs;
- that buying credits does not activate Brand Plan;
- that messages inside an open dialog are free.

### 3.3 Brand Plan

The subscription screen now states:

- exact configured duration;
- exact Start and Pro prices;
- included credits for each tier;
- current included matching and promotion limits;
- manager limit;
- that credits do not extend subscription time;
- that the current tier difference is price and included credits.

### 3.4 One-time paid services

`Smart Matching` and `Featured` are now presented to ordinary users as:

- `Умный подбор`;
- `Продвижение`.

Each payment screen and success receipt states the exact Stars amount and the exact purchased count or duration.

### 3.5 Founder Sale and official placement

`Founder Sale` is consistently described as a campaign that applies an existing product entitlement. It is not presented as a third subscription type.

Official-channel placement remains a separate moderated service. Its copy now distinguishes payment from moderation and publication.

### 3.6 Public campaign templates

Founder Sale giveaway templates now use the same paid-product names and runtime limits as the bot screens. Removed claims such as generic `расширенные возможности` or unverified priority in the brand feed. The creator template now lists the configured offer limit, bump interval, pin and analytics.

### 3.7 Transaction receipts and recovery

Direct apply, fallback apply, cron auto-heal and QStash retry notifications use the same shared receipt builder where applicable. Delayed success therefore reports the actual applied product, duration or credit amount instead of a generic success line.

## 4. Mechanism and abuse-path review

Preserved controls:

- strict Telegram Stars amount validation;
- signed/HMAC payload validation in fallback application;
- atomic fallback apply transaction;
- payment-row status transition to `APPLIED`;
- replay/idempotency boundaries;
- unchanged callback and invoice payload prefixes;
- entitlement values resolved from server-side runtime catalogs;
- no client-supplied price, duration or credit quantity.

The copy does not claim an entitlement that the reviewed source does not apply.

## 5. Source enforcement

Added:

```bash
npm run smoke:monetization-paid-product-clarity-contract
```

The guard checks:

- canonical product taxonomy;
- unchanged runtime configuration defaults;
- separation of subscriptions, credits and one-time services;
- configuration-derived pack and duration labels;
- exact invoice/catalog mapping;
- bounded 32-character title and 255-character description construction;
- delayed-application and no-automatic-refund boundary;
- fallback metadata required for truthful receipts;
- cron and QStash use of the shared recovery receipt;
- explicit payment-catalog dependency injection;
- unchanged callbacks, payload prefixes and payment safety mechanisms.

The command is included in `preflight:source`.

## 6. Preserved invariants

STEP586E does not change:

- Telegram Stars as payment provider;
- configured prices or default values;
- callback IDs or destinations;
- invoice payload prefixes;
- payment ledger schema;
- amount validation;
- HMAC verification;
- exactly-once/fallback transaction semantics;
- creator PRO target or duration source;
- Brand Plan target, duration source or included-credit source;
- matching count catalog;
- promotion duration catalog;
- official-placement moderation requirement;
- DB schema or migrations.

## 7. Truth Boundary

### Verified locally

- dedicated STEP586E source contract: PASS;
- runtime Stars payment validation integration: PASS;
- payment auto-heal chain contract: PASS;
- callback consistency: 553 refs, 0 unresolved;
- dependency/runtime preflight: PASS;
- runtime proof spine: PASS;
- STEP586A–D regression contracts: PASS;
- package-lock consistency: PASS;
- dependency audit: 0 vulnerabilities;
- complete parallel JavaScript syntax sweep: 221 files PASS.

The canonical serial `npm run preflight:source` passed all reached assertion, registry and generator gates, including STEP586E. It then exceeded the execution limit during the long sequential `node --check` sweep and did not print the final PASS line. The complete JavaScript surface is verified separately in the STEP586E QA pack.

### Not verified

- Vercel Preview or production deployment;
- live Telegram layout and mobile wrapping;
- a real Telegram Stars charge;
- live Neon payment-ledger convergence;
- live Redis/QStash retry delivery;
- operator handling of `/paysupport`;
- any real refund operation;
- remote STEP584 staging evidence;
- whether the parsed but unused `BRAND_PLAN_PRO_MATCH` / `BRAND_PLAN_PRO_FEATURED_DAYS` keys should be removed or made authoritative;
- real-user comprehension.

Source and local runtime checks do not prove live payment-platform behavior.

## 8. Decision

STEP586E is bounded and ready for browser application after review of the attached QA pack.

The next scoped implementation is:

> **STEP586F — Access, Error and Empty-State Recovery**

Do not combine generic error cleanup with permission changes or hidden object-existence disclosures.
