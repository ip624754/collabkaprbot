# STEP590E6 Rollout Runbook

## Baseline

Apply only after the complete STEP590E5D tree is present. Expected pre-install package version: `1.3.30`.

## Operator validation

```powershell
cd C:\GitHub\collabkaprbot

npm.cmd ci
npm.cmd audit

npm.cmd run check:package-lock
npm.cmd run test:user-services-domain-extraction
npm.cmd run smoke:user-services-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source

git diff --check
git status --short
```

Expected ownership: `482 extracted / 78 legacy / 7 aliases / 0 unresolved`, registry `560/560`.

## Bounded runtime smoke

1. Open Support and enter/cancel the write flow.
2. Open Verification home/info and select a kind only on a disposable/test profile.
3. Open Share, performance, points, link, history and rewards read paths.
4. Open account-delete confirmation and cancel; exercise actual tombstone/restore only on a disposable identity.
5. Confirm a deleted test identity can reach support and restore but no unrelated action.

Do not perform live reward redemption or account deletion unless disposable state is explicitly approved.
