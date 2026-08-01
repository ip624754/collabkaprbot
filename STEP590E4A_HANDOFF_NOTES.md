# STEP590E4A Handoff Notes

- Baseline: operator-pushed STEP590E3C commit `858a0b1`, package `1.3.23`.
- Result package: `1.3.24`.
- New domain: `src/bot/domains/brands/`.
- Extracted: 38 actions — 10 Brand directory/filter and 28 Brand profile/Pass/Plan.
- Ownership: 323 extracted / 237 legacy / 7 aliases / 0 unresolved.
- `a:brand_buy` and `a:brand_plan_buy` remain payment-owned.
- Applications/deals remain STEP590E1-owned; team and curator actions remain for STEP590E4B/E4C.
- No migrations, ENV, API routes, callback keys, guards, prices or copy changes.
- Clean focused QA PASS; full `preflight:source` and portable critical spine 6/6 PASS under temporary execution-only `dotenv`/`@upstash/redis` shims. Shims and `node_modules` are excluded from artifacts.
- Operator must run clean `npm.cmd ci`, `npm.cmd audit`, full gates, commit/push, Vercel Ready check and bounded Telegram canary.
- Next bounded roadmap step after acceptance: STEP590E4B Brand Team & Manager Membership.
