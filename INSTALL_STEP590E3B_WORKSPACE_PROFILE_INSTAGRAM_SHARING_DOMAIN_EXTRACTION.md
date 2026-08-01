# Install STEP590E3B — Workspace Profile, Instagram & Sharing Domain Extraction

## Baseline

Apply to the exact STEP590E3A repository state. Use one method only: HOTFIX overlay or Git PATCH.

## Recommended overlay

Extract `collabkaprbot_STEP590E3B_WORKSPACE_PROFILE_INSTAGRAM_SHARING_HOTFIX.zip` directly into the repository root with overwrite enabled.

## Local QA

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
git diff --check
```

Expected ownership: `275 extracted / 285 legacy / 7 aliases / 0 unresolved`.

## Commit

```powershell
git add -A
git commit -m "refactor: extract workspace profile and social domain"
git push origin main
```

No migration, ENV or manual Vercel configuration is required.
