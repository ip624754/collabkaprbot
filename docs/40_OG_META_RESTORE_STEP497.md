# STEP497 — OG meta/share contract restore

## Goal
Restore landing social preview by pointing `index.html` meta back to the actual shipping OG asset and dimensions.

## Scope
- `index.html` only for runtime/share behavior
- docs sync in `docs/00_CURRENT_STATE.md` and `docs/process/07_WORK_HISTORY_2026_03.md`

## Changes
- `og:image` -> `https://collabkaprbot.vercel.app/assets/social/collabka-og-1200x630.png`
- `twitter:image` -> same canonical PNG
- `og:image:width` -> `1200`
- `og:image:height` -> `630`

## Acceptance
- social preview contract points to an existing file
- dimensions in meta match the canonical asset
- `node scripts/smoke-landing-contract.js` passes

## Risk
Low. Landing/share-meta only. No runtime/bot flow changes.
