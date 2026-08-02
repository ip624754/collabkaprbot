# STEP590G3 Work History — 2026-08-02

- Approved `STEP590G3_MONETIZATION_AND_OFFICIAL_PUBLISH_WORKERS_DECOMPOSITION`.
- Accepted STEP590G2 production baseline commit `e88ad931bf49c5bb9ebd55d134411d8aaf3a2e9a`.
- Converted four QStash endpoint files into compatibility handlers.
- Moved existing implementation bodies to bounded workers under `src/jobs/` without changing payment, retry, publish or signature semantics.
- Added manifest, focused decomposition test, compatibility-handler contract and real ESM 4-route linkage gate.
- Updated source contracts that previously assumed implementation lived directly in `api/qstash/*`.
- Package advanced to `1.3.36`; function budget remains 11.
- Clean npm install remains operator-side because artifact mirror returned `404 xtend@4.0.2`.
