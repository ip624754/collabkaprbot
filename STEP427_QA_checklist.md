# STEP427 QA checklist

## Scope
Combined runtime-contract smoke package for:
- STEP424 — Brand Inbox accept-point
- STEP425 — Contacts / Brand Pass anti-bypass
- STEP426 — No-channel gates
- STEP427 — Input-mode cancel/reset

No runtime business logic, DB schema, Redis behavior, or hot-path menu queries were changed.

## Source-level checks
- [x] `node --check scripts/preflight.js`
- [x] `node --check scripts/smoke-brand-inbox-accept-contract.js`
- [x] `node --check scripts/smoke-contacts-brand-pass-contract.js`
- [x] `node --check scripts/smoke-no-channel-gate-contract.js`
- [x] `node --check scripts/smoke-input-mode-contract.js`

## New smoke scripts
- [x] `node scripts/smoke-brand-inbox-accept-contract.js`
- [x] `node scripts/smoke-contacts-brand-pass-contract.js`
- [x] `node scripts/smoke-no-channel-gate-contract.js`
- [x] `node scripts/smoke-input-mode-contract.js`
- [x] `npm run smoke:brand-inbox-accept-contract`
- [x] `npm run smoke:contacts-brand-pass-contract`
- [x] `npm run smoke:no-channel-gate-contract`
- [x] `npm run smoke:input-mode-contract`

## Baseline regression checks
- [x] `npm run actions:check`
- [x] `npm run lint:nav`
- [x] `npm run test:redact`

## Preflight behavior
- [x] `npm run preflight` still fails fast on bare snapshot without local dependencies
- [x] Failure remains explicit at `Preflight: local npm dependencies`
- [x] Expected hint remains `npm ci` / `npm install`

## Manual sanity targets protected by the new smokes
- [ ] Brand Inbox card in `new` status shows only `✅ Принять / ⛔ Спам / 🗑 Удалить`
- [ ] After accept, the card exposes `✍️ Ответить / ⚡ Шаблоны / 💬 В работу / ✅ Закрыть`
- [ ] Public vitrine and brand lead dialog keep contacts/channel hidden until unlock
- [ ] Giveaway create without channel goes to explicit gate with recovery CTA
- [ ] Creator → brand application without active channel goes to explicit recovery screen
- [ ] `✍️ Написать заявку` shows explicit input mode and `❌ Отмена ввода`
- [ ] After draft capture, preview appears and input mode is no longer stuck

## Risk
Low — source/preflight/docs only.
