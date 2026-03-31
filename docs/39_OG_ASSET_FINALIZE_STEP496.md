# STEP496 — OG asset finalize and cleanup

## Goal
Finalize the public landing OG asset pack around one approved exact 1200x630 master, reduce PNG weight without visible degradation, and remove stale alternate OG files.

## Scope
- replace `assets/social/collabka-og-1200x630.png` with the approved exact 1200x630 export
- replace `assets/social/collabka-og-1200x630.webp` with the matching WEBP export
- remove `collabka-og-1200x630-alt.png` and `collabka-og-1200x630-alt.webp`
- tighten `scripts/smoke-landing-contract.js` to require only the canonical OG pair
- update docs to reflect the simplified social asset contract

## Out of scope
- no landing layout redesign
- no bot runtime, callbacks, DB, monetization, accept/reply/unlock, or workflow-path logic changes

## Acceptance
- OG PNG and WEBP exist under stable canonical names
- PNG is exact 1200x630 and optimized
- landing meta still points to the canonical PNG
- alt OG files are removed from the repo
- landing smoke contract passes
