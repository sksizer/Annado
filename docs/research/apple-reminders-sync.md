# Research: Synchronizing Annado Tasks with Apple Reminders

> Status: Research / design memo — not yet scheduled work.
> Scope: feasibility analysis + proposed integration roadmap.
> A note on naming: Apple's app is **Reminders** (there is no "Apple Todos" / "Apple To Do" product — that's Microsoft To Do). This doc uses **Reminders** throughout.

---

## 1. TL;DR

**Verdict: feasible, and unusually well-positioned — but the interesting work is not the API, it's the sync semantics.**

Three things make this a natural fit for Annado specifically:

1. **The hard native plumbing already exists.** Annado already talks to **EventKit** from Rust via a hand-rolled Objective-C bridge (`src-tauri/src/calendar.rs`). Reminders live in the *same* framework (`EKEntityTypeReminder = 1`, vs `EKEntityTypeEvent = 0`). The permission flow, `EKEventStore` lifecycle, completion-block→semaphore pattern, and `NSDate`↔ISO conversion are all reusable almost verbatim.
2. **There's a background-loop precedent.** `notification_scheduler.rs` already runs a 60-second background thread with a dedup set — the exact shape a sync loop needs.
3. **There's a stable-ID-in-markdown precedent.** Recurring templates already persist a durable id in the file via `@recurring(<id>)`. We'll need the same trick for tasks.

The genuinely hard parts are **not** "can we call the API." They are:

- **Identity.** A task's only id today is `SHA256(file_path + ":" + line_number)` (`parser.rs:192`) — it changes if the task moves a line or the file is renamed. Sync needs a *stable* identity. **This is the keystone prerequisite.**
- **Data-model impedance.** Annado's model (a `when` *bucket* + a separate `deadline`, plus `[[wikilink]]` projects/persons, tags, checklists) is richer than what public EventKit exposes. **Tags and sub-tasks are not in the public API.** Several fields cannot round-trip cleanly.
- **Two sources of truth.** Annado's whole philosophy is "the markdown files *are* the database." Reminders is its own iCloud-backed store. Bidirectional sync means reconciling two authorities — conflicts, deletions, and feedback loops included.

**Recommended path:** ship value incrementally — read-only first, then one-way mirror *with completion-back*, then optional capture, and only then full two-way. Don't start with two-way sync.

---

## 2. Why do this at all? (the product case)

Annado is a **macOS-only Tauri desktop app**. Its weakness is everywhere you *aren't* at your Mac: phone, Apple Watch, "Hey Siri, remind me to…", CarPlay, the lock screen, Shortcuts. Apple Reminders is the system-wide capture-and-complete surface that already lives on all of those.

So the compelling integration isn't "replace Annado's storage with Reminders" — it's **"Reminders becomes Annado's mobile/voice/ambient front-end,"** while the markdown vault stays the system of record. That framing also resolves most of the conflict-resolution questions in Annado's favor (the vault wins by default).

The two highest-value user stories, in order:

1. *"My Annado tasks show up in Reminders so I can see and **check them off** from my phone / Watch / Siri, and that completion flows back to the vault."* ← the killer feature
2. *"Things I capture into Reminders on the go land in my Annado inbox."* ← second

Everything else (editing dates in Reminders, full field parity, deletions) is long-tail.

---

## 3. Current architecture (grounding)

| Concern | Where | Notes |
|---|---|---|
| Native bridge | `src-tauri/src/calendar.rs` | Raw `objc_msgSend` FFI; `EKEventStore`, calendars, events, permission, delete. **EventKit is already linked.** |
| Permission flow | `calendar.rs:182` `check_calendar_permission`, `:373` `create_event_store`, `:413` `request_calendar_access` | Uses `requestFullAccessToEventsWithCompletion:` (full read/write) + dispatch-semaphore to block on the completion block. |
| Command surface | `commands.rs:721+` (calendar), registered in `lib.rs:327` `invoke_handler` | Clean pattern: thin `#[tauri::command]` → module fn. |
| Task model | `src-tauri/src/parser.rs` (`Task`, `:169`) + `src/types/task.ts` | `when`, `deadline`, `tags`, `checklist`, `projects`, `persons`, `priority`, `scheduledTime`, `durationMinutes`, `recurring_template_id`. |
| **Task identity** | `parser.rs:192` `generate_id` | **`SHA256(path:line)[..8]` — positional, NOT stable.** |
| Markdown round-trip | `parser.rs` `parse_file` + `format_task_line` (`:555`) | Writes inline `@when() @due() [[Project]] !(n) #tag @recurring(id) @completed() @created()`. |
| Stable-id precedent | `@recurring(<id>)` (`parser.rs:284` extract, `:622` serialize) | Proves we *can* persist durable machine ids in user markdown. |
| Write path | `vault.rs:448` `update_task` → `fs::write` (`:548`) | Re-reads file, rewrites the one line + notes block. |
| File watching | `vault.rs:873` `start_watching` | `notify` crate, 250 ms debounce, re-parses changed files, emits `tasks-updated`. **Relevant to the echo problem (§5.4).** |
| Background loop | `notification_scheduler.rs:81` `spawn_scheduler` | 60 s thread + `SENT` dedup set (`:56`). **Template for a sync loop.** |
| Settings storage | `commands.rs:30` `config.json`, plus `notification_prefs.json` — both in `app_config_dir()` | Where sync settings + a mapping store would live. |
| Deep links | `annado://` scheme (`tauri.conf.json`), `open_task_in_main` (`commands.rs:761`) | A reminder could carry a link back to its Annado task. |
| Permission strings | `src-tauri/Info.plist` | Currently only `NSCalendarsUsageDescription` / `…FullAccessUsageDescription`. Reminders needs its **own** keys. |

There is **no existing Reminders code** — Calendar today is read-only *display* of events in the Upcoming/Agenda views.

---

## 4. The native API surface (what EventKit gives us for Reminders)

Reminders use the same `EKEventStore`. The Reminders-specific calls, all reachable through the existing `msg_id!` bridge:

| Operation | Selector / API | Notes |
|---|---|---|
| Auth status | `authorizationStatusForEntityType:` with **`1`** (reminder) | Separate grant from calendars. `0=notDetermined,1=restricted,2=denied,3=authorized,4=fullAccess`. |
| Request access | `requestFullAccessToRemindersWithCompletion:` (macOS 14+) | Block-based → reuse the semaphore pattern from `request_calendar_access`. Legacy fallback: `requestAccessToEntityType:completion:`. |
| List the lists | `calendarsForEntityType:` with `1` | Reminders "lists" are `EKCalendar`s, just like event calendars. |
| Default list | `defaultCalendarForNewReminders` | |
| Fetch | `predicateForRemindersInCalendars:` → `fetchRemindersMatchingPredicate:completion:` | **Async/completion-based** → semaphore wait (same trick we already use). Only *committed* reminders are returned. Also `predicateForIncompleteRemindersWithDueDateStarting:ending:calendars:`. |
| Create | `[EKReminder reminderWithEventStore:]` | Set `title`, `calendar`, `notes`, `priority`, `dueDateComponents`, `startDateComponents`, `completed`/`completionDate`, `alarms`, `recurrenceRules`. |
| Save | `saveReminder:commit:error:` | |
| Delete | `removeReminder:commit:error:` | Mirrors existing `delete_event`. |
| Change feed | `EKEventStoreChanged` notification | Fires on *any* store change (incl. our own writes — see echo problem). `userInfo` can name what changed (e.g. `x-apple-eventkit:///Task/p1133`). |

### EKReminder field reality check (this drives everything in §5.2)

| EKReminder property | Usable? | Caveat |
|---|---|---|
| `title`, `notes` | ✅ | clean |
| `dueDateComponents` | ✅ | the date Reminders surfaces; may include time |
| `startDateComponents` | ✅ but hidden | EventKit supports it; the Reminders UI barely surfaces it |
| `completed` / `completionDate` | ✅ | clean — the basis of completion-back |
| `priority` (0–9) | ✅ | Apple convention: 0=none, 1=high…5=med…9=low |
| `calendar` (the list) | ✅ | how we map projects → lists |
| `recurrenceRules` | ⚠️ | conflicts with Annado's own recurrence engine (§5.2) |
| `url` | ❌ **unreliable** | Widely reported to read/write as `nil`; the Reminders-app URL field and `EKReminder.url` are not the same thing. **Do not** rely on it for the Annado back-link — put the link in `notes` instead. |
| **tags** | ❌ | **Not in public EventKit.** Only via private `ReminderKit` or reading the iCloud SQLite DB directly. |
| **sub-tasks** | ⚠️ | `parentReminder` exists since macOS 14, but with edge cases (e.g. moving a parent with children). Risky to depend on early. |
| sections, "early reminder", flagged, attachments, smart lists | ❌ | private API only |

**Implication:** a faithful, App-Store-safe integration must accept that **tags, persons, checklists, and Annado's `when`-buckets have no first-class Reminders home.** Plan around that, don't fight it.

---

## 5. The five hard problems

### 5.1 Identity (the keystone)

**Problem.** `generate_id = SHA256(file_path + ":" + line_number)`. Insert a line above a task, or rename its file/project, and its id changes — Annado would see "old task deleted, new task created." For one-shot UI that's fine; for sync it's fatal (you'd delete the synced reminder and recreate it, losing its completion state and any phone-side edits).

EKReminder's own ids are also imperfect: `calendarItemIdentifier` is local and can change across iCloud sync; `calendarItemExternalIdentifier` is the server id but Apple explicitly warns it "may match more than one" item.

**Solution.** Introduce a **stable Annado task UID, persisted in the markdown**, exactly like `@recurring(id)` already does:

- Option A — inline annotation: `@id(01J…)` (consistent with existing `@…()` syntax; easy to parse/serialize alongside the others in `format_task_line`).
- Option B — Obsidian block reference: a trailing `^annado-01J…`. Native Obsidian semantics, slightly less "noisy," but trickier to keep attached on edits.

Then maintain a **mapping store** (new `reminders_sync.json` next to `notification_prefs.json`, or a small SQLite db):

```
annado_uid  ↔  ek_reminder_external_id  +  last_synced_hash  +  last_synced_at  +  list_id
```

Also write `annado://task/<uid>` into the reminder **notes** (since `url` is unreliable) as a recovery anchor and a tap-back-to-Annado affordance.

> **Tension worth naming:** stamping machine ids into the user's clean markdown is mildly against Annado's "no lock-in / your files stay pretty" ethos. Mitigations: only stamp tasks the user has *opted to sync*; do it lazily; prefer the least-ugly syntax; make it removable. This is a real product decision, not just a technical one. The `@recurring(id)` precedent shows the project has already accepted this trade-off once.

This piece is independently valuable — stable task ids also improve notification dedup (`notification_scheduler.rs` currently keys on the unstable id) and enable durable deep links. **Build it first, even before any Reminders code.**

### 5.2 Data-model impedance (field mapping)

Recommended mapping for a sync'd task (✅ round-trips, ⚠️ lossy/one-way, ❌ can't):

| Annado | EKReminder | Dir | Strategy |
|---|---|---|---|
| `title` (minus inline `@…`) | `title` | ✅ | strip annotations before writing |
| `notes` | `notes` (+ hidden `annado://` marker) | ✅ | reserve a marker line |
| `deadline` (`@due`) | `dueDateComponents` | ✅ | **the clean, semantic match** (deadline ≈ due) |
| `scheduledTime` (`@time`) | time part of `dueDateComponents` | ✅ | only meaningful with a date |
| `when = {date}` | `startDateComponents` *or* `dueDateComponents` | ⚠️ | **decision needed** (see below) |
| `when = today/anytime/someday/inbox/evening` | — | ❌ | no Reminders equivalent; Annado-only buckets |
| `completed` / `completedDate` | `completed` / `completionDate` | ✅ | drives completion-back |
| `priority` 1/2/3 | `priority` 1/5/9 | ✅ | map both ways (1–4→high, 5→med, 6–9→low) |
| `projects[0]` (primary `[[wikilink]]`) | `calendar` (list) | ⚠️ | map primary project → list; multi-project is lossy |
| `projects[1..]`, `persons` | — | ❌ | embed as text in notes, or drop |
| `tags` | — | ❌ | not in EventKit; optionally append `#tag` text to notes |
| `checklist` | `parentReminder` subtasks | ⚠️ | macOS 14+, fragile; initially flatten into notes |
| `recurring_template_id` | `recurrenceRules` | ⚠️ | **don't** set a rule — sync concrete instances instead (avoid double-generation) |
| `durationMinutes` (`@duration`) | — | ❌ | no equivalent; drop or note |

**The `when` vs `deadline` decision.** Annado (Things-style) separates *when I'll work on it* (`when`) from *when it's due* (`deadline`). Reminders effectively surfaces **one** date (its due date). So a choice is forced:

- **Recommended default:** map `deadline` → Reminders due date; if no deadline, map `when={date}` → due date; the abstract buckets (today/anytime/someday) don't set a date. Simple and predictable.
- Alternative: `when` → `startDateComponents`, `deadline` → `dueDateComponents` (uses both EK slots, but the start date is nearly invisible in the Reminders UI, so users won't "see" their scheduled date — likely confusing).

**Recurrence.** Annado generates recurring *instances* into the vault from templates. If we also hand Reminders a `recurrenceRule`, Reminders generates its *own* series → duplicates. Safest: sync only the already-generated concrete instances as plain reminders; never set `recurrenceRules`. Revisit later.

### 5.3 Structure mapping (projects/views ↔ lists)

Reminders organizes by **lists**; Annado by **projects** (`[[wikilinks]]`) and **views** (Today/Anytime/…). Options:

- **A — One "Annado" list.** Everything synced lands in a single list. Dead simple; loses project structure.
- **B — Project → list.** Each synced project becomes/maps-to a Reminders list. Natural, but: list creation, renames (Annado `rename_project` exists), deletions, and tasks with *multiple* projects all need rules.
- **C — View-scoped.** Sync only a chosen scope (e.g. "Today + flagged projects") into one list. Matches the "ambient phone view" use case well.

**Recommendation:** start with **A or C** (one list, scoped) for the first shippable version; offer **B** later as "map projects to lists."

### 5.4 Change detection & the echo/feedback loop

Both sides emit change signals, and **both fire on our own writes**:

- Vault side: `vault.rs:873` `start_watching` (`notify`, 250 ms debounce) emits `tasks-updated` whenever a file changes — *including when Annado itself wrote it*.
- Reminders side: `EKEventStoreChanged` fires on any store mutation — *including our `saveReminder:`*.

Naïvely wiring "file changed → push to Reminders" and "store changed → write to file" creates an **infinite loop**.

**Mitigations (compose several):**
- Keep `last_synced_hash` per task (in the mapping store). Only propagate a side whose *content hash actually differs* from the last synced snapshot — our own write reproduces the same hash, so it's a no-op.
- Suppress-self window: set an "I'm writing now" flag around `saveReminder:` / `fs::write` and ignore the resulting change event.
- Drive sync from an explicit reconcile pass (the 60 s loop), not directly from raw events; events just mark the store "dirty" to trigger an earlier reconcile.

The `SENT` dedup set in `notification_scheduler.rs:56` is the existing pattern to imitate.

### 5.5 Conflict resolution & deletions

Once edits can originate on either side:

- **Conflict policy.** With "vault = system of record," default to **vault-wins**, except completion, where **last-writer-wins by timestamp** is friendlier (checking a box on your Watch should win). Make the policy explicit and few-valued; surface conflicts rather than silently clobbering.
- **Deletions are the dangerous bit.** "Deleted in Reminders ⇒ delete the markdown line" risks destroying user data on an iCloud hiccup or a list the user cleaned up. Default to **tombstone, don't delete**: unlink the mapping and (optionally) flag the Annado task, rather than editing the vault file. Only offer true delete-propagation as an explicit, well-warned setting.
- **First-run blast radius.** Mirroring 2,000 vault tasks into Reminders on day one is a footgun. Gate behind explicit scope selection + a dry-run preview ("will create N, update M, delete 0").

### 5.6 Permissions, entitlements, sandbox

- Add Reminders usage strings to `Info.plist`: `NSRemindersFullAccessUsageDescription` (macOS 14+) and legacy `NSRemindersUsageDescription`. (Calendars keys already present.)
- Reminders is a **separate** TCC grant from Calendars — its own prompt, its own deny state, its own "open System Settings" remediation copy (mirror the existing calendar error strings).
- Known macOS 14.x potholes to design around: reports of `requestFullAccessToReminders` returning `success=false`/no prompt, and `CalendarAgent` sandbox lookup errors. Implement: robust status re-checks, a "Reminders access" diagnostics row in settings, and graceful degradation (feature simply stays off if not authorized).
- If Annado is ever sandboxed/notarized for distribution, confirm the EventKit entitlement; the current raw-FFI approach is fine but worth a notarization smoke test.

---

## 6. Sync topology — options & recommendation

| Topology | Effort | Value | Risk |
|---|---|---|---|
| **Read-only**: show Reminders inside Annado (like Calendar today) | S | low–med | very low |
| **One-way push**: vault → Reminders mirror (+ completion-back) | M | **high** | medium |
| **One-way capture**: Reminders → vault inbox | M | med | medium (parsing/placement) |
| **Two-way**: full reconcile, edits + deletes both ways | L | high | **high** |

**Recommendation:** climb the ladder. Read-only → one-way push *with completion-back* (this alone delivers the killer feature) → capture → two-way (opt-in). Resist starting at two-way.

---

## 7. How it slots into the code

Net-new, mirroring the Calendar slice:

- `src-tauri/src/reminders.rs` — EventKit Reminders bridge: `check_reminders_permission`, `fetch_reminder_lists`, `fetch_reminders`, `create_or_update_reminder`, `complete_reminder`, `delete_reminder`. Reuse `nsstring`, `from_nsstring`, `nsdate_*`, the `msg_*!` macros, and the semaphore-block pattern from `calendar.rs` (consider promoting those into a shared `eventkit.rs`).
- `src-tauri/src/sync/` (new) — the reconcile engine: mapping-store load/save, diff computation, conflict policy, echo-suppression, the scope filter. Pure logic ⇒ unit-testable without EventKit.
- Background driver — extend the `spawn_scheduler` pattern (or a sibling thread) to run a reconcile tick; subscribe to `EKEventStoreChanged` to trigger early ticks.
- Commands in `commands.rs` + registration in `lib.rs:327`: `check_reminders_access`, `get_reminder_lists`, `get_sync_settings` / `set_sync_settings`, `run_reminders_sync` (manual "Sync now"), `preview_reminders_sync` (dry-run).
- Parser/serializer — add the stable `@id(...)` (or `^block-id`) to `parse_file` + `format_task_line` (`parser.rs:555`) and to `Task`.
- Frontend — a "Reminders Sync" settings panel (model it on `NotificationSettings.tsx` and the existing calendar settings): enable toggle, permission status + remediation, scope picker (which lists/projects/views), conflict-policy choice, "Sync now" + dry-run preview, last-sync status/errors.
- `Info.plist` — Reminders usage strings.

State/config files (all in `app_config_dir()`): extend `AppConfig` or add `reminders_sync.json` for settings; a dedicated mapping store (JSON for v1; SQLite if volume/integrity demands).

---

## 8. Alternatives considered

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Public EventKit** (extend `calendar.rs`) | Already linked; supported/stable; App-Store-safe; full CRUD on core fields | No tags/sections; subtasks fragile; `url` unreliable | **Chosen.** Right default. |
| AppleScript / JXA to Reminders.app | Sometimes exposes a few more UI-ish fields; no entitlement fuss | Slow, brittle, prompts, automation-permission hell, hard from sandbox, scripting-dictionary drift | Avoid (maybe a niche fallback). |
| Third-party CLI (`keith/reminders-cli`, RemCTL) | Fast to prototype; some expose tags/subtasks | External dependency; RemCTL-class tools lean on **private ReminderKit** / direct **iCloud SQLite** reads | Not for a shipping integration. |
| Private `ReminderKit` / read iCloud DB directly | Full fidelity (tags, sections, subtasks, attachments) | Private API: brittle across OS updates, App-Store-disqualifying, can break on schema changes | No (note as the *only* way to get tags, if ever critical). |
| iCloud web / CalDAV | Cross-platform in theory | No official Reminders API; CalDAV-for-Reminders is unofficial/unsupported | No. |

---

## 9. Proposed roadmap

Each phase ships independently and is individually useful. T-shirt sizes are relative.

### Phase 0 — Spike & read-only (S)
- Extend the EventKit bridge to entity type `1`: request Reminders access (own Info.plist strings), list Reminders lists, fetch reminders in a date window.
- Surface read-only (e.g. show due reminders next to tasks, à la Calendar) — or even just a settings diagnostics row proving access works.
- **Exit:** we can auth, enumerate lists, and read reminders. No vault writes, no mapping. De-risks the native layer.

### Phase 1 — Stable identity (M) — *keystone, do before any writing*
- Add a durable task UID, persisted in markdown (`@id(...)` or `^block-id`); parse + serialize it; backfill lazily on touch.
- Stand up the mapping store (`annado_uid ↔ external_id ↔ hash/timestamp`).
- Repoint notification dedup and deep links at the stable id.
- **Exit:** every (opted-in) task has a stable identity that survives line moves and renames. Independently shippable improvement.

### Phase 2 — One-way push + completion-back (M) — *the killer feature*
- Reconcile vault → a chosen Reminders list (scope = one list, or "Today/flagged projects"): create/update reminders for the safe field set (title, due=deadline||when-date, time, priority, notes+back-link).
- **Completion-back:** a box checked in Reminders marks the Annado task done in the vault (last-writer-wins on completion).
- Echo-suppression via `last_synced_hash` + self-write windows; background reconcile tick + manual "Sync now" + dry-run preview.
- **Exit:** Annado tasks appear in Reminders on all Apple devices and can be completed there, flowing back to markdown.

### Phase 3 — Capture: Reminders → vault inbox (M)
- New reminders in the synced list (created on phone/Siri) become Annado inbox tasks in a configured daily-note/inbox file; record them in the mapping store so they're not re-captured.
- Decide placement + how much metadata to import (title/notes/due/priority).
- **Exit:** on-the-go capture lands in Annado.

### Phase 4 — Two-way reconciliation (L) — *opt-in*
- Propagate edits both directions (dates, priority, notes, list/project moves) under an explicit conflict policy (vault-wins default; completion = last-writer-wins).
- Deletion handling: tombstone-by-default; true delete-propagation only behind a warned setting.
- Robust preview/dry-run; conflict surfacing in the UI.
- **Exit:** genuine bidirectional sync for users who want it.

### Phase 5 — Fidelity & polish (ongoing)
- Project→list mapping (multiple lists); recurrence reconciliation; tags-in-notes convention; optional macOS-14 subtasks; `EKEventStoreChanged`-driven low-latency sync; richer error/permission diagnostics; performance at large vault sizes.

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5
(read-only) (identity)  (push +     (capture)   (two-way,   (fidelity)
            *keystone*  complete-               opt-in)
                        back)
```

---

## 10. Decisions needed before building

1. **Scope model:** one "Annado" list, or project→list mapping, or a view-scoped sync (Today/flagged)? (Affects Phase 2 design.)
2. **Which date becomes the Reminders due date:** `deadline`-first (recommended) vs using `start`+`due` for `when`+`deadline`?
3. **Stable-id syntax:** `@id(...)` inline vs `^block-ref` — and how to honor the "keep my markdown clean" ethos (opt-in-only stamping?).
4. **Conflict + deletion policy defaults:** vault-wins + completion-LWW; tombstone-not-delete — acceptable?
5. **Tags/persons/checklists:** drop, or embed-in-notes? (No clean EventKit home.)
6. **Distribution:** is App-Store / sandbox / notarization a target? (Rules out private-API fidelity; affects entitlements.)

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Feedback loop duplicates/churns data | hash-based diffing + self-write suppression + reconcile-driven (not event-driven) writes |
| Data loss from deletion propagation | tombstone by default; explicit, warned opt-in for real deletes; dry-run preview |
| Identity drift breaks mappings | Phase-1 stable UID before any writes; never sync without it |
| macOS 14.x permission/sandbox bugs | status re-checks, diagnostics UI, graceful "feature off if unauthorized" |
| Field loss surprises users | be explicit in UI about what does/doesn't sync; keep vault authoritative |
| First-run mass-mirror | scope selection + dry-run + counts before first push |
| "Clean markdown" ethos vs machine ids | opt-in stamping, least-ugly syntax, removable |
| Private-API temptation for tags | hold the line on public EventKit; treat tags as out-of-scope unless DB-read is explicitly accepted |

---

## Sources

- [EventKit — Apple Developer](https://developer.apple.com/documentation/eventkit)
- [Retrieving events and reminders — Apple Developer](https://developer.apple.com/documentation/eventkit/retrieving-events-and-reminders)
- [`requestFullAccessToReminders(completion:)` — Apple Developer](https://developer.apple.com/documentation/eventkit/ekeventstore/4162273-requestfullaccesstoreminderswith)
- [`calendarItemExternalIdentifier` — Apple Developer](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier)
- [`EKEventStoreChanged` — Apple Developer](https://developer.apple.com/documentation/foundation/nsnotification/name/1507525-ekeventstorechanged)
- [Permission issue accessing Reminders through EventKit (macOS 14 bug report) — Apple Forums](https://developer.apple.com/forums/thread/745752)
- [EKReminder URL property is nil — Apple Forums](https://developer.apple.com/forums/thread/128140)
- [RemCTL: power-user Reminders CLI (private ReminderKit + iCloud DB) — MacStories](https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/)
- [viticci/remctl — GitHub](https://github.com/viticci/remctl)
- [Support sub-tasks (parentReminder) — mattt/iMCP #145](https://github.com/mattt/iMCP/issues/145)
- [FradSer/mcp-server-apple-events (EventKit integration reference) — GitHub](https://github.com/FradSer/mcp-server-apple-events)
