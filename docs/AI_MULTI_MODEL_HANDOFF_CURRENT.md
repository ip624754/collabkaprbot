# AI Multi-Model Handoff — STEP590E3B Current Truth

**Baseline:** STEP590E3A source artifact
**Package:** `1.3.22`
**Status:** SOURCE IMPLEMENTATION COMPLETE / FOCUSED QA PASS / OPERATOR DEPENDENCY GATE PENDING

## Verified

- Workspace domain has four exact post-user owners: control, folders, profile and social;
- 27 profile/Instagram/share callback actions moved from legacy ownership;
- corresponding inline callback branches are removed from `bot.js`;
- ownership is 275 extracted / 285 legacy / 7 aliases / 0 unresolved;
- `workspace_profile` owns 18 actions and `workspace_social` owns 9;
- payment checkout `a:ws_pro_buy` remains payment-owned;
- public lead action `a:wsp_lead_new` remains lead-owned;
- dedicated Workspace, router, registry and prior domain suites pass;
- hidden/misconfigured Instagram OAuth remains fail-closed and configured start writes one bounded token in executable tests;
- no SQL, ENV, API route, callback-key, visible-copy or profile/OAuth redesign was introduced.

## Environment-limited evidence

- focused source gates and 338/338 JavaScript syntax checks pass without third-party runtime dependencies;
- source preflight reaches the dependency-bound safety suite; portable critical spine is 5/6;
- the unpacked artifact has no installed dependencies; `npm ci` is blocked by the environment mirror 404 for `xtend@4.0.2`, and the remaining source/spine failure is missing `dotenv`;
- no temporary dependency shim is included in the artifacts.

## Not verified

- clean operator `npm ci` and `npm audit` on the exact artifact;
- complete source preflight and portable critical spine;
- Git commit/origin parity after applying the artifact;
- Vercel deployment and production Workspace profile/Instagram/share behavior.

## Next

After the operator local gate and bounded STEP590E3B deployment, prepare `STEP590E3C — Directory Search & Public Workspace Domain Extraction`.
