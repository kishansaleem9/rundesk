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
| P | **32** field types, counted off the frame rather than from this row — `00:20` opens the picker at the top and `00:42` reaches its foot, and the two shots overlap on Progress (Auto) · Email · Phone, so the list is continuous and complete. "~30" was close; **"11 absent" was 13** — it dropped **Custom Text** and **Custom Dropdown**, which the frame draws as rows of their own. Rundesk holds 22. **~~Formula~~ ~~Tasks~~ ~~Signature~~ built in `0158`** — closed by `custom-field-types.mjs`, **32 checks, and all 32 break-tested** — baseline 32/32 green, every patch reddening the check it names. **The remaining 10 are not a build and are recorded as such:** eight need a language model — Summary, Custom Text, Custom Dropdown, Progress Updates, Translation, Sentiment, Categorize, Action Items, and the picker's own **AI Fields** group names the first three — and `ANTHROPIC_API_KEY` is empty here and in CI; **Relationship** would be a second store for what `task_doc_links` already holds; **Button** stores no value at all, and `AutomationsService` has no manual trigger, so the only thing buildable today is a button wired to nothing. ~~Files~~ and ~~Voting~~ built in `0145` |
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
| M | "Comment ▾" split button; "Create Task ▾" split button |
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
| M | "Form" absent from the create menu though the module exists |
| B | Create-a-Space: icon+name, description, **Default permission**, Make Private |
| B | Space dialog footer "Use Templates" — closed by `space-wizard.mjs`, 23 checks (frame `06:52`) |
| B | Space wizard: 4 presets, default views, statuses, ClickApps grid, per-space gating |
| B | ClickApps — gated by PLAN, server-side as well as client-side; 3 dead labels removed |
| B | "Default View Templates" tab — closed by `space-wizard.mjs`, 23 checks (frame `07:06`). The check that covers it had to be rewritten before it meant anything: it pressed the Marketing card, which the panel had already correctly disabled as "Applied" because step two had chosen the Marketing workflow — and had the press landed, the state it asserted was already true beforehand, so **it could not have failed for any build**. It now presses Project, then Marketing, and verifies **every** switch the panel draws rather than two |
| P | View types — 6 of 11. Table already existed; the wizard now labels Team correctly (it rendered as "List"). Map / Mind Map / Timeline deliberately NOT offered — a view you can tick but not render is a stored value no reader honours. Activity and Workload remain buildable |
| M | **Copy configuration from another space** ("from: `<Space>` · Hide · Apply") |
| B | "+" on a space opens the 8-item Create menu, from one shared list both it and the quick-create tabs import |
| P | Create Folder — **private toggle and Use-Templates footer closed** by `folder-dialog.mjs`, 13 checks (frame `08:32`). Still open: **description**, and it is blocked rather than pending — `folders` has no such column and `FoldersService` whitelists `{name, color}` on create, so a description typed here would have nowhere to go. Left absent on purpose: a field that stores into nothing is the mirror defect, and the frames are not worth a column that lies |
| M | Folder "Use Space statuses" inheritance |
| B | Skeletons on load; sidebar hierarchy; breadcrumb |
| B | Error toasts bottom-left; **list names unique per project**; both create paths report failure |
| B | **Delete → trash + Undo + Ctrl+Z** |
| B | Board view: status lanes, colours, counts, per-lane add, drag between lanes, + Add group |
| B | **Team view** — a view type, ungated; rows per person with their own load |
| B | Paywall that teaches — at the two sites she names, Team view `09:26` and board export `10:42`. List export stays free, and a check asserts it. Refused server-side, not just hidden |
| M | Plan-tier paywall UI; "uses have expired" metered state |
| B | Calendar view, Gantt (today line, zoom, drag, critical path) |
| B | Gantt: Auto fit, week numbers, collapsible panels, local export |
| M | Create-modal placeholder "Add description, or write with ⚡AI" |
| B | Customize view: Autosave, Pin, Private, Protected, Set default, Copy link, Sharing |
| B\* | **Customize: Stack fields, Show empty fields, Collapse empty columns** — board switches, each read by the grid. `list-customize` 29 |
| M | Customize on the LIST view — frame `11:00` puts a DIFFERENT trio in that same place: Show task locations · Show subtask parent names · Show closed tasks. Two are absent from the tree entirely; the third exists as the toolbar's Closed chip and not in this panel |
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
| M | The ten named importers; spreadsheet/document import |
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
| M | **Conferencing / Zoom** connect row |
| B | Settings footer: What's new · Report a problem · Feature requests |
| B | **View selector Day / 4 days / Week / Month** + shortcuts `d x w m` |
| B | Show weekends; event style; default duration; colour tasks by; start week on |
| M | Appearance: Grid size |
| B | Timezone — the control the validated server support was missing |
| B | Sidebar page: show/hide rail sections |
| P | Sidebar: **drag-reorder closed** by `sidebar-reorder.mjs`, 21 checks; `+ Add a new section` still open (it is on Calendar settings › Sidebar, over the planner rail, not on the tree). `projects.position` had existed since the table did with neither end attached — `updateProject` left it out of its whitelist and `getProjectsBySpace` had no `ORDER BY` at all, so the tree drew whatever the query plan produced, which changes as rows are updated and after a vacuum. A column with no writer and no reader is the mirror defect with the mirror missing too |
| B | **Upcoming meeting page** — time left, quick-join, and desktop notification |
| B | Time blocking + the five settings that were STORED AND READ BY NOTHING — showWeekNumbers, alwaysOpenAtStartOfWeek, darkenNonWorkingHours, savePersonalEventsQuickly, showRecurring — each now has a reader that changes the grid |
| B | `showOverdue` — now read by the backlog |
| B | `showAssigned` — given a control and a reader |
| B | Default list for new tasks; timeblock prefix; quarter-hour snapping |
| B | Task menu: Copy link/ID/New tab, Merge, Convert, Description history, Print, Send email, Duplicate, Move, Follow, Remind, Task type, Templates, Sharing, Delete |
| B | Favorite in the task menu (same hook as the star) |
| B | Archive in the task menu — and named honestly for the first time |
| B | A PERMANENT delete for a task — `deletedAt` into the same Trash the other entities use, restorable there, purged by the same cron after the same 30 days. Archive is never purged. An archived task must NOT appear in the Trash, and that check was impossible to satisfy before |
| M | "Add to ›" (a task in more than one list) |
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
| P | Apps — Box, Confluence, Jira, Gmail, SharePoint, Outlook Mail absent |
| B | "Suggest an app" (the `+` is inside the glyph, not a literal prefix) and the "Connect Custom MCP Servers" banner — closed by `app-catalogue.mjs`, 25 checks (frame `19:07`). Both are live controls that record a real request. The MCP **capability** is recorded as a decision, not built: no AI tool in this product reaches outside the workspace, so registering a server would store a value no reader honours |
| B | Activity log — Status and My-runs filters, both reaching the server. `userId` had been accepted by the endpoint and sent by nothing; Status needed a column AND a failure-recording path, because `recordUsage` only ever fired on success |
| B | Teams Hub reachable by a plain member; All Teams / All People / Org Chart; My Teams; search; org-chart empty state |
| B | Teams empty-state headline; **Browse People / Create Team** buttons; two explainer cards |
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

**174 rows: 104 built · 20 partial · 50 missing.**

THIS LINE READ `88 built · 21 partial · 64 missing` UNTIL 21 SEPTEMBER, and the
table under it read 104 / 20 / 49. Both summed to 173, so nothing looked wrong
at a glance and the disagreement survived several passes: the total had been
carried forward when §5's forty-one rows were recovered, and the split had not.
The table is the derivation — it shows where every row comes from — so the table
is what this line now repeats. Recorded rather than quietly corrected, because a
count is the one thing in this file that gets quoted without being checked, and
the next person to find two numbers should know which one moved.

How that is made up, so the number can be checked rather than believed:

| | B | P | M | total |
| --- | --- | --- | --- | --- |
| §2, the sections table | 79 | 12 | 42 | 133 |
| §5, recovered from the frame observations | 31 | 4 | 6 | 41 |
| §6, corrections applied to the above | −6 | +4 | +2 | 0 |
| **consolidated** | **104** | **20** | **50** | **174** |

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

**41 rows recovered: 15 built · 5 partial · 21 missing.**

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

**Recovered rows: 17** — **B 11 · P 1 · M 5**

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

**15 recovered rows — 4 B · 2 P · 9 M.**

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
- rundesk today: two static cards.
  `apps/web/src/pages/workspace-teams-page.tsx:307-338` maps a literal
  `[{id:'hub'…},{id:'management'…}]` into a `sm:grid-cols-2` grid — no third
  card, no pager, no `data-index`. The tab strip (`:197-220`) carries no count
  badge on People.
- status: M
- defect class: none
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
  way, unreachable the other, and nothing on screen to say so. The cycler now
  reads `ALL_VIEWS`, which takes the keys from five copies down to four
  (`space-presets.ts` is the source of truth; `lib/space-views.ts` and
  `ALL_VIEWS` are the others).

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

**Recovered rows: 9** — B 0 · P 2 · M 7.

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
| `gantt-controls` | 12 | 12 |
| `paywall-sites` | 10 | 10 |
| `template-center` | 10 | 9 |
| `ai-model-picker` | 8 | 8 |
| `clickapps-plan-gating` | 8 | 8 |
| `list-view-controls` | 8 | 8 |
| `integration-error-card` | 7 | 7 |
| …and the rest of the session's suites | | all |

The one that did not: a `template-center` patch that does not compile. A patch
that cannot build proves nothing about the check it was aimed at, and is
counted as unproven rather than quietly folded into the total.

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
