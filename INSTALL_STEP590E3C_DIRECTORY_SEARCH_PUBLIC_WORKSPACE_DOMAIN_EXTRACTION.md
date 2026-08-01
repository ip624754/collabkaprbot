# Install STEP590E3C — Directory Search & Public Workspace Domain Extraction

## Baseline

Apply only on the exact STEP590E3B_R2 repository state, package `1.3.22`.

## Apply

Extract the HOTFIX ZIP into the repository root with overwrite enabled. Do not apply the PATCH and HOTFIX together. The FULL ZIP is for clean recovery/comparison, not an overlay.

## Local QA

```powershell
cd C:\GitHub\collabkaprbot

npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:directory-public-workspace-domain-extraction
npm.cmd run smoke:directory-public-workspace-domain-extraction-contract
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
560 total
285 extracted
275 legacy
7 aliases
0 unresolved
```

## Commit and deploy

```powershell
git add -A
git commit -m "refactor: extract directory and public workspace domain"
git push origin main
```

Verify the Vercel Production deployment is built from the new exact commit and reaches `Ready`.

## Persistent changes

None: no migration, ENV, API-route, callback-key, pricing or action-guard change.
