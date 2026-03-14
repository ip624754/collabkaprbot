# 02 — `/api/health` + circuit breakers one-screen (STEP479)

Это короткий **боевой operator-layer**: открыл `/api/health` или Admin → Ops, увидел симптом, сделал **ровно один safe step**, потом сразу перепроверил health.

## 1) Как пользоваться этим файлом
1. Сначала смотри только `system_status`, `no_go_reasons[]`, `ops.digest_preview`.
2. Потом найди свой симптом в матрице ниже.
3. Сделай **один** safe action.
4. Сразу обнови `/api/health`.
5. Только если симптом не ушёл — иди глубже в runbook/logs.

Правило: **не лечить прод “на удачу” ручными повторами, если health уже показывает protective mode / cooldown / fallback banner.**

---

## 2) Матрица: trigger → symptom → field → safe action → rollback

| Trigger | Symptom / что видно | `/api/health` / Admin поле | Safe action | Rollback / toggle |
|---|---|---|---|---|
| Redis degraded | Красный баннер, массовые операции ведут себя осторожно, tick может откладываться | `redis.read_ok`, `redis.write_ok`, `redis.last_error`, `broadcast.tick_deferred_redis.*` | **Не запускать** новые большие broadcast / fan-out. Сначала восстановить Redis/Upstash. | Отдельного toggle нет. Возврат = дождаться `redis.read_ok=true` и `redis.write_ok=true`. |
| Broadcast pending snapshot stale | `pending_count` висит, age большой, в Admin → Ops есть STALE warning | `broadcast.pending_deliveries.pending_count`, `age_sec`, `stale_after_sec`, `stale` | Проверить `ops.digest_preview`, `broadcast.db_overload`, hard-skip всплески. **Не стартовать** новые большие рассылки до стабилизации. | Только если snapshot явно мусорный: `🧹 Clear pending snapshot`. Не использовать как первую реакцию. |
| Broadcast DB overload / cooldown | Доставка не ускоряется, возможны `429 + Retry-After`, local fuse/cooldown | `broadcast.db_overload.*`, `retry_after_sec`, `cooldown_until`, `local_fuse_active` | Дать системе “остыть”, не жать manual replay/deliver, проверить Neon/DB pressure. | Не форсить обход fuse. Возврат = после спада counters и исчезновения cooldown. |
| Payments fallback apply enabled | В Ops/System виден fallback banner, money path идёт через аварийный safe path | `payments.fallback_apply_runtime_enabled`, `payments.fallback_apply_effective`, `payments.fallback_apply_hours_active` | Если это **не осознанный инцидент** — сразу выключить runtime fallback. Если инцидент — держать только time-boxed окно и наблюдать. | Admin → `⚙️ Система` → `🧯 Payments fallback apply` → `🧹 Disable`. |
| Payments HMAC / payload problem | Оплаты приходят с bad sig / bad format / unsigned, либо HMAC key short/missing | `payments.payload_hmac_key_configured`, `payments.payload_hmac_minlen_ok`, `payments.payload_issues_today.*` | Это **NO-GO**. Исправить ENV / подпись / payload format. **Не лечить fallback apply.** | Rollback = вернуть рабочий ENV/deploy baseline. |
| QStash reschedule failed | Переотложенные задачи не уходят как должны, в Ops красный/жёлтый баннер | `qstash.reschedule_failed.*` | Проверить QStash keys/signing/delivery path. До стабилизации снизить активность массовых/публикационных контуров. | При затяжном сбое — временно держать контур в более ручном режиме; спорные runtime фичи выключить. |
| Official publish stuck | Публикация застряла в `PUBLISHING`, хочется “нажать ещё раз” | `qstash.official_publish_stuck.*` + карточка публикации | Сначала `🩺 Проверить статус`, дождаться verify/self-heal. **Не republish вручную первым ходом.** | При необходимости продуктовый rollback: `OFFICIAL_PUBLISH_ENABLED=false` до разбора. |
| Hard-skip spike | Доставка режется по `bot_blocked / chat_not_found / user_deactivated`, метрика всплеснула | Admin → `⚙️ Система` → `🧱 Hard-skip`, экспорт последних причин | Посмотреть reasons/export, отличить нормальный мусор чатов от новой ошибки доставки. | Точечный rollback только адресный: не снимать массово hard-skip без причины. |

---

## 3) Быстрый порядок чтения `/api/health`

### Сначала всегда
- `ok`
- `system_status`
- `no_go_reasons[]`
- `ops.digest_preview`

### Потом по контурам
- **Redis:** `redis.read_ok`, `redis.write_ok`, `latency_ms`, `last_error`
- **Payments:** `payload_hmac_minlen_ok`, `fallback_apply_effective`, `fallback_apply_hours_active`, `payload_issues_today.*`
- **Broadcast:** `pending_deliveries`, `db_overload.*`, `tick_deferred_redis.*`
- **QStash / publish:** `reschedule_failed.*`, `official_publish_stuck.*`

---

## 4) Чего не делать
- Не лечить `NO_GO` ручными реплеями “на всякий случай”.
- Не включать `Payments fallback apply` как универсальную кнопку починки.
- Не давить новые большие broadcast во время `stale` / `db_overload` / `cooldown`.
- Не обходить `🩺 Проверить статус` ручной перепубликацией.
- Не чистить `pending snapshot` первым действием, если не проверены overload / hard-skip / ops digest.

---

## 5) Куда идти глубже, если one-screen не хватило
- `docs/90_OWNER_RUNBOOK.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`
- `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
