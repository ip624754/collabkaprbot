# 16 — RELEASE CHECKLIST — 2026-02-20

## Before deploy
- `node --check src/bot/bot.js`
- `node --check src/bot/cron.js`
- `npm run test:redact` (sanitizer regression: links/emails/@/phones)
- Ensure env vars exist (see `.env.example`)
- If schema changed: run migrations via `node migrations/run.js`

## After deploy
- Run `smoke-tests_short.md`
- Check `/api/health` once:
  - `ok:true`
  - `cron.*` присутствует
  - если включён audit throttle → `audit.throttle.suppressed_*` не ломает ответ
- Trigger cron endpoints manually once (with CRON_SECRET) to confirm:
  - lock works
  - no duplicates
- Watch logs for first 24h:
  - no repeated winners
  - no “act: a:brand_profile_edit” errors

