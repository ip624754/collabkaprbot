# STEP590G1 — Cron Tick Decomposition with Compatibility Façade

## Baseline

Apply only to the production-accepted STEP590F_R1 baseline:

- operator commit: `2226269`;
- package: `1.3.33`;
- `src/bot/cron.js`: 2,216 lines, SHA-256 `1a816d9035ebef1a67feae11d42bb11a6302c7b5f3370843427c1a2d28972c84`;
- `api/cron_router.js`: 114 lines, SHA-256 `f4de19f4ff6e2d7e25511bbd3518e589089ed98cbe3ad719586d9c6e36b0a95b`.

## Result

- package bumped to `1.3.34`;
- `src/bot/cron.js` is a 12-export compatibility façade;
- implementation moved into bounded modules under `src/bot/jobs/`;
- `api/cron_router.js` remains byte-identical;
- all four existing router jobs remain unchanged;
- no SQL, migration, ENV, API route, Telegram copy, callback key or Vercel function-count change.

## Bounded modules

```text
src/bot/jobs/
├── auditFlushJob.js
├── broadcastJob.js
├── cronRuntime.js
├── giveawayJob.js
├── index.js
└── instagramVerificationJob.js
```

## Preserved public exports

```text
auditFlushTick
broadcastTick
extractRetryAfterSec
getBroadcastCooldownUntilMs
getBroadcastHardSkipReason
giveawaysTick
igVerifyTick
logBroadcastHardSkipHit
normalizeBroadcastDeadChatReason
sendBroadcastMessage
setBroadcastCooldown
setBroadcastHardSkip
```

## Preserved router jobs

```text
broadcast-tick
giveaways-tick
ig-verify-tick
audit-flush-tick
```

## Operator commands

```powershell
cd C:\GitHub\collabkaprbot

npm.cmd ci
npm.cmd audit
npm.cmd run test:cron-tick-decomposition
npm.cmd run smoke:cron-compatibility-facade-contract
npm.cmd run smoke:cron-esm-linkage-contract
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check

git add -A
git commit -m "refactor: decompose cron ticks behind compatibility facade"
git push origin main
```

After Vercel reports Ready, verify the existing cron router contract and bounded production health for all four jobs. Do not start STEP590G2 until G1 production evidence is accepted.

## Rollback

Revert the STEP590G1 commit or restore the STEP590F_R1 source tree at commit `2226269`. No schema or ENV rollback is required.
