# STEP535R QA checklist

## Scope
- Fix backend contact-unlock query drift causing `column_profile_contact_does_not_exist`.
- Keep QStash truth honest: existing QStash env is not the root cause of this specific retry error.
- Add source smoke so contact-unlock cannot silently regress back to reading profile fields from `workspaces`.

## Source checks run
- `node --check src/db/queries.js` ✅
- `node --check scripts/preflight.js` ✅
- `node scripts/smoke-contact-unlock-workspace-settings-contract.js` ✅
- `npm run smoke:contact-unlock-workspace-settings-contract` ✅

## Broader preflight
- `npm run preflight:source` ⚠️ partial pass
- Result: progressed through broad source checks and failed later on pre-existing unrelated smoke `smoke-admin-web-users-priority-rail-contract`.
- This failure is outside STEP535R scope and unrelated to the backend contact-unlock query fix.

## Runtime verification still needed after deploy
1. Trigger the exact contact-unlock / monetization retry path that previously produced `column_profile_contact_does_not_exist`.
2. Re-open `/admin/runtime` and confirm that retry/source signal no longer reports that error.
3. Confirm QStash surfaces remain healthy with existing Vercel env:
   - `QSTASH_URL`
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`

## Residual risk
- If production DB is missing `workspace_settings` rows for some workspaces, the query now safely left-joins and can still return null contact fields; that is acceptable and should surface as `no_contacts`, not as a missing column crash.
- If runtime still shows retry failures after deploy, the next suspect is a different query path, not QStash env.
