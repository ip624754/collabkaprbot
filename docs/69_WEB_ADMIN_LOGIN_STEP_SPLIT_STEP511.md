# STEP511 — Web Admin login step split + approve auto-return

Date: 2026-04-02

Scope:
- fixed the remaining web-admin login UX loop without changing the auth model (`secret -> Telegram approve/code -> session`);
- split the login page into two explicit phases: request step (`Admin secret`) and verify step (`Telegram approve / code`), so once a challenge exists the page no longer visually asks for the secret again;
- made the login page immediately re-check challenge status on load/persisted return, and redirect straight into `/admin` if a valid session already exists;
- upgraded the Telegram approve landing page so the approved browser window auto-returns into `/admin/login?challenge=...` and lets the login page finish session handoff automatically;
- tightened the login source contract via `scripts/smoke-admin-web-login-contract.js`.

Acceptance / notes:
- no new API entrypoints, no DB migrations, and no new auth factors were added;
- session issuance still happens only after `approved` challenge or valid OTP verification;
- login polling remains constrained to the login page only and is still manual-surface safe, not a general admin-page polling layer.
