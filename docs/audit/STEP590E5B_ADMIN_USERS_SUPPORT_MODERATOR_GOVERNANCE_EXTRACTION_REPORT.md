# STEP590E5B Extraction Report

## Result

- 38 live callbacks moved from the legacy post-user dispatcher into four bounded owners.
- cumulative ownership: 407 extracted / 153 legacy / 7 aliases / 0 unresolved.
- package version: 1.3.28.
- no deleted files, migrations, ENV changes or deployable API entrypoints.

## Verification

- STEP590E5B executable tests: 266 assertions PASS;
- router ownership/reachability: 2,965 assertions PASS;
- registry: 560/560 PASS;
- all previous extracted-domain suites PASS;
- source preflight PASS under temporary execution-only dependency shims;
- portable critical spine 6/6 PASS;
- final tree contains no `node_modules` or shim package.

## Source-contract recovery

Three pre-existing contracts were coupled to callback bodies inside `bot.js`. They now read the relevant bounded domain files while continuing to check the unchanged render/input-mode functions in `bot.js`:

- admin users;
- admin user card and notes;
- admin audit/metrics/moderator governance.

## Residual operator gates

Clean `npm ci`, `npm audit`, Git commit/push, Vercel Ready and bounded Telegram admin smoke remain operator-side.
