# Rundesk — ClickUp Platform Overview Build Spec

Derived from the client's 25:52 ClickUp overview walkthrough and a code audit of this
repository. This document is the scoping decision record: it separates the parts of
ClickUp worth rebuilding from the parts that are bloat or infrastructure we should not
take on.

---

## 0. Provenance and honesty notes — read this first

Three things about the source material a reader needs to know before trusting anything
below.

**The audit payload is truncated.** It is labelled "676 features" but the JSON supplied
ends part-way through entry #79. Everything in this spec is grounded in entries 1–78
plus a partial 79. That subset covers search, inbox, navigation, chat, tasks/views, AI,
docs, dashboards, forms, clips, time tracking and admin — the spine of the product — but
it is not the whole video. Areas that appear nowhere in the supplied slice (automations,
goals, sprints, whiteboards, mindmaps, imports, billing) are unscoped here, not
cleared. Do not read an absence below as "nothing to do."

**There are no timestamps in the audit payload, so this spec cannot cite mm:ss.** The
brief asked for them and I will not invent them. The audit entries are numbered in video
order but carry no time marks, and interpolating an index across 25:52 would be
fabrication — especially since 78 of a claimed 676 entries may only cover the opening
few minutes. Every area below instead cites the stable audit entry numbers (`#12`,
`#44`) which map 1:1 onto the video's own ordering. Filling in real time marks is a
trivial pass over the recording by someone with it open; it is listed as an open
question in §6.

**I re-ran greps against the "missing" verdicts before writing them down.** Most held.
Three did not, and the corrections are recorded in §0.1 rather than buried, because two
of them change effort estimates.

### 0.1 Corrections to the audit

**Correction 1 — clip transcription (#71, #72). The audit's evidence is factually
wrong.** It claims `grep -rniI "transcri"` over `apps/` returns no match and concludes
"No transcription at all." It does match. `apps/web/src/lib/use-speech-recognition.ts`
is a complete push-to-talk speech-to-text hook built on the browser-native Web Speech
API, already wired into two surfaces — `apps/web/src/components/ai-panel.tsx:56` and
`apps/web/src/pages/workspace-ai-page.tsx:394` — with its own test file. The *verdict*
survives: this is live microphone dictation, and it cannot transcribe an already-recorded
clip file, so clip transcript previews really are missing. But "no transcription at all"
overstates the hole, and the reusable hook plus the existing `MicButton` mean any
dictation-shaped requirement is close to free. Clip-file transcription is a separate,
genuinely expensive problem (see §5).

**Correction 2 — federated search groundwork (#2). The verdict is right, the evidence
understates what exists.** The audit says grepping for drive/gmail/dropbox/sharepoint
hits "only task external-link providers and the integrations catalogue cards — never a
search source." In fact `apps/api/src/modules/integrations/connections/integration-connections.service.ts`
is a real OAuth broker covering `google-drive`, `onedrive`, `dropbox`, `outlook`, `zoom`,
`github`, `gitlab`, `gcal`, `linear` and `salesforce`, with encrypted token storage,
refresh handling, expiry-health computation and per-provider availability checks driven
by env config. No provider exposes a *search* call, and `SearchEntityType` at
`apps/api/src/modules/search/search.service.ts:15` is still `'task' | 'doc' | 'file'`,
so cross-app search is correctly marked missing. The correction matters for sizing: the
authentication and token-lifecycle half of that feature is already built, so if we ever
do want it, it is a "call three search APIs and merge" job, not a from-scratch
integration programme.

**Correction 3 — effort on the Primary/Other notification split (#19), medium → small.**
The audit rates it medium on the grounds that nothing classifies notifications. Nothing
does, but `notificationTypeEnum` at `packages/db/src/schema/enums.ts:73-94` already
encodes the distinction the tab is asking for. Machine-generated types (`task_due_soon`,
`task_overdue`, `task_status_changed`, `task_updated`, `ai_briefing`, `workload_alert`,
`billing_past_due`) are cleanly separable from human-directed ones (`task_mentioned`,
`task_commented`, `chat_message`, `doc_mentioned`, `approval_needed`). A Primary/Other
split is a partition function over an enum that already exists — no migration, no new
column, no backfill. Small.

---

## 1. What the client asked for

> **"mujhe saare features nahi chahiye; woh humein to-the-point aur direct features chahiye"**
> — *I don't want all the features; we want the to-the-point, direct ones.*

She wants Rundesk built on ClickUp's **layout and feature set** — the shape of the
product, the way things are arranged, the interaction grammar — but explicitly not
ClickUp's full surface area.

That framing does real scoping work, and it should be read as three instructions rather
than one.

**Layout is in scope even where function already exists.** This is the part most easily
mistaken for polish. When she points at ClickUp's two-tier navigation or its Inbox tab
strip, she is not asking for new capability — she is asking for an arrangement. Several
Rundesk areas are functionally complete but arranged differently, and under this brief
those still count as gaps. The Home page's Inbox/Replies/My-Tasks tree
(`apps/web/src/routes/app.$workspaceId.tsx:249-259`) does everything ClickUp's Home rail
does, but it lives in the page body and evaporates when you navigate away. That is a
layout gap, and it is legitimate work.

**Depth on the daily-driver surfaces is in scope.** "To-the-point and direct" describes
the surfaces someone touches every hour: triaging the inbox, finding a thing, filtering
a list to their own work, commenting. Where Rundesk is shallow on those, the shallowness
is felt every day. The Inbox having two buckets instead of five, and no way to dismiss a
notification, is the clearest example in the whole audit.

**Feature count is not the goal, and breadth-for-breadth's-sake is explicitly out.** She
is pre-emptively refusing the ClickUp habit of shipping a surface for everything. Super
Agents, a Skills library, an Org Chart, Team Analytics, per-hour presence charts, an
overflow menu of eleven hidden searchable object types — these exist in ClickUp because
ClickUp sells breadth. Rundesk does not have to. §5 says no to these by name, with
reasons, so that "we saw it in the video" never becomes an argument on its own.

The operative test for every item below: *does a user hit this on a normal working day,
and is Rundesk's version worse in a way they would notice?* If no to either, it belongs
in §5.

---

## 2. Summary table

Verdicts are per-area and deliberately conservative. An area is **partial** if any part
of what the video shows is missing, even when the backend is complete — "partial" here
usually means "works, arranged differently or one layer shallower," not "broken."

| Area | Verdict | One-line gap |
|---|---|---|
| Inbox & notification triage | partial | Two read-state buckets, not five triage tabs; no dismiss/clear state on the row at all |
| Navigation shell | partial | One wide sidebar plus a floating pill; no fixed icon rail and nothing swaps the panel by context |
| Search & command bar | partial | Search works well; it is not a command surface — no Ask AI, no `/`, no multi-select filters, no sort |
| Task detail depth | partial | Description is a plain textarea — no `/` menu, no embeds; Activity and Comments are separate tabs that drop `from → to` |
| List filtering | partial | Only status/priority/assignee are filterable; no filter builder, no nested conditions |
| Chat, channels & DMs | partial | Core chat is strong; missing followers panel layout, mark-unread, and per-person Calendar/Tasks tabs |
| AI surfaces | partial | Rich AI hub exists but is a destination, not a dock; no model picker, no agents |
| Home & personal work | partial | Personal List is a flat checklist; "Assigned to me" has no priority/due columns or grouping |
| Docs | partial | Tree-only browsing, no sortable table; `/` menu has 5 formatting blocks and no embeds |
| Dashboards | partial | Single dashboard page — no hub, no index table, no per-person timesheet card |
| Forms | partial | Card grid not a table; destination list configured indirectly via a mapped field |
| Time & timesheets | partial | Week is pinned to the current week; no all-member browsable timesheet |
| People & admin | partial | Members is a two-card list, not a roster table; settings rail is flat and split across routes |
| Planner | missing | No planner surface at all; overlaps existing timeline + list calendar |
| Calendar events | missing | No event entity — calendar creates tasks only |
| Shared-with-me | missing | Sharing works; there is no reverse "what was shared with me" query |
| Agents / Skills | missing | No agent or skill entity anywhere — recommend skipping |
| Calls (SyncUp) | missing | No in-app calling — recommend skipping, needs WebRTC/SFU |
| Meeting notes & notetaker | missing | Notes are extracted then discarded, never stored — recommend skipping the notetaker |
| Cross-app federated search | missing | OAuth exists, search federation does not — recommend skipping |
| Org chart & team analytics | missing | No manager field, no presence history — recommend skipping |

---

## 3. Per-area detail

Ordered by client emphasis first, then by gap size. Effort is trivial / small / medium /
large, per-area and assuming the developer is already familiar with the surface.

### 3.1 Inbox and notification triage — **the largest gap in the product**

*Audit entries #9, #10, #15–#22.*

This is where Rundesk is furthest from the video and where the shortfall is felt most
often, which is why it leads. ClickUp treats the Inbox as a triage workspace: a tab strip
across the top (All / Primary / Other / Later / Cleared) with per-tab counts, rows that
group under Today/Yesterday date headers, a source glyph telling you whether something
came from a channel or a task, hover-revealed actions on each row, and — critically — a
notion of *clearing* a notification that is distinct from reading it, with an Unclear undo.

Rundesk has a real Inbox, and the foundations are sound. `apps/web/src/pages/workspace-inbox-page.tsx:117-147`
is a dedicated route with a live unread badge and mark-all-read; rows at `:223-292` render
the actor avatar, a typed badge, the title, a body preview with `@mentions` resolved, and
a relative timestamp; unread rows carry a left-border tint at `:245-248`; deep links
resolve through `apps/web/src/lib/notification-nav.ts:105`. Seventeen notification types
are emitted and badged.

What is missing is the entire triage layer. The page splits on one field — `readAt` — into
Unread (`:159-187`) and Earlier (`:188-214`). There is no bucket concept anywhere: the
`notifications` table in `packages/db/src/schema/notifications.ts` carries `readAt` and
nothing else, so there is no dismissed, cleared or snoozed state to render a Cleared tab
from, and no restore path for Unclear. The route
(`apps/web/src/routes/app.$workspaceId.inbox.tsx`) declares no `validateSearch`, so there
are no `?tab=` routes to hang tabs on. The only per-row action is "Resolve" (which just
marks read), it is always visible rather than revealed on hover, and it only renders for
four of the seventeen types (`:176-182`, `:276-289`). Rows carry no source label, no flag,
and no grouped-count bubble, and they group by read-state rather than by date.

Two sub-parts are much cheaper than they look and should be pulled forward. The
**Primary/Other split** is small, not medium, for the reason given in §0.1 — the type enum
already separates machine alerts from human messages, so this is a partition function over
existing data. And **status-change notifications** (#18) are one line from being right: the
task service already captures the full transition at
`apps/api/src/modules/tasks/tasks.service.ts:2186-2191` as `meta: { from: before.status, to: patch.status }`,
but only writes it to the activity log; the notification body at `:262-264` says merely
"Updated status to X." The data is sitting there. Surfacing `from → to` in the inbox body
is trivial.

The expensive part is honest: a `clearedAt` (or state enum) column plus migration, the
tab-routing shell, per-tab counts, and a Later bucket. Note that Later has an unexpected
head start — chat messages can already be privately saved with tags and browsed
(`apps/api/src/modules/chat/chat.service.ts:1670`, UI at
`apps/web/src/pages/workspace-chat-page.tsx:1917-2018`) — but notifications cannot be
saved at all, and that Saved surface lives inside chat rather than the Inbox. Either
generalise the existing save mechanism to notifications or accept two save systems; the
first is better and not much harder.

**Effort: large** overall. Sequence it as: `from → to` in the body (trivial) → date-group
headers and source glyphs (small) → Primary/Other (small) → clear/unclear state and the
tab shell (medium) → Later (medium).

### 3.2 Navigation shell — layout gap, explicitly in scope

*Audit entries #12, #13, #14, #24, #29, #30, #42, #69.*

ClickUp's shell is two-tier: a narrow always-visible icon rail pinned to the far left, and
a wide contextual panel beside it whose entire contents change based on which rail icon is
active. Click Home and the panel becomes Inbox/Replies/My Tasks; click Spaces and it
becomes the space tree. Users can also create their own named sidebar groups ("Main
Dept.", "CLIENTS"), and private items carry a padlock glyph visible at a glance.

Rundesk renders exactly one sidebar — `apps/web/src/components/workspace-sidebar.tsx:617`,
an `aside` at `w-72` — plus a topbar (`apps/web/src/routes/app.tsx:62-70`). The wide panel
is good: Favorites with drag-reorder (`:672-742`), durable Pinned items across
spaces/lists/tasks/docs/channels (`:743-800`), Recents (`:801-846`), and the full
Spaces→folders→projects→lists tree with per-row hover actions (`:915-1290`). There is also
an icon dock at `:1288-1334` carrying Home/Inbox/Chat/AI/Docs/Dashboards/Settings, with a
vertical orientation option and server-persisted position.

But the dock is a floating draggable pill anchored bottom-left (`fixed … left:dockPos.x bottom:dockPos.y`,
`:1310-1315`) and it is hidden below the `xl` breakpoint — so on the most common laptop
widths the "rail" simply is not there. And nothing swaps the wide panel by context: it
always shows the same Favorites/Pinned/Recents/Browse/Spaces stack regardless of which
dock icon you last pressed. So Rundesk has both halves of a two-tier nav and they are not
wired to each other.

The sub-gaps are consistent with that. Sidebar groups are app-defined, so users cannot
create "CLIENTS" (#13). Private/public is genuinely enforced — `apps/api/src/modules/spaces/spaces.service.ts:141`
hides private spaces from non-members, backed by `ResourceMemberGuard`, and the toggle
lives at `apps/web/src/components/container-members-sheet.tsx:143-166` — but no padlock is
drawn in the tree; `Lock` appears only as an icon *inside* the row's dropdown (`:1030-1035`,
`:1160-1168`), so privacy is invisible until you go looking. The chat sidebar is the sole
exception (`apps/web/src/components/chat/chat-sidebar.tsx:121`). Adding the glyph is
trivial and disproportionately valuable, since "is this private?" is a question people ask
constantly and currently cannot answer by looking.

There is also no "Customize your sidebar" entry anywhere (#14), despite per-user
customization existing piecemeal across localStorage favorites (`:524-563`), durable pins,
and a server-persisted dock-settings popover (`:1335-1420`) — three mechanisms, no single
door.

**Effort: large** for the true two-tier rail (it is a shell rewrite touching every route's
layout assumptions). **Trivial** for padlock glyphs, **small** for promoting the Home tree
out of the page body, **medium** for user-named groups.

### 3.3 Search and the command bar

*Audit entries #1–#8.*

ClickUp's `Ctrl+K` is a command surface, not a search box: it searches, but it also runs
commands via `/`, offers Tab for additional actions on a highlighted result, exposes an
"Ask AI" row that hands your typed query to the model, and carries a footer hint line and
a settings gear. Filters live behind a Filters dropdown with a Sort control, type chips
are multi-selectable with an "N Filters" tally, and typing a keyword auto-applies the
matching filter.

Rundesk's palette is a genuinely good search modal. `apps/web/src/components/command-palette.tsx:222-231`
binds `Ctrl/⌘+K`, the topbar search forwards its value straight in
(`apps/web/src/components/app-topbar.tsx:361-388`), results group by entity across tasks,
docs, files, comments, channels, messages and users (`:55`, `:450-474`), and there is a
substantial inline filter strip — status, priority, label, assignee, due-date range,
custom field (`:268-380`) — honoured server-side at
`apps/api/src/modules/search/search.controller.ts:49-69`, with saved presets at `:382-419`.
That is more filtering depth than the video shows.

The gap is that it is a *search* modal wearing a command-bar keybinding. Its only
non-navigation action is "Create task" (`:436-443`). There is no `/` command list, no Ask
AI row (`grep "Ask AI"` finds only the chat composer's improve-message button at
`apps/web/src/components/chat/chat-composer.tsx:348`), no Tab-for-actions, no footer hint,
and the placeholder is a plain search string rather than "Search, run a command, or ask a
question…".

Two backend details are worth flagging because they cause silent wrong behaviour rather
than just absence. First, type chips are a single scalar — `useState<'all'|'task'|'doc'>`
at `:89` — so selecting one replaces the last; and even if the UI allowed two, the service
only emits a Meili filter when exactly one type is present (`apps/api/src/modules/search/search.service.ts:253-254`),
so a multi-type request would be silently ignored. Second, and worse: the moment *any*
type filter is set, `search.service.ts:268` drops the `searchExtras` results entirely — so
clicking the "Tasks" chip does not narrow to tasks, it also silently deletes every
channel, message and user hit from the result set. A user filtering to Tasks and then back
to All sees results appear and disappear for no visible reason. That is a bug wearing a
missing-feature costume and should be fixed regardless of what happens to the rest of this
area.

There is also no Sort control at all (order is fixed by relevance/`createdAt` at `:80`),
and no Creator, Location or Archived filters.

**Effort: medium** for the command layer (`/`, Ask AI wiring into the existing `/ai`
endpoints, footer). **Small** for multi-select chips and the extras bug. **Small** for
keyword→filter inference. Skip the "…" overflow of hidden object types (§5).

### 3.4 Tasks, lists and views

*Audit entries #41, #44–#53, #70.*

This is Rundesk's strongest area and mostly needs depth, not construction. Grouped list
view with per-group inline add (`apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx:1321-1387`,
`:2193-2240`), table view with sortable headers and coloured status pills from per-list
custom statuses (`:1434-1465`, `:2460-2516`), five view types with saved views including
filters/sort/groupBy/hidden-fields (`:1002-1010`, `:1236-1270`), and a Fields picker that
can create new custom fields inline (`:1116-1210`). All of it real.

Three gaps matter.

**The task description is a plain textarea** (#48) — `descriptionRef = useRef<HTMLTextAreaElement>`
at `apps/web/src/components/task-detail-sheet.tsx:1039`, rendered through `<Markdown>` at
`:1401`. There is no `/` menu, so none of the video's EMBEDS section (YouTube, Figma, Loom,
Miro, Drive, Sheets) and none of its TASK ACTIONS section (Assign, Set status, Close task,
Tags) exists inline. Worth knowing before anyone starts: `apps/web/src/components/embed-renderer.tsx`
already implements `EmbedCard` and `EmbedList` — and is imported by nothing. I confirmed
this: grepping the whole web app for `embed-renderer`, `EmbedList` or `EmbedCard` returns
only the file's own definitions and its internal self-reference at `:144`. It is dead code
that a slash-menu implementation could adopt on day one. A working `/` menu also already
exists in docs (`apps/web/src/components/docs-panel.tsx:412-418`) and is the natural thing
to extract and share.

**Filtering is limited to three attributes** (#44). `ListColumnBar` (`:578-600`) and the
table header (`:2483-2506`) offer multi-select menus for Status, Priority and Assignee,
applied centrally at `:816-820` so every view narrows together — that central application
is a good design and should be preserved. But there is no filter *builder*: no "Select
filter" dropdown, no nested conditions, no per-condition delete, and no way to filter on
tags, due date, archived state, creator, time estimate, sprint points, task type or
custom fields. For a product whose whole job is finding the right slice of work, three
filterable attributes is the ceiling users will hit first.

**Activity and Comments are separate tabs** (#50, #51), where the video shows one
right-hand panel hosting the log and the composer together. Both tabs are individually
good — `ActivityPanel` at `:3922-3983`, and `CommentsPanel` at `:3330-3915` with threaded
comments, `@people`/`#task`/doc mentions, presigned attachment upload, reactions, assign
and resolve. But the activity feed reads worse than it should for a reason that is nearly
free to fix: the client-side `ActivityEntry` type at `:262-267` carries only
`id/action/createdAt/actor` and drops `meta`, so the server's recorded
`{ from, to }` (`tasks.service.ts:2186-2191`) is thrown away and every transition renders
as a bare "Status changed". Widen the type, render the pair. Same underlying fix as #18 in
§3.1 — do them together.

Smaller items: the view toolbar has no in-view task search (#46; `TaskListChrome` at
`apps/web/src/components/work/work-ui.tsx:284` exposes quickAdd/viewTabs/toolbar slots and
nothing passes a search input — the Fields picker's search filters field *names*, not
tasks); subtasks lack AI suggest, sort, and a "Show N closed" toggle so closed subtasks
clutter the list (#49); the calendar's week view is a 7-column day grid with no hour
gutter, no all-day lane and no unscheduled/overdue rails (#41); the unified create modal
covers Task/Project/Space/Doc but its task form is title-plus-destination only, with no
description, status, assignee, due date, priority or tags (#47).

**Effort: large** for the `/` menu and embeds, **large** for the filter builder, **medium**
for the unified Activity+Comments panel, **small** for the `meta` fix, in-view search, and
subtask polish.

### 3.5 Chat, channels and DMs

*Audit entries #23, #33–#38.*

Core chat is done and should be left alone (§4). The gaps are layout and a few specific
affordances.

The **followers/access panel** (#34) is a popover headed "Members · N"
(`apps/web/src/components/chat/chat-header.tsx:136-192`) with owner badging and
creator-only remove, where the video shows a right-hand panel with Followers/Access tabs,
a "Search people or invite by email" field and a FOLLOWING section.
`apps/web/src/components/chat/add-people-dialog.tsx` lists existing workspace members only
— no search, no email invite — which is the functional part of that gap.

The **thread panel** (#23) shows the parent message, the reply chain and a full composer
(`apps/web/src/pages/workspace-chat-page.tsx:2370-2432`), but its header says only
"Thread": no channel name, no follower count, no bookmark, no Mark-unread. Reactions are
rendered on channel messages (`:1429-1470`) but not on messages inside the thread panel,
which reads as a bug to users. There is no "Also send to #channel" checkbox.

**Mark as unread does not exist anywhere** (#37) — I confirmed no `markUnread`/`mark_unread`
in the codebase. For a chat product this is a daily-use omission and is small to add.

The **channel options menu** is otherwise strong: copy link, favorite, per-channel
notification level (all/mentions/mute), edit, archive, share, leave (`chat-header.tsx:229-300`).
Missing beyond mark-unread: keyboard shortcut hints, and email-to-channel (email-to-task
exists for lists at `apps/api/src/modules/email-to-task/`, so the ingestion pattern is
already proven and reusable).

**DMs** (#38) are fully working including group DMs and presence dots, with `/task` and
`/remind` slash commands in the composer (`apps/web/src/components/chat/chat-composer.tsx:76-84`).
The video's per-person Chat/Calendar/Tasks tab strip does not exist — there is a member
`ProfilePanel` with activity/tasks/comments tabs at `:2438-2570`, which is close in spirit
but not in the DM header. The Calendar tab depends on an event entity that does not exist
(§3.9), so scope this to Chat/Tasks only.

Channel search is good (#35): a right-hand aside with message search plus channel, sender,
date-range and file-type filters (`:2223-2300`). The only missing rail item is "Assigned",
which would require assignable chat messages — a new concept, not a UI gap.

**Effort: medium** for the followers panel and thread header, **small** for mark-unread and
thread reactions, **large** for DM tabs (mostly because of the calendar dependency — drop
that and it is medium).

### 3.6 AI surfaces

*Audit entries #8, #25, #26, #56, #57, #62.*

Rundesk's AI hub is genuinely more built than the video's, and this should be said plainly
so nobody rebuilds it. `apps/web/src/pages/workspace-ai-page.tsx:137-173` carries six tabs:
Chat, Knowledge (workspace Q&A over vectors), Commands (natural-language → preview →
confirm, backed by `apps/api/src/modules/ai/ai-command.ts`), Generate (prompt → editable
task with custom fields), Meeting notes, and Writing. Contextual AI also exists inline —
task summarise/suggest-priority/suggest-deadline (`apps/web/src/components/task-detail-sheet.tsx:1181-1241`)
and doc improve (`apps/web/src/components/docs-panel.tsx:350-372`).

The real gap is **placement, not capability** (#26). `AiPanel` mounts only inside the AI
page (`workspace-ai-page.tsx:167`), so AI is a destination you navigate *to* rather than a
dock that sits beside the list, doc or dashboard you are working on. That is the single
highest-value AI change and it is mostly a mounting-and-layout problem against an existing
component. There is also no model selector (confirmed: no `model` reference in
`ai-panel.tsx`; the model is fixed server-side) and no Find/Research/Create/Edit/Analyze
intent-chip row, though generic suggestion chips exist at `:36-42`.

Agents (#57) and Skills (#25) do not exist in any form — confirmed: `grep -rniI "agent"`
across `apps/api/src/modules/ai` returns only a code comment about a "bounded agentic
loop" at `ai.service.ts:2013`, and `grep -rniI "skill"` across the web app, API and schema
matches only prose in `terms-page.tsx`. No tables, no controllers, no routes. Both go to
§5.

**Effort: medium** to make the panel dockable, **small** for intent chips, **small** for a
model picker if we want one exposed at all.

### 3.7 Home and personal work

*Audit entries #29, #31, #32.*

The Home page (`apps/web/src/routes/app.$workspaceId.tsx:246-262`) lists Inbox, Replies and
Assigned comments with live unread counts, then a My Tasks group — Assigned to me, Today &
overdue, Personal List — each switching the adjacent panel. The Personal List is a real
per-user private entity end to end (`packages/db/src/schema/personal-tasks.ts`,
`apps/api/src/modules/personal-tasks/personal-tasks.service.ts`), which is more than a
mock.

Two gaps. The tree lives in the page body rather than a persistent panel (covered in §3.2).
And both task surfaces are shallow relative to the video: "Assigned to me" rows show only
title and `listName · status` (`:332-334`) with no status grouping, no priority or due-date
columns and no sort; the Personal List is a flat title-plus-done checklist with no view
tabs, no assignee/due/priority columns and no in-table add row.

The Personal List gap is the more interesting one, because the fix is architectural rather
than additive: the list view already renders grouping, columns, sorting and inline add for
regular lists. Pointing the Personal List at that machinery — rather than growing a second
task-rendering implementation — is the right call and roughly the same effort.

**Effort: medium** each, **small** if they reuse the existing list-view components.

### 3.8 Docs, dashboards, forms, time and admin

Grouped because each is the same shape of gap: real functionality browsed through the
wrong container.

**Docs** (#61, #62). `apps/web/src/components/docs-panel.tsx` has a nested doc tree,
editor, version history (`:928-990`) and public-share toggling (`:1384-1440`). Docs are
browsed as a sidebar tree, not a sortable table — no Name/Location/Tags/Date-updated/
Date-viewed/Sharing columns, no subpage count badge, no doc search box, and no date-viewed
tracking (which is a data gap, not just a column: nothing records views today). The `/`
menu (`:412-418`) has five formatting blocks and no embeds; AI writing is a toolbar button
rather than the video's press-space-for-AI. **Medium.**

**Dashboards** (#63, #64, #65, #66). There is exactly one dashboard route — confirmed,
`app.$workspaceId.dashboard.tsx` is the only match — with a preset `<select>` at `:196-215`
and a widget builder supporting a 12-widget catalogue, drag reorder and AI layout
suggestion. There is no hub with All/My/Shared/Private scopes, no index table with
owner/location/sharing columns, no edit-mode toggle, no auto-refresh. Scheduled reports do
exist but on the Reports surface (`apps/api/src/modules/reports/scheduled-reports.service.ts`),
not attachable to a dashboard. The person × weekday timesheet card is absent from the
catalogue (I checked all 12 entries at `dashboard-widget-builder.tsx:61-72`; the `time`
widget is a single metric tile), though a weekly grid exists on the Time page keyed by task
rather than person (`apps/web/src/pages/workspace-time-page.tsx:348-380`). **Medium.**

**Forms** (#67, #68). Submissions genuinely become tasks in a chosen list —
`apps/api/src/modules/forms/forms.service.ts:126-205` resolves `targetListId` and inserts.
The problem is discoverability at both ends: the index is a card grid with no
Location column, so the form→list wiring is invisible; and a new form is created from a
title alone (`apps/web/src/pages/workspace-forms-page.tsx:43-50`), with `FormSettings`
(`workspace-form-builder-page.tsx:827-899`) exposing no destination picker — routing must
be configured indirectly by mapping a dropdown field. Adding "Where do you want submissions
saved?" at creation is **small** and removes the sharpest edge in the feature.

**Time and timesheets** (#74). Tabs, weekly grid, submit-for-approval, and a real approvals
queue with pending/history and approve/reject-with-reason
(`apps/web/src/pages/workspace-time-approvals-page.tsx:62-119`). The blocking gap is that
the week is pinned to the current one — `weekStart = useMemo(() => startOfWeek(new Date()), [])`
at `workspace-time-page.tsx:75-77` — so no user can view or correct a prior week. That is a
**trivial** fix with outsized value and should be done immediately. Beyond it: no
pending-count badge, no billable/tag filters, and no browsable all-member timesheet.

**People and admin** (#75, #76, #78). Invite-by-email with roles, resend/cancel, pending
invitations and member management all work (`workspace-settings-page.tsx:798-1010`), but as
two stacked cards rather than a roster table — no Last-active, Invited-by, Invited-on or
Teams columns, no export, no search-or-invite combined field. The settings rail
(`:69-80`) is one flat list of eleven tabs with no section grouping, and a dozen further
admin surfaces live on separate `app.admin.*` routes, so "All settings" is not one console.
Templates exist in three unconnected places — project templates
(`workspace-templates-page.tsx`), task templates (`apps/api/src/modules/task-templates/`)
and doc templates (`apps/web/src/components/doc-templates.tsx`) — where the video shows one
Template Center. **Medium** each; the settings-rail grouping alone is **small** and improves
navigability immediately.

### 3.9 Planner and calendar events — large, and questionable

*Audit entries #28, #54, #55.*

No planner surface exists (confirmed: `grep -rniI "planner"` matches only AI
command-planner prose). No event entity exists either — the calendar view creates *tasks*
on a day cell, and calendar-sync is one-way task push/pull
(`apps/api/src/modules/calendar-sync/calendar-sync.service.ts:107`). So the video's Event /
Task / Focus time / OOO composer, with participants, rooms, all-day/timezone/repeat and a
notetaker, has no foundation under it.

Both are **large**, and I would push back on both before scheduling them. The Planner
overlaps two surfaces Rundesk already has — the Gantt timeline
(`apps/web/src/pages/workspace-timeline-page.tsx`) and the per-list calendar with
drag-to-reschedule — and a third scheduling surface risks three half-used views instead of
one good one. Events are a bigger commitment than they appear: an event entity implies
invitations, RSVPs, recurrence expansion, timezone correctness and two-way external
calendar sync, which is a project in itself. Recommend deferring both pending §6 answers,
and if the client's real need is "see my week and drag work into it," extend the existing
calendar view instead.

### 3.10 Shared with me

*Audit entry #43.*

Object-level sharing is fully built — `apps/api/src/modules/shares/shares.controller.ts`
exposes exactly four endpoints (list-shares, share, change-level, revoke), all scoped to a
given resource, with UI at `apps/web/src/components/share-panel.tsx`. What is missing is
the reverse query: nothing answers "what has been shared with *me*." No endpoint, no route,
no page (confirmed: no `shared with me`/`sharedWithMe` match anywhere).

Worth doing. Without it, sharing a task with someone means they only find out via
notification, and if they miss it the item is effectively invisible — the feature quietly
half-works today. One indexed query over the shares table plus a grouped-by-owner page.
**Medium.**

---

## 4. Already covered — do not rebuild these

Verified against the code. If a ticket appears asking for one of these, close it.

**Genuinely complete, matching the video:**

- **Channel view with threaded replies and @mentions** (#33) — date dividers, thread
  roll-ups with reply count and last-reply age, mention resolution against workspace
  members, header member count and share. `apps/web/src/pages/workspace-chat-page.tsx:1279-1301`,
  `chat-message-body.tsx`.
- **Filter tasks by assignee** (#45) — multi-select, applied centrally at
  `…$listId.tsx:816-820` so all five views narrow together, and persisted into saved views.
- **Table view with coloured status column** (#53) — sortable Name/Assignee/Status/Due/
  Priority, per-column filter menus, dynamic custom-field columns, status pills from
  per-list custom statuses. `…$listId.tsx:1434-1465`, `:2460-2516`.
- **List view grouped by status with per-group add-task** (#70) — group headers with counts,
  inline add-in-place per group and per board column, group-by switching across
  status/priority/assignee. `…$listId.tsx:1321-1387`, `:2193-2240`.
- **Trash with type/location/deleted-by columns, search and filters** (#77) — all six entity
  types, restore and delete-forever. `apps/web/src/components/trash-tab.tsx:34-107`,
  `apps/api/src/modules/trash/trash.service.ts`.

**Deep enough that only the container is wrong — build the container, keep the engine:**

- Saved views per list, including filters, sort, group-by, hidden fields, and default-view
  auto-apply (`…$listId.tsx:1236-1270`).
- Per-space and per-container privacy, enforced server-side, not just hidden in the UI
  (`spaces.service.ts:141` + `ResourceMemberGuard`).
- Form submissions routing into a chosen list (`forms.service.ts:126-205`).
- Timesheet approvals with pending/history and approve/reject-with-reason
  (`workspace-time-approvals-page.tsx:62-119`).
- The AI hub's six tabs, including workspace Q&A over vectors and natural-language commands
  with preview→confirm (`workspace-ai-page.tsx:137-173`).
- Chat message save-for-later with tags and search (`chat.service.ts:1670`) — generalise
  this for the Inbox's Later tab rather than writing a second one.
- OAuth connection infrastructure for ten providers including Drive, OneDrive and Dropbox
  (`integration-connections.service.ts`) — see Correction 2.
- Push-to-talk speech-to-text (`apps/web/src/lib/use-speech-recognition.ts`) — see
  Correction 1.
- Workspace groups/teams with CRUD, membership and SCIM provisioning
  (`apps/api/src/modules/workspace-groups/`).

---

## 5. Recommend skipping

Each of these appears in the video. Each is either ClickUp selling breadth, or a
third-party infrastructure commitment disguised as a feature. The reasons are specific so
that "it was in the video" is not sufficient to reopen them.

**SyncUp calls and in-call chat (#39, #40).** This is not a feature, it is an
infrastructure business. In-app calling with screen share requires WebRTC signalling, and
above roughly three participants it requires a media server — an SFU such as LiveKit,
mediasoup or Janus — that you must host, scale and pay per-participant-minute for. It also
requires TURN relay servers for the significant fraction of users behind symmetric NAT
(without TURN, calls silently fail for those users and you will get bug reports you cannot
reproduce), plus echo cancellation tuning, reconnection handling, and a recording pipeline
if calls are to be reviewable. Rundesk already attaches Zoom and Google Meet links to
tasks (`task-detail-sheet.tsx:1689-1761`) and has a Zoom OAuth connection. Extending that
to "start a call from this channel" via a deep link gives most of the value for a rounding
error of the cost. Skip the native implementation.

**AI Notetaker and the meeting-notes library (#27, #73).** Depends on calls existing, and
adds more: a notetaker must join Zoom/Meet/Teams as a participant, which means each
platform's bot SDK and its approval process, plus a streaming ASR vendor, speaker
diarization, and consent capture that varies by jurisdiction (two-party-consent recording
law is a real compliance surface, not a checkbox). Keep the existing paste-your-notes
extractor at `workspace-ai-page.tsx:988-1110`; it delivers the actual outcome — tasks out
of a meeting — with none of that. If notes should persist, storing the extractor's output
as a doc is **small** and worth doing on its own.

**Clip transcription (#71).** Distinct from Correction 1: transcribing an already-recorded
clip file needs server-side ASR — self-hosted Whisper with GPU capacity, or a vendor billed
per audio-minute — plus a job queue, retry handling and a transcript store. Defer rather
than refuse; if it becomes a priority, the vendor route is medium, and the browser hook
already covers any live-dictation requirement. A **small** consolation: add "Voice Clip" /
"Video Clip" badges and a type filter to the clips grid (#72), which is most of what users
actually want from that screen.

**Cross-app federated search in the command bar (#2).** Even with the OAuth half already
built (Correction 2), the remaining work is where the difficulty lives: each provider has
its own search API, its own rate limits and its own pagination, results must be merged and
ranked against local hits with no common relevance score, and — the hard constraint —
permissions must be mirrored precisely so a user never sees a Drive file or Gmail thread
they cannot open. Get that wrong once and it is a data-exposure incident. Skip for v1.

**Org Chart (#59) and Team Analytics (#60).** The org chart requires a manager relationship
on users that does not exist (confirmed: no `manager`/`reportsTo` field in the schema) and
that someone must keep accurate forever; a stale org chart is worse than none. Team
Analytics is worse: per-hour online charts and "who is on which task right now" cards
require retaining presence *history*, where `apps/api/src/modules/presence/presence.service.ts:18-29`
deliberately stores only a last-seen heartbeat and derives status at read time. Building
that means creating an employee-surveillance dataset with GDPR and works-council exposure,
ongoing storage cost, and a genuine chance of damaging trust in the product. Rundesk
already has `workspace-insights-page.tsx` for workload and contribution, which answers the
legitimate management question without tracking people by the hour. Skip both.

**Super Agents (#57) and the Skills library (#25).** Nothing exists — no entity, no table,
no route. These are ClickUp's AI upsell surfaces, and Rundesk's AI hub already delivers the
underlying value (commands, generation, knowledge Q&A) without asking users to configure
named agents first. Skip for v1; revisit only if a concrete customer workflow needs a
saved, reusable AI configuration, at which point it is a preset, not an agent platform.

**Command-bar overflow menu of hidden object types (#7).** A "…" chip opening a searchable
checkbox list of eleven object types (Clips, Comments, Dashboards, Files, Folders, Forms,
Lists, People, Spaces, Whiteboards) with per-user persistence is configuration-of-
configuration. Ship good defaults and multi-select chips (§3.3) instead. This is precisely
the bloat the client's quote is refusing.

**Planner (#54, #55) and the event composer (#28).** Deferred rather than skipped —
reasoning in §3.9, decision pending §6.

---

## 6. Open questions for the client

**Which does she want first: the two-tier navigation shell, or Inbox triage?** They are the
two large items with the strongest claim on "layout" and "to-the-point" respectively, and
each is a multi-week piece. Sequencing them is her call, not ours.

**Does "Cleared" need to be recoverable?** A dismiss that hides a notification permanently
is a small change. Clear-with-Unclear plus a browsable Cleared tab roughly triples it. The
answer determines whether §3.1 needs a state enum or a boolean.

**Does she actually want a Planner, or does she want her week visible?** Rundesk already
has a Gantt timeline and a per-list calendar. If the underlying need is "drag my work onto
a week grid," extending the existing calendar is medium; a true Planner is large and risks
a third under-used scheduling surface. §3.9.

**Are calendar events in scope at all, or is Google/Outlook sync enough?** An event entity
pulls in invitations, RSVPs, recurrence, timezones and two-way sync. Current sync is
one-way task push/pull. This gates the Planner, the DM Calendar tab, and the event
composer.

**How much sidebar customization does she want?** User-named groups ("Main Dept.",
"CLIENTS") are medium and touch persistence; padlock glyphs and a single "Customize
sidebar" door are much cheaper and may be the whole ask.

**Should chat calls be deep-linked or native?** §5 recommends deep-linking Zoom/Meet, which
Rundesk already supports at the task level. Confirm this is acceptable before anyone
prices WebRTC.

**Is per-person activity tracking desired, or deliberately unwanted?** §5 recommends against
Team Analytics on privacy and trust grounds. If she specifically wants it, that is a
product-values conversation to have explicitly — and one with legal implications in the EU
— rather than a ticket to size.

**Can we get the remaining audit entries and the video timestamps?** The supplied payload
stops at entry 79 of a claimed 676, and carries no time marks (§0). Areas not represented
in the slice — automations, goals, sprints, whiteboards, mindmaps, imports, billing — are
unscoped, not cleared, and any completeness claim about this spec should be qualified until
the rest arrives.
