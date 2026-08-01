# STEP590B NEW CHAT HANDOFF

**Current repository baseline:** STEP590B — Executable Callback Router & Unique Ownership Gate
**Parent:** STEP590A — Architecture Baseline
**Repository status:** source implementation complete / deployment canary pending

## Current truth

- exact ownership exists for all 560 registered callback actions;
- admin auth is owned by the pre-user `admin_web_auth` route;
- giveaway access diagnostics are owned by the post-user `giveaway_access` route;
- all other actions remain explicit post-user `legacy` owners;
- duplicate ownership and missing extracted handlers fail closed;
- no callback key, schema, ENV or product behavior was intentionally changed;
- dependency-free router tests pass; clean dependency install/full runtime QA remain pending due package-mirror failure;
- STEP589 remains HOLD during critical architecture extraction.

## Next accepted step

`STEP590C1 — Critical Admin/Auth Callback Domain Extraction` after STEP590B deployment canary, or a bounded follow-up if the canary reveals router defects.

## Hard rules

- one action has one owner;
- extracted handlers must return exact `true` for owned actions;
- no extracted route may fall through to legacy;
- preserve global guards and phase ordering;
- do not delete the legacy owner before domain-by-domain acceptance;
- do not rename callback keys during extraction.

Read:

- `docs/architecture/STEP590B_EXECUTABLE_CALLBACK_ROUTER.md`;
- `docs/audit/STEP590B_EXECUTABLE_CALLBACK_ROUTER_REPORT.md`;
- `docs/operations/STEP590B_CALLBACK_ROUTER_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`.

---

## STEP590A — Architecture Baseline & Modular Monolith Plan (2026-08-01)

**Current handoff-safe repository baseline:** STEP590A docs-only architecture package on top of STEP588X7H1.

Repository truth:

- STEP588X7H1 remains the runtime baseline; STEP590A changes no runtime, migration, ENV, callback key or user-facing flow;
- the exact baseline ZIP SHA-256 is `0054f38c756ff943e978a2e6e3bfcc3eae9fcfe1fa852e046a1e643c1c0c5f5e`;
- 678 files and 267 JavaScript files were inventoried;
- `src/bot/bot.js` is 41,692 lines and contains an approximately 12,903-line callback region;
- the action registry contains 560 entries; the ownership heuristic maps 542 directly to `bot.js`, 1 to admin-auth, 4 to giveaway-access and 13 to aliases/generated/registry-only review;
- `src/db/queries.js` is 9,211 lines and exposes 328 values across multiple repository domains;
- no static relative-import cycle was detected;
- a modular-monolith target, dependency rules, action/DB ownership inventories and STEP590B–J extraction roadmap are now canonical;
- the first runtime architecture step is STEP590B: executable callback router and unique ownership gate;
- STEP589 feature expansion remains HOLD during critical router/domain extraction unless explicitly separated;
- STEP588X7H1 production admin-auth canary remains pending and must not be represented as completed by this docs-only step.

**Architecture decision:** proceed by bounded strangler extraction, preserving Grammy, PostgreSQL, Redis, Vercel, callback keys, DB schema and user behavior. No rewrite, ORM migration, TypeScript migration or microservice split is approved.

Read first:

- `docs/architecture/STEP590A_ARCHITECTURE_BASELINE_AND_DOMAIN_BOUNDARIES.md`;
- `docs/architecture/STEP590A_DEPENDENCY_RULES.md`;
- `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`;
- `docs/audit/STEP590A_ARCHITECTURE_BASELINE_REPORT.md`;
- `docs/process/07_WORK_HISTORY_STEP590A.md`.

---

## STEP588X7H1 — Admin Auth Callback Routing Hotfix (2026-07-20)

**Current handoff-safe repository baseline:** STEP588X7H1 runtime hotfix on top of STEP588X7.

Repository truth:

- production evidence showed `a:aw_auth_dec` reaching `unknown_callback`;
- the STEP588X4 auth branch was misplaced inside the setup-forward message handler instead of the callback router;
- `src/bot/adminWebAuthCallback.js` now owns the executable route and delegates to the canonical Redis auth transition;
- callback routing occurs after the Redis guard and before application-user hydration;
- browser binding, real Telegram actor identity, one-time challenge consume and replay protection are unchanged;
- the latent undefined-`p` setup-forward defect is removed;
- no migration or ENV change is required;
- local auth tests, portable critical spine and callback/action registry gates pass;
- production Vercel deploy and live approve/exchange remain pending.

**Release decision:** deploy this hotfix before continuing admin-web acceptance. STEP587 and STEP589 remain HOLD.

Read first:

- `docs/audit/STEP588X7H1_ADMIN_AUTH_CALLBACK_ROUTING_HOTFIX_REPORT.md`;
- `docs/operations/STEP588X7H1_ADMIN_AUTH_CALLBACK_ROUTING_ROLLOUT_RUNBOOK.md`;
- `docs/process/07_WORK_HISTORY_STEP588X7H1.md`.

---

## STEP588X7 — Executable Critical-Path Test Spine (2026-07-20)

**Current handoff-safe repository baseline:** STEP588X7 test/governance implementation on top of STEP588X6.

Repository truth:

- one canonical runner exposes portable, auto, strict integration and CI-report profiles;
- missing external capability is `NOT_RUN` in auto mode and `BLOCKED` in strict mode, never PASS;
- all eight P1 audit roots map to executable portable regressions;
- isolated PostgreSQL integration executes canonical payment and giveaway services plus broadcast receipt persistence with concurrency and failure injection;
- isolated Redis integration executes production critical-update receipt, admin throttle, Telegram approval and one-time session consume functions;
- integration requires `CRITICAL_TEST_CONFIRM_ISOLATED=1`; shared application URLs require a second explicit acknowledgement;
- no runtime product logic, migration, API endpoint or user-facing flow changed;
- local portable spine passes 6/6 suites and the source contract passes 28 assertions;
- external PostgreSQL/Redis integration is implemented but was not run because disposable credentials were unavailable;
- 133/133 registered source checks pass using bounded continuation after the monolithic process exceeded the execution window.

**Release decision:** STEP588X7 is source-ready and portable-green. Strict isolated PostgreSQL/Redis evidence, STEP588X1–X6 production canaries and STEP586H1 observation remain mandatory. STEP587 and STEP589 remain HOLD.

Read first:

- `docs/audit/STEP588X7_EXECUTABLE_CRITICAL_PATH_TEST_SPINE_REPORT.md`;
- `docs/operations/STEP588X7_CRITICAL_PATH_SPINE_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/process/07_WORK_HISTORY_STEP588X7.md`.

---

## STEP588X6 — Bounded Safety Hardening (2026-07-20)

**Current handoff-safe repository baseline:** STEP588X6 source implementation on top of STEP588X5.

Current truth:

- selected critical Telegram updates claim a Redis receipt keyed by provider `update_id` before mutation; duplicate, concurrent and ambiguous receipts suppress automatic replay;
- receipt-store failure and missing critical `update_id` fail closed, while non-critical navigation remains outside the gate;
- dynamic SQL patch helpers use explicit field allowlists and generic mutations require exactly one affected row;
- admin auth/write JSON bodies are bounded and oversized requests return HTTP 413;
- production webhook/cron initialization requires enabled rate limiting, strong distinct operational secrets, signed payment payloads and safe admin limits; readiness reports unsafe posture;
- runtime-facing owner-looking Telegram IDs were replaced with a neutral synthetic example;
- payment fallback HMAC verification remains timing-safe;
- no PostgreSQL migration, Redis migration or new API endpoint is required;
- local QA passes 36 X6 assertions, 132/132 source checks, X1–X5 critical regressions, dependency/runtime preflight PASS; one completed npm audit reported 0 vulnerabilities and the final repeat hit registry HTTP 502; this is not production replay/ENV evidence.

**Release decision:** source-ready; production ENV preflight, duplicate-suppression canary, body-limit canary and live receipt behavior remain pending. STEP587 and STEP589 remain HOLD.

Read first:

- `docs/audit/STEP588X6_BOUNDED_SAFETY_HARDENING_REPORT.md`;
- `docs/operations/STEP588X6_BOUNDED_SAFETY_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/RISK_REGISTRY.md`.

---

## STEP588X5 — Health, Logging Privacy & Readiness Truth (2026-07-20)

**Current handoff-safe repository baseline:** STEP588X5 source implementation on top of STEP588X4.

Current truth:

- anonymous `/api/health` is minimal readiness and returns `503` on `NO_GO`;
- liveness is explicitly `/api/health?mode=liveness` and does not probe dependencies;
- full diagnostics require an authenticated admin-web session;
- DB and Redis readiness are evidence-based probes;
- public responses contain reason codes, not internal hints, payloads, actor data or OPS/QStash internals;
- webhook/update logs use pseudonymous actor/chat references and action-only summaries;
- raw Telegram text, username, IDs and full callback/payment payloads are not emitted by the hardened log paths;
- no schema migration is required;
- source/dependency QA must not be represented as production Vercel/Upstash/Neon proof.

**Release decision:** source-ready; deployment, public/private health checks and Vercel log inspection pending. STEP587 and STEP589 remain HOLD.

Read first:

- `docs/audit/STEP588X5_HEALTH_LOGGING_PRIVACY_READINESS_REPORT.md`;
- `docs/operations/STEP588X5_HEALTH_PRIVACY_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/RISK_REGISTRY.md`.

---

## STEP588X4 — Admin Web Auth Challenge Binding & Throttling (2026-07-20)

**Current handoff-safe repository baseline:** STEP588X4 source implementation on top of STEP588X3.

Repository truth:

- admin login challenges are bound to an HttpOnly, Secure, SameSite=Strict browser verifier cookie; a challenge ID alone is insufficient;
- Telegram approval uses callback data and the actual `ctx.from.id`; the legacy signed decision URL is permanently non-mutating (`410 Gone`);
- Redis Lua owns atomic `pending → approved/denied → consumed` transitions and one-time session creation; concurrent exchange reuses the same versioned session instead of minting another;
- sessions carry `authVersion = 2`, so pre-STEP588X4 sessions fail closed after rollout;
- idle timeout is enforced during session reads and stale sessions are deleted;
- fallback code is disabled by default, generated with `crypto.randomInt`, browser-bound, attempt-limited, lockable and independently rate-limited; when enabled it is disclosed only to the explicitly configured fallback approver;
- start and fallback verification use dedicated Redis Lua throttles and auth fails closed when the throttle store is unavailable;
- no database migration is required; Redis challenge/session records are ephemeral and versioned;
- local QA passes 48 auth assertions, 128/128 registered source checks, 253/253 JavaScript syntax checks, dependency/runtime preflight and npm audit with 0 vulnerabilities; this must not be represented as production Telegram/Upstash proof.

**Release decision:** STEP588X4 is source-ready, deployment and live auth canary pending. STEP587 and STEP589 remain HOLD. Continue with STEP588X5 only after preserving X4 rollout evidence or explicitly retaining the source-only boundary.

Read first:

- `docs/audit/STEP588X4_ADMIN_WEB_AUTH_CHALLENGE_BINDING_REPORT.md`;
- `docs/operations/STEP588X4_ADMIN_WEB_AUTH_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/process/07_WORK_HISTORY_STEP588X4.md`.

---

# STEP588X3 NEW CHAT HANDOFF

**Current repository baseline:** STEP588X3 — Broadcast Delivery Unknown-State Safety
**Parent:** STEP588X2 — Giveaway Draw Correctness
**Repository status:** source implementation complete / migration and production canary pending

## Start here

1. Read `docs/00_CURRENT_STATE.md`.
2. Read `docs/audit/STEP588X3_BROADCAST_UNKNOWN_STATE_SAFETY_REPORT.md`.
3. Read `docs/operations/STEP588X3_BROADCAST_ROLLOUT_RUNBOOK.md`.
4. Read `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`.
5. Read `docs/RISK_REGISTRY.md`.

## Current truth

- QStash and legacy cron require an attempt-token claim before Telegram send.
- Stale `sending` becomes terminal `delivery_unknown`; it is never automatically reclaimed.
- Telegram success retries only the DB receipt, never Telegram.
- Timeout/network/5xx outcomes are unknown, not retryable proof.
- Explicit 429 remains retryable and its distinct-user Redis operation is atomic.
- Founder reconciliation is no-resend, compare-and-set and requires an evidence note.
- Admin Communications exposes unknown rows and message IDs.
- Migration 049 must precede runtime deployment.
- Local source, syntax, dependency/runtime and critical regression checks pass.
- Production migration, QStash/Telegram behavior and duplicate absence are not verified.
- STEP588X1 and X2 production acceptance remain pending unless separately evidenced.
- STEP587 and STEP589 remain HOLD.

## Next accepted sequence

```text
STEP588X1 production evidence
→ STEP588X2 production evidence
→ STEP588X3 migration + canary evidence
→ STEP588X4 Admin Auth Challenge Binding
→ STEP588X5 Health/Logging Privacy
→ STEP588X6 Bounded Safety Hardening
→ STEP588X7 Critical Behavior Test Spine
→ STEP586H1 24h observation PASS
→ STEP587 Go/No-Go
→ resume STEP589
```

## Hard rules

- never add `delivery_unknown` or stale `sending` to an automatic claim/retry set;
- never call Telegram from receipt persistence or manual reconciliation;
- treat transport timeout and Telegram 5xx as ambiguous;
- preserve attempt-token compare-and-set writes;
- apply migration 049 before deploying runtime;
- do not claim production duplicate safety without canary/replay evidence.

---

# STEP588X2 NEW CHAT HANDOFF

**Current repository baseline:** STEP588X2 — Giveaway Draw Correctness & Single Atomic Path
**Parent:** STEP588X1 — Payment Fulfillment Atomicity
**Repository status:** source implementation complete / production canary pending

## Start here

1. Read `docs/00_CURRENT_STATE.md`.
2. Read `docs/audit/STEP588X2_GIVEAWAY_DRAW_CORRECTNESS_REPORT.md`.
3. Read `docs/operations/STEP588X2_GIVEAWAY_ROLLOUT_RUNBOOK.md`.
4. Read `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`.
5. Read `docs/RISK_REGISTRY.md`.

## Current truth

- Manual Telegram draw and cron auto-draw use one canonical PostgreSQL transaction service.
- The locked giveaway row owns winner count and seed timestamps; caller snapshots are not authoritative.
- Eligible-first selection and deterministic ineligible top-up are identical for every caller.
- Winners, status and audit are one commit; failure rolls all of them back.
- Timed lazy-end and draw can commit in the same transaction.
- Manual actor and source are recorded in the audit receipt.
- Sponsor replacement is transactional.
- No migration is required for STEP588X2.
- Local executable giveaway tests pass; production Neon/cron/Telegram behavior is not verified.
- STEP588X1 production migration/canary evidence is still pending unless separately supplied.
- STEP587 and STEP589 remain HOLD.

## Next accepted sequence

```text
STEP588X1 production evidence
→ STEP588X2 production canary evidence
→ STEP588X3 Broadcast Unknown-State Safety
→ STEP588X4 Admin Auth Challenge Binding
→ STEP588X5 Health/Logging Privacy
→ STEP588X6 Bounded Safety Hardening
→ STEP588X7 Critical Behavior Test Spine
→ STEP586H1 24h observation PASS
→ STEP587 Go/No-Go
→ resume STEP589
```

## Hard rules

- do not reintroduce a JavaScript/manual winner-selection path;
- do not write winners, final status or draw audit in separate transactions;
- do not top up from a pool that can repeat already-selected eligible users;
- do not treat Redis lock as the correctness boundary;
- do not rerun or rewrite an important committed giveaway to simplify acceptance;
- do not claim production resolution before manual, replay and cron evidence.

---

# STEP588 NEW CHAT HANDOFF

**Current repository baseline:** STEP588 — Backoffice Productization Audit & Architecture
**Parent:** STEP586H1

## Start here

1. Read `docs/00_CURRENT_STATE.md`.
2. Read `docs/audit/STEP588_BACKOFFICE_PRODUCTIZATION_AUDIT.md`.
3. Read `docs/backoffice/README.md`.
4. Read `docs/roadmap/STEP589_BACKOFFICE_IMPLEMENTATION_ROADMAP.md`.
5. Read `docs/operations/STEP586H1_NEON_CRON_24H_OBSERVATION_RUNBOOK.md`.

## Current truth

- Existing web-admin is already the canonical backoffice foundation.
- Do not build a second admin or duplicate Telegram user flows.
- Keep static SPA, collapsed API and canonical query/services.
- No ORM or framework rewrite is approved.
- STEP589 feature work is blocked until STEP586H1 observation and STEP587 release decision.
- First product gap after release is the read-only attention/collaboration operations layer.
- Six stale admin-web contracts were restored to current runtime truth.
- `smoke:backoffice-productization-contract` guards static SPA + three collapsed endpoints + no ORM.
- Targeted admin/admin-web/backoffice suite: 54/54 PASS locally.

## Next accepted sequence

```text
STEP586H1 24h observation
→ STEP587 release Go/No-Go
→ STEP589A attention queue
→ STEP589B collaboration control center
```

---

# STEP586H1 CURRENT TRUTH OVERRIDE

- Current baseline: STEP586H1 Neon Cron Connection Resilience & Alert Truth.
- Parent: STEP586H Live Telegram Acceptance and Mobile Copy Pass.
- Production logs confirmed transient Neon connection acquisition failures in `broadcast-tick` and `giveaways-tick`.
- Operator-confirmed: pooled Neon URL, verify-full TLS/channel binding, `PG_POOL_MAX=1`, `PG_CONN_TIMEOUT_MS=1000`.
- One retry is allowed only before user SQL: connection acquisition/session initialization.
- Query errors are classified and rethrown; whole cron jobs and SQL are never replayed automatically.
- Broken clients are destroyed instead of returned to the pool.
- Job-level `cron_failed` owns the alert; router duplicate `cron_router_failed` is suppressed for the marked exception.
- Dedup is per job + error class, so broadcast and giveaway failures remain separately visible.
- Health exposes secret-free DB pool/retry truth and warnings.
- Current 1000 ms timeout produces `database_connect_timeout_aggressive`; it remains operator-accepted pending observation.
- Local QA is green. Production effect is unverified.
- Next action: deploy STEP586H1, stagger schedules externally, run the 24-hour observation. STEP587 is blocked until PASS.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586H1_NEON_CRON_CONNECTION_RESILIENCE_ALERT_TRUTH_REPORT.md`
3. `docs/operations/STEP586H1_NEON_CRON_24H_OBSERVATION_RUNBOOK.md`
4. `docs/process/07_WORK_HISTORY_STEP586H1.md`
5. `docs/SYSTEM_INVARIANTS.md`
6. `docs/RISK_REGISTRY.md`

Rules for the next model:
- do not add more than one connection retry;
- do not retry user SQL or whole cron jobs;
- do not raise `PG_POOL_MAX`;
- do not claim production resolution before 24-hour evidence;
- preserve one authoritative alert per job exception;
- keep DB URL/host/credentials out of health and artifacts.

---

# STEP586H CURRENT TRUTH OVERRIDE

- Current baseline: STEP586H Live Telegram Acceptance and Mobile Copy Pass.
- Acceptance tooling and source mobile copy fixes are implemented on top of STEP586G.
- Required live paths: new user/roles, creator lifecycle, brand lifecycle, invite center, paid guard, stale/error recovery, admin/operator.
- A PASS requires actual labels, screenshot/transcript evidence and three mobile checks for every path.
- An untouched pack is BLOCKED. PASS without evidence is FAIL.
- Unapproved Stars purchase or invite-points spend is FAIL.
- Static bounded button labels must stay at or below 34 visible characters.
- Source-confirmed long labels were shortened; callback values and destinations are unchanged.
- Live Telegram, phone wrapping, Preview deployment and remote STEP584 evidence remain unverified.
- Current action: deploy to preview/staging and execute the STEP586H runbook. Do not claim live-green before finalized PASS evidence.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_MOBILE_COPY_REPORT.md`
3. `docs/operations/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_RUNBOOK.md`
4. `docs/product/COLLABKA_COPY_SYSTEM.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586H.md`

Rules for the next model:
- do not infer live rendering from source tests;
- use exact deployment + bot acknowledgement;
- capture redacted evidence for every required path;
- do not buy Stars, spend invite points or send broadcasts without explicit approval;
- fix only defects reproduced by evidence;
- do not change callbacks, permissions or mechanisms inside the acceptance pass.

---

# STEP586G CURRENT TRUTH OVERRIDE

- Current baseline: STEP586G Admin and Operator Vocabulary.
- Primary Telegram and web-admin labels are human-readable and aligned.
- Canonical operator terms include `Исходящие`, `Шаблоны личных сообщений`, `Одобрить / Отклонить`, `Журнал розыгрыша`, `Журнал аудита`, `Недоступные чаты` and `Пропуски доставки`.
- Exact Redis, QStash, hard-skip, broadcast-state, callback and DB-table diagnostics remain available below the human status/action layer.
- Login machine decisions remain `approve / deny`; signed decision behavior is unchanged.
- Callback IDs, action-registry guards, audience values, permissions, queue mechanics, payments, schema and migrations are unchanged.
- Source guard: `npm run smoke:admin-operator-vocabulary-contract`.
- Live Telegram, web-admin, Vercel, Redis/QStash/Neon, mobile wrapping and operator comprehension are not verified.
- Next STEP: STEP586H Live Telegram Acceptance and Mobile Copy Pass.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586G_ADMIN_OPERATOR_VOCABULARY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586G.md`

Rules for the next model:
- verify real rendering and comprehension before changing more copy;
- preserve raw diagnostics and machine values;
- do not redesign operator controls or change privileges;
- do not claim live-green without remote evidence.

---

# STEP586F CURRENT TRUTH OVERRIDE

- Current baseline: STEP586F Access, Error and Empty-State Recovery.
- Recovery classes: channel, application, dialog, offer, giveaway, folder, role and generic.
- Ordinary-user recovery is neutral when deletion and permission change cannot be distinguished safely.
- Recovery buttons return to existing list/menu surfaces; they never authorize access to the object.
- Empty-state contract: title + source-backed reason + next action.
- Selected infrastructure details are removed from user copy and retained in structured `[copy_safety]` diagnostics.
- Non-admin curator workspace detail lookup now follows specific membership proof.
- Explicit admin/operator `Нет доступа.` gates remain; no blind global replacement was performed.
- Callbacks, schema, payments, invite economics, deal mechanics and giveaway mechanics remain unchanged.
- Source guard: `npm run smoke:access-error-empty-state-recovery-contract`.
- Live Telegram, Vercel, Neon/Redis/QStash, mobile wrapping and remote staging are not verified.
- Next STEP: STEP586G Admin and Operator Vocabulary.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586F_ACCESS_ERROR_EMPTY_STATE_RECOVERY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586F.md`

Rules for the next model:
- preserve precise diagnostics while making primary operator actions readable;
- do not redesign admin controls or change privileges;
- do not expose private-object existence in ordinary-user recovery;
- do not claim live UX verification without evidence.

---

# STEP586E CURRENT TRUTH OVERRIDE

- Current baseline: STEP586E Monetization and Paid Product Clarity.
- Canonical products: `Brand Plan`, `Кредиты`, `PRO канала`, `Умный подбор`, `Продвижение`, `Founder Sale`, moderated official placement.
- Credits are expendable brand units, not money, Stars or subscription time.
- Source-backed credit spend: new dialogs, accepted applications/deals and contact unlocks; messages inside an open dialog are free.
- Brand Plan is a time-bounded brand subscription. Current Start/Pro tool entitlement is the same; verified difference is price and included credits.
- PRO applies to one selected channel and does not include Brand Plan or brand credits.
- Visible prices, quantities and durations derive from runtime config/catalogs.
- Paid receipts state Stars amount and applied result. Delayed application routes to `/paysupport`.
- No automatic refund path was found; do not promise one.
- `MATCH_TIERS`, `FEATURED_DURATIONS` and `BRAND_PLANS` are now explicit Stars-handler dependencies.
- Provider, prices, callbacks, payload prefixes, ledger, HMAC and exactly-once mechanics remain unchanged.
- Source guard: `npm run smoke:monetization-paid-product-clarity-contract`.
- Live Stars, Vercel, Neon/Redis/QStash, support/refunds and mobile UX are not verified.
- Next STEP: STEP586F Access, Error and Empty-State Recovery.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586E_MONETIZATION_PAID_PRODUCT_CLARITY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586E.md`

Rules for the next model:
- classify access/error states from authoritative source evidence;
- do not globally replace `Нет доступа.`;
- do not weaken permissions or expose hidden object existence;
- keep payment and entitlement mechanics unchanged;
- do not claim live UX verification without evidence.

---

# STEP586D CURRENT TRUTH OVERRIDE

- Current baseline: STEP586D Invite Center Language and Mechanism Honesty.
- Public invite module: `📨 Приглашения`. Admin/operator terminology is deferred to STEP586G.
- Mechanism truth: `+2` points after first eligible start, pending 24h; `+10` after main-profile completion, pending 48h.
- Reward catalog: 100 points → 7 days PRO; 250 points → 30 days PRO.
- DB processing and Telegram copy use shared immutable rule/catalog exports. Numeric mechanics did not change.
- Pending points are not spendable; available and used balances are separate.
- Self-referral, existing accounts, raw link views and incomplete activation exclusions are explicit.
- Callback IDs, ledger schema, attribution, activation, uniqueness, target order and redeem lock remain unchanged.
- Source guard: `npm run smoke:invite-language-mechanism-honesty-contract`.
- Live Telegram, production confirmation timing, live redeem and remote staging are not verified.
- Next STEP: STEP586E Monetization and Paid Product Clarity.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586D_INVITE_CENTER_LANGUAGE_MECHANISM_HONESTY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586D.md`

Rules for the next model:
- compare every paid-product claim to source configuration and entitlement code;
- do not change provider, price, callback, ledger or apply behavior inside copy cleanup;
- keep subscription, credits and creator PRO as separate product objects;
- do not claim live UX or payment verification without evidence.

---

# STEP586C CURRENT TRUTH OVERRIDE

- Current baseline: STEP586C Applications, Dialogs and Deals Lifecycle.
- Canonical lifecycle: `оффер / профиль → заявка → диалог → сделка → этап / закрытие`.
- Visible destinations: `💬 Диалоги`, `📨 Заявки`, `🤝 Сделки`; callback IDs and destinations are unchanged.
- A deal exists only with persisted accepted-user evidence plus a deal stage.
- Deal-only routes and the SQL stage writer reject pre-acceptance applications.
- `a:brand_deal_set` now verifies actor access before mutation.
- Source guard: `npm run smoke:applications-dialogs-deals-lifecycle-contract`.
- Canonical source preflight plus lifecycle, callback, dependency/runtime, targeted flow and syntax checks pass.
- Live Telegram, mobile wrapping, Vercel/Neon/QStash and remote staging are not verified.
- Next STEP: STEP586D Invite Center Language and Mechanism Honesty.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586C_APPLICATIONS_DIALOGS_DEALS_LIFECYCLE_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586C.md`

Rules for the next model:
- preserve invite reward math, eligibility and anti-abuse rules;
- do not rename callbacks;
- compare invite copy to persisted source truth;
- treat incentive wording as a security and trust surface;
- do not claim live UX verification without Telegram evidence.

---

# STEP586B CURRENT TRUTH OVERRIDE

- Current baseline: STEP586B Home, Menu and Role Navigation Contract.
- `a:home` visible label: `🏠 Домой`; destination unchanged.
- `a:menu` visible label: `📋 Меню`; destination unchanged.
- Canonical role labels across role gate, switches, help and verification: `Креатор`, `Бренд`; `канал` is a managed Telegram object.
- Source guard: `npm run smoke:home-menu-role-navigation-contract`.
- Callback consistency, footer navigation lint, dependency preflight and the 217-file JavaScript syntax sweep pass locally. The canonical serial source-preflight command timed out during its long syntax sweep after earlier gates passed.
- Live Telegram/mobile UX is not verified.
- Next STEP: STEP586C Applications, Dialogs and Deals Lifecycle.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586B_HOME_MENU_ROLE_NAVIGATION_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586B.md`

---

# STEP586A CURRENT TRUTH OVERRIDE

Use this block over older baseline and runtime claims below.

- Current baseline: STEP586A Copy Safety & Taxonomy Foundation.
- User-copy safety: targeted ordinary-user migration, Neon, table, ENV and OAuth configuration leaks removed.
- Operator truth: preserved through structured `[copy_safety]` diagnostics.
- Invite vocabulary: `баллы`, `7 дней PRO`, `30 дней PRO`, `заполнил основной профиль`, `история баллов`.
- Reward mechanism: unchanged; keys, costs, durations, balances and eligibility remain source-identical except labels.
- Callback contract: no action identity or handler rename; callback consistency has 0 unresolved actions.
- Source enforcement: `npm run smoke:copy-safety-taxonomy-contract` is part of source preflight.
- Dependency/runtime preflight: PASS after clean local dependency install.
- Canonical serial source preflight: reached the long syntax sweep and timed out; full parallel syntax plus residual optional invariants passed separately.
- Live Telegram/mobile copy: not verified.
- STEP584 remote staging acceptance: still pending operator evidence.
- Next STEP: STEP586B Home, Menu and Role Navigation Contract.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586A_COPY_SAFETY_TAXONOMY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586A.md`

Rules for the next model:
- migrate labels by callback meaning, not global string replacement;
- `a:home` is the global role/mode hub; `a:menu` is the current-role menu;
- do not rename callbacks in STEP586B;
- do not mix lifecycle or monetization copy into the navigation STEP;
- preserve the user/operator diagnostic boundary added in STEP586A;
- do not claim live UX verification without Telegram evidence.

---

# STEP585 CURRENT TRUTH OVERRIDE

Use this block over older baseline and runtime claims below.

- Current baseline: STEP585 Conversation & UX Language Audit on unchanged STEP584 runtime source.
- Source audit: complete for active Telegram message/button surfaces.
- Copy readiness: 6.5/10; this is a language score, not runtime readiness.
- P0 copy findings: none confirmed.
- P1 classes: infrastructure leakage, Home/Menu drift, role drift, application/dialog/deal taxonomy, invite terminology, monetization naming, and `офер` spelling.
- Runtime delta in STEP585: none.
- Live Telegram/mobile copy: not verified.
- STEP584 remote staging acceptance: still pending operator evidence.
- Next STEP: STEP586A Copy Safety & Taxonomy Foundation.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP585_FULL_CONVERSATION_UX_LANGUAGE_AUDIT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP585.md`

Rules for the next model:
- do not perform a broad copy rewrite;
- preserve callback values and product state machines;
- separate user copy from operator diagnostics;
- update source smokes with every intentional label contract change;
- do not claim live UX verification without Telegram evidence.

---

# STEP582 CURRENT TRUTH OVERRIDE

Use this block over older runtime claims below.

- Current baseline: STEP582 Preflight Truth Restoration.
- Callback consistency: PASS, 0 unresolved.
- Dependency/runtime preflight: PASS.
- Syntax: PASS through parallel `node --check` across the project JS surface.
- Security dependency audit: 0 vulnerabilities.
- Canonical serial `preflight:source`: did not complete inside the tool time limit; no remaining assertion failure was observed and the residual checks passed separately.
- Live production runtime: not reverified.
- Next STEP: STEP583 Runtime Proof Spine.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/process/07_WORK_HISTORY_STEP582.md`
3. `docs/audit/STEP581_FULL_PROJECT_AUDIT_2026_07_17.md`
4. `docs/roadmap/COLLABKA_EXECUTION_ROADMAP_AFTER_STEP581.md`
5. `docs/AI_MULTI_MODEL_HANDOFF_CURRENT.md`

---

# STEP581 CURRENT TRUTH OVERRIDE

Use this block over older runtime claims below.

- Current baseline: STEP581 audit pack on STEP580 docs / STEP579 runtime.
- Source syntax: verified clean for 211 JS files.
- Dependency audit: 0 vulnerabilities.
- Preflight status: **NOT GREEN**. Callback consistency has 21 unresolved references. Dependency preflight has a false-negative resolver.
- Vercel function budget: 11/12.
- Live runtime status: **not reverified in STEP581**; older `System=OK` claims are historical snapshots, not current proof.
- Next STEP: STEP582 Preflight Truth Restoration.

Read first:
1. `docs/audit/STEP581_FULL_PROJECT_AUDIT_2026_07_17.md`
2. `docs/roadmap/COLLABKA_EXECUTION_ROADMAP_AFTER_STEP581.md`
3. `docs/AI_MULTI_MODEL_HANDOFF_CURRENT.md`

---

# 15 — NEW CHAT HANDOFF (copy-paste) — STEP580 baseline

Цель: чтобы новый чат продолжил **текущий рабочий baseline**, включая STEP579 runtime hardening и STEP580 CogniForge/Creator OS documentation layer.

---

### STEP580 latest narrow baseline note
- STEP579 remains the latest runtime-code delta: timing-safe public secret checks, explicit giveaway lock handling, and unchanged invite/reward semantics
- STEP580 is documentation/continuity only; it adds CogniForge project governance, system invariants, risk registry, and Creator OS thesis
- canonical project contracts now include `docs/AI_NATIVE_WORKFLOW.md`, `docs/SYSTEM_INVARIANTS.md`, `docs/RISK_REGISTRY.md`, and `docs/CREATOR_OS_THESIS.md`
- runtime code, DB, callbacks, invite/reward math, giveaway, auth, webhook, cron, payments, and admin behavior are unchanged in STEP580
- Creator OS thesis is a north star, not permission for broad redesign; every product change still requires a scoped STEP


## 1) Что загрузить в новый чат

1. Актуальный **FULL project zip**
2. При необходимости свежий `/api/health` или краткий live runtime recap
3. Опционально — hotfix/patch последнего шага, если новый чат должен разбирать именно дельту

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
**HANDOFF — CONTINUE FROM CURRENT PROCESS (STEP580 baseline)**

Продолжаем не с нуля, а от **STEP580 baseline** (STEP580 docs/governance on top of STEP579 runtime source).

Сначала прочитай по порядку:
1. `docs/README.md`
2. `docs/00_BOOT.md`
3. `docs/00_CURRENT_STATE.md`
4. `docs/91_PROD_LAUNCH_30MIN.md`
5. `docs/15_NEW_CHAT_HANDOFF.md`
6. `docs/AI_NATIVE_WORKFLOW.md`
7. `docs/SYSTEM_INVARIANTS.md`
8. `docs/RISK_REGISTRY.md`
9. `docs/CREATOR_OS_THESIS.md`

### Что уже стабилизировано в текущей волне

### Что добавлено в STEP580
- project-specific CogniForge mode routing and STEP/Truth Boundary contract
- cross-system invariant registry
- living risk registry
- Creator Collaboration Operating System thesis with explicit non-goals
- continuity baseline repair from contradictory older/current references to STEP580


#### Bot/runtime correctness (STEP536–542)
- callback ack / feedback contract hardened
- orphan/stale callback surfaces cleaned up
- input-state boundary hardened
- callback consistency guard added to source preflight
- `gw_access*` extracted from monolith and aligned with project lifecycle truth
- `gw_access` prompt/truth boundary hardened

#### Web-admin mobile + runtime truth (STEP543A–545)
- mobile shell / drawer / shared responsive surfaces landed
- Users mobile working slice landed
- mobile consistency follow-up landed
- stale retry signal now downgraded correctly in `System`
- `Overview` now uses the same runtime truth contract as `System`

### Current live-confirmed reading
- `System = OK`
- `Overview = OK`
- `Runtime warnings = 0`
- stale retry signal is historical/info, not active degraded
- mobile admin pass is in place and usable

### Что подтверждено source/snapshot-level
- STEP536–545 source smokes and preflight were run during the wave
- docs canon updated step-by-step
- current read-model truth in `Overview` and `System` is aligned

### Что ещё требует обычного live observation
- normal production observation after deploy
- manual admin/mobile checks on real phone as needed
- ordinary Telegram runtime spot-checks after future changes

### Что сейчас НЕ надо делать
- не возвращаться к QStash/DB/profile_contact расследованию как к активной аварии
- не делать новый широкий bot/router rewrite
- не делать новый большой admin redesign
- не ломать mobile/admin shell ради косметики
- не поднимать stale retry breadcrumb обратно в active warning lane

### Как должен выглядеть первый ответ ассистента
- подтвердить, что работа продолжается от **STEP580 baseline**
- кратко перечислить, что стабилизировано в STEP536–545
- отдельно разделить source-confirmed vs live-confirmed
- назвать ровно **один** следующий микро-шаг с наибольшим leverage
- не предлагать redesign без source/runtime повода

---

## 3) Мини-smoke, который новый чат должен предложить первым

1. `System` / `Overview` / `Обновить`
2. один mobile admin pass: Overview → Users → Runtime
3. короткий Telegram pass по критичным работающим путям после любого нового runtime/bot патча
4. `/api/health` / runtime recap only if новая задача реально затрагивает prod-runtime truth

---

## 4) Canonical prompt kernel

Используй:
- `docs/17_START_NEW_CHAT_PROMPT.md`

Он остаётся главным behavioral kernel: baseline-first, docs-first, narrow patching, audit → patch → QA → artifacts.

---

## 5) Production docs

- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/92_PROD_ENV_BASELINE.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/03_LIVE_RUNTIME_PASS_STEP471.md`

---

## 6) Главная установка

Новый чат должен продолжать от **реального текущего baseline**:
- bot/runtime hardening wave landed
- web-admin mobile/runtime truth wave landed
- open known defect class сейчас не зафиксирован
- следующий ход выбирается только по свежему source/runtime сигналу, а не по устаревшему handoff-контексту

## STEP583 delta

- Current baseline: STEP583 Runtime Proof Spine.
- Local proof command: `npm run smoke:runtime-proof-spine`.
- Verified locally: webhook auth and callback dispatch, Redis degradation fallback, QStash ping convergence.
- Not verified live: Vercel, Telegram, Neon, Upstash Redis, QStash.
- Next STEP: STEP584 Staging Runtime Acceptance Pack.

## Current next action after STEP584

Deploy the STEP584 baseline to preview/staging, run `npm run acceptance:staging` first in observe-only mode, then optionally with `ACCEPTANCE_QSTASH_PUBLISH=1`. Preserve generated evidence. Do not claim staging GO until that remote evidence and one manual Telegram creator/brand navigation smoke exist.
