# Work History — 2026-04

## STEP501 — Web Admin User Card usable v1

Что сделано:
- upgraded `/admin/users/[id]` into a read-first operator card with summary header, profile, access/signals, activity, operator note, and recent admin-action blocks;
- `src/lib/adminWeb/readModels.js` extended `getUserDetail(...)` to return one aggregated `userDetail` snapshot with `account`, `access`, `activity`, `note`, and `recentAdminAudit` sections;
- `api/admin-web-write.js` hardened note writes: blank input now normalizes to clear, audit actions are emitted as `set_user_note` / `clear_user_note`, and old/new note snapshots are attached to the audit payload;
- `scripts/admin-web.js` user card UX rebuilt around one useful operator drilldown instead of a thin raw dump;
- added `scripts/smoke-admin-web-user-card-contract.js`, wired into `package.json` + `scripts/preflight.js`;
- removed stale legacy `api/admin-web/*` split handlers from the uploaded baseline so repo state once again matches the STEP500A Hobby-safe collapsed contract.

Что важно:
- scope stays hobby-safe and read-first: one primary read request, no polling, no cron dependency;
- no dangerous writes were added: no payments, no deal mutations, no channel rebinding, no segment/plan edits;
- Telegram-admin remains the fallback/control surface; web admin only gains a stronger read/useful drilldown layer.

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
