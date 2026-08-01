# STEP590E5A QA Checklist

```powershell
cd C:\GitHub\collabkaprbot
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:moderation-reports-verification-domain-extraction
npm.cmd run smoke:moderation-reports-verification-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected: package 1.3.27; 369 extracted; 191 legacy; 7 aliases; 0 unresolved.
