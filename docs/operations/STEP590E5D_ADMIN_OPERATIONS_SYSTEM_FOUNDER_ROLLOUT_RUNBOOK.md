# STEP590E5D Rollout Runbook

## Apply

Apply the HOTFIX over the **final STEP590E5C source tree**. At artifact time, an operator commit/push for STEP590E5C was not evidenced, so do not apply this HOTFIX directly over STEP590E5B commit `fe20572`.

Do not combine HOTFIX and PATCH.

## Local gate

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:package-lock
npm.cmd run test:admin-operations-system-founder-domain-extraction
npm.cmd run smoke:admin-operations-system-founder-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
git diff --check
git status --short
```

Expected ownership: 464 extracted / 96 legacy / 7 aliases / 0 unresolved.

## Bounded Telegram smoke

Use read-only paths unless disposable operational data is available:

1. Open Admin Home, Operations and System screens.
2. Open invite visibility and one list page.
3. Open Hard-skip home/hits/search without unskipping a real user.
4. Open Audit, search/reset and Metrics with 7/14/30/90-day controls; export is read-only.
5. Open QStash status. Run ping only when the configured target is disposable and enqueue evidence is expected.
6. Open Founder controls. Do not toggle/reset/edit deadline/prices/credits/links/texts unless explicitly using disposable runtime overrides.
7. Confirm the user-facing `a:founder` flow and payment-owned `a:off_buy*` actions remain reachable through their existing owners.

## Rollback

`git revert <STEP590E5D_COMMIT>`; no schema or ENV rollback is required. Preserve operational/audit evidence created after deployment.
