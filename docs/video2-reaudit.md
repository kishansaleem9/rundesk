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
- **A fifth, and the first visible on screen.** Two implementations of "how long
  ago" that disagreed: the list route's locale-aware `formatAge`, and
  `docs-panel.tsx`'s hardcoded-English `relativeTime` returning "3d ago". The
  English-only problem had been found and fixed in ONE copy, so Arabic and Urdu
  readers kept getting English in docs. Consolidated into
  `apps/web/src/lib/relative-time.ts`; the docs bug went with it.
- **Checklists, frames `02:15`–`02:55`.** The API had supported many checklists
  per task since it was written and the UI could not make a second one: the only
  creation path was implicit, inside add-an-item, and opened
  `if (firstChecklist) return firstChecklist`. When a template did produce a
  second list, the single add-item form at the bottom of the panel still wrote
  into `checklists[0]` whichever list you were looking at — a facade that
  photographs correctly. Now: "Add checklist", a per-list "Add item", an open
  count on the header, and an activity entry naming the item and its list.
  13 checks, five separate break-tests.

- **"Collapse empty fields", frame `01:20`.** Absent entirely — `grep -ri
  "collapse.*field\|emptyField\|hideEmpty"` over `apps/` returned nothing. Built
  as ONE preference in `apps/web/src/lib/collapse-empty-fields.ts`, read by both
  the built-in grid and the custom-field list, because the same setting kept as
  local state in two components is the duplicated-logic bug waiting to happen.
  An empty **required** field is exempt: it is the one blank on the page
  somebody has to act on, and hiding it turns "you must fill this in" into
  "this field does not exist". 11 checks, five break-tests.

- **The planner rail, frame `13:05`** — five sections listed, three drawn. Built,
  and underneath it **a live 404 nobody could see**: the planner asked for its
  assigned tasks at `/tasks/workspace/:ws/member/:id` while the API serves
  `/members/`. Every load answered 404, so `assigned` was permanently `[]` — the
  Backlog rail was always empty and the two Time-blocking switches gated
  nothing, *after* the commit whose subject was making those switches work.
  It survived because both planner suites **stubbed the client's spelling**
  (`if (url.includes('/member/')) return reply(ASSIGNED)`), which implements a
  route the API does not have; a check written against that can never fail on
  the real product. `planner-rail.mjs` watches the request the page really makes
  against the real API. **Sixth duplicated-list bug** here too: the page kept its
  own copy of the rail default instead of importing `RAIL_SECTIONS`, and it
  would have hidden this very change.

- **The task menu's Favorite and Archive, frame `15:25`.** The row said both
  "exist elsewhere". Half true. Favorite existed as a star beside the "..." and
  is now in the menu too, through the SAME hook, so the two controls cannot
  disagree about whether a task is pinned. **Archive existed nowhere — because
  it was wearing the wrong name.** `DELETE /tasks/:id` sets `isArchived`, stamps
  `archivedAt`, logs the activity as `archived`, lists the task under
  `GET /workspaces/:id/archived-tasks` and restores it with
  `POST /tasks/:id/restore`. Every layer called that archiving except the
  button, which called it Delete and asked *"Delete this task? This cannot be
  undone."* about an action that can be undone. A reversible action presented as
  permanent is one people avoid — which is why the product looked as if it had
  no Archive at all. Renamed end to end, in four locales, and put in the menu.
  11 checks, four break-tests.
- **What was deliberately NOT built there:** a second menu item called "Delete".
  Rundesk has one soft archive and no permanent task delete, so a "Delete" that
  fired the same request would be two names for one behaviour. Recorded as a
  real gap above instead of papered over.

- **The Priorities rail, frame `13:05`.** It drew the heading, the list and the
  empty state *"Prioritize a task to see it appear here"* — and offered nothing
  to press, while the API had `POST`, `PATCH`, `DELETE` and `PUT order` all
  along. The instruction printed on the surface could not be followed on that
  surface. Now: add, tick, remove.
  **The seventh duplicate, avoided and one more found.** The person panel
  already had all four mutations, so copying them into the rail would have been
  another one-fact-two-copies bug; both now go through
  `apps/web/src/lib/use-priorities.ts`. And they had been reading the *same*
  endpoint under two different React Query keys (`person-priorities` vs
  `planner-priorities`), so a write on one surface left the other stale — now
  one key, checked by writing in the rail and reading back per-person.
  9 checks, four break-tests.

- **The assign → priorities chain, frames `15:50`–`16:05`** — the one the
  walkthrough itself calls the `[15:47]`–`[16:19]` chain. Four links, none of
  which existed: the offer after assigning, "Don't ask again", the toast with
  **Open Priorities**, and the task appearing in the Planner rail with a
  counter. Assigning wrote an assignee and stopped.
  **The prompt only appears when the assignee is you**, because
  `POST /workspaces/:id/priorities` deliberately takes no `:userId` —
  `PrioritiesController` says routing it under `/people/:userId` "would invite a
  client to pass somebody else's id and expect it to work". Filling a
  colleague's day is a permission this product has not granted, so the prompt
  does not offer it; the suite checks that assigning a teammate raises nothing.
  10 checks, five break-tests.

- **The assignee picker, frame `15:45` — and the worst-shaped defect of this
  pass.** The control was `availableMembers.slice(0, 8)` rendered as chips: no
  search, no email entry, and nothing on screen to say anybody else existed. In
  the fixture workspace, which has accumulated seventy-odd members, sixty-odd of
  them **could not be assigned to a task at all**. It was not slow or awkward;
  it was incapable, and it photographed as finished. Found by accident, when the
  previous item's suite could not click the admin's own chip.
  Built: the search box, **Me** first, and invite-by-email (gated on
  `isManagerOrAbove`, because `POST /invitations` requires admin or manager and
  `use-workspace-role.ts` puts the rule plainly — "offering one that 403s is the
  state this fixes"). 10 checks, four break-tests.
  **A vacuous check, caught by break-testing.** The first version searched for
  the twelfth member and asserted the row appeared — which still passed with
  filtering removed and the cap back at eight, because that member happened to
  sort inside the first eight. Replaced with two claims the old behaviour cannot
  satisfy: the whole roster is listed, and a search for one person leaves exactly
  one row.
- **Not built there, on purpose:** *Agents / + Create Agent* (Rundesk has no
  agents — `ai.service.ts` already refuses an Agent filter for the same reason)
  and *"⚡ Assign with AI"*. Half of the latter exists: `assign_task` is a real
  tool, declared, previewed and executed. The half that does not is the whole
  point of the button — CHOOSING the person — and a button that returns an
  arbitrary colleague with a confident label is worse than no button.

- **The comment "+" menu, frame `04:50`.** The row said "the ten items exist
  scattered, no menu gathers them" — half wrong, and checking paid for itself.
  Record a Video Clip, Add a file and Mention a task did exist as their own
  controls. **Assigning the comment you are WRITING did not** (the API can
  assign one, and the UI used it only as a hover action on a comment already
  posted — a different gesture). An emoji inserter did not exist in the composer
  at all. New Task / New Doc / New Whiteboard had no entry point from here. So
  this was a menu *plus* three missing pieces.
  Everything in it goes to the code the direct controls use: Add a file clicks
  the composer's own input, Record a Video Clip calls the recorder's own
  `start` through a published ref, and the three "New …" items open the
  quick-create modal on the matching tab rather than being three more creators.
  11 checks, four break-tests — one of which asserts the menu does NOT offer
  Slash commands or Brain.
- **Two defects found while building it, both dead handlers:**
  · the quick-create modal's Escape was `onKeyDown` on a `<div>`, which takes no
    focus and so never receives a key event — the modal looked as if it closed
    on Escape and did not, for anybody. Moved to a document listener.
  · keeping the "+" menu open to show the assign picker left Radix's
    `pointer-events: none` on the body, so the composer and the Comment button
    behind it stopped responding. That one was mine, introduced and caught in
    the same hour.
- **A second vacuous check, caught by break-testing.** "The picker is showing
  TASKS" read the whole page — and the list behind the sheet renders the same
  task title, so switching the tab to People failed nothing. Scoped to the
  picker element. Same cause as the first: asserting on `body` instead of on the
  thing that is supposed to have changed.

- **The Planner's span selector, frame `13:50`.** It drew a seven-day week and
  nothing else, with the arrows hardcoded to ±7. Day, 4 days and Week are the
  same hour gutter at a different column count, so they fall out of the range
  maths; **Month gets its own layout**, because thirty columns of hour gutter is
  a week view pretending to be a month. The date arithmetic lives in
  `apps/web/src/lib/planner-view.ts` with 10 unit tests, because off-by-one
  lives in date arithmetic and a browser is a poor place to look for it.
  **Three bugs found in the building, all the same shape** — two places deciding
  one thing:
  · the FETCH range came from `weekStart` while the grid came from the view, so
    Month would have drawn thirty days and asked the server about seven;
  · the header's month label was formatted from `weekStart`, so in Day view on
    the 1st it named the previous month;
  · `planner-show-weekends` was already the settings dialog's testid, and reusing
    it made two elements answer one id — planner-settings.mjs caught that in one
    run.
  11 browser checks, five break-tests.
- **A third vacuous check, and it took two attempts to fix.** "Typing does not
  change the span" first sampled the column count before React re-rendered.
  Given time, it STILL passed — because the word I typed, "week ahead", contains
  both shortcut letters and `d` comes last, so the span bounced to Week and back
  to Day and ended where it started. My own fixture defeated my own check. It
  now asserts the TEXT THAT ARRIVED: the handler calls `preventDefault`, so an
  unguarded shortcut eats the character and the field reads "eek ahea".

- **"List name taken", frame `08:50`, and the toasts around it.** Three things,
  and they only make sense together: `createList` accepted any name, so a
  project could hold three lists called "Backlog" with nothing but their ids to
  tell them apart; the List tab's create mutation had **no `onError`**, so even
  once the API refused a duplicate the dialog would have sat there silently; and
  toasts were bottom-RIGHT while both frames that show one — `00:35` "Created
  field progress" and `08:50` "List name taken" ×2 — put it bottom-left.
  The rule lives in migration `0147` as a **partial, case-insensitive** unique
  index: `(project_id, lower(name)) where is_archived = false`. Case-insensitive
  because "Backlog" and "backlog" are the same name to the person reading the
  sidebar; partial because a list in the bin must not reserve its name for ever.
  The service check on top exists only so the answer carries the frame's words —
  break-tested: without it the status is still 409 but the message degrades to
  "That resource already exists". One check writes PAST the service to prove the
  index is what holds. 13 checks, three break-tests.
  Frame `00:35`'s toast is in the same commit: creating a field said nothing.

- **The field creator's required flag and Cancel, frames `00:25`–`00:30`.** The
  frame reads "Field name*" and pairs **Cancel** with **Create**. Two real gaps
  behind that: `isRequired` has been accepted by this endpoint since custom
  fields shipped, and the project-shell form already offered it, but the surface
  the frames actually use did not — so a field created while writing a task
  could never be required, and both the task sheet's required marker and
  "Collapse empty fields"'s required exemption had nothing to act on from here.
  And there was **no Cancel**: pressing "+ Create new field" was one-way, out
  only by creating a field you had decided against or abandoning the task.
  Found while testing: the field TYPE persisted across creations while its
  options were cleared, so after making a Labels field the next one opened as
  Labels with an empty options box and a **disabled Create button** — a dead
  form for a reason the person had not caused and could not see. The type resets
  now. 3 checks added to `custom-field-progress` (50 total), two break-tests.
- **Both rows I had set aside as "deliberate" were reopened and built, and one
  of them hid a real bug.** The reasoning I had accepted for the type picker —
  nineteen types do not need search when the browser can type-to-jump — ignored
  what the frame says AND the row two lines above it: eleven more types are
  still to come, so the list is heading for thirty. A control that needs
  replacing at thirty may as well search at nineteen. The `<select>` stays under
  the search box, because it is what a suite can `selectOption`, what a screen
  reader announces, and what works on a phone.
  · **"More settings" turned out to have something real behind it, and worse
    than missing.** `custom_field_definitions.listId` means "this field applies
    to one list, not the whole project". `createDefinition` has accepted and
    STORED it since custom fields shipped; both readers filtered on `projectId`
    alone. So "only this list" was a promise the product broke every time — a
    setting recorded by the server and honoured by nobody, which is the
    §V2-02d defect seen from the other side. `getValuesForTask` narrows on it
    now, and the expander is the control that sets it. Named "More settings",
    not "and permissions", because there are still no per-field permission
    columns to put there.

- **Slash commands in the comment composer, frame `04:50` — and the prerequisite
  that made them worth anything.** The previous item deliberately left "Slash
  commands" out of the "+" menu because the composer had none. Building them
  needed comments to RENDER markdown first: comment bodies were plain text, so a
  slash command inserting `## ` would have left two hashes on screen for ever.
  The blocks now live in `apps/web/src/lib/composer-blocks.ts`, shared with the
  description editor rather than copied (10 unit tests), and the "+" menu's item
  is real.
  **A check caught the renderer eating an existing corpus.** The first version
  ran inline markdown on every comment, and a comment seeded before any of this
  — `file_name_here` — came back as `filenamehere`, because `_..._` is emphasis
  and the underscores were consumed. That is not a formatting preference, it is
  losing characters somebody typed. Markdown now applies only to a comment that
  ACTUALLY contains block markdown — a list, quote, table or fence, which nobody
  writes by accident — and everything else renders byte for byte as before. The
  cost is that `**bold**` in a one-liner stays literal; the alternative was
  re-interpreting every comment ever written. 10 checks, three break-tests.
  The composer hint carries the `/` half only: there is no space-for-AI hook on
  this composer, and half a hint that works beats a whole one that lies.

- **"Save" a comment, frame `05:55`.** The narration says what kind of thing it
  is: *"reply/thread, assign, save — same like messages"*. So it is the same
  shape as chat's save — `task_comment_saves`, one private row per person per
  comment, the sibling of `chat_message_saves` (`0148`). No `tags` column: chat
  has one because chat's Saved panel filters by tag, nothing in the frames tags
  a comment, and a column no reader honours is the defect above.
  **Where it goes was researched, not guessed.** ClickUp: *"hover over the
  comment or message and click the bookmark icon … it will be added to the Later
  tab in your Inbox"* — and §2.2 had already put saved MESSAGES in that same
  tab for the same reason. So Later gained a second section rather than the
  product gaining a fifth panel.
  The link is comment-anchored (`?task=…&comment=…`, new on the list route): a
  saved comment that opens a busy thread at the top is most of the way back to
  not having saved it. On arrival the sheet opens Comments, scrolls to that
  comment and marks it, and the anchor is dropped on the next task change so it
  describes an arrival rather than sticking.
  One `SaveCommentButton`, two call sites — the root row and the reply row are
  duplicated in the sheet, and a second copy of the save would have been the
  ninth instance of the duplicated-logic bug. Access is re-checked on read via
  the existing `assertTaskReadAccess`, so losing access to a private Space drops
  its comments out of your Later tab; and the comment is verified against the
  task in the path, because a comment id is not a capability. 13 checks.

- **"Created `<date>`" and the activity panel as a rail, frame `03:40`.** Two
  gaps, one surface. The chip needed no server work at all: `getTask` selects
  the whole row, so `createdAt` had been arriving in the payload since custom
  fields shipped and the header simply never asked — a task could not tell you
  how old it was without opening the activity feed and scrolling to its end.
  The frame's note is "Activity panel is toggleable (button top-right of the
  task)", and at `01:20` the feed sits to the RIGHT of the task with the field
  grid still on screen. Rundesk had it as a TAB, which makes reading the
  history and reading the fields two different screens: "You estimated 12
  hours" could never be read beside the estimate it changed.
  `apps/web/src/lib/activity-rail.ts` holds the preference, same shape as
  `collapse-empty-fields.ts` — two readers (the sheet chrome, which has to make
  room and drop the tab, and the rail) several hundred lines apart, so one store
  rather than state lifted and eventually copied.
  Three things follow from the rail being on, kept together so they cannot
  disagree: the sheet widens (a 672px side sheet split in two leaves neither
  half readable, so asking for the rail asks for the room), the Activity TAB
  comes out of the strip (the same feed in two places is the duplicated-list
  bug in a new hat), and a reader sitting on that tab is moved to Overview
  rather than left on a tab that no longer exists.
  OFF BY DEFAULT, unlike ClickUp, which shows the panel straight away — its
  task is a full-page view and Rundesk's is a side sheet. The gap the re-audit
  named is that the panel could not be toggled at all.
  NOT "Brain²" beside the chip: that button leads to a hub this product does
  not have. 12 checks, nine break-tests.
  **A tenth break-test found a suite defect of the familiar kind.** The "sheet
  widens" check SAMPLED a width that is animated, so it compared 672px, failed,
  then re-measured 685px for its own failure message — the mistake
  `test/e2e/lib/wait.mjs` opens by describing, made again. It waits for the
  condition now, with a 300px margin: far more than a transition frame, far
  less than the 672→1440 it is asserting.

- **The screen-record setup panel, frame `04:55`.** Source `Entire screen`,
  quality `1080p`, mic `Default – Internal Microphone`, red Record Clip. Both
  recorders went straight to `getDisplayMedia({ video: true, audio: true })` on
  the click, each with its own hardcoded copy of that constraint — so the panel
  had to be a shared module or it would have been the tenth duplicated-logic
  instance, with the recorder that missed out still capturing at whatever the
  browser felt like. `apps/web/src/lib/clip-capture.ts` holds the choices and
  the constraints; `components/clip-setup-panel.tsx` is only the controls; both
  `comment-recorder.tsx` and `workspace-clips-page.tsx` go through it. No
  `getDisplayMedia` call site remains outside it except `call-surface.tsx`,
  which is live screen SHARING in a call — a different feature with no quality
  or mic choice to make.
  **Two things the frame implies that the API does not allow**, answered by
  saying so. A web page cannot enumerate screens: `getDisplayMedia` always
  opens the browser's own picker and `displaySurface` only pre-selects a tab in
  it, so the source row is a preference and the panel says the browser will
  still ask. And `getDisplayMedia`'s audio is SYSTEM audio, not the microphone
  — which is why the frame has a mic selector beside the source — so a clip
  with commentary is two captures joined, and the mic half is best-effort:
  losing the screen aborts, losing the mic warns and records anyway.
  14 checks, eight break-tests, plus 20 unit tests on the module. Every check
  asserts the CONSTRAINTS that reached the browser rather than the select's own
  value, because three dropdowns that remember their values and change nothing
  is the easiest facade in this audit to build.
  **It broke a neighbour, and that was the useful part.** `comment-recording`
  clicked straight through to a recording, so the panel made `getDisplayMedia`
  0× — correctly. Walking the new path fixed the count, and then its Record
  button timed out while visible and enabled: `elementFromPoint` returned the
  COOKIE BANNER's paragraph. That suite had never dismissed the banner because
  it switches the account to Urdu and the only handle was
  `button:has-text("Accept")`. The banner's buttons now carry test ids, so a
  fixed overlay every suite must clear is finally dismissable in any language.
  Its own fake also lacked `addTrack`, so the mix step threw, was caught as
  "that microphone could not be used", and the suite went on passing while
  exercising the error path — a fake missing a method the product calls does
  not fail, it quietly tests something else.

**Still open:** the AI four and the remaining ~9 field types, everything in §2
still marked M or P, and V2-03.

**Known and left alone:** the Later chip's count comes from
`/notifications/counts`, which counts snoozed notifications only — so Later can
read "0" while listing saved things. That predates this item (saved messages
have always been uncounted there) and fixing it means teaching a server count
about two other tables; noted rather than half-done.

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
| B | Searchable field-type picker — a search box that narrows the `<select>` and selects as you type |
| B | Progress (Auto) config panel — engine *and* the panel frame `00:25` shows |
| B | Field config: required flag and Cancel/Create |
| B | "More settings" — the field's SCOPE, which the API stored and no reader honoured |
| — | …"and permissions" — deliberate: `custom_field_definitions` has no permission columns |
| B | Toast "Created field `<name>`" |
| P | Attach on create — uploads *after* the task exists, single file, no removable list |
| M | Task-detail AI bar ("Ask Brain² for a presentation, document or prototype") |
| B | "Collapse empty fields" — one preference across the grid and the Fields tab |
| B | Relative times in the activity feed + "Show more" |
| M | "Comment ▾" split button; "Create Task ▾" split button |
| M | Toast "Task created — `<title>` › `<list>`" with Copy / View |
| P | Time-estimate popover with a unit-suggestion row |
| B | Attachments "Drop files here" — the panel exists, **no drop handler** |
| B | "Add checklist" — several named checklists, each with its own "Add item" |
| B | Checklist header open-item count ("Checklists 2 open") |
| B | Activity names the item and the checklist it went into (frame `02:47`) |
| M | Attachment thumbnail hover actions; attachments header view-toggle |
| B | Cover: Gallery / Upload / Link / Attachments / Remove, Reposition, Change cover |
| M | Cover: Search tab (documented as deliberate); Gallery "Custom" swatch |
| M | Task type "Fill with AI" |
| B | **Activity panel toggles to a rail** beside the fields; the tab drops out while it is up |
| B | Task header **"Created `<date>`" chip** — the API returned it all along |
| M | Task header "Brain²" button — deliberate: the hub does not exist |
| B | @ picker People/Tasks/Docs; "Does not have access to task" |
| M | @ picker Whiteboards / Locations / Channels; Brain section; Agents |
| M | Per-@-type keyboard hint footer |
| B | Voice note, Transcribe, Insert as text, inline player, **locale→speech language** |
| M | "Attach as audio file" tooltip |
| B | **Comment "+" menu** — eight of the frame's ten items, each one wired |
| B | Slash commands in the comment composer, and in the "+" menu |
| M | "Brain" in the "+" menu — the Brain² hub does not exist |
| B | Comment bodies render block markdown, which is what makes the above visible |
| B | Record a Video Clip; real `getDisplayMedia` |
| B | **Screen-record setup panel** — source hint / quality / mic, one module for both recorders |
| M | "Clip created!" card — Create a task · New tab · Copy link; "Link copied" |
| P | Clip in a comment renders, but no title, spinner, or card actions |
| P | Composer hint — the "/" half, which is the half that works; no space-for-AI hook exists |
| P | Threads — replies nest inline; no "Thread by `<name>`" panel with own composer |
| B | Reactions, react/reply/assign hover actions, resolve/reopen |
| B | **"Save" a comment** — per-person bookmark → Inbox › Later, comment-anchored link |

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
| B | Error toasts bottom-left; **list names unique per project**; both create paths report failure |
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
| B | "+ Add priority" in the planner rail — add, tick and remove, one shared hook |
| B | Rail sections **Assigned to me** and **Today & overdue** |
| M | Planner bottom command bar |
| M | **Calendar picker grouped by account** (+ workspace calendars: Time off, Holidays) |
| P | Calendar settings — 4 of 7 pages |
| M | **Conferencing / Zoom** connect row |
| M | Settings footer: What's new · Report a problem · Feature requests |
| B | **View selector Day / 4 days / Week / Month** + shortcuts `d x w m` |
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
| B | Favorite in the task menu (same hook as the star) |
| B | Archive in the task menu — and named honestly for the first time |
| M | A PERMANENT delete for a task — the frame lists Archive *and* Delete; Rundesk has one soft archive and no purge |
| M | "Add to ›" (a task in more than one list) |
| B | Assignee picker: search box, **Me** first, invite-by-email |
| M | "⚡ Assign with AI" — `assign_task` exists; CHOOSING the person does not |
| — | Agents / "+ Create Agent" — excluded: Rundesk has no agents (see §3) |
| B | **assign → "Add to priorities?" prompt → toast → planner rail** — the whole chain |
| M | Add to a COLLEAGUE's priorities — the write takes no `:userId`, deliberately |
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
