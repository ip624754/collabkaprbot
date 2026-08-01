# STEP590E3B — Workspace Profile/Instagram/Sharing Rollout Runbook

## 1. Apply

Apply either the STEP590E3B PATCH or HOTFIX overlay to the exact STEP590E3A repository state. Do not apply both.

## 2. Local gate

```powershell
cd C:\GitHub\collabkaprbot
npm ci
npm audit
npm run check:package-lock
npm run test:workspaces-control-folders-domain-extraction
npm run test:workspaces-profile-social-domain-extraction
npm run smoke:workspaces-profile-social-domain-extraction-contract
npm run callbacks:ownership
npm run callbacks:check
npm run actions:check
npm run test:critical-spine
npm run preflight:source
```

Required ownership result:

```text
registry:  560
extracted: 275
legacy:    285
aliases:     7
unresolved:  0
```

## 3. Git boundary

```powershell
git status --short
git diff --check
git add -A
git commit -m "refactor: extract workspace profile and social domain"
git push origin main
```

## 4. Deployment

Deploy the exact committed revision. Confirm Vercel reports the same branch and commit.

## 5. Bounded production smoke

Use one owned Workspace. Verify without paid actions:

- open Workspace profile;
- open mode, verticals, formats and structured contacts;
- open edit prompts and cancel without saving;
- open share menu and generate one short share message;
- open Instagram templates and generate one non-external template message;
- with OAuth UI disabled, confirm the existing unavailable screen remains unchanged;
- if OAuth UI is intentionally enabled, verify only the start/status screen unless Meta credentials and a disposable account are approved;
- profile reset confirmation cancel path leaves data unchanged;
- public Workspace/directory actions remain reachable through their existing legacy owners;
- no `callback_dispatch.missing_handler`, `callback_dispatch.extracted_handler_contract`, or `workspace_domain.*` runtime marker.

A destructive profile-reset production canary and live Meta OAuth completion are not required for roadmap progression unless explicitly approved.

## 6. Rollback

Promote the previous STEP590E3A deployment or revert the exact STEP590E3B commit. No SQL/ENV rollback is needed.
