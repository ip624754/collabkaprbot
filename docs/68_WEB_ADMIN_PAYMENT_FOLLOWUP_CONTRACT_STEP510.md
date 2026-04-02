# STEP510 — Payment follow-up contract

## Summary shape additions

### `/api/admin-web-read?section=payments`
Adds:
- `followUpGroups`
- `followUpQueue`

`followUpGroups` shape:
```json
{
  "noAction": 0,
  "watch": 0,
  "review": 0,
  "urgent": 0
}
```

`followUpQueue` item shape:
```json
{
  "id": 0,
  "displayName": "@user",
  "status": "pending",
  "amountLabel": "53 XTR",
  "followUp": {
    "level": "urgent",
    "label": "Нужен follow-up",
    "reason": "Pending дольше 30 мин.",
    "nextStep": "Проверь user card, runtime и payment signals; если кейс не двигается — follow-up через bot/admin fallback.",
    "needsReview": true,
    "queueBucket": "urgent"
  },
  "updatedAt": "..."
}
```

### `/api/admin-web-read?section=payment&id=...`
Adds:
- `followUp`

`followUp` shape:
```json
{
  "level": "ok|watch|review|urgent",
  "label": "...",
  "reason": "...",
  "nextStep": "...",
  "needsReview": false,
  "queueBucket": "..."
}
```

## Rules
- read-only only;
- no raw provider payloads;
- no secret leakage;
- no mutation controls;
- follow-up text must point to existing safe surfaces only: payment detail, user card, runtime, bot/admin fallback.
