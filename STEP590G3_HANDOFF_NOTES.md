# STEP590G3 Handoff Notes

Canonical baseline: STEP590G2 production-accepted commit `e88ad931bf49c5bb9ebd55d134411d8aaf3a2e9a`, package `1.3.35`.

Current source: package `1.3.36`. QStash monetization retry, official publish deliver/verify and ping endpoints remain compatibility handlers. Worker implementations live under `src/jobs/monetizationRetry`, `src/jobs/officialPublish` and `src/jobs/qstashPing`.

No SQL, migration, ENV, route, callback, Telegram copy or function-count changes. PATCH/HOTFIX/FULL exact parity PASS across 1,064 files.

Operator must run clean npm install/audit, focused G3 QA, critical spine, source preflight, commit/push and production canaries. Artifact environment clean install is NOT VERIFIED because the internal mirror lacks `xtend@4.0.2`.

Do not begin STEP590H until `PRODUCTION_ACCEPT_STEP590G3_MONETIZATION_AND_OFFICIAL_PUBLISH_WORKERS_DECOMPOSITION`.
