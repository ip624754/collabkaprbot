# STEP590B — Callback Router Rollout Runbook

## Preconditions

- deploy from the exact STEP590B artifact;
- no migration is required;
- no ENV change is required;
- STEP588X7H1 admin-auth security configuration remains unchanged.

## Local gate

```bash
npm ci
npm run callbacks:ownership
npm run smoke:callback-router-ownership-contract
npm run actions:check
npm run callbacks:check
npm run test:critical-spine
npm run preflight:source
```

## Production canary

Use a founder/admin test account and non-commercial objects.

1. Start a fresh admin-web login challenge.
2. Press the Telegram approve callback.
3. Confirm no `unknown_callback` log and successful browser exchange.
4. Open giveaway access diagnostics through each exact action:
   - open;
   - recheck;
   - check self;
   - participant prompt.
5. Exercise representative legacy-owned callbacks:
   - Home/Menu;
   - workspace open;
   - brand profile;
   - support;
   - one read-only admin screen.
6. Press a deliberately stale/unregistered callback only in a controlled test message and confirm canonical stale-button recovery.

## Expected logs

Extracted route success must not produce:

```text
unknown_callback
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
```

## Rollback

STEP590B has no schema/state migration. Runtime rollback to STEP590A is structurally possible, but it also removes the unique-ownership gate. Prefer fix-forward for routing defects unless the callback surface is broadly unavailable.

## Acceptance evidence

Capture:

- Vercel deployment ID and commit/tree;
- admin-auth approve and browser exchange result;
- representative extracted-route results;
- representative legacy-route results;
- filtered logs showing no ownership/phase errors.
