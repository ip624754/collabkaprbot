# STEP590 — Modular Monolith Architecture Program

**Baseline:** STEP588X7H1
**Program mode:** HEAVY, bounded deployable extraction
**Primary objective:** reduce callback, DB and job concentration without changing product behavior.

## Preconditions

- STEP588X7H1 source baseline is the extraction anchor.
- H1 production auth callback should be accepted before deploying structural runtime changes.
- Migrations 048 and 049 must be known/applied before the corresponding production canaries.
- STEP589 feature expansion remains HOLD during critical router/domain extraction unless explicitly separated.

## Sequence

| Step | Scope | Runtime change | Expected risk | Exit gate |
|---|---|---|---:|---|
| STEP590A | Architecture baseline, ownership inventories, dependency rules | None | 9/20 | Reproducible map and approved sequence |
| STEP590B | Executable callback router and ownership registry | Yes, behavior-preserving | 15/20 | Every action has one owner/alias; real dispatch tests PASS |
| STEP590C1 | Admin-auth route registration extraction | Yes, behavior-preserving | 14/20 | H1 route remains reachable; auth suite PASS |
| STEP590C2 | Payment callback extraction | Yes, critical | 18/20 | Payment semantics and X1 suite unchanged |
| STEP590C3 | Giveaway callback extraction | Yes, critical | 17/20 | Manual/cron atomic draw contract unchanged |
| STEP590C4 | Broadcast callback extraction | Yes, critical | 17/20 | Unknown-state/no-resend contract unchanged |
| STEP590D | Navigation and shared Telegram UX | Yes | 12/20 | Copy/key/action parity and degraded-mode navigation PASS |
| STEP590E1 | Applications and leads | Yes | 13/20 | Application/deal/dialog lifecycle contracts PASS |
| STEP590E2 | Barter | Yes | 14/20 | Offer/thread/report lifecycle parity PASS |
| STEP590E3 | Workspaces and directory | Yes | 14/20 | Roles/contact unlock/folder contracts PASS |
| STEP590E4 | Brands and curation | Yes | 13/20 | Profile/directory/curator contracts PASS |
| STEP590E5 | Admin and moderation | Yes | 15/20 | Privilege and audit contracts PASS |
| STEP590E6 | Support, verification, sharing and account | Yes | 12/20 | Input-mode and recovery contracts PASS |
| STEP590F | `queries.js` repository decomposition with façade | Yes, behavior-preserving | 16/20 | Export/signature/SQL parity; no transaction drift |
| STEP590G | Cron/job decomposition | Yes | 16/20 | Lock/budget/receipt parity; function budget unchanged |
| STEP590H | Admin-web client decomposition | Yes, UI parity | 11/20 | One asset, route/state/view parity, browser acceptance |
| STEP590I | Architecture gates | Tooling | 10/20 | Gates block duplicate ownership/cycles/forbidden imports |
| STEP590J | Legacy façade and dead-code retirement | Yes | 14/20 | No legacy consumers; complete regression and production canary |

## Program rules

- one bounded domain per implementation STEP;
- no framework migration;
- no ORM migration;
- no TypeScript migration within STEP590;
- no callback-key rename unless handled as a separate compatibility STEP;
- no product copy redesign during extraction;
- no new money/auth/delivery core;
- no long-lived branch containing multiple unaccepted extractions;
- every STEP produces PATCH, FULL, changed-files, QA and handoff artifacts.

## Acceptance spine

Every runtime extraction runs at minimum:

```text
npm ci
npm run actions:check
npm run callbacks:check
npm run test:critical-spine
npm run preflight:source
```

Plus domain-specific executable dispatch tests and artifact parity.

## Rollback strategy

Each extraction must remain deployable and reversible at its own commit/artifact boundary. Compatibility delegation is retained until the moved domain passes source, portable and production evidence. Security/financial state changes continue to use fix-forward where an old runtime would violate a newer state-machine contract.

## Program completion

STEP590 does not claim completion from smaller files alone. Completion requires explicit ownership, executable routing, preserved critical invariants, bounded dependency direction and removal of the legacy central dispatch/DB ownership only after all consumers are migrated.
