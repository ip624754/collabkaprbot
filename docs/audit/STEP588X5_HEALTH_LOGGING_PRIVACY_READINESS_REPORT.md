# STEP588X5 — Health, Logging Privacy & Readiness Truth

**Mode:** HEAVY / CRITICAL
**Risk Score:** 15/20
**Parent:** STEP588X4
**Status:** SOURCE READY / PRODUCTION CANARY PENDING

## Findings remediated

1. Public health exposed internal OPS, QStash, broadcast, payment and object-level data.
2. `system_status=NO_GO` could still return HTTP 200 with `ok=true`.
3. Health did not prove PostgreSQL connectivity.
4. Webhook logs emitted Telegram IDs, usernames, message fragments and callback payloads.
5. Bot middleware/trace records emitted raw actor/chat identity.

## Implementation

- default health is an allowlisted public readiness response;
- explicit liveness is process-only;
- full diagnostics require an existing admin-web session;
- readiness probes PostgreSQL and Redis;
- HTTP status and `ok` derive from the same GO/NO_GO result;
- protected diagnostics receive a second redaction pass;
- centralized log privacy helpers produce pseudonymous refs and sanitized errors;
- webhook, middleware and selected critical error logs no longer emit raw Telegram identity or payloads;
- Pino adds defense-in-depth redaction for nested sensitive field names.

## Truth boundary

Verified locally: source contracts, pure privacy/readiness behavior, runtime degraded readiness/liveness smoke, syntax and regression gates.

Not verified: production Neon/Upstash result, live admin-cookie diagnostics, Vercel log output, external monitor behavior and production traffic.

## Local verification

- health/privacy executable policy: 52 assertions PASS;
- registered source checks: 130/130 PASS in four bounded batches;
- JavaScript syntax: 257/257 PASS;
- dependency/runtime preflight: PASS;
- action registry: 560/560, no drift;
- callback registry: 554 source refs, 560 keys, 0 unresolved;
- migration pack: 49 rows, no drift;
- Vercel function budget: 11/12;
- npm audit: 0 vulnerabilities;
- `git diff --check`: PASS.

The monolithic `preflight:source` process exceeded the available execution window, so the same registered 130 checks were executed in four bounded batches. A fresh `npm ci` was attempted but terminated by the environment timeout; dependency/runtime preflight used the unchanged STEP588X4 lock-compatible dependency tree.

## Residual risks

- protected diagnostics depend on the existing Redis-backed admin session; during a Redis outage public readiness remains available, but full diagnostics cannot authenticate until Redis recovers;
- pseudonymous references are stable only when `LOG_PII_HASH_KEY` or a fallback secret is configured; without a key the logger emits the non-identifying marker `present`;
- legacy direct `console.*` calls outside the webhook/update and selected critical paths remain a bounded STEP588X6/observability cleanup concern and must not receive new raw identity fields;
- production Vercel logs and external monitor behavior are not proven locally.
