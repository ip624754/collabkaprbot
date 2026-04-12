# STEP576 — Invite IA Completion

## Summary
This step completes the user-side invite information architecture after STEP575.

It does **not** change reward math, ledger semantics, anti-abuse rules, invite attribution semantics, or admin invite visibility.
The scope is user IA only:
- rename the generic invite-module entrypoint from `Поделиться` to `📨 Инвайты`
- add explicit bounded read screens for `📊 Статистика` and `💎 Баллы`
- keep `📄 История` and `🎁 Обменять` as first-class peer screens
- keep the hub compact instead of forcing every detail into one main message

## Why
After STEP575 the main hub became cleaner, but zero-state still felt incomplete because the rest of the invite module stayed hidden behind conditional entrypoints.
User feedback showed two remaining UX problems:
- `Поделиться` was too generic for an entry that actually opens the whole invite module
- the module breadth was not obvious in zero-state, so the hub looked like a partial surface instead of a complete invite center

## Scope
Included:
- `📨 Инвайты` naming for invite-module entrypoints that open `a:share`
- new read-only callbacks `a:share_perf` and `a:share_points`
- new keyboards/text renderers for statistics and points
- explicit hub rows for `Статистика / Баллы / История / Обменять`
- invite link / invite card back-navigation aligned to `Инвайты`
- source smokes updated for the new IA contract
- docs update

Not included:
- reward-logic rewrite
- migrations
- new ledger states
- admin invite redesign
- new share mechanics

## Files
- `src/bot/bot.js`
- `src/bot/actionRegistry.js`
- `scripts/smoke-invite-hub-ux-contract.js`
- `scripts/smoke-invite-rewards-contract.js`
- `scripts/smoke-home-copy-contract.js`
- `scripts/smoke-start-role-gate-contract.js`
- `docs/00_CURRENT_STATE.md`
- `docs/15_NEW_CHAT_HANDOFF.md`
- `docs/process/07_WORK_HISTORY_STEP576.md`

## Acceptance
- main menu / home entrypoint shows `📨 Инвайты` where it opens the invite module
- invite hub exposes explicit buttons for `Статистика`, `Баллы`, `История`, `Обменять`
- zero-state still shows the full bounded user IA
- hub remains compact instead of reverting to a long prose screen
- reward math / ledger semantics remain unchanged
- all new callbacks are registered and source-smoked

## QA
Source-confirmed:
- `node --check src/bot/bot.js`
- `node --check src/bot/actionRegistry.js`
- `node scripts/smoke-invite-hub-ux-contract.js`
- `node scripts/smoke-invite-rewards-contract.js`
- `node scripts/smoke-home-copy-contract.js`
- `node scripts/smoke-creator-current-channel-contract.js`
- `node scripts/actions-registry-check.js`

Live verification still needed:
- Telegram zero-state readability with the denser invite keyboard
- how obvious `Инвайты` feels in Menu/Home in real use
- `Статистика / Баллы / История / Обменять` navigation on a real device
