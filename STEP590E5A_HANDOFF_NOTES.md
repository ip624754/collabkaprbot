# STEP590E5A Handoff

- Baseline: `606028d`.
- Package: `1.3.27`.
- New domain: `src/bot/domains/moderation/`.
- Scope: 10 callbacks, routes `moderation_reports` (6) and `moderation_verification` (4).
- Ownership: 369 extracted / 191 legacy / 7 aliases / 0 unresolved.
- Hardening: malformed/non-positive `rid`/`uid` cannot reach durable mutations.
- No migrations, ENV, API route, callback key, guard or visible-copy change.
- Operator gate: clean npm install/audit, QA, commit/push, Vercel Ready and bounded disposable moderation smoke.
- Next: STEP590E5B Admin Users, Support & Moderator Governance.
