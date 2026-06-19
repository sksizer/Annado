---
type: task
schema_version: '5'
id: T-E33U
status: in-progress
created: '2026-06-15'
related: []
tags: []
need_human_review: false
impact: medium
complexity: large
prs:
- https://github.com/sksizer/Annado/pull/13
---
# Inline delete button for Todo rows with faithful undo

> AUTO-DEFINED: this spec was best-effort machine-authored by
> /sdlc:task-auto-define on 2026-06-15 because the task is
> autonomy: autonomous/pr. Review the Goal, Approach, Today,
> Files-to-touch, and Acceptance-criteria carefully before trusting it.

## Goal

Deleting a Todo today requires the ⌘⌫ keybinding, a right-click flow, or
the Review view — there is no quick pointer affordance on a normal inbox
row. Add an inline delete button that appears on hover, right-aligned to
the Todo's text, plus a delete button on the expanded card. Because
deletion is the one mutation Annado cannot currently undo, also close that
gap so an accidental delete is recoverable with ⌘Z.

## Today

| Location | Role today |
|---|---|
| `src/components/TaskItem.tsx#CollapsedTaskRow` | Since the perf split (PR #13), this file is a thin wrapper: `CollapsedTaskRow` renders the collapsed row and `TaskItem` delegates the expanded editor to `ExpandedTaskCard`. The collapsed card carries `task-row-cv group cursor-pointer` (line 164); the title sits in a `flex-1 min-w-0` box (line 205); right-side indicators are a `flex-shrink-0` cluster (line 257). No delete affordance. |
| `src/components/ExpandedTaskCard.tsx` | The expanded editor card (split out of TaskItem by PR #13). Its bottom toolbar (line 448) has a right-side cluster (line 491) holding only an "open in editor" link. No delete affordance. |
| `src/components/TaskList.tsx` | Renders the inbox/flat lists; now virtualized via `@tanstack/react-virtual` (PR #15) with `content-visibility` rows (`task-row-cv`, PR #14) — relevant because the inline hover button must not disturb virtual row-height measurement. |
| `src/stores/slices/taskSlice.ts` | Zustand task slice. A global undo stack (`pushUndo` / `undoLastAction`, lines 112–141) records an inverse for every mutation — `updateTask`, `updateMultipleTasks`, `createTask`, `toggleTaskComplete`, `toggleChecklistItem` — **except `deleteTask` (line 448), which pushes nothing.** `createTask` only accepts `{title, when}`, so it cannot rebuild a deleted task's notes/checklist/tags/etc. |
| `src/hooks/useKeyboardHandler.ts` | Binds ⌘Z → `undoLastAction` and ⌘⌫ delete, which routes through the `confirmDelete` setting + the App-level ConfirmModal. |
| `src/components/ConfirmModal.tsx` | Reusable confirm dialog (`open`/`message`/`onConfirm`/`onCancel`); the existing delete-confirmation UI. |
| `src-tauri/src/vault.rs` | `delete_task` (line 2765) locates the task's markdown block `[line_index, end_of_content)`, rewrites the file without it, and drops it from cache — keeping **no copy**. `create_task` (line 770) mints `id` from `generate_id(file_path, line_number)`, so a recreated task at a new line gets a *new* id. |
| `src-tauri/src/commands.rs` | Tauri command wrappers; `delete_task` returns `Result<(), String>` (line 618) and discards the removed content. |
| `src-tauri/src/lib.rs` | `generate_handler!` registers every command (line 327; `delete_task` at line 338). |
| `src/types/task.ts` | `Task` and `CreateTaskPayload` types; there is no snapshot type describing a deleted task for restoration. |

**Undo investigation (operation protocol).** Deletion is *not* easily
reversible today: the backend discards the removed markdown, `create_task`
restores only title+when, and `id` is positional. The Review view's
"undo" toast (`src/features/review/ReviewView.tsx`) is cosmetic — its
button only dismisses the toast; it never restores the task. Faithful undo
therefore requires the backend to hand back the removed block on delete and
to re-insert it on restore (chosen scope: backend `restore_task`, not a
lossy `createTask` recreate).

## Proposed

- Hovering a Todo row in the inbox reveals a delete (trash) button
  right-aligned to the title text. For a short title it sits just right of
  the text; for a full-width title it renders right-aligned *overlaid* on
  the text tail (a gradient backdrop keeps it legible). It is invisible
  until hover and never present in the row's normal layout flow.
- The expanded Todo card exposes a destructive "Delete" button in its
  bottom toolbar.
- Both buttons honor the existing `confirmDelete` setting: on → a
  ConfirmModal gates the delete; off → immediate delete.
- After any delete (inline button, expansion button, or ⌘⌫), ⌘Z restores
  the task byte-for-byte at its original file position — same title,
  notes, checklist, tags, deadline, priority, projects, persons, and the
  **same id** — via a new backend `restore_task` command wired into the
  undo stack.

## Approach

1. **Backend capture + restore (`src-tauri/src/vault.rs`).** In
   `delete_task`, before writing the trimmed file, capture
   `raw_block = lines[line_index..end_of_content].join("\n")` and return a
   `DeletedTaskSnapshot { file_path, line_number: line_index + 1, raw_block }`
   (change the signature to `Result<DeletedTaskSnapshot, String>`). Add a
   sibling `restore_task(&self, snapshot)` that reads the file, splits to
   lines, inserts `raw_block`'s lines at index `line_number - 1` (clamp to
   `lines.len()` → append when the file shrank), writes back, re-parses the
   reinserted task, inserts it into the cache, and returns the `Task`.
   Re-inserting at the original index restores the original line numbers, so
   the parsed task — and the tasks below it — recover their original ids.
2. **Command layer (`src-tauri/src/commands.rs`).** Define
   `DeletedTaskSnapshot` (serde `rename_all = "camelCase"` to match the
   frontend), change the `delete_task` command to return it, and add
   `#[tauri::command] pub fn restore_task(snapshot: DeletedTaskSnapshot) -> Result<Task, String>`
   delegating to the vault method.
3. **Register (`src-tauri/src/lib.rs`).** Add `restore_task` to the command
   imports and to `generate_handler!`.
4. **Frontend type (`src/types/task.ts`).** Add
   `DeletedTaskSnapshot { filePath: string; lineNumber: number; rawBlock: string }`.
5. **Store wiring (`src/stores/slices/taskSlice.ts`).** Change `deleteTask`
   to read the snapshot returned by `invoke('delete_task', { id })`, keep
   the existing optimistic-remove + rollback, and on success
   `pushUndo(() => get().restoreTask(snapshot))`. Add a `restoreTask(snapshot)`
   action (and its `TaskSlice` interface entry) that invokes `restore_task`
   and merges the returned `Task` back into `tasks`. The existing `isUndoing`
   guard already prevents the `createTask` → `deleteTask` undo path from
   recording a second entry.
6. **Inline row button (`src/components/TaskItem.tsx#CollapsedTaskRow`).**
   Give the collapsed title-content box (`flex-1 min-w-0`, line 205)
   `relative`, and render a trash-icon button as `absolute right-0 top-1/2
   -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity`
   with a left-fading gradient / solid backdrop so it stays legible when
   overlaying a full-width title. The button must be position-absolute (not a
   flex sibling) so it adds no height to the row — the list is virtualized
   (`@tanstack/react-virtual`) and rows are `content-visibility: auto`
   (`task-row-cv`), so a hover affordance that changed measured row height
   would jitter the virtual list. `onClick` calls `e.stopPropagation()` then
   the delete handler (step 8).
7. **Expansion button (`src/components/ExpandedTaskCard.tsx`).** Add a
   destructive "Delete" button (trash icon, red text) to the expanded bottom
   toolbar's right-side cluster (next to the editor link, line 491), calling
   the same delete handler. NOTE: the expanded editor now lives in
   `ExpandedTaskCard.tsx`, not `TaskItem.tsx` — this is where the toolbar
   moved in PR #13.
8. **Confirm + delete handler (shared).** In each of `CollapsedTaskRow` and
   `ExpandedTaskCard`, pull `deleteTask` and `confirmDelete` from the store
   and a local `const [confirmingDelete, setConfirmingDelete] = useState(false)`.
   The handler: if `confirmDelete` → open a self-contained `<ConfirmModal>`
   whose `onConfirm` runs `deleteTask(task.id)`; else delete immediately.
   Keep it local to each component to avoid threading App-level modal state
   into the memoized row. (A small shared `useConfirmableDelete(task)` hook
   returning `{ requestDelete, confirmModal }` is acceptable to avoid
   duplicating the confirm wiring across the two surfaces.)
9. **Tests.** Add a `#[test]` in `src-tauri/src/vault.rs`'s `mod tests` that
   creates a task with notes + checklist, snapshots it via `delete_task`,
   restores via `restore_task`, and asserts the file content is byte-identical
   to before the delete and the restored task id equals the original. Add
   `src/stores/slices/taskSlice.test.ts` (vitest, mocking
   `@tauri-apps/api/core`'s `invoke`) asserting `deleteTask` pushes exactly
   one undo entry and that running it invokes `restore_task` with the
   snapshot.
10. **Verify.** Run `pnpm run check` (tsc + eslint + vitest + cargo test).

## Files to touch

| Location | Kind | Change |
|---|---|---|
| `src-tauri/src/vault.rs#delete_task` | modify | Capture removed block, return `DeletedTaskSnapshot`; add `restore_task` method + round-trip test in `mod tests`. |
| `src-tauri/src/commands.rs#delete_task` | modify | Define `DeletedTaskSnapshot`; change `delete_task` return type; add `restore_task` command. |
| `src-tauri/src/lib.rs` | modify | Register `restore_task` in `generate_handler!` (and imports). |
| `src/types/task.ts` | modify | Add `DeletedTaskSnapshot` type. |
| `src/stores/slices/taskSlice.ts#deleteTask` | modify | Capture snapshot, `pushUndo(restoreTask)`; add `restoreTask` action + interface entry. |
| `src/components/TaskItem.tsx#CollapsedTaskRow` | modify | Inline hover delete button (absolute, right-aligned, overlay on full-width) + confirm/undo wiring. |
| `src/components/ExpandedTaskCard.tsx` | modify | Destructive "Delete" button in the bottom-toolbar right cluster + confirm/undo wiring. |
| `src/stores/slices/taskSlice.test.ts` | new | Vitest: `deleteTask` records one undo entry; undo invokes `restore_task`. |

## Acceptance criteria

- [x] AC-1: Hovering a Todo row in the inbox reveals a right-aligned delete button within the title area; with no hover the button is `opacity-0` (not in normal layout flow), and `group-hover` makes it visible. (test: `src/components/DeleteAffordance.test.tsx`)
- [x] AC-2: When a Todo title spans the full row width, the delete button renders right-aligned, absolutely positioned over the title's text tail, and remains clickable (no layout reflow of the text). (button is `absolute`, asserted in `DeleteAffordance.test.tsx`; the overlay-vs-after-text layout itself is visual — jsdom has no layout — and is spot-checked manually.)
- [x] AC-3: The expanded Todo card renders a destructive "Delete" action in its bottom toolbar. (test: `src/components/DeleteAffordance.test.tsx`)
- [x] AC-4: Clicking either delete button deletes the task via `deleteTask`; when `confirmDelete` is enabled a `ConfirmModal` gates the delete, and Cancel leaves the task present. (test: `src/hooks/useConfirmableDelete.test.tsx`)
- [x] AC-5: A Rust test in `src-tauri/src/vault.rs` asserts that `delete_task` followed by `restore_task` yields byte-identical file content and a restored task whose `id` equals the original.
- [x] AC-6: A vitest test in `src/stores/slices/taskSlice.test.ts` asserts `deleteTask` pushes exactly one entry onto `undoStack` and that executing that entry invokes the `restore_task` command with the captured snapshot.
- [x] AC-7: `pnpm run check` passes (tsc, eslint, vitest, cargo test).
- [x] AC-8: The delete affordance renders a recognizable outline trash icon that matches the app's existing iconography (24×24 viewBox, `fill="none"`, `stroke="currentColor"`, round caps — Feather "trash-2" style), on both the inline row and the expanded card — not an emoji or an ad-hoc path. (test: `DeleteAffordance.test.tsx` asserts each button contains an `<svg>`.)
- [x] AC-9: In the collapsed row, when there is room after the title text the delete button sits just past the end of the text with a small gap (close to it, not pinned to the far right of the row); once the title (nearly) fills the container width the button right-aligns to the container and overlays the text tail (with a left fade for legibility). The switch is driven by measuring the room left after the title. In both cases hovering does not reflow the row's text (the button stays absolutely positioned). (the measured switch needs real layout — jsdom reports zero size — so the threshold behavior is spot-checked manually; the absolute positioning is asserted in tests.)
- [x] AC-10: Clicking Delete in the expanded task card deletes the task AND updates view state coherently: the deleted task is removed from the list, the expanded card collapses (`expandedTaskId` clears) and any selection referencing the task clears, while an unrelated expanded/selected task is left untouched. Verified by vitest tests in `src/stores/slices/taskSlice.test.ts`.

## Out of scope

- A persistent "Task deleted — Undo" toast/snackbar; undo is via ⌘Z (`undoLastAction`) only.
- Undo for multi-select bulk delete (`src/components/BulkActions.tsx`) beyond whatever the single-action path already provides.
- A trash / recycle-bin model or time-windowed soft delete.
- Delete affordances in specialized non-inbox surfaces (Agenda `TimeBlock`, Review view) beyond what already exists there.
- Changing the `confirmDelete` default or its settings UI.

## Dependencies

- none

## Discovery context

- User request via `/sdlc:task-auto-define` on 2026-06-15. The request explicitly asked to investigate the operation protocol for undo; the investigation found `deleteTask` is the only un-undoable mutation (see `## Today`). The user chose the "faithful undo (backend `restore_task`)" scope over a button-only or lossy `createTask`-recreate approach.
- Relevance refresh on 2026-06-17 (at `/sdlc:task-work` pickup): between authoring and pickup, perf PRs #11–#15 merged. PR #13 split the expanded editor out of `TaskItem.tsx` into a new `src/components/ExpandedTaskCard.tsx`, and PRs #14–#15 made the list virtualized + `content-visibility`. The `## Today`, `## Approach`, and `## Files to touch` sections were updated to retarget the expansion button to `ExpandedTaskCard.tsx` and to note the virtualization constraint on the inline overlay. Backend touchpoints were unaffected.

## Post-mortem

_Captured by /sdlc:task-work on 2026-06-17. PR: pending._

### Acceptance criteria coverage

- AC-1: auto — `DeleteAffordance.test.tsx` renders `TaskItem` and asserts the `Delete task` button has `opacity-0`/`group-hover:opacity-100`/`absolute` and calls `deleteTask` on click. Hover *feel* is deferred-user.
- AC-2: auto + deferred-user — the button is `absolute` (asserted in tests, so no flex reflow); the actual overlay-on-full-width-tail is a layout behavior jsdom can't measure, so it's deferred-user.
- AC-3: auto — `DeleteAffordance.test.tsx` renders `ExpandedTaskCard` and asserts a "Delete" button with an `<svg>` that calls `deleteTask`.
- AC-4: auto — `useConfirmableDelete.test.tsx` covers all three paths (confirmDelete off → immediate delete; on → dialog then confirm deletes; cancel does not).
- AC-5: auto — `cargo test vault::tests::test_delete_then_restore_is_byte_identical_and_keeps_id` (byte-identical file + same id).
- AC-6: auto — `vitest` `taskSlice.test.ts` (one undo entry; running it invokes `restore_task` with the snapshot).
- AC-7: auto — `pnpm run check` green (tsc, eslint, vitest 109/109, cargo 20/20), re-run independently.
- AC-8: auto — `DeleteAffordance.test.tsx` asserts both the inline and expanded buttons contain an `<svg>` (not an emoji/text glyph).
- AC-9: auto + deferred-user — the absolute positioning is asserted; the measured after-text-vs-overlay threshold needs real layout (jsdom reports zero element size), so the switch point is deferred-user.
- AC-10: auto — `taskSlice.test.ts` asserts deleting an expanded+selected task clears `expandedTaskId`/`selectedTaskId`/`selectedTaskIds`, and leaves an unrelated expansion untouched. Confirmed working in-app by the user.

### What worked

- The Step-2 relevance check caught the `TaskItem` → `ExpandedTaskCard` split before any code was written — exactly its purpose.
- `## Files to touch` used symbol/file anchors, which survived the refactor; only the prose line-number hints drifted.
- The faithful-undo design (snapshot the removed block + re-insert at the original index) round-trips byte-for-byte and preserves the positional `id`.

### Friction and automation gaps

- Spec drifted between authoring and pickup because 5 perf PRs merged in parallel — line-number hints in `## Today`/`## Approach` went stale while symbol anchors held. Prefer symbol/file anchors over line numbers in specs; line hints are write-once and rot under parallel work.
- A pre-existing broken test mock (`src/utils/RenderTitleWithLinks.test.tsx`: `openUrl` mocked as bare `vi.fn()` while the component does `openUrl(...).catch(...)`) failed the entire `vitest` run on `main` — an unrelated one-line fix was required to get a green gate. Gap: a suite-breaking test landed on `main`, suggesting the merge path didn't run the full `pnpm run check`.
- This repo has no `lease_authority` configured, so the formal `/sdlc:task-work` lease/worktree-orchestration protocol could not run; the run used an adapted flow (worktree + sub-agent + single PR, no lease ceremony). Gap: run `/sdlc:setup` or configure `lease_authority` if the full orchestration is wanted.
