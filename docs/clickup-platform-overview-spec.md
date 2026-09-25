# Rundesk — ClickUp Platform Overview Build Spec

Scoping decision record derived from the client's 25:52 ClickUp walkthrough, her seven
follow-up feedback clips, and a full code audit of this repository.

**This document replaces the previous version at this path.** That version was written
from a truncated audit payload (78 of 676 findings) and said so honestly, but the
consequence was that it undercounted the surface badly and left whole areas marked
"unscoped, not cleared." This version is built on the complete finding set. Where the
two disagree, this one wins.

---

## 1. What the client asked for

At 00:20–00:22 of the overview, immediately after explaining that she wants Rundesk
built on ClickUp's layout, she draws the boundary herself:

> "Of course, [sab] nahi — mujhe [saare] features nahi chahiye; woh humein
> **to-the-point aur direct features** chahiye."
>
> — *ClickUp Platform Overview*, 00:18–00:22
> (square brackets are the transcriber's best-guess markers where the audio is indistinct)

She is not asking for ClickUp. She is asking for the *shape* of ClickUp — the layout, the
object model, the places your eye expects things to be — with only the features people
touch daily.

**What that implies for scope, and how this document applies it:**

1. **Parity is not the goal; recognisability is.** A feature earns a place here if a user
   would reach for it in a normal working week. ClickUp surfaces that exist to configure
   other ClickUp surfaces do not.
2. **Bloat is disqualifying, not merely deprioritised.** Section 6 is a *recommendation to
   skip*, not a backlog. Forty-one items are named there with a reason each, so that
   "we didn't build it" is a decision on record rather than an omission someone
   rediscovers in three months.
3. **Infrastructure disguised as a feature is the main trap.** Several of ClickUp's most
   visible surfaces (in-app calling, agent runtimes, cross-app federated search,
   transcription) are platforms wearing a button. Each is called out with the cheaper
   path that delivers the outcome she actually described.
4. **Do not rebuild what exists.** The single biggest risk to this project is a team
   re-implementing something Rundesk already ships because an audit row said "missing."
   Seventeen such verdicts were wrong. They are corrected inline, marked, and indexed in
   section 5.
5. **Shallow display work outranks deep new subsystems.** The recurring finding across
   all six areas is that Rundesk's *data* is usually further along than its *screens*.
   Most of the highest-value items below are a render over a column that already exists.

**Effort scale used throughout:** `trivial` (under a day), `small` (a day or two),
`medium` (roughly a week), `large` (multi-week, usually a new subsystem).

**Verdict scale:** `have` (ships today, no work), `partial` (real implementation with a
named gap), `missing` (no implementation).

---

## 2. Summary

| Area | Verdict | The one-line gap |
|---|---|---|
| **Hierarchy & Views** | Strong; presentation gaps | Named saved views are stranded in a `<select>` instead of the tab row, and filters cover only status / priority / assignee |
| **Search & Inbox** | Strong search, thin inbox | The notifications table carries `readAt` and nothing else, so there is no Cleared or Later state to triage into |
| **Chat & Calls** | Strong spine, thin edges | Sidebar grouping is derived from Spaces and cannot be user-named; mark-unread exists nowhere in the product |
| **Admin & People** | Strong foundations, display gaps | Roster columns, an AI-usage tab and a Spaces index are all unrendered reads over data already stored |
| **Docs, Forms & Dashboards** | Machinery built, hubs missing | A form has no UI to say which list its submissions go to, so a plain form silently files nowhere |
| **AI & Meetings** | Engine strong, reach narrow | The AI panel is mounted on exactly one page, and there is no meeting entity to hang notes or recordings on |

**Counts across 68 merged entries: 5 `have` · 46 `partial` · 17 `missing`.**

That distribution is the headline. Only a quarter of the ClickUp surface she walked
through is genuinely absent from Rundesk, and two thirds of it is a partial with a
named, usually shallow gap.

### 2.1 Areas in order

Ordering below is by client emphasis, measured three ways: minutes spent in the
walkthrough, whether she filed a *dedicated follow-up clip* about it, and her own
to-the-point test. Dedicated clips are the strongest signal — she stopped and recorded a
second video about it.

1. **Hierarchy & Views** — three dedicated clips (*Space and Project UI Feedback* 1:18,
   *Missing Folder in Space* 0:25, *Enhance Move Feature* 1:40) plus 12:03–13:06 in the
   overview.
2. **Search & Inbox** — the very first surface she demonstrates (00:27), before anything
   else, plus the Inbox block.
3. **Chat & Calls** — the largest contiguous walkthrough block, plus a separate composer
   pass at the end.
4. **Admin & People** — three dedicated clips (*Workspace Settings Feedback* 5:32,
   *Sharing and Permissions UI* 2:31, *Trash and Restore Feedback* 2:01).
5. **Docs, Forms & Dashboards**.
6. **AI & Meetings** — walked through at length, but the area her scope quote cuts hardest.

### 2.2 Conflicts between area findings, resolved

Six items were assessed by two different area passes that reached different conclusions.
They are resolved once, here, and the resolution is applied throughout the document.

| Conflict | Resolution |
|---|---|
| **Auto-follow on tasks** — Search & Inbox said it works; Admin said nothing subscribes you | **Search & Inbox is right; Admin was wrong.** Verified: creator at `apps/api/src/modules/tasks/tasks.service.ts:1468`, assignee at `:2651`, commenter at `:2781`, all `onConflictDoNothing`. `tasks.controller.ts:358` is the *explicit* endpoint, not the only path. Auto-follow ships. The remaining gap is only the visible toggle and a "why am I getting this" line. |
| **Per-user Trash scoping** — Admin called it a confidentiality leak and ranked it #1 | **Already built.** `apps/api/src/modules/trash/trash.service.ts:73` sets `restrictTo = isAdmin ? query.deletedByIds ?? null : [actor.id]`, applied at `:163`. A non-admin only ever sees what they deleted. Not a leak; removed from the build list. |
| **"Send test notification"** — Search & Inbox skipped it; Admin wanted it | **Build it.** Push delivery fails silently and users have no other way to tell. Trivial. Removed from the skip list. |
| **Custom emoji admin page** — Chat wanted a settings page; Admin skipped it as decoration | **Split.** Build the presign upload path (today the picker accepts an image *URL* only, which is a real gap). Skip the standalone admin console with search and bulk import. |
| **AI Notetaker** — AI & Meetings said build; Chat said skip | **Both, disambiguated.** Build the *Zoom-webhook* notetaker — the recording pipeline already exists (A6.2). Skip the *in-call* notetaker, which presupposes native calling we are not building. |
| **"Shared with me"** — surfaced independently by Search & Inbox, Hierarchy and Docs | **One build, three consumers.** Canonical entry is A1.7. The other two are cross-referenced, not duplicated. |

---

## 3. The areas

---

## A1. Hierarchy & Views — Space → Folder → List, and the views stacked on them

*Timestamp note: all 167 findings for this area carried `timestamp: null`. The mm:ss
below were read directly out of
`/root/.claude/uploads/d00dbf51-0a02-5f7c-883d-39fffe273526/0b5e8a07-ClickUp_Platform_Overview___Roman_Urdu.txt`
while checking the area — none are inferred. Where no timestamp was available, none is
cited.*

The client's own hierarchy complaints are in two short feedback clips, not the overview,
and they are the sharpest signal in the whole corpus: **space icon and colour must be
pickable at create time**, **a "+" must add a project without leaving the page**, and **a
folder inside a space must actually appear on the space page**
(`4e1b05da-Space_and_Project_UI_Feedback___Roman_Urdu.txt` 00:22–00:58;
`7c207989-Missing_Folder_in_Space___Roman_Urdu.txt` 00:07). Two of those three are
already built — see the corrections in A1.1. Lead the build with A1.2 (naming your own
views) and A1.4 (filters), which are what she actually walked through.

### A1.1 Space → Folder → List tree

**ClickUp (12:03–12:05):** "Is space ke andar woh different folders hote hain, aur andar
list hoti hai" — a three-level tree with live item counts on lists.

**Rundesk today:** the full tree is fetched and rendered with expand/collapse at every
level, per-row `+` and `⋯` (rename / share / move / delete) —
`apps/web/src/components/workspace-sidebar.tsx:405-429` (fetch) and `:916-1259`
(render), `+ New Space` at `:1252-1258`, `+ New folder` at `:1236-1242`, space-row `+`
creating a project at `:1105-1112`.

**Two "missing"-adjacent claims checked and corrected:**

- ⚠ The client's **"Launch Lab folder doesn't show in the space"** bug is **fixed**.
  `apps/web/src/pages/workspace-space-shell-page.tsx:129-145` queries
  `/spaces/:id/folders`, groups projects under them, and `:236-250` renders a Folders
  section with a count badge. The in-code comment at `:127-128` names this exact
  regression. Do not rebuild it.
- ⚠ The client's **space icon + colour picker** exists.
  `workspace-space-shell-page.tsx:387-390` opens `ContainerEditDialog` with
  `fields={{ color: true, icon: true }}`, and the dialog ships a preset palette plus a
  clickable emoji grid (`apps/web/src/components/container-edit-dialog.tsx:32-47,
  145-186`). Likewise the inline **"+ Add project"** she asked for is at
  `workspace-space-shell-page.tsx:270-286, 305`.

**Actually missing:**

- Space rename **from the sidebar row** sends `{ name }` only —
  `workspace-sidebar.tsx:335` — so icon and colour are unreachable from the tree even
  though the dialog supports them. Pass the same `fields` flags. **trivial**
- No task/item count badge on list rows in the tree (grepping for `count` in
  `workspace-sidebar.tsx` returns only the notifications unread count at `:438-443`).
  **small**
- Rundesk inserts a **Project** level between Folder and List that ClickUp does not have
  (Space → Folder → **Project** → List). This is a product decision, not a bug, but it is
  why her mental model keeps mismatching the UI ("mujhe yahan pe yeh karti hoon; aur
  pehle mera project show hoga", 01:04). Either hide single-project folders in the tree
  or rename the level. **medium** if reworked, **trivial** to leave and document. See the
  open question in section 7.

### A1.2 Named saved views on a list

**ClickUp (12:37–12:40):** "'Team View' — is ko bolte hain 'Table View'; aap apne lehaz se
naming kar sakte hain." The named view *is* the tab. She saves and removes filters from it
live (13:01, 13:04).

**Rundesk today:** saved views are real end to end — `packages/db/src/schema/views.ts`
(`task_views` with name / type / isDefault / config),
`apps/api/src/modules/views/views.controller.ts`, applied at
`apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx:860-888`,
saved / updated / defaulted at `:1224-1281`. The tab strip at `:1002-1011` is the five
view **types** (List / Board / Table / Calendar / Gantt), filtered by the space's
`enabledViews`.

**Missing:** named views live in a `<select>` (`:1210-1223`), not in the tab row, so
"Team View" never appears as a tab and there is no inline `+ View`. This is the single
most visible layout mismatch in the area and it is presentation-only — the data model
already holds everything. **medium**

### A1.3 List, Board and Table views

**ClickUp:** grouped list with an inline Add under each group (12:15); Table with the
status column mid-row and per-column controls (12:42–12:45).

**Rundesk today — three of these are done; do not respec them:**

- **List, grouped, with per-group inline add:** `…$listId.tsx:1638+` GroupedListView,
  shared column bar at `:539-606`, `InlineAddTask` per group at `:2146-2268`. **have**
- **Table with coloured status pills and a Fields picker that also creates fields:**
  `:2269-2914`, picker at `:1116-1207`. **have**
- **Board with droppable status columns, WIP limits, collapse and dnd-kit drag:**
  `:2990-3107`, card at `:3108-3178`. **have**

**Missing:** inline rename of a board column (renaming goes through the separate Statuses
dialog, `:1283-1292` → `apps/web/src/components/list-statuses-manager.tsx`) **small**; no
label/tag pill and no parent-list sub-line on board cards **small**; no `+ Add group`
column **small**.

### A1.4 Filters, sort and in-view search

**ClickUp (12:50–13:06):** "filter hai — kuch bhi yahan se select kar sakte hain:
assignee, duration, koi recurrent task hai… main yahan se save karoongi… main yahan se
remove filter karoongi."

**Rundesk today:** toolbar status filter (`:1078-1088`), sort field and direction
(`:1089-1113`), group-by (`:1114`), and per-column multi-select filter menus
(`ColumnFilterMenu` at `:457-538`, applied in `filterTasks` at `:237-256`). Whole
filter + sort + group + hidden-field sets persist as named views (`:1224-1281`).
Assignee-only filtering, including an Unassigned option, is fully working. **have**

**Missing:** the filterable attribute set is hard-limited to status, priority and assignee
(`columnFiltersActive` at `:233`) — no due-date or date-range, no recurrence, no custom
field, no creator. There is also no in-view text search: the only search input in the
whole toolbar is inside the Fields popover (`:1127`). Do the attribute widening plus a
search box; that is precisely what she demonstrated. **medium**

> Related: the in-list task-search box is also the top value-per-hour item in **A2.5** —
> `filterTasks` at `:816-820` already runs centrally, so one input narrows List / Board /
> Table / Calendar / Gantt together. Build it once, here.

### A1.5 Calendar as a view on a list

**Rundesk today:** `…$listId.tsx:1478-1615` — week/month switcher, prev/next, assignee
filter, drag-to-reschedule, per-day quick-add, scoped to the list.

**Missing:** hour gutter, all-day lane, timed blocks, and the "N Unscheduled / N Overdue"
side rails. **medium** — but see section 6; the day-cell grid is the to-the-point version
and should ship as-is.

### A1.6 Private spaces, folders and lists

**ClickUp (11:48–12:02):** "koi bhi space ke ooper bhi lock hai; yeh space kisi ko show
nahi ho rahi siwaye admins ke… jin jin ko share karwayenge sirf un ko woh show hogi."

**Rundesk today:** privacy is a real, enforced data model — `visibility` on
`packages/db/src/schema/spaces.ts`, `folders.ts` and `lists.ts`, with
make-private / make-public toggles wired for **lists**
(`workspace-sidebar.tsx:1031-1038`) and **folders** (`:1174-1185`).

**Missing:** (a) no padlock glyph is rendered on any tree row — `Lock` is imported at
`:38` but used only *inside* the dropdown item, so a private container looks identical to
a public one; (b) the **space** row menu has no make-private toggle at all
(`:1122-1139` offers rename / share / delete only), so space visibility can only be set
outside this UI. Both **small**, and (b) is the higher-value half.

### A1.7 "Shared with me" — canonical entry

**ClickUp (11:26):** "agar mere saath koi list share karega, woh mujhe yahan show ho
jayegi."

**Spot-checked; the "missing" verdict is correct.** Per-object sharing is fully built
(`packages/db/src/schema/object-shares.ts`, indexed by `userId`; controller
`apps/api/src/modules/shares/shares.controller.ts:19,:35,:47,:60`; UI
`apps/web/src/components/share-panel.tsx`) — but only in the forward direction.
`shares.controller.ts:16` is `@Controller('shares/:objectType/:objectId')`, so every
route is keyed by a *known* object. There is no reverse "everything shared with me"
lookup, and no sidebar entry renders one.

**Missing:** one indexed query over the existing shares table, plus a tree row and a page
grouped by owner. Worth building because private spaces, lists and tasks are real
(`apps/api/src/modules/spaces/spaces.service.ts:141`) — without it, a privately-shared
item is unfindable unless someone sends a link. **small**, and the best value-per-hour
item in this area.

> **One build, three consumers.** The same reverse query also powers "Shared with me" in
> the search palette (A2.10) and in the Docs hub (A5.6). `object_shares` already includes
> `'doc'` in its `objectType` union (`object-shares.ts:20`), so nothing new is modelled.
> Do not build it three times.

### A1.8 Share on the list header

**Spot-checked; correct, but mis-framed as a build gap.**
`apps/web/src/components/work/work-ui.tsx:284-318` (`TaskListChrome`) renders
eyebrow / title / count / quick-add / view tabs / toolbar and nothing else, and there is
no share control anywhere in the list route. But sharing a **list** is already
implemented — `apps/web/src/components/share-panel.tsx:18` includes `list` in
`ShareObjectType`, reachable from the sidebar row menu
(`workspace-sidebar.tsx:1039-1044`). This is a button placement, not a feature.
**trivial**

### A1.9 Create menu — List / Folder / Doc / …

**ClickUp (15:56–16:08):** "main plus pe click karoongi: main list, folder, document,
dashboard, whiteboard, forms, import… template pe click karoon to templates ki history
hogi."

**Rundesk today:** creation is spread across affordances —
`apps/web/src/components/quick-create-modal.tsx:19-22` (Task / Project / Space / Doc),
space-row `+` → project, `+ New folder`, `+ New Space` (sidebar `:1105-1112`,
`:1236-1242`, `:1252-1258`). A real template library exists at
`apps/web/src/pages/workspace-templates-page.tsx`.

**Missing:** no single `+` that offers **List** and **Folder** alongside Doc — a list can
currently only be created from the project page, which is the same "hamesha yahin pe
jaana parega" friction she raised about projects. Add List and Folder to the quick-create
modal and link Templates / Import from its footer. **small** for the two missing tabs,
**medium** if the whole menu is restructured.

### A1.10 Form as a view on a list

**Spot-checked; the "missing" verdict is correct.**
`packages/db/src/schema/enums.ts:96-102` defines `viewTypeEnum` as exactly
`list | board | calendar | gantt | table`; no `form` member exists. Forms are
workspace-level objects keyed on `workspaceId` with an optional `targetListId`
(`packages/db/src/schema/forms.ts:13`). A form can feed a list but can never appear as a
tab on it, and the destination list is invisible in the forms UI.

Surfacing the destination is **small**; a real form view tab is **medium** here. **A5.4
owns this decision** and recommends the cheap cut — read it before scheduling either.

### A1.11 Per-space view configuration

**Rundesk today:** already stronger than the video shows —
`packages/db/src/schema/spaces.ts` carries `viewConfig: { defaultView, enabledViews }`,
edited via `apps/web/src/components/space-views-dialog.tsx` and honoured when building the
tab strip (`…$listId.tsx:617-651`, `:1011`). Scoped statuses exist per space
(`packages/db/src/schema/space-statuses.ts`). **have** — no work needed.

---

## A2. Search & Inbox — find anything fast, then get the inbox to zero

Scope: the global Ctrl+K search surface and the notification inbox, plus replies,
in-context search, and what feeds the inbox. Twenty-four audit rows merged into eleven
entries. **No row in this area carries a timestamp, so no mm:ss is cited** — the ClickUp
behaviour is described from the row text only. No emphasis markers were recorded either,
so ordering follows the client's stated framing: everyday actions first, chrome and
integrations last.

The four most consequential "missing" / backend verdicts were re-checked against the
repo. **Two were wrong and are corrected inline (A2.2 and A2.6b).** Do not brief anyone
off the raw finding text for those.

### A2.1 One command bar that searches *and* acts

**ClickUp:** a single Ctrl+K box that searches everything, lists commands via `/`, offers
Tab for extra actions on a highlighted result, and shows a footer hint line. The
placeholder invites all three modes ("Search, run a command, or ask a question…").

**Rundesk today:** the modal exists and is genuinely wired up — hotkey at
`apps/web/src/components/command-palette.tsx:222-231`, single input at `:254-259`,
create-task-from-query at `:436-443`, nine jump-to-nav commands at `:479-488`, global
handler at `apps/web/src/routes/app.tsx:36-46`. The topbar field forwards every keystroke
into the palette rather than running its own search
(`apps/web/src/components/app-topbar.tsx:361-388` — verified, `onChange` calls
`openPalette(e.target.value)`), which is the right architecture and already better than a
second results surface.

**Missing:** `/` does not list the command set (commands appear only when your text
happens to match), there is no Tab-for-more-actions on a highlighted row, and the
placeholder advertises search only.

**Effort:** **small** for `/` and the placeholder; **medium** if Tab-actions are included.

### A2.2 Type chips — and a corrected backend verdict

**ClickUp:** chips narrow results by object type, multiple can be active at once, an
"N Filters" tally shows what is on, and typing a keyword auto-applies the matching chip.

**Rundesk today:** three chips only — All / Tasks / Docs
(`command-palette.tsx:262-266`), held in a single scalar
(`:89`, `useState<'all'|'task'|'doc'>`), so they are mutually exclusive. Results are still
*grouped* across seven entity types (`:55`), so channel / message / user hits do render.

⚠ **Correction — the backend gaps reported in findings #3 and #5 are wrong.** The audit
claims the API "whitelists only task|doc|file" and "drops channel/message/user extras as
soon as any type filter is set." Both are false, verified by reading the files:

- `apps/api/src/modules/search/search.controller.ts:11` whitelists all seven:
  `['task','doc','file','user','comment','channel','message']`, and
  `apps/api/src/modules/search/search.service.ts:18` types them identically.
- `search.service.ts:271` and `:353` pass `filters.types` straight into `searchExtras`,
  which gates per type (`:411`, `const wants = (t) => !types || types.includes(t)`,
  applied at `:457-469`). A `types=channel` search returns channel hits. The source
  comment at `:400-402` says explicitly that callers "can hand its type chips straight
  through."
- Multi-select is already honoured on the Postgres path (`:242-247` use `.includes()`) and
  in extras. The **only** real backend gap is the Meilisearch branch, which pushes a
  single type into the filter expression (`:256-257`,
  `if (filters.types.length === 1)`) — a one-line change to an `IN` expression.

**Actually missing:** chips for Channels, Messages, People / Comments; multi-select state
in the UI; the "N Filters" tally; keyword→chip inference; an `x` to clear the query.
(Agents do not exist as an entity at all — out of scope for this area; see A6.6.)

**Effort:** **small.** This is a UI-state change plus one line in the Meili filter — *not*
a search-backend rebuild.

### A2.3 Ask AI from the search box

**ClickUp:** the typed query can be handed to AI without leaving the modal — an
"Ask AI · \<query\>" row and an Ask AI button.

**Rundesk today:** confirmed missing, and the near-miss is worth knowing. The palette
imports `Sparkles` (`command-palette.tsx:28`) but uses it only as the icon on a
jump-to-AI-page nav command (`:247`); the query is dropped on navigate (`:235-237` clears
it). The AI route accepts no prompt parameter, so today the user retypes the question.
The AI hub itself is real (`apps/web/src/pages/workspace-ai-page.tsx:119`, chat panel at
`apps/web/src/components/ai-panel.tsx:45`).

**Missing:** an "Ask AI · \<query\>" first-row action, and a prompt search-param on the AI
route so the query survives the jump.

**Effort:** **small** if it hands off to the existing AI page with a prefilled prompt;
medium for inline answers in the modal. Take the small version — it gets the client the
behaviour for a fraction of the work. **Same item as A6.4; build it once.**

### A2.4 Search filters panel and sort

**ClickUp:** a Filters dropdown (Assignee, Creator, Location, Archived toggle) plus a Sort
control.

**Rundesk today:** stronger than ClickUp in places. Status / Priority / Label / Assignee /
due-date range / custom-field filters render inline (`command-palette.tsx:268-380`) and
are all honoured server-side (`search.controller.ts:39-68`, custom-field matching at
`search.service.ts` `customFieldValueCondition`). Named saved searches exist end to end
(`command-palette.tsx:382-419`, `search.controller.ts:83-100`,
`packages/db/src/schema/saved-searches.ts`).

**Missing:** Creator and Location filters; an Archived toggle (tasks carry `isArchived`
and search hard-excludes archived rows at `search.service.ts:281`, so this is a
filter-through, not new data). The always-open chip strip eats vertical space in a modal —
collapsing it behind a "Filters" button is the layout fix.

**Effort:** **small** (Creator, Archived, collapse). Sort: see section 6.

### A2.5 Search where you already are

**ClickUp:** search scoped to the current channel, and search inside a list view.

**Rundesk today:** in-channel search is real and good — a right-rail "Search & filter"
panel with sender, date-range and file-type filters
(`apps/web/src/pages/workspace-chat-page.tsx:2223-2300`), opened from
`apps/web/src/components/chat/chat-header.tsx:195-220`. (It does not yet *default* to the
open channel — A3.7 owns that fix.)

**Missing:** there is no task-search box inside a list view. `TaskListChrome` exposes
`quickAdd` / `viewTabs` / `toolbar` slots only
(`apps/web/src/components/work/work-ui.tsx:284`) and no caller passes a search input; the
Fields-picker search at `app.$workspaceId.$spaceId.$projectId.$listId.tsx:1125` filters
field *names*, not tasks. Filtering already runs centrally through `filterTasks`
(`:816-820`), so a title-contains input drops straight in and narrows List / Board /
Table / Calendar / Gantt together.

**Effort:** **trivial-to-small.** The highest value-per-hour item in this area — users
hunting a task in a 300-row list currently have to leave the list. Coordinate with A1.4,
which widens the same toolbar.

### A2.6 Inbox triage: the data model is the gap, not the tabs

**ClickUp:** five buckets — Primary / Other / Later / Cleared / All — with per-tab counts,
plus Clear (dismiss) with an Unclear undo, and save-for-later.

**Rundesk today:** a real Inbox route
(`apps/web/src/routes/app.$workspaceId.inbox.tsx`, page
`apps/web/src/pages/workspace-inbox-page.tsx:117-147`) with a live unread badge,
Mark-all-read, and two sections — Unread `:159-187` and Earlier `:188-214`.

**A2.6a — confirmed missing at the schema level.** Verified by reading
`packages/db/src/schema/notifications.ts` directly: the table carries `readAt` (`:17`) and
nothing else — no dismissed, cleared, snoozed or category column, and the only index is
`(userId, readAt)` (`:20`). The route declares no search params. So Cleared / Unclear and
Later genuinely do not exist and cannot be faked client-side. Adding `dismissedAt` and
`snoozedUntil` columns plus list filters is the load-bearing change; every tab is then a
query. **Effort: medium** (migration + endpoints + filters). Ship **three** states, not
five: Inbox / Later / Cleared.

⚠ **A2.6b — correction: "no classification rule anywhere" (finding #19) is overstated.**
A type-partition precedent already ships twenty lines away:
`apps/web/src/routes/app.$workspaceId.tsx:149` filters the same notification list to
`['task_commented','comment']` for the Replies section, and
`workspace-inbox-page.tsx:43-49` already maps the machine-generated types
(`task_overdue`, `task_due_soon`, `task_status_changed`, `task_updated`) to their own
badges. Separating human mentions from system alerts is a derived predicate over data
already on the client. **Effort: trivial**, not medium. Ship it as a two-state toggle
("Mentions / All"), not a tab.

**A2.6c — save-for-later** already exists for chat messages end to end
(`apps/api/src/modules/chat/chat.service.ts:1670`, UI
`workspace-chat-page.tsx:1917-2018` with tags and search). Notifications cannot be saved,
and the Saved surface lives inside chat instead of the Inbox. Reuse the pattern rather
than inventing a second one. **Effort: small** once `snoozedUntil` exists.

### A2.7 Inbox rows: context and per-row actions

**ClickUp:** each row shows where it came from (channel or task glyph and name), a grouped
message count, a flag marker, and a hover-revealed action cluster (clear, snooze, react).

**Rundesk today:** rows render actor avatar, a typed badge, title, body preview with
@mentions resolved, relative timestamp, and an unread tint
(`workspace-inbox-page.tsx:241-291`); deep-links resolve properly through
`apps/web/src/lib/notification-nav.ts:105,:171-175`.

**Missing:** no source label or glyph on the row — the deep-link target already carries
`entityType` and `entityId` (`packages/db/src/schema/notifications.ts:16`), so the label
is a render of data already in hand. No grouped count. The only per-row action is
"Resolve" (= mark read), always visible, and only for the four comment/mention types
(`:62-71`, `:276-289`); there is no Clear and no snooze. Rows group by read-state rather
than under Today / Yesterday headers.

**Effort:** **small** for source label, date headers and hover treatment; the Clear and
snooze actions ride on A2.6a.

### A2.8 Status-change notifications should show from → to

**ClickUp:** "changed status from X to Y" with coloured dots.

**Rundesk today:** transitions do notify
(`apps/api/src/modules/tasks/tasks.service.ts:248`, `:258-260`, `:262-264`), badged in the
inbox at `workspace-inbox-page.tsx:47`. **The from/to pair is already captured** —
`tasks.service.ts:2186-2191` writes `meta: { from: before.status, to: patch.status }` to
the activity log.

**Missing:** the notification body names only the new status ("Updated status to X"), and
the client `ActivityEntry` type drops `meta` entirely
(`apps/web/src/components/task-detail-sheet.tsx:262-267`), so even the task activity feed
renders a bare "Status changed". Widen the type and compose the body from data that is
already written.

**Effort:** **trivial.** Highest credibility-per-hour fix in this area — it makes the
inbox look like it understands the work.

### A2.9 Replies

**ClickUp:** a dedicated Replies inbox with Unread / Read sub-tabs and a "you're all
caught up" zero-state.

**Rundesk today:** a Replies section on the workspace Home with a live unread count
(`app.$workspaceId.tsx:251`, source list `:149`) and a Resolve action (`:263-306`); thread
panels with full reply composers exist in chat (`workspace-chat-page.tsx:2370-2432`).

**Missing:** it is a panel inside Home rather than a route, so read replies are not
browsable and the state is lost on navigation; no zero-state.

**Effort:** **small** (promote to a route with a `?filter=read` param). The adjacent
**Mark unread** verb — the single most-used triage action Rundesk has nowhere — is owned
by **A3.3**, which found the durable read cursor that makes it trivial.

### A2.10 Shared with me

Cross-reference: **A1.7** owns this. The search palette is one of the three consumers of
the same reverse query. Do not schedule it separately.

### A2.11 What reaches the inbox (delivery preferences)

**ClickUp:** per-channel notification settings with presets and a test-send.

**Rundesk today:** a full event × channel matrix (in-app / web / mobile / email) across
eight event kinds with a DND window and sound mute
(`apps/web/src/components/push-notifications-panel.tsx:16,:33-48,:85-107`), enforced on
dispatch at `apps/api/src/modules/notifications/notifications.service.ts:728-758`.
**Auto-follow genuinely works** — watchers are auto-added for creator
(`tasks.service.ts:1468`), assignee (`:2651`) and commenters (`:2781`), and drive who gets
notified (`:238-240`, `:266-278`). *This is the finding that settles the conflict recorded
in section 2.2.*

**Missing:** the settings are reachable only from the profile page, with no gear from the
Inbox header; auto-follow is hard-coded with no visible toggle, so users cannot tell why
they are getting a notification. Add a **"Send test notification"** button here too
(resolved in section 2.2).

**Effort:** **trivial** (gear link, a one-line "you follow this because…" on the row, and
the test-send). Overlaps A4.7 — one owner, please.

**Build order for this area:** A2.8 → A2.5 → A2.2 → A2.1 → A2.7 → A2.6 → A2.3 → A2.9.
Everything before A2.6 is small or trivial and lands on existing data; A2.6 is the one
migration this area needs.

---

## A3. Chat & Calls

Scope: channels, DMs, threads, composer, mentions, reactions, chat search and files, the
chat sidebar, chat settings, and voice/video calls. Thirty-one audit rows merged into
eleven entries. **No row in this area carried a timestamp**, so no mm:ss is cited — none
were captured, and none have been invented.

The client's framing governs the ordering: she asked for a chat surface that works
end-to-end for daily team use, not ClickUp's full communications suite. A3.1–A3.7 are the
direct features. A3.8–A3.11 are where ClickUp's surface area gets expensive, and most of
this area's skip list comes from there.

Seven verdicts were spot-checked (calling stack, Super Agents / AI persistence,
assign-as-action-item, mark-unread, unread divider, channel-scoped search, channel-scoped
files). All "missing" verdicts held; **four effort ratings were wrong** and are corrected
inline, flagged `CORRECTION`.

### A3.1 Channel and DM messaging spine — build on it, don't rebuild it

**ClickUp:** channels and DMs with date dividers, threaded replies rolled up under the
parent ("View thread (N)", last-reply time), @mentions resolving to workspace members,
member count and Share in the header.

**Rundesk today:** all of it.
`apps/web/src/pages/workspace-chat-page.tsx:1279,1292-1300` (date dividers via
`apps/web/src/components/chat/chat-utils.ts:12,30`), `:1283-1290` and `:1648-1662` (thread
roll-up), `:1723-1768` (@mention resolution, persisted at
`packages/db/src/schema/chat.ts:52`),
`apps/web/src/components/chat/chat-header.tsx:135-196,290-298`. DMs and group DMs are
full-stack (`apps/api/src/modules/chat/chat.controller.ts:75-93`). Verified: the chat
controller exposes 44 endpoints covering channels, members, messages, edits, reactions,
pins, saves, files, search and unread.

**Missing:** nothing. **have.** *This is the load-bearing asset for the whole area — every
entry below is an increment on it.*

### A3.2 Thread panel is too thin to hold a conversation

**ClickUp:** a thread opens a right panel with a follower list, Mark unread, reactions on
each reply, timestamps, a bookmark chip, and an "Also send to #channel" checkbox.

**Rundesk today:** `workspace-chat-page.tsx:2370-2432` — ThreadPanel renders the parent,
the reply chain and a composer; reply send at `:851-855`, fetch at `:865`.

**Missing (verified by reading the whole component):** each reply row renders **author
name and body only** — no reactions, **and no timestamp at all**, which the audit did not
catch. The header is "Thread" plus a close button: no follower count, no Mark unread. The
reply composer opts out of slash commands
(`apps/web/src/components/chat/chat-composer.tsx:451-479` passes no
`enableSlashCommands`).

**Effort:** **small** for timestamps, reactions and slash commands — all three already
exist on the main message list and can be lifted directly; medium if followers are
included.

### A3.3 Mark-as-unread, and the unread divider in the stream

**ClickUp:** mark a channel or message unread from the ⋯ menu; the stream shows an "Unread
messages" divider where you left off.

**Rundesk today:** the read cursor already exists as durable state —
`packages/db/src/schema/chat.ts:31` `chatChannelMembers.lastReadAt` (plus
`lastDeliveredAt` at `:36`), written by `POST chat/channels/:channelId/read`
(`apps/api/src/modules/chat/chat.controller.ts:122`), with an unread endpoint at `:95` and
receipt logic already reading the cursor client-side at
`workspace-chat-page.tsx:317-345`.

**Missing:** no endpoint that rewinds `lastReadAt`, no menu item, no divider component
(grepping for `unreadDivider|firstUnread|Unread messages` in the chat page returns
nothing).

`CORRECTION` **— effort, not verdict.** The audit rated mark-unread inside two *medium*
rows (#13, #31) and the divider inside a *large* row (#69). Both are wrong: the cursor
column, the write path and the client-side comparison all exist. Mark-unread is one
endpoint that sets `lastReadAt` to `message.createdAt - 1ms` plus a menu item; the divider
is a render condition over data already in the component. **Effort: trivial each.**

This also closes the gap flagged from the inbox side in A2.9.

### A3.4 Sidebar organisation — user-named channel groups

**ClickUp:** the chat rail is grouped into user-created, named, collapsible buckets
(pinned, departments, clients), each with hover ⋯ and + actions, lock glyphs on private
channels, and a floating "↓ Unread messages" jump pill.

**Rundesk today:** `apps/web/src/components/chat/chat-sidebar.tsx:100-115` groups channels
by their Space, rendered at `:224-246`; lock/hash glyph at `:117-124`; Direct Messages at
`:291-399`; collapsible Archived at `:248-288`. Favouriting a channel is durable
(`apps/web/src/lib/use-favorites.tsx`) but drops it into one global Pinned list.

**Missing:** grouping is derived from Space membership and cannot be overridden.
`chat_channels` has `workspaceId`, `spaceId`, `name`, `description`, `icon`, `isPrivate`,
`isDm` — and no group or category column (verified,
`packages/db/src/schema/chat.ts:7-24`). So this needs a small table
(`chat_channel_groups` plus a per-user or per-workspace membership row), a drag-to-group
interaction, collapse state, and per-group hover actions.

**Effort: medium.** *The single highest-value gap in the chat sidebar — Space-derived
grouping breaks down the moment one client spans two spaces, or a channel belongs to no
space.*

### A3.5 Composer — the insert row and assign-as-action-item

**ClickUp:** composer with a message-type dropdown, leading +, AI on space-press, attach,
mention, emoji, Loom recorder, sticker, mic, insert-task/doc/whiteboard,
assign-as-action-item, and a split send button.

**Rundesk today:** `apps/web/src/components/chat/chat-composer.tsx:291-353` — emoji
including workspace custom emoji (`:293-338`), bold/italic/code (`:339-341`), paperclip
with drag-and-drop (`:342-344,162-179`), @ insert (`:345`), AI improve-writing
(`:346-352`), send (`:354-363`); slash-command autocomplete for `/task` and `/remind` at
`:79-86,219-236`.

**Missing that matters — assign a message as an action item.** Verified: no assign control
anywhere in the 508-line composer. But the audit understates how close this is —
`POST chat/messages/:messageId/create-task` already exists
(`apps/api/src/modules/chat/chat.controller.ts:177`) and the message hover menu already
calls it (`workspace-chat-page.tsx:1482-1494`). The service
(`apps/api/src/modules/chat/chat.service.ts:1430-1435`) creates the task with `listId`,
`title`, `description`, `createdById` and **no assignee or due date**. So the work is: add
`assigneeId` and `dueAt` to that DTO and service call, and put an assignee-and-date picker
on the create-task popover and the composer. **Effort: small** — confirmed.

**Missing, lower value:** AI on space-press (today the sparkle button rewrites the draft
rather than opening a prompt) — **small**. See section 6 for the rest of the icon row.

### A3.6 Mention picker — one tab short of useful

**ClickUp:** the @ menu spans People / Tasks / Docs / Whiteboards / Locations / Channels,
with `#` to link a channel inline and a warning when you mention someone without channel
access.

**Rundesk today:** verified — `workspace-chat-page.tsx:1723-1768` builds the menu from
`mentionCandidates` (workspace people, `:253`) plus the literal `here` / `channel`
broadcast tokens at `:1730`. Nothing else. A richer picker already exists on another
surface: the task-comment composer has People / Tasks / Docs tabs
(`apps/web/src/components/task-detail-sheet.tsx:3504-3529`).

**Missing:** Tasks and Docs tabs in chat (port the task-comment picker — **small**); a
Channels tab and `#` trigger to link a channel inline (**small** — the forward picker at
`:1526` already enumerates channels in a popover); a "does not have access to this
Channel" warning on a mentioned non-member (**small** — channel membership is already
queryable at `chat.controller.ts:141`).

> Related: `@team` group mentions are a different build and are owned by **A4.3**.

### A3.7 Channel context panels: members, info, files, search

**ClickUp:** a channel info panel with topic and description, Followers/Access with counts
and invite-by-email, a Files (N) thumbnail section, and search scoped to the open channel.

**Rundesk today:** members popover with owner tag and remove
(`apps/web/src/components/chat/chat-header.tsx:135-196`), add-people dialog
(`apps/web/src/components/chat/add-people-dialog.tsx:12-70` → `chat.controller.ts:186`),
invite-by-email via the share panel (`apps/web/src/components/share-panel.tsx:121-141`),
edit name/description/icon modal (`workspace-chat-page.tsx:1008-1065`), FilesPanel
(`:2141-2175`), SearchPanel (`:2223-2320`).

**Missing, and cheaper than rated:**

- **Search does not scope to the open channel.** Verified: the backend already accepts
  `channelId` (`chat.controller.ts:346`), and SearchPanel has the filter — it just
  initialises empty (`workspace-chat-page.tsx:2238`, `useState('')`) and the panel's props
  (`:2223-2235`) don't include the active channel. `CORRECTION`: the audit says small;
  this is a prop pass plus a default. **Effort: trivial.**
- **Files panel is workspace-wide.** Verified: `GET workspaces/:workspaceId/chat/files`
  takes only `q` and `type` — no `channelId` (`chat.controller.ts:331-340`), unlike the
  search endpoint right below it. Add the param and pass it through. **Effort: small** —
  confirmed.
- No separate `topic` column (`packages/db/src/schema/chat.ts:16-18` has `description`
  only) and no proper info panel — the edit modal is doing that job. **Effort: small.**

### A3.8 Saved messages, channel options, custom emoji

**ClickUp:** save-for-later on a message, a channel ⋯ menu (favourite into a named group,
rename, email-to-channel, notification level, mark unread), and a workspace custom-emoji
manager at `/settings/emoji` with search, creator filter, upload and aliases.

**Rundesk today:** message saves are full-stack with user tags
(`packages/db/src/schema/chat.ts:135-149`; `chat.controller.ts:320,357,366,371`) and a
Saved panel (`chat-header.tsx:216-222`). The ⋯ menu covers copy link, favourite,
per-channel notification level (all / mentions / mute → `chat.controller.ts:132`), edit,
archive, share and leave (`chat-header.tsx:232-309`). Custom emoji are full-stack
(`packages/db/src/schema/chat.ts:114-128`; `chat.controller.ts:158,163,172`) and usable in
composer and reactions.

**Missing:** the emoji manager lives inside the chat page's reaction popover
(`workspace-chat-page.tsx:1084-1108,1466-1473`) and accepts an image **URL only** — there
is no presign path for emoji, unlike chat attachments at `chat.controller.ts:230`.

**Effort: small** — add the upload path by reusing the existing presign, in place. Per the
resolution in section 2.2, do **not** build a standalone emoji admin console.
Favourite-into-a-named-group is small once A3.4 lands.

### A3.9 DM tabs (Chat / Calendar / Tasks) and a Brain button

**ClickUp:** a DM is a mini-workspace for a pair — tabs for Chat, a shared Calendar and
shared Tasks, plus an AI button in the header.

**Rundesk today:** DMs work (A3.1); the header shows avatar, name, live presence and
favourite (`chat-header.tsx:99-121,223-231,78-80`). Verified: the 344-line header file
contains no tab strip.

**Missing:** the tab strip, and — the real cost — the two views behind it. There is no
shared-calendar or shared-task view for a person pair anywhere in the app.
**Effort: large.**

**Recommendation:** cut to a single "Tasks" tab showing tasks where the two of you are
assignee or creator (one query over existing task tables); defer the calendar tab until
the planner area is decided. See the open question in section 7.

### A3.10 Calls (SyncUp): in-app voice/video, control bar, participants, in-call chat, AI notes

**ClickUp:** start a call from any channel or DM; in-call control bar with mic / camera /
share / leave and an AI Notes recording toggle; participants sidebar; in-call chat thread
with reactions and ClickBot system notices; an ended-call card in the stream with
duration, joiner count and Join; transcription that follows the spoken language.

**Rundesk today:** nothing. Verified independently: a repo-wide case-insensitive grep for
`syncup|huddle|webrtc|livekit|peerConnection|RTCPeer|videoCall|callSession` matches
exactly one file — `docs/clickup-platform-overview-spec.md`, this document — and zero
application code. `packages/db/src/schema/chat.ts` has no call or session table; the 44
chat endpoints include no call route. The only media capture is clip recording
(`apps/web/src/pages/workspace-clips-page.tsx:136-210`), and the only meeting surface
mints a Zoom or Google Meet join link on a task
(`apps/api/src/modules/tasks/meetings.controller.ts`).

**Missing:** the entire stack — signalling, SFU/TURN, recording pipeline, transcription,
plus five UI surfaces. **Effort: large**, and it is the largest single item in this area by
a wide margin.

**Recommendation, in the spirit of "to-the-point features":** do not build in-app calling.
Extend the existing meeting-link path — a "Start call" button in the channel or DM header
that mints a Zoom/Meet link, posts it as a message, and leaves a card in the stream.
**Effort: small**, and it delivers the one behaviour people actually use: get everyone on
a call from the channel. The SFU / recording / in-call-UI stack goes to section 6.

### A3.11 AI in the chat rail: Super Agents and saved AI chats

**ClickUp:** the chat rail carries Super Agents ("+ New Super Agent") and saved AI Chats
("+ Ask, Build, Create") beside human conversations.

**Rundesk today:** verified — `chat-sidebar.tsx` (475 lines) has exactly two sections,
Channels (`:142-289`) and Direct Messages (`:291-399`). There is no agent entity: no
`agents` module among the ~70 in `apps/api/src/modules/`, and the only `agent` hits in
`packages/db/src/schema/` are `userAgent` strings in `security.ts`, `auth.ts` and
`web-push-subscriptions.ts`. AI conversations are not persisted — the only AI table is
`aiUsage` (`packages/db/src/schema/ai-usage.ts:11`), and the panel keeps messages in
component state (`apps/web/src/components/ai-panel.tsx:47`). The AI itself is real:
streaming workspace-grounded chat (`ai-panel.tsx:87-130`) and a bounded tool loop that can
create objects (`apps/api/src/modules/ai/ai.service.ts:1982-2020`).

**Missing:** persisted, named AI entities.

`CORRECTION` **— the audit bundles two very different items under one large verdict.**
Super Agents (scheduling, permissions, run history, activity log) are **large**. Persisting
AI chat threads is a two-column table plus a list in the rail against an AI backend that
already works — **small**. Split them: build saved AI chats, defer Super Agents (A6.6 and
section 6).

---

## A4. Admin & People

*None of the 30 findings in this area carried a timestamp, so no mm:ss references appear.
Five verdicts were overstated and are corrected — **two of them were this area's own top
priorities**, so read the corrections before scheduling anything.*

The client's brief cuts hardest here, because admin is where ClickUp is most bloated.
Rundesk's admin foundations are genuinely strong — custom roles with a permission catalog,
trash with retention and per-user scoping, white-label branding, SSO and 2FA — and the
real gaps are shallow display work, not new subsystems. Most of the "large" verdicts in
this area are org-management theatre and belong in section 6.

### A4.1 People roster: invite, roles, capacity, removal

**ClickUp:** a People screen with invite-by-email, per-person role, pending-invite state,
columns for Last active / Invited by / Invited on / Teams, and a roster Export.

**Rundesk today:** the whole invite lifecycle works. Invite by email with role, resend,
cancel and copy-invite-link at `apps/web/src/pages/workspace-settings-page.tsx:793-833`;
pending invitations with expiry at `:909-963`; active members with inline role select,
weekly-capacity editor and remove at `:966-1000` (verified — the row renders avatar
initial, name, email, `CapacityInput`, a role `<select>` and remove).

⚠ **Missing, and the audit overstated it.** Finding #101 rated the missing roster columns
*medium* on the implication that the data doesn't exist. It does:

- **Invited by / Invited on** are already stored:
  `packages/db/src/schema/invitations.ts:38` (`invitedByUserId`) and `:46` (`createdAt`).
  Pure display work.
- **Last active** is already stored *and already rendered elsewhere* —
  `apps/web/src/pages/admin-directory-page.tsx:219-223` renders `lastSeenAt` as "last
  seen" in the super-admin directory, fed by `users.lastSeenAt`
  (`packages/db/src/schema/users.ts:50`).
- **Roster export** — a workspace exporter exists at
  `workspace-settings-page.tsx:1272-1290` (`/export/json`, `/export/csv/tasks`); it just
  has no members CSV.

**Corrected effort: small** (four columns on an existing list plus one CSV endpoint), not
medium. The Teams column depends on A4.3.

### A4.2 Roles and permissions

**ClickUp:** role tiers plus a permissions admin page (request-access toggles, "make new
Spaces private" default, private attachment links, block public sharing).

⚠ **Rundesk today — stronger than the audit credits.** Finding #99 mentions a Roles tab
only in passing; it is in fact a full custom-role system.
`packages/db/src/schema/custom-roles.ts:17-34` defines workspace-scoped roles with colour,
position and `isLocked` presets; `:41-54` stores granted permission keys; the catalog is
code-owned at `apps/api/src/modules/custom-roles/permission-catalog.ts:61` with a strict
inheritance cascade at `:102-145` (a custom role can only add to the legacy floor, never
drop below it). The UI is complete: `apps/web/src/components/roles-tab.tsx:150-156` loads
catalog and roles, `:417-442` is the grouped permission checklist, `:513-530` assigns roles
to members.

**Missing:** the *policy* toggles from ClickUp's Security & Permissions page —
new-Spaces-private-by-default, admin-manages-private-Spaces, private attachment links,
block public sharing (`apps/web/src/components/advanced-security-panel.tsx:150-230` has
session timeout, IP allowlist and login policy, but no sharing policies). Only the two
that matter for an agency handling client data are worth building: **default-private
Spaces** and **block public sharing**. **Effort: small** (two workspace flags read by
existing create and share paths). The rest: section 6.

### A4.3 Teams / groups

**ClickUp:** a Teams hub (All Teams / All People / Org Chart / Analytics), teams as a card
grid with cover images and avatar stacks, and `@team` mention aliases.

**Rundesk today:** teams exist as workspace groups —
`apps/web/src/components/groups-tab.tsx:62-79` create, `:119-131` add and remove members,
`:218` member count; schema at `packages/db/src/schema/workspace-groups.ts:17-33`
(including `externalId` for SCIM sync).

**Missing:** the one thing with real daily value is the **@-mention alias** — teams are not
currently mentionable in chat or comments (no `alias` column, no handle generation). That
is what makes a team useful rather than an org-chart entry. **Effort: medium** (alias
column, uniqueness, and a hook into the existing mention picker at
`workspace-chat-page.tsx:1723-1768` — coordinate with A3.6). The card grid with cover
images, the Members/Created/Creator sort filters and the grid/list toggle are cosmetics:
section 6.

### A4.4 Settings navigation: one console instead of three

**ClickUp:** a single grouped settings shell — ADMIN / FEATURES / INTEGRATIONS & CLICKAPPS
/ MY SETTINGS.

**Rundesk today:** three separate consoles. Workspace settings is a flat 11-tab rail
(`workspace-settings-page.tsx:69-80`: General, Members, Groups, Roles, Features,
Integrations, Security, SSO, Labels, Archived, Trash), personal settings live at
`apps/web/src/pages/app-profile-page.tsx:29-31`, and a super-admin console at
`apps/web/src/routes/app.admin.tsx`. Billing sits inside General (`:191-210`).
Workspace-level "manage" surfaces are scattered further: Integrations, Templates and
Automations are sidebar destinations, while Labels is a settings tab.

**Missing:** section headings on the existing rail and a link from the avatar menu into
personal settings — enough to make one coherent console without merging routes.
**Effort: small.** Building ClickUp's full grouped shell with every listed entry is
**large** and unnecessary.

⚠ **Correction to #99 and #105:** both list "AI Usage" among entries that "have no page at
all." The *backend exists* — `apps/api/src/modules/ai/ai.controller.ts:29-41` serves
`GET /ai/usage`, per-user and per-model, with estimated cost and a date range. Only the
settings tab is missing, so this is **trivial**, not part of a large build. For an agency
billing AI spend to clients, this is the cheapest high-value win in the area. Same item as
**A6.8** — build it once.

### A4.5 Workspace identity, branding and switching

**ClickUp:** workspace panel with avatar, member count, plan tier and Upgrade, plus
Settings and People buttons; workspace switcher with Create Workspace.

**Rundesk today — have.** White-label branding is complete: name, primary and accent
colour, logo upload with progress, custom domain with verification at
`workspace-settings-page.tsx:527-545, 738-740, 754-756`, plan-gated at `:187`, applied
app-wide via `apps/web/src/components/app-topbar.tsx:145-157`. Switching workspaces
(grouped by organisation, with New workspace) is done at
`apps/web/src/components/workspace-sidebar.tsx:634-673`.

**Missing:** the sidebar switcher button (`workspace-sidebar.tsx:621-633`) shows only name
and org — no avatar, member count or plan line, and no Settings/People shortcut buttons.
The data all exists (`PlanCard` at `workspace-settings-page.tsx:191-210` already reads
`/workspaces/:id/plan`). **Effort: trivial.**

### A4.6 Trash

**ClickUp:** per-user Trash, 30-day auto-purge, Clear all, and a searchable table of type /
location / who deleted.

**Rundesk today — have, and better than the finding implies.**
`apps/web/src/components/trash-tab.tsx:33-55` covers six entity types with name, type,
location path, `deletedAt` and `deletedBy`; `:65-80` wires search plus type and deleted-by
filters; `:93-121` restore and delete-forever; `:123, :145` render the retention notice,
with purge logic in `apps/api/src/modules/trash/trash.service.ts` and empty-trash gated by
role at `trash-tab.tsx:62-63`.

⚠ **Correction — this area's stated #1 priority was wrong.** The audit called trash
workspace-scoped and flagged a confidentiality leak across client Spaces, on the strength
of `apps/api/src/modules/trash/trash.controller.ts:29-43` filtering by workspace and an
optional deleter. The *service* scopes it: `trash.service.ts:73` computes
`const restrictTo = isAdmin ? query.deletedByIds ?? null : [actor.id]` — with the in-code
comment "A non-admin only ever sees what they deleted; an explicit 'Deleted by' filter
narrows further (never widens)" — and applies it at `:163`. **There is no leak. Nothing to
build here.** Removed from the priority table.

### A4.7 Personal settings: profile, 2FA, notifications

**ClickUp:** My Settings → Profile, two-factor (SMS and authenticator), per-channel
notification settings, notification integrations, auto-follow.

**Rundesk today — largely have.** Profile with avatar upload, display name, email,
password change and session list at `app-profile-page.tsx:107-200, 527-676`. TOTP is
complete and enforced at login — `app-profile-page.tsx:678-833` plus
`apps/api/src/modules/auth/auth.controller.ts:77-79` → `assertTotpSatisfied`. Notification
preferences are an 8-event × 4-channel matrix with quiet hours and mute-sounds at
`apps/web/src/components/push-notifications-panel.tsx:33-47, 86-114`, honoured live at
`apps/web/src/components/app-topbar.tsx:485-576`. Slack routing with per-event rules at
`apps/api/src/modules/integrations/slack/slack.service.ts:121-205`.

⚠ **Correction — auto-follow is not missing.** The audit claimed nothing subscribes you to
a task you created, edited or commented on, and that watchers are added only by explicit
call. Verified false: creator at `apps/api/src/modules/tasks/tasks.service.ts:1468`
("Creator is auto-subscribed as a watcher so they hear about replies/activity"), assignee
at `:2651`, comment author at `:2781` ("Auto-subscribe the author as a watcher"), all
`onConflictDoNothing`. `tasks.controller.ts:358` → `tasks.service.ts:2722` is the *manual*
endpoint, not the only path.

**Actually missing:** a **visible auto-follow toggle** and a "you follow this because…"
line so users can tell why a notification reached them — **trivial**, owned jointly with
A2.11. Plus **"Send test notification"** (**trivial**), resolved in favour of building it
in section 2.2, since push failure is otherwise silent. SMS 2FA, notification presets and
Smart Notifications: section 6.

### A4.8 Account menu and presence

**ClickUp:** avatar menu with settable status, Mute notifications, Themes, Notifications,
Keyboard shortcuts.

**Rundesk today:** `app-topbar.tsx:744-797` — name and email, Profile, Workspace settings,
Help & support, Reset dock, Sign out. Presence is derived, not settable:
`apps/api/src/modules/presence/presence.service.ts:19-56` computes online / away / offline
purely from `lastSeenAt` (verified — there is no status column and no history table).

**Missing:** a **settable status** (manual away, do-not-disturb) and a **mute-notifications
shortcut**. Auto-derived presence alone tells a team nothing about intent, which is the
whole point of status in an agency. **Effort: small** for a status enum plus an override on
the presence read path. Themes, shortcuts and notifications as menu rows are pure
re-plumbing of things that already exist elsewhere (theme button at
`app-topbar.tsx:411-440`, shortcuts at `apps/web/src/components/shortcuts-overlay.tsx`) —
**trivial**, low value.

### A4.9 Spaces administration

**ClickUp:** a Spaces admin list (Spaces / Archived / Inaccessible tabs) and a per-Space
configuration grid (Owner / Shared with / Statuses / ClickApps / Required Views).

**Rundesk today:** every ingredient exists, but only per-space and behind a different
dialog each: required views at `apps/web/src/components/space-views-dialog.tsx:37-63`,
status templates at `apps/web/src/components/list-statuses-manager.tsx:59-84`, members and
public/private at `apps/web/src/components/container-members-sheet.tsx:143-215`, spaces
themselves managed from the sidebar tree at `workspace-sidebar.tsx:1113-1140`.

⚠ **Correction to #112:** it calls Archived Spaces "missing." Archived spaces are in fact
listed and restorable today — `apps/api/src/modules/trash/trash.service.ts:185` reads
`spaces.archivedAt` and `archivedById` and surfaces them in the Trash tab alongside
folders, projects, lists, tasks and docs (`:96-198`). The archived half exists.

**Missing:** a **single index of live Spaces** with owner and privacy at a glance.
**Effort: small** (one read-only table over data the sidebar already fetches). The full
ClickUp config audit grid and per-Space ClickApps: section 6.

### A4.10 Work schedule and capacity

**ClickUp:** workweek days, working hours, derived daily and weekly capacity, public
holidays, team days off.

**Rundesk today:** one number per member — `weeklyCapacityHours`, edited at
`workspace-settings-page.tsx:983-989`, consumed by the workload page at
`apps/web/src/pages/workspace-workload-page.tsx:54-65, 200-228` for capacity-vs-load with
overload highlighting.

**Missing:** confirmed by grep — no workweek, working hours, holidays or days-off anywhere
in `apps/` or `packages/db/src/schema/`. The #117 verdict holds. But the full ClickUp model
is **large** and mostly serves shift-based orgs. For an agency the useful 20% is **days off
/ time away**, so a person on leave stops absorbing planned load in the workload view.
Scoped that way: **medium**. The workweek / working-hours / holiday-calendar machinery:
section 6.

### A4.11 App Center, imports and exports

**Rundesk today — have, all four.** Catalogue of 27 apps with categories and an Installed
scope at `apps/web/src/pages/workspace-integrations-page.tsx:43-84`, with real OAuth for
github, gitlab, gcal, outlook, onedrive, linear, salesforce, dropbox and zoom
(`apps/api/src/modules/integrations/connections/integration-connections.service.ts:16-25,
380-500`). ClickUp CSV/API import with job polling at
`apps/web/src/pages/workspace-import-page.tsx:54-100`. Export at
`apps/api/src/modules/export/export.controller.ts:15,44`. Swagger API docs at
`apps/api/src/main.ts:71-78`. Inbound email-to-task aliases at
`apps/api/src/modules/email-to-task/email-to-task.controller.ts:29-42`.

**Missing:** nothing worth building. The ten additional competitor importers (#66) are
one-time migration tooling for a product Rundesk is replacing ClickUp with: section 6.

### A4.12 Priority summary for this area

Revised after the two corrections above removed the previous top item.

| Item | Effort | Why now |
|---|---|---|
| AI Usage settings tab | trivial | Endpoint already exists; enables client billing |
| Workspace panel: avatar, members, plan line | trivial | Data already fetched |
| Auto-follow toggle + "why am I getting this" | trivial | Behaviour works; users just can't see or control it |
| Send test notification | trivial | Push failure is otherwise silent |
| Roster columns + members CSV | small | All data already stored |
| Settable presence status | small | Derived presence conveys no intent |
| Default-private Spaces + block public sharing | small | Client-data safety for an agency |
| Spaces index (live Spaces at a glance) | small | Archived half already works via Trash |
| `@team` mention aliases | medium | Makes groups actually useful |
| Days off feeding workload | medium | Capacity planning is already half-built |

---

## A5. Docs, Forms & Dashboards

*The audit rows backing this area carried no video timestamps, so no mm:ss citations
appear. Three "missing" verdicts turned out to be wrong on spot-check and are corrected
inline.*

The client's rule cuts hardest here. ClickUp's Docs, Forms and Dashboards surfaces are
mostly *hubs about hubs*: scope rails, template carousels, index tables with six sortable
columns. Rundesk already has the working machinery underneath almost all of it. What is
genuinely broken is one thing: **a form has no way to say where its submissions go.** That
leads.

### A5.1 Form → destination list is unreachable from the UI (blocker)

**ClickUp:** creating a form asks, as a first-class step, "where do you want submissions
saved?" and shows a Space → Folder → List tree.

**Rundesk today:** the wiring is complete end to end on the backend —
`packages/db/src/schema/forms.ts:13` (`targetListId`, FK to lists, `onDelete: 'set null'`),
`apps/api/src/modules/forms/forms.service.ts:126-192` resolves it and creates the task, and
create and patch both accept it (`forms.service.ts:473-516`,
`apps/api/src/modules/forms/forms.controller.ts:69`).

**Gap (verified directly):** no UI ever sets it. Creation posts `{ title }` only
(`apps/web/src/pages/workspace-forms-page.tsx:43-50`), and the whole Settings tab at
`apps/web/src/pages/workspace-form-builder-page.tsx:827-900` is General
(title / description / confirmation), Visibility (public / enabled) and the share link.
Nothing else. The only way to route a submission today is to hand-build a dropdown field
with `taskField: 'targetListId'` (`workspace-form-builder-page.tsx:585-640`). **A plain
form silently files nowhere.**

**Effort: small.** One list-picker in FormSettings plus a destination step at create time.
No schema or API work. **This is the single highest-priority item in the document.**

### A5.2 Forms hub: scoping and a useful index

**ClickUp:** All Forms / My Forms with counts, favorites, recents, and an index table with
Name / Location / Created by / Date viewed.

**Rundesk today:** a card grid — `workspace-forms-page.tsx:37-50` lists every workspace
form; cards show title, description, public/internal badge, submission count and public
slug, with duplicate / archive / delete / enable (`:52-75`, `:168-260`).

⚠ **Gap, with a correction to the audit's "medium":** the `FormSummary` type
(`workspace-forms-page.tsx:19-28`) omits `createdById` and `targetListId`, so neither the
owner nor the destination list is visible anywhere in the hub — the two columns that
actually matter. Both columns exist in the table already
(`packages/db/src/schema/forms.ts:13-14`), so this is a DTO widening plus a table render,
not new modelling. Favorites are not free here — `packages/db/src/schema/favorites.ts:19`
types `entityType` as `'space' | 'list' | 'task' | 'doc' | 'channel'`, so forms would need
adding to that union (a TypeScript-level change; the column is `text`, no migration).

**Effort: small.** Build Name / Destination list / Created by / Submissions. Drop "Date
viewed" (section 6).

### A5.3 Form builder core — already done

**Rundesk today:** all present. Builder / Settings / Submissions tabs
(`workspace-form-builder-page.tsx:282`), preview (`:263`), publish/unpublish toggle
(`:254-259`), copyable public link (`:883-897`), submissions with filters and CSV export
(`:938-1000`, `:1110-1121`), public renderer at `apps/web/src/routes/submit.$slug.tsx`.
Eight field types with per-field required flags and enforced red asterisks
(`workspace-form-builder-page.tsx:24-32`, `packages/db/src/schema/forms.ts:36`,
`submit.$slug.tsx:85-88`, `:267`). **have** — no work.

### A5.4 Form as a view on its list

**ClickUp:** a Form sits as a tab beside List/Board on the list it feeds, and appears in
the sidebar tree under that list.

**Rundesk today:** forms live in a workspace-scoped hub
(`apps/api/src/modules/forms/forms.controller.ts` routes are
`workspaces/:workspaceId/forms`). Confirmed: `packages/db/src/schema/enums.ts:96-102` —
`viewTypeEnum` is exactly `['list','board','calendar','gantt','table']`; the "missing"
verdict is correct.

**Gap:** a form can never be a view tab, and forms are invisible from the list they
populate.

**Effort: large** as ClickUp does it (enum + views table + the list route's switcher at
`app.$workspaceId.$spaceId.$projectId.$listId.tsx:616-908`).
**Recommended cheaper cut: small** — once A5.1 ships, show a form's target list on its
card, and list the forms feeding a list in the sidebar under it. That delivers the
discoverability without a sixth view type. This supersedes A1.10.

### A5.5 Form appearance and spam protection

**ClickUp:** layout picker, light/dark theme, background and button colour palettes,
reCAPTCHA, hide-branding.

**Rundesk today:** none of it. `packages/db/src/schema/forms.ts:10-25` has only
`coverImageUrl`; no captcha, theme or layout columns exist anywhere in the repo.

**Gap — split this.** Theming is cosmetic; **abuse protection on a public endpoint is not
optional**. `submit.$slug.tsx` posts to an unauthenticated route, so a public form is an
open write path into a task list.

**Effort: small** for the part worth doing — a honeypot field, a per-IP rate limit, and an
optional "require workspace login" (which `isPublic` at `forms.ts:19` already models, with
the in-schema comment `false = require workspace login`). Theming and reCAPTCHA:
section 6.

### A5.6 Docs hub scoping (All / My / Shared / Archived)

**ClickUp:** a left rail of scoped buckets with counts — All Docs, My Docs, Shared with me,
Private, Meeting Notes, Archived — plus Favorites and Recent Pages.

**Rundesk today:** one page tree — `apps/web/src/components/docs-panel.tsx` renders Pages
with expand/collapse (`:440`), add sub-page (`:457`), add page (`:498-509`),
create-from-template (`:514-515`).

⚠ **Correction — the audit's "no scope parameter" is wrong.**
`apps/api/src/modules/docs/docs.controller.ts` list already takes `spaceId` and
`parentDocId`, and `apps/api/src/modules/docs/docs.service.ts:53-60` already filters
`isArchived = false`. So *Archived* is a query-param flip on an existing column
(`packages/db/src/schema/docs.ts:21-24`), *My Docs* is a filter on the existing
`createdById` (`docs.ts:14`), *Shared with me* has its grant table already
(`packages/db/src/schema/object-shares.ts:20` includes `'doc'` — it consumes the reverse
lookup owned by A1.7, not a new model), and Favorites already supports docs
(`packages/db/src/schema/favorites.ts:19`).

**Gap:** the buckets, counts and Favorites tray are unrendered, not unbuilt. Genuinely
absent: Recent Pages (no view tracking) and Meeting Notes (no such object).

**Effort: small** for All / My / Shared / Archived plus Favorites. Downgraded from the
audit's "large" — do not let anyone re-model docs for this.

### A5.7 Docs index table

**ClickUp:** a sortable table — Name / Location / Tags / Date updated / Date viewed /
Sharing, with subpage counts and a private padlock.

**Rundesk today:** tree only; no table renderer in `docs-panel.tsx`, and no such column
labels in the i18n catalog (`apps/web/src/lib/i18n/catalogs.ts:112-143`).

**Gap:** the *view* is missing, but nearly all the data exists: title, `createdById`,
`updatedAt`, `createdAt`, `spaceId` / `parentDocId` for location, `publicShareId` for
sharing state (`packages/db/src/schema/docs.ts:9-31`). The one column with no backing data
anywhere is Date viewed — the only `lastViewedAt` in the product is on client portals
(`packages/db/src/schema/client-portals.ts:36`).

**Effort: small** for a table over the existing list response, *once the list endpoint
returns creator and location*. Drop Date viewed.

### A5.8 Doc editor blocks and the slash menu

**ClickUp:** `/` opens a full block palette — table, columns, divider, callout, image,
embeds — and a live List can be embedded inside a doc.

**Rundesk today:** a real slash menu exists (`docs-panel.tsx:203`, `:413-418`) with five
commands: Heading 2, Todo list, Bullet list, Quote, Code. Plus sub-pages,
embed-another-doc, AI writing (`:362-377`), share, Markdown and PDF export, version history
and comments.

**Gap:** no table or column block, and no embeddable List block — which is the one that
carries real weight, because it is how a project brief stays live instead of going stale.
Also no "Link Task or Doc" from the doc side (task→doc linking exists only from the task,
`apps/web/src/components/task-linked-docs.tsx`).

**Effort: medium.** Table, divider and callout are Tiptap extensions (small); the live-List
embed block is the medium part.

### A5.9 Doc templates and the docs landing page

**ClickUp:** three large starter cards (Project Overview / Meeting Notes / Wiki), an Import
button, and a "New Doc ˅" split button.

**Rundesk today:** six built-in templates ship
(`apps/web/src/components/doc-templates.tsx:55-160` — Meeting notes, Project brief, SOP,
Sprint retro, RFC, 1:1 agenda) plus user-saved workspace templates
(`docs-panel.tsx:262-286`, API `docs.controller.ts:71-98`).

**Gap:** templates hide behind an icon-triggered dialog (`docs-panel.tsx:513-516`) rather
than sitting on the empty state where a new user meets them. No document import.

**Effort: trivial** to surface the existing six as starter cards on the empty state.
Import: section 6.

### A5.10 Dashboard cards and the Manage-cards panel — already done

**Rundesk today:** fully working.
`apps/web/src/components/dashboard-widget-builder.tsx:221-224` edit toggle, `:258-292` a
sticky catalogue panel with search and per-widget descriptions, `:103-107` add / remove /
resize, `:236-245` drag-reorder, persisted as presets.

**Gap:** only the catalogue *contents* — `dashboard-widget-builder.tsx:54-72` is 12
metric / list / chart widgets; the personal cards the client saw (Recents, Priorities,
Personal List) are not among them, and the dashboard's "Recent activity" card
(`apps/web/src/routes/app.$workspaceId.dashboard.tsx:172-175`, `:394-420`) is
recently-*updated* tasks workspace-wide, not what *I* opened.

**Effort: small** — add widgets to an existing catalogue; no new mechanism.

### A5.11 Dashboards hub: ownership, sharing, index

**ClickUp:** a scope rail (All / My / Shared with me / Private) with counts, favorites,
recents, and an index table with Owner / Location / Sharing.

⚠ **Correction — the audit's "dashboards are not even modelled as ownable" is wrong.**
They are: `packages/db/src/schema/dashboard-presets.ts:8` has `userId`, and
`apps/api/src/modules/dashboards/dashboards.service.ts:16-31` already scopes `listPresets`
to *your own presets plus the admin-set workspace default*. So "My" is what exists today,
and "Private" is the current default state. Nobody should rebuild preset ownership.

**Gap:** what is truly missing is **sharing** — no visibility or share column on
`dashboard_presets`, and `apps/api/src/modules/dashboards/dashboards.controller.ts` has no
share endpoint, so "Shared with me" has nothing behind it. UI-side, presets are a
`<select>` (`app.$workspaceId.dashboard.tsx:191-201`) rather than a browsable index.

**Effort: medium** — reuse `object_shares` (add `'dashboard'` to the objectType union at
`packages/db/src/schema/object-shares.ts:20`) rather than inventing a second sharing model,
then render a simple index. The reverse-lookup query from A1.7 then covers dashboards too.

### A5.12 Dashboard starter templates

**Rundesk today:** a new dashboard starts from the hard-coded `DEFAULT_LAYOUT`
(`dashboard-widget-builder.tsx:76-85`) or blank; the "missing" verdict holds —
`dashboard_presets` has no `isBuiltIn` flag.

**Gap:** no way to spin up a purposeful dashboard without assembling it card by card.

**Effort: small.** The exact pattern already exists one table over —
`packages/db/src/schema/templates.ts:36` (`isBuiltIn`, with a partial unique index for
workspace-null rows). Copy it and seed two or three layouts.

### A5.13 Dashboard freshness and delivery

**Rundesk today:** edit mode is solid (`dashboard-widget-builder.tsx:216-253`). Scheduled
delivery exists in full — off / daily / weekly, UTC time, weekday, recipients, last-sent
(`apps/web/src/components/report-builder.tsx:462-533`,
`packages/db/src/schema/custom-reports.ts`) — just not reachable from a dashboard.

**Gap:** no refresh interval anywhere in the repo, and no Share / export / expand controls
on the dashboard header.

**Effort: small** — a refetch interval on the existing queries plus a link from the
dashboard header into the existing scheduled-report builder. **Do not build a second
scheduler.**

### A5.14 Time reporting cards: timesheet grid and capacity

**ClickUp:** a person × weekday timesheet card with per-person totals and a week stepper,
and a Time Reporting card comparing capacity vs estimated vs tracked.

**Rundesk today:** a weekly grid exists on the Time page
(`apps/web/src/pages/workspace-time-page.tsx:348-393`, with submit-for-approval at
`:331-346`), and workload shows per-person capacity and load bars
(`apps/web/src/pages/workspace-workload-page.tsx:55-63`, `:294-342`; server side
`apps/api/src/modules/reports/reports.service.ts:930-955`).

**Gap, in priority order:**

- (a) **tracked time is never joined** — `reports.service.ts:930/1029` derive load from
  task `timeEstimate` only, so the capacity view compares plan against plan and cannot show
  over- or under-delivery;
- (b) timesheet rows are the signed-in user's entries, not one row per person, so there is
  no team total;
- (c) the week is pinned to today — `workspace-time-page.tsx:75` computes `weekStart` in a
  `useMemo` with no state, so you cannot look at last week.

**Effort: medium.** (c) is trivial on its own and worth doing immediately; (a) is the
substantive piece. Coordinate with A4.10 — days off feed the same capacity view.

### A5.15 AI StandUp card

Cross-reference: the generation already ships. **A6.5** owns the correction and the
evidence. The dashboard-side work is one item: wrap the existing endpoint as a **catalogue
widget with a run-now action**, so the briefing is not stranded on the Insights page and no
longer only ever arrives on a schedule. **Effort: small** — the highest ratio of visible AI
value to work in this area.

---

## A6. AI & Meetings

Scope: the AI assistant surfaces, agents and skills, and everything meeting-shaped
(upcoming calls, notetaker, meeting notes, recordings, transcription). None of the audit
rows for this area carry a timestamp, so no mm:ss is cited. No per-row emphasis markers
exist either, so the ordering is by consequence against the client's own test: the meeting
→ notes → tasks loop first, the assistant surfaces second, the agent and skill platform
last (and mostly skipped).

**Three "missing" verdicts in the source findings are wrong. Corrections are inline and
marked ⚠ — do not brief anyone to rebuild these.**

### A6.1 Meeting notes → action items (the one loop that already works)

**ClickUp:** an AI meeting-notes document per call — attendees, embedded recording, AI
overview and key takeaways — with action items extracted into tasks.

**Rundesk today:** the extraction half is built and is genuinely good.
`apps/api/src/modules/ai/ai.controller.ts:174` (`POST /ai/meeting-notes`) →
`apps/api/src/modules/ai/ai.service.ts:931-946` returns structured action items;
`apps/web/src/pages/workspace-ai-page.tsx:988-1160` is a full review-and-commit UI
(per-item and bulk assignee / due-date / priority overrides, target-list picker, per-item
failure reporting, defaults persisted per workspace). Feature-flagged as
`ai.meeting_notes` and on by default (`packages/feature-flags/src/registry.ts:59,178`).

⚠ **Missing:** it is a paste-box, not a record. Nothing is persisted — no meeting row, no
notes document, no attendees, no link back to the call. Finding #29 calls the whole
"Meetings AI assistant" missing; that overstates it — the model call, the prompt, the
extraction schema and the task-commit flow all exist and should be reused verbatim.

**Effort: medium** (persist a meeting-notes doc using the existing `docs` table plus a
`meetingId`, and feed the notes body from a transcript instead of a paste).

### A6.2 Meeting records, recordings and the AI Notetaker

**ClickUp:** an Upcoming Meetings panel for today's calls with a "Send AI Notetaker"
button, and a notes library table grouped by month with tags, date created and sharing
columns.

⚠ **Rundesk today — the "no call-recording capture exists" claim in findings 30, 34 and 107
is wrong.** A signed Zoom webhook receiver is live at
`apps/api/src/modules/inbound-webhooks/inbound-webhooks.controller.ts:150-200`
(`POST /inbound/zoom`, HMAC-verified, handling `endpoint.url_validation` and
`recording.completed`), and
`apps/api/src/modules/inbound-webhooks/zoom-recordings.service.ts:63-152` fetches the cloud
recording and attaches it to every linked task as a `kind:'recording'` external link,
idempotently, with token refresh at `:224-258`. Meetings are created on a task at
`apps/api/src/modules/tasks/meetings.controller.ts:30-47` (Zoom or Google Meet) and
surfaced in `apps/web/src/components/task-detail-sheet.tsx:1695-1698, 1953-1985`, including
manual recording attach. **The pipe from a real call to a stored recording URL is already
built** — task-scoped.

**Missing:** the meeting entity itself (there is no meetings table;
`packages/db/src/schema/calendar-sync.ts` stores only external event link ids), the notes
library, and the notetaker. Because the recording arrives with a URL, a v1 notetaker is
"on `recording.completed`, pull the transcript from the same Zoom API and run the existing
`/ai/meeting-notes` prompt" — **not a media-capture project**. The Upcoming Meetings panel
additionally blocks on the events model owned by the planner area; do not spec it here.

**Effort: medium** for the notetaker on top of the existing Zoom pipeline (it was rated
large on the false assumption that capture had to be built); **large** only if a non-Zoom
provider is required.

*This is the notetaker referred to in the section 2.2 resolution — the Zoom-webhook one we
build, as distinct from the in-call one we skip.*

**Notes library:** a filterable list of meeting-note docs grouped by month, with tags and
date — reuse `packages/db/src/schema/docs.ts` plus a type or tag field rather than a new
table. **Small** once the meeting entity exists.

### A6.3 Transcription

**ClickUp:** transcription follows the spoken language of the call, and clip cards show
transcript previews.

**Rundesk today:** no server-side transcription anywhere. The only speech code is browser
dictation into the AI composer (`apps/web/src/lib/use-speech-recognition.ts:166-260`, used
at `apps/web/src/components/ai-panel.tsx:54-59`). `apps/api/src/modules/clips/` has zero
transcript code — verified.

**Missing, and worse:** the shipped UI already claims this works —
`apps/web/src/lib/i18n/catalogs.ts:402` ("Every clip auto-transcribes…") and `:408`
("Search clips by title or transcript…"), translated into all four locales. **That copy is
currently false and must either be built or corrected before the client sees the Clips
page.**

**Effort: large** to build (ASR provider, storage, search indexing); **trivial** to fix the
copy. Fix the copy now and build transcription only as part of A6.2, where it has a payoff.

### A6.4 The AI assistant surface (docked panel, hub, ask-from-anywhere)

**ClickUp:** AI is reachable from wherever you are — a docked side panel, an "Ask AI" row
in the command bar, and an inline prompt on a task.

**Rundesk today:** the engine is strong, the reach is not.
`apps/web/src/components/ai-panel.tsx:45-100` is a streaming chat grounded in `workspaceId`
and `currentView`, but it is mounted in exactly one place —
`apps/web/src/pages/workspace-ai-page.tsx:167` (verified: two `AiPanel` references in the
entire web app, both in that file). The AI hub has six working tabs at
`workspace-ai-page.tsx:141-147`. On a task, AI is three discrete buttons
(`apps/web/src/components/task-detail-sheet.tsx:1181`, `:1230`, `:1300`). The command
palette's only action is create-task
(`apps/web/src/components/command-palette.tsx:204-219, 435-443`).

**Missing:** dock the existing panel globally (it already accepts `currentView` grounding,
so this is wiring, not new AI); add an "Ask AI · \<query\>" row to the palette (**the same
item as A2.3** — one build); add a one-line prompt strip on the task instead of scattered
icons.

**Effort: small** for the palette row, **medium** for the global dock. This is the highest
ratio of perceived-AI-value to work in the whole area.

### A6.5 Daily briefing ("AI StandUp")

⚠ **Finding #45's "missing" verdict is wrong — this exists.**
`apps/api/src/modules/ai/briefing.service.ts:47-77` is an hourly cron
(`@Cron(CronExpression.EVERY_HOUR, { name: 'ai-briefing-hourly' })`) that selects opted-in
users by their configured hour (`isBriefingDue`, `:18-28`), generates the text via
`apps/api/src/modules/ai/ai.service.ts:2241-2262`, and delivers it as an `ai_briefing`
notification, once per UTC day. It is rendered as a card on
`apps/web/src/pages/workspace-insights-page.tsx:388-430` with highlights and suggestions,
is per-user opt-in (delivery hour picked at
`apps/web/src/pages/app-profile-page.tsx:870-880`), and is flagged `ai.daily_briefings`.

**Missing:** only placement and one action — the briefing does not appear on the Home /
My Tasks surface or in the dashboard widget catalogue, and there is no "generate now" or
"post this as a standup" button.

**Effort: small** (re-mount an existing card — see A5.15 for the dashboard half), not
medium. **Nobody should rebuild the briefing.**

### A6.6 Super Agents and AI chat threads

**ClickUp:** persistent AI agents alongside DMs, saved AI conversation threads in the chat
rail, "+ New Super Agent".

**Rundesk today:** genuinely absent — verified, zero implementation hits across
`apps/web/src`, `apps/api/src` and `packages/db/src`. The only matches are marketing copy
(`apps/web/src/lib/i18n/catalogs.ts:1210`, `:4511` — "AI agents trained on your workspace",
shown on the sign-up hero) and a comment at
`apps/api/src/common/guards/not-guest.guard.ts:5` (that guard was retired on 25 September). The chat rail
(`apps/web/src/components/chat/chat-sidebar.tsx:125-262`) has channels, space groups,
archived and DMs only.

**Missing:** everything — agent entity, runtime, activity log, rail section.
**Effort: large.** See section 6.

**Split out and do build:** persisting *AI chat threads* is a two-column table plus a list
in the rail against an AI backend that already works — **small** (A3.11 carries the
detail).

**Separately: the sign-up page promises agents that do not exist.** Either the copy changes
or this ships. See the open question in section 7.

### A6.7 AI Skills

**ClickUp:** a Skills library (All / Installed / Created by me), skill mining from existing
work, prebuilt skill templates, and AI that authors a skill for you.

**Rundesk today:** absent — verified, the only "skill" match in the whole codebase is prose
at `apps/web/src/pages/terms-page.tsx:95`. **Effort: large.** See section 6.

### A6.8 AI cost visibility

**ClickUp:** an AI Super Credits meter with percentage used, over-limit warnings and
add-credits.

**Rundesk today:** the accounting exists and nothing reads it —
`packages/db/src/schema/ai-usage.ts:11-27` logs a row per model call (feature, model,
in/out tokens, workspace, user) and `apps/api/src/modules/ai/ai.controller.ts:29-42`
returns a per-user and per-model summary with estimated cost. Verified: zero web consumers
of `ai/usage`.

**Missing:** an admin-only readout. The data is already there; this is a table and a chart.
**Effort: small.** Same item as **A4.4's** correction — build it once, as a settings tab.
The credit-allowance and billing model is a separate thing: section 6.

### A6.9 In-app calls (SyncUp)

Cross-reference: **A3.10** owns this, with the full verification and the cheaper
recommendation. Note only that A6.2 delivers the outcome the client actually described —
notes from calls — without any of it.

---

## 4. Already covered — do not rebuild these

Everything here ships today. This list exists because seventeen audit verdicts said
otherwise, and the cost of re-implementing any of it is far higher than the cost of
reading this section.

**Hierarchy, views and sharing**

- Space → Folder → Project → List tree with expand/collapse, per-row `+` and `⋯`
  (`apps/web/src/components/workspace-sidebar.tsx:405-429`, `:916-1259`).
- **Folders appear on the space page** — the client's reported bug is fixed
  (`workspace-space-shell-page.tsx:129-145`, `:236-250`).
- **Space icon and colour picker** and **inline "+ Add project"** — both client asks
  (`workspace-space-shell-page.tsx:387-390`, `:270-286`;
  `container-edit-dialog.tsx:32-47, 145-186`).
- Grouped List with per-group inline add, Table with status pills and a Fields picker that
  creates fields, Board with droppable columns, WIP limits and dnd-kit drag
  (`…$listId.tsx:1638+`, `:2269-2914`, `:2990-3178`).
- Saved views end to end, including filter + sort + group + hidden-field persistence
  (`packages/db/src/schema/views.ts`, `…$listId.tsx:860-888`, `:1224-1281`).
- Per-space view configuration and per-space scoped statuses
  (`packages/db/src/schema/spaces.ts` `viewConfig`, `space-statuses.ts`).
- Enforced privacy model on spaces, folders and lists, with make-private toggles for lists
  and folders.
- Per-object sharing, forward direction, for every object type including lists
  (`shares.controller.ts:19,:35,:47,:60`, `share-panel.tsx:18`).

**Search and notifications**

- Ctrl+K palette with a single input feeding a grouped seven-entity-type result set, nine
  nav commands, create-task-from-query
  (`command-palette.tsx:222-231, 254-259, 436-443, 479-488`).
- **Search backend already supports all seven entity types and multi-select**
  (`search.controller.ts:11`, `search.service.ts:18, 242-247, 411, 457-469`). Only the
  Meilisearch single-type branch (`:256-257`) needs a one-line change.
- Inline status / priority / label / assignee / due-date / custom-field filters, honoured
  server-side, plus named saved searches (`command-palette.tsx:268-419`,
  `search.controller.ts:39-100`, `packages/db/src/schema/saved-searches.ts`).
- In-channel search panel with sender, date-range and file-type filters
  (`workspace-chat-page.tsx:2223-2300`).
- Inbox route with unread badge, Mark-all-read, mention resolution and working deep-links
  (`workspace-inbox-page.tsx:117-291`, `apps/web/src/lib/notification-nav.ts:105,171-175`).
- **Status-change from/to is already captured** in the activity log
  (`tasks.service.ts:2186-2191`) — only the render is missing.
- 8-event × 4-channel notification matrix with DND window and sound mute, enforced on
  dispatch (`push-notifications-panel.tsx:16,33-48,85-107`,
  `notifications.service.ts:728-758`).
- **Auto-follow works** — creator, assignee and commenter are auto-subscribed as watchers
  (`tasks.service.ts:1468, 2651, 2781`).

**Chat**

- Channels, DMs and group DMs with date dividers, thread roll-up and @mention resolution;
  44 chat endpoints (`workspace-chat-page.tsx:1279-1300, 1283-1290, 1648-1662, 1723-1768`,
  `chat.controller.ts:75-93`).
- **A durable read cursor** — `chatChannelMembers.lastReadAt` and `lastDeliveredAt`
  (`packages/db/src/schema/chat.ts:31,:36`) with a write path and an unread endpoint. Both
  mark-unread and the unread divider are renders over this.
- Composer with custom emoji, formatting, drag-and-drop attach, @ insert, AI
  improve-writing, and `/task` + `/remind` slash commands
  (`chat-composer.tsx:291-363, 79-86, 219-236`).
- Create-task-from-message, backend and hover menu both
  (`chat.controller.ts:177`, `workspace-chat-page.tsx:1482-1494`).
- Saved messages with user tags, per-channel notification levels, archive, share, leave
  (`packages/db/src/schema/chat.ts:135-149`, `chat-header.tsx:232-309`).
- Custom emoji, full stack (`packages/db/src/schema/chat.ts:114-128`).
- **Channel-scoped chat search is supported by the backend already**
  (`chat.controller.ts:346`) — only the client default is missing.

**Docs, forms, dashboards, reporting**

- Form builder in full: three tabs, preview, publish/unpublish, public link, eight field
  types with required flags, submissions with filters and CSV export, public renderer
  (`workspace-form-builder-page.tsx:24-32, 254-282, 883-1121`, `submit.$slug.tsx`).
- **Form `targetListId` is fully wired on the backend** (`forms.ts:13`,
  `forms.service.ts:126-192, 473-516`, `forms.controller.ts:69`) — only the UI is missing.
- **Docs list endpoint already scopes** by `spaceId` / `parentDocId` and already filters
  archived (`docs.controller.ts`, `docs.service.ts:53-60`).
- Doc editor with slash menu, sub-pages, doc embeds, AI writing, share, Markdown and PDF
  export, version history, comments (`docs-panel.tsx:203, 362-377, 413-418, 440-515`).
- Six built-in doc templates plus user-saved workspace templates
  (`doc-templates.tsx:55-160`, `docs.controller.ts:71-98`).
- Dashboard widget builder: catalogue with search and descriptions, add/remove/resize,
  drag-reorder, persisted presets (`dashboard-widget-builder.tsx:103-292`).
- **Dashboard presets are already ownable and already scoped to the user**
  (`dashboard-presets.ts:8`, `dashboards.service.ts:16-31`).
- Scheduled report delivery in full — off/daily/weekly, UTC time, weekday, recipients,
  last-sent (`report-builder.tsx:462-533`, `packages/db/src/schema/custom-reports.ts`).
  Do not build a second scheduler.
- Weekly timesheet grid with submit-for-approval, and workload capacity-vs-load bars
  (`workspace-time-page.tsx:331-393`, `workspace-workload-page.tsx:55-63, 294-342`).

**AI and meetings**

- Streaming workspace-grounded AI chat with a bounded tool loop that can create objects
  (`ai-panel.tsx:45-130`, `ai.service.ts:1982-2020`).
- Meeting-notes extraction with a full review-and-commit UI — per-item and bulk overrides,
  target-list picker, per-item failure reporting
  (`ai.controller.ts:174`, `ai.service.ts:931-946`, `workspace-ai-page.tsx:988-1160`).
- **A signed Zoom webhook receiver and cloud-recording attach pipeline**
  (`inbound-webhooks.controller.ts:150-200`, `zoom-recordings.service.ts:63-152, 224-258`)
  and Zoom / Google Meet meeting creation on a task (`meetings.controller.ts:30-47`).
- **The AI daily briefing, end to end** — hourly cron, per-user opt-in and delivery hour,
  generation, notification delivery, rendered card (`briefing.service.ts:18-77`,
  `ai.service.ts:2241-2262`, `workspace-insights-page.tsx:388-430`,
  `app-profile-page.tsx:870-880`).
- **AI usage accounting per model call, with a cost-summary endpoint**
  (`packages/db/src/schema/ai-usage.ts:11-27`, `ai.controller.ts:29-42`).

**Admin, people, platform**

- Full invite lifecycle: invite by email with role, resend, cancel, copy link, pending
  list with expiry, active roster with inline role and capacity editing
  (`workspace-settings-page.tsx:793-1000`).
- **A complete custom-role system** with a code-owned permission catalog and a strict
  inheritance cascade (`custom-roles.ts:17-54`, `permission-catalog.ts:61, 102-145`,
  `roles-tab.tsx:150-530`).
- Workspace groups with member management and SCIM `externalId`
  (`workspace-groups.ts:17-33`, `groups-tab.tsx:62-131`).
- White-label branding: name, colours, logo upload, custom domain with verification,
  plan-gated and applied app-wide (`workspace-settings-page.tsx:527-756`,
  `app-topbar.tsx:145-157`).
- **Trash with per-user scoping already enforced**, six entity types, location path,
  deleted-by, search and filters, restore, delete-forever, retention notice, role-gated
  empty (`trash.service.ts:73, 163, 96-198`, `trash-tab.tsx:33-145`).
  **Archived spaces are already listed and restorable** (`trash.service.ts:185`).
- TOTP two-factor, complete and enforced at login (`app-profile-page.tsx:678-833`,
  `auth.controller.ts:77-79`).
- Presence (online / away / offline) derived from `lastSeenAt`
  (`presence.service.ts:19-56`).
- Integrations catalogue of 27 apps with real OAuth for nine providers, ClickUp CSV/API
  import with job polling, JSON and CSV export, Swagger API docs, inbound email-to-task
  aliases (`workspace-integrations-page.tsx:43-84`,
  `integration-connections.service.ts:16-25, 380-500`, `workspace-import-page.tsx:54-100`,
  `export.controller.ts:15,44`, `main.ts:71-78`, `email-to-task.controller.ts:29-42`).

---

## 5. Corrections to the audit

Seventeen verdicts were wrong. They are marked ⚠ or `CORRECTION` in place; this is the
index. The first two are the most expensive to get wrong, because both were somebody's
stated top priority.

| # | Audit said | Actually | Consequence |
|---|---|---|---|
| 1 | Trash is workspace-scoped — a confidentiality leak across client Spaces | Per-user scoping is enforced at `trash.service.ts:73`, applied `:163` | **Area's #1 item deleted.** No work. |
| 2 | Nothing auto-subscribes you to tasks; watchers need an explicit call | Creator `tasks.service.ts:1468`, assignee `:2651`, commenter `:2781` | Downgraded from "small build" to "add a toggle" (trivial) |
| 3 | Search API whitelists only `task\|doc\|file` | All seven types at `search.controller.ts:11`, `search.service.ts:18` | Prevented a search-backend rebuild |
| 4 | Type filters drop channel/message/user extras | `searchExtras` gates per type at `search.service.ts:411, 457-469` | Same |
| 5 | Multi-select needs backend work | Already honoured, `search.service.ts:242-247` — only the Meili branch `:256-257` is single-type | medium → small |
| 6 | No notification classification rule anywhere | Type-partition precedent at `app.$workspaceId.tsx:149`, badges at `workspace-inbox-page.tsx:43-49` | medium → trivial |
| 7 | Meetings AI assistant is missing | Extraction, prompt, schema and commit UI all exist (`ai.service.ts:931-946`) | Reuse verbatim; only persistence is new |
| 8 | No call-recording capture exists | Signed Zoom webhook + recording attach pipeline is live (`zoom-recordings.service.ts:63-152`) | Notetaker large → medium |
| 9 | AI daily briefing is missing | Hourly cron, opt-in, generation, delivery, card — all shipping (`briefing.service.ts:47-77`) | medium → small (re-mount only) |
| 10 | Mark-unread is medium | Durable `lastReadAt` cursor already exists (`chat.ts:31`) | medium → trivial |
| 11 | Unread divider is large | Render condition over data already in the component | large → trivial |
| 12 | Channel-scoped chat search is small | Backend already accepts `channelId` (`chat.controller.ts:346`); it is a prop pass | small → trivial |
| 13 | Super Agents and saved AI chats are one large item | Two different things; thread persistence is a two-column table | Split: build one, defer one |
| 14 | Launch Lab folder bug + space icon/colour + add-project are open | All three ship (`workspace-space-shell-page.tsx:129-145, 270-305, 387-390`) | Three client asks already closed |
| 15 | Forms hub columns are medium (new modelling) | `createdById` and `targetListId` already on the table (`forms.ts:13-14`) | medium → small (DTO widening) |
| 16 | Docs list has no scope parameter | Already takes `spaceId`/`parentDocId` and filters archived (`docs.service.ts:53-60`) | large → small |
| 17 | Dashboards are not modelled as ownable | `dashboard-presets.ts:8` has `userId`; service already scopes (`:16-31`) | Only *sharing* is new |

Two further notes worth carrying: **roster columns** and **AI usage** were both filed under
"no page at all," when in fact the data (`invitations.ts:38,:46`, `users.lastSeenAt`) and
the endpoint (`ai.controller.ts:29-41`) already exist — both drop from medium/large to
small/trivial.

---

## 6. Recommend skipping

Forty-one items, merged and deduplicated from all six area passes, each with the reason.
This is a decision record. If any of these is later requested by the client, it is a scope
change with a known cost — not an oversight.

**Platform-sized items wearing a button**

1. **Native in-app voice/video calling (SyncUp)** — SFU, TURN, signalling, scaling and a
   recording pipeline. A platform in itself; Zoom and Meet links already cover the need via
   the existing meeting flow (A3.10 has the small alternative).
2. **In-call control bar, participants sidebar and in-call chat thread** — all depend on
   calling we are not building.
3. **In-call transcription and an in-call AI Notetaker with spoken-language detection** —
   no native calls to transcribe. *(Distinct from the Zoom-webhook notetaker in A6.2, which
   we do build.)*
4. **Super Agents / agent runtime** — an autonomous-agent platform with scheduling,
   permissions, run history and its own activity log is a product, not a feature. Targeted
   AI actions already cover the real jobs. (Fix the sign-up copy either way — section 7.)
5. **AI Skills library, skill mining and skill templates** — an authoring-and-packaging
   ecosystem a small team will never populate.
6. **Cross-app search tabs (ClickUp / Drive / Gmail / Dropbox / SharePoint)** — a
   per-provider auth, quota and result-normalisation surface duplicating search the user
   already has inside those apps.
7. **Rival-tool importers (Asana / Jira / Trello / Monday / Notion / Wrike)** — one-time
   migration tooling; CSV plus the existing ClickUp importer covers the migration this
   client is actually doing, and every extra connector is separately maintained.
8. **Document import from other tools** — an open-ended file-format project with the same
   justification.
9. **Auto-detected transcription language as its own feature** — falls out of whichever ASR
   provider is chosen; nothing to design.

**Billing and metering we are not doing yet**

10. **AI credit allowance, over-limit warnings, bonus grants and "Add credits"** — billing
    machinery that only matters when AI is resold. The admin cost readout (A6.8) is one
    query away and delivers the actual need.
11. **Cross-session AI "Memory" controls** — high-ambiguity surface with low first-release
    payoff next to workspace-grounded context that already ships.

**Config-for-config**

12. **The "…" hidden-object-type registry** (Clips / Forms / Whiteboards / Spaces
    checkboxes) — config over seven entity types that fit on one chip row.
13. **Five-tab inbox chrome with per-tab counts** — three states plus one Mentions toggle
    delivers the same triage. The tabs are the bloat, not the buckets.
14. **Model picker / gear / footer chrome in the command bar, and the model-picker chip in
    the AI composer** — user-facing model choice is a permanent support burden; pick the
    model server-side per task type.
15. **Sort control in the search palette** — a top-N relevance list has nothing meaningful
    to sort. (Sort already exists in list views, where it means something.)
16. **Nested/stacked filter builder with per-condition trash and a separate "Saved
    filters"** — saved views already carry the filter set, and unlimited nesting is the
    exact complexity tax she asked us to avoid.
17. **Per-space ClickApps icon grid** — feature toggles are workspace-wide by design here;
    per-space forking multiplies the QA and support surface.
18. **Spaces admin console with Archived / Inaccessible tabs and a per-space Owner /
    Shared-with / Statuses / ClickApps / Required-Views audit grid** — admin reporting
    furniture over settings that are already editable in place. (The plain live-Spaces index
    in A4.9 is the useful part and is *not* skipped.)
19. **"Inaccessible Spaces" tab** — an audit view for a permissions edge case that arises at
    enterprise scale, not agency scale.
20. **ClickUp's full grouped settings shell** with Template Center / Task Types / Emojis /
    Referrals entries — most target pages do not and should not exist.
21. **Task Types (custom object types)** — verified absent; renaming tasks into Epics,
    Invoices or Candidates is enterprise taxonomy the client explicitly did not ask for.
22. **Quick-reaction admin setting (Off / Frequently-used / Custom, with live preview)** — a
    six-emoji strip needs no admin console.
23. **Custom emoji admin page with search, creator filter, aliases and bulk import** — emoji
    already work in chat; a shortcode is enough for one workspace. *(The presign upload path
    in A3.8 is kept.)*
24. **"Sidebar Labels" and "Chat Sidebar Count" style settings** — preferences for pixels
    nobody will change.
25. **Organized-vs-Recents chat sidebar layout mode** — redundant once user-named groups
    (A3.4) exist.

**Telemetry nobody reads**

26. **"Date viewed" columns anywhere** (docs, dashboards, forms, whiteboards) — one sortable
    column that requires writing a per-user view event on every object open; nothing in
    Rundesk reads it today.
27. **"Recent Pages" / "Recents" as a first-class tracked list** — same telemetry cost;
    sidebar route history already covers the real need.
28. **Docs "Popular Wikis"** — an engagement-ranking feature needing view counts nobody has
    asked to see.
29. **Team Analytics hourly online/offline charts and per-person "currently viewing"
    tracking** — surveillance infrastructure requiring a whole presence-history pipeline;
    capacity-vs-load already answers the real question.
30. **Smart Notifications (suppress mobile pings while active on desktop)** — cross-device
    activity tracking to save one push.

**Org furniture**

31. **Org Chart and the manager / reports-to hierarchy** — verified absent (no `managerId`
    or `reportsTo` in `packages/db/src/schema/users.ts`); a reporting tree is furniture a
    single agency team does not need.
32. **Teams card grid with cover images and avatar stacks** — visual weight over a list that
    already shows member counts.
33. **Followers-vs-Access split tabs with separate counts** — one member panel answers both
    questions.
34. **Workweek, working-hours and public-holiday calendar machinery** — serves shift-based
    orgs; the useful 20% (days off feeding workload) is kept in A4.10.

**Decoration**

35. **Form theming** (layout picker, light/dark, background and button colour palettes,
    hide-branding) — cosmetics on a page that already inherits workspace branding, and it
    multiplies every future form change by a design surface.
36. **reCAPTCHA specifically** — a third-party dependency and consent surface where a
    honeypot plus rate limiting stops the actual abuse (A5.5 keeps the protection).
37. **Message-type dropdown, sticker button, split send caret and Loom-style recorder in the
    composer** — decoration; clips already record screen and voice.
38. **`@@` / `@@@` / `@@@@` / `@/` escalation shortcuts and the footer legend** — a tabbed
    picker does the same job without a keystroke grammar.
39. **"Agents" and "Brain" buttons on list and space headers**, and **the "Add Channel" tab
    on a list** — the first two front an agent entity that does not exist; the third bolts
    chat onto the view strip for no workflow gain.
40. **ClickBot as a system-message author** — needs a bot identity model against `authorId`'s
    hard user FK, for cosmetic notices.
41. **Emoji reactions on inbox rows; the integrations promo card in the channel info panel;
    30-day auto-expiry on saved-for-later items; email-to-channel inbound addresses; SMS
    two-factor; hour-gutter + all-day lane + timed blocks in the list Calendar; column picker
    and sharing column on the meeting-notes table; dashboard stock gallery beyond two or
    three layouts; Docs "Meeting Notes" bucket; and ClickUp's six-column index tables as a
    pattern** — respectively: the inbox is a queue to empty, not a conversation; marketing
    surface, not a feature; a silent-deletion retention policy nobody asked for; inbound mail
    routing infrastructure when per-list email-to-task already exists; the authenticator app
    is already enforced end-to-end and SMS is the weaker factor plus a telecom bill; the
    day-cell grid already covers task work; table chrome for a list that should be a filtered
    doc view; a template library is content work that ages badly; a bucket for an object type
    that does not exist (it belongs with the notetaker decision); and build Name plus the one
    or two columns that decide an action — the rest is furniture the client explicitly did
    not ask for.

**Two things that are *not* skipped, despite appearing on an area skip list:** "Send test
notification" and the emoji **upload** path. Both were resolved in section 2.2.

---

## 7. Open questions for the client

Ordered by how much downstream work each one gates.

1. **The Project level.** Rundesk has Space → Folder → **Project** → List; ClickUp has
   Space → Folder → List. This is why her mental model keeps mismatching the UI ("aur pehle
   mera project show hoga", 01:04). Keep it and document it, rename it, or collapse it? A
   rename is trivial; a collapse is medium and touches routing everywhere.
2. **The sign-up page promises AI agents that do not exist.**
   `apps/web/src/lib/i18n/catalogs.ts:1210, :4511` advertise "AI agents trained on your
   workspace" on the marketing hero. Either the copy changes (trivial) or Super Agents ship
   (large). This needs a decision before the next demo, not after.
3. **The Clips page claims auto-transcription that does not exist.** `catalogs.ts:402`
   ("Every clip auto-transcribes…") and `:408` ("Search clips by title or transcript…"),
   translated into all four locales. Fix the copy now, or is ASR in scope?
4. **Calls.** Recommendation is a "Start call" button that mints a Zoom/Meet link into the
   channel (small) instead of native in-app calling (large, multi-week). Confirm.
5. **Inbox states.** Recommendation is three (Inbox / Later / Cleared) plus a Mentions
   toggle, instead of ClickUp's five tabs. Confirm before the migration is written — the
   columns are cheap to add now and awkward to change later.
6. **Public forms.** Is an unauthenticated public form endpoint wanted at all, or should
   every form require workspace login (`isPublic: false`, already modelled)? This decides
   whether the abuse-protection work in A5.5 is needed.
7. **How much private-space usage is expected?** "Shared with me" (A1.7) is only worth its
   slot if private spaces and lists are used routinely for client work. If everything is
   workspace-visible, it drops down the list.
8. **DM tabs.** Recommendation is a Tasks-only cut (one query over existing tables) and
   deferring the shared Calendar until the planner area is decided. Acceptable?
9. **Which competitor imports actually matter?** The plan assumes ClickUp only. Every
   additional connector is a separately maintained integration.
10. **Does she want a timestamped pass over the recording?** All 676 findings carry
    `timestamp: null`; the mm:ss in this document were read manually from the transcript
    while checking specific claims. A full timestamped index is a straightforward pass for
    someone with the recording open, and would make client review considerably easier.

---

## 8. How this was produced

**194 frames sampled at 8-second intervals across the full 25:52 recording**, read
alongside the Roman-Urdu transcript
(`0b5e8a07-ClickUp_Platform_Overview___Roman_Urdu.txt`, Whisper large-v3-turbo, fp32) and
the seven follow-up feedback clips. That produced **676 audit findings**, merged here into
68 entries across six areas.

Three things about the method a reader should know:

- **Frames and transcript were read together, not separately.** The transcript names what
  she is talking about; the frames show what is on screen at that moment. Neither alone is
  sufficient — several ClickUp surfaces are demonstrated silently.
- **Timestamps.** All 676 findings carry `timestamp: null`. Every mm:ss in this document was
  read directly out of a transcript file while verifying a specific claim, and is cited with
  the file it came from. **None are interpolated.** Areas whose findings carried no timestamp
  say so at the top and cite nothing.
- **"Missing" verdicts were re-checked against the repository before being written down.**
  Not all of them — the most consequential ones per area, and every one whose effort rating
  would change a schedule. Seventeen failed that check (section 5). Where a verdict was
  corrected, the correcting evidence is a file and line number you can open, not a summary.

Square brackets in quoted transcript text are the transcriber's own best-guess markers where
the audio was indistinct; they are preserved rather than silently cleaned up.
