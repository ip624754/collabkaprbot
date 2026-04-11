# STEP563 — Broadcast audit consistency hotfix

## Summary
This step followed a source-level audit of the current Collabka broadcast layer and fixed narrow consistency gaps without changing queue/retry/fan-out runtime.

## Source-confirmed findings
1. Simple-mode send path was blocked by a legacy guard checking `draft.type` in `a:bc_confirm`, even though simple drafts are built from `text/fileId/mediaType/buttons`.
2. Broadcast creation success screen did not provide a direct path into the created broadcast card, which made operator follow-up unnecessarily indirect.
3. Audience picker still displayed raw `simple/advanced` labels instead of current product labels.
4. Broadcast detail view hid refresh/blocked-report access for terminal statuses, making post-run inspection inconsistent.

## Fixes shipped
- `a:bc_confirm` now validates draft presence through `broadcastDraftHasContent(...)`
- success screen now links to `📊 Открыть #id` and `📣 К списку`
- audience picker now shows `Конструктор рассылки` / `Быстрый пост`
- broadcast detail view always keeps `🔄 Обновить`, and keeps `🧱 Пропуски/ошибки` reachable when blocked rows exist

## Out of scope
- no queue/retry redesign
- no compact post-run report
- no quarantine UX
- no first-batch safety hints
- no schema changes

## Result
The broadcast layer is now more consistent for:
- create -> open -> monitor
- simple composer -> preview -> send
- terminal-state inspection
