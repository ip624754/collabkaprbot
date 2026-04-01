# STEP508 — Web Admin Comms usable v2

Date: 2026-04-02

## Goal
Turn `/admin/comms` from a read-only diagnostics page into a safe operator workspace for notice drafts, preview, and founder-only test sends, without introducing live mass-send from web.

## Scope
- keep the same hobby-safe collapsed API surface (`admin-web-read` + `admin-web-write`)
- keep the page one-read on load (`section=comms`)
- add draft create/update flows
- add inline preview
- add founder-only `test_send_notice`
- keep live send / retries / queue controls out of scope

## UX result
The page now provides:
- top summary cards for drafts / recent notices / outbox state / recent founder test sends
- warnings strip
- drafts list with quick-open into editor
- draft editor with explicit save
- preview card
- recent notices table
- outbox snapshot
- recent comms audit block

## Safety rules
- no polling
- no cron dependency
- no live send from web
- founder-only test send to the current founder Telegram session actor
- all draft writes and test sends append admin-web audit rows

## Storage note
To avoid a schema migration in STEP508, text-only web-admin drafts reuse `broadcasts.draft_caption` as a short internal label/title and `broadcasts.draft_text` as the message body.
