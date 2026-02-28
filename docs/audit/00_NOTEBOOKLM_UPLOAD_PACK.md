# NotebookLM Audit Pack — что загрузить и как использовать

Эта папка — "комплект для стороннего аудита" (NotebookLM / люди).  
Цель: чтобы аудитор видел **актуальный source of truth** и не тратил время на поиск.

## 1) Что загружать в NotebookLM (рекомендуемый порядок)

> Если у тебя есть отдельный архив вида `NOTEBOOKLM_AUDIT_SOURCES_STEP###.zip` — используй **самый свежий**.

### Вариант A — если NotebookLM принимает ZIP
1) **FULL ZIP (репозиторий, снапшот проекта)** — самый актуальный FULL_*.zip
2) **AUDIT DOCS PACK** (если отдельно) — этот архив/папка `docs/`
3) **migrations/** + **migration_pack/** (если аудитор не грузит FULL ZIP)

⚠️ Если NotebookLM **не принимает .sql** (частый кейс):
- Используй текстовые копии `migrations_txt/*.sql.txt` и `migration_pack_txt/*.sql.txt`.
- Их можно:
  - взять из готового архива `NOTEBOOKLM_AUDIT_SOURCES_*.zip` (в наших артефактах), или
  - сгенерировать локально командой `npm run gen:notebooklm-sources`.

### Вариант B — если ZIP не читается
Загрузи отдельными файлами (или папками), в таком порядке:
1) `docs/00_CURRENT_STATE.md`
2) `docs/00_BOOT.md`
3) `docs/15_NEW_CHAT_HANDOFF.md`
4) `docs/16_RELEASE_CHECKLIST.md` + `smoke-tests_short.md`
5) `docs/01_SECURITY_INVARIANTS.md`
6) `docs/12_INFRA_CONTROL_PLANE.md` + `docs/10_QSTASH_RUNBOOK.md`
7) `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
8) `docs/20_CONTACTS_MODEL.md`
9) `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`
10) `docs/02_ACTION_KEYS_REGISTRY.md`
11) `docs/spec/*` (все спеки)
12) `migrations/*` и `migration_pack/*`

Если NotebookLM блокирует `.sql`, вместо пункта 12 загрузить:
- `migrations_txt/*` и `migration_pack_txt/*` (это те же SQL, но в формате `.txt`).

Опционально (контекст Neon): `ИСТОРИЯ НЕОН.txt`.

## 2) Какой промпт использовать
- Основной жёсткий аудит: `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`
- Оригинал без правок: `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU_original.txt`

## 3) Настройки аудиопересказа (если нужен “подкаст-отчёт”)
Смотри `docs/audit/02_NOTEBOOKLM_AUDIO_RECAP_FOCUS_RU.md`.

## 4) Если NotebookLM не принимает .sql
Смотри `docs/audit/03_NOTEBOOKLM_SQL_WORKAROUND.md`.
