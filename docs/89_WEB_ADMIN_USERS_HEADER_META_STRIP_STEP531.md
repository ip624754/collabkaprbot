# STEP531 — Web Admin Users header / meta strip polish

Date: 2026-04-03

## Goal
Tighten the visual entry into the `/admin/users` table without changing any server contract or operator behavior. The page already has the right tools after STEP512–530; this step is only about making the table start-state feel cleaner and more adult on the real working viewport.

## Scope
- replace the raw UI note above the table with a compact meta strip that summarizes the current working slice, sort/cohort/preset context, and quick basket/pins/export/copy state;
- upgrade the table header row into a clearer micro-hierarchy with short title + hint labels for each column;
- slightly strengthen the table-wrap / sticky-header visual rhythm so the list feels more composed during scroll;
- add a dedicated source smoke for the new header/meta strip contract.

## Non-goals
- no SQL changes;
- no route changes;
- no new write paths;
- no export/bulk/compare logic changes;
- no new sticky layers or heavy redesign.

## Acceptance
- `/admin/users` shows a compact meta strip directly above the table with current slice context and quick operator state;
- each users-table column header carries a clear short hint label;
- the table still works with the existing STEP522–530 stack: pagination, presets, URL-backed views, compare, export, bulk, row quick actions;
- source smoke covers the new header/meta strip contract.
