# STEP590E1 — Applications & Leads Rollout Runbook

## Preconditions

- exact STEP590D source baseline;
- clean or understood Git worktree;
- no SQL migration required;
- no new ENV required;
- operator can identify disposable test application and lead records.

## Local acceptance

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run test:applications-leads-domain-extraction
npm.cmd run smoke:applications-leads-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:critical-spine
npm.cmd run preflight:source
```

Expected ownership:

```text
extracted: 120
legacy:    440
unresolved: 0
```

## Safe production canary

Use existing or disposable records. Do not accept/delete/change status on real workflows merely to test routing.

1. Open creator applications list and one application card.
2. Open the application reply/chat composer, then cancel without sending.
3. Open brand applications list and one application card.
4. Open brand reply/template screens, then cancel without sending.
5. Open accepted deals list and one deal card.
6. Open deal-stage controls but do not mutate a real deal.
7. Open creator leads list and one lead card.
8. Open notes/templates/reply screens, then cancel without sending.
9. Open a public creator profile as a disposable brand test account and verify lead-compose entry.
10. Verify old `a:send_request_to_creator` buttons still reach the same compose flow.

A mutation canary is permitted only with disposable records and explicit operator intent:

- submit one disposable application;
- accept it from the intended brand workspace;
- create one disposable lead;
- change its status once and verify audit/readback.

## Log rejection signals

```text
unknown_callback
callback.error
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
applications_domain.missing_dependency
leads_domain.missing_dependency
```

Also investigate any permission bypass, cross-workspace record access, duplicate application/lead creation or duplicate notification.

## Acceptance verdict

Production acceptance requires:

- representative creator/brand/deal/lead routes reach `update.ok`;
- no ownership/phase/dependency errors;
- actor/workspace checks remain effective;
- no duplicate mutation or notification;
- durable rows and visible cards agree after refresh.
