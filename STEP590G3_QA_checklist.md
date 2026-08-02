# STEP590G3 QA Checklist

## Source and compatibility

- [x] Package bumped `1.3.35 → 1.3.36` with package-lock parity.
- [x] Four existing API paths preserved.
- [x] Four raw-body configs preserved through ESM re-export.
- [x] Four default handlers preserved.
- [x] Ping test seams preserved.
- [x] No new API routes, ENV, migrations, SQL or callbacks.
- [x] Function budget remains 11.

## Critical invariants

- [x] QStash signature missing/invalid fail-closed paths preserved.
- [x] Monetization actions and exactly-once DB capability calls preserved.
- [x] Payment fallback validation/apply and lock-release paths preserved.
- [x] Orphaned autoheal depth/dedup chain preserved.
- [x] Official publish reserve/deliver/locked retry preserved.
- [x] Official publish verify/self-heal/reschedule preserved.
- [x] QStash ping breadcrumbs and test dependency seams preserved.

## Executed QA

- [x] STEP590G3 focused test: 99 assertions PASS.
- [x] Compatibility handler contract PASS.
- [x] Real ESM route graphs 4/4 PASS.
- [x] Monetization and official-publish focused regressions PASS.
- [x] Runtime proof spine PASS.
- [x] STEP590G2 regression: 108 assertions PASS.
- [x] STEP590G1 regression: 162 assertions PASS.
- [x] STEP590F repository regression: 278 assertions PASS.
- [x] Portable critical spine: 6/6 PASS.
- [x] `preflight:source` PASS.
- [x] Function budget PASS: 11/12, delta 0.
- [x] PATCH/HOTFIX/FULL exact parity PASS (1,064 files).
- [x] `git diff --check` PASS.
- [ ] Clean `npm ci`: operator required; artifact environment mirror returned `xtend@4.0.2` 404.
- [ ] `npm audit`: operator required after clean install.
- [ ] Production deployment and signed canaries: operator required.
