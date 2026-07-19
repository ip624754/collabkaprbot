# STEP588 — Backoffice Productization Audit & Architecture

**Date:** 2026-07-19
**Parent:** STEP586H1
**Mode:** STANDARD + security review

## Scope

- inspect the complete web-admin source surface;
- classify current maturity;
- define target operator jobs and information architecture;
- define read/write/auth invariants;
- decide framework/ORM/API direction;
- create STEP589 implementation roadmap;
- restore stale admin-web source contracts.

## Changed runtime behavior

None.

## Test-truth fixes

- runtime hierarchy contract updated to current Russian label;
- runtime queue contract updated to current Russian labels;
- cache-bust contract now verifies non-empty matching CSS/JS versions instead of a stale hardcoded date;
- user-card contract updated to current headings, navigation helpers and read-model fields;
- users interaction-clarity contract updated to current copy and clickable cohort-card behavior;
- users rails-hierarchy contract updated to current rail and CSS structure;
- new backoffice productization contract added to `package.json` and `preflight:source`.

## Findings

- current web-admin is a strong backoffice foundation;
- Users/Runtime/Auth are mature;
- largest product gap is collaboration operations;
- broad web writes are blocked by lack of durable audit;
- ORM/framework rewrite is rejected;
- collapsed API is retained because of Vercel budget and lower blast radius.

## Verification

- targeted admin/admin-web/backoffice contracts: 54/54 PASS;
- documentation links and JSON manifest: PASS;
- runtime code unchanged apart from tests/docs;
- live web-admin: not verified.
