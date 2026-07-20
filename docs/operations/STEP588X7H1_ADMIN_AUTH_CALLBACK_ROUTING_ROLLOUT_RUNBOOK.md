# STEP588X7H1 — Admin Auth Callback Routing Rollout

## Deployment

1. Apply the HOTFIX only over the exact STEP588X7 baseline, or deploy the STEP588X7H1 FULL archive.
2. Do not run SQL migrations.
3. Do not change admin auth ENV values for this hotfix.
4. Deploy to Vercel.

## Live acceptance

1. Open admin web in Browser A and start a fresh login challenge.
2. In Telegram, press Approve once.
3. Confirm logs contain `action=a:aw_auth_dec` and do not contain `unknown_callback` for that update.
4. Confirm Telegram shows `Вход одобрен для исходного браузера.`
5. Confirm the approval buttons disappear.
6. Return to Browser A and confirm status/exchange completes and the admin session opens.
7. Start a second challenge and press Deny; confirm explicit deny feedback and no session issuance.
8. Re-press an old button; it may report already processed/expired, but must not route to generic stale-button recovery.

## Expected log boundary

```text
webhook.in action=a:aw_auth_dec
update.in action=a:aw_auth_dec
(no unknown_callback)
update.ok
webhook.ok
```

## Rollback

Rollback to STEP588X7 restores the routing defect. Prefer fix-forward. Emergency containment is `ADMIN_WEB_ENABLED=0` until the corrected deployment is ready.
