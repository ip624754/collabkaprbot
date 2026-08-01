# STEP590E4B Rollout Runbook

1. Apply HOTFIX over STEP590E4A commit `60f19ba`.
2. Run `npm.cmd ci` and `npm.cmd audit`.
3. Run E4B executable/source tests, ownership, critical spine and source preflight.
4. Commit and push only after all local gates pass.
5. After Vercel Ready, use disposable accounts to verify manager mode, brand switching, team invitation, add/list/remove and removed-manager notification.
6. Reject on unknown callback, role expansion, duplicate membership, stale active-brand state or owner-only control exposure.
7. Roll back with `git revert <STEP590E4B_COMMIT>`; no DB rollback is required.
