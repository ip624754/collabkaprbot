# STEP590E1 — Applications & Leads Bounded Domains

**Baseline:** STEP590D
**Mode:** HEAVY / workflow architecture
**Risk:** 17/20
**Persistent contract changes:** none

## Objective

Move application, deal and lead callback orchestration out of `src/bot/bot.js` into explicit executable domain owners without changing callback identities, visible copy, authorization, workspace binding, state transitions or database semantics.

## Domain boundaries

### Applications

`src/bot/domains/applications/` owns 33 post-user callback actions split into:

- `application_creator` — 13 creator application/dialog entry actions;
- `application_brand` — 10 brand review/reply/accept actions;
- `application_deals` — 10 accepted-deal navigation and stage actions.

The domain coordinates existing renderers, guards and mutation helpers supplied by the composition root. It does not implement a repository or duplicate the application/deal state machine.

### Leads

`src/bot/domains/leads/` owns 20 post-user callback actions split into:

- `lead_acquisition` — 5 public-profile/brand-dialog lead entry actions;
- `lead_workflow` — 14 assignment, notes, templates, reply, status and delete actions;
- `lead_audit` — 1 curator audit entry action.

`a:wsp_lead_new` is intentionally owned by `lead_acquisition`. The legacy `a:send_request_to_creator` action normalizes into that canonical flow; keeping both in one owner preserves fall-through semantics and prevents cross-owner re-entry.

`a:ca` is intentionally separated from the remaining curation branch. `a:cur_audit` remains outside this STEP for the later brands/curation extraction.

## Dependency direction

```text
callback router
  → applications / leads domain adapters
    → injected renderers, policy helpers and mutation façades
      → existing DB / Redis / Telegram services
```

Forbidden in this STEP:

- a second application or lead repository;
- new direct SQL inside the domain adapters;
- new callback keys or aliases;
- changes to status names, acceptance costs or deal evidence;
- actor identity sourced from callback payload instead of Telegram/hydrated user context;
- an extracted action falling back to the legacy dispatcher.

## Runtime composition

`src/bot/bot.js` remains the composition root. It constructs bounded dependency objects and registers six exact route handlers with the STEP590B router.

Each handler:

1. rejects foreign actions with exact `false`;
2. validates required injected capabilities;
3. executes the preserved callback branch;
4. returns exact `true` for owned actions;
5. fails closed on missing capabilities using `applications_domain.missing_dependency:*` or `leads_domain.missing_dependency:*`.

## Preserved correctness contracts

- actual callback actor remains `ctx.from.id` and the hydrated `u.id`;
- workspace and brand-manager assertions remain canonical;
- brand application acceptance and deal-stage evidence remain unchanged;
- lead write helpers and rate limits remain unchanged;
- input-mode persistence and cancellation remain unchanged;
- callbacks and user-visible copy remain byte-equivalent in intent;
- SQL, ENV and Vercel function surfaces are unchanged.

## Ownership result

```text
application_creator: 13
application_brand:   10
application_deals:   10
lead_acquisition:     5
lead_workflow:       14
lead_audit:           1
newly extracted:     53
cumulative extracted:120
legacy:              440
registry total:      560
```
