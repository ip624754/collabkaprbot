# STEP590C4 — Critical Broadcast Callback Bounded Domain

**Mode:** HEAVY / broadcast architecture
**Risk Score:** 17/20
**Baseline:** STEP590C3
**Runtime posture:** behavior-preserving callback extraction; no schema or ENV change

## Objective

Move the critical broadcast callback transport/composition layer out of `src/bot/bot.js` into one bounded domain while preserving the existing idempotent job-creation boundary, delivery receipts, unknown-state handling, operator controls, rate limits and Telegram UX.

The STEP does not introduce a second delivery worker or recipient-send implementation. Canonical delivery safety remains outside the new domain:

```text
src/bot/broadcastDeliveryReceipt.js
src/bot/broadcastDeliverySafety.js
src/bot/cron.js and existing worker/job execution paths
```

The new domain creates or manages broadcast records only through injected existing services. It does not deliver recipient messages directly.

## Domain structure

```text
src/bot/domains/broadcasts/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js
```

## Extracted ownership

### `broadcast_composer` — 17 actions

```text
a:bc_start
a:bc_start_adv
a:bc_simple_text
a:bc_simple_media
a:bc_simple_media_clear
a:bc_simple_button
a:bc_simple_btn_preset
a:bc_simple_btn_custom
a:bc_simple_btn_clear
a:bc_preview
a:bc_send_q
a:bc_simple_clear
a:bc_buttons
a:bc_tpl_gw
a:bc_tpl_bp
a:bc_tpl_offer
a:bc_btn_done
```

### `broadcast_audience` — 2 actions

```text
a:bc_simple_audience
a:bc_audience
```

### `broadcast_dispatch` — 2 actions

```text
a:bc_confirm
a:bc_cancel
```

### `broadcast_operations` — 7 actions

```text
a:bc_list
a:bc_view
a:bc_blocked
a:bc_pause
a:bc_resume
a:bc_stop
a:admin_bc_qstash_toggle
```

All routes remain `post_user`. Every action still requires the canonical application user and the existing Telegram-admin authorization boundary.

## Preserved invariants

```text
one broadcast action → one executable owner
actual operator = ctx.from.id
confirm rate limit key = rl:bc_confirm:<telegram id>
job creation → db.createBroadcastIdempotent()
statement timeout = 8000 ms
double-click dedup window = 45 seconds
preview sends only to the operator path
no direct recipient ctx.api.sendMessage path in the domain
no direct QStash publish path in the domain
unknown delivery state remains governed by the existing receipt/safety core
pause → PAUSED
resume → RUNNING
stop → STOPPED
operator control id = broadcast_qstash_fanout
extracted handlers cannot decline into legacy
callback keys and user copy remain stable
```

## Ownership delta

```text
STEP590C3 extracted owners: 29
STEP590C4 extracted owners: 57
STEP590C3 legacy owners:    531
STEP590C4 legacy owners:    503
```

The explicit legacy surface decreases by 28 callback actions.

## Dependency boundary

The domain may depend on injected Telegram composition capabilities and existing database/control services. It must not import or reimplement:

- recipient delivery loops;
- QStash publish implementation;
- delivery receipt classification;
- unknown-state retry policy;
- cron scheduling;
- broadcast schema or migration logic.

## Explicit non-goals

- no broadcast schema change;
- no delivery algorithm change;
- no QStash/cron refactor;
- no audience-definition redesign;
- no callback-key rename;
- no Telegram copy redesign;
- no automatic live broadcast canary;
- no ORM, TypeScript or framework migration.
