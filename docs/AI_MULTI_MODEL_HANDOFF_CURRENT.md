# AI Multi-Model Handoff — STEP586H1 Current Truth

**Current baseline:** STEP586H1 — Neon Cron Connection Resilience & Alert Truth
**Parent:** STEP586H
**Live status:** local QA PASS; 24-hour production observation pending

## Verified now

- bounded one-retry connection acquisition/session-init wrapper;
- no automatic SQL or whole-job replay;
- dead-client destruction;
- DB error classification and retry metadata;
- one job-owned cron alert with router duplicate suppression;
- per-job/error-class dedup identity;
- failed cron last-run breadcrumbs;
- secret-free health database config/warnings;
- source/runtime contracts pass locally.

## Not verified

- production Neon convergence after deploy;
- external cron schedule staggering;
- 24-hour last-run continuity;
- real support digest result;
- live giveaway/broadcast catch-up.

## Immediate next action

Deploy STEP586H1 and execute `docs/operations/STEP586H1_NEON_CRON_24H_OBSERVATION_RUNBOOK.md`. Do not open STEP587 until the evidence decision is PASS.

## Do not do

- add multiple retries;
- retry SQL or a full cron body;
- increase pool max;
- hide final failures;
- expose connection strings in evidence.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586H1_NEON_CRON_CONNECTION_RESILIENCE_ALERT_TRUTH_REPORT.md`
3. `docs/operations/STEP586H1_NEON_CRON_24H_OBSERVATION_RUNBOOK.md`
4. `docs/process/07_WORK_HISTORY_STEP586H1.md`
5. `docs/SYSTEM_INVARIANTS.md`
6. `docs/RISK_REGISTRY.md`

---

## Historical handoff snapshots

# Historical snapshot — STEP586H

**Current baseline:** STEP586H — Live Telegram Acceptance and Mobile Copy Pass
**Parent:** STEP586G — Admin and Operator Vocabulary
**Live status:** remote Telegram evidence not yet executed

## Verified now

- deterministic evidence tooling covers seven required Telegram paths;
- exact deployment + bot acknowledgement is required before evidence initialization;
- no path can PASS without actual labels, screenshot/transcript evidence and three mobile checks;
- unapproved Stars purchase, invite spend or real broadcast evidence is rejected;
- obvious secrets are rejected from evidence files;
- static bounded button labels above 34 visible characters are blocked by source lint;
- source-confirmed long labels were shortened without callback or behavior changes;
- STEP586H local contract and source mobile audit pass.

## Not verified

- Vercel Preview deployment;
- live creator, brand, invite, paid, recovery and operator paths;
- actual phone wrapping and message density;
- Stars invoice rendering;
- real screenshots/transcripts;
- remote STEP584 evidence;
- production.

## Immediate next action

Deploy STEP586H to preview/staging and run `docs/operations/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_RUNBOOK.md`.

Do not open another copy wave until the finalized evidence pack is PASS or contains a source-reproduced defect that needs a narrow fix.

## Do not do yet

- claim live-green from source checks;
- use production purchases or broadcasts for convenience;
- change callbacks, permissions, prices or state machines;
- broad bot/admin redesign;
- broad `bot.js` extraction.

## Working lenses

- Jobs: one clear result per screen.
- Vitalik: no live claim without evidence.
- Woz: smallest reliable acceptance surface.
- Durov: phone-first Telegram flow.
- Toly: runnable operator workflow.
- Armani: coherent evidence and presentation.
- samczsun: no secret leakage or accidental spend.
- Hasu: BLOCKED is better than false confidence.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_MOBILE_COPY_REPORT.md`
3. `docs/operations/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_RUNBOOK.md`
4. `docs/product/COLLABKA_COPY_SYSTEM.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586H.md`

---

# Historical snapshot — STEP586G

**Current baseline:** STEP586G — Admin and Operator Vocabulary
**Parent:** STEP586F — Access, Error and Empty-State Recovery
**Live status:** not reverified in STEP586G

## Verified now

- Telegram admin and web-admin use aligned human-readable vocabulary for communications, outgoing messages, templates, moderation, audit, giveaways and delivery skips;
- status, diagnosis and operator action are separated;
- exact Redis, QStash, raw status, reason-code, callback and table diagnostics remain available;
- signed login decisions and machine values remain `approve / deny`;
- callback IDs, action-registry guards, audience values, permissions, queue behavior, payments, schema and migrations are unchanged;
- STEP586G, affected operator contracts and STEP586A–F regressions pass locally.

## Not verified

- live Telegram admin traversal or mobile wrapping;
- live web-admin rendering;
- Vercel Preview/production;
- live Redis, QStash or Neon diagnostics;
- real moderator/operator comprehension;
- remote STEP584 staging evidence.

## Immediate next STEP

`STEP586H_LIVE_TELEGRAM_ACCEPTANCE_AND_MOBILE_COPY_PASS`

Run a bounded live acceptance pass. Capture evidence for Telegram admin, web-admin communications, mobile labels, moderation, outgoing messages and one diagnostic failure state. Do not add product functionality.

## Do not do yet

- broad admin redesign;
- callback or permission changes;
- removal of raw diagnostics needed for production repair;
- payment, invite, deal or giveaway mechanism changes;
- claim live-green from source checks.

## Working lenses

- Jobs: one clear outcome, no UX debris.
- Vitalik: mechanism truth and auditable evidence.
- Woz: smallest reliable engineering surface.
- Durov: Telegram-native speed and leverage.
- Toly: ship under real constraints.
- Armani: coherent, polished artifacts.
- samczsun: abuse paths and adversarial review.
- Hasu: sober risk, incentives and cost of error.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586G_ADMIN_OPERATOR_VOCABULARY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586G.md`

# Historical snapshot — STEP586F

**Current baseline:** STEP586F — Access, Error and Empty-State Recovery
**Parent:** STEP586E — Monetization and Paid Product Clarity
**Live status:** not reverified in STEP586F

## Verified now

- a shared immutable recovery taxonomy covers channel, application, dialog, offer, giveaway, folder, role and generic failures;
- ordinary-user recovery does not disclose whether a private object exists, was deleted or belongs to another actor;
- recovery buttons return to existing list/menu surfaces and do not bypass authoritative access checks;
- selected empty states include a title, a source-backed reason and one next action;
- selected infrastructure details are removed from user copy and retained in structured `[copy_safety]` diagnostics;
- non-admin curator workspace rendering proves membership in the requested workspace before unrestricted detail lookup;
- the legacy curator workspace route has an explicit curator/admin gate;
- callback identities, schema, payment mechanics, invite economics, deal mechanics and giveaway mechanics are unchanged;
- STEP586F and regression contracts pass locally; the full 223-file JavaScript syntax surface passes separately.

## Security finding resolved

The curator workspace renderer previously loaded unrestricted workspace details before proving membership in that specific workspace. A crafted callback could therefore confirm private workspace detail before the intended boundary. STEP586F moves specific membership proof ahead of unrestricted lookup for non-admin actors and returns neutral recovery on failure. Live exploitation was not tested.

## Not verified

- live Telegram traversal or mobile wrapping;
- Vercel Preview/production;
- live Neon/Redis/QStash behavior;
- production stale-data combinations;
- remote STEP584 staging evidence;
- real-user comprehension.

## Immediate next STEP

`STEP586G_ADMIN_OPERATOR_VOCABULARY`

Make primary operator actions readable while preserving exact diagnostic vocabulary. Do not redesign controls or change privileges.

## Do not do yet

- broad admin redesign;
- global replacement of remaining `Нет доступа.` strings;
- permission changes hidden inside copy cleanup;
- payment, invite, deal or giveaway mechanism changes;
- broad `bot.js` rewrite;
- claim live-green from source checks.

## Working lenses

- Jobs: one clear outcome, no UX debris.
- Vitalik: mechanism truth and auditable evidence.
- Woz: smallest reliable engineering surface.
- Durov: Telegram-native speed and leverage.
- Toly: ship under real constraints.
- Armani: coherent, polished artifacts.
- samczsun: abuse paths and adversarial review.
- Hasu: sober risk, incentives and cost of error.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586F_ACCESS_ERROR_EMPTY_STATE_RECOVERY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586F.md`
