# STEP543A — QA checklist

## Source checks
- [x] `node --check scripts/admin-web.js`
- [x] `node --check scripts/smoke-admin-web-mobile-shell-contract.js`
- [x] `npm run smoke:admin-web-shell-contract`
- [x] `npm run smoke:admin-web-sidebar-nav-contract`
- [x] `npm run smoke:admin-web-mobile-shell-contract`
- [x] `npm run smoke:admin-web-layout-polish-contract`
- [x] `npm run smoke:admin-web-density-interaction-contract`
- [x] `npm run smoke:admin-web-users-final-interaction-contract`
- [x] `npm run preflight:source`

## Manual browser QA still required
- [ ] 390x844: open mobile nav, close by backdrop, close by route change
- [ ] 430x932: shell/topbar remain readable and actions tap-friendly
- [ ] 390x844 `/admin/users`: filters, pagination, compare rail, table overflow usable
- [ ] 390x844 `/admin/runtime`: no clipped cards or hidden primary actions
- [ ] 390x844 `/admin/payments`: one-column reading order holds
- [ ] 390x844 `/admin/founder`: dense side grids collapse cleanly
- [ ] Real phone pass: drawer feel, scroll lock, touch targets, sheet/modal ergonomics

## Scope guard
- [x] No backend/API/auth changes
- [x] No bot-layer changes
- [x] No Users page rewrite into card feed
