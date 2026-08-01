# STEP590E4A — Brand Directory/Profile Rollout Runbook

## Preconditions

- exact STEP590E3C commit `858a0b1` or byte-equivalent artifact applied;
- clean worktree before overlay;
- Node 20+;
- no SQL or ENV action required.

## Local gate

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

Expected ownership:

```text
total:      560
extracted:  323
legacy:     237
aliases:      7
unresolved:   0
```

## Deployment

Commit message:

```text
refactor: extract brand directory and profile domain
```

Push `main`; verify Vercel Production is built from the exact new commit and reaches `Ready`.

## Bounded read-only canary

1. Open Brand directory from creator flow.
2. Open filters, toggle/reset one bounded value and return.
3. Open one Brand card from the directory.
4. From an existing creator application, open its Brand card and return to the same application.
5. Open own Brand profile, Profile More, Brand Pass and Brand Plan information screens.
6. Open profile reset confirmation and cancel.

PASS conditions:

- callbacks acknowledge without stale spinners;
- directory filters preserve state and pagination;
- application local-return context is exact;
- no contact leak on public Brand surfaces;
- no profile mutation from read-only/cancel paths;
- no purchase callback is intercepted by the Brands domain.

## Disposable mutation canary

Only with a disposable/test Brand profile:

1. Change one non-sensitive profile field and read it back.
2. Toggle one bounded niche/collaboration/budget/goal/requirement value and restore it.
3. Confirm profile reset only on a disposable profile, then recreate/restore the test profile.
4. Verify audit/DB state is singular and no duplicate input-mode transition occurs.

## Reject markers

```text
unknown_callback
callback.error
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
brand_domain.missing_dependency
brand_domain.unreachable_directory_action
brand_domain.unreachable_profile_action
```

Also reject on cross-Brand editing, contact leakage, duplicate profile writes, payment interception or broken application return navigation.

## Rollback

Revert the exact STEP590E4A commit or promote the prior STEP590E3C deployment. Do not rewrite durable Brand profile changes created after deployment. No migration/ENV rollback exists.
