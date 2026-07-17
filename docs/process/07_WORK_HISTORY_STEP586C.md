# STEP586C — Applications, Dialogs and Deals Lifecycle

**Date:** 2026-07-18  
**Status:** DONE  
**Mode:** HEAVY  
**Baseline:** STEP586B FULL

## Implemented

- canonical lifecycle fixed as `оффер / профиль → заявка → диалог → сделка → этап / закрытие`;
- visible `Inbox` labels changed to `💬 Диалоги` on existing callbacks;
- brand menu separates `📨 Заявки` from `🤝 Сделки`;
- creator application cards derive the title from application/deal state;
- application receipts, empty states, notifications and payment follow-ups point to the correct destination;
- deal-stage copy uses `Этап`; stopped state uses `Остановлено`;
- deal-only routes require authoritative acceptance evidence;
- direct deal-stage mutation now verifies actor access before writing;
- deal queries and stage writer enforce accepted-only evidence in SQL;
- added `smoke:applications-dialogs-deals-lifecycle-contract` to source preflight;
- updated intentional source-copy contracts to the new lifecycle vocabulary.

## Preserved

- callback identities and destinations;
- application creation and acceptance mechanics;
- prices, credits, subscriptions and payment behavior;
- DB schema and migrations;
- message/thread storage format;
- role and manager authorization model.

## QA

Canonical source preflight, callback, dependency/runtime, lifecycle, creator/brand flow, SQL, runtime-proof and staging-contract checks pass. The full JavaScript surface passes syntax verification and the dependency audit reports no high-severity vulnerabilities. Live Telegram and remote staging remain unverified.

## Next

**STEP586D — Invite Center Language and Mechanism Honesty.**
