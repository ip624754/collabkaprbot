# STEP590F — queries.js Repository Decomposition with Compatibility Façade

## Decision

`src/db/queries.js` remains the only supported application-facing import surface. Its implementation is decomposed into nine bounded repository modules under `src/db/repositories/`.

The step is structural and behavior-preserving. No SQL statement, public function signature, transaction boundary, return shape, migration, ENV key, callback key, route or visible product copy is intentionally changed.

## Repository map

| Repository | Public exports | Primary ownership |
|---|---:|---|
| `usersRepository.js` | 30 | users, analytics, admin user directory, credits, contact unlock, retry credits |
| `workspacesRepository.js` | 32 | workspaces, settings, curators, workspace/global audit |
| `giveawaysRepository.js` | 34 | giveaways, sponsors, entries, winners, worker reads |
| `bartersRepository.js` | 48 | barter offers, threads, moderation, plans, CRM stages |
| `monetizationRepository.js` | 32 | matching, featured, official posts, payments, team unlock |
| `brandsRepository.js` | 34 | brand directory/profile/team, verification, folders/editors |
| `applicationsRepository.js` | 46 | verified barter joins, brand leads, applications, deals, matrix search |
| `broadcastsRepository.js` | 43 | broadcast creation, recipients, delivery state, atomic draw/cron guards |
| `socialRepository.js` | 29 | Instagram OAuth, invite/referral/reward and support-thread persistence |

Total public compatibility exports: **328**.

## Compatibility façade

`src/db/queries.js` contains explicit named re-exports only. Existing namespace and named imports remain unchanged:

```js
import * as db from '../db/queries.js';
import { listUsersDirectory } from '../../db/queries.js';
```

Application code is prohibited from importing repository implementation files directly. Cross-repository calls are limited to explicit internal imports inside `src/db/repositories/`.

## Exact parity mechanism

`docs/architecture/STEP590F_QUERY_EXPORT_MANIFEST.json` records:

- the canonical 328-name public export set and order;
- repository ownership for every export;
- the SHA-256 of the complete pre-split query implementation body;
- the only internal cross-repository helper exports.

`test:queries-repository-decomposition` reconstructs the moved body from repository markers and verifies the recorded SHA-256. This proves exact preservation of function bodies, SQL text, transaction statements and signatures across the move.

## Internal dependency edges

Only these pre-existing cross-section calls became explicit imports:

- Giveaways → Broadcasts: `drawAndFinalizeGiveawayWinnersAtomic`;
- Barters → Users: retry-credit helpers;
- Brands → Monetization: missing-relation classifier;
- Applications → Barters: barter meta compatibility and owner list;
- Broadcasts → Users: admin user directory audience selection;
- Social → Workspaces/Brands: invite activation profile checks.

No repository imports the compatibility façade, preventing façade cycles.

## Operator boundary

Source and portable execution prove structural parity. Production acceptance still requires operator dependency installation/audit, Git commit/push, Vercel Ready and normal runtime health evidence. No mutation canary is required solely for file movement unless deployment evidence reveals a runtime import problem.
