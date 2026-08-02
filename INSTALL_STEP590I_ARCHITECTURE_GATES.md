# INSTALL — STEP590I Architecture Gates

## Baseline

- accepted production commit: `0defa47`
- package: `1.3.37`
- STEP590H: production accepted

## Apply

Apply either the HOTFIX ZIP or the PATCH, never both.

## Verify

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:architecture-gates
npm.cmd run test:architecture-gates
npm.cmd run smoke:architecture-gates-contract
npm.cmd run test:critical-spine
npm.cmd run preflight:source
npm.cmd run check:function-budget
git diff --check
```

## Commit

```powershell
git add -A
git commit -m "test: enforce step590 architecture boundaries"
git push origin main
```

STEP590I changes source/CI enforcement only. No production runtime canary is required beyond deployment readiness and existing health/browser smoke because runtime handlers and frontend implementation are unchanged.
