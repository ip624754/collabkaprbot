# STEP586A — Copy Safety & Taxonomy Foundation Report

**Date:** 2026-07-18
**Status:** IMPLEMENTED / LOCAL QA
**Mode:** STANDARD with security review
**Baseline:** STEP585 FULL
**Next STEP:** STEP586B — Home, Menu and Role Navigation Contract

## 1. Outcome

STEP586A removes a bounded class of user-facing infrastructure leakage and establishes an enforceable copy-safety boundary.

Ordinary users now receive a short product-level failure message with recovery routes. Operators keep the technical cause through structured diagnostics.

This STEP also normalizes the approved invite vocabulary and fixes the confirmed `офер` typo without changing callbacks, reward economics, permissions or state transitions.

## 2. Scope implemented

### 2.1 Infrastructure details removed from ordinary-user copy

Targeted branches no longer tell users to apply migrations, inspect Neon, create tables or set ENV keys.

Covered failure families:

- missing `brand_managers` relation;
- missing `brand_profiles` relation;
- missing soft-delete columns;
- missing `BOT_USERNAME` for invite links;
- unavailable Instagram OAuth configuration;
- unavailable invite reward schema or invite snapshot persistence.

The shared user contract is:

```text
⚠️ <Раздел> временно недоступен

Попробуй позже. Если проблема повторится, открой поддержку.
```

Recovery surfaces use existing actions only:

- `a:support`;
- local Back where one already exists;
- `a:menu`;
- `a:home`.

### 2.2 Operator truth preserved

Technical causes remain visible through `reportCopySafetyDiagnostic()` and `[copy_safety]` log events.

Structured diagnostic codes include:

- `brand_managers_relation_missing`;
- `brand_profiles_relation_missing`;
- `soft_delete_columns_missing`;
- `invite_bot_username_missing`;
- `ig_oauth_disabled`;
- `ig_oauth_encryption_key_invalid`;
- `ig_oauth_client_config_missing`;
- `ig_oauth_public_base_url_missing`;
- `invite_rewards_summary_unavailable`;
- `invite_snapshot_unavailable`;
- `invite_rewards_schema_missing`;
- `invite_reward_redeem_failed`.

Relevant relation, migration, column, runner and configuration names remain in these diagnostics. They are not shown in ordinary-user messages.

### 2.3 Invite taxonomy normalized

User-facing invite and reward copy now uses:

- `баллы` instead of `pts / points`;
- `7 дней PRO`;
- `30 дней PRO`;
- `заполнил основной профиль`;
- `история баллов`;
- `приглашение` instead of internal `join` wording where the user reads the screen.

The activation wording matches the current mechanism: activation requires a sufficiently completed brand or workspace profile. No reward threshold or eligibility rule changed.

### 2.4 Bounded tone cleanup

Changed only the approved drift:

- account/access copy uses `ты / твой`;
- the confirmed `офер` spelling is now `оффер`;
- a mixed `Выбери, что вы...` prompt is now internally consistent;
- reward sentences were corrected for Russian grammar;
- raw internal failure reasons are no longer interpolated into user notices.

## 3. Security and abuse-path review

### Verified protections

- permission checks are untouched;
- missing-object and missing-schema branches still return before protected actions;
- recovery buttons point only to existing public navigation/support actions;
- technical error details are logged, not echoed to the user;
- callback handlers and callback destinations were not renamed;
- invite reward keys, point costs, durations and database state transitions are unchanged;
- no migration was added or changed;
- no payment path was changed.

### Explicit trade-off

A generic temporary-unavailability message reveals less diagnostic detail to the user. That is deliberate. The user cannot repair schema or deployment configuration, while exposing those details increases confusion and implementation leakage. Operator logs retain the evidence needed to resolve the defect.

## 4. Source enforcement

Added:

```bash
npm run smoke:copy-safety-taxonomy-contract
```

The guard verifies:

- shared safe-copy helpers exist;
- listed infrastructure instructions do not return to ordinary-user source branches;
- approved invite terms remain present;
- old mixed-language terms and the `офер` typo remain absent;
- DB reward labels stay Russian while reward keys/costs/durations stay fixed;
- operator diagnostic codes retain technical truth;
- existing support/menu/home/redeem callback identities remain present.

The guard is included in `preflight:source`.

Updated existing invite copy contracts so they assert the new user language rather than the old internal terminology.

## 5. Files changed

Runtime/source:

- `src/bot/bot.js`;
- `src/db/queries.js`.

QA/governance:

- `scripts/smoke-copy-safety-taxonomy-contract.js`;
- `scripts/smoke-invite-hub-ux-contract.js`;
- `scripts/smoke-invite-education-copy-contract.js`;
- `scripts/preflight.js`;
- `package.json`.

Documentation/continuity:

- `docs/audit/STEP586A_COPY_SAFETY_TAXONOMY_REPORT.md`;
- `docs/process/07_WORK_HISTORY_STEP586A.md`;
- `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`;
- `docs/product/COLLABKA_COPY_SYSTEM.md`;
- `docs/AI_MULTI_MODEL_HANDOFF_CURRENT.md`;
- `docs/00_CURRENT_STATE.md`;
- `docs/15_NEW_CHAT_HANDOFF.md`;
- `docs/README.md`.

## 6. QA truth boundary

### Verified locally

- changed JavaScript parses with `node --check`;
- STEP586A copy-safety source guard passes;
- invite hub language contract passes;
- invite education contract passes after updating its intentional copy assertions;
- invite recovery contract passes;
- invite layer contract passes;
- invite rewards contract passes;
- callback consistency passes with zero unresolved actions;
- dependency/runtime preflight passes after a clean local dependency install;
- dependency audit reports zero vulnerabilities;
- canonical serial `preflight:source` passed every assertion/generator gate reached before the large serial syntax sweep timed out;
- the complete JavaScript surface passed a separate parallel `node --check` sweep;
- the three residual optional invariant scripts after the serial syntax sweep passed separately.

### Not verified

- Vercel deployment;
- live Telegram rendering and mobile wrapping;
- real data-dependent missing-schema branches;
- production logs for `[copy_safety]` diagnostics;
- remote STEP584 staging acceptance;
- end-user comprehension testing.

The canonical serial source-preflight command did not print its final PASS line because the environment time limit expired during the long sequential syntax loop. This is not represented as a canonical-command PASS. Its residual syntax and optional invariant work was executed separately and passed.

## 7. Decision

STEP586A is ready for source review and browser application.

Do not combine the next step with lifecycle or monetization copy. The next bounded implementation is:

> **STEP586B — Home, Menu and Role Navigation Contract**

Its job is to align visible labels with the already-existing `a:home` and `a:menu` destinations. Callback values stay unchanged.
