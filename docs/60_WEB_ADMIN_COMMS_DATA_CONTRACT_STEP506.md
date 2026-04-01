# STEP506 — Web Admin Comms data contract v1

## Endpoint
`GET /api/admin-web-read?section=comms`

## Shape
```json
{
  "updatedAt": "2026-04-02T10:00:00.000Z",
  "overall": {
    "state": "ok|degraded|unknown",
    "label": "human readable founder/operator summary"
  },
  "summary": {
    "total": 0,
    "drafts": 0,
    "active": 0,
    "doneRecent": 0,
    "blocked": 0,
    "warnings": 0
  },
  "warnings": [
    {
      "level": "info|warning|error",
      "message": "...",
      "source": "comms|broadcasts|outbox"
    }
  ],
  "groups": {
    "queued": 0,
    "sent": 0,
    "blocked": 0,
    "deferred": 0,
    "quarantined": 0
  },
  "recentBroadcasts": [
    {
      "id": 123,
      "status": "pending|running|paused|done|error|stopped|unknown",
      "audience": "all|brands|creators|curators|managers",
      "kind": "notice",
      "preview": "draft preview text",
      "totalCount": 0,
      "createdByLabel": "@owner",
      "createdAt": "...",
      "updatedAt": "...",
      "outbox": {
        "sent": 0,
        "queued": 0,
        "blocked": 0
      }
    }
  ],
  "hints": [
    {
      "kind": "info|warning",
      "message": "..."
    }
  ]
}
```

## Rules
- No payload or secret leakage.
- No raw Telegram error dumps.
- Read-only only.
- Missing tables / uneven data must degrade safely to empty states.
- Statuses are normalized before rendering.
