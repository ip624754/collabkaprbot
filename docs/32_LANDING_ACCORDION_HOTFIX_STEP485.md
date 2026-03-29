# STEP485 — Landing accordion hotfix

## Goal
Fix landing accordion behavior so `Что внутри бота` and `FAQ` render collapsed by default and hidden copy stays fully clipped until user click.

## Scope
- `index.html`
- `styles/landing.css`
- `scripts/smoke-landing-contract.js`
- docs sync only

## Changes
- removed default-open accordion state from shipped markup;
- wrapped accordion body copy in `.accordion-panel-inner`;
- hardened collapse CSS with `min-height: 0` and inner overflow clipping;
- extended landing smoke to fail on default-open markup.

## Acceptance
- no accordion card ships with `.open`;
- no accordion button ships with `aria-expanded=true`;
- collapsed cards do not leak text;
- open/close still works on click.
