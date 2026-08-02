# STEP590F — Rollout Runbook

## Preconditions

- local package version is `1.3.31`;
- STEP590E6 is present;
- worktree is clean or intentionally contains only STEP590F overlay changes.

## Apply

Use exactly one delivery channel: HOTFIX overlay or Git PATCH. Do not apply both.

## Required local gates

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:queries-repository-decomposition
npm.cmd run smoke:queries-compatibility-facade-contract
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected:

```text
package 1.3.32
328/328 compatibility exports
9 repositories
critical spine 6/6 PASS
preflight:source PASS
```

## Commit

```powershell
git add -A
git commit -m "refactor: decompose queries repository behind compatibility facade"
git push origin main
```

## Deployment evidence

Confirm Vercel deployment `Ready`, `/api/health` normal shape, webhook import success and no `does not provide an export named` or module-resolution errors. File movement does not require destructive production mutations.

## Rollback

Revert the single STEP590F commit or restore the STEP590E6 full artifact. No DB rollback is required because there are no migrations or data mutations in this step.
