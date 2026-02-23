# 14 — BRAND TEAM UX (V4) — 2026-02-23

## Principle
- **Button is always visible**
- **Access gating is inside the feature**
- **Clear CTA** + *no dead ends*
- **No extra DB load in menus** (only check gate when user opens the feature)

## Entry points
- BX Brand menu (`bxBrandMenuKb`) → `a:brand_team|ws:<wsId>|ret:bx`
- (Optional) other menus may show it too, but BX is the primary.

## Return-flow contract (`ret`)
- `ret=bx` means:
  - back from managers returns to `a:bx_open|ws:<wsId>`
  - CTAs inside gate should preserve context:
    - profile edit return token
    - brand plan return token

### Tokens used
- `ret=brand_team` — return to managers (generic)
- `ret=brand_team_bx` — return to managers + then back to BX

## UX copy
Gate must explain:
- button is visible to everyone
- access opens after:
  - profile 4/4
  - Brand Plan active (purchased or gifted)

## What NOT to do
- Do not hide the button based on subscription (creates confusion).
- Do not query DB on every menu render (kills Neon CU on serverless).
- Do not fork logic into multiple “paidOk” checks — keep single source of truth.

## Ownership note (важно для прода)
- Профиль бренда и Brand Plan привязаны к Telegram-аккаунту владельца.
- Если профиль заводит менеджер — лучше заводить на владельца и добавлять менеджеров через Brand Team.
