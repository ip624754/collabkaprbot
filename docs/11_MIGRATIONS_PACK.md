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


## Генератор `00_mark_all_applied.sql` (без человеческого фактора)
`migration_pack/00_mark_all_applied.sql` **генерируется** из текущих файлов в `migrations/`.
Чек‑сумма = **sha256 содержимого SQL-файла** (точно как в `migrations/run.js`).

### Команда
```bash
npm run gen:migration-pack
```

### Проверка перед коммитом
```bash
npm run gen:migration-pack
git diff -- migration_pack/00_mark_all_applied.sql
```

### Dry-run (печать в stdout)
```bash
node scripts/gen-mark-all-applied.js --dry-run | head
```

⚠️ Важно: этот файл **не создаёт схему**, он только заполняет `schema_migrations` как “уже применено”.
Использовать **только** если схема базы уже соответствует текущему набору миграций.
## Инварианты (обязательно)
- Миграции **не редактируем** задним числом.
- Любое ручное изменение в Neon → оформляем новой миграцией (или добавляем в `01_reconcile.sql` как safety-net).

## Migration Pack (manual Neon move)

В репозитории лежит папка `migration_pack/` — это **ручные** SQL-скрипты для экстренного переноса/восстановления БД (например, при миграции на новый Neon-проект).

Содержимое (idempotent):
- `migration_pack/00_mark_all_applied.sql` — создать `schema_migrations` и отметить текущий набор миграций как применённый (использовать только если схема уже соответствует миграциям).
- `migration_pack/01_reconcile.sql` — привести БД к минимальному инфраструктурному состоянию (pgcrypto/outbox/audit/индексы/soft-delete колонки), безопасно запускать повторно.

⚠️ Эти файлы **не используются** рантаймом и не запускаются автоматически. Основной путь миграций — `node migrations/run.js` (exactly-once + checksum).
## Важно: `migration_pack/*` не должен дублироваться в `migrations/`
Раннер `migrations/run.js` применяет **все** файлы в `migrations/`, которые подходят под шаблон **`NNN..._name.sql`**
(**>=3 цифры** + `_` + имя + `.sql`, regex: `^\d{3,}_.+\.sql$`).
Поэтому скрипты из `migration_pack/` (например `00_mark_all_applied.sql`, `01_reconcile.sql`) **должны жить только в `migration_pack/`** и не должны быть скопированы в `migrations/`.

Иначе есть риск, что раннер применит их как обычные миграции (особенно опасно на fresh DB).

### Fail-fast (защита от человеческого фактора)
Если в `migrations/` обнаружен **любой** `.sql` файл, который **не** подходит под `NNN..._name.sql`,
то `migrations/run.js` и `scripts/gen-mark-all-applied.js` **остановятся с ошибкой** и перечислят “подозрительные” файлы.
Это сделано специально, чтобы случайно не выполнить `migration_pack/*.sql` как миграции.
