# 91 - LAUNCH READINESS

## No-go blockers

- `BOT_TOKEN` / `BOT_USERNAME` are not set
- `DATABASE_URL` is not set
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are not set
- `WEBHOOK_SECRET_TOKEN` is not set
- cron is used but `CRON_SECRET` is not set
- Vercel cron schedule was not reviewed for the target plan
- migrations were not run or `schema_migrations` is absent
- `/api/health` does not show healthy config + DB + Redis + migration status
- payments flow was not checked
- orphaned manual apply was not checked

## Pre-live checklist

## Target bot identity

- BotFather name: `KOL Deal — Crypto Collab Market`
- Bot username: `@KOLDealsBot`
- keep `BOT_USERNAME=KOLDealsBot` in env
- repo/artifact codename remains `CryptoCollabBot` for STEP continuity

### Environment
- `APP_ENV=prod`
- `SUPER_ADMIN_TG_IDS` filled
- `VERIFICATION_ENABLED` turned on only if moderation flow is ready

### Runtime
- webhook is set with `secret_token`
- `/api/health` (fast path) responds with healthy config + webhook + cron + DB + Redis only; it intentionally skips migrations, payment counters, and beta review
- `/api/health?full=1` remains available when migration status, payment counters, and beta review details are needed before a release decision
- cron endpoint responds only with the correct bearer
- `vercel.json` cron baseline is acceptable for the target Vercel plan and now keeps only daily `ops-alerts`; the old daily `giveaways-tick` backup entry is removed after the STEP198 cutover finalize soak window.
- primary giveaway cadence is an external QStash schedule calling `/api/cron/giveaways-tick` every 5 minutes with `Authorization: Bearer $CRON_SECRET` forwarded by QStash
- for the current target env this live-delivery check is already satisfied and the STEP198 cutover finalized the removal of the old Vercel giveaways backup cron; repeat the same check on any new env before treating its cadence baseline as live-confirmed

- `/` serves the static KOL Deal landing page
- landing primary CTA opens `@KOLDealsBot`
- landing must not interfere with `/api/*` routes or webhook delivery

## STEP082 release note

- offer bump cooldown is now enforced atomically in SQL rather than by a stale handler-side read alone
- during target-env QA, trigger bump twice quickly and confirm only one bump succeeds while the second tap receives cooldown feedback

## STEP083 release note

- opening a brand-new intro / Deal Room now claims a transaction-scoped advisory lock before the credit-spend path
- during target-env QA, tap the same intro twice quickly and confirm the second tap shows the busy/retry message with no duplicate charge and no duplicate Deal Room

### Functional smoke
- `/start`
- connect channel
- create offer
- publish offer success screen renders safely with HTML-sensitive labels such as `Micro (<10k)`
- final offer line accepts `@username`, `Contact: @username`, and direct links without duplicating the contact prefix
- market open / filters
- bump twice quickly -> only one bump succeeds and the second tap gets cooldown feedback sourced from DB truth
- intro open
- tap the same intro twice quickly -> only one open path wins; the second tap gets the busy/retry message and does not create a duplicate room or duplicate spend
- reply flow
- deal stage change
- proof screenshot / link
- pre-checkout rejects malformed payload / wrong amount / wrong currency
- payment apply once
- duplicate payment update does not double-apply
- missing Redis payment context -> ORPHANED -> admin apply

### Baseline ops / migration smoke
- `npm run test:webhook-runtime`
- `npm run test:moderator-reject-runtime`
- runtime-grade webhook control-plane gate executes the real repo scripts against a mock Telegram API and must stay green before live verification
- runtime-grade moderator reject-state gate proves `Reject -> Back` clears only `mod_verif_reject_reason` before normal text resumes
- runtime-grade payment/admin gate proves strict `pre_checkout_query` validation plus orphaned-manual-admin apply stay executable before live payment drills
- `npm run smoke:migrations`
- `npm run migrate:status`
- `npm run migrate` applies only pending files
- repeated `npm run migrate` exits with no pending migrations
- `/api/health` shows the fast operator summary (config + webhook/cron + DB + Redis + migrations + operator blockers/warnings)
- `/api/health?full=1` shows migrations, heavier payment-status counters, and beta-review sections when the operator needs deeper diagnostics
- admin `System` shows the same readiness class in one screen for super-admins
- `npm run verify:live` returns a green/yellow/red parity verdict in the target environment
- `npm run drill:live` completes the scripted STEP048 parity pass and leaves only the manual payment/admin drills
- STEP049 freeze confirms the automated target-env parity path is already green; remaining launch work is manual payment/admin exercising, not another blind repo patch

### Payments / orphaned-admin smoke
- `npm run smoke:payments`
- `npm run test:payments-admin-runtime`
- payment insert keeps duplicate protection on `telegram_payment_charge_id`
- `ORPHANED -> APPLYING` claim is guarded
- `ERROR -> ORPHANED` retry is guarded
- `APPLYING -> ORPHANED / IGNORED` unlock is guarded
- manual apply keeps force-check for amount mismatch
- supported payload branches remain in ledger compatibility: PRO / brand credits / brand plan / legacy matching / legacy featured

### Health / observability smoke
- `npm run smoke:health`
- health exposes missing-config summary without leaking secrets
- health exposes webhook / cron readiness
- health exposes DB / Redis / migrations summary
- health fast path stays cheap by skipping migrations, payment-status counters, and beta review until `/api/health?full=1` is requested
- bump cooldown remains atomic under near-simultaneous taps; the second bump attempt is rejected by DB truth rather than only UI timing
- health full path still exposes payment-status counters and beta-review details
- health exposes operator launch blockers / warnings and control-plane readiness
- degraded summary returns `503`

### Ops alerts smoke
- `npm run smoke:ops`
- ops alerts are throttled through Redis NX+EX
- ops cron can report config / DB / Redis / migrations / payment anomalies
- webhook exceptions send best-effort throttled alert
- giveaways cron exceptions send best-effort throttled alert

### Redis degradation / webhook idempotency smoke
- `npm run smoke:redis-hardening`
- duplicate Telegram webhook deliveries short-circuit on `update_id` when Redis dedupe is reachable
- high-risk mutations fail closed with a temporary-system message when Redis is unavailable
- safe read/navigation paths remain available if webhook dedupe itself is bypassed during Redis degradation

### Rate guards smoke
- `npm run smoke:guards`
- intro open is protected from rapid repeat taps
- parallel intro-open attempts fail fast with an explicit busy/retry path instead of waiting under DB lock contention
- proof link / screenshot submit is protected from rapid resends
- report submit is protected from rapid duplicate sends
- verification submit is protected from rapid duplicate sends
- admin payment mutate actions are protected from rapid repeat taps

### Moderator throttling smoke
- `npm run smoke:moderator-throttle`
- verification approve/reject actions are protected from rapid repeat taps
- moderation report freeze / close / resolve actions are protected from rapid repeat taps
- moderator throttling returns a temporary-system response instead of silently re-running when Redis is unavailable

### Deal flow smoke
- `npm run smoke:deals`
- Deal Room header shows stage + next actor + proof summary
- inbox keeps stage badges for scanning
- thread callbacks preserve back-navigation state instead of forcing inbox everywhere

### Proofs UX smoke
- `npm run smoke:proofs`
- proof link flow gives clearer invalid-input guidance
- proof history shows summary counters and direct add-actions
- screenshot save path links back into Proofs review
- proof detail view shows richer metadata

### Release discipline
- `npm run preflight`
- current STEP docs refresh is complete (`00_CURRENT_STATE` + work-history index + step card)
- `npm run smoke:hardening`
- preflight must pass before calling a snapshot release-ready
- live checks from `docs/92_RELEASE_PROTOCOL.md` remain mandatory after preflight
- rollback notes live in `docs/93_ROLLBACK.md`

### Catalog/profile rollout discipline
- keep `docs/21_PROFILE_CATALOG_V2.md` as the target shape before adding new catalog/profile fields
- expand schema additively; do not remove current `chain` / `audience_band` / `compensation_type` support
- do not add broad filter explosion before real usage proves value

### Beta wedge discipline
- keep `docs/30_CRYPTO_BETA_WEDGE.md` as the launchable-beta source of truth
- keep the first live wedge narrow: projects / exchanges / founders and creators / KOLs / channels
- sell Intro Credits + Project Plan + PRO clearly; do not re-expand legacy matching / featured into the main sales story
- keep the first-class deal set narrow: post / thread / pinned post / AMA / listing push / announcement pack
- do not promise escrow, wallet reputation, onchain scoring or full marketplace automation in the beta

### Verification/trust rollout discipline
- keep `docs/22_VERIFICATION_TIERS.md` as the trust-layer source of truth before public runtime expansion
- keep current ✅ badge backward-compatible until moderation practice is ready
- separate public trust labels from moderator-only caution flags


### Moderation / reporting smoke
- `npm run smoke:moderation`
- report prompt explains what happened + why it is risky
- report queue shows risk/action hints
- moderator report detail shows workspace context and recommended action
- moderator thread close uses moderator-safe close path


### Monetization semantics discipline
- keep `docs/24_MONETIZATION_MATRIX.md` as the source of truth for pricing surfaces
- do not blur Intro Credits, Project Plan and PRO in copy for active sales surfaces
- keep legacy matching / featured clearly marked as deprecated compatibility branches
- manual apply notes should remain explainable from the payload branch


### Admin finance smoke
- `npm run smoke:finance`
- admin payment queues show status summary counts
- user-specific payment view shows status summary counts
- payment detail card shows payload branch note + recovery hint


### Trust / reputation rollout discipline
- keep `docs/26_TRUST_REPUTATION_SURFACE.md` as the source of truth before public scoring is added
- separate operator-only caution flags from public trust labels
- do not add opaque scoring that operators cannot explain


### Matching / featured discipline
- keep `docs/27_MATCHING_FEATURED_QUALITY.md` as the deprecation source of truth
- do not sell standalone matching / featured from the main UI
- legacy featured never implies trust or moderation immunity
- legacy matching / featured must remain explainable to operators during manual recovery


### Analytics / counters discipline
- keep `docs/28_ANALYTICS_COUNTERS.md` as the first-launch counters baseline
- start with stable counters before any complex dashboard work
- avoid vanity analytics that add hot-path cost


### Audit / freeze discipline
- use `docs/94_AUDIT_PACK_FREEZE.md` as the handoff/audit freeze point
- after STEP020, prefer live validation over new speculative refactor

### Hardening backlog after launch
- tune alert thresholds from live data
- broader rate limits / abuse guards
- richer ops visibility beyond current health + alert baseline


## STEP024–STEP025 addendum

Webhook runtime must initialize grammY bot state before `handleUpdate` so first live updates after cold start do not fail with `Bot not initialized!`.

The generic `message:text` router must also pass slash-commands downstream; otherwise live webhooks can return 200 while `/start` is silently swallowed before the command handler runs.


## STEP026 public-surface addendum

Before calling the bot launch-ready for external crypto users, verify that the highest-visibility public surface is consistent in English:
- `/start` onboarding cards;
- main menu before and after channel connection;
- channel hub labels;
- profile labels (`Name / Topics / Contact / Region`);
- settings labels (`Public Network / Curator Access`);
- project-side entry wording (`For Projects / Exchanges`).


## STEP027 navigation addendum

Before calling the bot launch-ready for external crypto users, verify that the public callback surface feels deterministic instead of edit-stale:
- quick-start buttons always produce a visible transition or a fresh fallback message;
- top-level `My Channel / My Channels` entry matches the real workspace count;
- single-workspace users open directly into their channel hub;
- multi-workspace users open the channel list and can still add another channel;
- public channel hub order stays `Profile → Settings → Activity → PRO → Open Market`;
- Vercel logs show callback traces without fresh webhook 500s during this smoke.


## STEP028 runtime-recovery addendum

If the live database schema was created manually outside the repo migration runner, do not blindly replay SQL in production first.

Use this order:
- `npm run migrate:status`
- if `schema_migrations` is missing but the live schema already exists: `npm run migrate:adopt-live`
- `npm run migrate`
- repeat `npm run migrate` until there are no pending migrations
- confirm `/api/health` returns `ok:true` and no longer reports `migrations.recovery`

`migrate:adopt-live` is only for tracking repair on an already-existing live schema. Normal environments should still use the regular migration runner.


## STEP039 trust/proof runtime note

- public trust remains fact-based and explainable;
- only visible facts are used publicly: verification, closed deal rooms, proof-history presence;
- moderator notes stay operator-only;
- no feed-wide trust scoring and no opaque reputation layer are introduced.


## STEP040 launch wedge note

- launch packaging is now fixed in `docs/30_CRYPTO_BETA_WEDGE.md`;
- the public onboarding copy now states the two-sided crypto beta wedge more explicitly and keeps the deal set narrow;
- the owner launch checklist now ties preflight + live verification + one real creator/project walkthrough into one go/no-go path;
- the next move after this pack is controlled beta execution plus first-launch counters activation, not a broad redesign.


## STEP041 controlled-beta note

- controlled beta now has an explicit cohort marker via `BETA_COHORT_START_AT`;
- first-launch counters are now active on `/api/health`, admin `System` and `npm run beta:counters`;
- use these counters for the first cohort review instead of building a dashboard first;
- the next move after activation is a first cohort review loop plus a narrow hotfix pack, not a broad product rewrite.


## STEP042 review gate

After live verification and first-launch counters, run `npm run beta:review`.

Use the review status plus the hotfix pack to decide whether the cohort can widen.

Recommended env baseline for the first controlled cohort:

```env
BETA_COHORT_START_AT=2026-03-16T00:00:00Z
BX_FILTER_TTL_SEC=2592000
CURATOR_INVITE_TTL_SEC=600
GIVEAWAY_PUBLISH_LOCK_TTL_SEC=30
```

Do not widen or "tune" these TTLs casually; they are narrow operator knobs for filter persistence, curator invites and giveaway publish locking.

## STEP050 public-contact readiness note

Before calling this build launch-ready after STEP050, verify:
- public feed featured snippets show masked contact only and redact contact-like text in title/body;
- public offer detail shows masked contact plus unlock hint and redacts contact-like text in public title/description;
- public featured detail shows masked contact plus unlock hint and redacts contact-like text in public title/body;
- Deal Room header shows full direct contact once the intro has opened the room;
- owner-private surfaces still show full contact;
- intro open / proofs / verification / payments-admin flows remain unchanged.


## STEP051 UX / support readiness note

Before calling this build launch-ready after STEP051, verify:
- returning to the main menu shows the richer product home copy, not a bare `Menu` placeholder;
- FAQ and support buttons are visible on the main crypto surface;
- `/faq`, `/help` and `/support` work without swallowing later commands;
- support requests forward to `SUPPORT_CHAT_ID` when configured, otherwise to super-admin fallback targets;
- paired hub keyboards stay readable on-device (main menu, channel hub, market hub, Deal Room, admin/moderation hubs);
- STEP050 contact-policy behavior still holds on public-vs-trusted surfaces.


## STEP052 slash-command readiness note

Before calling this build launch-ready after STEP052, verify:
- `/menu` opens the richer main menu home;
- `/channel` opens the channel hub or the connect-channel prompt, depending on workspace state;
- `/market` opens the creator-side market surface and does not invent a project fallback;
- `/projects` opens the project / exchange surface without requiring a channel;
- `/verify` opens the current verification home;
- `/deals` opens the inbox / Deal Room list from both workspace users and project-only users;
- the new slash entries do not break STEP051 FAQ/support routing or STEP050 public-vs-trusted contact behavior.


## STEP053 support bridge readiness note

STEP053 keeps the main product surface unchanged but upgrades support from one-way intake to a small operator loop:

- support requests now persist into `support_threads`;
- the bot posts a support card into `SUPPORT_CHAT_ID` when configured;
- operator reply-to-card messages in that chat are bridged back to the user;
- `Close` marks the ticket closed and refreshes the card state;
- the admin support screen is overview-only and refresh-safe (no noisy no-op edit alerts).

Target-env acceptance still required after deploy:
- create one support request from a user;
- confirm the card lands in the support chat;
- reply to that card from the support chat and confirm the user receives the answer;
- close the ticket and confirm the card changes state cleanly;
- confirm OPS remains quiet on admin support refresh.

## STEP055 support UX polish note

STEP055 keeps the same support bridge data model and routing path but makes the operator/user experience materially cleaner:

- new support cards no longer show a redundant Reply popup button;
- the card itself now tells operators to use Telegram reply on the card message;
- the User button opens the requester profile directly;
- user-facing answers are delivered as branded KOL Deal Support bot messages instead of raw operator-signature dumps;
- close-ticket now sends a clear closure notice with the `/support` follow-up path.

Target-env verification should confirm:
- a fresh support card in `SUPPORT_CHAT_ID` shows the inline operator instruction;
- the User button opens the requester profile directly;
- reply-on-card still delivers a branded bot message to the user;
- closing the ticket updates the card and notifies the user.



## STEP056 offer publish UX hardening note

STEP056 keeps the same offer schema, limits, and posting mechanics but makes the creator-side supply loop much clearer:

- `Collab Market` now prioritizes `Post offer` + `My offers` above passive browsing actions;
- step `8/8` explicitly says that the next message publishes the offer immediately;
- the final step shows a short summary of the chosen signals before submission;
- after publish, the user lands on a dedicated success screen with `View offer`, `My offers`, `Post another`, `Feed`, and visible `Active offers: X/Y` inventory.

Target-env verification should confirm:
- the reordered market home is easy to scan on device;
- step `8/8` clearly communicates immediate posting;
- back/cancel still work from the final step;
- posting one offer lands on the dedicated success screen instead of dropping straight back into the generic market home;
- `View offer`, `My offers`, `Post another`, and `Feed` all route correctly from that success state.

## STEP058 acceptance

- Feed does not expose full creator handles
- Public offer detail shows display name plus masked handle
- Deal Room still shows full handle and full direct contact

## STEP059 acceptance

- Feed author line uses `By`, not `Creator:`
- Feed / matching use compact display names with clean ellipsis where needed
- verified discovery cards show a subtle `· verified` badge
- public detail still shows full display name plus masked handle
- Deal Room still shows full handle and full direct contact


## STEP060 docs/process canon sync note

STEP060 makes no runtime or schema change. Its purpose is to realign the launch/handoff canon with the actual STEP059 baseline so operators and future chats inherit one freeze point and one remaining-check list.

After STEP060, launch readiness still depends on manual target-env closure of:
- the support reply loop / close notice path from STEP053–STEP055;
- the creator publish final-step + success-screen routing from STEP056–STEP057;
- the public author-visibility policy on Feed/detail/matching vs Deal Room full identity from STEP058–STEP059;
- the older strict payment happy-path and orphaned-admin-apply drill.


## STEP062 — project-first quick entry

Source baseline now allows no-channel project-side entry into the market via `👀 Browse Market`, `/market`, `/projects`, tour-market, and `/start proj`. Connecting a channel remains required only for creator-side supply actions such as listing offers.


## STEP063 — conversion micro-pack

Source baseline now includes three small conversion clarifiers without adding new entities: Feed header shows active filters visibly (`Filters: ...`), public offer detail explains that `Open Intro` spends credits only to open a new Deal Room and replies inside the same room are free, and Deal Room now shows a short stage guide plus a tighter current-stage hint.


## STEP064 — paid multi-channel baseline

Source baseline now monetizes creator-side channel capacity without introducing new role/entity complexity: Free supports **1 connected channel**, PRO supports **up to 3 connected channels**, and the channel UX stays Telegram-native (`Current Channel`, `Switch Channel`, `Add Channel`) with the upgrade prompt shown only when a free owner tries to add the second channel.


### STEP077–STEP078 release gate
- keep `docs/98_STEP088_TARGET_ENV_PASS.md` attached to QA before calling a STEP077+ baseline launch-ready
- explicitly record PASS / FAIL / SKIPPED for moderator throttling and the full target-env release gate


## STEP084 acceptance

- Redis-degraded webhook dedupe no longer blindly allows explicit high-risk callback mutations through.
- Telegram `pre_checkout_query` and `successful_payment` updates are treated as high-risk during dedupe bypass and return a retryable failure instead of running without dedupe certainty.
- lower-risk navigation/read webhook traffic can still pass when dedupe itself is bypassed.
- `/api/health?full=1` exposes lightweight dedupe runtime counters so operators can see duplicate / bypass / blocked-high-risk decisions from the current runtime process.


## STEP085 acceptance

- `docs/15_NEW_CHAT_HANDOFF.md`, `docs/17_START_NEW_CHAT_PROMPT.md`, and `docs/94_AUDIT_PACK_FREEZE.md` all describe the same active source baseline.
- current docs freeze is STEP125, current source-confirmed runtime/code baseline is through STEP124, STEP125 itself is docs/pack-only, and the automated target-env pass is now recorded in `docs/98_STEP088_TARGET_ENV_PASS.md`; only the two manual payment checks remain before the release gate is fully closed.
- `docs/91_LAUNCH_READINESS.md` and `docs/92_RELEASE_PROTOCOL.md` mention fast/default `/api/health`, on-demand `/api/health?full=1`, and STEP084 dedupe counters consistently.
- stale local artifact `STEP067_target_env_local_check.log` is no longer part of the active freeze narrative.


## STEP086 acceptance

- `normalizeSnapshotMode()` preserves fast/default only when explicitly requested and keeps direct builder callers on full mode by default.
- fast `/api/health` is materially lighter than full health: it keeps config + webhook/cron + DB + Redis + operator summary, but skips migrations, payment counters, and beta review.
- `/api/health?full=1` still exposes migrations, payment counters, beta review, and dedupe runtime counters for operator-grade release diagnostics.
- health checks are time-bounded so DB / Redis / migration stalls fail visibly instead of hanging indefinitely.


## STEP087 acceptance

- public/discovery redaction strips zero-width obfuscation and normalizes spaced Telegram hosts such as `t . me/...` before masking.
- public economics text uses the same redaction boundary so `rate_range` cannot leak contact-like content on feed/public surfaces.
- public feed, featured, public offer detail, and quick-browse preview surfaces all stay on the redacted side of the boundary; Deal Room and owner-private surfaces stay raw.
- the public redaction smoke covers raw, spaced-host, zero-width, and public-economics cases.


## STEP089–STEP102 acceptance

- runtime degraded-webhook smoke proves duplicate / high-risk-block / low-risk-allow decisions through shared pure logic instead of source grep alone;
- slow-dependency health smoke proves labeled timeout behavior for fast/full health probes;
- public render integration smoke proves public featured / offer / quick-browse redaction boundaries with rendered fixtures;
- restore of an archived workspace is blocked when another active workspace already owns the same channel id;
- create/connect now blocks when another active workspace already owns the same `channel_id`;
- giveaway auto-draw now performs a final live eligibility recheck before winner commit and records shortage / truncation explicitly when fewer finally-eligible winners remain;
- the active pending live-pass checklist is `docs/98_STEP088_TARGET_ENV_PASS.md`, while `docs/97_STEP078_TARGET_ENV_PASS.md` stays historical.


## STEP099
- Workspace hard delete now has a cascade preview and transaction-scoped integrity locks.
- New smoke coverage: workspace delete integrity plus expanded crypto giveaway/airdrop copy surfaces (wizard, stats, log, reminder, publish, owner preview).


## STEP119 readiness note

Current repo-side giveaway baseline also includes:
- join-after-ended gating on participant join/recheck/reminder paths;
- giveaway-scoped draw locking before final live recheck/winner commit;
- public giveaway publish/results/reminder reward text routed through shared public-surface redaction;
- fixture-based giveaway render verification plus live checklist coverage for curator invite acceptance;
- reward-kind persistence/rendering plus legacy `reward_kind = null` compatibility smoke;
- shared single-giveaway auto-draw helper plus repo-side parallel draw single-writer proof;
- curator add owner-bound recheck and workspace-delete cascade source proof.
