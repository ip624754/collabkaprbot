# STEP590F Handoff Notes

- Baseline: STEP590E6 package `1.3.31`.
- Result: package `1.3.32`.
- `src/db/queries.js` is now a thin compatibility façade.
- Nine bounded repositories own all 328 public query exports.
- Exact moved-body SHA-256 parity proves SQL/signature/transaction preservation.
- Application imports remain unchanged and must continue through `queries.js`.
- Source preflight PASS; portable critical spine 6/6 PASS under temporary shims removed before packaging.
- Operator gates: clean `npm ci`, `npm audit`, commit/push, Vercel Ready and runtime import/health evidence.
- Next roadmap step: STEP590G cron/job decomposition.
