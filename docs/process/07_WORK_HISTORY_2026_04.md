# Work History — 2026-04

## STEP500A — Web Admin Hobby-safe API collapse

Что сделано:
- split admin-web serverless surface collapsed into three Hobby-safe entrypoints: `api/admin-web-auth.js`, `api/admin-web-read.js`, `api/admin-web-write.js`;
- Telegram approve decision flow moved under the same auth dispatcher via `action=decision`;
- legacy `/api/admin-web/*` route files removed from `api/` to get the deployment back under the Vercel Hobby 12-function limit;
- `scripts/admin-web.js` repointed to aggregated `action=` / `section=` endpoints without changing `/admin` page URLs or visible shell UX;
- `scripts/smoke-admin-web-shell-contract.js` updated to guard the collapsed handler contract and assert legacy split routes are gone;
- `scripts/check-function-budget.js` changed from fail-at-11 to explicit Hobby max=12 logic, then wired into `package.json` + `scripts/preflight.js` so function-budget drift is caught before deploy.

Что важно:
- auth model unchanged: shared secret → Telegram approve / OTP code → secure session cookie;
- read/write model unchanged: Overview / Users / User Card / Runtime + safe note set/clear only;
- scope stays hobby-safe: no polling, no cron dependency, no deal/payment/runtime hot mutations, no Telegram-user-facing path changes.

## STEP499 — Web Admin Shell v1 (Hobby-safe)

Что сделано:
- добавлен первый web-admin shell под `/admin` через rewrite в `admin.html`;
- добавлены admin-only client files: `styles/admin-web.css`, `scripts/admin-web.js`;
- реализованы Redis-backed auth/session/audit helpers в `src/lib/adminWeb/*`;
- реализованы `/api/admin-web/*` endpoints для auth, overview, users, user detail, user note, runtime;
- auth flow: shared secret → Telegram approve/code → secure session cookie;
- read models построены read-first: `overviewSummary`, `usersList`, `userDetail`, `runtimeSummary`;
- safe write surface ограничен user note set/clear через тот же Redis note contract, что уже использует Telegram-admin;
- добавлен source smoke `scripts/smoke-admin-web-shell-contract.js`, wired в `package.json` и `scripts/preflight.js`.

Что важно:
- шаг сделан без нового framework слоя и без migrations;
- challenges/sessions/recent admin-web audit intentionally Redis-backed для минимального blast radius;
- web admin остаётся sidecar operator console, не заменой Telegram-admin;
- нет polling, нет cron dependency, нет dangerous writes.

Collateral low-risk fix:
- `index.html` синхронизирован с реально существующим OG asset `assets/social/collabka-og-1200x630.png` и width/height `1200x630`, потому что в пользовательском baseline repo оставался stale meta path `collabka-og.png`.
