# video1 — re-audited from the frames and the transcript, 27 Aug 2026

Second pass over the 7 Aug walkthrough against `f327369`, reading the frame
audit and the transcript **side by side**: the transcript says what she asked
for, the frames show the screen she was pointing at while she asked. Neither is
sufficient alone — several of her asks are a sentence long and a whole panel
wide.

The original `video1-rundesk-gap-audit.md` is now history: what the first pass
found, and why. **This is the status.** A status column nobody trusts is worse
than none, because it gets quoted.

- **Transcript** — `6941a270-video1___Roman_Urdu.txt`, 24:05
- **Frames** — `video1-frame-audit-raw.json`, 15 groups, **157 discrete gaps**
- **Verified on** `https://rundesk.theaura.agency`, 27 Aug, against the
  deployed instance — **452 checks, 0 failed**:

  | | checks |
  |---|---|
  | `verify-ui.mjs` — the surfaces that existed before today, unchanged | 186 |
  | `verify-release.sh` — migrations applied, then every feature exercised over the live API | 130 |
  | `syncup-live.mjs` — two browsers on one call, media crossing, recording reaching R2 | 33 |
  | `chat-message-actions` · `task-depth` · `panel-collapse` · `settings-depth` · `person-panel` | 25 · 23 · 13 · 19 · 19 |
  | `verify-email.sh` — SMTP, on the production sender | 4 |

  `drizzle-kit migrate` applied 0114–0118 on the deployed database, and the
  tables, columns and enum values are each asserted rather than inferred from a
  successful-looking deploy.

**All 157 are closed, and live.** The last one, #33 "AI Agents", was closed by
reading rather than by building; see below.

### #33 AI Agents — answered by Skills

The frame audit flagged an "Agents" control in ClickUp's view headers and asked
whether we were missing the third leg of a three-product AI story. Read beside
the transcript, we were not:

> `[04:44]` "Ab AI — in ki CHATS hain, AI AGENTS hain, aur BRAIN hai."
> `[04:51]` "**Unhon ne** teen apne software launch kiye hain; main teenon ke
> baare mein aap ko explain karoongi."

That is narration about ClickUp's lineup — *they* launched three — and she
pivots to Rundesk at `[04:58]`. What she asks of **us** she writes down herself,
in her own numbered list:

> "15. **SKILLS (AI agent)** — apna agent banana jo aap ki jagah kaam kare;
> skill create, MEMORY (baat-cheet store), CONNECTIONS (kisi bhi system se
> connect)."

She equates the agent with Skills, and names memory and connections as its two
parts. Both exist — `skill_memories` and `skill_connections` in
`packages/db/src/schema/skills.ts` — alongside the hub, templates, the Miner,
and AI-authored skills behind an approve-before-create gate. The same reading
holds at `[17:46]`, where "woh aap ka AGENT kar sakta hai" is said *about a
Skill*.

Building a separate Agents product would also reverse a decision this codebase
states out loud (`§A6.6` — "there are no agents: the AI surface is an
assistant"). Confirmed with the client before closing rather than decided here.

The frame audit had this one marked `explicitly_flagged_missing: false`, which
was the clue.

---|---|---|
| 33 | **AI Agents** — a separate product from Skills, which we did build | `04:44` |

> **On the count.** An earlier header here read "139 of 157 closed, 18 open"
> while the list below it enumerated 21 items. I have not been able to
> reconcile those two numbers, so this section no longer quotes a derived
> total — it names what is open. Every other gap in the frame audit has either
> a line in the shipped table below or a verdict with a file and a line behind
> it. A total nobody can check is exactly the "status column nobody trusts"
> this document opens by warning about.

*Kept current as work lands — see the shipped list at the bottom for what moved
and when.*

---

## The four that matter most

Ranked by how long she spent on them and how visible the absence is.

### 1. The person profile panel — **closed 27 Aug**

A full minute on one panel, and six of the 157 gaps lived here (#36, 37, 38,
40, 41, 42).

> "Yeh meri PROFILE hai; yeh mujhe show karti hai ke meri ACTIVITY kya hai, meri
> EMAIL kya hai, mera TIME ZONE kya chal raha hai, main kis ki TEAM MEMBER hoon
> … meri PRIORITIES kya hain … COMMENTS … CALENDAR … aur yahan mujhe
> ORGANIZATION CHART show ho jayega"

`app-profile-page.tsx` is an account-settings form — password, sessions, 2FA,
danger zone. Same word, different page, and a full-page navigation that loses
your place. It is now called **Account settings**, and the panel she described
is a separate thing that overlays whatever page you are on.

Most of this was not missing so much as unreachable *by person*:

- **#36 the panel.** 460px, over any page, at **any width**. The nearest thing
  before was a card in the chat page that opened only by clicking a message
  author and was `hidden xl:flex` — it did not exist below 1280px, so on a 13"
  laptop clicking a name did nothing. That card is gone; this replaced it,
  everywhere a name appears.
- **#37 local time.** `users.timezone` was stored and used server-side for
  quiet hours, and the roster read did not select it. One column, and now a
  live clock in *their* zone — "Asia/Karachi" is a fact about configuration,
  "5:28 pm" is the one you wanted.
- **#38 Priorities.** New, and the only part of that panel that is a decision
  rather than a derivation. A priority points at a task or is a line you typed,
  ordered by hand, ticked off rather than deleted. Not cleared at midnight:
  "today's" is what it is for, not a retention policy.
- **#40 the org chart**, as *this person's* reporting line — manager above,
  reports below, each opening their own panel. "No manager" renders as an
  answer. The full tree is still in Workspace Settings, where it belongs.
- **#41 a calendar** for the person: their dated tasks and the meetings they
  are in, merged into one list by time. Google/Outlook sync already writes into
  those tables, so a synced calendar appears here for free.
- **#42 activity, by actor** — queryable by task, by project and workspace-wide
  before this, and never by who did it. With the search box the frames show.

### 2. Task creation — **closed 27 Aug**

> "jab task banate hain to pehle task ke baad woh DOCUMENT ka poochta hai, phir
> REMINDER ka, phir WHITEBOARD ka, phir DASHBOARD ka"

**#149** — the quick-create modal now opens on Task / Doc / **Reminder /
Whiteboard / Dashboard**, in the order she named them, then List / Folder /
Project / Space. All three were whole features reachable only by first
navigating to the page that owns them. The Reminder tab is only possible
because 0115 made a reminder's subject optional: you are creating one, not
annotating something that already exists.

> "main SLASH click karoongi, phir table bana loon, banners rakhoon … jis tarah
> document ko aap design karte hain, exactly wohi same feature hai"

**#148** — `/` in the task description opens a block menu: heading, three kinds
of list, quote, code, **table**, divider, **banner** and warning banner.

The description stores markdown and Docs stores tiptap HTML. Rather than
migrate every existing description into a different editor to get one menu, the
menu writes markdown — and the renderer learned GFM tables and `:::note`
callouts to receive it. A table is only a table when a delimiter row follows the
header, so "ship it | or don't" stays a sentence.

**#147 was not a naming mismatch** — see the correction below. Tags could not
reach a task at all. There is now a tag box on the task sheet: type to filter,
press Enter to create what does not exist, click a badge's × to take it off.
The create endpoint became idempotent and case-insensitive, because
type-and-Enter hits the same name constantly and the unique index made the
second time a 500.

Everything else in that stretch was already built: space → list, private at
creation, view choice, assign, **start/due with times**, priority, estimate,
dependencies (own tab), subtasks, checklist.

> **Correction, 27 Aug.** An earlier version of this section called #147 a
> naming mismatch — "she says TAGS, we ship labels, same behaviour". That was
> wrong, and wrong in the direction that matters: the behaviour does not exist.
> The backend is complete (`labels`, `task_label_assignments`, `POST`/`DELETE
> /tasks/:taskId/labels/:labelId`) and `task-detail-sheet.tsx:870` renders the
> badges — but **no component in the web app ever calls those endpoints**.
> Grep `/labels/` across `apps/web/src` and the only hits are the rename and
> delete in Workspace Settings. Tags are write-only from a settings screen and
> can never reach a task. The frame audit had this right and flagged it
> `explicitly_flagged_missing`; I read the schema, saw a working feature, and
> did not check who called it.

### 3. "Double navigation" — **closed 27 Aug**

> "yeh DOUBLE NAVIGATION rakhi hui hai … kyunke yeh SPACE leta hai, aur jab hum
> kaam kar rahe hote hain to it's kind of frustrating"

The **workspace sidebar** collapses to icons — shipped earlier and verified
live (288px → 72px, dock survives, state persists per user), with `Ctrl`/`⌘` +
`\` since.

**#79** — the second-level panel now collapses too, which is where the cost
actually fell. Chat's channel list goes 272px → a 56px rail of channel icons
with unread dots; the docs tree goes 240px → a 48px strip. A rail rather than
nothing, because hiding the list entirely makes every channel switch cost an
expand and a re-collapse, which is how a collapse control ends up unused.

Stored on the person, not the browser — `users.panels_collapsed`, one jsonb
keyed by surface, so collapsing the channel list says nothing about the docs
tree. Verified by signing a second browser context in and watching it open
collapsed.

### 4. Chat message actions — **closed 27 Aug**

Built already: the full emoji library, reply-into-thread, forward **with
provenance**, save → surfaces in Later, copy link, mark unread.

All five of the open ones shipped together, because they are one surface:

- **#104 "Assign" now assigns.** It used to append `<@id>` to the composer —
  a mention, not an assignment: nobody was asked, nothing was tracked, nothing
  said so afterwards. There is now a `chat_message_assignments` row, a chip on
  the message, a notification to the assignee, an "assigned to me" list, and a
  tick that marks it done. Deliberately **not** a task: creating a task is the
  button next to it, and it moves the work away from the thread that explains
  it.
- **#106 the bar ends in `⋯`.** It showed up to twelve icons with a
  three-item menu hidden behind right-click — the crowded surface in front of
  everyone, the short one behind a gesture nobody tries.
- **#99 a reminder can hang off a message.** This needed schema:
  `reminders.task_id` was `NOT NULL`, so a reminder could only be about a task.
  It is nullable now, with a `message_id` beside it and a CHECK that at most one
  is set. `/remind in 2 hours call Ali` no longer invents a task to hold its own
  text — which also means it works in a workspace that has no list yet.
- **#116 one thread can be muted or followed.** Muting was channel-wide, which
  is the wrong size: silencing a channel to escape one thread also silences what
  you are there for. The per-thread answer wins in both directions — muted beats
  a channel set to *all*, following beats a channel set to *none* — and a direct
  `@mention` still reaches you either way.
- **#107 an empty channel offers something to do.** Add people, Track tasks,
  Add a doc, Start a SyncUp; a DM gets Calendar and SyncUp. **"Import from
  Slack" is in the frames and is not here** — no Slack import exists anywhere
  in this codebase, and a card that opens nothing is worse than an absent one.

---

## Three verdicts of mine that were wrong

Kept in, rather than quietly fixed, because a status document's only value is
that its verdicts can be trusted — and the way to earn that is to show what it
got wrong and why.

**#50 keyboard shortcuts — reported missing, was built.** Built and mounted at
`app.tsx:159`, simply not reachable from the avatar menu where she looked. A
menu entry, not a feature.

**Archived search — reported API-only, was fully built.** State, query
parameter, saved-search persistence and a filter chip in the palette. The check
grepped case-sensitively for `archived` and missed `includeArchived`.

**#147 tags — reported as a naming mismatch, was entirely missing.** The worst
of the three, because it was wrong in the direction that hides work: I read the
schema, saw `labels` and `task_label_assignments` and working endpoints, and
concluded the feature existed under a different word. Nothing in the web app
ever called those endpoints. The full correction is in §2 above.

The pattern in all three is the same: I checked whether the *parts* existed and
not whether anything joined them up. A grep for a table proves a table. It
proves nothing about whether a person can reach it, which is the only question
this document is actually asking.

---

## What closed since the first pass

The large groups are done, and most are verified against the deployed instance
rather than the diff:

- **Skills** (G13, 12 gaps) — hub, templates, Miner, AI-authored with an
  approve-before-create gate, memory, connections, auto-named persisted chats
- **Meetings / SyncUp** (G14, 15 gaps) — including a **real two-browser call on
  production**: connected peer connection, both tiles painting the other
  person's video, recording announced to everyone, browser upload to storage
  proven end to end
- **Inbox** (G10, 13 gaps) — All / Primary / Later, Other removed, 18
  customisable kinds, Clear all, 30-day retention with a visible clock
- **Navigation** (G09) — sidebar collapse, icon rail, persisted per user
- **Workspace creation** (G08) — open to members, stepped wizard, purpose step,
  answers persisted, seeded on create
- **Loading** (G01) — skeletons, pre-boot splash, router pending component,
  route progress bar
- **Search** (G02/G03) — type chips that select and unselect, ⋯ overflow,
  Location, folders as an entity type, created-date range, Drive results,
  task-type filter

---

## Shipped since this audit

| when | gap | what landed |
|---|---|---|
| 27 Aug | #50 keyboard shortcuts | menu entry; the overlay was already built and only openable with `?` |
| 27 Aug | #51 download app | install offer in the menu, rendered only where the browser can actually install |
| 27 Aug | #76 sidebar shortcut | `Ctrl`/`⌘` + `\`, in the tooltips and the shortcuts list |
| 27 Aug | #15 decline invite | new `declined` status, no login required, idempotent |
| 27 Aug | #10 recent searches | per workspace, in the browser, recorded once a search has answered |
| 27 Aug | #72 workspace switcher | search box, per-workspace avatars, unread dot |
| 27 Aug | #104 assign a message | a real assignment with a chip, a notification, an "assigned to me" list and a done tick — not a mention in the composer |
| 27 Aug | #106 `⋯` overflow | the long tail moved off the bar; right-click is no longer the smaller menu |
| 27 Aug | #99 reminder on a message | `reminders.task_id` became nullable with a `message_id` beside it; `/remind` stopped inventing tasks |
| 27 Aug | #116 per-thread mute/follow | `chat_thread_follows`; beats the channel setting both ways, `@mention` still gets through |
| 27 Aug | #107 empty-channel cards | Add people / Track tasks / Add a doc / Start a SyncUp — Slack import deliberately omitted |
| 27 Aug | #147 tags on a task | the endpoints shipped long ago and nothing ever called them; now a type-and-Enter box, and an idempotent create |
| 27 Aug | #148 slash editor | `/` in the description: table, banner, code, lists — writing markdown, with the renderer taught tables and callouts |
| 27 Aug | #149 create-modal tabs | Reminder / Whiteboard / Dashboard, in the order she named them |
| 27 Aug | #79 second-level collapse | chat 272px → 56px rail, docs 240px → 48px strip; per surface, per person |
| 27 Aug | #48 custom status | emoji + sentence + duration, expiring on read so a stale "Busy" cannot outlive its reason |
| 27 Aug | #49 timed mute | 30m / 1h / 2h / 8h; the record still arrives, only the interruption is held |
| 27 Aug | #54 high contrast | one class on `<html>`, tokens redefined under it; colours only, nothing moves |
| 27 Aug | #56 Help books a call | a support ticket of kind `call` with offered times — no invented availability |
| 27 Aug | #36 person profile panel | 460px over any page, at any width; replaced a chat card that did not render below 1280px |
| 27 Aug | #37 local time | `users.timezone` reaches the client at last, as a live clock in their zone |
| 27 Aug | #38 Priorities | a hand-ordered daily shortlist — a task or a typed line; the one thing on that panel that is a decision |
| 27 Aug | #40 org chart on a person | manager above, reports below, each opening their own panel; "No manager" is an answer |
| 27 Aug | #41 person calendar | their dated tasks and their meetings, merged by time |
| 27 Aug | #42 activity by actor | the axis the activity log never had |

---

## Method, and its limits

Each of the 157 gap titles was checked against the current code, and every
verdict here resolves to a file and a line rather than a commit message.

Two limits worth stating plainly.

**This does not look for a 158th gap.** It re-verifies the 157 the frame audit
found; it does not re-watch the video for asks that audit missed. — *That limit
has since been lifted; see the third pass below, which went looking and found
two.*

**"Shipped" means live, and checked there.** Every row in the shipped table was
driven against the deployed instance, not only against a laptop — the 452
figure at the top is that run. Two edges are worth knowing. The R2 upload check
only ever runs on production, because CI has no object storage and says `SKIP`
rather than passing. And `verify-email.sh` proves SMTP accepted the message,
not that anybody received it; that still wants a real mailbox.

**A check that compares nothing is not a passing check.** Two of mine did
exactly that and reached production before anyone noticed. One summed every
digit in the payload — including the ones inside a workspace UUID — and had
passed an earlier release only because the map it read happened to be empty.
The other pointed at a task id that was really a deleted task type. Where a
check now cannot compare, it says `SKIP` and names what it did not look at.

---

## Third pass — exercised, not inspected (27 Aug)

The two passes above answered "does this exist?". This one answers "does it
work?", which turns out to be a different question: every control named in the
transcript was **driven** against a real browser on the real stack, and every
result read back off the API rather than off the screen.

It found **two gaps the frame audit could not have found**, because in both
cases the thing was present and looked right.

### #158 — the deadline could not have a time on it

> `[21:36–23:38]` "START date aur DUE date dono set kar sakte ho — TIME ke
> saath."

`start_date` and `due_date` are `timestamp with time zone`. The API parsed and
stored a time perfectly well. Both controls were `<input type="date">`.

What made it a defect rather than a missing feature is what that did to a time
already on the row — this is the probe output, unedited:

```
WORKS the API stores a due time — 2026-09-15T17:30:00.000Z
NOTE  the control shows "2026-09-15" for a task due 17:30
NOTE  after a UI date edit: 2026-09-16T00:00:00.000Z
GAP   a due/start date cannot carry a time in the UI, and editing the date
      throws away a time the row was holding
```

Moving a deadline one day forward silently destroyed 17:30. Nothing errored;
the field simply could not represent what it was holding, so it overwrote it.

**Closed.** Both fields are `datetime-local` now. The pickers that stay coarse
on purpose — the list row, the subtask line, where a full datetime control
would be wider than the row it sits in — change the day and leave the clock
alone, via `withDatePart` in `apps/web/src/lib/task-dates.ts`.

The timezone rule is the part worth reading before touching it. Every row
written before this is UTC midnight, because that is what `new Date('2026-09-16')`
parses to; translated literally into local terms the whole estate would appear
to shift by a day. So a value with no time in it is shown as the day it was
picked, and only a value carrying a real time is converted. The rule is stable
in both directions, and the suite proves it from **UTC+14 to UTC−11**, because
in UTC alone both branches coincide and every one of these tests would pass
while being wrong.

### #159 — no speaker

> `[19:46]` "aur yahan SPEAKER ka option hai."

The pre-join offered a microphone and a camera. `setSinkId`, `audiooutput` and
`audioOutput` returned zero hits across `apps/web/src`. Output was the one
device choice you cannot correct once the call has started: a wrong camera is
something you can see, a wrong speaker means silence and asking whether anyone
is there.

**Closed.** Outputs are enumerated from the same call that already lists mics
and cameras, offered beside them, carried through Join, and applied with
`setSinkId` on the tiles the call's audio actually comes out of. Gated on
support — Firefox keeps `setSinkId` behind a pref and Safari has never shipped
it — because a picker that changed nothing would be worse than the gap it
replaced: you would choose your headphones, hear nothing, and have no reason to
suspect the control was decorative.

### Everything else exercised, and working

Trash and the 30-day bin (restore, delete forever, retention stated, and the
restored task back in its list); task types end to end including a search
filter that actually discriminates; priorities (task lines, typed lines,
ticking off, reordering); tags, dependencies, subtasks, checklists, assignment,
priority, estimate, the `/` block menu and its ten blocks; `?task=<id>` deep
links; threaded replies and the unread map.

### Eleven verdicts of mine that were wrong, and how

Worth recording, because they are all one mistake wearing different hats:
**reading a surface instead of driving it.**

| I claimed | Actually |
|---|---|
| No Restore in the bin | Behind an icon-only `⋯` trigger; I read `innerText` and got `""` |
| Five search filters broken | Search returns mixed types; the filters bite on tasks and the rest backfills |
| No task-type search filter | Compared `task-<uuid>` against `<uuid>` |
| No call background picker | `call-prejoin-backgrounds`, present all along |
| Five in-call controls missing | Labels live in `title`, not `innerText` |
| Followers Add doesn't work | Correctly disabled until something is selected |
| Google Drive integration absent | Wrong route |
| `?task=` deep link is inert | Consumed at line 1293 via `URLSearchParams`, which my `useSearch` grep missed |
| Estimate doesn't persist | A synthetic `blur` Event; React listens on `focusout` |
| Dependencies/checklists store nothing | Wrong body param and wrong route — `relatedTaskId`, and items hang off the task |
| A binned task is still editable | True at the API, but no UI path reaches it and the deep link does not open it |

The two that survived did so because the probe compared a **before and an
after** rather than looking for a word: store 17:30, edit the day, read it back.
That is the shape a check has to have to be worth running.

### What now guards them

| | checks |
|---|---|
| `task-dates.test.ts` — the losing cases, in five timezones | 9 |
| `call-wiring.test.ts` — enumerate, offer, carry, apply | 24 (5 new) |
| `task-depth.mjs` — a time typed in the sheet, stored as that instant; and a binned task refusing writes | 36 (13 new) |
| `syncup-live.mjs` — a speaker offered beside the mic and camera | 30 (2 new) |

The two call checks are conditional on the browser having routable outputs, and
say so out loud when it does not — a run that never checked is not a run that
passed.

---

## The two the third pass left open (27 Aug)

Both were named as loose ends rather than fixed at the time. Both are closed now.

### A task in the bin was still writable

The third pass found this and recorded it honestly as narrow: `PATCH /tasks/:id`
answered 200 and `POST /tasks/:id/comments` answered 201 on a task in the bin,
but no UI path reaches such a task and the deep link will not open it.

Narrow is not the same as harmless, and the shape of who is left is the reason.
Deleting is a soft delete — `isArchived` — and every *read* path filtered on it
while the write paths never did. So the only callers who could still write were
the ones holding an id from before the delete: a stale tab, a queued request, an
integration, a script. That is exactly the population that cannot see the bin,
which is what makes a silent 200 the wrong answer — the write appears to
succeed, and then the row is purged out from under it thirty days later along
with whatever was written to it.

`assertTaskWriteAccess` now reads `isArchived` and refuses, and the two
operations that exist *for* binned tasks — restore, and delete — opt out
explicitly. `createComment` has no write gate at all by design (commenting is
open to any member who can see the task), so it carries the check directly.

**409, not 404.** The task is really there and the caller may well be entitled
to it; what is wrong is its state, and "restore it before editing" is something
they can act on. A 404 would say the opposite of what is true.

Eight checks in `task-depth.mjs` cover it, and half of them are the ones that
would catch an over-correction: a live task still edits and still takes
comments, restore still works, a restored task edits again, and deleting an
already-binned task is still not an error.

### Four suites that could not run anywhere

`ui-sweep`, `video-regression`, `a39-dm-tabs` and `a61-meeting-record` imported
playwright as a bare specifier while their siblings searched several known
locations. The difference is invisible until the package is not in the repo's
own `node_modules`, at which point half the suites run and half die on module
resolution — and `NODE_PATH` does not help, because it has no effect on ESM
bare-specifier resolution.

The search now lives once, in `test/e2e/lib/playwright.mjs`, and those four use
it. Two of them additionally hardcoded the production verify user and a dev
port, so they could only ever run in one place; they now take the same `BASE` /
`E2E_EMAIL` / `E2E_PASSWORD` overrides their siblings already took, with the
previous values as defaults.

Measured rather than asserted: `ui-sweep` went from dying on import to 14
passed / 9 failed — **the same 14/9 as the parent commit**, so the failures are
this machine's unseeded workspace and not the change. `video-regression` went
from 0 to 26 passed, and the other two from 0 to running.

Those nine, and `video-regression`'s four, were still unverified rather than
fixed at that point — see below.

---

## The four are in CI now (27 Aug)

Making them *run* was half the job; the other half was that none of them could
pass against a database anybody else has. Each hardcoded some mixture of a dev
server on `:5173`, one workspace's UUID, and a colleague literally called
"Colleague". Pointed at a freshly seeded database they swept an empty shell —
"Title vanished: []" is what a grid with no rows looks like from outside — and
failed for reasons that had nothing to do with the UI.

They now serve the built dist themselves through `startLocalStack` (the same
helper the newer suites use, which also proxies the socket upgrade — without it
the page cannot open a realtime connection and the console-health check fails
on errors that say nothing about the product), discover a workspace, and create
the little they need before reading it back. `test/e2e/lib/fixture.mjs` states
that minimum rather than assuming it: tasks spread across the statuses the list
actually has and across priorities, some assigned and some not, a DM, a task
and a meeting the two people share, and — where a second account can be
borrowed — one notification, because "Clear all" only renders when there is
something to clear.

`E2E_WS` / `E2E_LIST_PATH` / `BASE` still win, so a run against a real
deployment points where it is pointed and creates nothing.

### What being out of CI had cost

Three of them had quietly gone stale against decisions we shipped, and were
failing for the correct behaviour:

| Asserted | Reality |
|---|---|
| The Inbox "Other" chip is present (twice) | §2.2 removed it on her instruction |
| "Mark all read" | §2.5 made it "Clear all", with a retention clock |
| The language switcher sits by the work schedule | §1.5 moved it to Preferences → Language & Region |
| All seven type chips are on the palette bar | §2 [02:01] put the non-everyday ones behind the ⋯ |
| Trash shows the words "Restore" or "empty" | Restore is inside the row's ⋯; the empty state reads "Nothing in the trash." |

Each is now inverted or re-aimed at what the product actually does, so they
guard those decisions instead of contradicting them. One was a plain bug in the
suite: the fields-picker search seeded `SweepAlpha<tag>` and `SweepBeta<tag>`
and then searched the last four characters — the one substring guaranteed not
to discriminate.

### Measured

| | before | after |
|---|---|---|
| `ui-sweep` | died on import | **107 passed, 0 failed** |
| `video-regression` | died on import | **71 passed, 0 failed** |
| `a39-dm-tabs` | died on import | **19 passed, 0 failed** |
| `a61-meeting-record` | died on import | **12 passed, 0 failed** |

209 checks, run twice against a database built the way CI builds one — `push`
from the TypeScript schema, then `seed.ts` — once pristine and once again on
top of itself, because a suite that only passes on a clean database fails every
re-run. The other nine harness suites were re-run alongside them and are
unchanged.

---

## Fourth pass — the transcript against the frames, line by line (28 Aug)

The three earlier passes worked from the frame audit's 157 gap *titles*. This
one read all 534 lines of the transcript and, for each candidate, went back to
the frame audit's own entry for that moment — the `on_screen` text, the `ask`,
and the `why`. That combination is what the earlier passes did not do, and it
found things a title alone hides.

### Gaps recorded closed that were only partly built

The frame audit's own G15 gap #4 is titled **"Task description has no
slash-command editor (no table, banner, image or embed)"**. Batch 3 built the
table and the banner. The image was never built, and the gap was marked closed
— so the status above said "all 157 closed" while a quarter of one of them was
outstanding. Two more in the same group are in the same state:

| G15 | recorded | actually |
|---|---|---|
| #4 description editor | closed | table ✓ banner ✓ **image ✗** |
| #6 list private at creation | closed | list-from-task-flow ✓ **private ✗** |
| #13 dead start-date state | closed | **still dead** |

Not fixed here, and named so nobody assumes otherwise: #7 (a list-settings step
after creation), #9 (natural-language date presets), #12 (template/attach/notify
in the create footer). She does not ask for any of those in the transcript —
#7 she is offered and declines on camera ("main filhaal 'no thanks'") — so they
are ClickUp's surface, not her spec.

### #162 — an image could not go in a description

> `[22:48]` "Main yahan pe koi aur image embed kar sakti hoon … jis tarah
> document ko aap design karte hain, exactly wohi same feature hai."

Measured in a browser before the fix, both ways somebody would try it:

| written | rendered |
|---|---|
| `![the logo](https://…/logo.png)` | `!the logo` — no image, a stray `!` and a link |
| `![dot](data:image/png;base64,…)` | the **whole raw markdown**, base64 and all, as text |

The link branch of the inline matcher claims the `[alt](url)` that sits inside
every image, so the `!` was left stranded. The image branch now sits ahead of
it. The `data:` case was uglier only because `safeHref` rightly refuses that
scheme and the fallback printed the source.

The slash menu now offers **Image**, which asks for a file and uploads it
through the same presign path the Files tab uses — so a description image is a
real attachment, under the same size limit and the same storage-key guard.

What goes into the text is `attachment:<id>`, never the URL that comes back.
The API only ever issues **signed** storage URLs and they expire; writing one
into the description would give a picture that works in the demo and is gone a
week later, with the markdown still looking perfectly correct.

**A regression this introduced, and how it surfaced.** The first version
sanitised the source only when no resolver was present, so a resolver silently
switched the check off and a `data:` image rendered. The browser probe caught
it — the fix was written, the probe re-run, and the wrong answer was on screen.
Resolution and sanitisation are now separate steps in that order, always both.

### #163 — no way to tell whether the microphone was hearing you

> `[19:44]` "Aap ke VOICE RECORDING wali options hain — check for the high
> quality voice."

The third pass read this as audio constraints and deferred it. The frames say
otherwise, and they are specific: the pre-join's microphone row carries **"a
live input-level bar filling most of the row width underneath"**. Picking a mic
says which device is selected and nothing about whether it can hear you — which
is the thing people get wrong, and the thing worth finding out before anyone is
listening.

There is now a Web Audio meter under the mic select: peak rather than average,
because an average over a frame reads near-zero for ordinary speech and a dead
bar sends someone off to debug a working microphone. It tears down with the
stream it was built from, and a browser without Web Audio keeps its device
pickers and simply loses the bar.

### Three asks that turned out to be covered

Chased and clean, recorded so they are not chased again: access-scoped search
`[01:15]` (`taskVisibilityFilter`, `dropHiddenTaskHits`, channel scoping);
guests and viewers refused a workspace `[09:13]`
(`workspace-creation-policy.ts`, which reasons explicitly about "viewer" not
being a role this product has); and time format `[07:03]`.

### What guards it

| | checks |
|---|---|
| `task-depth.mjs` — image renders, no stray `!`, Image block, list private ×3 | 42 (6 new) |
| `syncup-live.mjs` — the meter exists AND moves with the input | 32 (2 new) |
| `call-wiring.test.ts` — peak not average, torn down, announced, degrades | 29 (5 new) |
| `markdown-blocks.test.ts` — image branch precedes the link branch | 9 new |
