# STEP510 — Payments/operator follow-up hints polish

## Goal
Polish the payments surface from a passive read-only table into a founder/operator-friendly follow-up workspace without adding any write actions.

## Scope
- keep `/admin/payments` read-only and hobby-safe;
- add normalized follow-up groups (`noAction`, `watch`, `review`, `urgent`);
- add a compact follow-up queue for the most relevant payment cases;
- add a clearer operator follow-up block in payment detail;
- improve payment hints so founder/operator knows where to go next: payment detail → user card → bot/admin fallback.

## What changed
- `src/lib/adminWeb/readModels.js`
  - added `buildPaymentFollowUp()`;
  - added `buildPaymentFollowUpGroups()`;
  - added `buildPaymentFollowUpQueue()`;
  - added `buildPaymentOperatorHints()`;
  - enriched `getPaymentsSummary()` with `followUpGroups` and `followUpQueue`;
  - enriched `getPaymentDetail()` with a normalized `followUp` block.
- `scripts/admin-web.js`
  - payments table now shows a follow-up column;
  - payments sidebar now shows follow-up groups and a queue of payment cases;
  - payment detail now shows an explicit operator follow-up block.
- added `scripts/smoke-admin-web-payments-followup-contract.js` and wired it into package/preflight.

## Safety
- still one main read request on `/admin/payments`;
- still one main read request on `/admin/payments/[id]`;
- still no polling;
- still no cron dependency;
- still no write controls, retries, overrides, or payout actions.
