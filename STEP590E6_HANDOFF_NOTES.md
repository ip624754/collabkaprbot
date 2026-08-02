# STEP590E6 Handoff Notes

- Baseline package: `1.3.30` (complete STEP590E5D tree).
- Result package: `1.3.31`.
- New domain: `src/bot/domains/userServices/`.
- Exact scope: 18 callbacks — support 3, verification 3, sharing 9, account 3.
- Ownership: 482 extracted / 78 legacy / 7 aliases / 0 unresolved.
- No SQL, ENV, API-route, callback-key, guard or visible-copy changes.
- Operator dependency/audit, Git push, Vercel Ready and bounded runtime smoke remain pending.
- Next architecture step: STEP590F `queries.js` repository decomposition with compatibility façade.
