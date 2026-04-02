# STEP509 — Payment detail data contract

## Read endpoint
`GET /api/admin-web-read?section=payment&id=<paymentId>`

## Response shape
```json
{
  "updatedAt": "...",
  "payment": {
    "id": 123,
    "kind": "stars_topup",
    "source": "telegram_stars",
    "amountLabel": "53 XTR",
    "status": "success",
    "createdAt": "...",
    "updatedAt": "...",
    "note": "..."
  },
  "user": {
    "id": 47,
    "tgId": 123456789,
    "username": "name",
    "displayName": "@name",
    "link": "/admin/users/47"
  },
  "diagnostics": {
    "state": "ok",
    "label": "Платёж завершён успешно",
    "hint": "Дополнительных действий не требуется."
  },
  "events": [
    {
      "kind": "payment_created",
      "label": "Создан",
      "at": "..."
    }
  ],
  "hints": [
    {
      "kind": "info",
      "message": "Read-only режим: ручные действия выполняются через bot/admin fallback."
    }
  ],
  "recentAdminAudit": []
}
```

## Safety rules
- no secret / processor payload leakage
- normalized statuses only
- read-only only
- absent data must degrade safely
