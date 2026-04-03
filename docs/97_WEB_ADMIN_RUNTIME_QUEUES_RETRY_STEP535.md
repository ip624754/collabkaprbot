# STEP535 — Web Admin Runtime queues / retry clarity

## Goal

Make `/admin/runtime` explain queue backlog, retry pressure, cooldown windows, and stuck delivery signals without adding write actions.

## What changed

- `src/lib/adminWeb/runtime.js` now gathers a bounded queue/retry snapshot from existing Redis-backed runtime signals:
  - ops digest pending buffer,
  - audit buffer queue/inflight/cooldown,
  - broadcast pending deliveries + retry cooldown,
  - retry monitor (`mon.retry`),
  - QStash `reschedule_failed` and `official_publish_stuck`.
- Added `queueClarity` to the runtime summary with:
  - `summaryCards`
  - `lanes`
  - `retrySignals`
- `scripts/admin-web.js` now renders a dedicated `Очереди и retry` section between the incident strip and lower runtime surfaces.
- `styles/admin-web.css` adds dedicated queue/retry grids so Runtime stays compact and scan-friendly.
- Added `scripts/smoke-admin-web-runtime-queues-contract.js` and wired it into `package.json`.

## Intentional non-goals

- no retry buttons;
- no queue mutations;
- no background polling;
- no live logs;
- no secret leakage.

## Acceptance

- operator can see backlog / cooldown / retry pressure without opening health JSON;
- queue lanes stay bounded and explainable;
- Runtime remains read-only and hobby-safe.
