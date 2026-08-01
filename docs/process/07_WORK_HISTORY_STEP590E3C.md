# Work History — STEP590E3C

**Date:** 2026-08-01

- accepted STEP590E3C Directory Search & Public Workspace scope;
- established exact STEP590E3B_R2 artifact baseline;
- corrected planning truth: `a:wsp_contact_unlock` was legacy-owned, producing a ten-action scope;
- added `src/bot/domains/directory/` with search and public Workspace owners;
- moved six `a:pm_*` callbacks and four `a:wsp_*` callbacks from `bot.js`;
- retained `a:wsp_lead_new` in `lead_acquisition`;
- preserved `pay / queue_first` metadata and canonical durable unlock/retry/lock helpers;
- updated callback route contracts and ownership registry;
- updated stale source contracts to inspect the new canonical domain location;
- raised package from `1.3.22` to `1.3.23`;
- cumulative ownership moved from 275/285 to 285/275;
- focused and prior-domain QA PASS;
- artifact-environment dependency gate remains blocked by package mirror/missing `dotenv` and is delegated to operator local QA.
