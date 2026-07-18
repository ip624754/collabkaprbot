# STEP586H — Live Telegram Acceptance and Mobile Copy Pass

**Date:** 2026-07-18
**Mode:** HEAVY acceptance
**Parent baseline:** STEP586G
**Status:** acceptance tooling and source mobile pass implemented; remote Telegram evidence pending

## 1. Scope

STEP586H closes the source-only gap left after STEP586A–G.

The implementation adds:

- a target-acknowledged manual Telegram evidence workflow;
- mandatory creator, brand, invite, paid, recovery and operator paths;
- PASS/FAIL/BLOCKED semantics;
- anti-secret and anti-accidental-purchase guards;
- a static Telegram button-width lint;
- a source contract that prevents an empty checklist from becoming green;
- a bounded mobile copy fix for source-confirmed long labels.

No callback, permission, database, payment, reward or state-machine behavior is changed.

## 2. Source-confirmed mobile defects fixed

The static scan found three bounded labels above the 34-character hard limit:

- `✅ Включено: осталось ${left} в этом месяце` in Smart Matching;
- the same label in Featured/Promotion;
- `⛔+🧾 Забрать Brand Plan + подарочные кредиты` in the admin gift-revoke screen.

They were shortened without changing action identity:

- `✅ Включено · осталось ${left}`;
- `⛔ Plan и подарочные кредиты`.

Nearby labels were also shortened where the action remained exact:

- `⭐️ 1 запуск в Brand Plan`;
- `🧑‍💼 Кабинет менеджера`;
- `⛔ Отменить подписку`;
- `⛔ Отменить Brand Plan`;
- `🚀 Опубликовать заново`.

Callback data and destinations are unchanged.

## 3. Static mobile guard

New command:

```bash
npm run lint:telegram-mobile-copy
```

It scans static `InlineKeyboard.text(...)` and `.url(...)` labels under `src/bot/**`.

Rules:

- preferred maximum: 28 visible characters;
- hard maximum: 34 visible characters for bounded static labels;
- dynamic labels are reported for live review rather than treated as proven safe.

The hard limit is intentionally conservative. It catches obvious source defects but does not claim that Telegram will render every label well on every phone.

## 4. Live evidence workflow

New command:

```bash
npm run acceptance:telegram-mobile -- init
npm run acceptance:telegram-mobile -- finalize <evidence.json>
```

A PASS requires evidence for all seven paths:

1. new user and role selection;
2. creator lifecycle;
3. brand lifecycle;
4. invite center;
5. paid product/paywall;
6. stale/error/empty-state recovery;
7. admin/operator spot-check.

Each path must include:

- actual labels;
- screenshot or transcript reference;
- button wrapping PASS;
- message density PASS;
- navigation clarity PASS.

The evaluator rejects:

- PASS without evidence;
- incomplete required paths;
- an unapproved Stars purchase attempt;
- an unapproved invite-points spend;
- obvious secrets inside the evidence file.

## 5. Security and mechanism honesty

### Accidental spend protection

The paid path is read-only by default. `purchase_attempted=true` fails the pack unless `test_purchase_approved=true`.

The invite path uses the same rule for point spend.

### Private data protection

The runbook forbids probing arbitrary private IDs and requires redacted screenshots/transcripts.

The evaluator checks for common bot token, QStash token, database URL and bearer-token patterns.

### No evidence, no green

An untouched evidence template returns `BLOCKED`.

A path marked PASS without a screenshot/transcript or actual labels returns `FAIL`.

This prevents source checks or operator confidence from being reported as live acceptance.

## 6. Preserved invariants

STEP586H does not change:

- callback IDs or callback destinations;
- Telegram role or ownership checks;
- admin/operator privileges;
- deal acceptance and credit charging;
- invite attribution, ledger or reward economics;
- Stars prices, payloads, HMAC or exactly-once apply;
- giveaway behavior;
- Redis, QStash or Neon runtime;
- database schema or migrations;
- Vercel function count.

## 7. Local QA

Verified locally:

- STEP586H acceptance contract;
- target normalization and exact acknowledgement;
- untouched evidence resolves to BLOCKED;
- complete synthetic evidence resolves to PASS;
- PASS without evidence resolves to FAIL;
- unapproved purchase attempt resolves to FAIL;
- secret marker detection;
- static Telegram mobile button hard-limit audit;
- callback and previous STEP586 contracts;
- JavaScript syntax for changed files.

## 8. Truth Boundary

Verified:

- acceptance tooling exists and enforces evidence rules;
- source-confirmed overlong bounded labels were fixed;
- the source hard-limit scan is green;
- no intentional behavior change was introduced.

Not verified:

- Vercel Preview deployment;
- live Telegram creator/brand/operator traversal;
- actual phone wrapping;
- Stars invoice rendering;
- invite confirmation rendering;
- live stale-message behavior;
- real screenshots or transcripts;
- remote STEP584 acceptance.

Current honest status:

> **SOURCE MOBILE PASS IMPLEMENTED / LIVE TELEGRAM ACCEPTANCE BLOCKED PENDING TARGET AND EVIDENCE**

Do not mark STEP586 fully live-green until the generated evidence pack is finalized with PASS.

## 9. Final local verification snapshot

- static Telegram labels scanned: **2,023**;
- bounded static labels over 34 characters: **0**;
- bounded static labels in the 29–34 review band: **0**;
- dynamic labels retained for live review: **13**;
- callback consistency: **553 references / 559 registry keys / 0 unresolved**;
- JavaScript syntax surface: **227 / 227 PASS**;
- dependency/runtime preflight: **PASS**;
- runtime proof spine: **PASS**;
- staging acceptance source contract: **PASS**;
- package-lock consistency: **PASS**;
- Vercel deployable functions: **11 / 12**, existing capacity warning remains;
- npm audit at high severity: **0 vulnerabilities**;
- broadcast overload and Instagram contact-leak invariants: **PASS**.

The canonical `npm run preflight:source` passed every reached assertion through the broadcast local DB fuse, including both new STEP586H gates. The single serial command then exceeded the environment time limit while starting the payment auto-heal contract.

The remaining source scripts, generated-file parity, the complete 227-file syntax surface and optional invariants were executed separately and passed.

A stale optional assertion in `scripts/smoke-admin-ops-render.js` still expected pre-STEP586G English labels. The STEP586G runtime text was already correct. STEP586H updates only that test contract to the current Russian operator vocabulary; runtime behavior is unchanged.
