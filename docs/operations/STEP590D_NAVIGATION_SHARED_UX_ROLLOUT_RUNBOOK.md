# STEP590D — Production Rollout Runbook

## Preconditions

- exact STEP590C4 source baseline or verified STEP590D HOTFIX installer baseline;
- clean local QA with real dependencies;
- no unresolved callback ownership;
- no SQL or ENV change is required.

## Local QA

```powershell
npm.cmd ci
npm.cmd run test:navigation-shared-ux-extraction
npm.cmd run smoke:navigation-shared-ux-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run smoke:start-role-gate-contract
npm.cmd run smoke:home-menu-role-navigation-contract
npm.cmd run test:critical-spine
npm.cmd run preflight:source
```

Expected core evidence:

```text
navigation/shared UX: 93 PASS
callback ownership:   2462 PASS
extracted owners:       67
legacy owners:          493
unresolved:                0
critical spine:          6/6 PASS
```

## Safe production canary

1. Open Home.
2. Open Menu.
3. Switch Creator → Brand and back.
4. For an authorized manager, open Brand Manager mode; for an unauthorized account, verify the denial screen.
5. For a curator account, open Curator mode and return.
6. Open Quick Start/Guide in creator and brand modes.
7. Trigger a service/admin receipt with `Понятно`; verify that admin receipts retain Menu/Support while ordinary service messages lose their buttons.
8. Open Menu from a service message through `a:menu_push` and verify it opens in a new message.
9. Open one old message using `a:home_hub` or another legacy alias and verify canonical routing.
10. Confirm normal Home/Menu navigation after the canary.

## Log rejection markers

```text
unknown_callback
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
navigation_shared.missing_dependency
navigation_shared.unreachable_action
telegram_ux_shared.missing_dependency
telegram_ux_shared.unreachable_action
menu_push_failed
```

## Rollback

Code rollback to exact STEP590C4 is safe because STEP590D has no schema or durable business-state migration. Preserve any production logs demonstrating alias or navigation failures before rollback.
