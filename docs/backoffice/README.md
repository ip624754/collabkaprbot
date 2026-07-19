# Collabka Backoffice — canonical index

Read in this order:

1. `../audit/STEP588_BACKOFFICE_PRODUCTIZATION_AUDIT.md`
2. `BACKOFFICE_CURRENT_SURFACE_INVENTORY.md`
3. `BACKOFFICE_OPERATOR_JOB_MAP.md`
4. `BACKOFFICE_TARGET_INFORMATION_ARCHITECTURE.md`
5. `BACKOFFICE_AUTHORIZATION_MUTATION_MATRIX.md`
6. `BACKOFFICE_READ_MODEL_AND_API_ARCHITECTURE.md`
7. `BACKOFFICE_WIREFRAMES.md`
8. `ADR_001_KEEP_STATIC_ADMIN_COLLAPSED_API_NO_ORM.md`
9. `BACKOFFICE_SURFACE_MANIFEST.json`
10. `../roadmap/STEP589_BACKOFFICE_IMPLEMENTATION_ROADMAP.md`

## Current decision

The existing web-admin is the backoffice foundation. Do not build a parallel admin product.

Keep:

- static SPA;
- collapsed API;
- canonical query/services;
- Telegram-only sensitive controls.

Add missing operator jobs incrementally after STEP586H1 observation and STEP587 release decision.
