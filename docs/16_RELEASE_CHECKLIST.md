# 16 — RELEASE CHECKLIST — 2026-02-23

## Before deploy
- `node --check src/bot/bot.js`
- `node --check src/bot/cron.js`
- Ensure env vars exist (see `docs/00_CURRENT_STATE.md` → ENV)
- If schema changed: run migrations via `node migrations/run.js`

## After deploy
- Run `smoke-tests_short.md`
- Check `/api/health` once:
  - `ok:true`
  - `cron.*` присутствует
  - если включён audit throttle → `audit.throttle.suppressed_*` не ломает ответ
- Support (SUPPORT_CHAT_ID):
  - бот добавлен в support-группу и имеет права админа (иначе reply-flow может не работать)
  - тест: пользователь → 💬 Поддержка → тикет в группе → шаблон (✅ Принято) отправляет ответ
  - тест: ✍️ Ответить → reply на подсказку → ответ уходит пользователю + подтверждение ✅
- Ops alerts: `/api/health` показывает `ops.silent` и `ops.pending` (Redis-only)

- Trigger cron endpoints manually once (with CRON_SECRET) to confirm:
  - lock works
  - no duplicates
- Watch logs for first 24h:
  - no repeated winners
  - no “act: a:brand_profile_edit” errors

