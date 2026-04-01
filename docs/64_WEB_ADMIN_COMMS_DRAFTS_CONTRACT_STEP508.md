# STEP508 — Comms drafts contract

Date: 2026-04-02

## Read model
`GET /api/admin-web-read?section=comms`

Returns one aggregated snapshot:
- `updatedAt`
- `overall`
- `summary`
- `warnings`
- `drafts`
- `recentNotices`
- `outbox`
- `hints`
- `recentAdminAudit`

## Draft write actions
All writes go through the existing collapsed handler:

### `create_notice_draft`
Payload:
- `title`
- `audience`
- `bodyText`

Behavior:
- resolves `created_by_user_id` from current session `actorTgId`
- creates a `broadcasts` row in `PENDING`
- stores internal label in `draft_caption`
- stores body in `draft_text`
- writes admin-web audit

### `update_notice_draft`
Payload:
- `draftId`
- `title`
- `audience`
- `bodyText`

Behavior:
- only `PENDING` drafts are editable
- writes admin-web audit with `oldJson` / `newJson`

### `test_send_notice`
Founder-only.

Payload:
- `draftId`

Behavior:
- sends preview text to the current founder Telegram actor
- no queue mutation
- no live audience send
- writes admin-web audit

## Explicit non-goals
- no `send_notice_live`
- no retry / force-send / queue controls
- no sent-history deletion
- no outbox mutation
