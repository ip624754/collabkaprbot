# STEP456 — Runtime Sweep Report

## Scope

This pass verifies the cleaned creator ↔ brand application/deal/lead flow after STEP439–455 on the current source snapshot.

Included areas:
- creator → brand application surfaces
- brand accept / post-accept flow surfaces
- creator-side and brand-side reply entry/fallback/recovery layers
- local deal stage / local-vs-global return paths
- creator leads / brand leads dialogs and follow-ups
- contact unlock CTA/context continuity
- empty / no-history / first-message states
- footer / back / list-return consistency

## Confirmed now on snapshot

These checks pass on the current snapshot:
- `node --check src/bot/bot.js`
- `node --check scripts/preflight.js`
- env / channel / share URL / inbox-accept / contacts-brand-pass / no-channel / input-mode / what-next / qstash-dedup contracts
- brand application / deal / inbox / notice / reply-entrypoint contracts
- creator application / notice / chat-entrypoint contracts
- creator leads / brand leads density / entrypoint / follow-up contracts
- empty-state and footer/back consistency contracts
- actions registry, footer-nav lint, redact tests, public-contact gate, redis grep/TTL/export gates, portable paths gate

## What was stale and refreshed

The sweep found 4 stale source-level smoke contracts that were still asserting old literal strings or pre-helper markers after the STEP439–455 cleanup cycle:
- `scripts/smoke-brand-inbox-accept-contract.js`
- `scripts/smoke-contacts-brand-pass-contract.js`
- `scripts/smoke-what-next-backnav-contract.js`
- `scripts/smoke-brand-app-ops-copy-contract.js`

These were refreshed to assert the current helper-based / context-correct contracts instead of outdated literals.

## Not confirmed here

This snapshot pass is not a substitute for live Telegram/runtime verification. The following still require post-deploy/manual verification in the actual bot:
- creator sends application → brand receives notice
- brand clicks `✅ Принять` and sees the correct post-accept transition
- reply there/back in real chat
- local `📌 Стадия сделки` transitions and return path back into the same `✉️ Заявка #...`
- creator leads / brand leads dialogs with real callback/edit rendering
- `🔓 Контакты` receipts and follow-up buttons in live chat
- empty-state rendering in actual Telegram message edits
- final footer/list-return behavior after real navigation across multiple screens

## Preflight status

`node scripts/preflight.js` still fails fast on this archive because it is a bare checkout without local `node_modules`.

Missing local dependencies called out by preflight:
- `@upstash/qstash`
- `@upstash/redis`
- `dotenv`
- `grammy`
- `pg`
- `pino`

This is an environment/local-checkout issue, not a product/runtime regression in the cleaned flow.
