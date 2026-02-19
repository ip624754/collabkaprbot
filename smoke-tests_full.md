## Patch Series 05–08 — Collab Girls (FULL)

> Полный прогон (30–60 минут): золотые пути + негативные кейсы + права.

---

### 0) Подготовка
**Миграции:** применены через новый мигратор: `npm run migrate`.

Если база существующая и миграции применялись раньше без трекинга:
- `psql "$DATABASE_URL" -f migration_pack/00_mark_all_applied.sql`
- `npm run migrate -- --dry-run`

Если база «под вопросом»:
- `psql "$DATABASE_URL" -f migration_pack/01_reconcile.sql`
- `npm run migrate`

**ENV (проверь наличие):**
- Intro: `INTRO_TRIAL_CREDITS`, `INTRO_COST_PER_INTRO`, `INTRO_DAILY_LIMIT`, `INTRO_DAILY_LIMIT_UNVERIFIED`
- Giveaways: `GIVEAWAY_SPONSORS_MAX_FREE`, `GIVEAWAY_SPONSORS_MAX_PRO`
- Folders: `WORKSPACE_FOLDER_MAX_ITEMS_FREE`, `WORKSPACE_FOLDER_MAX_ITEMS_PRO`, `WORKSPACE_EDITOR_INVITE_TTL_MIN`
- Flags: `VERIFICATION_ENABLED`

**Аккаунты для теста:**
- Owner (владелец Workspace)
- Editor (будет приглашён owner’ом)
- Brand/Buyer (создаёт интро и пользуется CRM)
- Stranger (опционально для негативных проверок)

---

### 1) Commit 05 — Intro trial + daily limits
#### 1.1 Trial выдаётся один раз
1) На новом Brand/Buyer (желательно новый TG) открой offer → `💬 Диалог/Написать`.
- Ожидаемо: интро создаётся; если кредитов не хватало и trial ещё не был выдан — выдаётся trial и сразу списывается `INTRO_COST_PER_INTRO`.

2) Повтори интро ещё раз.
- Ожидаемо: trial НЕ выдаётся повторно.

#### 1.2 Дневной лимит
1) Сделай интро до лимита `INTRO_DAILY_LIMIT`.
- Ожидаемо: при попытке `лимит+1` — блок/alert (без списаний).

2) Убедись, что после лимита:
- новый thread не создаётся
- credits не списываются

#### 1.3 Неверифицированные пользователи (если включено)
1) Включи `VERIFICATION_ENABLED=true`.
2) Для невёр. пользователя сделай интро до `INTRO_DAILY_LIMIT_UNVERIFIED`.
- Ожидаемо: блок на попытке `+1`.

3) Пройди верификацию (как в проекте) и повтори.
- Ожидаемо: лимит расширяется до `INTRO_DAILY_LIMIT`.

#### 1.4 Негативные кейсы
- 0 credits + trial уже использован → интро блокируется, показывается paywall.

---

### 2) Commit 06 — Proofs (2 кнопки)
#### 2.1 Добавление ссылки
1) Открой существующий thread → `🧾 Proofs: N` → `🔗 Ссылка`.
2) Отправь `https://t.me/...`.
- Ожидаемо: proof добавлен, `N` увеличился.

#### 2.2 Добавление скрина
1) `🧾 Proofs` → `📎 Скрин`.
2) Отправь фото.
- Ожидаемо: proof добавлен.
3) Открой proof → `📸 Показать скрин`.
- Ожидаемо: бот присылает фото отдельным сообщением.

#### 2.3 Права доступа
- Stranger не должен иметь доступ к proofs чужого thread (ожидаемо: «Нет доступа»).

**DB spot-check (optional):**
```sql
SELECT * FROM barter_thread_proofs ORDER BY id DESC LIMIT 10;
```

---

### 3) Commit 07 — CRM stage display
#### 3.1 Gating
1) Без Brand Plan попробуй изменить стадию.
- Ожидаемо: предупреждение (доступно в Brand Plan).

2) Активируй Brand Plan и повтори.
- Ожидаемо: стадия меняется.

#### 3.2 Отображение
1) В thread должна появиться строка `CRM: ...`.
2) В Inbox рядом с тредом должна появиться emoji стадии (buyer-side).

---

### 4) Commit 08 — Workspace folders + Editors + Giveaways + Offers
#### 4.1 Папки (Owner)
1) Workspace → `📁 Папки` → `➕ Новая папка`.
2) Задай имя.
- Ожидаемо: папка создана.

3) Открой папку → `➕ Добавить` → вставь список:
- `@chan1\n@Chan2\nhttps://t.me/chan3\nt.me/chan4`
- Ожидаемо: все каналы нормализуются до `@username` lowercase, без дублей.

4) `📤 Экспорт`.
- Ожидаемо: бот выдаёт список (чанками, если длинный).

#### 4.2 Лимиты папки
1) На FREE добавь больше `WORKSPACE_FOLDER_MAX_ITEMS_FREE`.
- Ожидаемо: запрет и подсказка про лимит.

2) Включи PRO для workspace и добавь до `WORKSPACE_FOLDER_MAX_ITEMS_PRO`.
- Ожидаемо: лимит расширился.

#### 4.3 Editors (роль folder-editor)
1) Owner → `📁 Папки` → `👥 Editors` → `Invite editor`.
- Ожидаемо: deep-link `/start fed_{wsId}_{token}` + TTL.

2) Открой ссылку на аккаунте Editor.
- Ожидаемо: Editor добавлен.

3) Editor → `📁 Папки` → выбрать workspace → добавить/удалить 1 канал.
- Ожидаемо: работает.

4) Editor пытается удалить папку.
- Ожидаемо: отказ (только owner).

5) Owner удаляет editor из списка.
- Ожидаемо: Editor теряет доступ к папкам этого workspace.

6) Повторно открыть тот же deep-link.
- Ожидаемо: «ссылка устарела или недействительна».

**DB spot-check (optional):**
```sql
SELECT * FROM workspace_editors ORDER BY created_at DESC LIMIT 10;
SELECT * FROM channel_folders ORDER BY id DESC LIMIT 10;
SELECT * FROM channel_folder_items ORDER BY id DESC LIMIT 20;
```

#### 4.4 Giveaways: sponsors из папки
1) Создай giveaway до шага Sponsors.
2) Нажми `📁 Из папки` → выбери папку.
- Ожидаемо: sponsors подставились.
- Если превышает лимит — предупреждение и остановка.

#### 4.5 Offers: partner folder
1) Создай offer.
2) Прикрепи папку партнёров.
- Ожидаемо: в карточке видно название папки и число каналов.
3) Публичный просмотр offer (если используется) показывает snippet партнёров.

**DB spot-check (optional):**
```sql
SELECT id, partner_folder_id FROM barter_offers ORDER BY id DESC LIMIT 10;
```

---

### 5) Дополнительные edge-cases
- В папку не должны добавляться invite-links вида `t.me/+xxxx`.
- `@Chan` и `@chan` не дублируются.
- Giveaways: вставка папки заменяет список спонсоров (expected behavior).


## Presets/Шаблоны (Commit 7)
- Giveaway presets: a:gw_new → 🧩 Пресеты → применить → winners → sponsors → deadline → publish.
- Barter offer presets: a:bx_new → 🧩 Шаблоны → применить → отправить текст → оффер создан.


## Verification incentives (Commit 8)

### Цель
Показать ценность верификации в момент, когда бренд упирается в лимит/Brand Pass, и дать прямой CTA.

### Кейс 1 — Paywall содержит подсказку + CTA
1. Зайти в ленту офферов → открыть оффер → нажать «💬 Написать», чтобы появился Brand Pass paywall.
2. Проверить, что в тексте есть строка про верификацию (увеличение дневного лимита) и что присутствует кнопка:
   - «✅ Увеличить лимит (верификация)» → `a:verify_home`.

### Кейс 2 — Экран верификации показывает «Преимущества»
1. Нажать CTA на paywall → открыть `✅ Верификация`.
2. Проверить, что есть блок «Преимущества»:
   - для Brand: про лимит интро (unverified → verified)
   - для Creator: про бейдж ✅ в ленте/диалогах.

### Негатив
- Если `VERIFICATION_ENABLED=false` — никаких подсказок/CTA на paywall не появляется.

## Retry credits (fairness)
- Включить env: INTRO_RETRY_ENABLED=true
- Для быстрого теста: INTRO_RETRY_AFTER_HOURS=0 (потом вернуть 24)
- Сценарий:
  1) Brand открывает интро (bx_msg) → если достаточно Brand Pass, списывается кредит.
  2) Brand отправляет сообщение в тред (bx_thread_msg).
  3) Creator НЕ отвечает.
  4) Запускаем cron tick (giveaways-tick) → должен начислиться Retry credit (уведомление бренду, если INTRO_RETRY_NOTIFY=true).
  5) Brand открывает следующее интро → должно быть списание Retry credit (без минуса Brand Pass).
- Негативные кейсы:
  - Если Brand открыл интро, но НЕ отправлял сообщение — Retry credit не начисляется.
  - Если Creator ответил хотя бы 1 раз — Retry credit не начисляется.
  - Если Retry credit истёк (expires_at) — он становится EXPIRED и не используется.
