# STEP507 — Founder controls split

## Goal
Split founder-only controls from the normal operator shell inside web admin without adding risky writes or new function entrypoints.

## What changed
- added founder identity helpers in admin-web auth/session layer
- exposed `isFounder` in `/api/admin-web-auth?action=me`
- added founder-only `/admin/founder` route
- split sidebar into `Оператор` and `Founder`
- moved `revoke all web sessions` into founder-only surface
- kept all other dangerous controls bot-only

## Hobby-safe notes
- no new API function files
- founder page uses one read endpoint: `section=founder`
- no polling
- no cron dependency
- only one founder write stays: revoke all sessions
