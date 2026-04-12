# STEP570 — Support follow-up context hotfix

## Summary
After an operator support reply, the user can now continue the same support thread by simply sending the next freeform message.

`💬 Поддержка` remains available as an explicit fallback entry, but is no longer required for the immediate follow-up after a support reply.

## What changed
- added user-side support follow-up context stored in Redis
- operator replies arm follow-up context for the target user
- next freeform user text auto-routes into the same support thread
- next freeform user media auto-routes into the same support thread
- menu/home navigation clears the follow-up context
- support write copy updated to explain the simpler behavior
- added DB helper to reopen/update thread truth on user follow-up

## Out of scope
- no support UI redesign
- no web helpdesk
- no SLA / assignment
- no topic routing changes
- no schema migration

## Acceptance
- operator reply arms follow-up context
- next user freeform message is routed to the same support thread
- support button remains as fallback
- menu/home exit the follow-up context
- text and media follow-ups are both supported

## QA
- source check for support follow-up helper and copy
- syntax check for bot/db files
- smoke script for follow-up contract

## Result
Narrow support UX hotfix shipped.
No migration required.
