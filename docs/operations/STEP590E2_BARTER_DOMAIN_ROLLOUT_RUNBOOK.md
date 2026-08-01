# STEP590E2 — Barter Domain Rollout Runbook

## Preconditions

- exact STEP590E1H5 source baseline or accepted commit `af56af594c1de6d6c8a950f4168be7a2c397320f`;
- clean or fully understood worktree;
- no SQL migration required;
- no new ENV required;
- operator can identify disposable offer/thread records;
- paid `a:off_buy*` actions are excluded from the canary.

## Local acceptance

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run test:barter-domain-extraction
npm.cmd run smoke:barter-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
```

Expected ownership:

```text
extracted: 209
legacy:    351
aliases:     7
unresolved:  0
```

## Read-only production canary

Use existing records and do not mutate active commercial workflows merely to test routing.

1. Open Barter home and public feed.
2. Open filters, multi-pick and smart-prefill screens; cancel without applying unintended changes.
3. Open one public offer and return to the feed.
4. Open “My offers” and one owned offer.
5. Open edit, media preview, partner-folder and lifecycle controls without saving a real change.
6. Open Barter inbox and one existing thread.
7. Open proofs, reply, stage, triage and close/delete confirmation screens; cancel.
8. Open official publication management and request home.
9. Open moderator queue only with an authorized moderator account.
10. Verify `a:off_buy`/`a:off_buy_home` still use their existing payment path and are not handled by the Barter domain.

## Disposable mutation canary

Only on disposable records and with explicit operator intent:

1. create one test Barter offer;
2. publish and read it back;
3. pause/resume or archive/restore once;
4. open one disposable conversation;
5. send one test reply or proof and verify audit/readback;
6. perform one stage transition and restore/close the disposable thread;
7. for official publication, use an explicitly disposable post and preserve Telegram message IDs/audit evidence.

## Rejection signals

```text
unknown_callback
callback.error
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
barter_domain.missing_dependency
barter_domain.unreachable_action
official_publish_verify_error
```

Also reject on:

- cross-workspace or cross-owner offer/thread access;
- duplicate offer, thread, report, proof or official post;
- paid checkout routed through `barter_*` owners;
- missing/duplicated audit rows;
- stale button loops or unacknowledged callbacks;
- external Telegram success with inconsistent durable state.

## Acceptance verdict

Production acceptance requires:

- representative discovery, offer, conversation and official routes reach normal completion;
- no ownership/phase/dependency errors;
- workspace, owner, manager and moderator guards remain effective;
- disposable mutations read back consistently after refresh;
- no duplicate Telegram/QStash/DB effect;
- `a:off_buy*` remains outside the Barter domain.
