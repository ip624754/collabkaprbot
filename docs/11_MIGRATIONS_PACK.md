# 11 — Migration Pack (Neon / Postgres)

## Цель
Сделать так, чтобы **на любой базе** (fresh Neon или существующая) можно было:
- поднять схему без конфликтов,
- не путаться “что уже применено”,
- не ломать прод “тихими правками” миграций.

## Что изменилось
### 1) `migrations/run.js` теперь *exactly-once*
Добавлена таблица `schema_migrations`:
- `name` (файл миграции)
- `checksum` (sha256 содержимого)
- `applied_at`

Это даёт:
- миграции применяются один раз,
- повторный запуск безопасен,
- **если кто-то отредактировал старую миграцию** → checksum mismatch → мигратор падает (это правильно).

### 2) `migration_pack/` (в проекте)
- `00_mark_all_applied.sql`  
  Для баз, где миграции уже были применены раньше без трекинга. Скрипт создаёт `schema_migrations` и “помечает” все файлы как применённые (по текущим checksum).

- `01_reconcile.sql`  
  Аварийный “repair” (идемпотентно). Поднимает минимум инфраструктуры:
  - `pgcrypto`
  - `event_outbox`
  - `audit_events`
  - ключевые индексы/колонки (включая soft delete)

## Рекомендуемые сценарии

### Fresh DB (Neon new project)
```bash
node migrations/run.js
```

### Existing DB (уже всё применено раньше)
```bash
psql "$DATABASE_URL" -f migration_pack/00_mark_all_applied.sql
node migrations/run.js --dry-run
```

### Existing DB (не уверен в состоянии)
```bash
psql "$DATABASE_URL" -f migration_pack/01_reconcile.sql
node migrations/run.js
```

## Инварианты (обязательно)
- Миграции **не редактируем** задним числом.
- Любое ручное изменение в Neon → оформляем новой миграцией (или добавляем в `01_reconcile.sql` как safety-net).
