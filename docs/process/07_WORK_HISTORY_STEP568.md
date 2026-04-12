# STEP568 — Support Operator Read Surface

## Summary
Implemented a narrow admin read surface for support on top of STEP567 support_threads foundation.

This step adds:
- support summary entrypoint in admin
- bucketed support readouts
- recent threads
- thread card with state truth and quick operator actions

It does not introduce a broad helpdesk subsystem.

## Why
STEP567 added persisted support thread truth, but operators still lacked a compact admin surface to:
- see what is waiting for operator
- see what is waiting for user
- open recent tickets quickly
- navigate by thread instead of only by forwarded support messages

## Scope
Included:
- `🆘 Поддержка` entry from admin surfaces
- support buckets:
  - open
  - waiting_operator
  - waiting_user
  - closed_recent
- recent threads list
- paged thread list by bucket
- thread detail card
- quick access to reply / quick replies / user card

Not included:
- SLA
- assignments
- forum/topic routing changes
- web helpdesk
- bulk support actions
- close/reopen policy polish beyond existing quick replies

## Files changed
- `src/db/queries.js`
- `src/bot/bot.js`
- `src/bot/actionRegistry.js`
- `scripts/smoke-support-operator-read-surface-contract.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_STEP568.md`

## Acceptance
- admin can open support summary from admin surfaces
- admin sees support buckets and recent threads
- admin can open a thread card
- thread card shows status/timestamps/summary/binding truth
- thread card exposes reply and quick reply actions
- existing human-friendly support flow remains intact

## QA
- `node --check src/db/queries.js`
- `node --check src/bot/bot.js`
- `node --check src/bot/actionRegistry.js`
- `node scripts/actions-registry-check.js`
- `node scripts/callback-consistency-check.js` (pre-existing broader drift may still exist outside this step)
- `node scripts/smoke-support-operator-read-surface-contract.js`

## Result
Support threads are now visible as an operator-first read surface in Telegram admin.
