# STEP535A — Web admin Users preset/copy polish

Date: 2026-04-03

Goal:
- remove the remaining ambiguity around Users presets;
- make preset cards feel like immediate operator actions instead of passive tiles;
- reduce clipboard permission friction by adding a manual in-app copy fallback instead of relying on browser prompts only;
- calm down basket/meta pills visually.

Scope:
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `package.json`
- `scripts/smoke-admin-web-users-preset-copy-polish-contract.js`
- docs canon updates

Changes:
- Added `focusUsersWorkingSlice()` so preset clicks visibly return attention to the active Users working slice.
- Strengthened preset card affordance: clearer CTA (`Открыть срез` / `Сейчас открыт`), `aria-pressed`, stronger active state.
- Added a lightweight in-app manual copy sheet (`awCopySheetHost`) used when browser auto-copy is unavailable.
- Updated Users preset/copy helper text so the section explains immediate switching instead of vague “нажми карточку”.
- Tightened `.aw-basket-pill` so utility/meta pills stop collapsing into awkward round bubbles on narrower widths.

Acceptance:
- preset cards read like one-click actions;
- after preset click the user can immediately see that the slice changed;
- bulk/row/view copy has a non-blocking in-app fallback instead of dead-ending on browser restrictions;
- no server/data contract changes.

QA:
- `node --check scripts/admin-web.js`
- `node --check scripts/smoke-admin-web-users-preset-copy-polish-contract.js`
- `npm run smoke:admin-web-users-preset-copy-polish-contract`
- `npm run smoke:admin-web-users-final-interaction-contract`
- `npm run smoke:admin-web-users-saved-presets-contract`
- `npm run smoke:admin-web-users-followup-rail-contract`
- `npm run smoke:admin-web-users-compare-pin-rail-contract`
- `npm run smoke:admin-web-runtime-queues-contract`
- `npm run smoke:admin-web-shell-contract`
