# STEP567 — Support Threads Foundation

## Summary
This STEP adds a narrow persisted `support_threads` foundation underneath the existing Telegram-native Collabka support UX.

It does **not** introduce a broad helpdesk redesign. User-side support stays the same: the user writes to the bot, support receives the ticket in Telegram, and operators reply from Telegram. What changes is the truth layer underneath: support now has a real persisted thread entity with states and timestamps.

## Goal
Lay the first runtime foundation for the hybrid support model:
- keep current human-friendly UX
- add persisted support thread truth
- bind a support ticket to the first support-chat message
- track operator reply direction/state

## Scope
Included:
- new migration `047_support_threads.sql`
- persisted `support_threads` truth with statuses:
  - `open`
  - `waiting_operator`
  - `waiting_user`
  - `closed`
- support intake integration for text and media
- support header now includes `Thread #id`
- support reply buttons carry the thread id when available
- operator support reply / quick reply now update thread state
- explicit support admin callback handlers restored in runtime:
  - `a:adm_support_reply`
  - `a:adm_support_qr`
  - `a:adm_support_reply_cancel`
- source smoke for the foundation contract

## Out of scope
Not included:
- support admin read surface
- buckets / queues / dashboards
- forum topic routing redesign
- support close/reopen UX polish
- SLA, assignment, ownership matrix
- web support console
- bulk support actions

## Runtime contract
### User-side
- user opens `💬 Поддержка`
- user sends text or media
- bot forwards/support-copies the ticket as before
- thread is opened or touched under the hood

### Operator-side
- support item still arrives in Telegram
- operator can still use quick replies or free reply
- those actions now also update persisted thread truth

### Thread status meaning
- new user support message → `waiting_operator`
- operator reply / quick reply → `waiting_user`
- quick reply `done` → `closed`

## Files changed
- `migrations/047_support_threads.sql`
- `src/db/queries.js`
- `src/bot/bot.js`
- `scripts/smoke-support-threads-foundation-contract.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_STEP567.md`

## QA
Source checks run:
- `node --check src/db/queries.js`
- `node --check src/bot/bot.js`
- `node scripts/smoke-support-threads-foundation-contract.js`
- `node scripts/actions-registry-check.js`

Known baseline note:
- the broad callback consistency checker still reports older unrelated callback drift outside this step’s support scope. This STEP does not claim that wider drift is fully resolved.

## Risk
Medium-low.

The step touches support intake and operator reply callbacks, but keeps the existing UX and does not rewrite delivery/chat routing.

## Result
Hybrid support foundation is now present in runtime:
- current support UX preserved
- persisted thread truth added underneath
- ready for the next step: operator read surface
