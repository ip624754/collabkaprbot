# STEP590E3A — Workspace Control/Folders Rollout Runbook

## 1. Apply

Apply either the PATCH or HOTFIX overlay to the exact `117c3e8` repository baseline. Do not apply both.

## 2. Local gate

```powershell
cd C:\GitHub\collabkaprbot
npm ci
npm audit
npm run check:package-lock
npm run test:workspaces-control-folders-domain-extraction
npm run smoke:workspaces-control-folders-domain-extraction-contract
npm run callbacks:ownership
npm run callbacks:check
npm run actions:check
npm run test:critical-spine
npm run preflight:source
```

Required ownership result:

```text
registry:  560
extracted: 248
legacy:    312
aliases:     7
unresolved:  0
```

## 3. Git boundary

```powershell
git status --short
git diff --check
git add -A
git commit -m "refactor: extract workspace control and folders domain"
git push origin main
```

## 4. Deployment

Deploy the exact committed revision. Confirm Vercel reports the same branch and commit.

## 5. Bounded production smoke

Use one owned Workspace and one disposable folder. Verify:

- Workspace list/open/settings/history;
- disconnect confirmation cancel path;
- network confirmation cancel path;
- folder list/open/create or rename on a disposable folder;
- editor list screen if enabled;
- foreign/unauthorized Workspace remains inaccessible;
- `a:ws_pro_buy` still opens the canonical payment path;
- no `callback_dispatch.missing_handler`, `callback_dispatch.extracted_handler_contract`, or `workspace_domain.*` runtime marker.

A destructive disconnect/delete production canary is not required for roadmap progression unless the operator explicitly chooses it.

## 6. Rollback

Promote the previous accepted deployment or revert the exact STEP590E3A commit. No SQL/ENV rollback is needed.
