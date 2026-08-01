# Install STEP590E4B

Apply the HOTFIX ZIP over the repository at STEP590E4A commit `60f19ba`. Do not combine HOTFIX and PATCH.

```powershell
cd C:\GitHub\collabkaprbot
npm.cmd ci
npm.cmd audit
npm.cmd run test:brand-team-manager-domain-extraction
npm.cmd run smoke:brand-team-manager-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected ownership: 336 extracted, 224 legacy, 7 aliases, 0 unresolved.
