# STEP590E5B Rollout Runbook

## Apply

Apply the HOTFIX over the operator-pushed STEP590E5A baseline commit `acbe16d`. Do not combine HOTFIX and PATCH.

## Local gate

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:admin-users-support-moderator-governance-domain-extraction
npm.cmd run smoke:admin-users-support-moderator-governance-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected ownership: 407 extracted / 153 legacy / 7 aliases / 0 unresolved.

## Bounded Telegram smoke

1. Open Admin → Users and one user card.
2. Open note screen and cancel without mutation.
3. Open Support list and one thread; avoid sending a real reply unless using a disposable actor.
4. Open moderator list; do not remove a real moderator.
5. Open gift/revoke screens and cancel before confirmation.

## Rollback

`git revert <STEP590E5B_COMMIT>`; no schema or ENV rollback is required.
