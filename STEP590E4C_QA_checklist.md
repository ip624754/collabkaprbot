
# STEP590E4C QA Checklist

```powershell
cd C:\GitHub\collabkaprbot
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

Expected ownership:

```text
Registry: 560
Extracted: 359
Legacy: 201
Aliases: 7
Unresolved: 0
```

Expected changed scope: no deleted files, no migrations, no ENV changes and no API route changes.
