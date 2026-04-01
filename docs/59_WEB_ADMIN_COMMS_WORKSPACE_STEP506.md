# STEP506 — Web Admin Comms / Notices workspace v1

## Goal
Add a read-only communications workspace to web admin so founder/operator can inspect notice drafts, recent broadcasts, outbox delivery signals, and comms warnings without introducing any dangerous write action.

## Scope
- New `/admin/comms` page in the web-admin shell.
- New `section=comms` in `api/admin-web-read.js`.
- Aggregated `getCommsSummary()` read model in `src/lib/adminWeb/readModels.js`.
- UI blocks:
  - overall comms status
  - warnings strip
  - recent notices table
  - outbox groups
  - hints block
- Overview receives a direct link into the comms workspace.

## Constraints
- Read-only only.
- No live send, no retries, no payment mutation, no founder-dangerous actions.
- One page load = one admin-web read endpoint.
- No polling, no cron dependency.
- Keep Vercel Hobby-safe 11-function surface.

## Acceptance
- `/admin/comms` renders inside the existing shell.
- `GET /api/admin-web-read?section=comms` returns a stable normalized snapshot.
- Notices/broadcast rows render safely even when tables are empty.
- Outbox groups are visible and founder-readable.
- Warnings/hints are present but do not become a giant alert center.
- No new write surface is introduced.
