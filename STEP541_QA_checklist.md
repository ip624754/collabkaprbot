# STEP541 QA checklist — callback branch feedback normalization

## Source checks
- [x] `node --check src/bot/bot.js`
- [x] `node --check src/bot/gwAccess.js`
- [x] `npm run callbacks:check`
- [x] `npm run actions:check`
- [x] `npm run preflight:source`

## Source-confirmed contract changes
- [x] `a:nd` no longer sends a bare callback ack before the first-tap confirmation toast
- [x] `a:brand_app_del_do` no longer sends an unconditional empty callback ack ahead of deny/success feedback
- [x] `renderGwAccess(...)` no-access path no longer sends bare-ack-then-text-ack
- [x] No callback payload schema changes
- [x] No action registry changes
- [x] No money/publish/support-degraded semantics touched

## Live verification still required
- [ ] `a:nd` first tap shows `Нажми ещё раз, чтобы убрать уведомление.`
- [ ] `a:nd` second tap removes the notification or strips buttons with honest feedback
- [ ] `a:brand_app_del_do` shows `Нет доступа.` on invalid ownership/state
- [ ] `a:brand_app_del_do` shows `🗑 Заявка удалена` on successful delete
- [ ] `gw_access` no-access path shows `Нет доступа.` as a single visible callback response
- [ ] No spinner hangs in the touched branches
