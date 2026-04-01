# STEP501 — Web Admin User Card data contract

## Read endpoint

`GET /api/admin-web-read?section=user&id=<userId>`

## Response shape

```json
{
  "user": {
    "id": 123,
    "tgId": 456,
    "username": "name",
    "displayName": "@name",
    "createdAt": "...",
    "updatedAt": "...",
    "bannedAt": null,
    "status": "active",
    "segment": "creator"
  },
  "account": {
    "plan": "basic",
    "planUntil": null,
    "credits": 0,
    "creditsLabel": "no credits"
  },
  "access": {
    "hasWorkspace": true,
    "workspaces": [],
    "hasChannel": true,
    "channelLabel": "@example",
    "curatorIn": [],
    "hasBrandProfile": false,
    "brandProfile": null,
    "signals": ["creator", "workspace_connected", "channel_connected"]
  },
  "activity": {
    "createdAt": "...",
    "lastSeenAt": "...",
    "recentSummary": "...",
    "lastImportantAction": "...",
    "lightCounters": {
      "workspacesOwned": 1,
      "curatorIn": 0,
      "payments": 0
    }
  },
  "note": {
    "text": "...",
    "updatedAt": "...",
    "byAdminTgId": 123456789
  },
  "paymentLight": {
    "total": 0,
    "applied": 0,
    "pending": 0,
    "lastPaymentAt": null
  },
  "recentAdminAudit": []
}
```

## Write endpoints

### Set / edit note

`POST /api/admin-web-write?action=set_note`

```json
{
  "userId": 123,
  "text": "Operator note"
}
```

### Clear note

`POST /api/admin-web-write?action=clear_note`

```json
{
  "userId": 123
}
```

## Audit contract

Every note mutation writes into recent admin-web audit with:

- `section=users`
- `targetType=user`
- `targetId=<userId>`
- `action=set_user_note` or `clear_user_note`
- `reason=create/update/clear/noop_clear`

## Not in contract

- direct plan mutation
- credits mutation
- payment mutation
- deal/channel mutation
