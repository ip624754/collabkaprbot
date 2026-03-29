# STEP486 — Landing visual polish pack

Status: source-confirmed.

## Goal
Replace the mixed raw/schematic `Как это выглядит` block with product-grade visual cards built from real Telegram screens.

## Scope
Landing-only:
- `index.html`
- `styles/landing.css`
- `scripts/smoke-landing-contract.js`
- `assets/screenshots/*`
- docs canon updates

No bot runtime, callbacks, DB, monetization, accept/reply/stage logic, or hot-path queries changed.

## What changed
- Rebuilt the `Как это выглядит` section around 4 polished visual cards:
  - `Домашняя`
  - `Каталог брендов`
  - `Фильтры брендов`
  - `Диалог и стадия сделки`
- Replaced placeholder/schematic cards with polished compositions derived from real bot screenshots.
- Added new landing assets:
  - `assets/screenshots/home-surface-polished.png`
  - `assets/screenshots/catalog-surface-polished.png`
  - `assets/screenshots/filters-surface-polished.png`
  - `assets/screenshots/deal-surface-polished.png`
- Updated captions so the section explains product value instead of just showing raw UI.
- Tightened landing smoke so old placeholder previews and raw `brand-filters-live.png` usage cannot silently return.

## Why
The landing already explains the product well, but the previous `Как это выглядит` block mixed one raw screenshot with schematic placeholders. This step moves the section closer to a premium product presentation while keeping the proof layer anchored in real bot screens.

## QA
- verified new assets exist
- `npm run smoke:landing-contract`
- `node --check scripts/landing.js`
- landing-only step; live browser verification required after deploy
