# STEP588X3 — Broadcast Delivery Unknown-State Safety

**Date:** 2026-07-20
**Mode:** HEAVY / CRITICAL
**Risk score:** 16/20
**Parent baseline:** STEP588X2
**Status:** SOURCE READY / MIGRATION AND PRODUCTION CANARY PENDING

## 1. Objective

Prevent an automatic duplicate broadcast when Telegram may already have accepted a message but the local durable delivery receipt was not committed or acknowledged.

The core safety preference is:

```text
visible delivery_unknown
> automatic duplicate send
```

## 2. Previous defect

The previous worker could execute this sequence:

```text
Telegram send succeeds
→ DB mark sent fails
→ handler returns success or process terminates
→ row remains sending
→ stale row becomes claimable again
→ Telegram send repeats
```

The same ambiguity existed for transport timeouts and Telegram 5xx responses: those outcomes do not prove that Telegram rejected the request.

## 3. Implemented state machine

```text
queued / retry / deferred / quarantined
        ↓ atomic claim + delivery_attempt_id
      sending
        ├─ Telegram explicit success + durable receipt → sent
        ├─ Telegram explicit 4xx rejection → blocked / failed
        ├─ Telegram explicit 429 → deferred / quarantined
        ├─ timeout / network / 5xx → delivery_unknown
        ├─ send success + DB receipt ambiguity → delivery_unknown
        └─ stale sending → delivery_unknown
```

`delivery_unknown` is terminal for automatic workers. It is absent from every claimable and retryable status set.

## 4. Canonical runtime components

### Classification

`src/bot/broadcastDeliverySafety.js`

- extracts Telegram error code and description;
- distinguishes explicit rejection from ambiguous transport outcome;
- captures bounded Telegram message IDs;
- creates bounded unknown-state evidence.

### Durable receipt handling

`src/bot/broadcastDeliveryReceipt.js`

- retries only the DB receipt after confirmed Telegram success;
- never calls Telegram;
- reads durable state after a possible lost DB acknowledgement;
- falls back to `delivery_unknown`;
- exposes `sending_unconfirmed` honestly when the DB is completely unavailable.

### Database boundary

`src/db/queries.js`

- claims with a UUID attempt token;
- applies compare-and-set updates by attempt token;
- quarantines stale `sending` rows;
- excludes unknown rows from automatic claim/retry;
- records message IDs and reconciliation metadata;
- supports founder reconciliation without a resend operation.

### Callers

Both paths use the same helpers:

- `api/qstash/broadcast-deliver.js`;
- `src/bot/cron.js` legacy direct mode.

## 5. 429 atomicity

Distinct-recipient 429 accounting previously used separate `SADD → EXPIRE → SCARD` commands. It now executes as one Redis Lua operation. This prevents an interrupted sequence from leaving an unbounded set or returning a count inconsistent with the TTL update.

429 remains retryable because it is an explicit Telegram negative acknowledgement. Unknown-state behavior is reserved for outcomes where acceptance cannot be disproved.

## 6. Operator reconciliation

The Communications web-admin now exposes:

- total unknown delivery count;
- affected broadcast/user;
- attempt time and reason;
- captured Telegram message IDs when available;
- founder-only `sent` / `failed` reconciliation.

Reconciliation:

- requires a non-empty reason;
- writes admin audit;
- is compare-and-set from `delivery_unknown` only;
- has no resend action and cannot call Telegram.

## 7. Schema

Migration `049_broadcast_delivery_unknown_state.sql` adds:

- `delivery_attempt_id`;
- `delivery_unknown_at`;
- `telegram_message_ids`;
- `resolved_at`;
- `resolved_by_tg_id`;
- `resolution_note`;
- partial indexes for unknown rows and attempt lookup.

The migration is additive. Runtime must not be deployed before it.

## 8. Verified locally

- 35 executable unknown-state assertions PASS;
- 66 payment critical-path assertions PASS;
- 55 giveaway critical-path assertions PASS;
- 126/126 registered source checks PASS across one partial and two bounded invocations;
- 250/250 JavaScript syntax checks PASS;
- callback registry: 553 refs, 559 keys, 0 unresolved;
- action registry: 559 code actions, 559 registry actions, no drift;
- migration pack: 49 rows, no generation drift;
- dependency/runtime preflight PASS after local dependency install;
- package-lock consistency PASS;
- Vercel function budget remains 11/12.

## 9. Not verified

- migration 049 in production Neon;
- real QStash redelivery and timeout behavior;
- real Telegram send-success / DB-receipt failure;
- serverless hard termination after Telegram acceptance;
- live legacy cron mode;
- live founder reconciliation;
- production absence of duplicate delivery;
- npm vulnerability status: the audit endpoint returned HTTP 502, so no fresh audit claim is made;
- STEP588X1 and STEP588X2 production acceptance unless supplied separately;
- STEP586H1 24-hour observation.

## 10. Residual trade-offs

At-most-once safety can under-deliver in an ambiguous outcome. This is intentional: Telegram does not provide an idempotency key for ordinary Bot API sends, so automatic retry after uncertainty can create duplicates. The operator must reconcile using external evidence.

A completely unavailable database may leave a row as `sending`. Stale quarantine converts it to `delivery_unknown` when the database returns. It is never automatically resent.

## 11. Exit gate

Source exit gate is met:

```text
No automatic path can reclaim delivery_unknown or stale sending for another send.
```

Production exit gate remains open until migration, controlled canary, replay evidence and unknown-state observation are preserved.
