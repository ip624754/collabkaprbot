# Install STEP590E4A — Brand Directory & Profile Domain Extraction

## Baseline

Apply only on STEP590E3C commit `858a0b1` or a byte-equivalent checkout with a clean worktree.

## Recommended installation

Extract `collabkaprbot_STEP590E4A_BRAND_DIRECTORY_PROFILE_HOTFIX.zip` directly into:

```text
C:\GitHub\collabkaprbot
```

Confirm replacement of existing files. Do not apply the PATCH and HOTFIX together. The FULL ZIP is for clean recovery/copy, not overlay installation.

## Required local gate

```powershell
cd C:\GitHub\collabkaprbot
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:brands-directory-profile-domain-extraction
npm.cmd run smoke:brands-directory-profile-domain-extraction-contract
npm.cmd run smoke:creator-app-local-context-contract
npm.cmd run smoke:creator-brands-home-open-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected ownership: `323 extracted / 237 legacy / 7 aliases / 0 unresolved`.

## Commit

```powershell
git add -A
git commit -m "refactor: extract brand directory and profile domain"
git push origin main
```

No migrations, ENV changes or manual Vercel settings are required.
