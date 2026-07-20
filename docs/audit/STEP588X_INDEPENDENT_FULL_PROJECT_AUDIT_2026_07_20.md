# STEP588X — Independent Full Project Audit

**Date:** 2026-07-20
**Mode:** HEAVY / independent read-only audit
**Parent baseline:** STEP588 — Backoffice Productization Audit & Architecture
**Baseline archive:** `collabkaprbot_STEP588_BACKOFFICE_PRODUCTIZATION_AUDIT_ARCHITECTURE_FULL.zip`
**Baseline SHA-256:** `fe86fd481e9d3751813796fcb2a4e0772676802a2ef1cf3d9777e2b1b0796a7a`
**Runtime code changed:** no
**Database/schema changed:** no
**Production changed:** no

## 1. Executive conclusion

Collabka is a strong founder-led production product with unusually mature governance, source contracts and operational documentation for its stage.

It is not release-clean.

The independent audit found **no confirmed P0 direct-compromise or proven fund-loss exploit**. It did confirm **eight P1 defect classes** across payment fulfillment, giveaway settlement, broadcast delivery and admin authentication. Several are crash-boundary or replay defects that static source checks do not exercise.

The correct status is:

> **STRONG PRODUCT / NOT RELEASE-CLEAN / P1 REMEDIATION REQUIRED**

Planned STEP589 backoffice feature work is paused. STEP587 Go/No-Go is also blocked until the P1 remediation chain and the pending STEP586H1 production observation are complete.

### Overall readiness

| Area | Score | Independent assessment |
|---|---:|---|
| Product depth | 9.0/10 | Coherent creator/brand lifecycle, monetization, invitations, giveaways, communications and operations |
| Telegram/product UX | 8.5/10 | Strong after STEP586A–H; live phone acceptance still pending |
| Source integrity | 9.0/10 | 233/233 syntax PASS, 121/121 source checks PASS, registries synchronized |
| Security boundaries | 7.0/10 | Strong webhook/cron/QStash gates; admin-login bearer challenge remains material |
| Financial correctness | 5.5/10 | Ledger/idempotency foundation exists, but direct fulfillment is not atomic with APPLIED state |
| Giveaway correctness | 5.0/10 | Intended atomic design exists, but auto-draw has a source-confirmed runtime defect and manual draw is non-atomic |
| Broadcast delivery safety | 6.0/10 | Good claim/retry machinery; sent-but-unmarked state can duplicate |
| Operations/observability | 7.0/10 | Broad health/OPS coverage; public health and readiness semantics need hardening |
| Behavioral QA | 5.0/10 | Excellent drift detection, weak crash/race/transaction execution coverage |
| Maintainability | 5.5/10 | Architecture is practical; domain concentration raises change cost |
| Documentation/governance | 9.0/10 | Strong STEP history, Truth Boundary and audit trail |
| **Overall** | **6.7/10** | Mature product foundation with release-blocking critical-path defects |

## 2. Truth Boundary

### Verified in this audit

- the supplied STEP588 archive hash and complete unpacked source tree;
- repository inventory and largest files;
- 233 JavaScript files pass `node --check`;
- 121 source-preflight commands pass when executed independently;
- callback registry and source callback contracts remain consistent;
- generated action registry and migration pack have no drift;
- optional admin rendering, broadcast overload and Instagram contact-leak invariant scripts pass;
- source-confirmed control flow for every finding in this report;
- authentication posture of all 11 deployed API entrypoints;
- schema/migration inventory and critical unique constraints visible in source.

### Not verified

- production execution of any exploit path;
- live Telegram, Vercel, Neon, Redis or QStash behavior;
- live Stars purchase or recovery;
- real giveaway draw against production data;
- real broadcast send/DB-mark failure;
- live admin-login attack simulation;
- dependency vulnerability status: `npm ci` did not complete in the audit environment;
- STEP586H1 24-hour production observation;
- remote STEP584/STEP586H acceptance evidence.

Statements below use three evidence classes:

- **SOURCE-CONFIRMED:** the defect follows directly from reachable source control flow;
- **RISK-CONFIRMED:** the unsafe state is reachable under a documented failure boundary, but live occurrence was not proven;
- **NOT VERIFIED LIVE:** no production exploit or incident claim is made.

## 3. Audit methodology

### 3.1 Repository inventory

| Metric | Value |
|---|---:|
| Total files | 621 |
| Documentation files | 280 |
| SQL migrations | 47 |
| JavaScript files in `api/src/scripts/migrations` | 233 |
| Deployed API entrypoints | 11 |
| Tables across migrations | 42 |
| Indexes across migrations | 102 |
| Vercel function budget | 11/12 |

Largest source concentrations:

| File | Size |
|---|---:|
| `src/bot/bot.js` | 1,756,730 bytes |
| `src/db/queries.js` | 314,355 bytes |
| `scripts/admin-web.js` | 257,506 bytes |
| `src/bot/cron.js` | 75,002 bytes |
| `src/lib/adminWeb/runtime.js` | 59,292 bytes |
| `src/lib/adminWeb/readModels.js` | 52,253 bytes |

### 3.2 Verification passes

- full JavaScript syntax sweep;
- source-preflight command decomposition and independent execution;
- generated artifact drift comparison;
- API authentication matrix review;
- payment lifecycle and fallback review;
- giveaway draw/claim/sponsor review;
- broadcast queue/delivery/retry review;
- admin-web auth/session/write/audit review;
- webhook, health, logging and configuration review;
- SQL mutation helper and transaction boundary review;
- test portfolio structure review;
- documentation/implementation claim reconciliation.

### 3.3 Test portfolio observation

Across 154 `smoke-*.js` and `test-*.js` files:

| Characteristic | Count |
|---|---:|
| Source files read directly | 144 |
| `.includes(...)`-style source assertions | 143 |
| Source-string-heavy tests | 139 |
| Tests importing runtime modules | 32 |
| Tests using mocks/stubs | 5 |

This portfolio is strong at detecting copy, callback and source-contract drift. It is weak at proving transaction, crash, race and external-side-effect behavior. The highest-severity findings below passed the existing 121 source checks.

## 4. What is strong

### 4.1 Authentication and external ingress

- Telegram webhook secret verification fails closed.
- Cron router uses Bearer secret and timing-safe comparison.
- QStash handlers verify signatures over the raw request body/canonical URL.
- Admin sessions use Secure, HttpOnly, SameSite=Strict cookies.
- Test seams are gated by `NODE_ENV=test`.

### 4.2 Database and serverless posture

- `PG_POOL_MAX=1` is appropriate for Vercel/Neon serverless use.
- STEP586H1 connection retry is bounded to connection/session initialization and does not replay user SQL.
- migrations are deterministic, checksum-tracked and applied per-file in transactions.
- critical payment ledger identifiers include unique Telegram/provider charge constraints.

### 4.3 Product mechanism work

- deal existence now requires acceptance evidence;
- invite/reward copy is aligned with the actual ledger windows and costs;
- paid products and entitlement targets are clearer;
- callback registry is mature: 559 keys, 553 references, zero unresolved;
- admin API is deliberately collapsed into three endpoints and does not introduce a second backend or ORM.

### 4.4 Governance

- STEP scope, artifacts, changed-file lists and handoffs are unusually disciplined;
- documentation explicitly separates verified from unverified claims;
- critical domains have many source guards;
- broad rewrites are consistently rejected.

## 5. P1 findings — release blockers

### F-001 — Automatic giveaway draw throws before winner selection

**Severity:** P1
**Evidence:** SOURCE-CONFIRMED
**Files:** `src/db/queries.js`
**Function:** `drawAndFinalizeGiveawayWinnersAtomic`

`txIsolation` and `snapshotTs` are declared inside the previous function, `drawWinnersDeterministic`, but are used inside `drawAndFinalizeGiveawayWinnersAtomic` without local declarations.

Because ES modules execute in strict mode, assignment to undeclared `snapshotTs` raises `ReferenceError`. The transaction rolls back before deterministic winner selection completes. Later reads of `txIsolation` are also unresolved.

**Impact**

- cron auto-draw can fail for an ended giveaway;
- winner selection and finalization do not complete;
- the existing atomicity design is not realized at runtime;
- source/syntax tests remain green because this is a runtime binding error.

**Required remediation**

- declare transaction metadata inside the atomic function;
- add an executable transaction test that reaches winner persistence;
- verify `eligible_topup`, audit metadata, idempotent repeat and lock contention;
- run one controlled staging draw before production acceptance.

### F-002 — Direct Stars fulfillment is not atomic with payment APPLIED state

**Severity:** P1
**Evidence:** RISK-CONFIRMED
**Files:** `src/bot/payments/starsHandlers.js`, `src/db/queries.js`

The direct successful-payment path:

1. inserts/loads payment;
2. claims it as `APPLYING`;
3. mutates entitlement, credits or creates a paid request;
4. marks the payment `APPLIED` later.

A process termination after step 3 and before step 4 leaves the payment `APPLYING`. The stale-claim path can reclaim it after the timeout and repeat the side effect.

Affected families include:

- brand credits;
- Brand Plan plus included credits;
- channel PRO;
- Founder products;
- matching requests;
- featured placements.

The fallback implementation already contains the safer pattern: row lock, fulfillment and APPLIED transition in one database transaction.

**Impact**

- duplicate credits or entitlement extension;
- duplicate paid service requests;
- payment ledger and applied product can diverge;
- manual reconciliation becomes ambiguous.

**Required remediation**

- one canonical atomic fulfillment service for direct and fallback paths;
- fulfillment records tied uniquely to `payment_id`;
- crash-boundary fault injection before/after each mutation;
- no whole-handler replay outside the database transaction.

### F-003 — Missing payment ledger fails open into fulfillment

**Severity:** P1
**Evidence:** SOURCE-CONFIRMED
**Files:** `src/db/queries.js`, `src/bot/payments/starsHandlers.js`

When the payments table is missing, `insertPayment()` returns a synthetic success-like result with `ledger: 'missing_table'`. The direct handler receives no `paymentId`, skips the claim gate and continues into fulfillment.

**Impact**

- duplicate Telegram retries can apply the same purchase more than once;
- the system performs a financial side effect while its exactly-once ledger is unavailable;
- rolling-upgrade fallback contradicts fail-closed financial invariants.

**Required remediation**

- payment ledger absence must be a hard NO-GO for fulfillment;
- emit one exact OPS event and user recovery message;
- retain provider charge evidence for later reconciliation;
- add a test proving no entitlement/credit mutation occurs when ledger storage is unavailable.

### F-004 — Matching and featured payment sessions are deleted before durable apply

**Severity:** P1
**Evidence:** SOURCE-CONFIRMED
**Files:** `src/bot/payments/starsHandlers.js`, payment recovery code

The direct matching/featured branches delete the Redis payment session before the database creation call completes. If the DB mutation fails, the paid request is not created and the recovery context is gone. The no-session fallback does not implement these product families.

**Impact**

- a successful charge can become unrecoverable by automated paths;
- support cannot deterministically reconstruct tier/duration from the deleted context;
- the user can pay without receiving the requested service.

**Required remediation**

- persist product parameters in the payment ledger before charging/apply;
- delete Redis session only after durable APPLIED commit;
- support matching/featured in canonical fallback using ledger data;
- add a unique `payment_id` relation to created paid-service rows.

### F-005 — Broadcast delivery can duplicate after send success and DB-mark failure

**Severity:** P1
**Evidence:** RISK-CONFIRMED
**Files:** `api/qstash/broadcast-deliver.js`, `src/db/queries.js`

The handler claims a delivery as `sending`, sends the Telegram message, retries the DB `sent` mark three times, then returns HTTP 200 even if all marks fail. The row remains `sending`. After the stale threshold, `claimBroadcastDelivery` can reclaim and send the same message again.

**Impact**

- duplicate broadcast message to the same user;
- support and delivery reports can disagree with Telegram reality;
- returning 200 prevents platform retry while internal state remains ambiguous.

**Required remediation**

- introduce terminal `sent_unconfirmed` / `delivery_unknown` state;
- never automatically resend an unknown-success delivery;
- reconcile via Telegram-side receipt where possible or manual operator workflow;
- add fault injection: send succeeds, every DB mark fails, stale claim must not resend.

### F-006 — Manual giveaway draw is non-atomic and differs from advertised mechanism

**Severity:** P1
**Evidence:** SOURCE-CONFIRMED
**Files:** `src/bot/bot.js`, `src/db/queries.js`

The manual draw path uses a Redis lock, deletes existing winners, inserts winners one by one, then separately updates giveaway status and writes audit data. It does not share the intended atomic SQL draw service.

The UI promises that if eligible participants are insufficient, remaining winner slots are filled from all participants. Manual logic falls back to all only when eligible count is zero. With one eligible participant and three requested winners, it selects one winner rather than topping up two slots.

**Impact**

- partial winner rows on failure;
- status/winners/audit mismatch;
- different results for manual and cron draw;
- copy/mechanism contradiction.

**Required remediation**

- one canonical atomic draw service for manual and cron callers;
- actor metadata as a parameter, not a separate implementation;
- deprecate delete-plus-loop `setWinners` path;
- make sponsor replacement transactional in the same domain hardening wave.

### F-007 — Admin login challenge is a transferable session-mint capability

**Severity:** P1
**Evidence:** SOURCE-CONFIRMED
**Files:** `src/lib/adminWeb/auth.js`, `src/lib/adminWeb/telegram.js`, `api/admin-web-auth.js`

The Telegram approval notification uses signed web URLs containing challenge, decision and actor. Approval is not a Telegram callback bound to the actual clicking Telegram account. Any holder of the signed URL can approve as the encoded actor.

After approval, `action=status` needs the challenge ID and can issue/reuse a session cookie. Challenge records store initiating IP/UA data but session issuance does not bind the exchange to the initiating browser. The approved challenge can therefore be forwarded or leaked and used as a bearer session-mint capability.

**Impact**

- forwarded approval URL can produce founder/operator access;
- challenge ID leakage after approval can mint a session in another browser;
- actor attribution is derived from URL data, not Telegram identity at click time.

**Required remediation**

- browser-bound verifier cookie/hash created at challenge start;
- Telegram bot callback approval tied to the approver account;
- atomic one-time `approved → consumed` exchange;
- session issuance requires both challenge and browser verifier;
- invalidate all existing admin sessions after deployment.

### F-008 — Admin fallback code is weak and unthrottled

**Severity:** P1
**Evidence:** SOURCE-CONFIRMED
**Files:** admin auth/session code

The fallback code is six digits generated with `Math.random`. There is no atomic attempt counter, lockout or dedicated rate limit for start/code attempts. In a single-approver configuration, fallback approval can become founder access.

**Required remediation**

- disable fallback code in production by default;
- use `crypto.randomInt` if explicitly enabled;
- atomic maximum attempt count and TTL lockout;
- IP/account rate limits and failed-auth OPS breadcrumb;
- minimum secret strength enforced at startup.

## 6. P2 findings — high-priority hardening

### F-009 — Admin approval/denial is a state-changing GET

Link scanners, previews or accidental navigation can mutate challenge state. Use GET for a confirmation page and POST with nonce for the decision.

### F-010 — Admin challenge updates are non-atomic

`updateChallenge` performs Redis GET then SET. Parallel approve/deny/status operations can race. Use Lua/CAS with explicit allowed state transitions.

### F-011 — Configured admin idle timeout is not enforced

The application stores `lastSeenAt` and exposes `ADMIN_WEB_IDLE_TIMEOUT_SEC`, but `getSession` does not reject an idle session before touching it. Sessions live until absolute TTL. Enforce idle timeout before refresh.

### F-012 — Web-admin audit is volatile and fail-open

Audit is Redis-only, limited to 100 records with a 14-day TTL, and write errors are ignored. Current notes/drafts/test-send scope is bounded; future payment/access/deal/giveaway writes require durable PostgreSQL audit before they are allowed.

### F-013 — Public health exposes excessive internal and actor data

The unauthenticated health response can include Redis/QStash status, fallback actor identifiers/usernames/reasons, broadcast identifiers, recent OPS reasons and cron internals. This supports reconnaissance and can reveal operator identity.

Keep public health coarse. Put full diagnostics behind the existing admin session or a health secret without adding a new function.

### F-014 — Health readiness semantics can report success during NO_GO

The handler can return HTTP 200 and `ok: true` while `system_status` is `NO_GO`. External monitors that check status/`ok` can miss a release-blocking condition. The same endpoint should support a readiness tier that returns 503 on NO_GO.

### F-015 — Production webhook logs contain user identifiers and message content

`summarizeUpdate()` logs numeric user/chat IDs, username, callback data and a message-text prefix. Default production logs should use redacted/hashed identifiers and omit content. Full payload diagnostics should be non-production/debug only.

### F-016 — No global Telegram update deduplication

The update ID is logged but not used as a general replay receipt. Telegram retries can replay handlers. Many critical paths have local idempotency, but not every mutation does. Add bounded dedup at critical mutation boundaries, not a blind global drop that could hide failed processing.

### F-017 — Dynamic SQL update keys lack explicit allowlists

Helpers including `setWorkspaceSetting`, `updateGiveaway`, `updateBroadcast` and transition extra fields interpolate field names. Current call sites appear hardcoded; no active injection exploit was confirmed. Add explicit allowlists and reject unknown keys to remove the latent footgun.

### F-018 — Giveaway sponsor replacement is not transactional

The current delete-then-insert loop can leave an empty or partial sponsor set. Wrap replacement in one transaction with validation before delete.

### F-019 — Broadcast 429 user-set TTL is non-atomic

`SADD`, `EXPIRE` and `SCARD` are separate commands. A termination after `SADD` and before `EXPIRE` can leave a persistent set. Replace with one Lua helper.

### F-020 — Admin JSON body reader has no size limit

The body reader buffers the entire request. Add a 64–128 KB cap and return 413. Apply the limit before JSON parsing on auth/write endpoints.

### F-021 — Real owner-looking Telegram ID appears in runtime UX examples

A hardcoded value `611377976` appears in runtime-facing prompts/examples. Replace it with a neutral synthetic example. Do not expose actual operator identifiers in product copy or screenshots.

### F-022 — Generic update helpers do not consistently verify affected rows

Several update helpers can appear successful when no row matched or state drift occurred. Return `rowCount`/`RETURNING` and require callers to handle `missing` or `stale` explicitly.

### F-023 — Critical-path QA is mostly source-string verification

The current portfolio catches drift well but does not execute the exact crash/race boundaries that matter for money, delivery, draw and auth. Add a behavioral proof spine with test DB transactions, fault injection and auth concurrency tests.

## 7. P3 findings — controlled debt

### F-024 — Source concentration raises change risk

`bot.js`, `queries.js` and `admin-web.js` are large. Do not broad-rewrite them. Extract only a high-risk domain when its remediation STEP already touches it.

### F-025 — One fallback HMAC comparison is not timing-safe

Replace direct string equality with constant-time comparison after normalized length checks. Lower priority than the P1 transaction/auth defects.

### F-026 — Production configuration posture is not fully fail-fast

- rate limiting defaults off and is not required by production env assertion;
- admin secret/session secret are checked for presence, not strength;
- payment HMAC posture is surfaced in health rather than uniformly fail-fast.

Treat this as configuration governance. Do not silently change production economics or availability inside an unrelated patch.

## 8. Lens review

### Jobs — product clarity

Strong: the core creator/brand lifecycle is understandable and the recent copy system removed major UX drift.

Weak: operational correctness can still diverge behind a clean interface. A user should not see a completed payment or fair draw claim unless the mechanism can prove it atomically.

### Vitalik — mechanism honesty

Strong: audit trails, explicit source claims and accepted-deal evidence are above average.

Weak: manual giveaway copy differs from manual behavior; payment APPLIED state is not the same transaction as fulfillment; health can say `ok` while system status says NO_GO.

### Woz — simple, reliable engineering

Strong: direct PostgreSQL, collapsed endpoints and no ORM are appropriate.

Weak: duplicated manual/cron draw paths and direct/fallback payment apply paths violate the single-canonical-service principle.

### Durov — Telegram/product sharpness

Strong: Telegram-native flows are extensive and copy is much cleaner.

Weak: admin approval via forwarded web URLs is not a sharp Telegram identity boundary. Use an actual Telegram callback tied to the approver.

### Toly — throughput and shipping

Strong: the project ships quickly with disciplined artifacts.

Weak: source-green confidence has outrun executable crash-boundary proof. The next throughput gain comes from removing high-cost incident classes, not more feature surface.

### Armani — coherence and presentation

Strong: copy, terminology, artifacts and admin vocabulary are coherent.

Weak: operational states need the same coherence: `sent`, `APPLIED`, `drawn` and `approved` must mean durable, unambiguous facts.

### samczsun — adversarial review

Highest concern:

1. transferable admin challenge/session mint;
2. payment fulfillment replay after crash;
3. fail-open fulfillment without ledger;
4. broadcast duplicate after uncertain send;
5. split giveaway settlement paths.

### Hasu — sober risk framing

No live theft or compromise is claimed. The code contains plausible high-impact failure paths. The price of ignoring them is larger than the price of pausing backoffice feature work for a focused remediation chain.

## 9. Release and roadmap decision

### Immediate HOLD

- STEP587 production Go/No-Go;
- STEP589A backoffice attention queue;
- new payment products;
- new giveaway modes;
- broader admin write actions.

### Allowed

- current supervised operation with existing controls;
- STEP586H1 production observation;
- audit-only work;
- narrow remediation STEPs in the order below.

### Required remediation order

1. `STEP588X1 — Payment Fulfillment Atomicity & Missing-Ledger Fail-Closed`
2. `STEP588X2 — Giveaway Draw Correctness & Single Atomic Path`
3. `STEP588X3 — Broadcast Delivery Unknown-State Safety`
4. `STEP588X4 — Admin Web Auth Challenge Binding & Throttling`
5. `STEP588X5 — Health, Logging Privacy & Readiness Truth`
6. `STEP588X6 — Bounded Safety Hardening`
7. `STEP588X7 — Executable Critical-Path Test Spine`
8. complete STEP586H1 24-hour production observation;
9. execute STEP587 Go/No-Go;
10. resume STEP589 backoffice waves only after GO.

## 10. Definition of audit completion

STEP588X is complete when:

- the audit report, finding register, verification matrix and remediation roadmap exist;
- continuity documents identify STEP588X as the handoff-safe audit baseline;
- runtime code remains byte-identical to STEP588;
- the delta is documentation-only;
- archives, patch and hashes are generated and integrity-checked.

This audit does not declare any finding fixed.
