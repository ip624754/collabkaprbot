# INSTALL — STEP590G2 QStash Broadcast Delivery Worker Decomposition

## Baseline

- Repository: `github.com/ip624754/collabkaprbot`
- Branch: `main`
- Required operator baseline: `2fb27008e7f70ed194923df687dd68e6845f2521`
- Required package before apply: `1.3.34`
- Target package after apply: `1.3.35`
- Production alias: `https://collabkaprbot.vercel.app`

## Scope

`api/qstash/broadcast-deliver.js` becomes a thin compatibility route. The existing URL, default export and `bodyParser: false` contract remain unchanged. Runtime implementation moves to:

```text
src/jobs/broadcastDelivery/
├── cooldown.js
├── dbOverload.js
├── delivery.js
├── hardSkip.js
├── index.js
├── payload.js
├── quarantine.js
└── receipt.js
```

No SQL, migration, ENV, callback, Telegram copy, API route or Vercel function-count change is included.

## Apply exactly one artifact

### PATCH

```powershell
cd C:\GitHub\collabkaprbot

git status --short
git rev-parse HEAD
git rev-parse origin/main

git apply --check "C:\PATH\STEP590G2.patch"
git apply "C:\PATH\STEP590G2.patch"
```

### HOTFIX ZIP

Extract the ZIP over the repository root and allow file replacement. Do not apply PATCH after HOTFIX.

## Operator QA

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:qstash-broadcast-delivery-worker-decomposition
npm.cmd run smoke:qstash-broadcast-delivery-compatibility-handler-contract
npm.cmd run smoke:qstash-broadcast-delivery-esm-linkage-contract
node .\scripts\test-broadcast-overload-invariants.js
npm.cmd run smoke:broadcast-local-db-fuse
npm.cmd run smoke:broadcast-delivery-unknown-state-contract
node .\scripts\smoke-broadcast-429-atomicity-contract.js
npm.cmd run test:broadcast-delivery-unknown-critical
npm.cmd run test:cron-tick-decomposition
npm.cmd run test:queries-repository-decomposition
npm.cmd run test:critical-spine
npm.cmd run preflight:source
npm.cmd run check:function-budget
git diff --check
```

Expected source result:

```text
Package: 1.3.35
G2 decomposition: PASS
Compatibility handler: PASS
Real ESM route graph: PASS
Critical spine: 6/6 PASS
Function budget: 11, unchanged
```

## Commit and push

```powershell
git add -A
git commit -m "refactor: decompose qstash broadcast delivery worker"
git push origin main

git status --short
git rev-parse HEAD
git rev-parse origin/main
```

## Production boundary check

After Vercel reports Ready:

```powershell
curl.exe -i `
  -X POST `
  "https://collabkaprbot.vercel.app/api/qstash/broadcast-deliver" `
  -H "content-type: application/json" `
  -d "{}"
```

Expected without an Upstash signature:

```text
HTTP 401
{"ok":false,"error":"signature_missing"}
```

This proves the production route and ESM graph load and that the signature boundary remains fail-closed. It does not prove signed delivery execution.

## Bounded signed no-send canary

Use the existing QStash control plane to publish one payload with a deliberately nonexistent `broadcastId`. The target response must be `200` with `skipped: "broadcast_missing"`. This path performs no Telegram send. Record the QStash message ID and delivery result from the Upstash console or existing operator status surface.

Do not use a real active broadcast or recipient for the first G2 canary.

## Rollback

No migration or ENV rollback is required. Revert the G2 commit or restore the STEP590G1 baseline commit:

```text
2fb27008e7f70ed194923df687dd68e6845f2521
```
