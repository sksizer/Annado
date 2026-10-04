---
name: sync-upstream
description: Bring all fork branches and open PRs up to date after ABeehive/Annado upstream main moves. Syncs the structural branches (upstream, edge), merges the new upstream into every open PR head branch on both repos, resolves conflicts, runs quality checks, and pushes. Use when upstream was updated or PRs show as CONFLICTING.
---

# Sync fork with updated upstream

Repo topology (see CLAUDE.md): `origin` = sksizer/Annado (fork), `upstream` = ABeehive/Annado (canonical).

- **`upstream` branch on origin** mirrors upstream `main` — always fast-forward it first; it is the base of fork review PRs.
- **`edge` branch** is the integration build of all our changes; re-sync it onto new upstream main.
- **PR head branches are shared**: the same branch backs the fork review PR (base `upstream`) and the eventual ABeehive PR (base `main`). Updating the branch once fixes both PRs.
- **`origin/main` is stale** — it mirrors a pre-rewrite upstream history (upstream squashed/rewrote main around 619ca1d). Do NOT force-push or "fix" it without explicit direction; just flag PRs still based on it.

## Process

1. **Survey.** `git fetch upstream && git fetch origin`. Record `oldMain..upstream/main` log and `diff --stat` — the touched files predict which branches will conflict. List open PRs on BOTH repos: `gh pr list --repo sksizer/Annado ...` and `--repo ABeehive/Annado --json number,headRefName,baseRefName,mergeable`.

2. **Structural branches.**
   - `git push origin upstream/main:refs/heads/upstream` (fast-forward).
   - `git branch -f main upstream/main` locally (it tracks upstream/main).

3. **Map PR heads to worktrees.** `git branch -vv` shows each branch's worktree path (they live under `.claude/worktrees/` and `.sdlc/worktrees/`). Verify each worktree is clean (`git status --short`) before touching it. Skip PRs based on `origin/main` or superseded PRs (e.g. old open-with chain #2/#3) — flag them instead.

   **If upstream merged one of our PRs** (the new upstream commits ARE a head branch of ours): skip that branch entirely — do not merge into it. The fork review PR auto-closes as MERGED once `origin/upstream` is pushed (GitHub sees the head commits in the base). Flag the branch + worktree for cleanup in the report. Also `git fetch origin` first and check whether any PR head moved on origin (review-fix commits pushed during review) — a worktree can be behind its own origin branch; `git pull --ff-only` it before merging.

4. **Merge, don't rebase.** In each PR-head worktree:
   `git -c user.email=kelly@sksizer.com -c user.name=sksizer merge upstream/main --no-edit -m "Merge upstream main (<short reason>)"`
   Merge preserves review history and avoids force-pushing branches that back two PRs at once. Commits must be authored as kelly@sksizer.com.

5. **Resolve conflicts.** Recurring patterns in this repo:
   - *Import adjacency* (`taskSlice.ts`, `panelSlice.ts` import blocks): keep both sides' imports.
   - *Both appended tests* at the end of a test module (`vault.rs` `mod tests`): union — keep our test block, close its brace, then upstream's block.
   - *Branch restructured a function upstream also touched* (e.g. `getFilteredTasks`): keep the branch's structure, apply upstream's semantics (e.g. wrap/insert `sortTasksByDocumentOrder` on the computed base).
   - *Edge already carries an edge-variant of a change upstream just merged*: HEAD usually wins; resolve each conflict region individually — never `git checkout --ours` a whole file, that discards auto-merged upstream hunks elsewhere in it.
   - *Same fix landed on both sides with different comment wording* (e.g. a test-mock fix): take upstream's version to minimize future drift — but first `git diff HEAD upstream/main -- <file>` to confirm the file differs ONLY by that; only then is whole-file `git checkout --theirs` safe.
   - *Branch replaces UI that upstream extended* (e.g. open-with replaces the editor link, upstream added a Delete button next to it): keep the branch's replacement, graft in upstream's addition. Then grep for now-unused imports/helpers from the dropped upstream side (`openInEditor`, `editorLabel`).
   - *Both sides appended row affordances* in `TaskItem.tsx`'s right-side indicators: union them; upstream's delete affordance is designed to sit last ("pinned to the row's right edge").
   - After resolving, sanity-grep for duplicated UI (e.g. two `aria-label="Delete task"` buttons) — an auto-merge can keep an old variant of a block upstream restyled.
   - Grep ALL conflicted files from `git diff --name-only --diff-filter=U`, not just the ones named in the tail of the merge output.

6. **Quality gate** (from sdlc.yaml: `pnpm run check`). Run per worktree, in parallel background jobs:
   - Always: `npx tsc --noEmit && npx eslint src && npx vitest run`.
   - `cargo test --manifest-path src-tauri/Cargo.toml` only where the branch's own diff overlaps the src-tauri files upstream touched (check `git diff --name-only <newMain>...HEAD -- src-tauri`).
   - `npm install` first if the worktree has no `node_modules`.

7. **Push and verify.** `git push` from each worktree (plain push — merges never need force). Then poll until GitHub settles (UNKNOWN → MERGEABLE):
   `gh pr list --repo ABeehive/Annado --json number,mergeable` and same for the fork. Every previously CONFLICTING PR should now be MERGEABLE.

8. **Report.** Old→new upstream range, branches updated, conflicts resolved and how, check results, and anything intentionally left untouched (stale `origin/main`-based PRs, superseded PRs, local branches without PRs).
