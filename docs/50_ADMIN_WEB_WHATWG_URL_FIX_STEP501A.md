# STEP501A — Admin-web WHATWG URL fix

## Goal
Remove deprecated query parsing from the deployed admin-web handlers so Vercel logs no longer emit `DEP0169` for admin-web page/API access.

## What changed
- Added `getRequestUrl()` and `getSearchParam()` helpers in `src/lib/adminWeb/common.js`.
- Replaced `req.query` reads in collapsed handlers:
  - `api/admin-web-auth.js`
  - `api/admin-web-read.js`
  - `api/admin-web-write.js`
- Cleaned the same legacy pattern from the still-present split admin-web routes and from `api/health.js`.
- Added source smoke `scripts/smoke-admin-web-whatwg-url-contract.js` and wired it into preflight.

## Non-goals
- No auth/session flow changes.
- No shell UX changes.
- No new routes.
- No broad admin refactor.

## Acceptance
- `req.query` / `url.parse()` are absent from the admin-web deployed handlers.
- source smoke passes.
- source preflight passes.
- no change to visible admin-web behavior.
