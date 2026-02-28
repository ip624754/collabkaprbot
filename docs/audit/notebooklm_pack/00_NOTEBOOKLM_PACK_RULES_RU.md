# NotebookLM pack (≤50 файлов) — правила

- NotebookLM принимает максимум **50 файлов**.
- NotebookLM **не загружает .sql**, поэтому миграции идут как `07_MIGRATIONS_ALL.sql.txt`.
- В этот pack мы кладём **только текстовые источники**: `.md` и `.txt`.

## Что внутри (минимум, но достаточно для независимого аудита)
- `01_BUNDLE_CORE_RU.md` — README + BOOT + CURRENT_STATE + LAUNCH + NEW_CHAT_HANDOFF (source of truth).
- `02_BUNDLE_FEATURES_RU.md` — ключевые подсистемы (QStash/Publish/Contacts/Infra/Security/IG).
- `03_BUNDLE_PROCESS_HISTORY_RU.md` — история работ (чтобы аудитор видел эволюцию и решения).
- `04_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` — что просить у аудитора.
- `05_AUDIT_AUDIO_TRANSCRIPT_RU.txt` — прошлые аудиторские идеи (async монетизация, circuit breaker, batching).
- `06_CODE_BUNDLE.txt` — ключевые файлы кода (для проверки “что реально сделано”).
- `07_MIGRATIONS_ALL.sql.txt` — миграции как текст (NotebookLM-friendly).

## Как обновлять при новых STEP
1) Обнови `docs/00_CURRENT_STATE.md` и `docs/process/07_WORK_HISTORY_2026_02.md`.
2) Перегенерируй этот pack (файлы 01–07 должны отражать текущую правду).
3) Перезалей ZIP в NotebookLM и прогоняй “Рецензия”.
