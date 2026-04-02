# STEP533A — Web-admin Users final interaction hotfix

## Goal
Close the last confusing `Users` micro-interactions before shifting the main admin UX work into `Runtime`.

## Scope
- remove duplicate local state badges inside Users rails;
- replace common blocking browser alerts with lightweight in-app toast feedback;
- switch clipboard copying to execCommand-first fallback to reduce browser permission prompts;
- make preset cards feel more explicit (`Применить срез`) and compress explanatory text.

## What changed
- `scripts/admin-web.js`
  - added `showToast()` / `ensureToastHost()`;
  - changed Users copy/link/export feedback from `alert()` to in-app toasts;
  - removed duplicate rail-level state badges;
  - simplified preset / compare / follow-up / bulk copy;
  - added preset CTA copy and immediate toast feedback for sort/cohort/preset interactions.
- `styles/admin-web.css`
  - added toast styles;
  - refined pill styling;
  - added preset CTA styling.
- `package.json`
  - added `smoke:admin-web-users-final-interaction-contract`.
- `scripts/smoke-admin-web-users-final-interaction-contract.js`
  - validates toast host, preset CTA, and the removal of the old duplicate order badge.

## Acceptance
- sort / cohort / preset interactions feel immediate and explicit;
- common copy/export flows stop using blocking browser alerts;
- Users rails carry less duplicated state and less explanatory noise;
- no new write-paths or server contract changes.
