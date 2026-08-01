# INSTALL — STEP590E3A Workspace Control, Roles & Folders Domain Extraction

## Baseline

Apply to the exact operator repository baseline:

```text
branch: main
commit: 117c3e8462d85e811a76beaf899f512ff7e3c84a
package before: 1.3.20
package after:  1.3.21
```

## Apply one artifact only

### PATCH

```powershell
cd C:\GitHub\collabkaprbot
git apply --check .\STEP590E3A_WORKSPACE_CONTROL_ROLES_AND_FOLDERS.patch
git apply .\STEP590E3A_WORKSPACE_CONTROL_ROLES_AND_FOLDERS.patch
```

### HOTFIX overlay

Extract the HOTFIX ZIP into `C:\GitHub\collabkaprbot` with overwrite enabled.

Do not apply PATCH and HOTFIX together.

## Required local QA

```powershell
cd C:\GitHub\collabkaprbot
npm ci
npm audit
npm run check:package-lock
npm run actions:check
npm run callbacks:check
npm run callbacks:ownership
npm run test:workspaces-control-folders-domain-extraction
npm run smoke:workspaces-control-folders-domain-extraction-contract
npm run test:critical-spine
npm run preflight:source
```

Expected ownership:

```text
560 total
248 extracted
312 legacy
7 aliases
0 unresolved
```

## Commit

```powershell
git status --short
git diff --check
git add -A
git commit -m "refactor: extract workspace control and folders domain"
git push origin main
```

## Truth boundary

Focused source QA is verified in the artifact environment. Complete dependency-bound preflight and portable critical spine require `npm ci` in the operator repository because the artifact environment did not have `node_modules`.
