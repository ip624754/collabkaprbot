# Work History — 2026-04

## STEP519 — Users cohort counters / mini topline

Date: 2026-04-02

Scope:
- added a small server-backed `Users cohort counters / mini topline` above the existing cohort chips in `/admin/users`;
- introduced `getUsersDirectoryCohortCounters()` so the same built-in cohort slices are counted once on the server under the current search / segment / filter rail;
- intentionally kept counters independent from the active cohort selection, so chips stay useful even when the list is already drilled into one cohort;
- surfaced the counters as clickable mini cards in `scripts/admin-web.js` and added dedicated styling in `styles/admin-web.css`;
- added `scripts/smoke-admin-web-users-cohort-counters-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only and bounded: no new writes, no background jobs, no persistence layer for custom views;
- the goal is faster operator scan-speed and topline clarity, not a new analytics subsystem.

## STEP518 — Users operator cohort chips / saved views

Date: 2026-04-02

Scope:
- added `Users operator cohort chips / saved views` next to the sort / priority rail in `/admin/users`;
- introduced built-in cohort views for `Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, and `Quiet creators`;
- extended the normalized users-directory contract with `cohortView`, reused across list render, CSV export, bulk copy, and admin-web audit reasons;
- kept cohort SQL bounded to existing baseline signals only (`payments_count`, `has_channel`, `brand_plan`, `last_known_activity_at`, creator/brand presence);
- added `scripts/smoke-admin-web-users-cohort-rail-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only and reversible: no new write paths, no background jobs, no persistence for custom views;
- cohort views are intentionally built-in and transparent, not a hidden scoring or recommendation engine.

## STEP517 — Users sort / priority rail

Date: 2026-04-02

Scope:
- added a dedicated `Users sort / priority rail` to `/admin/users` with one-click presets for `Новые`, `Свежие`, `Платящие`, `Тихие`, and `Проблемные`;
- extended the normalized users-directory contract with `sortBy`, shared across list, CSV export, and bulk-copy reads so the operator sees and exports the same ordering;
- upgraded the shared users meta projection with `payments_count`, `last_payment_at`, and a bounded `problem_score`, then reused the same order contract in list/export SQL;
- surfaced stronger row hints (`pay xN`, `banned`, `risk / attention`) so the new priority modes stay explainable;
- added `scripts/smoke-admin-web-users-priority-rail-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only and low-risk: no new write surfaces, no user mutations, no background jobs, no public-flow changes;
- `problem_desc` is intentionally narrow and transparent: banned / paid-no-channel / plan-no-channel / stale credits.

## STEP516 — Users table hierarchy polish

Date: 2026-04-02

Scope:
- tightened `/admin/users` row hierarchy so user identity, compact stats, signals, activity, and created time scan in a cleaner order;
- split `Last activity` out into its own dedicated column and rendered freshness as compact status chips with exact timestamp detail;
- replaced the noisier mixed text lines with compact stat chips for plan, credits, note presence, and signal roles;
- added dedicated users-table polish styles in `styles/admin-web.css`;
- added `scripts/smoke-admin-web-users-hierarchy-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- UI-only step: no SQL changes, no route changes, no write-surface expansion;
- intent is scan-speed and discipline, not new data or new ops mutations.

## STEP515 — Users filter rail v2

Date: 2026-04-02

Scope:
- added `Filter rail v2` to `/admin/users` so operators can filter by plan presence, credits presence, channel presence, recent activity window (7/30/90 days), and payments yes/no;
- unified list, CSV export, and bulk-copy state through one normalized filter contract in `src/db/queries.js`;
- added shared user meta projection (`has_channel`, `has_payments`, `last_known_activity_at`) and surfaced richer quick signals directly in the users table;
- extended CSV export with channel/payment/activity columns and preserved the applied filter rail inside admin-web audit reasons;
- added `scripts/smoke-admin-web-users-filter-rail-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only and bounded;
- activity filter intentionally avoids optional analytics tables and relies only on baseline schema surfaces already used in prod.

## STEP514 — Users bulk utility rail

Date: 2026-04-02

Scope:
- added a safe `Bulk utility rail` to `/admin/users` for quick operator copies of `tg_id`, `usernames`, and `user_id` without introducing destructive bulk actions;
- introduced `src/lib/adminWeb/usersBulk.js` plus `section=users_bulk` in the collapsed read handler so current-filter copies and selection-basket copies share one bounded server contract;
- added checkbox selection + lightweight `корзина` in the users table for manual ops work on explicitly chosen rows;
- logged every copy action through `appendAdminWebAudit()` with actor, mode, source, filters, row count, truncation flag, and preview;
- added `scripts/smoke-admin-web-users-bulk-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays copy-only and low-risk: no destructive bulk writes, no user mutations, no background jobs, no public-flow changes;
- current-filter copies stay bounded by the existing 10 000-row cap, basket lookups by 500 explicit ids.

## STEP511 — Web Admin login step split + approve auto-return

Date: 2026-04-02

Scope:
- fixed the remaining web-admin login UX loop while preserving the existing auth contract (`secret -> Telegram approve/code -> session`);
- rebuilt `/admin/login` into two explicit phases so a live challenge shows only the verify surface (`Telegram approve / code`) and no longer visually asks for the secret again;
- added an immediate login-status recheck on persisted challenge return and a login-route session check so approved sessions go straight into `/admin` instead of lingering on the login form;
- upgraded the Telegram approve decision page to auto-return back into `/admin/login?challenge=...` after approval so the browser can complete the handoff with less operator friction;
- refreshed `scripts/smoke-admin-web-login-contract.js` to guard the stricter login contract source-side.

Acceptance / notes:
- no new API entrypoints, no migrations, and no auth-model expansion;
- session issuance semantics stay unchanged: approved challenge or valid OTP only;
- polling remains login-page-only and is not expanded into general admin page polling.

## STEP510A — Web Admin login flow hardening + docs canon restore

Date: 2026-04-02

Scope:
- hardened the web-admin login UX so a pending login challenge survives refresh/return to page via `sessionStorage` + `?challenge=` URL state;
- added auto-polling of approve status while the login page is waiting for Telegram confirmation, so desktop login can complete without a manual `Проверить approve` loop;
- normalized raw auth errors (`invalid_code`, `challenge_expired`, etc.) into clear RU operator labels;
- changed `verify_code` to gracefully reuse an already-approved challenge instead of failing with confusing `invalid_code` when approve happened first;
- improved the Telegram decision landing page with a direct return-link back to `/admin/login?challenge=...`;
- restored docs canon after sale-prep drift by adding missing STEP502/STEP503 docs and refreshing work-history/current-state continuity.

Acceptance / notes:
- auth model is unchanged: secret → Telegram approve/code → session;
- no new API entrypoints and no non-login polling were introduced;
- added `scripts/smoke-admin-web-login-contract.js` so the hardened login contract is now source-guarded.

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

## STEP513 — Users export + audit snapshot

Date: 2026-04-02

Scope:
- added `section=users_export` to the collapsed `api/admin-web-read.js` surface so `/admin/users` can download CSV without opening a new route family;
- introduced `src/lib/adminWeb/usersExport.js` for scope normalization (`current`, `audit snapshot`, `all`, `brands`, `creators`, `curators`, `managers`) and CSV generation;
- upgraded the users page toolbar with a disciplined export control plus latest export hint from admin-web audit;
- logged every CSV download through `appendAdminWebAudit()` with actor, scope, filters, rows count, and truncation flag;
- added `scripts/smoke-admin-web-users-export-contract.js` and wired it into `package.json` + `scripts/preflight.js`.

Acceptance / notes:
- CSV export stays bounded by the existing `exportUsersDirectory()` 10 000-row cap;
- scope remains low-risk and hobby-safe: no XLSX/PDF, no background jobs, no destructive bulk actions, no user mutations, no public-flow changes.

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


## STEP502 — Overview polish + metrics light

Date: 2026-04-02

Scope:
- upgraded `/admin` from a shell snapshot into a stronger founder/operator cockpit with `Last updated`, segment split, light metrics, a clearer warnings strip, and a more useful recent admin-web audit block;
- extended the overview read model so one `section=overview` response now carries summary cards, segment counters, bounded metrics, warnings, and recent audit in one hobby-safe snapshot;
- kept the page strictly read-first: no polling, no cron dependency, no new dangerous actions.

Acceptance / notes:
- Overview stays hobby-safe and answers four founder questions quickly: system state, audience split, warnings, and where to drill next;
- no charts or heavy analytics were introduced in this step.

## STEP503 — User Card polish + operator usability

Date: 2026-04-02

Scope:
- strengthened `/admin/users/[id]` into a real operator screen with a denser header, account/access summary, recent activity summary, stronger note UX, and recent admin actions trace;
- preserved list context on back navigation via URL state (`q` / `segment`) so drilldown no longer resets the operator's place in the list;
- normalized note write behaviour (`blank => clear`) and tightened note audit semantics around `set_user_note` / `clear_user_note`.

Acceptance / notes:
- one user-card load still equals one `section=user` read request;
- the step stays hobby-safe and does not add payments/plan/segment mutation.


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


## STEP510 — Payments/operator follow-up hints polish

Date: 2026-04-02

Scope:
- extended the payments read surface with normalized operator follow-up semantics;
- added `followUpGroups` and `followUpQueue` to `getPaymentsSummary()`;
- added `followUp` to `getPaymentDetail()`;
- polished `/admin/payments` so rows now show a follow-up state and the sidebar surfaces a compact queue of cases;
- polished `/admin/payments/[id]` with a dedicated `Operator follow-up` block;
- added `scripts/smoke-admin-web-payments-followup-contract.js` and wired it into package + source preflight.

Acceptance / notes:
- step remains strictly read-only and hobby-safe;
- no new API entrypoints, no polling, no cron dependency, no retries/overrides/payout controls;
- follow-up guidance is constrained to safe next steps: payment detail → user card → runtime → bot/admin fallback.

## STEP511 — Web-admin login step split / auto-return polish

Date: 2026-04-02

Scope:
- locked the web-admin login surface into a clear two-step contract: `secret` first, then `Telegram approve / code` only;
- removed the visual loop where the user could think the secret was required again after challenge creation;
- made the Telegram approve page auto-return into web-admin so the browser can re-check the approved challenge and mint the session without another secret entry;
- extended source smoke coverage for the split-step login contract.

Acceptance / notes:
- auth contract stays the same (`secret -> Telegram approve/code -> session`);
- no new auth method, no DB changes, no route explosion.


## STEP512 — Operator Control Surface

Date: 2026-04-02

Scope:
- added shared Redis-backed operator control adapter `src/lib/operatorControls.js` so Telegram admin and web-admin read one source of truth;
- added `section=control_surface` to `api/admin-web-read.js` and embedded the same snapshot into `src/lib/adminWeb/runtime.js`;
- added a compact web-admin status bar plus Overview control/audit block in `scripts/admin-web.js` and `styles/admin-web.css`;
- rebuilt Telegram `Админка → Система` into a clearer `Control Surface` snapshot with safe toggles for web-login, payments accept, payments auto-apply, Match/Feat auto-apply, QStash fan-out, and payments fallback incident mode;
- added operator audit trail for toggle changes, including explicit fallback on/off audit events;
- guarded new web-admin login requests by the operator `Web-admin login` toggle;
- added `scripts/smoke-admin-control-surface-contract.js`, wired into package + source preflight, and refreshed the admin-system smoke contract.

Acceptance / notes:
- no DB migrations;
- no public-user flow changes;
- no destructive write actions added to web-admin;
- auth/session model preserved, with one new operator pause gate for fresh web-admin login requests.
