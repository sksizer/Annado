---
type: task
schema_version: '5'
id: T-RO1B
status: planning/draft
created: '2026-06-20'
related: []
tags: []
need_human_review: true
impact: medium
complexity: large
---
# Always-on "Open In" settings: reorderable opener list with custom apps

> NOTE: This task builds on PR #2 (`feat/open-with-open-icon`), which replaced
> the old configurable "External Editor" setting with auto-detected path
> openers and **removed** the settings UI. Upstream's intent is to *retain* the
> settings, so this task re-introduces a single always-on "Open In" settings
> section backed by the new detection. The `## Today` / `## Files to touch`
> citations refer to the **`feat/open-with-open-icon` branch**, not `main`.

## Goal

PR #2 made app/editor openers auto-detected but dropped all configuration: the
default open action is hard-coded (Obsidian if installed, else OS default), the
"Open with" menu lists every detected app in detection order, and there is no
way to set a preference, hide an opener, or add a custom one. Re-introduce a
single, always-shown **"Open In"** settings section that is the source of truth
for opener behavior — an ordered, editable preference list (detected + custom)
that drives the open-in icon's default click, the "Open with" menu order, and
the icon label.

## Today

| Location | Role today (on `feat/open-with-open-icon`) |
|---|---|
| `src/utils/pathOpener.ts#defaultOpener` | Hard-codes the default: Obsidian when installed, else OS default. No user preference. `openersForPath` filters by extension/dir support; order is detection order. |
| `src/utils/openMenuItems.ts#buildOpenMenuItems` | Builds "Open" + an "Open with ▸" submenu listing `openersForPath` in detection order. No hidden/reorder/custom. |
| `src/components/OpenFileButton.tsx` | The open-in icon. Click → `openEntityFile` (default action); right-click → `buildOpenMenuItems`. Reads `pathOpeners` from the store. |
| `src/stores/slices/settingsSlice.ts` | Holds `pathOpeners: PathOpenerInfo[]` (detected, loaded on init via `loadPathOpeners`) + `refreshPathOpeners`. No opener *preferences*. Other UI settings persist to `localStorage` via `persist(...)`; `isObsidianVault` is backend (`get/set_is_obsidian_vault`). |
| `src/components/SettingsModal.tsx` | PR #2 deleted the "External Editor" section here (the `system/vscode/sublime/custom` picker + custom-command input). The General tab has no opener configuration. |
| `src-tauri/src/path_openers.rs` | `detect_path_openers` / `refresh_path_openers` (via the `path-opener` crate), `open_path_with(path, appId)`, `open_path_default(path)`. No custom-command exec (PR #2 removed the old `open_file_in_editor`). |

## Proposed

A single **"Open In"** section in Settings → General, **always shown** (not
gated on `isObsidianVault`):

- Lists the openers as an **ordered preference list** — detected apps (from
  `detectOpeners()`) plus any custom ones, each row showing its name and what
  it opens.
- **Reorder** (drag): order = preference. The first usable opener for a given
  path becomes the default "Open" action; the "Open with" menu and label follow
  the same order.
- **Remove**: hide an opener from the icon's default action and the menu (it
  stays detectable, just not offered).
- **Add custom**: name + command template (`{file}` / `{dir}` / `{line}`),
  reusing the old External-Editor custom-command style; runs via a backend
  custom-exec path.
- A **Refresh** control re-scans installed apps (`refreshOpeners()`).

The icon (`OpenFileButton`), the "Open with" menu (`buildOpenMenuItems`), and
the default action all read this configured list instead of the hard-coded
Obsidian-or-OS rule. Obsidian becomes just one entry in the orderable list (no
special-casing in the default logic).

## Approach

1. **Opener preferences state (`src/stores/slices/settingsSlice.ts`).** Add
   `openerPrefs: { order: string[]; hidden: string[]; custom: CustomOpener[] }`
   (`CustomOpener = { id: string; name: string; command: string }`). Load on
   init and persist on change — see the persistence decision in Discovery
   context (recommend `order`/`hidden` in `localStorage` like other UI
   settings; `custom` openers in backend config since they carry an executable
   command).
2. **Effective-list helper (`src/utils/pathOpener.ts`).** Add a pure function
   that merges detected `pathOpeners` + `custom`, drops `hidden`, sorts by
   `order` (unlisted detected apps appended), and exposes "the openers for this
   path in preference order" + "the default opener" = first usable in that
   order. Replace `defaultOpener`'s hard-coded Obsidian rule with this.
3. **Backend custom-exec (`src-tauri/src/path_openers.rs`).** Add a command
   that runs a custom command template against a path (substitute
   `{file}`/`{dir}`/`{line}`), mirroring the removed editor-exec. Detected apps
   keep using `open_path_with`.
4. **Settings section (`src/components/SettingsModal.tsx`).** Replace the
   removed/conditional External-Editor block with an always-shown "Open In"
   section: draggable rows (reorder), a remove control per row, and an "Add
   custom" form (name + command). Reuse the section's existing styling.
5. **Wire consumers.** Update `buildOpenMenuItems` and `OpenFileButton` to use
   the effective ordered list (default click = top usable opener; menu order =
   preference; custom openers included and runnable).
6. **Tests.** Unit-test the effective-list computation (ordering / hidden /
   custom / per-path filtering / fallback to OS default when the list is
   empty); a component test for the settings section (reorder, remove, add
   custom); a Rust test for the custom-command substitution.
7. Run `pnpm run check`.

## Files to touch

| Location | Kind | Change |
|---|---|---|
| `src/stores/slices/settingsSlice.ts` | modify | Add `openerPrefs` state, load/persist, and setters (reorder/hide/add-custom/remove-custom). |
| `src/utils/pathOpener.ts` | modify | Effective ordered+filtered opener list; default = first usable in preference order (drop hard-coded Obsidian rule). |
| `src/utils/openMenuItems.ts` | modify | Build the menu from the effective ordered list (include custom, respect hidden/order). |
| `src/components/OpenFileButton.tsx` | modify | Default click + label from the effective list. |
| `src/components/SettingsModal.tsx` | modify | Always-on "Open In" section: reorder, remove, add-custom. |
| `src-tauri/src/path_openers.rs` | modify | Custom-command exec command (`{file}`/`{dir}`/`{line}` substitution). |
| `src-tauri/src/lib.rs` | modify | Register the new custom-exec command. |
| `src/utils/pathOpener.test.ts` | new | Unit tests for the effective-list/default computation. |

## Acceptance criteria

- [ ] AC-1: The "Open In" settings section is shown for every vault (not gated on `isObsidianVault`).
- [ ] AC-2: The section lists detected openers plus any custom ones; the list is the single source consumed by the icon and menu.
- [ ] AC-3: Reordering the list changes preference order: the open-in icon's default click uses the first usable opener in that order, and the "Open with" menu lists openers in that order. Order persists across reloads.
- [ ] AC-4: Removing an opener hides it from the default action and the menu; with no usable configured opener the action falls back to the OS default.
- [ ] AC-5: A custom opener (name + command template) can be added, appears in the list/menu, and on selection runs its command with the path substituted.
- [ ] AC-6: A unit test asserts the effective-list computation (order, hidden, custom, per-path filtering, empty→OS-default fallback); a Rust test asserts custom-command substitution.
- [ ] AC-7: `pnpm run check` passes (tsc, eslint, vitest, cargo test).

## Out of scope

- PR #3 (`feat/open-in-settings`: icon toggle, position, default app, app visibility) — revisit separately after this lands.
- Folder **aspect detection** / auto-detecting an Obsidian vault to drop the explicit `isObsidianVault` toggle (candidate: [`rust-dir-aspect`](https://github.com/sksizer/rust-dir-aspect)) — a follow-up task.
- Per-file-type default mappings — this task models a single global preference order (+ per-path usability filtering), not type-specific defaults.

## Dependencies

- PR #2 (`feat/open-with-open-icon`) — this task builds directly on its path-opener mechanism. PR #2 is currently unmerged and conflicted against `main` (19 behind), and the fork's `main` is behind `upstream/main`; the base/rebase strategy must be settled before pickup (rework PR #2 in place vs. a branch stacked on it).

## Discovery context

- Design agreed with the user on 2026-06-19: replace PR #2's removal of the editor settings with an always-on "Open In" section that drives the open-in icon/menu and supports remove, reorder, and custom openers. Reconciles with upstream's stated intent to retain the settings.
- **Open decision — persistence:** `order`/`hidden` preferences fit `localStorage` (like other UI settings); custom openers carry an executable command and are better held in backend config (the removed editor config was backend, and the backend must exec them). Confirm before implementation.
- **Open decision — base branch:** whether to rework PR #2 in place or stack this on its branch; depends on the fork↔upstream sync strategy (see the branch-assessment summary).
