# STEP590F — Repository Decomposition Audit Report

## Verdict

**SOURCE_ACCEPT_STEP590F_QUERIES_REPOSITORY_DECOMPOSITION_WITH_COMPATIBILITY_FACADE**

## Baseline and result

- baseline package: `1.3.31`;
- result package: `1.3.32`;
- original `src/db/queries.js`: 9,211 lines, 328 public exports;
- compatibility façade: 359 lines, 328 explicit public re-exports;
- bounded repositories: 9;
- public export drift: 0;
- SQL/body/transaction drift: 0 by reconstructed body SHA-256;
- new migrations/ENV/API functions/routes: 0.

## Controls

1. Exact reconstructed-body SHA-256 parity.
2. Explicit export ownership manifest and CSV.
3. No application imports of `src/db/repositories/*`.
4. No repository imports of `queries.js`.
5. Repository files included in `node --check` preflight.
6. Existing SQL-reading source contracts use the repository-aware source reader.
7. Portable critical-path spine remains 6/6 PASS.

## Residual risk

- The façade remains broad by design until consumers can be narrowed in STEP590I/STEP590J.
- Repository modules still share broad low-level DB/Redis capabilities because this step moves ownership without redesigning persistence APIs.
- A clean operator `npm ci` and runtime deployment remain required; artifact-side dependency installation is blocked by the package mirror, not source evidence.
