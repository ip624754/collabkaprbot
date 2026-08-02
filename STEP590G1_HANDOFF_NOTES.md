# STEP590G1 Handoff Notes

- Canonical baseline: production-accepted STEP590F_R1, operator commit `2226269`, package `1.3.33`.
- Source result: package `1.3.34`.
- `src/bot/cron.js` is now a thin 12-export compatibility façade.
- Bounded implementations live under `src/bot/jobs/`: runtime, giveaway, broadcast, Instagram verification and audit flush.
- `api/cron_router.js` remains byte-identical and preserves all four job names.
- Exact moved-body hashes and executable contracts preserve Redis lock/TTL, giveaway transaction/advisory-lock, broadcast cooldown/hard-skip, retry classification and duplicate-alert suppression semantics.
- No SQL, migration, ENV, API route, callback key, Telegram copy or function-count change.
- Focused QA PASS; portable critical spine 6/6 PASS; `preflight:source` PASS under temporary execution-only shims removed before packaging.
- Operator gates: clean `npm ci`, `npm audit`, commit/push, Vercel Ready and bounded production cron-health evidence.
- Do not begin STEP590G2 until STEP590G1 production acceptance.
- Next planned step after G1 acceptance: STEP590G2 QStash Broadcast Delivery Worker Decomposition.
