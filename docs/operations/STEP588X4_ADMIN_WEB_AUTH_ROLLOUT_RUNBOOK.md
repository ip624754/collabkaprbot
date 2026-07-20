# STEP588X4 — Admin Web Auth Challenge Binding & Throttling Rollout Runbook

**Policy:** deploy source, then run a controlled two-browser canary. No database migration is required.

## 1. Pre-deploy evidence

Record:

- current Vercel deployment ID;
- repository commit and tree;
- current `ADMIN_WEB_ENABLED` scope without exposing its value or secret content in screenshots;
- configured approver IDs count, not the IDs themselves;
- current session TTL and idle timeout;
- whether fallback code is enabled.

Do not place `ADMIN_WEB_SECRET`, `ADMIN_WEB_SESSION_SECRET`, bot token, Redis token or fallback code into artifacts.

## 2. Required environment policy

Recommended production values:

```text
ADMIN_WEB_ENABLED=1                  # only when the surface is intentionally public
ADMIN_WEB_FALLBACK_CODE_ENABLED=0   # default and preferred
ADMIN_WEB_CODE_MAX_ATTEMPTS=5
ADMIN_WEB_START_RATE_LIMIT=8
ADMIN_WEB_START_RATE_WINDOW_SEC=300
ADMIN_WEB_CODE_RATE_LIMIT=10
ADMIN_WEB_CODE_RATE_WINDOW_SEC=300
```

When break-glass fallback is intentionally enabled:

```text
ADMIN_WEB_FALLBACK_CODE_ENABLED=1
ADMIN_WEB_FALLBACK_ACTOR_TG_ID=<one explicit allowlisted approver>
```

The actor must also be present in `ADMIN_WEB_APPROVER_TG_IDS` or the effective super-admin fallback list. Environment validation must fail otherwise.

## 3. Deploy

Deploy STEP588X4 runtime. No SQL is applied.

Immediately verify:

- login page renders;
- admin auth endpoint is reachable;
- bot webhook remains healthy;
- action/callback registry errors are absent;
- Redis is available;
- existing pre-X4 browser session is rejected and returns to login.

The last check proves `authVersion=2` invalidation.

## 4. Origin-browser login canary

In Browser A:

1. open the admin login page;
2. enter the admin web secret;
3. preserve the displayed challenge prefix only;
4. approve using the Telegram callback from an allowlisted approver;
5. allow Browser A to poll status and POST exchange.

Expected:

- Telegram button is callback-based, not a web URL;
- approval message identifies the actual callback actor in audit;
- Browser A receives one session;
- `GET status` alone never creates a session;
- the challenge becomes `consumed` after exchange.

## 5. Forwarding / Browser B negative canary

Before Browser A exchanges, copy only the challenge ID or admin login URL to Browser B.

Expected:

- Browser B has no verifier cookie;
- status/exchange returns `browser_verifier_missing` or `browser_binding_mismatch`;
- Browser B receives no admin session;
- Browser A can still complete the login.

Do not copy the HttpOnly cookie through browser developer tools; that is equivalent to stealing browser credentials and outside the challenge-ID threat model.

## 6. Approval replay and race canary

Use the same Telegram message:

1. approve once;
2. press approve/deny again or trigger a duplicate callback update;
3. submit exchange twice from Browser A.

Expected:

- only the first pending decision changes state;
- later decisions return not pending;
- both valid exchange attempts resolve to the same session ID/server record;
- no second session is minted.

## 7. Legacy link-scanner check

Request the former `action=decision` endpoint with harmless dummy parameters.

Expected:

- HTTP 410;
- no challenge mutation;
- no session cookie.

## 8. Fallback-code canary

Preferred production state is disabled.

When a controlled preview/staging test is approved:

1. enable fallback with one explicit actor;
2. start a challenge in Browser A;
3. confirm only that actor receives the code;
4. enter wrong codes up to the configured maximum;
5. verify lockout;
6. verify the correct code cannot bypass the lock;
7. start a fresh challenge and verify a correct code works only in Browser A;
8. disable fallback again.

Never perform brute-force testing against production.

## 9. Rate-limit canary

Use preview/staging or bounded operator requests.

Expected:

- start limit returns HTTP 429 with `Retry-After`;
- code limit returns HTTP 429;
- Redis unavailability returns HTTP 503 and creates no challenge/session;
- per-challenge attempt lock remains authoritative across IP changes.

## 10. Idle-timeout canary

Use a short, controlled preview idle timeout within allowed configuration bounds.

Expected:

- active use refreshes `lastSeenAt`;
- a session idle beyond the configured threshold is rejected;
- the stale Redis session is deleted;
- the browser session cookie is cleared on the next auth boundary.

Restore the intended production value after the test.

## 11. Rollback

No database rollback is required.

Runtime rollback to STEP588X3 would restore the transferable signed-link model and accept old unversioned sessions. Therefore rollback is security-regressive and must not be used as a normal recovery action.

Preferred policy:

```text
fix-forward
or temporarily set ADMIN_WEB_ENABLED=0
```

If an emergency disable is required, keep Telegram admin surfaces available and preserve incident evidence.

## 12. Acceptance evidence

Preserve only redacted evidence:

- Vercel deployment ID;
- origin-browser success;
- second-browser rejection;
- actual Telegram callback actor authorization;
- replay/parallel decision result;
- one-session exchange result;
- old-session invalidation result;
- idle-expiry result;
- fallback disabled state or controlled fallback test;
- rate-limit behavior.

Only then mark STEP588X4 `PRODUCTION ACCEPTED`.
