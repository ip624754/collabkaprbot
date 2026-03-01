# Work History — 2026-03

Формат: дата → STEP → что изменили → зачем → риски/регрессии.

## 2026-03-01
- STEP237: ENV cheat‑sheet (one screen) — добавлен `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` с актуальными prod‑значениями: IG OAuth/verify выключены, manual verification включена, audit buffer + cooldown, ключевые таймауты/лимиты.

### STEP232 — NotebookLM audit pack refresh
- Обновили audit‑материалы/индекс для внешнего аудита.
- Зафиксировали важный контекст: IG OAuth/верификация выключены, активна только ручная верификация.

Риск регрессий: **нет** (docs‑only).

### STEP233 — NotebookLM DOCS‑ONLY pack
- Подготовили отдельный docs‑only пакет для NotebookLM (только .md/.txt), чтобы аудитору было проще и он не путался.
- Добавлены документы:
  - `docs/24_VERIFICATION_MANUAL_ONLY.md`
  - `docs/25_INSTAGRAM_CONTACTS_ONLY.md`
  - `docs/audit/05_NOTEBOOKLM_DOCS_ONLY_ENTRYPOINT_2026_03.md`
  - `docs/audit/07_NOTEBOOKLM_AUDIT_PROMPT_DOCS_ONLY_RU.txt`
- Обновлён `docs/audit/00_NOTEBOOKLM_UPLOAD_PACK.md` и индекс `docs/audit/04_AUDIT_PACK_INDEX_2026_03.md`.

Риск регрессий: **нет** (docs‑only).

### STEP234 — Outbox privacy hardening (admin)
- Outbox: если админ открыл экран не в личке с ботом (group/supergroup/channel), текстовые snippet’ы скрываются (🔒).
- `✉️ Повторить` отключён вне private‑чата (чтобы исключить случайные утечки/путаницу при использовании админ‑кнопок в группах).
- Обновлён `docs/00_CURRENT_STATE.md`.

Риск регрессий: **минимальный** (меняется только отображение snippet’ов и доступность `Повторить` вне DM; в личке поведение прежнее).

### STEP235 — Neon timeout hardening (PG statement_timeout)
- Postgres pool теперь задаёт **server-side** `statement_timeout` через параметр подключения `options: -c statement_timeout=...` (ENV `PG_STATEMENT_TIMEOUT_MS`, default 15000).
- Добавлены явные лог‑маркеры `db.statement_timeout` при отмене запросов по таймауту (и для `pool.query`, и для `client.query` в транзакциях), чтобы ops/support быстрее ловили “Neon завис/медленный ответ”.
- `SET LOCAL statement_timeout` в монетизационных транзакциях оставлен как “страховка сверху” (circuit breaker).

Риск регрессий: **низкий** (поведение запросов не меняем, кроме предсказуемого отмены “зависших” запросов по таймауту; логирование добавлено без влияния на UX).

### STEP236 — Audit flush cooldown (DB outage anti-hammer)
- При DB outage audit flush больше не пытается писать в Postgres каждую минуту.
- В `flushWorkspaceAuditBuffer()` добавлен короткий cooldown: после **requeue** или **DB ошибки** ставим Redis‑ключ `audit:buffer:ws:requeue_cooldown` на `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC` (default 120), а cron временно возвращает `skipped: requeue_cooldown`.
- В `/api/health` добавлено поле `audit.buffer.requeue_cooldown_ttl_sec` для наблюдаемости.
- `.env.example` дополнен параметрами audit buffer (включая cooldown), чтобы не терять контекст при переносе/аудите.

Риск регрессий: **низкий** (audit flush — best‑effort; при cooldown мы лишь временно пропускаем flush, данные не теряются: остаются в queue/inflight и будут записаны после восстановления DB).

