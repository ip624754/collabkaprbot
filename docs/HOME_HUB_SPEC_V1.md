# HOME HUB SPEC v1

Goal: provide a single, predictable center for the bot.

## Entry points

- `/start` (default)
- `🏠 Home` button anywhere

Both must open **HOME HUB**.

## HOME HUB UI

Title: `🏠 Collabka PR — выбери режим`

Buttons shown conditionally:
- `👤 Creator` → open creator hub (`ws_open` or `ws_list` if no workspaces)
- `🏷 Brand` → `bx_open|ws:0`
- `🧑‍💼 Brand Manager` → manager hub (only if role/invite present)
- `🧹 Curator` → curator hub (only if role present)
- `🛠 Admin` → admin hub (only for superadmins)

Secondary:
- `⚙️ Настройки` (optional)
- `❓ Поддержка`

## Invariants

- No breaking existing deep-links and callback payloads.
- Only add aliases/adapters.
- Never silent: safeEditOrReply + fallback reply.
