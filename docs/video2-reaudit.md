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
- **Field types 19 → 22, and this row's own arithmetic corrected.** `0158` adds
  `formula`, `tasks` and `signature`. The count came off the frame, not off the
  row: the picker's `All` section holds **thirty-two**, and the row's "11
  absent" had dropped **Custom Text** and **Custom Dropdown** — plausibly
  because "Text" and "Dropdown" are also in the list, but the frame draws all
  four separately. Thirteen were absent, three are now built, ten are recorded
  as decisions in §2's row. **Formula is the one worth reading about.** It was
  the obvious candidate for "build the shell, mark the compute unrouted", and
  it turned out not to need that: a formula over the task's own numeric fields
  is arithmetic, so it is evaluated for real, derived on read like
  `progress_auto` and refusing the write for the same reason. Three rules came
  out of building it and each has a break patch: a reference to a field that
  does not exist is refused at CREATE time with the name it could not find,
  because a typo that saves is indistinguishable from an empty field
  afterwards; an unfilled input makes the whole result null rather than zero,
  because zero in a percent box is a measurement; and **renaming a field a
  formula reads is refused, naming the formula**, because a rename that goes
  through orphans it silently.
- **Three defects found while building it, all in the list route's grid.** The
  columns draw whatever the project has, and a definition made in the create
  modal — which offers every type — lands there. So `people`, `labels`, `files`
  and `voting` rendered as `String(value)`, i.e. a comma-separated column of
  uuids; and clicking one opened a free-text input whose save the API answers
  400 into a promise nobody reads — **the dead control**, and for
  `progress_auto` one that could never have succeeded at all. Both were held in
  place by **a stale reason**: `CUSTOM_FIELD_TYPES` is commented "deliberately
  the same set this view knows how to render", which is true of the PICKER and
  was never true of the columns. `customCellText` formats by type now, and
  `INLINE_EDITABLE_TYPES` says out loud which types the grid can really edit —
  the money column stayed editable, and there is a check that it did, because
  "make it all read-only" is the feature removed rather than the bug fixed.
- **The custom-field create form opened itself on every later visit to the
  Fields tab.** `CustomFieldsPanel` is rendered behind `activeTab === 'fields'`,
  so leaving the tab unmounts it and returning mounts it again — and its
  open-on-stamp effect read `if (openCreateStamp) setCreating(true)`, which is
  true on MOUNT as well as on a bump. Once "Add fields" had been pressed even
  once the stamp stayed set, and the form appeared unasked every time after.
  Nothing failed and nothing said so.

  **Found by a break patch that ran GREEN.** `tfc-6` removes the stamp bump from
  the `···` menu's Custom Fields row and the suite still saw a form — because
  the REMOUNT was opening it, not the menu. Two ways of arriving at a visible
  form, one assertion, and the wrong one was doing the work.

  The sheet clears the stamp when the tab is left. **The first fix was wrong and
  the baseline guard caught it**: a `useRef` inside the panel initialises to the
  current value on the very mount the bump caused, so "has it changed" was false
  exactly when the form should open and "Add fields" stopped working outright.
  `task-field-create` came back 10 passed 4 failed, no patch ran, and nothing
  was measured against a half-broken build.
- **A merge refusal that described the opposite merge, in five places at
  once.** `mergeRefusal` had a rule keyed `target-is-descendant`, commented
  *"merging into your own subtask: the survivor would be a child of the task
  being binned"*, messaged *"A task cannot be merged into its own subtask"*, and
  asserted by a unit test under that same title. Its condition is
  `targetChildIds.has(source.id)` — the TARGET's children containing the SOURCE,
  which is a subtask merged into its **parent**. Probed against a live API:

  ```
  subtask -> parent   400  "A task cannot be merged into its own subtask"
  parent  -> subtask  400  "...Subtasks only nest one level deep."
  ```

  Nothing was ever unprotected: the case all five described is caught by
  `would-nest-twice`, and always will be, because a target that is the source's
  own child means the source has a subtask and the target has a parent. But the
  refusal people actually hit has spent its whole life quoting a sentence about
  a merge they had not attempted. Behaviour unchanged, words corrected, and the
  open question — whether that merge should be refused at all, given the stated
  reason never applied to it — recorded as a decision not taken.

  **Found by a break patch that ran GREEN**, deleting the rule everybody
  believed was doing the work. The unit test is the part worth sitting with: it
  passed, it was specific, it named the right behaviour, and it encoded the
  wrong relationship. A test can agree with a bug in exactly the words that
  describe the fix.
- ~~**A fourth duplicated-list bug**, found while adding Team View: the list
  route keeps its own `ALL_VIEWS` copy and silently filters out anything missing
  from it.~~ **CLOSED 21 September.** It was worse than this line said — the
  route held THREE copies, not one: `ALL_VIEWS`, `activeView`'s hand-written
  union, and the `v` cycler's own five-key literal. All three read
  `SPACE_VIEW_KEYS` now and the keys exist twice in the repository. Four of the
  class found in that pass: two planner settings types, two field-type lists,
  the API vs route view keys, and this.
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

- **The "Clip created!" card, frames `05:25`–`05:30`.** The composer offered a
  preview, Attach and Discard, and nothing that produced a link.
  **The honest problem:** a just-recorded clip is a `Blob` behind an object URL,
  private to the document that made it. Copying that would put a link on the
  clipboard that works in one tab and nowhere else — the neatest facade in this
  audit, because it would even paste. So Copy link and New tab upload first,
  LAZILY, on the first action that needs it: uploading on sight spends bandwidth
  on a clip about to be discarded, and cleaning up means a `DELETE /clips` that
  can itself fail and orphan an object. `Attach clip` is untouched, so the
  ordinary path still uploads once, as a comment attachment, on post.
  `uploadBlobWithProgress` was module-local at the bottom of the clips page and
  is now in `lib/clip-publish.ts`, imported by both.
  **R2 is not configured here or in CI**, so storage is stubbed and the suite
  says so rather than letting 18 green checks imply otherwise. The guard that
  makes it honest runs first against the real API: neither endpoint may answer
  404, and each must fail for a storage reason. That guard caught its own
  author — the first version pinned 400 on both, and `share` answers 500
  "Storage is not configured" while `presign` answers 400 "R2 is not
  configured". The same cause, two verdicts on whose fault it is; noted, not
  fixed here.
  18 checks, ten break-tests. **A real bug came out of writing one of them:**
  the uploaded key is remembered so a second Copy link re-signs instead of
  re-uploading, and nothing cleared it when a NEW recording began — so record
  clip A, copy, discard, record clip B, copy, and the clipboard hands out a link
  to clip A. The right kind of thing, silently, for the wrong recording.
  **And two of the new checks were weaker than they read**, each in a different
  way. "A second clip is not the first clip" navigated between the recordings,
  which remounts the app and destroys the state the check is about — so it
  passed on the broken build. "A failed upload is reported" accepted ANY toast,
  and on the build that ignored a failed PUT the toast was "Link copied", so it
  passed while the product did the exact thing it was written to catch. Both
  now assert what arrived rather than that something did.

- **The clip card in a comment, frames `05:35`–`05:40`.** Reading the code
  shrank this one honestly and turned up a real defect on the way.
  Most of the frame's card actions ALREADY EXIST: `00:00 / 00:16`, download and
  fullscreen are the native `<video controls>`'s own, which this player carries.
  ClickUp draws a custom player and has to rebuild them; rebuilding ours to
  match a screenshot would replace working controls with a worse copy. So the
  real delta was the card's NAME, which is now a heading rather than a caption
  underneath.
  **Copy link is deliberately absent here**, and that is the interesting part.
  `r2.getObjectUrl` signs an attachment URL for **900 seconds**. A "Copy link"
  on a comment clip would hand somebody a link that pastes, looks right, and
  stops working over lunch — a worse failure than not offering it. The "Clip
  created!" card can offer one because it goes through `POST /clips/share`,
  which takes an explicit expiry. Durable attachment links need either a public
  CDN URL or a share endpoint of their own; recorded rather than faked.
  **THE DEFECT:** `kind` was computed as `f.url ? presentationFor(...) : 'file'`,
  so a recording whose URL had not resolved did not merely miss its player — it
  rendered `<a href="#">`, a paperclip pointing nowhere on a file still
  arriving. Clicking it did nothing at all. It now says what is happening, and
  no attachment renders as a link to `#`.
  21 checks, twelve break-tests. **Two checks had to be repaired before they
  meant anything**, and break-testing is the only reason that is known:
  the card check drove the composer and posted — which goes through R2, which
  is off here — so it reported "the clip has no title" about a comment that was
  never created, sending the reader to the wrong file entirely; and the
  dead-link check counted `href="#"` anchors in a scenario that could not
  produce one, because with R2 off `url` comes back as the raw storage key and
  is truthy. Both now seed the state they are about.

- **The time-estimate box, frames `01:35`/`01:45`.** It was
  `<input type="number">` in hours: ninety minutes had to be entered as `1.5`,
  `2h 30m` could not be said at all, and the unit lived only in the field's
  label — so the box showed `12` and you had to know what that meant.
  Now it takes text, offers the frame's own suggestion row ("12 hours") before
  committing, and reads back `12h` / `1h 30m`. **Nonsense is refused rather than
  rounded**: typing a word puts back what is really stored, because reading
  "soon" as zero would destroy a real estimate over a typo.
  **DAYS ARE DELIBERATELY NOT UNDERSTOOD.** "2d" means two WORKING days, and a
  working day is a business decision — ClickUp calls it eight hours — that this
  product has never made anywhere. Accepting `2d` and quietly choosing eight
  would turn it into sixteen hours for somebody who meant forty-eight. Better
  to not understand it than to misunderstand it.
  **The tenth duplicate, avoided.** Two places turned typing into an estimate —
  this field and the quick-create modal — each with its own
  `Number(hours) * 3600`. Teaching one of them what `90m` means would have made
  them DISAGREE about the same words, which is worse than neither understanding
  it. Both read `lib/estimate.ts` now, and the suite's last check types the same
  thing into the other box and reads the seconds out of the database.
  11 checks, five break-tests, 15 unit tests. Three testids were added on the
  way (`quick-create-submit`, `quick-create-task-title`, and the cookie
  banner's) because the task tab's own submit had none — a suite could fill the
  whole form and have nothing to press by name.
  **Two of my own mistakes, both caught locally:** the parser's first version
  guarded input with a character allowlist that omitted `s`, so "2 hours" and
  "90 mins" were rejected as nonsense; and the suite's first version ended with
  `chk(true, …)` — a check that cannot fail — which is the exact thing this
  audit exists to remove. It drives the real modal now.

- **The Customize panel's three switches, frame `10:35`.** Absent entirely —
  `grep -rn "stackFields\|showEmptyFields\|collapseEmptyColumns"` over `apps/`
  returned nothing. Built as three BOARD switches, and the frames are what
  decided that: `10:35` is a Board view and carries exactly this trio, while
  `11:00` is the SAME panel on the List view and carries a different one —
  Show task locations · Show subtask parent names · Show closed tasks. So the
  panel's middle block depends on the view type, and putting these three on
  the list would have been three labelled controls over a grid with no cards
  to stack, no card fields to empty and no lanes to fold. Defaults are the
  frame's own toggle positions: off / ON / off.
  Each one reads somewhere: Stack fields and Show empty fields change how a
  board card lays out its Due date, Assignees and Subtasks; Collapse empty
  columns folds a lane whose count is 0. **"Collapse empty columns" is XOR'd
  with the chevron, not OR'd**, and that is the whole difference between a
  working control and a dead one: OR'd, the chevron on an auto-collapsed lane
  moves and changes nothing, because the switch wins every press for ever.
  XOR'd, a press records a difference from the default and still opens it —
  and with the switch off, `false !== x` is `x`, so today's behaviour is
  untouched. The blocker badge is deliberately NOT one of the card's "fields":
  it is a warning that appears when something is wrong, and "no blockers"
  drawn as an empty field would be a placeholder for the normal case on every
  card on the board. 28 checks, thirteen break-tests — three of which leave
  the switch working perfectly and revert only its reader.

- **The export paywall, frames `10:34`–`11:00` — a row that was half closed
  and read as fully open.** The recorded reason, "open by design here", was
  the *stale reason* defect class: it stopped being true at the commit that
  built `paywall-sites.mjs`, where `tasks.controller.ts:158-159` refuses
  `view=board` server-side on a Free plan and the panel marks the section
  locked. What was still missing is what frame `11:00` actually draws, and it
  is not a refusal: under the Download button, in small grey type,
  **"⚡ Business feature"** — with `[11:04]` *"abhi filhaal, of course, premium
  nahi hai to yeh download nahi kar raha"* over it. Rundesk's only pre-press
  signal was a padlock on the export section's own `<summary>`, which is not
  on screen once the section is expanded — which is exactly where a person is
  standing when they choose a format, a scope and a date style and then press
  a button that cannot work. The caption is gated on the same condition as the
  refusal, because `[10:49]` makes the free list download part of the same
  sentence and a caption on it would be this row's version of the gate
  spreading.
  **A second reader of the plan catalog, and it is pinned rather than
  duplicated.** `feature-gate.tsx`'s `upgradeTarget` is the first and is not
  exported; the list route resolves the tier itself, and the check "the
  caption names the same tier the gate offers" is what makes a drift between
  them a red suite rather than a wrong price on a label.

- **The assignee filter and its three switches, frame `11:30` — two rows, one
  control.** The toolbar reads `⧩ Filter · ⊘ Closed · ⚇ Assignee <face ✕>`,
  and behind the face a popover headed **"Tasks where I have assigned"** over
  **Comments · Subtasks · Checklists**, all three ON. The ledger had these as
  two rows (`P | … a <select>, not an avatar picker` and `M | "assigned to me"
  toggles`); they are the same cluster in the same frame, and the switches are
  settings of the assignee filter that do nothing whatever anywhere else.
  **Two of the three could not have been built in the browser at all.** The
  list payload carries `assignees` and `subtasks` and says nothing about who a
  COMMENT or a CHECKLIST ITEM is assigned to, so a client-side version would
  have been one switch that works and two that cannot — the facade, in
  triplicate. `GET /tasks/list/:id/assigned-via` answers it and **returns the
  three sources separately**, because a merged list cannot tell "Comments
  found it" from "Checklists found it" and a check written against one would
  pass with a branch deleted. Every match is resolved to the row the list
  actually draws: a comment on a subtask is reported as its parent.
  **The native `<select>` stays, beside the faces rather than instead of
  them**, on the argument this file already accepted for the field-type
  picker — it is what a screen reader announces, what a phone renders as a
  wheel, and what a suite can `selectOption`. They are one filter with two
  surfaces and no second state, and a check drives each one and reads the
  other. 29 checks, fifteen break-tests.
  **Not built, deliberately: multi-select.** `columnFilters.assignees` is an
  array and `filterTasks` already ORs over it, so the model would carry it —
  but `[11:28]` is "aap ko ya aap ke alawa [kisi aur ko]" and the frame draws
  one face with one `✕`. Recorded here rather than guessed at.

- **The three items above carry `B*`, not `B`, and the star is the whole
  point.** The session that built them could not start Postgres, the API or a
  browser, so `list-customize` (29) and `list-assignee-filter` (29) are written
  and typechecked and **have never been run**, and neither is registered in
  `ci.yml` — step 7 says to register a suite only once it is locally green, and
  a suite that goes red on somebody else's commit is what that rule exists to
  prevent. The twenty-eight break patches — thirteen for `list-customize`,
  fifteen for `list-assignee-filter` — were each verified by parsing and by
  applying them to a COPY of the target file, and the seventeen carrying any
  type risk were compiled; none was run against a live stack. Writing "B" here
  would have made a claim about a run that did not happen, which is the same
  move as a check that cannot fail.
  **Compiling them found a new break-testing trap, and it is worth the line.**
  The obvious way for a patch to delete a JSX block is to turn its condition
  into `{false && (…)}` — and TypeScript runs NO control-flow analysis through
  code it has decided is unreachable, so a variable that was narrowed inside
  the block stops being narrowed and the patch stops compiling. `{true && (…)}`
  is fine for the same reason it is useless as a test: the code stays
  reachable. The failure is silent unless the harness typechecks each patch,
  because a patch that does not compile still *runs*, still prints its
  confirmation line, and is then counted among the confirmed. The patch removes
  the whole block instead.

**Still open:** the AI four and the remaining **10** field types — and after
`0158` that is no longer a backlog item but a decision: eight of the ten need a
language model and `ANTHROPIC_API_KEY` is empty here and in CI, and the other
two (Relationship, Button) are written up in §2's row as decisions rather than
as work. Everything in §2 still marked M or P, and V2-03.

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
| B | `+ Create new field` on the create modal. It said "17 field types", which was true when it was written and has been wrong twice since — the count lives in the row below, where the gap is, rather than in two places that drift apart |
| P | **29** field types the frames' own transcription records, and the 32 that stood here did not survive being re-added. `00:20` lists 16 rows, `00:40` lists 16 more, and the two overlap on Progress (Auto) · Email · Phone: 16 + 16 − 3 = **29**, which is `video2-frame-observations.md`'s "~30" made exact. The 32 was this product's 22 plus the 10 absent, which counts **text**, **dropdown** and **date** as rows the frame draws — and the transcription names none of the three. Rundesk holds those three anyway, so it holds **22 types, 19 of them among the frame's 29**. A number that can only be reached by assuming the evidence contains what it does not name is the confident zero wearing a total, and it was mine. **~~Formula~~ ~~Tasks~~ ~~Signature~~ built in `0158`** — closed by `custom-field-types.mjs`, **32 checks, and all 32 break-tested** — baseline 32/32 green, every patch reddening the check it names. **The 10 absent are not a build and are recorded as such:** eight need a language model — Summary, Custom Text, Custom Dropdown, Progress Updates, Translation, Sentiment, Categorize, Action Items, and the picker's own **AI Fields** group names the first three — and `ANTHROPIC_API_KEY` is empty here and in CI; **Relationship** would be a second store for what `task_doc_links` already holds; **Button** stores no value at all, and `AutomationsService` has no manual trigger, so the only thing buildable today is a button wired to nothing. 19 + 10 = 29, which is the list. ~~Files~~ and ~~Voting~~ built in `0145` |
| B | Searchable field-type picker — a search box that narrows the `<select>` and selects as you type |
| B | Progress (Auto) config panel — engine *and* the panel frame `00:25` shows |
| B | Field config: required flag and Cancel/Create |
| B | "More settings" — the field's SCOPE, which the API stored and no reader honoured |
| — | …"and permissions" — deliberate: `custom_field_definitions` has no permission columns |
| B | Toast "Created field `<name>`" |
| B | Attach on create — closed by `attach-on-create.mjs`, 13 checks (frame `01:10`). Several files, listed by name, each removable, staged **before** the task exists. Building it found the feature was inert in a way no screenshot could show: `input.files` is a live `FileList` and the change handler clears `e.target.value` the moment it returns, so `Array.from(picked)` inside React's state updater — which runs later — always iterated an emptied list. **Every staged file was silently dropped, for any file**, and the paperclip stayed on "Attach a file" with nothing on screen to say so |
| B | Task-detail AI bar ("Ask Brain² for a presentation, document or prototype") — closed by `task-ai-bar.mjs`, 18 checks. `ANTHROPIC_API_KEY` is empty here, so every surface ends in "AI features are not configured"; the suite asserts that MESSAGE, never the status alone, and no check may pass on a 404 |
| B | "Collapse empty fields" — one preference across the grid and the Fields tab |
| B | Relative times in the activity feed + "Show more" |
| B\* | **"Comment ▾" split button** — frame `04:11`, closed by `task-mentions.mjs`. It is a MODE switch, not two actions: the menu draws Comment with a tick and Email under it, and `[04:11]` says what the other is for. **Email is listed and disabled, with its reason on the row**, because Rundesk's mail goes the other way — `email-to-task.ts` turns mail sent to a task's address into a comment and nothing posts a composed body out — so a selectable Email mode would be a dead control wearing a tick. **`"Create Task ▾"` is the part still missing, and its MENU has no frame behind it.** `00:07` draws the split button in the create modal's footer — a primary `Create Task` with a chevron segment beside it — and no frame in the video ever opens that chevron; `video2-frame-observations.md` names it once, at line 11, and never again. Rundesk already has the primary button (`quick-create-submit`). What is absent is a menu whose contents nothing shows, so building it would mean inventing them — the same refusal the create-modal-placeholder row makes. **Blocked on the reference, which is a different thing from not done yet** |
| — | Toast "Task created — `<title>` › `<list>`" with Copy / View — satisfied differently: creating a task NAVIGATES to it, where Copy link is already in its menu |
| B | **Time estimate takes `12`, `90m`, `1h 30m`** with a suggestion row; reads back `12h` |
| B | Attachments "Drop files here" — the panel exists, **no drop handler** |
| B | "Add checklist" — several named checklists, each with its own "Add item" |
| B | Checklist header open-item count ("Checklists 2 open") |
| B | Activity names the item and the checklist it went into (frame `02:47`) |
| B | Attachment thumbnail hover actions; attachments header ~~view-toggle~~ **count** — closed by `task-attachments.mjs`, 13 checks. The frames moved this row: at `01:55` the magnifier / expand / `+` cluster is on the **Fields** header, and the Attachments header three rows below carries a disclosure triangle and the count `1` and nothing else. Building a toggle would have been building to a summary of the frame instead of to the frame |
| B | Cover: Gallery / Upload / Link / Attachments / Remove, Reposition, Change cover |
| P | Cover: Gallery "Custom" swatch built. Search tab still absent — the recorded reason was re-checked against the tree rather than trusted, and still holds: one grep finds no image provider anywhere |
| B | Task type "✦ Fill with AI" — closed by `task-ai-bar.mjs`, 18 checks (frame `03:25`, the foot of the Task Types popover) |
| B | **Activity panel toggles to a rail** beside the fields; the tab drops out while it is up |
| B | Task header **"Created `<date>`" chip** — the API returned it all along |
| M | Task header "Brain²" button — deliberate: the hub does not exist |
| B | @ picker People/Tasks/Docs; "Does not have access to task" |
| P | @ picker **Whiteboards / Locations / Channels closed** by `task-mentions.mjs`, 17 checks (frames `04:00`/`04:11`). Still open, and blocked rather than pending: **Brain section** and **Agents**, both of which address the Brain² hub that does not exist (see §3). The Locations check asserts a request LEFT THE PAGE carrying the typed word and exactly the three location types — filtering the sidebar's cached tree in the browser finds nothing for a space created this minute and calls it "no matches" |
| B | Per-@-type keyboard hint footer — closed by `task-mentions.mjs`, 17 checks. Frame `04:00` draws `'@' People | '@@' Tasks | '@@@' Docs | '@@@@' Whiteboards | '@/' Locations | '#' Channels`; Rundesk had no footer at all |
| B | Voice note, Transcribe, Insert as text, inline player, **locale→speech language** |
| B | "Attach as audio file" tooltip — closed by `comment-recording.mjs`, 32 checks |
| B | **Comment "+" menu** — eight of the frame's ten items, each one wired |
| B | Slash commands in the comment composer, and in the "+" menu |
| M | "Brain" in the "+" menu — the Brain² hub does not exist |
| B | Comment bodies render block markdown, which is what makes the above visible |
| B | Record a Video Clip; real `getDisplayMedia` |
| B | **Screen-record setup panel** — source hint / quality / mic, one module for both recorders |
| B | **"Clip created!" card** — Create a task · New tab · Copy link, and "Link copied" |
| B | Clip in a comment is a card with its name; a clip still arriving says so |
| — | …its download / expand / `00:16` are the NATIVE player's, already there; Copy link deliberately absent (15-min signed URL) |
| P | Composer hint — the "/" half, which is the half that works; no space-for-AI hook exists |
| P | Threads — replies nest inline; no "Thread by `<name>`" panel with own composer |
| B | Reactions, react/reply/assign hover actions, resolve/reopen |
| B | **"Save" a comment** — per-person bookmark → Inbox › Later, comment-anchored link |

### S07–S12 · relationships, space wizard, views, export, filters

| | capability |
|---|---|
| B | Related Items — one panel, Relationships \| References, single entry point |
| B | Right-rail "Related Items" icon + tooltip — closed by `task-attachments.mjs`, 13 checks (frames `06:05`–`06:08`) |
| B | Sidebar Direct Messages — closed by `sidebar-dms.mjs`, 14 checks. The data had been there the whole time and the surface was not: `chat_channels.is_dm` is a real column and `workspace-chat-page.tsx` has split `publicChannels` from `dmChannels` since it was written. The Channels section filters DMs out on purpose — `+ Add Channel` takes a name and `+ New message` takes a person, so one button cannot be both — and filtering them out without giving them a home left them reachable only from the page you had to already be on to know you had any |
| P | Create-menu search **"Describe anything to create" and Create with AI closed** by `create-menu-ai.mjs`, 23 checks (frame `06:40`). **Super Agent** stays open and is blocked, not pending: Rundesk has no agents, and the Brain²/Super Agents hub is recorded in §3. The check asserts the row in Postgres across BOTH doors — a list made from a space with no project lands in that space's hidden default container, which `getProjectsBySpace` excludes on purpose, so walking the visible projects could never find it |
| B | **Form in the create menu** — frame `08:00` puts it beside Doc · Dashboard · Whiteboard, and the module had been complete for a long time (builder, public submit page, uploads, routing) and reachable only from the Forms rail. Closed by `space-create-menu.mjs`, **28 checks**. `form` is a ninth `CreateKind`, so the menu and the quick-create strip both gain it from one list. Its creator asks which list submissions file into **and refuses without one**, because `FormsService.createTaskForSubmission` returns early when a form has neither a `targetListId` nor a routing field — a form made with no destination takes replies and produces nothing, on a page nobody revisits. **Three defects came out of building it.** `GET /lists/space/:id` does not return a space's lists: `getListsBySpace` resolves the space's hidden default container and returns that project's, so the picker said "This Space has no Lists yet" over a project page drawing one — the endpoint is left alone (the sidebar, `list-under-space` and `space-presets` all depend on the narrow meaning) and the picker reads `GET /lists/workspace/:id`, which carries `spaceId` per row. A space with no lists left the button **disabled in silence**, which is `[21:49]`'s dead end again; it still refuses and now says why. And `['lists', projectId]` is not a prefix of the other list keys, so a list created through the List tab was missing from this picker for thirty seconds — both create paths invalidate the bare `['lists']` prefix now |
| B | Create-a-Space: icon+name, description, **Default permission**, Make Private |
| B | Space dialog footer "Use Templates" — closed by `space-wizard.mjs`, 23 checks (frame `06:52`) |
| B | Space wizard: 4 presets, default views, statuses, ClickApps grid, per-space gating |
| B | ClickApps — gated by PLAN, server-side as well as client-side; 3 dead labels removed |
| B | "Default View Templates" tab — closed by `space-wizard.mjs`, 23 checks (frame `07:06`). The check that covers it had to be rewritten before it meant anything: it pressed the Marketing card, which the panel had already correctly disabled as "Applied" because step two had chosen the Marketing workflow — and had the press landed, the state it asserted was already true beforehand, so **it could not have failed for any build**. It now presses Project, then Marketing, and verifies **every** switch the panel draws rather than two |
| P | View types — 6 of 11. Table already existed; the wizard now labels Team correctly (it rendered as "List"). Map / Mind Map / Timeline deliberately NOT offered — a view you can tick but not render is a stored value no reader honours. Activity and Workload remain buildable |
| B | **Copy configuration from another space** ("from: `<Space>` · Hide · Apply") — frame `07:50`, the bar in `create-space-wizard.tsx`, closed by `space-wizard.mjs`, 5 checks. Stale, not missing |
| B | "+" on a space opens the Create menu, from one shared list both it and the quick-create tabs import — **8 create kinds above the rule and the frame's Imports/Templates footer below it**, and `space-create-menu.mjs` now asserts the two groups separately, 23 checks. It did not: it scraped every `space-create-*` item into one array and compared it to the create kinds, so on the day the footer shipped — which is frame `08:00`'s own bottom group — **the baseline went red for a menu that had just become more correct**, and stayed red through a whole break-test round, which refused to run against it. Its header also called that array "the eight of frame `08:00`" when the frame's eight are a different set (no Task, Reminder or Project; a **Form** Rundesk has none of, which is the `M` row above). Two new checks came out of the fix: the footer pair is named, and **neither may grow a creator tab** — `workspace-sidebar.tsx` argues in a comment that making them `CreateKind`s would be "the dead control, twice", and a comment is not a guarantee |
| P | Create Folder — **private toggle and Use-Templates footer closed** by `folder-dialog.mjs`, 13 checks (frame `08:32`). Still open: **description**, and it is blocked rather than pending — `folders` has no such column and `FoldersService` whitelists `{name, color}` on create, so a description typed here would have nowhere to go. Left absent on purpose: a field that stores into nothing is the mirror defect, and the frames are not worth a column that lies |
| B | Folder **"Use Space statuses"** inheritance — closed by `folder-dialog.mjs`, **21 checks, 8 of them new and all 8 break-tested** (frame `08:32`: Settings › Statuses over the value *"Use Space statuses"*, with a `›`). Built as **one column with a reader**, migration `0159`: `folders.status_scope ∈ 'space' \| 'list'` is the default handed to every list made in that folder, and `ListsService.createList` is the reader, so the setting shows up on the first list rather than being stored against a someday. Deliberately NOT a fourth status table — `resolveEffectiveStatuses` already honours `'space'` on the read path and the task write path, and folder-owned statuses nothing read would be the mirror defect this audit has found six times. The decisive check compares a list's **effective** statuses key-for-key with the space's own, not by count, so a list that seeded a same-sized default cannot pass. The confident zero is handled too: `applyPreset` seeds `space_statuses` inside a `try`, so a space can legitimately have none, and `createList` only scopes to `'space'` when the space actually has some — **this suite's own guard check caught that on its first run**, against a fixture that had created a space with no preset |
| B | Skeletons on load; sidebar hierarchy; breadcrumb |
| B | Error toasts bottom-left; **list names unique per project**; both create paths report failure |
| B | **Delete → trash + Undo + Ctrl+Z** |
| B | Board view: status lanes, colours, counts, per-lane add, drag between lanes, + Add group |
| B | **Team view** — a view type, ungated; rows per person with their own load |
| B | Paywall that teaches — at the two sites she names, Team view `09:26` and board export `10:42`. List export stays free, and a check asserts it. Refused server-side, not just hidden |
| B\* | **Plan-tier paywall UI** — frame `09:26`'s modal, closed by `paywall-sites.mjs`, 30 checks, break set complete 10/10: the plain line, the heading naming the tier and the feature, the panel that describes and previews, the tier beside it, and one button. Stale, not missing. **The metered *"uses have expired"* state is the part still absent, and it is blocked on the reference.** `09:30` draws the second state inline — the same feature preview over *"Your Team view uses have expired."* and one **Contact admin** button — and that is ALL it draws. No counter, no remaining count, no allowance, no reset. Rundesk has no metering to hang it on either: `PlanUsage.usage` is `{ members, projects }`, which counts things that EXIST rather than times a feature was USED. Building it means inventing the allowance and the reset policy and then writing checks against my own invention; building only the renderer is worse — a branch nothing can reach is the mirror defect. Recorded as blocked rather than pending |
| B | Calendar view, Gantt (today line, zoom, drag, critical path) |
| B | Gantt: Auto fit, week numbers, collapsible panels, local export |
| M | Create-modal placeholder "Add description, or write with ⚡AI" — **and it has no frame behind it.** `video2-frame-observations.md:250` cites `10:00`; `09:54` through `10:08` are all the Board view, and the other create modal it cites, `21:36`, is the Brain² hub. Every create modal that IS on screen (`00:08`, `00:14`, `00:20`) already has a description typed into it, so the placeholder is never drawn. Left `M` rather than built: a string with no frame is a summary, and building to a summary instead of to the frame is what step 1 exists to stop. See §7 |
| B | Customize view: Autosave, Pin, Private, Protected, Set default, Copy link, Sharing |
| B\* | **Customize: Stack fields, Show empty fields, Collapse empty columns** — board switches, each read by the grid. `list-customize` 29 |
| B | Customize on the LIST view — **the frame `11:00` trio built**, closed by `list-customize.mjs`, **37 checks, 8 of them new and all 8 break-tested**. Show task locations · Show subtask parent names · Show closed tasks, drawn where frame `10:35` draws the board's own three, because two different trios in one slot is the reference being specific. **`showClosed` is passed down, not re-declared**: the toolbar's Closed chip already owned that state, and two controls for one question each with their own `useState` agree exactly until one is used — so it is checked in both directions, since either direction alone passes on a build that writes the shared value and reads back a private one. The two annotations are **maps, not booleans**: a row can only ask "is there a string for me", so a switch left on while the data says nothing draws nothing and the mirror defect has nowhere to happen. The parent title is resolved from **every row the page holds, not the visible ones** — a closed parent with an open child is the fixture — because a lookup against the filtered set draws no name at all, which is what a task with no parent draws. `showClosed` also joins `currentViewConfig` now: it had been a chip the view did not remember, and this file's own rule for Card size is that the panel configures the VIEW |
| B | Export: CSV/Excel, three-way scope, date+time formats, honours the view |
| B\* | **Export paywall** — the refusal was already built; the frame's "⚡ Business feature" caption inside the open dialog was not. `list-customize` 29 |
| B | In-list search, Save-view chip, filter rules, nested groups, saved filter sets |
| B\* | **Assignee filter is an avatar picker** — faces, Me above the roster, the frame's ✕; the native `<select>` stays beside it, one state. `list-assignee-filter` 29 |
| B\* | **"Tasks where I have assigned" — Comments · Subtasks · Checklists** — a server source each, unioned into the filter. `list-assignee-filter` 29 |

**B\*** — built end to end, with a suite written against a real API and a real
browser, and **the suite has not been run**: the session that wrote these
four rows was not allowed to start Postgres or the API, so the number beside
each one is its `EXPECTED_CHECKS`, not a green run. They are not registered in
`ci.yml` for the same reason — the process file's step 7 says to register a
suite only once it is locally green, and going red on somebody else's commit is
the failure that rule exists to prevent. Twenty-eight break patches are written
and every one was verified by parsing and by applying it to a COPY; none was
run against a live stack either. **A `B*` is a claim about the code and the
checks, not about a run.**

### S13–S17 · imports, templates, planner, planner settings, task menu, AI hub

| | capability |
|---|---|
| P | Import — a real delimited-file parser with per-source column presets covers 7 of the 10 named tools. Basecamp needs its API; Confluence exports pages not task rows; Slack exports conversation JSON. Monday and Wrike default to .xlsx, which is not read |
| P | Importers — frame `12:08`'s submenu has twelve rows: Spreadsheet files, Document files and ten named tools. **Spreadsheet import is built** — a real delimited-file importer with explicit column mapping — closed by `imports.mjs`, **20** checks — 19 until `imports-3-deadpreset` showed that a disabled Start was ending the run rather than reporting, and "the import reported a result" became a check of its own — **19/19 break-tested**. The ten named tools appear as column **PRESETS over that one importer**, which is a decision and is recorded as one: ten tiles opening a dialog that cannot import would be the facade defect at ten times scale, and `imports-1-ghosttile` exists to redden exactly that. The four rows with no preset are drawn as text with their reason and no control. **Document import is the part still open** |
| B | Template Center — faceted browse with type, complexity, use-cases and categories, counted in SQL over the corpus rather than over the loaded page |
| B | Planner onboarding screen — closed by `planner-onboarding.mjs`, 12 checks (frames `12:40`/`12:45`/`12:48`). The card titles are the frame's own words and one of them was not: the product shipped "Keep your meeting notes" in four locales where `12:45` draws **"Automate your meeting notes"**, so the check was green against copy the specification does not contain. Corrected. The Connect check asserts the browser LANDS on the URL the server hands back, not merely that it asked — `window.location.href = authUrl` is the convention in all three OAuth surfaces, so "it requested" and "it went there" are different facts and only the second is the feature |
| B | Connect Google / Outlook; two-way scope; drag task → block; prefix applied |
| B | "Team schedules" — closed by `team-schedules.mjs`, 13 checks (frame `12:48`). Not reachable by raising a number: the planner's "Meet with" hatches ONE person's busy time over your own week, and four people overlaid on one column is a picture of nobody's schedule. The fixture is two people busy at different times of day and in different counts, so a grid that draws `columns[0]` four times fails on the numbers AND on the geometry. Check 13 holds the old overlay in place, because deleting the feature you already have is the cheapest way to green and the worst outcome for the product |
| B | Planner: Priorities rail, Meet with, Backlog, day columns, all-day row, 24h gutter, live now-line |
| B | "+ Add priority" in the planner rail — add, tick and remove, one shared hook |
| B | Rail sections **Assigned to me** and **Today & overdue** |
| B | Planner bottom command bar — closed by `planner-command-bar.mjs`, 10 checks. It must open the SHARED palette rather than grow a second search surface beside it, and ⌘K has to open exactly ONE: the shell keeps the hotkey because the palette is only mounted while open, and the component registers a toggling ⌘K of its own — so a stowaway second copy is invisible until a keypress, and a break patch that mounted one permanently left the earlier version of this check green |
| B | **Calendar picker grouped by account** (+ workspace calendars: Time off, Holidays) — closed by `calendar-accounts.mjs`, 33 checks. Building it found that the picker's popover used a `fixed inset-0 z-40` click-catcher with **nothing listening for Escape**: until a click happened to land on the catcher it was a full-screen sheet swallowing every press in the planner header, and a keyboard user had no way out at all. Proved by hit test — after Escape the menu count is still 1 and `elementFromPoint` over the Settings button returns the catcher — not inferred |
| B | Calendar settings — 5 real pages plus two honestly recorded gaps (AI Notetaker needs a meeting bot; Automations parked at `14:29`) |
| B | **Conferencing / Zoom** connect row — frame `13:36`, the last section of the Accounts page: *"Connect other video conferencing providers"* over a Zoom row. `ConferencingRow` in `planner-settings-dialog.tsx`, closed by `calendar-accounts.mjs`. Stale, not missing |
| B | Settings footer: What's new · Report a problem · Feature requests |
| B | **View selector Day / 4 days / Week / Month** + shortcuts `d x w m` |
| B | Show weekends; event style; default duration; colour tasks by; start week on |
| B | Appearance: **Grid size** — frame `14:05`'s first control, three swatches (Default · Large · XL) over *"Choose how large events and time slots appear in the grid"*. Closed by `planner-appearance-toggles.mjs`, 3 of its 20 checks, **re-run green at HEAD**. THIS ROW WAS STALE, not missing: the control, the API's validation and the reader all exist. `const hourPx = GRID_SIZES[gridSize]` is the reader and every block's `top` and `height` is computed from it, and `GRID_SIZES` is imported FROM the settings dialog rather than re-declared, so the swatch and the grid cannot disagree about what "Large" means |
| B | Timezone — the control the validated server support was missing |
| B | Sidebar page: show/hide rail sections |
| P | Sidebar: **drag-reorder closed** by `sidebar-reorder.mjs`, **23 checks** — 21, plus the two added when a break patch aimed at something else deleted `canDropOn`'s entire list rule and all 21 stayed green: the suite asserted that a FOLDER dropped on a project row sends nothing and never that a LIST dropped on one sends something (§8). `+ Add a new section` still open (it is on Calendar settings › Sidebar, over the planner rail, not on the tree). `projects.position` had existed since the table did with neither end attached — `updateProject` left it out of its whitelist and `getProjectsBySpace` had no `ORDER BY` at all, so the tree drew whatever the query plan produced, which changes as rows are updated and after a vacuum. A column with no writer and no reader is the mirror defect with the mirror missing too |
| B | **Upcoming meeting page** — time left, quick-join, and desktop notification |
| B | Time blocking + the five settings that were STORED AND READ BY NOTHING — showWeekNumbers, alwaysOpenAtStartOfWeek, darkenNonWorkingHours, savePersonalEventsQuickly, showRecurring — each now has a reader that changes the grid |
| B | `showOverdue` — now read by the backlog |
| B | `showAssigned` — given a control and a reader |
| B | Default list for new tasks; timeblock prefix; quarter-hour snapping |
| B | Task menu: Copy link/ID/New tab, Merge, Convert, Description history, Print, Send email, Duplicate, Move, Follow, Remind, Task type, Templates, Sharing, Delete |
| B | Favorite in the task menu (same hook as the star) |
| B | Archive in the task menu — and named honestly for the first time |
| B | A PERMANENT delete for a task — `deletedAt` into the same Trash the other entities use, restorable there, purged by the same cron after the same 30 days. Archive is never purged. An archived task must NOT appear in the Trash, and that check was impossible to satisfy before |
| M | "Add to ›" — frame `15:35` draws the row and its chevron; **no frame opens the submenu and the transcript never speaks the item**, so what it adds a task TO is unspecified. The gloss this row carried for six weeks — *"a task in more than one list"* — is ClickUp's real product, not anything in the video, and it is what kept the row on the buildable side. Blocked on the reference, not on Rundesk. See §6 |
| B | Assignee picker: search box, **Me** first, invite-by-email |
| B | "⚡ Assign with AI" — closed by `ai-assign.mjs`, 23 checks. The ranking is the feature: the suite adds work to the first pick and requires the suggestion to **name somebody else**, with no escape hatch — the subject's list is the run's own, so every candidate starts at `inList = 0` and only load moved. It recommends and does not assign, which is asserted by re-reading the task |
| — | Agents / "+ Create Agent" — excluded: Rundesk has no agents (see §3) |
| B | **assign → "Add to priorities?" prompt → toast → planner rail** — the whole chain |
| M | Add to a COLLEAGUE's priorities — the write takes no `:userId`, deliberately |
| B | Live focus countdown in the header |
| B | Countdown in the browser tab title — closed by `tab-title-countdown.mjs`, 10 checks. A title set once is a screenshot rather than a countdown, so the suite reads it twice and requires the remainder to have decreased; it also leaves the app and requires the title to be restored, because a countdown that outlives the page it belongs to is read as live |
| M | Brain² hub, `/ai/brain`, AI-scoped left nav, Ask\|Agents toggle, Super Agents |
| M | Credit meter; rotating placeholder; composer "+"; generated artifacts / slide deck |
| B | Skills; Recent Chats with auto-derived names |

### S18–S22 · model picker, AI execution, analytics, credits, connections, teams

| | capability |
|---|---|
| B | Model picker — the **"Best models" header, the disclosure, and a preferred model persisted SERVER-SIDE** (it was localStorage only, and a preference that does not survive a second browser is a habit that one browser happens to remember). ChatGPT and Gemini are listed and deliberately NOT selectable: no OpenAI or Google client exists, and an unroutable provider carries no model field, so nothing can route to one by accident. `ai-model-picker.mjs`, 32 checks |
| B | "Best models" hover cards with Speed/Intelligence bars — closed by `ai-model-cards.mjs`, 24 checks (frame `17:16`). **THIS ROW AND THE ONE ABOVE IT DESCRIBED THE SAME SCREEN AND DISAGREED.** The row above read `B | … hover cards with Speed/Intelligence bars …` while this one read `M | … hover cards with Speed/Intelligence bars …`, one line apart. Reading the code settled it: the header and the disclosure were built, and the hover card was not — the bars were inline in every row, under a comment arguing that hover-to-see is worse. The `B` row overclaimed, and the duplicate is why nobody noticed. The two now divide the screen between them rather than both claiming it. The bars are MEASURED: the fill sits inside a visibly wider track, Speed differs from Intelligence within one model, and the same metric differs between two models — two identical bars drawn at full width would satisfy a check that only asked they exist |
| B | Inline word suggestions while typing — closed by `ai-answer-rendering.mjs`, 51 checks (frames `17:42`–`17:50`). Three different sets at three timecodes, so a fixed three would photograph identically. Building it found that **the composer could not be typed into at all** — `value={input}` with no `onChange` — which is why `nextWordSuggestions` had always been correct and had never been called with anything but `''` |
| B | **Live step log**; steps emitted only after the lookup returns |
| B | **"No changes made."**; copy / 👍👎 / retry; **Follow ups** (generated, capped at 3) |
| B | Integration error card — the provider's own message, stored per connection, cleared on a successful connect, with the Help-centre link |
| B | Success message with clickable path chips (`rundesk › ddddd › List`) — closed by `ai-answer-rendering.mjs`, 51 checks (frame `18:48`). The chip was a `<span>`: a path that looked like a link, could not be pressed, could not be middle-clicked and did not exist to a keyboard — the dead control, in the one place the answer is telling you to act. A view the space cannot draw degrades to the list rather than being offered |
| B | AI Analytics: Time Saved with its working, Human Cost Savings, editable rate, Edit benchmark, validation, net-can-be-negative |
| B | "Actions completed" — the 24 raw feature values grouped into the frames' 8 categories, server-side. Three categories cannot be filled at all and print a reason rather than `0`: a zero meaning "impossible" and a zero meaning "you did none" look identical on screen. The unit stays a run, not an "action" |
| M | **Credits entirely**: tab, category→credits table, usage-trend chart with limit line, Add credits, My Agent Performance |
| M | Image generation |
| B | App Center with categories, per-app descriptions, connection health |
| B | Apps — Box, Confluence, Jira, Gmail, SharePoint, Outlook Mail. **THIS ROW WAS STALE**: all six are in `INTEGRATIONS` and have been, among 48 tiles. The work was done and the row was never re-read — the stale reason again, this time hiding a closure rather than a gap. They are built as TWO features, because "what happens when somebody presses it" has two honest answers. **Gmail and SharePoint are connectable**: `listSupportedProviders()` holds a provider for each and `search.service.ts` a query path, so Connect starts a real grant and the palette tab it feeds can answer. **Box, Confluence, Jira and Outlook Mail are not, and say so** — nothing in this product reads a Box or an Atlassian token, so a grant stored for one is the mirror defect, and worse than the gap because the gap is visible. Those tiles carry the plain sentence and the one action that is real: telling the admins you want it. `comingSoon` is gone with them: it was a hand-kept second opinion about connectability that had drifted from the server's, drawing OneDrive, Linear and Salesforce as "Soon" over three working connectors |
| B | "Suggest an app" (the `+` is inside the glyph, not a literal prefix) and the "Connect Custom MCP Servers" banner — closed by `app-catalogue.mjs`, 25 checks (frame `19:07`). Both are live controls that record a real request. The MCP **capability** is recorded as a decision, not built: no AI tool in this product reaches outside the workspace, so registering a server would store a value no reader honours |
| B | Activity log — Status and My-runs filters, both reaching the server. `userId` had been accepted by the endpoint and sent by nothing; Status needed a column AND a failure-recording path, because `recordUsage` only ever fired on success |
| B | Teams Hub reachable by a plain member; All Teams / All People / Org Chart; My Teams; search; org-chart empty state |
| B | Teams empty-state headline; **Browse People / Create Team** buttons; **three** explainer cards in a carousel with a pager — closed by `teams-empty-state.mjs`, 21 checks, break set 4/4. This row said "two" until `21:02` was re-extracted: the frame advances the carousel and a third card enters from the right, and the check that asserted TWO would have reddened the correct build. See §7 |
| B | Per-person work preview cards — each showing its own person's work, asserted by seeding two people differently |
| B | Contextual starter cards that change with context — closed by `ai-answer-rendering.mjs`, 51 checks (frames `16:32` / `21:15`, four cards each and not one in common). Asserted as a DELTA, not an absolute: the suite creates two overdue tasks and requires "Find Blockers" to name exactly two more than before, because the e2e database is shared |

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

**174 rows: 145 built · 15 partial · 14 missing.**

THIS LINE READ `88 built · 21 partial · 64 missing` UNTIL 21 SEPTEMBER, and the
table under it read 104 / 20 / 49. Both summed to 173, so nothing looked wrong
at a glance and the disagreement survived several passes: the total had been
carried forward when §5's forty-one rows were recovered, and the split had not.
The table is the derivation — it shows where every row comes from — so the table
is what this line now repeats. Recorded rather than quietly corrected, because a
count is the one thing in this file that gets quoted without being checked, and
the next person to find two numbers should know which one moved.

AND THEN IT HAPPENED AGAIN, ONE LEVEL UP, WHICH IS WHY THE SPLIT MOVED TO
`136 · 15 · 23`. The table below used to credit §2 with `79 · 12 · 42` — the
split §2 had **when this table was written**. §2 has closed twenty-six rows
since, and none of them reached here. Worse, the §5 row beside it was being
kept LIVE, so the table was adding a stale number to a fresh one and
consolidating the result as though both meant the same thing. Nothing caught
it, because the guard checked that §2 contributed the right NUMBER OF ROWS —
133, which never moves when a row merely closes — and deliberately did not
check the split, on the reasoning that the split moves whenever work goes well.
That reasoning was the error: the split moves in §2 **and here**, together, so
checking it is exactly what keeps the two attached. It is now checked.

The `§6` row is gone from the arithmetic for the same reason, and its absence
is not a lost correction. §6's own last row says *"+ six rows built this
session — already moved in §2"*: the corrections were applied to §2's rows in
place, so they are inside the live §2 split already and adding them a second
time would double-count them. That is also why the old table never reconciled —
`79 · 12 · 42` plus `−6 · +4 · +2` is `73 · 16 · 44`, which is not what §2 held
at any moment.

Where every row comes from, both parts now live, so the number can be checked
rather than believed:

| | B | P | M | total |
| --- | --- | --- | --- | --- |
| §2, the sections table | 113 | 11 | 9 | 133 |
| §5, recovered from the frame observations | 32 | 4 | 5 | 41 |
| **consolidated** | **145** | **15** | **14** | **174** |

§2's 113 built includes the four marked `B*` — built, but the row also records
something the frame asks for that is not there. They are counted as built
because that is what they are; the asterisk is where the remainder is written
down.

Sixteen of §5's rows closed after it was written, each named with the suite
that proves it — see the `closed by:` line on the row itself. A row is not
moved here on the strength of the code having been written; it is moved when a
suite exercises it against a real API, a real Postgres and a real browser, and
the number beside it is that suite's check count.

THE COUNT GOES UP WHEN THE AUDIT GETS BETTER, and that is the normal direction.
The first audit compressed 116 frames into 14 items. This file reached 132 by
re-reading every frame. §5 adds 41 more that a later pass had found and that
were lost before they were written down. A row is not created by deciding to
build something; it is created by noticing that the frames already asked for it.

§6 is the part worth reading twice. Eighteen rows already in this file have the
wrong status, and four of them are marked **built** while being the mirror
defect — a value the product stores, validates, and then no reader honours.
Those are worse than a missing row: a missing row is visible, and a row like
`spaces.default_permission` leaves database columns standing as evidence for a
feature that does not exist.

§1's four items — shipped work that does not satisfy its frame — still come
first, and one of them is a control that does nothing.

---

## 5. Rows recovered from the frame observations

The front-load pass re-read every frame and added rows this file never
received, because that work was lost before it reached the file. These were
reconstructed from `docs/video2-frame-observations.md` (530 lines, 187
timecodes, all 22 sections) against the code, one section range at a time.

Each row states the timecode, what the frame actually draws, the transcript
line if she speaks to it, and file-and-line evidence for what Rundesk has
today. A row is a thing someone could build and test — not an adjective — and
candidates that duplicate an existing row are named and rejected inside each
range rather than silently dropped, so the count cannot be inflated by
re-deriving the same thing twice.

**41 rows recovered: 15 built · 5 partial · 21 missing — AS RECOVERED, which is
not the same number as §4's.**

THIS SPLIT IS A SNAPSHOT AND §4's IS LIVE, and until now nothing on this page
said so. §4's table credits §5 with **31 · 4 · 6**; the line above says
**15 · 5 · 21**. Both total 41, so the arithmetic guard passed and both
survived several readings — which is precisely how the 173-that-was-two-numbers
got as far as it did, recorded at the top of §4.

They are the same forty-one rows at two moments. Seventeen have closed since
this section was written — sixteen that were missing and one that was partial —
and seventeen is the whole difference:

| | B | P | M | total |
| --- | --- | --- | --- | --- |
| as recovered (this section, and the three appendices below) | 15 | 5 | 21 | 41 |
| closed since, each named on its own row by the suite that proves it | +17 | −1 | −16 | 0 |
| **live (what §4 credits §5 with)** | **32** | **4** | **5** | **41** |

Both numbers are kept rather than one being overwritten, because the
as-recovered split is what the three appendices below add up to, and a section
whose own sub-totals no longer match its heading is unreadable. `scripts/
check-video2-counts.mjs` now asserts every equality in that table, so the two
cannot drift apart again without the build saying so.

Read with §6 below: the same pass found eighteen rows already in this file
whose status is wrong, and four of those are marked built while being the
mirror defect — a stored value no reader honours.


### S01–S08 · `00:00`–`07:55`

# Recovered ledger rows — S01–S08 (`00:00`–`07:55`)

Source: `docs/video2-frame-observations.md` lines 1–210, re-read frame by frame,
cross-checked against `docs/video2-reaudit.md` §2 (S01–S06 and S07–S12 tables)
and `docs/video2-rundesk-gap-audit.md` (V2-01, V2-05, V2-06, V2-09, V2-10,
V2-13). Every status below was read off the code, not inferred from either doc.

Frames extracted and looked at for this pass: `00:05`, `00:50`, `00:52`,
`00:53`, `00:55`, `01:45`, `01:55`, `02:47`, `03:25`, `04:11`, `05:20`, `06:25`,
`06:35`, `07:10`, `07:15`, `07:40`, `07:45`, `07:50`, `07:55`.

---

### Create-modal Templates menu — four actions

- timecode: `00:52`
- the frame draws: the footer's `Templates` button opens a menu of four items in
  two groups. Group one: **Use Template**, **Create instantly from template**
  (cursor resting on it). Divider. Group two: **Save as template** (floppy
  icon), **Update existing template** (circular-arrow icon). The footer behind
  it still reads `Templates` · 📎 · 🔔 `1` · `Create Task ▾`.
- transcript: `[00:46]` *"yeh TEMPLATES, yaani ke ClickUp ki koi templates hain,
  waisa task aap create kar sakte ho"* and `[00:56]` *"is task ko bhi agar
  TEMPLATE save kar sakte ho, to baad mein aap ko sirf task ko template pe le
  jaane ki zaroorat hai."*
- rundesk today: one of the four. **Use Template** is a `<select>` in the create
  modal — `apps/web/src/components/quick-create-modal.tsx:1090-1104`
  (`data-testid="quick-create-template"`), instantiated on submit at
  `:529-533` via `POST /workspaces/:ws/task-templates/:id/instantiate`.
  **Save as template** exists but only on a task that already exists —
  `apps/web/src/components/task-detail-sheet.tsx:1212` → `SaveTaskAsTemplateDialog`
  (`apps/web/src/components/task-templates-section.tsx:445-520`) →
  `POST …/task-templates/from-task/:taskId`
  (`apps/api/src/modules/task-templates/task-templates.controller.ts:93-108`).
  **Create instantly from template** has no code path: the select only pre-loads
  the form, there is no one-press create.
  **Update existing template** has no code path at all — `PATCH
  /workspaces/:ws/task-templates/:id` (`task-templates.controller.ts:65-79`)
  accepts a `payload`, and nothing in `apps/web/src` ever snapshots a task into
  an existing template; the only web caller of that PATCH is the rename/describe
  dialog (`task-templates-section.tsx:227-232`).
- status: P
- defect class: none
- why not already a row: the ledger's `B | + Create new field on the create
  modal; 17 field types` and `B | Create-modal tab strip; …` cover the modal's
  other footer and header controls but never name Templates. The S13–S17
  row `P | Template Center — a page, not a modal` is the **browsing gallery** at
  frame `12:10`, a different surface with different actions; it says nothing
  about saving or updating a template from the thing you are making.

---

### Sidebar "My Tasks" section

- timecode: `00:05`, again at `06:25`
- the frame draws: in the tree pane, a section headed **My Tasks** with a person
  icon, containing **Assigned to me**, **Today & Overdue**, **Personal List**
  (with a count badge `1`, and selected), then `⋯ More`. It sits above the
  AI Chats section and below Meetings.
- transcript: silent
- rundesk today: absent — searched `apps/web/src/components/workspace-sidebar.tsx`
  (the nav-link block is `:1413-1669`; there is no My Tasks group), the i18n
  catalogue for `nav.myTasks` / `nav.assignedToMe` / `nav.todayOverdue`
  (`apps/web/src/lib/i18n/catalogs.ts` — none exist), and `apps/web/src/routes/`
  (no workspace-level tasks route). `packages/db/src/schema/personal-tasks.ts:6-12`
  describes personal tasks as *"shown under Home → Personal List"*, i.e. one
  card on Home rather than a navigable section.
- status: B
- closed by: sidebar-sections 25/25
- defect class: none
- why not already a row: the ledger's `B | Rail sections **Assigned to me** and
  **Today & overdue**` is the **Planner** rail at frame `13:05`
  (`RAIL_SECTIONS`, planner page) — a different surface, reachable only from the
  Planner, and it has no Personal List. `B | Skeletons on load; sidebar
  hierarchy; breadcrumb` covers the space/list tree, not a saved-views section.

---

### Sidebar "Channels" section with "+ Add Channel"

- timecode: `00:05`, `06:25`
- the frame draws: a section headed **Channels** listing `# General - Leo` (with
  a hover `⋯`) and `# Welcome`, then a `+ Add Channel` row. **Direct Messages**
  is a separate section directly beneath it (suleman, "Hamda Tahir — You",
  `+ New message`).
- transcript: `[06:21]` *"yahan saari chats show hoti hain — yeh group
  communication channels, direct messages, aur SPACES."*
- rundesk today: absent from the workspace tree. `workspace-sidebar.tsx` has a
  channel *icon* in a type map at `:117` and pinned-favourite handling at `:858`,
  and renders no channel list. Channels live on the chat page only —
  `apps/web/src/pages/workspace-chat-page.tsx:421-422` splits
  `publicChannels`/`dmChannels`, drawn by `chat-sidebar.tsx:584`.
- status: B
- closed by: sidebar-sections 25/25
- defect class: none
- why not already a row: the ledger has `P | Sidebar Direct Messages — exists on
  the chat page, not the workspace tree`, which is the **sibling** section. The
  frame draws two sections, not one, and she names both in the same sentence;
  public channels and DMs are different queries and different creation gestures
  (`+ Add Channel` vs `+ New message`).

---

### Track time — start / stop with a live-ticking elapsed timer

- timecode: `01:45`, and the field-grid cell at `01:20` / `04:11`
- the frame draws: at `01:20` and `04:11` the two-column field grid has a
  **Track time** row whose value is a ▶ button and `0h`. At `01:45` the control
  is running: a red dot and a live `00:00:01`, with the estimate beside it now
  reading `12h`. The activity feed at `04:11` carries *"You tracked time ⏱ 1m on
  7 Aug"*.
- transcript: `[01:44]` *"And then TRACK TIME: ab aap ne task start kiya — is ka
  timer start kar do, woh aap ka time record karna shuru kar dega."*
- rundesk today: built. `apps/web/src/components/task-detail-sheet.tsx:6466-6474`
  finds the open entry (`endedAt === null`) and runs a 1-second interval only
  while one exists; `:6562-6568` renders the running label with a live
  `formatDuration(nowMs - startedAt)`; `:6573-6588` is Stop / Start.
  Endpoints `POST /tasks/:id/time-entries/start`, `…/stop/:entryId`,
  `…/manual` at `:6478`, `:6490`, `:6501`.
- status: B
- defect class: none
- why not already a row: the S01–S06 table has no track-time row at all. The
  closest is `B | **Time estimate takes 12, 90m, 1h 30m** …`, which is the
  ESTIMATE — a different column, a different control, and the frame draws them
  side by side precisely because they are two things.

---

### Assign a checklist item to a person

- timecode: `02:47`
- the frame draws: each checklist item row carries a checkbox and, on hover,
  controls at the right of the row (an assign affordance and a `⋯`).
- transcript: `[02:47]` *"To woh yahan banti jayegi, aur main yeh different
  person ko ASSIGN kar sakti hoon."*
- rundesk today: built end to end.
  `packages/db/src/schema/checklists.ts:19` — `assigneeId` on
  `task_checklist_items`, `ON DELETE SET NULL`, with a relation at `:36`.
  `apps/api/src/modules/tasks/checklists.controller.ts:42-47` takes it on create
  and `:57` on PATCH.
  `apps/web/src/components/task-detail-sheet.tsx:3986-3987` is the per-item
  member `<select>` wired to `updateItemMeta`; `:4031-4046` passes an assignee on
  add, for both a named checklist and the default one.
- status: B
- defect class: none
- why not already a row: the ledger has three checklist rows — `B | "Add
  checklist" …`, `B | Checklist header open-item count`, `B | Activity names the
  item and the checklist it went into` — and none of them is assignment. It is
  the one checklist capability she says out loud, and the only one with a second
  person in it.

---

### Task types "Form Response" and "Meeting Note", and the provenance they stamp

- timecode: `03:25`
- the frame draws: the task-type picker listing **Task (default) ✓**,
  **Milestone**, **Form Response**, **Meeting Note**, with **Fill with AI** at
  the bottom. The frame-observations line itself flags these two as unchecked:
  *"⚠ video1 §1.1 already delivered Task/Milestone — Form Response and Meeting
  Note are the new ones to check."*
- transcript: `[03:26]` *"MILESTONE, FORM RESPONSE, ya MEETING NOTE se task
  create hue — kuch bhi. To yeh task types yahan show hoti hain."*
- rundesk today: built, including the half the picture does not show.
  `packages/db/src/schema/task-types.ts` — `DEFAULT_TASK_TYPES` seeds all four
  (Task, Milestone, Form Response `origin: 'form'`, Meeting Note
  `origin: 'meeting'`), and the `origin` column exists so the stamping survives a
  workspace renaming the type or running in Urdu (the comment cites `[03:26]`
  directly). `apps/api/src/modules/tasks/task-types.service.ts:206-215` keeps
  `tasks.isMilestone` in step with the type.
- status: B
- defect class: none
- why not already a row: the S01–S06 table's only task-type row is
  `M | Task type "Fill with AI"`. The S13–S17 row `B | Task menu: … Task type …`
  records that the *menu item* exists, not which types are behind it — and the
  two she names beyond Milestone are the two that are provenance rather than
  vocabulary, which is a different kind of claim to test.

---

### Activity feed search and filter

- timecode: `01:55` / `05:20` (the Activity panel header)
- the frame draws: the panel header reads **Activity** with three controls at its
  right: a magnifier, a bell carrying the count `1`, and a filter (three-bar)
  icon.
- transcript: silent (she speaks to the feed's content at `[03:41]`–`[03:51]`,
  not to these controls)
- rundesk today: neither the search nor the filter exists. The feed is a single
  unfiltered query — `apps/web/src/components/task-detail-sheet.tsx:6270-6280`
  (`GET /tasks/:id/activity`, no query parameters) and `:6303-6305`
  (`ACTIVITY_PREVIEW = 10` plus "Show more"). There is no search input and no
  action-type filter anywhere in that component. The bell **is** built —
  `:1140-1149` is the watcher button with its count.
- status: B
- closed by: task-activity-filter 15/15
- defect class: none
- why not already a row: the ledger's two activity rows are
  `B | Relative times in the activity feed + "Show more"` and `B | **Activity
  panel toggles to a rail**`. Both are about how the feed is *presented*; neither
  is about finding one entry in a long one, which is what the magnifier and the
  filter are for and the reason "Show more" is not a substitute.

---

### The composer posts as Comment **or** Email

- timecode: `04:11`
- the frame draws: the `Comment ▾` split button at the bottom-right of the task
  composer is open, showing a two-item menu — **Comment** (heading-weight) and
  **Email** (cursor on it, highlighted). The composer beneath holds typed text.
- transcript: `[04:11]` *"Aur yahan aap dekh rahe hain — main is ko EMAIL bhi kar
  sakti hoon."*
- rundesk today: absent, and the name is already taken by the opposite
  direction. There is no mode switch on the comment composer — searched
  `task-detail-sheet.tsx` for a composer mode, and `commentPlus.*`
  (`:6163-6226`) has nine items, none of them a send-as. The task menu's
  `task-menu-email` (`task-detail-sheet.tsx:1346-1352`) opens the task's
  **inbound** address — `GET /tasks/:taskId/email-address`
  (`apps/api/src/modules/tasks/tasks.controller.ts:434`), backed by
  `packages/db/src/schema/email-to-task.ts`, whose own comment says mail sent to
  it *becomes a comment*. Mail flows IN; nothing sends a composed body OUT.
- status: M
- defect class: none
- why not already a row: the ledger has `M | "Comment ▾" split button; "Create
  Task ▾" split button`, which files this as **chrome** — a button shape. The
  frame shows what is inside it, and the inside is a capability she names. And
  the S13–S17 row `B | Task menu: … Send email …` reads, from a row list, as
  though email were already covered; it is the reverse arrow.

---

### A voice note uploaded from a file renders as an inline player

- timecode: `04:45` (the inline player), enlisted at `[04:43]`
- the frame draws: the posted voice note as an inline player — play button,
  waveform, `00:01`, `1x`.
- transcript: `[04:43]`–`[04:45]` *"yeh voice note main download kar ke kisi ko
  bhi send kar sakti hoon; koi bhi voice note download kar ke yahan pe UPLOAD
  bhi kar sakti hoon — it's all up to me."*
- rundesk today: built, through the generic path. The comment composer's file
  input is `multiple` with **no `accept` filter** —
  `apps/web/src/components/task-detail-sheet.tsx:6054-6062`
  (`data-testid="comment-file-input"`) — and a comment attachment's presentation
  is decided from its MIME type: `apps/web/src/lib/composer-recording.ts:116-122`
  returns `'audio'` for anything `audio/*`, consumed at
  `task-detail-sheet.tsx:5058`. So an uploaded `.webm`/`.m4a`/`.mp3` renders with
  the same player a recorded one does.
- status: B
- defect class: the stale reason
- why not already a row: `docs/video2-rundesk-gap-audit.md` §V2-05 "Still open
  from this item" names *"a voice note uploaded from a file rather than recorded
  (`[04:43]`)"* as outstanding, so it was never promoted to a ledger row and the
  ledger's `B | Voice note, Transcribe, Insert as text, inline player,
  locale→speech language` covers only the RECORDING path. The recorded reason
  stopped being true once attachments were presented by MIME type; the row is
  closable and has been for some time.

---

### A clip link pasted into a comment renders as a player

- timecode: `05:35`
- the frame draws: the pasted clip in the comment composer as a **video card**
  titled "Stop Recording Guide" with a processing spinner, becoming playable
  (`00:00 / 00:16`) at `05:40`.
- transcript: `[05:29]`–`[05:36]` *"ab main is ko link copy karoongi aur main
  yahan bhi jaoongi aur PASTE kar doongi — to yahan pe woh Loom recording bhi aa
  jayegi."*
- rundesk today: absent — a pasted URL stays a URL. Searched
  `apps/web/src/components/task-detail-sheet.tsx` for `unfurl`, `onPaste`,
  `linkify` and a bare-URL pattern: nothing. Comment bodies render block markdown
  only, and only when the body actually contains block markdown (the rule
  recorded in `docs/video2-reaudit.md` §0 under *Slash commands in the comment
  composer*), so a pasted link is neither a card nor an anchor.
- status: M
- defect class: none
- why not already a row: the ledger's `B | Clip in a comment is a card with its
  name; a clip still arriving says so` is the ATTACHED clip — the blob that this
  composer recorded and posted through `Attach clip`. Arriving by link is a
  different input (no attachment row exists), and it is the path she actually
  demonstrates, because it is how a clip crosses from the Clips page into a task.

---

### Share a clip with somebody outside the space

- timecode: `05:25`–`05:30` (the "Clip created!" card), enlisted at `[05:42]`
- the frame draws: the **"Clip created!"** card with an inline player and
  **Create a task · New tab · Copy link**, then the button confirming
  **"Link copied"**.
- transcript: `[05:42]`–`[05:47]` *"Aur yeh kisi ko bhi show ho sakti hai —
  chahe woh aap ki space mein aaya ya nahi, us ko show ho jayegi agar aap bhej
  doge."*
- rundesk today: built, with all three audiences.
  `apps/api/src/modules/clips/clips.service.ts:92-137` — `share()` takes
  `mode: 'member' | 'external' | 'public'`, signs the object for up to seven days
  (`:107-108`), resolves a member's address from the workspace (`:114-124`) and
  mails an external recipient through `sendClipSharedEmail` (`:128-134`) with the
  expiry stated. UI: `apps/web/src/pages/workspace-clips-page.tsx:80` and
  `:471-488` (the three mode chips), `:115-117` (the payload).
  The composer's Copy link uses `mode: 'public'` with a 24-hour expiry —
  `apps/web/src/lib/clip-publish.ts:115-120`.
- status: B
- defect class: none
- why not already a row: the ledger's `B | **"Clip created!" card** — Create a
  task · New tab · Copy link, and "Link copied"` records the three BUTTONS. The
  claim she makes is about who can open what those buttons produce — a signed
  URL that works for a non-member, and an email path for somebody who has no
  account here. That is a permissions claim, not a button claim, and it is the
  one a check can actually fail on.

---

### List toolbar "Closed" toggle

- timecode: `05:20`, drawn again at `00:05` and `07:50`
- the frame draws: in the list toolbar's right-hand group, `Filter · ⊘ Closed ·
  ⚇ Assignee <avatar> · 🔍 · ⚙ Customize · Add Task`.
- transcript: silent
- rundesk today: built and wired to the request, not just the render.
  `apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx:1318`
  holds `showClosed`; `:396-409` drops rows whose `statusCategory === 'closed'`
  (or `status === 'done'`) when it is off; `:2492-2496` is the chip, labelled
  `list.closedShown` / `list.closedHidden`; `:2507` and `:5804` carry
  `includeClosed` into the export request so an export matches what is on screen.
- status: B
- defect class: none
- why not already a row: the ledger's `B | In-list search, Save-view chip, filter
  rules, nested groups, saved filter sets` enumerates the filter machinery and
  does not include this, and `M | "assigned to me" toggles — Comments · Subtasks
  · Checklists` is a different control on a different menu. Closed-vs-open is the
  one filter that is a chip of its own in the frame, beside Filter rather than
  inside it.

---

### List toolbar "Subtasks" chip — three modes

- timecode: `01:15`, `05:20`, `07:50`
- the frame draws: in the toolbar's left group, `Group: Status` · **Subtasks** ·
  `Columns`, the Subtasks chip carrying a caret.
- transcript: silent
- rundesk today: built, and the third mode really changes the request.
  `…$listId.tsx:1334-1335` (`subtaskMode` + `subtaskStamp`), `:2370-2412` — a
  `<details data-testid="list-subtasks" data-mode=…>` offering
  `collapsed` / `expanded` / `separate`
  (`data-testid="list-subtasks-collapsed|expanded|separate"`). `:1425-1429` puts
  `subtaskMode === 'separate'` in the React Query key and sends
  `includeSubtasks=true`, so it is a different fetch and not a client-side
  reshuffle. The `subtaskStamp` counter exists because "Expand all" is an action,
  not a state — the trap `docs/video2-reaudit-process.md` records as *"Bump a
  stamp, don't key on the value."*
- status: B
- defect class: none
- why not already a row: no ledger row names it. The process doc's own warning —
  *"A chip that reads 'Subtasks' with three options under it is three different
  features depending on what the third option does"* — is written about exactly
  this chip and was never turned into a row, so the third option's request-level
  behaviour had no line to be checked against.

---

### Create-menu footer — Import | Templates

- timecode: `06:40`
- the frame draws: the `+ Create` menu's footer strip, below the creatable
  types, reading **Import** | **Templates**.
- transcript: silent
- rundesk today: built.
  `apps/web/src/components/quick-create-modal.tsx:1693-1725` — a `Footer`
  component whose two buttons close the modal and navigate to
  `/app/$workspaceId/templates` and `/app/$workspaceId/import`. Its comment
  states the reasoning: both pages existed and *"nothing linked to them from the
  point where you decide to create something"*.
- status: B
- defect class: none
- why not already a row: the create-menu rows in the ledger are
  `M | Create-menu search "Describe anything to create"; Create with AI; Super
  Agent` and `M | "Form" absent from the create menu though the module exists` —
  both about the menu's BODY. The footer is a separate strip with two entry
  points, and the nearest thing to it in the ledger, `P | "+" on a space is a
  single action, not the 8-item menu`, is the space-row "+" at frame `08:00`,
  outside this range.

---

### The preset seeds the space's first list(s)

- timecode: `07:05`–`07:40`, spoken at `[07:46]`
- the frame draws: after **Create Space**, the sidebar shows `rundesk` with a
  child **List** already under it, and at `07:50` the list opens with view tabs
  `List | Board | Team | Calendar | Gantt | + View` — the preset's default views
  already applied to a list nobody made.
- transcript: `[07:46]` *"Ab space ke baad jo hai, yeh LIST automatically
  generate kar deta hai ClickUp. Theek hai — us base pe jo aap ne ooper di ho, ke
  haan mujhe marketing purpose ke liye chahiye."*
- rundesk today: built.
  `apps/api/src/modules/spaces/space-presets.ts:137` declares `seedLists`, and
  each preset names its own: Starter `['Tasks']` (`:170`), Marketing
  `['Campaigns', 'Content calendar']` (`:180`), Project Management
  `['Project plan', 'Milestones']` (`:188`), Product + Engineering
  `['Roadmap', 'Bugs']` (`:196`).
  `apps/api/src/modules/spaces/spaces.service.ts:255-262` creates them through
  `ListsService.createList`, deliberately the same path a hand-made list takes
  (`spaces.module.ts:10-11`), and `:227-232` records that a space with no seeded
  list is recoverable in one click while a half-created space is not.
- status: B
- defect class: none
- why not already a row: the ledger's `B | Space wizard: 4 presets, default
  views, statuses, ClickApps grid, per-space gating` enumerates five things the
  preset carries and this is a sixth. `docs/video2-rundesk-gap-audit.md` §V2-06
  calls it out as *"the consequence nobody would guess from a screenshot"* and it
  still never reached the ledger. It is also the only one of the six that is
  testable without opening the wizard at all: create a space, count its lists.

---

### "List" is a Required view and cannot be turned off

- timecode: `07:10`
- the frame draws: the "Default settings for views" panel, tabs **Required
  views** | **Default View Templates**, explainer *"Set up views that appear
  automatically in every Space, Folder or List — and can't be removed."* The
  **List** row carries a `Required` badge and the word `Default`; **Board** shows
  `Mark as default view` on hover; the rest (Calendar, Map, Activity, Team,
  Gantt, Mind Map, Table, Timeline, Workload) are plain toggles.
- transcript: `[07:10]` *"Mujh se pooch raha hai ke DEFAULT VIEW aap ko kya
  rakhna hai — jo abhi hai woh best hai."*
- rundesk today: built.
  `apps/web/src/components/create-space-wizard.tsx:280-306` —
  `const required = view === 'list'`, `const on = required || effectiveViews.includes(view)`,
  a `Badge` reading `spaceWizard.required` at `:290`, and the toggle
  `disabled={required}` at `:306`. So List is on, labelled as required, and
  cannot be switched off.
- status: B
- defect class: the stale reason
- why not already a row: `docs/video2-rundesk-gap-audit.md` §V2-06 item 3 says
  *"the shape is right, the step is missing, and **nothing marks List as
  un-removable**"* — and that sentence is why no row was ever written. The ledger
  carries only `P | View types — 5 of 11` and `M | "Default View Templates" tab`
  for this panel, neither of which is about the un-removable rung. Closable, and
  has been.

---

### "Turn off all ClickApps" master control

- timecode: `07:15`
- the frame draws: the **Enable ClickApps** step with a master **Turn off all
  ClickApps** control above the per-app cards (Priority · Sprints · Email · Tags
  · Custom Fields · Multiple Assignees · Time Tracking · Time Estimates · Remap
  Subtask Due Dates · Work in Progress Limits · **Show more**), some of them
  greyed.
- transcript: `[07:18]` *"yahan se pooch raha hai ke ClickUp APPS bhi kuch add
  kar sakte hain."*
- rundesk today: built, and it is careful about the locked ones.
  `apps/web/src/components/create-space-wizard.tsx:355-363` renders the
  `spaceWizard.turnOffAll` control; its comment at `:359-362` says it must not
  send the server a locked key and take a 403 for a switch the person cannot
  operate, so it clears only the allowed set. The plan-gated cards are drawn
  greyed with `data-locked` at `:377-383` and explained once at `:345-350`
  rather than on hover.
- status: B
- defect class: none
- why not already a row: the ledger has `P | ClickApps — 6 keys vs the frames'
  11` (a count) and `M | Plan-tier paywall UI; "uses have expired" metered
  state`. Neither is the master switch, which is a separate control with its own
  failure mode — the obvious implementation writes every key including the ones
  the plan withholds.

---

## Counts

**Recovered rows: 17** — **B 11 · P 1 · M 5**, AS RECOVERED.

This is what the pass found, not what is true today: rows in this range have
closed since, and §4's table is the live count. The three appendix blocks sum
to §5's as-recovered 15 · 5 · 21, which is the only thing they are meant to do.

| | rows |
|---|---|
| B | track time · checklist-item assign · Form Response + Meeting Note types · voice note uploaded from a file · clip shared outside the space · list "Closed" toggle · list "Subtasks" chip · create-menu footer · preset seeds the first list · List is a Required view · Turn off all ClickApps |
| P | create-modal Templates menu (1 of 4 actions in place) |
| M | sidebar My Tasks section · sidebar Channels section · activity feed search + filter · composer posts as Email · clip link pasted into a comment |

Two of the eleven B rows were **closable the whole time** because a reason
recorded in `docs/video2-rundesk-gap-audit.md` had gone stale: *a voice note
uploaded from a file* (§V2-05 "Still open") and *List is a Required view*
(§V2-06 "nothing marks List as un-removable").

---

## Existing ledger rows in S01–S08 I believe are misclassified: 4

1. **`B | Create-a-Space: icon+name, description, **Default permission**, Make
   Private`** — **wrongly marked built.** Default permission is *its mirror*.
   `spaces.default_permission` exists
   (`packages/db/src/schema/spaces.ts:40-44`, `notNull().default('edit')`), the
   wizard sets it (`create-space-wizard.tsx:240`, `:638`), the service validates
   it on create (`spaces.service.ts:189-204`) and on update (`:392-396`), and
   the controller declares it (`spaces.controller.ts:51,65,88`). **Nothing
   reads it.** `grep -rn defaultPermission apps/api/src` outside
   `spaces.service.ts` / `spaces.controller.ts` returns nothing, and no access
   check anywhere consumes `SpaceDefaultPermission`. The schema comment states
   the contract the product then breaks — *"What a workspace member gets on this
   space without an explicit grant"* — so the database is now evidence for a
   permission model that does not exist. The other three parts of the row (icon +
   name, description, Make Private) are genuinely built: Make Private writes
   `visibility: 'private'` (`create-space-wizard.tsx:239`), which the container
   visibility enum really is honoured by. The row should be split, with Default
   permission reopened.

2. **`M | Cover: Search tab (documented as deliberate); Gallery "Custom"
   swatch`** — the **Custom swatch half is built**.
   `apps/web/src/components/cover-image-picker.tsx:228-237`
   (`data-testid="cover-gallery-custom"`, a pipette), `:248-258`
   (`data-testid="cover-custom-input"`, a native `input[type=color]` with the hex
   echoed at `cover-custom-value`) and `:259-264`
   (`data-testid="cover-custom-apply"`), with strings `coverImage.custom` /
   `coverImage.useCustom` at `apps/web/src/lib/i18n/catalogs.ts:2189-2190`. Only
   the **Search** tab is absent. The row bundles a built thing with a missing
   one and reads as entirely missing.

3. **`P | View types — 5 of 11 (Map, Activity, Team, Mind Map, Timeline,
   Workload absent as list views)`** — stale, and self-contradicting within the
   same file. `SPACE_VIEW_KEYS` is
   `['list','board','table','calendar','gantt','team']` —
   `apps/api/src/modules/spaces/space-presets.ts:32` — i.e. **6 of 11**, and the
   ledger itself carries `B | **Team view** — a view type, ungated` eleven rows
   further down (§1 V2-13 records the build). Team must come out of the absent
   list; the remaining five are Map, Activity, Mind Map, Timeline, Workload.

4. **`B | Attachments "Drop files here" — the panel exists, **no drop
   handler**`** — the status is right; the evidence attached to it is stale and
   will send the next reader to reopen a closed row. `onDragOver` and `onDrop`
   are at `apps/web/src/components/task-detail-sheet.tsx:4804-4818`, on a zone
   that is both drop target and file picker
   (`data-testid="task-attachments-dropzone"`), guarding on
   `dataTransfer.types` rather than `files.length` — the comment at `:4776-4793`
   describes the earlier picture-of-a-drop-zone this replaced. A `B` row whose
   own text names a missing half is indistinguishable from a `P`.

### One wording correction, recorded rather than turned into a row

`M | Attachment thumbnail hover actions; attachments header view-toggle` — the
frame at `01:55` does **not** draw a view-toggle on the Attachments header. It
draws a **magnifier, an expand arrow and a `+`**. The `+` and the expand are
covered by what exists (the dropzone doubles as the add control); the magnifier
is a *search across a task's attachments*, which Rundesk has not got. I have not
opened a separate row for it, because the existing `M` row already claims that
header cluster and a second row would inflate the count — but the row's wording
should be corrected to "attachments header search", or the search will be
considered done when somebody adds a grid/list toggle.

### Checked and deliberately NOT recovered as rows

Named here so the next reader does not re-derive them:

- **Create modal: Space → Project → List chain, and a list is compulsory**
  (`[21:49]`, the seam) — built (`quick-create-modal.tsx:627-631`, submit
  disabled without `listId` at `:1159`), but the code cites `§G15 [21:49]` /
  `§G15-10`, i.e. it is a **video-1** row and already tracked there.
- **List private toggle and the default-view step on list create** (`[22:07]`,
  `[22:15]`) — built (`quick-create-modal.tsx:1197`, `ListSettingsStep` at
  `:1224`), both annotated `§G15`. Video-1 scope.
- **The description as a document editor — slash menu, tables, banners, images**
  (`[22:32]`) — built; `apps/web/src/lib/composer-blocks.ts:4` attributes the
  description's slash menu to `§G15 [22:28]` and only the comment composer's copy
  to `§V2-S05c`. Video-1 scope.
- **"Add subtask" below the fold** (`01:55`) — built; enlisted at video-1
  `[23:31]` alongside time estimate, dependency and checklist. Video-1 scope.
- **Sidebar "AI Chats" section** (`00:05`, `06:25`) — built
  (`workspace-sidebar.tsx:2722-2751`, `data-testid="ai-chats-section"`, titles
  from `useAiChatThreads`, which has no other call site). The ledger's
  `B | Skills; Recent Chats with auto-derived names` is almost certainly this
  very section under its other name, so a row here would be a duplicate.
- **"All Tasks" in the sidebar Spaces section** — the frame-observations line
  reads *"Spaces (All Tasks · Space · Team Space · + New Space)"*, but at `06:25`
  and `06:35` the Spaces group is below the fold and I could not read it off any
  frame. "Space" and "Team Space" are space names in this workspace, so "All
  Tasks" may be a third one rather than an everything-view. Not written as a row
  on a reading I could not make.
- **The space setup bar's five chips** (`07:50`) — read off the frame, the bar is
  one sentence, not five shortcuts: `Import: [Statuses] [Views] [Automations]
  [Custom Fields] from [Personal Space ▾] … Hide | Apply`. The chips are *what to
  copy*, so the existing `M | **Copy configuration from another space**
  ("from: `<Space>` · Hide · Apply")` covers the whole control. The
  frame-observations line at 207-209 reads them as independent shortcuts and
  should be corrected.
- **List toolbar `Group: Status`, `Columns`, `+ View`; the column header `⊕`** —
  all built (`…$listId.tsx:2435-2465`, `:2183`), and near enough to
  `B | Customize view: …` / `B | … nested groups …` / `P | View types` that
  separate rows would double-count.
- **Watcher count on the task (the 🔔 `1` in the Activity header)** — built,
  `task-detail-sheet.tsx:1140-1149` (`data-testid="task-followers-open"` plus the
  count badge); the ledger's task-menu `Follow` row covers the concept.
- **`P | Attach on create`** — re-checked and still accurate: single
  `File | null` with no `multiple` and no remove
  (`quick-create-modal.tsx:1112-1121`), uploaded after the task POST.
- **`B | Comment "+" menu — eight of the frame's ten items`** — re-checked and
  accurate: `commentPlus.*` renders nine items (assign, recordClip, mentionTask,
  addFile, slashCommands, addEmoji, newTask, newDoc, newWhiteboard) at
  `task-detail-sheet.tsx:6184-6226`, i.e. eight plus the separately-rowed slash
  commands, with Brain the tenth and absent.
- **`M | Space dialog footer "Use Templates"`** — re-checked and accurate: no
  `space_templates` table and no space-template service exist.


### S09–S15 · `08:00`–`14:55`

# Recovered rows — S09–S15 (`08:00`–`14:55`)

Range: `docs/video2-frame-observations.md:211–381`.
Ledger read: `docs/video2-reaudit.md` §2 tables "S07–S12" (lines 584–619) and
"S13–S17" (lines 621–661), plus §1, §3 and `docs/video2-rundesk-gap-audit.md`
§V2-07 / §V2-13 / §V2-14.

Every status below was checked against the tree at `39863ff`, not inferred.
Frames were re-extracted and read where the observations file was thin; two of
the rows below exist only because the frame draws something the observations
file never transcribed (`Card size`, `Card cover`).

---

### space "+" menu — Imports › and Templates
- timecode: `08:00` (re-read at `08:26` and `12:10`, where the menu is open with
  the cursor on Templates)
- the frame draws: a menu headed **Create**, ruled into three groups — **List**
  *"Track tasks, projects, people & more"* and **Folder** *"Group Lists, Docs &
  more"*; then Doc · Dashboard · Whiteboard · Form; then **Imports ›** (with a
  submenu chevron) and **Templates**. Eight items.
- transcript: `[12:04]` *"yahan par DOCUMENT, DASHBOARD, WHITEBOARD, FORMS,
  IMPORT — kuch aur cheezein hum kahin aur se [la] sakte hain"*, and
  `[12:10]`–`[12:17]` *"TEMPLATES wali cheez hai … yahan aap use kar sakte
  hain."*
- rundesk today: the menu exists and is eight items, but a different eight.
  `apps/web/src/lib/create-types.ts:82-91` lists nine `CREATE_TYPES` and
  `:95` derives `SPACE_CREATE_TYPES = CREATE_TYPES.filter(inSpace)` → task, doc,
  reminder, whiteboard, dashboard, list, folder, project. Rendered at
  `apps/web/src/components/workspace-sidebar.tsx:2032-2057`. Neither Imports nor
  Templates is a `CreateKind`, so neither can appear. Both destinations exist
  and are reachable elsewhere — `apps/web/src/pages/workspace-import-page.tsx`
  (route `app.$workspaceId.import.tsx`) and
  `apps/web/src/pages/workspace-templates-page.tsx` — just not from the point
  where somebody has decided to create something in this space.
- status: B
- closed by: sidebar-sections 25/25
- defect class: none
- why not already a row: `P | "+" on a space is a single action, not the 8-item
  menu` is the nearest, and it has been built — so it now reads as closed. The
  membership difference it leaves behind is three items, and only one of them
  (`M | "Form" absent from the create menu though the module exists`) has a row.
  Imports and Templates have none.

---

### Create Folder — failure is invisible, and folder names are not unique
- timecode: `08:25` (dialog) with `08:50`/`[08:55]` (the toasts it should raise)
- the frame draws: the **Create Folder** dialog, and forty seconds later two
  stacked bottom-left error toasts reading *"List name taken"*. The walkthrough
  treats the toast as the general answer to a failed create, not a list-only
  one.
- transcript: `[08:55]`–`[08:59]` *"Yahan pe na yeh ERROR de raha hai filhaal,
  lekin agar koi error aata hai to yeh yahan show kar deta hai."*
- rundesk today: two folder-create paths, and neither can report a failure the
  way the frame does.
  · `apps/web/src/components/quick-create-modal.tsx:1394-1404` — the dialog's
    mutation has `mutationFn` and `onSuccess` and **no `onError`**. This is
    exactly the defect commit `88830db` found and fixed on the List tab; the
    Folder tab beside it was not touched.
  · `apps/web/src/components/workspace-sidebar.tsx:446-457` — the sidebar's
    "New folder" is still `window.prompt` + `window.alert`, so the two paths
    disagree about whether a failure is even mentioned.
  · `apps/api/src/modules/folders/folders.service.ts:38-49` — `create` inserts
    whatever name it is given. No uniqueness check, and `grep` over
    `packages/db/src/migrations/*.sql` finds no folder equivalent of `0147`'s
    partial case-insensitive `(project_id, lower(name))` index. Three folders
    called "Clients" in one space are reachable today.
- status: B
- closed by: folder-create 20/20
- defect class: none — but note the shape: one rule ("a container's name is
  unique and a failure is announced") implemented for lists and not for the
  sibling container created by the same menu.
- why not already a row: `B | Error toasts bottom-left; **list names unique per
  project**; both create paths report failure` is the row, and every word of it
  is true *of lists*. The frame it is written against creates a **Folder**, and
  the ledger read "both create paths" as the two list paths. See also the
  misclassification list at the end.

---

### Calendar view — "Today"
- timecode: `09:35`
- the frame draws: the list's Calendar tab toolbar, left to right:
  **`Today`** · **`Month ▾`** · `‹` `›` · **August 2026**; on the right Filter ·
  Closed · Assignee · avatar · search · Customize · `Add Task ▾`.
- transcript: `[09:32]`–`[09:36]` *"CALENDAR [view] kya hota hai — ke aap ke
  calendar par [add] hota hai ke acha, is din woh task hai"* — silent on the
  button itself.
- rundesk today: `apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx:2855-2906`
  draws prev, a month/week toggle, an assignee select, the period label and
  next. There is no Today. `calendarMonth` (`:1392`) is initialised to
  `startOfMonth(new Date())` and is only ever moved by the two arrows
  (`:2858-2862`, `:2900-2904`), so once you have paged to March there is no
  control that returns you to the current period — you count back.
- status: B
- closed by: list-view-controls 49/49
- defect class: none
- why not already a row: `B | Calendar view, Gantt (today line, zoom, drag,
  critical path)` marks the calendar built and spends its detail on the Gantt.
  "today line" in that row is the Gantt's red rule, which is a different thing
  from a button that moves the viewport.

---

### Customize view — Card size
- timecode: `10:35`
- the frame draws: the Customize view panel, re-extracted and zoomed because the
  observations file starts its list at "Stack fields". Above that line the panel
  carries the view's icon and an **editable name field** ("Board"), then
  **`Card size   Medium ›`** and **`Card cover   Image ›`**, and only then Stack
  fields / Show empty fields / Collapse empty columns / More options.
- transcript: silent — `[10:53]` is about Export, which is further down the same
  panel.
- rundesk today: absent. `grep -rn "cardSize\|card-size"` over `apps/` and
  `packages/` returns nothing. `CustomizeViewPanel`
  (`.../$listId.tsx:5739-6017`) has the seven saved-view switches and the export
  block and no density control. Board cards are one fixed size:
  `VirtualizedBoardCards` (`.../$listId.tsx:4819-4852`) estimates every row at
  `BOARD_CARD_ESTIMATE_PX` and `BoardTaskCard` (`:4730-4815`) has no size prop.
  (The view NAME is editable — `renameSavedView` on the tab's own menu,
  `.../$listId.tsx:2020` — just not from this panel. That half is built.)
- status: B
- closed by: list-card-cover 26/26
- defect class: none
- why not already a row: `M | Customize: Stack fields, Show empty fields,
  Collapse empty columns` is the row for this part of the panel and it names
  three of the six controls above the rule. Card size and Card cover were never
  transcribed into `video2-frame-observations.md:239-241`, so no row could be
  derived from them.

---

### Customize view — Card cover, and the cover the list payload never carries
- timecode: `10:35`
- the frame draws: **`Card cover   Image ›`** in the Customize view panel,
  directly under Card size.
- transcript: silent
- rundesk today: absent, and absent one layer deeper than the panel.
  `BoardTaskCard` (`.../$listId.tsx:4730-4815`) renders a priority flag, the
  title, up to three labels, due date, subtask ratio, blocker count and
  avatars — no image. It could not render one if it wanted to:
  `apps/api/src/modules/tasks/tasks.service.ts:2561-2565` resolves `coverUrl`
  from `coverStorageKey` / `coverImageUrl` **only in the single-task read**;
  `getTasksByList` (`:2106`) selects neither column, so the cover a person set
  through `cover-image-picker.tsx` is invisible everywhere except the task
  sheet that set it.
- status: B
- closed by: list-card-cover 26/26
- defect class: its mirror — `tasks.cover_storage_key` / `cover_image_url` are
  written by a shipped, tested picker and read by exactly one surface.
- why not already a row: the S01–S06 table has `B | Cover: Gallery / Upload /
  Link / Attachments / Remove, Reposition, Change cover`, which is true of the
  picker and says nothing about where a cover is then shown; and `B | Board
  view: status lanes, colours, counts, per-lane add, drag between lanes, + Add
  group` reads as if the board card were finished. Neither names the cover on
  the card.

---

### List view — "+ Add Task" inside a group
- timecode: `10:52` (re-extracted; the observations cite `10:50`, which is still
  the board)
- the frame draws: the List tab grouped by status. Each group is a collapsible
  header (`▾ COMPLETE 1`, `▾ TO DO 0`), then its own column header row (Name ·
  Assignee · Due date · Priority), then its rows, then **`+ Add Task`** inside
  the group. The empty `TO DO` group still offers it.
- transcript: silent
- rundesk today: group headers with counts and collapse are built —
  `.../$listId.tsx:3208-3236` (chevron, colour dot, label, `groupTasks.length`)
  — and there is no add control inside a group. Tasks are created from the
  quick-add at the top of the list (`quickAddRef`, `.../$listId.tsx:2656`) or
  from Add Task, and both land in the list's default status. Creating into a
  named group without leaving the list is not possible; grouping by priority
  (`:3157`) or assignee (`:3094`) has no equivalent anywhere.
- status: B
- closed by: list-view-controls 49/49
- defect class: none
- why not already a row: `B | Board view: … **per-lane add** …` is the nearest
  and it is the board. On the board a lane is a drop target and a creator; in
  the list the same grouping is read-only.

---

### An empty list that says the wrong thing when a filter emptied it
- timecode: `11:30`
- the frame draws: the list with the Me-Mode popover open (*"Tasks where I have
  assigned"* · Comments · Subtasks · Checklists) and, behind it, the body:
  an illustration, **"You don't have any tasks assigned to you."** and
  **"To see all tasks, <u>turn off Me Mode.</u>"** — the empty state names the
  filter that emptied it and links to the undo.
- transcript: `[11:28]` *"ASSIGNEE — aap ko ya aap ke alawa [kisi aur ko]"*
- rundesk today: `.../$listId.tsx:1604-1612` computes `visibleTasks` by running
  `filterTasks(tasks, statusFilter, columnFilters, taskSearch, filterRules, …)`,
  and `:2647-2657` branches on `visibleTasks.length === 0` to print
  `t('list.noTasksYet')`, the hint *"press C to add the first"* and a **Create
  task** button. So a list holding five hundred tasks, with one word typed into
  the in-list search that matches none of them, tells you the list is empty and
  invites you to create the first one. Nothing on that screen names the search,
  the assignee select or the filter rules, and nothing clears them.
- status: B
- closed by: list-empty-states 23/23
- defect class: the confident zero — the verdict "there is nothing here" is read
  off the filtered set and reported as a fact about the list.
- why not already a row: `B | In-list search, Save-view chip, filter rules,
  nested groups, saved filter sets` marks the filtering built, which it is, and
  `M | "assigned to me" toggles — Comments · Subtasks · Checklists` takes the
  popover in this same frame. The body of the frame — the empty state and its
  escape — falls between them. (Me Mode itself is NOT raised here: the outcome
  is reachable through the Assignee select's "Me" option,
  `.../$listId.tsx:2286`, and its three sub-toggles already have a row. One
  recovered row, not three.)

---

### Template Center — Tags and Created-by facets
- timecode: `12:14`
- the frame draws: the Template Center modal. Top row: search box, then three
  facet buttons — **Use Cases** · **Tags** · **Created by**. Left rail: Featured
  / Workspace Templates / ClickUp Templates, then Template Types (seven
  checkboxes, with Folder and List pre-ticked from the context it was opened
  from), then Complexity.
- transcript: `[12:10]`–`[12:17]` *"TEMPLATES wali cheez hai — woh ClickUp ki
  templates hain … yahan aap use kar sakte hain."*
- rundesk today: the page now has the type, complexity, category and use-case
  facets and the scope rail — `apps/web/src/pages/workspace-templates-page.tsx:304-320`
  (the single top facet, Use Cases) and `:364+` (the rail). The server counts
  them at `apps/api/src/modules/project-templates/project-templates.service.ts:506-518`
  over `targetType`, `complexity`, `category`, `useCase` and `isBuiltIn` —
  and over nothing else. **Created by is absent although the column is not**:
  `packages/db/src/schema/templates.ts:86` stores `createdById` and `:103-104`
  declares the `createdBy` relation to `users`; `grep -n "createdBy"` over the
  page returns nothing, and no query reads it back. **Tags are absent entirely**
  — no column, no join table, no UI.
- status: M
- defect class: its mirror, for the Created-by half — `project_templates.created_by_id`
  is written on every save (`project-templates.service.ts:635`, `:674`, `:803`)
  and read by no surface.
- why not already a row: `P | Template Center — a page, not a modal; no type
  facet, complexity, use-cases, categories` enumerates the missing facets and
  stops at four. The frame's top row has three buttons, and only the first of
  them is on that list.

---

### "Sync now" on the planner, and the scheduler the comment claims
- timecode: `14:36` (the planner header, re-extracted and zoomed; the
  observations file records the header at `13:05` without its icons)
- the frame draws: the planner's top-right cluster — `Week ▾` · an AI-notes
  icon · a calendar icon carrying the count **1** · a **circular-arrows refresh**
  · a **⚙**. The refresh sits on the planner itself, beside the view span.
- transcript: silent
- rundesk today: no such control. `grep` for `RefreshCcw|RefreshCw|planner-sync`
  over `apps/web/src/pages/workspace-planner-page.tsx` returns nothing, and the
  page's full testid list has no sync entry. Inbound sync exists but has one
  door: `pullEvents` (`apps/api/src/modules/calendar-sync/calendar-sync.service.ts:146`)
  has exactly one caller, `calendar-sync.controller.ts:103-108`; the only web
  caller is `apps/web/src/components/calendar-sync-wizard.tsx:66`; and that
  wizard is mounted in exactly one place,
  `apps/web/src/pages/workspace-integrations-page.tsx:445`. So an event added in
  Google Calendar reaches the planner only if somebody navigates to Settings →
  Integrations and presses a button. There is no `@Cron` in the calendar-sync
  module.
- status: M
- defect class: none for the missing control — but the service's own header,
  `calendar-sync.service.ts:25`, reads *"Inbound: a **manual or scheduled**
  `pullEvents` call fetches recent events"*, and nothing in the repository
  schedules it. A reader checking whether inbound sync keeps itself current is
  told that it does.
- why not already a row: `B | Connect Google / Outlook; **two-way scope**; drag
  task → block; prefix applied` is the row, and "two-way scope" is about the
  OAuth grant frame `13:00` shows — read/write permission, which Rundesk does
  request. The row was read as meaning two-way sync. See the misclassification
  list.

---

### Drag a list or project into a folder in the sidebar tree
- timecode: `08:35`
- the frame draws: the sidebar showing `rundesk › rvhsiv (folder) › List`, with
  the breadcrumb mirroring it — a list that has been put inside a folder after
  the fact.
- transcript: `[08:23]` *"[Kuch] cheezein folder mein **MOVE** kar sakti hoon —
  **DRAG AND DROP** ka option hai."* Named outright.
- rundesk today: the destination logic and the endpoint exist; the gesture does
  not. `apps/web/src/components/move-dialog.tsx:76-136` flattens the space tree
  into destination rows and calls `PATCH /projects/:id` with `{ spaceId,
  folderId }` (`:133`) or `POST /spaces/:id/folders/:id/move` (`:125`), against
  `apps/api/src/modules/projects/projects.controller.ts:56-62`. But
  `grep -n "draggable\|onDragStart\|onDrop\|useDraggable\|useDroppable\|DndContext"`
  over `apps/web/src/components/workspace-sidebar.tsx` returns **nothing** — the
  tree has no drag at all. (The list route has dnd-kit for the board and HTML5
  drag for the calendar; the sidebar has neither.)
- status: B
- closed by: sidebar-sections 25/25
- defect class: none
- why not already a row: `B | Skeletons on load; sidebar hierarchy; breadcrumb`
  covers the frame's *picture* — the hierarchy is drawn correctly — and nothing
  in the ledger covers rearranging it. `P | Create Folder …` is about the create
  dialog, not about putting anything into the folder afterwards.

---

### Calendar Automations — which tasks sync, to which calendar
- timecode: `14:32` (the page the observations cite at `14:30`; at `14:30` the
  Notetaker page is still up and the cursor is over the Automations item)
- the frame draws: **Automations — "Connect to other tools to keep things in
  sync."** One card: **"Sync ClickUp tasks to Google Calendar"** with the note
  *"Doesn't use any of your workspace automation credits."* Under it the empty
  state **"Nothing's syncing yet — Pick a list, folder, or space — we'll send
  its tasks to a Google Calendar."** and a **+ Add sync** button.
- transcript: `[14:29]`–`[14:38]` *"AUTOMATIONS aap build up kar sakte ho …
  yeh aap ko baad mein bataoongi, end mein."*
- rundesk today: the sync is real and it has no scope and no off switch.
  `apps/api/src/modules/tasks/tasks.service.ts:196-202` — `fireCalendarPush` is
  called on task writes and does `void this.calendarSync.pushTask(taskId)`.
  `calendar-sync.service.ts:71-102` then upserts an event on **every** connected
  connection in the workspace for **every** task that has a `dueDate` and is not
  archived. `packages/db/src/schema/calendar-sync.ts` holds `task_calendar_links`
  (the id map) and `user_ical_tokens` and no rule table, so there is nowhere to
  record "this list, that calendar". `planner-settings-dialog.tsx:155-163`
  carries five pages and no Automations page. The frame's default state is
  "nothing is syncing"; Rundesk's is "everything is, and there is no page that
  says so".
- status: P
- defect class: none
- why not already a row: §3 of the ledger parks **Automations** on `[14:29]`,
  and that parking is about the automation *builder* she promises to return to.
  What this page actually contains is one calendar-sync rule with a scope
  picker, and `B | Connect Google / Outlook; two-way scope; drag task → block;
  prefix applied` reads as if that were finished. Raised deliberately as a
  contested row: if the schedule prefers to keep §3's parking whole, drop it and
  fold the finding into the misclassification below.

---

### Create Folder — "Select a Location"  *(verifying as built)*
- timecode: `08:25`
- the frame draws: inside the Create Folder dialog, under Name and Description,
  **"Select a Location"** — a dropdown currently reading `rundesk`.
- transcript: silent
- rundesk today: built.
  `apps/web/src/components/quick-create-modal.tsx:1415` — a `Select` with
  `data-testid="quick-create-folder-space"`, options from the workspace's
  spaces, and the submit disabled until one is chosen (`:1418`). Opened from a
  space row it arrives pre-selected (`initialSpaceId`, `:1387`).
- status: B
- defect class: none
- why not already a row: `P | Create Folder — no description column, no private
  toggle in the dialog, no templates` lists what the dialog lacks and never
  names the one row of it that Rundesk has. A bare P leaves a reader to assume
  the location picker is missing too.

---

### Calendar view — the per-day "+"  *(verifying as built)*
- timecode: `09:35`
- the frame draws: a month grid whose cells carry a small **`+`** beside the day
  number.
- transcript: silent
- rundesk today: built, and built through to a task.
  `.../$listId.tsx:2942-2956` renders a `+` per cell (revealed on
  `group-hover/day`, `aria-label` `list.calendar.addTaskAria`) which opens an
  inline title input at `:2975-2992`; Enter calls `createTaskOnDay(day, title)`
  and Escape closes it. The cells are also drop targets — `:2925-2936`
  reschedules a dragged task onto that day.
- status: B
- defect class: none
- why not already a row: `B | Calendar view, Gantt (today line, zoom, drag,
  critical path)` bundles the whole calendar into two words, so nothing records
  that the frame's per-day create is among the parts that exist.

---

### List toolbar — Sort  *(verifying as built)*
- timecode: `09:20` (toolbar) and `10:35` (`Sort   None ›` in the Customize
  panel)
- the frame draws: a **`Sort`** control in the view toolbar on both the Board
  and List tabs, and a `Sort` row in the Customize view panel showing its
  current value.
- transcript: silent
- rundesk today: built, in the toolbar rather than the panel.
  `.../$listId.tsx:2294-2313` — a field select (Created · Due date · Priority ·
  Title · Status · Assignee) plus a direction toggle button with
  asc/desc `aria-label`s. Column headings sort too (`SortHeaderButton`,
  `:623-624`, handler `:1622`), and the choice is restored from a saved view's
  config (`:1664-1671`), including the legacy `sortBy` string.
- status: B
- defect class: none
- why not already a row: no row in either §2 table for S09–S15 mentions Sort at
  all — the customize-panel rows split into the seven saved-view switches (B)
  and the three display toggles (M), and Sort is in neither list.

---

### Calendar settings — Default calendar and Busy calendars  *(verifying as built)*
- timecode: `13:45`
- the frame draws: the Accounts page — a connected-account row with ✅Connected
  and a `···`, **+ Add account**, **Default calendar** *"Select the calendar
  that will be used as the default calendar"*, **Busy calendars** *"These
  calendars decide when you're busy. We plan work and suggest free slots around
  them."* reading "1 calendar", and **Conferencing → Zoom / Connect**.
- transcript: `[13:32]`–`[13:38]` *"'Manage Account' pe click karoongi to yahan
  bhi aap ko 'Add Account' … aur jitna chahoon main add kar sakti hoon."*
- rundesk today: built, and the busy flag is genuinely read.
  `apps/web/src/components/planner-accounts-page.tsx:133-171` gives each account
  a default control (radio in behaviour — the current default renders as a
  state, not a switchable-off toggle) and a `counts as busy` pill, with
  `+ Add account` at `:180+`. Server side
  `apps/api/src/modules/calendar-sync/calendar-accounts.service.ts:202-214`
  selects on `countsAsBusy = true` and `status = 'connected'`, and `:230-245`
  uses that set to build free/busy windows. Not a stored flag nobody honours.
- status: B
- defect class: none
- why not already a row: `P | Calendar settings — 4 of 7 pages` counts pages, and
  `M | Conferencing / Zoom connect row` takes the one control on this page that
  is missing. The three that are present and working are unrecorded, so a reader
  of the P row cannot tell which parts of the Accounts page exist.

---

## Counts

**15 recovered rows — 4 B · 2 P · 9 M, AS RECOVERED.**

Same caveat as the S01–S08 block above: several of these have closed — the
space "+" footer and Create Folder's error path among them — and §4's table is
where the live count lives.

| | row |
|---|---|
| M | space "+" menu — Imports › and Templates |
| M | Create Folder — failure is invisible, and folder names are not unique |
| M | Calendar view — "Today" |
| M | Customize view — Card size |
| M | Customize view — Card cover, and the cover the list payload never carries |
| M | List view — "+ Add Task" inside a group |
| M | An empty list that says the wrong thing when a filter emptied it |
| M | Template Center — Tags and Created-by facets |
| M | "Sync now" on the planner, and the scheduler the comment claims |
| P | Drag a list or project into a folder in the sidebar tree |
| P | Calendar Automations — which tasks sync, to which calendar |
| B | Create Folder — "Select a Location" |
| B | Calendar view — the per-day "+" |
| B | List toolbar — Sort |
| B | Calendar settings — Default calendar and Busy calendars |

One of the P rows (**Calendar Automations**) is contested against §3's parking of
Automations at `[14:29]`; the row says so in its own body. If it is dropped the
count is 14 — 4 B · 1 P · 9 M.

### Considered and NOT raised, to stop the next pass re-finding them

- **Me Mode** (`11:30`) — the outcome is reachable through the Assignee select's
  "Me" option (`.../$listId.tsx:2286`) and its three sub-toggles already have a
  row. Only its empty state is raised, once.
- **⊕ at the end of the column header row** (`10:52`, `11:25`, `12:10`) — the
  Columns chip's panel already carries a create-field form
  (`.../$listId.tsx:2566-2610`, with a toast on both outcomes at `:1457-1465`).
  A second entry point to the same creator is an affordance, not a row.
- **"Templates" in the Customize view panel** (`10:35`) — view templates. Same
  feature family as `M | "Default View Templates" tab`, which is already a row
  (and sits in S08, outside this range).
- **"More options ›"** in the same panel — the frame never opens it. There is no
  behaviour to build against.
- **"Featured" as a third rail position** (`12:14`) — Rundesk's rail is
  `all | builtin | custom` (`workspace-templates-page.tsx:324-345`), which
  carries the frame's Workspace-vs-stock split. "Featured" is a curation of the
  stock set; too thin to test.
- **Toast stacking** (`08:50`, `14:30` — both frames show two at once) — Sonner
  stacks by default; `packages/ui/src/components/toaster.tsx` already pins
  `position="bottom-left"` against these exact frames.
- **The default status set** (`09:20`, `[10:03]`–`[10:21]`: TO DO · PLANNING ·
  IN PROGRESS · AT RISK · UPDATE REQUIRED · ON HOLD · COMPLETE · CANCELLED) —
  statuses are per-list and editable (`list-statuses-manager.tsx`), and the
  seeded set is a preset choice already inside `B | Space wizard: 4 presets,
  default views, **statuses**, ClickApps grid, per-space gating`.
- **Everything the brief lists as rebuilt this session** — verified present, not
  re-raised: the wizard's views, ClickApps plan gating, the space "+" menu
  itself, the Template Center facets and category sections, the importers
  (`spreadsheet-import.service.ts`), the planner settings pages
  (`planner-settings-dialog.tsx:155-163`, five of seven; the other two are §3),
  the five appearance toggles (`:480-509`), the Upcoming meeting page
  (`:628-655`), the Gantt controls, and the plan paywall wired to Team view and
  board export with list export free (`.../$listId.tsx:5756-5760`, `5919-5921`,
  `5790-5799`).

### Existing ledger rows in this range I believe are misclassified — 2

1. **`B | Error toasts bottom-left; list names unique per project; both create
   paths report failure`** → should be **P**. Every clause is true of lists and
   none is true of folders, and the frame it is written against (`08:25`, with
   `[08:55]` spoken over it) creates a folder.
   `quick-create-modal.tsx:1394-1404` has no `onError`;
   `workspace-sidebar.tsx:446-457` uses `window.alert`;
   `folders.service.ts:38-49` accepts duplicate names with no index behind it.
   "Both create paths" was read as the two list paths.

2. **`B | Connect Google / Outlook; two-way scope; drag task → block; prefix
   applied`** → should be **P**. "Two-way scope" is accurate about the OAuth
   grant of frame `13:00` (Rundesk does request read/write), but the row reads
   as two-way *sync*, and inbound sync is a button on a different page:
   `pullEvents` (`calendar-sync.service.ts:146`) has one caller, reachable only
   from the wizard mounted at `workspace-integrations-page.tsx:445`, and no
   `@Cron` runs it — while the service's own header at `:25` says "manual **or
   scheduled**".

### Under-described `B` rows — 2 (not miscounted, but they hide the rows above)

- **`B | Calendar view, Gantt (today line, zoom, drag, critical path)`** spends
  its whole detail budget on the Gantt. The calendar half is two words and
  covers a toolbar that is missing Today and a grid that has the per-day create
  the row never claims.
- **`B | Board view: status lanes, colours, counts, per-lane add, drag between
  lanes, + Add group`** reads as a finished board card. Frame `10:35` puts Card
  size and Card cover at the top of the panel that configures it, and the cover
  a shipped picker writes never reaches the list payload.


### S16–S22 · `15:00`–`21:55`

# Recovered rows — S16 through S22

Range: `docs/video2-frame-observations.md:382–530`, timecodes `15:00`–`21:55`.
Every status below was read off the current working tree (branch
`claude/peaceful-mayer-zxpP7`, HEAD `39863ff`), not off the recon notes, which
were taken at base `5b30bd1` and are stale in six places.

Frames re-extracted and read: `15:17`, `15:18`, `15:19`, `15:20`, `15:22`,
`15:25`, `15:28`, `15:30`, `15:32`, `15:35`, `15:38`, `15:45`, `15:50`, `15:55`,
`16:00`, `16:05`, `16:10`, `17:16`, `18:45`, `18:48`, `18:51`, `20:10`, `21:00`.

---

## Recovered rows

### AI cannot create a list, folder or space
- timecode: `17:55` → `18:10` → `18:45` → `18:48`
- the frame draws: at `18:45` the answer is headed **Handling** over a two-step
  log — *"Checking the rundesk setup"*, *"Creating the new rundesk list"*. At
  `18:48` it settles to *"Done, created `▤ rundesk > ddddd` in rundesk with
  standard task statuses. Use the `☰ rundesk > ddddd > List` for task details or
  the `▣ rundesk > ddddd > Board` to manage work by status."* The AI has written
  a container into the workspace and named the views it made.
- transcript: `[17:55]` she types *"create a folder name as ddddd on rundesk
  space"*; `[18:09]` *"aap ko pata bhi rahega ke main kya kar rahi hoon — same
  like Claude"*.
- rundesk today: absent. `apps/api/src/modules/ai/ai-command.ts:134-210` defines
  `COMMAND_TOOLS` as exactly six tools — `search_tasks`, `create_task`,
  `set_task_status`, `reschedule_task`, `assign_task`, `bulk_reschedule` — all
  task-scoped. `grep -rn "create_list\|create_folder\|create_space" apps/api/src/modules/ai/`
  returns nothing. The tools are wired at one call site,
  `apps/api/src/modules/ai/ai.service.ts:2947`, which is the `/ai/command` path;
  `chatStream` (`ai.service.ts:1467-1575`) passes **no `tools` array at all**,
  so the Ask surface — the one the frames use — cannot act on anything.
- status: B
- closed by: ai-create-containers 33/33
- defect class: none (honest absence)
- why not already a row: the ledger's S18–S22 block has `B | **Live step log**`
  and `B | **"No changes made."**; … **Follow ups**`, which are the *narration*
  of an action, and `M | Success message with clickable path chips`, which is
  the *rendering* of its result. Nothing anywhere in the ledger says the AI can
  bring a container into existence. `M | "⚡ Assign with AI"` in S13–S17 is the
  only tool-surface row and it is about assignment.

### AI answers render markdown
- timecode: `18:48`, `20:10`
- the frame draws: `20:10` — *"**Project status:** 13 open tasks total: **11 To
  Do, 1 In Progress, 1 Complete**. The biggest block is six high-priority
  onboarding tasks due **Aug 7 to Aug 11**:"* with four distinct bold runs inside
  one paragraph. `18:48` bolds the three path chips' text the same way.
- transcript: silent on the formatting.
- rundesk today: plain text.
  `apps/web/src/components/ai-panel.tsx:992-1000` renders a settled answer as
  `{message.content}` inside a `whitespace-pre-wrap` div; the streaming bubble at
  `:664-672` does the same. There is no markdown import in the file
  (`grep -n "^import" … | grep -i markdown` → nothing), although
  `apps/web/src/components/markdown.tsx` exists and the comment composer already
  uses it. Line breaks survive; every other mark does not.
- status: B
- closed by: ai-answer-rendering 30/30
- defect class: the duplicated list — one product with a block-markdown renderer
  already built and shipped for comments, and a second answer surface that
  re-implements "show the text" as string interpolation.
- why not already a row: `B | Comment bodies render block markdown` sits in the
  S01–S06 block and is about the *comment* composer. No S18–S22 row mentions how
  an AI answer is rendered. This is also the prerequisite the two chip rows
  (below, and the ledger's existing path-chip row) both sit on top of.

### Inline task chips with a live status badge in an AI answer
- timecode: `20:10`
- the frame draws: after *"…due Aug 7 to Aug 11:"* the answer continues into a
  row of six grey chip skeletons that hydrate into task references, and the
  observation for the settled state reads *"`vjgkgkg` **COMPLETE** is marked
  complete"* — each chip carries the task's status badge, inline in the prose.
- transcript: silent.
- rundesk today: absent. The answer is a string
  (`apps/web/src/components/ai-panel.tsx:999`); there is no reference syntax in
  the stream (`chatStream` writes only `{delta}`, `{step}`, `{followUps}`,
  `{error}` — `apps/api/src/modules/ai/ai.service.ts:1533-1560`) and no
  hydrating component. `apps/web/src/components/mention-text.tsx` resolves
  `@`-mentions in comments and is not reachable from the AI panel.
- status: B
- closed by: ai-answer-rendering 30/30
- defect class: none
- why not already a row: the ledger has `M | Success message with clickable path
  chips (rundesk › ddddd › List)`, which is the **container** chip from `18:48`.
  A task chip is a different entity and needs a status read the path chip does
  not. **Estimate these two as one embed mechanism plus one extra renderer**, not
  as two independent builds — the schedule should not count the mechanism twice.

### A project-status answer with a real per-status breakdown
- timecode: `19:50` → `20:10`
- the frame draws: the **Project Status** starter card is clicked, the user turn
  reads *"Project Status (Summarize all current tasks)"*, the step log reads
  *"Pulling your active task list"* then *"Double-checking the live open-task
  count"*, and the answer opens with *"13 open tasks total: 11 To Do, 1 In
  Progress, 1 Complete"* — a whole-workspace count broken down by status.
- transcript: silent at this point; the card's own subtitle is the spec.
- rundesk today: partial and differently scoped.
  `apps/api/src/modules/ai/ai.service.ts:1622-1722` builds the chat's context;
  `formatWorkspaceContext` (`ai.service.ts:117-162`) emits one line
  `Workspace totals: N spaces, N projects, N lists, N open tasks` and then **only
  the caller's own** assigned tasks, capped at 15 (`:137-148`). There is no
  per-`statusCategory` count anywhere in the context, and no list of anybody
  else's work. Asked to "summarize all current tasks", the model has one total
  and fifteen of your own rows to do it from.
- status: P
- defect class: none — but note the shape: a single aggregate labelled
  "Workspace totals" sitting beside a personal list is one edit away from being
  summarised as if it were the personal list's breakdown.
- why not already a row: the ledger's only starter-card row is
  `M | Contextual starter cards that change with context`, which is about the
  cards changing (`21:05`), not about what one of them can truthfully answer.

### The AI acts inside a connected app
- timecode: `19:05`
- the frame draws: App Center → **Connections**, headed *"Use AI to search, ask,
  and take action across your connected apps."*, over twelve connectors each with
  a one-line capability description, plus a **Connected Search** category and the
  **Connect Custom MCP Servers** banner.
- transcript: `[19:02]`–`[19:22]` — *"yeh software aap ke un softwares ko bhi
  ACCESS kar sakta hai jin ko aap ne link kiya ho … meri MEETING BOOK kar do …
  Gmail pe jaa ke EMAIL kar do"*. This is enlisted out loud, not just drawn.
- rundesk today: absent, and the product already says so.
  `COMMAND_TOOLS` (`apps/api/src/modules/ai/ai-command.ts:134-210`) has nothing
  that reaches a connector; `apps/api/src/modules/ai/ai-categories.ts:74-77`
  marks `externalActions` and `externalSearches` `supported: false` with
  `aiValue.reasonNoConnectedAppActions` / `…Search`, and the panel prints the
  reason instead of a number. The plumbing for at least one of the two exists
  independently — `apps/api/src/modules/calendar-sync/calendar-sync.service.ts:426-427`
  already POSTs events to `calendar/v3/calendars/…/events` — the AI simply has no
  door to it.
- status: M
- defect class: none. The reason in `ai-categories.ts` is **not** stale: it says
  "nothing in `COMMAND_TOOLS` reaches a connected app", which is literally true
  as written, and the tile is honest about it.
- why not already a row: `B | App Center with categories, per-app descriptions,
  connection health` covers the *directory*; `P | Apps — Box, Confluence, Jira …
  absent` covers *which* connectors are listed; `M | "+ Suggest an app";
  "Connect Custom MCP Servers" banner` covers two controls on that page. None of
  the three is about an AI turn doing anything in a connected app, which is the
  whole claim of the frame's own headline and of `[19:02]`.

### Create a custom field from an open task
- timecode: `15:20` ("Add fields") and `15:30` ("Custom Fields" in the `···` menu)
- the frame draws: under the description, a stacked action row — **Add fields ·
  Add subtask · Relate items or add dependencies · Create checklist · Attach
  file**. The `···` menu at `15:30` carries **Custom Fields** as its own entry
  (no submenu chevron, unlike Templates / Relationships / Convert to / Task Type
  / Add to / Favorite / Remind me).
- transcript: silent.
- rundesk today: absent from the task entirely. The Fields tab
  (`apps/web/src/components/task-detail-sheet.tsx:1453-1454` →
  `CustomFieldsPanelInner` at `:6764`) reads
  `/workspaces/:ws/tasks/:id/custom-fields` and can only **set values**; its
  empty state (`:6797-6804`) renders `taskDetail.noCustomFieldsHint` —
  *"Add fields at the project level — they'll appear here for every task."* The
  three POST call sites for creating a definition are
  `quick-create-modal.tsx:424`, `workspace-project-shell-page.tsx:762` and
  `app.$workspaceId.$spaceId.$projectId.$listId.tsx:1442`. None is on the task.
- status: B
- closed by: task-field-create 16/16
- defect class: none for the absence — but the three existing creation paths are
  the standing duplicated-list hazard this audit has already hit twice, so a
  fourth must reuse one of them rather than add another.
- why not already a row: the ledger has ``B | `+ Create new field` on the create
  modal; 17 field types`` — the *create-task* modal, i.e. before the task exists.
  The four other items in the frame's action row all have a home already (the
  task's tab strip at `task-detail-sheet.tsx:400-413` has Subtasks, Checklists,
  Related Items and Attachments), so the row as a whole is a different affordance
  for things that exist. **"Add fields" is the one of the five with no
  destination at all**, and "Custom Fields" in the `···` menu is the same gap
  reached a second way.

### One-click next status, and mark-complete, on the task header
- timecode: `15:20`, `15:25`, `16:00`
- the frame draws: the Status field is a green pill **COMPLETE ⊘** with a **▶**
  button welded to its right edge (advance to the next status) and a separate
  **✓** button beside it (mark complete) — three controls where Rundesk has one.
- transcript: silent.
- rundesk today: a single `<select>`.
  `apps/web/src/components/task-detail-sheet.tsx:2448-2462` renders
  `<select value={detail.status} onChange={… patchTask.mutate({ status }) }>` over
  `statusOptions`. `grep -n "nextStatus\|advanceStatus\|markComplete" ` over the
  file returns nothing, and the header's action row (`:1178-1240`) is milestone,
  reminder, favourite, expand, save-as-template, `···` — no status control.
- status: B
- closed by: task-header-status 15/15
- defect class: none
- why not already a row: no ledger row in any section names the task's status
  control. The underlying capability (change a task's status from the detail
  sheet) exists and works; the two one-click affordances do not, and the frame
  draws them in three separate shots of my range.

### The AI's busy state says what it is doing, in words
- timecode: `18:00`, `18:45`, `20:10`
- the frame draws: above the step log, the Brain glyph with a status word —
  **Cookin'** at `20:10`, **Handling** at `18:45`, settling to **Brain** at
  `18:48` when the answer lands. At the same moment the composer's placeholder
  reads **"Working on it…"**.
- transcript: silent.
- rundesk today: a spinner and nothing else.
  `apps/web/src/components/ai-panel.tsx:675-682` draws a bare `Loader2` bubble
  while streaming with no text; `AiTrace` (`:140-158`) renders only the steps the
  server actually sent, which is correct and is the `B` row. The composer keeps
  `placeholder={t('aiPanel.inputPlaceholder')}` — *"Ask Rundesk AI anything…"* —
  while `disabled={!aiAvailable || isStreaming}` (`:914`, `:921`), so a dead input
  still invites you to type into it.
- status: P
- defect class: none
- why not already a row: `B | **Live step log**; steps emitted only after the
  lookup returns` covers the steps, and covers them well — the step log is the
  honest half and it must not be replaced by a word. This is the other half: the
  state before the first step arrives, and the composer's label during it.
  **This is the smallest row in this set** and should be scheduled as such; it is
  listed because the frames draw it three times and it is a fixed string plus a
  state label, not an adjective.

### The Teams empty state's explainer cards are a carousel of three, not a pair
- timecode: `21:00`
- the frame draws: to the right of *"Align teams and visualize their work!"*,
  three cards side by side — one partly off-screen left (*"…all activity and …the
  details for"*, i.e. the Teams Hub card), **Member & team management**, and a
  third headed **"Stay focused with P…"** (*"Instantly know what … and what's
  next on th…"*). Under them, a **← →** pager. The left nav also badges **All
  People** with a count (**2**).
- transcript: silent — `[20:58]` *"aap ko show nahi ho raha ke TEAM nahi hai?"*,
  then she cuts the section.
- rundesk today: **built.** `EMPTY_CARDS` is one list of three that the
  carousel and anything counting them both read, with the frame's `← →` pager
  centred beneath and a `data-index` the check reads. It WRAPS: three cards and
  two arrows cannot express an end state the frame never draws, and an arrow
  that stops responding reads as broken rather than finished.
  **The third card's prose is the one thing not taken off the pixels** —
  `21:02` cuts it at the viewport after *"Stay focused with P…"* — so the suite
  asserts the count, the pager, the advance and the wrap, and never that copy.
  The People count badge named at the end of this row is NOT part of this
  closure and stays open.
- status: B
- closed by: teams-empty-state 21/21, break set 4/4
- defect class: **the check that enforced the absence of the feature.**
  `teams-empty-state.mjs` asserted `cardCount === 2` and said *"the frame draws
  exactly two"* in its failure message. It was green over the static pair and
  **would have gone red the day anybody built this correctly** — the right
  answer turned into a failure, with the frame's authority cited for it. Found
  only because this row disagreed with that check and the frame was re-read to
  settle which was wrong
- why not already a row: `M | Teams empty-state headline; **Browse People /
  Create Team** buttons; two explainer cards` was closed this session and the
  build is good — but the row itself says *two*, and the frame shows three behind
  a pager. This is the "re-check a B where the frames show more" case, split out
  because the extra card and the pager are a build, not a correction to the
  existing one.

---

## Re-checks of rows the ledger marks `B`, and other misclassifications

Eleven. Six are rows this session closed and the ledger has not caught up with;
five are substantive.

1. **`B | Live focus countdown in the header` → M.** Substantive, and the most
   important item in this file. Nothing in `apps/web` renders a header pill.
   `apps/web/src/lib/use-focus-tab-title.ts` computes the fact correctly
   (`pickRunningBlock` `:96`, `formatRemaining` `:80`, `focusBlockLabel` `:122`)
   and its **only** consumer anywhere is `apps/web/src/routes/app.tsx:125`, which
   writes it to `document.title`. `grep -rn "useFocusTabTitle\|formatRemaining\|
   pickRunningBlock"` over `apps/web/src` returns that one line and the module
   itself. The one `Moon` glyph in `app-topbar.tsx:688` is the theme toggle. The
   file's own header comment states the frames put the pill in the app header and
   calls that "a separate row" — that row was never built. The frame at `15:20`
   shows it unambiguously: a moon glyph and **"Work on dbgdh 2h 56m left"**
   immediately right of the `Leo` workspace switcher, on the *list* page, at
   `16:05` and `16:10` too, so it belongs to the app shell.
2. **`M | Countdown in the browser tab title` → strike, do not close.** It is now
   built (`use-focus-tab-title.ts`, `routes/app.tsx:125`,
   `tabTitle.focusCountdown` in all four catalogs, suite
   `test/e2e/tab-title-countdown.mjs`), but it was never a requirement: the tab at
   `15:20` reads `vjgkgkg | #86eyjd2jb` and carries no countdown in any frame. The
   row exists only because of the doc error at
   `docs/video2-frame-observations.md:383`. Closing it as `B` records a frame
   requirement that does not exist while (1) stays open.
3. **`B | App Center with categories, per-app descriptions, connection health`
   → P.** `apps/web/src/pages/workspace-integrations-page.tsx:109-119` ships nine
   facets (All, Installed, Communication, Cloud Storage, Development, Calendars,
   Analytics, CRM, AI) against the frame's fourteen. Absent: **Featured**,
   **Connected Search**, **Design**, **Email**, **Finance & Accounting**,
   **Knowledge Base**, **Time Tracking**. Worth saying separately: **Connected
   Search is not a gap in capability** — federated search over Google Drive,
   Gmail and SharePoint is already built (`apps/api/src/modules/search/sources.ts:17`,
   `search.service.ts:881`), it is only unnamed here.
4. **`B | Skills; Recent Chats with auto-derived names` → P.**
   `apps/web/src/components/workspace-sidebar.tsx:2724` does
   `threads.filter(t => t.messageCount > 0).slice(0, 5)` and renders no **More**,
   which the frame at `16:30` draws under the list. `useAiChatThreads`
   (`apps/web/src/lib/skills-api.ts:475`) is the only consumer of
   `GET /workspaces/:ws/ai-chats`, and that endpoint
   (`apps/api/src/modules/ai/chat-threads.controller.ts:23-27`, *"Your AI chats,
   newest first"*) returns **all** of them. So the sixth conversation onward is
   unreachable in the UI while the server is already handing it over. The
   auto-naming half of the row is genuinely `B`.
5. **`M | **Credits entirely**: tab, category→credits table, usage-trend chart
   with limit line, Add credits, My Agent Performance` — bundling warning, not a
   misclassification.** `M` is right. But §3 records **Credits** as a decision,
   and this row is the only place the **usage-trend chart** is named. A trend of
   AI spend over time, in dollars, needs no invented currency; only the *limit
   line* does, and only because `apps/api/src/modules/plans/plans.constants.ts:51`
   has `maxMembers` / `maxProjects` and no AI quota. Un-bundle the chart before
   the decision retires it by association. The credits decision itself was
   re-checked and is **not stale**: `grep -rni "credit"` over `apps/api/src`,
   `packages/db/src` and `apps/web/src` finds only the `CreditCard` lucide icon
   and one occurrence of the word "discredits".
6. **`P | Model picker — 2 tiers in a `<select>` vs 7+ named models` → B.**
   `apps/api/src/modules/ai/model-tiers.ts:75-118` now carries `MODEL_TIERS` with
   `speed` / `intelligence` / `group` and a type-separated `UNROUTABLE_PROVIDERS`
   with no `model` field; `ai-panel.tsx:745-905` renders the popover.
7. **`M | "Best models" header; hover cards with Speed/Intelligence bars; Show
   more` → B.** `ai-panel.tsx:762-905`: `ai-model-group-best`,
   `ai-model-bar-speed-*` / `ai-model-bar-intelligence-*`, `ai-model-show-more`,
   `ai-model-more`, `ai-model-reason-*`.
8. **`P | Integration error card — thin banner, no "Help center article" link`
   → B.** `workspace-integrations-page.tsx:797-812` plus the help-link component
   at `:124-136`, suite `integration-error-card` (24 checks).
9. **`P | "Actions completed" — per-feature breakdown exists; the frames' 8
   categories do not` → B.** `ai-categories.ts:53-64` (eight),
   `rollUpByCategory` `:190-230` seeds all eight so none can go missing,
   `ai-value-panel.tsx:144-157` renders all eight at both breakpoints.
10. **`P | Activity log — no Status or My-agents filter` → B for both halves
    named.** `ai-value-panel.tsx:566-616`: `ai-activity-status`,
    `ai-activity-mine` (with `aria-pressed` and `data-on`), `ai-activity-feature`,
    plus `ai-activity-clear-filters` at `:640`. The frame's fourth filter,
    **Agent**, stays deliberately absent.
11. **`M | Teams empty-state headline; Browse People / Create Team buttons; two
    explainer cards` and `M | Per-person work preview cards` → B.**
    `workspace-teams-page.tsx:262-338` and `:420-556`; the person cards carry a
    real per-person preview keyed by `previewByUser.get(m.userId)`, an open count
    that is deliberately not derived from the rendered rows (`:503-509`), and an
    editable job title (`:439-495`). See the recovered row above for the third
    card.

---

## Where `docs/video2-frame-observations.md` is itself wrong

Seven, of which one was already confirmed.

1. **`:383-384`** (confirmed): *"the BROWSER TAB / header shows 'Work on dbgdh ·
   2m 3s left'"*. Both halves wrong. At `15:20` the countdown is an **app-header
   pill** — moon glyph, `Work on dbgdh 2h 56m left` — sitting between the `Leo`
   workspace switcher and the Search box, while the browser tab reads
   `vjgkgkg | #86eyjd2jb`. The value **"2m 3s left"** appears in no frame; the
   pill reads `2h 56m` at `15:20`–`15:50` and `2h 55m` from `16:00`.
2. **`:385`**: *"task header icon tooltip **Task settings**"* — unverified and
   probably wrong. Frames `15:17`–`15:25` draw, beside the **Task ⌄** type chip
   and above the title, a single **ID glyph** (the letters `ID` inside a
   scan-frame), with no tooltip open in any of them. It is also not in the task
   header's right-hand action row, where the line implies.
3. **`:391`**: the menu list writes **"Custom Fields ›"**. Frame `15:30` draws
   **Custom Fields with no chevron**. The items that do carry one are Favorite,
   Remind me in Inbox, Add to, Convert to, Templates, Relationships and Task Type;
   Move to, Merge, Duplicate, Custom Fields, Description history, Print, Send
   email to task, Archive and Delete do not.
4. **`:406-408`**: *"16:05 the assigned task now sits in the planner's Priorities
   rail with a **Done** button; a **'1 Priority'** counter bottom-left"*. Frame
   `16:05` is the **List page** (`rundesk / ruruuu / List`, status groups
   `COMPLETE 1` and `TO DO 0`, chips Group: Status | Subtasks | Columns), with the
   Planner rail icon under the cursor and the status bar reading
   `…/90182956805/calendar`. The Priorities rail and its Done button are not in
   it. The **"⚑ 1 Priority"** chip *is* real but is drawn at `16:00` (over the
   list) and `16:10` (on the planner) — and its presence at `16:00` means it is an
   **app-wide** chip, not a planner-only one, which the ledger row `M | Planner
   bottom command bar` under-describes.
5. **`:431-433`**: the model list. The version is **GPT-5.6**, not 5.4 — the hover
   card at `17:16` reads *"GPT-5.6 Luna — Fast, lightweight GPT-5.6 model"*. And
   **"Best models" holds three rows, not seven**: `Brain² [Max] ✓`,
   `GPT-5.6 Luna`, `Gemini 3.5 Flash`, then a rule and **Show more**. The other
   four the line lists are what the disclosure reveals.
6. **`:501`**: *"12 open tasks total. 11 To Do, 1 In Progress, 1 Complete"*. The
   frame at `20:10` reads **13** open tasks total. The line is also internally
   inconsistent — 11 + 1 + 1 = 13.
7. **`:516-517`**: *"two explainer cards"*. Frame `21:00` draws a **carousel**
   with `←` `→` paging and at least three: the Teams Hub card, **Member & team
   management**, and a third headed **"Stay focused with P…"**. The frame also
   badges **All People** in the left nav with a count (**2**), which the line
   does not mention.

---

## Defects found while checking, which are not scope rows

Three. None changes a count; all three are in code this session touched.

- **`ai-value-panel.tsx:459-520` renders the eight category tiles outside the
  loading guard.** The `valueQuery.isPending` ternary at `:322-438` covers only
  the four `Stat` tiles; the category `Card` follows it. While the query is in
  flight `data` is `undefined`, so `const supported = row?.supported ?? false`
  (`:486`) is false for all eight and every tile — including *Tasks created or
  updated* — prints **"not available"** before flipping to a number. That is the
  page's own "a fact about the product" string appearing as a fact about a
  workspace, which is the exact confusion the file's header comment exists to
  prevent.
- **`AiService` injects `SearchService` and never calls it.**
  `apps/api/src/modules/ai/ai.service.ts:797` declares
  `@Optional() private search?: SearchService`; `grep -n "this.search"` over the
  file returns nothing. The comment above it (`:792-796`) reads *"SearchService is
  retained for other surfaces"* — a **stale reason**, since within this class it
  is retained for none. Worth removing or wiring, and it is the natural door for
  the connected-app-search row above.
- **`ai-panel.tsx:914` keeps `"Ask Rundesk AI anything…"` on an input disabled at
  `:921`.** Covered by the busy-state row above; noted separately because it is a
  one-line fix independent of the rest of that row.

### Added 21 September

- **The calendar picker trapped the planner, and there was no way out by
  keyboard. FIXED.** Its popover uses a `fixed inset-0 z-40` click-catcher and
  **nothing listened for Escape**. Until a click happened to land on the
  catcher it was a full-screen sheet swallowing every press in the planner
  header; a keyboard user had no exit at all. Proved by hit test rather than
  inferred: after Escape the menu count is still 1 and
  `document.elementFromPoint` over the Settings button returns the catcher.
  `quick-create-modal.tsx:172` carries a note about this exact defect found the
  same way — *"a suite pressed Escape and the backdrop went on swallowing every
  click behind it"* — and `person-panel.tsx:580` states the convention:
  *"Escape closes, like every other overlay in the app."* Fixed with a
  document-level listener, because `onKeyDown` on a catcher that takes no focus
  could never fire. `calendar-accounts.mjs` 33/33; the break patch reproduces
  the original 30-second timeout exactly.

- **`@Post` answers 201 — the FOURTH instance in one day.** `calendar-accounts`
  check 33 accepted only 200 from `oauth/start`, and its other branch expected
  a 400 the server does not produce, so **both branches were unreachable and
  the check could only ever fail**. `app-catalogue.mjs:155` already records
  making the identical mistake against the same route and concluding "the
  product was never wrong". Four checks, three suites, one assumption about
  REST. Recorded in the process doc's trap list.

- **The planner's two Connect surfaces will hand you an empty consent URL.**
  `getOAuthStartUrl` builds it from `process.env.X_CLIENT_ID ?? ''` without
  consulting `getMissingProviderEnv`, which sits twelve lines above and already
  answers the question — so on an unconfigured server it returns 201 and
  `https://zoom.us/oauth/authorize?client_id=&…`. The App Center gates this
  client-side and toasts the reason; `workspace-planner-page.tsx:805` and
  `planner-settings-dialog.tsx:981` both POST and assign `window.location.href`
  with no readiness check. The facade. **The server-side fix is the wrong one**
  and was written and reverted: `app-catalogue.mjs` deliberately uses this
  endpoint as a URL builder to verify Gmail's and SharePoint's scopes in this
  same unconfigured environment, so refusing there is cross-lane damage. The
  client-side check, in three surfaces, is the one to make. *Not fixed.*

- **Two calendar toggles read ON before the server has answered.** The mirror
  defect with a timing fuse: `holidayCalendarOn` / `timeOffCalendarOn` are
  derived from a query that is `undefined` on first render, so both read ON and
  both fire their fetches before the page knows the account switched them off.
  The product's own comment promises "unticking Holidays stops the chip being
  drawn AND stops the request that fetches it" — true for the rest of that
  session, false again on every reload. *Not fixed*, and the fix was written
  and reverted deliberately: no existing check reddens on it, and an
  unprotected behaviour change in a file three agents were editing is not worth
  the risk. It needs its own check first.

- **`palette-more-types-menu` has the same untrapped catcher**
  (`command-palette.tsx:872`) with no Escape handler. Lower impact — it sits
  inside a Radix dialog whose own Escape closes the whole palette — but the
  menu itself cannot be dismissed by keyboard. *Not fixed.*

- **Every file staged on the create modal was silently dropped. FIXED.**
  `input.files` is a **live** `FileList` — the same object every time — and the
  change handler clears `e.target.value` the moment it returns, which it must,
  or re-picking the same file fires no change event. `addAttachments` checked
  `picked.length` synchronously but read `Array.from(picked)` **inside**
  React's `setAttachments` updater, which runs later, by which point the list
  was empty. So the Attachments section could never draw a row **for any
  file**, and the paperclip stayed on "Attach a file" with nothing on screen to
  say a file had been lost. The whole §V2-S02 `01:10` feature was inert.
  `quick-create-modal.tsx:548` snapshots synchronously; `attach-on-create.mjs`
  13/13, and `aoc-1-filelist-read-late` reverts it to 1/5.

- **`projects.position` is honoured in one surface and contradicted by the
  rest.** The mirror defect, half-built. It has a writer (`POST
  /workspaces/:id/sidebar/reorder`) and exactly one reader — the sidebar sorts
  client-side. `getProjectsBySpace` has no `ORDER BY` at all, so the **other
  twenty** call sites of `/projects/space/:id` render whatever order Postgres
  hands back, which changes after row updates and after a vacuum. The order
  somebody dragged into place holds in the tree and nowhere else. *Not fixed* —
  it wants its own row and its own suite.

- ~~**A fifth copy of the view keys, one key short.**~~ **FIXED 21 September** —
  `team-view.mjs` 12 → **13 checks**. The `v` cycler at the list route's
  `:2204` held `['list','board','table','calendar','gantt']`: the same five
  names `ALL_VIEWS` holds eight hundred lines above it, minus `team`. So Team
  View — built during this audit — was drawn in the tab strip, was selectable
  by mouse, and the keyboard walked past it forever. Present, reachable one
  way, unreachable the other, and nothing on screen to say so.

  **And the fix at the time was itself a copy.** The cycler was pointed at the
  route's own `ALL_VIEWS`, which took the keys from five copies to four and
  left the class alive. On 21 September the route's copies went entirely:
  `ALL_VIEWS` and `activeView`'s hand-written union of the same six keys, nine
  hundred lines apart in one file, both now `SPACE_VIEW_KEYS`. **The keys exist
  TWICE in the repository** — `space-presets.ts` on the server, and
  `lib/space-views.ts` mirroring it. Found by reading team-view's REFUSED break
  log, whose baseline had been 12 passed 1 failed, sitting under a ledger row
  that read as proven; baseline is 13 green now.

  The new check presses `v` **`tabs + 1` times** and requires it to have
  visited every view, because a cycler that merely MOVES proves nothing — and
  the count comes from the tabs the page itself draws, so adding a view type
  cannot leave the check quietly walking a shorter loop than the product does.

- **The create menu prints a refusal key where a sentence exists.**
  `quick-create-modal.tsx:399` renders `Set that up — skipped (no_permission)`.
  `ai-containers.ts:62` ships `CONTAINER_REFUSAL_TEXT`, whose own comment reads
  *"The refusal a person reads. One sentence, and it says what would change
  it"* — but `AiService.executeOne` returns only `reason` and drops
  `result.message`, so the sentence never leaves the server on that path. The
  stale reason, with the good reason sitting one field away. *Not fixed.*

- **A plan that refuses everything says "Nothing to create".** The same panel
  declares `warnings?: string[]` on its `AiPlan` type and never renders it,
  while `ai-command.ts` fills `warnings` with precisely the "why this was not
  planned" sentences and `workspace-ai-page.tsx:625` does render them. So the
  reason is computed, sent, and thrown away, and the create menu shows
  `create-ai-nothing` instead. A confident zero with the answer in the
  response body. *Not fixed.*

- **Four confident zeros in one control: the `@` picker narrows Locations on
  the server and the other four tabs in the browser.** Found while repairing
  `task-mentions`. In `apps/web/src/components/task-detail-sheet.tsx`, Tasks
  (`:5891`) asks `/tasks/workspace/:ws?limit=200` — and the endpoint caps at
  whatever it is handed (`tasks.controller.ts:151`) — then filters the reply
  locally. Docs (`:5896`), Whiteboards (`:5907`) and Channels (`:5931`) have
  the same shape. So the 201st task in a workspace cannot be mentioned, and
  typing its name shows "no matches" rather than "not loaded". Locations
  (`:5923`) does it correctly, server-side, which is what makes this legible:
  one tab in the same popover is held to a standard the other four are not.
  Two hundred tasks is an ordinary workspace, so Tasks is the one that bites
  first. **Not fixed** — it is four fetches in a file two other agents were
  working in, and it wants its own suite.

- **`POST /tasks` with `assigneeIds` announced nothing. FIXED.** `createTask`
  inserted the `task_assignees` rows and stopped: no `task_assigned`
  notification, no `task.assigned` event, no `task.assignee_changed`
  automation, nothing for watchers. `addAssignee` — the PATCH path — did all
  four. So assigning somebody from the create modal, which is the ordinary way
  a task gets an assignee rather than an edge case, put their name on a task
  and never told them, and left the automations UI's own "Task assignee
  changes" trigger silent. The row in `task_assignees` stood as evidence for
  an event that never happened: the mirror defect, on the busiest write in the
  product. Found while teaching `video1-acceptance` to seed its own inbox —
  the peer created a task assigned to the signed-in account, the API answered
  201, and `GET /notifications` stayed empty for fifteen seconds. Extracted
  into `announceAssignment` and called from both paths rather than copied,
  since two announcements to keep in step is the duplicated-list defect and
  this audit has found six already.

---

## Counts

**Recovered rows: 9** — B 0 · P 2 · M 7, AS RECOVERED. §4's table is live.

| # | row | status |
|---|---|---|
| 1 | AI cannot create a list, folder or space | M |
| 2 | AI answers render markdown | M |
| 3 | Inline task chips with a live status badge | M |
| 4 | Project-status answer with a real per-status breakdown | P |
| 5 | The AI acts inside a connected app | M |
| 6 | Create a custom field from an open task | M |
| 7 | One-click next status / mark complete | M |
| 8 | AI busy state says what it is doing, in words | P |
| 9 | Teams empty state: third card + carousel pager | M |

Rows 2 and 3 share one embed mechanism with the ledger's existing
`M | Success message with clickable path chips`; estimate the mechanism once.
Row 8 is deliberately the smallest thing in the list.

**Existing ledger rows in this range believed misclassified: 11** — two
substantive downgrades (`Live focus countdown in the header` B→M, `App Center
with categories` B→P), one substantive partial (`Recent Chats` B→P), one row that
should be struck rather than closed (`Countdown in the browser tab title`), one
bundling warning (`Credits entirely` — the usage-trend chart), and six rows this
session built that the ledger still shows as P or M (model picker, Best-models
header / hover cards / Show more, integration error card, Actions completed,
Activity Status + My-runs filters, Teams empty state + per-person cards).

**Errors in `docs/video2-frame-observations.md`: 7** (lines 383-384, 385, 391,
406-408, 431-433, 501, 516-517).

**Defects found while checking, not counted as rows: 3.**

Respected as recorded decisions and not re-raised: **Credits** (re-checked
against the tree — no credit concept exists anywhere, the reason holds) and the
**Brain² hub** (`16:25`–`16:55`: onboarding, `/ai/brain`, AI-scoped left nav,
Ask|Agents toggle, Super Agents, credit meter, rotating placeholder, generated
artefacts and the slide deck). Also left alone: **Agents** as first-class actors
(`15:45` Agents section and `+ Create Agent`, `19:00` Autopilot/Super Agents,
`19:10`'s Agent filter, `19:00`'s My Agent Performance) under §3, and **Team
analytics**.


---

## 6. Rows in this file whose status is wrong

Found by the same pass, re-checking rows rather than trusting them. Four are
marked **built** while being the mirror defect — a value the product stores,
validates and then no reader honours — which is the one class of error a demo
cannot reveal and a schema comment actively conceals.

| row, as this file has it | should be | why |
| --- | --- | --- |
| `B` Create-a-Space: … **Default permission** … | **M** for that part | `spaces.default_permission` is written by the wizard, validated on create and on update, declared in the controller — and read by nothing. `defaultPermission` appears nowhere in `apps/api/src` outside `spaces.service.ts` and `spaces.controller.ts`; no access check consumes `SpaceDefaultPermission`. The schema comment states a contract the product breaks. The row's other three parts are genuinely built |
| `B` Live focus countdown **in the header** | **M** | The header pill does not exist. `use-focus-tab-title.ts` computes the countdown and its only consumer anywhere is `routes/app.tsx:125`, which writes `document.title`. The `Moon` glyph at `app-topbar.tsx:688` is the theme toggle |
| `B` App Center with categories | **P** | Nine facets (`workspace-integrations-page.tsx:109-119`) against the frame's fourteen |
| `B` …Recent Chats with auto-derived names | **P** | `workspace-sidebar.tsx:2724` hard-slices to five with no "More", while `GET /ai-chats` returns all of them. Conversation six onward is unreachable in the UI |
| `B` Error toasts; list names unique; both create paths report failure | **P** | True of lists, false of folders. `quick-create-modal.tsx:1394-1404` has no `onError` — the same defect `88830db` fixed on the List tab beside it — `workspace-sidebar.tsx:446-457` is still `window.prompt`/`window.alert`, and `folders.service.ts:38-49` accepts duplicate names with no index behind it |
| `B` Connect Google / Outlook; **two-way scope** | **P** | Right about the OAuth grant; it was read as two-way *sync*, which is a button on another page |
| `B` Attachments "Drop files here" | evidence stale | There is a real `onDrop`/`onDragOver` now; the row's stated reason no longer describes the code |
| `M` Cover: Search tab; Gallery "Custom" swatch | **split** | The Custom swatch is built — pipette, native colour input, apply, with testids. Only the Search tab is missing, and its recorded reason still holds |
| `P` View types — 5 of 11 | stale | `SPACE_VIEW_KEYS` has six, and this file carries a `B` row for Team view that contradicts it |
| `M` Countdown in the browser tab title | **struck, not closed** | It is built, but it rests on a doc error: no frame shows a countdown in the tab. See §7 |
| `M` Credits entirely | bundling warning | The usage-trend chart is in dollars and needs no currency; retiring it with the credits decision would lose a thing that is neither credits nor out of scope |
| + six rows built this session | **B** | already moved in §2 |
| `M` Appearance: Grid size | **B** | Stale, not missing. Control, API validation and reader all present — `const hourPx = GRID_SIZES[gridSize]`, with `GRID_SIZES` imported from the dialog so the swatch and the grid cannot disagree. `planner-appearance-toggles.mjs` covers it in 3 checks and was re-run green at HEAD |
| `M` "Comment ▾" split button; "Create Task ▾" | **B\*** | The Comment half is built and checked (`task-mentions.mjs`), with Email listed-and-disabled and its reason on the row. "Create Task ▾" is genuinely absent, which is what the asterisk records |
| `M` Conferencing / Zoom connect row | **B** | Stale. `ConferencingRow` in `planner-settings-dialog.tsx`, frame `13:36`, checked by `calendar-accounts.mjs` |
| `M` Copy configuration from another space | **B** | Stale. The bar is in `create-space-wizard.tsx` at frame `07:50` and `space-wizard.mjs` spends 5 checks on it |
| `M` Plan-tier paywall UI; "uses have expired" | **B\*** | Frame `09:26`'s modal is built and closed by `paywall-sites.mjs`, 30 checks, break set 10/10. The metered state is genuinely absent — hence the asterisk |
| `M` The ten named importers; spreadsheet/document import | **P** | Spreadsheet import is real and 19/19 break-tested. The ten tools are column PRESETS over it by explicit decision, because ten tiles over one importer is the facade at ten times scale — `imports-1-ghosttile` reddens exactly that. Document import is the open half |

**THOSE SIX WERE FOUND BY LOOKING, NOT BY A GUARD, and that is the point of
the row.** `scripts/check-video2-counts.mjs` can prove this file agrees with
itself; it cannot prove a letter agrees with the product, because `M` is a
claim about the world. The headline moved `138 → 143 built · 16 partial` with
nothing built for it.

**EVERY `M` IN §2 HAS NOW BEEN READ AGAINST THE CODE, one at a time.** Six were
stale. The nine that remain were each confirmed genuinely absent rather than
assumed so, and they divide cleanly: six are blocked rather than pending — the
Brain² hub and the four rows that hang off it need an agent runtime Rundesk
does not have and an `ANTHROPIC_API_KEY` that is empty here and in CI, and
"add to a colleague's priorities" is a deliberate refusal recorded on its own
row. The last one, **`"Add to ›"`**, was carried as the one buildable row until
its frame was opened too — see below. **NONE is buildable.**

The metered *"uses have expired"* state was counted here too, and is not.
`09:30` draws that state's sentence and its one button and nothing else — no
counter, no allowance, no reset — and Rundesk has no metering to attach it to.
A policy I choose, checked against checks I write, is not a build to the
reference.

`"Create Task ▾"` was counted among the buildable until its frame was actually
opened. `00:07` draws the split button in the create modal's footer and **no
frame in the video ever opens the chevron** — the observations file names it
once and never again — so there are no menu contents to build to, and
inventing them is the thing this file refuses to do. Blocked on the reference.
The create-modal placeholder stays `M` for the same reason, which its own row
explains. That makes THREE rows now held back by what the frames do not
show rather than by what Rundesk does not have — the create-modal placeholder,
`"Create Task ▾"`'s menu, and the metered state's policy — and the distinction
is worth keeping: one kind is waiting on work, the other on a better
reference, and only the first belongs in a backlog.

`"Add to ›"` was the last row standing, and it fell to the same question asked
one row later than it should have been: **what does the video say its submenu
does?** Nothing. Frame `15:35` draws the menu with `Add to ›` and its chevron,
the cursor resting on `Send email to task`, the submenu **closed**; the other
frames in the window — `15:00`, `15:15`, `15:20`, `15:50`, `15:52`, `15:55` —
never open it either. The transcript for that window narrates **five** items
(`[15:22]` Favourite, `[15:27]` history, `[15:32]` print, `[15:38]` convert,
`[15:41]` fields) and **"Add to" is not one of them.** It is drawn and never
spoken.

So where did *"a task in more than one list"* come from? Not the reference. That
phrase appears **nowhere** in `video2-frame-observations.md` and nowhere in the
transcript — it occurs exactly twice in the whole corpus, both times in THIS
file, in the row and in the sentence promoting it. It is ClickUp's real product,
which I know independently, written down as though it were an observation. The
row's *justification* was the invention, which is why it survived fifteen rows
of checking: the checking was aimed at whether Rundesk has the feature, and the
answer to that was honestly "no" every time.

The `Convert to ›` precedent does not rescue it, and it is worth saying why,
because the two look identical. That submenu is also never opened — §4 of the
gap audit says so — and it was still built, on the ground that the defensible
reading is *"the conversion Rundesk's own schema already supports:
`parentTaskId` and nothing more"*. The rule that licensed it is **build only
what an existing column already affords**, not "a closed submenu may be
guessed". Here the schema affords the opposite: `tasks.list_id` is a single
`notNull` FK (`schema/tasks.ts:17`), there is no task↔list join table in any of
the 21 schema files that mention `taskId`, and every read path assumes one list.
There is no orphan column waiting for a reader — the mirror defect, where the
build is free because half of it already exists. There is only a new table, a
migration, and a rewrite of every list query, all of it in service of a sentence
the video never says.

**Which leaves ZERO buildable rows in §2**, and FOUR held back by the reference
rather than by Rundesk: the create-modal placeholder, `"Create Task ▾"`'s menu,
the metered state's policy, and now `Add to ›`. The count does not move — the
row stays `M`, because it is still a thing the product does not have — but the
reason does, and the reason is what a backlog is read for. The first pass said
fifty were buildable.

The lesson is narrower and more uncomfortable than "check the frames". Every one
of these four was checked against the frames repeatedly. What went unchecked was
the **gloss** — the parenthetical that says what the row MEANS — and a gloss is
where knowledge from outside the reference gets in, because it reads as
description and is never re-derived. *The stale reason*, turned on a row's own
justification instead of on its status. The fix is mechanical: a row's
parenthetical must quote a frame or a timecode, or say that it cannot.

### Voice notes and Required views were closable the whole time

Two rows sat unbuilt behind reasons that had stopped being true — *the stale
reason*, which is the defect class that suppresses exactly the investigation
that would find it:

- a voice note **uploaded from a file** renders as a player, through the
  composer's unfiltered `multiple` input and MIME-based `presentationFor`;
- `List` is already un-removable in the wizard (`required = view === 'list'`
  plus `disabled`).

---

## 7. Where `docs/video2-frame-observations.md` is wrong

The observations file is the source these rows are derived from, so an error in
it becomes a row built in the wrong place. Seven were found by going back to
the frames:

| line | says | the frame shows |
| --- | --- | --- |
| `:383-384` | a countdown in the **browser tab** at `15:15`, reading "2m 3s left" | at `15:15` nothing shows a countdown at all (List page mid-load, tab reads `List \| List \| Leo (List)`). Where it does appear, `15:20`–`16:20`, it is an **app-header pill** reading `2h 56m` → `2h 55m`, while the tab reads `vjgkgkg \| #86eyjd2jb`. "2m 3s" appears in no frame. The whole 23:53 was swept |
| `:385` | a "Task settings" tooltip | the glyph there is an **ID** badge, and no tooltip is drawn |
| `:391` | Custom Fields has a chevron | it does not |
| `:406-408` | `16:05` is the planner rail | it is the **List** page — which is the point of that row: the countdown follows you off the planner |
| `:431-433` | GPT-5.**4**; "Best models" holds all the rows | **GPT-5.6**, and "Best models" holds **three** rows; the other four are behind Show more |
| `:501` | 12 open tasks | **13**, and its own breakdown 11+1+1 does not equal 12 |
| `:516-517` | two explainer cards | **three**, in a carousel with a pager |
| `:250-251` | `10:00` "create modal again", description placeholder **"Add description, or write with ⚡AI"** | `10:00` is the **Board view**, and so are `09:54`, `10:02`, `10:05` and `10:08` — the lanes `TO DO · PLANNING · IN PROGRESS · AT RISK · UPDATE REQUIRED · ON HOLD · COMPLETE`, which is what `:252` itself describes as the drag that follows. No create modal is open anywhere in that window, so the placeholder string has no frame behind it at this timecode |
| `:99` | `21:36` create modal asking Task → Doc → Reminder → Whiteboard → Dashboard | `21:36` is the **Brain² hub** at `/ai/brain` — Ask \| Agents toggle, Super Agents rail, the four starter cards, and the credit meter reading `12 Brain AI uses` / `500 Credits left`. The tab strip it describes is real, but it is the one at `00:08`–`00:20`, not here |

Two more, found 21 September by extracting the frames rather than trusting the
line. Both are timecode errors rather than content errors — the tab strip at
`:99` exists, just not at `21:36` — but a row derived from a timecode that
shows something else cannot be checked against the frame at all, which is how
`Create-modal placeholder` came to sit in §2 with no frame behind it.

The `21:36` frame is worth keeping for a different reason: it corroborates four
rows that are still `M` — the Brain² hub and its AI-scoped nav, the Ask\|Agents
toggle, Super Agents, and the credit meter — and it shows the focus pill this
audit built (`Work on dbgdh · 2h 50m left`) sitting in the app header exactly
where §V2-06 says it belongs.

`:383` is the load-bearing one: a row built from that line alone gets built in
the wrong surface, and one was.

---

## 8. What the break tests actually proved

Step 6 of the process — apply a patch that *should* redden exactly one check,
rebuild, and watch it go red — is the step that separates a check from
decoration. It is also the step most easily skipped, because a suite that is
already green gives no reason to doubt it.

Run against isolated git worktrees so patches could not collide, one run per
worktree under a lock:

| suite | patches | reddened |
| --- | --- | --- |
| `imports` | 19 | 19 |
| `task-delete` | 15 | 15 |
| `app-catalogue` | 20 | 20 — **19 until the twentieth patch was made to compile** |
| `paywall-sites` | 10 | 10 |
| `template-center` | 10 | 10 |
| `clickapps-plan-gating` | 8 | 8 |
| `folder-dialog` (the 8 status-scope checks) | 8 | 8 |
| `sidebar-sections` | 15 | 15 |
| `space-create-menu` (the Form row) | 5 | 5 |
| `list-assignee-filter` | 15 | 15 |
| `sidebar-reorder` | 11 | 11 |
| `team-view` | 1 | 1 |
| `integration-error-card` | 9 | 9 |
| `task-menu` — **never covered before** | 4 | 4 |
| `custom-field-progress` — **never covered before** | 5 | 5 |
| `list-export` — **never covered before** | 3 | 3 |
| `task-merge` — **never covered before** | 3 | 3, once the checks read the message |
| `comment-recording` — **never covered before** | 4 | 4 |
| `view-visibility` — **never covered before** | 3 | 3 |
| `list-name-taken` — **never covered before** | 3 | 2, and one that found the third second-guard |
| `checklists` — **never break-TESTABLE before** | 3 | 3 |
| `list-card-cover` | 8 | 8 |
| `task-activity-filter` | 4 | 4 |
| `task-header-status` | 3 | 3 |
| `person-panel` | 1 | 1 |
| `planner-blocks` | 1 | 1 |
| `space-default-permission` | 1 | 1 |
| `ai-value` | 1 | 1 |
| `task-field-create` | 9 | 9, after two were re-aimed |
| `space-presets` — **never covered before** | 3 | 3, one check each |
| `doc-task-links` — **never covered before** | 2 | 2 |
| `teams-empty-state` (the carousel) | 4 | 4 |
| `folder-create` | 12 | 12 |
| `list-empty-states` | 7 | 7 |
| `tab-title-countdown` | 7 | 7 |
| `space-wizard-views` | 6 | 6 |
| `teams-person-cards` | 5 | 5 |
| `ai-action-categories` | 10 | 10 |
| `ai-activity-filters` | 10 | 10 |
| `ai-create-containers` | 13 | 13 |
| `focus-pill` | 8 | 8 |
| `task-activity-filter` | 8 | 8 |
| `task-header-status` | 7 | 7 |
| …and the rest of the session's suites | | all |

Every row above is a count `scripts/check-break-freshness.mjs` reads back out
of the log on disk. **Six rows that used to be in this table are not, and the
reason each one left is worth more than the row was.**

| was | is | why |
| --- | --- | --- |
| `template-center` 10/9 **and** 10/10 | one row, 10/10 | listed TWICE — the fixed run was appended instead of replacing the broken one, so ten patches were counted twice. *The duplicated list*, in the table this audit keeps its own evidence in |
| `gantt-controls` 12/12 | withdrawn | the log holds ONE patch and it `BUILD FAILED`. The twelve were run, but nothing on this machine says so any more |
| `integration-error-card` 7/7 | withdrawn | its log is a refusal — `REFUSING TO BREAK-TEST — the unpatched suite is not green`. Whatever the seven proved, the most recent attempt measured nothing |
| `ai-model-picker` 8/8 | withdrawn | the suite was edited at 16:15; the run is from the previous day at 22:06. A result about a file that has since changed is a result about a file that no longer exists |
| `sidebar-dms` 10/10 | withdrawn | nine of the ten ran at 20:31–20:38. The fixture fix that gave the run a SECOND direct message landed at **20:43**, and their logs say so in their own words: *"the server now reports 1 direct message(s)"*. The suite went 13 checks → 14 in the same commit. **Fixing a fixture invalidates every result previously measured through it** — the nine were honest work against a suite that no longer exists, and one of them, `-7-count-is-a-constant`, is the only one re-run since |
| `list-view-controls` 8/8 | withdrawn | the log holds 5 |

**`app-catalogue` is the one that should have been caught by me and was caught
by a script.** I reported it as *"20 patches, 0 still green"* and it was
**19** — and it is 20 now, because the patch was fixed and re-run, which is the
only thing that turns a number in this table back into a fact. `app-catalogue-20-gmail-source-removed` `BUILD FAILED`: it
deleted `'gmail'` from an `as const` tuple that generates `SearchSource`, and
two Records keyed by that union plus a `.includes('gmail')` stopped compiling.
The patch never reached a check.

**ALL FIVE HAVE SINCE BEEN FIXED AND RE-RUN**, which is the only thing that
turns any of these numbers back into a fact: `ac-10` (ai-action-categories
29/0), `acc-1` (ai-create-containers 33/0), `app-catalogue-20` (25/0), `cp-43`
(command-palette 43/0) and `gantt-29` (gantt-controls 29/0). Every one reddens.
`check-break-freshness.mjs` raises no unbuilt patch anywhere now.

And **"still green: 0" cannot see that**, which is the finding under the
finding. A patch that fails to build prints no `N passed, M failed` line at
all, so the metric I was summarising every set with — *count the runs that
came back all-green* — counts it as **not still green**, which is exactly what
a patch that reddened looks like. It is `0 failed is not it ran`, one level up
and in my own reporting rather than in a suite. Five patches across five sets
were in this state: `app-catalogue-20`, `ai-create-containers/acc-1`,
`gantt-controls/gantt-29` (BUILD FAILED), `ai-action-categories/ac-10` and
`command-palette/cp-43` (PATCH FAILED). The last two have since been fixed and
need only a re-run; `app-catalogue-20` is rewritten to withdraw the tab where
the tab list is produced, which breaks the behaviour without touching the type.

### The denominator, and the four suites it sent me to

Every row above is a numerator. **Nobody had ever printed the other number.**
Counted on 21 September: 101 suites carry **1961 checks**, and **47 of those
suites had no break patch at all** — including the largest in the repository.
`video-regression` has 81 checks and nothing had ever been aimed at one of
them; `custom-field-progress` 58; `task-menu` 33; `comment-recording` 32;
`a61-meeting-record` 28; `task-merge` and `list-export` 25 each.

A suite with no patch is not a suite that failed. It is a suite **about which
nothing is known** — every check in it may be a facade and being green says
nothing either way. That is the sentence step 6 has carried since it was
written, applied only ever to individual checks and never to the set of suites,
which is how *"eight break sets verified"* came to read like coverage when it
was eight out of a hundred and one.

**The first answer was 53 and it was reported before it was checked.** The
evidence against it was in the same line of output — *"(64 could not be
attributed to a suite)"*. `# Reddens: task-field-create — "…"` separates with an
em dash rather than a colon, and the abbreviated prefixes (`tfc-`, `taf-`,
`tai-`, `lwb-`) match no suite filename, so four suites that DO have patches
were counted as having none. `check-break-coverage.mjs` resolves by sentence as
a third step now, 581 of 592 attribute, and the eleven that still do not are
printed BY NAME — a number in brackets is exactly what hid this.

Six of the 47 are closed so far, and the ratchet holds the rest.

### The still-green patch that was worth the run twice over

`sidebar-reorder` came back 10 patches, **one still green**, and it was the
still-green one that paid.

`sidebar-reorder-6` describes a folder FALLING THROUGH INTO `canDropOn`'s list
rule, and implemented DELETING that rule. With the line gone there is nothing to
fall through into: folders still reach the explicit `return false`, the
behaviour it claimed to break was unchanged, and the check stayed green —
honestly. **A patch has to make the code take the wrong branch, not remove a
branch**, and the two are easy to confuse when the branch you remove is the one
the defect would have used.

The edit it made by mistake is the finding. With the list rule deleted, **all 21
checks passed** while list-drop-on-a-project was gone entirely — the suite
asserted that a FOLDER dropped on a project row sends nothing and never that a
LIST dropped on one sends something. **A refusal asserted without its permission
is half a rule, and the half with no check is the half that can be deleted.**

Two checks added — the drop is accepted, and the list lands in that project,
read back out of the database — and `sidebar-reorder-11-list-rule-deleted` keeps
the accidental edit on purpose as the patch that covers that line. Re-run whole,
because the suite had changed and by this file's own rule that stales every
earlier result in the set: **baseline 23 green, 11 patches, 11 reddened, none
unbuilt**, and patch 11 fails exactly its two checks and nothing else.

### Three green patches, and the property they were all pointing at

Three patches ran green today and not one of them was a worthless check. Read
together they say something about this codebase rather than about three checks:

| patch | the second guard | what only the message could tell you |
| --- | --- | --- |
| `task-merge-2` | `would-nest-twice` | which rule refused — and that the one everybody credited was catching the opposite relationship |
| `task-merge-3` | `assertTaskWriteAccess`, which refuses archived tasks on its own | that the merge rule for a binned source had gone |
| `list-name-taken-1` | the partial unique index on `lower(name)`, via `AllExceptionsFilter` | that the person now reads *"That resource already exists"* instead of frame `08:50`'s *"List name taken"* |

**`AllExceptionsFilter` is why this keeps happening.** It maps `23502`, `23503`,
`23505`, `23514`, `22P02`, `22001`, `22003` and `23P01` to 4xx on every
endpoint — a good safety net, and it means **the database is a silent second
guard behind every service-level validation in the product**. Wherever a
service check exists to give a constraint a human sentence, the status code is
the constraint's and only the sentence is the service's. A check asserting the
status is therefore checking the database, whatever it says in its own words.

The shape to grep for is any status-only assertion on a REFUSAL. The note first
written here said `status >= 400 && status < 500` and was too narrow inside a
day: `list-name-taken` uses `=== 409`.

**THE SWEEP, DONE PROPERLY.** Every `CHECK (` in `packages/db/src/migrations`
— sixteen distinct constraints — paired with the service check that exists to
give it a human sentence, and then with the suite that was supposed to be
watching:

| the pairing | what was there | done |
| --- | --- | --- |
| `task-merge` · `would-nest-twice`, `assertTaskWriteAccess` | two guards, status-only checks | message checks added, 25 → 28 |
| `list-name-taken` · unique index on `lower(name)` → 23505 | frame `08:50`'s sentence replaceable by a generic conflict | message check added, 13 → 14 |
| `ai-value` · CHECK on both benchmark columns → 23514 | the RANGE is the useful half of the message, and nothing read it | two checks added, 20 → 22 |
| `view-visibility` · CHECK `visibility IN (…)` | the service check, the constraint AND the message — none exercised | two checks added, 19 → 21 |
| `person-panel` · CHECK `ends_on >= starts_on` | same: nothing asked which of the two dates was wrong | two checks added, 57 → 59 |
| `space-default-permission` · CHECK `default_permission IN (…)` | **a product bug** — see below | three checks added, 22 → 25 |
| `planner-blocks` · CHECK `ends_at > starts_at` | **already correct**, and never break-tested | patch written, the check proven |
| `comment-recording`, `ai-model-picker` | no constraint behind either | **safe as written** |

Two of the nine were safe, and saying so is part of the result: the hole needs
a second guard, and a sweep that reported eight vulnerabilities where six exist
would be the same defect one level up.

**AND ONE OF THEM WAS NOT A CHECK PROBLEM AT ALL.** Following
`CHECK (default_permission IN ('view','comment','edit','admin'))` to the suite
that exercised it found that none did — and then that the two write paths
disagree. Probed:

```
CREATE defaultPermission:"nonsense"   201, stored as "edit"
PUT    defaultPermission:"nonsense"   400, "invalid defaultPermission"
```

The same value, refused on one path and **silently widened to the most
permissive of the three the wizard offers** on the other, answering 201 with a
valid-looking row. A typo in any client, or a constant renamed on one side of
the wire, quietly opened a space up. Create refuses it now in the update path's
words; ABSENT still defaults, because that is the preset path.

### And a second one, where the check and the patch were both right

`task-merge` was one of the four uncovered suites closed, and two of its three
patches came back GREEN.

Neither check was worthless and neither patch was wrong about the code. Both
checks assert `status >= 400 && < 500` and nothing more, and in both cases a
**second guard refuses the same input**:

- merging into your own subtask is caught by `target-is-descendant` — and,
  since the source has a subtask and the target IS that subtask, by
  `would-nest-twice` as well;
- merging an already-binned source is caught by `already-binned` — and, because
  a merged source is `isArchived`, by `assertTaskWriteAccess` a few lines
  further down, which refuses archived tasks on its own.

So either rule can be deleted outright with the suite green, because the merge
really is still refused. **Defence in depth is worth keeping. A check that
cannot see which guard fired is not** — the one that rots will be the one
nobody is looking at.

The lesson was already in this repository, on `sidebar-reorder-9`: *two
mechanisms that produce one status code have to be told apart by their
message.* It had never been applied here. Two checks added that read the
sentence, 25 → 27, and both patches now name the check they really redden
rather than the one that stays green under them.

### Nothing had ever checked that a patch names a check that exists

A patch's `# Reddens:` line is the only thing tying it to the thing it proves,
and **a patch whose claim has rotted still applies perfectly** — so no run, no
anchor check and no `PATCH FAILED` line will ever mention it.
`teams-empty-state-1-one-card` named *"the frame's two explainer cards"*, a
check that had not existed for a day, and it was found by reading it. There were
573 patches when this was written and there are 744 now.

`scripts/check-break-claims.mjs` resolves each patch's suite the way a reader
does — what the header says, else the longest filename prefix that is a suite,
else whichever suite contains the sentence — and verifies the quoted sentence is
really there. On arrival: **345 verified · 85 unverifiable · 22 claim a check
their suite does not have · 121 make no claim at all.**

**Every one of those 143 is closed.** The run now reads **652 verified · 5
verified in another suite · 87 unverifiable · 0 · 0 · 0**, and the ratchet's
three baselines are all at zero. The arc, because the intermediate numbers are
the finding:

| | claimless | claim not in its suite |
| --- | --- | --- |
| as found | 121 | 22 |
| after the parser learned the `# Reddens: "…"` form | 111 | 16 |
| after 83 patches were given their suite's own sentence | 28 | 16 |
| after the last 28 were written | 0 | 16 |
| after 15 paraphrases were replaced with the literal | 0 | 1 |
| after the backtick fold and `aoc-4` | **0** | **0** |

Two of the last three are worth naming, because neither was a patch aimed at the
wrong thing:

- **`po-2-headline-reworded`** quoted *"with frame `12:40`'s own headline"* and
  the suite writes it `` with frame \`12:40\`'s own headline `` — the check
  sentence is itself a template literal, so its backticks are escaped. 23 check
  sentences across 15 suites name a frame that way. The claim differed from the
  check by two backslashes, so the fold belongs in `norm` with the three already
  there. Break-tested by retyping the time as `12:41`: still CLAIM NOT IN SUITE,
  which is the difference between a normalisation and a matcher loosened until
  today's failure goes away.
- **`aoc-4-attach-input-unnamed`** removes the `data-testid` the suite's opening
  gate waits for, so the run throws *before its first check* and the
  `EXPECTED_CHECKS` guard fails it on 0 of 13. Its header quoted the two lines
  the run prints. Those are not checks, and a claim checker can only read them
  as checks the suite does not have — so it says in prose that there is no
  sentence to quote, which lands it in `unverifiable` where it belongs. It still
  names its suite after the colon, because `check-break-coverage.mjs` reads that
  line too and dropping the colon silently cost the patch its attribution
  (743 → 742) with every check still green.

**And the matcher was in two files, which had drifted.** `check-break-claims.mjs`
asks whether a quoted sentence is in the suite the patch names;
`check-break-coverage.mjs` asks which suite a patch belongs to — different
questions over the same `norm`/`findsClaim`, each with its own copy. By the time
they were pulled out into `scripts/lib/claim-match.mjs`, coverage's copy had
neither the en/em-dash fold nor the backtick unescape. Nothing published a wrong
number today; the defect is that it could, and that each file's number looks
authoritative on its own — a patch attributed to a suite by one checker and
reported as quoting a sentence that suite does not have by the other, both true
of the matcher that produced them. The extraction is verified by diff: byte-identical
output from both checkers before and after.

It took four passes to stop lying, and the intermediate numbers are the reason
the first was not written down. **136** "names no suite that exists" became
**1** once it knew that `# Reddens: "…"` with no suite name is a legitimate
format, because the FILENAME carries the suite — a fact about the parser, not
about the patches. **72** "claims a check their suite does not have" became
**22** after three spellings of one sentence stopped counting as three missing
checks (`\"` from being inside a Python string, `'` against the suite's `"`, and
suites that quote a label INSIDE the sentence where the claim does not), and
after matching moved to the longest literal fragment, because a check sentence
is usually a template literal and `…four columns wide at ${VIEWPORT.width}px`
cannot be found by searching for `1440px`.

**The tuning stops at five consecutive words**, and that is a decision rather
than a threshold: each loosening converted artefacts into verified claims, and
one more loosening would have converted real ones too. Five words of a check's
own sentence do not appear by accident in a different check. What is left over
is reported, and some of it is a patch paraphrasing where it should have quoted
— a real defect in the patch, and not one the matcher should be bent to hide.

It is registered as a **ratchet**: the numbers are in the file and the build
fails when one grows. Failing on arrival makes red the normal state, and a check
everybody steps over is worse than none; exiting 0 with the findings printed is
a check that cannot fail. Break-tested both ways — a claimless probe patch, and
a real claim reworded to a plausible synonym of its own check, each take it to
exit 1. **Re-break-tested at zero, three ways**, because a ratchet resting on a
floor is a different check from one resting on a backlog: a patch with no
`# Reddens:` line, a patch quoting a sentence no suite anywhere contains, and a
patch naming a real suite and a check it does not have — `noClaim: 0 → 1`,
`noSuite: 0 → 1`, `notFound: 0 → 1`, exit 1 each time, exit 0 with all three
removed.

`unverifiable` is deliberately **not** ratcheted. A `unit:` claim and a patch
that legitimately has no sentence to quote both land there, and a ratchet over
them would push the next author into quoting something rather than saying there
is nothing to quote — which is exactly the defect `aoc-4` had.

### The two checkers, and the one that broke what it was measuring

Six withdrawn rows and five unproven patches were all found in about a minute
by two scripts, and none of them had been found by eight hours of reading the
same table. Both scripts exist because the eye-version produced the numbers
above.

- **`scripts/check-break-patches.py`** dry-applies every patch and reports the
  anchors that would miss. Every patch already asserts `s.count(a) == 1` before
  writing, so the assertion IS the test — it just had to be run without the
  write. 567 of 573 applied when this was written; **744 of 744 apply now.**
- **`scripts/check-break-freshness.mjs`** asks, per suite, whether the recorded
  run postdates the suite's last change, and flags a log that refused or holds a
  patch that never built.

**The first one edited 62 source files while claiming to be a dry run.** It
seeded a fake `io` into each patch's globals — and every patch begins
`import io`, which rebinds that name to the real module on its first line, so
the guard was gone before the first write. The patches then ran for real,
each against a tree the previous ones had already modified, and its output was
mostly an artefact of its own damage: it printed **57** anchor failures where
the true number is **6**. Nothing was lost, because the work was committed and
`git checkout -- .` restored all 62. It now patches the real `io.open`, restores
it in `finally`, and **verifies `git status` before and after, aborting if a
byte changed** — a check that cannot say what it did to the thing it measured is
not a check, and this one was one `import` away from being believed.

Both DOUBLE hits it found turned out to be correct code, which is the other half
of why `== 1` is right. An anchor beginning with spaces cannot pin indentation —
a more-deeply-indented copy of the same line contains it — and the two that
matched twice were a loading skeleton repeating its card's header, and
`ai-panel`'s two model lists (Best models, and the four behind Show more). The
second mattered: `mp-4` has to conflate choosing-with-preferring in BOTH lists,
because patching one leaves the check free to click the other and go green
against a defect sitting in the same file.

**A harness defect this exposed, not yet fixed:** `wt-break.sh` truncates
`break-<suite>.txt` on every run, so a later single-patch re-run erases the
full set's record. That is why `list-customize`, `command-palette`,
`list-card-cover`, `custom-field-types`, `gantt-controls` and `sidebar-dms` each
show one patch on disk. The runs happened; the evidence did not survive them.
Per-run files, or an appended run header, would have cost nothing.

THE ONE THAT DID NOT, AND HOW IT WAS FIXED. A `template-center` patch would
not compile. `const targetType: TemplateTargetType = 'folder'` is narrowed by
TypeScript to the literal `'folder'` despite the union annotation, so the five
`=== 'list'` and `=== 'space'` comparisons downstream all became TS2367 "no
overlap" and the patch reported BUILD FAILED without ever reaching a check. It
is written `(['folder'] as TemplateTargetType[])[0]` now: same value, same
break, and the union survives. This is the third time the same narrowing trap
has cost a break patch, so it is written down in the process file rather than
rediscovered a fourth time. A patch that cannot build proves nothing about the
check it was aimed at, and is counted as unproven rather than quietly folded
into the total.

TWO MORE PATCHES WERE NOT PROVING ANYTHING EITHER, and neither said so
usefully. `sidebar-sections-12` anchored on `return target.kind === 'project'`
as the last line of `canDropOn`; a `folder` branch was added below it and the
function now ends `return false`, so the anchor matched nothing. `-15` anchored
on the tree-invalidation loop, which is written twice since a second drop path
appeared, so it matched twice and refused. Both reported PATCH FAILED against
code they were still perfectly able to break. **A break patch that cannot find
its line is a check with no baseline**, and it is indistinguishable, in a long
log, from a check that was never worth writing.

### The Form set, and the two patches that are really about the checks

Baseline 28/28, five patches, five reddened. `form-2-rule-by-index` puts the
menu's group rule back on a literal index — the regression that had already
shipped unnoticed, where inserting Form at position five moved the rule from
above List to above Form with every item still present, in order, correctly
labelled. It reddens one check, which is the check written after the fact to
catch exactly it. `form-5-space-lists-endpoint` points the destination picker
back at `GET /lists/space/:id` and reddens two: it is the defect as found,
preserved so the endpoint's narrower meaning cannot quietly be re-adopted.

### Five checks proved worthless while green, and every one was the check

`sidebar-dms` was 9 of 10 first. `sidebar-dms-7-count-is-a-constant` replaces
the DM section's `data-count` with the literal `1` — a count that can only ever
say one thing — and came back **14 passed, 0 failed**, because that run had
exactly one direct message. The suite already refused a workspace with NO DMs,
on the stated grounds that every check below would pass vacuously; one is the
same problem a step along, and it is the single number a hardcoded count is
most likely to be. Fixing it needed a second conversation, which needed a third
workspace member, and the seed ships two users — so the fixture registers a
peer and adds them, and the guard now demands two. Suite green at 14/14 with
the new fixture, and the same patch re-tested against the strengthened check
reddens **13/1** — so the set is 10 of 10, and the check now proves what it
always claimed to.

Put beside the others, the shape is the same every time and the mechanism
never is:

| suite | why the broken build passed |
| --- | --- |
| `folder-dialog` | the fixture made a space with no preset, so a list correctly fell back and the suite's own guard fired |
| `list-customize` | the check read an un-invalidated `useMemo` — a cached correct answer |
| `sidebar-dms` | one DM, so a hardcoded `1` matched the real count |
| `teams-empty-state` | the check asserted the ABSENCE of what the frame draws, and cited the frame for it |
| `list-assignee-filter` | one task had a checklist, so "its item is assigned to me" and "it has any item" were one set |

None could have been found by reading the suite: every suite was green and,
except for the fourth, every product was correct. **This is the argument for
step 6 in five lines.**

THREE OF THE FIVE ARE ONE ROOT CAUSE. `folder-dialog`, `sidebar-dms` and
`list-assignee-filter` all failed the same way — a fixture in which the right
answer and the wrong answer are the same value. One preset, one DM, one
checklist. The rule that falls out of it is now in the trap list: **seed two of
anything a count or a set is asserted over, and make the fixture CREATE the
second rather than hope one exists.** `sidebar-dms` needed a third workspace
member registered to get there; `list-assignee-filter` needed a second
checklist with an unassigned item. Neither was reachable by hoping.

### The patch that proved a CHECK wrong, which is what step 6 is for

`list-customize` was 7 of 8 first, and the eighth is the one worth reading.
`list-trio-8-parent-from-visible-only` swaps `tasks` for `visibleTasks` when
resolving a subtask's parent title — the exact one-line mistake check 8 exists
to catch, the shorter version that looks right — and it came back **37 passed,
0 failed**.

The product was correct and the check was worthless. The annotations are a
`useMemo` keyed on `[tasks, …the two switches…]`. Hiding the closed parent
changes `visibleTasks`, which is **not one of those keys**, so the memo never
re-ran and the broken build went on serving the map it had built while the
parent was still on screen. The check was reading a cached correct answer and
reporting it as evidence.

It cycles the switch off and on now, which moves a key the memo watches, and
the same patch reddens 36/1. **Nothing but break-testing could have found
this**: the suite was green, the code was right, and the check proved nothing —
which is indistinguishable from a good check right up until the day it matters.

### The set that proves the folder statuses column is real

Eight patches against the eight checks added for frame `08:32`, baseline 21/21.
Each reddens the check it names, and three are worth reading:

- **`20-stores-and-tells-nobody`** reads `folders.status_scope` and then
  discards the answer. It is the mirror defect written out in four lines: the
  column is there, the dialog writes it, Postgres holds the right value for
  ever, and nothing changes. The check catches it because it compares a list's
  effective statuses **key for key with the space's own** — the space had
  `["complete","in_progress","todo"]` and the list came back with the six
  seeded defaults. A count comparison would have read 3 against 6 and passed
  for the wrong reason on the day those numbers matched.
- **`16-preset-seeds-nothing`** makes a preset seed no space statuses at all.
  This is not hypothetical: it is what the suite's own first run hit, on a
  fixture that created a space without a preset, and the guard check placed
  above the real assertions is what caught it.
- **`19-new-reader-breaks-the-writer`** takes the join out from under the new
  lookup. Every list create 500s, the suite aborts partway, and the exact-check
  guard reports `ran 20 checks, expected 21` — which is the guard doing the
  only job it has.

### The two that mattered

**A patch stopped reddening because the code got better.** `task-delete-6`
removed the `isArchived` filter from the list query and the check still
passed — not because the check was weak, but because a later fix had added
`isNull(deletedAt)` *beside* it. Two independent conditions hide a binned
task, so removing one proves nothing. Good code, stale patch; the patch was
rewritten to remove both and reddens with *"the list endpoint returned
deleted=true, control=true — a delete that leaves the task on screen is not a
delete"*.

**The harness itself was wrong twice, and both times it manufactured green.**
`pkill -f` matches a command line, and the API was being killed by an
environment variable that appears in none — so the old, unpatched server kept
the port and every API-side patch reported its suite still passing, while
web-side patches reddened normally. And after a web patch the built bundle
stayed patched, so the next API-only patch measured the previous patch's
breakage. Both are now in the process doc's trap list, because a break test
that cannot break anything is the same defect this audit exists to find,
one level up.

### Closing uncovered suites: 47 → 27, and what the patches found on the way

The coverage script's ratchet has come down in stages. What follows is the
current batch, and the point of writing it out is that **four of the six
suites gave back something the suite did not know about itself.**

| suite | patches | reddened | what it cost to find out |
| --- | --- | --- | --- |
| `malformed-ids` | 4 | 4 | — |
| `trending-sort` | 4 | 4 | a check that could not fail for its own reason |
| `undo-delete` | 4 | 4 | three checks asserting a restore by its status code |
| `task-provenance` | 3 | — | a fourth patch that had to not be written |
| `search-sources` | 4 | — | — |

**`undo-delete` said one thing in its header and did another.** Its second
paragraph reads *"every check here reads the list back FROM THE API after
pressing it"* — and the three checks that call `POST …/restore` directly
asserted `status < 300` and nothing else. `undo-delete-3` removes `restore`'s
`type === 'space'` branch: an if/else chain over a union has no exhaustiveness
check, so the space falls through every branch, the method writes nothing, logs
its audit event and answers **201**. The old *"and so can a space"* would have
passed. Each of the three now reads its row back (8 → 11 checks), and the run
shows exactly that split — `undo-delete-2` prints

```
FAIL restore returned 201 and is_archived is still true — a 200 is not a restore
```

three times, beside three status checks that are still green.

**`trending-sort` lost a check to arithmetic nobody had done.** `trending-sort-1`
scores every hit zero and was predicted to redden three checks. It reddened
two: *"a colleague's opens move the workspace list"* passed. The colleague
opened `restBefore[0]` — whatever relevance had already put first — so under a
build with no trending sort at all it is still first. The check asserted that
engagement moved the list and proved only that the list had not been shuffled.
It opens `restBefore[1]` now.

That one is worth the paragraph for a reason beyond itself: it was found by a
patch reddening **fewer** checks than predicted, not more. Predicting the set
before the run is the whole of the method, and this is the first time the
prediction being too high was the finding.

**`task-provenance`'s fourth patch was dropped before it was written.** It
would have cleared the `origin` marker when a type is renamed — and the suite
renames the seeded type, so the column would have come back `null` for good.
`git checkout -- .` reverts the source and not the lane's Postgres: every later
run of that suite on that lane would have failed its baseline for a reason
nothing in the tree could explain. The rule is now in the process doc. *Does
the patch write something the suite did not create?*

**And the runner had been reading from the wrong directory.** Break patches
lived in `/tmp/claude-0/breaks` before they were committed; `wt-break.sh` was
never moved to the tracked copy. Twelve patches written straight into
`test/e2e/breaks` came back `== <name> MISSING`, and `break-queue.sh` — whose
entire purpose is to report these numbers honestly — printed

```
patches 4 · STILL-GREEN 0 · UNBUILT 0
```

for two sets that had opened no file at all. A `MISSING` line starts with
`== `, is not a control line, is followed by no result line and says neither
BUILD nor PATCH FAILED, so it fell through every category the summary had.
**A summary that cannot say "nothing ran" will say "nothing went wrong"
instead.** All three scripts now count it, `check-break-freshness.mjs` fails on
it, and `PATCH CHANGED NOTHING` got its own column in the same edit — before it
had cost anything, because it was sitting in the identical gap.

The two directories held 614 byte-identical files, which is the only reason
nothing already recorded describes the wrong patch. That is luck, not a
property: it held only because no patch had yet been edited in place.

### 47 → 17, and the checks that could not fail

Sixteen suites closed. The table is the boring half; the column that matters is
the last one, because **ten of the sixteen gave back a defect in the suite
itself.**

| suite | patches | reddened | what it gave back |
| --- | --- | --- | --- |
| `malformed-ids` | 4 | 4 | — |
| `trending-sort` | 4 | 4 | a check that could not fail for its own reason |
| `undo-delete` | 4 | 4 | three restores asserted by status code (8 → 11) |
| `task-provenance` | 3 | 3 | a fourth patch that had to not be written |
| `search-sources` | 4 | 4 | — |
| `bookmarks` | 5 | 5 | a cascade the prediction was too narrow for |
| `list-statuses-seeded` | 4 | 4 | an absence with a second cause (9 → 10) |
| `list-save-view` | 4 | 4 | — |
| `replies-inline-thread` | 4 | 4 | — |
| `request-access` | 4 | 4 | cleanup that only ran on the happy path |
| `planner-priorities` | 4 | 4 | a claim no browser check can make (9 → 10) |
| `space-features` | 5 | 5 | a merge two fixtures could not distinguish (10 → 12) |
| `assign-to-priorities` | 5 | 5 | a toast clicked after it had expired |
| `time-estimate` | 5 | 5 | nonsense that was only ever a word (11 → 13) |
| `comment-slash-commands` | 4 | — | narrowing asserted by naming what should be there |
| `assignee-picker` | 5 | — | — |

**The shape repeats, and the mechanism never does.** Four of the ten are the
same sentence about a different thing: a check that names only what SHOULD be
present cannot see a mechanism that has stopped working, because the thing it
names is present either way.

- `comment-slash-commands` asserted *"what follows the slash narrows it to
  Quote"* by checking Quote is visible. `matchBlocks` returns every block for a
  blank query, so Quote is visible in an unfiltered menu too. **The absence of
  what does not match is the claim.**
- `space-features` had one space with no feature map and one with a complete
  map. `{ ...ALL, ...stored }` and `stored` are the same answer for both, so
  the merge that stops a newly shipped switch retroactively switching itself
  off could have been deleted with the suite green.
- `time-estimate`'s only bad input was the word `soon`, which has no digits —
  so the parser refuses it whether or not it requires the whole box to be a
  duration, and all three nonsense checks passed under a parser that had
  stopped guarding anything.
- `list-statuses-seeded` asserted a closed task is ABSENT from the teams work
  preview, and created it with no assignee, while that endpoint joins
  `task_assignees`. It passed on the exact bug it was written for.

**AND ONE PROPERTY TURNED OUT NOT TO BE OBSERVABLE AT ALL.**
`planner-priorities` claims the rail and the person panel share one React
Query key. The first check called the endpoint directly — nowhere near a cache.
The second really opened the panel through the app after writing in the rail,
and the patch that gives the panel its own key **still ran green**: the panel
MOUNTS when it opens, which is after the write, and a `useQuery` whose key
holds no data fetches on mount. With React Query's default `staleTime: 0` even
a populated key refetches on remount. There is no moment at which that screen
can hold a stale panel.

So the key is pinned by `apps/web/src/lib/use-priorities.test.ts` instead, and
the browser check is restated to what it does prove. **Before writing a check
about stale state, name the moment the reader holds the stale value.** If that
moment does not exist, the check is a sentence about a mechanism rather than a
test of one.

**PREDICTING THE REDDENED SET BEFORE THE RUN IS WHAT FOUND MOST OF THESE**, and
it works in both directions. `trending-sort-1` was predicted to redden three
checks and reddened two — the colleague opened whatever relevance had already
ranked first, so the check held under a build with no trending sort at all.
`bookmarks-2` was predicted to redden one and reddened three, and the two extra
were an honest cascade: the peer's delete really removes the row, so the checks
that read it back cannot pass. A prediction that is too high finds a weak
check; one that is too low finds reasoning nobody did. Both get written down;
only one of them is comfortable.

**TWO PATCHES WERE NOT WRITTEN, AND SAYING SO IS PART OF THE RESULT.** A fourth
`task-provenance` patch would have cleared the `origin` marker on rename — and
that suite renames the seeded type, so the column would have come back `null`
for good. `git checkout -- .` reverts the source and not the lane's Postgres.
The test to apply first: *does the patch write something the suite did not
create?*

---

## 8b. Closing the eleven suites the coverage count could not see

The zero in §8 was true of 101 suites and silent about twelve. What follows is
what happened when the denominator was corrected, because closing those eleven
found more defects per patch than any comparable stretch of this audit — and
every one of them was in a CHECK or in the HARNESS rather than in the product.

### The denominator: 47 → 0 → 11 → 0

`check-break-coverage.mjs` counted a suite's checks by grepping `\bchk\(` and
gated everything on `checksIn[n] > 0`. A suite whose helper is named `check(`
counted zero checks and was dropped from the denominator — which means it could
not appear in the uncovered list however long nobody wrote a patch for it.
Eleven tracked suites are in that state, carrying **633 checks**: `ui-sweep`
(107), `video1-fast-items` (92), `task-depth` (91), `chat-message-actions` (73),
`settings-depth` (61), `panel-collapse` (56), `syncup-live` (48),
`addressability-live` (28), `stale-chunk-recovery` (27), `loading-states` (26)
and `emoji-picker` (24). A twelfth, `person-panel` (59), was also invisible and
already had patches.

The count is each suite's own `EXPECTED_CHECKS` now: every one of the 113 files
declares one, it is the exact runtime count rather than a static
approximation, and each suite compares its own result against it on every run —
so unlike a `chk(` tally it cannot drift from what the suite does. It also
stops missing a wrapper: `video-regression` routes fourteen checks through a
local helper, and the grep saw 67 where the suite runs 93.

**47 → 0 → 11 → 0 is one number being corrected, not three regressions**, and
the ratchet's own comment now says which direction of move is legitimate and
why, so the raise cannot be used as cover later.

### Eleven sets, forty-seven patches, and what they found

| suite | patches | reddened | found |
| --- | --- | --- | --- |
| `emoji-picker` | 6 | 2·6·1·2·1·2 | a persistence check vacuous twice over; an unguarded click that killed the run |
| `loading-states` | 5 | 1·1·2·5·1 | nothing; the suite held |
| `stale-chunk-recovery` | 5 | 1·3·1·1·1 | a reload-loop check too loose to see a missing cooldown |
| `addressability-live` | 4 | 2·1·3·2 | three unbalanced branches; a facade check reading the whole document |
| `panel-collapse` | 4 | 6·1·1·2 | six unbalanced branches; four unbounded clicks; a section leaking a persisted preference |
| `syncup-live` | 5 | 1·1·1·1·1 | the only suite keeping a floor; ten unbalanced branches; a third delivery fact nobody asserted; a record read from another suite's row, and deleted |
| `settings-depth` | 4 | 2·1·1·1 | the workspace-package resolution bug |
| `chat-message-actions` | 4 | 6·3·1·1 | a check that named "local" and read only the format, in a UTC container; an unbounded click |
| `task-depth` | 4 | 6·2·1·3 | four unbalanced branches; an unguarded dereference |
| `video1-fast-items` | 4 | 2·3·1·1 | fifteen unbalanced branches — and four patches with no surviving run log at all until 22 September, which is what the freshness check was written to find |
| `ui-sweep` | 4 | 1·1·1·2 | a literal `check(true, …)`; a level-hint check scanning the whole dialog |

### The four patches that ran GREEN

Each one was a defect in the check, and none was visible by reading it.

**`emoji-picker-5-frequent-not-persisted`** deletes `writeFrequent` outright.
"and it leads Frequently Used next time" was vacuous in two independent ways:
it picked `.first()` — whatever already led the row, so the claim was satisfied
by nothing happening — and it re-opened the picker by clicking its trigger
twice, which does not remount anything. The count lives in
`useState(() => readFrequent())`, so storage is read once at mount with the
running total in a ref beside it: a picker that wrote nothing down still showed
the right order for as long as it stayed open. It picks the SECOND entry now
and reloads the page. **Third instance in this audit of a persistence check
satisfied by an in-memory copy.**

**`sl-3-call-card-not-broadcast`** keeps the `chatMessages` insert and drops the
realtime emit. The suite split the claim in two so it could say which half
broke — written on the server, seen on the screen — and the second check
RELOADS before giving up, deliberately, to separate never-announced from
never-written. That is also why neither check can tell a card that was pushed
from one that was merely stored. The suite computed `neededReload` and read it
nowhere: a value derived correctly, by a variable named after exactly the fact
nobody asserted. It is a check of its own now.

**`sd-1-contrast-marks-but-does-not-paint`** was inert, and the reason is the
harness — see below.

**`al-2-chat-channel-chosen-silently`** was aimed at an alias. `setSelectedId`
is assigned one line below `selectChannel` and used by the sidebar; the fallback
effect calls `selectChannel` directly. The patch applied, changed a real line,
and the suite came back 28 of 28. Reading the assertion and walking outwards
from it is the rule; reading the alias and hoping to meet the assertion is what
that was.

### A conditional check makes the run LENGTH conditional

Every suite compares its check count against `EXPECTED_CHECKS` with `!==`. So
an `if` whose body calls `check()` and which has no `else` turns a product
regression into a statement about the harness:

```
84 passed, 4 failed
✗ 88 of 92 checks ran — this run stopped early
```

Those four FAIL lines named the missing AI dock. The headline says the RUN is
broken, and a person reading it reaches for the harness.
`vr-4-the-ai-dock-is-only-on-the-ai-page` produced that, and with
`video-regression`'s G13-10 chain reporting eight checks on every path the same
patch reddens **nine** and the run reaches its own totals. One of those eight
sentences — "the AI dock can be opened" — existed ONLY on the branch where
there was no dock to open, so the path that clicked it never asserted it was
there.

Five instances in two days, every one found by running a patch:
`video-regression`'s chain, `emoji-picker`'s retry click, three branches in
`addressability-live`, six in `panel-collapse`, ten in `syncup-live`, four in
`task-depth`. It is now `scripts/check-suite-check-branches.mjs` — a heuristic
that says so in its own output, ratcheted from 55 down — and
`test/e2e/lib/chain.mjs`, which reports the remainder as FAILED with the reason
the chain stopped. **A check that did not run is a check nobody knows the
answer to, and the honest way to say that is to fail it with a sentence
explaining why.**

The one exception is narrow: a gate on the MACHINE or the DEPLOYMENT, which
`skipRest` reports as SKIP. It only works where the skip is COUNTED, and that
is what let `syncup-live` stop being the one suite keeping a floor — see below.

### `syncup-live` kept a floor, and the exception was wrong

Its comment argued the case carefully. Five checks depend on the machine, so 53
locally and 48 on a headless runner, and *"an exact comparison has to be wrong
on one of them"*.

There was a third option. A check that cannot run is not ABSENT, it is UNKNOWN,
and an unknown outcome can be reported and counted like any other. With a
counted `skip()` the total is the same number on every machine, `!==` catches a
branch that vanished silently, and a runner with no soundcard still exits 0.

**And the exception named the wrong five.** It said two speaker-picker checks
and three recording checks. Measured from a run, the five that skip are all one
gate — the storage chain, because no bucket is configured here. The speaker
picker and the AI Notes entitlement both ran as real checks. The floor of 48 was
53 minus five checks that were not the five it described: the stale reason, in
a comment whose whole job was to justify an exception.

### And the same suite was reading another suite's record — and deleting it

The exact count turned the floor into a number that can fail, and the first
thing it caught was not a product regression. `syncup-live` ran `53 passed, 1
failed, 5 skipped`, and the one failure was `naming everyone who was there (1)`
on a call two people had just spent a section in.

The record was fine. The database held it with both attendees. What the suite
read was a different meeting.

It found the record by asking for the meetings list and taking the first row
whose start was at or after this call's, under a comment stating it was *"pinned
to THIS call rather than the newest meeting"*. That is the **stale reason**
again, and this time in a comment describing its own line: the list is ordered
`startsAt DESC`, so a meeting SCHEDULED IN THE FUTURE outranks a call that
ended a second ago. `a39-dm-tabs` seeds one dated tomorrow in the same lane
database. The row the suite read was `A39 Sprint sync with colleague`, with its
one attendee, while the call's own record sat below it. **Every green run before
this was luck about what else the database happened to hold.**

The second half is worse than a false failure. §7 tidies up with
`DELETE /workspaces/:ws/meetings/${record.id}` — so on every run where the pin
missed, `syncup-live` deleted another suite's fixture on its way out, and the
suite that finds itself short of a meeting next week has no way to trace it
here.

It asks `POST /calls/:id/end` for the id now. `end` is idempotent by
contract — *"Ended AND the record is there: nothing left to do"* returns it — so
asking after the UI has already ended the call changes nothing, and `pending:
true` is the named state where the id is still coming, which is why it polls.
The check that reads the product is still the one above it, and it has already
run and already failed by the time this asks for an id.

**And the attendee check had no patch that could have found this.** `sl-5`
narrows the attendee list to participants whose `leftAt` is null — which at
record time is nobody, because the record is written by the last person out
from inside `leave`, after their own `leftAt` is stamped. A call two people
spent twenty minutes in leaves a record naming one of them, every mechanism
around it working. It reddens exactly one check. It could not have been written
against the old pin: a check that fails for the wrong reason cannot be broken on
purpose.

The sweep for the same shape found no other instance — every other suite that
touches `/meetings` either POSTs its own fixture or matches on the id it was
given.

### Six harness defects, four of them silent

1. **The short-run line was never captured.** `wt-break.sh` recorded FAIL lines
   and the `N passed, M failed` summary. `✗ N of M checks ran` matches neither,
   so `vr-4` was recorded as "84 passed, 4 failed" with nothing to say four
   checks never happened, and `break-queue.sh` counted it as a clean reddening.
2. **`head -4` truncated the FAIL list silently.** A patch reddening seven
   checks was recorded as reddening four — and every prediction-vs-actual count
   in every patch header is read off that file.
3. **A CRASHED run was counted as a reddening.** `emoji-picker-2-data-inlined`
   killed the suite on an unguarded click, and what `$OUT` held was a patch line
   with three FAIL lines under it and no totals: byte-identical to a patch that
   reddened three checks.
4. **A SHORT BASELINE was accepted as green.** The baseline gate checked for
   `0 failed` and ignored the short-run line, so a baseline that stopped early
   would have had every patch measured against a run shorter than the suite.
5. **The tally double-counted.** Six greps over one file with overlapping
   patterns, with REDDENED derived by subtraction — so a short run reporting
   `0 failed` counted as STILL-GREEN *and* as SHORT, taking REDDENED below zero
   and tripping "PROVED NOTHING" on a set that proved something. One awk pass
   assigns each patch exactly one outcome now, and the partition is asserted.
6. **A patch to `packages/**` was applied in the worktree and built from the
   repo.** The worktrees borrow `node_modules` with an absolute symlink, and
   pnpm links workspace packages relatively inside it —
   `@rundesk/ui -> ../../../../packages/ui` — so four levels up from the REPO is
   the repo. A patch to `packages/ui/src/styles.css` applied cleanly, appeared
   in `git diff` (which is what triggers the rebuild at all), rebuilt the
   bundle, and produced a byte-identical one. `PATCH CHANGED NOTHING` cannot
   catch it: the patch really did change the worktree.
   `sd-1-contrast-marks-but-does-not-paint` ran green this way, and
   `folder-create-12-toast-bottom-right` was recorded as reddening three checks
   unrelated to its claim.

And a seventh found by fixing the sixth: **`dist/` is not tracked, so
`git checkout -- .` leaves the last patch's BUNDLE on disk.** The restore block
put the sources, the database and the API binary back and never rebuilt the web
bundle — and the last patch in a set is usually a web one. A lane could open
suite B against a bundle still carrying suite A's final patch, and a patch for
one suite rarely reddens another, which is exactly what makes it silent.

### And the number that says where this is still shallow

With every suite covered, the honest next question is how deeply. Measured
across all 113: **2738 checks and 798 patches, 3.5 checks per patch.** The
eleven just closed sit at 15 to 27 — a seventh of that density — and two suites
sat much further out:

| suite | checks | patches | checks per patch |
| --- | --- | --- | --- |
| `person-panel` | 59 | 1 | 59 |
| `command-palette` | 43 | 1 | 43 |
| `ui-sweep` | 107 | 4 | 26.8 |
| `video-regression` | 93 | 4 | 23.3 |
| `video1-fast-items` | 92 | 4 | 23 |
| `task-depth` | 91 | 4 | 22.8 |

One patch clears the ratchet. It does not make 59 checks break-tested, and
saying otherwise is the same overclaim as the zero that started this section.
So the two thinnest were deepened first — six more patches, and the choice of
what to aim them at was made the way step 6 says: read the assertion, not the
feature.

`person-panel` gained three. Ticking a priority off DELETES the row, which is
what most checklists do and is the one thing `[05:54]`'s "I did that today"
rules out. The local-time clock becomes the zone NAME — more precise, never
stale, and it asks the reader to do the arithmetic, which is what the question
was. And a person with no manager gets a blank, which the reader cannot tell
from "has not loaded yet".

`command-palette` gained three. `shouldFilter: false` is deleted — one line
with no comment at its call site, and a `<Command>` that does not filter reads
like a component being used wrong, which is precisely how the original defect
shipped: cmdk re-filters by visible text, so a row matched on a word in its
DESCRIPTION is dropped and a palette holding four results says "No matches".
Clear filters stops resetting the two created-date fields, in a handler whose
own comment describes exactly that regression. And the 700ms assistant debounce
goes, which looks redundant beside a search that deliberately re-keys per
keystroke — nothing on screen changes, and a fourteen-character query becomes
fourteen model calls. That last one is the failure that shows up on an invoice
rather than in a screenshot, and the only check that can see it is the one
counting requests.

### Fifty claims that were correct and never compared to anything

A third instance of the shape above, and the largest. Fifty patch headers named
their check in PROSE — `# Reddens: attach-on-create: the file input accepts
several files at once` — and the matcher only reads quoted spans, so fifty
correct claims had never been compared to their suites at all. Forty-six verify
verbatim the moment they are quoted, across `attach-on-create`,
`create-menu-ai`, `folder-dialog` and `space-wizard`.

**Claims: 741 → 789. Unverifiable: 53 → 5** — three `unit:` claims pointing at
a `*.test.ts`, and two headers that deliberately say there is no check sentence.

The four that did not verify were not check sentences, and reading them found
two more things.

**A patch about hand-kept lists kept its own, and it had drifted.**
`space-create-menu-5-twolists` claimed "the strip offers every kind in
`CREATE_TYPES`", which no suite says; the real sentence is *"every kind the
space menu offers has a quick-create tab of the same name, plus Space"*. Going
to look at it showed the patch's replacement list dropped `reminder` as well as
`form` — eight kinds where `CREATE_TYPES` has ten. It reddened the check either
way, which is exactly why nothing said so. A patch that drops one entry is the
mistake somebody makes; a patch that drops two is a patch that was not read.

**And two patches whose whole evidence was that the suite stopped.**
`fp-6-pill-never-rendered` and
`calendar-accounts-1-calendars-popover-traps-the-page` both claimed "the whole
run". `focus-pill` clicked the pill unqualified, so a patch that removes the
pill spent thirty seconds retrying and threw with three of fifteen checks
unreported — and it threw outright when a short block drew no pill, where *"its
ending proves nothing"* is a reason that belongs in a failing check's detail.

`calendar-accounts` is the more interesting half: it pressed Escape as a
**fixture step**, with nothing asserting it, and that handler is precisely what
its patch removes. So there was no check for the patch to redden and nothing to
report but the wreckage — the picker's `fixed inset-0` catcher swallowed the
Settings click below and the suite threw. It asks the question now (33 → 34
checks), bounds the two Settings clicks, and recovers the way a mouse user has
to, so the Conferencing checks below fail for their own reasons or not at all.
Running it then found a second unbounded click in the same suite — `ca-1`
empties the workspace calendar group, so there is no Holidays row to untick —
which is the same fix and was invisible until the first one stopped hiding it.

### The claims that were correct and unread

`check-break-claims.mjs` reported 87 patches as "unverifiable (unit claims, or
no quoted sentence)". Asking what those 87 actually contain turned up two
separate reasons a CORRECT claim went unchecked, and only three of the 87 were
what the label said.

**Eleven claims were truncated.** `reddensBlock` treats a `#` line with two or
more spaces of indent as a continuation, which is what keeps a following
paragraph out of the block. Eleven patches wrote theirs with ONE space, so the
parser stopped at the first line:
`teams-person-cards-2-confident-zero`'s block ended
`"the first person's row holds the first person's` — an unterminated quote — and
the two further sentences on the next line were never read. Re-indented, six of
the eleven became VERIFIED with no change to what they claim.

**Twenty-nine quoted with single quotes.** `tai-*`, `tat-*` and `tmn-*` write
`# Reddens: task-mentions -- 'the row itself says why'`, which is a quoted check
sentence by any reading, and the matcher only looked for double quotes.
Twenty-six of the twenty-nine verified the moment it was allowed to see them —
no rewriting at all. **A claim that is quoted, correct and unread is the worst
of the three states here: it looks checked.**

The apostrophe is why that was not done first, and the hazard is real — `the
first person's row holds the first person's work` has two, and a naive scan
reads the span between them. An opening `'` must follow the start, whitespace or
a bracket; a closing one must precede the end, whitespace or punctuation. A
possessive fails both, because it sits against word characters on the inside.
Measured over all 798 patches: it finds the 29 and none of the possessives.

The three that still did not verify were each eliding an interpolation.
`tmn-4` wrote `Whiteboard:Board TAG` where the file has `Whiteboard:Board
${TAG}`; `tai-8` wrote `the hint reads ... both halves`, the ellipsis standing
in for the value the sentence interpolates. Both now quote the literal part.

**740 verified, up from 706; 53 unverifiable, down from 87.** Five ratchet
numbers, all at zero, two of them new and both break-tested.

### Conditional check blocks: 55 → 0

Every one of the 113 suites now reports the same number of checks whichever way
it goes. `video1-fast-items` had fifteen, `syncup-live` ten, `video-regression`
nine, `ui-sweep` seven, `panel-collapse` six, `task-depth` four,
`addressability-live` four, `person-panel` two, and one each in `emoji-picker`,
`loading-states` and `stale-chunk-recovery`.

Every balanced suite was re-run and its count held — `video1-fast-items` 92,
`task-depth` 91, `ui-sweep` 107, `panel-collapse` 56, `video-regression` 93,
`person-panel` 59, `loading-states` 26. That is the point of the fix: the happy
path reports the number it always did, and a refactor that quietly changed it
would be the defect this sweep is about. `syncup-live` is the one that moved,
48 → 59, because a floor became an exact count with skips included.

Three things turned up on the way that were not the shape being fixed:

- **A heuristic that cannot see a fix keeps reporting one.**
  `loading-states` balanced its panel loop with an early `continue` rather than
  an `else`, and the checker kept flagging it because it matches the SHAPE.
  Written as `if/else` instead — the alternative is a permanent known-false
  entry in a list whose whole value is that every line in it is worth reading.
- **A check whose sentence was a statement about the fixture.** `ui-sweep`'s
  "two members with unambiguous names to drive the cycle with" failed when the
  workspace could not supply a pair, naming nothing in the product and leaving
  the run a check shorter than the path beside it. A reason belongs in the
  detail.
- **A counted skip for a gate on the INVOCATION.** `video-regression`'s `API`
  client only exists when the suite discovered the workspace itself, so given
  `WS` in the environment two checks could not be arranged — and the run's
  length then depended on how it was invoked, which under `!==` means one of
  the two invocations had to be wrong about the count.

### Two more checkers, and two shared modules

- **`scripts/check-suite-check-branches.mjs`** — the conditional-check ratchet
  above, in `ci.yml` and preflight.
- **`check-break-freshness.mjs` now asks the prior question**: is there a log at
  all? 289 of 792 patches have no surviving run log here. Two causes and it
  cannot tell them apart, so it does not guess: a set written and never run, or
  a set that ran before per-run archiving existed and was overwritten —
  `break-ai-answer-rendering.txt` holds one patch line out of twenty-three that
  ran.
- **And five logs it was skipping entirely.** A 23-patch suite gets run four at
  a time, and each batch was given its own log — `-batch1`, `-batch2`, `-full`,
  `-patch15-rerun`, `-fixed` — precisely so the truncation would not eat them.
  The checker looked for `test/e2e/<log name>.mjs`, found nothing, printed
  `??  not tracked` and moved on. So `custom-field-types`'s row read **1
  patches** — the canonical log holds one line — while the other 46 patch
  results sat in logs that were never compared to anything. The name is walked
  back a segment at a time now until a tracked suite turns up, the row says
  whose slice it is, and a slice measured against a suite that has since
  changed goes STALE like any other. Break-tested: a slice log dated before its
  parent's last commit fails, where before it was silent. The closing summary
  no longer counts an unmatched log inside "all N postdate their suite" either
  — an unmeasured log inside a total is how a number stops being about what it
  names.
- **`check-break-claims.mjs` reports a SECOND `# Reddens:` block**, because
  `findIndex` reads only the first. Thirteen patches had one, and in two of
  them the legacy line named a sentence the canonical block does not: `nor does
  Month, which spans five of them` and `outside the schedule are dimmed`. Both
  are real checks in real suites, claimed and verified by nothing for as long as
  the second line existed.
- **`scripts/lib/claim-match.mjs`** — the claim matcher was copied into two
  checkers and they had drifted: one had a dash fold and a backtick unescape,
  the other did not. Two checkers disagreeing about whether the same claim is in
  the same suite is the duplicated list one level up. Verified by diff:
  byte-identical output from both before and after the extraction.
- **`test/e2e/lib/chain.mjs`** — the same thing one level down.
  `panel-collapse` and `syncup-live` each grew their own `chain()` the same
  afternoon.

### The two shared modules, and the holes in them

Extracting the duplicated matcher and the duplicated chain helper was the right
move and it was not the end of it. Both modules are load-bearing — one decides
whether 798 claims count as verified, the other is used by eleven suites — and
neither had a test. Writing one for each found a hole in each, within an hour of
writing the module.

**`test/e2e/lib/chain.mjs` had the hole it exists to prevent.** `step` past the
end of its label list emitted `check(cond, undefined, …)`: a check with NO
SENTENCE, printing `PASS undefined` and counting towards the total, so a chain
used past its length silently inflated the count. Found by calling `step` three
times on a chain of two; invisible by reading. It throws now, with the labels in
the message, regardless of a label override — a label replaces the sentence AT a
valid index and does not buy an extra slot, because the declared length is what
`rest` and the suite's `EXPECTED_CHECKS` both depend on.

**And the first version of the matcher's test was itself a check that could not
fail.** It asserted the floor's existence and not its height: lowering
`MIN_WORDS` from five to four left it completely green, and the floor is the one
number a future loosening would reach for first. The assertions now fail in both
directions.

Writing that test also corrected something I had believed about the module. I
asserted that a four-word claim does not verify; it does, because `findsClaim`
tries the whole string before any fragment — and that is the right way round,
because the author wrote exactly what the file says. It matters in practice: 28
quoted claims are under five words and most are correct, quoting either a UI
label the check names ("Find Blockers", "+ Add Channel") or the literal part of
a template literal. What it costs is named in the test so nobody "fixes" it
later: a two-word verbatim claim is weak evidence.

Both tests are checkers rather than vitest files, because `test/e2e` has no
runner and inventing one for a couple of dozen assertions is how a check ends up
unregistered. Both are in `ci.yml` and preflight, and both are break-tested
three ways.

### Three more patches that ran green, and what each one meant

- **`sl-3-call-card-not-broadcast` ran green twice.** The second time is the
  interesting one: a third check had been added asserting the card arrives
  without a reload, and the card arrived anyway. `call.started` carries the
  channel id, and the web client invalidates `chat-messages` on any `call.*`
  event that has one — so the card has TWO independent delivery paths and
  neither can be removed on its own. No single plausible mistake can break that
  claim. The patch stops pretending to be one; it removes both, which is the
  minimum edit that can disprove the claim, and says so.

  The comment that hid it was wrong too: the invalidation justified doing
  nothing without a channelId by saying "the card is refreshed by its own poll a
  moment later either way". There is no such poll. `chat-messages` has no
  `refetchInterval`; the 20s one on that page is on RECEIPTS.

- **`us-3-share-levels-lose-their-meaning` ran green**, and `each level carries
  a one-line meaning` was `/only|explan|can |may /i` over the WHOLE dialog text.
  A dialog that also holds a title, a member list and a Copy link button matches
  one of four loose substrings whatever the levels say. It reads each level's own
  row now — and the rewrite promptly failed its own baseline, because the level
  is called "View only" and the check looked for `View` followed by a dash. The
  harness refused the set on a red baseline, which is the guard working: one
  refusal instead of four misread results.

- **`al-2-chat-channel-chosen-silently` was aimed at an alias** one line below
  the function the fallback effect actually calls. It applied, changed a real
  line, and the suite came back 28 of 28.

### And the runs, collected

Every set that has run since the denominator was corrected, with its baseline:

| suite | baseline | per-patch failures |
| --- | --- | --- |
| `emoji-picker` | 25 · 0 | 2 · 6 · 1 · 2 · 1 · 2 |
| `loading-states` | 26 · 0 | 1 · 1 · 2 · 5 · 1 |
| `stale-chunk-recovery` | 27 · 0 | 1 · 3 · 1 · 1 · 1 |
| `addressability-live` | 28 · 0 | 2 · 1 · 3 · 2 |
| `panel-collapse` | 56 · 0 | 6 · 1 · 1 · 2 |
| `syncup-live` | 54 · 0 · 5 skipped | 1 · 1 · 1 · 1 · 1 |
| `settings-depth` | 61 · 0 | 2 · 1 · 1 · 1 |
| `chat-message-actions` | 73 · 0 | 6 · 3 · 1 · 1 |
| `task-depth` | 91 · 0 | 6 · 2 · 1 · 3 |
| `video1-fast-items` | 92 · 0 | 2 · 3 · 1 · 1 |
| `video-regression` | 93 · 0 | 3 · 2 · 1 · 9 |
| `ui-sweep` | 107 · 0 | 1 · 1 · 1 · 2 |
| `person-panel` | 59 · 0 | 2 · 2 · 1 · 1 |
| `command-palette` | 43 · 0 | 1 · 7 · 2 · 1 |
| `calendar-accounts` | 36 · 0 | 3 · 2 · 1 · 2 · 1 · 1 · 1 |

Where a cell reads `—` the patch ran green and is dealt with above. Where a
baseline is not `N · 0` the set was refused, which is the harness declining to
measure anything against a suite that was already red. **A row with `—` for
the whole set means it was never measured, which is a different thing and now
says so** — `video1-fast-items` sat like that, four patches with no surviving
run log, which is exactly the state `check-break-freshness.mjs` was written to
find and the state `check-break-coverage.mjs` counts as covered.

And one row here was wrong in the other direction. The reddened column above
read `1·1·1·1` for `settings-depth`, taken from the run where
`sd-1-contrast-marks-but-does-not-paint` was still reporting a bogus green
through the worktree resolution bug; its re-run after that fix reddens **two**.
The number in the table was a sentence about a harness defect that had already
been fixed, added to three that were fine — which is the shape of the
`sidebar-dms` 10 of 10 that started this whole section.

---

## 8c. The evidence, and the checker that reads it

§8 and §8b record what reddened, patch by patch, read off the break logs by
hand. This section is about discovering that those logs were missing the one
thing that makes them evidence — and about the checker that now reads what
survives.

### 102 of the 113 suites have never had a failure sentence recorded

`wt-break.sh` captured failures with

```sh
grep -E '\bFAIL\b' "$log" | sed 's/\x1b\[[0-9;]*m//g'
```

— strip the colours AFTER matching. Suites print their failures two ways:

```
  FAIL  the chip says "Assigned to …"
  \x1b[31mFAIL\x1b[0m the header pill read null
```

`\b` is a word boundary and `m` is a word character, so `mFAIL` has none before
the F. **Every suite that colours the word had its failure lines silently
dropped, and 102 of the 113 do.** `focus-pill`'s `fp-1-set-once` reddened eleven
checks and the log recorded the patch name, no sentences, and `4 passed, 11
failed`. The count went with them: `NFAIL` was 0, so "… and N more FAIL lines
not shown" could not fire either.

The summary says HOW MANY checks reddened. Only the sentences say WHICH — and a
patch is evidence only if the checks it reddened are the ones it claims. Every
number in §8 was right and unverifiable.

### `check-break-reddened.mjs`: 501 patches measured, not read

The evidence was never lost, only never copied. `wt-break.sh` writes
`/tmp/claude-0/brk-<patch>.log` for every patch it runs and 782 survive, so the
comparison nobody had made is available for most of the catalogue:

**501 patches reddened a check they claim · 2 reddened nothing · 20 unproven ·
274 with no usable log.**

Most suites print `FAIL ${bad ?? good}`, so a failing check often does not name
itself; the check's sentence appears among the PASSES exactly when it passed,
and that is the inference. UNPROVEN is where the log cannot answer — failures
happened and every claimed sentence is also among the passes — and it has two
causes this does not guess between: a real misattribution, or a claim quoting a
fragment of a template sentence that several iterations of a loop print while
the failing one prints its reason instead of its name.
`us-1-grouped-column-still-shown` is the second kind and its own header says so:
"the `status` iteration of".

### Every failing check names itself now, and that is what the column was for

The remedy was deferred for one round and then taken, because looking at the
unproven column decided it. Sampling five showed the claim was CORRECT in all
five and the log simply did not say so — `mp-7-flat-bars` claims "the Fast
tier's Speed bar is visibly longer than the Max tier's" and the run says
`FAIL speed measured fast=38px max=38px`. Then four more turned out to be
genuine misattributions that took manual archaeology to identify, because
identifying WHICH check failed is impossible from a log that prints only
reasons:

- `clickapps-plan-gating-6-switchlive` names a check that passes — the padlock
  BADGES, which `disabled={false}` does not touch — and reddens the one beside
  it, which reads the switch's own disabled state.
- `custom-field-progress-2` names the pooling check and reddens four arithmetic
  ones.
- `list-export-3` names the content-type check and reddens the four that parse
  the bytes.
- `space-wizard-views-1` names the row-order check and reddens the label.
- `tab-title-countdown-4` names the all-day check and reddens the one about a
  countdown outliving its block.

So `chk` prints the sentence, an em dash, then the reason — the format the newer
suites already use — in all seventy files, replaced identically. No check's
outcome changes.

**The cost, stated rather than absorbed: 66 break sets are now measured against
suite files that have changed**, so `check-break-freshness.mjs` fails until they
are re-run, and `never-run-plan.mjs --drifted` prints that work as a plan (it
was `--stale` when this was written, and asked the question by the clock; §10
carries what that cost). It is
the other half of the question that file already answered: a patch whose log
predates a change to its suite is in the same position as one with no log at
all. 390 patches there, 241 with no log, three lanes, unattended.

And a second look at the matcher moved thirteen patches on its own.
`findsClaim` falls back to any five consecutive words, which is right for "does
this SUITE contain the sentence" and wrong for "did this CHECK pass" — a
five-word overlap with a neighbouring check's sentence reads as the claimed
check passing. Whole-claim matching took the measured count from 501 to 514.

### And the first thing it found was itself, twice

**The inference is vacuously satisfiable.** With the escape-strip removed the
checker read BETTER — 634 reddened, 0 unproven — because PASS lines that cannot
be matched make every claim look absent from them. A check that cannot fail,
inside the check written to catch checks that cannot fail. The parse is asserted
now: the PASS line count must equal the reported pass total, which holds exactly
across all 762 logs on this machine. And the reddened count is a FLOOR, because
both ceilings went to zero in that state and a ceiling-only ratchet would have
called it an improvement.

**And 119 of the 652 readable logs were not complete runs of the suite the patch
names**, which took the headline from 620 to 501. `brk-<patch>.log` is whatever
suite was being exercised when that patch was applied and nothing in the
filename says which, so one comparison against the suite's own
`EXPECTED_CHECKS` catches two things:

- a SHORT RUN — `ai-answer-rendering` declares 51 and its logs hold 30, 29, 26
  and 12, runs whose "0 failed describes the part it reached and nothing else";
- a run of the WRONG SUITE — `v1a-2-announce-notifies-the-actor` aims at
  `notification-gaps` and had been exercised inside the `video1-acceptance` set,
  so its `0 failed` was about checks it was never pointed at. It was one of the
  three "reddened nothing" findings and it was an artefact.

**620 → 501 is a ratchet FLOOR being lowered**, which is legitimate only when
the measurement changed and the new number is the true one. It is said out loud
in the file, beside the number.

### Which suite is this patch about? Four answers, and they disagreed

The question is asked in four places and every copy had drifted. Coverage had
three steps — the named suite, the filename prefix, then the suite containing
the quoted sentence. Claims had step one with a COLON ONLY plus step two.
Freshness had step one alone. `never-run-plan.mjs` copied freshness's.

The cost was 22 patches that could not be SCHEDULED: freshness reported them as
"(no suite named)" where coverage attributes them fine, and the run plan is
built from that list. And `[,:—-]` had a backtracking bug that made it worse —
`# Reddens: sidebar-dms "the workspace tree has a Direct Messages section"`
separates with a SPACE, so the regex matched `sidebar` and used the hyphen as
its delimiter. A suite name cut at the first hyphen, with `sidebar.mjs` sitting
right there to be attributed to instead.

`scripts/lib/suite-of-patch.mjs` is the one answer, with 15 assertions and three
break-tests. Step one takes the identifier and walks it back a segment at a time
until a tracked suite turns up, which subsumes every delimiter anybody used.
Writing the test found two more things: a `unit:` claim was being attributed to
an e2e suite by a five-word FRAGMENT of a sentence that exists only in a
`*.test.ts` (attributed patches 798 → 797, and both unattributable ones are now
`unit:` claims, which is the honest number); and the Reddens-block extractor
needed a following line to stop at, so a block that is the LAST thing in a file
extracted nothing, silently.

### What the sweep keeps finding, and it is one shape

`break-report.sh` turns each finished set into a line, and the rows worth
opening fall into three kinds. The counts below are what the first pass over
112 sets produced; the loop is: read the row, fix the suite, the suite goes
stale, the stale plan re-runs it.

**A patch that ends the run instead of failing a check — fifteen of them, in
eleven suites, all one shape.** An unbounded Playwright call on the element the
patch removes. `list-customize`'s `flip()` helper was four on its own:
`list-trio-1-no-trio` reported `3 passed, 4 failed` with `ran 6 checks, expected
exactly 37` — thirty-one checks unreported under a headline about the harness.
`space-wizard` was three, so all twenty-one of its clicks go through a bounded
`press()` that answers a boolean; a caller that ignores it finds the setting
unchanged, which is the honest failure. One of those call sites already had a
`.catch`, which swallowed the error and still waited thirty seconds to get it.

Two were not timeouts. `folder-dialog` read `.data.id` off the null that the
check above it had just reported. And `planner-onboarding` produced the one
outcome that says nothing at all — `NO SUMMARY: … it died before the totals` —
because it is `try { … } finally { … }` with **no catch**, so an uncaught
TimeoutError left the process before the totals line and before the
`EXPECTED_CHECKS` guard. Three of the 113 were in that state, all three in a
running plan; `check-suite-check-branches.mjs` now asserts a top-level `try` has
a top-level `catch`, and its own first version flagged 108 of 113 because `\b`
inside a non-raw Python heredoc became a literal BACKSPACE byte.

**A patch whose evidence was the run ending, by design.** `aoc-4` was written to
prove `attach-on-create`'s opening gate was still a gate, and its header said so
in place of a claim. What it proved is that a thirteen-check suite could report
nothing at all — and the check immediately after that gate asserts the very fact
the gate did. One patch has earned the opposite verdict: `acc-7-no-id-returned`
declares `# Expect: SHORT`, because the twenty-seven checks after the one it
reddens ADDRESS the id it removed and have nothing to be about. Only SHORT may
ever be declared, and the declaration is checked against the measured outcome.

**A patch that reddens nothing, and every one was a different reason the check
could not see it.**

- `sw-4-dialog-stays-open` removed the one line whose job is to close the
  wizard. `onCreated` runs immediately after it and the caller does two more
  things that each remove the dialog: `onClose()` and a navigation that unmounts
  it. Three mechanisms; the explicit close is the least load-bearing, existing
  to close a tick earlier so nobody sees the wizard flash over a page already
  changing. The patch removes all three now, recorded as the minimum.
- `aoc-5-input-not-cleared` could not have been caught by any wording. It
  removes `e.target.value = ''`, and the check re-picks with `setInputFiles`,
  which dispatches a change event whatever the input held. The defect is a
  NATIVE picker's behaviour and Playwright goes around it. The input's own value
  is observable, so the suite asserts it where it lives.
- `pat-2-two-copies-of-the-numbers` wrote DEAD CODE: it drifted `GRID_SIZES` and
  added a second constant nothing read. The check compares what the swatch
  advertises against what the grid draws, and both come from the one
  declaration, so moving it moved both and they went on agreeing. A patch for a
  duplicated list has to make something READ the second copy.
- `po-3-one-provider` hides a button with a `hidden` attribute, and the check
  counted DOM elements with `evaluateAll`. A button nobody can press is not one
  of the two providers the frame offers; the suite asks for `checkVisibility()`
  now, and keeps the whole list because absent and hidden are different
  mistakes.
- `ca-3-hiding-is-not-honoured` and `ca-5-its-own-connection-state` are in §8b:
  a checkbox whose grid was read by no check, and `false === false` standing in
  for agreement.
- `imports-9-priorityscale` and `sl-3-call-card-not-broadcast` are the
  redundancy cases — a fact guaranteed twice over, where the minimum disproving
  edit spans two places and the header says so.

**And two suites refused their own baseline.** `ai-answer-rendering` had never
once run to its declared length. `create-menu-ai` held a hand-written list of
creatable types under a comment promising it would "say so out loud" when a
tenth arrived; a tenth arrived, the line went red instead, and because that
suite's set had never run the refusal sat on disk unread with sixteen patches
behind it. Both that suite and `space-create-menu` read the list out of
`create-types.ts` now, with a floor asserted on the parse.

### Every green, and why the check could not see it

Sixteen patches reddened nothing once the sweep started measuring, and no two
had the same cause. The list is the most useful thing in this section, because
each entry is a different way a check can be blind to the patch aimed at it.

| patch | why it passed |
| --- | --- |
| `b2-cluster` | `display: contents` keeps the element, the testid and the DOM nesting; only the wrapper's own BOX goes, and nothing measured it |
| `pcb-4-full-width-over-the-rail` | the check read the rail's `.x` as `railRight`, and `?? 0` made a missing rail a rail at x=0 — two ways to pass |
| `sw-4-dialog-stays-open` | the wizard closes three ways; the explicit close is the least load-bearing |
| `aoc-5-input-not-cleared` | `setInputFiles` dispatches a change event whatever the input held — Playwright goes around the native behaviour |
| `pat-2-two-copies-of-the-numbers` | the patch wrote DEAD CODE: a second constant nothing read |
| `po-3-one-provider` | `hidden` leaves the element in the DOM and `evaluateAll` counted it |
| `ts-3-columns-from-roster` | the stub answered exactly the ids asked for, so payload and selection were the same list |
| `ts-7-remove-drops-the-wrong-one` | the check removed the FIRST person, which `slice(1)` gets right |
| `ts-9-dedupe-dropped` | the suite stubs `**/api/**` at the context — no server code runs in it at all |
| `tai-6-fill-rounds-to-first` | the fallback is an unawaited `void api(...)`; the check read the type once, immediately |
| `fd-7-toggle-latches` | the check was asked after a dialog that had left the toggle OFF |
| `imports-9-priorityscale` | `mapPriority` answers "highest" twice over on its own |
| `ca-3-hiding-is-not-honoured` | the checks read the badge and the stored row; the grid was read by nothing |
| `ca-5-its-own-connection-state` | `false === false` — this deployment has no Zoom credentials |
| `us-3-share-levels-lose-their-meaning` | `/only|explan|can |may /i` over the WHOLE dialog text |
| `sl-3-call-card-not-broadcast` | two independent delivery paths, neither removable alone |

Five of the sixteen were fixed in the PRODUCT or its fixtures rather than the
check: the duplicated priority list, the duplicated grid sizes, the three ways
the wizard closes, the stub that could not disagree with the selection, and the
line no suite executes — which became `teamScheduleColumns` and a unit test.

### The suite that had never run to its own length

`ai-answer-rendering` declares 51 checks. Every log on disk held 30, 29, 26 or
12 of them, its set refused twice on a red baseline, and all twenty-one patches
aimed at it had been "measured" against runs that stopped in the same place.
**It runs to 51 and passes all of them now**, so those patches are being
measured for the first time.

Two things had to change. The check after the failing one read `innerText()`
unconditionally on an element the check above it had just found absent — thirty
seconds, a throw, sixteen checks unreported. And the AI panel's thread-history
effect REPLACED `messages` wholesale on its one allowed seed, so a turn that
finished while the history request was in flight disappeared off the screen,
step log and all.

**A green baseline does not say which of the two mattered**, and a product fix
with no patch aimed at it is a fix nobody can show is load-bearing. So
`aar-24-history-seed-replaces-the-turn` restores the wholesale replace — what
the code said for months, under a comment explaining that the `loadedThreadRef`
guard stops a REFETCH wiping a streaming turn. The guard is real and the comment
is true; what neither covers is the one seed it does allow. The header is
written BEFORE the run and says what each outcome would mean, so the prediction
is on the record rather than fitted afterwards.

### And two diagnoses of mine that were wrong

Both were corrected by a run rather than by re-reading, which is the whole
argument for running the patches.

**`taf-8-clear-leaves-the-search-box`.** I said removing `setSearchDraft('')`
lets the 200ms debounce put the term straight back, and that the check had been
fooled by a transient recovery. It is keyed on `[searchDraft]` — which Clear no
longer changes — so the effect never re-runs, `search` stays empty, and the feed
really does come back and stay back. The check was right to pass twice. What the
patch leaves is a STALE BOX: a term on screen over a list that is no longer
filtered, and the next keystroke re-applying a search the person has cleared.
Nothing asserted it, which is why two rounds of looking at the FEED found
nothing.

**`aoc-5-input-not-cleared`** is the same lesson from the other side: the patch
was right about the product and no wording of the check could have caught it,
because `setInputFiles` dispatches a change event whatever the input held. The
defect is a native picker's behaviour and Playwright goes around it.

### One suite's litter was another suite's red baseline

`ai-assign` refused its whole set on one failing check: "with a runner-up, whose
reason is a different sentence about a different person". The two sentences
really were identical, because `explainCandidate` names a person by
`displayName || email` and the workspace held **sixteen members called "Cal
Peer"**.

`calendar-accounts` invites a colleague per run with a timestamped email and a
CONSTANT display name, and never took them back. Sixteen in one lane database,
three in another. Nothing connected the two suites: one left the litter, the
other refused, and the only shared thing was a display name. It is
`Cal Peer ${TAG}` now and the cleanup deletes the member and the user.

**And the check was asserting something the product cannot guarantee.** People
are allowed to share a display name, so identical sentences are a fixture fact.
What a shared LABEL breaks is that the runner-up's reason is ABOUT the
runner-up and carries THEIR numbers — the pair the check above it already
asserts for the pick. Strictly stronger, and it still reddens
`assign-6-one-reason-for-everybody`.

This is `syncup-live` from the other direction: there, one suite DELETED another
suite's fixture; here it left one behind.

### Two checkers deliberately not built

Both would have held a floor over a class with no members, which is noise in a
report whose value is that every line in it is worth reading.

**A ratchet on ambiguous claims.** `paywall-sites-2-server-board` cost real time
because its claim was a PREFIX of a neighbouring check's sentence, so it matched
a passing check. Measured across all 113 suites afterwards, every other
apparent duplicate is a template sentence inside a loop, printing a different
value per iteration, or the two branches of a balanced `if/else` where only one
runs. Neither is ambiguous in a log. One real instance, fixed; the reasoning
lives in `check-break-claims.mjs`'s header so nobody builds it twice.

**A ratchet on unbounded interactions.** 682 bare `.click()` calls across 96
suites, and most are on controls no patch touches. What was done instead is
narrower and evidence-driven: bound the three shapes that a patch actually
proved dangerous — `click`, `hover` and `boundingBox`, mechanically, because a
missed one cannot change a verdict — and leave `getAttribute`, `innerText` and
`textContent` to be fixed one site at a time. Catching those is NOT neutral: on
a NEGATIVE assertion an empty string makes an absent element CONFIRM the
absence, which is how `ai-action-categories`' "none of them prints a number a
person could mistake for a count" would have passed on a missing tile.

### Four product defects the sweep turned up

**The AI panel dropped the answer you just watched arrive.** The thread-history
effect is keyed on the thread id so a refetch cannot wipe a turn that is still
streaming, and its comment says so. What the guard does not cover is the ONE
seed it allows: arriving with `?thread=X&prompt=Y` starts a turn on mount, and
if the history request settles after that turn lands — a slow first fetch is
enough — `setMessages` replaced everything and the answer disappeared, with the
step log above it explaining what it did. Nothing is broken afterwards; the next
thread switch loads the stored copy. The answer simply vanishes off the screen.
It is merged by id now.

**AND THAT PARAGRAPH CLAIMS MORE THAN ANYTHING MEASURES — see §10.** The merge
is a conservative choice that no check distinguishes; the bounded read below is
what made the suite green, and three separate attempts to catch the seed all
came back green. Left standing rather than edited away, because the correction
is the point.

`ai-answer-rendering` is where that surfaced, and the suite had **never once run
to its declared length** — the check after the failing one read `innerText()`
unconditionally on an element the check above had just found absent, so the run
ended at 35 of 51 and all twenty-one of its break patches were measured against
that.

**Four priority words that decided nothing.** `imports-9-priorityscale` emptied
`URGENT_WORDS` to make Jira's "Highest" import as high, and ran GREEN:
`mapPriority` answers "highest" twice on its own, an exact table entry and a
containment rule ordered ahead of `high`. `highest`, `urgent`, `critical` and
`lowest` sat in those lists deciding nothing — the duplicated list, in the
function whose doc comment says it delegates the common vocabulary so the two
cannot drift. The comment went with them: what it described about `mapPriority`
has not been true since `mapPriority` put `highest` and `lowest` first.

**A raw NUL byte in a TypeScript file.** `dupKey` joins a list name and a title
with `\x00`, which is a good separator for a key made of user text. Written as a
raw byte it makes every text tool treat the source as binary: `grep` prints
"binary file matches" and skips it, so a search for anything in that file comes
back EMPTY rather than wrong. Found by searching it and getting nothing.

**And one dispatcher, because two queues ran the same suite twice.** Two
per-suite waiter shells woke on the same freed lane seconds apart and `ui-sweep`
ran on lanes 2 and 3 at once, both appending to one log: a patch result above
the baseline that produced it, two DONE markers, a `restoring wt2` line inside a
lane-4 run. The worktrees were never at risk — `wt-break.sh` takes the lane lock
— but the RECORD was corrupted, which is worse, because it is the part nobody
re-derives. `run-plan.sh` keeps the work list in one process now.

---

## 9. The misclassified rows, resolved

§6 listed eighteen rows whose recorded status was wrong, four of them marked
**built** while being the mirror defect. This is what happened to them.

### `spaces.default_permission` — built for real

The column was written by the create-space wizard, validated on create *and*
on update, declared in the controller, and honoured by no access check
anywhere. It now gates update and delete for spaces, projects, lists and
folders through `assertCanManageContainer`, and filters the Move picker so the
server and the UI cannot disagree about a destination.

**It can only narrow.** `edit` is the column's default and the rung the gate
requires, so every space that exists today behaves byte for byte as it did;
only `view` and `comment` change an answer. The verdict on the row was
deliberate rather than automatic: a column nobody reads is better deleted than
left as evidence, and this one was kept because its meaning came straight from
its own schema comment and the four-rung ladder it names already existed. 18
e2e checks prove a member who should be refused is refused **by the server**,
with the row unchanged afterwards; 21 unit tests cover the resolution order.

**And it exposed a bigger one.** Container *create* is completely ungated:
`lists.service.ts` and `projects.service.ts` check workspace membership and
container privacy and nothing else, so a plain member can create a list inside
a view-only space and is only refused when they try to edit it. That is its
own row, and it is open.

### The header pill — built on the surface the frames actually draw

`use-focus-tab-title.ts` computed a countdown whose only consumer wrote
`document.title`. The pill the frames show at `15:20`–`16:20`, immediately
right of the workspace switcher, did not exist.

The way this goes wrong is two countdowns — two fetches, two intervals, two
answers that disagree by a second and then by a minute. The pill and the tab
title now share one react-query key, one `setInterval` for the whole module,
and one `pickRunningBlock`. A suite check asserts a single `/planner/blocks`
request serves both, and it has already earned itself: a later refactor
reintroduced a second fetch and the check caught it.

### App Center — fourteen facets, derived

Nine facets against the frame's fourteen. Now fourteen, and **derived from the
apps** rather than written out: a facet that nothing matches is filtered out
before it renders, so a facet cannot outlive the thing behind it. That is the
duplicated-list defect closed at the class level rather than the instance.

### Recent Chats, folder errors, Team view

Recent Chats was hard-sliced to five with no "More" while the endpoint
returned all of them — conversation six onward was unreachable. Folder
creation reported nothing on failure and folder names were not unique, both
of which lists had fixed long ago and folders had not. Team View's "must not
be gated" note was a stale reason contradicted by `[09:26]`.

### Two that were closable all along

An uploaded voice note already rendered as a player, and `List` was already
un-removable in the wizard. Both sat unbuilt behind reasons that had stopped
being true — *the stale reason*, which is the defect class that suppresses
exactly the investigation that would find it. Re-checking rows marked done is
not a formality; it closed two rows for free and reopened one that was wrong.

## 10. Which tree is this number about?

### The clock was the wrong instrument, twice

`check-break-freshness.mjs` decided whether a recorded number was current by
comparing the suite file's last commit against the log's MTIME. The mtime is the
moment the run ENDED, and that reading is wrong in two directions that both cost
me the measurement I most wanted.

A suite fix committed WHILE its own set is running dates after the run started
and before the log was last appended to, so the row says fresh. `folder-dialog`
was fixed at 06:29:10 under a log stamped 06:29:50 — and `fd-7-toggle-latches`
had been measured at 06:27, against the check the fix moved. `space-wizard` is
the same story with `sw-4-dialog-stays-open`. Both were GREENS, and both fixes
existed *for those two patches*.

And the rule only ever asked about the suite. A green fixed in the PRODUCT
touches no suite file at all, so nothing in that comparison could see it:
`folder-create-12-toast-bottom-right` sat UNPROVEN for a day beneath a row
calling its log current.

Every log opens with the commit `wt-break.sh` synced to. That is a statement
about the tree rather than about when somebody typed, and a log is current when
nothing it depended on — the suite that did the measuring, and the product files
each patch in it edits — differs between that sha and HEAD.
`scripts/lib/log-tree.mjs` holds it, `check-log-tree.mjs` writes down the cases,
and two of those cases found bugs in the module beneath them: `== restoring` was
being recorded as a patch measured at some commit, and the case for "the newest
log wins" passed with the comparison it exists to prove DELETED, because it is
only consulted when the directory hands back the older file first.

### What the honest number was: 641 → 175

Under the corrected rule, 76 of 117 sets on this machine are STALE and 17 more
record no commit at all — and `check-break-reddened.mjs` had been counting every
one of them. Reddened falls from 641 to 175, and greens fall from 9 to **zero**:
all nine were measurements of trees from before their own fixes.

The floor moved to 171 rather than staying at 600. Nothing was measured away and
the number is not a concession: 600 under this rule is a figure no evidence on
this machine supports, and a floor that cannot be met is a floor that gets
edited every time it speaks. It rises as the chain drains.

### A plan that re-asks instead of a plan that remembers

Every sweep I have run worked from a snapshot, and by the end of three hours the
snapshot was wrong in both directions: `aar-24` was written after `plan3.txt` was
generated and so was in no plan, while `fd-7` and `sw-4` sat in a plan that
believed their suites were current. `chain-plan.sh` asks the question again
between rounds — no log, or a log about a tree that has moved — and stops when a
round comes back empty. Two non-termination risks are guarded rather than
assumed away: a suite whose baseline REFUSES records no patch lines however
often it runs, and a suite I keep editing drifts again each round, so a round
that asks for exactly what the last round asked for ends the chain.

### And a patch may say its own log is not evidence

One case is out of reach of any rule about files: `folder-create-12` was
measured while `wt-break.sh` built `packages/**` patches from the repo rather
than the worktree, so the toaster it edits was never the one under test. The
RUNNER changed, not the tree. Its header already claimed it was "in the stale
plan" — a sentence nothing checked, and false. `# Re-run: <why>` makes that
claim mechanical: the generator carries the patch until it has been measured at
a commit later than the line was written, so the declaration is spent by being
measured rather than by being deleted.

### Two refusals that had already been fixed

Within five minutes of the provenance rule landing I read `create-menu-ai`'s
refused baseline as a live product defect — a type strip offering ten kinds
where nine were expected — and went looking for the filter bug. There is no
filter bug. The suite expected nine because `form` was added to the product
after it was written, and it had been corrected hours before I read that log.
`ai-assign`'s refusal is the same: a fixture leak fixed in the suite, a refusal
on disk from before the fix.

So `break-report.sh` marks every row with the tree it is about — `OLDER TREE`,
or `TREE UNKNOWN` for the logs that predate the sync line — and both gate. The
freshness checker had to stop collapsing two facts into one field to do it:
REFUSED was winning over STALE, which lost the only thing worth knowing about a
refusal, namely whether it is still true.

### The read that ends the section, five times in two suites

`list-customize-10-no-caption` removes the export caption; the check that looks
for it reddens, and then `note.getAttribute('data-plan')` on a locator matching
nothing waits thirty seconds and THROWS. The throw ends the section: 33 of 37
checks ran, and among the four that did not was the anti-drift check that is the
entire reason the caption resolves its own tier.

`ai-answer-rendering` had four of these in one suite.
`aar-7-list-refs-never-sent` ran 16 of 51 — thirty-five checks lost to one
`getAttribute`. All four were in the ledger as patches that reddened the check
they claim. They did, and they silenced the rest of the section on the way,
which is the worse half and the half no number showed.

**No checker for this one, deliberately.** The shape is "an unguarded read after
a check that is allowed to fail", and a static rule over that flags hundreds of
benign call sites. It does not need one: every instance shortens the run, and
`EXPECTED_CHECKS` being exact turns every short run into a SHORT row that gates.
The measurement already catches the class by construction — which is why all
five of these were found this morning rather than argued about.

### The thirteen frames answered under another timestamp

`check-frame-traceability.mjs` asks the one question the ledger's own
reconciliations cannot: does a line of the SPECIFICATION — a timestamped
observation in `video2-frame-observations.md` — appear anywhere in the evidence?
115 observations; 73 are named in a suite, 3 in a unit test, 26 in this document
or the gap audit, and 14 were named nowhere at all.

One of the fourteen was a hole (`03:15`, above). The other thirteen are answered
under an adjacent timestamp, which from the checker's position looks identical
to an unanswered frame — so they are written down here, each one checked rather
than assumed:

| frame | what it draws | answered by |
|---|---|---|
| `02:25` | checklist items typed, and the header counting **"Checklists 2 open"** | `checklists.mjs` |
| `03:45` | the activity feed, each entry with a relative time | `activity-rail.mjs` |
| `04:40` | the **"Attach as audio file"** tooltip over the composer | `comment-recording.mjs` |
| `05:50` | a **thread on a comment** — "Thread by …", the clip, the reply composer | `replies-inline-thread.mjs` |
| `09:40` | Gantt: `Week ▾ · Auto fit · ⤢ Export`, the red TODAY line, `W32` | `gantt-controls.mjs` |
| `11:20` | the inline **"Search for tasks in your view"** box in the list toolbar | `list-empty-states.mjs` (and three more, via `list-task-search`) |
| `12:15` | browsable template categories with counts — **"See 135 more"** | `template-center.mjs` |
| `13:25` | the calendar picker **grouped by account**, with Manage accounts | `calendar-accounts.mjs` |
| `14:15` | Upcoming meeting: Show time left · Show in desktop · Quick join `2 mins` | `planner-upcoming-meeting.mjs`, with its recorded decision on the two desktop-only switches |
| `17:40` | inline **word suggestions** above the AI composer | `ai-answer-rendering.mjs`, as `17:42`–`17:50` |
| `18:20` | the answer that cannot act: **"No changes made."** plus follow-ups | `ai-command.test.ts` — a sentence the planner composes, so a unit test is the right place for it |
| `18:40` | the integration **error card** and its Help-centre link | `integration-error-card.mjs` |
| `20:15` | Recent Chats **auto-named after what they did** | `chat-thread-title.test.ts` |

Two of those answers are unit tests, which is why the checker looks in
`**/*.test.ts` as well: a rule that only read `test/e2e` would have called
`18:20` missing and sent me to build a second copy of something that is already
asserted, in the right place, for the right reason.

### Four greens, four different reasons, none of them timing

The provenance gate turned nine greens into UNKNOWN, and the sweep has now
re-measured four of them against the current tree. Every one was green for a
reason of its own, and not one was the race I went looking for first.

**`po-3-one-provider` hid nothing.** It sets the `hidden` ATTRIBUTE on the
Outlook button. `[hidden]` gets `display: none` from the user-agent stylesheet
and `buttonVariants` puts `inline-flex` on the element through a CLASS, which
wins — so the button stayed pressable, `checkVisibility()` correctly said so,
and the check correctly passed: both providers really were still being offered.
A patch that photographs as hiding something and hides nothing, inside the tool
built to find facades. An inline `style` cannot be overridden by a class.

**`tai-6-fill-rounds-to-first` was the starting state.** Its fallback writes
`types[0]`, every workspace seeds Task · Milestone · Form Response · Meeting
Note in that order, and a freshly created task ALREADY CARRIES `Task`. The
fallback wrote the value that was already there, so before and after were
identical. The suite stands the task on Milestone first now, and check 19
asserts that it took — a precondition nobody checks is how this hid twice.

**`pcb-4-full-width-over-the-rail` had a premise read off class names.** The
check had two real defects, both fixed. Then it ran green again and the measured
numbers said why: "left edge (560px) is clear of the rail, which ends at 531px".
The patch removed `max-w-xl` on the reasoning that the container is `absolute
inset-x-0 … px-4` so the bar would start at 16px. `absolute` resolves against
the nearest POSITIONED ANCESTOR — the calendar region, to the right of the rail.
I wrote that premise into the patch header and into the suite's comment without
measuring it, in a patch whose entire job is to be measured. `fixed` is what
makes `inset-x-0` mean the viewport.

**And `folder-create-12`** needed neither: its log predates the runner fix, and
the patch-body rule now says so without the declaration having to.

### Frame `03:05` draws six tabs and two of them were never exercised

Asking which product testids no suite names — 342 of 1063 — put nine in the
cover picker, and the frame is explicit: **Gallery | Upload | Link | Search |
Attachments | Remove**.

**The Attachments tab could never list a file.** The picker filtered the task's
attachments on `contentType`, and `GET /tasks/:id/attachments` does not return
that field: `tasks.service.ts` maps its own `row.contentType` to `mimeType` on
the way out, and every other reader in the web app takes `mimeType`. This one
compared `undefined` to `image/` for every row, so the empty state drew on
every task however many images were on it. Frame `03:10` says that tab offers
the files already on the task. The tab had been asserted to EXIST for a day, and
the assertion that it exists is what made it look covered.

**The Link tab had the same shape** and turned out to work: six checks, measured
29 of 29 green, and 27 of 29 with the patch that removes the http guard — so it
was unverified rather than broken. **Remove** is checked on all three fields a
cover can be set in, because a Remove that clears only the one being drawn
leaves two for the next reader.

Five patches on Link, two on Attachments and Remove, each with its prediction
written first. One of them did not compile at first — it reverted the filter and
not the type — which proves nothing and reports as a confirmation.

### The record has to say which tree, even when nothing moved

`wt-break.sh` wrote its `== syncing … to <sha>` line INSIDE the `if` that
decides whether a checkout is needed. Two sets running back to back with no
commit between them means the second one needs no sync — and writes no
provenance at all. `integration-error-card` came back 9 of 9 reddened and
unplaceable.

That is worse than a gap in the record, because it could not have healed:
`--drifted` puts an unplaceable log back in the work list, the re-run has the
same chance of finding the worktree already synced, and the chain would have
stopped on "no progress" against sets that were running perfectly. The line is
written on every set now. Swapped in by REPLACING the file rather than editing
it, because three lanes were executing it and bash reads a script as it goes.

### Two ways I measured the wrong thing myself

**A bundle older than the source.** `apps/web/dist` is not in git, so nothing
rebuilds it when a suite is run by hand. `ai-answer-rendering` came back 48 of
51 from the checkout and all three failures were in the AI panel, which is where
I had been working — and the dist was 749 minutes older than `apps/web/src`,
with the panel's fix inside that window. Rebuilt, 51 of 51. `startLocalStack`
refuses a stale bundle now; a warning above fifty PASS lines is a warning nobody
reads. No number from the sweep was ever affected, because `wt-break.sh` builds
before every set — only the runs I did by hand, two of which had already gone
into a commit message as evidence and were re-measured to stand on their own.

**Eleven API processes.** `paywall-sites-8-export-unlocked` came back SHORT on
"sorry, too many clients already", which is not a suite defect or a product
defect: eight stale API processes from earlier lanes were holding 95 of
Postgres's 100 connections, and the fourth API I started for a hand-run pushed
it over. Killed the eight; 26 connections in use afterwards.

### A number in a claim can be a hostage

`tfc-3-short-type-list` claims "the type picker offers all 19 field types" and
the run printed 22 — the suite interpolates the count, and three types had been
added since the patch was written. It verified anyway, because the matcher
compares against the literal part of a template, which is the part worth
quoting. Of the 29 claims that quote a number, the rest are stable literals —
HTTP statuses, `0,1,2`, `(500 - 125) * 2 is 750` — part of their sentence rather
than hostage to it. Two were hostages and both quote the literal now.

### Three hunts that found nothing, and why they are not kept

The Attachments-tab defect was a FIELD-NAME mismatch — the web read
`contentType` where the API answers `mimeType` — so the obvious next move is to
look for more of them without waiting for a suite to run. Two attempts, both
abandoned, and the reason is the same both times.

**Every web payload field the server never emits: 121 hits, no signal.** The
vocabulary of "what the server can emit" was built from every identifier used as
an object key across `apps/api` and `packages/db`, and the web side from every
`type X = { … }`. Most of what came back is local UI state —
`dashboard-templates`' `nameKey`, `report-builder`'s `agg`, a grid row's `h` —
because a type declaration does not say whether it describes a response.

**Narrowed to types used as an `api<T>()` response: 14 hits, all false.**
`UpcomingSettings.upcomingShowTimeLeft`, `ShareResponse.canShare`,
`Clip.recordedBy`, `SprintRow.plannedPoints` and `MergeResult.moved` are all
emitted; the scan missed them because a response is assembled in more shapes
than a key literal — a `select({ … })` spread, a tally built by assignment and
returned as `{ targetTaskId, moved }`, a mapping written across lines. To be
sound the rule would have to understand how each endpoint composes its answer,
which is a type checker, and the repository already has one.

**And narrowed to the exact shape, `out: row.in` against a web read of `in`:
474 hits.** This is the Attachments defect written as a rule — the server maps
`mimeType: row.contentType` and the picker read `.contentType` — so it should
have been the precise one. It is the noisiest of the three, because a rename is
not a GLOBAL fact: `workspaceId: row.entityId` in one endpoint sits beside
`workspaceId` emitted as itself in twenty others, and the scan has no way to
bind a web read to the endpoint it fetched from. Same conclusion as before, one
level sharper: to be sound the rule needs to know which endpoint answered, which
is a type checker.

**The route that DID find it was measurement.** The testid question — which
product controls does no suite name — pointed at a tab nothing exercised, and
the field mismatch surfaced the moment a check tried to use it. That is the
third time today the static version of a question was noisier than the measured
one, and it is the argument for spending the machine time rather than the
cleverness.

### And the four claims nothing measured

`check-break-reddened.mjs` excludes a `unit:` claim on purpose — the evidence is
a `*.test.ts` and an e2e log has nothing to say about it — and reported the four
of them as their own count. Honest, and it left four claims in an inventory of
798 that were DECLARED rather than measured, in an audit whose entire thesis is
the difference between the two.

They are also the cheapest claims here to check. No browser, no database, no
lane: `tsx --test <file>` is about a second. `check-unit-claims.mjs` applies each
patch, runs the file its claim names, and requires the run to FAIL with the
quoted test's own name in the output — so a patch that breaks a neighbour in the
same file is not credited with reddening the one it claims. **Four of four
redden**, which is what the exclusion had been assuming.

It edits the working tree, so it is preflight-only and it checks up after
itself: every file a patch touches is copied first and written back in a
`finally`, and then `git status` has to come back clean for `apps` and
`packages` or it exits 1 naming what is left. Break-tested four ways — a claim
naming a file that does not exist, a claim naming a test the failure does not
mention, a patch that leaves its test passing, and the restore deliberately
disabled, which is the one that matters: a checker that leaves a break patch
applied would put it in the next commit, arriving through the tool that was
supposed to be careful.

### The merge I could not make a check fail without

`aar-24-history-seed-replaces-the-turn` existed because a product fix had no
patch aimed at it. Two things were changed together this morning to get
`ai-answer-rendering` to its declared length — an unbounded `innerText()` was
bounded, and the thread-history seed stopped REPLACING a turn the mount had
produced — and a green baseline does not say which mattered. The patch restores
the wholesale replace, and its header wrote the prediction down first: *"if this
reddens the trace check, the merge is what made the suite green and the bounded
read only stopped the crash. If it stays green, the bounded read was the whole
of it."*

It stayed green. Three constructions, each correcting the last:

1. **A delayed request.** Holding the GET for three seconds makes the SERVER
   answer late — and by then the turn has persisted its own messages, so the
   history it returns already contains the answer. Replacing with a superset is
   harmless. This would have shipped a check that cannot fail.
2. **A stale snapshot, served late.** Capture the history before the turn and
   fulfil the held route with it. Closer, and still green — because the selector
   `[data-testid^="ai-answer-"]` also matches `ai-answer-streaming`, which
   renders from the stream buffer rather than from `messages` and so cannot be
   touched by the seed.
3. **The finalised answer only,** with the route counting its own hits so a
   check that never staged the race reports UNKNOWN instead of passing. The
   stale history was verified served, the race was staged — and the turn
   survived it with the replace restored.

So the merge is not what keeps the answer, and the comment in `ai-panel.tsx`
saying it fixed the trace check overstated it. Corrected there and here, with
the original paragraph left standing above rather than edited away.

**What was done about it.** The merge stays — "a turn already on screen is not
removed" is the behaviour a reader expects, and the seed runs once per thread so
it cannot duplicate — but it is recorded as a conservative choice nothing
measures rather than as a fix. `aar-24` is DELETED: a patch that reddens nothing
after three honest attempts is not evidence, and keeping it as a permanent green
against a zero ceiling would be a suppression list with one entry. The check I
wrote to catch it is deleted too, because a check no patch can redden is the
same problem one level up. `accounted` falls by one, visibly, which is what a
floor is for.

### The shape that kept slipping past rule one

Nine of the ten section-enders the sweep surfaced after the first checker landed
had one shape, and rule one could not see it: it pairs a press with a check in
the TEN LINES above it, and in every one of these the check and the press are in
the same SECTION, thirty lines apart. `aoc-1-filelist-read-late` stages files
with no Attachments section — the check directly says so — and the press on the
X inside a row of that section is twenty lines below it. 6 of 14 checks.

The section is the suite's own boundary, between one `console.log('\n▶ …')` and
the next, and it is exactly the scope a throw destroys. So the rule is: within a
section, a testid any check asserts the existence of is one that every later
interaction in that section has to survive the absence of. **Twenty instances
across thirteen suites**, all fixed — presses bounded and caught, reads caught to
null where the comparison beside them reddens on null, which every one of these
does. One of them reads its select in the FAILURE MESSAGE as well as the
condition, and a message is evaluated whether the check passed or failed.

One false-positive class, named rather than absorbed: a read inside a
`waitUntil` predicate is already safe, because `waitUntil` catches its
predicate's throws. `comment-plus-menu` has three and they are correct as
written.

**Why this one is gated when the sequence rule is not.** The sequence rule
("bounding one step moves the exception to the next") can only be stated by
reading formatting — how many lines a call is written across — and two window
sizes gave two different answers about the same tree. This one is stated in the
suite's own structure. And the arithmetic favoured acting: the eighty sets still
to run would each have surfaced one of these, at a fix and a re-run round
apiece.

The five gated rules now are: a press on a control the check above it may find
absent; a gate in front of a check about the same element; a `boundingBox()`
that throws when nothing matches; the same locator guarded on one line and bare
on the next; and this one. What stays out, with its reasoning in the file: the
sequence shape, and any rule over reads that cannot see `&&` short-circuiting.

### All six of frame `03:05`'s cover tabs, accounted for

The frame is explicit: **Gallery | Upload | Link | Search | Attachments |
Remove**. At the start of today the suite exercised Gallery and its Custom
swatch, asserted Search's absence with its reasoning, and checked that the Link
and Attachments tabs EXISTED. Where they stand now:

| tab | state |
|---|---|
| Gallery | checked, including the Custom swatch reading back byte for byte |
| Upload | half measured, and the limit is written down (below) |
| Link | six checks; it worked and was simply unverified |
| Search | asserted ABSENT, with the re-checked reason in the suite |
| Attachments | five checks — and the tab could never list a file until today |
| Remove | checked on all three fields a cover can be set in |

**Upload is the one that cannot be finished here.** `R2Service` logs "R2 is not
fully configured. File and clip uploads are disabled" and `presignPutObject`
throws `Storage is not configured`, so presign → PUT → commit cannot run without
credentials this repository does not hold. That is recorded as unmeasurable
rather than skipped, the same way the eight language-model field types are.

The measurable half is the one the component's own comment says was missing:
*"the version of this tab that shipped before had no handler at all, so a failed
upload and a successful one looked the same: nothing happened either way."* So
three checks — the tab offers a way to choose a file, choosing one when storage
is unconfigured SAYS so in words, and the cover is left exactly as it was. 32 of
32 green, and `task-cover-11-upload-fails-silently` reddens the middle one and
only it: 31 of 32, with the cover check still passing, which is why both exist.

The cover picker is where the testid question paid for itself twice: nine of its
eighteen testids were named by no suite this morning, and the two holes that
hunt pointed at were a tab that could never list a file and a tab nobody had
pressed.

### A seventh verb, and a press one name away from rule one

Two more section enders, both found by the sweep rather than by a rule, and
they are worth writing down together because they failed the SAME rule in two
different ways.

`space-create-menu.mjs:485` read `isDisabled()` on the quick-create submit
button with nothing bounding it. `form-1-not-offered` and
`space-create-menu-3-defaulttab` both take the Form tab away, so there is no
submit button to read: the call waited out Playwright's default thirty seconds,
threw, and both patches reported **12 of 29** while being credited with the one
check each claims. `isDisabled` is a seventh verb in the class — on a locator
that matches nothing it throws rather than answering `false` — and the guard
seventeen lines further down already knew that, having been written for
`form-5-space-lists-endpoint`.

The fix keeps the count SEPARATELY and asserts it: `submitCount === 1 &&
disabledWhenEmpty`. "Absent" and "enabled" both fail this check and they are
not the same defect — a button that is not there is not a button that refuses
in silence, it is no button at all — so the message now prints both and the
check is strictly stronger than the one it replaces.

`task-cover.mjs:250` is rule one's shape displaced by exactly one element:

```
chk(await appears(page.getByTestId('cover-custom-input'), 6000), 'and opening it reveals a colour chooser', …)
…
await page.getByTestId('cover-custom-apply').click()      ← the press
```

The check above is ALLOWED to find the chooser absent — that is what
`task-cover-1-nocustom` makes happen, by hiding the Custom cell — and when it
is absent the Apply button cannot exist either. The two steps in front of this
press were already bounded for that same patch. This one was missed because
rule one pairs a press with the testid of the check directly above it, and
these are `cover-custom-input` and `cover-custom-apply`: one dialog, two names.
18 of 32 reported.

**And no rule was added for either.** That is the finding, not a concession.
The scan for a bare single-line press with neither a timeout nor a catch
returns **275 sites**, and the overwhelming majority are presses on controls a
working product always draws, where a throw is the correct "this page is
broken" signal for the baseline. Rule one's 19-of-19 hit rate was for the
PAIRED shape, never for bare presses generally; a rule on the shape alone
would report two hundred and fifty working call sites as defects, which is by
the header's own words "a checker nobody would keep." The narrow scan for a
state or value read on a testid locator returns 37. Measurement decides which
of those matter, and the 636-patch sweep IS the measurement — one site fixed
per SHORT it names, with the patch that named it in the comment.

### The `ai-assign` refusal was a suite the tree had already fixed

The refusal on disk reads `22 passed, 1 failed` at `2bf30a74`, on the runner-up
check, and the payload it printed satisfies every clause of the assertion it
names — replayed against the live code, all five conditions return `true`. So
the check that failed was not the check in the tree: the suite was rewritten
at `6c029e5` ("One suite's litter was another suite's red baseline") for
exactly this, replacing a comparison of the two reason STRINGS with one that
requires the runner-up's reason to name the runner-up and carry their own
count. Two members of the shared workspace had both accumulated the display
name "Cal Peer", and `explainCandidate` names a person by `displayName ||
email`, so the two sentences were identical and the old check failed on a
fixture fact rather than a product one.

Nothing needed fixing; the refusal needed re-measuring. It is in the plan the
round regenerated, so the seven `assign-*` patches stay UNKNOWN — not absent,
not green — until it runs.

### Rule six: the read in the message, where no short-circuit can reach it

`amc-5-bound-moved` drops the server's `BEST_MODELS_VISIBLE` from three to two,
so the `fast` row goes behind the disclosure and its card never opens. The run
reddened the check the patch claims AND two more besides — and then spent
thirty seconds on this:

```
chk(
  fastHint.length > 0 && (await page.getByTestId('ai-model-hint-fast').innerText()).trim() === fastHint,
  'carrying that model’s OWN one line, the same one the catalogue serves',
  `the card read ${JSON.stringify((await page.getByTestId('ai-model-hint-fast').innerText()).trim())} …`,
)
```

13 of 24. `innerText` is an eighth verb in the section-ender class, and the
guard in front of it — `fastHint.length > 0 &&` — does not fire, because `fast`
is still in the served catalogue; the row went behind a disclosure, it did not
leave the catalogue.

**And this one gates, where the broad read scan did not.** That distinction is
the whole finding. Rule one's header rejected a scan over `innerText` and
`getAttribute` because six of its nine candidates were already guarded by `&&`
short-circuiting, "which is the idiom these suites use and which a text rule
cannot see." A MESSAGE ARGUMENT HAS NO CONDITION TO SHORT-CIRCUIT. It is
evaluated whether the check passes or fails, so the idiom that made the broad
scan useless cannot apply — the objection dissolves instead of being argued
around. Even a guard that DID fire would have left the message reading the same
absent element a second time.

A message read is also the one case where bounding is unconditionally right.
Rule three's caveat — catching a box read is only safe while the assertion under
it reddens on absence — has no counterpart, because **a message decides
nothing.** It is diagnostic text. A message that throws does not weaken a
verdict; it replaces the verdict with an exception and takes the rest of the
section with it.

**Seventeen sites across thirteen suites, all seventeen now bounded**, each read
once into a variable used in both the condition and the message. That retires
the double read as well: twenty-six `chk`s in this tree read the same locator
twice, and two of them were not merely wasteful —

- `list-card-cover` called `sizeReadout()` again from the message, and
  `sizeReadout` calls `openCustomize`. Reading the diagnostic REOPENED the panel
  that the next line deliberately shuts before anything is measured. A sentence
  describing the page was moving it.
- `list-view-controls` read `data-calendar-period` and `todayBtn.isDisabled()`
  five times between them across three checks, all bare, with a caught gate
  above them — so `list-calendar` going missing would have ended that section on
  whichever line got there first.

#### And zero is the number this audit has learnt not to take on trust

The rule is now a gate over a tree with no sites left in it, which means its
answer in CI is `0`, and "0 failed is not it ran." So its reader came out into
`scripts/lib/suite-reads.mjs` and `scripts/check-suite-reads.mjs` breaks it:
**17 cases, and six mutations of the reader, every one of which reddens the case
that names the defect.**

| deleted | the case that fails |
|---|---|
| `.slice(2)` | a read in the CONDITION is reported as a message read |
| string-skipping in the splitter | `"a, 'b, c', d"` splits into four arguments |
| depth-counting in the splitter | `'a, f(b, c), d'` splits into four arguments |
| `if (depth !== 0) continue` | a truncated `chk(` is scanned on an invented argument list |
| the `.catch` exclusion | a read that already catches is reported, so the fix cannot fix it |
| `count` added to the verb list | `count()` is reported, and bounding it is busywork |

The two splitter cases each put **two** commas in front of the read, and that is
deliberate: one comma only moves a condition read to index 1, which `.slice(2)`
drops whatever the splitter does — a one-comma case would pass with the skipping
deleted and prove nothing. Two commas walk it to index 2, inside the message's
range, where a blind splitter reports a guarded condition as a defect.

Confirmed against the real tree too, not only fixtures: putting one of the
seventeen back reddens the gate at `paywall-sites.mjs:329` by name, and the
restore leaves `git status` clean.

**Rules one to five remain line-based and untested.** That is a gap, named here
rather than papered over: they were each measured against the tree when they
went in — nineteen, five, twenty, three and twenty sites, all real — but none of
them has a case file, so none of them would notice itself breaking. Rule six is
the first with one, because it is the first whose steady-state answer is zero.

### And the five rules above it, which reported zero with nothing watching

Rule six got a case file the day it was written. The five above it had none —
each measured against the tree when it went in (nineteen, five, twenty, three
and twenty sites, all real) and then left as a loop reporting `0` forever with
nothing able to tell a working rule from a broken one. The ledger named that
gap in the paragraph above; this closes it.

**It does not refactor them.** Pulling five line-based loops out into pure
functions is the change that turns a real 0 into a false one while looking like
tidying, and the whole point is to stop trusting 0. So the checker takes a
`SUITE_DIR` — read by nothing in the audit but the case file — and
`check-suite-enders.mjs` points it at fixture suites, one shape per file, then
asserts on what it actually prints. Rules, file walking and reporting are all
under test with no refactor at all.

**25 cases, and ten mutations of the checker, all ten of which bite.**

| deleted or defeated | the case that fails |
|---|---|
| rule one's press requirement | seventeen cases, since every fixture becomes a site |
| rule one's ten-line window | a press eleven lines down pairs with the check anyway |
| rule one's "is this check about existence" | a press under a check about a VALUE is reported |
| rule two's asserted-testid set | a legitimate page-load gate is reported |
| rule two's caught-gate skip | a caught gate is reported |
| rule three's two-line catch window | a catch on the following line is missed |
| rule four's identifier match | the rule matches on proximity instead |
| rule five's section boundary | an assertion carries into the next section |
| rule five's `waitUntil` exclusion | a polled read is reported |
| a rule missing from the press subtraction | four rules firing once each miscount |

#### Two findings the cases produced, which is what a case file is for

**One physical site was being reported twice.** The very first case asserted
that rule one's shape fires rule one and nothing else, and it failed: rule five
fires too, and is right to — rule five is rule one without the ten-line window,
so every press rule one catches is also something the section asserts. Two rows,
one line to fix, and the summary read "1 press … 1 use of something this section
asserts". So the labels stay — they say which argument makes a site a site — and
a DISTINCT site count goes in front of them. "Nineteen presses and twenty
sections" was never thirty-nine places.

**Rule one was narrower than its own guard.** It matched `.click()` — a press
with no argument at all — while the guard four lines above it already skipped
any line carrying a `timeout:` or a `.catch(`. So the regex only ever excluded
presses whose options object holds NEITHER, and there are seventeen of those in
the tree: `click({ force: true })`, `selectOption({ label })` and the like,
every one of which waits the full default thirty seconds and throws exactly as a
bare press does.

Broadened to `.click(`, the checker **still reports 0 sites on this tree** —
none of the seventeen sits under an existence check naming the same testid — so
this closes a blind spot at a measured cost of nothing, rather than introducing
a report to argue with. Both halves are pinned: an options object with no
timeout is a site, one with a timeout is not.

### The `ai-assign` refusal, re-measured

It came back **23 passed, 0 failed** at the baseline. The diagnosis above was
right: the failure in the refusal log could not have come from the check it
named, the suite had already been rewritten at `6c029e5`, and the fix was a
re-run rather than a re-aim. Six of its seven patches reddened the check they
claim; `assign-2-second-count` came back GREEN, which is a live finding on the
current tree and the next thing to chase rather than a number to move.

### `assign-2-second-count`: the check was right and the fixture was zero

It came back GREEN on a check written for precisely it, and the check is not the
problem. `assign-2-second-count` makes the suggestion keep its own arithmetic —
`open + inList` instead of the shared `collectWorkloadLoads` `open` — and the
cross-source check that would catch that stands where **every candidate has
`inList = 0`**, because the subject's list is created by the run and nothing has
been put in it yet. The check's own comment records its first run: *"the
suggestion said 0 and workload-balance said 0."*

`open + 0` is `open`. 23 passed, 0 failed.

**Two zeroes agreeing is not two sources agreeing** — the same shape as a
counted skip reported as a pass, one level down in the fixture rather than in
the harness. So the suite asks the same question a second time, in the later
section where the candidate has been given one task in this list and `inList`
is 1, asserted on the line directly above. There `open + inList` is `open + 1`
and the drift is the patch itself. The claim now names that check; the earlier
one stays, because it is the cheaper statement of the same guarantee and it
reddens for patches that break the shared read outright.

`EXPECTED_CHECKS` 23 → 24, and the provenance reader immediately said the right
thing about all seven of the set's logs: *"the log ran 23 checks and ai-assign
declares 24: a short run, a run of another suite, or a run that predates a check
this suite has since grown."* Not credited, not discarded — counted as
unreadable until the set runs again.

### The weakest zero in the set: a guard that passed by looking at nothing

`check-no-break-patches.mjs` exists because `43f7b57` shipped
`data-testid="task-add-fields-DISABLED"` to main — a control that renders and
does nothing, found only because the agent whose patch it was went looking
through HEAD afterwards. Its header ends: *"Vigilance is not a control. This
is."*

It was not.

```
$ cd /tmp && node /home/user/rundesk/scripts/check-no-break-patches.mjs
[break-patch-check] clean — no break-patch signatures in apps, packages or test
exit=0
```

`ROOTS` was `['apps', 'packages', 'test']` — **relative** — reached through
`fs.existsSync(root)`. From any directory but the repository root, every root
missed, the loop skipped all three silently, the walk visited zero files, and it
reported a clean tree with a zero exit. `preflight.sh` happens to `cd` first,
which is exactly why it survived for as long as it existed. A control that
passes by looking at nothing is worse than no control: it is the vigilance its
own header rejects, wearing a green tick.

Four changes, each closing one way the scan could cover nothing:

- roots resolved from the script's own location, so the answer does not depend
  on the working directory — measured from `/tmp` and from the repository root:
  **2,526 files, same answer**
- **a missing root is a failure, not a skip.** It names which roots are gone and
  says the layout has changed
- a floor on the file count, because "no signatures found" in a scan of three
  files is a statement about the scan
- and "clean" now reads *"2526 file(s) read across apps, packages and test"*.
  A clean verdict has to say what it covered

`scripts/check-patch-guard.mjs` keeps all four true: **14 cases, seven
mutations, all seven of which bite.** It plants into a throwaway tree rather
than into this one — a case file that writes `BROKEN:` into a real component and
restores it afterwards is precisely the accident the guard was written after, a
step-6 edit outliving the step. A test for this guard must not need the guard.

#### Two cases that proved nothing, and what they found

**The `-DISABLED` case planted nothing.** It anchored on `<div` in
`toaster.tsx`, which draws no bare div, so the replace was a no-op and the case
passed against an unmodified file. Re-planted as its own line, it fires.

**The missing-root case could not produce a missing root.** It passed the clean
fixture set and dropped `test` from `roots` — but writing `test/src/c.mjs`
creates `test/` on the way to the file, so the root was always there.

**And `path.resolve(full) !== SELF` is dead code.** Mutating it to `true`
changes no answer, because `ROOTS` never walks `scripts/`. It is kept, with the
reason written into the guard, and the scope it depends on is now pinned by its
own case: a signature under `scripts/` does not change the verdict, by decision
rather than by accident. Widening `ROOTS` to include `scripts` fails that case —
which is the right moment to notice both that the exclusion becomes
load-bearing and that the case file plants `// BROKEN:` fixtures on purpose.
There are eleven such signatures under `scripts/` now; the scope is the only
reason they are not reported.

**Preflight is 24 steps, 23 green.** The single red step is `break runs measured
this tree`, which is the sweep's own work list.

### `ths-4-wraps-round`: a wait satisfied by the loading state

15 of 15, green, on a patch that makes the ▶ wrap from the last status back to
the first — which is word for word what the check it names forbids: *"on the
last status the ▶ resolves to nothing and is disabled — it does not wrap round
to the start."*

The check walks the task to the pipeline's last status and waits for
`data-next-status === ''`. And `''` is what that attribute reads **before
`statusesQuery` resolves**, because `orderedStatuses` is empty, `findIndex`
answers `-1`, and `nextStatus?.key ?? ''` is the empty string. So the wait
succeeded on the loading state and the check passed before the product had
computed anything at all. The same `''` meant two unrelated things:

- the control resolved to nothing — the answer the check is about
- nothing has arrived yet — no answer at all

`ths-2-next-writes-fixed-key` DOES redden this check, which is exactly why it
looked covered: it was covered by one patch's shape rather than by the check
being decidable.

**And the same defect sits one section down.** The ✓ check on a list with no
closed status waits for `data-complete-status === ''`, which is likewise the
loading value. `ths-1-complete-writes-done` reddens it by making the key `done`
instead of empty — again, covered by a patch's shape rather than by the check.

The fix is one attribute beside the two that already exist for this reason:
`data-status-count`, carrying `orderedStatuses.length`. Both checks now wait for
the count to equal the pipeline's OWN length — not merely non-zero, because a
partial list also has a last rung and would pass for the wrong reason — and
only then read the key. `EXPECTED_CHECKS` is unchanged at 15: no check was
added, two were made decidable.

Both failure messages now name which of the two it was, since "the statuses
never arrived" and "the ▶ offered a status" are different defects and the old
version could not tell them apart in either direction.

**Still to measure.** All three lanes were busy when this was written, so
whether `ths-4` now reddens comes from the chain's next pass over the suite.
It is recorded here as a fix awaiting its own measurement, not as one.

### The sweep's own terminal sentence was unreachable

Everything here is aimed at one line, printed by `chain-plan.sh`:

> `round N: nothing left — every log on disk measured the current tree`

And nothing was checking that it could be earned. The sentence comes from
`never-run-plan.mjs` returning no lines; the numbers anyone would quote it
against come from `check-break-reddened.mjs`. **Two instruments, one question:
has this patch been measured against this tree.** They disagreed three ways.

**One: the plan scheduled a patch no e2e run can settle.**
`planner-priorities-1-two-cache-keys-again` claims a `unit:` check — its
evidence is `use-priorities.test.ts`, which `check-unit-claims.mjs` measures
every preflight — and the plan listed it anyway. Every round would have asked
for it again, the run would have changed nothing, and the chain would have
ended at **"no progress, stopping"** rather than at "nothing left". The sweep's
terminal sentence, unreachable, because of one patch's name.

The exclusion was there and worked by accident: `if (!suite) continue // a
`unit:` claim`. Three of the four unit claims — `ts-9-dedupe-dropped`,
`amp-2-opus-unpriced`, `aar-17-views-hardcoded` — use abbreviated prefixes that
match no suite file, so `suiteOf` answered nothing and they fell out.
`planner-priorities-1` prefix-matches `test/e2e/planner-priorities.mjs`, so the
name fallback handed it a suite. Now the claim is read directly.

**Two: four patches were called measured and unmeasured at once.**
`teams-carousel-1` through `-4` have `brk-<patch>.log` files from 21 September
at 20:55 and no line in any per-suite log, ever. The reddened checker asked
`existsSync(brk-…)` first, found one, and a missing per-suite record came back
from the drift check as `<no run log>` — filing them under *"measured against a
tree that has moved."* The record is asked first now: **a `brk-` file with no
per-suite provenance is not a measurement**, because nothing can say which tree
it is about.

**Three: freshness counted 9 where the plan counted 7**, the difference being
two unit claims folded into "no surviving run log". They are counted on their
own line now, naming the tool that does measure them — a counted skip, the rule
this file applies to its own UNKNOWNs, turned on itself.

`scripts/check-plan-population.mjs` keeps all three closed. It compares **the
tools' output, not their libraries** — both read `lib/log-tree.mjs`, so
re-deriving the answer would agree with itself by construction. And the union
comparison was not enough: `teams-carousel` sat in two buckets that both mean
"needs a run", so the sets agreed and only the sub-counts disagreed. It now also
asserts that no patch is called NEVER RUN by one tool and DRIFTED by the other —
contradictory claims, since a patch with no measurement has no tree to have
drifted from. Both directions break-tested: re-introducing either bug reddens
it, naming the patches.

### And `console.log` to a pipe is not `console.log` to a terminal

Adding `NAMES=1` to the reddened checker so the comparison could be made exposed
this. Run in a shell it printed all 809 lines. Run through `spawnSync` it
returned **8,263 bytes and 168 of them, with `status: 0`, `signal: null` and no
error** — a truncated answer indistinguishable from a complete one.

`console.log` to a pipe is asynchronous in Node; to a terminal or a file it is
synchronous. `process.exit()` tears the process down without draining what is
still buffered. This is the same shape as the two exit codes I read off a
pipeline earlier in this audit and had to re-measure: **output through a pipe
does not behave like output to a terminal, and the difference is silent in both
directions.**

Eleven checkers ended in `process.exit(…)` after printing. All eleven now set
`process.exitCode`, and the fix was verified by measurement rather than by
reasoning: each checker's piped byte count compared against its redirected byte
count, across all nineteen. **No checker loses output through a pipe.**
Preflight was never affected — a redirect to a file is a synchronous write — so
no number reported from it was wrong.

### `space-wizard-views` REFUSED on a race, and took six patches with it

`14 passed, 1 failed` at `3aaee334`, on *"the panel drew 0: [] — the panel and
the server disagree about the view set"*. The baseline had been green at 15 of
15, and nothing in that commit or the six before it touches the space wizard.

The suite waits for `space-wizard-views` — the CONTAINER — and then reads the
`viewrow-*` elements inside it, which are drawn from `GET /space-presets` and
arrive later. **Same shape as `ths-4` one commit earlier: a wait satisfied by a
state that is not the answer.** There the empty string meant both "resolved to
nothing" and "not loaded yet"; here an empty container meant both "the server
serves no views" and "the rows have not arrived". It now waits for the row count
and reads afterwards — and the read stays after the wait, so a patch that
removes a row still fails the check with the count printed.

A refusal is the expensive kind of false negative: the whole set stops, so six
patches went unmeasured behind a failure that was not about any of them.

**Preflight is 25 steps, 24 green.** The red one is `break runs measured this
tree`, which is the work list.

### Two more coverage claims that would have passed over nothing

The break-patch guard's relative roots were not a one-off. The same question —
*would this check notice that it read nothing?* — put to the two remaining
zero-reporters found two more.

**`check-frame-traceability.mjs` had no floor at all**, and it carries the
audit's central claim: that every line of the specification is answered
somewhere. It extracts observations with `^- (\d{2}:\d{2})` — a top-level bullet
opening with a timestamp — and exits 0 when none is unanswered. Reformat
`docs/video2-frame-observations.md`, change the bullet character, indent the list
under a heading, and `distinct` is `[]`, `nowhere` is `[]`, and it reports **"0
observation(s): 0 named in a suite … 0 nowhere"** and passes. A coverage claim
over an empty specification.

The other direction is subtler and worse. If `test/e2e` stopped being read, every
stamp would fall through to the ledger — which mentions all 115, because the
ledger is where the audit writes about frames — and it would still report 0
nowhere while claiming nothing was named in a suite. **The distribution is the
substance of the claim, not the total.**

Five floors, and the break test caught the first version getting one of them
wrong: flooring `suiteFiles.length` while the corpus itself went empty **passed**
— 113 files listed, nothing read from them. What the check searches is the TEXT,
so that is what has to be measured. Both are kept, since a corpus can shrink
either way. All five paths to a vacuous pass now redden on the floor:

| mutation | caught by |
|---|---|
| the bullet pattern stops matching | 115 observations |
| the suite files stop being listed | 113 suites |
| the suite text goes empty, list intact | 2,447,535 bytes |
| the unit tests stop being walked | 167 files / 1,081,317 bytes |
| the ledger documents stop being read | both readable |

**`check-suite-check-branches.mjs` printed a zero with no denominator.** Its
header says "ZERO NOW, ACROSS ALL 113 SUITES" and nothing made that true: point
`SUITES` at the wrong directory and both of its verdicts — the conditional-check
count and the missing-`catch` list — are empty, and it exits 0. It now asserts
the suite count and prints it, so the line reads **"0 conditional check block(s)
with no else, in 0 of 113 suite(s) read"**. A zero with a denominator is a claim;
a zero on its own is not.

One honest limitation, since a mutation pass found it: emptying the second
scan's input in isolation changes no answer, because that scan reports 0 anyway
and now shares the floored `suiteList`. The realistic regression — the directory
resolving elsewhere — reddens. A mutation of code that cannot realistically be
written is not a gap; pretending it is would be padding the table above.

### The probe, run to exhaustion

Once `check-no-break-patches.mjs` turned out to pass by looking at nothing, the
question became a sweep of its own: **put every checker that reports a zero in
front of an empty corpus and see whether it notices.** Six did not.

| checker | how it passed over nothing | now |
|---|---|---|
| `check-no-break-patches.mjs` | relative roots; from `/tmp` all three missed | anchored, roots asserted, 2,526 files counted |
| `check-frame-traceability.mjs` | no floor at all; a docs reformat empties it | 5 floors, on the TEXT not the file count |
| `check-suite-check-branches.mjs` | a zero with no denominator | "0 … in 0 of 113 suite(s) read" |
| `check-break-coverage.mjs` | `0 suites have NO break patch` is true of 0 suites | 3 floors, and it says which gave way |
| `check-break-patches.py` | `if not patches: sys.exit(0)` — **in CI** | floor of 750, and the `/tmp` fallback warns |
| `check-video2-counts.mjs` | a caught ENOENT turned assertion 8 off in silence | the skip announces itself |

Every one break-tested by pointing it somewhere empty and requiring it to
redden, then restoring and requiring it to pass.

**Two of these are worse than the rest.** `check-break-patches.py` runs in CI,
and its "no patches on this machine — nothing to check" was an explicit
`sys.exit(0)`: a breaks directory that went missing would have reported success
on every push. And `check-video2-counts.mjs` had the failure *inside* the file
written to stop numbers going unchecked — its own comment records an earlier
version of the same mistake, where a `catch {}` swallowed a throw and "setting
the headline to 999 did not fail the build". The catch that replaced it was
narrowed to ENOENT and still said nothing when it fired.

#### And a summary that claimed an assertion it had not run

Making the skip announce itself exposed the next layer. The final line listed
all eight reconciliations unconditionally — *"…the handoff document agrees with
§4…"* — so with the document absent it printed the skip notice and then the
claim, two lines apart. **A summary naming an assertion that did not run is the
same defect as a suite reporting `0 failed` for checks it never reached.** The
sentence is now assembled from what actually ran, and says explicitly when the
handoff was not compared.

#### What the probe did NOT find, which is worth recording too

`check-migration-order.mjs` ("160 files, contiguous sequences 0000..0159, each
present in the journal") and `check-break-claims.mjs` (whose population sum I
added earlier today) already carry their denominators. And no checker other than
the break-patch guard resolved a path against the working directory;
`check-video2-counts.mjs` did, but a missing ledger throws ENOENT and kills the
run, which is loud. Both are anchored now anyway.

**And one sentence that stood here was wrong.** It read: *"The four contract
tests — `check-chain-helper`, `check-claim-match`, `check-suite-of-patch`,
`check-log-tree` — report 'N cases held', which is a count of work done rather
than of defects not found, and cannot go vacuous without going to zero cases."*

They do not report N cases. They report **"all assertions hold"** with no number
in it, and going to zero cases is not a bound on the failure — it IS the
failure. Measured: with every assertion commented out, all four printed exactly
the line they print when they pass, and exited 0.

That paragraph was written to record what the probe did NOT find, which makes it
the worst place to guess. The correction is the finding: **seven more, not
four.**

### Seven more, including the four I had just cleared

The paragraph above recorded what the probe did not find, and it was wrong about
half of it. Put the same question to the contract tests — *would this notice
having no cases?* — and all four answered no:

```
check-claim-match.mjs      with every assertion commented out → exit=0  [claim-match] all assertions hold
check-chain-helper.mjs     with every assertion commented out → exit=0  [chain-helper] all assertions hold
check-suite-of-patch.mjs   with every assertion commented out → exit=0  [suite-of-patch] all assertions hold
check-log-tree.mjs         with every assertion commented out → exit=0  ok log-tree: every case holds
```

"All assertions hold" is true of no assertions. Each now counts what ran,
asserts a floor, and **prints the number beside the verdict** — `all 22
assertions hold`, `all 11`, `all 20`, `all 36 cases`. A verdict that does not
say what it is about is the same shape as a suite reporting `0 failed` for
checks it never reached.

**And the three case files written today had it too.** `17 case(s) held, 0 did
not` becomes `0 case(s) held, 0 did not` with every case deleted, and exits 0
either way. Floored, all three.

#### The floor that did not floor

Worth writing down because it is the exact defect class this audit is named for.
The first version of the four guards set `process.exitCode = 1` — and every one
of those files ends with

```js
process.exitCode = failed === 0 ? 0 : 1
```

which runs afterwards and **overwrites it back to 0**. Two of the four were
given floors ABOVE their real count (30 against 22, 20 against 11) and both
still exited 0. A guard that cannot fail, inside the guards written to stop
checks that cannot fail.

It was caught by measurement rather than by reading: printing the counts showed
22 and 11 sitting under floors of 30 and 20 with a green exit. The floors now
set a flag the final verdict reads, and all seven redden when their assertions
are removed.

### A hunt that found nine suites and no defects

With conditional checks at zero it looked as though a static property should
hold: **a suite cannot declare fewer checks than it statically calls**, since
every call site runs. Nine suites fail it — `chat-message-actions` declares 73
and calls 97, `panel-collapse` 56 against 71, `emoji-picker` 25 against 26.

All nine are correct, and the reason is in the tree already. `emoji-picker`
line 400:

> *"The three remaining checks report as failed with the reason, so the run
> reaches its own summary and the count still comes to `EXPECTED_CHECKS` — which
> is the same rule the rest of this directory follows: **every branch reports the
> same number of checks.**"*

A static call count bounds nothing in either direction. A **loop** multiplies
one call site into many — that one is three. A **branch** divides several call
sites into one path taken; `check-suite-check-branches.mjs` requires the `else`
precisely so both paths report, which makes the alternatives visible statically
and uncountable statically at the same time.

So the property is real and it is enforced dynamically, by `EXPECTED_CHECKS`
being compared with `!==` on every run. A static version would add nothing and
would report nine working suites as defects — the same trade that kept the broad
read scan from becoming a rule. Written down so the scan is not built twice.

### The line every number here rests on, ungated until now

Each suite ends with a version of

```js
if (results.length !== EXPECTED_CHECKS) { … }
```

and that `!==` is the whole reason "0 failed is not it ran" is enforceable
rather than a slogan. A run that stops early prints `0 failed` for the checks it
never reached, and the break harness credits the patch with every one of them —
which is the defect the `SHORT` column, the counted skip, the section-ender
rules and half this ledger exist to prevent. **Nothing was checking that the
line was there.**

A suite added without the constant, or with the comparison written `<` because
it expects a skip, would report a truncated run as clean. Measured: all 113
declare it and all 113 compare with `!==`. It is a GATE rather than a ratchet,
because unlike the conditional-check heuristic beside it, the presence of a
constant and the operator next to it are not a guess about text — they are the
text.

Three failure modes, each break-tested against a real suite and each naming it:

| mutation | reported as |
|---|---|
| the constant is renamed away | `emoji-picker — declares no EXPECTED_CHECKS at all` |
| the comparison becomes `<` | `emoji-picker — compares it with < — not \`!==\`` |
| the comparison is removed | `emoji-picker — declares EXPECTED_CHECKS and never compares it` |

`>=` and `<` are called out separately from a missing constant on purpose: they
are the plausible mistake. A suite with a conditional skip reaches for a range
comparison, and that is precisely the suite whose length cannot be trusted — the
skip that should count towards the total belongs in the total, which is what
`skipRest` is for, not in a loosened comparison.

### The spelling rule one could not see, and two short runs

`check-plan-population.mjs` — six hours old — fired for the first time, and it
was right. Two patches the reddened checker had under `unknown` that the plan
would never schedule: **`list-save-view-4-grouping-is-not-part-of-the-view`**
and **`list-statuses-seeded-1-starter-list-unseeded`**. Neither is stale
evidence. Both are complete, current runs that stopped early — 4 of 7 and 4 of
10 — so a re-run reproduces them exactly. They needed a fix, not a round.

**`list-save-view` is rule one's shape in a spelling rule one was blind to.**

```
chk((await page.locator('[data-testid="list-save-view"]').count()) === 1, 'changing the view raises the chip', …)
…
await page.locator('[data-testid="list-save-view"]').click()
```

The rule extracts testids with `getByTestId\(['\`]([^'\`]+)['\`]\)` and matches
presses the same way. Both lines here use `page.locator('[data-testid="x"]')`,
so neither the id nor the press was visible to it, and the press waited out
thirty seconds with three checks about what the save actually SENT unreported.

Taught the second spelling, rules one, two and five found **four sites across
four suites** — and one of the four was a false positive that mattered:

- `folder-dialog.mjs:297` — a bare press under a check written in the other
  form. Real, and invisible until now for exactly the same reason.
- `list-view-controls.mjs:135` — an uncaught gate on an element checks below it
  are about. Real.
- `attach-on-create.mjs:193` — **already guarded**, with `.catch(() => false)`
  two lines down the chain, and its own header records it as the gate `aoc-4`
  proved. Rule two tested `lines[i]` alone, so widening its reach turned the FIX
  into a reported defect. Its catch window is three lines now, as rule three's
  has always been — a rule that reports the fix as the defect is worse than no
  rule.

#### And a throw that cost six checks

`list-statuses-seeded` ended with `if (!closed?.key) throw`. The patch takes the
starter list's statuses away — the check two lines above, exactly as claimed —
and the throw then ended the run at 4 of 10.

**Three of the six skipped checks do not need a closed status at all.** A new
task still starts open, the work preview still lists it while open, and
`POST /lists` still seeds a pipeline whose length can be compared with the
starter's — and that third one FAILS under this patch, `viaService.length ===
statuses.length && viaService.length > 0` against a starter list of zero. A
genuine consequence the throw was hiding.

The four that do need it are now reported as FAILED with the reason, so both
paths report the same number and `EXPECTED_CHECKS` stays exact. **Not
`skipRest`**: that is for a gate on the machine, and its own header says a skip
reachable by a product regression is a check that cannot fail. A starter list
with no closed status is a product regression — this patch is what causes it.

The population checker was built this morning to guard the sweep's final
sentence. Its first real firing found two suites, one blind spot in rule one and
one false-positive class in rule two.

### Convergence: the decision, and the one class of fix that survives it

Measured, because the obvious speedup does not work: **4 CPUs, load average 7.5
at three lanes.** The machine is already oversubscribed — each lane waits on
CPU — so adding lanes makes the sweep slower. Memory is not the constraint
(10 GB free of 15); parallelism is closed as a lever.

The lever that IS open is the one I had been working against. **Every fix
committed to a suite or a product file re-drifts that set into the next round.**
Round 2's floor grew 29 → 32 sets in twenty minutes, entirely from this
morning's own fixes. Checker and ledger commits cost nothing, because a patch
depends only on its suite and the product files it edits.

So from here: **suite and product changes are frozen except where a defect
BLOCKS CONVERGENCE.** That is one category — a REFUSED baseline. A refusal
records no patch lines at all, so its patches stay unmeasured however often the
set runs, and `chain-plan.sh`'s own header names it as one of the two ways the
chain can never stop. Everything else found from here is written down with its
evidence and left for a stable tree.

**And the first thing the freeze had to let through arrived immediately.**
`task-menu-favorite-archive` refused at `2067fd8b` — `9 passed, 2 failed`,
against a baseline that had been 11 of 11 all morning, with nothing in that
commit or any commit today touching favourites.

The suite proves the favourite reached the DATABASE — it polls `favouritedInDb`
for fifteen seconds — and then reads the menu label and the star IMMEDIATELY,
with nothing between the write landing and the render that reflects it. Both
depend on React Query's invalidation winning a race against one `openMenu()`.
It usually wins, which is worse than never winning.

**That is the third instance of one shape today**, after `ths-4-wraps-round`
and `space-wizard-views`: a value read before the thing that produces it has
arrived. Bounded polling now stands in front of both reads, and the reads stay
AFTER it — so a product that genuinely never updates the label still fails the
check with what it actually read, which is what the `tmfa-*` patches need from
it. Four patches were going unmeasured behind that flake.

### A green whose claim could never match, over a rule nothing checked

`v1a-2-announce-notifies-the-actor` came back **7 passed, 0 failed** in its own
suite, on a current log. It deletes the `assigneeId !== actorId` guard in
`tasks.service.ts` — so assigning yourself a task notifies you about your own
action — and `notification-gaps`, the suite it names, had nothing to say.

Two faults, stacked.

**The claim could not be located in any run.** It quoted *"reacting to my own
comment added N notification(s) for me"*, and the suite writes that as a
TEMPLATE LITERAL — `added ${selfAfter - selfBefore} notification(s)`. No run can
print that sentence, so no log can be searched for it. `check-break-claims.mjs`
passed it, correctly: the words ARE in the suite. Being present in the source
and being findable in a run are different questions, and only the first was
being asked.

**And the check it named was about the wrong thing.** That sentence is about
COMMENT reactions; this patch changes ASSIGNMENT. Even a matchable claim would
have named a check the patch cannot move.

**Underneath both: the rule was stated and never checked.** This file's header
says *"a notification telling you what you just did is noise you cannot react
to"*. The suite checks it for comments — with a comment on its own header
recording that break-testing found THAT hole too — and the assignment section
assigns the task to MYSELF at line 199 while looking only at the TEAMMATE's
inbox. Every ingredient was already on the page.

The check exists now: my own inbox, read by ENTITY rather than by count —
earlier sections of this suite add rows to it, so "nothing new arrived" would be
false for reasons that have nothing to do with assignment. `EXPECTED_CHECKS`
7 → 8, and the patch's claim names it.

Verified against the product before committing, because a red baseline refuses
the whole set: `notifyWatchersOfAssigneeChange` excludes **both the assignee and
the actor**, and here they are the same person, so the unpatched tree sends
nothing and the check passes. Under the patch the guard becomes `if (true)` and
a `task_assigned` row naming the task arrives in my own inbox.

### And the population checker was demanding work no run can do

Three patches — `csn-1-the-chat-page-owns-the-call-again`,
`save-comment-1-save-writes-nothing` and `us-1-grouped-column-still-shown` —
failed `check-plan-population.mjs` as "the checker says these need a run and the
PLAN does not list them". The plan was right and the checker was wrong.

Two are SHORT runs and one is UNPROVEN, and all three are **complete, current
measurements of this tree**. Re-running reproduces them exactly. What settles a
short run is fixing whatever ends it early; what settles an unproven claim is
the suite naming its failures, or the claim being re-aimed. Both are work for a
person, and neither is the plan's job.

It is the same conflation the plan itself had for `unit:` claims, one level up —
and I had already papered over one instance without noticing, by fixing
`planner-priorities-2`'s suite, which moved it into `drifted` and made the
symptom disappear.

`unknown` now splits by REASON: no record at all (a run settles it, the plan
lists it) versus a current log this cannot read (a person settles it). The
second joins `unproven` under a **ceiling of 3** that can only fall — gated, so
they cannot accumulate in silence, but not demanded of a chain that cannot
deliver them.

### Nine short runs, fixed in one batch, and why the freeze bent for them

The freeze said suite changes only where a defect BLOCKS convergence. Nine did,
and they had accumulated precisely because of it: each one is a run that stopped
early, so `check-break-reddened.mjs` counts it as a log it cannot read and
`check-plan-population.mjs`'s needs-a-person ceiling — set at 3 — stood at 14.
**A ceiling raised to meet a number is how the number stops meaning anything**,
so the alternative was never an option.

| patch | ran | declared | verb that ended it |
|---|---|---|---|
| `a2p-5-assigning-writes-an-assignee-and-stops` | 3 | 10 | `click` |
| `po-1-panel-never-shows` | 5 | 12 | `textContent` |
| `fd-8-no-private-control` | 7 | 21 | `check` |
| `save-comment-1-save-writes-nothing` | 7 | 13 | `click` |
| `csn-1-the-chat-page-owns-the-call-again` | 9 | 10 | `click` |
| `sidebar-dms-1-no-section` | 10 | 14 | `getAttribute` |
| `cma-16-no-search-box` | 16 | 24 | `click` |
| `amc-5-bound-moved` | 18 | 24 | `evaluate` |
| `imports-3-deadpreset` | 18 | 20 | `getAttribute` |

Fixed in ONE commit on purpose: nine separate commits would drift nine sets into
nine different rounds, and one commit drifts them into the same one.

**Two more verbs, and both blind spots are worth naming.**

`locator.evaluate` is a ninth verb in the class — it waits for its element like
the rest. `amc-5` pushes the Fast tier behind the disclosure, the two checks
directly above report `0px` and `0px` for bars that are not drawn, and then the
track measurement threw.

And `sidebar-dms` is the one that shows where two rules each stop. The read is
`section.getAttribute('data-count')` — written twice, once in the condition and
once in the message, which is exactly **rule six's** shape. Rule six missed it
because the read is on a LOCATOR VARIABLE rather than a `getByTestId(…)` written
inline, and rule six matches the literal. **Rule four** pairs a guarded
identifier with a bare one, and here neither use was guarded, so it had nothing
to pair. Two rules, one blind spot each, and the site sat between them.

Not gated. A rule matching reads on any variable would have to know which
variables are locators, and the only honest way to know that is to resolve them
— which is a parser, not a text rule. The measurement found it, which is what
the sweep is for.

### `task-cover-12-upload-commits-anyway`, deleted: it aims past a door that never opens

It moves `commit({ kind: 'stored', storageKey })` to BEFORE the `PUT`, so a
cover is committed whether or not the upload worked. A real defect to guard
against — and unprovable on this machine, because `presignPutObject` throws
`Storage is not configured` two lines earlier and **neither the commit nor the
PUT is ever reached.** 32 passed, 0 failed: the check "and the cover is left
exactly as it was" passed because nothing happened at all.

Its two siblings show exactly where the line falls. `task-cover-11-upload-fails-
silently` and `task-cover-13-no-file-chooser` both redden, because they target
the REACHABLE half — the chooser, and the sentence that says the upload failed,
which is what a run with no storage still produces. Everything past the presign
is dead code in this environment.

So it is deleted rather than declared. `break-report.sh`'s own header is
explicit that **only SHORT may be declared** — "a patch that reddens nothing,
crashes, does not build, is not found, or leaves the tree identical is never
expected… a tool that let a header wave one through would be the suppression
list this audit keeps deleting." Keeping it against a zero ceiling would be a
suppression list with one entry, which is the same sentence `aar-24` was deleted
under.

809 → 808 patches. The `accounted` floor of 759 is untouched and still well
under the measured number; it is named here because a deletion is the one reason
that floor's own comment warns about.

### A refusal on a check that asserts the request, not the result

`folder-dialog` refused at `3ca9f19d` — `20 passed, 1 failed` on *"the public
folder is not in this space at all"* — after being 21 of 21 all day, and took a
set of sixteen down with it.

**Not the edit in that commit.** The only change to this suite was bounding a
`.check()` on the PRIVATE toggle, and the private folder came back correct — it
is the PUBLIC one, created forty lines earlier, that is missing.

The check covering that create asserts `folderPosts.length > postsBefore`:
**that a POST left the browser.** It says nothing about whether the server took
it. A create that leaves and fails passes that check, and the only thing that
ever notices is a read forty lines later, by which point the sentence blames the
wrong moment. The request standing as evidence for itself is the facade's
mirror, and it is why this failure reads as a mystery rather than as a create
that did not land.

The read was also a single un-polled `GET`, which cannot tell a create that
FAILED from one that had not COMMITTED yet. It waits for both rows by name now,
bounded, then reads once — so a create that genuinely never lands still fails
with the same sentence, after a real wait rather than possibly before the write.

Left deliberately: the request-only check is not strengthened to assert the
response. The listener records requests, not replies, and rewiring it is a
change to the suite's fixture rather than to a check — recorded here as the
better fix when the tree is quiet.
