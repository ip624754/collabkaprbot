# STEP588X4 — Admin Web Auth Challenge Binding & Throttling

**Date:** 2026-07-20
**Mode:** HEAVY / CRITICAL
**Risk score:** 19/20
**Parent baseline:** STEP588X3
**Status:** SOURCE READY / DEPLOYMENT AND PRODUCTION AUTH CANARY PENDING

## 1. Objective

Remove transferable admin-session minting capabilities from the web login flow and make challenge approval, session exchange and fallback verification bounded, browser-bound and atomic.

The required security contract is:

```text
origin browser verifier
+ actual allowlisted Telegram callback actor
+ atomic approved → consumed transition
= one versioned admin session
```

Possession of a challenge ID, old approval URL or forwarded Telegram message alone must not mint a session.

## 2. Previous defects

The previous flow had four coupled weaknesses:

1. Telegram approval was a signed web URL, so the backend trusted the actor embedded in the URL instead of the Telegram account that clicked it.
2. An approved challenge ID was not bound to the browser that initiated the login.
3. approval and session issuance used separate Redis reads/writes, allowing replay and race windows.
4. the six-digit fallback code used non-cryptographic generation and had no dedicated attempt counter, lockout or throttle.

`ADMIN_WEB_IDLE_TIMEOUT_SEC` was also displayed as policy but not enforced when sessions were read.

## 3. Browser binding

`createLoginChallenge(req, res)` creates a 256-bit random verifier and stores only an HMAC of:

```text
browser:<challenge_id>:<verifier>
```

The verifier is set in an HttpOnly, Secure, SameSite=Strict cookie with the same bounded lifetime as the challenge.

All status, fallback verification and session exchange operations recompute the HMAC and reject a missing or mismatched verifier. A challenge ID copied to another browser is therefore insufficient.

## 4. Telegram identity proof

Approval and denial now use Telegram `callback_data`:

```text
a:aw_auth_dec|c:<challenge_id>|d:a|d
```

The callback handler passes `ctx.from.id` to the auth service. Redis accepts the transition only when that actual actor belongs to the configured approver set.

The legacy `action=decision` web route remains explicit but returns `410 Gone` and performs no mutation. Link scanners and forwarded web URLs cannot approve a challenge.

## 5. Atomic challenge state machine

Redis Lua owns the critical transitions:

```text
pending → approved | denied
approved → consumed + session SET
pending → approved by fallback code
```

The session SET and challenge transition to `consumed` execute in the same Redis script. A concurrent or repeated exchange can only recover the already-pinned session ID. It cannot mint a second session.

Storage errors are fail-closed and do not fall back to non-atomic GET/SET behavior.

## 6. Session version and idle enforcement

New sessions contain:

```text
authVersion = 2
```

`getSession()` deletes and rejects records without the current version. This invalidates all pre-STEP588X4 sessions on rollout without relying on a manual cleanup operation.

The configured idle timeout is now enforced from `lastSeenAt`/`issuedAt`. Expired or idle sessions are deleted and the browser cookie is cleared by the auth boundary.

The existing absolute session TTL and founder `revoke_all` control remain in force.

## 7. Fallback-code policy

The break-glass code is:

- disabled by default through `ADMIN_WEB_FALLBACK_CODE_ENABLED=0`;
- generated with `crypto.randomInt`;
- stored only as a challenge-bound HMAC;
- usable only from the origin browser;
- attributed to an explicit `ADMIN_WEB_FALLBACK_ACTOR_TG_ID` that must be an approver;
- disclosed only to that explicit fallback actor;
- limited by an atomic per-challenge attempt counter and lockout;
- protected by a dedicated IP/challenge Redis rate limit.

Enabling fallback without a valid actor fails environment validation.

## 8. Dedicated throttling

Two fail-closed Redis Lua counters are introduced:

- login challenge start rate limit;
- fallback-code verification rate limit.

Each counter sets its TTL atomically on the first increment. Redis/throttle unavailability returns HTTP 503 and stops the auth flow.

The per-challenge code attempt counter is independent of the network throttle, so distributed IP rotation cannot bypass the maximum-attempt lockout.

## 9. Web flow

The browser flow is now:

```text
POST start
→ poll read-only GET status
→ POST exchange after approved
→ session cookie
```

`GET status` never issues a session. Every state-changing web action is POST-only.

The login UI only renders the fallback-code form when the server explicitly reports that fallback is enabled.

## 10. Schema and deployment

No PostgreSQL migration is required.

Redis challenge/session records are ephemeral. Old challenges lack browser binding and cannot be exchanged. Old sessions lack `authVersion=2` and are rejected automatically.

## 11. Verified locally

- 48 executable auth policy assertions PASS, covering callback authorization, approve/deny races, browser mismatch, fallback actor stability, attempts/lockout, consumed replay and idle expiry;
- auth source contract PASS for browser binding, callback identity, non-mutating legacy GET, atomic Lua transitions, session versioning, crypto fallback and fail-closed rate limiting;
- payment regression: 66 assertions PASS;
- giveaway regression: 55 assertions PASS;
- broadcast regression: 35 assertions PASS;
- 128/128 registered source checks PASS in one final invocation;
- 253/253 JavaScript files pass `node --check`;
- dependency/runtime preflight PASS after clean `npm ci`;
- npm audit reports 0 vulnerabilities;
- callback registry: 554 refs, 560 keys, 0 unresolved;
- action registry: 560 code actions, 560 registry actions, no drift;
- migration pack: 49 rows, no drift;
- Vercel function budget remains 11/12.

## 12. Not verified

- live Telegram callback identity and callback acknowledgement;
- actual Upstash Lua execution and concurrent exchange in production;
- production cookie behavior across the configured Vercel domain;
- live fallback lockout or dedicated rate limiting;
- real browser idle expiry;
- production session invalidation after deployment;
- public admin-web exposure and current value of `ADMIN_WEB_ENABLED`;
- STEP588X1–X3 production acceptance and STEP586H1 observation unless supplied separately.

## 13. Residual risks

- admin audit durability remains Redis-only and is tracked separately by STEP588X findings;
- public health/logging privacy is intentionally deferred to STEP588X5;
- Origin/CSRF hardening for future sensitive backoffice mutations remains governed by R-24;
- raw IP and user-agent visibility in the approval message remains subject to the STEP588X5 privacy review.

## 14. Exit gate

The source exit gate is met when the full QA matrix passes:

```text
A challenge ID, old approval URL or forwarded Telegram message alone cannot mint an admin session.
```

Production exit remains open until controlled origin-browser, second-browser, callback-replay, session-version and idle-expiry evidence is preserved.
