# STEP491 — OG Preview Implementation

## Goal
Ship a dedicated social preview package for the public Collabka PR landing instead of relying on an automatic first-screen capture.

## What was added
- `assets/social/collabka-og-1200x630.png` — primary OG preview card (exact 1200x630, optimized PNG)
- `assets/social/collabka-og-1200x630.webp` — optimized WEBP parallel asset
- `docs/assets/STEP491_OG_PREVIEW_PROMPT.txt` — reusable generation prompt

## Meta contract
`index.html` now ships:
- `og:title`
- `og:site_name`
- `og:description`
- `og:type`
- `og:url`
- `og:image`
- `og:image:width`
- `og:image:height`
- `og:image:alt`
- `twitter:card`
- `twitter:title`
- `twitter:description`
- `twitter:image`
- `twitter:image:alt`

`og:image` and `twitter:image` now point to the dedicated 1200x630 social card under `assets/social/`.

## Composition
Primary card:
- dark premium background
- white Collabka mark + wordmark
- large Russian product title block on the left
- one calm product fragment on the right
- support line and bot handle in the lower-left

## Scope
Landing-only public preview improvement.
No bot runtime, callbacks, DB, monetization, accept/reply/unlock, or workflow-path logic changed.


## STEP496 refresh note

The original alt OG variants were retired after the approved 2026-03 exact 1200x630 export was finalized. The landing now ships a single stable primary OG PNG plus a WEBP parallel asset under the same canonical filenames.
