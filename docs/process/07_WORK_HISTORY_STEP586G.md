# Work History — STEP586G

**Date:** 2026-07-18
**STEP:** STEP586G — Admin and Operator Vocabulary
**Mode:** STANDARD with operational and authorization review
**Baseline:** STEP586F
**Status:** IMPLEMENTED / LOCAL QA PASS / LIVE OPERATOR UX NOT VERIFIED

## Objective

Make primary Telegram admin and web-admin actions readable while preserving exact production diagnostics and every existing control boundary.

## Runtime and UI changes

- aligned Telegram communication hub labels around announcements, personal-message templates, outgoing messages and official-channel moderation;
- rewrote broadcast composer, preview, first-party safety, result and follow-up copy;
- normalized outgoing-message and personal-message-template terminology;
- aligned admin system controls around web login, payment fallback, automatic entitlements, QStash delivery and unavailable chats;
- translated moderation actions, giveaway log and audit labels;
- added human hard-skip labels and filters while retaining raw hard-skip diagnostics;
- aligned web-admin communications, drafts, announcements, outgoing snapshot and test-send language;
- changed login confirmation copy to human language while preserving signed `approve / deny` decisions;
- kept Redis, QStash, raw statuses, reason codes, callback IDs and table names in diagnostic blocks.

## Source enforcement

Added:

```text
scripts/smoke-admin-operator-vocabulary-contract.js
npm run smoke:admin-operator-vocabulary-contract
```

The contract is included in `preflight:source`.

Existing admin, web-admin, broadcast, hard-skip and audit contracts were updated to assert the new visible labels and unchanged control identities.

## Preserved mechanics

- callback values and destinations;
- action-registry guards;
- administrator, moderator, curator and founder permissions;
- broadcast audience values and queue state machine;
- QStash, Redis, Neon and hard-skip behavior;
- login signatures and `approve / deny` decisions;
- payment and entitlement behavior;
- schema and migrations.

## QA boundary

Verified locally:

- dedicated and affected source contracts;
- STEP586A–F regressions;
- callback registry: 553 references / 559 keys / 0 unresolved;
- dependency/runtime preflight;
- local runtime proof spine and staging acceptance source contract;
- package-lock and function-budget checks;
- complete parallel syntax sweep: 224 JavaScript files;
- `npm audit --audit-level=high`: 0 vulnerabilities.

Canonical `npm run preflight:source` passed every reached assertion, registry and generator gate, then exceeded the execution limit during its long sequential syntax sweep. The full syntax surface passed separately; the aggregate command did not print its final PASS line.

Not verified:

- live Telegram operator traversal;
- live web-admin rendering;
- Vercel, Redis, QStash or Neon production behavior;
- real moderator and support handling;
- mobile wrapping and real-operator comprehension;
- remote STEP584 evidence.

## Next

`STEP586H — Live Telegram Acceptance and Mobile Copy Pass`.
