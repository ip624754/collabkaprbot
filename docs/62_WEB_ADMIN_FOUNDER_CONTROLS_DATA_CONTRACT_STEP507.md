# STEP507 — Founder controls data contract

## `section=founder`
Returns one founder-safe snapshot with:
- founder session identity
- auth/session policy
- founder sale snapshot
- control boundaries
- warnings
- hints
- recent founder audit
- lightweight cross-surface counts

## Security rules
- route is founder-only
- no secret values returned
- no raw env dump
- no dangerous writes except `revoke_all` through founder-only auth endpoint
