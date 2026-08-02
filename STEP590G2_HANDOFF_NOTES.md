# STEP590G2 Handoff Notes

## Canonical baseline

- Commit: `2fb27008e7f70ed194923df687dd68e6845f2521`
- Package: `1.3.34`
- Verdict: `PRODUCTION_ACCEPT_STEP590G1_CRON_TICK_DECOMPOSITION_WITH_COMPATIBILITY_FACADE`

## Current source result

- Package: `1.3.35`
- `api/qstash/broadcast-deliver.js`: 923 lines → 7-line compatibility route.
- Runtime implementation: `src/jobs/broadcastDelivery/`.
- API URL, default handler and raw-body config unchanged.
- SQL, ENV, migrations, callbacks, Telegram copy and function count unchanged.

## Preserved critical semantics

- QStash signature verification and raw-body parsing;
- retry/dedup/flow-control and Retry-After;
- Redis/local DB overload fuse;
- cooldown and hard-skip;
- 429 quarantine and atomic distinct-user count;
- DB claim and no stale automatic resend;
- Telegram sent/rejected/unknown receipt persistence;
- `automatic_resend: false` for ambiguous outcomes.

## QA

- G2: 108 assertions PASS.
- Real ESM route linkage: PASS.
- Broadcast safety contracts: PASS.
- Critical spine: 6/6 PASS.
- Source preflight: PASS.
- Function budget: 11, unchanged.

## Truth Boundary

- VERIFIED: source implementation and artifact QA above.
- NOT VERIFIED: real dependency install/audit, commit/push, Vercel deployment and signed production QStash execution.

## Next step

Do not begin STEP590G3 until G2 production acceptance.

Expected next approval after acceptance:

```text
APPROVE STEP590G3_MONETIZATION_AND_OFFICIAL_PUBLISH_WORKER_DECOMPOSITION
```
