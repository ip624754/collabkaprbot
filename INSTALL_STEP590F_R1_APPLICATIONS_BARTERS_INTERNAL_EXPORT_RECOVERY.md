# STEP590F_R1 — Applications/Barters Internal Export Recovery

## Baseline
Apply only after STEP590F package `1.3.32`.

## Recovery
- exports `isMissingBarterOffersMetaColumnError` from `bartersRepository.js` for internal repository use;
- keeps the public `queries.js` façade at 328 exports;
- adds named-import/export linkage validation to STEP590F QA;
- bumps package to `1.3.33`.

## Operator commands
```powershell
cd C:\GitHub\collabkaprbot
npm.cmd ci
npm.cmd audit
npm.cmd run test:queries-repository-decomposition
npm.cmd run smoke:queries-compatibility-facade-contract
npm.cmd run preflight:source
git diff --check

git add -A
git commit -m "fix: recover STEP590F repository ESM linkage"
git push origin main
```

After Vercel reports Ready, verify `/api/webhook` no longer returns `FUNCTION_INVOCATION_FAILED` and web-admin login loads.
