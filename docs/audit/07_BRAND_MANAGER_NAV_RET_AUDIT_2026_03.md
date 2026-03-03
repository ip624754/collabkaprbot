# 07 — Brand/Manager UX: Return-to (ret) + Back/Menu/Home consistency — 2026-03

Scope: **Brand owner + Brand Manager** surfaces, with focus on:
- `📝 Заявки` (Brand Applications Inbox)
- `📌 Сделки` (Deals view)
- related search entrypoints (Deals search) and post-actions (accept / set status)

Goal: eliminate UX confusion: **"после действия вернуло не туда"**, especially for **dual-role** users and for Brand Manager flows.

## Findings

### F1 — Back button from `📝 Заявки` / `📌 Сделки` returned to an unrelated hub

Before:
- `renderBrandAppsList` and `renderBrandDealsList` used:
  - `kbNavRow(kb, 'a:bx_open|ws:0')`

Effect:
- User enters `📝 Заявки` from Brand menu, but `⬅️ Назад` returned to `🎬 UGC/Офферы` hub (`bx_open`), not to the role hub or Inbox.
- For Brand Managers (default flow is Inbox), the return felt especially wrong.

### F2 — Desired return-to differs by role

- **Brand owner** expectation: return to role hub (`📋 Меню`) after scanning lists.
- **Brand manager** expectation: return to **Inbox** (primary workspace for dialogs) after scanning lists.

## Fix (STEP275)

Minimal, safe change (no new DB queries):
- For both lists (`renderBrandAppsList`, `renderBrandDealsList`) we compute `hubBackCb`:
  - if `access.isManager`: back to `a:bx_inbox|ws:0|p:0|h:mm`
  - else: back to `a:menu`

This keeps `📋 Меню / 🏠 Home` always available and makes `⬅️ Назад` predictable.

## Smoke checklist

1) Brand owner:
- `📋 Меню → 📝 Заявки` → `⬅️ Назад` must return to role menu (or hide back and rely on Menu).
- `📋 Меню → 📌 Сделки` → `⬅️ Назад` must return to role menu.

2) Brand manager:
- `📋 Меню → 📝 Заявки` → `⬅️ Назад` returns to `📥 Inbox`.
- `📋 Меню → 📌 Сделки` → `⬅️ Назад` returns to `📥 Inbox`.

3) Post-actions:
- `✅ Принять` in application card → card opens in `💬 В работе` and `⬅️ Назад` returns to correct list tab.

