# STEP591 QA Evidence Summary

## Baseline

- canonical parent commit: `10042b52519ee043e812ea541e34c0c5ff39248e`;
- package before: `1.3.38`;
- package after: `1.3.39`;
- runtime/API/SQL/ENV/callback/product behavior delta: none.

## Verified

- STEP591 rebaseline checker: PASS `17/17`;
- STEP591 source contract: PASS `17 assertions`;
- STEP590I architecture mutation tests: PASS `11 assertions`;
- STEP590I architecture source contract: PASS `15 assertions`;
- STEP590H admin-web decomposition regression: PASS `154 assertions`;
- architecture checker: PASS `16/16`;
- full `preflight:source`: PASS under temporary execution-only `dotenv` and `@upstash/redis` shims;
- portable critical spine: PASS `6/6` under the same temporary shims;
- package-lock parity: PASS;
- function budget: PASS, `11/12`, delta `0`;
- diff scope: documentation, package metadata and source-only QA scripts only;
- temporary shims and `node_modules`: removed before packaging.

## Dependency limitation

Artifact-side `npm ci` was attempted and failed before installation because the internal package mirror returned `404 Not Found` for `xtend@4.0.2`. Operator clean install and `npm audit` remain required.

## Production evidence inherited into the rebaseline

- STEP590I commit/push and clean parity accepted;
- `/api/health`: HTTP 200, `ready`, `GO`, database/Redis/payment payload verification `ok`;
- admin web desktop/mobile accepted;
- product snapshot: 21 users, 0 active offers, 0 active leads, 0 payment signals;
- control surface: payments, auto-apply, matching/featured and fan-out ON; payment fallback and Founder Sale OFF.

## Artifact parity

PATCH, HOTFIX and FULL are required to reconstruct the same source tree. Final parity and hashes are recorded outside the source tree in `STEP591_PARITY_RESULT.json`, `STEP591_TREE_SHA256.txt` and `STEP591_ARTIFACT_SHA256.txt`.
