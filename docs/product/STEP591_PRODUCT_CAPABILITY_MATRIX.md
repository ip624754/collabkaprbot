# STEP591 — Product Capability Matrix

**Canonical parent:** `10042b52519ee043e812ea541e34c0c5ff39248e`
**Package:** `1.3.39`
**Program verdict:** `PRODUCTION_ACCEPT_STEP590I_ARCHITECTURE_GATES_AND_CLOSE_STEP590`

## Truth Boundary

Эта матрица объединяет только три типа evidence:

1. canonical source и executable contracts;
2. production health/QStash/Vercel evidence от оператора;
3. desktop/mobile browser evidence web-admin от 2026-08-02.

Она не выдаёт наличие кода за наличие рынка. Техническая готовность, включённость флага, реальное использование и коммерческое доказательство считаются разными состояниями.

## Production snapshot

| Сигнал | Состояние |
|---|---|
| Health | `200`, `ready`, `GO` |
| Database / Redis / payment payload verification | `ok / ok / ok` |
| Admin web | desktop + mobile accepted |
| Web login / payments / auto-apply / matching+featured / fan-out | ON |
| Payment fallback / Founder Sale | OFF |
| Users | 21 |
| Active offers / active leads | 0 / 0 |
| Payment signals / runtime warnings | 0 / 0 |
| Communications | 7 recent announcements, 22 sent, 0 queued/errors |
| Vercel function budget | 11 / 12 |

## Capability matrix

| Контур | Статус | Что доказано | Продуктовый вывод |
|---|---|---|---|
| Telegram entry и роли | Production reachable | webhook, auth и source contracts | годится для bounded launch cohort; свежий полный creator+brand journey ещё нужен |
| Creator workspace/profile/offers | Source verified, low activity | домены и UI существуют; offers=0 | проблема теперь не в коде, а в supply |
| Brand profile/directory/team | Source verified | bounded domains и ownership contracts | controlled beta ready; нужен свежий production mutation canary |
| Applications/dialogs/deals/leads | Production accepted | STEP590E1 + lifecycle contracts | главный launch wedge |
| Barter | Controlled beta | source/operator acceptance; mutation canary был waived | вторичный use case, не главный запуск |
| Directory/public workspace | Source verified | STEP590E3C contracts | discovery surface готова, но recent public canary не зафиксирован |
| Giveaways | Runtime ready | critical spine + cron 200 | запускать только после bounded draw canary |
| Communications/broadcast | Production operational | 7 announcements, 22 sent, G2 delivery acceptance | готовый канал активации founding cohort |
| Payments/Brand Plan/credits | Technically ready, commercially unproven | health/payment verification GO, auto-apply ON, atomicity contracts | следующий денежный gate — один реальный Stars payment |
| Matching/Featured | Enabled, no demand evidence | control surface ON + fulfillment contracts | не продвигать до появления offers/demand/payment proof |
| Official publish | Implementation ready, activation pending | reserve/deliver/verify workers accepted | включать отдельным moderated STEP |
| Admin web | Production accepted | desktop/mobile и backend 200 | owner control plane готов |
| Cron/QStash | Production accepted | signed canaries, cron 200, health | инфраструктурный контур готов |
| Founder Sale | OFF | Founder/admin snapshot | не является текущим launch offer |
| Payment fallback | OFF safe default | control surface | только incident recovery |
| Instagram OAuth | Parked/OFF | config + launch docs | не launch dependency |
| Verification | Flagged, activation not evidenced | moderation domain + safe default | ручной/operator режим до отдельного activation STEP |

## Главный вывод

Проект уже не находится в фазе «собрать ещё одну систему». Он находится в фазе **создать ликвидность и доказать конверсию**. Самые сильные технические контуры — admin, QStash, payments safety, applications/deals и communications. Самые слабые продуктовые сигналы — `0 active offers`, `0 active leads`, `0 payment signals`.

Поэтому после STEP591 broad refactor запрещён. Следующий приоритет — `STEP592_FOUNDING_COHORT_AND_MARKETPLACE_LIQUIDITY`.
