# STEP588X7H1 — Admin Auth Callback Routing Hotfix

**Date:** 2026-07-20
**Mode:** HEAVY / security hotfix
**Risk Score:** 13/20
**Baseline:** STEP588X7 FULL

## Incident evidence

Production logs showed:

```text
action=a:aw_auth_dec
→ webhook.in
→ update.in
→ unknown_callback
→ stale-button recovery UX
```

The Telegram callback was valid and registered, but the runtime callback router did not own the handler.

## Root cause

The STEP588X4 approval branch was present in `src/bot/bot.js`, but it had been inserted inside the `bot.on('message')` setup-forward handler rather than the `bot.on('callback_query:data')` path.

Consequences:

- `a:aw_auth_dec` always fell through to `unknown_callback`;
- loose source tests passed because they only searched for the action string anywhere in `bot.js`;
- the setup-forward handler contained a latent reference to undefined `p` after a valid forwarded channel post.

## Fix

- added `src/bot/adminWebAuthCallback.js` as the executable callback boundary;
- callback router invokes it after Redis guard and before application-user hydration;
- actual Telegram actor remains `ctx.from.id`;
- canonical Redis auth transition remains `approveChallengeFromTelegram()`;
- malformed, expired, already-used and unauthorized callbacks return bounded feedback;
- successful callbacks remove the inline keyboard and acknowledge exactly once;
- removed the misplaced branch from setup-forward flow;
- strengthened executable and source wiring tests.

## Security properties preserved

- browser-bound verifier is unchanged;
- Telegram callback actor is unchanged;
- atomic Redis approval transition is unchanged;
- fallback code posture is unchanged;
- critical `update_id` replay receipt remains active;
- no signed approval URL was restored.

## Verification

Verified locally:

- admin auth executable policy: 63 assertions PASS;
- admin auth binding and login contracts PASS;
- portable critical spine 6/6 PASS;
- callback registry: 554 refs / 560 keys / 0 unresolved;
- action registry: 560/560;
- dependency/runtime preflight PASS;
- remaining source checks after the monolithic timeout PASS in bounded continuation;
- JavaScript syntax and artifact parity are part of final packaging QA.

Not verified locally:

- deployed Vercel runtime;
- live Telegram approve/deny callback;
- browser status polling and session exchange after deployment;
- production Upstash state.

## Decision

This is a release-blocking regression for admin web access. Apply the hotfix before further admin acceptance. No migration or ENV change is required.
