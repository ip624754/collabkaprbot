# STEP500A — Web Admin Hobby-safe API collapse

## Goal
Collapse the STEP499 web-admin API surface under the Vercel Hobby 12-function cap without changing visible `/admin` UX, auth semantics, or page IA.

## Problem confirmed
Hobby deploy failed after build with `No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`. STEP499 added twelve split `/api/admin-web/*` functions on top of the pre-existing bot/health/qstash/webhook functions, so the deployment exceeded the cap even though build itself succeeded.

## What changed
- `api/admin-web-auth.js` now dispatches `start`, `status`, `verify_code`, `me`, `logout`, `revoke_all`, and Telegram `decision`.
- `api/admin-web-read.js` now dispatches `overview`, `users`, `user`, and `runtime`.
- `api/admin-web-write.js` now dispatches `set_note` and `clear_note`.
- Legacy split `api/admin-web/**` route files were removed from `api/`.
- `scripts/admin-web.js` now calls the aggregated handlers with `action=` / `section=` query contracts.
- Function-budget check is now source-gated in preflight.

## Invariants preserved
- `/admin` pages and client-side navigation remain unchanged.
- Login flow remains shared secret → Telegram approve / OTP → secure session cookie.
- Read-first shell remains snapshot-only: no polling, no cron dependency.
- Safe writes remain limited to admin note set/clear.

## Acceptance
- deployable API entrypoints stay at or below 12 on Hobby;
- `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/runtime` continue to work against the collapsed handlers;
- Telegram approve links continue to approve/deny login challenges;
- source smoke + function-budget checks pass.
