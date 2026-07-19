# ADR-001 — Keep Static Admin, Collapsed API, No ORM Rewrite

**Status:** ACCEPTED in STEP588

## Context

Текущий web-admin уже содержит зрелые operator surfaces и работает в условиях Vercel function budget `11/12`.

## Decision

1. Оставить `admin.html` + ES module client + CSS.
2. Оставить три serverless admin endpoints.
3. Добавлять новые domains через `section` и `action`, а не новые API files.
4. Не внедрять ORM.
5. Не переходить на React/Next в ближайшей backoffice wave.
6. Разделять большие client/read-model файлы постепенно, только по touched domain.
7. Сохранять Telegram как authoritative path для рискованных mutations до отдельного safety STEP.

## Consequences

### Positive

- минимальный deploy surface;
- сохраняются текущие contracts;
- нет широкого rewrite;
- быстрый shipping;
- lower cold-start and dependency cost;
- легче доказать zero regression.

### Negative

- ручная модульность требует дисциплины;
- client state остаётся custom;
- SQL/read-model contracts нужно поддерживать source tests;
- framework conveniences отсутствуют.

## Revisit triggers

Решение пересматривается только если подтверждено одно из условий:

- более 12 активных top-level routes с независимыми teams;
- client bundle становится operational blocker;
- repeated state/render bugs не удаётся ограничить source contracts;
- Vercel/static delivery перестаёт удовлетворять performance;
- появляется отдельная full-time backoffice team.
