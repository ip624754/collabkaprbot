# 07 — WORK HISTORY (2026-03)

## STEP225 — Audit hardening (P1+P2): SSL verify + atomic rate limiter + ops buffer + IG pagination + strict legacy packs
- **P1 (до деплоя):**
  - `src/db/pool.js`: включена проверка SSL сертификата для Neon (`rejectUnauthorized:true`) — закрывает MITM-риск.
  - `src/lib/redis.js`: rate limiter переведён на атомарный Lua (`INCR+EXPIRE+TTL`), чтобы ключи не становились «вечными» при краше между командами.
- **P2 (важные, без ломки):**
  - `src/bot/opsAlerts.js`: буфер ops alerts теперь атомарный (Lua `LPUSH+LTRIM+EXPIRE`), чтобы не терять trim при конкуренции.
  - `src/bot/cron.js`: IG verify comments — добавлена пагинация по `paging.next` (до 5 страниц).
  - `src/bot/payments_fallback.js`: legacy numeric packId теперь strict catalog-only (unknown numeric → reject).
  - `src/db/queries.js`: для `acceptBrandApplicationWithCharge()` добавлен advisory lock (сериализация при click-storm, особенно в деградации Redis).
- Без миграций. Zero regressions.
- Docs sync: `docs/00_CURRENT_STATE.md`, `docs/process/07_WORK_HISTORY_2026_02.md`, `docs/process/07_WORK_HISTORY_2026_03.md`.
