# STEP495 — OG preview refresh and cleanup

## Goal
Replace the previous OG/social preview pack with the newly approved wide polished visual, clean the legacy asset set, and keep the landing meta/smoke contract aligned with the actual shipped files.

## What changed
- Replaced the previous OG asset pack with:
  - `assets/social/collabka-og.png`
  - `assets/social/collabka-og.webp`
- Removed legacy files:
  - `assets/social/collabka-og-1200x630.png`
  - `assets/social/collabka-og-1200x630.webp`
  - `assets/social/collabka-og-1200x630-alt.png`
  - `assets/social/collabka-og-1200x630-alt.webp`
- Updated `index.html` Open Graph and Twitter image references to the new stable asset name.
- Updated OG image dimensions in meta tags to match the approved source visual (`1730x908`).
- Updated `scripts/smoke-landing-contract.js` so source QA validates the new asset names and actual meta contract.

## Why this shape
The approved social preview visual was accepted as a finished composition and intentionally kept without destructive recrop. To avoid misleading file names and stale alternates, the repo now ships one stable primary social asset under a neutral filename (`collabka-og`).

## Scope
Landing/share-preview only.
No bot runtime, callbacks, DB, monetization, accept/reply/unlock, or workflow-path logic changed.
