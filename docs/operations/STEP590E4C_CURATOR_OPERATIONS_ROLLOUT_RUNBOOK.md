
# STEP590E4C Rollout Runbook

## Apply

Use the HOTFIX ZIP over the operator-pushed STEP590E4B repository baseline `e738784`. Do not combine HOTFIX and PATCH.

## Local gate

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:curator-operations-domain-extraction
npm.cmd run smoke:curator-operations-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

## Bounded Telegram smoke

1. Open curator cabinet and inbox.
2. Open one assigned Workspace and one giveaway.
3. Open statistics/log read paths.
4. Open checked confirmation and cancel once; perform mutation only on disposable evidence if approved.
5. Open note input and cancel; do not submit sensitive content.
6. From owner Workspace settings, open curator management/list.
7. Generate a disposable invite and confirm share button opens.
8. Open removal confirmation and cancel; remove only a disposable curator if explicitly approved.

## Rollback

Revert the single STEP590E4C commit. No migration or ENV rollback exists. Preserve durable audit/role changes created after deployment.
