# 16 — RELEASE CHECKLIST — 2026-02-20

## Before deploy
- `node --check src/bot/bot.js`
- `node --check src/bot/cron.js`
- `npm run test:redact` (sanitizer regression: links/emails/@/phones)
- `npm run actions:check` (registry covers all callback actions; fail-closed guard is strict)
- Ensure env vars exist (see `.env.example`)
  - Если включаешь QStash fan-out для рассылок (`sys:broadcast_qstash_fanout=1`):
    - `QSTASH_TOKEN`
    - `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY`
    - `PUBLIC_BASE_URL` (или корректный `VERCEL_URL` fallback)
  - Runbook: `docs/17_QSTASH_RUNBOOK.md`
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

