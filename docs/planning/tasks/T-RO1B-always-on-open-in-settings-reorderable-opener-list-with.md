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
prs:
- https://github.com/sksizer/Annado/pull/14
---
# Rename Editor settings to "Open In": always-on, toggleable, reorderable opener list with custom apps

> NOTE: This task builds on the **`open-with-rebased`** branch (the open-with
> feature rebased onto `upstream/main`, under review as **PR #14**, recorded in
> `prs:`). That branch added auto-detected path openers + the open-in icon and
> **removed** the old "External Editor" settings. This task brings the settings
> back — renamed and reshaped per the design below. (It supersedes the stale
> PR #2 base.) `## Today` / `## Files to touch` citations refer to the
> `open-with-rebased` branch.

## Goal

The open-with rebase replaced the configurable "External Editor" setting with
fully auto-detected openers and **no settings UI**: the default open action is
hard-coded (Obsidian if installed, else OS default), the "Open with" menu lists
every detected app in detection order, and there is no way to pick a preference,
hide a target, or add a custom one. **Rename** the old "External Editor"
settings to **"Open In"**, show it **always** (decoupled from the Obsidian
toggle), and make it the source of truth for the open-in icon/menu: a list of
**all valid Open In targets** that supports per-target **show/hide**, **reorder**,
and **add-custom**.

## Today

| Location | Role today (on `open-with-rebased`) |
|---|---|
| `src/components/SettingsModal.tsx` | The "External Editor" section was **removed** by the open-with rebase; the General tab has no opener configuration. The `isObsidianVault` toggle still lives in settings. |
| `src/utils/pathOpener.ts#defaultOpener` | Hard-codes the default: Obsidian when installed/usable, else OS default. `openersForPath` filters by extension/dir support; order is detection order. No user preference. |
| `src/utils/openMenuItems.ts#buildOpenMenuItems` | Builds "Open" + an "Open with ▸" submenu listing `openersForPath` in detection order. No hidden/reorder/custom. |
| `src/components/OpenFileButton.tsx` | The open-in icon. Click → `openEntityFile` (default action); right-click → `buildOpenMenuItems`. Reads `pathOpeners` from the store. |
| `src/stores/slices/settingsSlice.ts` | Holds `pathOpeners: PathOpenerInfo[]` (detected) + `loadPathOpeners`/`refreshPathOpeners`; `isObsidianVault` (backend `get/set_is_obsidian_vault`). No opener *preferences*. Other UI settings persist to `localStorage` via `persist(...)`. |
| `src-tauri/src/path_openers.rs` | `detect_path_openers` / `refresh_path_openers` (via the `path-opener` crate), `open_path_with(path, appId)`, `open_path_default(path)`. No custom-command exec. |

## Proposed

A single **"Open In"** section in Settings → General — the **renamed** old
"External Editor" section — **always shown** (not gated on `isObsidianVault`):

- **Lists all valid Open In targets** — detected apps (from `detectOpeners()`)
  plus any custom ones — each row showing its name and what it opens.
- **Show/hide toggle** per target: controls whether that target appears in the
  runtime Open In affordance (the icon's "Open with" menu). Hidden targets stay
  in the settings list (and detectable), just not offered at open time.
- **Reorder** (drag): the order in this list is the order targets appear in the
  Open In menu, and the first visible+usable target for a path is the default
  "Open" action / icon label.
- **Add custom openers**: name + command template (`{file}` / `{dir}` /
  `{line}`) — bringing back the old External-Editor custom-command capability;
  runs via a backend custom-exec path.
- A **Refresh** control re-scans installed apps (`refreshOpeners()`).

**Obsidian relationship.** The `isObsidianVault` toggle **stays** and *feeds*
the valid-targets list — Obsidian is a valid Open In target when the vault is an
Obsidian vault — but the Open In section is otherwise **orthogonal** to it
(always shown, configures all targets). Obsidian is no longer special-cased in
the default-open logic; it is just one entry in the list, subject to the same
show/hide + ordering.

The icon (`OpenFileButton`), the "Open with" menu (`buildOpenMenuItems`), and
the default action all read this configured (visible + ordered) list instead of
the hard-coded Obsidian-or-OS rule.

## Approach

1. **Opener preferences state (`src/stores/slices/settingsSlice.ts`).** Add
   `openerPrefs: { order: string[]; hidden: string[]; custom: CustomOpener[] }`
   (`CustomOpener = { id: string; name: string; command: string }`) with setters
   for reorder, show/hide toggle, add-custom, and remove-custom. Load on init and
   persist on change — see the persistence decision in Discovery context.
2. **Effective-list helper (`src/utils/pathOpener.ts`).** Add a pure function:
   from detected `pathOpeners` + `custom`, treat Obsidian as a valid target only
   when `isObsidianVault`, drop `hidden`, sort by `order` (unlisted detected apps
   appended), and expose "the visible openers for this path in order" + "the
   default opener" = first visible+usable in that order. Replace `defaultOpener`'s
   hard-coded Obsidian rule with this.
3. **Backend custom-exec (`src-tauri/src/path_openers.rs`).** Add a command that
   runs a custom command template against a path (substitute
   `{file}`/`{dir}`/`{line}`), mirroring the removed editor-exec. Detected apps
   keep using `open_path_with`.
4. **Settings section (`src/components/SettingsModal.tsx`).** Re-add the section
   under the name **"Open In"**, always shown: one row per valid target with a
   show/hide toggle and a drag handle (reorder), plus an "Add custom" form (name
   + command). Reuse the old External-Editor section styling.
5. **Wire consumers.** Update `buildOpenMenuItems` and `OpenFileButton` to use
   the effective (visible + ordered) list (default click = top visible+usable;
   menu order = the configured order; custom openers included and runnable).
6. **Tests.** Unit-test the effective-list computation (order / hidden / custom /
   Obsidian-toggle gating / per-path filtering / empty→OS-default fallback); a
   component test for the settings section (toggle, reorder, add custom); a Rust
   test for the custom-command substitution.
7. Run `pnpm run check`.

## Files to touch

| Location | Kind | Change |
|---|---|---|
| `src/stores/slices/settingsSlice.ts` | modify | Add `openerPrefs` state + load/persist + setters (reorder / show-hide / add-custom / remove-custom). |
| `src/utils/pathOpener.ts` | modify | Effective visible+ordered opener list; Obsidian gated by `isObsidianVault`; default = first visible+usable in order (drop hard-coded Obsidian rule). |
| `src/utils/openMenuItems.ts` | modify | Build the menu from the effective list (custom included, respect hidden/order). |
| `src/components/OpenFileButton.tsx` | modify | Default click + label from the effective list. |
| `src/components/SettingsModal.tsx` | modify | Always-on "Open In" section (renamed from External Editor): per-target show/hide toggle, reorder, add-custom. |
| `src-tauri/src/path_openers.rs` | modify | Custom-command exec command (`{file}`/`{dir}`/`{line}` substitution). |
| `src-tauri/src/lib.rs` | modify | Register the new custom-exec command. |
| `src/utils/pathOpener.test.ts` | new | Unit tests for the effective-list/default computation. |

## Acceptance criteria

- [ ] AC-1: A section titled **"Open In"** (the renamed former "External Editor" section) is shown in Settings → General for every vault, not gated on `isObsidianVault`.
- [ ] AC-2: The section lists all valid Open In targets — detected apps plus any custom ones — and this configured list is the single source the open-in icon and "Open with" menu consume.
- [ ] AC-3: Each target has a show/hide toggle; hidden targets do not appear in the open-in icon's menu/default action but remain in the settings list. Toggling persists across reloads.
- [ ] AC-4: The list is reorderable; the order is reflected in the "Open with" menu, and the first visible+usable target for a path is the default "Open" action. Order persists across reloads.
- [ ] AC-5: A custom opener (name + command template) can be added and removed; when selected it runs its command with the path substituted.
- [ ] AC-6: The `isObsidianVault` toggle controls whether Obsidian appears as a valid target in the list (present when on); the Open In section itself is shown regardless of the toggle.
- [ ] AC-7: When no visible+usable target exists for a path, the default action falls back to the OS default.
- [ ] AC-8: A unit test asserts the effective-list computation (order, hidden, custom, Obsidian-toggle gating, per-path filtering, empty→OS-default fallback); a Rust test asserts custom-command substitution.
- [ ] AC-9: `pnpm run check` passes (tsc, eslint, vitest, cargo test).

## Out of scope

- PR #3 (`feat/open-in-settings`: icon toggle, position, default app, app visibility) — superseded by this design; revisit/close separately.
- Folder **aspect detection** / auto-detecting an Obsidian vault to drop the explicit `isObsidianVault` toggle (candidate: [`rust-dir-aspect`](https://github.com/sksizer/rust-dir-aspect)) — a follow-up task. The Obsidian toggle is retained here.
- Per-file-type default mappings — this task models a single global ordered list (+ per-path usability filtering), not type-specific defaults.

## Dependencies

- **Builds on `open-with-rebased`** (the open-with feature rebased onto `upstream/main`, under review as **PR #14**, recorded in `prs:`). T-RO1B's implementation lands as additional commits on that branch so the eventual upstream PR carries the feature *and* its settings. This supersedes the earlier "rework PR #2" plan — PR #2's branch is stale (built on a pre-split, pre-recurrence base).

## Discovery context

- Design agreed 2026-06-19 and refined 2026-06-20: **rename** "External Editor" → "Open In"; show it **always** (decoupled from the Obsidian toggle, which instead *feeds* the valid-targets list); list **all valid targets**; support **show/hide per target**, **reorder**, and **add-custom**. "Bring back the editor settings, but make those changes." Reconciles with upstream's stated intent to retain the settings.
- **Open decision — persistence:** `order`/`hidden` preferences fit `localStorage` (like other UI settings); custom openers carry an executable command and are better held in backend config (the removed editor config was backend, and the backend must exec them). Confirm before implementation.
- **Decided — base branch (2026-06-20):** built on `open-with-rebased` (rebased onto `upstream/main`), not the stale PR #2 branch. The fork↔upstream sync question affects only how/when this reaches the real upstream PR, not the implementation base.
