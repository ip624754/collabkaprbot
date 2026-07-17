# STEP586B — Home, Menu and Role Navigation Contract

**Date:** 2026-07-18
**Status:** IMPLEMENTED / LOCAL QA
**Mode:** HEAVY
**Baseline:** STEP586A FULL
**Next STEP:** STEP586C — Applications, Dialogs and Deals Lifecycle

## 1. Outcome

STEP586B makes the global and current-role navigation visible and consistent without renaming callback actions or changing their destinations.

Canonical contract:

- `🏠 Домой` → global role/mode hub (`a:home`);
- `📋 Меню` → current-role menu (`a:menu`);
- role labels → `Креатор`, `Бренд`;
- `канал` remains the Telegram object managed by a creator.

The old visible labels `🏠 Home`, `🏠 Главное меню`, `⬅️ К меню`, `⬅️ В меню` and `❌ Отмена` no longer point to `a:home` or `a:menu` in active runtime source.

## 2. Implemented

### Navigation labels

- normalized all static `a:home` buttons in `src/**` and `api/**` to `🏠 Домой`;
- normalized all static `a:menu` buttons to `📋 Меню`;
- changed current-role screen headings from `Главное меню` to `Меню`;
- changed the global hub heading from `Домашняя` to `Домой`;
- updated footer lint and source contracts to the new labels.

### Role labels

- first-run, help, verification and role-switch surfaces now use `Креатор` and `Бренд`;
- removed `Creator / канал`, `Блогер` and `Заказчик` from role selection;
- creator and brand mode-switch buttons now use `Режим креатора` and `Режим бренда`, including verification mismatch recovery;
- creator menu copy now names the person role separately from managed channels.

### UX cleanup

- removed the vague duplicate `Продолжить: <роль>` CTA from the global Home hub;
- kept the existing `📋 Меню` route as the explicit current-role destination;
- added `🏠 Домой` to four curator/manager/folder-editor notification keyboards that previously had only a menu escape;
- preserved local Back routes where they already existed.

## 3. Invariants preserved

- callback values and handlers were not renamed;
- `a:home` still opens the global role/mode hub;
- `a:menu` still opens the current-role menu;
- role persistence, Redis fail-open behavior and manager/curator overlays are unchanged;
- no DB schema, migration, permission, payment, reward or state-machine change;
- no application/dialog/deal or monetization copy migration was mixed into this STEP.

## 4. Source enforcement

Added:

```bash
npm run smoke:home-menu-role-navigation-contract
```

The guard scans active `src/**` and `api/**` JavaScript and verifies:

- every static `a:home` button is labelled `🏠 Домой`;
- every static `a:menu` button is labelled `📋 Меню`;
- the old English Home label is absent from active runtime;
- role selection uses `Креатор` and `Бренд` without role/object synonym drift;
- vague `Продолжить:` copy is absent from the global hub;
- the canonical callbacks remain present.

The guard is included in `preflight:source`.

## 5. QA truth boundary

### Verified locally

- static navigation inventory: `239` `a:home` labels, all `🏠 Домой`;
- static navigation inventory: `250` `a:menu` labels, all `📋 Меню`;
- new navigation contract passes;
- Home copy contract passes;
- first-run role gate contract passes;
- creator current-channel contract passes;
- workspace disconnect/navigation contract passes;
- what-next/back-navigation contract passes;
- footer navigation lint passes;
- input-mode contract passes;
- callback consistency passes with zero unresolved actions;
- package-lock consistency passes;
- full JavaScript syntax sweep passes: `217` files;
- dependency/runtime preflight passes;
- package dependency audit reports `0 vulnerabilities`;
- residual admin/broadcast/Instagram invariant checks pass.

### Canonical source-preflight boundary

`npm run preflight:source` passed the assertion, registry and generator gates reached, including the STEP586B contract. The serial command exceeded the execution limit during its long sequential `node --check` sweep and did not print its final PASS line. The complete 217-file JavaScript surface and residual optional invariant scripts were then executed separately and passed.

### Not verified

- Vercel deployment;
- live Telegram rendering and mobile wrapping;
- real creator, brand, curator, moderator and admin traversal;
- remote STEP584 staging evidence;
- real-user comprehension.

## 6. Decision

STEP586B is ready for source review and browser application.

Next bounded implementation:

> **STEP586C — Applications, Dialogs and Deals Lifecycle**

Do not combine it with monetization or broad error-copy work.
