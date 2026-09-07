# Video 2 — the ClickUp walkthrough, audited against Rundesk

**Source**: `video_2.mp4`, 23:53, 1920×1080 · transcript (Roman Urdu) ·
287 frames at 5s, read as 24 contact sheets. Frame notes:
[`video2-frame-observations.md`](./video2-frame-observations.md).

Method is the one video 1 ended on: **the frames are the ground truth and the
transcript is the commentary**, read side by side rather than transcript-first
with frames as a check. That ordering matters — in video 1 the transcript-only
pass missed three features because she never says them out loud, and the same
thing happens here (the cover-image picker, the "does not have access to task"
warning, the Related Items *References* tab).

Her closing instruction governs the whole thing:

> `[21:43]` "Ab is mein jo FEATURES maine enlist kiye hain, un ka matlab yeh hai
> ke **HUMEIN YEH CHEEZEIN CHAHIYEIN**. Is mein aisa kuch bhi nahi hai jo maine
> aap ko extra bataya — jitna chahiye humein RUNDEX mein, maine woh bataya."

Nothing shown is decoration. Everything shown is the requirement.

---

## 0. This video is the second half of one sentence

Video 1's §TASKS begins at `[21:17]` and never finishes. Its last words are:

> `[23:31]` "Aur yahan pe TIME ESTIMATE, DEPENDENCY, SUBTASKS, CHECKLIST hua.
> **Lekin abhi meeting ka waqt ho gaya — main baad mein continue kar sakti hoon.**"

Video 2 `[00:00]` picks up mid-thought on the *same create modal*, adding custom
fields. So the task specification is **v1 `[21:17]`–`[23:38]` + v2
`[00:00]`–`[06:19]`**, and auditing either half alone gets it wrong.

The combined spec, in her order:

| | from video 1 | from video 2 |
|---|---|---|
| create surface | Task / Doc / Reminder / Whiteboard / Dashboard tabs | (same modal, frames confirm) |
| placement | Space → List; a list is compulsory | — |
| body | name, description as a **document editor** (slash, tables, banners, images) | — |
| people & time | assign; **start + due date, each with a time**; priority; tags typed+enter | — |
| named but not shown | time estimate, dependency, subtasks, checklist | all four shown |
| — | — | **custom fields**, templates, attachments, track-time, cover, task types, activity, voice, clips, relationships |

**Already delivered from the video-1 half** (verified in the code, not assumed):
start/due dates with time (`tasks.start_date`, `tasks.due_date`), time estimate
(`tasks.time_estimate`), tags, priority, and the **slash menu on the task
description** — `task-detail-sheet.tsx:1124` carries the comment
`§G15 [22:28] — the slash menu on the description`. That one was on my list to
report as missing until I read it.

---

## 1. What is already there

Checked before writing a single gap, because a lone grep manufactures them —
this engagement has produced six false gaps that way. Each of the following is
**built** and must not be re-reported:

| Feature | Where |
|---|---|
| Multiple named checklists, per-item **assignee**, due date, position | `packages/db/src/schema/checklists.ts` — `task_checklists` + `task_checklist_items.assignee_id` |
| Task dependencies (`blocks` / `blocked_by`) | `schema/dependencies.ts` |
| **Per-space / per-project status workflows** | `lists.status_scope`, `space-statuses.ts`, `project-statuses.ts` |
| Time tracking with a real running timer | `time-entries.service.ts` — `getRunning` / `stop` |
| Saved searches | `schema/saved-searches.ts` |
| Folders, incl. move | `modules/folders` |
| Views: list / board / calendar / gantt / table, with a default | `modules/views` |
| Email-into-task with a rotatable address | `modules/email-to-task` |
| Calendar sync **both ways**, Google + Outlook, plus an iCal feed | `calendar-sync` — `:provider/pull`, `tasks/:taskId/push`, `gcal`/`outlook` |
| Task templates incl. **save-as-template from a task** | `task-templates` — `POST /from-task/:taskId`, `/duplicate/:taskId` |
| **AI model picker with tiers and one-line hints** | `ai/model-tiers.ts` + `components/ai-panel.tsx` |
| Skills with memory + connections | `schema/skills.ts` (video 1 §15) |
| Slash menu on the task description | `task-detail-sheet.tsx:1124` |
| Clips (record + share) as a surface | `modules/clips`, `workspace-clips-page.tsx` |

---

## 2. The gaps

Ordered by how much of the video they account for, not by size.

### V2-01 · Custom fields are the opening subject and the thinnest area
**Ask** `[00:12]` *"humein ek task ke andar aur bhi option chahiye … hum woh
FIELD ke through add kar sakte hain"*, `[00:24]` she creates **"Progress"**.

**Frames** `00:20`/`00:40` show a **searchable field-type picker** of ~29 types:
Text area (Long Text), Number, Labels, Checkbox, Money, Website, Formula,
Custom Text, Summary, Progress Updates, Files, Relationship, People,
**Progress (Auto)**, Email, Phone, Categorize, Custom Dropdown, Translation,
Sentiment, Tasks, Location, **Progress (Manual)**, Rating, Voting, Signature,
Button, Action Items, T-shirt Size. `00:25` shows the config for the one she
picks: *Track completion of → Subtasks, Checklists, Assigned comments* and
*Tasks without active items → Display 100% when task is in a done status*.

**Rundesk**: ten types — `text, number, dropdown, date, checkbox, url, email,
phone, money, rating` (`custom-fields.service.ts:14`). Created only from the
**project page** (`workspace-project-shell-page.tsx:762`), never from the task
create modal, and configured with name / required / dropdown options only.

Three distinct gaps:
1. **`+ Create new field` is not on the create modal** — she creates the field
   *while making a task*, which is the whole reason it is on screen at `[00:16]`.
2. **The one field she actually demonstrates does not exist.** `Progress (Auto)`
   derives a percentage from subtasks/checklists/assigned comments. Rundesk has
   all three inputs and no field that reads them.
3. ~19 missing types. The cheap ones (Long Text, Labels, People, Files,
   Location, T-shirt Size, Voting) are storage plus a renderer; Formula and the
   AI four (Summary, Translation, Sentiment, Action Items) are not.

Her `[02:04]` line — *"yeh automatically khud hi sync up ho gaya, aap ko field
create karne ki zaroorat nahi"* — is about the field appearing on the task by
itself once defined. Rundesk does render project fields on a task, so that half
holds.

`size: large` · `apps/api/src/modules/custom-fields/*`,
`apps/web/src/components/quick-create-modal.tsx`, `task-detail-sheet.tsx`

---

### V2-02 · There is no Planner, and it is a quarter of the video
**Ask** `[12:34]`–`[16:19]`, and frames S13–S17 — the single largest unbuilt
block.

**Frames** show, in order: a connect screen (*"You, but better organized"*) →
Google OAuth with **write** scope → a week grid with an all-day row, hour
gutter and a live red now-line → a left rail of **Priorities / Meet with /
Assigned to me / Today & overdue / Backlog** → a **calendar picker grouped by
account**, with workspace-generated calendars (*Time off*, *Holidays*) beside
the external ones → seven settings pages → **dragging a task onto the grid to
create a block titled "Work on dbgdh"** → the tab header counting down
*"Work on dbgdh · 2h 55m left"*.

**Rundesk**: `calendar-sync` exists and is genuinely two-way (`gcal`/`outlook`
pull + per-task push + `.ics`). What does not exist is the **surface**: there is
no planner or calendar route (`apps/web/src/routes/` has none), and
`grep -ri "time.block\|time_block"` across `apps/` and `packages/` returns
**zero files**. Calendar in Rundesk is a *list view type* and a read-only strip
on the person panel.

Sub-items, each visible in a frame:
- drag a task onto the calendar → a timeblock, with a configurable **prefix**
  (`Work on`)
- **Priorities** rail — Rundesk *has* `user_priorities` from video 1, but it is
  not on a calendar
- **Meet with** — search a person, see their availability
- **Sidebar sections** — show/hide/reorder, plus *+ Add a new section*
- **Appearance** — grid size, event style, default duration, colour-tasks-by,
  week start, timezone, weekends
- **Time blocking** — show assigned/recurring/overdue, **default list for new
  tasks ("defaults to your personal list")**, focus-time visibility,
  **work schedule** (workspace or custom, per-day)
- **Upcoming meeting** — time-left display, desktop menubar, quick-join window
- **Automations** — sync a list/folder/space to a Google Calendar

> The **"Default list for new tasks — defaults to your personal list"** setting
> is the answer to the question left open at the end of video 1: where a task
> created from `/task`, from a message, or by the AI should land. ClickUp's
> answer is the person's Personal List, configurable. That is now a decision
> with a reference implementation rather than an open question.

`size: large` · new `apps/web/src/pages/workspace-planner-page.tsx`,
`apps/api/src/modules/calendar-sync/*`, new timeblock schema

---

#### V2-02 read off the frames

Frames `13:08` and `14:10` re-extracted and read. Four corrections and
additions to the paragraph above:

**1. The route is `/calendar`, not `/planner`.** The address bar reads
`app.clickup.com/90182956805/calendar` while the left rail is headed
"Planner" and the tab title is "Planner | Leo". The sidebar entry and the URL
disagree on purpose — the noun is Planner, the thing is a calendar.

**2. The grid, frame `13:08`.** `‹ ›` `August 2026` · `Week ▾` on the right
with three icons and a gear. Header row: a `+`, the timezone (`GMT+5`), then
`Mon 3 … Sun 9` with **today's number in a filled pill**. Below it an **All
day** row carrying a `⟳`, then an hour gutter (1pm…11pm visible) with a **red
now-line and a red `6:02` pill in the gutter**, and **weekend columns dimmed**.
A floating command bar sits at the bottom: *"Search events, teammates,
commands…"*.

**3. The left rail, frame `13:08`.** Header **Planner** with a `+ ▾`, then:
**Priorities** — empty state *"Prioritize a Task to see it appear here"* over a
flag icon, and **+ Add priority** · **Meet with** — *"Search for people…"* ·
**Assigned to me** › · **Today & overdue** › · **Backlog**, which lists the
actual task. So Backlog is where an unscheduled task waits to be dragged.

**4. Settings, frame `14:10`.** Seven pages, in this order: **Appearance ·
Accounts · Sidebar · Upcoming meeting · Time blocking · AI Notetaker ·
Automations**, with a footer of What's new / Report a problem / Feature
requests. The Appearance page carries: event style **Subtle | Solid**,
**Default event duration** (`1 hour`), **Color tasks by** (`None`), **Start
week on** (`Monday`), **Timezone** (`Asia/Karachi`), and five toggles — Show
weekends · Show week numbers · Always open at the start of the week ·
**Darken non-working hours** (*"Visually dim the hours outside your work
schedule on the calendar grid"*) · **Save personal events quickly**
(*"Automatically save personal events without asking for confirmation"*).

**What she SAYS that no frame shows.** `[13:11]`–`[13:22]`: "MERE TASK GOOGLE
CALENDAR PE BHI JAA SAKTE HAIN — mere task jo hain woh yahan se Google
Calendar pe add honge, aur Google Calendar mein jitne bhi task mere add honge
woh mujhe yahan show ho jayenge." Two-way, both directions stated explicitly.
Rundesk's `calendar-sync` already does this; what is missing is the surface it
should appear on.

`[15:47]`–`[16:01]`: assigning a task prompts **"Add to Priorities"**, and the
priority then shows **on the calendar** — which is the join Rundesk does not
have. `user_priorities` exists from video 1 and lives nowhere near a calendar.

`[16:07]`–`[16:11]`: the task shows above the grid with **how much time is
left**, matching the tab header *"Work on dbgdh · 2h 55m left"*.

---

### V2-03 · The AI Notetaker joins meetings Rundesk is not in
**Ask** `[14:22]` *"AI NOTE TAKER aap chaho to add kar sakte ho, CALENDAR select
kar sakte ho — kis calendar par aap ko AI note taker chahiye"*.

**Frames** `12:35` and `14:25`: a bot that **joins an external meeting** —
*"AI Notetaker: bot will join this meeting when it starts, or you can send it
right now → Send Now"* — with per-calendar auto-scheduling, a **Display Name**
and **Join Message** ("Hey, I'm from the Leo Workspace here to record this and
take notes"), and note-content toggles for **Summary / Recording / Transcript**.

**Rundesk**: AI Notes exist *inside a Rundesk call* (§2.8, shipped and checked).
Nothing joins a Zoom/Meet/Teams call the user is holding elsewhere. Different
feature, same name.

`size: large` · needs a meeting-bot runtime; flag as a build-vs-buy decision

---

### V2-04 · Task provenance is never stamped
**Ask** `[03:26]` *"yeh TASK TYPES hain: MILESTONE, FORM RESPONSE, ya MEETING
NOTE se task create hue"* — the type says **where a task came from**.

**Frames** `03:25`: `Task (default) · Milestone · Form Response · Meeting Note`,
plus **"Fill with AI"** at the bottom of the picker.

**Rundesk**: task types are fully user-manageable (video 1 §1.1) but only
`Task` and `Milestone` are seeded (`DEFAULT_TASK_TYPES`). More to the point,
`taskTypeId` is **set nowhere** in the forms or meetings modules — Rundesk
*does* create tasks from form submissions (`forms.service.ts:119
createTaskForSubmission`) and from meeting notes (verify-release: *"Meeting
notes become tasks that name their meeting"*), and neither stamps a type. The
provenance exists in the data and is invisible in the UI.

`size: small` — two seeded types and two call-sites · `forms.service.ts`,
`meetings.service.ts`, `packages/db/src/seed.ts`

---

### V2-05 · The comment box is a fraction of what she shows
**Ask** `[04:14]`–`[06:02]`.

**Frames**, in order:
- `04:00` the **@ picker** spans **People | Tasks | Docs | Whiteboards |
  Locations | Channels**, offers **Brain** and **Agents → + Create Agent**, and
  flags a person who **"Does not have access to task"**
- `04:10`–`04:45` a **voice note** with a choice of **Voice note** vs
  **Transcribe** vs **Insert as text**, rendering as an inline player
- `04:50` a **"+" menu**: Slash commands · **Assign comment** · **Record a Video
  Clip** · Mention a task · Add a file · New Task · New Whiteboard · Add emoji ·
  Brain · New Doc
- `05:35`–`05:55` a recorded clip **embedded in the comment** with a player, and
  a **thread on that comment** with its own reply box

**Rundesk**: `MediaRecorder` appears only in `call-surface.tsx`,
`use-call-recording.ts` and `workspace-clips-page.tsx` — **not** in the chat or
task composer. Clips exist as a page (`presign` / `share`) but cannot be
recorded from a comment. The chat composer (`chat-composer.tsx`) offers
paperclip, emoji, mention and AI — no clip, no voice.

Gaps: voice note in a comment · transcribe · record-a-clip from the composer ·
@-mentioning non-people · warning that a mentioned person lacks access.

Her flagged defect is worth recording even though it is ClickUp's:
> `[04:26]` *"LEKIN ABHI YEH URDU KO HINDI MEIN LIKHTA HAI … back end se set
> down karni parti hai"* — frame `04:30` shows the transcript coming back in
> Devanagari. Whatever Rundesk builds must take a language, and Urdu must mean
> Urdu. Rundesk already ships an Urdu locale, so the trap is real and avoidable.

`size: large` · `chat-composer.tsx`, `task-detail-sheet.tsx`, `modules/clips`

---

### V2-06 · Creating a Space asks nothing
**Ask** `[06:30]`–`[08:10]`.

**Frames** `06:45`–`07:40`: name + icon, description, **Default permission
(`Full edit ▾`)**, Make Private → then **"Define your workflow"** with four
presets (**Starter · Marketing Teams · Project Management · Product +
Engineering**), each expanding into editable **Default views**, **Task
statuses** and **ClickApps**; a **Required views** panel (List/Board/Calendar/
Map/Activity/Team/Gantt/Mind Map/Table/Timeline/Workload); an **Enable
ClickApps** grid with a master "turn off all"; and after creation a bar offering
**Import · Statuses · Views · Automations · Custom Fields · from: `<another
space>`**.

**Rundesk**: spaces exist; `defaultPermission`, presets and ClickApps return
**nothing** from the schema or service. Folder creation *does* already carry the
right instinct — `Settings → Statuses → "Use Space statuses"` — so inheritance
is understood, just not offered at space level.

The ClickApps idea is the substantive one: **features toggleable per space**, so
a space that does not use time tracking does not show it.

`size: medium` · `modules/spaces`, space-create UI

---

#### V2-06 read off the frames, not off the paragraph above

The frames were re-extracted and read at `06:52`, `07:06`, `07:12` and `07:19`.
Four things they carry that the paragraph above does not:

**1. `06:52` — "Create a Space", step one.** Icon & name (a coloured letter
avatar beside the input) · Description *(optional)* · **Default permission** ⓘ
`Full edit ▾` · **Make Private** with the subtitle "Only you and invited members
have access" · footer **Use Templates** / **Continue**. Rundesk's space create
collects a name and nothing else.

**2. `07:06` — "Define your workflow", step two.** "Choose a pre-configured
solution or customize to your liking with advanced ClickApps, required views,
and task statuses." Four cards — **Starter** *(For everyday tasks)* ·
**Marketing Teams** *(Run effective campaigns)* · **Project Management** *(Plan,
manage, and execute projects)* · **Product + Engineering** *(Streamline your
product lifecycle)* — then **Customize defaults for `<preset>`** with three
expanding rows: **Default views** `List, Board` · **Task statuses**
`TO DO → IN PROGRESS → COMPLETE` · **ClickApps** `Tags, Time Estimates,
Priority, Time Tracking, Incomplete Warning, Custom Fields, Milest…`.

**3. `07:12` — "Default settings for views".** Tabs **Required views** /
**Default View Templates**. "Set up views that appear automatically in every
Space, Folder, or List — and can't be removed." Rows: **List** *(Required,
Default, locked on)* · Board · Calendar · Map · Activity · Team · Gantt ·
Mind Map · Table · Timeline · Workload, each a toggle, with **Mark as default
view** on hover. Rundesk's `spaces.viewConfig` already holds
`{ defaultView, enabledViews }` — the shape is right, the step is missing, and
nothing marks List as un-removable.

**4. `07:19` — "Enable ClickApps".** A master **Turn off all ClickApps**, then a
grid: Priority · Sprints · Email · Tags · Custom Fields · Multiple Assignees ·
Time Tracking · Time Estimates · Remap Subtask Due Dates · Work in Progress
Limits, plus **Show more**. **Sprints, Remap Subtask Due Dates and Work in
Progress Limits are greyed out** — this is `[07:20]`–`[07:24]`, "ClickUp Apps is
also dependent on that — ke aap ke paas PACKAGE PLAN kaun sa hai … Free mein of
course apna option LIMITED hota hai": plan-gated, and **shown greyed rather than
hidden**, the same teach-then-offer pattern as Team View and the export paywall.

**5. `[07:46]` — and the consequence nobody would guess from a screenshot.**
"Ab space ke baad jo hai, yeh LIST automatically generate kar deta hai ClickUp …
us base pe jo aap ne ooper di ho, ke haan mujhe marketing purpose ke liye
chahiye." **The preset seeds the space's first list**, so a new space is not
empty. That is what makes the purpose question worth asking, and it is the part
a UI-only reading of the frames would miss.

---

### V2-07 · Views are configurable; sharing and export are not
**Ask** `[09:16]`–`[11:57]`.

**Frames** `10:35` — the **Customize view** panel: Stack fields · Show empty
fields · Collapse empty columns · Fields · Filter · Group · Sort · Subtasks ·
Templates · **Autosave for me** (with a tooltip explaining it is per-user but
its saves are shared) · **Pin view · Private view · Protected view · Set as
default view** · **Copy link to view** · Favorite · **Export view** · Sharing &
Permissions. `11:40` — filters with **Add nested filter** and **Saved filters**.
`10:55` — export with **CSV | Excel**, *What to export* (visible columns / task
hierarchy / all columns), and date/time formats.

**Rundesk**: views carry `name, config, position, isDefault` only — no private,
protected, pinned, or per-view sharing. Export is **CSV only**
(`export.controller.ts:48 @Get('csv/tasks')`), with no column or format choice.
Saved searches exist but are not exposed as per-view **saved filters**, and
nested filter groups do not exist.

`size: medium` · `modules/views`, `modules/export`, list toolbar

**CLOSED** — `f8f1031`, `63c6a77`, `91fd444`, and the filter-panel commit that
follows them. What shipped, against the frames rather than against this
paragraph:

| Frame | Shipped |
|---|---|
| `10:58` File format `CSV \| Excel` | both; the .xlsx is written by `common/export/xlsx.ts` with no new dependency, and its inline-string cells cannot be read as formulas |
| `10:58` What to export | Visible columns / Task Names only / All columns. (The frame observations said "Task hierarchy info" for the middle one; the frame was re-extracted and read, and it says "Task Names only". That doc is corrected.) |
| `10:58` Date format / Time format | four date formats, three time formats, rendered in UTC and said so |
| `11:14` Show closed tasks · `11:41` Archived | two toolbar switches, and both reach the export — `includeArchived` was understood by the API and never once sent by the web |
| `10:36`/`11:14` Pin · Private · Protect · Set as default | columns on `task_views`, enforced in `ViewsService`, which previously had **no** ownership check at all: any member could delete any view |
| `10:36`/`11:14` Autosave for me | `task_view_prefs`, keyed by (view, user) — per person, as its own tooltip says |
| `10:36`/`11:14` Copy link to view | the list route takes `?view=<id>` |
| `10:36`/`11:14` Sharing & Permissions | `view` added to the share machinery — object type, ancestor chain, shared-with-me resolver |
| `11:41` Add nested filter | one level of brackets with their own AND/OR, evaluated in `lib/task-filters.ts` |
| `11:41` Saved filters | `list_filter_presets`, per list per user |
| `11:41` the field list | Status · Tags · Due date · Priority · Assignee · Created by · Date closed · Date created, plus custom fields |
| `11:28` Assignee | a toolbar chip writing into the same set the column funnel uses |

**Deliberately NOT built**, so the next pass does not go looking for it:
*Favorite* (frame shows a submenu with a chevron; the video never opens it, so
there is no behaviour to build against), *Assigned comment* as a filter field
(Rundesk has no comment assignment, so the field would match nothing), and the
*export paywall* of frame `11:00` (Rundesk has no Business tier gating list
exports, and adding one to imitate a screenshot would be removing a feature).

---

### V2-08 · Half the task menu is missing
**Frames** `15:25` — `Copy link | Copy ID | New tab`, then Favorite ·
Unfollow · Remind me in Inbox · Move to · Add to · **Merge** · Duplicate ·
**Convert to** · Custom Fields · Templates · Relationships · **Description
history** · Task Type · **Print** · **Send email to task** · Archive · Delete ·
Sharing & Permissions.

**Rundesk**: `duplicate` exists in `tasks.service.ts`. **Merge** has no endpoint
(the only hit is an unrelated test fixture). **Convert to** does not exist (the
`convert` hit is a comment about DTOs). **Description history** does not exist —
only *docs* have revisions (`schema/docs.ts`). **Print** has no print
stylesheet. Email-into-task exists as a module but is not offered from the menu.

`size: medium`, and separable — Merge and Description history are the real work

---

### V2-09 · Cover images, and attachments before a task exists
**Frames** `01:05`–`01:10`: a file is attached **in the create modal, before the
task exists**. `03:05`–`03:20`: a **cover picker** with **Gallery (8 colours +
Custom) | Upload | Link ("paste image link", works with any image on the web) |
Search | Attachments (reuse a file already on the task) | Remove**, and the
banner then offers **Reposition** and **Change cover**.

**Rundesk**: `tasks.cover_color` exists — *"a CSS color/gradient string"*. So
the colour half of the Gallery tab is built and the other five tabs are not.
Attachment-before-create needs the same staged-upload trick the chat composer
already uses for `pendingAttachments`.

`size: small` · `schema/tasks.ts`, `task-detail-sheet.tsx`, `quick-create-modal.tsx`

---

### V2-10 · Related Items is two things, and Rundesk has one
**Ask** `[06:04]` *"aap task ko kisi aur task ke saath LINK kar sakte ho — yeh
RELATIONSHIP se hoga; woh koi bhi document hai, kuch bhi."*

**Frames** `06:10`: a Related Items panel with **two tabs — Relationships and
References** — and the empty state *"Link related Tasks **or Docs**"*.

**Rundesk**: `task_dependencies` covers task→task (`blocks`/`blocked_by`). A
task cannot be related to a **doc**, and there is no distinction between a
*dependency* (blocks work) and a *reference* (just see also) — which is exactly
what ClickUp's two tabs separate.

`size: small` · `schema/dependencies.ts` or a new `task_references`

---

### V2-11 · AI: the picker is fine, the surface around it is not
**Ask** `[16:21]`–`[20:47]`.

**Rundesk already has** a model picker with tiers and one-line hints
(`model-tiers.ts` + `ai-panel.tsx:451`) — the design intent matches ClickUp's
hover cards almost exactly. **Do not re-report it.**

What the frames show that Rundesk lacks:
- **Multiple providers.** `[17:16]` *"ChatGPT … Gemini … Show More … CLAUDE"*.
  Rundesk's two tiers are both Claude. Frame `17:15` lists seven models with
  **Speed / Intelligence** bars per model.
- **Agents as first-class actors.** `15:45` shows **Agents** in the *assignee*
  picker and **+ Create Agent**; `19:00` meters **Autopilot Agents** and **Super
  Agents** separately. Rundesk has Skills (memory + connections) but nothing
  assignable — no `assignee` anywhere in `modules/skills`.
- **AI analytics.** `18:50`: **Time Saved**, **Human Cost Savings** (an editable
  **$/hour**), and an actions-completed grid; `19:00`: **credits by category**
  with a usage trend and a limit line; `19:10`: an agent-run **audit log**
  filterable by date/status/agent. Rundesk has `usageSummary` and no surface.
- **Connections / MCP.** `19:05`: an App Center with ~12 connectors *and*
  **"Connect Custom MCP Servers — give AI access to any tool or data source"**.
- Two things worth stealing outright: the AI says **"No changes made."** when it
  cannot act, and offers **Follow ups** that chain into other features
  ("Block focus time to clear the onboarding backlog").

`size: large`, and mostly product decisions rather than plumbing

---

### V2-12 · Teams Hub
**Ask** `[20:53]`–`[21:20]`, cut short by time (*"AI par abhi ruk jayein"*).

**Frames** `20:55`: a Teams Hub at `/teams-pulse/teams` with **All Teams · All
People · Org Chart · Analytics · My Teams**, and previews showing each member
with their current work.

**Rundesk**: `workspace_groups` + `workspace_group_members` exist and video 1
surfaced a person's own reporting line — explicitly *"not the whole tree"*
(`person-panel.tsx:680`). No teams hub, no org chart surface, no per-team
analytics.

Because she ran out of time here, this is the one section where the video
under-specifies; treat the frames as the brief and confirm before building.

`size: medium`

---

### V2-13 · Smaller things the frames show and the transcript does not
| | Frame | Note |
|---|---|---|
| Import breadth | `12:05` | Asana, Basecamp, Confluence, Jira, Monday, Notion, Slack, Todoist, Trello, Wrike + spreadsheet/document. Rundesk imports **ClickUp only** (CSV + API token) — arguably the right priority, but named here for completeness |
| Template Center | `12:10` | A browsable modal separating **Workspace Templates** (yours) from **ClickUp Templates** (stock), filtered by type and **complexity**. Rundesk has templates; it has no gallery |
| Undo on destructive actions | `09:10` | *"List moved to trash"* **+ Undo (Ctrl+Z)**. Rundesk has Trash with restore; the toast does not offer undo |
| Paywalls that teach | `09:25`, `11:00` | The locked feature is explained, previewed, and routed to **"Contact your admin"**. Rundesk's §2.8d already does the "explains itself" half — the *preview* and *who to ask* halves are missing |
| Skeletons | `08:30` | ClickUp draws skeletons on list load — the §2.9a principle Rundesk already adopted |

---

## 3. Suggested order

1. **V2-04** task provenance — small, and makes two existing features legible
2. **V2-09** cover + attach-before-create — small, visible, self-contained
3. **V2-10** references vs dependencies — small
4. **V2-01** custom fields — large but the opening subject; `Progress (Auto)`
   first, since that is the one she demonstrates
5. **V2-07** view sharing + Excel export
6. **V2-06** space creation with presets and per-space feature toggles
7. **V2-02** the Planner — the biggest single block, and it settles the
   task-destination question left open in video 1
8. **V2-05** the comment composer
9. **V2-08** merge / convert / description history
10. **V2-11**, **V2-12**, **V2-03** — product decisions first, then build

## 4. Confidence

Every "Rundesk lacks X" above was checked in the code, and several candidates
were **dropped** after checking: checklists with per-item assignees, per-space
status workflows, the AI model picker, the slash menu on the description,
two-way calendar sync, saved searches, and save-as-template all exist. Six
false gaps have been produced in this engagement by trusting a single grep;
these are what a second look removed.

Two claims are deliberately weaker than the rest and are marked in place:
**V2-12** (she ran out of time, so the frames are thin) and the **Notetaker**
half of **V2-03** (a build-vs-buy call, not a coding task).
