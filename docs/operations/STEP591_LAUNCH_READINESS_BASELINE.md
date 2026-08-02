# STEP591 — Launch Readiness and Operations Baseline

## Verdict

```text
TECHNICAL_PLATFORM_READY
MARKETPLACE_LIQUIDITY_NOT_PROVEN
MONETIZATION_NOT_PROVEN
BOUNDED_COHORT_LAUNCH_RECOMMENDED
```

## What is ready now

- production health is `GO`;
- database, Redis and payment payload verification are green;
- admin web is accepted on desktop and mobile;
- applications/deals/leads lifecycle has production acceptance;
- QStash delivery, retry workers, cron and audit-flush paths have production evidence;
- communications can draft, inspect and explicitly send;
- payments intake/auto-apply and matching/featured auto-apply are enabled;
- architecture boundaries are now executable gates.

## What is not proved

- marketplace supply: active offers are zero;
- marketplace demand: active leads are zero;
- paid conversion: payment signals are zero;
- official-channel publication: implementation exists, but state-changing production acceptance was intentionally not run;
- Instagram OAuth and verification activation;
- a fresh end-to-end creator + brand cohort after the STEP590 architecture cycle.

## Launch mode

Запуск должен быть **bounded, operator-led и explicit-only**:

1. один сегмент/ниша;
2. небольшая founding cohort;
3. ручная проверка профилей и офферов;
4. явные communications, без широкого mass send;
5. один реальный денежный canary после появления demand;
6. ежедневный owner review первые 7 дней.

## Daily owner checklist

- `/api/health` = `GO`;
- Runtime: нет новых degraded/unknown сигналов;
- Users: новые creator/brand cohorts и follow-up;
- Offers: количество активных, просроченных и пустых карточек;
- Leads/deals: новые, ожидающие ответа, accepted, stuck;
- Payments: received/applied/manual-review/orphaned;
- Communications: draft/queue/review/error/unknown;
- QStash/cron: retry/failure/DB overload;
- function budget остаётся `<=11`, новый API route без консолидации запрещён.

## Incident switches

| Switch | Baseline | Rule |
|---|---|---|
| Payment fallback | OFF | включать только по incident runbook и на bounded TTL |
| Founder Sale | OFF | включать только после утверждения offer/policy/deadline |
| Instagram routes/UI | OFF/PARKED | не включать в launch wave |
| Official publish | activation pending | только moderated canary с receipt |
| Broadcast | explicit-only | audience preview + operator confirm |

## Go / No-Go for inviting a cohort

**GO**, когда health green, creator profiles reviewed, минимум 5 offers live, communications message approved и owner назначен на ежедневный review.

**NO-GO**, если есть payment integrity warning, QStash delivery failures, uncontrolled mass-send path, missing owner, или supply ниже минимального cohort threshold.
