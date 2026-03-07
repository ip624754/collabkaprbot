# 16 — RELEASE CHECKLIST (2 минуты) — 2026-03-01

Цель: перед каждым деплоем делать один и тот же короткий прогон, чтобы ловить ошибки **до** продакшена.

## A) Перед деплоем (локально)

1) Быстрый прогон

```bash
npm run preflight
# (алиас)
npm run qa:fast
```

Ожидаем: без ошибок. Если упало — см. `docs/process/10_RELEASE_PREFLIGHT.md`.

2) Проверить guardrail ENV (если используешь кастомные таймауты Telegram)
- `TG_HTTP_TIMEOUT_MS`
- `TG_HTTP_MEDIA_TIMEOUT_MS`

3) Если в STEP были миграции — прогнать их заранее (или dry-run)

```bash
node migrations/run.js
# или
node migrations/run.js --dry-run
```

> Если STEP без миграций — этот пункт пропускаем.

## B) Сразу после деплоя (1 минута)

1) Health
- Открыть `GET /api/health`
- Проверить:
  - `ok:true`
  - есть блок `cron.*`

2) 2–3 клика в админке (быстрый sanity UI)
- **Comms / Support**: открыть экран, убедиться что рендерится и навигация не “тупик”.
- **Outbox**: открыть список → открыть одну запись (просмотр).
- **Users**: открыть карточку пользователя → открыть “Заметка/Теги” (если есть).

> Ничего не отправляем и не нажимаем “опасные” действия — только проверяем, что экраны открываются.

3) Быстрый smoke (10–15 минут, рекомендовано)
- Запусти `npm run smoke:short` (печатает чеклист + 4 ключевые проверки).
- Пройди `smoke-tests_short.md` (особенно: Redis degraded UX + input-mode `❌ Отмена/отмена` + монетизационные кнопки).

## C) Если что-то пошло не так

- Остановиться и не “дожимать” прод.
- Быстрое восстановление: откатить деплой на предыдущую версию.
- Детальнее: `docs/13_RUNBOOK_RELEASE.md`.

---

### Примечания
- Vercel Hobby: лимит **≤12 serverless functions**. В baseline STEP383 IG OAuth entrypoints убраны из deploy surface; если деплой снова падает по лимиту — первым делом проверь, не добавили ли новый файл в `api/`. Cron задачи добавляем через `api/cron_router.js` + `vercel.json` rewrites.

- `preflight` покрывает: action registry, автоген docs реестра, nav-lint, redact-тесты, `package-lock` drift gate, **node --check (ловит SyntaxError до Vercel)**.
- Эта страница — **каноничный короткий чек**. Подробности — в `docs/13_RUNBOOK_RELEASE.md`.


## Function budget (Vercel Hobby guardrail)

- Перед деплоем прогонять `npm run check:function-budget` (или полный `npm run preflight`).
- Budget по умолчанию: warning с 9, fail с 11 deployable `api/*` entrypoints.
- Parked/disabled routes держать вне `api/`. Всё, что лежит в `api/`, считается deploy surface.
- Текущий baseline STEP384: 8 entrypoint-ов (`api/cron_router.js`, `api/health.js`, `api/webhook.js`, `api/qstash/*`).
