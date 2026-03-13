# 10 — Release Preflight (QA fast) — 2026-02-28

Цель: перед деплоем/мерджем быстро прогонять минимальный набор проверок, чтобы не ловить “сюрпризы” в проде.

## Команда

```bash
npm ci
npm run preflight
# или
npm run qa:fast
```

> Если работаешь из свежего ZIP/snapshot checkout без `node_modules`, сначала обязательно поставь зависимости. Начиная с STEP420 preflight валится на этом сразу и явно, а не позже внутри deep smoke/import chain.

## Что проверяет

1) `actions:check`  
   Гарантирует, что все callback action keys, которые реально используются в UI/боте, присутствуют в `src/bot/actionRegistry.js` (и guard-логика согласована).

2) `actions:md` + check “не грязно”  
   Генерирует `docs/02_ACTION_KEYS_REGISTRY.md` и проверяет, что файл **не изменился** по сравнению с текущим содержимым.  
   Если изменился — значит документация реестра устарела: нужно закоммитить обновлённый файл.

3) `lint:nav`  
   Проверяет, что в ключевых экранах нет “тупиков” навигации (footer/back‑ряд соблюдён по стандарту).

4) `test:redact`  
   Проверяет, что маскирование контактов работает корректно (не утечки email/phone/etc. в публичных местах).

5) `lint:public-contacts`  
   Grep‑gate на регрессии в **публичных (brand‑facing) рендерах**: запрещает возвращать прямое отображение пользовательского текста, который может содержать контакты, до unlock.  
   Сейчас проверяет два ключевых инварианта в `src/bot/bot.js`:
   - `renderBxPublicView`: `barter_offers.description` редактируется для non‑owners до unlock.
   - `renderWsPublicProfile`: `ws.profile_about` редактируется для non‑owners до revealContacts.

6) `lint:redis-atomic`  
   Grep‑gate на регрессии: запрещает возвращать в runtime‑код неатомарные связки Redis-команд (например `LPUSH+LTRIM(+EXPIRE)`, `INCR+EXPIRE`, `LRANGE+LTRIM`) вне `src/lib/redis.js`.  
   Это защищает от “immortal keys” и race‑окон, которые мы уже один раз закрывали.

7) `lint:redis-ttl`  
   Grep‑gate на регрессии: запрещает появление `redis.set(a, b)` без TTL (двухаргументный `set`) в runtime‑коде.  
   Исключения (намеренно persistent) должны быть явно помечены комментарием `TTL-LINT: ...`.

8) `lint:redis-exports`  
   Защита от build‑regression: гарантирует, что `src/lib/redis.js` экспортирует обязательные helper’ы (`incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`).  
   Это предотвращает падение на Vercel при загрузке ESM модулей с ошибкой вида `does not provide an export named ...`.

9) **Node syntax check (`node --check`)**  
   Запускает `node --check` по ключевым entrypoint‑ам (`src/bot/bot.js`, `api/webhook.js`, `api/cron_router.js`, и т.д.), чтобы ловить **SyntaxError на cold start** (например, случайный literal newline внутри строки `'...'`) ещё **до** деплоя.

10) **Admin → Ops keyboard/actions contract smoke**  
   Source-level smoke `scripts/smoke-admin-ops-contract.js` проверяет, что экран `Админка → Операции` сохраняет операторский контракт: основные кнопки (`Пользователи/Платежи/Рассылка/Аудит/Метрики`), служебные действия (`Flush ops digest`, `Clear pending snapshot`), footer (`Админка / Меню / Home`), confirm-flow очистки snapshot и health-кнопку только за `PUBLIC_BASE_URL`. Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

11) **Admin → Comms keyboard/footer contract smoke**  
   Source-level smoke `scripts/smoke-admin-comms-contract.js` проверяет, что экран `Админка → Коммуникации` сохраняет операторский контракт: primary row (`Объявление / Шаблоны DM`), `Outbox`, условный gate `Офиц.канал (${pending})` только при `OFFICIAL_PUBLISH_ENABLED`, а также footer (`Админка / Меню / Home`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

12) **Admin → System keyboard/footer contract smoke**  
   Source-level smoke `scripts/smoke-admin-system-contract.js` проверяет, что экран `Админка → Система` сохраняет операторский контракт: summary-строки (`Платежи`, `Match/Feat auto-apply`, `Payments fallback apply`, `Broadcast fan-out (QStash)`, `Founder Sale`), keyboard rows для payment toggles / Match-Feat+Fallback / QStash / Hard-skip / Founder / moderators / gift subscription и footer (`Админка / Меню / Home`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

13) **Admin → Founder Sale contract smoke**  
   Source-level smoke `scripts/smoke-admin-founder-contract.js` проверяет отдельный operator-flow `Админка → Founder Sale`: summary/status блок (`Источник настроек`, `ENABLED`, `DEADLINE`, `STATUS`, `⏳ Осталось`, `Цены / кредиты`), control rows (`toggle`, `Дедлайн/Цены`, `Кредиты/Сброс`, `Ссылки/Тексты`), footer (`Система / Меню / Home`), а также helper screens `Founder Sale — ссылки` и `Founder Sale — тексты (copy/paste)` с presets `fs_offers_a/fs_offers_b/fs_gw_brand/fs_gw_creator`. Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

14) **Admin → Notice composer/runtime contract smoke**  
   Source-level smoke `scripts/smoke-admin-notice-contract.js` проверяет отдельный operator-flow `Админка → Объявление`: summary/status блок (`STATUS`, `SEVERITY`, `TARGET`, `EXPIRES`, `CTA`, `VERSION`, preview текста), control rows (`toggle/severity`, `target/expire`, `CTA/text`, `clear/publish`), footer (`Коммуникации / Меню / Home`) и runtime-contract (`clearExpectText/clearDraft` на входе, `severity/target` cycles, composer prompts для `CTA/Expire/Text`, publish requires text + `version++` + `active=true`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

15) **Admin → Outbox contract smoke**  
   Source-level smoke `scripts/smoke-admin-outbox-contract.js` проверяет отдельный operator-flow `Админка → Outbox`: list/view экраны (`Outbox`, `Redis-only`, privacy hint для non-DM, per-entry кнопки, pagination, `Очистить`, footer `Коммуникации / Меню / Home`), quick-actions (`Карточка / Написать / Повторить / Заметка / В шаблон`) и callback/confirm-flow (`clearExpectText` на входе, DM-only guard для repeat/save-to-template, preview send controls, `Очистить Outbox?` confirm screen, clear → rerender list). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

16) **Admin → DM Templates contract smoke**  
   Source-level smoke `scripts/smoke-admin-dm-templates-contract.js` проверяет отдельный operator-flow `Админка → Шаблоны DM`: list/view экраны (`Шаблоны сообщений (DM)`, `Источник`, `Версия`, `Обновлено`, per-template buttons, `Новый шаблон`, `Сбросить к дефолту`, pagination, `Вставить`, footer `Коммуникации / Меню / Home`), add/edit/delete/reset flow (`clearExpectText`, стабильные prompts, confirm screens, `version++`, возвраты в list/view) и связку с `Outbox → В шаблон` (`Открыть шаблон / Шаблоны DM / Outbox`, DM-only guard, clipping warning). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

17) **Admin → Payments contract smoke**  
   Source-level smoke `scripts/smoke-admin-payments-contract.js` проверяет отдельный operator-flow `Админка → Payments`: list-screen (`Payments • STATUS`, `Платежей нет.`, per-payment buttons, ORPHANED-only `Auto-heal missing_session`, pagination, `Операции`), detail-screen (`Payment #id`, `Status/Kind/User/Amount/Created`, spoiler-блоки `Charge/Payload/Note`, условный `Apply (manual)`, `К списку / Операции`) и callback/runtime contract (`a:admin_payments/view/apply/autoheal`, `clearExpectText`, strict validation, DB claim before apply, block/error alerts, auto-heal только для `ORPHANED missing_session`, summary alert). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

18) **Admin → Payments Fallback contract smoke**  
   Source-level smoke `scripts/smoke-admin-payments-fallback-contract.js` проверяет отдельный operator-flow `Админка → Payments fallback apply`: summary/status блок (`EFFECTIVE / ENV / RUNTIME`, TTL hint, инцидентный guidance, runtime details `Enabled by / At / Until / Reason`), control rows (`2h incident / 12h backlog / 24h migration`, условный `Disable`) и footer (`Система / Админка / Меню / Home`). Дополнительно валидируются callback/runtime contract `a:admin_pay_fb / a:admin_pay_fb_set / a:admin_pay_fb_off` (admin gate, `setPaymentsFallbackRuntime`, success/failure toasts) и связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

19) **Admin → QStash Status contract smoke**  
   Source-level smoke `scripts/smoke-admin-qstash-status-contract.js` проверяет отдельный operator-flow `Админка → QStash статус`: summary/status экран (`🛰 QStash — статус`, `Lib`, `ENV token/signing/base_url`, `Fan-out`, `Broadcast tick`, `Worker last delivery`, `Ping received/enqueued`, `Broadcast cooldown`), keyboard/footer (`Send signed ping`, `Fan-out toggle`, `Система / Меню / Home`) и callback/runtime contract `a:admin_qstash_status / a:admin_qstash_ping` (admin gate, missing lib/token/base_url screens, Redis breadcrumbs `last_enqueued_*`, `qstashPublishJSON` с `signed_ping` + dedup/timeout, success rerender). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

20) **Admin → Hard-skip contract smoke**  
   Source-level smoke `scripts/smoke-admin-hard-skip-contract.js` проверяет отдельный operator-flow `Админка → Hard-skip (dead chats)`: home/hits/view экраны (configured TTL, `Найти TG ID`, `Последние пропуски`, filters, `Export last 200`, quick TG buttons, `Снять hard-skip`) и их фактическую навигацию/footer. Дополнительно валидируются callback/runtime contract `a:hs_home / a:hs_hits / a:hs_find / a:hs_view / a:hs_unskip / a:hs_hits_export` (`hs_find` expectText/backCb, bounded export helper `adminHardSkipHitsExport`, TXT export document + rerender toast) и связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

21) **Admin → Users contract smoke**  
   Source-level smoke `scripts/smoke-admin-users-contract.js` проверяет operator-flow `Админка → Пользователи`: list-screen (`Пользователи · фильтр · стр`, spoiler-строку поиска, empty-state, DM-only quick actions `Карточка / Написать / Заметка` при 1–5 результатах, filter/search/reset/export/pagination, `Операции`), search/reset callbacks (`a:admin_users / a:admin_users_search / a:admin_users_reset`, `clearExpectText`, сохранённый Redis-query, footer `Система / Меню / Home`) и CSV export contract (`a:adm_ucsv`, `exportUsersDirectory`, стабильный header/filename/caption, truncation warning, back buttons `К списку / Админка`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

22) **Admin → User Card + Note contract smoke**  
   Source-level smoke `scripts/smoke-admin-user-card-note-contract.js` проверяет operator-flow `Админка → User Card + Note`: card-screen (`Карточка пользователя`, ID/TG ID/Username/Роли, DM-safe snippet/tags block, actions `Скопировать ID / Написать / Заметка / Подарить подписку`, revoke/ban toggles, back buttons `К списку / Операции`), note-screen (`Заметка (admin)`, DM-only guard, tags summary + toggle rows, `Изменить текст / Очистить всё / К карточке`, optional return-route button, footer `Коммуникации|Операции / Меню / Home`), note callbacks (`a:adm_ucard / a:adm_unote / a:adm_unote_edit / a:adm_unote_clear_q / a:adm_unote_clear / a:adm_unote_tag`) и `expectText` flow `adm_user_note` (`clear/cancel`, save helper с metadata, возврат в `Карточка/Заметка`). Дополнительно валидируются связанные записи в `src/bot/actionRegistry.js`, чтобы ловить тихие rename/remove/re-guard регрессии до выкладки.

23) **Broadcast deliver → local DB overload fuse contract smoke**  
   Source-level smoke `scripts/smoke-broadcast-local-db-fuse.js` проверяет, что в `api/qstash/broadcast-deliver.js` есть warm-instance local fuse для редкого сценария `DB overloaded + Redis unavailable`: module-level state `localDbDegradedUntilMs`, helpers `getLocalDbOverloadFuseTtlMs/getLocalDbOverloadFuseUntilMs/armLocalDbOverloadFuse`, arming local fuse только при провале записи Redis-fuse, precheck `local_fuse_precheck` **до** Redis fuse read и **до** `db.getBroadcast(...)`, а `respondDbOverloadFuse(...)` маркирует путь флагом `local_fuse`. Это ловит регресс, при котором warm instance продолжает жечь Neon, хотя Redis уже недоступен и локальный short-circuit должен сработать.

11. `npm run smoke:payments-autoheal-chain-contract`

   Source-level smoke `scripts/smoke-payments-autoheal-chain-contract.js` проверяет bounded chain-drain для больших очередей `ORPHANED missing_session`: `src/lib/config.js` должен экспортировать `PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX`, `/api/health` — показывать `payments.orphaned_autoheal_chain_max`, `src/bot/cron.js` — публиковать first-leg continuation (`action='orphaned_autoheal'`, `chain_depth=1`, `chain_source='cron'`, `dedup=mon:autoheal:*`) только на полном batch, а `api/qstash/monetization-retry.js` — иметь worker branch `orphaned_autoheal`, который повторно claim’ит batch через `claimOrphanedMissingSessionPaymentsForAutoheal(...)`, self-reenqueue’ит следующую bounded leg с depth-limit/dedup и не трогает existing exactly-once guards fallback-apply. Это ловит тихий регресс, при котором backlog снова разбирается только по одному batch за tick или цепочка уходит в бесконечный reenqueue.

24) **ENV baseline contract smoke**  
   Source-level smoke `scripts/smoke-env-baseline-contract.js` проверяет, что `.env.example`, `docs/92_PROD_ENV_BASELINE.md` и `src/lib/config.js#assertEnv()` не расходятся по текущему prod/release baseline: используются актуальные имена `PUBLIC_BASE_URL` / `SUPER_ADMIN_TG_IDS`, в example присутствуют критичные QStash / payments / broadcast / audit / parked-IG ключи, а безопасные дефолты `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0` и `PAYMENTS_FALLBACK_APPLY_ENABLED=0` не разъехались. Если рядом есть локальный prod-like `.env*`, smoke дополнительно падает сразу на missing required keys вместо позднего runtime сюрприза.

25) **Creator current-channel contract smoke**  
   Source-level smoke `scripts/smoke-creator-current-channel-contract.js` фиксирует текущую creator IA: `📋 Меню` = current-channel menu, top row `🔁 Сменить канал` + `📂 Текущий канал`, `ws_open = Работа с каналом`, `ws_settings = Настройки канала`, quick verification entrypoint живёт в settings как `✅ Верификация аккаунта`, а creator current/no-active screens не протекают role-switch/share/verification utility CTA обратно в рабочее меню.

26) **Telegram share URL compatibility contract smoke**  
   Source-level smoke `scripts/smoke-share-url-compat-contract.js` проверяет совместимый share contract для `📨 Отправить` и curator invite `📤 Поделиться`: share URL должен оставаться в формате `t.me/share/url?url=<U+2060>&text=...`, без регресса к `...share/url?text=...` или `url=&text=...`, а связанные action keys должны сохранять свои guards. Это ловит очень неприятные Telegram-client regressions, когда кнопка выглядит живой, но при нажатии «молчит».

## Дополнительный ранний gate (STEP420)

Перед всеми deep smoke `scripts/preflight.js` теперь делает **local dependency install guard**:
- читает declared dependencies из `package.json`;
- проверяет, что они реально резолвятся из текущего checkout;
- если зависимостей локально нет, падает сразу с явным install hint (`npm ci` / `npm install`).

Это не runtime-check и не бизнес-логика. Цель только одна: свежий архив/снимок должен ломаться сразу и понятно, а не через поздний `ERR_MODULE_NOT_FOUND` внутри staging smoke.

## После зелёного preflight: быстрый operator sanity (1 минута)

Preflight ловит regressions до деплоя, но после выкладки оператор должен помнить ещё три практических правила:
- если health показывает `broadcast.db_overload.local_fuse_active=true`, не жми повторные deliver/replay — local fuse уже защищает warm instance от лишнего DB touch;
- если виден большой хвост `ORPHANED/missing_session`, помни про bounded chain-drain (`payments.orphaned_autoheal_chain_max`) и не включай runtime fallback apply без явного инцидента;
- если Official Publish завис в `PUBLISHING`, первый safe action — `🩺 Проверить статус`, а не manual republish.

См. также:
- `docs/90_OWNER_RUNBOOK.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`

## Если preflight упал

- На `Missing local npm dependencies required for full preflight` → это install/tooling issue, а не runtime-regression: запусти `npm ci` (или `npm install`, если checkout частично установлен), затем повтори preflight.
- На `actions:md changed` → закоммить `docs/02_ACTION_KEYS_REGISTRY.md` и повторить.
- На `lint:nav` → поправить клавиатуру/футер по `docs/process/09_ADMIN_UX_STANDARD.md`.
- На `test:redact` → поправить редактирование/маскирование, не допуская “полных” контактов.
- На `lint:public-contacts` → проверь публичные карточки/витрины: пользовательский текст (описания) должен идти через `redactContactsInText` до unlock.
- На `lint:redis-atomic` → перенести операции на helpers из `src/lib/redis.js` (или на Lua‑атомарность), не оставлять fallback‑цепочки.
- На `lint:redis-ttl` → добавь TTL (`{ ex: ... }`) для `redis.set`, либо явно отметь intentional persistence комментарием `TTL-LINT: ...`.
- На `lint:redis-exports` → проверь `src/lib/redis.js`: в нём должны быть named exports для `incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`.
- На `Admin → Ops keyboard/actions contract` → проверь `renderAdminOps()` и confirm-flow `a:admin_ops_pending_clear`, затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons.
- На `Admin → Comms keyboard/footer contract` → проверь `renderAdminComms()` и gate `OFFICIAL_PUBLISH_ENABLED`, затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons/footer.
- На `Admin → System keyboard/footer contract` → проверь `renderAdminSystem()` и состав operator rows (`payments/match-fallback/qstash/hard-skip/founder/moderators/gift`), затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons/footer.
- На `Admin → Founder Sale contract` → проверь `renderAdminFounder()` + helper screens `renderAdminFounderLinks()/renderAdminFounderTexts()` и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback buttons/footer/deep-link presets.
- На `Admin → Notice composer/runtime contract` → проверь `renderAdminSysNotice()`, callback handlers `a:admin_notice*` и `expectText` flow (`admin_notice_text/cta/expire`), чтобы не потерять кнопки, footer, publish-guard, `version++`, `active=true` и post-save follow-up сообщения.
- На `Admin → Outbox contract` → проверь `renderAdminOutbox()/renderAdminOutboxView()`, callback handlers `a:admin_outbox*`, DM-only guard для `repeat/save-to-template`, preview buttons, clear-confirm screen и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/footer actions.
- На `Admin → DM Templates contract` → проверь `renderAdminDmTemplates()/renderAdminDmTemplateView()`, callback handlers `a:admin_umsg_tpl*`, add/edit/delete/reset prompts и confirm flows, `adm_outbox_tpl_label` связку с `Outbox → В шаблон`, а затем синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/footer actions.
- На `Admin → Payments contract` → проверь `renderAdminPayments()/renderAdminPaymentView()`, helper’ы `adminApplyPayment()/adminAutoHealPayments()`, callbacks `a:admin_payments/view/apply/autoheal`, strict validation + DB claim before apply, ORPHANED-only `missing_session` auto-heal и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/back actions.
- На `Admin → Payments Fallback contract` → проверь `renderAdminPaymentsFallback()`, callbacks `a:admin_pay_fb / a:admin_pay_fb_set / a:admin_pay_fb_off`, preset TTL buttons, `setPaymentsFallbackRuntime(...)`, success/failure toasts и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/footer actions.
- На `Admin → User Card + Note contract` → проверь `renderAdminUserCard()/renderAdminUserNote()`, callbacks `a:adm_ucard / a:adm_unote*`, DM-only guard и `expectText` flow `adm_user_note` (`clear/cancel/save`), а также синхронизируй `src/bot/actionRegistry.js` с реальным составом card/note/footer actions.
- На `Broadcast deliver → local DB overload fuse contract` → проверь `api/qstash/broadcast-deliver.js`: наличие module-level `localDbDegradedUntilMs`, helpers `getLocalDbOverloadFuseTtlMs/getLocalDbOverloadFuseUntilMs/armLocalDbOverloadFuse`, arming local fuse **только** при провале `redis.set(dbOverloadFuseKey(), ...)`, precheck `local_fuse_precheck` **до** `redis.get(dbOverloadFuseKey())` и **до** `db.getBroadcast(...)`, а также `respondDbOverloadFuse(..., localFuse=true)`/`local_fuse` marker в JSON-ответе.
- На `Payments orphaned autoheal chain contract` → проверь `src/lib/config.js` и `/api/health` (`PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX`, `payments.orphaned_autoheal_chain_max`), затем `src/bot/cron.js` (first-leg enqueue только при `cand.length >= batch`, `action='orphaned_autoheal'`, `chain_depth=1`, `dedup=mon:autoheal:*`) и `api/qstash/monetization-retry.js` (worker branch `orphaned_autoheal`, repeated claim через `claimOrphanedMissingSessionPaymentsForAutoheal(...)`, self-reenqueue with depth-limit/dedup, без слома `_validateStarsPaymentStrict`/`applyPaymentFallbackNoSession` exactly-once guard’ов).
- На `Admin → QStash Status contract` → проверь `renderAdminQStashStatus()`, callbacks `a:admin_qstash_status / a:admin_qstash_ping`, summary/status lines (`Lib / ENV / Fan-out / Broadcast tick / Ping / Broadcast cooldown`), keyboard/footer (`Send signed ping / Fan-out toggle / Система / Меню / Home`), missing-lib/token/base_url helper screens, `qstashPublishJSON` payload (`signed_ping`, `qping:*`, `retries=0`, `timeout=10s`) и синхронизируй `src/bot/actionRegistry.js` с реальным составом callback/back/footer actions.

## Дальше после preflight

Если preflight прошёл — сделай короткий “2 минуты” чек перед деплоем: `docs/16_RELEASE_CHECKLIST.md`.

---

## Redis TTL smoke check (опционально, 1 минута)

Зачем: быстро поймать **"immortal keys" (TTL = -1)** на ключах, которые обязаны истекать (rate‑limit / locks / буферы). Это страховка от регрессий вида `INCR` без `EXPIRE`.

Требования:
- локально установлен `redis-cli`
- есть доступ к Redis URL (обычно `REDIS_URL`, `rediss://...`)

### 1) Проверка связи

```bash
redis-cli -u "$REDIS_URL" PING
```

### 2) Rate limit keys (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'rl:*' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL rl key: $k";
    done
```

### 3) Audit buffer locks / inflight markers (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'audit:*:flush_lock' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL audit lock: $k";
    done
```

### 4) Ops alerts buffers (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'ops:*' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL ops key: $k";
    done
```

Ожидаемый результат: **пусто** (ничего не печатает). Если видишь `IMMORTAL ...` — это сигнал, что какой‑то путь пишет ключи без TTL, и его нужно чинить до релиза.

## Принцип

Preflight **не меняет прод-логику**. Это dev‑инструмент для уверенного релиза (Zero regressions).


- На `Admin → Audit / Metrics / Moderators contract` → проверь `renderAdminAudit()/sendAdminAuditExport()/renderAdminMetrics()/renderAdminModerators()`, callbacks `a:aud* / a:admin_metrics / a:admin_mod_*`, `expectText` flows `aud_search` и `admin_add_mod_username`, а затем синхронизируй `src/bot/actionRegistry.js` с реальным составом back/footer/confirm actions.

- `scripts/smoke-official-publish-check-now-contract.js` — protects Official Publish operator `check now` / safe verify path.

- На `ENV baseline contract smoke` → синхронизируй `.env.example`, `docs/92_PROD_ENV_BASELINE.md` и `src/lib/config.js#assertEnv()`, не возвращай obsolete names (`BOT_WEBHOOK_URL`, `SUPER_ADMIN_IDS`) и не ослабляй safe defaults `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0` / `PAYMENTS_FALLBACK_APPLY_ENABLED=0`.
- На `Creator current-channel contract smoke` → проверь `mainMenuCreatorCurrentKb()`, `renderCreatorCurrentMenu()`, `renderRoleHub()`, `wsMenuKb()` и `wsSettingsKb()`, чтобы current-channel IA не откатилась к pre-STEP413 модели и не потащила role-switch/share/verification обратно в рабочий creator menu.
- На `Telegram share URL compatibility contract smoke` → проверь `sendWsShareTextMessage()` и `a:cur_invite`: должен оставаться совместимый формат `t.me/share/url?url=<U+2060>&text=...`, без text-only или empty-url вариантов.
- На `Brand Inbox accept-point contract smoke` → проверь `renderBrandAppView()`, `startBrandAppReply()`, `acceptBrandApplication()` и `brand_app_reply` expectText flow: до accept доступны только `✅ Принять / ⛔ Спам / 🗑 Удалить`, после accept открываются `✍️ Ответить / ⚡ Шаблоны / 💬 В работу / ✅ Закрыть`, а `✅ Принять` остаётся единственной spending transition.
- На `Contacts / Brand Pass anti-bypass contract smoke` → проверь `renderWsPublicProfile()`, `renderBrandLeadDialog()`, `renderWsProfileContactsStructured()` и IG templates: контакты/канал должны быть скрыты до unlock, Redis остаётся primary cache, DB fallback допустим только при degraded Redis, а reveal priority остаётся `structured → legacy → site`.
- На `No-channel gate contract smoke` → проверь `renderGwNewWorkspacePicker()`, `renderGwNewGate()`, handler `a:gw_new` и `renderBrandApply()`: missing/stale workspace обязан вести в явный recovery screen (`🚀 Подключить канал / 📣 Мои каналы / 📣 Выбрать канал`) без silent dead-end.
- На `Input mode cancel/reset contract smoke` → проверь `renderBrandApply()`, `renderBrandApplyPreview()`, callbacks `a:brand_apply*`, expectText branch `brand_apply` и structured contacts clear-menu: `✍️ Написать заявку` должен явно включать input mode, `❌ Отмена ввода` должна снимать его, а после сохранения черновика не должно оставаться stuck `expectText`.
- На `What-next / back-navigation contract smoke` → проверь shared helpers `navKb() / navKbInput() / kbNavRow()` и high-signal recovery screens (`renderGwNewGate`, brand-apply done/more, accepted-app done/more, brand-apply preview): footer должен оставаться предсказуемым (`⬅️ Назад`, `📋 Меню`, `🏠 Home`) без drift к stale label `📋 Открыть меню` или silent dead-end.
