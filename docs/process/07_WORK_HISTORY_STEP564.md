# STEP564 — Compact post-run report

## Summary
This step adds a compact post-run report to the Collabka broadcast layer without rewriting the current delivery/queue/outbox infrastructure.

## What was added
- post-run summary right after broadcast creation
- post-run summary inside broadcast detail view
- aggregated dominant reasons (top 3)
- explicit next-action hint
- explicit counters for:
  - sent
  - retry
  - skipped
  - failed

## Scope
Included:
- `src/bot/bot.js`
- `src/db/queries.js`
- `scripts/smoke-broadcast-post-run-report-contract.js`
- docs sync

Not included:
- no migrations
- no queue/retry redesign
- no quarantine UX
- no first-batch safety layer
- no broad comms rewrite

## Operator result
Operator can now open one broadcast card and immediately read:
- what was sent
- what is still retrying/pending
- what was skipped
- what failed
- what dominant reasons are visible now
- what the next action should be

## QA
Source-checked:
- `node --check src/db/queries.js`
- `node --check src/bot/bot.js`
- `node scripts/smoke-broadcast-post-run-report-contract.js`

Known pre-existing drift:
- generic callback consistency script still reports unresolved older admin outbox callback drift unrelated to STEP564

## Result
Compact post-run report added.
No migrations.
No queue/retry/runtime rewrite.
