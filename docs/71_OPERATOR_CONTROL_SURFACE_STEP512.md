# STEP512 — Operator Control Surface

## Goal
Add one narrow operator control plane layer without widening the auth/API surface:
- web-admin gets a compact top status bar with the current runtime toggles;
- Telegram admin gets one disciplined control surface with 5 safe toggles + fallback incident mode;
- both surfaces read the same Redis-backed source of truth;
- toggle changes append an audit trail (`who / what / when`).

## Scope
Included:
- new shared read/write helper `src/lib/operatorControls.js`;
- web-admin read endpoint `section=control_surface`;
- top status bar + overview audit panel in `scripts/admin-web.js` and `styles/admin-web.css`;
- Telegram `Админка → Control Surface` polish for safe toggles;
- audit logging for Telegram toggle changes;
- login gate control for new web-admin login requests.

Not included:
- destructive bulk actions;
- money-path rewrites;
- retry queue mutation;
- publish-path redesign;
- new DB schema or migrations.

## Safe toggles in this step
1. `Web-admin login`
2. `Приём платежей`
3. `Автовыдача платежей`
4. `Match/Feat auto-apply`
5. `QStash fan-out`
6. `Payments fallback` (incident-mode override, separate runtime tool with audit)

## Source of truth
Redis keys stay the runtime truth.
This step adds one shared adapter so web-admin and Telegram admin read the same summary and write through one helper for the persistent toggles.

## Audit trail
Recent toggle changes are appended into a Redis list and surfaced in web-admin Overview / status bar.
Fallback incident-mode changes are also logged explicitly.

## Risk framing
Low-to-medium risk:
- touches admin/operator control flows only;
- no DB schema changes;
- no public-user flow changes;
- one auth-path change only: new web-login requests can now be paused intentionally by operator toggle.
