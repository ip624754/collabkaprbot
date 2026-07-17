# STEP583 — Runtime Proof Spine Report

## Status

IMPLEMENTED / LOCAL BOUNDED PROOF PASS.

## Objective

Add a deterministic runtime-proof spine for four high-risk seams without contacting production services:

1. Telegram webhook authentication and dispatch;
2. one representative callback update through the webhook boundary;
3. Redis-down degradation and bounded in-memory rate limiting;
4. QStash delivery acknowledgement and breadcrumb convergence after a transient Redis failure.

## Implementation

- Added `scripts/smoke-runtime-proof-spine.js`.
- Added `npm run smoke:runtime-proof-spine`.
- Added test-only dependency seams to `api/webhook.js` and `api/qstash/ping.js`.
- Test seams are hard-blocked unless `NODE_ENV=test`.
- Production defaults and request behavior remain unchanged.

## Verified locally

- unauthorized webhook request returns 401;
- authorized callback update reaches `bot.handleUpdate`;
- bot initialization is performed once for the bounded proof;
- simulated Redis failure activates the memory fallback;
- fallback remains bounded and blocks the third request for a limit of two;
- QStash signature boundary is exercised through the endpoint;
- first delivery remains acknowledged while Redis breadcrumbs fail best-effort;
- repeated delivery converges once Redis writes recover;
- three operational breadcrumbs are persisted in the recovered attempt.

## Truth boundary

This is a local deterministic runtime proof using injected test doubles. It does not prove:

- Vercel deployment health;
- real Telegram delivery;
- real Upstash Redis connectivity;
- real QStash signature keys, publish delivery, or platform retry timing;
- Neon connectivity;
- production callback UX traversal.

Those require a controlled staging or production operator run.

## Security notes

The dependency hooks cannot be activated in normal runtime because they throw unless `NODE_ENV=test`. No bypass is added to webhook authentication or QStash signature handling.

## Next recommended STEP

STEP584 — Staging Runtime Acceptance Pack: operator-safe commands and evidence template for real Vercel webhook, Redis, QStash and one Telegram callback traversal.
