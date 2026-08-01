# Work History — STEP590E3A

## 2026-08-01 — Workspace Control, Roles & Folders Domain Extraction

- approval: `APPROVE STEP590E3A_WORKSPACE_CONTROL_ROLES_AND_FOLDERS_DOMAIN_EXTRACTION`;
- mode: HEAVY, risk 16/20;
- created `src/bot/domains/workspaces/`;
- extracted 22 Workspace-control and 17 folder/editor callbacks from the legacy dispatcher;
- added `workspace_control` and `workspace_folders` executable route owners;
- retained payment-owned `a:ws_pro_buy` and lead-owned `a:wsp_lead_new`;
- cumulative ownership moved from 209/351 to 248/312;
- added executable and source-contract tests plus preflight wiring;
- package moved from 1.3.20 to 1.3.21;
- migrations/ENV/API routes/product copy unchanged;
- focused QA PASS; dependency-bound full preflight remains operator-side because the artifact environment has no `node_modules`.
