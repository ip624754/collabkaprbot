# STEP586A — Copy Safety & Taxonomy Foundation

**Date:** 2026-07-18
**Status:** DONE
**Mode:** STANDARD + security review
**Baseline:** STEP585 FULL

## Goal

Remove user-facing infrastructure instructions, normalize the approved invite vocabulary, fix the confirmed `офер` typo and enforce the boundary in source QA.

## Implemented

- added shared safe-unavailability message and recovery keyboard helpers;
- added structured `[copy_safety]` diagnostics;
- replaced ordinary-user Neon, migration, table, ENV and OAuth configuration instructions;
- preserved technical relation/migration/config details in operator logs;
- localized invite reward labels and point wording;
- changed activation wording to `заполнил основной профиль`;
- changed `invite ledger` wording to `история баллов`;
- removed raw reward failure reasons from user notices;
- fixed bounded `ты/вы` drift;
- fixed active `офер` spellings to `оффер`;
- added `smoke:copy-safety-taxonomy-contract` to source preflight;
- updated affected invite language contracts.

## Invariants preserved

- no callback value or handler rename;
- no permission bypass;
- no DB migration;
- no reward key, threshold, duration or balance logic change;
- no payment change;
- no Home/Menu global label migration;
- no broad `Нет доступа.` replacement.

## QA

Passed locally:

- changed-file syntax checks;
- STEP586A copy-safety contract;
- invite hub contract;
- invite education contract;
- invite recovery contract;
- invite layer contract;
- invite rewards contract;
- callback consistency with zero unresolved actions;
- dependency/runtime preflight after clean `npm ci`;
- `npm audit --audit-level=high` with zero vulnerabilities;
- all JavaScript syntax through a parallel full-surface check;
- residual optional source invariant scripts.

The canonical serial source-preflight command reached the sequential syntax sweep and then hit the execution time limit. It did not print a final PASS line; the remaining work was verified separately.

Not verified:

- live Telegram UX;
- Vercel/Neon/Upstash runtime;
- remote staging acceptance;
- real-user comprehension.

## Next

**STEP586B — Home, Menu and Role Navigation Contract.**
