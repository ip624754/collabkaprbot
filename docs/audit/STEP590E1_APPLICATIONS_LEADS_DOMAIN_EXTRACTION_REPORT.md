# STEP590E1 — Applications & Leads Domain Extraction Report

## Verdict

**SOURCE READY / PRODUCTION APPLICATIONS-LEADS CANARY PENDING**

## Scope

The STEP extracts 53 callback actions from the legacy callback body into six explicit executable route owners. No schema, ENV, pricing, lifecycle-state or user-copy redesign is included.

## Changed runtime surface

- added `src/bot/domains/applications/`;
- added `src/bot/domains/leads/`;
- registered six route IDs in the callback contracts and ownership registry;
- injected bounded capability objects from `src/bot/bot.js`;
- removed the corresponding inline branches from `src/bot/bot.js`;
- retained existing renderers, mutation helpers and repositories as the canonical business implementation.

## Boundary decisions

### `a:wsp_lead_new`

This action was previously adjacent to public workspace/profile routing but is the canonical mutation-entry target used by `a:send_request_to_creator`. Both actions now belong to `lead_acquisition`, preserving payload normalization and avoiding a hidden cross-domain fall-through.

### `a:ca`

The lead-specific audit action is now owned by `lead_audit`. The generic curation action `a:cur_audit` remains legacy-owned for STEP590E4.

## Source evidence

- application/lead executable tests: 302 assertions PASS;
- callback ownership/reachability: 2,574 assertions PASS;
- action registry: 560/560 PASS;
- callback consistency: 120 extracted, 440 legacy, 0 unresolved;
- previous bounded-domain suites: PASS;
- payment critical: 66 PASS;
- giveaway critical: 55 PASS;
- broadcast unknown-state critical: 35 PASS;
- admin-auth critical: 63 PASS;
- health/privacy critical: 52 PASS;
- bounded-safety critical: 36 PASS under declared dependency shims;
- portable critical spine: 6/6 PASS under declared dependency shims;
- JavaScript syntax: 316/316 PASS before documentation packaging;
- source preflight: PASS under declared dependency shims.

## Environment boundary

A clean `npm ci` was attempted and failed because the available internal package mirror returned HTTP 404 for `xtend@4.0.2`. Temporary no-op shims for declared external packages were used only to execute source-oriented bounded-safety/preflight/portable-spine checks and were removed before artifact packaging.

This does not prove a project dependency defect, and it does not replace operator-side `npm ci`, `npm audit` or live integration evidence.

## Not verified

- clean dependency installation in the implementation environment;
- live Vercel deployment of STEP590E1;
- live application submission, acceptance, reply or deal-stage mutation;
- live lead creation, assignment, note, reply or status mutation;
- external Redis/PostgreSQL/Telegram behavior in shim-assisted runs.

## Rollback

Code rollback to exact STEP590D is possible because no persistent contract changed. Before rollback, preserve any application/lead/audit rows created after deployment. Do not rewrite durable workflow history solely to match an older code package.
