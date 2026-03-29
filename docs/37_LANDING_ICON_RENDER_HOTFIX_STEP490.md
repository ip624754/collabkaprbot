# STEP490 — Landing icon render hotfix

## Summary

STEP490 replaces unstable landing section SVG usage in user-facing cards and labels with fixed-size CSS background glyphs backed by local SVG assets.

Goal:
- stop icon overflow / giant render drift in live landing sections;
- preserve current landing layout and copy;
- keep gallery/modal/FAQ behavior unchanged.

## What changed

- `index.html`
  - replaced inline SVG/icon-sprite usage in landing sections with fixed-size `span.icon-glyph` wrappers;
  - removed inline sprite block from the page.
- `styles/landing.css`
  - added deterministic icon glyph rules using local `assets/icons/landing/*.svg` backgrounds;
  - hardened width/height/flex/overflow behavior for icon-bearing rows;
  - tightened label/badge wrapping in gallery and accordion rows.
- `scripts/smoke-landing-contract.js`
  - updated landing smoke to validate glyph-based icon contract instead of inline sprite contract.

## Scope guard

This step does **not** change:
- landing structure;
- landing copy;
- gallery/modal contract;
- FAQ behavior;
- bot runtime.

## Acceptance

- no oversized icons in `Кому подходит`;
- no oversized icons in `Что внутри бота`;
- no oversized icons in `Как это выглядит` headers;
- gallery cards remain aligned;
- accordion rows remain aligned;
- landing smoke passes.
