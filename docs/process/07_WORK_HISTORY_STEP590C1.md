# STEP590C1 Work History

Date: 2026-08-01
Mode: HEAVY / security architecture
Risk Score: 16/20

## Baseline

- exact STEP590B source tree;
- operator reported successful deployment;
- supplied Vercel log export confirmed `a:aw_auth_dec` reached `update.ok` with no unknown/error callback signature.

## Work completed

- created bounded `adminAuth` callback domain;
- extracted challenge action and admin-web login control action;
- introduced explicit pre-user/post-user domain descriptors;
- moved router constants into a cycle-safe contract module;
- retired the root auth callback file;
- removed the inline login-toggle branch from `bot.js`;
- updated callback consistency semantics for executable route ownership;
- added executable and source-contract gates;
- updated architecture, risk, rollout and handoff documents.

## Outcome

Source-ready, production canary pending. No migration or ENV change.
