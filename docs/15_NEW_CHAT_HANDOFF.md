# 15 — NEW CHAT HANDOFF (copy‑paste) — 2026-02-22

Цель: чтобы в новом чате ассистент **сразу** попал в контекст и работал без регрессий.

---

## 1) Что загрузить в новый чат
1) **FULL project zip** (актуальный snapshot репозитория)
2) (Опционально) отдельный **docs zip** — если хочешь грузить только доки (но в FULL zip они уже есть)
3) (Опционально) список env‑переменных, которые включены в проде (без секретов)

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
Я продолжаю работу над Collabka PR Bot (@collabkaprbot).

Я загрузил:
- полный архив репозитория (FINAL snapshot)
- доки в папке docs/ (актуальные)

Инварианты:
- Vercel serverless, Neon бережём
- не добавлять лишние DB‑запросы в горячие UI пути (меню/кнопки)
- любые изменения маленькие, обратимые, без ломки прода

Текущее состояние (важное):
- /api/health: cron last_run + метрики audit throttle
- audit write‑shedding (ENV‑гейт) для снижения INSERT в workspace_audit
- broadcast: URL‑кнопки до 3, deep-link shortcuts (gw/bp/offer), шаблоны кнопок, ссылки “в слово”, финальный экран рассылки с кнопками
- broadcast: 429-safe курсор + Redis cooldown (пауза) + **DB fuse** `broadcasts.cooldown_until` при деградации Redis + cooldown виден в /api/health
- Contacts / Brand Pass: structured contacts (`profile_contacts` JSONB) + opt-in UI для креатора + приоритет structured→контакт (текстом) + unlock DB-truth (см. `docs/20_CONTACTS_MODEL.md`)
- Anti-bypass: телефоны в тексте маскируем и цифрами, и **словами** (до unlock)
- Break-glass (Admin): при Redis down супер‑админ может открыть allowlist (payments/users/audit) через `bg=1` + ops alert
- Creator → Каталог брендов: «✍️ Написать заявку» включает явный режим ввода + «❌ Отмена ввода» (без “тишины”)
- Brand Inbox: «✅ Принять» — точка списания (status=new→in_progress). До принятия доступны только ✅ Принять / ⛔ Спам / 🗑 Удалить; нельзя «Ответить/Шаблоны/В работу/Закрыть». В карточке показываем баланс кредитов (Redis-only).
- Giveaways: «➕ Новый розыгрыш» без подключённого канала показывает gate‑экран (подключить/выбрать канал) + корректный back
- UX polish: очистка полей через кнопки `🧹 Очистить` (без упоминания “-”), “legacy/старое” не показываем пользователю
- /start role gate: если нет ui_mode (Redis) и нет payload → короткая развилка (Бренд/Креатор), fail‑open
- Instagram OAuth parked: `api/ig/oauth/*` убраны из deploy surface (Hobby function budget), UI скрыт, Instagram остаётся обычной ссылкой/контактом после unlock
- Official publish (@collabka_offers): анти‑дубли token-lock + DB-reserve PUBLISHING (stale rescue) + runbook doc 19
- Founder Sale: экран акции + Stars purchase + runtime управление из админки + deep-link fs_* + маркетинг шаблоны
- Cron safety: token-based Redis locks + SQL atomic guards на статусных переходах; notify ограничены по времени (withTimeout ~5s)

Пожалуйста:
1) прочитай docs/README.md → затем docs/00_BOOT.md → затем docs/00_CURRENT_STATE.md (в т.ч. раздел «Выводы последнего регресс-аудита + watchlist»)
2) перечисли 3–7 самых рисковых зон регрессий
3) предложи следующий микро‑шаг без расширения поверхности и без лишних DB‑запросов в меню

Формат результата для любого изменения:
- FULL zip + Hotfix zip (только изменённые файлы) + git‑apply patch
- список изменённых файлов + что поменялось
- QA чеклист
---

---

## 3) Мини‑смоук, который ассистент должен предложить
- `/api/health` (ok/cron/audit)
- broadcast (создать тест → tick вручную → “завершена” с кнопками)
- /start (новый юзер видит роль, deep‑links не ломаются)

---

## 4) Быстрый шаблон промпта
Если хочется прям “как надо” — используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`

## Production docs (read before going live)

- `docs/92_PROD_ENV_BASELINE.md` — baseline ENV для продакшена (без секретов)
- `docs/93_PROD_DEPLOY_CHECKLIST.md` — чеклист деплоя/проверок (health + админка)

