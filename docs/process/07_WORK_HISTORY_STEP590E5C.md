# STEP590E5C Work History

- Baseline: operator-pushed STEP590E5B commit `fe20572`.
- Extracted 26 live callbacks into `src/bot/domains/adminCommunications/`.
- Added four exact owners: communications home, notice management, outbox and message templates.
- Preserved `a:notice` as a separate user-facing legacy view action.
- Updated stale Admin Notice, Outbox, DM Templates and STEP590E5B source contracts to be domain-aware.
- Verified 184 STEP assertions, 2,965 router assertions, prior-domain matrix, source preflight and portable critical spine 6/6.
- No migration, ENV, API route, callback-key, guard or product-copy change.
