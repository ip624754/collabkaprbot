# STEP586B — Home, Menu and Role Navigation Contract

**Date:** 2026-07-18
**Status:** DONE
**Mode:** HEAVY
**Baseline:** STEP586A FULL

## Implemented

- `a:home` visible label normalized to `🏠 Домой` across active runtime;
- `a:menu` visible label normalized to `📋 Меню` across active runtime;
- global hub title changed to `Домой`;
- current-role hub titles changed to `Меню`;
- role gate, help and verification mode surfaces now use `Креатор` and `Бренд`;
- role/object drift (`Creator / канал`, `Блогер`, `Заказчик`) removed from the role selector;
- mode-switch buttons changed to `Режим креатора` / `Режим бренда`;
- vague duplicate `Продолжить: <роль>` CTA removed;
- four staff/invite notification keyboards gained a global `Домой` escape;
- footer lint and navigation source guards updated;
- added `smoke:home-menu-role-navigation-contract` to source preflight.

## Preserved

- all callback values and destinations;
- role persistence and fail-open behavior;
- permissions, DB schema, payments, rewards and state machines;
- lifecycle and monetization copy remain for later STEPs.

## QA

Local navigation/source contracts, dependency preflight, 217-file JavaScript syntax sweep and residual invariants pass. The canonical serial source-preflight command timed out during its long syntax sweep after earlier gates passed. Live Telegram traversal is not verified.

## Next

**STEP586C — Applications, Dialogs and Deals Lifecycle.**
