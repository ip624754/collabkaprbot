# STEP590C3 — Giveaway Callback Domain Rollout Runbook

## Preconditions

- apply only to the exact STEP590C2 baseline or use the STEP590C3 FULL package;
- no SQL or ENV change belongs to this STEP;
- preserve the current production giveaway and winner evidence;
- do not draw winners on a real active promotion merely to test routing.

## Local gate

```powershell
npm.cmd ci
npm.cmd run test:giveaway-domain-extraction
npm.cmd run smoke:giveaway-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:giveaway-draw-critical
npm.cmd run test:critical-spine
npm.cmd run preflight:source
```

Expected:

```text
Giveaway domain:             119 PASS
Callback ownership:         2364 PASS
Extracted executable owners:  29
Legacy owners:                531
Unresolved callbacks:           0
Critical spine:               6/6 PASS
```

## Bounded production canary

Safe checks:

1. Open an active test giveaway as a participant and press `Участвовать`.
2. Press `Проверить`; confirm the eligibility screen completes or returns an honest blocker.
3. Open a giveaway owned by the operator and press `Завершить`; cancel at the confirmation screen unless mutation is explicitly approved.
4. For an already-ended test giveaway, press `Выбрать победителей`; cancel at the confirmation screen.
5. Open the winners view on a giveaway that already has durable winners.
6. Use access/recheck helper buttons on an operator-owned test giveaway.

A real `a:gw_draw_do` canary requires a disposable test giveaway with known participants and explicit approval.

## Log acceptance

Must not appear:

```text
unknown_callback
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
giveaway_domain.missing_dependency
giveaway_domain.unreachable_access_action
giveaway_domain.unreachable_participant_action
giveaway_domain.unreachable_lifecycle_action
manual giveaway draw failed
```

Expected callbacks complete with `update.ok` and webhook HTTP 200.

## Rollback

No schema or ENV rollback is needed. Code rollback to STEP590C2 is possible, but never delete, redraw or rewrite committed winner rows as part of rollback. Preserve giveaway audit and webhook evidence first.
