# STEP586F — Access, Error and Empty-State Recovery

**Date:** 2026-07-18
**Mode:** STANDARD with adversarial authorization review
**Baseline:** STEP586E
**Status:** IMPLEMENTED / LOCAL QA PASS / LIVE UX NOT VERIFIED

## 1. Objective

Replace ambiguous user-facing access failures and dead-end empty states with a bounded recovery contract.

The STEP had four hard constraints:

1. do not globally replace `Нет доступа.`;
2. do not weaken authorization to improve copy;
3. do not reveal whether a private object exists;
4. do not expose infrastructure details to ordinary users.

This is a recovery and trust step, not a permission redesign.

## 2. Truth Boundary

### Verified from source and local execution

- a shared immutable recovery taxonomy exists for channel, application, dialog, offer, giveaway, folder, role and generic failures;
- ordinary-user recovery copy is neutral when the source cannot safely distinguish deletion from permission change;
- recovery buttons return only to existing list/menu surfaces and do not bypass object-level checks;
- selected empty states now include a title, a reason and a next action;
- technical causes stay in structured operator logs rather than Telegram user copy;
- curator workspace rendering proves specific membership before unrestricted workspace detail lookup;
- the legacy curator workspace callback checks the curator/admin role before rendering;
- callback identities, schema, payment mechanics, invite economics and deal mechanics are unchanged;
- dedicated STEP586F and regression contracts pass locally;
- the complete 223-file JavaScript syntax surface passes when executed in parallel.

### Not verified

- Vercel Preview or production deployment;
- live Telegram rendering and mobile wrapping;
- real stale-button traversal with production data;
- live Neon, Redis or QStash behavior;
- production visibility of the new `[copy_safety]` breadcrumbs;
- real-user comprehension;
- remote STEP584 acceptance evidence.

No live-green claim is made.

## 3. Implemented recovery taxonomy

New canonical module:

```text
src/bot/recoveryCopy.js
```

Recovery classes:

| Class | User object | Safe fallback |
|---|---|---|
| `channel` | connected Telegram channel/workspace | `Мои каналы` |
| `application` | pre-acceptance application | application list |
| `dialog` | conversation thread | `Диалоги` |
| `offer` | creator offer | offer list/feed |
| `giveaway` | giveaway object | giveaway list |
| `folder` | saved channel folder | folder list |
| `role` | role-gated section | current-role menu |
| `generic` | unknown or mixed case | current-role menu |

Every recovery object contains:

- a short title;
- a neutral reason;
- one concrete next action;
- a bounded callback toast.

The copy intentionally uses combined, non-enumerating wording such as:

```text
Кнопка могла устареть, а статус или доступ — измениться.
```

It does not confirm that a private object exists, was deleted or belongs to another user.

## 4. Runtime integration

`src/bot/bot.js` now uses two bounded helpers:

```text
answerRecovery(...)
renderRecovery(...)
```

`answerRecovery` uses a normal callback toast by default. A modal alert appears only when the caller explicitly requests it.

`renderRecovery` uses the existing edit-first Telegram surface and a safe navigation destination. It does not perform authorization or fetch private objects itself.

Static source inventory in `src/bot/bot.js`:

- exact `Нет доступа.` occurrences before STEP586F: **304**;
- exact occurrences after STEP586F: **123**;
- classified recovery helper calls after STEP586F: **229**;
- structured `emptyStateText(...)` uses introduced in the bounded wave: **8**.

The remaining `Нет доступа.` strings were not mass-rewritten. They include explicit admin/operator gates and surfaces that require separate source classification. Admin/operator vocabulary is scoped to STEP586G.

## 5. Empty-state contract

A changed empty state now answers:

1. why the list is empty;
2. what the user can do next.

Representative changes:

- inactive channels: all connected channels are active;
- workspace history: no recorded changes yet;
- curator audit: no actions match the selected conditions;
- creator offer feed: no active offers yet, with refresh/filter action;
- publication proofs: no confirmations yet, with exact `Ссылка` / `Скрин` actions;
- giveaway log: no events yet;
- channel folder: no channels added yet, with add action.

A helper centralizes the structure:

```text
emptyStateText({ title, reason, action })
```

It does not invent data or infer a cause that the source cannot prove.

## 6. User/operator boundary

Ordinary users no longer receive selected infrastructure details such as:

- Redis availability;
- internal workspace identifiers;
- internal source names;
- relation/configuration wording.

The exact operator truth remains in structured `[copy_safety]` diagnostics. Added diagnostic codes include:

```text
workspace_disconnected_surface
curator_notes_store_unavailable
curator_invite_store_unavailable
curator_username_input_store_unavailable
curator_reminder_rate_limit_store_unavailable
curator_owner_notice_rate_limit_store_unavailable
```

This preserves repairability without turning the user interface into a diagnostic console.

## 7. Security finding and fix

### Source-confirmed issue

`renderCuratorWorkspace(...)` previously used unrestricted workspace lookup before proving that a non-admin curator belonged to that specific workspace.

A curator attached to workspace A could craft a callback containing workspace B's identifier. The old read order could confirm details such as title or state before the specific membership boundary was established.

Live exploitation was not tested. The abuse path was confirmed from source order.

### Fix

For a non-admin actor, the function now:

1. validates the workspace identifier;
2. loads the actor's curator workspace membership list;
3. proves membership in the requested workspace;
4. only then loads unrestricted workspace details;
5. renders neutral channel recovery on failure.

Admins retain the explicit privileged path.

The legacy `a:cur_ws_off` route now verifies curator/admin role before calling the workspace renderer.

This is defense in depth. It does not add a new permission or broaden an existing one.

## 8. Preserved invariants

STEP586F does not change:

- callback values or destinations;
- Telegram role model;
- owner/editor/curator/admin permissions;
- database schema or migrations;
- payment provider, prices, credits or entitlements;
- invite attribution, reward amounts or timing;
- application/deal acceptance mechanics;
- giveaway draw/claim mechanics;
- webhook or QStash protocol.

Recovery buttons lead to already-existing list or menu surfaces. Authoritative object access remains enforced by existing scoped queries and mutation guards.

## 9. Source enforcement

New command:

```bash
npm run smoke:access-error-empty-state-recovery-contract
```

It is included in `preflight:source` and checks:

- taxonomy completeness and purity;
- infrastructure-leak exclusions;
- absence of ambiguous ordinary-user `not found or no access` wording;
- preservation of explicit admin gates;
- representative classified routes;
- curator membership proof ordering;
- empty-state reason/action structure;
- authorization-before-mutation ordering;
- callback identity preservation;
- operator diagnostic breadcrumbs.

Existing exact-copy contracts were updated to the new canonical recovery behavior. The checks were not removed or converted into broad substring-free assertions.

## 10. QA evidence

### PASS

- `npm run smoke:access-error-empty-state-recovery-contract`;
- STEP586A copy-safety regression contract;
- STEP586B Home/Menu/role regression contract;
- STEP586C lifecycle regression contract;
- STEP586D invite-honesty regression contract;
- STEP586E monetization regression contract;
- empty-state, footer/back-navigation and targeted giveaway/channel contracts;
- callback registry: **553 references / 559 keys / 0 unresolved**;
- `npm run preflight:deps`;
- `npm run smoke:runtime-proof-spine`;
- staging acceptance source contract;
- package-lock consistency;
- full parallel syntax sweep: **223 JavaScript files**;
- residual admin/broadcast/Instagram invariant scripts;
- `npm audit --audit-level=high`: **0 vulnerabilities**.

### Canonical source preflight limitation

`npm run preflight:source` passed all reached assertion, registry and generator gates, including STEP586F. The single serial command exceeded the execution limit during its long sequential `node --check` sweep and did not emit the final overall PASS line.

The complete JavaScript surface and residual optional invariants were then executed separately and passed.

This is recorded as:

```text
ASSERTION GATES PASS
FULL SYNTAX SURFACE PASS SEPARATELY
SINGLE SERIAL PREFLIGHT FINAL LINE NOT OBSERVED DUE TOOL TIMEOUT
```

## 11. Risk and rollback

Affected risks:

- callback/access drift;
- private-object enumeration;
- user-facing infrastructure leakage;
- dead-end recovery;
- documentation continuity.

Rollback:

- revert the exact STEP586F file delta;
- no migration rollback;
- no data rewrite;
- no entitlement or ledger compensation.

Residual risks:

- 123 exact `Нет доступа.` strings remain and require source-by-source classification rather than global replacement;
- live Telegram line wrapping and recovery routes are not proven;
- admin/operator language remains mixed until STEP586G;
- production data may expose stale combinations not represented by local source contracts.

## 12. Next step

Proceed with:

```text
STEP586G — Admin and Operator Vocabulary
```

Scope:

- make primary operator actions readable;
- preserve Redis, QStash, Neon, callback IDs and exact diagnostics where operationally useful;
- separate status, diagnosis and action;
- do not redesign admin controls or alter privileges.
