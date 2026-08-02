# INSTALL — STEP590F Queries Repository Decomposition

Baseline: STEP590E6, package `1.3.31`.

1. Extract the STEP590F HOTFIX into the repository root.
2. Do not combine HOTFIX and PATCH.
3. Run the required gates from `docs/operations/STEP590F_QUERIES_REPOSITORY_ROLLOUT_RUNBOOK.md`.
4. Confirm package `1.3.32`, 328 compatibility exports and 9 repositories.
5. Commit and push only after all local gates pass.

This step has no migrations, ENV additions, callback changes or production data mutations.
