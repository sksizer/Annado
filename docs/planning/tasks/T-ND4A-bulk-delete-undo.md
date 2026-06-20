---
type: task
schema_version: '5'
id: T-ND4A
status: planning/backlog
created: '2026-06-20'
related:
- T-E33U
tags:
- undo
- inbox
- delete
need_human_review: false
impact: medium
complexity: medium
---
# Make bulk (and single) delete undoable via the faithful restore backend

## Goal

The Inbox multi-select feature added a bulk **Delete** action, but it isn't
undoable — deleting tasks (one or many) cannot be reverted with ⌘Z. Bulk
*update* ops (When/Project/Deadline/Complete via `updateMultipleTasks`) already
push undo entries; delete is the lone gap. Closing it makes accidental bulk
deletes recoverable in-app, with the confirm dialog as the only current
safeguard.

## Today

| Location | Role today |
|---|---|
| `src/stores/slices/taskSlice.ts` (`deleteMultipleTasks`) | Batched optimistic delete; rolls back on backend error but pushes **no** undo entry. |
| `src/stores/slices/taskSlice.ts` (`deleteTask`) | Single optimistic delete; also no undo entry. |
| `src/stores/slices/taskSlice.ts` (`updateMultipleTasks`) | Reference pattern: already wraps the mutation in `pushUndo(...)`. |
| `src-tauri/src/commands.rs` (`delete_task`) | Returns `Result<(), String>` — discards the deleted content, so there's nothing to restore from. |
| `src-tauri/src/vault.rs` (`delete_task`) | Removes the task's markdown block; returns nothing. |

## Proposed

Bulk and single delete push an undo entry so ⌘Z restores the deleted task(s)
**faithfully** — same id, same file position, byte-identical markdown block —
mirroring how `updateMultipleTasks` already participates in the undo stack.

## Approach

This pairs with the **faithful delete + undo PR** (fork `feat/inline-delete-faithful-undo`
/ ABeehive#20), which already implements the restore backend. Prefer landing on
top of that work rather than duplicating it.

1. Take in the restore backend from the delete+undo PR: `delete_task` returns a
   `DeletedTaskSnapshot { file_path, line_number, raw_block }`; add a
   `restore_task` command that re-inserts the captured block at its original
   index (byte-identical, same id).
2. In `deleteTask`, capture the snapshot and `pushUndo(() => restoreTask(snapshot))`.
3. In `deleteMultipleTasks`, collect a snapshot per deleted task and push a single
   undo entry that restores them all (order-independent; each re-inserts at its
   recorded index).
4. Verify ⌘Z after a bulk delete restores every task to its original slot, and
   that interleaving with other undo entries still unwinds correctly.

## Files to touch

| Location | Kind | Change |
|---|---|---|
| `src-tauri/src/commands.rs` | modify | `delete_task` returns a snapshot; add `restore_task` command (from the delete+undo PR). |
| `src-tauri/src/vault.rs` | modify | Return the captured block on delete; add `restore_task` re-insertion. |
| `src-tauri/src/lib.rs` | modify | Register `restore_task` in the handler. |
| `src/stores/slices/taskSlice.ts` | modify | Add `restoreTask`; wire `pushUndo` into `deleteTask` and `deleteMultipleTasks`. |

## Acceptance criteria

- [ ] AC-1: After a bulk delete of N tasks, ⌘Z restores all N tasks.
- [ ] AC-2: Restored tasks keep their original id and file position (byte-identical block) — covered by a Rust round-trip test.
- [ ] AC-3: Single-task delete is also undoable.
- [ ] AC-4: Undo of a delete interleaves correctly with other undo-stack entries.

## Out of scope

- The multi-select / shift-click / bulk-toolbar work itself (already shipped on `feat/inbox-multi-select-bulk-delete`).

## Dependencies

- Faithful delete + undo backend: fork `feat/inline-delete-faithful-undo` / ABeehive#20 (provides `restore_task` + `DeletedTaskSnapshot`). [[T-E33U]]

## Discovery context

Deferred during the Inbox multi-select work (`feat/inbox-multi-select-bulk-delete`).
The branch is based on clean `upstream/main`, which lacks the restore backend, so
wiring delete-undo here would have duplicated ABeehive#20. Decision: ship bulk
delete without undo (confirm dialog as the safety net) and track undo separately
here, to land with the deletion PR.
