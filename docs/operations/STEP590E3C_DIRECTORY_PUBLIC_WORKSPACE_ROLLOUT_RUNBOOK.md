# STEP590E3C — Directory/Public Workspace Rollout Runbook

## Preconditions

- exact STEP590E3B_R2 repository state applied;
- clean worktree before overlay;
- Node 20+;
- no SQL or ENV action required.

## Local gate

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
total:      560
extracted:  285
legacy:     275
aliases:      7
unresolved:   0
```

## Deployment

Commit message:

```text
refactor: extract directory and public workspace domain
```

Push `main`; verify the Vercel Production deployment is built from the new exact commit and reaches `Ready`.

## Bounded read-only canary

1. Open creator search from a brand/Workspace context.
2. Open vertical and format filters; toggle one item and return.
3. Run search and page results if available.
4. Open one matched public Workspace and return.
5. Open an owner public-profile preview.
6. Open a public Workspace from an existing lead dialog in read-only mode.
7. Open the contact decision surface without spending credits.

PASS conditions:

- callbacks acknowledge and return correctly;
- no stale loop or unknown callback;
- brand-manager `ws:0` context remains correct;
- public contacts remain hidden before unlock;
- lead-context back navigation returns to the exact lead;
- no mutation or credit debit from read-only actions.

## Disposable monetization canary

Only with explicit operator intent and a safe Workspace/brand pair:

1. Record current credit balance and unlock state.
2. Trigger one contact unlock.
3. Verify one of the canonical outcomes:
   - owner path: no charge;
   - already unlocked: no charge;
   - insufficient credits: paywall and no charge;
   - queued: one retry/lock path;
   - successful: one durable debit/unlock and contacts revealed.
4. Re-click the same action and verify no second charge.
5. Verify the contact pack is sent at most once for the successful interaction.

## Reject markers

```text
unknown_callback
callback.error
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
directory_domain.missing_dependency
directory_domain.unreachable_search_action
directory_domain.unreachable_public_workspace_action
```

Also reject on:

- duplicate debit or unlock;
- contact reveal without unlock/owner/preview authority;
- foreign lead/workspace navigation;
- search state loss or cross-user state;
- Redis/QStash success with inconsistent durable DB truth.

## Rollback

Revert the exact STEP590E3C commit or promote the previous STEP590E3B_R2 deployment. Do not rewrite durable debit, unlock, retry or audit evidence. No migration/ENV rollback exists.
