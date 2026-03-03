# 08 — Creator ↔ Curator system audit (UX + guards + degraded Redis) — 2026-03-03

Scope:
- Curator overlay mode (`home_mode=curator`, `cur_mode`), curator cabinet (`a:cur_home`, `a:cur_ws`, `a:cur_inbox`).
- Creator/owner-side curator management (`a:cur_manage`, `a:ws_toggle_cur`, invite/add/remove/list/audit).
- Navigation predictability (Back/Menu/Home) + callback parsing correctness.
- Degraded Redis behavior: navigation must stay available; spammy sends must fail-closed with a clear message.

## Findings

### F1 (P1) Callback parsing bug: curator mode toggle used `v=...`
- Location: `src/bot/bot.js` → `curatorHomeKb()`.
- Button callback was: `a:cur_mode_set|v=0|ret:cur` / `v=1`.
- Parser (`parseCb`) only supports `key:value`, so `v=...` was ignored → toggle didn’t work.

### F2 (P1) Curator entry label was confusing (“Кураторы блогера”)
- Label appeared in multiple menus and hints for users who are *curators*.
- Correct mental model: this is a **curator cabinet**, not “blogger’s curators”.

### F3 (P1) Redis degraded: curator navigation was unnecessarily fail-closed
- Many curator actions were marked `guard: REQUIRE_REDIS` even though they are DB-read / view-only.
- Result: when Redis is down, curator cabinet / lists could fall into generic error screens.

### F4 (P2) Footer invariant gap: curator workspace disabled screen lacked Menu/Home
- Location: `renderCuratorWorkspace()` when `curator_enabled=false`.
- Only “Back” existed; missing `📋 Меню` and `🏠 Home` escape hatches.

### F5 (P2) Mixed language button in curator removal DM
- Location: curator removal notify keyboard.
- Button text was `💬 Support` instead of `💬 Поддержка`.

## Fixes implemented

1) **Callback bug fix**: curator mode toggle now uses `v:0/1`.
2) **Consistent curator label**: replaced curator-facing label to `🧹 Кабинет куратора`.
3) **Guards cleanup**: curator view/navigation actions moved to `guard: NONE`.
   - For flows that *require Redis* (invites/input/anti-spam sends) we added explicit `redisHealthOkQuick()` gates with friendly messages.
4) **Footer consistency**: added `📋 Меню` + `🏠 Home` in the disabled-workspace curator screen.
5) **Copy cleanup**: `💬 Поддержка` label in curator removal DM.

## Degraded Redis behavior (expected)
- Curator cabinet navigation (`a:cur_home`, `a:cur_ws`, `a:cur_inbox`, lists/audit) remains available.
- Actions that can spam or rely on ephemeral Redis state fail with a clear message:
  - curator invites
  - curator note input
  - giveaway remind send / owner notify send

## Smoke checklist
- Owner: `👥 Кураторы канала` → toggle `curator_enabled` on/off; no generic error when Redis is degraded.
- Curator: `🧹 Кабинет куратора` → open workspace → open giveaway → toggle “Режим: ВКЛ/ВЫКЛ”.
- Curator: try `📣 Напомнить проверить` / `📩 Сообщение владельцу` with Redis degraded → shows “temporarily unavailable” message, returns to giveaway.
- Curator disabled workspace: screen shows `⬅️ Назад` + `📋 Меню` + `🏠 Home`.
