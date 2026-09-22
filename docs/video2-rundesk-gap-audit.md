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

**Frames** `00:20`/`00:40` show a **searchable field-type picker**. The two
shots hold 16 rows each and overlap on Progress (Auto) · Email · Phone, so what
the transcription records is 29 rows, listed here in the order they appear:
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

#### V2-01 — what was built, and how this item was nearly missed

**IT WAS UNTRACKED, and that is the first thing to record.** Nine other V2
items were closed while this one — *the subject the video opens with* — had no
task against it at all. It surfaced only when the audit doc was read back to
check what remained, and the doc's own "what was built" sections turned out to
be an unreliable index: three items had them, nine did not. The status was
re-derived from the code instead, which is what should have happened from the
start.

**V2-01b — Progress (Auto), gap 2, the one she demonstrates.** Frame `00:25` is
the whole specification and all three inputs already existed unread:
`tasks.parent_task_id`, `task_checklist_items.is_done`, and
`task_comments.assigned_to_user_id` with `resolved_at`.

**THE VALUE IS DERIVED, NEVER STORED.** `getValuesForTask` computes it on read
and `setValue` REFUSES the write — refusing rather than accepting-and-ignoring,
because a caller told "saved" would believe it. Nothing is ever written to
`custom_field_values` for this type, and the suite asserts the table stays
empty.

Two decisions worth naming, both break-tested:

  · **Every item weighs the same**, whichever source it came from. Averaging the
    three sources' percentages lets one checklist item outweigh fifteen
    subtasks.
  · **Nothing to count reports null, not zero.** "0%" claims none of the work is
    done, and on a task with no subtasks, no checklist and no assigned comments
    there is no work to claim it about. The frame's own second setting is the
    single exception: a done task with nothing to count reads 100%.

`0142_progress_auto_field.sql` adds the enum value and a `config` column —
separate from `options`, which is typed as an array and read as one everywhere.

**V2-01a — the field made while the task is, gap 1.** `[00:16]` is the point:
she needs somewhere to put something *while describing the work*, not later in
a settings page she would have to go and find. `+ Create new field` is now in
the create modal, gated on a project being chosen because that is what a field
belongs to. It creates the DEFINITION — a value cannot be set before the task
exists to hang it on — and typed choices ("High, Low") become real options,
because a field defined without them is unusable in a way that looks identical
to working until somebody opens the task.

**V2-01c — the types that are storage plus a renderer, gap 3.** Six of them:
`long_text`, `labels`, `people`, `location`, `tshirt_size`, `progress_manual`.
Two carry a rule worth stating:

  · **T-shirt Size is a FIXED set.** `dropdown` already covers "one of this
    field's options"; if the sizes varied per field the type would be a
    dropdown with a different name, so the API refuses anything but XS–XL.
  · **A People field cannot name somebody who is not in the workspace.**
    Without that check it stores any uuid at all — including a member of a
    workspace this one cannot see — and the renderer then draws a stranger or a
    blank. A field that can name somebody who is not here is a small
    information leak wearing a text box.

`labels` and `people` hold several at once, which is the whole difference from
a dropdown, so the stored value widened to admit `string[]`. An unset list
comes back as `[]` rather than null, so no reader has to treat "none yet" and
"cleared" as two states that mean the same thing. `task_templates` widened too
— a template that silently dropped a task's people field would restore a task
that looks complete and is not.

**NOT BUILT, and said plainly rather than quietly skipped.** The list is in
`docs/video2-reaudit.md` §4's field-types row and is not repeated here, because
this paragraph used to repeat it and went stale: it named **Files**, **Voting**
and **Formula** as features wearing a type's clothing, and all three were built
afterwards — Files and Voting in `0145`, Formula with Tasks and Signature in
`0158`, the last three closed by `custom-field-types.mjs` at 32 checks with
every one of its 32 patches reddening the check it names. It also said
"seventeen of the frame's twenty-nine", where **19** of those 29 are now built
and the 10 that are not are named there with a reason each. Rundesk holds 22
types in all — the 19 plus **text**, **dropdown** and **date**, which the
frames' transcription does not name.

Two documents holding one count is the duplicated list, and the copy nobody
re-derives is the one that rots. The ten that remain are recorded there with a
reason each — eight need a language model and `ANTHROPIC_API_KEY` is empty here
and in CI, **Relationship** would be a second store for what `task_doc_links`
already holds, and **Button** stores no value at all with no manual trigger to
wire it to.

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

### V2-14 · One Google account, for the whole workspace
**Ask** `[13:26]`–`[13:38]`, and frames `13:40` / `13:50`.

> `[13:32]` "**Manage Account** pe click karoongi
> `[13:36]` to yahan bhi aap ko **Add Account** [ka option] kehta hai ke aur
> Google Calendar bhi add kar lo,
> `[13:38]` aur **jitna chahoon main add kar sakti hoon**. Theek hai — it's up
> to me."

**Frame `13:50`, the Calendar settings → Accounts page**, read in full:

| | |
| --- | --- |
| account card | `hanixh343@gmail.com` · Google Calendar · ✅ **Connected**, with a `…` menu |
| | **+ Add account** |
| **Default calendar** | "Select the calendar that will be used as the default calendar" → a picker |
| **Busy calendars** | "These calendars decide when you're busy. We plan work and suggest free slots around them." → a multi-select, reading **"1 calendar"** |
| **Conferencing** | "Connect other video conferencing providers" → **Zoom · Connect** |

Frame `13:40` catches the Google account chooser mid-flow, offering two signed-in
accounts and "Use another account" — so the second account is a second OAuth
grant, not a second calendar inside one grant.

**THIS IS WHAT "PRIMARY AND SECONDARY" MEANS**, and the two roles are different
in kind rather than in rank. The **Default calendar** is where new events are
WRITTEN. The **Busy calendars** are READ, to work out when you are free. A
person with a work account and a personal one wants their work calendar as the
default and BOTH counted as busy — which is precisely why one setting is a
single-select and the other is not.

**Rundesk holds exactly one, for the entire workspace.** Checked, not assumed:

```
unique('uq_workspace_integration_workspace_provider').on(t.workspaceId, t.provider)
```

and `requireConnection(workspaceId, provider)` selects it with `.limit(1)`. So:

1. **A second Google account cannot be added at all** — the unique constraint
   refuses the row. There is no "Add account" to build a UI for yet.
2. **It is scoped to the WORKSPACE, not the person.** This is the deeper of the
   two. ClickUp's is a personal setting inside your own Planner; Rundesk's is a
   workspace integration with a `connected_by_id`, so it is not one calendar
   each — it is one calendar for everybody, connected by whoever got there
   first. Multi-account is therefore not a matter of relaxing a constraint; the
   ownership model has to move to the user first.
3. **No default-calendar concept** and **no busy-calendars concept** exist.
   `metadata.inboxListId` decides which LIST pulled events land in — the
   opposite direction, and not the same idea.
4. **No conferencing-provider connection.** Zoom appears twice in the frames —
   here under Conferencing, and again on the AI Notetaker page under
   Integrations — which suggests one connection surfaced in both places.

**And it bears on §V2-02e, already shipped.** "Meet with" suggests free slots
from Rundesk's own meetings. Once external calendars are connected, *"these
calendars decide when you're busy"* is the whole point: a colleague blocked out
in their own Google Calendar currently reads as free.

`size: large`, and the per-user move is the load-bearing part · `modules/calendar-sync`,
`schema/integration-connections.ts`

#### V2-14 — what was built, what is unexercised, and what is deliberately not

**The eviction was worse than "only one".** The OAuth callback UPSERTS on
`(workspace_id, provider)`, so connecting a second Google account never *failed*
— it silently REPLACED the first, orphaning that account's `task_calendar_links`.
The first check in `test/e2e/calendar-accounts.mjs` demonstrates this against the
real table rather than describing it, so the premise stays on the record.

**a — the ownership moved to the person.** `0141_user_calendar_accounts.sql`
adds `user_calendar_accounts`, unique on
`(user_id, workspace_id, provider, external_account_id)` — so re-connecting the
same account refreshes it and a *different* account is a new row. `isDefault`
(where events are written, at most one, enforced by a PARTIAL UNIQUE INDEX so a
future endpoint that forgets to clear the old one fails loudly) and
`countsAsBusy` (read for availability, any number). Existing workspace grants
for gcal/outlook are copied to their `connected_by_id` owner by the migration.
Tokens are projected out through `PUBLIC_CALENDAR_ACCOUNT_COLUMNS`, and every
lookup is `(id AND userId)` with a **404**, not a 403, on somebody else's row.

**b — the Accounts page**, a fourth page in Planner settings, with per-row
"New events go here" / "Counts as busy" and an "+ Add account" link into the
existing OAuth flow, because there should be one place that talks to Google.

**c — the busy half, which is what makes §V2-02e honest.** `GET
people/:userId/calendar` now returns `busy`: Rundesk's own meetings UNIONED with
the external calendars that person marked as counting, merged so touching
windows join and no free minute is offered at a seam that does not exist. The
planner draws that union.

**THE PRIVACY RULE IS STRUCTURAL.** A busy window is `{startsAt, endsAt,
source}` and the type has no field for a title, so no call site can leak one by
forgetting; Google is asked via `freeBusy` rather than the events list precisely
because freeBusy returns start/end pairs and no summaries, so the titles of
somebody's personal appointments never enter the process. Rundesk's own meeting
names are still shown, looked up client-side from the separate `meetings` list —
what the workspace can explain stays readable, what it cannot stays opaque.

**What is NOT exercised, said plainly.** There are no Google credentials in this
environment, so no check reaches Google. Covered instead: which accounts get
asked, what a window may contain, how windows merge, that a revoked token costs
its own busy time and not the panel, and that the page reads the merged list
rather than the old field — the last one proved with two *overlapping* fixtures,
because counting blocks or reading tooltips both pass on the code this replaces.

**Deliberately out of scope.** `pushTask` still mirrors into the workspace
connection. Which person's calendar a *task* belongs in is a product question
the video never answers, and guessing it would write events into somebody's
personal calendar on the strength of an inference.

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

---

#### V2-05 read off the frames, with one correction and one good surprise

Frames `04:16` and `04:56` re-extracted and read before writing any code.

**1. CORRECTION — "Insert as text" is not a third option.** The bullet above
says the voice note offers *"Voice note vs Transcribe vs Insert as text"*.
Frame `04:16` shows **two buttons** — `Voice note` and `Transcribe` — with
"Insert as text" rendered as the dark **tooltip above Transcribe**, the cursor
resting on it. It is the explanation of what Transcribe does, not a third
choice. Building three buttons from that summary would have invented one.

**2. The "+" menu of frame `04:56` matches the bullet exactly**: Slash commands
`/` · Assign comment · **Record a Video Clip** · Mention a task `@@` · Add a
file · New Task · New Whiteboard · Add emoji · Brain `@Brain` · New Doc. The
composer beneath it carries the recorded clip's play button, a `Comment ▾`
selector, `…`, a mic, and a split send button.

**3. What she says that the frames do not show.** `[04:43]` a voice note can be
**downloaded and sent to anyone**, and one can be **uploaded** into a comment.
`[05:26]`–`[05:38]` a clip is uploaded, its **link copied and pasted into the
comment**, and it renders there. `[05:42]`–`[05:47]` it is visible to anybody
you send it to, **even outside the space**. `[05:47]`–`[05:55]` **Reply on a
comment opens a THREAD**, "jis tarah maine aap ko chat mein dikhaya tha".
`[05:57]`–`[05:59]` a comment can be **assigned** and **saved**, "same like
messages".

**4. THE GOOD SURPRISE — her flagged defect is already solved here.**
`apps/web/src/lib/use-speech-recognition.ts` already carries
`localeToSpeechLang()`, an exhaustive `Record<Locale, string>` mapping
`en→en-US, es→es-ES, ar→ar-SA, **ur→ur-PK**`, typed so that adding an app
locale without a speech mapping is a compile error, and unit-tested with an
explicit `localeToSpeechLang('ur') === 'ur-PK'` assertion. Transcription in
Rundesk is browser-side (Web Speech), so the language is ours to set and it is
already set correctly.

It is wired into `ai-panel.tsx` and `workspace-ai-page.tsx` and **nowhere
else**. So the Urdu trap is not something V2-05 must solve — it is something
V2-05 must not lose by transcribing in the composer some other way.

**5. SECOND CORRECTION — three of the five gaps above are not gaps.** Read
before building, against the code rather than against this document, and the
scope collapsed by more than half:

| Claimed gap | Actual state |
| --- | --- |
| comment **threads** — "a schema that exists and a UI that does not" | **Built.** `CommentsPanel` splits `roots` from `repliesByParent`, renders replies nested under their parent with their own Reply/Edit/Delete/react row, shows a "N replies" count, and the composer carries a "Replying to …" strip with a cancel. |
| **Assign comment** — "which task comments lack" | **Built.** `task_comments.assigned_to_user_id` has existed since migration `0006`, `POST /tasks/:id/comments/:commentId/assign` is live, and the comment row carries a member picker plus an "Assigned to X" badge. |
| resolve a comment | **Built.** `resolved_at` + `resolved_by_user_id`, a `…/resolve` endpoint, and a Resolve/Reopen button with a "Resolved by X" badge. |
| **@-mentioning non-people** | **Partly built.** The picker already has **People · Tasks · Docs** tabs with their own queries. Whiteboards, Locations, Channels, Brain and Agents are absent — and of those, only Channels and Docs point at things Rundesk has. |

The earlier paragraph said "chat has `chat_message_assignments`, which task
comments lack". That is the mistake this audit was written to stop making: two
tables solving the same problem in different modules, and I read the one and
concluded the other was missing rather than opening it.

**So what is actually missing is the recording half**, which is the half the
frames spend the most time on:

1. **Voice note** in a task comment, with the two-button choice of frame `04:16`.
2. **Transcribe**, which must go through `localeToSpeechLang()` — see (4).
3. **Record a Video Clip** from the composer, embedded with a player (`05:35`).
4. The **"Does not have access to task"** flag on a mentioned person (`04:00`).

`MediaRecorder` is already wrapped in `lib/call-recording.ts` +
`use-call-recording.ts`, but both are shaped around a *call* — a mixed stream
elected across participants — so the composer needs its own recorder rather
than a parameter on that one.

`size: medium` (was `large`) · `task-detail-sheet.tsx`, `lib/call-recording.ts`

---

#### V2-05 — what was built, and the one place it deviates from the frame

**Built.** `lib/composer-recording.ts` (the decisions, unit-tested),
`components/comment-recorder.tsx` (the mic, the clip, the timer, the strip),
`modules/tasks/mention-access.ts` + `GET /tasks/:id/comments/mention-candidates`
(the access flag), and `test/e2e/comment-recording.mjs` — 31 checks.

**The deviation: there is no "+" menu.** Frame `04:56` puts `Record a Video
Clip` third in a menu of ten. Nine of the other items are things Rundesk either
already has somewhere the composer can reach or does not have at all —
`Assign comment` is on every comment row, `Mention a task` is the picker's Tasks
tab, `Add a file` is Attach, `Add emoji` is the reaction row, and New
Whiteboard / New Doc / Brain / Agents have no home here. Building the menu would
have meant nine entries of which five did nothing, which is the facade this
audit keeps finding. So the two capabilities the frame demonstrates — voice note
and video clip — are direct controls on the composer instead. **The capability
is there; the menu is not.** Say so and it gets built.

**The transcription is live, not after the fact.** Web Speech listens to a
microphone and cannot be handed a finished file, so the recorder captures audio
and words at the same time and the strip afterwards is the person choosing which
to keep. The alternative was uploading private voice notes to a transcription
service, which is a bigger product decision than this item.

**A bug found on the way, and fixed.** The account's saved language was never
being applied — `I18nProvider` adopted it only `if (accessToken)`, and the auth
store deliberately stopped persisting tokens when the session moved to an
httpOnly cookie. The guard was false on every page load, so a person who chose
Urdu got English, silently, everywhere. Fixed to `isAuthenticated()`, plus a
subscription so signing in adopts it without a reload. Picking a language never
saved to the account either, for the same reason. This blocked V2-05: the
recognizer's language comes from the app locale, and the app locale never
followed the account.

**Still open from this item:** `@`-mentioning Whiteboards, Locations and
Channels (of those, only Channels points at something Rundesk has); a voice note
uploaded from a file rather than recorded (`[04:43]`); and a clip whose link is
pasted into a comment and renders there (`[05:26]`–`[05:38]`).

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

#### V2-08 read off the frame AND the transcript, with four corrections

Frames re-extracted at `15:20`, `15:25`, `15:32`, `15:40`, `15:48` and the
transcript read for the same window, before writing any code.

**1. The menu, exactly as frame `15:32` draws it**, top to bottom:

| | |
| --- | --- |
| header row | Copy link · Copy ID · New tab |
| | Favorite › · Unfollow task · Remind me in Inbox › |
| | Move to · Add to › · Merge · Duplicate · Convert to › · Custom Fields · Templates › |
| | Relationships › · Description history · Task Type › |
| | Print · Send email to task |
| | Archive · Delete |
| footer | **Sharing & Permissions** — a dark bar, not a menu row |

Seven items carry a `›` submenu chevron: Favorite, Remind me in Inbox, Add to,
Convert to, Templates, Relationships, Task Type. Move to, Custom Fields and
Description history do not — they open a dialog or a panel.

**2. CORRECTION — the bullet above misreads two of them.** It says "Unfollow"
where the frame says **"Unfollow task"**, and it lists Sharing & Permissions as
the last flat item where the frame renders it as a **separated dark footer
button**, the same shape as the space wizard's footer.

**3. CORRECTION — she narrates FIVE items, and Merge is not one of them.** The
paragraph above calls "Merge and Description history the real work". The
transcript says otherwise:

> `[15:22]` "yeh ek to **FAVOURITE** ka [hai], kis ko aap favourite kar lo"
> `[15:27]` "yahan par aap ko **HISTORY** wagera sab cheezein show hoti hain"
> `[15:32]` "Aap task ko **PRINT** bhi kar sakte hain — yeh maine aap ko batayi
> nahi hai; [chalo] dekh lo ke yahan par aap task ko print kar sakte ho"
> `[15:38]` "aur task ko **CONVERT** bhi kar sakte ho. Theek hai — kisi aur
> cheez mein."
> `[15:41]` "aur aap **fields** wagera kuch bhi jo hai woh aap chaho to is mein
> add kar sakte ho"

So the ask, in her order of emphasis, is **Description history · Print ·
Convert to · Custom Fields · Favorite**. Merge and Send email to task are in
the frame and never spoken. That reorders the work: Merge is the largest job in
the item and the least asked for.

**4. `Convert to` has no stated target.** "kisi aur cheez mein" — into
something else. She never opens the submenu, so what it converts INTO is not
specified anywhere in the video, and inventing a list of targets would be
building from a guess. The defensible reading is the conversion Rundesk's own
schema already supports: a task ↔ a subtask of another task, which is
`parentTaskId` and nothing more.

**What Rundesk actually has**, checked rather than assumed: Favorite is a
header star (`FavoriteStar`), Custom Fields is a working panel, Duplicate is
wired through `task-templates/duplicate/:id` (not `tasks.service` as the bullet
says), Archive/Delete/Move to/Sharing exist as header icons. **Description
history does not exist at all** — `grep -r task_revisions` returns nothing, and
only docs have revisions. Print has no stylesheet: the app's single
`@media print` rule is on the reports page. Merge has no endpoint. Email-to-task
exists as a module with `list_email_aliases`, but it is addressed at a LIST, so
"Send email to task" is a different address than the one that exists.

**And there is no overflow menu.** Rundesk's task header is a row of eleven
icon buttons. The frame is a menu precisely because there are more actions than
a toolbar holds, so the missing capabilities get a `…` menu rather than icons
twelve through eighteen — and the existing eleven stay where they are, because
moving them would break every suite that clicks them and buy nothing.

---

#### V2-08 — what was built, and one thing deliberately not

**Built.** `task_description_revisions` (migration `0138`) with a
read-and-restore dialog; a printable document and its print rules; a `…` menu
carrying Copy link · Copy ID · New tab · Convert to · Merge · Send email to
task; `POST /tasks/:id/merge` with `task-merge.ts` holding the pure rules; and
two suites — `test/e2e/task-menu.mjs` (37 checks) and `test/e2e/task-merge.mjs`
(25).

**The eleven header icons were left alone.** The frame puts everything in one
menu. Moving Move-to, Watchers, Share, Private, Milestone, Reminder, Favorite,
Expand and Save-as-template into it would touch every browser suite that clicks
them by testid, for no change a person can see. The menu carries the actions
that had **no home at all**, which is the actual gap. Say the word and the rest
follow them in.

**Description history diverges from `doc_revisions` on purpose** — it stores the
text that was REPLACED. See the migration's own comment for why; the short
version is that the other design destroys every description written before the
feature shipped, on that description's first edit.

**Merge is not transactional**, and that is a stated compromise rather than an
oversight. The moves are a dozen `UPDATE … SET task_id` statements; a failure
part-way leaves work split across two tasks, both still readable, nothing
deleted, and the merge re-runnable. The source is binned last. If merge ever
gains a delete, it gains a transaction in the same commit.

**Still open from this item:** the frame's submenus — Favorite ›, Remind me in
Inbox ›, Add to ›, Templates ›, Relationships ›, Task Type › — all point at
things Rundesk already has elsewhere, so they are menu plumbing rather than
capability. And `Convert to` currently converts one way only (task → subtask);
what else it should convert into is not specified anywhere in the video.

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

#### V2-11 read off the frames and against the code, with three corrections

Frames `17:15`, `18:50`, `19:00`, `19:05` re-extracted; the transcript read for
`[18:42]`–`[19:18]`.

**1. CORRECTION — frame `18:50` is not the analytics page.** The bullet above
attributes "Time Saved, Human Cost Savings" to `18:50`. That frame is the Brain
chat at `/ai/brain`, and what it actually shows is **Follow ups** — three
chained suggestions under a completed answer ("Add custom fields for priority
and effort", "Create a workload view grouped by assignee", "Move matching tasks
into ddddd") — plus two rings in the left rail: **13 Brain AI uses** and **500
Credits left**. She reaches Analytics at `[18:49]`, and the analytics frames are
`19:00` and `19:05`.

**2. CORRECTION — "Rundesk has `usageSummary` and no surface" is false.**
`GET /ai/usage` is rendered by `AiUsageTab` in `workspace-settings-page.tsx`,
under §A4.4/§A6.8, with cost / calls / input tokens / output tokens, a per-user
table, a per-model table and 7/30/90-day ranges. Checking beat trusting for the
seventh time in this audit.

**3. So the analytics gap is a FRAMING gap, not a missing screen.** Read the two
side by side and the difference is the whole point:

| ClickUp `19:00`–`19:05` | Rundesk today |
| --- | --- |
| three tabs: **Analytics · Credits Usage · Activity** | one settings tab |
| **Time Saved**, **Human Cost Savings** at an editable $/hour, with **Edit benchmark** | cost in dollars only |
| credits, a usage trend, **Add credits** | dollars, no credit concept |
| an **Activity** log filtered by **Date run · Status · My agents · Agent**, with a "No activity found … Clear filters" empty state | no per-run log at all |

Rundesk answers "what did AI cost". The frames answer "what did AI save" — and
that is the question a person renewing a subscription actually asks.

**What that means for building, and one thing deliberately not built.** Time
saved cannot be measured, only estimated from a per-action benchmark; ClickUp
says so out loud with **Edit benchmark**. So the benchmark is the workspace's to
set and the figure is shown as derived from it, never as a measurement. And
**credits are not built**: Rundesk bills in dollars, and minting a fictional
in-app currency to mirror a competitor's packaging would invent a product
concept nobody asked for.

**Also confirmed by the frames, and cheap:** the Activity empty state offers
**Clear filters** — an empty list with filters applied must say the filters are
why, which is a rule worth applying wherever Rundesk filters a list.

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

#### V2-12 read off the frame, and against the schema

**1. Frame `20:55` is a FLYOUT, not a hub page.** Hovering the Teams rail icon
opens: **All Teams · All People** (badge: 2) **· Org Chart · Analytics**, a rule,
then **My Teams** with the empty state *"Once you are added to a Team you will
see it here"*. The status bar shows where it goes — `/teams-pulse`. She never
opens any of the four, and the transcript is why: `[20:58]` "aap ko show nahi ho
raha ke TEAM nahi hai?", `[21:05]` "yeh AI par ruk jayein". **So the video
specifies the NAV and none of the destinations.**

**2. CORRECTION — "previews showing each member with their current work" is not
in this frame.** The bullet above says so; what the frame shows under My Teams
is an empty-state card and nothing else.

**3. But the schema says four of the five are buildable from real data**, which
is a better answer than "confirm before building":

| Destination | What Rundesk already has |
| --- | --- |
| All Teams | `workspace_groups` + `workspace_group_members`, full CRUD API |
| All People | `workspace_members`, already listed everywhere |
| My Teams | the same groups, filtered to the caller — and the frame gives its empty state verbatim |
| **Org Chart** | `workspace_members.manager_id`, with an index. Video 1 surfaced a person's OWN line and said explicitly "not the whole tree" — the tree is the missing surface, not the missing data |
| Analytics | **nothing.** No per-team aggregate exists, and the frame never opens it |

So the honest split is: build the four whose contents are determined by data
that already exists, and leave **Analytics** out rather than inventing what a
team's analytics are. A nav item that opens a page somebody has to guess the
purpose of is the facade this audit keeps removing.

**4. And teams are currently ADMIN furniture.** `GroupsTab` lives in workspace
settings, which is where you go to *administer* teams. Nowhere in the product do
you go to *look at* them. That is the gap, and it is why the frame is a rail
destination rather than a settings tab.

**5. AND IT IS SHARPER THAN THAT — checked, not assumed.** Two more things were
already built: `MembersTab` is All People, and `ReportingTree` in the same file
is the Org Chart, drawing the full tree from `manager_id` and already handling
people whose manager is missing and cycles. So THREE of the four destinations
existed.

What none of them are is reachable. `app.$workspaceId.settings.tsx` does
`if (!getWorkspaceRole(workspaceId).isAdmin) throw redirect({ to: '/app' })` —
the whole settings route turns a non-admin away. **So looking at your own
organisation required admin rights**: an ordinary member could not see who was
on which team, or who reported to whom, anywhere in the product.

The APIs were never the problem. `GET /workspaces/:id/groups` and `…/members`
both sit behind `WorkspaceMemberGuard`, with `WorkspaceAdminGuard` only on the
mutations. **The gate was the web route and nothing else.**

That turns V2-12 from "build four screens" into "make three that exist
reachable, and do not build the fourth" — and building the four would have
duplicated three, including the orphan-and-cycle handling in the tree, which is
exactly the code a second copy gets subtly wrong. `ReportingTree` was extracted
to `components/reporting-tree.tsx` and is now used by both.

`size: small` (was `medium`)

---

### V2-13 · Smaller things the frames show and the transcript does not
| | Frame | Note |
|---|---|---|
| Import breadth | `12:05` | Asana, Basecamp, Confluence, Jira, Monday, Notion, Slack, Todoist, Trello, Wrike + spreadsheet/document. Rundesk imports **ClickUp only** (CSV + API token) — arguably the right priority, but named here for completeness |
| Template Center | `12:10` | A browsable modal separating **Workspace Templates** (yours) from **ClickUp Templates** (stock), filtered by type and **complexity**. Rundesk has templates; it has no gallery |
| Undo on destructive actions | `09:10` | *"List moved to trash"* **+ Undo (Ctrl+Z)**. Rundesk has Trash with restore; the toast does not offer undo |
| Paywalls that teach | `09:25`, `11:00` | The locked feature is explained, previewed, and routed to **"Contact your admin"**. Rundesk's §2.8d already does the "explains itself" half — the *preview* and *who to ask* halves are missing |
| Skeletons | `08:30` | ClickUp draws skeletons on list load — the §2.9a principle Rundesk already adopted |

#### V2-13 — what was built, and two rows of this table that were wrong

**Undo on destructive actions — REAL, and now built.** Deleting a list, project
or space from the tree succeeded in **silence**: no toast, nothing to press, and
`window.alert` only on failure. Trash and restore both existed; reaching them
meant knowing that Trash is a settings tab, going there, and finding the row.
The frame offers the way back in the second after the mistake, which is the
only second in which it is easy.

The deletes are SOFT — `isArchived`/`archivedAt` — which is the only reason an
undo can exist, and the suite demonstrates that first so a future hard delete
fails loudly rather than turning the button into an apology. Ctrl+Z is wired
too, guarded exactly like the existing Cmd+\ so it never steals undo from a
text box, and the offer expires with the toast: the shortcut means "undo what I
just did", and a stale one is worse than none.

**Paywalls that teach — HALF WRONG.** The table said the *preview* and
*who-to-ask* halves were both missing. **"Contact your admin" was already
built** — `feature-gate.tsx` not only offers it but really notifies the admins
and reports honestly when nobody was reached. Only the preview was absent, and
it is now a list of what the feature actually does rather than a mocked-up
screenshot: an invented picture would depict something that may not match what
ships, and this dialog is where somebody decides whether to go and ask.

**Template Center — WRONG.** "Rundesk has templates; it has no gallery." It has
one: `/app/:workspaceId/templates` is browsable and searchable, filters by
`all / builtin / custom` — which is exactly the frame's Workspace-vs-stock
split — and is linked from the sidebar, so it is reachable as well as present.
Checked against the route, the page and the nav after §V2-12's lesson that
existing things can still be unreachable.

**Import breadth** stays as the table has it: named for completeness, not a gap
to close. **Skeletons** were already adopted as §2.9a.

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
