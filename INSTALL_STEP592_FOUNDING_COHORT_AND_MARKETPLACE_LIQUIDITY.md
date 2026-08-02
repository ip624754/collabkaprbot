# INSTALL — STEP592 Founding Cohort and Marketplace Liquidity

## Baseline

- Required parent commit: `d0c2f10e328d3e1464649831bcbf67840e875703`
- Required parent package: `1.3.39`
- Result package: `1.3.40`
- Apply exactly one artifact: PATCH or HOTFIX. Do not apply both.

## Apply HOTFIX

```powershell
cd C:\GitHub\collabkaprbot
git status --short
git rev-parse HEAD
git rev-parse origin/main
Expand-Archive -Path "C:\PATH\collabkaprbot_HOTFIX_STEP592_FOUNDING_COHORT_AND_MARKETPLACE_LIQUIDITY.zip" -DestinationPath "C:\GitHub\collabkaprbot" -Force
```

## Apply PATCH

```powershell
cd C:\GitHub\collabkaprbot
git apply --check "C:\PATH\STEP592.patch"
git apply "C:\PATH\STEP592.patch"
```

## Required QA

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run test:step592-founding-cohort
npm.cmd run smoke:step592-founding-cohort-contract
npm.cmd run smoke:step592-founding-cohort-esm-linkage-contract
npm.cmd run check:step592-launch-readiness
npm.cmd run check:architecture-gates
npm.cmd run test:architecture-gates
npm.cmd run smoke:architecture-gates-contract
npm.cmd run test:admin-web-client-decomposition
npm.cmd run test:critical-spine
npm.cmd run preflight:source
npm.cmd run check:function-budget
git diff --check
```

## Commit

```powershell
git add -A
git commit -m "feat: add founding cohort liquidity workspace"
git push origin main
```

## Production acceptance

After Vercel is Ready:

```powershell
curl.exe -i "https://collabkaprbot.vercel.app/api/health"
```

Open `https://collabkaprbot.vercel.app/admin/users` in a founder session and run the bounded control-plane canary:

1. Save owner label, cadence and a future next-review date.
2. Add one existing creator with a connected channel as `candidate`.
3. Refresh and verify the candidate persists.
4. Remove that candidate.
5. Refresh and verify removal persists while the user profile and offers remain unchanged.

This canary must not send Telegram messages, change payments or publish offers.
