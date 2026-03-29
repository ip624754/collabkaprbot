# STEP489 — Landing icon hardening

## Goal
Fix oversized/sprawled landing icons by replacing external icon image refs with inline SVG sprite usage and tightening icon sizing rules.

## What changed
- landing icons now render through inline `<symbol>` sprite in `index.html`
- target icon classes (`micro-icon`, `landing-icon`, `accordion-icon`, `screen-icon`) now have fixed min/max sizes
- icon containers (`icon-pill`, `accordion-label`, `screen-head`) were hardened against overflow drift
- smoke contract updated to enforce sprite-based icon rendering

## Why
External SVG image refs were vulnerable to inconsistent sizing/caching drift on the live page. Inline sprite usage makes icon sizing deterministic and keeps the landing visually consistent.

## Scope
Landing only. No bot runtime, no Telegram UI, no product logic.
