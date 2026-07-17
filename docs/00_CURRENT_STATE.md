## STEP582 — Preflight Truth Restoration (2026-07-17)

**Current handoff-safe baseline:** STEP582 source stabilization on top of STEP581 audit/docs.

Verified local truth:
- callback consistency is restored: 553 refs, 546 exact handlers, 7 explicit aliases, 0 unresolved;
- dependency preflight resolves installed public package entrypoints and passes;
- dependency/runtime smoke chain passes, including Redis-down degradation;
- parallel syntax check over `api/`, `migrations/`, `scripts/`, and `src/` passes;
- npm audit reports 0 vulnerabilities.

Truth boundary:
- the canonical serial `npm run preflight:source` process exceeded the execution environment time limit during its large `node --check` loop; remaining syntax and optional invariant checks were executed separately and passed;
- production runtime was not reverified.

Next recommended STEP: **STEP583 — Runtime Proof Spine**.

See `docs/process/07_WORK_HISTORY_STEP582.md`.

---

## STEP581 — Full project audit and roadmap (2026-07-17)

**Current handoff-safe baseline:** STEP581 audit documentation on top of STEP580 docs and unchanged STEP579 runtime source.

Verified audit truth:
- 211 JavaScript files pass syntax check;
- npm dependency audit reports 0 vulnerabilities;
- canonical source preflight is NOT green: 21 callback references are unresolved by the consistency guard;
- dependency preflight contains a false-negative resolver for installed scoped packages;
- Vercel function budget is 11/12;
- live production runtime was not reverified.

Next required STEP: **STEP582 — Preflight Truth Restoration**.

See:
- `docs/audit/STEP581_FULL_PROJECT_AUDIT_2026_07_17.md`
- `docs/roadmap/COLLABKA_EXECUTION_ROADMAP_AFTER_STEP581.md`
- `docs/AI_MULTI_MODEL_HANDOFF_CURRENT.md`

---

## STEP580 — CogniForge governance + Creator OS documentation integration (2026-07-17)

**Current handoff-safe baseline:** STEP580 docs/governance layer on top of the unchanged STEP579 runtime source.

Added canonical project contracts:
- `docs/AI_NATIVE_WORKFLOW.md` — FAST/STANDARD/HEAVY routing, STEP lifecycle, Truth Boundary, artifacts and DoD;
- `docs/SYSTEM_INVARIANTS.md` — cross-system invariants for serverless/Neon, Telegram, invites, giveaways, monetization, cron, admin and docs;
- `docs/RISK_REGISTRY.md` — living technical/product/AI risk register;
- `docs/CREATOR_OS_THESIS.md` — incremental Creator Collaboration Operating System north star and non-goals;
- `docs/CHATGPT_COLLABKA_UPGRADE_NOTES.md` — exact STEP580 scope and verification boundary.

Continuity repaired:
- `docs/README.md`, `docs/00_BOOT.md`, and `docs/15_NEW_CHAT_HANDOFF.md` now identify STEP580 consistently;
- stale first-response/baseline instructions were removed;
- `docs/process/07_WORK_HISTORY_STEP580.md` records the docs-only delta.

Truth boundary:
- source/archive verification completed;
- runtime code, DB, callbacks, invite/reward math, giveaway, auth, webhook, cron, payments and admin behavior were not changed;
- no deploy or live runtime verification was performed or required for this docs-only STEP.

---
**STEP579:** security hardening micro-pack — keeps the current product/runtime behavior intact while tightening a few narrow source-confirmed hardening seams. `api/webhook.js` now compares `x-telegram-bot-api-secret-token` with `timingSafeEq(...)` instead of plain string equality, and `api/cron_router.js` uses the same constant-time compare for `CRON_SECRET` so public secret-bearing endpoints follow one contract. `src/bot/bot.js` now documents the real truth boundary around `_degradedClickGuard`: it remains best-effort load shedding only, while the covered destructive actions (`a:brand_app_accept`, `a:wsp_contact_unlock`) continue to rely on downstream DB/advisory-lock invariants for correctness. Giveaway draw locking is source-confirmed and made more explicit, not redesigned: `src/db/queries.js` keeps returning `{ status: 'locked' }` from the `pg_try_advisory_xact_lock(...)` fail-fast path, and `src/bot/cron.js` now branches on that status explicitly so the non-drawn path is intentional and reviewable rather than looking like an accidental silent ignore. New source smoke `scripts/smoke-security-hardening-contract.js` guards the timing-safe compare contract and the documented lock-path boundary. Live verification is still required only for ordinary deploy/runtime observation; no migrations, no ledger changes, no callback/product IA changes were introduced.

**STEP578:** invite education copy polish — keeps STEP571–577 invite/reward truth intact but imports the last strong user-education layer from the SWB pattern into bounded read screens. `src/bot/bot.js` now explains invite stats more honestly on `📊 Статистика` (`Как читать статистику` for `Приглашено / Активировано / Конверсия`), adds a compact `Как работают баллы` block on `💎 Баллы`, and adds `Как работает обмен` on `🎁 Обменять Pro` so users understand that rewards come from valid activation rather than raw opens, self-invites and existing users do not count, pending is not spendable, and only `Доступно` can be redeemed into bounded Pro time. Scope stays intentionally narrow: no reward math changes, no ledger rewrite, no new callbacks, no migration changes, and no admin invite redesign. New source smoke `scripts/smoke-invite-education-copy-contract.js` guards the new explanatory copy contract. Live verification is still required for mobile readability of the longer read screens in real Telegram.

**STEP577:** invite recovery + RU copy polish — closes the remaining user-side invite UX tail without touching reward math, ledger semantics, anti-abuse, or admin invite logic. `src/bot/bot.js` now gives self-invite `/start` rejections an explicit recovery keyboard (`⬅️ Инвайты` + `🏠 Home`) instead of leaving the latest notice message buttonless, and the invite user surfaces are tightened into cleaner Russian copy (`Сводка`, `Приглашено`, `Активировано`, `Конверсия активации`, `Быстрый статус`, `Последние приглашённые`, `Доступно / В ожидании / Обменяно`). The global `🏠 Home` label is intentionally preserved as the cross-product escape hatch, while invite-specific copy is normalized so the module no longer reads as a RU/EN mix. New source smoke `scripts/smoke-invite-recovery-copy-contract.js` guards both the recovery keyboard and the RU-copy contract. Live verification is still required for the self-invite deep-link path and real Telegram readability after deploy.

**STEP576:** Invite IA completion — keeps STEP571–575 reward truth intact but finishes the user-side invite information architecture. `src/bot/bot.js` now renames the generic `Поделиться` entrypoint to `📨 Инвайты` where it opens the invite module, adds two new bounded read screens (`📊 Статистика`, `💎 Баллы`), keeps `📄 История` and `🎁 Обменять` as explicit peer entrypoints on the hub, and shortens the main hub to a compact status surface instead of trying to explain the whole module in one message. The main keyboard is now `Пригласить / Ссылка / Инвайт-карта / Статистика / Баллы / История / Обменять / Обновить`, while reward math, ledger semantics, anti-abuse rules, migrations, and admin invite visibility remain unchanged. New callbacks `a:share_perf` and `a:share_points` are added as read-only surfaces with matching action-registry entries and source smokes. Live verification is still required for real Telegram readability and zero-state density.

**STEP574:** pending reward resolution polish — tightened invite/reward visibility around `pending` without changing reward math, ledger semantics, or redeem economics. `src/db/queries.js` now enriches invite history with `confirm_after` and upgrades admin invite visibility with explicit overdue breakdowns (`Pending overdue`, `Join pending overdue`, `Activation pending overdue`) plus stale pending rows grouped by reward type and overdue age. `src/bot/bot.js` now explains pending states more honestly on user surfaces (`Awaiting join confirmation` / `Awaiting activation confirmation`), adds clearer pending guidance in reward center/history, and gives admin a more actionable stale-pending summary with overdue hours and next-action hints. Scope stays intentionally narrow: no new reward statuses, no bulk manual repair UI, no anti-fraud rewrite, and no schema changes. Live verification still required for user invite/reward copy, stale pending list readability, and admin pending-overdue truth.

**STEP572:** invite history + redeem UX polish — refined the shared Invite Center into a cleaner reward-oriented surface without changing reward math, ledger semantics, or role split. `src/bot/bot.js` now renders a more explicit four-part invite flow: Share, Invite stats, Points wallet, and Reward progress. The history screen is tightened into a compact `История приглашений и баллов` summary with separated recent invitees and recent reward/redeem operations plus clearer status labels (`pending / confirmed / redeemed / rejected`). The reward center now distinguishes `Reward ready` vs `Next reward`, keeps the warning that pending points are not spendable, and links cleanly back into history/invite center. Redeem UX is polished with a real confirmation screen (`что получишь / сколько спишется / сколько останется`) and a dedicated success screen showing the activated reward, new balance, and next reward state instead of dropping the user back into a generic invite notice. Scope stays intentionally narrow: no reward-logic rewrite, no new ledger design, no anti-fraud changes, and no role-specific invite systems. Live verification still required for history readability, reward-ready states, redeem confirm/success flow, and navigation between invite center/history/reward center.

**STEP571:** unified Invite Center layout polish + progressive actions — kept one shared invite surface for all roles and cleaned it into a scalable summary-first layout. `src/bot/bot.js` now renders a single `Invite Center` with four clearer layers: link/share, invite stats (`Invited / Activated`), points wallet (`Available / Pending / Redeemed`), and reward progress. The main surface no longer dumps recent invitees directly into the primary screen; instead it exposes progressive actions only when they matter: `📄 История` appears only after real invite/reward data exists, and `🎁 Обменять баллы` appears only when `Available >= 100`. A new history screen gives a compact view of recent invitees plus recent reward/redeem entries, while profiles keep only a short points readout instead of duplicating the full invite flow. `src/db/queries.js` adds a narrow `getInviteRewardsRecentHistory(...)` helper, `src/bot/actionRegistry.js` now covers `a:share_history` / `a:share_rewards`, and the invite rewards smoke is updated to the new contract. Scope stays intentionally narrow: no reward logic rewrite, no new ledger design, no role-specific invite split, and no broad profile redesign. Live verification still required for the new layout readability, progressive buttons, history screen, and reward center navigation.

**STEP567:** support threads foundation — added a narrow persisted `support_threads` layer under the existing Telegram-native support UX without building a broad helpdesk or changing user-side entrypoints. New migration `047_support_threads.sql` introduces thread truth (`open / waiting_operator / waiting_user / closed`), chat/message binding, last activity timestamps, and operator markers; `src/db/queries.js` now provides additive helpers to open/touch a thread on user support intake, bind the first support chat message, and mark operator replies / quick replies back to the user. `src/bot/bot.js` keeps the current `💬 Поддержка` flow, but now opens/touches a persisted thread for text/media support messages, embeds `Thread #id` into support headers, binds reply buttons to that thread, restores explicit support admin callbacks (`a:adm_support_reply`, `a:adm_support_qr`, `a:adm_support_reply_cancel`), and updates thread status when support replies are sent. Scope stays intentionally narrow: no operator read surface yet, no forum/topic routing redesign, no SLA/assignment matrix, and no web helpdesk. Live verification still required for migration `047_support_threads.sql`, user support intake, support-group reply flow, quick replies, and thread status transitions.

**STEP556:** Broadcast mode label polish — no logic changes, no queue/retry/runtime changes. The default broadcast composer is still the same simple everyday path introduced in STEP554, but user-facing labels are now clearer in Telegram UI: `Simple mode` is renamed to `Быстрая рассылка`, and `Advanced mode` is renamed to `Расширенный режим`. Navigation labels now read as task-oriented operator copy instead of dev-style mode names.

**STEP554:** Broadcast simple composer + honest preview — default admin broadcast path is now a clean Simple mode on top of the existing power/infra layer. Operators can compose text-only, image-only, or image + text broadcasts, optionally attach 1 URL button in Simple mode, run a real self-preview before send, and use shared smart routing (`sendMessage`, `sendPhoto` with caption, or photo + text split) that also powers runtime delivery. Advanced mode remains available as the secondary path and keeps up to 3 URL buttons. Existing queue / retry / QStash / outbox truth stays in place; no migration or broadcast-engine rewrite was introduced.

**STEP551:** invite rewards live — collapsed the planned STEP550 / STEP550.1 / STEP551 path into one narrow runtime rollout on top of the existing invite layer. `src/db/queries.js` now adds a real `invite_reward_ledger`, lazy pending→confirmed processing, anti-abuse guards (`raw_open=0`, `existing/self=0`, one join reward max once, one activation reward max once), balance buckets (`Available / Pending / Redeemed`), and redeem helpers for `7d Pro / 30d Pro`. `src/bot/bot.js` upgrades the invite surface with `Collabka points`, pending/redeemed readouts, reward CTAs and confirm flow, plus a short balance line in creator/brand profile surfaces; `src/bot/actionRegistry.js` adds redeem callbacks; `migrations/046_invite_reward_ledger.sql` introduces the ledger schema. Scope stayed intentionally narrow: no cashout, no token rewards, no multi-level referral, no broad gamification. Live verification still required for migration `046_invite_reward_ledger.sql`, invite redeem flow, and role-specific Pro application target.

**STEP548:** invite contacts / personal invite layer — upgraded the old generic `a:share` surface into a Telegram-native invite layer adapted from the Intro Deck canon without broad router or admin redesign. Users now get a dedicated invite screen with 3 ready text variants, primary inline `Share invite`, fallback `Show link`, fallback `Get invite card`, personal deep-links (`ii_ / il_ / ic_`), attribution on first eligible `/start`, counters `Invited / Activated`, and a recent invited list. `src/db/queries.js` now contains the invite storage/helpers and degrades honestly when the new `member_invites` migration is missing; `src/bot/helpers.js` recognizes invite start payloads; `src/bot/bot.js` adds `/invite`, inline-query share handling, upgraded `a:share`, and card/link callbacks; `INVITE_PHOTO_FILE_ID` is supported for cached-photo production sharing with public asset fallback. Scope stays intentionally narrow: no reward mechanics, no admin/web redesign, no monetization rewrite, and no bot-only truth fork. Live verification still required for BotFather inline mode plus migration `045_member_invites.sql`.

**STEP545T:** baseline freeze + docs/handoff sync — froze the baseline after live confirmation that `System` and `Overview` now agree on runtime truth: `System = OK`, `Overview = OK`, `Runtime warnings = 0`, and the old retry breadcrumb is downgraded to historical info instead of an active degraded incident. This step is docs-only: it does not change bot/runtime/admin logic, QStash, DB, or mobile layout. It synchronizes the docs canon (`00_CURRENT_STATE`, `00_BOOT`, `15_NEW_CHAT_HANDOFF`, work history) so a new chat or handoff starts from the real current baseline instead of the old STEP535V-era context. Current operational reading: bot-layer hardening wave STEP536–542 is landed, web-admin mobile + runtime truth wave STEP543A–545 is landed, and the remaining expectation is ordinary live observation rather than an open known defect.

**STEP544:** runtime retry stale-signal hardening — Runtime/Overview no longer treat any old `mon.retry.last_error` as an active degraded incident. `src/lib/monDiag.js` now exports retry-signal age/freshness helpers and updates retry breadcrumbs with `last_at`/`last_action` whenever `setMonRetryDiag(...)` is called, so stale detection no longer depends only on the separate meta path. `src/lib/adminWeb/runtime.js` now derives retry state through a freshness gate: a retry error is considered active only when the signal is fresh (24h window) or otherwise still contextually confirmed; old retry breadcrumbs are downgraded to historical info/hints instead of driving the main yellow warning lane. Scope stays intentionally narrow: no QStash schedule changes, no DB migrations, no monetization business-rule rewrite. Source smoke should confirm the contract via `smoke:admin-web-runtime-stale-retry-contract`, existing runtime/admin smokes, and `preflight:source`; live verification is still required by refreshing Overview/System after deploy and confirming that stale retry warnings disappear while fresh retry failures still surface honestly.

**STEP542:** `gw_access` truth-boundary hardening — tightened the extracted giveaway access family without broad router changes. `a:gw_access_user_prompt` now requires Redis because the flow opens a stateful `expectText` continuation; `src/bot/gwAccess.js` no longer uses its own divergent `safeEditOrReply` helper and now receives the project-level lifecycle helper from the route/bot layer; and the no-access branch now sends one final `Нет доступа.` callback feedback instead of pre-acking and then trying to toast again. Scope stays intentionally narrow: no money/publish/support-degraded logic changes, no payload redesign, and no new extraction wave. Source smoke should confirm the truth boundary: `actions:check`, `callbacks:check`, `smoke:gw-access-route-contract`, and `preflight:source`; live Telegram verification is still required for `🔎 Проверить по ID`, degraded Redis blocking, repeated recheck, and no-access feedback.

**STEP540:** One safe flow extraction — extracted the giveaway access callback family (`a:gw_access`, `a:gw_access_recheck`, `a:gw_access_checkme`, `a:gw_access_user_prompt`) out of the legacy monolith in `src/bot/bot.js` into a dedicated route handler `src/bot/routes/gwAccess.js`, then routed that family explicitly through `src/bot/routes/callbacks.js` before the generic `a:gw_*` branch. Scope stays intentionally narrow and production-safe: no money/publish/support-degraded logic changes, no callback payload redesign, no giveaway business-rule changes. The legacy `gw_access*` branches were removed from `bot.js`, the dispatcher now wires only this isolated family into `handlers.gw_access`, and a new source smoke `scripts/smoke-gw-access-route-contract.js` plus `npm run smoke:gw-access-route-contract` verifies that the family is really extracted (route before generic `gw`, handler wired, legacy branches gone). Source smoke is green (`callbacks:check`, `actions:check`, `smoke:gw-access-route-contract`, `preflight:source`); live Telegram verification is still required for the giveaway access helper buttons and the `user_id` prompt path.

**STEP539:** Callback consistency guard — added a new source-only guard script `npm run callbacks:check` (`scripts/callback-consistency-check.js`) so bot-layer callback references are now checked against three truths at once: source callback refs, `src/bot/actionRegistry.js`, and exact handler / explicit alias coverage in the runtime callback layer. To land the guard green on the current baseline, two leftover giveaway-access callbacks were also closed narrowly in `src/bot/bot.js`: `a:gw_access_checkme` now re-runs access verification for the current Telegram user, and `a:gw_access_user_prompt` now opens a real `user_id` prompt instead of being a dead callback surface. Scope stays intentionally narrow: no money/publish/support-degraded logic changes, no router redesign, and no broad callback refactor. Source smoke is green (`callbacks:check`, `actions:check`, `preflight:source`); live Telegram verification is still required for the giveaway access helper buttons and prompt path.

**STEP538:** Input-state boundary hardening — removed the old global `clearExpectText(ctx.from.id)` that used to fire on every inline callback in `src/bot/bot.js`, and replaced it with an explicit boundary helper `shouldClearExpectTextOnCallback(...)`. The bot now clears pending text-mode only on real exit/navigation surfaces (`Menu/Home`, `*_home`, `*_cancel`, current back action, list/home escapes) instead of silently killing support/apply/reply compose state on any stale or unrelated click. Scope stays intentionally narrow: no payload changes, no money/publish/support-degraded logic changes, and no router redesign. Source smoke is green (`smoke:input-mode-contract`, `actions:check`, `preflight:source`); live Telegram verification is still required for support/apply/reply compose persistence plus explicit back/menu/cancel exits.

**STEP537:** Orphan / stale callback cleanup — removed the misleading IG OAuth disconnect button from the verified workspace screen until a real disconnect flow exists, replaced the lead-delete cancel callback from dead alias `a:ws_lead` to the working `a:lead_view` route, and hardened decorative pager callback `a:nop` into a real harmless no-op available even when Redis is degraded. Scope stays intentionally narrow: no money/publish/support-degraded logic changes, no callback payload redesign, and no broader router refactor. Source smoke still required around callback registry consistency plus live Telegram verification for old stale messages.

**STEP536:** Telegram callback ack / feedback contract hardening — removed the old unconditional early callback ack in `src/bot/bot.js` and replaced it with a one-callback/one-ack contract: callback branches can still send their own toast/alert, but edit/reply-only flows now rely on a final fallback ack in `finally`, so spinner closure remains safe without silently swallowing later feedback. Scope stays intentionally narrow: no callback payload changes, no router redesign, no money/publish/support-degraded logic changes. Source smoke: `node --check src/bot/bot.js` green; live Telegram verification for stale/rate-limit/banned/reply-fallback paths still required.

**STEP535W:** QStash truth hardening — introduced a shared QStash config snapshot, split publish vs verify readiness in runtime/health, and fail-closed the broadcast fan-out gate when verify config is missing so admin/runtime/cron stop showing false green on partial QStash setup.

**STEP535U:** Runtime/health parity + smoke green pass — aligned admin runtime with `/api/health` on `qstash_reschedule_failed` Redis keys, exposed QStash env through `CFG` for truth-layer parity, refreshed stale users priority/table-density smoke expectations, and added a dedicated parity smoke so `preflight:source` reflects the current baseline again.

## STEP535Q — Runtime retry truth + QStash optionality alignment
- `/admin/runtime` in `scripts/admin-web.js` now separates the two signals the operator was conflating on the screen: optional QStash env gaps vs the real retry/schema error. The render layer now gives `QSTASH_TOKEN / QSTASH_CURRENT_SIGNING_KEY` an explicit optional-delivery meaning and a concrete next step, instead of letting it read like the same class of problem as the retry failure.
- runtime cards, queue lanes, retry feed, config matrix, and recent runtime signals now pass through a lightweight truth-normalization layer (`runtimeCardLabel`, `runtimeTextLabel`, `runtimeItemMeaning`, `runtimeItemNextStep`) so the screen reads more honestly in Russian: `QStash не настроен` stays a non-blocking optional contour for admin v1, while `column_profile_contact_does_not_exist` is surfaced as a likely schema/query drift around legacy `profile_contact`, not as a generic config gap.
- cache-bust bumped to `step535q`, docs updated, and a dedicated source smoke was added for the new runtime truth contract. This step does **not** claim to fix the backend retry worker itself inside this admin-only snapshot; it fixes the control-plane truth layer and makes the operator next step explicit.

## STEP535P — Founder RU copy consistency + final polish
- `/admin/founder` user-facing copy in `scripts/admin-web.js` was cleaned to a mostly Russian owner-surface contract: founder guidance, safety semantics, control descriptions, session reset confirmation, summary labels, and founder empty/error states now avoid the previous RU/EN mix.
- founder page top control-plane chips now render through a local RU label/state mapping, so labels like `Web login`, `Pay accept`, `Auto apply`, `Fan-out`, and `Fallback` read consistently as founder-facing admin copy instead of leaking raw internal control names.
- founder hints / warnings / recent founder actions now pass through a light copy-normalization layer before render, and the shell asset cache-bust was bumped to `step535p`; source smoke was updated to assert the new founder RU contract.

## STEP535O — Founder control safety semantics + confirmation polish

- `/admin/founder` upgraded from a plain founder summary into an owner-grade control surface in `scripts/admin-web.js`: added an explicit `Семантика безопасности` layer, founder sensitivity cards, and a clearer separation between routine read-first review, cautionary policy changes, and bot-only / sensitive controls.
- `Фаундерское web-действие` now explains scope, impact, and normal usage before the action button, so the only founder web action (`Завершить все web-сессии`) no longer reads like an ordinary routine toggle.
- revoke-all confirmation was polished without touching backend auth logic: the button now uses a more explicit confirmation prompt, shows a temporary busy label, routes failures through the standard toast layer, and redirects back to login with an owner-readable follow-up message after success.
- `styles/admin-web.css` now includes founder safety badges / cards / action-rail styling, plus a new source smoke `scripts/smoke-admin-web-founder-contract.js`; admin shell asset cache-bust bumped to `step535o`.

## STEP535N — Users filter apply contract + disabled-state finish

- `Users` filter rail now uses an explicit staged apply contract instead of ambiguous dropdown auto-apply: the lower `Фильтры среза` block keeps pending values locally until the operator clicks `Применить фильтры`, with a matching `Сбросить` path back to the committed working slice;
- `scripts/admin-web.js` now keeps a dedicated filter-draft state for `plan / credits / channel / activity / payments`, so pending filter edits no longer silently leak into sort/cohort/preset actions, CSV, bulk copy, or other read-only utilities before confirmation;
- disabled-state contrast was finished for empty-state utility buttons, pagination controls, compare clear, and the empty-table header checkbox, so `недоступно` reads as intentional muted state instead of a broken control;
- added source smoke coverage in `scripts/smoke-admin-web-users-filter-rail-contract.js` and bumped admin shell asset cache-bust to `step535n`.

## STEP535M — Users preset truth cleanup + disabled-state contrast

- fixed the real Users preset application bug in `scripts/admin-web.js`: preset-card clicks now update the URL-backed working slice through `setUsersStateExact(...)` before rerender, so the active preset no longer falls back to `Свой срез` just because the old URL state was re-hydrated on render;
- kept `Свой срез` and saved presets mutually exclusive at the contract level: the active label is now derived only from the real current slice, not from a transient last-click state;
- strengthened disabled-state contrast in `styles/admin-web.css` for empty-state utility buttons, pagination controls, and table checkboxes, so `пусто / недоступно` reads as intentionally disabled instead of looking broken;
- added `pointer-events: none` to disabled action surfaces and a dedicated source smoke `scripts/smoke-admin-web-users-preset-truth-contract.js`; admin shell asset cache-bust поднят до `step535m`.

## STEP535L — Users action-state truth + empty-state controls

- `Users` сохранённые пресеты теперь держат честный active-state: rail получил явную карточку `Свой срез`, а подсветка пресета привязана к exact match текущего рабочего среза, а не к последнему нажатию;
- в `Утилиты для списков` добавлены правдивые disabled-state для `Копировать`, `Выбрать текущую страницу` и `Очистить корзину`, чтобы пустые выборки и пустая корзина больше не притворялись интерактивными;
- header checkbox в таблице Users переведён в нормальный table-selection contract: disabled при пустой странице, indeterminate при частичном выборе и более читаемый custom visual state вместо тёмного браузерного квадрата;
- `usersBulkSource` теперь сразу перерисовывает utility rail, чтобы состояние кнопки `Копировать` честно следовало за источником (`текущий фильтр` vs `корзина`);
- admin shell asset cache-bust поднят до `step535l`; добавлен новый source smoke `scripts/smoke-admin-web-users-action-state-contract.js`.

## STEP535K — Founder control clarity + admin RU consistency

- локализован section-manifest web-admin для ключевых user-facing разделов (`Обзор`, `Пользователи`, `Система`, `Платежи`, `Коммуникации`, `Фаундер`) без изменения route contract;
- `/admin/founder` переведён в более явный founder-layer: добавлены `Следующий фаундер-шаг` и `Границы этой поверхности`, усилен safe-vs-bot-only boundary contract, а revoke-all action сохранён как единственный web founder action;
- `/admin/payments` дочищен по admin copy до более русскоязычного review-plane (`Платёжный обзор`, `Корзины разбора`, `Следующий шаг`, `Группы статусов`, `Платёжная карточка`, `Карточка пользователя`);
- founder warnings / hints в `src/lib/adminWeb/readModels.js` приведены к более честной founder-only формулировке без изменения founder guards или control logic;
- admin shell asset cache-bust поднят до `step535k`; smoke contracts founder/payments/overview/asset cache-bust обновлены под новый copy contract.

## STEP535J — Desktop density + interaction feedback polish
- Tightened the desktop feel of sparse admin-web sections in `styles/admin-web.css` and `scripts/admin-web.js`: empty Founder/Payments side panels now compact earlier, sidebar helper actions no longer stretch vertically, and zero-state follow-up/status summaries in Payments render as denser stat tiles instead of tall empty stacks.
- Added a clearer interaction contract across the shell: `scripts/admin-web.js` now attaches lightweight press/confirm feedback to admin buttons/cards, and Users selection surfaces gained stronger persistent active-state cues via `aria-pressed`, differentiated color treatments, and an explicit state line inside slice action cards.
- Reworked `Готовые действия по срезу` in Users into one render helper so stateful actions (`Проблемные сверху`, `Спящие плательщики`) stay visibly selected when the working slice already matches them, instead of relying only on toast feedback.
- Added `scripts/smoke-admin-web-density-interaction-contract.js`, refreshed asset cache-bust to `step535j`, and kept the whole pass UI-only: no API / DB / auth / money-path / write-surface changes.

Acceptance / notes:
- desktop sparse screens read tighter, especially on 75% browser zoom;
- selection/click feedback is more visible across Users and the rest of the shell without introducing new logic;
- still requires live browser verification after deploy for final density feel on the operator desktop width.

## STEP535I — Admin-web layout balance + optional-gap semantics fix
- Fixed the misleading global `Не настроено` status on Overview / Founder by adjusting `src/lib/adminWeb/runtime.js`: missing QStash is now treated as an informational / optional gap (`unknown`) instead of escalating the whole runtime overview to `missing`. This keeps real degraded runtime signals visible without pretending the whole admin shell is unconfigured.
- Rebalanced sparse-page layouts in `scripts/admin-web.js`: Runtime now uses a full-width control-plane block plus a smaller two-column config/help layer and a separate recent-signals section; Payments and Founder fall back to a single-column layout when the left-side dataset is empty, which removes the large dead-blue voids seen on the real screen.
- Fixed the oversized type / drifting card rhythm in `styles/admin-web.css` by scoping large metric typography to direct metric values only (`.aw-card > strong`) and explicitly resetting nested `strong` inside subtle helper text. This removes the giant `Следующий шаг` headings and keeps cards from visually spilling out of their boxes.
- Added `scripts/smoke-admin-web-layout-polish-contract.js`, refreshed asset cache-bust to `step535i`, and updated the existing shell/overview/users/sidebar/runtime cache-bust contracts to the new version.

Acceptance / notes:
- Overview / Founder no longer mark the whole surface as `Не настроено` just because QStash is absent for optional publish/retry flows;
- sparse `Runtime / Payments / Founder` screens keep a tighter visual balance on real desktops instead of leaving large empty blue columns;
- still requires live browser verification after deploy for final viewport feel, especially on the operator’s actual desktop width.

## STEP535H — Payments review clarity + action rail
- Reworked `/admin/payments` from a flat status table into a clearer review plane in `scripts/admin-web.js`: summary cards now separate applied / manual review / stuck / watchlist counts, and the page opens with explicit `Review buckets` plus a `Next-action rail`.
- Extended `src/lib/adminWeb/readModels.js` with `reviewBuckets` and `actionRail`, while keeping the surface read-only and reusing the existing follow-up model / payment detail drilldown. The follow-up queue now carries `userId` so operators can move from payment detail to user card honestly instead of guessing.
- Promoted `Кейсы для ручного review` above the raw history table so the payment page reads as an operator review surface first and a journal second.
- Added `scripts/smoke-admin-web-payments-review-contract.js`, updated the existing payments smokes, wired the new contract into `package.json` + `scripts/preflight.js`, and kept the step strictly on the read-model / UX layer.

Acceptance / notes:
- money-path logic, webhook/apply/fallback code, and write contracts remain untouched;
- still requires live browser verification after deploy for the actual scan-speed / case-triage feel on the real payments viewport.

## STEP535G — Sidebar nav noise cleanup + overview micro-polish
- Cleaned the admin shell sidebar in `styles/admin-web.css`: nav groups now render as explicit stacked blocks, links are full-width block items, and the browser focus ring no longer leaks a second blue rail beside the active item.
- Kept one clear active-state signal for the selected section by aligning `hover / active / focus-visible` onto the same visual contract instead of letting default outline styling compete with the filled state.
- Prevented section labels (`ОПЕРАТОР`, `FOUNDER`) from catching the decorative/focus layer and tightened their spacing so the sidebar reads calmer against the new section-manifest shell.
- Kept the step intentionally cosmetic: no API / DB / auth / runtime / write-path changes; only shell CSS polish plus a dedicated source smoke `scripts/smoke-admin-web-sidebar-nav-contract.js` and asset cache-bust bump to `step535g`.

Acceptance / notes:
- sidebar no longer shows the extra vertical blue rail / outline noise;
- active section reads with one signal instead of an active-fill plus stray focus artifact;
- still requires live browser verification after deploy for the final shell feel on the real viewport.

## STEP535F — Overview command cockpit + section contract uplift
- Introduced a single `SECTION_MANIFEST` in `scripts/admin-web.js` so sidebar grouping, section labels, nav captions, and page subtitles now read from one admin-web contract instead of drifting separately across shell/view code.
- Rebuilt `/admin` Overview into a tighter command cockpit: one main status, one next owner step, and three compact workspaces (`Командный обзор`, `Payments snapshot`, `Последняя активность`) without adding polling or new write paths.
- Added an explicit boundary block on Overview so operators/founders can see what this surface covers and what intentionally stays in `Users`, `Runtime`, or `Payments`.
- Overview workspace state now persists in the URL via `overview_workspace`, keeping manual refresh/back behavior honest inside the existing SPA shell.
- Added `scripts/smoke-admin-web-overview-cockpit-contract.js`, wired it into `package.json` + `scripts/preflight.js`, and bumped admin shell asset cache-bust to `step535f`.

Acceptance / notes:
- scope stays read-first and hobby-safe;
- no API / DB / auth / write-surface expansion;
- still needs live browser verification after deploy for actual cockpit scan-speed and tab feel.

## STEP535D — Users active-state sync + help surface
- Fixed the real Users SPA state-clobber bug in `scripts/admin-web.js`: `readUsersStateFromUrl()` now returns a sparse URL patch instead of normalizing missing params back to defaults, so the current working slice no longer snaps back to the first cohort/preset on rerender.
- Strengthened the one-source-of-truth contract for the Users working slice: `setUsersStateFromControls()`, `setUsersStateExact()`, and `setUsersPinIds()` now sync the active state into the URL immediately before rerender, which keeps cohort chips, preset cards, compare pins, and the top meta strip aligned.
- Moved admin-web toast feedback from the lower-right corner to the upper-right content area, where it is closer to the operator gaze line and no longer collides with the lower utility zone.
- Added a new `/admin/help` surface plus sidebar entry `Помощь`, with a short operator manual covering quick start, how to read Users, how to read Runtime, safe actions, and FAQ.
- Added an explicit active-slice label inside `Готовые действия по срезу`, refreshed the admin shell asset cache-bust to `step535d`, and wired a new source smoke `scripts/smoke-admin-web-users-active-state-help-contract.js` into `package.json` + `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only and hobby-safe;
- no API / DB / auth contract change;
- still requires live browser verification after deploy for click/scroll/toast feel.

## STEP535B — Admin web CSS parser hotfix
- Fixed a real admin-web visual regression caused by a missing closing brace in `styles/admin-web.css` inside `.aw-utility-head`.
- Root cause: the CSS parser stopped applying later rules, so newer admin-web surfaces degraded to browser-default controls / broken card layout across `Overview`, `Runtime`, `Comms`, `Founder`, and `Users`.
- Result: `aw-input`, `aw-select`, `aw-statusbar`, utility rails, compare surfaces, and newer runtime cards now render again under the intended admin-web design system.
- Scope kept intentionally narrow: CSS parser fix only plus docs canon update.

## STEP535 — Runtime queues / retry clarity
- Extended `/admin/runtime` with a dedicated queue/retry layer so operators can read backlog, cooldown, and retry pressure without jumping into raw health JSON.
- Added `queueClarity` in `src/lib/adminWeb/runtime.js`, built from existing Redis-backed runtime signals only: ops digest pending buffer, audit buffer queue/inflight/cooldown, broadcast pending deliveries + retry cooldown, retry monitor (`mon.retry`), and QStash `reschedule_failed` / `official_publish_stuck`.
- `scripts/admin-web.js` now renders `Очереди и retry` with summary cards (`Active backlog`, `Retry problems`, `Cooling windows`, `Unknown lanes`), bounded queue lanes, and explicit retry signal cards.
- Added dedicated styling in `styles/admin-web.css` plus `scripts/smoke-admin-web-runtime-queues-contract.js`, wired into `package.json`.

Acceptance / notes:
- scope stays read-only and hobby-safe;
- no retry buttons, no queue mutations, no polling, no secret exposure.

**STEP534:** Runtime status hierarchy / incident strip — moved `/admin/runtime` from a flat diagnostics page into a clearer control surface for founder/operator review. `src/lib/adminWeb/runtime.js` now derives a `statusHierarchy` over the main runtime contours (`DB`, `Redis`, `Delivery`, `Платежи`, `Web-admin`, `Config`), an `incidentStrip` that promotes the highest-priority current warning into one explicit “what needs attention now” block, a `controlSnapshot` over safe toggles/incident modes, `summaryCards`, and a tiny config summary — all still through the same one-read hobby-safe contract. `scripts/admin-web.js` and `styles/admin-web.css` now render Runtime in four layers: system status header, incident strip, control-plane snapshot, and quieter lower config/follow-up/recent-signal sections, so the page reads like an ops surface instead of a pile of unrelated debug blocks.

**STEP533A:** Users final interaction hotfix — finished the last high-signal cleanup on `/admin/users` before moving focus to Runtime. The page no longer duplicates local state badges inside every rail (`Порядок`, local `Пресет`, local `Срез`, local `Закреплено`, local `Корзина`), preset cards now show an explicit `Применить срез`, and sort/cohort/preset interactions give immediate in-app toast feedback instead of feeling silent or ambiguous. Copy flows now try the classic selection copy path first and only fall back to the browser clipboard API, which reduces permission prompts on common `copy usernames / tg_id` actions. Scope stays UI-only and read-only: no server-contract change, no new write-paths, just a final Users micro-interaction hotfix before STEP534 Runtime work.

**STEP532:** Users section copy unification + `banned_at` schema guard — finished the last visible RU/EN cleanup on `/admin/users` so the rails, cohort names, presets, compare/follow-up headers, meta strip, and table hints now speak one adult admin canon instead of mixing Russian controls with English labels. In parallel, fixed the real runtime regression seen in production (`column u.banned_at does not exist`) by adding a users-directory schema guard in `src/db/queries.js`: the admin users list/export/compare queries now detect whether `users.banned_at` exists and degrade safely to `null::timestamptz` + a reduced problem-score path when the column is absent. Scope stays narrow and honest: no new write paths, no route-family expansion, no DB migration required to recover `/admin/users` — just copy unification plus a rolling-upgrade-safe read contract for users-directory surfaces.

**STEP531:** Users header / meta strip polish — tightened the last visible rough edge of `/admin/users` without touching the data contract. The table now has a compact meta strip directly above the list, showing the current working slice, sort/cohort/preset context, and quick basket/pins/export/copy state in one place. The table header row itself is also more disciplined: each column now carries a short title + micro-hint (`id · quick actions`, `роль · профиль`, `freshness · время`) so the list reads faster on the real operator window width. Scope stays UI-only and reversible: no new write paths, no SQL changes, no export/bulk/compare behavior change — just a cleaner header rhythm on top of STEP530.

**STEP530:** Users column priority compression — tightened the middle columns of `/admin/users` so the table reads cleaner on medium-width operator windows without changing any server contract. `Segment / Plan / Signals / Активность` now use tighter badges, shorter meta lines, bounded signal overflow, and an inline activity rhythm instead of heavier stacked wording. Scope stays deliberately UI-only and reversible: no new write paths, no SQL changes, no export/bulk/compare behavior change — just cleaner column priority on top of STEP529.

**STEP529:** Users row height / table density polish — tightened the `/admin/users` table itself so more useful rows fit on the real operator viewport without turning the list into mush. The identity cell no longer repeats plan/credits chips, row quick actions were compressed, the table got denser spacing, smaller chips, tighter cell stacks, and a cleaner inline `user_id / tg_id` meta line. Scope stays deliberately narrow and UI-only: no new write paths, no server-contract expansion, no behavior change in export/bulk/compare — just a faster vertical rhythm for the existing users control plane.

**STEP527:** Users compare density polish + sticky overlap fix — tightened `/admin/users` again without adding any new operator logic. The heavy sticky stack from STEP522 is now collapsed into a compact sticky shell (search / segment / export + current slice meta), while the larger rails stay in normal document flow. This removes the visible overlap that appeared while scrolling long pages and keeps the control plane readable on the real operator window size. In parallel, the compare rail from STEP525–526 was visually compressed: denser drill-action cards, tighter compare-card spacing, and a two-column meta layout so pinned cards scan faster without turning the compare surface into another redesign. Scope stays read-only and reversible: no new write paths, no DB changes, no new route family — just safer layout behavior and better density.

**STEP526:** Users compare drill actions polish — strengthened the `/admin/users` compare surface so pinned sets now turn into real operator follow-up handles instead of passive side-by-side cards. The compare rail now exposes safe actions for `CSV pinned snapshot`, `copy pinned tg_id`, `copy pinned usernames`, `copy pinned user_id`, plus one-click `open top problem` / `open dormant payer` drill moves for the currently pinned set. Everything stays deliberately narrow and read-only: export reuses the existing audited `users_export` path with `ids_snapshot`, copy reuses the audited `users_bulk` path with explicit ids, and open-actions only route into the already existing user card.

**STEP525:** Users compare / pin rail — added a narrow compare surface to `/admin/users` so operators can temporarily pin 2–5 user cards and review them side-by-side without losing the current working slice. Pin state now rides inside the existing URL-backed users state-contract (`pins=...`), survives refresh/reopen together with the active slice, and feeds a compact compare rail with identity, status/segment, plan/credits/channel/payments, recent activity, and note preview. Scope stays deliberately read-only: no new write paths, no DB persistence, no new route family — just a faster manual ops review layer on top of the existing users control plane.

**STEP524:** Users URL-persisted working views — upgraded `/admin/users` so the full users state-contract now lives in the page URL instead of only in in-memory SPA state. The active search / segment / filter rail / sort / cohort / page / page-size slice now survives refresh and reopen, can be copied as a shareable admin link, and is reused as the back-link when drilling into `/admin/users/[id]`. Scope stays deliberately narrow and read-only: no backend persistence, no new write paths, no new route family — only URL-backed continuity on top of the existing users control plane.

**STEP523:** Users saved operator presets — added a compact built-in preset rail to `/admin/users` so operators can jump back to real working slices in one click instead of manually rebuilding the same search/segment/filter/sort/cohort combinations. The new layer is intentionally narrow and read-only: it only replays the existing state-contract with presets like `Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, and `Quiet creators`, while visibly falling back to `Custom slice` as soon as the operator drifts away from a preset. No new backend mutations, no DB persistence, no custom user-defined views — just a faster way to return to the most useful ops slices on top of the existing users control plane.

**STEP522:** Users sticky table controls / pagination polish — tightened `/admin/users` for longer manual ops sessions without adding any new write paths. The page now keeps its filter/sort/cohort control stack visually pinned, adds a bounded page-size + pagination contract, and renders the users table inside its own scrollable surface with sticky headers. Pagination now uses the real filtered total from the server contract, so operators can move through large slices while keeping basket state, current sort/cohort choice, and scan context stable. Scope stays read-only and reversible: no mutations, no background jobs, no custom persistence, just a steadier control-plane shell around the existing users directory.

**STEP520:** Users action-ready follow-up rail — added a compact operator block to `/admin/users` so the most common follow-up moves now sit directly next to the sort/cohort rails instead of forcing manual control changes. The new rail is intentionally narrow and reuses only existing safe contracts: `CSV current slice`, `copy tg_id`, `copy usernames`, `open top problem users`, and `open dormant payers`. Copy/export actions still flow through the same audited bulk/export handlers, while the open-actions only switch the already existing sort/cohort state. Scope remains read-only and copy-only: no new write paths, no background jobs, no custom persistence, just a faster operator follow-up layer over the existing users control plane.

**STEP519:** Users cohort counters / mini topline — strengthened `/admin/users` into a more legible control plane by adding small server-backed cohort counters above the existing cohort chips. The same working cohorts (`Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, `Quiet creators`) are now counted once on the server using the same bounded users contract, but without the currently active cohort filter, so operators can still see the full working breakdown while drilling into one slice. The UI now renders this as a clickable mini topline that shares the same cohort actions as the chips below. Scope stays read-only and narrow: no new write paths, no background jobs, no custom persistence, only a clearer operator topline over the existing cohort layer.

**STEP516:** Users table hierarchy polish — tightened the `/admin/users` list into a more disciplined operator surface without touching the server contract from STEP513–515. The table now has a stronger scan order: user identity first, compact plan/credits chips second, signal chips third, and an explicit `Last activity` column with freshness + exact timestamp detail. Created time is also split into cleaner date/time micro-hierarchy, so the page reads less like a raw directory dump and more like a control-plane list. Scope is UI-only and reversible: no SQL changes, no route changes, no write-surface expansion.

**STEP515:** Users filter rail v2 — extended `/admin/users` with a second, analysis-oriented filter layer so the same page can cut the user base by plan, credits, channel presence, recent activity (7/30/90 days), and payments yes/no without introducing any new write paths. The filter state now flows through list render, CSV export, and bulk-copy utilities via one normalized server contract in `src/db/queries.js`, backed by a shared `meta` lateral that exposes `has_channel`, `has_payments`, and `last_known_activity_at`. Operators can now treat Users as a real audit/ops surface rather than just a directory: the table shows richer quick signals, exports include channel/payment/activity fields, and audit reasons preserve the applied filter rail. Scope stays read-only and bounded: no destructive bulk actions, no background jobs, no public-bot flow changes.

**STEP513:** Users export + audit snapshot — upgraded `/admin/users` from a pure list into a usable ops/audit surface without adding a new API route family. The collapsed read handler now supports `section=users_export`, which returns an attachment CSV for either the current filtered view or one of the predefined export scopes (`audit snapshot`, `all`, `brands`, `creators`, `curators`, `managers`). The users page now shows an explicit export control, a bounded export note (`до 10 000 строк`), and the latest export timestamp/actor from admin-web audit. CSV generation is centralized in `src/lib/adminWeb/usersExport.js`, and every download appends an audit entry with actor, scope, filters, rows count, and truncation flag, so exports are no longer invisible operator actions. Scope stays deliberately narrow and hobby-safe: CSV only, no XLSX/PDF, no background jobs, no bulk mutations, and no user-facing flow changes.

**STEP511:** Web-admin login step split + approve auto-return — resolved the remaining login-loop UX inside the existing auth model instead of redesigning auth. `/admin/login` now has two explicit phases: first `Admin secret`, then `Telegram approve / code`. Once a challenge exists, the page stops visually asking for the secret again and shows only the verify step, matching the real contract. The login route now also checks for an already-issued session before rendering the form, so returning from Telegram no longer lingers on the login screen when the session is already valid. In parallel, the Telegram approve landing page now auto-returns to `/admin/login?challenge=...`, and the login page immediately re-checks challenge status on load, so approve can collapse into a smoother `tap approve → return → enter admin` path without the old pseudo-loop feeling. Scope stays narrow and hobby-safe: no new entrypoints, no DB changes, no auth-model expansion.

**STEP510A:** Web-admin login flow hardening + docs canon restore — fixed the main UX regression in the login flow without changing the auth model itself. Pending login challenges now survive refresh/return to page through `sessionStorage` + `?challenge=` URL state, the login page auto-checks Telegram approve while the challenge is pending, raw auth errors are normalized into readable RU labels, and code verification now gracefully reuses an already-approved challenge instead of surfacing a misleading `invalid_code`. The Telegram approve landing page now includes a direct return-link back into `/admin/login?challenge=...`. In the same step, the docs canon was restored after sale-prep drift: missing STEP502/STEP503 docs were recreated, work history continuity was repaired, and current-state/handoff readability was brought back into a consistent baseline for future chats.

**STEP510:** Payments/operator follow-up hints polish — upgraded the payments surface from a passive read-only summary into a clearer founder/operator follow-up workspace without adding any write actions. `/admin/payments` still loads via a single `section=payments` read and `/admin/payments/[id]` still loads via a single `section=payment` read, but the UI now shows a follow-up column, normalized follow-up groups (`без действий / наблюдать / проверить / срочно`), a compact queue of payment cases, and a stronger operator follow-up block inside payment detail. The read model now exposes `followUpGroups`, `followUpQueue`, and `followUp`, while the overall contract stays hobby-safe: no polling, no cron dependency, no retries, no overrides, and no payout controls.

**STEP508:** Comms usable v2 — upgraded `/admin/comms` from a read-only diagnostics page into a safe draft workspace inside the existing hobby-safe admin shell. The page still loads from a single `section=comms` snapshot and still avoids polling / cron dependency, but now shows a real drafts block, inline editor, preview card, recent notices table, outbox snapshot, and recent comms audit. New safe write actions were added through the already-collapsed `api/admin-web-write.js`: `create_notice_draft`, `update_notice_draft`, and founder-only `test_send_notice`. To avoid a migration, text-only web-admin drafts reuse `broadcasts.draft_caption` as a short internal label and `draft_text` as the body. Live send, retries, and queue controls remain explicitly out of scope.

**STEP507:** Founder controls split — separated founder-only controls from the normal operator shell inside web admin without adding new function entrypoints or risky writes. Added founder identity/gating to admin-web sessions (`isFounderActorTgId`, `requireFounderSession`), exposed `isFounder` in `/api/admin-web-auth?action=me`, made `revoke_all` founder-only, and introduced a dedicated founder read surface at `/admin/founder` via `section=founder`. The shell now renders explicit `Оператор` / `Founder` nav groups and shows the founder route only for founder sessions. `getFounderSummary()` aggregates founder-safe auth/session policy, Founder Sale snapshot, control boundaries, and recent founder audit into a single hobby-safe read model. The new Founder page keeps the split strict: one founder action (`revoke all web sessions`) plus read-only founder context; dangerous controls remain bot-only. Added `scripts/smoke-admin-web-founder-contract.js` and wired it into source preflight.

**STEP504:** Runtime / founder diagnostics polish — strengthened the `/admin/runtime` web-admin page into a real founder/operator diagnostics surface instead of a thin notes list. `src/lib/adminWeb/runtime.js` now returns a normalized `runtimeSummary` with `updatedAt`, `overall` state, per-service blocks (`db`, `redis`, `qstash`, `payments`, `config`, `adminWeb`), a safe env/config presence matrix, warnings, hints, and recent runtime events — while preserving lightweight back-compat fields (`db.ok`, `redis.ok`, `notes`, etc.) so the rest of the shell does not regress. `scripts/admin-web.js` and `styles/admin-web.css` now render that shape as a clear Runtime page with overall status, service cards, warnings strip, config matrix, founder/operator hints, and recent runtime signals, all still hobby-safe: one read endpoint, no polling, no writes, and no secret leakage. As a consistency cleanup, stale split admin-web routes (`api/admin-web/user.js`, `api/admin-web/users.js`, `api/admin-web/auth/status.js`, `api/admin-web/auth/decision.js`) were removed again so the repo stays under the Vercel Hobby function cap.

**STEP501A:** Admin-web WHATWG URL cleanup — removed deprecated query parsing from the web-admin serverless handlers after live Vercel logs showed `DEP0169` on `api/admin-web-read.js`. Added `getRequestUrl()` / `getSearchParam()` helpers in `src/lib/adminWeb/common.js` and rewired the collapsed handlers `api/admin-web-auth.js`, `api/admin-web-read.js`, `api/admin-web-write.js` to parse `action`, `section`, `id`, and auth-approve query params only through the WHATWG `URL` API. Also cleaned the same legacy `req.query` usage from the still-present legacy split admin routes and from `api/health.js`, then added `scripts/smoke-admin-web-whatwg-url-contract.js` plus a preflight gate so `req.query` / `url.parse()` drift is now caught source-side before deploy. Scope is hygiene-only: no UX changes, no auth contract change, no new routes, no runtime logic expansion.

**STEP500A:** Web Admin Hobby-safe API collapse — kept the STEP499 web-admin UX/auth model intact but collapsed the serverless surface from twelve split `/api/admin-web/*` routes into three Hobby-safe entrypoints: `api/admin-web-auth.js`, `api/admin-web-read.js`, and `api/admin-web-write.js`. Telegram approve links now resolve through the auth dispatcher, admin pages still use the same `/admin`, `/admin/users`, `/admin/users/[id]`, and `/admin/runtime` routes, and the client now talks to aggregated `action=` / `section=` endpoints instead of per-file handlers. Legacy split admin-web route files were removed from `api/` to get the deployment back under the Vercel Hobby 12-function cap; `scripts/check-function-budget.js`, `package.json`, `scripts/preflight.js`, and `scripts/smoke-admin-web-shell-contract.js` were updated so function-budget drift is now caught source-side before deploy. Scope stays purely operator-web and hobby-safe: no Telegram user-facing flows, no deal/payment/runtime hot mutations, no cron dependency, and no UX redesign.

**STEP499:** Web Admin Shell v1 (Hobby-safe) — shipped the first sidecar web-admin surface under `/admin` as a narrow owner/operator cockpit without replacing the Telegram-admin layer. The new shell is intentionally read-first and hobby-safe: one `admin.html` entrypoint plus admin-only CSS/JS, Vercel rewrites for `/admin` and `/admin/*`, Redis-backed auth/session/audit foundation, and narrow `/api/admin-web/*` endpoints for `overview`, `users`, `user card`, `runtime`, and the single safe write `user note set/clear`. Login uses `shared secret → Telegram approve / OTP code → secure session cookie`; page loads stay snapshot-based with **no polling, no cron dependency, no deal/payment/runtime hot mutations**. Scope is operator-web only: no Telegram user-facing flows, callbacks, DB money paths, or live workflow mutations changed. Collateral low-risk consistency fix: `index.html` OG meta was re-pointed from stale `assets/social/collabka-og.png` / `1730x908` back to the real shipping asset `assets/social/collabka-og-1200x630.png` / `1200x630`, because the uploaded repo baseline still had pre-STEP497 share drift.

**STEP496:** OG asset finalize and cleanup — replaced the landing social preview pack with one approved exact 1200x630 primary PNG plus matching WEBP under the stable canonical filenames `assets/social/collabka-og-1200x630.png` and `.webp`. Retired the stale `-alt` OG variants, kept `index.html` pointed at the canonical PNG with the existing 1200x630 meta contract, and tightened `scripts/smoke-landing-contract.js` so the landing/share layer now guards only the files that actually ship. Scope stays landing/share-preview only: no bot runtime, callbacks, DB, monetization, accept/reply/unlock, or workflow-path logic changed.

**STEP493:** Landing premium micro-polish — applied a narrow visual polish pass to the public landing without changing page structure, CTA paths, gallery/modal behavior, or OG/share logic. `styles/landing.css` now gives the informational cards (`Кому подходит`, `Почему это удобнее`) a restrained premium hover contract with subtle spotlight, cleaner border glow, and slightly stronger depth, while FAQ cards now have smoother plus-button/plasticity and calmer open-state motion via the existing accordion contract. Section intros were also tightened with a small accent line, slightly stronger title/subtitle hierarchy, and improved spacing, so the page reads a bit more premium without becoming noisier or more animated. Scope stays landing-only: no bot runtime, callbacks, DB, monetization, accept/reply/unlock, or workflow-path logic changed.

**STEP491:** OG/social preview implementation — shipped a dedicated 1200x630 social card pack for the public landing under `assets/social/` with a primary PNG, alt PNG, and optional WEBP variants. `index.html` now carries full Open Graph + Twitter card meta tags (`og:image`, dimensions, alt, and `summary_large_image`) pointing to the branded OG card, so Telegram/social shares do not depend on an accidental screenshot of the page. Added the reusable generation prompt at `docs/assets/STEP491_OG_PREVIEW_PROMPT.txt` and extended `scripts/smoke-landing-contract.js` to guard OG assets and meta contract. Scope is landing/share-preview only: no bot runtime, callbacks, DB, monetization, accept/reply/unlock, or workflow-path logic changed.

**STEP487:** Landing surface gallery + modal polish — rebuilt the landing block `Как это выглядит` around a new interaction contract: each surface is now a short, symmetric preview card with one real screenshot, and full explanation moved into a dedicated modal/lightbox instead of being squeezed into the grid. The gallery now uses four live screenshots (`Домашняя`, `Каталог брендов`, `Фильтры брендов`, `Диалог и стадия сделки`) inside one consistent preview frame, with reduced card copy and clickable product-card behavior. Added accessible modal behavior in `scripts/landing.js`: open by click/tap/Enter/Space, close by close button / backdrop / Esc, focus return to the originating card, and a simple focus trap while the modal is open. Added new live screenshot assets and updated `scripts/smoke-landing-contract.js` so the screens block cannot silently regress back to inline overload or the old polished screenshot contract. Scope is landing-only: no bot runtime, callbacks, DB, monetization, accept/reply/unlock, or hot-path query behavior changed.

**STEP484:** Public landing + FAQ implementation (RU) — added a Russian one-page landing in the repo root as a lightweight product entry for Collabka PR: `index.html`, `styles/landing.css`, `scripts/landing.js`, brand assets, a live filter screenshot, and favicon assets. The landing explains the real Telegram-first product in plain Russian through Hero, role cards, 4-step workflow, expandable `Что внутри бота`, `Почему это удобнее обычного Telegram-хаоса`, screen previews, FAQ, and a repeated CTA to `@collabkaprbot`. Added `docs/spec/STEP483_LANDING_FAQ_SPEC_RU.md` as the source spec and `docs/30_LANDING_IMPLEMENTATION_STEP484.md` as the runtime record. Added `scripts/smoke-landing-contract.js` and wired it into `package.json` + `scripts/preflight.js`. Scope is public-site only: no bot runtime, callbacks, DB, monetization, accept/reply/unlock, or hot-path query behavior changed.

**STEP482A:** Telegram copy hotfix wave 1 — applied a narrow runtime copy/layout pass only on brand/catalog/BX filter surfaces and the nearest zero-state/helper lines. `renderBrandDirFilters(...)` now uses split header lines, a multiline filter summary, `Найдено брендов`, and helper wording `открыть список`; `renderBrandsDirectory(...)` now uses a shorter human header plus shorter no-results guidance; `renderBxFilters(...)` now uses split header lines, a multiline summary, and cleaner helper wording `открыть ленту`; `renderBxFeed(...)` and `bxSmartPrefillText(...)` now use shorter actionable zero-results copy. Added `scripts/smoke-copy-wave1-contract.js` and wired it into `package.json` + `scripts/preflight.js`. Scope is copy/layout only: no callback, DB schema, monetization, or hot-path query changes.

**STEP481:** Telegram copy clarity sweep (source-first) — added `docs/28_TELEGRAM_COPY_CLARITY_SWEEP_STEP481.md` as the source-level map of user-facing Telegram copy issues in active creator/brand-facing surfaces. The sweep does not change runtime, callbacks, or DB reads; it marks where current copy is too dense, robotic, ambiguous, line-compressed, or missing a useful zero-state hint. Priority P1 findings concentrate on catalog/filter surfaces (`renderBrandDirFilters`, `renderBrandsDirectory`, `renderBxFilters`, related pickers), while the new STEP480 selection-pilot texts (`🧩 Режим`, `🎬 Форматы`) are explicitly kept as good baselines. The doc also freezes a narrow next runtime scope: a text-only hotfix wave for filter/catalog copy, without touching accept/reply/unlock/payment paths.

**STEP480:** Selection UI pilot runtime implementation — applied the new selection contract to the first two low-risk creator-side profile surfaces that were frozen in STEP479. `Workspace Profile → 🎬 Форматы` now renders as a checkbox-style multi-select surface using explicit `☑️/⬜️` state markers, one option per row for long labels, and a separated bottom action row for `🧹 Очистить`, while keeping instant apply and the existing profile footer (`⬅️ Назад / 📋 Меню / 🏠 Home`). `Workspace Profile → 🧩 Режим` now renders as a radio-style single-choice surface using `🔘/⚪️` active-option markers, still with instant apply and without adding a redundant save step. Added narrow source smoke `scripts/smoke-selection-pilot-contract.js` and wired it into `package.json` + `scripts/preflight.js` so the pilot contract cannot silently regress. Scope intentionally stays narrow: no new callbacks, no DB-read expansion, no money/unlock/accept/reply/stage changes, and no broad sweep across catalog/BX/brand filters.

**STEP479:** Selection surface inventory + pilot target freeze — added `docs/27_SELECTION_SURFACE_INVENTORY_STEP479.md` as the source-level map of active creator/brand-facing selection surfaces in the STEP478 baseline. The inventory explicitly classifies each visible picker/filter/profile selector as `multi-select`, `single-choice`, `toggle`, or `not for rollout`, and freezes the first two low-risk pilot targets for future runtime adoption of the selection contract: creator-side `Workspace Profile → 🎬 Форматы` (multi-select) and `Workspace Profile → 🧩 Режим` (single-choice). Brand/catalog/BX filter surfaces are deliberately not chosen for the first rollout because they sit closer to current live-watchlist catalog/search paths. Docs-only step: no runtime logic, callbacks, DB reads, money paths, deal/reply flows, or hot UI surfaces changed.

**STEP478:** Selection UI contract canon — added `docs/26_SELECTION_UI_CONTRACT_RU.md` as the canonical Russian selection-surface standard for Collabka. The doc separates four UI surface classes that must not be visually mixed: multi-select (`☑️/⬜️` checkbox grid), single-choice (`🔘/⚪️` active-option grid), binary state (toggle contract), and ordinary action/navigation rows. It locks layout rules for paired sibling options, full-width long/high-risk actions, and a dedicated bottom action block for `Сохранить / Применить / Очистить / Назад / Меню / Домой`. Synced docs canon/index and handoff references so future picker/filter/profile-scope work can reuse one stable contract instead of improvising button semantics per screen. Docs-only step: no runtime logic, DB queries, callbacks, money paths, or hot UI surfaces changed.

**STEP477:** Telegram UI pattern reuse canon — added `docs/25_TELEGRAM_UI_PATTERN_REUSE.md` as a dedicated reusable architecture note for reproducing the Collabka-style Telegram UI in another bot without reducing it to “just menus”. The doc captures the actual product/navigation principles behind the current UX: single-surface callback router, edit-first rendering via `safeEditOrReply(...)`, explicit local return-context via compact `ret` payloads, strict separation of `Back` vs `Menu` vs `Home`, DB-light hot menu paths, service-message-aware push-vs-edit rules, durable business truth vs ephemeral UI state, and degraded-safe fallback behavior. Synced docs canon/index so future handoffs and new chats can point to one canonical reuse file instead of re-explaining the pattern from scratch. Docs-only step: no runtime logic, DB queries, callbacks, or hot UI surfaces changed.

**STEP475:** Two-tier `/api/health` + fast-path operator summary — `/api/health` now supports a narrow fast tier for release/operator first-pass without breaking the existing full contract. Default `/api/health` stays the same full drill-down JSON; new `?tier=fast` (aliases `?view=ops`, `?view=operator`) returns only the top operator blocks needed for a quick GO/NO_GO read: `redis`, `support`, `ops`, `payments`, `system_status`, `no_go_reasons`, plus explicit metadata about omitted heavy sections (`cron/broadcast/qstash/mon/ref/audit`). This lets operators do a cheap first pass before opening the full health payload, while keeping fail-open behavior, the existing full endpoint shape, and all hot runtime paths untouched. Added `scripts/smoke-health-fast-contract.js`, wired it into deps/runtime preflight, and updated the one-screen health guide to document the new fast-vs-full read order.

**STEP474:** IG OAuth parked-lib relocation + handoff canon refresh — moved the parked Instagram OAuth helpers out of the active runtime tree so `src/lib/*` no longer carries inactive integration code. `src/lib/cryptoBox.js` and `src/lib/igOAuth.js` were relocated to `_ig_oauth_parked/lib/*`, and the parked OAuth endpoints under `_ig_oauth_parked/api/ig/oauth/*` were repointed to those new local parked imports. Added `_ig_oauth_parked/README.md` to explain that this subtree is intentionally outside the active deploy/runtime surface and is kept only as a parked revival reference. Updated `docs/15_NEW_CHAT_HANDOFF.md` from the stale STEP460 baseline to the current STEP474 baseline, and synced IG parked-state docs so future chats and repo audits do not confuse parked IG helpers with active production code. Scope is hygiene/docs only: no active bot runtime, callback, DB, or hot-path behavior changed.

**STEP473:** Repo hygiene cleanup — removed two confirmed stale files from the working repo snapshot so the tree matches the current STEP472/470 source of truth without dead duplicate surfaces: legacy `src/bot.js` (superseded by `src/bot/bot.js`) and orphaned `scripts/smoke-brand-app-preview-dedupe-contract.js` (no longer referenced by `package.json`, `scripts/preflight.js`, docs, or active source guards). This step is hygiene-only: no runtime logic, no callback changes, no DB/query changes, and no new hot-path reads. Source-only verification stays green after removal.

**STEP472:** Home copy cleanup + first-run / returning split — `renderHomeHub(...)` is now role-aware and summary-first instead of acting like a route map. The old `Карта` block, arrow chains, and `Выбери режим работы / Текущий режим` tail were removed. Returning home now uses concise copy only: creator home explains `📣 Мои каналы` + `🏷 Каталог брендов`, brand home explains `🎬 Офферы` + `📥 Inbox` + `🎛 Фильтры`, curator home explains `🧹 Кабинет куратора` + return to normal mode. The optional quick-start/banner copy was also cleaned so it no longer references “Карта” or arrow paths. In parallel, the existing first-run role gate (`renderRoleSelection(...)`) was upgraded into a short welcome split (`🏠 Добро пожаловать`) that briefly explains Creator vs Brand before the same role-pick buttons. Added `scripts/smoke-home-copy-contract.js` and updated `scripts/smoke-start-role-gate-contract.js`; wired the new home-copy guard into `package.json` + `scripts/preflight.js`. No callback changes, no role-switch logic changes, no DB/query/mutation changes.

**STEP471:** New-dialog terminology consistency pass + live runtime pass runbook — cleaned the remaining mixed user-facing wording around paid intro/opening actions so active UX now consistently says `Новый диалог` instead of the hybrid `Интро = новый диалог`. Updated brand-pass / buy-credits / contact-unlock / verification / retry-credit / Stars receipt copy in `src/bot/bot.js`, `src/bot/cron.js`, and `src/bot/payments/starsHandlers.js`, while leaving internal compat names (`INTRO_*`, `mon.intro`) untouched. Added `scripts/smoke-new-dialog-terminology-contract.js` and wired it into `package.json` + `scripts/preflight.js` so the old mixed formula cannot silently return in active source. Added `docs/ops/03_LIVE_RUNTIME_PASS_STEP471.md` as the manual Telegram runtime pass for the cleaned list screens and dialog-flow after STEP470–471. No DB/query/mutation changes.

**STEP470:** Remaining list dedupe pass (`📨 Мои заявки` + `📨 Заявки брендов`) — aligned the last two creator-side list screens with the summary-first Telegram pattern already used in STEP466. Both lists now keep only a short header (`Последние заявки к брендам.` / `Последние входящие заявки в этот канал.`), concise meta (`всего N` + `стр N` only when pagination is real), and a single interactive button list. The old upper text dump of brand/status/date/message rows was removed from both screens, so the same items are no longer rendered twice. Empty-state copy, open-card callbacks, filters/tabs, pagination semantics, reply/deal paths, and hot-path DB surface remain unchanged. Updated `scripts/smoke-creator-apps-list-density-contract.js` and `scripts/smoke-creator-leads-density-contract.js` to lock the new summary-only contracts.

**STEP469:** Preflight split (`source-only` vs `deps/runtime`) — `scripts/preflight.js` is now mode-aware and `package.json` exposes `npm run preflight:source`, `npm run preflight:deps`, and full `npm run preflight`. Source-only preflight now runs the source/smoke/lint/generation/node-check sweep to completion on a bare snapshot without `node_modules`, while dependency-bound checks (`smoke-health-admin-shape`, staging fault injection, degraded rate-limit`) moved into the deps/runtime stage with an explicit missing-dependencies error. This removes the old fail-fast blind spot where missing local packages stopped preflight before later source-drift checks could run. No runtime bot logic, DB paths, or hot UI query-surface changed.

**STEP468:** Stale smoke sync sweep — source-contract guards are now aligned to the current STEP467 runtime/story instead of older intermediate UX contracts. Updated `scripts/smoke-creator-app-notices-contract.js` to match the current creator-side local dialog/open-brand/list-return notice model and reply completion receipt path; updated `scripts/smoke-what-next-backnav-contract.js` so the accepted-more screen expects the local `creatorBrandAppOpenBrandCallback(...)` return context instead of the old global brand-open callback; updated `scripts/smoke-ws-channel-disconnect-contract.js` so creator current-channel IA remains channel-first (support-only in the active current-channel screen, while creator → brand / manager mode switches stay in the creator root menu); and updated `scripts/smoke-brand-app-template-quick-labels-contract.js` to match the current brand-app template picker/preview layout in source. No runtime logic, DB queries, callback routing, or money-path semantics changed.

**STEP466:** Brand applications list dedupe + density cleanup — simplified `📨 Заявки от креаторов` into a summary-first list so the screen no longer renders the same applications twice. The heavy upper text dump of creator/status/date/message rows was removed; the header now stays compact (`Последние входящие заявки к бренду.` + concise brand/status/total context, with `стр N` only when pagination is real), while the filter row, the interactive application buttons, and existing open-card / accept / reply / deal flows remain unchanged. No new DB reads or callback-surface changes; updated `scripts/smoke-brand-apps-list-density-contract.js` and preserved the existing button list as the single primary representation of the applications list.
**STEP465:** Inbox empty-state wording cleanup — tightened the empty `📥 Inbox` screen so it now reads like a plain-language product state instead of an operator/debug screen. The header copy was relabeled from `Показываю последние движения по диалогам и заявкам.` to `Здесь появляются новые диалоги и свежие сообщения.`, the noisy `стр … · на странице 0` counters are no longer rendered when the list is empty, and the empty-state itself now explains the mental model in simple terms: `Пока здесь пусто. Новый диалог появится, когда кто-то напишет первым. Если переписка идёт внутри заявки, открой её карточку.` Existing non-empty Inbox rows, pagination, thread-open actions, and brand/application/deal flows stay unchanged. Updated the source smoke `scripts/smoke-brand-inbox-density-contract.js`; no DB/query/runtime path changes.

**STEP463:** Creator application reply runtime guard hotfix — fixed a real live crash in the creator-side `✍️ Ответить бренду` send path. The reply message was already being appended into the application thread, but the post-append notification step called `safeBrandManagers(...)` without that helper existing in `src/bot/bot.js`, which produced a runtime `ReferenceError: safeBrandManagers is not defined` on live message send. In practice this made the dialog look flaky: the creator’s message could appear in history, but the flow crashed before the intended same-dialog completion rerender and the operator was bounced into generic fallback/menu semantics. Added a defined `safeBrandManagers(...)` wrapper (mirroring other safe relation guards and degrading only on missing `brand_managers` relation), tightened the composer copy so it explicitly says to type in the Telegram input field below, and added `scripts/smoke-creator-app-reply-runtime-guard-contract.js` wired into `package.json` + `scripts/preflight.js` so this undefined-helper regression cannot silently ship again. No accept/charge/deal changes. No new hot-path DB reads.

**STEP462:** Creator application reply post-send completion cleanup — creator-side `✍️ Ответить бренду` no longer ends in an ambiguous service receipt after sending. The composer now explicitly promises that one sent message returns to the same application dialog, and the send-success path actually rerenders `✉️ Диалог по заявке #…` with a clear inline completion block (`✅ Сообщение отправлено бренду` / warning variant when the dialog updated but notification delivery had issues). This keeps the operator inside the same local context, shows the refreshed thread immediately, and avoids bouncing into generic notice/menu semantics. Added `buildCreatorBrandAppSendReceiptBlock(...)`, a source smoke `scripts/smoke-creator-app-reply-completion-contract.js`, and wired it into `package.json` + `scripts/preflight.js` without touching accept/charge, Inbox IA, or adding DB reads in hot UI paths.

**STEP461:** New-chat docs kernel refresh — refreshed the canonical new-chat operating docs so future sessions start from one stable pair instead of ad-hoc prompt fragments. `docs/17_START_NEW_CHAT_PROMPT.md` is now the v3 behavior kernel: explicit **Jobs / Vitalik / Woz / Durov** operating style, docs-first audit → minimal patch → QA → artifacts workflow, hard bans on redesign-by-default, and a Telegram-native / local-context-first UX discipline. `docs/15_NEW_CHAT_HANDOFF.md` is now the live STEP460 baseline handoff: it clearly separates what is already stabilized in STEP433–460 from what still needs live Telegram runtime verification, explicitly forbids reopening architecture or accept/charge internals without evidence, and tells the next chat to propose only one micro-step (runtime triage or a real hotfix). `docs/00_BOOT.md` and `docs/README.md` were synced so this pair is discoverable and treated as the canonical way to continue work in future chats. This is docs/process-only work; no runtime, DB, callback, or hot-path behavior changed.

**STEP460:** Creator application dialog / composer / local-return clarity pass — tightened the creator-side `📨 Мои заявки` post-accept conversation flow so the opened application card, the reply composer, and `🪟 Открыть бренд` now read as one local context instead of three loosely related screens. The reply CTA is relabeled from `💬 Написать бренду` to `✍️ Ответить бренду`, the composer now behaves like a true input-mode screen with local returns (`⬅️ К диалогу #…` + `📨 К заявкам`) and no distracting `🪟 Открыть бренд` button, and creator-side open-brand jumps now carry the application context so the brand card returns via `⬅️ К заявке #…` instead of generic catalog back. Added shared helpers (`creatorBrandAppDialogReturnButtonLabel()`, `creatorBrandAppCardReturnButtonLabel()`, `creatorBrandAppOpenBrandCallback()`), a source-level smoke `scripts/smoke-creator-app-local-context-contract.js`, and wired it into `package.json` + `scripts/preflight.js` without touching Inbox/lead IA, accept/charge, or adding DB reads in hot UI paths.

**STEP450:** Brand-side application/deal notice cleanup — tightened brand-side service notices around creator → brand application flow so inbound notifications and fallback receipts now speak the same `✉️ Заявка #… / 📌 Стадия сделки` language already established in STEP439–445, without touching accept/charge semantics, manager access, or adding new DB reads in hot UI paths. Added shared helpers (`brandAppOpenButtonLabel()`, `brandAppDealButtonLabel()`, `brandAppNoticeWhatNext()`, `brandAppNoticeKb()`, `buildBrandAppServiceNoticeText()`) so new application notifications, creator reply notifications, and brand reply/deal fallback receipts no longer drift between `📨 Открыть заявку`, `📥 Открыть в Inbox`, generic back buttons, and mismatched callback copy. Brand-side notifications now show a compact “что дальше” line and, when the application is already in work, a direct `📌 Стадия сделки` CTA next to the application itself. Template/manual reply fallbacks now reuse the same what-next language and entrypoints, and the template-send callback text was corrected from `✅ Отправлено бренду` to `✅ Отправлено креатору`. Existing STEP439–449 application/deal/lead contracts remain unchanged.

**STEP449:** Brand-side lead follow-up cleanup — tightened the brand-side post-action layer after `✍️ Ответить` / `🔓 Контакты` so follow-up screens now speak the same `💬 Диалог #… / 🪟 Витрина креатора / 🔓 Контакты на витрине …` language already established in STEP448, without touching accept/charge, lead-write semantics, or adding new DB reads in hot UI paths. Added a shared `brandLeadWhatNextText()` helper so the opened brand lead dialog, the post-reply receipt, and the post-unlock contact-pack use one consistent “что дальше” copy instead of drifting between generic `💬 Диалог`, generic vitrina wording, and standalone contact-pack text. After a brand reply, the receipt now keeps the operator inside the same lead context with `💬 Диалог #…`, `🪟 Витрина креатора`, and `🔓 Контакты на витрине …` CTAs. After contact unlock from a lead context, the compact contact-pack now includes the same lead-context follow-up hint plus a return row back into `💬 Диалог #…` and the same creator vitrina, so the post-action layer reads as one system rather than a separate generic unlock receipt. Existing STEP439–448 application/deal/inbox/vitrina contracts remain unchanged.

**STEP448:** Brand-side lead entrypoints cleanup — tightened the brand-side entry layer around `💬 Диалог / 🪟 Витрина / 🔓 Контакты` in the brand-lead flow so the path from brand reply notifications → lead dialog → read-only vitrina → contact unlock now reads as one system, without touching accept/charge, lead-write semantics, or adding new DB reads in hot UI paths. Centralized brand-side label helpers now keep one shared vocabulary in lead context (`💬 Диалог #…`, `🪟 Витрина креатора`, `🔓 Контакты на витрине …`), while the opened brand lead dialog uses the same labels in both copy and CTA buttons. Read-only vitrina / unlock / pending / no-contacts screens now inherit the same lead-context labels and pass `brandLeadId` through their return path so back/open actions no longer mix generic `Витрина` / `Контакты` wording with lead-specific screens. Existing brand lead mutation, Inbox density, and STEP439–447 application/deal contracts remain unchanged.

**STEP447:** Creator-side lead entrypoints cleanup — tightened the entry layer around creator-side `📨 Заявки брендов` so the path from channel/curator workspace → notification/receipt → lead card now reads as one system with STEP446, without touching accept/charge, lead-write query semantics, or adding new DB reads in hot UI paths. Workspace and curator screens now use the same `📨 Заявки брендов` vocabulary with explicit hints that this is the entry into the list, cards, and dialogs for brand requests. Creator-side receipts/notifications no longer mix `👀 Открыть`, `Открыть заявку`, and plain `Заявки`: they now use centralized labels (`🔎 Заявка #…` and `📨 К заявкам`) so the operator sees one stable mental model when jumping into a lead card or returning to the list. The cleaned creator-side lead dialog from STEP446 remains unchanged; this step is entrypoint vocabulary + navigation clarity only.

**STEP446:** Creator-side brand-leads Inbox / dialog cleanup — tightened the creator-side `📨 Заявки брендов` flow into the same signal-first Telegram system as STEP440–445, without touching accept/charge, lead-write query semantics, or adding new DB reads in hot UI paths. The lead list now uses a compact header (`📨 Заявки брендов`), a short line explaining that it shows the latest movement across brand requests into the channel, readable rows focused on brand → status → updated-at → clipped request preview, and full pagination labels (`⬅️ Назад` / `➡️ Далее`). The opened creator-side lead dialog is no longer a dense dump: it now shows a compact header, a short `💡 Сейчас` line, a state block, clipped request/reply previews, only the last 3 thread messages, and only the last 3 internal notes with explicit count hints when more history exists. Template-send/status actions now rerender the same card with a clear inline flash (`Шаблон отправлен: …` / `Статус обновлён: …`) so changes remain visible inside the card. Brand-side symmetry from STEP445 and application/deal contracts from STEP439–444 remain intact.

**STEP445:** Brand-side `📥 Inbox` / thread-open cleanup — tightened the brand Inbox into the same signal-first Telegram system as STEP440–444, without touching accept/charge, brand-pass charging rules, or adding new DB reads in hot UI paths. The Inbox list now uses a compact header (`📥 Inbox`), a short line explaining that it shows the latest movement across dialogues/applications, readable rows focused on participant → current handling/state → updated-at → clipped last-message preview, and full pagination labels (`⬅️ Назад` / `➡️ Далее`). The opened thread screen is no longer a dense dump: it now shows a compact header, a short `💡 Сейчас` line, a state block (`status / triage / stage / reply / retry / charge`), a clipped offer line, and only the last 3 messages with an explicit count hint when more history exists. Stage/triage actions now rerender the same thread with a clear inline flash (`Стадия: …` / `Обработка: …`) so changes stay visible inside the card. STEP439 local/global contracts and STEP440–444 application/deal symmetry remain intact.

**STEP444:** Brand-side `📨 Заявки от креаторов` list cleanup — tightened the incoming brand applications list into the same signal-first list style as STEP443, without touching accept/charge, manager access semantics, or adding DB reads. The list now leads with a compact header (`📨 Заявки от креаторов`), a short line explaining that it shows the latest movement across incoming creator applications, and readable rows focused on creator → status → updated-at → clipped message preview. Quick-open buttons now match the row wording (`icon + creator + #id`), pagination stays on full labels (`⬅️ Назад` / `➡️ Далее`), and the list explicitly says that opening the card reveals the application, reply, history, and actions. Creator-side symmetry from STEP442–443 and brand-side card/deal contracts from STEP439–441 remain intact.

**STEP443:** Creator-side `📨 Мои заявки` list cleanup — tightened the creator applications list into the same signal-first style as STEP440–442, without touching accept/charge, creator-send mutation paths, or adding DB reads. The list now leads with a compact header (`📨 Мои заявки`), a short line explaining that it shows the latest movement across the user’s brand applications, and readable rows focused on brand → status → updated-at → clipped message preview. Quick-open buttons now match the row wording (`icon + brand + #id`), pagination uses full labels (`⬅️ Назад` / `➡️ Далее`), and the list explicitly tells the user that opening the card reveals status, brand reply, and thread history. Brand-side application/deal contracts from STEP439–442 remain intact.

**STEP442:** Creator-side application dialog density reduction + signal-first reply clarity — tightened the creator-facing `✉️ Диалог по заявке` card into the same signal-first Telegram shape used in STEP440–441, without touching accept/charge, creator-send mutation semantics, or adding DB reads. The creator card now shows a compact header (`✉️ Диалог по заявке #…` + current status), a short `💡 Сейчас` line, clipped previews for the creator’s original application and the latest brand reply, and only the last 3 thread messages with an explicit count hint when more history exists. The old long explanatory copy was reduced to one honest line: before accept, the reply button is unavailable; after accept, messages stay inside this bot. Brand-side application/deal contracts from STEP439–441 remain intact.

**STEP441:** Brand application card density reduction + status signal hardening — tightened the brand-side application card into a decision-first Telegram screen without changing accept/charge business logic or adding DB reads. The view now uses a compact header (`✉️ Заявка #…` + current status), a short `💡 Сейчас` line, clipped application/reply previews, and only the last 3 dialogue messages with an explicit count hint when more history exists. Internal brand status actions are visually marked when active, and pressing `В работу / Закрыть / Спам` now produces an inline confirmation (`Статус обновлён: old → new`) via callback toast plus rerender flash, so state changes do not disappear inside a dense wall of text. Deal-stage/local-back contracts from STEP439 and deal-card cleanup from STEP440 remain intact.

**STEP440:** Deal card density reduction + stage signal hardening — tightened the brand deal card into a signal-first Telegram screen without touching accept/charge or adding DB reads. The deal view now shows a compact header (`📌 Сделка #…` + current stage), a short `💡 Сейчас` line describing the next sensible action for that stage, clipped application/reply previews, and only the last 3 dialogue messages instead of a long dump. Stage buttons now visually mark the active state, and pressing a stage produces an explicit confirmation (`Стадия обновлена: old → new`) via callback toast plus an inline flash on rerender, so status changes no longer disappear inside a dense wall of text. Local/global navigation from STEP439 stays intact, no migrations were added, and the core brand application accept/charge/reply flow remains unchanged.

**STEP439:** Deals stage transition fix + context-correct navigation + clearer labels — fixed the deal-stage mutation path so stage buttons in deal cards no longer silently fail on PostgreSQL parameter typing inside `jsonb_build_object(...)`; `setBrandApplicationDealStage()` now casts `set_by_user_id` explicitly. At the UX layer, local deal access from a brand application is no longer mislabeled as a global CRM jump: `📌 В сделках` becomes `📌 Стадия сделки`, deal cards show a short local-context hint (`Это стадия сделки по этой заявке.`), and local `⬅️ Назад` returns to the originating application card instead of jumping into the global `📌 Сделки` section. Brand application/deal list pagination is also made human-readable with `⬅️ Назад / ➡️ Далее`, without changing core application accept/charge/reply logic or the global deals section entrypoint.

**STEP436:** Brand application accept completion / final-state hardening — `✅ Принять` now prefers the synchronous exactly-once DB accept/charge path and falls back to QStash only on transient Neon trouble, instead of queueing first by default. Added a dedicated Redis pending marker for queued/busy accepts, so the brand-side card can honestly say that acceptance is still pending and keep the user on the same application card/list with `🔄 Проверить заявку`, rather than prematurely promising `💬 В работе` before credits/status are actually committed. Worker/click terminal outcomes clear the pending marker, and `scripts/smoke-brand-app-accept-ux-contract.js` now freezes the sync-first completion contract, pending copy, and no-duplicate-accept UX.

**STEP435:** Brand application accept UX / credits / post-accept flow hardening — clarified the async accept path so Brand Applications no longer pretend that the next step is the generic `📥 Inbox`. Pending/success follow-ups now route back into the application itself and the `💬 В работе` tab, pending copy explicitly says that credits are deducted after processing, and the brand-side actor follow-up DM also opens the application in `in_progress` context. The initial creator-application notification button is relabeled from `📥 Открыть в Inbox` to `📨 Открыть заявку`, reply-success fallbacks return to the application / `💬 В работе`, and the Redis-only credits block stays visible on the application card after accept so operators can verify post-charge state without extra DB reads. Added `scripts/smoke-brand-app-accept-ux-contract.js` and wired it into `scripts/preflight.js` to freeze the post-accept contract.

**STEP434:** Creator → Brand OPS COPY clarify + ENV on/off — creator applications now keep brand delivery unchanged for owner/managers, while super-admin copies are explicitly controlled by `BRAND_APP_SUPERADMIN_COPY_ENABLED=1|0` (default `1`) and relabeled as `🛠 OPS COPY · Заявка креатора бренду` with a short operator-only explanation that the main workflow stays with the brand. No new admin inbox, no new runtime state, no new hot-path DB reads, and no change to Brand Inbox / accept / credit logic. Added `scripts/smoke-brand-app-ops-copy-contract.js`, wired it into `scripts/preflight.js`, and synced `.env.example` + `docs/92_PROD_ENV_BASELINE.md` to document the new safe default.

**STEP433:** QStash dedup hotfix — centralized sanitization of `Upstash-Deduplication-Id` in `src/lib/qstash.js` so existing raw dedup inputs like `qping:${nonce}`, `mon:autoheal:${chain}:1`, broadcast and official-publish keys remain readable at call-sites but are converted to QStash-safe header values before `publishJSON()`. Added `scripts/smoke-qstash-dedup-sanitize-contract.js`, wired it into `scripts/preflight.js`, and fixed the Admin → QStash signed ping helper text so enqueue failures no longer misleadingly blame only `QSTASH_TOKEN` / signing keys when the real cause can be invalid dedup format, PUBLIC_BASE_URL, or transient QStash/network failure.

**STEP432:** Future spec for Creator → Brand super-admin OPS COPY clarify + ENV on/off — formalized the recommended minimal improvement for super-admin copies of creator→brand applications as a future-only spec card before runtime rollout. It is now implemented in the narrow form described there by STEP434, without adding admin inbox screens, new runtime state, or hot-path DB reads.

**STEP431:** Future UX watch spec for current-channel network shortcut — formalized the already-existing watchlist idea into an explicit future-only spec card. This is **not** active runtime work: the current path `Меню → 📂 Текущий канал → ⚙️ Настройки → 🌐 Сеть` remains the source of truth. The future candidate improvement is only a second fast entrypoint into the same network settings flow, triggered later **only** if real user pain appears and implemented without new hot-path DB reads, duplicate screens, or hidden state.

**STEP430:** NotebookLM audit baseline refresh — refreshed `docs/audit/notebooklm_pack/` on the current STEP430 truth: core/features/process bundles now include the newest docs and work history, code/migrations bundles are re-exported from the current repo snapshot, the audit prompt baseline is raised to STEP430, and `npm run gen:notebooklm-sources` again produces a clean text-only `NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip` for external audits. This is docs/audit-only work; runtime/business logic is untouched.

**STEP429:** `/api/health` one-screen operator guide — added `docs/ops/02_HEALTH_ONE_SCREEN.md` as a short top-down runbook for operators: read `/api/health` in the safe order `ok → system_status → no_go_reasons[] → ops.digest_preview`, then drill into Redis / Payments / Broadcast / QStash with an explicit “first safe action” for each symptom. Owner/readiness docs are synced to point to this one-screen guide before longer incident playbooks.

**STEP428:** What-next / back-navigation contract smoke — preflight now includes `scripts/smoke-what-next-backnav-contract.js`, a source-level guard for the most user-visible recovery/navigation surface. The smoke freezes the shared footer helpers (`navKb`, `navKbInput`, `kbNavRow`) and a small set of high-signal gate/done/more screens (`renderGwNewGate`, brand-apply done/more, accepted-application done/more, brand-apply preview) so they keep predictable `⬅️ Назад`, `📋 Меню`, `🏠 Home` escape hatches instead of drifting into dead ends or stale labels. `docs/24_WHAT_NEXT_BLOCKS_STYLEGUIDE.md` is synced to the actual runtime label set (`📋 Меню`, not `📋 Открыть меню`).

**STEP427:** Input-mode cancel/reset contract smoke — preflight now includes `scripts/smoke-input-mode-contract.js`, a source-level guard for the most fragile explicit text-entry UX. The smoke freezes the `✍️ Написать заявку` flow around `brand_apply`: short-lived `expectText`, visible `❌ Отмена ввода`, preview with `✅ Отправить / ✍️ Изменить / 🗑 Сбросить`, and cleanup of input mode after draft capture so users are not left stuck in an old text mode. It also protects the structured contacts reset path (`🧹 Очистить поле`) as the canonical field-clear UX.

**STEP426:** No-channel gate contract smoke — preflight now includes `scripts/smoke-no-channel-gate-contract.js`, which protects the recovery-first UX when a creator tries to work without an active channel. The smoke locks giveaway create guards (`a:gw_new`, `a:gw_new_pick`, `renderGwNewGate()`) so missing/stale workspace state always routes into an explicit gate with `🚀 Подключить канал`, `📣 Мои каналы`, and `📣 Выбрать канал`, instead of a silent stop. It also fixes the same expectation for Creator → brand applications: no connected or stale active workspace must render a clear channel-selection/setup recovery screen before the user can send a brand application.

**STEP425:** Contacts / Brand Pass anti-bypass contract smoke — added `scripts/smoke-contacts-brand-pass-contract.js` and wired it into preflight to freeze the current monetization/privacy model around creator contacts. The smoke asserts that public creator vitrine and brand lead dialogs keep contacts/channel handles hidden by default, use Redis as the primary unlock cache with DB fallback only when Redis is degraded, and preserve the reveal rule `structured contacts → legacy contact → site` after unlock. It also protects the anti-bypass constraints on IG templates so they do not quietly reintroduce direct contacts or portfolio links before unlock.

**STEP424:** Brand Inbox accept-point contract smoke — preflight now includes `scripts/smoke-brand-inbox-accept-contract.js`, a source-level regression guard for Brand Inbox / applications. The smoke freezes the `new`-state card contract (`✅ Принять` + `⛔ Спам` + `🗑 Удалить` only, clear spend hint, internal-triage note), the post-accept action surface (`✍️ Ответить`, `⚡ Шаблоны`, `💬 В работу`, `✅ Закрыть`), and the accept-first server-side guard for manual replies. It also protects the invariant that `✅ Принять` is the only spending transition and that the card rerenders into `in_progress` after a successful accept.

**STEP423:** Telegram share URL compatibility contract smoke — preflight now includes `scripts/smoke-share-url-compat-contract.js`, a source-level regression guard for the two most fragile Telegram share flows: workspace showcase send (`📨 Отправить`) and curator invite share (`📤 Поделиться`). The smoke locks the compatible format `https://t.me/share/url?url=<U+2060>&text=...`, checks that the real payload still goes into `text=` while `url=` carries the invisible WORD JOINER workaround, and explicitly forbids regressions back to `...share/url?text=...` or `url=&text=...`, which make some Telegram clients “look clickable but do nothing”. Related action guards for `a:ws_share`, `a:ws_share_send`, and `a:cur_invite` are also fixed in the contract.

**STEP422:** Creator current-channel contract smoke — added `scripts/smoke-creator-current-channel-contract.js` and wired it into preflight to freeze the post-STEP418 creator IA. The smoke asserts that Creator `📋 Меню` remains a **current-channel menu** with the top row `🔁 Сменить канал` + `📂 Текущий канал`, that role hub still routes Creator into this menu instead of jumping elsewhere, that `ws_open` stays the work screen while `ws_settings` stays the settings screen, and that account-level verification continues to live in channel settings as `✅ Верификация аккаунта`. It also protects the no-active/current creator screens from quietly re-growing brand role-switch/share/verification utility CTA.

**STEP421:** Release env baseline contract / fail-fast guard — preflight now includes `scripts/smoke-env-baseline-contract.js`, which checks that `.env.example`, `docs/92_PROD_ENV_BASELINE.md`, and `src/lib/config.js#assertEnv()` agree on the current prod/release baseline before deeper checks run. This closes a different operator failure class than STEP420: not missing `node_modules`, but a drifting env contract where docs/example still mention obsolete names (`BOT_WEBHOOK_URL`, `SUPER_ADMIN_IDS`) or forget critical modern keys (QStash, payments HMAC, broadcast cooldown, parked IG toggles). If a local prod-like `.env*` file is present, the smoke also fails fast on missing required prod keys or unsafe fallback defaults, rather than leaving the problem to show up later at runtime.

**STEP420:** Preflight dependency install guard — `scripts/preflight.js` now fails fast before any deep smoke/route import if declared npm dependencies are not locally installed/resolvable. This closes the operator/dev friction from bare snapshot checkouts where preflight used to run a long chain of zero-dependency checks and only then die inside late staging smoke with `ERR_MODULE_NOT_FOUND` (for example `dotenv` through `/api/health` shape checks). The new guard reads `package.json`, verifies declared runtime deps via local resolution, and exits with a short explicit message (`npm ci` / `npm install` hint) while leaving all runtime bot logic, DB/Redis behavior, and hot UI paths untouched. Docs for release preflight are synced to make the install step explicit for local snapshot validation.

**STEP419:** Docs sync for current Creator/channel UX — documentation is now aligned to the actual STEP418 runtime model. Creator main is explicitly documented as a **current-channel menu**: top row is `🔁 Сменить канал` (compact picker) and `📂 Текущий канал` (open current channel work screen); role switching stays only in `🏠 Home`; the no-active-channel creator gate is intentionally minimal (`🚀 Подключить канал`, `📦 Неактивные`, `💬 Поддержка`, `🏠 Home`). Channel IA is fixed as `ws_open = Работа с каналом`, `ws_settings = Настройки канала`, `a:cur_manage = Кураторы канала`. Verification semantics are now documented honestly: current implementation is **account-level/user-level**, not per-channel DB truth, so quick access lives in channel settings as `✅ Верификация аккаунта` and is shared across all creator channels.

**Future UX note (watchlist, not current work):** the current separation `Меню → 📂 Текущий канал → ⚙️ Настройки` is intentional because it clearly splits daily work from rarer settings. If later real users complain that settings are too deep, the first safe micro-improvement to consider is returning **one frequent setting only** (most likely `🌐 Сеть`) back onto the channel work screen as a fast toggle, while keeping curator management / profile / history / PRO / disconnect inside settings. This is a future UX option, not an active task.

**STEP436 current contract (active runtime):**
- **Accept now completes synchronously when Neon is healthy:** `✅ Принять` no longer queues first by default just because QStash is configured. The click path tries the existing exactly-once DB charge/status transition first and only falls back to queued processing on transient DB trouble.
- **Pending means really pending:** when accept is busy or queued, the application card now uses a dedicated Redis pending marker and shows only safe continuation (`🔄 Проверить заявку`, `📝 Заявки`, menu/home). It no longer offers `💬 В работе` or a fake reopened application before the status/charge have actually landed.
- **Repeated accept clicks are explicitly discouraged:** pending copy now says that the credit and `💬 В работе` move happen only after completion, and tells the user not to press `✅ Принять` again while processing is still underway.
- **Pending clears on terminal outcomes:** both the click path and the QStash worker clear the pending marker once the accept resolves into `accepted`, `already`, `insufficient_credits`, or other terminal non-retry outcomes, so stale pending UI does not linger after completion.
- **Regression guard:** `scripts/smoke-brand-app-accept-ux-contract.js` now freezes the sync-first completion contract, pending marker clearing, and the no-misleading-CTA pending UX.

**STEP434 current contract (active runtime):**

**STEP435 current contract (active runtime):**
- **Post-accept path stays inside Brand Applications:** `✅ Принять` pending/success UX must point to `📨 Открыть заявку` and `💬 В работе`, not the generic `📥 Inbox` barter thread list.
- **Async accept is explained honestly:** when accept is queued, UI now explicitly says that credits are deducted after processing and that the application should move into `💬 В работе`; `🔄 Обновить` remains only a refresh/re-render helper.
- **Credits visibility remains Redis-only:** the credits block in the brand application card stays visible after accept too, so the operator can verify post-charge state without introducing any new DB read on the card render.
- **Reply loop returns to the application flow:** after a brand reply is delivered, the happy-path rerenders the application in `in_progress`; if rerender fallback is needed, the fallback buttons still keep the operator inside `📨 Открыть заявку` / `💬 В работе` instead of a dead-end receipt.
- **QStash worker follow-up matches the same IA:** the optional async actor DM after successful accept opens the application in `s:in_progress` context and offers `💬 В работе` as the list-level continuation.
- **Regression guard:** `scripts/smoke-brand-app-accept-ux-contract.js` freezes the pending copy, CTA labels/routes, worker follow-up routing, and the visible Redis-only credits block so the wrong `Inbox` wording/path cannot quietly come back.

- **Brand-side flow stays unchanged:** creator applications still notify brand owner + managers with the original `📝 Новая заявка от креатора` text and the same `📥 Открыть в Inbox` CTA.
- **Super-admin copies are now explicit:** when `BRAND_APP_SUPERADMIN_COPY_ENABLED=1`, super-admin recipients receive a separate `🛠 OPS COPY · Заявка креатора бренду` variant with the short line `Это операторская копия. Основной workflow идёт у бренда.`
- **Safe default / rollback:** default remains `1` for zero-regression rollout; set `BRAND_APP_SUPERADMIN_COPY_ENABLED=0` to disable only the super-admin copy fanout without touching Brand Inbox, accept/reply/status, or credits.
- **What still must NOT happen:** no new admin inbox, no read-only/break-glass subsystem, no Redis/runtime toggle, no callback/state-machine split, and no extra DB reads in menu/home/hub paths.
- **Regression guard:** `scripts/smoke-brand-app-ops-copy-contract.js` freezes the source-level contract so owner/manager fanout, env gating, and `🛠 OPS COPY` relabel cannot quietly drift.

**STEP431 spec card (future-only / watchlist):**
- **Trigger:** start only after repeated real-user pain, not “by feeling”. Good signals: repeated support questions / repeated manual path `Текущий канал → Настройки → Сеть` / multiple live cases where experienced users need faster access to `🌐 Сеть`.
- **Goal:** shorten access by one step for a frequent action without reopening the old all-in-one channel screen or collapsing work/settings IA.
- **Safe change shape:** add **one** extra shortcut on the current-channel work screen (`🌐 Сеть` or equivalent wording) that opens the **existing** network settings route. Old path through `⚙️ Настройки` must remain fully valid.
- **Must stay inside settings:** `👥 Кураторы`, `👤 Профиль`, `🧾 История`, `⭐️ PRO`, `⛔ Отключить канал` remain in settings; STEP431 is not permission to bring back the old dense management screen.
- **Hard constraints:** no new SQL/DB reads on current-channel render, no duplicate settings screen, no second source of truth, no hidden mode flags, no drift in `⬅️ Назад / 📋 Меню / 🏠 Home` behavior.
- **Implementation bias:** prefer a second entrypoint into the same handler/route, or a conditional shortcut shown only when it is genuinely helpful (for example after connect / channel switch / unset network), instead of permanently increasing visual density for everyone.
- **Before runtime rollout:** add a narrow contract smoke that freezes shortcut visibility, destination, and back-navigation so the future shortcut cannot silently fork the IA.

**STEP417:** Channel work/settings split — per-channel UX is now split into three clear levels without DB/schema changes: `a:ws_open` renders **Работа с каналом** (Inbox, brand applications, offers, folders, giveaway create/list), `a:ws_settings` renders **Настройки канала** (network toggle, curator submenu entry, profile, history, PRO, soft disconnect), and `a:cur_manage` stays the separate curator submenu for that same channel. `📣 Мои каналы` still works as the compact picker and tapping a channel still does `set current + open ws_open`. History now returns into channel settings, not the work menu. Existing disconnect/reconnect semantics from STEP409 remain unchanged; this is purely an IA split of work vs settings with no new hot-path DB reads. Source-level smoke `scripts/smoke-ws-channel-disconnect-contract.js` now asserts the new separation.

**STEP414:** Creator main menu cleanup — active Creator current-channel main menu is now limited to current-channel actions plus a small role/support footer. Removed utility/setup CTA from the active main screen: `🚀 Подключить ещё`, `✅ Верификация`, and `🔗 Поделиться` no longer appear next to current-channel work actions. `📣 Мои каналы` remains the single entry for switching/adding channels, while verification/share stay reachable from their dedicated flows and channel/profile contexts. The current-channel model from STEP413 stays intact (`📋 Меню` = current channel, `📣 Мои каналы` = picker, `⚙️ Канал` = full per-channel menu) with no schema change and no new hot-path DB reads. Source-level smoke now also asserts that the active creator main screen does not leak setup/share/verification utility buttons.

**STEP413:** Creator current-channel UX reset — `📋 Меню` for Creator no longer jumps straight into a workspace card: it now opens a current-channel main menu that explicitly shows `Текущий канал: @...` plus current status (`Сеть` / `Кураторы`) and keeps the familiar creator actions (`🎬 UGC / Офферы`, `📨 Мои заявки`, `📥 Inbox`, `⭐️ PRO`, `🎁 Розыгрыши`, `🏷 Каталог брендов`) scoped to the selected current channel where relevant. The current channel is resolved through existing Redis UX-context `active_ws` (no new schema): if the saved workspace is missing/disconnected, we fall back to the first active workspace and persist it back into Redis. `📣 Мои каналы` stays a compact picker; tapping a channel still does `set current + open full channel menu`. `a:ws_open` remains the full per-channel menu, `a:cur_manage` remains the separate curator submenu for that channel, and `a:ws_settings` is still a compatibility alias. Source-level smoke `scripts/smoke-ws-channel-disconnect-contract.js` now also fixes the current-channel contract (`renderCreatorCurrentMenu`, `resolveCurrentWorkspaceForOwner`, role-hub routing).

**STEP412:** Workspace IA cleanup — `📣 Мои каналы` теперь работает как compact picker: короткий текст «Выбери канал для управления», список активных каналов и только служебные CTA (`🚀 Подключить ещё`, `📦 Неактивные`, `📋 Меню`, `🏠 Home`) без старой explanatory-простыни. На unified channel screen верхняя правая кнопка больше не переключает куратора напрямую: вместо этого показывается явный вход `👥 Кураторы: ВКЛ/ВЫКЛ` в отдельное подменю управления кураторами этого канала. Submenu `a:cur_manage` сохранён без новой бизнес-логики: внутри остаются master toggle `👤 Куратор: ВКЛ/ВЫКЛ`, `➕ Добавить по @username`, `🔗 Пригласить ссылкой`, `👥 Список кураторов`, `📜 Журнал`, `🧾 История`; back-path теперь возвращает в `a:ws_open`. Старый callback `a:ws_settings` сохранён и продолжает открывать unified channel screen, так что back-paths/старые кнопки не ломаются. Source-level smoke `scripts/smoke-ws-channel-disconnect-contract.js` обновлён под compact picker и curator submenu contract.

**STEP409:** Soft disconnect / reconnect workspace channel — в `workspace_settings` добавлен DB-truth флаг `channel_connected` + `channel_disconnected_at`; owner-flow `⛔ Отключить канал` доступен прямо на unified screen `Управление каналом` (с совместимым alias `a:ws_settings`), работает как soft disconnect (без hard-delete): атомарно ставит `channel_connected=false`, выключает `network_enabled` и `curator_enabled`, прячет канал из активного `📣 Мои каналы` и переносит его в отдельный список `📦 Неактивные`. Добавлен штатный reconnect `🔌 Подключить снова`, который возвращает канал в активный список без восстановления сети/куратора по умолчанию. `renderWsOpen`, `renderWsSettings`, `renderBxOpen`, owner-view `Заявки брендов`, curator-manage и финальные mutating entrypoints `a:bx_new` / `a:bx_publish` / `a:gw_new` / `a:gw_publish` теперь дружелюбно гейтят отключённый канал через специальный screen вместо тупиков. `ensureWorkspaceForOwner()` выбирает только активные workspaces и в сценарии «остались только отключённые каналы» показывает recovery CTA на `📦 Неактивные каналы`. Добавлен source-level smoke `scripts/smoke-ws-channel-disconnect-contract.js`, а `scripts/preflight.js` теперь запускает его обязательно.

# 00 — CURRENT STATE (Collabka PR / @collabkaprbot) — 2026-03-12

**STEP411:** Unified workspace management screen — `a:ws_open` больше не ведёт в промежуточную карточку канала: при выборе канала из `📣 Мои каналы` owner сразу попадает в единый экран **«Управление каналом»** с прямыми toggles `🌐 Сеть` / `👤 Куратор`, быстрыми CTA `👤 Профиль` / `🧾 История`, рабочими действиями (`📥 Inbox`, `📨 Заявки брендов`, `🎬 UGC / Офферы`, `📁 Папки`, `➕ Новый розыгрыш`, `🎁 Розыгрыши`, `⭐️ PRO`) и owner-action `⛔ Отключить канал` без лишнего промежуточного шага `👥 Кураторы и сеть`. Для zero-regression совместимости `a:ws_settings` сохранён как alias на тот же unified screen, поэтому старые callbacks/back-paths не ломаются. Новый экран использует уже загруженный `getWorkspace()` и не добавляет новых DB-read в hot-path. Source-level smoke `scripts/smoke-ws-channel-disconnect-contract.js` обновлён: теперь он фиксирует прямую reachability toggles/disconnect в `ws_open`, unified framing и alias-поведение `ws_settings`.

**STEP408:** /start role-gate contract smoke — добавлен `scripts/smoke-start-role-gate-contract.js`, который фиксирует source-level контракт onboarding/hot-path `/start`: `parseStartPayload()` для поддерживаемых deep-link payload’ов (`gw_`, `bp_`, `offer_`, `wsp_`, `fs_`, `ig_verify`, `src_*`), приоритет payload-веток перед role-gate, fail-open поведение при Redis outage (`ui_mode` key read → `catch => hasUiModeKey=true`), короткий gate-screen `Ты бренд или креатор?` с кнопками `a:home_mode|m:brand|creator`, а также strong-intent role switching (`a:home_mode`) и legacy/direct switch (`a:ui_mode_set`) без залипания brand-manager state. Smoke дополнительно фиксирует важный cost invariant: в самом `/start` hot-path нет `resolveUiMode()`/`db.listBrandsForManager()` до прохождения gate, а Redis write helper `setUiMode()` остаётся best-effort/fail-open. `scripts/preflight.js` теперь запускает этот smoke обязательно, чтобы ловить тихие rename/reorder/reguard регрессии start/onboarding flow до выкладки.

**STEP407:** Public positioning polish — обновлён public-layer без runtime-изменений: ключевые `docs/public/*` переведены с бот-центричного framing на системное позиционирование. Канонический смысл теперь: **Collabka PR — система управления коллаборациями брендов и креаторов внутри Telegram**, а Telegram-бот описывается как интерфейс доступа к витринам, офферам, заявкам, Brand Inbox и статусам сделок. Обновлены `00_product_overview_ru.md`, `README_PUBLIC.md`, `07_press_kit_ru.md`, `05_publication_templates_ru.md`, `06_telegraph_article_ru.md`, `02_for_brands_ru.md`, `03_faq_ru.md`, а также мягко синхронизированы `01_for_creators_ru.md` и `04_tech_overview_ru.md`. Жёстко зафиксировано, что public docs **не обещают** готовый white-label/private cabinet/enterprise analytics, а используют только мягкую формулировку про отдельный private/партнёрский формат по обсуждению.

**STEP406:** Docs / runbook polish after hardening 403–405 — обновлены operator/docs контуры без runtime-изменений: `docs/90_OWNER_RUNBOOK.md`, `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md`, `docs/process/10_RELEASE_PREFLIGHT.md` и новый `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`. Зафиксировано, как читать `/api/health` после новых hardening-шагов (`broadcast.db_overload.local_fuse_active`, `payments.orphaned_autoheal_chain_max`, manual Official Publish verify/check-now), какие сигналы считать watchlist, и что именно делать оператору при `DB overload + Redis degraded`, большом orphaned-payments backlog и stuck `PUBLISHING` без повторной публикации.

**STEP404:** Payments orphaned auto-heal chain-drain — добавлен bounded self-reenqueue для больших очередей `ORPHANED/missing_session` без изменения exactly-once guard’ов. `src/bot/cron.js` по‑прежнему обрабатывает первый batch сам, но если claimed batch заполнен целиком, он публикует continuation-задачу `action=orphaned_autoheal` в `POST /api/qstash/monetization-retry` (`dedup=mon:autoheal:*`, `chain_depth=1`). В `api/qstash/monetization-retry.js` добавлен worker branch `orphaned_autoheal`, который повторно claim’ит следующий batch через `claimOrphanedMissingSessionPaymentsForAutoheal(...)`, применяет уже существующий fallback-path (`_validateStarsPaymentStrict` + `applyPaymentFallbackNoSession`) и при полном batch сам публикует следующий bounded leg до `PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX`. В `/api/health` добавлено поле `payments.orphaned_autoheal_chain_max`, а `scripts/smoke-payments-autoheal-chain-contract.js` + обязательный прогон в `scripts/preflight.js` ловят регресс contract’а (cron first-leg enqueue, worker self-reenqueue, depth-limit/dedup, health/config visibility) до выкладки.


**STEP400:** Admin Users contract smoke — добавлен `scripts/smoke-admin-users-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Пользователи`: list-screen (`👥 Пользователи · фильтр · стр`, spoiler-строка поиска, empty-state, DM-only quick actions `👤 / ✉️ / 📝` при 1–5 результатах, filter/search/reset/export/pagination, `⬅️ Операции`), search/reset callbacks (`a:admin_users`, `a:admin_users_search`, `a:admin_users_reset`: `clearExpectText`, Redis query state, footer `⬅️ Система / 📋 Меню / 🏠 Home`) и CSV export contract (`a:adm_ucsv`, `exportUsersDirectory`, стабильный header/filename/caption, truncation warning, back buttons `⬅️ К списку / ⬅️ Админка`). Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY` (`a:admin_users*`, `a:adm_ucard`, `a:adm_umsg`, `a:adm_unote`, `a:adm_ucsv`). `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии Users operator-flow до выкладки.


**STEP399:** Admin Hard-skip contract smoke — добавлен `scripts/smoke-admin-hard-skip-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Hard-skip (dead chats)`: home/hits/view экраны (`🧱 Hard-skip (dead chats)`, configured TTL, `🧾 Hard-skip HITs`, reason filters + today top reasons, quick TG buttons, `🧹 Снять hard-skip`) и их фактический footer/nav (`⬅️ Система / ⬅️ Админка` на home/hits, `⬅️ Система / 📋 Меню / 🏠 Home` на view). Smoke дополнительно валидирует callback/runtime contract (`a:hs_home`, `a:hs_hits`, `a:hs_find`, `a:hs_view`, `a:hs_unskip`, `a:hs_hits_export`: admin gate, `hs_find` expectText parse/backCb, bounded export helper `adminHardSkipHitsExport`, TXT export document + rerender toast) и связанные записи `ACTION_REGISTRY`. По ходу аудита найден и закрыт реальный хвост: кнопка `🗒 Export last 200` уже была в UI/registry, но callback отсутствовал; добавлен минимальный handler `a:hs_hits_export` без новых DB-read. `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии Hard-skip operator-flow до выкладки.


**STEP398:** Admin QStash Status contract smoke — добавлен `scripts/smoke-admin-qstash-status-contract.js`, который фиксирует source-level контракт operator-flow `Админка → QStash статус`: summary/status экран (`🛰 QStash — статус`, `Lib (@upstash/qstash)`, `ENV token/signing/base_url`, `Fan-out (Redis)`, `Broadcast tick last_run`, `Worker last delivery`, `Ping received/enqueued`, `Broadcast cooldown`) и keyboard/footer (`🧪 Send signed ping`, `📣 Fan-out: ON/OFF`, `⬅️ Система / 📋 Меню / 🏠 Home`). Smoke дополнительно валидирует callback/runtime contract (`a:admin_qstash_status`, `a:admin_qstash_ping`: admin gate, missing-lib/token/base_url screens, Redis breadcrumbs `last_enqueued_at/nonce`, `qstashPublishJSON` с `kind=signed_ping`, `dedup=qping:*`, `retries=0`, `timeout=10s`, success rerender) и связанные записи `ACTION_REGISTRY` (`a:admin_qstash_status`, `a:admin_qstash_ping`, `a:admin_bc_qstash_toggle`, `a:admin_sys`). `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии отдельного QStash Status operator-flow до выкладки.


**STEP397:** Admin Payments Fallback contract smoke — добавлен `scripts/smoke-admin-payments-fallback-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Payments fallback apply`: summary/status блок (`EFFECTIVE`, `ENV`, `RUNTIME`, TTL hint, инцидентный guidance, runtime details `Enabled by/At/Until/Reason`), control rows (`🟢 2h incident / 🟢 12h backlog / 🟢 24h migration`, условный `🧹 Disable`) и footer (`⬅️ Система / ⬅️ Админка / 📋 Меню / 🏠 Home`). Smoke дополнительно валидирует runtime/callback contract (`a:admin_pay_fb`, `a:admin_pay_fb_set`, `a:admin_pay_fb_off`: admin gate, `setPaymentsFallbackRuntime`, success/failure toasts) и связанные записи `ACTION_REGISTRY`. `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии отдельного Payments Fallback operator-flow до выкладки.


**STEP396:** Admin Payments contract smoke — добавлен `scripts/smoke-admin-payments-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Payments`: list-screen (`💳 Payments • STATUS`, empty-state `Платежей нет.`, per-payment buttons, ORPHANED-only `🔁 Auto-heal missing_session`, pagination, `⬅️ Операции`), detail-screen (`Payment #id`, `Status/Kind/User/Amount/Created`, spoiler-блоки `Charge/Payload/Note`, условный `✅ Apply (manual)`, `⬅️ К списку`, `⬅️ Операции`) и runtime/callback contract (`a:admin_payments/view/apply/autoheal`, `clearExpectText`, strict validation, DB claim before apply, manual/error alerts, auto-heal only for `ORPHANED missing_session` + summary alert). Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY` (`a:admin_payments`, `a:admin_pay_view`, `a:admin_pay_apply`, `a:admin_pay_autoheal`, `a:admin_ops`). `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии отдельного Payments operator-flow до выкладки.


**STEP395:** Admin DM Templates contract smoke — добавлен `scripts/smoke-admin-dm-templates-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Шаблоны DM`: list/view экраны (`📌 Шаблоны сообщений (DM)`, `Источник`, `Версия`, `Обновлено`, per-template buttons, `➕ Новый шаблон`, `♻️ Сбросить к дефолту`, pagination, `📎 Вставить`, footer `⬅️ Коммуникации / 📋 Меню / 🏠 Home`), add/edit/delete/reset flow (стабильные prompts, `clearExpectText`, confirm screens, `version++`) и связку с `Outbox → 📌 В шаблон` (DM-only guard, `Открыть шаблон / Шаблоны DM / Outbox`, clipping warning). Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY` (`a:admin_umsg_tpl*`, `a:adm_ph`, `a:admin_outbox_to_tpl`, `a:admin_comms`). `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии отдельного DM Templates operator-flow до выкладки.

**STEP394:** Admin Outbox contract smoke — добавлен `scripts/smoke-admin-outbox-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Outbox`: list/view экраны (`📤 Outbox`, `Redis-only`, privacy redaction hint для non-DM, per-entry buttons, pagination, `🧹 Очистить`, footer `⬅️ Коммуникации / 📋 Меню / 🏠 Home`), view quick-actions (`👤 Карточка / ✉️ Написать / ✉️ Повторить / 📝 Заметка / 📌 В шаблон`) и callback/confirm-flow (`clearExpectText` на входе, DM-only guard для repeat/save-to-template, preview send controls, `🧹 Очистить Outbox?` confirm screen, clear → rerender list). Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY` (`a:admin_outbox*`, `a:adm_ucard`, `a:adm_umsg`, `a:admin_comms`). `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии отдельного Outbox operator-flow до выкладки.

**STEP393:** Admin Notice composer/runtime contract smoke — добавлен `scripts/smoke-admin-notice-contract.js`, который фиксирует source-level контракт operator-flow `Админка → Объявление`: summary/status блок (`STATUS`, `SEVERITY`, `TARGET`, `EXPIRES`, `CTA`, `VERSION`, preview текста), control rows (`toggle + severity`, `target + expire`, `CTA + text`, `clear + publish`) и footer (`⬅️ Коммуникации / 📋 Меню / 🏠 Home`). Smoke дополнительно валидирует callback/expectText runtime-contract: вход в экран очищает `expectText/draft`, `severity/target` циклы не теряются, composer prompts для `CTA` / `Expire` / `Text` остаются стабильными, publish по‑прежнему требует текст, bump’ит `version`, включает `active`, а expect-handlers сохраняют publish follow-up и Telegram-safe clipping. Дополнительно валидируются связанные записи `ACTION_REGISTRY` (`a:admin_notice*`, `a:admin_comms`). `scripts/preflight.js` теперь включает и этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии отдельного Notice composer/runtime flow до выкладки.

**STEP392:** Admin Founder Sale contract smoke — добавлен `scripts/smoke-admin-founder-contract.js`, который фиксирует source-level контракт отдельного operator-flow `Админка → Founder Sale`: summary/status блок (`Источник настроек`, `ENABLED`, `DEADLINE`, `STATUS`, `⏳ Осталось`, `Цены / кредиты`), control rows (`ENABLED toggle`, `🗓 Дедлайн / 💰 Цены`, `💳 Кредиты / ♻️ Сброс к ENV`, `🔗 Ссылки / 📝 Тексты`), footer (`⬅️ Система / 📋 Меню / 🏠 Home`), а также marketing helper screens `Founder Sale — ссылки` и `Founder Sale — тексты (copy/paste)` с deep-link presets `fs_offers_a/fs_offers_b/fs_gw_brand/fs_gw_creator`. Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY` (`a:admin_founder`, `a:admin_founder_toggle`, `a:admin_founder_set_deadline`, `a:admin_founder_set_prices`, `a:admin_founder_set_credits`, `a:admin_founder_reset`, `a:admin_founder_links`, `a:admin_founder_texts`, `a:admin_sys`). `scripts/preflight.js` теперь включает и этот smoke обязательно, закрывая отдельный Founder Sale operator-flow contract до выкладки.

**STEP391:** Admin System keyboard/footer contract smoke — добавлен `scripts/smoke-admin-system-contract.js`, который фиксирует source-level контракт `Админка → Система`: summary-строки (`Платежи`, `Match/Feat auto-apply`, `Payments fallback apply`, `Broadcast fan-out (QStash)`, `Founder Sale`), keyboard rows (`💳 Прием / ⚙️ Автовыдача`, `🎯🔥 Match/Feat / 🧯 Fallback`, `📣 QStash fan-out / 🛰 QStash статус`, `🧱 Hard-skip`, `🔥 Founder Sale`, `➕ Модератор / 📋 Модераторы`, `🎁 Подарить подписку`) и footer (`⬅️ Админка / 📋 Меню / 🏠 Home`). Smoke дополнительно валидирует связанные записи `ACTION_REGISTRY` (`a:admin_sys`, `a:admin_pay_accept_toggle`, `a:admin_pay_auto_toggle`, `a:admin_matchfeat_auto_toggle`, `a:admin_pay_fb`, `a:admin_bc_qstash_toggle`, `a:admin_qstash_status`, `a:hs_home`, `a:admin_founder`, `a:admin_mod_add`, `a:admin_mod_list`, `a:adm_gift`). `scripts/preflight.js` теперь включает и этот smoke обязательно, закрывая третий ключевой operator-screen contract до выкладки.

**STEP390:** Admin Comms keyboard/footer contract smoke — добавлен `scripts/smoke-admin-comms-contract.js`, который проверяет source-level контракт `Админка → Коммуникации`: заголовок/описание экрана, primary keyboard (`📣 Объявление` / `📌 Шаблоны DM` / `📤 Outbox`), условный gate `📣 Офиц.канал (${pending})` только при `OFFICIAL_PUBLISH_ENABLED`, footer (`⬅️ Админка / 📋 Меню / 🏠 Home`) и связанные записи `ACTION_REGISTRY` (`a:admin_comms`, `a:admin_notice`, `a:admin_umsg_tpls`, `a:admin_outbox`, `a:off_queue`). `scripts/preflight.js` теперь включает этот smoke обязательно, чтобы ловить тихие rename/remove/re-guard регрессии второго ключевого операторского экрана до выкладки.

**STEP389:** Admin Ops keyboard/actions contract smoke — добавлен `scripts/smoke-admin-ops-contract.js`, который проверяет контракт `Админка → Операции` на уровне source+registry: состав основных operator-кнопок (`Пользователи/Платежи/Рассылка/Аудит/Метрики`), служебные действия (`🧾 Flush ops digest`, `🧹 Clear pending snapshot`), footer (`⬅️ Админка / 📋 Меню / 🏠 Home`), confirm-screen для очистки snapshot и guard `🩺 /api/health` только при `PUBLIC_BASE_URL`. Дополнительно smoke валидирует `ACTION_REGISTRY` для связанных action keys, чтобы тихие rename/remove/re-guard поломки ловились до выкладки. `scripts/preflight.js` теперь включает этот smoke обязательно. Обновлены `docs/91_PROD_LAUNCH_30MIN.md`, `docs/93_PROD_DEPLOY_CHECKLIST.md` и `docs/process/10_RELEASE_PREFLIGHT.md` с явным упоминанием operator keyboard/actions contract.

**STEP388:** Preflight: `health/admin` JSON shape smoke + deploy workflow docs — добавлен `scripts/smoke-health-admin-shape.js`, который в staging/dev с `SIMULATE_REDIS_DOWN=1` проверяет стабильный операторский контракт `/api/health` (`system_status`, `no_go_reasons[{code,severity,hint}]`, `ops.digest_preview`, `broadcast.pending_deliveries/hard_skip`, `qstash.reschedule_failed`, `payments.fallback_apply_effective`). `scripts/preflight.js` теперь запускает этот smoke в non-prod и безопасно skip-ает его в `prod/production`. `/api/health` нормализован: даже при `redis_unavailable`/`not_configured` сохраняет базовый `broadcast/ref/cron` shape, чтобы не ломать дашборды/админские проверки. Обновлены `docs/91_PROD_LAUNCH_30MIN.md` и `docs/93_PROD_DEPLOY_CHECKLIST.md` с пошаговым локальным workflow: `npm install` → `npm run preflight` → `APP_ENV=production npm run preflight` → deploy → `/api/health` + Админка → Операции.

**STEP387:** Preflight: staging fault-injection smoke — `scripts/preflight.js` теперь запускает `scripts/smoke-fault-injection.js` в non-prod (`APP_ENV=staging` по умолчанию, `SIMULATE_REDIS_DOWN=1`) и проверяет критичный degraded-path: Redis calls падают с `SIMULATED_REDIS_DOWN`, а `/api/health` остаётся fail-open и возвращает `system_status=NO_GO` + `no_go_reasons[]`. В `prod/production` smoke безопасно пропускается.

**STEP386:** Admin Ops regression smoke — `renderAdminOps()` вынесен на pure builder `src/bot/adminOpsText.js` без изменений operator UX/DB-логики; добавлен preflight smoke `scripts/smoke-admin-ops-render.js`, который проверяет OK/degraded текст экрана `Админка → Операции` и держит guard на scope `r/key`, чтобы не вернуть crash уровня STEP385.

**STEP382:** Ops clarity + media timeout — добавлены Telegram guardrails `TG_HTTP_TIMEOUT_MS` + `TG_HTTP_MEDIA_TIMEOUT_MS`: raw Telegram fetch и broadcast/official publish media‑calls теперь идут с AbortSignal timeout; в Admin→Ops добавлен блок `Broadcast pending snapshot` с явной пометкой <i>Redis snapshot only</i> и confirm‑flow для `🧹 Clear pending snapshot`; в Hard‑skip экранах показывается configured TTL; preflight теперь включает `package-lock` drift gate (`scripts/check-package-lock.js`) и в репо добавлен `package-lock.json`.

**STEP380:** Audit baseline refresh — обновлён `docs/94_PROD_READINESS_PACK.md` под STEP379+ (GO/NO‑GO через `system_status/no_go_reasons` + `ops.digest_preview` + `broadcast.pending_deliveries` + hard‑skip отчёт + `🧾 Flush ops digest` + staging fault‑injection) и обновлены audit-доки (`docs/audit/*`) под новый NotebookLM baseline.

**STEP358:** Prod readiness docs pack — добавлен `docs/94_PROD_READINESS_PACK.md` (GO/NO‑GO + incident cookbook) и обновлены прод-доки (91/93/90/README) под текущее поведение health/admin ops.

**STEP360:** Broadcast deliver DB overload jitter — при деградации Neon/DB delivery отдаёт 429 + Retry‑After **с джиттером** (по умолчанию 0–15с) чтобы избежать thundering herd при массовых ретраях QStash.

**STEP361:** Broadcast deliver DB overload fuse — при `db_overload` ставим короткий Redis‑предохранитель (`ops:fuse:db_overload`, TTL ~50с) и на следующих доставках **сразу** отвечаем 429 до любых обращений к Neon/pool.

**STEP362:** Reserve incident logs to stdout — при деградации Redis ключевые ops‑события (ops digest) пишутся в stdout в JSON (fallback), чтобы не терять диагностический контекст при падении кэша.

**STEP372:** Hard-skip HIT report (кто и почему пропущен) — при пропуске отправки из‑за hard-skip (dead chats) теперь пишется Redis‑лог HIT в список `broadcast:hard_skip:hit_recent` (trim, TTL 14d) с `{tgId, reason, at, broadcastId?, userId?, via}`. В Admin→System→🧱 Hard-skip добавлена кнопка `🧾 Последние пропуски`, которая показывает недавние HITs (кого/почему пропустили, с привязкой к broadcast/user где доступно).

**STEP373:** Admin→Ops banner: payments fallback runtime (who/when/why) — в `🧰 Админка → Операции` баннер `Payments: fallback apply ENABLED` теперь показывает runtime‑детали (если включено через админку): `since`, `until`, `by` (tgId/user) и `reason`. Добавлена явная подсказка “как выключить” (через `⚙️ Админка → Система → Payments fallback apply → runtime OFF`).

**STEP374:** /api/health NO_GO reasons: нормализация + подсказки — `no_go_reasons[]` расширен до операторских объектов `{code,severity,value,threshold?,hint}`. Добавлен отдельный P0‑reason, если `PAYMENTS_PAYLOAD_HMAC_KEY` не задан (а не только “len<min”). Для ключевых причин добавлены короткие подсказки “что делать”.

**STEP375:** Redaction: меньше ложноположительных “как математика” — для phone-in-words без явных phone‑триггеров (`тел/номер/whatsapp/...`) включён более строгий режим: редактируем только типичную RU mobile форму `+7 9xx...` (в виде `плюс семь девять ...`). Добавлены тесты на строгий кейс (должен редактироваться) и на “плюс семь восемь…” как пример/математика (не должен редактироваться).

**STEP376:** IG templates leak guard — добавлен тест `scripts/test-ig-templates-no-contacts.js` и подключён в `scripts/preflight.js`. Скрипт извлекает `buildWsIgTemplate` и `buildWsIgDmRaw` из `src/bot/bot.js`, прогоняет на “опасных” данных (email/phone/@handle/портфолио) и валидирует, что IG-шаблоны **не содержат контактов** и не включают внешние ссылки (кроме deep-link `t.me/...start=wsp_...`).

**STEP377:** Preflight node-check расширен по entrypoints — `scripts/preflight.js` теперь делает `node --check` не только по статическому списку, но и по безопасным сканам директории: все `api/**/*.js`, `migrations/*.js`, `src/lib/*.js`, `src/bot/routes/*.js`, `src/bot/payments/*.js`, а также `scripts/test-*.js` и `scripts/smoke-*.js`. Это ловит ESM/export синтакс-ошибки и “битые entrypoints” до деплоя.


**STEP378:** Hard-skip HITs: фильтры/экспорт + top reasons today — в экране HITs (`Admin → System → 🧱 Hard-skip → 🧾 Последние пропуски`) добавлены фильтры по причине (кнопки с today‑счётчиками), кнопка `🗒 Export last 200` (чанкуется по лимиту Telegram), а при каждом HIT теперь инкрементятся per‑reason day counters `broadcast:hard_skip:hit_reason:d:<YYYYMMDD>:<reason>` (TTL 14d) для быстрой сводки.


**STEP379:** /api/health: ops digest preview — добавлено поле `ops.digest_preview` (Redis‑only) для дашбордов/оператора: `{day,pending,last_sent_at,top:[{reason,count}],last:[{ts,reason,kind,title}]}`. Содержимое берётся из буфера ops alerts (`ops:alerts:ops:d:<day>`) коротким `LRANGE 0..30`, endpoint остаётся “never throw”.
**STEP364:** Broadcast pending deliveries в `/api/health` — cron `broadcastTick()` пишет Redis‑снимок `{ts,broadcast_id,pending_count}` в ключ `broadcast:pending_deliveries` (TTL 30 мин); `/api/health` показывает `broadcast.pending_deliveries` (строго Redis‑only, без DB) для раннего обнаружения "залипов" доставок.

**STEP365:** Admin→Ops “Flush ops digest now” — в экране `🧰 Админка → Операции` добавлена кнопка `🧾 Flush ops digest`, которая принудительно вызывает `flushOpsAlerts(..., { force: true })` и показывает результат (sent/skipped) прямо на экране. Путь admin-only, без DB-чтений; при Redis degraded — graceful message.

**STEP366:** Preflight: smoke degraded rate-limit + extra node-check — `scripts/preflight.js` теперь делает `node --check` для `src/bot/payments/starsHandlers.js` и запускает `scripts/smoke-degraded-rate-limit.js`, который симулирует Redis down (fetch throws) и проверяет, что `rateLimit()` уходит в in-memory fallback со stricter лимитом (default ÷5). Прод‑runtime не меняется (dev/CI only).

**STEP367:** Preflight: broadcast overload invariants — добавлен `scripts/test-broadcast-overload-invariants.js` и подключён в `scripts/preflight.js`. Скрипт проверяет инварианты overload‑веток в `api/qstash/broadcast-deliver.js`: ответ 429 + выставление `Retry-After`/`Upstash-Retry-After` + наличие jitter/base/retry_after полей (регресс‑страховка, dev/CI only).

**STEP368:** Contacts redaction anti-bypass — усилены тесты `scripts/test-redactContactsInText.js` (t . me /, zero‑width, `instagram (dot) com`, `@ handle` с пробелом, obfuscated email `(... at ...) (... dot ...)` / `Email: ... at ... dot ...`, `+7 (999) ...`). Минимально подтянут `src/bot/redactContacts.js`: нормализация zero‑width, `t.me` regex допускает пробелы/невидимые разделители, `instagram (dot)` поддержан, `@` допускает пробелы, obfuscated email ловится консервативно (word‑pattern только при `email:`/`почта:`).

**STEP369:** Prod readiness docs armor — обновлён `docs/94_PROD_READINESS_PACK.md`: добавлена “матрица микрофиксов” (Symptom→Microfix→Verify→Rollback) и короткий runbook **runtime payments fallback apply** (preconditions, включение через админку, мониторинг, обязательное выключение). Также в `docs/90_OWNER_RUNBOOK.md` добавлена явная ссылка на эти разделы для оператора.


**STEP371:** Staging fault-injection (Redis down) — добавлен флаг `SIMULATE_REDIS_DOWN=1` (только staging/dev; в prod игнорируется). При включении все вызовы Redis принудительно падают с `code=SIMULATED_REDIS_DOWN`, чтобы руками проверить fail-open/fail-closed поведение. Добавлен ручной smoke `scripts/smoke-fault-injection.js` (не входит в preflight).



**STEP370:** /api/health GO/NO_GO агрегатор — добавлены поля `system_status: GO|NO_GO` и `no_go_reasons[]` (строго Redis-only). Правило: NO_GO при `redis.read_ok/write_ok=false`, `payments.payload_hmac_minlen_ok=false`, `payments.fallback_apply_effective=true`, а также при выходе за пороги: `broadcast.tick_deferred_redis.today_count>50`, `qstash.reschedule_failed.today_count>10`, `qstash.official_publish_stuck.today_count>5`.


**STEP363:** Payments handlers extracted — Stars payments (`/paysupport`, `pre_checkout_query`, `successful_payment`) вынесены из `src/bot/bot.js` в `src/bot/payments/starsHandlers.js` без изменения логики (только декомпозиция, меньше риск регрессий при будущих правках).



**STEP357:** Payments safety visibility — `/api/health` now exposes `payload_hmac_minlen_ok` + key length; Admin→Ops shows banners for missing/short HMAC key and for `fallback apply ENABLED` (env/runtime).

**STEP356:** Degraded rate-limit stricter — when Redis `rateLimit` falls back to in-memory mode, limits are reduced (default ÷5 via `RATE_LIMIT_FALLBACK_LIMIT_DIV`) to protect Neon during Redis outages.

**STEP355:** Payments auto-heal batching — ORPHANED `missing_session` selection now uses `FOR UPDATE SKIP LOCKED` + DB-claim in one statement to avoid duplicate work when cron overlaps.

**STEP354:** Broadcast tick fail‑closed on Redis degraded — cron `broadcastTick()` now defers *before any DB polling* when Redis is unavailable; emits ops reason `broadcast_tick_deferred_redis` and surfaces it in `/api/health` + Admin→Ops.

**STEP352:** Ops visibility — `/api/health` now exposes `qstash.reschedule_failed` (today_count + last_*) and `qstash.official_publish_stuck` (today_count + last_offer_id/age/via). Admin→Ops shows banners for both; no DB reads were added to health.

**STEP351:** RateLimit hardening — when Redis Lua `EVAL` degrades, `rateLimit()` no longer goes unlimited fail‑open: it uses a bounded in‑memory fallback + short circuit‑breaker window (per warm instance).

**STEP350:** Support free‑text reply fix — “✍️ Ответить” in SUPPORT group now accepts Reply both to the ticket and to the prompt message (forum topics supported), and does not dump admins back to main menu on send.

**STEP349:** Ops polish — `/api/health` now exposes broadcast DB overload metrics (`broadcast.db_overload`: today_count + last_at) and Admin→Ops shows a banner when load‑shedding happened recently.

**STEP335:** Infra correctness — creator→brand apply rate-limit Redis keys are now fully namespaced via `k([...])` (prevents cross‑env collisions if Redis is shared across preview/prod).

**STEP336:** Admin control plane — added an Admin→System screen to browse recent broadcast hard-skip entries (dead chats) and unskip a specific TG ID (Redis-only, no SCAN/KEYS).

**STEP334:** Neon-cost hardening (barter feed) — `renderBxFeed` caches `countNetworkBarterOffers()` in Redis (TTL 60s, best‑effort) keyed by normalized filters, to avoid expensive COUNT(*) on every page.

**STEP333:** Neon-cost hardening (hot UI) — `ensureWorkspaceForOwner` and «📣 Мои каналы» now use `listWorkspacesCached` (TTL 5m, best‑effort) to avoid extra `listWorkspaces()` DB reads. Safety: if cache says "empty" we double-check DB once to avoid stale‑empty UX gates.

**STEP331:** Giveaways results auto-publish idempotency — cron now does DB claim (results_message_id=0) **before** TG edit/send + Redis breadcrumb for sent results message. If DB finalize fails, the next tick finalizes without duplicate post.

**STEP330:** Giveaway publish idempotency — `a:gw_publish` now does reserve→send→commit with Redis token-lock + Redis breadcrumb for the sent channel message. If the post is sent but DB commit fails, retry finalizes **without** sending again (no duplicates). Intermediate status: `PUBLISHING`.

**STEP327:** Anti-bypass offer title — for brands before unlock, offer **title** is redacted via `redactContactsInText` (same as description). Feed titles and share-text are also redacted to prevent contact leakage.

**STEP326:** Broadcast hard-skip list for permanently dead chats (blocked/chat not found/deactivated) + admin report screen «🧱 Пропуски/ошибки» in broadcast view.

**STEP324:** Silent-catch hardening → digest ops alerts in the most expensive infra paths (Redis Lua eval failures + QStash publish failures + official publish reschedule enqueue failure).

**STEP320:** NotebookLM audit prompt condensed (strict, copy/+paste) and synced in `docs/audit/notebooklm_pack/04_NOTEBOOKLM_AUDIT_PROMPT_RU.txt` (canonical) and `docs/audit/01_NOTEBOOKLM_AUDIT_PROMPT_RU.txt`.
## Staff audit

Для staff‑аудита (и NotebookLM) используем единый стартовый манифест:
- `docs/audit_staff/00_AUDIT_START_MANIFEST.md`

Он фиксирует **текущее**: Instagram OAuth/verify выключены, Instagram — только ссылка/контакт (скрыт до unlock), верификация — только ручная через заявку.

NotebookLM pack (≤50 текстовых файлов):
- Источники: `docs/audit/notebooklm_pack/` (00–07: md/txt, код и миграции в бандлах).
- Генерация ZIP: `npm run gen:notebooklm-sources` → `dist/NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip`.

---


**Purpose:** единый *source of truth* snapshot, чтобы продолжать работу в новом чате без потери контекста.

### Snapshot: верификация / Instagram (сейчас)
- **Instagram OAuth / IG verification:** выведено из активного baseline. UI скрыт, OAuth API **убран из deploy surface** (нет `api/ig/oauth/*` в прод-сборке), Instagram остаётся только как **обычная ссылка/контакт** в карточке креатора.
- **Единственная “верификация” в продукте:** ручная (заявка → модерация → approve/reject).
- Контакты (в т.ч. Instagram) **не раскрываются бренду до unlock**.


### ENV cheat‑sheet (Vercel)
См. `docs/process/11_ENV_CHEATSHEET_ONE_SCREEN.md` — один экран, можно копипастить.

---


## 0.05) Выводы последнего регресс-аудита + watchlist

Snapshot: **2026-03-03** (STEP274 Dual-role mode hardening) — P0 не найдено; шаринг (U+2060 workaround), degraded‑навигация поддержки и anti‑bypass для IG Templates подтверждены; Brand Manager UX и dual‑role переключения режимов приведены к fail‑open (без лишних DB‑запросов в меню/хабах).

Рисковые зоны (если трогаешь — обязателен `npm run preflight` + ручной smoke):
1) **Share-URL workaround:** не убирать формат `t.me/share/url?url=<U+2060>&text=...` — иначе часть Telegram‑клиентов снова “молчит” на кнопках шаринга.
2) **Support при Redis degraded:** `a:support` / `a:support_push` должны оставаться `guard: NONE` (поток ввода `a:support_write` может быть `REQUIRE_REDIS`).
3) **Админка при Redis degraded:** экран «🧰 Админка → Операции» должен быть доступен (guard `NONE`) и показывать баннер состояния Redis + ссылку на `/api/health` (если `PUBLIC_BASE_URL` задан). Reply-to-user из support-группы: промпт без ForceReply + «❌ Отмена»; при Redis degraded не оставляем активные «reply сюда» промпты.
3) **IG Templates anti-bypass:** не вставлять `@username`, “ссылка в профиле”, портфолио/внешние ссылки и любые контакты; только CTA через витрину/заявку в боте.
4) **Brand Inbox atomics:** до `✅ Принять` доступны только `✅ Принять / ⛔ Спам / 🗑 Удалить`; переход `new → in_progress` строго атомарный (DB‑truth).
5) **`/api/health` + cron:** новые cron‑задачи — через `api/cron_router.js`, с lock+throttle и отражением в health без лишних DB‑запросов. Health также показывает состояние Redis (read/write probe) для быстрой диагностики деградации.
6) **Official publish:** token‑lock + DB‑reserve `PUBLISHING` + async deliver через QStash (`/api/qstash/official-publish-deliver`). UI делает reserve+enqueue, воркер отправляет в канал и фиксирует `ACTIVE`. Менять только маленькими патчами (риск дублей в @collabka_offers).
7) **Account tombstone/anonymize:** удаление аккаунта (`a:acc_del_do`) — DB‑truth, чистит PII (users/brand_profiles/workspace_settings), скрывает витрины из каталога и отзывает роли (manager/editor/curator). Важно: `upsertUser()` не должен снова записать `tg_username`, если `is_deleted=true`. Доступ для удалённых пользователей: только `♻️ Восстановить` / `💬 Поддержка`.
8) **Hot UI DB‑reads:** в меню/хабах не добавлять новые SQL‑чтения; Redis‑first, DB только на клике/DB‑truth путях.
8) **Role‑specific UX (Creator vs Brand):** в режиме Creator не показывать brand‑only кнопки ("📰 Лента креаторов", фильтры/подбор) и не писать текст, который выглядит как инструкция открыть brand‑раздел; формулировки должны быть: "бренды увидят в ленте (режим Brand)".
9) **Brand Manager (команда бренда):** вход в «🧑‍💼 Я менеджер бренда» всегда виден, но доступ проверяется **на клике** (гейт внутри bm‑flow). В меню/🏠 Home не делать дополнительных SQL‑проверок “canManager”; при отсутствии доступа показывать одну консистентную подсказку (не “отозван”, а “не добавили/доступ отозван”).
10) **Dual-role (Creator + Brand + Manager):** переключение роли не должно оставлять “полу‑состояния”. При `a:ui_mode_set` всегда очищать brand‑manager state (bm_mode + active brand). В Redis degraded role switch должен быть **fail‑open** (выбранный режим показываем сразу), даже если его нельзя сохранить.
11) **Brand/Manager return-to (ret) UX:** в списках "📝 Заявки" и "📌 Сделки" кнопка "⬅️ Назад" должна возвращать: владелец → в роль‑меню (a:menu), менеджер → в 📥 Inbox (a:bx_inbox). См. audit report 07.
12) **Creator ↔ Curator (кураторский кабинет):** в UI использовать название «🧹 Кабинет куратора» (не «Кураторы блогера»); toggle режима куратора должен использовать `v:0/1` (не `v=...`); при Redis degraded кураторская навигация должна быть доступна (guard NONE), а invite/input/anti-spam send должны fail-closed с понятным сообщением. В ключевых сценариях “куратор обработал → владелец увидел → что дальше” должны быть явные подсказки (без тупиков). См. audit report 08/09.
13) **Curator ↔ Brand Leads (очередь заявок):** в кураторском режиме должны быть явные подсказки “Что дальше” (очередь → карточка → действия). Возврат из карточки в `📨 Очередь заявок` должен сохранять фильтр назначения (`af: all/my/free`). В кураторском просмотре не показывать кликабельные контакты/URL. См. audit report 10.
14) **Brand Leads (team notifications):** уведомления по жизненному циклу заявки (новая/взята/ответ/смена статуса/сообщение бренда) должны быть самодостаточными ("Что дальше"), без добавления новых действий и без спама (только при реальном изменении). См. audit report 11.
15) **Manual replies: return-to-card:** после ручного ответа (owner `lead_reply` и brand `brand_app_reply`) оператор должен попадать обратно в карточку заявки/треда (не на отдельную «квитанцию»). Это снижает тупики и ускоряет дальнейшие действия.
16) **Creator UI wording (context):** в подсказках креатора не оставлять brand‑термины без контекста. Упоминание «Inbox» должно быть пояснено как «входящие бренда внутри этого бота». См. audit report 13.
17) **Brand Leads (brand-side signals):** бренд должен получать самодостаточные сообщения “что дальше” при ответе креатора/куратора и при ручной смене статуса заявки (без подсказок обхода unlock/контактов). См. audit report 14.
18) **Brand Leads (brand reply receipt):** после ручного ответа бренда креатору (blead_reply) квитанция бренду должна содержать короткий блок «Что дальше» и оставаться самодостаточной, без новых действий. См. audit report 15.
19) **«Что дальше» copy consistency:** новые тексты с блоком «Что дальше» делать по единому гайду, чтобы не разъезжались формулировки и не появлялись намёки на контакты/обход unlock. См. `docs/24_WHAT_NEXT_BLOCKS_STYLEGUIDE.md` и smoke `docs/audit/16_...`.
20) **Folders: Editors disabled by default:** чтобы не плодить лишние роли/вопросы и не добавлять DB‑чтения в hot Menu, UI/роль `👥 Editors` выключены по умолчанию. Включение только через `WORKSPACE_EDITORS_ENABLED=1`. См. audit report 17.

### Ops: портативность артефактов (ZIP/Windows)

- В репозитории запрещены не-ASCII/слишком длинные имена файлов (часто ломают распаковку ZIP на Windows).
- `npm run preflight` включает gate `lint:portable-paths` (проверяет basename <= 200 bytes + только printable ASCII).

21) **STEP286 hotfix:** исправлен `SyntaxError: Invalid or unexpected token` на cold start (newline внутри `'...'` в сообщении `a:folders_my`). Теперь используется экранирование \n\n.

22) **STEP287 preflight: node --check:** `npm run preflight` теперь прогоняет `node --check` по ключевым entrypoint‑ам и ловит SyntaxError ещё до деплоя (страховка от регрессий типа STEP286).
23) **Giveaways & Offers E2E smoke:** держим быстрый end-to-end smoke (gate + wizard + финальные экраны), чтобы после деплоя быстро поймать тупики/возвраты в розыгрышах и офферах. См. audit report 20 и секцию 13 в `smoke-tests_short.md`.

24) **Broadcast E2E smoke:** держим быстрый end‑to‑end smoke (gate + создание + cooldown), чтобы после деплоя быстро ловить тупики и проверки 429/cooldown в рассылках. При деградации Neon/DB delivery использует load-shedding: отдаём 429 + Retry-After (+ jitter) для QStash (без шторм-ретраев). См. audit report 21 и секцию 14 в `smoke-tests_short.md`.

25) **Admin UX sweep (input-mode escape hatch):** `📋 Меню` / `🏠 Home` теперь best‑effort сбрасывают `expectText` (не залипаем в режиме ввода), а входы в ключевые админ‑разделы очищают ожидание ввода. См. audit report 22.

26) **Neon-saving Redis caches (UI):**
- На `📋 Меню` / `🏠 Home` используем best‑effort Redis‑кеш (TTL 5 мин) для role flags (moderator/curator/editor) и списка workspaces креатора. Это убирает 2–3 SQL на каждый клик по меню в нормальном режиме.
- **STEP333:** эти же кеши используются в `ensureWorkspaceForOwner` и экране «📣 Мои каналы», чтобы избежать лишних `listWorkspaces()` в частых переходах. Safety: если кеш вернул пустой список, один раз перепроверяем DB (чтобы не получить stale‑empty gate).
- **STEP334:** в `renderBxFeed` кешируем COUNT(*) (`countNetworkBarterOffers`) на 60 секунд по нормализованным фильтрам, чтобы не считать total на каждой странице ленты.

При деградации Redis — fail‑open: работаем по DB‑truth как раньше. См. audit report 28.

**STEP310:** `a:main_menu` переведён на `getRoleFlagsCached` (без лишних SQL в навигации). Добавлена инвалидация кеша role flags при изменении ролей (модератор/куратор/редактор) — best‑effort `redis.del` (DB остаётся source of truth).

**STEP311:** migrations cleanup — правило имён миграций расширено до `NNN..._name.sql` (>=3 цифры, чтобы не упереться в 999), а из раннера убран/не используется `normalizedSql` (dead field; checksum остаётся нормализованным LF+trimEnd).

27) **Redis TTL hygiene gate:** в `npm run preflight` добавлен grep‑gate `lint:redis-ttl` — запрещаем появление `redis.set(a, b)` без TTL в runtime‑коде. Исключения (намеренно persistent) должны быть явно помечены `TTL-LINT: ...`. См. audit report 30.

**STEP312:** `statement_timeout` hardening — установка таймаутов через parameterized `set_config(..., $1, ...)` + безопасный fallback на legacy `SET` (значение санитизируется).

**STEP313:** acquisition totals (`ref:*:total`) теперь bounded: TTL 365 дней по умолчанию (ENV `ACQ_TOTAL_TTL_DAYS`, `0` = хранить навсегда). Day‑buckets остаются с TTL 60 дней.

**STEP314:** деградация Redis — унифицированы тексты «кеш/сессии недоступны» (единый copy‑блок), fail‑closed middleware для `guard: REQUIRE_REDIS` показывает консистентный HTML‑экран + stateless allowlist (`s:menu/s:home/s:help/s:reset_input`).

**STEP318:** Broadcast 429 cooldown — set cooldown делается атомарно (Lua) для per‑broadcast и global ключей, воркеры (cron + QStash deliver) уважают паузу; `/api/health` показывает `broadcast.cooldown_until` (с Redis fallback на per‑broadcast ключ при частичных ключах).

**STEP325:** Broadcast 429 anti-stall — если один получатель повторно ловит 429 (по счётчику `BROADCAST_QUARANTINE_THRESHOLD`), его доставка помечается `blocked` (non‑retryable), чтобы рассылка не зависала в `pending` навсегда. Глобальный cooldown ставится только при burst 429 по нескольким получателям: считаем distinct получателей за окно `BROADCAST_GLOBAL_429_WINDOW_SEC`, порог `BROADCAST_GLOBAL_429_THRESHOLD`.


28) **STEP301 micro consistency (P3):** в админской рассылке (экран «🔗 Кнопки») шаблоны и действия выровнены в 2×2, добавлен явный admin‑footer (⬅️ Админка / 📋 Меню / 🏠 Home); в `api/qstash/broadcast-deliver.js` убран scope‑shadow `url` в cooldown‑ветке (используем `deliverUrl`); в `redactContactsInText` убран паттерн `.test()+.replace()` на глобальных regex — теперь один проход `replace` + проверка изменения строки (без stateful edge‑кейсов).

Audit report (one-time scan): `docs/audit/04_CREATOR_UI_BRAND_ACTION_KEYS_AUDIT_2026_03.md`.

Audit report (Brand Manager system): `docs/audit/05_BRAND_MANAGER_SYSTEM_AUDIT_2026_03.md`.

Audit report (Dual-role mode switching): `docs/audit/06_DUAL_ROLE_MODE_SWITCH_AUDIT_2026_03.md`.

Audit report (Brand/Manager nav + ret): `docs/audit/07_BRAND_MANAGER_NAV_RET_AUDIT_2026_03.md`.

Audit report (Creator/Curator system): `docs/audit/08_CREATOR_CURATOR_SYSTEM_AUDIT_2026_03.md`.

Audit report (Creator/Curator what-next UX): `docs/audit/09_CREATOR_CURATOR_WHAT_NEXT_UX_2026_03.md`.

Audit report (Curator/Brand Leads what-next UX): `docs/audit/10_CURATOR_BRAND_LEADS_WHAT_NEXT_UX_2026_03.md`.

Audit report (Brand Leads team notifications UX): `docs/audit/11_BRAND_LEADS_TEAM_NOTIFICATIONS_UX_2026_03.md`.

Audit report (Manual reply return-to-card UX): `docs/audit/12_MANUAL_REPLY_RETURN_TO_CARD_UX_2026_03.md`.

Audit report (Creator UI Inbox wording context): `docs/audit/13_CREATOR_UI_INBOX_WORDING_CONTEXT_UX_2026_03.md`.

Audit report (Brand Leads brand-side what-next UX): `docs/audit/14_BRAND_LEADS_BRAND_SIDE_WHAT_NEXT_UX_2026_03.md`.

Audit report (Brand Leads brand reply receipt what-next UX): `docs/audit/15_BRAND_LEADS_BRAND_REPLY_RECEIPT_WHAT_NEXT_UX_2026_03.md`.

Audit report (Brand Leads E2E smoke): `docs/audit/16_BRAND_LEADS_E2E_SMOKE_2026_03.md`.

Audit report (Folders Editors disabled): `docs/audit/17_FOLDERS_EDITORS_DISABLED_BY_DEFAULT_2026_03.md`.

Audit report (STEP286 hotfix invalid token): `docs/audit/18_STEP286_HOTFIX_INVALID_TOKEN_2026_03.md`.

Audit report (STEP287 preflight node --check): `docs/audit/19_STEP287_PREFLIGHT_NODE_CHECK_2026_03.md`.

Audit report (Giveaways & Offers E2E smoke): `docs/audit/20_GIVEAWAYS_OFFERS_E2E_SMOKE_2026_03.md`.

Audit report (Broadcast E2E smoke): `docs/audit/21_BROADCAST_E2E_SMOKE_2026_03.md`.

Audit report (Admin UX sweep): `docs/audit/22_ADMIN_BROADCAST_AUDIT_AND_POLISH_2026_03.md`.

Audit report (Broadcast confirm idempotency): `docs/audit/27_BROADCAST_CONFIRM_IDEMPOTENCY_2026_03.md`.

Audit report (Menu/Home hot UI cache): `docs/audit/28_MENU_HOME_HOT_CACHE_2026_03.md`.

Audit report (RateLimit & Redis TTL hardening): `docs/audit/29_RATE_LIMIT_AND_REDIS_TTL_HARDENING_2026_03.md`.


---

## 0) Security invariants (must-not-break)
См. `01_SECURITY_INVARIANTS.md`. Ключевое на текущий момент:
- Payments: валидация payload/amount/currency в `pre_checkout` и `successful_payment` (fail-safe apply).
- Contacts unlock: DB truth + advisory lock (exactly-once), Redis только кеш/TTL.
- Ownership: safe-getters с ownership внутри SQL для лидов/заявок и опасных действий.
- Redis degraded mode: mutating callbacks работают **fail-closed** (кроме строго allowlisted DB-safe действий). Guard использует строгий реестр `src/bot/actionRegistry.js`.
  - Break-glass (Admin): при Redis down супер‑админ может открыть *строго ограниченный* allowlist экранов (payments/users/audit) через двойное подтверждение (`bg=1`). Каждое использование логируется в ops alerts.
  - STEP128: stateless fallback UI (callback `s:*`) — минимальная навигация, которая работает даже при Redis down и не делает Redis/DB вызовов.
  - STEP129: official publish anti-timeout — AbortSignal timeout на Telegram API + self-heal по `channel_post` (прикрепляем `message_id`, если функция умерла после отправки).
  - Markdown экспорт реестра action keys для аудитов: `npm run actions:md` → `docs/02_ACTION_KEYS_REGISTRY.md`.
- STEP202: синхронизирован реестр `src/bot/actionRegistry.js` с фактически используемыми callback‑ключами (админ‑разделы/notice/outbox/templates/ack). `npm run actions:check`/`actions:md` проходят чисто.
- STEP203: добавлен быстрый релиз‑preflight: `npm run preflight` (alias `npm run qa:fast`) — гоняет `actions:check`, `actions:md` (и проверяет, что `docs/02_ACTION_KEYS_REGISTRY.md` не “грязный”), `lint:nav`, `test:redact`. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP287: релиз‑preflight усилен `node --check` по ключевым JS entrypoint‑ам (ловит SyntaxError на cold start **до** Vercel). См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP204: Outbox стал “центром поддержки”: из записи можно `✉️ Повторить` (с предпросмотром), открыть `📝 Заметку` с возвратом в Outbox и сохранить текст как `📌 шаблон` (DM-only).
- STEP234: Outbox privacy hardening — если админ открыл Outbox не в личке с ботом (group/supergroup/channel), текстовые snippet’ы скрываются (🔒), а `✉️ Повторить` отключён (чтобы исключить случайные утечки/путаницу).
- STEP235: Neon timeout hardening — Postgres pool задаёт `statement_timeout` для сессии через `SET statement_timeout` в connect hook (ENV `PG_STATEMENT_TIMEOUT_MS`, default 15000) + добавляет явный лог‑маркер `db.statement_timeout` при отмене запроса по таймауту (помогает ops/support). Важно: в Neon pooler нельзя передавать `statement_timeout` через startup options.
- STEP242: Heavy TX hardening — в “тяжёлых” транзакциях (например, draw+finalize победителей розыгрыша) дополнительно ставим `SET LOCAL statement_timeout` сразу после `BEGIN` (defense-in-depth против частичных деплоев/нестандартных пулов). По умолчанию берём `PG_STATEMENT_TIMEOUT_MS` (опционально можно переопределить `PG_HEAVY_TX_STATEMENT_TIMEOUT_MS`).
- STEP236: Audit flush cooldown — при DB outage audit-flush больше не “долбит” Postgres каждую минуту: после requeue или DB‑ошибки ставим короткий cooldown (ENV `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC`, default 120) и cron временно возвращает `skipped: requeue_cooldown`. В `/api/health` добавлен `audit.buffer.requeue_cooldown_ttl_sec`.
- STEP239: Anti-bypass offer text — для бренда до unlock **заголовок и описание** оффера проходят через `redactContactsInText` (скрываем ссылки/почту/телефоны/@handles). `redactContactsInText` усилен против обхода через `＠` (U+FF20) и `․` (U+2024).
- STEP240: Lead notes tags persist — теги `#brief/#urgent/...` в curator notes теперь извлекаются и сохраняются в БД: `brand_leads.meta.curator_notes[].tags` (и агрегируются в `brand_leads.meta.tags` для будущей фильтрации). UI больше не обязан парсить текст.
- STEP241: Hotfix build-compat — импорты из `src/lib/redis.js` переведены на namespace (`import * as R`) с безопасными fallback для опциональных helper’ов (`incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`), чтобы частичные деплои/слияния не падали на Vercel с ошибкой «does not provide an export named ...». Поведение прод-логики не меняем, только устраняем crash при загрузке модулей.
- STEP205: Polishing Comms — единые лимиты Telegram по длине текста (emoji-safe), предупреждения в предпросмотре, лимиты для System Notice и CTA (без регрессий).
- STEP206: закреплён короткий релиз‑протокол “2 минуты”: `npm run preflight` + `/api/health` + 2–3 клика по админ‑экранам (Comms/Outbox/Users). См. `docs/16_RELEASE_CHECKLIST.md`.
- STEP207: hotfix — исправлен SyntaxError (invalid RegExp) в `normalizeNoticeCtaLabel` (CTA label), который мог ломать запуск на Vercel.
- STEP208: migrations fail-fast — раннер `migrations/run.js` и генератор pack (`scripts/gen-mark-all-applied.js`) принимают только `NNN..._name.sql` (>=3 цифры) и **падают**, если в `migrations/` есть любой “левый” `.sql` (защита от случайного копирования `migration_pack/*.sql`).
- STEP209: action guards v2 — в `src/bot/actionRegistry.js` добавлены guard-типы `db_truth` / `queue_first` (вместо размытого `none` для критичных DB-truth путей), middleware в `src/bot/bot.js` кэширует `redisOk` для этих guard’ов, доки синхронизированы и перегенерирован `docs/02_ACTION_KEYS_REGISTRY.md`.
- STEP210: anti-click-storm при Redis down — добавлен локальный in-memory limiter (TTL ~8s) для `✅ Принять` и `🔓 Разлок контактов`, чтобы при деградации Redis избежать “клик‑шторма” и спайков нагрузки на Postgres/Neon.
- STEP211: payments strict validation — auto-heal/ручной apply не применяют Stars‑платежи с невалидным payload/суммой/валютой; admin auto-heal помечает «manual_required» и останавливает retry‑петли; в строгой валидации поддержаны legacy токены (Brand Pass numeric credits, Brand Plan basic/max).
- STEP212: Instagram routes kill‑switch — `IG_ROUTES_ENABLED` (0/1) закрывает весь `/api/ig/*` (включая IG cron) 404, даже если роуты присутствуют; по умолчанию следует `IG_OAUTH_UI_ENABLED`.
- STEP213: Monetization UI при Redis down (P0) — кнопки списания не исчезают из UI: «🔓 Контакты» всегда показывается (даже при 0/unknown балансе в Redis), проверки кредитов — на клике (DB-truth). Для навигации разрешены read-only экраны `a:brand_apps`, `a:bx_inbox`, `a:bx_thread` даже при деградации Redis; redis-getters для UI режима/manager mode/active ws сделаны fail-open (не падают).
- STEP214: Official publish anti-stuck — после DB-reserve (`PUBLISHING`) ставим отложенную QStash‑проверку `/api/qstash/official-publish-verify`: если известен `message_id` (Redis breadcrumb) — прикрепляем и переводим в `ACTIVE`, иначе сбрасываем статус обратно в `PENDING` + логируем `last_error` (разблокируем UI/очередь). См. `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.
- STEP215: Audit buffer flush — suppressed workspace audit события (AUDIT_DB_THROTTLE) больше не теряются: складываем в Redis list и батчим в Postgres через cron `/api/cron/audit-flush-tick`. В `/api/health` добавлен `audit.buffer.*` (len/enqueued/flushed/last_flush).
- STEP216: expectText TTL + escape hatch — режим ввода текста больше не может “залипнуть навсегда”: `expectText` получает `_startedAt` и общий лимит жизни (ENV `EXPECT_TEXT_MAX_LIFETIME_SEC`, default 2h). В text-input футере добавлен явный выход «❌ Отмена» (в `📋 Меню`), а в приватном чате можно набрать `отмена/cancel/стоп/stop`.
- STEP217: post-deploy hardening — канонизировали короткий smoke после деплоя: обновлён `smoke-tests_short.md` (добавлен input-mode `❌ Отмена/отмена` + audit flush tick + акцент на Redis degraded/монетизацию). В `docs/16_RELEASE_CHECKLIST.md` и `docs/13_RUNBOOK_RELEASE.md` добавлены ссылки на этот smoke.
- STEP218: `npm run smoke:short` — микро-команда для релиза: печатает `smoke-tests_short.md` + 4 ключевые проверки и ссылки на релизные доки (без влияния на прод-логику).
- STEP220: Vercel Hobby лимит по функциям (≤12) — cron endpoints агрегированы через один роутер `api/cron_router.js`, а старые URL `/api/cron/*` продолжают работать через `vercel.json` rewrites. Новые cron‑тики добавляем как `job=...` внутри роутера, а не как новый файл в `api/`.

- STEP221: Admin DM UX — в системных/админских сообщениях пользователю кнопки `📋 Открыть меню` и `💬 Поддержка` открывают экраны **новым сообщением** (не затирают текст‑квитанцию). В админке (`a:adm_umsg`) кнопки уложены сеткой 2×N. Также починен путь cron router под rewrites.
- STEP223: исправление `a:menu_push` — при нажатии «Открыть меню» создаётся отдельное UI‑сообщение (`⌛ Открываю меню…`) и все edit‑рендеры привязываются к нему.
- STEP224: hotfix push‑экранов — `a:menu_push` больше не использует `Object.create(ctx)` (устранён источник ошибок контекста), а `a:support_push` всегда отвечает новым сообщением (`reply`), не попадая в общий error‑handler.
- STEP226: Audit P1 + антикаскад (Neon/Redis) — включена проверка SSL сертификата для Neon (`rejectUnauthorized:true`), rate limiter сделан атомарным (Lua `INCR+EXPIRE` + `ok/allowed` совместимость), а для `✅ Принять` добавлены: PG `pg_try_advisory_xact_lock` (fail-fast при параллельных кликах) + короткий DB timeout и UX «⏳ В обработке…» при Redis degraded (без штормов).
- STEP227: Admin DM UX v2 — системное/админское сообщение пользователю больше не превращается в тупик: под квитанцией всегда остаются `🏠 Главное меню` + `💬 Поддержка`, а `✅ Принято` убирает только себя (не снимает всю клавиатуру).
- STEP228: Audit hardening (money + anti-cascade) — закрыты: F-8 (unknown numeric pack → 0), N-1 (убран non-atomic fallback rate limiter → fail-open), N-2 (unlock contacts переведён на `pg_try_advisory_xact_lock` + `busy` UX), F-5 (ops alerts buffer атомарный Lua), F-7 (IG verify comments с пагинацией до 5 страниц).
- STEP229: Audit buffer flush (lossless) — flush переведён на двухфазную схему Redis list (queue→inflight→ack) без потерь при DB outage; добавлен stuck-requeue (ENV `AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC`) и токен-лок (ENV `AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC`). `/api/health` теперь показывает `audit.buffer.queue_len/inflight_len/inflight_age_sec` и `requeued_today_total`.
- STEP230: Final atomic sweep + health polish — добиты остатки неатомарных связок Redis (INCR+EXPIRE, LPUSH+LTRIM) в счётчиках/буферах (cron counters, acquisition buckets, admin outbox, curator notes, broadcast quarantine); `/api/health` переписан и вылечен (SyntaxError/скобки), вывод стабилен даже при Redis degraded.
- STEP245: Cleanup — убраны backward-compat shims, которые содержали non-atomic паттерны (даже как dead-code). В коде используем только атомарные helper’ы из `src/lib/redis.js` и прямые named imports.

- STEP231: Release preflight — добавлен мини‑runbook “Redis TTL smoke check” (без KEYS, через SCAN + TTL), чтобы перед релизом быстро ловить `TTL=-1` на ключах, которые обязаны истекать. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP246: Release preflight — добавлен grep‑gate `lint:redis-atomic`, который запрещает возвращать в runtime‑код неатомарные связки Redis-команд (LPUSH+LTRIM, INCR+EXPIRE, LRANGE+LTRIM) вне `src/lib/redis.js`. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP247: Release preflight — добавлен grep‑gate `lint:public-contacts`, который предотвращает регрессии “утечки контактов через пользовательский текст” в публичных карточках (offer description / storefront about) до unlock. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP248: Release preflight — добавлен gate `lint:redis-exports`, который гарантирует наличие обязательных named exports в `src/lib/redis.js` (`incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim`) и предотвращает падение Vercel на ESM импортах (`does not provide an export named ...`). Дополнительно: в 3 файлах (`bot.js/cron.js/queries.js`) используем namespace import с **atomic/no-op fallback**, чтобы даже при частичном cherry‑pick’е бот не падал на старте. См. `docs/process/10_RELEASE_PREFLIGHT.md`.
- STEP250: Repo sync fix — `src/lib/redis.js` теперь реально экспортирует `incrWithExpireOnFirst`, `incrWithExpire`, `lpushTrim` (Lua/atomic), а `api/qstash/broadcast-deliver.js` больше не использует non-atomic `INCR+EXPIRE` (переведено на helper). Это чинит падение preflight (`lint:redis-exports`, `lint:redis-atomic`) и исключает Vercel build/regression. Также обновлён `docs/02_ACTION_KEYS_REGISTRY.md`, чтобы `npm run preflight` не оставлял “грязный” diff.
- STEP252: Vercel deprecation hardening — убрали использование query‑getter’а в `/api/*` (cron_router + IG OAuth) и перешли на `new URL(...).searchParams` чтобы не ловить Node `[DEP0169] url.parse()`. В `src/db/pool.js` — безопасная инициализация `statement_timeout` без гонки (устраняет warning про concurrent `client.query()`).
- STEP253: Admin DM (свободный текст) hotfix — исправлен crash в обработчике `adm_user_msg_text` (ReferenceError из-за “висящих” переменных) и сделана подстановка placeholders best‑effort, чтобы админ всегда получал предпросмотр/подтверждение и сообщение реально уходило пользователю.
- STEP254: UX-полировка кнопок под админ‑сообщением — унифицировано «✅ Понятно», исправлен ack без “пустого сообщения”, и приведены в консистентный вид кнопки «📋 Открыть меню» / «💬 Поддержка» (включая best‑effort распознавание старых сообщений без `src:admmsg`).
- STEP255: Шаблон текста под админ‑сообщением — добавлен явный блок «Что дальше» (3 пункта) и синхронизирован предпросмотр админа с тем, что увидит пользователь (меньше путаницы, без изменения логики/кнопок).
- STEP256: Admin DM текст-предсказуемость — заголовок «🟦 Сообщение от администратора…» и выбор отправки: стандартно (с блоком «Что дальше») или коротко (без блока), при этом кнопки под квитанцией остаются теми же.
- STEP257: «Поделиться витриной» — ссылка на витрину перенесена в конец текста (коротко/подробно), чтобы URL не светился в превью чата; шаринг использует единый генератор plain текста.
- STEP262: Витрина (предпросмотр) — кнопки разделены на «Действия» (🔗 Поделиться / 📌 IG шаблоны) и «Мои площадки» (канал/Instagram/портфолио) с аккуратной сеткой 2×N; для владельца кнопка канала переименована в «📣 Мои каналы». Шаринг витрины переведён на `t.me/share/url?text=...` (без `url=`) для стабильной работы во всех клиентах.
- STEP232–STEP233: NotebookLM audit (docs‑only) — подготовлен понятный docs‑pack для аудита по текущему состоянию (без кода), добавлены входной индекс и отдельный prompt для docs‑only. См. `docs/audit/05_NOTEBOOKLM_DOCS_ONLY_ENTRYPOINT_2026_03.md`.







26) **Telegram callback_data ≤ 64 bytes:** динамические кнопки могут молча исчезать, если callback_data > 64 байт. Держим callbacks компактными (short ret-коды `bd/ba`, укороченные action keys `a:bms`, `a:ca`, убираем дублирующие параметры). **STEP308:** добавлен auto‑hydration: если `callback_data` всё же превышает лимит, бот заменяет его на короткий `a:h|h:<token>` и сохраняет исходный callback в Redis (`cbh`, TTL по `CB_HYDRATION_TTL_SEC`). При отсутствии токена/Redis — fail‑open: показываем «кнопка устарела» и даём переход в меню.

27) **Broadcast bc_confirm idempotency (Redis degraded):** подтверждение рассылки (`a:bc_confirm`) должно быть безопасно к двойному клику даже при деградации Redis. Используем fail-fast PG advisory xact lock + короткое DB dedup‑окно (без миграций), чтобы не создавать 2 рассылки из одного draft. См. audit report 27.

28) **rateLimit & Redis TTL hardening:** в инфраструктурном `rateLimit()` убран non‑atomic fallback `INCR+EXPIRE` (который может оставлять ключи без TTL). При деградации Redis / EVAL‑ошибках — включается короткий circuit‑breaker и используется best‑effort **in‑memory fallback** (bounded, per‑warm‑instance) вместо unlimited fail‑open; при этом мы по‑прежнему **не создаём** ключи без TTL. ENV (опционально): `RATE_LIMIT_FALLBACK_DEGRADED_MS`, `RATE_LIMIT_FALLBACK_MAX_KEYS`. См. audit report 29.

29) **Payments ledger anti-cascade + users soft-delete:** финансовые таблицы (`stars_payments`, `payments`) **не должны** терять историю при удалении пользователя. `user_id` FK переведены на `ON DELETE RESTRICT`, а вместо физического удаления пользователя используем soft-delete (`users.is_deleted/deleted_at`, опционально `deactivated_at`). См. audit report 31.

30) **Stateless degraded: reset input:** в safe-mode (кнопки `s:*`) добавлена кнопка «🔄 Сбросить ввод». Очистка `expectText/draft` — best-effort: если Redis недоступен, `s:reset_input` показывает предупреждение и не пишет «сброшено». См. audit report 32.

31) **Migration pack sync (preflight gate):** `migration_pack/00_mark_all_applied.sql` авто‑генерируется из `migrations/` (checksum нормализован: LF + `trimEnd`) и теперь проверяется в `npm run preflight` (файл не должен меняться при `npm run gen:migration-pack`). Это предотвращает дрейф pack’а и ложные попытки прогнать уже применённые миграции.

32) **Official publish mini-outbox (QStash):** публикация в @collabka_offers теперь идёт через reserve→enqueue→deliver: операторский клик ставит запись в `PUBLISHING` и ставит задачу в QStash; воркер делает Telegram send/edit и переводит в `ACTIVE` (self-heal verify остаётся страховкой на случай serverless hard-kill). **STEP316:** enqueue/dedup привязан к DB‑reserve (`updated_at`), а при успешном Telegram send/edit и падении на DB‑финализации статус больше не откатываем в `PENDING` — оставляем `PUBLISHING` + Redis breadcrumb + ускоренный verify, чтобы избежать дублей.

33) **PG statement_timeout parameterization:** установка `statement_timeout` теперь делается через `set_config()` с параметром (без интерполяции), с безопасным fallback на `SET/SET LOCAL` при нестандартном поведении pooler’а.

## 1) Платформа и компоненты

### Runtime / hosting
- **Vercel serverless** (stateless функции)
- **Neon Postgres** (дёшево, но бережём CU)
- **Upstash Redis** (locks / краткоживущие состояния / счётчики)
- **QStash / cron** → дергает `/api/cron/*` по расписанию (через `vercel.json` rewrites на единый роутер `api/cron_router.js` — это держит нас в лимите Vercel Hobby по кол-ву функций)

Neon hardening:
- `PG_STATEMENT_TIMEOUT_MS` (default **15000**) — глобальный `statement_timeout` для всех запросов (ставим лениво на connect через **parameterized** `select set_config('statement_timeout', $1, false)`; fallback — `SET statement_timeout TO <ms>`). Для критичных монетизационных транзакций дополнительно используем короткий **transaction-scoped** `select set_config('statement_timeout', $1, true)` (fallback — `SET LOCAL statement_timeout TO <ms>`) как circuit breaker.
- `PG_HEAVY_TX_STATEMENT_TIMEOUT_MS` (optional) — отдельный таймаут для “тяжёлых” транзакций (giveaways draw/finalize). Если не задан, используется `PG_STATEMENT_TIMEOUT_MS`.

### Control Plane (cron endpoints)

> Реализация на Vercel Hobby: один serverless endpoint `api/cron_router.js` + rewrites в `vercel.json` (чтобы не раздувать число функций).
- `/api/cron/giveaways-tick` — закрытие конкурсов → draw winners → публикация → сервисные задачи
- `/api/cron/broadcast-tick` — рассылки: 1 batch за тик (дешевле для Neon)
- Защита: **CRON_SECRET** (Bearer)

---

## 2) Наблюдаемость

### `/api/health`
Возвращает JSON и **не падает**, даже если Redis недоступен (fail-open).

Что показываем:
- `cron.giveaways_tick` и `cron.broadcast_tick`: последний run (ts + summary)
- `audit.throttle`: метрики подавления audit-записей (если включено)
- `broadcast.cooldown`: активная пауза после `429 Too Many Requests` (если есть)
- `qstash.reschedule_failed`: счётчик/последний момент, когда worker не смог enqueue delayed retry (видно где и по какому payload)
- `qstash.official_publish_stuck`: счётчик/последний момент self-heal “публикация зависла” (offer_id + возраст + via)
- `mon.retry`: breadcrumbs по воркеру монетизации (последний запуск ретрая)
- `mon.intro`: breadcrumbs по интро (💬 Написать) — последний attempt/результат
- `mon.accept`: breadcrumbs по ✅ Принять (Brand Inbox) — последний attempt/результат
- `mon.unlock`: breadcrumbs по 🔓 Разлок контактов — последний attempt/результат
- `ref`: лёгкие счётчики источников входа (`/start src_tg` / `/start src_ig`) — today/total
- `ref.by_role`: разрез источника × роли (tg/ig/direct × brand/creator) — today/total


#### Audit throttle counters
Если включён `AUDIT_DB_THROTTLE_ENABLED=true`, то `/api/health` показывает:
- `audit.throttle.suppressed_today_total`
- `audit.throttle.suppressed_today_by_prefix`

Это **Redis-only** счётчики (Neon не трогаем).

#### Acquisition (откуда пришли)
Для трекинга входов используются лёгкие маркеры в ссылках:
- Telegram: `https://t.me/<bot>?start=src_tg`
- Instagram: `https://t.me/<bot>?start=src_ig`

Счётчики видны в `/api/health.ref` (и разрез по роли — в `ref.by_role`) и хранятся **только в Redis**.

Политика TTL:
- `ref:*:d:<YYYYMMDD>` (day buckets) — TTL 60 дней.
- `ref:*:total` (totals) — TTL по умолчанию **365 дней** (bounded memory). Можно отключить TTL и хранить totals “навсегда”: `ACQ_TOTAL_TTL_DAYS=0`.

#### Monetization retry breadcrumbs
После STEP171 воркер `POST /api/qstash/monetization-retry` пишет в Redis “следы” для ops‑наблюдаемости:
- `/api/health.mon.retry.last_at`
- `/api/health.mon.retry.last_action`
- `/api/health.mon.retry.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.retry.last_error` (короткий код причины)

Это помогает быстро увидеть, что QStash‑ретраи реально отрабатывают (и не “молчат”).
Формат short‑code/маскирование/запись ключей централизованы в `src/lib/monDiag.js`.

#### Intro breadcrumbs (💬 Написать)
После STEP179 интро (клик `a:bx_msg` и/или воркер `POST /api/qstash/monetization-retry` с `action=intro_open`) пишет Redis‑breadcrumbs:
- `/api/health.mon.intro.last_at`
- `/api/health.mon.intro.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.intro.last_error` (короткий код)
- `/api/health.mon.intro.last_offer_id` (masked)

Цель: одним взглядом видеть “интро живо / блок (paywall/limit) / ошибка”, не трогая Neon.
Формат short‑code/маскирование/запись ключей централизованы в `src/lib/monDiag.js`.


#### Accept breadcrumbs (✅ Принять)
После STEP183 клики `a:brand_app_accept` и/или воркер `POST /api/qstash/monetization-retry` (action=`brand_app_accept`) пишут Redis‑breadcrumbs:
- `/api/health.mon.accept.last_at`
- `/api/health.mon.accept.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.accept.last_error` (короткий код)
- `/api/health.mon.accept.last_app_id` (masked)
- `/api/health.mon.accept.last_source` (`click` / `worker`)

Цель: одним взглядом видеть “✅ Принять живо / уже в очереди / paywall / ошибка”, не трогая Neon.

#### Unlock breadcrumbs (🔓 Разлок контактов)
После STEP183 клики `a:wsp_contact_unlock` и/или воркер `POST /api/qstash/monetization-retry` (action=`wsp_contact_unlock`) пишут Redis‑breadcrumbs:
- `/api/health.mon.unlock.last_at`
- `/api/health.mon.unlock.last_status` (`ok` / `skipped` / `error`)
- `/api/health.mon.unlock.last_error` (короткий код)
- `/api/health.mon.unlock.last_ws_id` (masked)
- `/api/health.mon.unlock.last_source` (`click` / `worker`)

Цель: быстро видеть “разлок отрабатывает / в очереди / недостаточно кредитов / ошибка”, без DB.

---

## 3) Инварианты безопасности

- Serverless = только пакетная обработка, никаких “вечных” циклов.
- Cron: **Redis token-lock** (safe unlock) + где критично **PG advisory lock** + SQL guards на статусных переходах.
- Winners draw: детерминированно/воспроизводимо, guards по статусам (`winners_drawn_at`, транзакции). Seed считается по **отсортированным eligible user ids** (order‑independent). В audit (`gw.winners_drawn`) пишем версии алгоритма/seed + `ends_at_iso_used` + `pool_hash` + `winners_hash` (repro pack).
- Миграции: только `migrations/run.js` (exactly-once + checksum). Checksum считается по **нормализованному SQL** (LF + `trimEnd`) для устойчивости к CRLF/LF и «финальному переводу строки», при этом раннер совместим со старыми checksum значениями.
- Migration pack (Neon move/emergency): `migration_pack/00_mark_all_applied.sql` обновлён под миграции до `041_*.sql`; `migration_pack/01_reconcile.sql` расширен как safety‑net. Pack‑файлы **не** дублируем в `migrations/`.
- STEP163: добавлен генератор `npm run gen:migration-pack` (скрипт `scripts/gen-mark-all-applied.js`) — пересчитывает sha256 из `migrations/` и обновляет `migration_pack/00_mark_all_applied.sql` детерминированно.
- Горячие UI-пути: **не добавлять DB-запросы** в рендер меню/кнопок без сильного обоснования.

---

## 4) Ключевые продуктовые зоны

### A0) Discovery surfaces: витрина / лента / каталог (STEP157 docs-only)
Это не одна ‘инста-лента’. В боте есть 3 разные поверхности просмотра:
- **Витрина креатора** — публичная карточка *одного* профиля (workspace), открывается по ссылке/из ленты/из поиска.
- **Лента креаторов для брендов** — feed из **офферов/карточек креаторов**, а не из профилей подряд.
- **Каталог брендов для креаторов** — feed брендов, обычно только с заполненным профилем (4/4).

UX guardrail:
- В режиме **Creator** в меню `🎬 UGC / Офферы` **не показываем** кнопку `📰 Лента креаторов` (это Brand‑режим). Бренды открывают ленту через `🏷 Для брендов` / Brand меню.

Производительность/UX:
- Лента: пагинация `limit/offset` + кнопки `⬅️/➡️`.
- Каталог: `PAGE_SIZE+1` без тяжёлого `COUNT(*)`.

Подробно: `docs/31_FEEDS_VITRINES_CATALOGS.md`.

Публичное объяснение (для постов/FAQ): `docs/public/11_feeds_and_discovery_ru.md`.

### A) Brand Team UX V4
Принцип: **кнопка видна всегда**, доступ гейтится *внутри* фичи, есть “Почему так?” и корректный back через `ret`.
Подробно: `docs/14_BRAND_TEAM_UX_V4.md`.


### A1) Brand Pass / credits balance — Redis-only UI (STEP153–155)
Политика: в **горячих экранах** баланс кредитов **не читаем из DB**. Показываем только то, что есть в Redis:
- Brand Inbox (карточка заявки `status=new`)
- Публичная витрина креатора (`renderWsPublicProfile`)
- Диалог по заявке бренда (`renderBrandLeadDialog`)
- Brand hub (`bx_open`, `ws=0`)

Если Redis‑кеша нет → показываем `💳 Кредиты: —` (и CTA на покупку/операцию), **без** fallback в Neon.

Redis keys:
- `brand_credits:<brandUserId>` — short TTL (`BRAND_CREDITS_CACHE_TTL_SEC`, default **60s**)
- `brand_credits_snap:<brandUserId>` — snapshot для гидрации (`BRAND_CREDITS_SNAP_TTL_SEC`, default **90d**)

Прогрев/гидрация:
- на входе в hub используем `getBrandCreditsRedisOnly({ warm:true })` → продлевает TTL и обновляет snapshot
- если короткий ключ пуст — гидратим из `brand_credits_snap:*` (всё ещё Redis‑only)

Обновление кеша (best‑effort):
- после мутаций кредитов (покупка/accept/unlock/интро) вызываем `setBrandCreditsCache(brandUserId, newBalance)`

STEP166 (P0): **монетизация не должна “умирать” из‑за Redis/прочерка**.
- CTA **✅ Принять** и **🔓 Разлок контактов** показываем всегда (даже если баланс = `—`).
- Проверка баланса/списание — **только на клике** (DB truth + idempotency).
- В реестре действий `src/bot/actionRegistry.js` `a:brand_app_accept` не требует Redis (иначе accept блокируется при деградации Redis).

STEP167 (P0): **anti-ORPHANED платежи + буфер против гонок cron**.
- Auto-heal ORPHANED `missing_session` теперь **не трогает** слишком свежие платежи (по умолчанию ~5 минут).
- ENV: `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC` (0..3600, default 300).
- UX при `missing_session`: если auto-heal включён, бот сообщает, что попробует применить оплату автоматически в течение ~N минут.

STEP171 (P0): **Monetization circuit breaker** (Neon slow → без таймаутов в UI)
- Для критичных списаний (✅ Принять / 🔓 Разлок контактов) ставим короткий timeout на DB‑операции.
- Если Neon отвечает медленно → показываем «⏳ В обработке…» и ставим безопасный ретрай в QStash: `POST /api/qstash/monetization-retry`.
- Ретрай идемпотентен: exact‑once списание держим на уровне SQL guards / advisory lock.
- ENV:
  - `MONETIZATION_CB_TIMEOUT_MS` (default 2000)
  - `MONETIZATION_QSTASH_DELAY_SEC` (default 10)
  - `MONETIZATION_NOTIFY_TTL_SEC` (default 90d)



STEP174 (P0/P1): **Optimistic accept/unlock** (queue‑first + token‑lock)
- Если QStash retry настроен, то критичные списания (✅ Принять / 🔓 Разлок контактов) выполняются **через очередь**, без ожидания синхронного DB‑write.
- На клике берём **Redis token‑lock** (safe lock) на ~10 минут и публикуем задачу в QStash (dedup). UI сразу показывает «⏳ В обработке…» + кнопку обновления.
- Воркер `POST /api/qstash/monetization-retry` выполняет DB‑truth мутацию идемпотентно, обновляет Redis кеши и **best‑effort** освобождает token‑lock (или он сам истечёт по TTL).
- Fail‑open: если Redis недоступен или QStash не настроен — остаётся прежний синхронный путь (и STEP171 circuit breaker на таймауты).

ENV:
- `MONETIZATION_TOKEN_LOCK_TTL_SEC` (default **600**, min 60, max 3600) — TTL token‑lock для “optimistic queue‑first”.


STEP175 (P1): **UI anti-spam по token‑lock** (Redis-only)
- Пока активен monetization token‑lock, **скрываем кнопки списания** в UI и показываем “pending”:
  - Brand Inbox карточка заявки (`status=new`): скрываем **✅ Принять**, показываем «⏳ …в обработке» + «🔄 Обновить».
  - Витрина (locked contacts): скрываем CTA на разлок контактов, показываем «⏳ …в обработке» + «🔄 Обновить».
  - Экран разлока (`a:wsp_contact_req`): если разлок уже в очереди — не показываем кнопку списания повторно.
- Реализация: **только Redis GET** по ключам `mon:lock:*` (без DB‑чтений в этих рендерах).


STEP176 (P0/P1): **Intro open hardening** (token-lock + circuit breaker + optional QStash commit)
- Клик «💬 Написать» (это интро = открытие нового диалога) защищён от дублей и зависаний:
  - берём Redis token‑lock `mon:lock:intro_open:<offerId>:<buyerUserId>` (TTL ~10м)
  - быстрый sync‑путь остаётся (как раньше), но при транзиентных ошибках/timeout → «⏳ В обработке…»
- При медленном Neon задача ставится в QStash (`action=intro_open` → `POST /api/qstash/monetization-retry`, dedup).
  Воркер открывает диалог/списывает кредиты идемпотентно и шлёт Telegram‑уведомление с кнопкой “Открыть диалог”.
- UI anti‑spam: пока token‑lock активен, в `renderBxPublicView` скрываем «💬 Написать» и показываем “pending” + кнопки “Inbox/Обновить” (Redis‑only, без DB).


STEP177 (P0/P1): **Intro fail-open guard (Redis degraded safe)**
- Действие `a:bx_msg` (клик «💬 Написать») переведено на fail-open guard (без fail-closed блокировок на входе), чтобы при деградации Redis кнопка не становилась “мёртвой”.
- При недоступном Redis продолжаем работать через короткий DB timeout (circuit breaker) и/или QStash retry (dedup), показывая пользователю понятный pending UI.


STEP178 (P0): **Intro DB exact-once guard (advisory lock)**
- В `getOrCreateBarterThreadWithCredits()` добавлен `pg_advisory_xact_lock` по паре `(offer_id, buyer_user_id)` + повторная проверка существующего треда после lock.
- Цель: исключить гонки/дубли при двойном клике и параллельных вызовах (sync + QStash), а также убрать ложные ответы типа “paywall/limit” если тред уже создан другим запросом.


STEP180 (P1): **Monetization diagnostics helper** (`src/lib/monDiag.js`)
- Централизовали утилиты: short‑code, маскирование id, запись Redis breadcrumbs (`mon.retry`, `mon.intro`).
- Цель: убрать дублирование и исключить дрейф форматов/ключей/TTL, без изменения продуктовой логики.

STEP181 (P1): **Pending UX standardization (Redis-only)**
- Привели “pending” состояния к одному стандарту в ключевых монетизационных кликах:
  - ✅ Принять (Brand Inbox)
  - 🔓 Разлок контактов (витрина / экран разлока)
  - 💬 Интро (Написать)
- Везде быстрые кнопки: **📥 Inbox + 🔄 Обновить** (и **💳 Купить ещё** там, где уместно).
- В рендерах pending используем только **Redis token‑lock / breadcrumbs** (без DB‑чтений в UI).




### A2) Unified navigation footer (STEP160)
Во всех экранах (кроме корневых меню и safety-mode `s:*`) используется единый footer‑ряд:
- **⬅️ Назад** — возврат в предыдущий экран (return-to)
- **📋 Меню** — хаб текущей роли (Creator/Brand)
- **🏠 Home** — home-hub (переключение ролей/быстрый старт)

Технически: helper’ы `navKb(backCb)` и `kbNavRow(kb, backCb)` в `src/bot/bot.js`.
Цель: убрать путаницу “⬅️ Меню” и исключить тупики/скачки навигации (в т.ч. в админских экранах, PRO/папках, Brand Team, поиске креаторов, шагах розыгрыша).

#### A2.1) Авто‑проверка консистентности footer’ов (STEP161)
Чтобы футеры больше не “расползались”, добавлен маленький линтер без зависимостей:
- `scripts/lint-footer-nav.js`
- запуск: `npm run lint:nav`

Что проверяет (эвристика): если клавиатура содержит back‑кнопку (`⬅️ Назад/Отмена/Админка/Операции/Коммуникации/Система`), то рядом обязаны быть **и** `📋 Меню`, **и** `🏠 Home` (или используется `navKb/kbNavRow/kbAdminFooter`).

Опционально для жёсткого аудита: `NAVLINT_STRICT=1 npm run lint:nav` — начнёт требовать `📋 Меню + 🏠 Home` даже для клавиатур, где есть back‑кнопка, но Menu/Home не планировались.


### B) Broadcast (рассылки)
Состояние (актуально):
- Тик может запускаться по расписанию (обычно 1 раз/час) или вручную (QStash “Run it manually”).
- Поддержка контента:
  - текст (включая “ссылку в слово”: Telegram entities → HTML)
  - фото / видео / GIF / документ (подпись — по желанию)
  - альбомы не поддерживаются (одно сообщение = один пост)
- Кнопки:
  - до **3** URL-кнопок, формат ввода: `Название | ссылка` (по строке)
  - поддержка shortcuts: `gw_123`, `bp_45`, `offer_777` → deep link `https://t.me/<bot>?start=...`
  - UI-пресеты на шаге “Кнопки”: 🎁 Конкурс / 🏷 Профиль / 🎬 Оффер
- Финальное сообщение “✅ Рассылка завершена” теперь **с кнопками** (нет тупика UX).

Надёжность / rate-limit:
- На `429 Too Many Requests` получатель **не теряется** и рассылка **не залипает** на одном uid:
  - пишем в DB `broadcast_sent_log.status='deferred'` + `retry_after_until`
  - двигаем scan-курсор вперёд (чтобы один “тяжёлый” получатель не стопорил весь батч)
  - deferred получатели догоняются позже, когда `retry_after_until <= now()`
- Если один и тот же получатель ловит `429` **N раз подряд**, включаем **quarantine**:
  - DB: `broadcast_sent_log.status='quarantined'`
  - `retry_after_until` продлевается на `BROADCAST_QUARANTINE_SEC`
  - порог: `BROADCAST_QUARANTINE_THRESHOLD`

- Ставим **cooldown** на `retry_after`:
  - fast path (Redis):
    - per-broadcast: `broadcast:<id>:cooldown_until`
    - global: `broadcast:cooldown_until` + `broadcast:cooldown_broadcast_id` (early-exit без DB polling)
  - fallback fuse (DB, только если Redis недоступен):
    - `broadcasts.cooldown_until`, `broadcasts.cooldown_reason`
- Пока cooldown активен:
  - обычно `broadcast_tick` делает `skip` **без обращения к Neon** (Redis-global)
  - при деградации Redis — `skip` после одного лёгкого `getActiveBroadcast` (без polling recipients)
- Cooldown и счётчики видны в `/api/health` → `broadcast`.
- В `/api/health` counters: `cooldown_set/cooldown_skip/defer_set/defer_wait/quarantine_set`.

Ключевые файлы:
- `src/bot/cron.js` — отправка и финальное сообщение
- `src/bot/bot.js` — wizard рассылок + шаблоны кнопок
- `src/bot/helpers.js` — `telegramEntitiesToHtml()`, `parseStartPayload()` (bp_/offer_)

Опционально (P3, расширение поверхности):
- QStash fan-out доставка (serverless-safe): cron только энкьюит задачи, доставляет воркер `POST /api/qstash/broadcast-deliver`.
- Воркер fan-out при 429:
  - **не помечает non-retryable** (получатели не “теряются”)
  - пишет `deferred/quarantined` и **сам перепубликует job** с `delaySec`
  - проверяет Redis cooldown **до DB reads** (защита Neon от лавины)
  - micro-memo: `QSTASH_BC_COOLDOWN_MEMO_TTL_MS`
- Runtime toggle (Redis): `sys:broadcast_qstash_fanout` (по умолчанию OFF).
- Setup/rollout: `docs/10_QSTASH_RUNBOOK.md`.
- Admin self-check: 👑 Админка → 🛰 QStash статус → 🧪 Send signed ping (endpoint `POST /api/qstash/ping`).
- Структура 👑 Админки (STEP200): 3 экрана — 🧰 Операции / 💬 Коммуникации / ⚙️ Система (только UX, без смены логики).
- Admin UX Standard (STEP201): `docs/process/09_ADMIN_UX_STANDARD.md` — правила футеров/названий/рядов кнопок + фиксы консистентности по админ‑экранам.
- Навигация: на экране “🛰 QStash статус” кнопка “⬅️ Система” ведёт в 👑 Админка → ⚙️ Система, “📋 Меню” — в пользовательское меню.

### C) HomeHub / ui_mode и Role Gate
- `ui_mode` хранится в Redis (`brand` / `creator`).
- `/start`:
  - если есть payload (deep link) → payload **в приоритете**, gate не мешает
  - если payload нет и `ui_mode` не установлен → короткая развилка (Бренд/Креатор), затем редирект в HomeHub
  - Redis недоступен → fail-open, всё как раньше
- STEP408: source-level smoke/preflight отдельно фиксирует этот контракт: `parseStartPayload`, порядок payload→gate→HomeHub, отсутствие лишних DB-read в `/start`, fail-open `setUiMode`, а также очистку brand-manager overlay при `a:home_mode` / `a:ui_mode_set`.


### D) Official channel publish (@collabka_offers)
Используется для публикации офферов/анонсов в официальный канал.

Защита от дублей (idempotency):
- **Redis token-lock per offer** `lock:official:<offerId>` (TTL ~180s) — не даёт параллельным кликам/ретраям постить одно и то же.
- **DB-reserve до отправки**: `official_posts.status='PUBLISHING'` (stale rescue ~10 минут) — гарантирует единственность даже при деградации Redis.
- После успешной отправки сохраняем `message_id` и переводим статус в `ACTIVE`.

Оперативные действия при проблемах/дублях: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.

### E) Instagram (OAuth) — временно выключено

План был: **OAuth-only** (без комментариев/кодов), где:
- **Verified badge** = trust-signal (можно показывать до unlock)
- **@handle/ссылка** = контакт и выдаётся только **после unlock**

Но на практике Meta начала возвращать `pages=0` и местами блокировать доступ к Pages/приложению.
Чтобы не ломать UX, не тратить время на нестабильный контур и уложиться в лимит **Vercel Hobby ≤12 serverless functions**, мы:
- **скрыли кнопку IG подключения в профиле** (пользователь видит “функция пока недоступна”)
- **оставили миграции/доки/контекст**, чтобы вернуться позже,
- **убрали `api/ig/oauth/*` из deploy surface** (в baseline STEP383 этих entrypoint-ов физически нет),
- оставили ENV-флаги (`IG_OAUTH_*`, `IG_ROUTES_ENABLED`) как legacy guardrails/документацию на случай будущего возврата.

Доки:
- Runbook: `docs/22_IG_GRAPH_OAUTH_2026.md`
- Пост‑мортем + план возврата: `docs/23_IG_CONNECT_WORKLOG_AND_RESUME.md`
- Спека: `docs/spec/24_IG_INTEGRATION_SPEC.md`

---

## 5) ENV (важные флаги)

- `ANALYTICS_ENABLED=false` — держим выключенным (меньше DB-write в `events`).

### Базовые обязательные (чтобы бот вообще запустился)

- `BOT_TOKEN` — токен Telegram-бота.
- `BOT_USERNAME` — username бота (без @).
- `DATABASE_URL` — Neon Postgres.
- `REDIS_URL` — Upstash Redis (locks, counters, сессии).
- `SUPER_ADMIN_TG_IDS` — список TG ID админов (через запятую).
- `CRON_SECRET` — секрет для вызова `/api/cron/*` (Bearer).

> Если используешь поддержку через группу: задай `SUPPORT_CHAT_ID` и **сделай бота админом** в этой группе, иначе он не увидит reply-сообщения.

### ENV: полный список (`src/lib/config.js` + доп. env в `src/bot/bot.js`)

Ниже перечислены **все** переменные окружения, которые читает проект через `src/lib/config.js`.
Дефолты и парсинг см. в коде (это источник истины).

> Примечание: `CONTACT_UNLOCK_COST`, `CONTACT_UNLOCK_TTL_DAYS`, `BRAND_CREDITS_CACHE_TTL_SEC`, `BRAND_CREDITS_SNAP_TTL_SEC`, `BRAND_APP_ACCEPT_COST` читаются напрямую в `src/bot/bot.js` (не через `CFG`).

Instagram (текущий режим: **только ссылка в карточке**, OAuth/верификация выключены):
- `IG_OAUTH_UI_ENABLED=0` — прячет UI подключения. В baseline STEP383 OAuth API ещё и физически убран из deploy surface.
- `IG_OAUTH_ENABLED=0` — OAuth не стартует даже при случайном доступе к UI.
- `IG_ROUTES_ENABLED=0` — kill‑switch: закрывает весь `/api/ig/*` и IG cron.
- `IG_VERIFY_TICK_ENABLED=0` — выключает legacy verify‑cron по комментариям.
- `IG_OAUTH_CLIENT_ID/SECRET`, `IG_VERIFY_ACCESS_TOKEN`, `IG_VERIFY_MEDIA_ID` — можно оставить пустыми, пока UI скрыт.
- `IG_TOKEN_ENC_KEY` — <b>строгий</b>: только <code>hex64</code> (32 bytes) или <code>base64/base64url</code> (>=32 bytes). Если включишь IG OAuth (UI+routes) без валидного ключа — OAuth будет заблокирован как misconfigured.
> Instagram как ссылка/поле профиля остаётся; показывается брендам только после unlock (контакты скрыты до оплаты). OAuth API в baseline STEP383 не деплоится.


- **BOT**: `BOT_ID` `BOT_TOKEN` `BOT_USERNAME` `BOT_VARIANT`
- **APP**: `APP_ENV`
- **DATABASE**: `DATABASE_URL`
- **UPSTASH**: `UPSTASH_REDIS_REST_TOKEN` `UPSTASH_REDIS_REST_URL`
- **CRON**: `CRON_SECRET`
- **SUPER**: `SUPER_ADMIN_TG_IDS`
- **SUPPORT**: `SUPPORT_CHAT_ID`
- **OPS**: `OPS_ALERT_BUFFER_MAX` `OPS_ALERT_SILENT` `OPS_ALERT_SUMMARY_MIN`
- **PAYMENT**: `PAYMENT_SESSION_TTL_MIN`
- **CONTACTS**: `CONTACT_UNLOCK_COST` `CONTACT_UNLOCK_TTL_DAYS` `BRAND_CREDITS_CACHE_TTL_SEC` `BRAND_CREDITS_SNAP_TTL_SEC`
- **PAYMENTS**: `PAYMENTS_ACCEPT_DEFAULT` `PAYMENTS_AUTO_APPLY_DEFAULT` `PAYMENTS_FALLBACK_APPLY_ENABLED` `PAYMENTS_PAYLOAD_HMAC_KEY` `PAYMENTS_PAYLOAD_HMAC_LEN` `PAYMENTS_FALLBACK_ALLOW_UNSIGNED` `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED` `PAYMENTS_ORPHANED_AUTOHEAL_BATCH` `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC`
- **FOUNDER**: `FOUNDER_BRAND_12M_CREDITS` `FOUNDER_BRAND_12M_PRICE` `FOUNDER_BRAND_3M_CREDITS` `FOUNDER_BRAND_3M_PRICE` `FOUNDER_CREATOR_12M_PRICE` `FOUNDER_SALE_DEADLINE` `FOUNDER_SALE_ENABLED`
- **INTRO**: `INTRO_COST_PER_INTRO` `INTRO_DAILY_LIMIT` `INTRO_DAILY_LIMIT_UNVERIFIED` `INTRO_RATE_LIMIT` `INTRO_RATE_WINDOW_SEC` `INTRO_RETRY_AFTER_HOURS` `INTRO_RETRY_ENABLED` `INTRO_RETRY_EXPIRES_DAYS` `INTRO_RETRY_NOTIFY` `INTRO_TRIAL_CREDITS`
- **AUDIT**: `AUDIT_DB_ENABLED` `AUDIT_DB_THROTTLE_ENABLED` `AUDIT_DB_THROTTLE_LIMIT` `AUDIT_DB_THROTTLE_PREFIXES` `AUDIT_DB_THROTTLE_WINDOW_SEC` `AUDIT_BUFFER_ENABLED` `AUDIT_BUFFER_ON_DB_ERROR` `AUDIT_BUFFER_MAX_LEN` `AUDIT_BUFFER_TTL_SEC` `AUDIT_BUFFER_FLUSH_BATCH` `AUDIT_BUFFER_FLUSH_MAX_MS` `AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC` `AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC` `AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC`
- **BRAND**:
  - `BRAND_BANNER_FILE_ID` `BRAND_LEAD_RATE_LIMIT` `BRAND_LEAD_RATE_WINDOW_SEC` `BRAND_PLAN_BASIC_PRICE` `BRAND_PLAN_DURATION_DAYS` `BRAND_PLAN_MAX_PRICE` `BRAND_PLAN_PRO_CREDITS` `BRAND_PLAN_PRO_FEATURED_DAYS` `BRAND_PLAN_PRO_MATCH` `BRAND_PLAN_PRO_PRICE`
  - `BRAND_PLAN_START_CREDITS` `BRAND_PLAN_START_PRICE` `BRAND_PROFILE_REQUIRED` `BRAND_TOPUP_L_CREDITS` `BRAND_TOPUP_L_PRICE` `BRAND_TOPUP_M_CREDITS` `BRAND_TOPUP_M_PRICE` `BRAND_TOPUP_S_CREDITS` `BRAND_TOPUP_S_PRICE` `BRAND_VERIFY_REQUIRES_EXTENDED`
- **CREATOR**: `CREATOR_BRAND_APPLY_DAILY_LIMIT` `CREATOR_BRAND_APPLY_DAILY_WINDOW_SEC` `CREATOR_BRAND_APPLY_RATE_LIMIT` `CREATOR_BRAND_APPLY_RATE_WINDOW_SEC`
- **MATCH**: `MATCH_FEAT_AUTO_APPLY_ENABLED` `MATCH_L_COUNT` `MATCH_L_PRICE` `MATCH_M_COUNT` `MATCH_M_PRICE` `MATCH_S_COUNT` `MATCH_S_PRICE`
- **BARTER**: `BARTER_BUMP_COOLDOWN_HOURS` `BARTER_BUMP_COOLDOWN_HOURS_FREE` `BARTER_BUMP_COOLDOWN_HOURS_PRO` `BARTER_FEED_PAGE_SIZE` `BARTER_INBOX_PAGE_SIZE` `BARTER_MAX_ACTIVE_OFFERS_FREE` `BARTER_MAX_ACTIVE_OFFERS_PRO`
- **GIVEAWAY**: `GIVEAWAY_BANNER_FILE_ID` `GIVEAWAY_NOTIFY_CHANNEL_ON_END` `GIVEAWAY_NOTIFY_CHANNEL_ON_WINNERS` `GIVEAWAY_NOTIFY_OWNER_ON_END` `GIVEAWAY_NOTIFY_OWNER_ON_WINNERS` `GIVEAWAY_SPONSORS_MAX_FREE` `GIVEAWAY_SPONSORS_MAX_PRO`
- **BX**: `BX_MSG_RATE_LIMIT` `BX_MSG_RATE_WINDOW_SEC`
- **RATE**: `RATE_LIMIT_ENABLED`
- **WEBHOOK**: `WEBHOOK_SECRET_TOKEN`
- **ANALYTICS**: `ANALYTICS_ENABLED`
- **BANNER**: `BANNER_COOLDOWN_HOURS`
- **FEATURED**: `FEATURED_1D_PRICE` `FEATURED_30D_PRICE` `FEATURED_7D_PRICE` `FEATURED_MAX_SLOTS`
- **GUIDE**: `GUIDE_BANNER_FILE_ID`
- **MENU**: `MENU_BANNER_FILE_ID`
- **OFFICIAL**: `OFFICIAL_1D_PRICE` `OFFICIAL_30D_PRICE` `OFFICIAL_7D_PRICE` `OFFICIAL_CHANNEL_ID` `OFFICIAL_CHANNEL_USERNAME` `OFFICIAL_MANUAL_DEFAULT_DAYS` `OFFICIAL_PUBLISH_ENABLED` `OFFICIAL_PUBLISH_MODE` `OFFICIAL_PUBLISH_SELFHEAL_DELAY_SEC` `OFFICIAL_PUBLISH_SELFHEAL_MIN_AGE_SEC` `OFFICIAL_PUBLISH_SELFHEAL_MSGID_TTL_SEC`
- **ONBOARDING**: `ONBOARDING_V2_ENABLED`
- **PAY**: `PAY_SUPPORT_TEXT`
- **PRO**: `PRO_DURATION_DAYS` `PRO_PAYMENT_URL` `PRO_STARS_PRICE`
- **TG**: `TG_ACCESS_CHECK_CONCURRENCY`
- **VERIFICATION**: `VERIFICATION_ENABLED`
- **WORKSPACE**: `WORKSPACE_CURATORS_MAX_FREE` `WORKSPACE_CURATORS_MAX_PRO` `WORKSPACE_EDITOR_INVITE_TTL_MIN` `WORKSPACE_FOLDER_MAX_ITEMS_FREE` `WORKSPACE_FOLDER_MAX_ITEMS_PRO`


### Intro trial (для брендов)
- `INTRO_TRIAL_CREDITS=3` — разовый тест-бонус: **3** кредита на первые интро (чтобы бренду было проще попробовать). Для выключения: `INTRO_TRIAL_CREDITS=0`.


### Brand Pass: защита монетизации (контакты/ссылки)
- Витрина креатора для бренда по умолчанию показывает **без контактов**: канал / IG / портфолио скрыты до «🔓 Контакты».
- В свободном тексте профиля (описание) до unlock **редактируются** паттерны `@...`, `t.me/...`, `http(s)://...`, email, **телефоны (в цифрах и словами)** → показывается «🔒 … скрыто». Подробно: `docs/20_CONTACTS_MODEL.md`.
- После списания «🔓 Контакты» бренд видит полный **контакт‑пакет** (TG/IG/портфолио) + кнопки.
- STEP353: 🔓 Разлок контактов **не списывает** кредиты, если контакт‑пакет реально пуст (нет TG/канала/IG/портфолио/структурных полей) — показываем подсказку «контактов пока нет».
- STEP105 (P2 roadmap старт): добавлен контейнер **структурированных контактов** `workspace_settings.profile_contacts` (JSONB).
- Приоритет отображения после unlock: **структурные контакты → (если пусто) контакт (текстом)**.
  - На этом шаге это **read-only**: если поле заполнено — оно показывается **только после unlock**.
  - Legacy поля (`profile_contact`, `profile_ig`, `profile_portfolio_urls`) продолжают работать и используются, если `profile_contacts` пуст.
- Защита от повторного списания при деградации Redis: unlock фиксируется в DB (`brand_contact_unlocks.unlocked_until`), Redis остаётся как кеш/UX.
- STEP106: добавлен opt-in UI для креатора: «📇 Контакты (структурно)» в профиле. Ввод валидируется/нормализуется на входе и сохраняется в `profile_contacts`.
  - UX правило: достаточно **1** контакта (обычно Telegram). Email/Website — опционально. Phone — не обязателен.
- STEP107 (опционально): добавлена кнопка «✨ Перенести из «Контакт»» — переносит **одно** значение из `profile_contact` в `profile_contacts` (tg/email/phone/site) только если распознавание однозначное. Никакой авто-магии и без перетирания уже заполненных полей.
- STEP119: усилен anti‑bypass для телефонов в свободном тексте — маскируем номера, написанные **словами** (например: «плюс семь девять…»).
- STEP120: broadcast 429 cooldown: добавлен DB fuse `broadcasts.cooldown_until` на случай деградации Redis (без polling recipients).
- Баланс кредитов для Brand UI берём **Redis-first** (TTL ~60s, `BRAND_CREDITS_CACHE_TTL_SEC`) → меньше чтений Neon.

#### Brand Inbox (заявки креаторов → бренду)
- В карточке заявки кнопка **✅ Принять** — точка монетизации: открывает диалог и **списывает кредиты Brand Pass** (env: `BRAND_APP_ACCEPT_COST`, по умолчанию 1).
- До принятия (status=new) **нельзя** ответить/отправить шаблон (нельзя “обойти” списание). После принятия доступны «✍️ Ответить» и «⚡ Шаблоны».
- До ✅ Принять (status=new) скрываем ‘💬 В работу / ✅ Закрыть’ — чтобы не было сценария ‘переместил и потерял’. Доступны только: ✅ Принять, ⛔ Спам, 🗑 Удалить.
- В статусе `new` рядом с подсказкой показываем **баланс кредитов** (Redis‑only, без DB fallback). Если кэша нет — показываем «—» и предлагаем открыть Brand Pass.
- Кнопка креатора «💬 Написать бренду» открывает экран отправки сообщения. Если кеш/сессии временно недоступны — показываем понятное сообщение и кнопку «📨 Открыть заявку» (без ‘тишины’).



#### Creator → Каталог брендов (заявка бренду)
- Нажатие «✍️ Написать заявку» включает **режим ввода** (expectText) и показывает явный баннер «Режим ввода включён».
- Есть кнопка «❌ Отмена ввода» (сбрасывает только режим ввода, черновик не удаляет).


#### Giveaways (розыгрыши)
- «🎁 Розыгрыши → ➕ Новый розыгрыш» требует активный подключённый канал (витрину).
- Если `active_ws` устарел/канал недоступен — показываем **gate‑экран** с понятными CTA (подключить/выбрать канал) и корректным back; stale `active_ws` чистим в Redis.
- Draw winners (cron): детерминированная выборка победителей в SQL по seed (`giveawayId:endsAtIso`).
- Atomic draw выполняется в транзакции **REPEATABLE READ** (фиксированный snapshot пула участников) + `pg_try_advisory_xact_lock(giveawayId)` + `FOR UPDATE` на `giveaways`.
- В `giveaway_audit` пишем метаданные воспроизводимости: `tx_isolation`, `snapshot_ts` (UTC), `pool_hash/pool_count` и `pool_cutoff_joined_at`.

### Founder Sale (promo)
- `FOUNDER_SALE_ENABLED=true|false`
- `FOUNDER_SALE_DEADLINE=2026-03-01T23:59:59+03:00` (МСК).

> Примечание: на UI дедлайн форматируется как «1 марта 23:59 (МСК)». Если задашь `...Z`, на UI покажется время в МСК (сдвинутое), что корректно, но может удивить.
- `FOUNDER_BRAND_3M_PRICE=1999`, `FOUNDER_BRAND_12M_PRICE=4999`, `FOUNDER_CREATOR_12M_PRICE=2499`
- `FOUNDER_BRAND_3M_CREDITS=100`, `FOUNDER_BRAND_12M_CREDITS=200`

**Runtime управление из админки (без деплоя):**
- `👑 Админка → 🔥 Founder Sale` — включает/выключает и позволяет менять дедлайн/цены/кредиты.
- Значения хранятся в Redis (override), при отсутствии override используются ENV.
- «Сброс к ENV» удаляет override и возвращает поведение к переменным окружения.

Рекомендация для прода: в ENV держать `FOUNDER_SALE_ENABLED=false`, а включать через админку (Redis override). Это защищает от случайного “sale ON” при деградации Redis.

**Deep-link для маркетинга:**
- `https://t.me/<BOT_USERNAME>?start=fs_<tag>` → сразу открывает экран Founder Sale (пример: `fs_offers_a`, `fs_offers_b`, `fs_gw_brand`, `fs_gw_creator`).
- Эти ссылки сохраняются при пересылке постов, поэтому их всегда дублируем в тексте.


### Audit DB throttling
- `AUDIT_DB_THROTTLE_ENABLED=true|false`
- `AUDIT_DB_THROTTLE_LIMIT`, `AUDIT_DB_THROTTLE_WINDOW_SEC`
- `AUDIT_DB_THROTTLE_PREFIXES` — какие audit-события считаем шумными.
  - Default (guardrail): `lead.,folders.,ws.profile_,deal.,inbox.`
  - Можно расширять точечно после метрик в `/api/health`
- Поведение при деградации Redis: для событий, попавших под throttle-prefix, аудит **fail-closed** (просто дропаем запись), чтобы не “сжечь” Neon лишними INSERT.

Подробный план и готовые профили: `docs/18_NEON_COST_SAVING_AUDIT_THROTTLE.md`.

---

## 6) Быстрый smoke (после деплоя)

1) `/api/health` отдаёт `ok:true`, есть `cron.*`.
2) Если включён audit throttle → `audit.throttle.suppressed_*` не ломает ответ.
3) Brand BX menu → “👔 Менеджеры бренда” видна, gate корректен, back через `ret` работает.
4) Broadcast:
   - создать тест-рассылку с 1 URL-кнопкой и deep-link shortcut
   - запустить tick вручную
   - убедиться: финальное сообщение “завершена” с кнопками.
5) Role gate:
   - новый юзер `/start` без payload → видит развилку
   - deep link `/start gw_...` работает напрямую.

---

## 7) Короткий список изменений за текущую сессию (для handoff)


### Последние критичные изменения (2026-03-01)
- **Instagram OAuth/верификация выведены из активного baseline**: сейчас Instagram — только ссылка в карточке креатора, без OAuth. В STEP383 `api/ig/oauth/*` убраны из deploy surface, чтобы не тратить serverless-function budget на Hobby. Legacy ENV для полной заморозки: `IG_OAUTH_UI_ENABLED=0`, `IG_OAUTH_ENABLED=0`, `IG_ROUTES_ENABLED=0`, `IG_VERIFY_TICK_ENABLED=0`.
- **Ручная верификация — единственная активная** (заявка → очередь модерации → approve/reject). ✅-бейдж — внутри бота (не Telegram-эмоджи) и влияет на UX/лимиты.
- **Admin → User сообщения (DM) приведены к канону “квитанция без тупиков”**: `🏠 Главное меню` / `💬 Поддержка` всегда остаются, `✅ Принято` убирает только себя.
- **Audit hardening:** SSL verify для Neon, rate limiter атомарный Lua (fail-open при деградации), ops alerts атомарный Lua.
- **Ops digest расширен (STEP339):** буферим дорогие сбои (PG pool/statement_timeout, cron_router crash, QStash broadcast-deliver crash) → один дайджест в OPS без спама.
- **Audit flush lossless:** очередь `audit:*` теперь двухфазная `queue → inflight → ack` с auto‑requeue при “залипании”.
- **Финальный sweep Redis TTL:** убраны остатки неатомарных связок (`INCR+EXPIRE`, `LPUSH+LTRIM`) и добавлен preflight “Redis TTL smoke check” (docs/process/10_RELEASE_PREFLIGHT.md).

- `/api/health`: cron last_run + безопасные Redis-метрики (операторские поля расширены в STEP340: ops last_sent/top reasons, hard-skip counters).
- STEP383: IG OAuth parked from deploy surface — удалены `api/ig/oauth/*` entrypoints, чтобы уложиться в лимит Vercel Hobby по serverless functions; UI уже скрыт, Instagram остаётся обычной ссылкой/контактом, docs/worklog обновлены под parked-state.
- STEP385: узкий hotfix для `Админка → Операции` — в `renderAdminOps()` переменные Redis probe (`r/key`) подняты на уровень функции; это устраняет `ReferenceError: r is not defined` при открытии `a:admin_ops` и не меняет ни Redis/DB-логику, ни operator flows.
- Audit write-shedding (ENV-гейт) + счётчики suppressed в health
- Broadcast: URL-кнопки до 3, deep-link shortcuts, шаблоны кнопок, ссылки “в слово”, финальный экран с кнопками
- Role gate на `/start` (Redis `ui_mode`, payload priority, fail-open)

- Contacts / Brand Pass (P2): structured contacts (`profile_contacts` JSONB) + opt-in UI + перенос из «Контакт» + явные подсказки (см. `docs/20_CONTACTS_MODEL.md`).

- Anti-bypass: телефоны, написанные **словами**, маскируем в `profile_about` до unlock (STEP119).
- Broadcast 429: Redis cooldown + **DB fuse** `broadcasts.cooldown_until` при деградации Redis (STEP120).
- Admin break-glass: при Redis down супер‑админ может открыть allowlist (payments/users/audit) через `bg=1` + ops alert (STEP121).
- Payments auto-heal: ops alerts при `validation_failed` / `manual_required` (STEP122).
- Brand Inbox UX: до ✅ Принять (status=new) доступны только ✅ Принять / ⛔ Спам / 🗑 Удалить; фикс креаторского CTA «💬 Написать бренду» (STEP124).

- Official channel publish: token-lock + DB-reserve (PUBLISHING) для защиты от дублей
- Broadcast: Redis cooldown на 429 + отображение cooldown в `/api/health`
- Cron: token-based locks (safe unlock) + SQL atomic guards на критичных статусных переходах
- Cron: Telegram notify обёрнуты в `withTimeout(~5s)` чтобы тик не “залипал”
- Brand Pass UX: «💳 Купить ещё» из витрины креатора → Brand Pass → кнопка «⬅️ Вернуться к витрине».
- Creator → заявки брендам: «✍️ Написать заявку» включает явный режим ввода + «❌ Отмена ввода» (без “тишины”).
- Brand Inbox: «✅ Принять» — точка списания (exactly‑once), до принятия нельзя «Ответить/Шаблоны»; показываем баланс кредитов (Redis-only).
- Brand Inbox guards (STEP317): при отправке сообщений (brand reply / creator chat) повторно проверяем DB‑status и никогда не двигаем `new → in_progress` без ✅ Принять (без скрытых обходов).
- Giveaways: «➕ Новый розыгрыш» при отсутствии/проблеме канала показывает gate‑экран (как в офферах), без молчаливых тупиков.
- UX polish: убрали “legacy/старое” из UI, добавили кнопки `🧹 Очистить` (контакт/IG/портфолио/описание + structured поля); `-` остаётся скрытым шорткатом для совместимости.
- Sweep: в ключевых местах вместо “тишины” на устаревших кнопках показываем понятный экран + кнопки назад/меню/home.
- Copy унификация: тексты гейтов для новичка приведены к одному короткому шаблону (без перегруза).

Примечание: в корне репозитория есть `migration_pack/` — ручные SQL-скрипты для экстренного переноса/repair (не используются рантаймом).


## ENV

### Support / Ops (единый операторский чат)

- `SUPPORT_CHAT_ID=-100...` — приватная группа/чат, куда бот пересылает обращения пользователей (кнопка 💬 Поддержка) и куда же приходят системные алерты.
  Пользователь пишет **только боту**; в группу он не попадает.
- `OPS_ALERT_SUMMARY_MIN=10` — анти-спам для алертов: бот шлёт дайджест не чаще 1 раза в N минут (первый алерт в окне — сразу, дальше — суммарно).
- `OPS_ALERT_BUFFER_MAX=200` — максимум событий в буфере алертов (Redis-only).
- `OPS_ALERT_SILENT=1` — «тихий режим» (по умолчанию): в чат летят только <b>ошибки/фейлы</b> (error/failed), без инфо-шумов.

Поддержка «по-человечески» прямо из группы:
- В тикете есть кнопка <b>✍️ Ответить</b>.
- Бот пришлёт подсказку. Чтобы работало стабильно (даже при privacy mode ON), отправляй текст <b>Reply</b> на <b>тикет</b> (сообщение с кнопками) или на <b>подсказку</b> бота — бот доставит пользователю.
- Отмена: <code>/cancel</code> (или кнопка «❌ Отмена»).

Быстрые шаблоны ответов (1 клик):
- В тикете рядом с «✍️ Ответить» есть кнопки: ✅ Принято / ❓ Нужны детали / ✅ Сделали / ⏳ В работе.
- Нажимаешь — бот сразу отправляет пользователю готовый ответ и пишет подтверждение в группу.

Важно:
- Если админ пишет <i>не Reply</i> (обычным сообщением в группу), бот может не увидеть его при включённом privacy mode — поэтому всегда отвечай через <b>Reply</b> на тикет/подсказку.


### Smart Matching / Featured — авто-обработка оплат (Stars)

- `MATCH_FEAT_AUTO_APPLY_ENABLED=1` — после оплаты бот автоматически запускает Smart Matching / Featured (попросит бриф/контент).
- `MATCH_FEAT_AUTO_APPLY_ENABLED=0` — авто-режим выключен: оплаты Smart Matching / Featured помечаются как **ORPHANED** и требуют ручной обработки в админке.


## STEP190 — Admin: шаблоны DM для сообщений пользователям (Redis-only CRUD)

Расширили STEP187: шаблоны для “✉️ Написать пользователю” больше не хардкод.

- Хранение: **только Redis** (key `sys:admin_dm_templates`).
- Админка: `👑 Админка → 📌 Шаблоны DM`
  - список шаблонов (пагинация),
  - **➕ Новый шаблон** (1-я строка — название кнопки, дальше — текст),
  - **✏️ Изменить / 🗑 Удалить**,
  - **♻️ Сбросить к дефолту** (удаляет кастомный набор из Redis).
- В карточке пользователя (`👑 Админка → Пользователи → Карточка → ✉️ Написать`) кнопки шаблонов берутся из Redis; если кастома нет или Redis недоступен — используем дефолтный набор.
- Без миграций и без DB‑логов: всё управление и хранение — Redis-only.


## STEP191 — Admin DM: плейсхолдеры в шаблонах + “📎 вставить” (Redis-only)

Расширили STEP190/STEP187: шаблоны и свободный текст теперь поддерживают плейсхолдеры, которые подставляются в предпросмотре и ещё раз при отправке.

- Плейсхолдеры (строгий allowlist):
  - `{{username}}` — `@username` получателя (если есть),
  - `{{user_id}}` — TG ID получателя,
  - `{{first_name}}` — имя (Telegram `first_name`, best-effort),
  - `{{role}}` — `brand/creator/unknown` (определяем только из Redis `ui_mode`),
  - `{{bot_name}}` — “Collabka PR”.
- Подстановка значений:
  - предпросмотр — показывает уже “развёрнутый” текст,
  - отправка — делает подстановку повторно (на случай изменений username/first_name).
- UI:
  - в “✉️ Написать” и в редакторе шаблонов добавлена кнопка **📎 Вставить** (подсказка + примеры).
- Без миграций/DB: всё остаётся Redis-only, без сканов Neon.



## STEP193 — Admin: Outbox лог отправок (Redis-only)

- В админке добавлен экран: `👑 Админка → 📤 Outbox`.
- Хранение: **только Redis** (list key `admin_outbox`, хранится как `mg:<env>:admin_outbox`), последние ~200 записей (LPUSH + LTRIM).
- Запись создаётся на каждую попытку отправки DM из STEP187 (шаблон или свободный текст):
  - время, кому, кто отправил,
  - статус `ok` / `failed`,
  - короткий snippet текста (до ~900 символов) + hash,
  - (если есть) название шаблона + использованные плейсхолдеры,
  - ошибка Telegram (коротко) при `failed`.
- Это не DB‑лог и не рассылка: **никаких миграций**, Neon не трогаем.
- В экране есть кнопка **«🧹 Очистить»** (с подтверждением).





## STEP204 — Outbox: быстрые действия (повтор / заметка / в шаблон)

Цель: превратить Outbox в “центр поддержки”, чтобы из истории отправок можно было сразу продолжить кейс.

- В просмотре записи Outbox (`📤 Outbox` → запись) добавлены действия:
  - **`✉️ Повторить`** — берём текст из snippet записи → предпросмотр → отправка. После отправки остаёмся в Outbox (return route).
  - **`📝 Заметка`** — открывает заметку/теги пользователя (STEP194/195) с кнопкой возврата в Outbox.
  - **`📌 В шаблон`** — сохраняет текст записи как новый DM‑шаблон (STEP190) по введённому названию.
- Safeties:
  - повтор/сохранение в шаблон доступны **только в DM** с ботом (в группах показываем подсказку), чтобы не светить текст/шаблоны;
  - без миграций и без DB‑сканов: используем Redis (outbox list + templates key + краткий return‑context для заметок).
## STEP194 — Admin: заметки в карточке пользователя (Redis-only)

- В карточке пользователя (`👑 Админка → Пользователи → Карточка`) добавили **заметку админа**:
  - в карточке показываем короткий snippet (только в DM, чтобы не светить заметки в группах),
  - отдельный экран `📝 Заметка (admin)` — ✏️ изменить / 🧹 очистить.
- Хранение: **только Redis** (key `mg:<env>:adm_user_note:<userId>`), без DB-миграций/таблиц.
- Редактирование: ввод одним сообщением через `expectText` (TTL 20 минут). Команды: `clear`, `/cancel`.
- Это внутренняя админ-фича для поддержки: на пользователей никак не влияет и не создаёт рассылок.



## STEP195 — Admin: теги к заметке (Redis-only, strict allowlist)

- В `📝 Заметка (admin)` добавлены **теги** (кнопками), чтобы быстро помечать пользователей без ручного текста.
- Теги — строгий allowlist (MVP): `VIP`, `SPAM?`, `FOLLOW`, `PAY`.
- Хранение: тот же Redis key `mg:<env>:adm_user_note:<userId>`, но теперь значение — объект:
  - `text` (может быть пустым),
  - `tags` (array),
  - `updatedAt`, `byAdminTgId`, `byAdminUsername`.
- Backward compatible: старые заметки-строки продолжают читаться (просто без тегов).
- Очистка: “🧹 Очистить всё” удаляет и текст и теги.



## STEP196 — Admin: индикатор заметок/тегов в списке пользователей (Redis-only)

- В `👑 Админка → 👥 Пользователи` добавили маркер **📝** и (опционально) 1–2 коротких тега прямо в списке.
- Показ — **только в DM** с ботом (в группах не показываем), чтобы внутренние пометки не “светились” случайно.
- Реализация: Redis-only bulk load для списка на странице (MGET если доступен; fallback на GET), Neon не трогаем.
- Для быстрых кнопок (если на странице 1–5 пользователей) добавили `📝` прямо в label кнопки карточки.



## STEP197 — Admin: быстрые действия из списка пользователей (DM-only)

- В `👑 Админка → 👥 Пользователи`, если на странице **1–5** результатов, показываем быстрые действия прямо в списке (только в DM):
  - `👤` — карточка пользователя,
  - `✉️` — написать пользователю (STEP187/190/191),
  - `📝` — заметка/теги (STEP194/195).
- Это ускоряет поддержку: можно сразу написать/пометить пользователя без захода в карточку.
- В групповых чатах быстрые действия не показываем, чтобы не светить внутренние элементы UI случайно.


## STEP198 — UX системных сообщений пользователям (admin DM + System Notice)

Цель: чтобы сообщения “от проекта” были максимально понятны и не путали пользователя кнопками.

- **Admin DM (STEP187):** сообщение приходит с явной шапкой “от администрации” и минимальными, однозначными CTA:
  - `🏠 Главное меню` → открыть меню **новым** UI‑сообщением (исходная “квитанция” остаётся как есть).
  - `💬 Поддержка` → открыть поддержку **новым** сообщением (квитанция не трогаем).
  - `✅ Принято` → убрать только кнопку `✅`, но оставить `🏠 Главное меню` + `💬 Поддержка` (нет “пустых сообщений без кнопок”).
  - Для этого в callback-data используем `|src:admmsg` (push‑обработчики не снимают reply_markup у квитанции).

- **System Notice (STEP188/189):**
  - при показе “1 раз на версию” кнопки унифицированы: `📋 Открыть меню` / `💬 Поддержка` / `✅ Понятно`,
  - добавлена возможность **открыть объявление повторно**: в `📋 Меню` и `🏠 Home` появляется кнопка `📣 Актуальное объявление` (только если notice активен, не истёк и таргет подходит роли). Нажатие показывает текущий notice, **не влияя** на `seen`.

- Всё остаётся **без рассылки** и **без DB**: только Redis, no-regressions.



## STEP199 — UX: “🧭 Быстрый старт” перенесён в Help/Support (меньше шума в меню)

Цель: убрать лишнюю “шумную” кнопку из основных хабов и оставить быстрый старт там, где его ожидают как справку.

- Убрали `🧭 Быстрый старт` из:
  - `📋 Меню` (Creator/Brand),
  - `🏠 Home`,
  - Curator Mode меню/кабинета.
- Быстрый старт остаётся доступен через:
  - `💬 Поддержка` (кнопка `🧭 Быстрый старт` внутри экрана поддержки),
    - примечание: из admin DM (push) поддержка намеренно минимальная и может не показывать `🧭 Быстрый старт`.
  - команду `/help`.
- Никаких миграций/DB — только перестановка кнопок. Zero regressions.

### Payments: TTL сессии оплаты (чтобы не ловить ORPHANED)

- `PAYMENT_SESSION_TTL_MIN=360` — TTL (в минутах) для Redis-сессий оплаты `pay_*` (контекст счёта: wsId/ret/packId и т.д.).
  Если TTL слишком короткий и пользователь оплачивает поздно, возможен статус ORPHANED `missing_session`.
  Диапазон: 10..1440 минут (10 минут .. 24 часа).

### Payments: fallback apply без pay_* сессии (anti-ORPHANED)

- `PAYMENTS_FALLBACK_APPLY_ENABLED=0` (default) — строгий режим: без `pay_*` сессии оплата станет ORPHANED `missing_session` (дальше — поддержка/ручная обработка).
- `PAYMENTS_FALLBACK_APPLY_ENABLED=1` — разрешить auto-apply по `invoice_payload`, если `pay_*` сессия истекла (использовать осознанно, обычно только при инцидентах).

**Runtime override (рекомендуется вместо ENV=1):**
- В админке: `⚙️ Система → 🧯 Payments fallback apply` можно включить fallback **временно** (2h/12h/24h). Хранится в Redis с TTL.
- Эффективное состояние: `ENV OR runtime`.
- Никаких DB-reads и миграций.

**HMAC hardening (рекомендуется):**
- `PAYMENTS_PAYLOAD_HMAC_KEY=...` — секрет для подписи payload (HMAC-SHA256). Если задан, новые Stars-инвойсы подписываются (token+sig).
- `PAYMENTS_PAYLOAD_HMAC_LEN=10` — длина hex-подписи (6..16).
- `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0` (default) — не применять fallback для старых/неподписанных payload, если HMAC включён. Временно можно поставить `1`, чтобы “дожать” старые инвойсы.

**Observability (Redis-only):**
- `/api/health` показывает `payments.payload_issues_today` (unsigned / bad_sig / bad_format / hmac_error).
- Для `bad_sig/hmac_error/bad_format` дополнительно пишется событие в ops-digest (anti-spam).

### Payments hardening: защита от неверных счетов/сумм

- `pre_checkout_query` теперь **валидирует** `invoice_payload + total_amount + currency` до списания Stars.
- На `successful_payment` повторная валидация (защита от ретраев/краевых кейсов) → при несоответствии статус **ORPHANED** + алерт в OPS.
- Fallback apply (cron/админка) и ручной Apply в админке **блокируются**, если сумма/валюта не совпадают с ожидаемыми для продукта.

### Payments idempotency: защита от дублей apply (serverless)

- В payments ledger используется уникальный `telegram_payment_charge_id` (и дополнительный unique для `provider_payment_charge_id`).
- Перед любыми сайд‑эффектами (начисления/активации) payment **claim**-ится в DB статусом `APPLYING` (atomic update). Это защищает от Telegram retries и параллельного apply (cron/admin/user).
- Fallback apply (когда `pay_*` сессия истекла) выполняется **атомарно** в одной DB‑транзакции: row‑lock `payments` (`FOR UPDATE NOWAIT`) → apply сайд‑эффектов → `status='APPLIED'`. При параллельном вызове второй раннер получает `locked` и ничего не применяет.

### Ownership-in-SQL (anti-bypass) для чувствительных сущностей

- Для лидов/заявок больше не используем паттерн «достали по id → потом проверили». В callback-router применяются safe-getters:
  - `db.getBrandLeadForActor(leadId, actorUserId)`
  - `db.getBrandApplicationForActor(appId, actorUserId)`
- Действия с глобальным эффектом по лидам (assign / soft-delete) дополнительно ограничены ролями: <b>owner/curator/admin</b>.
- Покупка размещения в офиц.канале (`a:off_buy`) получает оффер только через `db.getBarterOfferForOwner(ownerUserId, offerId)` (ownership в SQL).

---

## Admin: подарки и отзыв подписок

- `👑 Админка → 🎁 Подарить подписку` — выдача подарков (Brand Plan Старт/Про, PRO Креатор).
- После выдачи подарка получателю приходит сообщение с быстрыми действиями: перейти в режим Бренд (без принудительного переключения), открыть ⭐️ Brand Plan, поделиться ботом.
- В этом же меню есть `⛔ Забрать / отменить подписку`:
  - забрать Brand Plan (подписка)
  - забрать PRO
  - 🧾 забрать **подарочные** кредиты (только подарочные, купленные/триал не трогаем)
  - ⛔+🧾 забрать Brand Plan + подарочные кредиты
  - (опасно) обнулить кредиты (→0, всё)


Примечание про кредиты Brand Pass:
- UX: если открыть покупку из витрины креатора (кнопка «💳 Купить ещё»), в экране Brand Pass появляется «⬅️ Вернуться к витрине» (контекст wsId).

- Показ баланса в горячих UX (вход в BX/Inbox/витрина) — <b>строго Redis-only</b>, без DB-fallback.
- Redis кеш баланса: короткий TTL ключ `brand_credits:<brandUserId>` + долгоживущий snapshot `brand_credits_snap:<brandUserId>`; при входе в brand-hub snapshot прогревается/обновляется, а короткий ключ гидратируется из snapshot при необходимости.

- В базе есть общий баланс `brand_credits` и отдельный остаток подарков `brand_credits_gifted`.
- При списании кредиты тратятся сначала из подарочных (уменьшается `brand_credits_gifted` до 0).
- Команда «🧾 забрать подарочные» снимает только остаток подарочных, не затрагивая купленные/триал.

---

## STEP187 — Admin: сообщения пользователям из карточки (MVP)

- В `👑 Админка → Пользователи → Карточка пользователя` добавлена кнопка **«✉️ Написать»**.
- Можно отправить:
  - **шаблонное** сообщение (6 быстрых шаблонов),
  - **свободный текст** (вводится в DM с ботом, затем предпросмотр и подтверждение).
- Без миграций/DB-логов: отправка — через Telegram `sendMessage`.
- Защита от двойных кликов: best‑effort Redis dedup на 60 сек по `(admin_tg_id, target_tg_id, hash(text))`.
- Лог отправки (best‑effort): в `SUPPORT_CHAT_ID` (если задан) иначе всем `SUPER_ADMIN_TG_IDS`.


## STEP188 — System Notice (Redis-only banner, без рассылки)

- В админке добавлен экран: `👑 Админка → 📣 Объявление`.
- Объявление хранится **только в Redis** (без DB), ключ: `sys:notice` (object):
  - `active` — показывать или нет,
  - `severity` — `info` / `warn` / `critical`,
  - `version` — номер версии (целое число),
  - `text` — текст объявления,
  - `updatedAt` — время последнего изменения (best-effort).
- Публикация: кнопка **«🚀 Опубликовать (новая версия)»** увеличивает `version` на 1 и включает `active=ON`.
- Показ пользователям: при входе в `📋 Меню` или `🏠 Home` бот делает **Redis-only** проверку:
  - если `active=ON`, `version>0` и у пользователя нет метки `seen` для этой версии — отправляет объявление отдельным сообщением и ставит `seen`.
  - `seen` ключ: `sys:notice:seen:<tg_id>:<version>` (TTL ~180 дней).
- Это **не broadcast**: нет массовой отправки и нет DB‑сканов; сообщение “подхватывается” только когда пользователь сам открывает меню/хаб.


## STEP189 — System Notice v2 (targeting + CTA + auto-expire)

Расширили System Notice (STEP188), всё ещё **Redis-only** и **без рассылки**.

- Новые поля `sys:notice`:
  - `target` — `all` / `brand` / `creator` (таргетинг по роли, определяем **только из Redis**: `ui_mode` + `bm_mode`),
  - `ctaLabel` / `ctaUrl` — опциональная URL‑кнопка,
  - `expiresAt` — auto‑expire (epoch seconds; в админке можно вводить ISO со смещением).
- В админке (`👑 Админка → 📣 Объявление`) добавлены кнопки:
  - **🎯 Кому** (циклом `all→brand→creator`),
  - **🔗 CTA** (label + URL),
  - **⏰ Expire** (дедлайн).
- Показ пользователям:
  - если объявление истекло (`expiresAt` в прошлом) — **не показываем**,
  - если `target!=all` — показываем только целевой роли,
  - если `ctaUrl` задан — добавляется URL‑кнопка в сообщении.


### Payments: auto-heal ORPHANED `missing_session` (cron + админка)

- `PAYMENTS_ORPHANED_AUTOHEAL_ENABLED=1` — cron будет периодически пытаться авто-применять ORPHANED с `note=missing_session` (только безопасные типы: PRO / кредиты / Brand Plan / founder_brand_*).
- `PAYMENTS_ORPHANED_AUTOHEAL_BATCH=20` — сколько платежей чинить за один тик (0..100).
- `PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC=300` — не трогать слишком свежие ORPHANED (моложе ~5 минут), чтобы избежать гонок/задержанных обновлений. Диапазон: 0..3600 сек.

- В админке: **Admin → Payments (ORPHANED)** → кнопка **Auto-heal missing_session**.

Auto-heal safeguards + ops alerts:
- Перед apply делает **строгую валидацию** payload/amount/currency. Если не проходит → помечает `note=autoheal_manual_required:<reason>` и шлёт ops alert `autoheal_validation_failed` (чтобы не было тихих ретраев).
- Для постоянных non-applied кейсов (unsupported_payload / bad_input / user_mismatch / missing_userid_or_wsid) → помечает `note=autoheal_manual_required:<reason>` и шлёт ops alert `autoheal_manual_required_failed`.
- Если apply прошёл, но user notify не удалось → ops alert `autoheal_notify_failed`.
- Исключения/ошибки в тикe → ops alert `autoheal_failed`.

Примечание: оплаты `offpub_*` (публикация в офиц.канал) остаются ручными по дизайну (модерация).


### STEP164 — NotebookLM audit pack (docs-only)
- Добавлен комплект для стороннего аудита: `docs/audit/*` (инструкция загрузки + промпт + audio focus).

### STEP165 — NotebookLM: workaround для .sql + генератор sources
- Добавлен генератор `npm run gen:notebooklm-sources`, который готовит папку/ZIP `dist/notebooklm_sources/`.
- В sources SQL миграции и migration_pack кладутся как `.txt` копии (`migrations_txt/*.sql.txt`), чтобы NotebookLM принимал файлы.
- Добавлен исторический контекст Neon: `docs/neon/NEON_HISTORY_RAW.txt`.

---

## Repo sync note
- **STEP184:** архив репозитория и NotebookLM audit-pack синхронизированы с состоянием **STEP183** (без изменения поведения).
- **STEP185:** исправлено битое имя файла в `docs/neon/` (переименовано в `docs/neon/NEON_HISTORY_RAW.txt` для переносимости архивов), как и указано в доках/аудит-паке).

### STEP186 — NotebookLM pack ≤50 files (NotebookLM50)
- NotebookLM лимит: максимум 50 файлов; .sql часто не загружается.

### STEP187 — Admin: user messages from user card
- Добавлена отправка сообщений пользователям из админки (из карточки пользователя): шаблоны + свободный текст + предпросмотр.
- Добавлен Redis dedup против случайных дублей.
- Добавлен curated pack: `docs/audit/notebooklm_pack/` (бандлы core/features/process + code bundle + migrations bundle).
- Генератор `npm run gen:notebooklm-sources` теперь собирает `dist/NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip` и валидирует лимит 50 файлов.

### STEP221 — Admin Comms UX + Cron router path fix
- Админские личные сообщения пользователю: кнопки `📋 Открыть меню` и `💬 Поддержка` больше не затирают текст.
  - Используются новые action keys: `a:menu_push` и `a:support_push`.
  - При нажатии бот снимает клавиатуру с исходного сообщения и открывает экран меню/поддержки отдельным сообщением.
- Админка → «✉️ Сообщение пользователю» (`a:adm_umsg`): быстрые шаблоны в 2 колонки + компактные ряды действий.
- Vercel Hobby: cron router лежит в `api/cron_router.js` (соответствует `vercel.json` rewrites).

### STEP223 — Fix: `a:menu_push` opens Menu reliably (no receipt overwrite)
- Исправлено поведение `a:menu_push`: теперь меню всегда рендерится в отдельное «UI-сообщение» (через placeholder `⌛ Открываю меню…`).
- Исходное админское/системное сообщение остаётся «квитанцией» и не перезаписывается.
- Добавлен safe-fallback: если placeholder не удалось отправить — бот открывает меню обычным способом.


---

## Recent STEPs (2026‑03)

### STEP252 — Vercel: fix deprecations / rewrites consistency
- Приведены в порядок проблемные места после обновлений Vercel (совместимость/депрекейты).

### STEP253 — Admin DM: free text sending fixed (no silent fail)
- Исправлен крэш в обработчике `expectText: adm_user_msg_text` → сообщение теперь реально уходит пользователю.

### STEP254 — Admin message receipt: кнопки стали предсказуемыми
- Под админ‑сообщением у пользователя стабильно: `📋 Открыть меню / 💬 Поддержка / ✅ Понятно`.
- `✅ Понятно` аккуратно снимает только ack, не ломая навигацию.

### STEP255 — Admin message: блок «Что дальше» (шаблон)
- В конец админ‑сообщения добавлен короткий блок, объясняющий 3 кнопки.

### STEP256 — Admin message: опция «коротко» без блока «Что дальше»
- В предпросмотре админа две отправки: стандартно и коротко, без изменения клавиатуры.

### STEP257 — Витрина: шаринг коротко/подробно, URL в конце
- В сообщениях шаринга ссылка переносится в конец, чтобы не светиться в первых строках превью.

### STEP262 — Витрина: предпросмотр как продукт (кнопки по смыслу)
- В owner‑preview выделены блоки: **Действия** (`🔗 Поделиться`, `📌 IG шаблоны`) и **Мои площадки** (сеткой).
- Для владельца label канала: `📣 Мои каналы`.

### STEP263 — IG templates: anti‑bypass (без @handles и «ссылка в профиле»)
- В IG‑шаблонах убраны любые `@...` (канал/IG) и упоминания «ссылка в TG‑профиле».
- Шаблоны оставлены полезными: только описание оффера + ниши/форматы + портфолио (если есть) + ссылка на витрину/заявку.

### STEP264 — Витрина: «📨 Отправить» снова работает во всех Telegram‑клиентах
- Некоторые клиенты игнорируют `https://t.me/share/url?text=...` (кнопка выглядит как ссылка, но нажатие ничего не делает).
- Для совместимости `📨 Отправить` использует `t.me/share/url?url=<invisible>&text=<plain>`.
- В `url=` передаём невидимый символ U+2060 (WORD JOINER), чтобы у получателя не появлялась «ссылка первой строкой».

### STEP265 — Support: fail‑open навигация при деградации Redis
- В `actionRegistry` действия `a:support` и `a:support_push` больше не требуют Redis (guard=NONE).
- Запись в поддержку (`a:support_write`) по‑прежнему требует Redis (expectText), поэтому безопасность/инварианты не нарушены.
- Это убирает прод‑UX баг: в деградации Redis кнопка «💬 Поддержка» не должна вести в общий error‑экран.

### STEP266 — Curators: «📤 Поделиться» приглашением не должна “молчать”
- В `a:cur_invite` (приглашение куратора ссылкой) кнопка шаринга использовала `t.me/share/url?url=&text=...`.
- Некоторые Telegram‑клиенты игнорируют share‑URL с пустым `url=` → нажатие выглядит как “ничего не происходит”.
- Для совместимости выставлен `t.me/share/url?url=<invisible>&text=<plain>` (U+2060 WORD JOINER в `url=`).

### STEP267 — IG templates menu: убрать явные Channel/Profile (только ссылка на бота)
- В меню `📌 Шаблоны для Instagram` больше не показываем строки `Канал:` и `Профиль:` (не подсказываем обход через @handles).
- Оставляем только безопасную ссылку на витрину/заявку: `Ссылка на витрину → Открыть витрину`.
- Шаблоны (Stories/Пост/DM/Bio) по‑прежнему anti‑bypass: без `@...`, без «ссылка в профиле», контакт только через витрину.

### Payments fallback (ops control)

- **Production baseline:** `PAYMENTS_FALLBACK_APPLY_ENABLED=0` (по умолчанию OFF).
- Включать fallback следует **только временно** через админку (runtime flag с TTL, STEP337).
- `/api/health` показывает:
  - `payments.fallback_apply_env_enabled` (ENV)
  - `payments.fallback_apply_runtime_enabled` (admin runtime)
  - `payments.fallback_apply_effective` (итог)

## Production ops docs

- `docs/92_PROD_ENV_BASELINE.md` — baseline ENV for prod (no secrets)
- `docs/93_PROD_DEPLOY_CHECKLIST.md` — deploy/runbook checklist (health + admin)


### STEP401 — Admin User Card + Note contract smoke
- `npm run preflight` теперь дополнительно запускает source-level smoke `scripts/smoke-admin-user-card-note-contract.js`.
- Smoke фиксирует операторский контракт `Админка → User Card + Note`:
  - `renderAdminUserCard()` — title/ID/TG ID/Username/Роли, DM-safe note/tags block, actions `Скопировать ID / Написать / Заметка / Подарить подписку`, revoke/ban toggles, back buttons `К списку / Операции`;
  - `renderAdminUserNote()` — DM-only guard, note text/tags summary, tag toggle rows, `Изменить текст / Очистить всё / К карточке`, optional return-route button, section footer;
  - callbacks `a:adm_ucard / a:adm_unote / a:adm_unote_edit / a:adm_unote_clear_q / a:adm_unote_clear / a:adm_unote_tag` и `expectText` flow `adm_user_note` (`clear/cancel/save`).
- В `package.json` добавлен `npm run smoke:admin-user-card-note-contract`.
- Runtime UX/DB path не менялись; новые DB-read в hot menu paths не добавлялись.


### STEP402 — Admin Audit / Metrics / Moderators contract smoke
- `npm run preflight` теперь дополнительно запускает source-level smoke `scripts/smoke-admin-audit-metrics-moderators-contract.js`.
- Smoke фиксирует операторский контракт сразу для трёх экранов:
  - `Админка → Audit Log`: time filters `24ч / 7д / 30д / Всё`, `Поиск / Сброс / Export TXT`, pagination, back-to-Ops, export filename/caption/back buttons, callbacks `a:aud*` и `expectText` flow `aud_search`.
  - `Админка → Метрики`: summary blocks `Пользователи / Каналы / Конкурсы / Офферы / Payments / Активность`, day-window controls `7/14/30/90`, footer `Операции / Меню / Home`, callback `a:admin_metrics`.
  - `Админка → Модераторы`: list/empty-state, `➕ Добавить модератора`, per-row `🗑`, footer `Система / Меню / Home`, callbacks `a:admin_mod_*` и `expectText` flow `admin_add_mod_username`.
- В `package.json` добавлен `npm run smoke:admin-audit-metrics-moderators-contract`.
- Runtime UX/DB path не менялись; новые DB-read в hot menu paths не добавлялись.


### STEP403 — Broadcast deliver local in-memory DB overload fuse
- В `api/qstash/broadcast-deliver.js` добавлен **warm-instance local fuse** для редкого деградационного сценария: `DB overloaded` + Redis недоступен одновременно.
- Новый module-level guard `localDbDegradedUntilMs` активируется **только если** запись Redis-fuse (`ops:fuse:db_overload`) не удалась.
- На входе `broadcast-deliver` теперь есть precheck `local_fuse_precheck` **до Redis-read и до любого DB touch**: warm instance сразу отвечает `429 + Retry-After`, не трогая Neon.
- `respondDbOverloadFuse(...)` теперь помечает ответ флагом `local_fuse`, чтобы путь было видно в дебаге/QA.
- В `npm run preflight` добавлен source-level smoke `scripts/smoke-broadcast-local-db-fuse.js`, который фиксирует контракт local fuse: module-level state, arming on Redis-fuse failure, precheck order (`local fuse -> Redis fuse -> DB`), response marker.
- Runtime UI/action keys/DB schema не менялись; новые DB-read в hot menu paths не добавлялись.

## STEP406 — Docs / runbook polish

- Обновлены owner/deploy/preflight документы и добавлен короткий operator playbook `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`.
- `/api/health` теперь документирован как основной операторский дашборд для новых hardening-paths:
  - `broadcast.db_overload.*` и `local_fuse_active` / `local_fuse_until_ms`;
  - `payments.orphaned_autoheal_chain_max` как visibility для bounded chain-drain;
  - Official Publish manual `🩺 Проверить статус` как первый safe action при stuck `PUBLISHING`.
- Зафиксирован короткий playbook “что делать, если” без импровизации:
  - DB overload + Redis degraded → смотреть health, не жать повторные отправки, ждать short-circuit / cooldown;
  - orphaned payments backlog → проверять bounded chain-drain, не включать runtime fallback без причины;
  - Official Publish stuck → сначала `🩺 Проверить статус`, только потом replay/ручные действия.
- Runtime code/action keys/schema не менялись; это docs-only step.

## STEP405 — Official Publish: operator check-now / force verify
- Added manual moderator action `a:off_verify` / `🩺 Проверить статус` on `PUBLISHING` official posts.
- Added shared helper `src/lib/officialPublishVerify.js` for safe verify/self-heal used by worker and operator path.
- Manual check-now does not republish and does not bypass token-lock; it only syncs ACTIVE via Redis breadcrumb or safely resets to PENDING when publish is truly stuck.

- STEP410 UX bridge: channel card (`a:ws_open`) now exposes `👥 Кураторы и сеть` → `a:ws_settings`, so owner can actually reach `⛔ Отключить канал` / `🔌 Подключить снова` flow from an active workspace without hidden paths.


## STEP418 — Creator menu polish / verification placement
- Creator current menu now uses explicit channel-context copy:
  - `🔁 Сменить канал` opens the compact picker
  - `📂 Текущий канал` opens the current channel work screen
- Role-switch footer is removed from Creator current menu and from the no-active-channel creator gate. Role switching stays in `🏠 Home` only.
- No-active creator gate is tightened to actionable recovery only: `🚀 Подключить канал`, `📦 Неактивные` (when present), `💬 Поддержка`, `🏠 Home`, plus staff shortcuts when applicable.
- Verification is treated as **account-level**, not per-channel DB truth. The quick entrypoint now lives in `Настройки канала` as `✅ Верификация аккаунта`, with copy clarifying that it is one verification for the creator account.
- `ws_profile` no longer duplicates the verification button; the profile screen stays focused on profile editing only.
- Runtime business logic, schema and current-channel resolver were not changed.


## STEP451 — Creator-side application notices / receipts cleanup
- Creator-facing service notices around brand applications now use one shared vocabulary layer:
  - `✉️ Диалог #...`
  - `💬 Написать бренду`
  - `📨 Мои заявки`
- Added shared helpers in `src/bot/bot.js` for creator-side application notice surfaces:
  - `creatorBrandAppDialogButtonLabel()`
  - `creatorBrandAppReplyButtonLabel()`
  - `creatorBrandAppListButtonLabel()`
  - `creatorBrandAppNoticeWhatNext()`
  - `creatorBrandAppNoticeKb()`
  - `buildCreatorBrandAppServiceNoticeText()`
- This unified creator-side notice/receipt language is now used in three places:
  - brand accepted → creator notification
  - brand replied / template replied → creator notification
  - creator replied → local creator receipt / follow-up
- Scope is UI copy + CTA consistency only. No accept/charge semantics, no DB schema changes, no new hot-path DB reads.


## STEP452 — Creator-side `💬 Написать бренду` entry / fallback / error-recovery cleanup
- Creator-side chat-open surface around brand applications is now aligned to the same one-vocabulary model as STEP451 notices.
- Added shared helpers in `src/bot/bot.js` for this layer:
  - `creatorBrandAppChatRecoveryKb()`
  - `buildCreatorBrandAppChatPromptText()`
  - `buildCreatorBrandAppChatRecoveryText()`
- The same prompt / recovery language is now used in three places:
  - normal entry into `💬 Написать бренду`
  - degraded fallback when input mode cannot be opened
  - error/recovery replies for missing id, validation failures, rate-limit, not-found / no-access, and not-yet-accepted guard
- Added source-level smoke `scripts/smoke-creator-app-chat-entrypoints-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is entry / fallback / recovery copy + CTA consistency only. No accept/charge semantics, no DB schema changes, no new hot-path DB reads.


## STEP453 — Brand-side `✍️ Ответить креатору` entry / fallback / error-recovery cleanup
- Brand-side reply-open surface around creator applications / deal dialogs is now aligned to the same one-vocabulary model as STEP452 creator-side chat-open.
- Added shared helpers in `src/bot/bot.js` for this layer:
  - `brandAppReplyButtonLabel()`
  - `brandAppReplyRecoveryKb()`
  - `buildBrandAppReplyPromptText()`
  - `buildBrandAppReplyRecoveryText()`
- The same prompt / recovery language is now used in four places:
  - normal entry into brand-side `✍️ Ответить креатору` from application card
  - normal entry into brand-side `✍️ Ответить креатору` from local deal view
  - degraded fallback when input mode cannot be opened
  - recovery replies for missing id, validation failures, rate-limit, not-found / no-access, not-yet-accepted guard, missing creator TG id, and open-error fallback handlers
- Added source-level smoke `scripts/smoke-brand-app-reply-entrypoints-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is entry / fallback / recovery copy + CTA consistency only. No accept/charge semantics, no DB schema changes, no new hot-path DB reads.

## STEP454 — Empty / no-history / first-message states cleanup
- Application / deal / dialog cards now keep the same `💬 Последние сообщения` section even when the history is still empty.
- Added shared empty-state helpers in `src/bot/bot.js` for the currently cleaned surfaces:
  - `brandAppThreadEmptyStateText()`
  - `creatorBrandAppThreadEmptyStateText()`
  - `creatorLeadThreadEmptyStateText()`
  - `brandLeadThreadEmptyStateText()`
- The goal is not new logic, but honest first-state guidance:
  - brand-side application card explains what to do before the first message
  - local deal view explains how to send the first message/template
  - creator-side application dialog explains accepted vs not-yet-accepted empty history
  - creator/brand lead dialogs explain how the first reply appears in the same screen
- Added source-level smoke `scripts/smoke-empty-state-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is empty-state copy + CTA clarity only. No accept/charge semantics, no DB schema changes, no new hot-path DB reads.



## STEP455 — Footer / back / list-return consistency pass
- Added shared footer/list-return label helpers for the cleaned creator ↔ brand application/deal flows:
  - `brandAppListReturnButtonLabel()` → `📨 К заявкам`
  - `brandDealsListReturnButtonLabel()` → `📌 К сделкам`
  - `creatorBrandAppListReturnButtonLabel()` → `📨 К заявкам`
- Applied contextual return labels instead of generic `⬅️ Назад` in the key cleaned screens:
  - brand application card footer now returns via `📨 К заявкам`
  - brand local deal view now returns via `📌 К сделкам` or concrete `✉️ Заявка #...` when opened from an application
  - creator application dialog card now returns via `📨 К заявкам`
  - creator-side lead dialog now returns via `📨 К заявкам`
  - brand-side lead dialog now also exposes a contextual `📨 К заявкам` return path instead of menu/home only
- Added source-level smoke `scripts/smoke-footer-back-consistency-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is footer/back/list-return labeling only. No accept/charge semantics, no DB schema changes, no new hot-path DB reads.

## STEP457 — Creator brand catalog open-path cleanup
- Creator-side `🏷 Каталог брендов` open path no longer does an eager intermediate `⏳ Открываю каталог брендов…` edit on every tap.
- `a:brands_home` now uses a normal-path callback toast (`Открываю каталог…`) and goes straight into `renderBrandsDirectory(...)`.
- Added a delayed slow-loader only for the real slow path: if the catalog render has still not completed after ~700ms, we show the same loading screen and keep the existing timeout fallback intact.
- Scope is creator catalog open-path only. No catalog data/query changes, no new DB reads, no accept/charge changes.
- Added source-level smoke `scripts/smoke-creator-brands-home-open-contract.js`, wired into `package.json` and `scripts/preflight.js`.


## STEP462 — Creator application reply post-send completion cleanup
- Creator reply composer now explicitly promises the real completion path: after one sent message the bot returns the user to the same `✉️ Диалог по заявке #...`, instead of leaving completion semantics implicit.
- Successful `expectText: brand_app_chat_send` no longer replies with a separate generic service notice surface. It now rerenders the same creator application dialog with an inline completion block:
  - `✅ Сообщение отправлено бренду` for normal delivery;
  - `⚠️ Сообщение добавлено в диалог` when the dialog updated but notification delivery had no tg target or failed.
- The refreshed dialog shows the updated thread immediately, so the user can verify that the message is already inside the same application context and continue from there.
- Added helper `buildCreatorBrandAppSendReceiptBlock(...)` and source smoke `scripts/smoke-creator-app-reply-completion-contract.js`, wired into `package.json` + `scripts/preflight.js`.
- Scope is creator application reply post-send completion only. No accept/charge/deal changes, no IA merge with Inbox, no new DB reads in hot UI paths.

## STEP460 — Creator application dialog / composer / local-return clarity pass
- Creator-side application card now speaks one clearer local conversation model after accept:
  - reply CTA relabeled from `💬 Написать бренду` to `✍️ Ответить бренду`;
  - `💡 Сейчас` and empty-history copy now explicitly say that the first reply appears in this same dialog/card;
  - the opened application card adds a short in-bot hint so it reads as the actual dialog container, not as a separate info card.
- Creator reply composer (`a:brand_app_chat`) is now treated as a true input-mode screen:
  - primary local return button is `⬅️ К диалогу #...`;
  - list return uses `📨 К заявкам`;
  - `🪟 Открыть бренд` is removed from the normal composer/recovery keyboard so the user is not pulled sideways while typing.
- Creator-side open-brand actions from application context now carry the local application id through `a:brand_dir_open|...|ba:<appId>`:
  - creator application card `🪟 Открыть бренд`;
  - creator-side service notices for the same application;
  - legacy accepted-more follow-up screen.
- Brand catalog card now detects creator application context and switches its back CTA from generic `⬅️ Назад к списку` to contextual `⬅️ К заявке #...`.
- Added source-level smoke `scripts/smoke-creator-app-local-context-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is creator application dialog/composer/local-return clarity only. No Inbox/lead IA merge, no accept/charge changes, no new DB reads in hot UI paths.


## STEP464 — Reply receipt + brand notice wording cleanup
- Creator-side application reply receipt is now strictly user-facing:
  - keeps `✅ Сообщение отправлено бренду` / warning variants when the dialog updated but notification did not fully deliver;
  - no longer shows internal delivery telemetry such as owner/manager counters in the normal UX.
- Brand-side application notice surfaces now distinguish between two contexts:
  - `new_app` notices keep `✉️ Заявка #...` wording;
  - reply / ongoing-work notices switch the primary CTA to `💬 Диалог #...`.
- Added notice-specific helper `brandAppNoticeOpenButtonLabel(...)` and threaded the `kind` through `brandAppNoticeWhatNext(...)` + `brandAppNoticeKb(...)` so wording changes stay local to notice surfaces and do not rewrite brand application card / deal card CTA language.
- Updated source-level smoke coverage in `scripts/smoke-brand-app-notices-contract.js` and `scripts/smoke-creator-app-reply-completion-contract.js`.
- Scope is wording / receipt cleanup only. No accept/charge/deal mutations, no DB schema changes, no new hot-path DB reads.

- STEP467 — accept SQL family hardening
  - `markBrandApplicationAccepted()` and `acceptBrandApplicationWithCharge()` now cast `jsonb_build_object(...)` accept/charge params explicitly (`$2::bigint`, `$3::int`) to prevent latent Postgres type-resolution regressions around accept meta writes.
  - `scripts/smoke-brand-app-accept-sql-contract.js` is now wired into both `package.json` scripts and `scripts/preflight.js`, so this exact accept SQL typing contract is part of the default source-only regression sweep.


## STEP482A — Telegram copy hotfix wave 1
- Applied a narrow runtime copy pass only on brand/catalog/BX filter surfaces and the closest zero-state/helper lines.
- `renderBrandDirFilters(...)` now uses a split header (`Режим` / `Каталог`), multiline filter summary, `Найдено брендов`, and helper wording `открыть список` instead of `увидеть выдачу`.
- `renderBrandsDirectory(...)` now uses a shorter human header (`Показываем бренды по данным из их профиля.`), a multiline filter summary, and shorter zero-state guidance (`Ослабь 1–2 фильтра...`) instead of internal-mechanics wording.
- `renderBxFilters(...)` now uses a split header (`Режим` / `Лента`), multiline filter summary, and cleaner helper wording (`открыть ленту`).
- `renderBxFeed(...)` zero-state now tells the user what to do next instead of a flat `Пока нет офферов по этим фильтрам.` line.
- `bxSmartPrefillText(...)` zero-results helper now uses friendlier wording.
- Added source-level smoke `scripts/smoke-copy-wave1-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is copy/layout only. No callback contract changes, no DB schema changes, no extra hot-path DB reads, no money-path changes.


## STEP485 — Landing accordion hotfix

- Landing accordions (`Что внутри бота`, `FAQ`) now ship closed by default.
- Added `.accordion-panel-inner` wrapper to prevent collapsed-state text bleed.
- Narrow landing-only hotfix; bot runtime, callbacks, DB, money paths untouched.


## STEP486 — Landing visual polish pack
- Rebuilt landing section `Как это выглядит` around four polished product cards derived from real Telegram bot screens: `Домашняя`, `Каталог брендов`, `Фильтры брендов`, and `Диалог и стадия сделки`.
- Removed placeholder schematic previews from that section and switched the landing to product-grade screenshot compositions only.
- Added new assets under `assets/screenshots/*-surface-polished.png` and tightened landing smoke so the old raw/placeholder visuals do not silently return.
- Scope is landing-only. Bot runtime, callbacks, DB, monetization, accept/reply/stage paths untouched.


[STEP489] Landing icon system polish: replaced emoji landing icons with a consistent SVG icon set, added /assets/icons/landing/*.svg, and tightened landing icon spacing/styling without changing section structure or CTA behavior.


- STEP489: landing icon hardening fixed oversized/sprawled icon rendering by switching landing icon surfaces from external SVG image refs to inline sprite usage with stricter size guards.


## STEP490 — Landing icon render hotfix
- Landing section icons moved from inline sprite SVG to fixed-size CSS background glyphs backed by local `assets/icons/landing/*.svg`.
- Goal: eliminate live icon overflow/giant render drift without changing landing layout, copy, gallery or FAQ behavior.
- Landing gallery/modal contract remains the current baseline.


## STEP505 — Web Admin payments read surface v1
- Added `/admin/payments` as a read-only founder/operator payments surface.
- Added `section=payments` in `api/admin-web-read.js` and aggregated `getPaymentsSummary()` in `src/lib/adminWeb/readModels.js`.
- Payments page now shows summary cards, warnings strip, recent payments table, grouped counts, and hints without exposing any write action.
- Overview now has a direct entry-point into the payments surface through the payment alerts card.
- Added source smoke `scripts/smoke-admin-web-payments-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is read-only only: no retries, no overrides, no credits mutation, no payout/release controls.


## STEP506 — Web Admin comms workspace v1
- Added `/admin/comms` as a read-only founder/operator communications surface.
- Added `section=comms` in `api/admin-web-read.js` and `getCommsSummary()` in `src/lib/adminWeb/readModels.js`.
- Comms page now exposes: overall status, warnings strip, recent notices table, outbox groups, and hints.
- Overview now links into the comms workspace.
- Scope stays read-only and Hobby-safe: one primary read request, no polling, no cron dependency, no new write actions.

## STEP509 — Payments drilldown polish
- `/admin/payments` now supports drilldown into a read-only payment detail route.
- Added `section=payment` to `api/admin-web-read.js` and `getPaymentDetail()` to `src/lib/adminWeb/readModels.js`.
- Payments list rows are now clickable and preserve back-to-list context through a `back` query param.
- Payment detail shows linked user context, payment summary, diagnostics, light event trace, hints, and recent admin audit without exposing provider payloads or adding any write actions.
- Source smoke `scripts/smoke-admin-web-payments-contract.js` now covers both list and detail contracts.

## STEP511 — Web Admin login step split / auto-return polish
- `/admin/login` now stays explicitly two-phase: first `secret`, then `Telegram approve / code`.
- After challenge creation the UI no longer implies that the secret must be entered again.
- Returning from Telegram approve now lands back on web-admin and re-checks the approved challenge automatically.
- Added `scripts/smoke-admin-web-login-contract.js` coverage for the split-step contract.
- Scope is login-flow UX / auth handshake polish only. No new auth method, no route expansion, no DB changes.

## STEP512 — Operator Control Surface
- Added shared runtime adapter `src/lib/operatorControls.js` so web-admin and Telegram admin read the same Redis-backed control state.
- Added web-admin `section=control_surface` read contract and a compact top status bar rendered across authenticated admin pages.
- Overview now shows a dedicated `Operator control surface` snapshot plus recent toggle audit events.
- Telegram `Админка → Control Surface` now exposes a disciplined safe-toggle set:
  - `Web-admin login`
  - `Приём платежей`
  - `Автовыдача платежей`
  - `Match/Feat auto-apply`
  - `QStash fan-out`
  - `Payments fallback` as separate incident-mode tool.
- Toggle changes now append an operator audit trail (`who / what / when`), and fallback on/off events are also logged.
- New web-admin login requests can be intentionally paused by operator toggle without changing the existing session contract.
- Added source smoke `scripts/smoke-admin-control-surface-contract.js`, wired into `package.json` and `scripts/preflight.js`.
- Scope is operator-control/read-plane polish only. No DB migrations, no public flow changes, no destructive admin writes.


## STEP514 — Users bulk utility rail
- Added `src/lib/adminWeb/usersBulk.js` so `/admin/users` can build bounded text lists (`tg_id`, `usernames`, `user_id`) from either the current filtered slice or a manual selection basket.
- Added `section=users_bulk` to the collapsed `api/admin-web-read.js` handler; every copy action now writes admin-web audit with actor, source, filters, row count, truncation flag, and preview.
- Upgraded the users page with a `Bulk utility rail`, checkbox selection, `корзина`, page-level select / clear controls, and latest-copy metadata.
- Added `getUsersDirectoryByIds()` to `src/db/queries.js` for safe bounded basket lookups without introducing mutations or a new route family.
- Added `scripts/smoke-admin-web-users-bulk-contract.js`, wired it into `package.json` and source preflight.

Acceptance / notes:
- `current filter` copies stay bounded by the existing 10 000-row export cap; basket copies are bounded to 500 explicit ids.
- Scope stays non-destructive: copy-only utilities, no bulk edits, no payout/payment mutations, no public-flow changes.



## STEP526 — Users compare drill actions polish
- Strengthened the existing `Users compare / pin rail` with a compact drill-actions layer in `scripts/admin-web.js`, so pinned sets can now immediately `export`, `copy tg_id / usernames / user_id`, and open the most relevant pinned card (`top problem` or `dormant payer`) without manual reconfiguration.
- Reused the existing audited `users_bulk` contract for pinned-copy actions by passing explicit pinned ids through the same `section=users_bulk` path; no new write surfaces or destructive bulk actions were introduced.
- Extended `src/lib/adminWeb/usersExport.js` and `api/admin-web-read.js` so the existing `users_export` path now also supports explicit-id snapshots (`ids_snapshot`) for safe `CSV pinned snapshot` exports with audit metadata.
- Enriched compare-card read models with `problemScore`, `problemDesc`, and `isDormantPayer` in `src/lib/adminWeb/readModels.js`, keeping all heuristics transparent and based only on already existing users-directory signals.
- Added compare drill-action styling plus `scripts/smoke-admin-web-users-compare-drill-actions-contract.js`, wired into `package.json`.

Acceptance / notes:
- Scope stays read-only and reversible: no backend mutations, no destructive bulk, no DB persistence, no new route family, no public-flow changes.
- Compare drill actions intentionally operate only on the bounded pinned set (max 5 users), preserving the lightweight ops-review character of the compare rail.


## STEP525 — Users compare / pin rail
- Extended the existing users URL state-contract with `pins=...`, so temporary compare selections now survive refresh / reopen together with the current search / filter / sort / cohort slice.
- Added a compact `Users compare / pin rail` above the table in `scripts/admin-web.js`, including `Очистить pins`, side-by-side compare cards, and row-level `Pin / Pinned` quick actions without introducing a separate compare page.
- Added lightweight compare-card data assembly in `src/lib/adminWeb/readModels.js` using existing user-card, note, workspace, and payment summary signals; no new write paths and no DB persistence were introduced.
- Added compare-rail styling in `styles/admin-web.css` plus `scripts/smoke-admin-web-users-compare-pin-rail-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- Scope stays read-only and reversible: no backend mutations, no background jobs, no custom compare storage, no public-flow changes.
- Compare is intentionally bounded to 5 users and designed for temporary manual ops review, not long-lived saved review boards.


## STEP524 — Users URL-persisted working views
- Upgraded `/admin/users` so the current users state-contract (`q`, `segment`, filter rail, `sortBy`, `cohortView`, `page`, `pageSize`) is mirrored into the page URL instead of living only in `window.__usersState`.
- Added client helpers in `scripts/admin-web.js` to read users state from URL, normalize it, rebuild canonical users list links, and sync the current working slice back into `location.search` without introducing any backend persistence.
- Added a visible `Users URL-persisted working views` status + `Скопировать ссылку на срез` action in the sticky controls area so operators can quickly reuse or share the exact same admin slice.
- User-card drilldowns now carry a `back=` link built from the active users slice, so returning from `/admin/users/[id]` lands back on the same filtered/paginated working view instead of resetting to the base list.
- Added `scripts/smoke-admin-web-users-url-persisted-views-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- Scope stays read-only and reversible: no DB persistence, no backend write expansion, no new route family, no public-flow changes.
- The URL is now the transport for working views, so refresh / reopen / shareable admin links all reopen the same users slice without relying on ephemeral page memory.


## STEP523 — Users saved operator presets
- Added a dedicated `Users saved operator presets` rail to `/admin/users`, positioned between the cohort rail and filter rail, so operators can return to the most useful working slices in one click instead of rebuilding the same control combinations manually.
- Presets stay intentionally read-only and simply replay the existing users state-contract (`q`, `segment`, `planState`, `creditsState`, `channelState`, `activityWindow`, `paymentsState`, `sortBy`, `cohortView`) with built-in slices for `Все · новые`, `Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, and `Quiet creators`.
- Added active preset detection in `scripts/admin-web.js`, so the page shows the current built-in preset when the state matches one exactly and falls back to `Custom slice` as soon as the operator manually drifts away from that preset.
- Added compact preset-card styling in `styles/admin-web.css` and a new source smoke guard `scripts/smoke-admin-web-users-saved-presets-contract.js`, wired into `package.json` and source preflight.

Acceptance / notes:
- Scope stays read-only and reversible: no backend mutations, no new route family, no DB persistence for custom views, no public-flow changes.
- Presets intentionally reset search/page to a clean working slice so operators can get back to a known cohort/filter state in one click.


## STEP522 — Users sticky table controls / pagination polish
- Added a sticky control stack to `/admin/users` so the main operator rails (search/segment, sort, cohort, filter rail, and basket/page meta) stay visually pinned during longer manual ops sessions instead of drifting off-screen.
- Added a bounded pagination contract to the users read model: the page now requests and renders `page`, `pageSize`, `total`, `totalPages`, `fromRow`, and `toRow` instead of hardcoding one 20-row slice.
- Upgraded `listUsersDirectory()` with filtered `count(*) over()` total tracking and surfaced that through `getUsersList()` as `pagination`, while keeping the step read-only and inside the existing users contract.
- Added top/bottom pagination controls, page-size switching (20 / 35 / 50), and sticky table headers; the users list now scrolls inside its own surface via `aw-users-table-wrap` for steadier scan-work.
- Added `scripts/smoke-admin-web-users-sticky-pagination-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- Scope stays read-only: no new mutations, no background jobs, no public-flow changes, no custom persistence.
- Basket state remains client-side and continues to work across page navigation inside the same admin-web session.


## STEP521 — Users row quick actions
- Added compact row quick actions directly inside the user identity cell in `/admin/users`: `Карточка`, `tg_id`, `username`, and `В корзину` / `В корзине`.
- Reused the existing `/admin/users/[id]` route for card open, the audited `section=users_bulk` path for single-row copy actions, and the existing client-side selection basket contract for basket toggle.
- Added minimal dedicated styling in `styles/admin-web.css` (`aw-row-actions`, `aw-row-action`) so the new actions stay scan-friendly and do not introduce a new noisy column.
- Added `scripts/smoke-admin-web-users-row-actions-contract.js`, wired into `package.json` and source preflight.

Acceptance / notes:
- Scope stays read-only / copy-only: no destructive actions, no backend write expansion, no public-flow changes.
- Row click remains intact; quick actions simply make the most common operator moves explicit and faster.


## STEP520 — Users action-ready follow-up rail

- added a compact operator follow-up block to `/admin/users` with ready-made actions for `CSV current slice`, `copy tg_id`, `copy usernames`, `open top problem users`, and `open dormant payers`;
- reused only existing safe contracts: `users_export`, `users_bulk`, `sortBy=problem_desc`, and `cohortView=dormant_payers` + `sortBy=payments_desc`;
- kept the new layer read/copy-only and reused the same admin-web audit trail for copy/export actions;
- added `scripts/smoke-admin-web-users-followup-rail-contract.js` and wired it into `package.json` + `scripts/preflight.js`.

## STEP519 — Users cohort counters / mini topline
- Added a server-backed `Users cohort counters / mini topline` above the existing cohort chips in `/admin/users`, so operators get immediate small counters for `Все`, `Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, and `Quiet creators`.
- Added `getUsersDirectoryCohortCounters()` in `src/db/queries.js`, reusing the same bounded users-directory contract and cohort predicates but intentionally forcing `cohortView=all` for the aggregate pass so the counters keep showing the full working breakdown even when one cohort is active in the list below.
- Extended `getUsersList()` in `src/lib/adminWeb/readModels.js` to return `cohortTopline` / `filterRail.cohortCounters`, then rendered those counters as clickable mini cards in `scripts/admin-web.js` with dedicated styling in `styles/admin-web.css`.
- Added `scripts/smoke-admin-web-users-cohort-counters-contract.js`, wired into `package.json` and source preflight.

Acceptance / notes:
- Scope stays read-only and reversible: no new write paths, no background jobs, no custom saved-view persistence.
- Counters follow the current search / segment / filter rail, but deliberately ignore the currently active `cohortView` so the operator still sees the full cohort distribution while drilling into one slice.


## STEP518 — Users operator cohort chips / saved views
- Added a dedicated `Users operator cohort chips / saved views` rail to `/admin/users`, positioned next to the sort / priority rail, with built-in cohort views for `Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, and `Quiet creators`.
- Extended the normalized users-directory contract with `cohortView`, shared across list render, CSV export, bulk-copy payloads, and admin-web audit reasons so operator slices stay consistent across all read surfaces.
- Added bounded SQL cohort predicates in `src/db/queries.js` using only existing baseline signals (`payments_count`, `has_channel`, `brand_plan`, `last_known_activity_at`, creator/brand presence) instead of introducing a new analytics layer.
- Updated CSV export to include `cohort_view` metadata and cohort-aware filenames, and updated bulk/export audit reasons to record the active cohort alongside filters and sort order.
- Added `scripts/smoke-admin-web-users-cohort-rail-contract.js` and wired it into `package.json` + `scripts/preflight.js`.

## STEP517 — Users sort / priority rail
- Added a dedicated `Users sort / priority rail` to `/admin/users` with one-click presets for `Новые`, `Свежие`, `Платящие`, `Тихие`, and `Проблемные`, plus an explicit `usersSortBy` select for the same contract.
- Extended the normalized users-directory filter contract with `sortBy`; list, CSV export, and bulk-copy read paths now share the same ordering instead of diverging silently.
- Upgraded the shared users SQL meta projection with `payments_count`, `last_payment_at`, and a bounded `problem_score`, then reused the same order contract in `listUsersDirectory()` and `exportUsersDirectory()`.
- Surfaced stronger row hints in the users table (`pay xN`, `banned`, `risk / attention`) so the new sort modes remain explainable and operator-readable.
- Added `scripts/smoke-admin-web-users-priority-rail-contract.js`, wired into `package.json` and source preflight.

Acceptance / notes:
- Scope stays read-only: no new write surfaces, no user mutations, no background jobs, no public-flow changes.
- `problem_desc` is intentionally conservative and transparent: banned / paid-no-channel / plan-no-channel / stale credits.


## STEP516 — Users table hierarchy polish
- Rebuilt the `/admin/users` row layout so the list now has a clearer scan order: identity → compact stats → signals → `Last activity` → created time.
- Added compact stat chips in `scripts/admin-web.js` for plan, credits, note presence, signal roles, and activity freshness; split `Last activity` into its own explicit column.
- Added dedicated styling in `styles/admin-web.css` (`aw-users-table`, `aw-user-cell`, `aw-inline-chips`, `aw-stat-chip`) so the list reads as a denser operator control surface instead of a raw directory.
- Added `scripts/smoke-admin-web-users-hierarchy-contract.js`, wired into `package.json` and source preflight.

Acceptance / notes:
- UI-only step: no SQL changes, no new API reads/writes, no public-flow impact.
- The goal is scan speed and hierarchy discipline, not new data or new mutations.


## STEP515 — Users filter rail v2
- Added a second `Filter rail v2` layer to `/admin/users` with explicit operator filters for `есть план / нет плана`, `есть кредиты / нет`, `есть канал / нет`, `активность 7/30/90`, and `payments yes/no`.
- Unified list, CSV export, and bulk-copy filtering through `normalizeUsersDirectoryFilters()` + shared SQL parts in `src/db/queries.js` so every read path uses the same bounded contract.
- Added a lateral `meta` projection for `has_channel`, `has_payments`, and `last_known_activity_at`; the users table now surfaces stronger quick signals without adding any write actions.
- CSV exports now include `has_channel`, `has_payments`, and `last_known_activity_msk`, while admin-web audit reasons preserve the applied filter rail.
- Added `scripts/smoke-admin-web-users-filter-rail-contract.js`, wired into `package.json` and source preflight.

Acceptance / notes:
- Scope stays read-only: no destructive bulk actions, no background jobs, no new public bot flows.
- `activity` is defined as latest known signal across user/account/workspace/payment surfaces already present in the baseline schema; no dependency on optional analytics tables.


## STEP535A — Users preset/copy polish
- sharpened `Users` preset cards so they behave like explicit one-click actions (`Открыть срез` / `Сейчас открыт`) instead of passive tiles;
- added `focusUsersWorkingSlice()` so after preset apply the screen visibly returns attention to the active working slice;
- replaced browser-only copy failure behavior with an in-app manual copy sheet (`awCopySheetHost`) for Users URL / bulk / row-copy flows;
- tightened basket/meta pill styling to avoid awkward circular bubbles on narrower widths;
- added `scripts/smoke-admin-web-users-preset-copy-polish-contract.js` and wired it into package scripts.

- Web admin asset cache-bust (STEP535C): `admin.html` now references `/styles/admin-web.css?v=20260403-step535d` and `/scripts/admin-web.js?v=20260403-step535d` so fresh deploys stop reusing stale/broken admin assets in browser cache.


## STEP535E — Runtime status semantics + actionability pass
- normalized `/admin/runtime` around one operator-readable semantic model: `OK / Нужна проверка / Не настроено / Справочно` instead of a mixed raw-status feel;
- added shared semantic helpers in `src/lib/adminWeb/runtime.js` so `statusHierarchy`, `incidentStrip`, `queueClarity`, `retrySignals`, `controlSnapshot`, and `configPresence` now all expose `semanticLabel`, `actionability`, `meaning`, and `nextStep`;
- rebuilt Runtime cards in `scripts/admin-web.js` so every key contour answers three questions directly: what state it is in, whether action is needed, and what to check next;
- made config presence explicitly separate required missing env from optional / not-enabled informational gaps;
- added `scripts/smoke-admin-web-runtime-semantics-contract.js`, wired it into `package.json` + `scripts/preflight.js`, and bumped admin asset cache-bust to `step535e`.


## STEP543A — web-admin mobile shell / responsive pass

- `admin.html`, `scripts/admin-web.js`, and `styles/admin-web.css` now ship a narrow mobile-first shell pass instead of desktop-only collapse: the admin shell gets a real mobile nav toggle, overlay drawer behavior on phone widths, and route-close behavior after section switches.
- shared responsive surfaces were tightened without changing admin routes or data contracts: topbar wraps cleanly, page heads/card paddings compress on narrow widths, multi-column overview/runtime/founder/payments grids collapse to one column in reading order, and the shared action rows/chips remain touch-usable.
- `Users` was not rewritten into a card feed; instead the existing working slice received mobile-safe layout handling only (`sticky` relaxed on small widths, compare rail/table meta/pagination/actions stack cleanly, table overflow remains controlled instead of layout-breaking).
- added `scripts/smoke-admin-web-mobile-shell-contract.js`, wired into `package.json` + `scripts/preflight.js`, and bumped the admin-web asset cache-bust to `step543a`.

Acceptance / notes:
- scope stays UI-only for web-admin shell/responsive behavior; no API, auth, bot-layer, or backend write-path changes;
- live browser verification on a real phone is still required for final touch ergonomics and drawer feel.


## STEP543B — web-admin Users mobile working-slice pass
- tightened Users mobile behavior without rewriting the Users surface into a card feed.
- stacked Users filters/export controls into single-column mobile actions, made priority/cohort/preset/action rails mobile-readable, widened basket/meta pills to full-width rows, and normalized compare/pagination/table overflow behavior for narrow screens.
- added `scripts/smoke-admin-web-users-mobile-contract.js`, wired it into `package.json` + `scripts/preflight.js`, and bumped the admin asset cache-bust to `step543b`.


## STEP543C — mobile consistency follow-up
- Mobile admin shell tightened for consistent phone-width behavior across section navigation.
- At <=720px shell now collapses to a true 1-column layout; sidebar drawer no longer leaves a phantom 260px grid column.
- Topbar stacks cleanly on phone widths, chips/buttons stop forcing inconsistent widths, and mobile inputs/textareas use 16px font-size to avoid iOS zoom jumps.
- Users narrow-phone table floor reduced from 880px to 840px to reduce aggressive overflow while preserving horizontal scroll.


## STEP545 — Overview / Runtime truth alignment
- `src/lib/adminWeb/readModels.js` now derives `overview.cards.runtimeWarnings` from `runtime.summaryCards.check` instead of the raw `runtime.notes.length`, so stale/historical retry notes no longer inflate the Overview warning counter.
- `scripts/admin-web.js` now computes Overview warning severity through `overviewRuntimeWarnings(model)` using the same canonical Runtime truth: fresh degraded/missing runtime still raises warning, but a healthy Runtime with only historical notes now renders as calm/OK.
- Added `scripts/smoke-admin-web-overview-runtime-truth-contract.js`, wired it into `package.json` + `scripts/preflight.js`, and bumped the admin asset cache-bust to `step545`.

## 0.06) Collabka invite rewards contract freeze (STEP549, docs-only)

### Status
- Type: docs-only freeze
- Code changes: none
- Runtime changes: none
- Migrations: none
- Confidence: product-spec / docs-level only

### Why this freeze exists
Collabka already has a working invite layer with:
- Invite surface
- personal deep links
- invite attribution
- counters `Invited / Activated`

This freeze adds a narrow rewards contract on top of that invite layer without changing runtime behavior yet.

The purpose is to prevent ad-hoc growth mechanics and lock the reward logic around meaningful referral outcomes instead of raw opens or noisy traffic.

### Core principle
Reward meaningful referral outcomes, not raw opens.

This means:
- raw open is not rewarded
- existing-user hit is not rewarded
- self-invite is not rewarded
- the main reward signal is activation quality

### Frozen event → points contract
- `raw_open` → `0`
- `existing_user_hit` → `0`
- `self_invite` → `0`
- `invited_joined` → `+2`
- `invited_activated` → `+10`

### Pending / confirmed rules
Rewards are not considered final immediately.

- `invited_joined`:
  - first becomes `pending`
  - becomes `confirmed` after 24h

- `invited_activated`:
  - first becomes `pending`
  - becomes `confirmed` after 48h

### Activation meaning for Collabka
Default activation freeze for Collabka:

- `Activated = completed profile`

This is intentionally kept narrow for the first reward contract version.

### Balance model
The reward layer must be based on 3 values:

- `Available points`
- `Pending points`
- `Redeemed points`

Interpretation:
- available = confirmed and not yet redeemed
- pending is not spendable
- redeemed is already consumed

### Main display surfaces
Primary surface:
- Invite screen

Invite screen should eventually show:
- `Invited`
- `Activated`
- `Collabka points`
- `Pending`
- `Redeemed`
- `Next reward`

Secondary surface:
- Profile

Profile should only show a short balance line:
- `Points balance`

### Frozen redeem catalog
Start narrow and product-native.

Default starter catalog:
- `100 points → 7 days Pro`
- `250 points → 30 days Pro`

No money rewards.
No token rewards.
No multi-level referral.
No cashout.

### Anti-abuse rules
The following rules are part of the frozen contract:

- no reward for raw open
- no reward for self-invite
- no reward for existing user
- one invited user can produce join reward only once
- one invited user can produce activation reward only once
- pending points are not spendable
- reward logic should rely on a ledger, not only on a single balance number
- reward records should support statuses:
  - `pending`
  - `confirmed`
  - `rejected`
  - `redeemed`


## 0.07) Collabka invite rewards runtime (STEP551)

### Status
- Type: runtime + docs
- Code changes: yes
- Runtime changes: yes
- Migrations: `046_invite_reward_ledger.sql`
- Confidence: source-confirmed; live verification still required

### What is live now
Collabka invite rewards are now implemented on top of the existing invite layer.

The runtime now supports:
- pending invite rewards ledger
- lazy pending → confirmed progression
- available balance unlock
- balance readouts in Invite + Profile
- reward redemption into narrow Pro perks

### Event → points runtime contract
- `raw_open` → `0`
- `existing_user_hit` → `0`
- `self_invite` → `0`
- `invite_join` → `+2` pending, confirm after 24h
- `invite_activation` → `+10` pending, confirm after 48h

### Activation meaning
Current runtime activation stays aligned with the frozen contract:
- completed brand profile (basic 4 fields), or
- completed creator profile (title, contact, verticals, formats, portfolio, about)

### Balance model
Runtime balance now uses:
- `Available points`
- `Pending points`
- `Redeemed points`

Invite screen now shows:
- `Invited`
- `Activated`
- `Collabka points`
- `Pending`
- `Redeemed`
- `Next reward` / reward-ready state

Profile surfaces now show a short balance line.

### Redeem catalog now live
- `100 points → 7 days Pro`
- `250 points → 30 days Pro`

### Current redeem target rule
To keep the scope narrow and production-safe:
- if the user has a brand profile → redeem applies to brand plan Pro
- otherwise, if the user owns a workspace → redeem applies to workspace Pro on the primary owned workspace
- otherwise fallback stays brand-plan Pro

### Anti-abuse rules in runtime
- no reward for raw open
- no reward for self-invite
- no reward for existing user
- one join reward per invited user max once
- one activation reward per invited user max once
- pending points are not spendable
- redeem is guarded by a DB advisory xact lock

### Scope intentionally not added
Still out of scope:
- cashout
- token rewards
- money rewards
- leaderboards
- multi-level referral
- broad campaign/gamification layer

### Practical baseline decision
Current decision for Collabka:

- keep invite rewards as a future implementation layer
- do not ship runtime reward logic yet
- do not expand into broad gamification
- keep the contract narrow, quality-based, and product-useful

### Implementation rule going forward
No invite rewards implementation should be added directly until it follows this frozen contract:

- reward meaningful activation, not raw opens
- keep anti-abuse explicit
- keep redemption narrow and product-native
- preserve the clean Telegram-native invite UX



## 0.08) Broadcast docs pack embedded into repo (STEP552A, docs-only)

### Status
- Type: docs-only hotfix
- Code changes: none
- Runtime changes: none
- Migrations: none
- Confidence: docs/reference-level only

### What was added
The repo now contains an embedded broadcast documentation/reference pack based on the current Collabka broadcast layer.

Added docs:
- `docs/105_COLLABKA_BROADCAST_RUNBOOK_RU.md`
- `docs/106_BROADCAST_CANON_REUSABLE_RU.md`
- `docs/107_BROADCAST_CODE_MAP_RU.md`
- `docs/108_BROADCAST_BUILD_ORDER_REUSABLE_RU.md`
- `docs/examples/broadcast/*`

### Purpose
This pack exists so the broadcast layer can be:
- operated correctly in Collabka
- reused in future Telegram bots/projects
- explained from admin action to delivery/runtime path without re-deriving the pattern each time

### Scope boundary
This STEP does **not** change broadcast runtime behavior.
It only embeds the docs/examples pack into the repo so the current baseline and future projects can reuse the same runbook/canon/build-order references.

### Practical rule going forward
For broadcast-related work:
- use `105_COLLABKA_BROADCAST_RUNBOOK_RU` for current-project operator flow
- use `106_BROADCAST_CANON_REUSABLE_RU` for reusable design rules
- use `107_BROADCAST_CODE_MAP_RU` to find source entrypoints
- use `108_BROADCAST_BUILD_ORDER_REUSABLE_RU` when rebuilding the same layer in another bot/project
- treat `docs/examples/broadcast/*` as reference examples, not live runtime source of truth

## 0.12) Broadcast mode semantic rename polish (STEP557)

### Status
- Type: UI label polish hotfix
- Code changes: narrow
- Runtime changes: none
- Migrations: none

### What changed
The broadcast dual-mode logic stays the same, but the operator-facing names now reflect the actual usage model instead of sounding reversed:

- current simple composer path → **Конструктор рассылки**
- current raw one-message path → **Быстрый пост**

Updated labels:
- `📣 Новая рассылка · Быстрая рассылка` → `📣 Новая рассылка · Конструктор рассылки`
- `📣 Новая рассылка · Расширенный режим` → `📣 Новая рассылка · Быстрый пост`
- `⚙️ Расширенный режим` → `⚡ Перейти в быстрый пост`
- `⬅️ Быстрая рассылка` → `🧩 Перейти в конструктор`

### Why
The previous rename fixed dev-like English labels, but the mode semantics still read backwards in operator UX:
- the field-by-field composer looked more like a constructor than a “fast send”
- the raw single-message path looked more like a quick post than an “advanced mode”

This hotfix fixes naming only, so the current UI now reads by actual operator workflow.

### Scope
This step does **not** change:
- draft logic
- preview behavior
- send routing
- outbox truth
- queue / retry / QStash behavior
- callback contracts

This is naming polish only.

## 0.11) Broadcast mode label polish (STEP556)

### Status
- Type: UI label polish hotfix
- Code changes: narrow
- Runtime changes: none
- Migrations: none

### What changed
The broadcast composer keeps the same logic and routing introduced in STEP554, but operator-facing mode labels are now clearer:

- `Simple mode` → `Быстрая рассылка`
- `Advanced mode` → `Расширенный режим`
- `⬅️ Simple mode` → `⬅️ Быстрая рассылка`
- `⚙️ Advanced mode` → `⚙️ Расширенный режим`

### Why
The old labels were technically correct but too dev-like for everyday operator work. The new labels keep the same dual-mode model while making the choice read as:
- fast default path for ordinary sends
- secondary flexible path for more manual composition

### Scope
This step does **not** change:
- draft persistence
- preview behavior
- send routing
- outbox truth
- queue / retry / QStash behavior
- callback contracts

This is label polish only.

## 0.10) Broadcast simple composer + honest preview (STEP554)

### Status
- Type: narrow runtime/product step
- Code changes: yes
- Runtime changes: yes
- Migrations: none
- Confidence: source-confirmed; live operator smoke still required

### What changed
Broadcasts now have a dual-mode compose contract:
- **Simple mode** is the default path for `📣 Новая рассылка`
- **Advanced mode** remains available as a secondary power path

Simple mode supports:
- text only
- image only
- image + text
- optional **1 URL button**
- explicit `👁 Preview`
- send through the existing outbox/queue layer

Advanced mode is preserved and capped at **up to 3 URL buttons** in the shared delivery plan.

### Honest preview contract
`👁 Preview` now sends a **real self-preview** to the operator chat instead of relying only on text description inside the composer screen.

Preview uses the same routing contract as real delivery, but does **not** enqueue recipients and does **not** create a broadcast row.

### Smart routing contract
A shared delivery-plan helper is now used both by preview and real delivery:
- text only → `sendMessage`
- image only → `sendPhoto`
- image + short text → `sendPhoto` with caption
- image + long text → `sendPhoto` first, then separate text message
- button present → attach inline keyboard to the message/split leg that should carry the CTA

Simple mode uses a caption-safe threshold instead of pushing captions to the hard Telegram limit.

### Draft / button contract
Simple mode keeps a visible draft with separate operator inputs for:
- text
- media
- button
- audience
- preview
- send
- clear draft

Simple mode allows **1 URL button**.
Advanced mode allows **up to 3 URL buttons**.

Button presets/shortcuts were added for reuse-first operator flow:
- Open bot
- Open app
- Open landing
- Open profile
- Open plans
- Open catalog
- Open offers
- Open feed

### Outbox truth polish
Broadcast view now explicitly shows:
- draft type
- media: yes/no
- button: yes/no
- recipients / sent / failed / pending
- created / started / finished timestamps

This is an outbox/read-surface improvement only; queue/retry/runtime semantics remain the same.

### Scope boundary
This STEP does **not** change:
- QStash fan-out architecture
- queue/retry engine
- outbox schema
- broadcast recipient truth
- album support
- unlimited buttons
- broad admin redesign

### Live verification still required
After deploy, operator smoke should cover at least:
- text-only broadcast
- image-only broadcast
- image + short caption
- image + long text split
- simple mode with 1 button
- advanced mode with existing power path still intact

## 0.09) QStash broadcast flow-control key hotfix (STEP553)

### Status
- Type: narrow runtime hotfix
- Code changes: yes
- Runtime changes: yes
- Migrations: none
- Confidence: source-confirmed; live broadcast rerun still required

### Problem
Broadcast enqueue via QStash could fail with:

`flowControlKey must be alphanumeric, hyphen, underscore, or period`

because `getBroadcastFlowControl(broadcastId)` emitted a key with `:` (`broadcast:${id}`), while QStash now enforces a stricter allowed charset for `flowControl.key`.

### Fix
`src/lib/qstash.js` now emits a QStash-safe key format:

- before: `broadcast:${id}`
- after: `broadcast.${id}`

### Scope boundary
This hotfix does **not** change:
- broadcast payload/body
- recipient iteration
- deduplication behavior
- QStash schedule/cadence
- admin UI
- invite/rewards/runtime behavior outside the broadcast enqueue key

### Why this is safe
The change only touches one service key format used for QStash flow-control grouping.
It preserves human readability and grouping intent while removing the invalid character that caused enqueue rejection.

### Live verification still required
After deploy, rerun a real admin broadcast and confirm:
- no new `qstash_publish_failed` for invalid `flowControlKey`
- broadcast fan-out starts queueing normally
- broadcast delivery progresses without this QStash validation error

## 0.10) Upstream import — compact callback canon/helper port for comms admin (STEP560)

### Status
- Type: narrow runtime hardening step
- Code changes: yes
- Runtime changes: yes
- Migrations: none
- Confidence: source-confirmed; live admin-comms smoke still required

### What was imported
The first upstream runtime import for Collabka is now applied to the **comms admin layer**:
- central compact callback helper for broadcast / notice / outbox surfaces
- compact option codes for audience selection
- compact option codes for simple button presets
- compact option codes for broadcast blocked-tab routing
- backward-compatible callback decoding in the shared parser

### Why this import matters
Collabka already had strong operator UX, but comms admin callbacks were still assembled ad hoc in many places.

This step introduces a single helper/canon so the comms layer stops drifting callback-by-callback and stays safer under Telegram callback size limits.

### Scope
Applied to the comms admin surface only:
- broadcast composer
- broadcast audience picker
- broadcast preview
- broadcast list / view / blocked tabs
- system notice screen
- outbox list / outbox item view

### Backward compatibility
Old callback payloads remain valid.

`parseCb(...)` now decodes compact comms option codes into the same canonical values the runtime already expects, so both old and new messages/buttons continue to work.

Examples:
- audience codes decode back into `all / creators / brands / curators / managers`
- preset codes decode back into `bot / app / landing / offers / catalog / feed`
- blocked-tab codes decode back into `hard / all`

### What did not change
This step does **not** change:
- action names in the registry
- queue / retry / fan-out runtime
- broadcast payload semantics
- notice storage semantics
- outbox storage
- invite / rewards layer
- broad admin UX outside comms surfaces

### Live verification still required
After deploy, operator smoke should confirm:
- broadcast composer opens and navigates normally
- audience buttons still select the right audience
- simple button presets still resolve correctly
- broadcast blocked tabs still switch correctly
- system notice screen still works end-to-end
- outbox list and item view still open correctly


## STEP562 — Broadcast Draft Recap Layer

Status: implemented as a narrow runtime import on top of the current Collabka comms layer.

What was added:
- draft recap block inside `Конструктор рассылки`
- recap-before-send block inside broadcast preview/confirm screen
- dry-run sample targets for the current audience scope
- remembered default audience support for broadcast drafts
- preview-only warning clarifying that sample targets are only the first slice, not the full roster

What stays unchanged:
- delivery / queue / retry / fan-out infra truth
- QStash broadcast runtime
- outbox storage semantics
- simple vs quick-post composer logic
- existing callback keys and registry contracts

Operator contract now:
- composer shows source type / audience / target count / remembered default / sample targets
- preview repeats the recap before send
- audience selection updates the remembered default for the next draft
- new simple drafts and quick-post drafts start from the remembered default audience when available


## 0.08) STEP563 — Broadcast audit consistency hotfix

### What was source-confirmed and fixed
- simple-mode `bc_confirm` no longer depends on legacy `draft.type`; send now accepts simple drafts via `broadcastDraftHasContent(...)`
- post-create success screen now links directly to broadcast card and broadcast list
- broadcast audience picker no longer shows raw `simple/advanced`; it shows `Конструктор рассылки / Быстрый пост`
- broadcast detail view now keeps `🔄 Обновить` available for terminal states and keeps `🧱 Пропуски/ошибки` reachable when blocked rows exist

### What remains intentionally out of scope
- no queue/retry/fan-out rewrite
- no post-run compact report yet
- no quarantine UX import yet
- no first-batch safety layer yet


## 0.09) STEP564 — Compact post-run report

Status: implemented as a narrow runtime step on top of the current broadcast card / outbox truth.

What was added:
- compact `Post-run report` block on the broadcast success screen right after draft confirm
- compact `Post-run report` block inside broadcast detail view
- reason aggregation for top/dominant delivery reasons
- next-action hint driven by current delivery state
- explicit split between:
  - `sent`
  - `retry`
  - `skipped`
  - `failed`

What stays unchanged:
- queue / retry / fan-out runtime
- QStash delivery layer
- broadcast storage semantics
- blocked-report screen structure
- notice runtime
- admin routing outside broadcast surfaces

Current operator contract:
- after create, operator sees an immediate compact report seed with next action hint
- broadcast detail card shows a compact live/final report in one place
- dominant reasons are shown as top aggregated categories, not raw log spam
- next action is explicit instead of forcing operator to infer it from several screens

Known pre-existing drift:
- general callback-consistency script still reports older unresolved admin outbox callbacks unrelated to this step
- this drift is pre-existing and was not expanded by STEP564

## 0.10) STEP565 — First-batch safety + next-action hints

Status: implemented as a narrow operator-safety layer on top of the current broadcast composer and post-run report.

What was added:
- explicit `First-batch safety` block in broadcast preview / pre-send screen
- strengthened success-screen guidance right after broadcast creation
- `Next action hints` block inside broadcast detail view
- state-aware hints for:
  - first batch not yet seen
  - first wave looks clean
  - retry backlog exists
  - skipped / failed rows require cleanup review

What stays unchanged:
- queue / retry / fan-out runtime
- QStash delivery layer
- broadcast storage semantics
- outbox truth counters
- blocked subsystem and quarantine UX

Operator contract now:
- before send, the operator sees a short safety envelope telling them to wait for the first batch and verify report truth before acting further
- after create, the success screen already points to the first safe next actions
- inside broadcast card, next-action hints are driven by actual post-run counters rather than static copy alone


## 0.10) STEP568 — Support Operator Read Surface

Status: implemented as a narrow runtime layer on top of STEP567 support_threads foundation.

What exists now:
- admin entrypoint `🆘 Поддержка` from Admin Home and Communications
- compact support summary with buckets:
  - `open`
  - `waiting_operator`
  - `waiting_user`
  - `closed_recent`
- recent support threads on the summary screen
- paged support thread list by bucket
- support thread card with:
  - Thread ID
  - user label / tg id
  - current status
  - opened / last user / last operator timestamps
  - support message binding truth
  - last summary
  - next action hint
- quick operator actions from thread card:
  - reply
  - quick replies
  - user card (if available)

Scope discipline:
- this is a read-surface-first operator layer
- no web helpdesk
- no SLA engine
- no assignment matrix
- no bulk support actions
- no forum/topic redesign in this step

Implementation notes:
- support read surface is DB-truth based and should remain reachable independently of Redis-heavy admin flows
- reply-first Telegram UX remains unchanged; STEP568 only adds visibility and bucketed navigation on top of persisted support threads

Live smoke after rollout:
- open `🆘 Поддержка`
- open `Ждут оператора`
- open one thread card
- use `✍️ Ответить` and one quick reply
- verify status/readout updates after refresh


## STEP569 — Support close/reopen + canned replies polish

Status: runtime shipped
Risk: low-medium
Migrations: none

What changed:
- support thread card now has explicit close / reopen controls
- quick replies in support thread views now use shared admin DM templates (ack / need / wip / done) instead of isolated hardcoded copy
- quick reply labels stay aligned with the editable DM template layer
- support thread next-action copy now reflects close/reopen semantics more honestly

What did not change:
- user-side support intake UX
- support thread storage model introduced in STEP567
- support operator read surface buckets introduced in STEP568
- web helpdesk / SLA / assignment / topic routing

## 0.08) Support follow-up context hotfix (STEP570)

- After an operator support reply, the user can now respond with the **next freeform message** and it is auto-routed into the **same support thread**.
- `💬 Поддержка` remains as an explicit fallback entry, not the only continuation path.
- `📋 Меню` / `🏠 Home` clear the follow-up context and return the user to normal bot navigation.
- Media follow-ups (photo / document / video with optional caption) are also routed into the same thread.
- No migrations. No helpdesk redesign. Narrow UX/runtime hotfix only.

---

## STEP583 — Runtime Proof Spine (2026-07-18)

Status: local bounded runtime proof PASS.

Added deterministic proof for webhook auth/dispatch, representative callback delivery, Redis-down bounded fallback, and QStash ping breadcrumb convergence after transient Redis write failure.

Truth boundary: no live Vercel, Telegram, Neon, Upstash Redis or QStash environment was contacted.

Next recommended STEP: **STEP584 — Staging Runtime Acceptance Pack**.

## STEP584 — Staging Runtime Acceptance Pack

Implemented a bounded remote staging acceptance command (`npm run acceptance:staging`) with exact target acknowledgement, health GO/NO-GO evaluation, webhook/QStash negative-boundary probes, optional signed QStash convergence, and JSON/Markdown evidence. `/api/health` now exposes sanitized `qstash.ping.last_at/last_nonce` for deterministic readback. Local contract verified; real staging execution remains pending.
