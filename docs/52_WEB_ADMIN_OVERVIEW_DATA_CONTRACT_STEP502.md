# STEP502 — Overview data contract

`GET /api/admin-web-read?section=overview`

## Snapshot shape
- `updatedAt`
- `summary`
- `segments`
- `lightMetrics`
- `runtime`
- `warnings`
- `recentAdminAudit`

## Правила
- только реальные source-backed counters
- safe fallbacks for zero/missing data
- никаких guessed metrics
- никаких hidden extra requests from UI
