# STEP547 — Admin Surface Classification Freeze (docs-only)

## Summary
This STEP freezes the current Collabka admin-surface classification into 3 labels:

- `TG-safe`
- `TG-founder-only`
- `future-web`

This is a docs-only decision step.
No code, routing, callbacks, migrations, or runtime behavior were changed.

## Why
Collabka currently operates correctly with a Telegram-admin-first model.

The purpose of this STEP is to prevent uncontrolled growth of the Telegram admin layer and preserve a clear surface boundary:
- Telegram admin = compact operator console
- Web admin = future full control plane only if heavier surfaces are actually needed

This freeze was chosen instead of a web-admin redesign because the current Telegram admin remains operationally valid and there is no source/runtime evidence forcing a broader rewrite right now.

## Scope
Included in this STEP:
- freeze admin surface classification for current and future Collabka admin features
- document the labels in `docs/00_CURRENT_STATE.md`
- record the decision in work history
- establish a forward rule that new admin surfaces must be classified before implementation

## Out of scope
Not included:
- code changes
- callback changes
- menu changes
- access-model changes
- routing changes
- moving anything into web-admin
- UI polish
- runtime toggles or behavioral changes

## Classification
### TG-safe
- Users
- Audit (short lookup / recent events)
- Metrics (compact snapshot only)
- `/api/health`
- QStash status
- Redis status
- Broadcast pending snapshot
- Moderators (read/list)
- Back / Menu / Home

### TG-founder-only
- Web login toggle
- Payments receive toggle
- Auto-apply / auto-issuance toggle
- Match/Feat toggle
- Fallback toggle
- Fan-out toggle
- Hard-skip
- Founder Sale toggle
- Payments manual/apply actions
- Broadcast send/apply
- Flush ops digest
- Clear pending snapshot
- Add moderator
- Gift subscription

### future-web
- Access Policy editor
- Paid Contract editor
- Payment Settings editor
- Manual Overrides
- Long-form copy editing
- Bulk operations
- Wide audit/history explorer
- Heavy metrics / analytics workspace
- Registry / queue / export surfaces
- Advanced role/moderator management
- Full broadcast composer / audience builder / outbox explorer

## Decision
Collabka stays Telegram-admin-first at the current baseline.

Sections such as:
- Админка
- Операции
- Коммуникации
- Система

remain valid in Telegram as long as they stay compact, operator-oriented, and do not expand into heavy editor / bulk / explorer surfaces.

Web-admin remains a future option, not a current required build.

## Acceptance
This STEP is considered complete if:
- the classification is added to `docs/00_CURRENT_STATE.md`
- this work-history entry is added
- the change remains docs-only
- no runtime behavior is claimed as changed
- future admin features are expected to be classified before implementation

## QA
QA for this STEP:
- source-level read of current admin docs contract
- consistency check against Telegram operator console model
- consistency check against future web-only heavy surfaces
- verification that no code or runtime claims were introduced
- verification that this is a snapshot/docs freeze, not a callback audit

## Risk
Low risk.

Residual risk remains:
this is a docs/snapshot freeze only.
It does not replace later source-level validation of callback contracts, access checks, idempotency, or money-path safety for individual admin actions.

## Result
Decision frozen.
No runtime changes.
No regressions introduced by this STEP.
