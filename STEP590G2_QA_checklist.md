# STEP590G2 QA Checklist

## Baseline and scope

- [x] Baseline is STEP590G1 production-accepted commit `2fb27008e7f70ed194923df687dd68e6845f2521`.
- [x] Package changes only from `1.3.34` to `1.3.35`.
- [x] Existing API route remains `api/qstash/broadcast-deliver.js`.
- [x] New API routes: 0.
- [x] New ENV: 0.
- [x] New migrations/SQL: 0.
- [x] Function-budget delta: 0.
- [x] Telegram copy and callback-key delta: 0.

## Architecture

- [x] Route is a thin compatibility handler.
- [x] `bodyParser: false` remains on the route.
- [x] Seven bounded implementation modules exist under `src/jobs/broadcastDelivery/`.
- [x] Module ownership manifest exists and hashes match.
- [x] Existing tests read bounded implementation through a canonical source reader.
- [x] `preflight.js` syntax-checks the new `src/jobs/` tree.

## Critical invariants

- [x] QStash signature verification remains before payload processing.
- [x] Raw-body parsing and payload limit remain.
- [x] Local DB fuse remains before Redis fuse and DB access.
- [x] `Retry-After` and `Upstash-Retry-After` remain.
- [x] Cooldown republish, deduplication and flow-control remain.
- [x] Hard-skip and hit accounting remain.
- [x] 429 quarantine and atomic distinct-user counting remain.
- [x] DB claim guard remains `claimBroadcastDelivery(..., 60)`.
- [x] Telegram sent/blocked/failed/unknown receipts remain.
- [x] Unknown outcomes retain `automatic_resend: false`.
- [x] Top-level crash digest remains deduplicated.

## Executed QA

- [x] G2 decomposition test: 108 assertions PASS.
- [x] Compatibility handler contract: PASS.
- [x] Real ESM route graph, config and 405 guard: PASS.
- [x] Broadcast overload invariants: PASS.
- [x] Local DB fuse contract: PASS.
- [x] 429 atomicity contract: PASS.
- [x] Unknown-state source contract: PASS.
- [x] Unknown-state critical executable tests: 35 assertions PASS.
- [x] STEP590G1 regression: 162 assertions PASS.
- [x] STEP590F repository regression: 271 assertions PASS.
- [x] Portable critical spine: 6/6 PASS.
- [x] `preflight:source`: PASS.
- [x] Package-lock consistency: PASS.
- [x] Function budget: 11/12, unchanged.
- [x] `git diff --check`: PASS.

## Not verified in artifact environment

- [ ] Clean real `npm ci` because the internal package mirror returned 404 for `xtend@4.0.2`.
- [ ] Real `npm audit`.
- [ ] Operator commit/push.
- [ ] Vercel deployment Ready.
- [ ] Production unsigned signature-boundary response.
- [ ] Signed QStash no-send canary.
- [ ] Real Telegram receipt persistence in production.

## Acceptance

- Source acceptance: PASS.
- Production acceptance: PENDING operator evidence.
