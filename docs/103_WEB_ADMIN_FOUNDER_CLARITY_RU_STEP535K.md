# STEP535K — Founder control clarity + admin RU consistency

Date: 2026-04-03

## Goal
Сделать `/admin/founder` читаемой founder-only поверхностью, а не просто ещё одной страницей со сводкой, и дочистить самые заметные англоязычные хвосты в web-admin copy.

## What changed
- `scripts/admin-web.js`
  - section manifest локализован для ключевых admin labels: `Обзор`, `Пользователи`, `Система`, `Платежи`, `Коммуникации`, `Фаундер`;
  - founder page получила явный слой `Следующий фаундер-шаг` и `Границы этой поверхности`;
  - founder cards, warnings, buttons, boundary notes и session summary переведены в более понятный RU admin copy;
  - payments page доведена по copy до более русскоязычного review-plane: `Платёжный обзор`, `Корзины разбора`, `Следующий шаг`, `Группы статусов`, `Платёжная карточка`, `Карточка пользователя`;
  - control-surface / statusbar copy стала менее смешанной по языку;
  - cache-bust поднят до `step535k`.
- `src/lib/adminWeb/readModels.js`
  - founder warnings / hints приведены к более честному RU founder-contract wording;
  - founder-only boundary messages стали явнее разделять web-safe и bot-only слой.
- smoke contracts обновлены под новый RU copy и founder-clarity surface.

## Scope / risk
- шаг остаётся read-model / copy / layout only;
- founder control logic, revoke-all semantics, runtime/config writes и money-path не менялись;
- риск ограничен user-facing admin copy и render surface.

## Acceptance
- `/admin/founder` читается как founder-layer с явными границами и следующим действием;
- web-admin больше не смешивает ключевые founder/payments headings с англоязычными хвостами так агрессивно;
- навигация, route contract и founder session guard не меняются.
