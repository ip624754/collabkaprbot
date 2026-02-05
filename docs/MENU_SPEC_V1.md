# MENU SPEC v1 (Collabka PR)

Protocol: Jobs / Vitalik / Woz — **Zero regressions**.

## Navigation Invariants

- **⬅️ Back**: return-to context (`ret`) — always goes back to the screen you came from.
- **📋 Menu**: role hub (current role):
  - Creator: `ws_open` (active workspace hub)
  - Brand: `bx_open` (brand cabinet, `ws:0`)
  - Brand Manager: `bm_home` / `bx_inbox` (limited)
  - Curator: `cur_home`
  - Admin: `adm_home`
- **🏠 Home**: **HOME HUB** (global start screen, mode selector)

## Primary user flows

### Creator flow (Workspace / Channel)

`/start` → **HOME HUB** → `👤 Creator` → `ws_open`

`ws_open` must always expose 3 pillars:
1) **🪟 Витрина / Профиль** → `ws_profile` → `ws_share` → deep-link `/start wsp_<wsId>`
2) **📨 Запросы брендов** → `ws_leads` (tabs: new/in_progress/closed/spam) → `lead_view` (card) → reply/status
3) **🎬 UGC / Офферы** → `bx_my` → offer wizard → publish → bump/share

### Brand flow (No workspace, `ws:0`)

`/start` → **HOME HUB** → `🏷 Brand` → `bx_open|ws:0`

Pillars:
1) **⚙️ Фильтры** → `bx_filters`
2) **🧷 Лента** → `bx_feed` → creator card → contact (starts thread)
3) **📥 Inbox** → `bx_inbox` → threads/replies/status

## Return-to contract (ret)

- When opening `ws_leads` from `ws_open`, pass `ret=ws_open`.
- `ws_leads` builds Back as:
  - `ret === 'ws_open'` → `a:ws_open|ws:<wsId>`
  - otherwise → `a:ws_profile|ws:<wsId>`
- When opening `lead_view` from `ws_leads`, preserve `ret` in callback and in backCb to ws_leads.

## Footer standard (target)

On all key screens we standardize:
- Row: `⬅️ Back` (if meaningful) + `📋 Menu` + `🏠 Home`

(We will stage this via commits 87–91.)
