# STEP590E2 — Barter Bounded Domain

**Baseline:** STEP590E1H5 / production commit `af56af594c1de6d6c8a950f4168be7a2c397320f`
**Mode:** HEAVY / workflow architecture
**Risk:** 18/20
**Persistent contract changes:** none

## Objective

Move Barter discovery, offer lifecycle, conversation/proof flows and official-publication orchestration out of `src/bot/bot.js` into explicit executable route owners without changing callback identities, visible Telegram copy, actor/workspace authorization, durable status transitions, payment fulfillment, database schema or environment configuration.

## Domain boundary

`src/bot/domains/barter/` owns 89 exact post-user callback actions split into four owners:

- `barter_discovery` — 16 discovery, public-offer and filter actions;
- `barter_official` — 9 official-publication request, queue, verification and removal actions;
- `barter_conversations` — 16 thread, proof, report, reply, stage and closure actions;
- `barter_offers` — 48 draft, editor, publication, media, lifecycle and partner-folder actions.

The module is a transport/orchestration adapter. Existing renderers, DB helpers, Redis helpers, QStash retry controls, audit functions and Telegram primitives remain canonical and are injected by the composition root.

## Explicit exclusions

The following actions remain outside STEP590E2:

- `a:off_buy`;
- `a:off_buy_home`.

They are payment checkout entrypoints and remain under the existing payment/legacy boundary until a later ownership step. STEP590E2 does not duplicate invoice creation, Stars fulfillment, credits or ledger behavior.

The following registry-only or currently unreferenced keys remain legacy-owned because no executable source branch exists to extract safely:

- `a:bx_fcat`;
- `a:bx_fcomp`;
- `a:bx_ftype`;
- `a:bx_thread_new`;
- `a:bx_thread_write`.

## Ownership model

```text
callback router
  → barter_discovery
  → barter_official
  → barter_conversations
  → barter_offers
    → injected canonical renderers / guards / mutation façades
      → existing DB / Redis / QStash / Telegram services
```

Each route:

1. accepts only its frozen action set;
2. runs in the existing `post_user` phase after global guards and user hydration;
3. validates required capabilities before execution;
4. returns exact `true` for owned actions and exact `false` for foreign actions;
5. fails closed on missing dependencies or an impossible owned-action fallthrough.

## Preserved lifecycle contracts

### Discovery

- network-enabled and workspace access checks remain unchanged;
- smart prefill derives from the same brand profile source;
- filter scope, tags, multi-pick state and return navigation remain unchanged;
- public offer cards use the same renderers and redaction boundaries.

### Offer creation and lifecycle

- draft storage, input-mode transitions and preset application remain unchanged;
- category, type, compensation, requirements, tags and offer-text semantics remain unchanged;
- media preview and publication behavior remain unchanged;
- pin, bump, pause, resume, archive, restore and deletion/archive semantics remain unchanged;
- partner-folder ownership is still checked against the selected workspace;
- durable audit events retain their existing action names and payloads.

### Conversations, proofs and reports

- actual actor remains the hydrated user and Telegram callback actor;
- thread access and brand-manager assertions remain canonical;
- reply, CRM stage, triage, close and delete operations retain existing guards;
- proof link/photo input modes remain unchanged;
- report paths retain the same offer/thread targets;
- transient Neon/QStash retry and lock behavior remain injected from the existing implementation.

### Official publication

- request, moderator queue, publish, verify, update and removal flows keep existing authorization;
- official-channel publishing and verification remain in their canonical helper modules;
- moderator checks and queue notifications are unchanged;
- no new API route, function or scheduled job is introduced.

## Bounded correctness repair

The extracted official verification branch calls `verifyOfficialPublishState`. The original inline branch referenced this helper without importing it in `src/bot/bot.js`. STEP590E2 adds the missing existing helper import so the extracted route can use the intended canonical implementation. This is a bounded wiring repair, not a new publication state machine or persistent contract.

## Forbidden changes

- new Barter SQL or repository implementation inside the callback domain;
- new callback keys or aliases;
- payment checkout or fulfillment duplication;
- actor identity accepted from callback payload;
- workspace/folder/thread authorization relaxation;
- changed status names, audit action names or publication semantics;
- direct Telegram/QStash effects outside existing injected helpers;
- extracted actions falling back to the legacy dispatcher.

## Ownership result

```text
barter_discovery:       16
barter_official:         9
barter_conversations:   16
barter_offers:          48
newly extracted:        89
cumulative extracted:  209
legacy:                 351
registry total:         560
aliases:                  7
unresolved:               0
```
