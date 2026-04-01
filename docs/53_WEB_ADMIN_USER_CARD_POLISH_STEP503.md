# STEP503 — Web Admin User Card polish

Date: 2026-04-01

## Goal
Turn `/admin/users/[id]` from a thin detail view into a usable operator screen.

## Scope
- stronger user header with clearer state hint and denser summary badges;
- preserved `Users` list context via URL state (`q`, `segment`) and clean back-to-list flow;
- better `Аккаунт и доступ` summary built from one aggregated `userDetail` read model;
- stronger recent activity block with bounded counters and safer empty states;
- note UX polish: save/edit/blank→clear normalization, inline success/error status, timestamp + actor metadata;
- light recent admin trace focused on note actions;
- hobby-safe consistency cleanup: stale split `api/admin-web/*` files removed from the repo so the deployed serverless surface stays collapsed.

## Non-goals
- no payments writes;
- no plan / credits / segment mutation;
- no channel rebind or workflow actions;
- no new pages or polling.

## Acceptance
- one page load still uses one aggregated `section=user` read call;
- user card opens from `Users` and returns back with preserved search/filter state;
- note set/edit/clear works and writes audit with old/new snapshots;
- empty and missing signals render safely;
- no extra split admin API routes remain under `api/admin-web/`.
