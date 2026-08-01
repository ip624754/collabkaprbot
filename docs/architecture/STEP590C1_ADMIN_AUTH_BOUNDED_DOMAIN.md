# STEP590C1 — Admin/Auth Bounded Callback Domain

## Decision

STEP590C1 extracts the critical admin-web authentication callbacks from the root Telegram monolith into a bounded modular-monolith domain:

```text
src/bot/domains/adminAuth/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
├── route.js
├── service.js
└── views.js
```

The extraction is behavior-preserving. It does not replace or duplicate the canonical admin-web authentication state machine in `src/lib/adminWeb/auth.js`.

## Owned callback actions

| Action | Route owner | Phase | Purpose |
|---|---|---|---|
| `a:aw_auth_dec` | `admin_web_auth` | `pre_user` | Approve or deny a browser-bound admin login challenge using the real Telegram actor |
| `a:admin_web_login_toggle` | `admin_web_auth_control` | `post_user` | Founder/super-admin operator control for accepting new admin-web logins |

The challenge route remains pre-user because it is authorized by Telegram callback identity and Redis challenge state, not by an application user row. The operator-control route remains post-user to preserve the prior hydration and admin-panel execution order.

## Dependency direction

```text
bot composition root
  → adminAuth callbacks
      → policy / views
      → adminAuth service adapter
          → canonical src/lib/adminWeb/auth.js

bot composition root
  → injected operator-control dependencies
      → getOperatorControlSnapshot
      → setOperatorControlToggle
      → renderAdminSystem
```

Forbidden inside the bounded callback domain:

- direct import of `src/bot/bot.js`;
- direct import of `src/db/queries.js`;
- a second Redis challenge/session state machine;
- direct Grammy dependency;
- callback-key or product-copy changes;
- silent fallback of an extracted action into the legacy dispatcher.

## Canonical state ownership

`src/lib/adminWeb/auth.js` remains the only owner of:

- browser verifier binding;
- actual Telegram approver authorization;
- atomic `pending → approved|denied` transition;
- atomic `approved → consumed` transition;
- one-time session issuance;
- fallback-code attempt and lockout policy;
- admin session version and idle timeout.

The new domain service is a thin lazy adapter. The lazy import keeps transport/policy tests executable without loading the full production configuration graph; it does not create a second implementation.

## Router ownership

STEP590C1 changes the exact ownership summary from:

```text
extracted: 5
legacy:    555
```

to:

```text
extracted: 6
legacy:    554
```

Route ownership is now:

```text
admin_web_auth:         1
admin_web_auth_control: 1
giveaway_access:        4
legacy:                554
```

## Compatibility

Unchanged:

- `a:aw_auth_dec` callback data;
- `a:admin_web_login_toggle` callback data;
- action registry guard metadata;
- browser-auth cookie/session contract;
- operator-control ID `admin_web_login`;
- audit actor fields and note `telegram_admin`;
- admin-system rendering;
- PostgreSQL schema;
- Redis key formats;
- Vercel function count;
- public Telegram copy.

## Rollback

A code rollback to exact STEP590B is structurally possible because no schema or persistent-state contract changed. It reintroduces the inline operator-control branch and the root-level auth callback file, so rollback is only for a verified runtime regression. Normal policy is bounded fix-forward.
