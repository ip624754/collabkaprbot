## STEP501A — Admin-web WHATWG URL cleanup

Date: 2026-04-01

Scope:
- removed deprecated `req.query` / legacy query-getter usage from the collapsed admin-web handlers after live Vercel logs showed `DEP0169` on `api/admin-web-read.js`;
- added `getRequestUrl()` and `getSearchParam()` helpers in `src/lib/adminWeb/common.js`;
- rewired `api/admin-web-auth.js`, `api/admin-web-read.js`, `api/admin-web-write.js` to parse query params only through WHATWG `new URL(...).searchParams`;
- cleaned the same legacy query access from the still-present split admin-web routes and from `api/health.js` to reduce log-noise drift while repo cleanup catches up;
- added `scripts/smoke-admin-web-whatwg-url-contract.js`, wired it into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- source-only hygiene fix, no UX change and no auth/session contract change;
- intended result: no more `DEP0169` deprecation warning from admin-web query parsing in Vercel logs.

# Work History — 2026-04

## STEP500A — Web Admin Hobby-safe API collapse

Что сделано:
- split admin-web serverless surface collapsed into three Hobby-safe entrypoints: `api/admin-web-auth.js`, `api/admin-web-read.js`, `api/admin-web-write.js`;
- Telegram approve decision flow moved under the same auth dispatcher via `action=decision`;
- legacy `/api/admin-web/*` route files removed from `api/` to get the deployment back under the Vercel Hobby 12-function limit;
- `scripts/admin-web.js` repointed to aggregated `action=` / `section=` endpoints without changing `/admin` page URLs or visible shell UX;
- `scripts/smoke-admin-web-shell-contract.js` updated to guard the collapsed handler contract and assert legacy split routes are gone;
- `scripts/check-function-budget.js` changed from fail-at-11 to explicit Hobby max=12 logic, then wired into `package.json` + `scripts/preflight.js` so function-budget drift is caught before deploy.

Что важно:
- auth model unchanged: shared secret → Telegram approve / OTP code → secure session cookie;
- read/write model unchanged: Overview / Users / User Card / Runtime + safe note set/clear only;
- scope stays hobby-safe: no polling, no cron dependency, no deal/payment/runtime hot mutations, no Telegram-user-facing path changes.

## STEP499 — Web Admin Shell v1 (Hobby-safe)

Что сделано:
- добавлен первый web-admin shell под `/admin` через rewrite в `admin.html`;
- добавлены admin-only client files: `styles/admin-web.css`, `scripts/admin-web.js`;
- реализованы Redis-backed auth/session/audit helpers в `src/lib/adminWeb/*`;
- реализованы `/api/admin-web/*` endpoints для auth, overview, users, user detail, user note, runtime;
- auth flow: shared secret → Telegram approve/code → secure session cookie;
- read models построены read-first: `overviewSummary`, `usersList`, `userDetail`, `runtimeSummary`;
- safe write surface ограничен user note set/clear через тот же Redis note contract, что уже использует Telegram-admin;
- добавлен source smoke `scripts/smoke-admin-web-shell-contract.js`, wired в `package.json` и `scripts/preflight.js`.

Что важно:
- шаг сделан без нового framework слоя и без migrations;
- challenges/sessions/recent admin-web audit intentionally Redis-backed для минимального blast radius;
- web admin остаётся sidecar operator console, не заменой Telegram-admin;
- нет polling, нет cron dependency, нет dangerous writes.

Collateral low-risk fix:
- `index.html` синхронизирован с реально существующим OG asset `assets/social/collabka-og-1200x630.png` и width/height `1200x630`, потому что в пользовательском baseline repo оставался stale meta path `collabka-og.png`.


## STEP504 — Runtime / founder diagnostics polish

Date: 2026-04-01

Scope:
- expanded `src/lib/adminWeb/runtime.js` from a narrow `notes` snapshot into a normalized founder/operator diagnostics read model with `updatedAt`, `overall`, `services`, `configPresence`, `warnings`, `hints`, and `recentRuntimeEvents`;
- preserved legacy lightweight runtime fields (`db.ok`, `redis.ok`, `notes`, etc.) so Overview/runtime consumers do not regress while the page evolves;
- rebuilt the `/admin/runtime` UI in `scripts/admin-web.js` + `styles/admin-web.css` around one read-only snapshot: overall state, service cards, warnings strip, env/config presence matrix, hints, and recent runtime signals;
- added `scripts/smoke-admin-web-runtime-contract.js`, wired it into `package.json` and `scripts/preflight.js`;
- removed stale split admin-web route files (`api/admin-web/user.js`, `api/admin-web/users.js`, `api/admin-web/auth/status.js`, `api/admin-web/auth/decision.js`) again to keep the repo at the Vercel Hobby-safe 11-function surface.

Acceptance / notes:
- Runtime stays read-first and hobby-safe: one primary read request, no polling, no cron dependency, and no new writes;
- secrets / env values are intentionally not exposed; only safe presence/status summaries are rendered.


## STEP505 — Payments read surface v1

Date: 2026-04-01

Scope:
- added `/admin/payments` as a read-only founder/operator payments surface in web admin;
- extended `api/admin-web-read.js` with `section=payments` and implemented aggregated `getPaymentsSummary()` in `src/lib/adminWeb/readModels.js`;
- normalized payment statuses into `success / pending / failed / fallback / unknown` and exposed summary cards, warning groups, grouped counts, and recent payment rows;
- added direct entry from Overview via the `Payment alerts` card;
- added `scripts/smoke-admin-web-payments-contract.js`, wired it into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope is read-only only: no retries, overrides, credits mutation, payout/release controls, or any other payment write action;
- page remains hobby-safe: one primary read request, no polling, no cron dependency.


## STEP506 — Comms / Notices workspace v1

Date: 2026-04-02

Scope:
- added `/admin/comms` as a read-only founder/operator communications workspace inside the web-admin shell;
- extended `api/admin-web-read.js` with `section=comms`;
- implemented aggregated `getCommsSummary()` in `src/lib/adminWeb/readModels.js` using `broadcasts` + `broadcast_sent_log` snapshots;
- added a direct Overview entry-point into the comms workspace;
- added `scripts/smoke-admin-web-comms-contract.js`, wired it into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only only: no live send, no retries, no payment mutations, no founder-dangerous controls;
- page remains hobby-safe: one primary read request, no polling, no cron dependency, function budget unchanged at 11 deployable entrypoints.


## STEP507 — Founder controls split
- added founder-aware admin-web session helpers (`isFounderActorTgId`, `requireFounderSession`) and exposed `isFounder` in `/api/admin-web-auth?action=me`;
- made `revoke_all` founder-only and logged it as `founder/revoke_all_sessions`;
- added founder-only `/admin/founder` read surface and split sidebar navigation into `Оператор` and `Founder`;
- added `getFounderSummary()` read model with founder-safe auth/session policy, Founder Sale snapshot, control boundaries, warnings, hints, and recent founder audit;
- added `scripts/smoke-admin-web-founder-contract.js` and wired it into package + source preflight.


## STEP508 — Notices / Comms usable v2

Date: 2026-04-02

Scope:
- upgraded `/admin/comms` from a read-only diagnostics page into a safe operator workspace while staying inside the existing hobby-safe collapsed API surface;
- extended `src/lib/adminWeb/readModels.js` so `getCommsSummary()` now returns drafts, recent notices, outbox snapshot, warnings, hints, and recent comms audit in one aggregated snapshot;
- added `src/lib/adminWeb/comms.js` with safe write helpers for `create_notice_draft`, `update_notice_draft`, and founder-only `test_send_notice`;
- extended `api/admin-web-write.js` with the new comms actions while keeping live send/retry/queue controls out of scope;
- rebuilt the `/admin/comms` UI in `scripts/admin-web.js` so the page now includes a drafts list, inline editor, preview, founder-only test-send button, recent notices, outbox snapshot, and comms audit;
- updated `styles/admin-web.css` for the draft editor / preview presentation;
- strengthened `scripts/smoke-admin-web-comms-contract.js` to cover the new v2 contract.

Acceptance / notes:
- comms workspace remains hobby-safe: one read request on load, explicit writes only, no polling, no cron dependency, no route explosion;
- internal draft label/title reuses `broadcasts.draft_caption` for text-only web-admin drafts to avoid a migration in this step;
- live send stays out of scope and founder-only `test_send_notice` sends the preview only to the current founder Telegram actor.

## STEP509 — Payments drilldown polish

Date: 2026-04-02

Scope:
- extended `/admin/payments` with clickable row drilldown into a read-only payment detail view;
- added `section=payment` to `api/admin-web-read.js`;
- implemented `getPaymentDetail()` in `src/lib/adminWeb/readModels.js` with safe payment summary, linked user context, normalized diagnostics, light event trace, and recent admin audit;
- updated `scripts/admin-web.js` to support `/admin/payments/[id]` plus back-to-list preservation through a `back` query param;
- extended `scripts/smoke-admin-web-payments-contract.js` so source preflight now covers both payments list and payment detail contracts.

Acceptance / notes:
- step stays strictly read-only: no retries, overrides, credits mutation, payout controls, or raw provider payload leakage;
- hobby-safe contract preserved: one main read on list, one main read on detail, no polling, no cron dependency, no new API entrypoints.
