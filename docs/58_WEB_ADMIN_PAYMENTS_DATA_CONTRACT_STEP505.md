# STEP505 — Payments data contract

## `paymentsSummary`

```json
{
  "updatedAt": "...",
  "overall": {
    "state": "ok|degraded|unknown",
    "label": "..."
  },
  "summary": {
    "total": 0,
    "recent": 0,
    "successful": 0,
    "pending": 0,
    "warnings": 0,
    "needsReview": 0
  },
  "warnings": [
    { "level": "info|warning", "message": "...", "source": "payments" }
  ],
  "groups": {
    "success": 0,
    "pending": 0,
    "failed": 0,
    "fallback": 0
  },
  "recentPayments": [
    {
      "id": 0,
      "userId": 0,
      "tgId": 0,
      "username": "",
      "displayName": "",
      "kind": "",
      "amountLabel": "",
      "status": "success|pending|failed|fallback|unknown",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "hints": [
    { "kind": "info|warning", "message": "..." }
  ]
}
```

## Rules
- Read-only
- No secret / processor token leakage
- No raw payload dumps
- Missing diagnostics handled safely
- Statuses normalized to `success|pending|failed|fallback|unknown`
