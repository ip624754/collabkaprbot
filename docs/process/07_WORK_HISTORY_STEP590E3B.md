# Work History — STEP590E3B

## 2026-08-01 — Workspace Profile, Instagram & Sharing Domain Extraction

- approval: operator directed progression to `STEP590E3B — Workspace Profile, Instagram & Sharing`;
- mode: HEAVY, risk 14/20;
- added `workspace_profile` and `workspace_social` executable route owners;
- extracted 18 profile/contact callbacks and 9 Instagram/share callbacks from the legacy dispatcher;
- retained payment-owned `a:ws_pro_buy`, lead-owned `a:wsp_lead_new` and all STEP590E3C public/directory actions;
- cumulative ownership moved from 248/312 to 275/285;
- added executable and source-contract tests plus preflight wiring;
- package moved from 1.3.21 to 1.3.22;
- migrations/ENV/API routes/callback keys/product copy unchanged;
- focused QA PASS; dependency-bound full preflight remains operator-side because the artifact environment has no installed dependencies.
