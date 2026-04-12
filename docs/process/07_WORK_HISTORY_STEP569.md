# STEP569 — Support close/reopen + canned replies polish

## Summary
This step polishes the support thread operator flow without broadening scope into a helpdesk rewrite.

It adds:
- explicit close / reopen controls in the support thread card
- canned replies wired to the shared admin DM templates layer
- cleaner state-aware next action semantics for support threads

## Why
After STEP567 (support thread truth) and STEP568 (support operator read surface), the next highest-leverage gap was operator finishing/continuing logic inside a thread.

Operators needed:
- an explicit way to close a ticket
- an explicit way to reopen a closed ticket
- canned replies that stay aligned with the actual editable DM templates layer

## Scope
Included:
- support thread card actions for close / reopen
- support canned replies sourced from shared admin DM templates
- small wording polish around next action

Not included:
- web support console
- SLA / assignment / ownership
- forum topic routing
- bulk support actions
- user-side UX rewrite

## Files
- src/db/queries.js
- src/bot/bot.js
- src/bot/actionRegistry.js
- scripts/smoke-support-close-reopen-canned-contract.js
- docs/00_CURRENT_STATE.md
- docs/process/07_WORK_HISTORY_STEP569.md

## Acceptance
- support thread card shows close or reopen depending on current status
- quick reply labels come from shared DM templates
- quick reply sending still updates thread state correctly
- explicit close/reopen updates support thread state without breaking the existing reply-first flow

## QA
- node --check src/db/queries.js
- node --check src/bot/bot.js
- node scripts/smoke-support-close-reopen-canned-contract.js
- node scripts/actions-registry-check.js

## Result
Support operator flow is more complete and honest:
- operators can explicitly close/reopen
- canned replies are aligned with shared templates
- the support thread card better reflects the real lifecycle
