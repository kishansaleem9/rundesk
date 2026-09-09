# Video 2 — re-audit against the frames

## Why this exists

The first audit compressed 116 timestamped frames into 14 items, and closing
those 14 was treated as closing the video. This pass re-reads every frame
against the code, including the items already marked built.

**The method failure it corrects.** The original audit's own opening says the
video-1 transcript-only pass *"missed three features because she never says them
out loud, and the same thing happens here"*. That warning was written and then
ignored: repeatedly, a feature the frames show clearly but the transcript never
mentions was recorded as "not asked for". Every such error shrank the scope.
Not one enlarged it.

Her governing instruction is `[21:43]` — *"jo FEATURES maine enlist kiye hain, un
ka matlab yeh hai ke humein yeh cheezein chahiyein"*. **Showing a menu while
saying "we can add any of these" is enlisting them.** The field-type picker was
excluded on the argument that she names only one type; she opens the picker,
scrolls it, and says ClickUp gives us all these options. That reading was wrong
and is corrected here.

---

## 0. Progress on this re-audit

Kept current deliberately. The first audit's "what was built" sections became an
unreliable index — three items had them, nine did not — and that is how V2-01
went missing entirely. A list that is only written once stops being true.

**§1 defects: all four fixed.**

| | fixed in | how it is now held |
|---|---|---|
| V2-02d dead toggles | `showOverdue` reads the backlog, `showAssigned` and `timezone` given controls | 15 checks, before/after on the calendar |
| V2-01b config panel | frame `00:25`'s panel added to the create-field row | 45 checks; two fields on one task disagree because their configs do |
| V2-10 Related Items | one panel, Relationships \| References | 13 checks; the API-only suite now opens a browser |
| V2-13 Team View | built as a view type, ungated | 9 checks, all on the arithmetic |

**Beyond §1:**

- **Field types 17 → 19.** `files` and `voting`, the two `0143` deferred by
  name. Both deferrals were answered rather than overruled — see the commit.
  Voting ignores the submitted body entirely and toggles only the caller's own
  vote, because a vote you can cast on somebody else's behalf is not a vote.
- **A fourth duplicated-list bug**, found while adding Team View: the list route
  keeps its own `ALL_VIEWS` copy and silently filters out anything missing from
  it. Four now: two planner settings types, two field-type lists, the API vs
  route view keys, and this.

**Still open:** the AI four and the remaining ~9 field types, everything in §2
still marked M or P, and V2-03.

---

## 1. Items marked BUILT that do not satisfy the frame

**All four are now fixed** — this section is kept as the record of what was
wrong, because the pattern matters more than the individual defects.

### V2-02d — a settings toggle that changes nothing

`showOverdue` exists in exactly four places: a type in
`planner-settings-dialog.tsx:61`, the toggle at `:297-301`, a type in
`packages/db/src/schema/time-blocks.ts:103`, and four i18n strings. **Nothing
reads it.** It saves, reads back, and changes nothing.

That is this codebase's named defect class — *a settings form that saves, reads
back and changes nothing* — shipped inside the item whose title is "three
Planner settings pages that **change the calendar**", and whose suite was
written specifically to assert before/after on the grid. The suite covers the
other toggles and never touches this one.

Two more in the same file:
- `showAssigned` — declared in two type files, no control, no reader.
- `timezone` — **full validated server support** (`planner.service.ts:116,146`,
  `users.timezone`), and no control rendered. The dialog even has a comment at
  `:216` explaining where the column lives.

### V2-01b — the config panel frame `00:25` is entirely about has no UI

The derived-percentage engine is real and unit-tested. But frame `00:25` is not
a percentage — it is a **configuration panel**: *Track completion of* →
Subtasks · Checklists · Assigned comments, and *Tasks without active items*.

`createDefinition` accepts `config`; the create form posts only
`name`, `type`, `options` (`quick-create-modal.tsx:360-379`). Nothing in
`apps/web/src` references `doneStatusIs100` or `sources`. **Every Progress field
is created with hard-coded defaults and cannot be changed.** The one field she
demonstrates end to end is the one whose settings are unreachable.

### V2-10 — the item was closed on a different deliverable

Frame `06:10` is one **Related Items** panel with two tabs,
**Relationships | References**. What was built (`69f8b79`) is "a doc shows the
tasks that point at it" — the doc-side backlink, which is good and was missing,
but is not the frame. There is no References tab, no backlink concept, no single
"+ Relate a Task or Doc" entry point; dependencies and linked docs remain two
separate sections under different names.

### V2-13 — the paywall pattern is built but wired to one call site

`FeatureGateDialog` (`feature-gate.tsx:76`) does the teach-then-offer properly,
including a "Contact your admin" that really notifies. It is attached to exactly
one surface (`call-host.tsx:37`). The two the frames actually show — **Team View**
(`09:25`) and **List export** (`11:00`) — have nothing behind them, and Team View
does not exist as a view type at all.

---

## 2. What the frames show, by section

Legend: **B** built · **P** partial · **M** missing.

### S01–S06 · task create, task detail, checklists, cover, comments

| | capability |
|---|---|
| B | Create-modal tab strip; time estimate, dates+times, priority, tags-on-enter |
| B | `+ Create new field` on the create modal; 17 field types |
| P | ~30 field types — **11 absent**: Formula, Summary, Progress Updates, Relationship, Tasks, Categorize, Translation, Sentiment, Signature, Button, Action Items. ~~Files~~ and ~~Voting~~ built in `0145` |
| M | Searchable field-type picker (it is a native `<select>`) |
| B | Progress (Auto) config panel — engine *and* the panel frame `00:25` shows |
| M | Field config: required marker, "More settings and permissions", Cancel/Create |
| M | Toast "Created field `<name>`" |
| P | Attach on create — uploads *after* the task exists, single file, no removable list |
| M | Task-detail AI bar ("Ask Brain² for a presentation, document or prototype") |
| M | "Collapse empty fields" |
| M | Relative times in the activity feed + "Show more" |
| M | "Comment ▾" split button; "Create Task ▾" split button |
| M | Toast "Task created — `<title>` › `<list>`" with Copy / View |
| P | Time-estimate popover with a unit-suggestion row |
| P | Attachments "Drop files here" — the panel exists, **no drop handler** |
| P | "Add checklist" — only created implicitly by adding an item |
| M | Checklist header open-item count ("Checklists 2 open") |
| M | Attachment thumbnail hover actions; attachments header view-toggle |
| B | Cover: Gallery / Upload / Link / Attachments / Remove, Reposition, Change cover |
| M | Cover: Search tab (documented as deliberate); Gallery "Custom" swatch |
| M | Task type "Fill with AI" |
| P | Activity panel is a tab, not a toggleable rail |
| M | Task header "Created `<date>`" chip; "Brain²" button |
| B | @ picker People/Tasks/Docs; "Does not have access to task" |
| M | @ picker Whiteboards / Locations / Channels; Brain section; Agents |
| M | Per-@-type keyboard hint footer |
| B | Voice note, Transcribe, Insert as text, inline player, **locale→speech language** |
| M | "Attach as audio file" tooltip |
| M | **Comment "+" menu** — the ten items exist scattered, no menu gathers them |
| M | Slash commands in the comment composer (description editor only) |
| B | Record a Video Clip; real `getDisplayMedia` |
| M | Screen-record setup panel (source / 1080p / mic device) |
| M | "Clip created!" card — Create a task · New tab · Copy link; "Link copied" |
| P | Clip in a comment renders, but no title, spinner, or card actions |
| M | Composer hint "Press 'space' for AI or '/' for commands" |
| P | Threads — replies nest inline; no "Thread by `<name>`" panel with own composer |
| B | Reactions, react/reply/assign hover actions, resolve/reopen |
| M | "Save" a comment |

### S07–S12 · relationships, space wizard, views, export, filters

| | capability |
|---|---|
| B | Related Items — one panel, Relationships \| References, single entry point |
| M | Right-rail "Related Items" icon + tooltip |
| P | Sidebar Direct Messages — exists on the chat page, not the workspace tree |
| M | Create-menu search "Describe anything to create"; Create with AI; Super Agent |
| M | "Form" absent from the create menu though the module exists |
| B | Create-a-Space: icon+name, description, **Default permission**, Make Private |
| M | Space dialog footer "Use Templates" |
| B | Space wizard: 4 presets, default views, statuses, ClickApps grid, per-space gating |
| P | ClickApps — 6 keys vs the frames' 11 |
| M | "Default View Templates" tab |
| P | View types — 5 of 11 (Map, Activity, Team, Mind Map, Timeline, Workload absent as list views) |
| M | **Copy configuration from another space** ("from: `<Space>` · Hide · Apply") |
| P | "+" on a space is a single action, not the 8-item menu |
| P | Create Folder — no description column, no private toggle in the dialog, no templates |
| M | Folder "Use Space statuses" inheritance |
| B | Skeletons on load; sidebar hierarchy; breadcrumb |
| P | Error toasts — bottom-right not bottom-left, **list names have no uniqueness constraint**, quick-create ListForm has no `onError` (a failure there is silent) |
| B | **Delete → trash + Undo + Ctrl+Z** |
| B | Board view: status lanes, colours, counts, per-lane add, drag between lanes, + Add group |
| B | **Team view** — a view type, ungated; rows per person with their own load |
| P | Paywall that teaches — built, wired to one call site (see §1) |
| M | Plan-tier paywall UI; "uses have expired" metered state |
| B | Calendar view, Gantt (today line, zoom, drag, critical path) |
| M | Gantt: Auto fit, week numbers, collapsible panels, local export |
| M | Create-modal placeholder "Add description, or write with ⚡AI" |
| B | Customize view: Autosave, Pin, Private, Protected, Set default, Copy link, Sharing |
| M | Customize: Stack fields, Show empty fields, Collapse empty columns |
| B | Export: CSV/Excel, three-way scope, date+time formats, honours the view |
| M | Export paywall (open by design here) |
| B | In-list search, Save-view chip, filter rules, nested groups, saved filter sets |
| P | Assignee filter is a `<select>`, not an avatar picker |
| M | "assigned to me" toggles — Comments · Subtasks · Checklists |

### S13–S17 · imports, templates, planner, planner settings, task menu, AI hub

| | capability |
|---|---|
| P | Import — ClickUp CSV only (+ API token, beyond the frames) |
| M | The ten named importers; spreadsheet/document import |
| P | Template Center — a page, not a modal; no type facet, complexity, use-cases, categories |
| M | Planner onboarding screen |
| B | Connect Google / Outlook; two-way scope; drag task → block; prefix applied |
| P | "Team schedules" — one person at a time, no side-by-side grid |
| B | Planner: Priorities rail, Meet with, Backlog, day columns, all-day row, 24h gutter, live now-line |
| P | "+ Add priority" — exists in the person panel, planner rail is read-only |
| M | Rail sections **Assigned to me** and **Today & overdue** |
| M | Planner bottom command bar |
| M | **Calendar picker grouped by account** (+ workspace calendars: Time off, Holidays) |
| P | Calendar settings — 4 of 7 pages |
| M | **Conferencing / Zoom** connect row |
| M | Settings footer: What's new · Report a problem · Feature requests |
| M | **View selector Day / 4 days / Week / Month** + shortcuts `d x w m` |
| B | Show weekends; event style; default duration; colour tasks by; start week on |
| M | Appearance: Grid size |
| B | Timezone — the control the validated server support was missing |
| B | Sidebar page: show/hide rail sections |
| M | Sidebar: drag-reorder, "+ Add a new section" |
| M | **Upcoming meeting page** entirely (show time left, desktop, quick-join) |
| M | Time blocking: show closed, future recurring, focus-time visibility, per-day work schedule |
| B | `showOverdue` — now read by the backlog |
| B | `showAssigned` — given a control and a reader |
| B | Default list for new tasks; timeblock prefix; quarter-hour snapping |
| B | Task menu: Copy link/ID/New tab, Merge, Convert, Description history, Print, Send email, Duplicate, Move, Follow, Remind, Task type, Templates, Sharing, Delete |
| P | Favorite and Archive exist elsewhere, not in the task menu |
| M | "Add to ›" (a task in more than one list) |
| M | Assignee picker: search box, invite-by-email, Agents, "⚡ Assign with AI" |
| M | **assign → "Add to priorities?" prompt → toast → planner rail** — the whole chain |
| B | Live focus countdown in the header |
| M | Countdown in the browser tab title |
| M | Brain² hub, `/ai/brain`, AI-scoped left nav, Ask\|Agents toggle, Super Agents |
| M | Credit meter; rotating placeholder; composer "+"; generated artifacts / slide deck |
| B | Skills; Recent Chats with auto-derived names |

### S18–S22 · model picker, AI execution, analytics, credits, connections, teams

| | capability |
|---|---|
| P | Model picker — 2 tiers in a `<select>` vs 7+ named models |
| M | "Best models" header; hover cards with Speed/Intelligence bars; Show more |
| M | Inline word suggestions while typing |
| B | **Live step log**; steps emitted only after the lookup returns |
| B | **"No changes made."**; copy / 👍👎 / retry; **Follow ups** (generated, capped at 3) |
| P | Integration error card — thin banner, no "Help center article" link |
| M | Success message with clickable path chips (`rundesk › ddddd › List`) |
| B | AI Analytics: Time Saved with its working, Human Cost Savings, editable rate, Edit benchmark, validation, net-can-be-negative |
| P | "Actions completed" — per-feature breakdown exists; the frames' 8 categories do not |
| M | **Credits entirely**: tab, category→credits table, usage-trend chart with limit line, Add credits, My Agent Performance |
| M | Image generation |
| B | App Center with categories, per-app descriptions, connection health |
| P | Apps — Box, Confluence, Jira, Gmail, SharePoint, Outlook Mail absent |
| M | "+ Suggest an app"; "Connect Custom MCP Servers" banner |
| P | Activity log — no Status or My-agents filter |
| B | Teams Hub reachable by a plain member; All Teams / All People / Org Chart; My Teams; search; org-chart empty state |
| M | Teams empty-state headline; **Browse People / Create Team** buttons; two explainer cards |
| M | Per-person work preview cards |
| M | Contextual starter cards that change with context |

---

## 3. Deliberately out of scope

- **Automations** — `[14:29]` she says she will explain it *"end mein"* and the
  video ends without her returning. Parked at the client's instruction.
- **AI Notetaker (V2-03)** — needs a meeting bot; build-vs-buy is with the
  client. Note that Rundesk's own transcription is **per-participant browser
  speech-to-text**, so none of it transfers to an external call.
- **Credits** — Rundesk bills in dollars; minting an in-app currency to mirror a
  competitor's packaging invents a product concept. *Recorded as a decision, not
  as an absence.*
- **Team analytics** — the frames list the tab, nothing is behind it, she never
  opens it. Guarded against by `teams-destination.mjs`.

## 4. Counts

Roughly **150 distinct capabilities** across 116 frames. The first audit
adjudicated 14 items. Of what was checked here: a little over half is built,
about a fifth is partial, and about a quarter is missing — plus **four items
marked complete that do not satisfy their frame**, listed in §1.

The four in §1 come first: they are defects in shipped work, and one of them is
a control that does nothing.
