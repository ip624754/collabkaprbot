# STEP579 — Security Hardening Micro-Pack

Тип: narrow security hardening / source-confirmed micro-pack  
Риск: low  
Миграции: нет

## Что сделано

- `api/webhook.js` переведён с plain string compare на `timingSafeEq(...)` для `x-telegram-bot-api-secret-token`.
- `api/cron_router.js` приведён к тому же контракту для `CRON_SECRET`, чтобы secret-bearing public endpoints использовали один constant-time pattern.
- В `src/bot/bot.js` задокументирована truth boundary вокруг `_degradedClickGuard`: это best-effort load shedding only, а не primary correctness invariant; реальные destructive paths уже защищены downstream DB/advisory locks.
- В `src/db/queries.js` сохранён и явно прокомментирован fail-fast path `{ status: 'locked' }` для `pg_try_advisory_xact_lock(...)` внутри atomic giveaway draw.
- В `src/bot/cron.js` добавлена явная ветка `if (r.status === 'locked')`, чтобы этот path читался как intentional non-drawn result, а не как случайный silent ignore.
- Добавлен source smoke `scripts/smoke-security-hardening-contract.js`.

## Что сознательно НЕ менялось

- Никакой extraction wave по `bot.js` / `queries.js`.
- Никакого broad rewrite degraded-mode / invite / giveaway flows.
- Никаких миграций, reward-logic, ledger, webhook/runtime redesign.

## Source-confirmed вывод

- Webhook / cron secret compares теперь timing-safe.
- `_degradedClickGuard` покрывает только `a:brand_app_accept` и `a:wsp_contact_unlock`, и для обоих действий correctness уже держится на downstream DB/advisory-lock invariants.
- Giveaway auto-draw advisory-lock fail-fast path уже существовал; STEP579 сделал его явнее и лучше документированным, но не менял runtime semantics.

## Live verification

Обычный post-deploy runtime smoke:
- webhook requests still return 200/401 as expected
- cron_router still rejects bad token and runs valid jobs
- no unexpected regressions in giveaway auto-draw after deploy
