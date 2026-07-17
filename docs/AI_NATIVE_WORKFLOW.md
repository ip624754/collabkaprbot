# AI-NATIVE WORKFLOW — Collabka PR

**Status:** canonical process contract  
**Introduced:** STEP580  
**Governance:** CogniForge v6.7.6, adapted to the Collabka repository

## 1. Purpose

This document defines how AI-assisted work is performed on Collabka without losing source truth, runtime safety, product direction, or continuity between chats.

The canonical delivery loop is:

```text
fresh FULL baseline
→ read continuity docs
→ classify risk and choose CogniForge mode
→ define one narrow STEP
→ implement a bounded delta
→ verify source/contract/runtime at the level actually available
→ package artifacts
→ update continuity docs
→ handoff the next exact state
```

AI is an engineering and product execution layer. It is not an authority over live runtime state and must not infer successful deploys, migrations, payments, webhooks, cron execution, or Telegram behavior without evidence.

## 2. Canonical session inputs

Read in this order:

1. `docs/README.md`
2. `docs/00_BOOT.md`
3. `docs/00_CURRENT_STATE.md`
4. `docs/15_NEW_CHAT_HANDOFF.md`
5. the relevant CogniForge compiled preset
6. the current FULL repository archive
7. task-specific source and runbooks

Use only compiled CogniForge presets:

- `MODE_FAST/COMPILED_FAST.md`
- `COMPILED_STANDARD.md`
- `MODE_HEAVY/COMPILED_HEAVY.md`

Do not load or edit compiled presets inside the Collabka repository. CogniForge remains an external governance system; Collabka stores only its project-specific operating contract.

## 3. Mode selection for Collabka

### FAST

Use for bounded, reversible changes with low blast radius:

- copy cleanup;
- one-screen Telegram UI polish;
- isolated docs correction;
- a small source guard or smoke test;
- a local bug fix that does not touch critical zones.

### STANDARD

Use when the change affects several files or one complete feature surface:

- Telegram routing or callback IA;
- a new read-only admin surface;
- invite/reward UX expansion without ledger changes;
- docs canon and continuity upgrades;
- multi-file refactoring with stable public contracts.

### HEAVY / CRITICAL

Mandatory for:

- payments, Telegram Stars, credits, unlocks, ledger semantics;
- auth, admin sessions, webhook verification, secrets;
- database migrations or destructive data semantics;
- cron concurrency, advisory locks, idempotency, outbox delivery;
- giveaway winner selection or claim correctness;
- production deployment controls and security-sensitive changes.

No FAST override is allowed for critical zones.

## 4. STEP contract

Every non-trivial change receives a STEP identifier and a single outcome statement.

A valid STEP contains:

1. **Baseline** — exact source archive or commit.
2. **Scope** — files/modules allowed to change.
3. **Locked surfaces** — behavior that must remain unchanged.
4. **Risk** — explicit regression and runtime risks.
5. **Implementation** — narrow delta only.
6. **Verification** — source, contract, tests, and runtime truth separated.
7. **Artifacts** — FULL ZIP, browser HOTFIX ZIP, patch, changed files, QA.
8. **Continuity update** — current state, work history, handoff.

If scope grows unexpectedly, stop and re-scope rather than silently broadening the patch.

## 5. Truth boundary

Use these labels consistently:

- **Source-confirmed** — verified from the current repository.
- **Contract-verified** — verified by tests, smokes, static checks, or deterministic inspection.
- **Runtime-confirmed** — verified in the deployed environment with fresh evidence.
- **Operator-confirmed** — reported by the owner/operator but not independently reproduced in this session.
- **Not verified** — explicitly outstanding.

A successful ZIP build is not a successful deploy. A passing smoke is not proof of live Telegram behavior. A source-level fallback is not proof that the external dependency currently works.

## 6. Collabka change discipline

Before editing:

- locate the authoritative source path;
- check for an existing contract smoke;
- identify callback/action keys and navigation contracts;
- inspect current state and recent STEP history;
- confirm whether the surface is runtime-hot, money-bearing, or concurrency-sensitive.

During implementation:

- preserve backward compatibility unless the STEP explicitly changes a contract;
- avoid new DB reads in hot Telegram renders;
- keep `callback_data` within Telegram limits;
- preserve edit-first navigation and `Back/Menu/Home` semantics;
- keep serverless and Neon cost constraints visible;
- prefer existing helpers and routing patterns over parallel systems.

After implementation:

- run the smallest meaningful checks first;
- run broader preflight only when justified by scope;
- record what was not run and why;
- update continuity docs in the same artifact.

## 7. Artifact policy

For an implementation STEP, provide:

- `*_FULL.zip` — complete updated repository;
- `*_BROWSER_HOTFIX.zip` — changed files at repository-relative paths; this is the primary “apply this” artifact for browser/GitHub workflows;
- `*.patch` — optional terminal/developer artifact;
- `CHANGED_FILES.txt`;
- `QA_CHECKLIST.md`;
- a short summary.

Documentation-only STEPs still require honest changed-files and QA records.

## 8. Multi-model review

External model feedback is advisory until reconciled against the current source.

For every imported recommendation:

1. preserve its stated source;
2. map it to exact files/functions;
3. reject stale assumptions;
4. separate useful findings from proposed redesign;
5. implement only after the Collabka baseline confirms the issue.

## 9. Definition of done

A STEP is DONE only when:

- requested files are changed;
- no known invariant is violated;
- checks appropriate to the scope have passed;
- artifacts are created and readable;
- continuity docs name the new baseline;
- verified and unverified claims are separated;
- the next step, if any, is explicit and non-duplicative.
