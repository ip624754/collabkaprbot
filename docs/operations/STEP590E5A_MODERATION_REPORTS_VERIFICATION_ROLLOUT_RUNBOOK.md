# STEP590E5A Rollout Runbook

## Local gate

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:moderation-reports-verification-domain-extraction
npm.cmd run smoke:moderation-reports-verification-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected ownership: 369 extracted, 191 legacy, 7 aliases, 0 unresolved.

## Bounded production smoke

1. Open moderator home and report queue.
2. Open a disposable report.
3. Exercise only explicitly approved disposable freeze/close/resolve records.
4. Open verification queue and one disposable verification record.
5. Approve/reject only a disposable test account with explicit operator intent.
6. Confirm unauthorized/non-moderator actors cannot access protected flows.
7. Confirm no duplicate callback errors and audit records remain present.

## Rollback

Revert the STEP590E5A commit. Preserve durable moderation and verification mutations already accepted in production; do not blindly roll back DB truth.
