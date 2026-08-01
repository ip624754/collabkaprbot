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
| STEP590B | Executable callback router and ownership registry | Implemented; production canary pending | 15/20 | 560/560 unique owners; executable reachability PASS |
| STEP590C1 | Admin-auth challenge and web-login control extraction | Implemented; production canary pending | 16/20 | Both phase-specific routes reachable; auth and ownership suites PASS |
| STEP590C2 | Payment callback extraction | Implemented; production canary pending | 17/20 | Payment semantics and X1 suite unchanged |
| STEP590C3 | Giveaway callback extraction | Implemented; production canary pending | 17/20 | Manual/cron atomic draw contract unchanged |
| STEP590C4 | Broadcast callback extraction | Implemented; production canary pending | 17/20 | Unknown-state/no-resend contract unchanged |
| STEP590D | Navigation and shared Telegram UX | Implemented; production canary pending | 16/20 | Copy/key/action parity and degraded-mode navigation PASS |
| STEP590E1 | Applications and leads | Production accepted | 17/20 | Deployment and representative application/deal/lead canary PASS |
| STEP590E2 | Barter | Operator accepted for roadmap progression; mutation canary waived | 18/20 | Deployment identity + read-only runtime markers PASS |
| STEP590E3A | Workspace control, roles and folders | Operator accepted for roadmap progression | 16/20 | Owner/editor/curator/folder contracts PASS |
| STEP590E3B | Workspace profile, Instagram and sharing | Operator local source acceptance PASS | 14/20 | Profile/share/IG route parity PASS |
| STEP590E3C | Directory search and public Workspace | Source implemented; operator dependency gate pending | 15/20 | Search/public/contact ownership parity PASS |
| STEP590E4A | Brand directory and profile | Operator source implementation committed/pushed | 14/20 | Directory/profile/payment-exclusion contracts PASS |
| STEP590E4B | Brand team and manager membership | Operator source implementation committed/pushed | 14/20 | Team membership and role-isolation contracts PASS |
| STEP590E4C | Curator operations | Source implemented; operator gate pending | 14/20 | Curator access/audit/lifecycle contracts PASS |
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



## Current program position — STEP590E4C

- STEP590A architecture baseline: complete;
- STEP590B executable router: deployed and operator canary accepted;
- STEP590C1 admin/auth extraction: source complete and operator-accepted bounded login flow;
- STEP590C2 payment extraction: source complete with bounded production callback evidence;
- STEP590C3 giveaway extraction: source complete; dedicated independent production evidence remains limited;
- STEP590C4 broadcast extraction: source complete; production broadcast canary remains separately evidenced by operator;
- STEP590D navigation/shared Telegram UX extraction: source complete; dedicated production navigation evidence remains separate;
- STEP590E1 applications/leads extraction: production deployed and operator canary accepted;
- STEP590E2 Barter extraction: operator accepted for roadmap progression; disposable mutation canary waived as residual risk;
- STEP590E3A Workspace control/folders extraction: operator accepted for roadmap progression;
- STEP590E3B Workspace profile/Instagram/sharing extraction: operator local source acceptance PASS;
- STEP590E3C Directory Search/Public Workspace extraction: operator commit `858a0b1` pushed to `main`;
- STEP590E4A Brand Directory/Profile extraction: operator commit `60f19ba` pushed to `main`;
- STEP590E4B Brand Team/Manager extraction: operator commit `e738784` pushed to `main`;
- STEP590E4C Curator Operations extraction: source implementation complete; operator dependency/deploy gate pending;
- extracted owner count: 359;
- legacy owner count: 201 and must continue to decrease monotonically;
- next bounded architecture step after acceptance: STEP590E5 Admin & Moderation;
- residual risk: broad capability injection remains a compatibility seam until STEP590F/STEP590I; registry-only aliases remain for STEP590J dead-code retirement.
