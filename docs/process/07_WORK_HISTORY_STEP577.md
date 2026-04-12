# STEP577 — Invite recovery + RU copy polish

## Summary
- закрыт последний user-side хвост invite-layer после STEP576: self-invite deep-link больше не заканчивается свежим warning-сообщением без кнопок recovery; invite `/start` notice теперь получает явный recovery keyboard
- invite user surfaces полированы в один RU-first copy contract без изменения reward math, ledger semantics, anti-abuse или admin invite logic

## Что изменено
- `src/bot/bot.js`
  - добавлен `inviteStartNoticeKeyboard(...)`
  - `/start` invite attribution replies теперь используют `reply_markup: inviteStartNoticeKeyboard(inviteStartNoticeMeta)`
  - self-invite rejection keeps the warning text but now returns with `⬅️ Инвайты` + `🏠 Home`
  - user invite screens tightened from mixed RU/EN copy into RU-first labels: `Сводка`, `Приглашено`, `Активировано`, `Конверсия активации`, `Быстрый статус`, `Последние приглашённые`, `Доступно / В ожидании / Обменяно`
  - reward / history microcopy cleaned where it was directly visible to users
- `scripts/smoke-invite-hub-ux-contract.js`
  - updated to the RU copy contract
- `scripts/smoke-invite-recovery-copy-contract.js`
  - new guard for self-invite recovery buttons and RU copy presence
- `docs/00_CURRENT_STATE.md`
  - top-of-file baseline updated to STEP577
- `docs/15_NEW_CHAT_HANDOFF.md`
  - handoff baseline moved to STEP577

## Scope boundary
- no migrations
- no reward math changes
- no ledger semantic changes
- no anti-abuse changes
- no admin invite visibility changes
- no broad invite-layer redesign

## QA
### Source-confirmed
- `node --check src/bot/bot.js`
- `node scripts/smoke-invite-hub-ux-contract.js`
- `node scripts/smoke-invite-rewards-contract.js`
- `node scripts/smoke-invite-recovery-copy-contract.js`
- `node scripts/actions-registry-check.js`

### Live still needed
- self-invite deep-link on a real Telegram client should show the warning with recovery buttons
- invite surfaces should read naturally in zero-state and non-zero-state
- `Инвайты → Статистика / Баллы / История / Обменять` should keep the same safe navigation contract
