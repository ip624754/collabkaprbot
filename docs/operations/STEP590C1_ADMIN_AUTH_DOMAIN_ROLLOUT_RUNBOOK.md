# STEP590C1 — Production Rollout Runbook

## Preconditions

- deploy only over exact STEP590B;
- no SQL migration is required;
- no ENV change is required;
- keep `ADMIN_WEB_FALLBACK_CODE_ENABLED=0` in production unless a separately approved break-glass procedure is active.

## Deployment

1. Deploy the STEP590C1 artifact.
2. Record the Vercel deployment ID and source commit/tree.
3. Confirm `/api/health?mode=liveness` returns HTTP 200.
4. Confirm `/api/health` returns an honest readiness result.

## Canary A — browser-bound challenge

1. Open the admin-web login page in Browser A.
2. Start a new challenge; do not reuse an old Telegram message.
3. Press Approve in Telegram using the designated approver account.
4. Confirm Browser A exchanges the challenge and opens the admin interface.
5. Repeat with Deny using a new challenge.

Expected log sequence:

```text
webhook.in action=a:aw_auth_dec
update.in action=a:aw_auth_dec
update.ok
webhook.ok
```

Must not appear:

```text
unknown_callback
callback.error
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
```

## Canary B — admin-web login operator control

1. Open Telegram Admin → System.
2. Note the current `Web login` state.
3. Toggle `a:admin_web_login_toggle` once.
4. Confirm the system screen renders the inverse state.
5. Toggle it back to the required production state.
6. Confirm a non-super-admin cannot mutate the control.

Expected invariants:

- callback is acknowledged once;
- control ID is `admin_web_login`;
- operator audit actor matches the real Telegram admin;
- note remains `telegram_admin`;
- no legacy/unknown callback is emitted.

## Rollback

No persistent schema changed. If a verified STEP590C1-only regression occurs, rollback to exact STEP590B is possible. Do not rollback merely because an old challenge button is stale; create a new challenge first.
