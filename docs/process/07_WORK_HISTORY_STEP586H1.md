# STEP586H1 — Neon Cron Connection Resilience & Alert Truth

**Date:** 2026-07-18
**Status:** IMPLEMENTED / LOCAL QA PASS / 24H PRODUCTION OBSERVATION PENDING

## Trigger

Production support and Vercel logs showed `broadcast-tick` and `giveaways-tick` failing at `pool.connect()` with connection timeout/termination errors. One job exception also produced both `cron_failed` and `cron_router_failed` alerts.

## Changes

- added one bounded retry around physical DB acquisition/session init only;
- added transient DB error classification and retry metadata;
- destroy connection-broken clients instead of returning them to the pool;
- kept query execution outside retry, preventing SQL replay;
- added job-owned cron failure marker so router suppresses duplicate alert;
- added explicit per-job/error-class OPS dedup identity;
- added failed cron `last_run` breadcrumbs;
- added secret-free DB config/warnings to health;
- added executable STEP586H1 source/runtime contract;
- added 24-hour production observation runbook.

## No changes

No schema, migration, SQL business logic, cron job ordering, giveaway mechanics, broadcast mechanics, payment logic, callbacks or API endpoint were changed.

## QA

- STEP586H1 contract PASS;
- health full/fast PASS;
- dependency/runtime preflight PASS;
- runtime proof spine PASS;
- callback consistency PASS;
- package-lock PASS;
- npm audit high PASS;
- affected syntax PASS.

## Truth boundary

Production effect is not yet verified. STEP587/release promotion remains blocked until the 24-hour observation reaches PASS.
