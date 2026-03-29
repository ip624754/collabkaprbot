# STEP487 — Landing surface gallery / modal polish

## Goal

Rebuild the landing block `Как это выглядит` so it behaves like a clean product gallery instead of overloaded screenshot cards.

Core contract:
- card = short preview
- click = full modal preview

## What changed

- Four symmetric gallery cards now use one real screenshot each:
  - `Домашняя`
  - `Каталог брендов`
  - `Фильтры брендов`
  - `Диалог и стадия сделки`
- Preview cards keep only title, badge, screenshot, and short caption.
- Full explanation moved into a dedicated modal/lightbox.
- Modal uses three short blocks:
  - `Что видно`
  - `Почему это важно`
  - `Следующий шаг`
- `Диалог и стадия сделки` was reduced to one strong screenshot to avoid a noisy composite.

## Interaction

### Card open
- click / tap
- keyboard: `Enter` / `Space`

### Modal close
- close button
- click on backdrop
- `Esc`

### Accessibility
- focus returns to the originating card after close
- simple focus trap while modal is open
- no heavy motion required for understanding

## Files

- `index.html`
- `styles/landing.css`
- `scripts/landing.js`
- `scripts/smoke-landing-contract.js`
- `assets/screenshots/home-live-shot.png`
- `assets/screenshots/catalog-live-shot.png`
- `assets/screenshots/filters-live-shot.png`
- `assets/screenshots/deal-live-shot.png`

## Acceptance

The step is correct only if:
- the grid remains symmetric in normal view;
- cards no longer try to hold the full explanation inline;
- modal opens cleanly and the screenshot is readable;
- desktop and mobile both remain usable;
- the screens section feels cleaner and more premium than STEP486.
