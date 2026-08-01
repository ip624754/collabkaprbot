# STEP590E5C Rollout Runbook

## Apply

Apply the HOTFIX over operator-pushed STEP590E5B commit `fe20572`. Do not combine HOTFIX and PATCH.

## Local gate

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:admin-communications-notices-outbox-domain-extraction
npm.cmd run smoke:admin-communications-notices-outbox-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected ownership: 433 extracted / 127 legacy / 7 aliases / 0 unresolved.

## Bounded Telegram smoke

1. Open Admin → Communications.
2. Open System Notice and return without publishing or clearing.
3. Open Personal Message Templates and one template; do not edit/delete/reset unless using disposable data.
4. Open Outbox and one entry; do not repeat-send a real message unless using a disposable account.
5. Confirm the user-facing active-notice button still opens `a:notice` normally.

## Rollback

`git revert <STEP590E5C_COMMIT>`; no schema or ENV rollback is required.
