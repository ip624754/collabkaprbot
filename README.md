# CryptoCollabBot (v1.1.8) — deployed as @KOLDealsBot

Telegram bot to run a **crypto collab marketplace** between:
- **Projects / exchanges / founders** (they pay)
- **KOLs / channels / creators** (we maximize onboarding + deal flow)

Built on a simple core:
- **Workspaces = your channels / media** (connect once, then manage profile)
- **Project-first quick entry** (`/start proj` or `🏷 Projects / Exchanges`) without attaching a channel
- **Collab Market** (public feed + filters)
- **Deal Room** (project ↔ creator thread) with **shared deal stages**
- **Profile/catalog v2 plan** now fixed in `docs/21_PROFILE_CATALOG_V2.md` before schema expansion
- **Proofs**: screenshot + link (required), optional UTM/ref proof
- **Verification**: request → moderation → ✅ badge in feed/inbox
- **Verification tier plan** now fixed in `docs/22_VERIFICATION_TIERS.md` before trust-layer expansion
- **Moderation/reporting clarity baseline** now fixed in `docs/23_MODERATION_REPORTING.md`
- **Monetization matrix** now fixed in `docs/24_MONETIZATION_MATRIX.md`
- **Admin finance pack** now fixed in `docs/25_ADMIN_FINANCE_PACK.md`
- **Trust / reputation surface target** now fixed in `docs/26_TRUST_REPUTATION_SURFACE.md`
- **Matching / Featured deprecation rules** now fixed in `docs/27_MATCHING_FEATURED_QUALITY.md`
- **Monetization simplification / deprecation baseline** now fixed in `docs/29_MONETIZATION_SIMPLIFICATION.md`
- **Crypto beta wedge / launch pack** now fixed in `docs/30_CRYPTO_BETA_WEDGE.md`
- **Controlled beta execution rules** now fixed in `docs/31_CONTROLLED_BETA_EXECUTION.md`
- **Analytics / product counters spec** now fixed in `docs/28_ANALYTICS_COUNTERS.md`
- **Audit / handoff freeze point** now fixed in `docs/94_AUDIT_PACK_FREEZE.md`
- **Monetization (Stars)**:
  - **Intro Credits** to unlock a *new* Deal Room (anti-spam)
  - **Brand PRO** for project-side workflow / CRM / compare expansion
  - **No new standalone Smart Matching / Featured sales**; old payloads remain supported in ledger/admin compatibility
  - **Current user-facing monetization model**: `⭐ Creator PRO` + `⭐ Brand PRO` + `🎫 Intro Credits`
  - **Admin safety**: **Orphaned payments** triage + **Payment log** + manual apply (super-admin only)
- (Optional, kept for future) **Giveaways module**

- **Landing page**: root `/` now serves a static Telegram-first KOL Deal product page with a direct CTA into `@KOLDealsBot`

> Stack: Node.js (ESM) + grammY + Postgres + Upstash Redis (REST). Designed for Vercel.

---


## Deployed Telegram identity baseline

Current deployed Telegram identity baseline for the repo bootstrap path:
- **Bot name:** `KOL Deal — Crypto Collab Market`
- **Bot username:** `@KOLDealsBot`
- **Bot description:** `Crypto deal room for projects, exchanges, founders, creators and channels.`
- **Bot about:** `Post, thread, AMA, listing and announcement deals.`

Repository codename and artifact naming stay **CryptoCollabBot** for STEP continuity.

---


## 0) Start with docs
Read the repository docs kernel first:
- `docs/README.md`
- `docs/00_BOOT.md`
- `docs/00_CURRENT_STATE.md`
- `docs/MODE_NOTES.md`
- `docs/15_NEW_CHAT_HANDOFF.md`
- `docs/18_ARTIFACT_PROTOCOL.md`

This repository is operated in the mode:
**Protocol ON: Jobs / Vitalik / Woz / Durov. Zero regressions.**

Current discovery rule: no-channel users can browse from the project side first; connecting a channel is required only when listing creator-side supply.

Fixed project mode:
- **Primary:** Telegram SaaS / Bot
- **Secondary:** Crypto / Token / Launch
- **Execution overlay for repo changes:** Engineering Ops

---

## 1) Environment variables
Set these in Vercel (and locally if you run migrations or polling outside Vercel):
- `APP_ENV` = `prod` or `dev`
- `BOT_TOKEN`, `BOT_USERNAME` (`KOLDealsBot` in the current live identity baseline)
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Required security in every env: `WEBHOOK_SECRET_TOKEN`
- Optional security: `CRON_SECRET`, `BOT_ID`, `SUPER_ADMIN_TG_IDS`
- Controlled beta window: `BETA_COHORT_START_AT` (set it explicitly before the first live cohort; `.env.example` now includes a concrete ISO example)
- TTL hygiene knobs: `BX_FILTER_TTL_SEC`, `CURATOR_INVITE_TTL_SEC`, `GIVEAWAY_PUBLISH_LOCK_TTL_SEC`
- Pricing/limits (Stars + anti-spam):
  - `PRO_STARS_PRICE`, `PRO_DURATION_DAYS`
  - `INTRO_COST_PER_INTRO`
  - `INTRO_DAILY_LIMIT`, `INTRO_DAILY_LIMIT_UNVERIFIED`

> **Variant:** crypto is the default (`BOT_VARIANT` defaults to `crypto`).

---

## 2) DB migration
Run once (locally) or via a one-off script in your environment:

```bash
npm i
npm run migrate
```

Useful migration commands:

```bash
npm run migrate:status
npm run smoke:migrations
npm run smoke:payments
npm run smoke:health
npm run smoke:ops
npm run smoke:guards
npm run preflight
npm run verify:live
npm run drill:live
npm run beta:counters
npm run smoke:moderation
npm run smoke:finance
```

`npm run migrate` now:
- bootstraps `schema_migrations` if needed;
- uses a Postgres advisory lock to prevent concurrent runs;
- records filename + checksum for each applied SQL file;
- fails closed on migration drift instead of silently re-running changed SQL.

SQL is in `migrations/*.sql`.

---

## 3) Deploy to Vercel
1) Push repo to GitHub
2) Import to Vercel
3) Set env vars

Webhook endpoint:
- `POST /api/webhook`

Health check:
- `GET /api/health`
- returns config/webhook/cron readiness plus DB, Redis, `schema_migrations` and payment-status summary
- returns `503` until required config is present, DB and Redis are reachable, and `schema_migrations` exists

Ops alerts cron:
- `POST /api/cron/ops-alerts` with `Authorization: Bearer $CRON_SECRET`
- sends throttled Telegram alerts to `SUPER_ADMIN_TG_IDS` on config/runtime/payment anomalies
- `vercel.json` now keeps only `ops-alerts` on a daily operator digest. Since STEP196 and the observed soak window finalized in STEP198, giveaway cadence is driven solely by an external QStash schedule that calls the same `POST /api/cron/giveaways-tick` endpoint every 5 minutes while preserving the existing bearer-auth + Redis-lock contract.

Release discipline:
- run `npm run preflight` before treating a snapshot as release-ready
- preflight now includes a runtime-grade webhook control-plane integration test via a local mock Telegram API
- preflight now also includes a runtime-grade payments/admin integration test covering strict Stars validation plus the orphaned-manual-apply path via stubbed bot/db dependencies
- then complete live checks from `docs/92_RELEASE_PROTOCOL.md`, including `npm run verify:live` for the one-screen health/webhook parity verdict and `npm run drill:live` for the scripted STEP048 parity drill
- current docs freeze: **STEP200**; current source-confirmed runtime/code baseline is **through STEP199** (**STEP200** is docs-only active ops/docs narrative cleanup only) and the automated target-env pass remains recorded in `docs/98_STEP088_TARGET_ENV_PASS.md`
- target env is aligned through migration `020_giveaway_reward_kind.sql` with `Pending: 0`
- STEP126–STEP128 then tighten prompt/source-truth sync, public-offer profile redaction, and degraded-webhook risk classification without changing payment flow shape
- remaining live checks for the current baseline are now the two manual payment checks only (one strict payment happy-path and one orphaned-admin-apply drill); giveaway cadence is already live-confirmed through the QStash cutover path.
- before controlled beta review, keep `BETA_COHORT_START_AT` set (current example `2026-03-16T00:00:00Z`) and run `npm run beta:counters` / `npm run beta:review`

---

## 4) Set Telegram webhook
After deploy, set `APP_BASE_URL=https://YOUR_VERCEL_DOMAIN` in the target environment, then run:

```bash
npm run webhook:set
```

Or manually:

```bash
curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$APP_BASE_URL/api/webhook" \
  -d "secret_token=$WEBHOOK_SECRET_TOKEN"
```

`WEBHOOK_SECRET_TOKEN` is validated inside `api/webhook.js` via the `X-Telegram-Bot-Api-Secret-Token` header.

## 4a) Webhook ops helpers

Repo-level webhook helpers now exist:

```bash
npm run webhook:set
npm run webhook:info
npm run webhook:delete
```

`/api/health` is an operator readiness/status surface and is **not** proof that Telegram currently has an active webhook installed. In STEP035 it also exposes operator launch blockers/warnings, control-plane readiness and deprecated compatibility-surface visibility.

## 4b) Local dev polling safety

Local long-polling is isolated from production. Use a dedicated `DEV_BOT_TOKEN` only:

```bash
DEV_BOT_TOKEN=... npm run dev
```

`scripts/dev-polling.js` refuses to start if `DEV_BOT_TOKEN` is missing or matches the production `BOT_TOKEN`.

For local/mock control-plane verification, the webhook scripts also support optional `TELEGRAM_API_BASE_URL` override; production still defaults to `https://api.telegram.org`.

---

## 5) Cron tick (optional)
If you keep giveaways or any scheduled tasks, call:
- `POST /api/cron/giveaways-tick` with header `Authorization: Bearer $CRON_SECRET`

`vercel.json` now keeps only the daily `ops-alerts` cron. Giveaway cadence is fully cut over to an external QStash schedule calling the same endpoint every 5 minutes while keeping `Authorization: Bearer $CRON_SECRET` and the existing Redis lock semantics intact.

Release discipline now also includes a STEP047 runtime-grade payment/admin gate: `npm run test:payments-admin-runtime` executes the live `bot.js` payment helpers through extracted runtime functions so strict Stars validation and orphaned-admin recovery stay covered before live verification.

- For controlled beta review, run `npm run beta:counters` and `npm run beta:review` after deploy.

### STEP196 QStash cadence helper

Use the repo helper to upsert the external QStash schedule that drives giveaway cadence:

```bash
export QSTASH_URL=https://qstash-us-east-1.upstash.io
export QSTASH_TOKEN=...
export APP_BASE_URL=https://YOUR_VERCEL_DOMAIN
export CRON_SECRET=...
export QSTASH_GIVEAWAYS_CRON='*/5 * * * *'
bash scripts/qstash_upsert_giveaways_tick_schedule.sh
```

This helper keeps the live contract narrow:
- QStash calls the existing `POST /api/cron/giveaways-tick` endpoint
- destination auth stays `Authorization: Bearer $CRON_SECRET` via `Upstash-Forward-Authorization`
- `vercel.json` no longer carries a giveaways backup cron after the observed QStash soak window closed cleanly in STEP198
- do not move `CRON_SECRET` into a query string

## STEP128 freeze note

Current repo/docs freeze point after STEP126–STEP128:
- source runtime/code baseline now includes STEP126–STEP128 on top of the earlier STEP109–STEP124 hardening wave;
- STEP126 syncs the start-prompt layer to the recorded live-pass truth: automated target-env verification is green through STEP124 and only the two manual payment checks remain;
- STEP127 redacts workspace profile v2 free-text on the public offer surface through the shared public-surface policy;
- STEP128 treats the charge-bearing `a:bx_msg` intro-open callback as explicit high-risk during dedupe bypass, so degraded Redis mode cannot open a paid intro path without dedupe certainty;
- target env remains aligned through `020_giveaway_reward_kind.sql`, public-only verify/drill is green, and full/read-only live parity is green.

- STEP185 — giveaway scope IA cleanup.


- STEP186: participant `gw_` deep-links now open the public giveaway screen instead of the owner-only access diagnostic surface.

## STEP188
- Added giveaway End now status guard. Owner UI now hides manual end for non-endable statuses and handler refuses rollback from WINNERS_DRAWN / RESULTS_PUBLISHED back to ENDED.

## STEP189
- giveaway contract cleanup: removed the dead `gwo_` payload path, made manual results publish explicit for owner-created giveaways, and tightened stale post-deadline `gw_check` UX.
