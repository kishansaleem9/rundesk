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

*(An earlier version of this section deferred #7, #9 and #12 on the reasoning
that she demonstrates them in ClickUp rather than asking for them in so many
words. That reasoning was wrong and the three are built — see the section
below.)*

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

---

## The filter that was wrong (28 Aug)

The fourth pass deferred three G15 gaps with this reasoning: *she does not ask
for these in the transcript, so they are ClickUp's surface, not her spec.*

That is backwards, and it is worth writing down because it is the kind of
mistake that silently shrinks a piece of work. **The walkthrough is the
specification.** She is demonstrating ClickUp because that is the product being
replaced — every screen she steps through is a description of what Rundesk
should do. A feature she shows and does not separately narrate is still an ask.

The weakest link in that reasoning was #7, where the transcript actually argues
against me: *"main filhaal 'no thanks' kar rahi hoon, main is ko baad mein set
down karoongi."* She is declining to configure the step **in that moment**. Her
saying it at all is evidence the step exists and is expected.

All three are built. Each `why` in the frame audit said the same thing about
them, which is the recurring shape of this whole engagement: **the machinery
existed and nothing surfaced it where the decision is made.**

### #164 — the date had no presets, and recurrence was somewhere else

> frame G15 #9 — "Today / Tomorrow / This weekend / Next week / 2 weeks /
> 4 weeks aur 'Set Recurring' wahin milein"

"Due next week" was four clicks and a mental date calculation over a bare
calendar. The six presets now sit under the due date, with **Set Recurring**
beside them — recurrence already existed as a Repeat select further down the
sheet, which is not where anyone is looking while setting a deadline.

Every preset carries the time already on the row: a deadline at 17:30 moved to
"next week" is still due at 17:30. `presetToIso` takes `now` as an argument, so
the tests do not only pass on the day they are run, and "this weekend" is
checked from a Saturday and a Sunday as well as a weekday — on a Sunday the
weekend you are in has one day left, and pointing at yesterday is the only
clearly wrong answer available.

### #165 — the create dialog could not attach, notify or start from a template

> frame G15 #12 — "neeche Templates, attach aur notification (bell) ke controls"

All three existed; none was reachable from the dialog. Templates could only be
applied from the Templates page — and this modal's two footer links *navigate
away*, losing the half-filled form. Attachments and watchers were detail-sheet
only, so "create it, then go and find it again" was the only route.

A chosen template goes through the server's own `instantiate`, not by copying
fields into this form: a template carries checklists, subtasks and custom-field
values the modal has nowhere to put, and the typed title wins as an override.
A watcher that cannot be added or a file that will not upload is reported and
the task is still yours — neither is allowed to lose you the thing you made.

### #166 — a new list opened with views nobody chose

> `[22:15]` "List banne ke baad poochhe ke view kaisa chahiye — main abhi
> 'no thanks' karoon aur baad mein set kar loon"

Both create paths navigated straight into an empty list. There is now a step
after creation offering the views a list really has — List, Board, Calendar —
with **No thanks** in her own words, and the first one ticked becoming the
list's default.

It deliberately does *not* offer ClickUp's AI-generated custom fields or a
default task type: neither is a per-list thing in Rundesk, and a step listing
settings the product cannot actually apply to a list would be worse than no
step at all.

### Guarded

`task-depth.mjs` is 52 checks (10 new): the preset row and that a preset keeps
17:30, the attach and notify controls, the private option, the settings step,
its three view choices, and that "No thanks" applies nothing and still leaves
you in the list. `task-dates.test.ts` is 14 (5 new), run in four timezones.

---

## Fifth pass — the other 14 groups, with the corrected lens (28 Aug)

Applying the same reading to the rest: the walkthrough is the specification, so
a feature she steps through is an ask whether or not she narrates it. All 157
titles were re-read and the falsifiable ones checked against the code.

### #167 — a person's tasks were one undifferentiated list

> `[06:08–06:14]` "TODAY ke kya task hain, OVERDUE kaun se ho gaye the, NEXT
> kaun se upcoming task mere paas aa sakte hain, kaun si aisi cheezein jo maine
> CREATE ki hain par abhi tak maine kisi ko assign nahi kiya."

Four questions, named out loud, in order. The panel answered none of them: it
showed a single "Working on" section — up to eight assigned tasks with a date
beside each. Frame G05 #4 records this, and it was marked closed.

The profile now returns buckets: **Today**, **Overdue**, **Next**, undated work
so it cannot vanish from a panel made of date buckets, and **created but
assigned to nobody** — which is a different question from the other four and
needs its own query, since it is about what you made rather than what you hold.

"Today" is today **where they are**. The panel already shows a person's local
time for the same reason: a deadline is a fact about their day, and a colleague
eight hours away reading the panel should see the buckets that person sees.
`startOfDayIn` does that conversion, with a correction pass for the DST
changeover days when the offset at UTC midnight is not the offset at local
midnight — without it the boundary lands an hour into yesterday.

### Checked and already covered

Written down so they are not chased a third time. Several were false negatives
from a single grep, which is the failure mode this document keeps recording:

| looked missing | actually |
|---|---|
| Task type on a task row (G03 #8) | `<TaskTypeMark type={task.taskType} />` in the list route |
| Add time off from a profile (G05 #8) | 32 catalog strings; built |
| AI answer when search finds nothing (G02 #4) | built |
| **Download app** (G06 #4) | **`menu-install-app` → `promptInstall()`** — the app is a PWA, and the key is `topbar.installApp`, so the grep for "downloadApp" missed it |

### Frame-only, and not built

Two gaps have no spoken counterpart anywhere in the 534 lines: **Get StandUp**
(G05 #11) and a **"Need help?" link on the invitation screen** (G01 #6). They
come from frames of ClickUp's chrome rather than from anything she walks
through or points at. Recorded here rather than silently skipped — if either is
wanted, it is a decision to take rather than an omission to fix.

### Guarded

`person-panel.mjs` is 26 checks (7 new): each bucket holding the right seeded
task, and the one that would quietly be wrong — a task with an assignee must
not appear in the pile that is sitting on nobody. `zone.test.ts` adds 5,
including a DST changeover and an unparseable timezone falling back to UTC
rather than taking a profile page down.

---

## Are her seventeen actually built? (28 Aug)

Her own closing summary lists seventeen items. Each was mapped to a **named
check that runs**, rather than to a memory of having built it.

Fifteen mapped straight to existing checks. Two mapped to nothing at all — and
both turned out to be built, which is precisely why they needed a check:
"it works" and "we know it works" are different claims, and only the second
survives somebody editing the search filters six months from now.

| her item | state |
|---|---|
| **2 — "archived cheezein bhi search mein"** | built; **had no check**. Exercised: hidden from an ordinary search, returned by `includeArchived`. |
| **4 — Google Drive** | built; **had no check**. In the provider catalog, and `types=drive` is accepted by search. |

On Drive, one distinction the new check states out loud rather than glossing:
the provider-status endpoint reports `available: false, reason: "Missing backend
configuration: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"`. That is **built but not
credentialled** — a deployment fact, not a missing feature. The check passes
either way and prints which, so a green run never quietly implies Drive results
are flowing when no credentials are set.

Two of the mappings looked missing and were not: "Location narrows by space" and
the sidebar's `collapses 288px -> 72px` are both real checks whose labels are
template literals my extraction had mangled. Recorded because that is now the
fourth distinct time in this engagement a single grep has produced a false gap.

`verify-release.sh` is 146 checks (6 new).

---

## What the production run caught (28 Aug)

The archived-search check written a few hours earlier failed on its first real
run, and it was right to.

```
FAIL archived work shows up in an ordinary search unasked
PASS and comes back with includeArchived
```

**Deleted tasks were findable in search.** `indexTask` writes a task into
Meilisearch on create and on edit, and there is no removal path anywhere in the
codebase — no `deleteDocument`, nothing. Archiving never touched the index, so
once indexed a task stayed searchable for good.

The Postgres fallback had filtered `isArchived` all along, which is exactly why
this survived so long: **it can only happen where Meilisearch is actually
running**, and the sandbox had no Meili. The local run passed for the wrong
reason. Reproducing it meant fetching a real Meilisearch binary and pointing
the API at it — after which the failure appeared locally, identically.

Fixed by filtering archived out of the Meili hits alongside the visibility
filter that was already there. The archived rule applies **even to a manager**:
managers skip the visibility check by design, but nobody should find deleted
work by searching, and the old early return for managers skipped both rules at
once.

### And a second bug underneath it

Removing that early return surfaced one that had been sitting there:

```
{"status":400,"message":"A value has an invalid format"}   ← Postgres 22P02
```

A Meili document id is `task-<uuid>`, not a uuid. The post-filter passed those
straight into a uuid column. The old code never showed it because the early
return meant it only ran for **non**-managers — and a manager is who tends to be
looking when anyone checks by hand. So private-task filtering over Meili would
have 400'd the entire search for every ordinary member on any deployment with
Meili configured.

Both are covered now, including the case that hid it: `verify-release.sh` asks
the same search **as a non-manager** and expects a 200 rather than a 400.

**Confirmed on the deployed instance: 148 passed, 0 failed** — including the
archived line that had failed, and the non-manager search that used to 400.

The lesson worth keeping: this deployment's search behaves differently from the
sandbox's, and no amount of local green says otherwise. The check that found it
was three hours old and had passed locally twice — for the wrong reason, because
the sandbox has no Meilisearch. The bug it exposed underneath (search 400ing for
every non-manager) had been live and invisible, since the people who check by
hand are admins and admins took the early return past it.

---

## "I have no idea where tasks are going" (28 Aug)

Reported from using the product, which is the only place this kind of thing
shows up. The video has a precise answer for it.

> `[21:19]` "Ab hum aate hain **MY TASKS** pe … `[21:22]` ASSIGNED TO ME,
> TODAY, aur PERSONAL LIST — yeh basically yahan pe bhi show ho rahi thi …
> jab profile pe click karti thi to yeh task mein aata tha, to same yeh yahan
> bhi hai."

Frame G15 #11 records it and it was marked closed: *"'My Tasks' is buried
inside Home instead of being a sidebar group with its own routes."*

All three sections existed. Every one of them was a `useState` on the Home
page — `setSection('assigned-to-me')` and so on. So there was **no address for
"my tasks"**: nothing in the sidebar, nothing to bookmark, nothing to send
somebody, and nowhere to go and look after making a task. The feature was
present and the place was not.

The section now comes from the URL, and the sidebar carries **My Tasks** with
her three under it. `?section=` survives a reload and a cold link, and an
unknown value falls back to the Inbox rather than rendering nothing — a stale
bookmark should land somewhere useful.

Two consequences worth noting. Every Home section became addressable, not just
these three: Inbox, Replies and Assigned comments were state too. And the list
route now declares `?task=` explicitly, because a parent with a search schema
is entitled to drop an undeclared key on a child — the deep link that
quick-create and chat task-links both use.

### Still open: where a task goes when nobody picks a list

Separate from the above, and found while chasing it. Three surfaces create a
task without asking which list — the `/task` slash command, "create task from
message", and the AI's "create task from this". All three call a helper that
returns the **oldest non-archived list in the workspace**: sensible for code to
pick, meaningless to receive. The feedback is `toast.success('Task created from
message')` — true, and an answer to the wrong question.

Not fixed here. The right fix is probably to put those in the person's Personal
List, which is the thing ClickUp has for exactly this and which Rundesk already
has an endpoint for — but that is a product decision about where somebody
else's message becomes your work, not a bug to quietly patch.

---

## Fifth pass — the frames beside the transcript, not behind it (1 Sep)

The fourth pass read the transcript line by line and consulted the frame audit
for each moment. That is not the same as reading the frames. Asked to check
them side by side rather than trusting what she *said*, this pass found seven
things — three of which the transcript alone could not have surfaced, because
she never mentions them out loud. They are in the frames as controls sitting on
screen.

Five of the seven were **already built and had never been run by anything**.
That is its own category, distinct from the four defect classes this audit has
been tracking, and it is the most comfortable one to have: nothing to build,
and no evidence any of it works.

| | Frame | State | Now |
|---|---|---|---|
| Screen share | `[20:12]` | built, unchecked | 6 checks in `syncup-live` |
| Pre-join backgrounds | `[19:40]` | built, unchecked | 4 checks in `syncup-live` |
| In-call reactions | §2.8 | built, unchecked | 5 checks in `syncup-live` |
| Minimise to the corner | §2.8 | built, unchecked | 6 checks in `syncup-live` |
| `Ctrl/⌘ + \` sidebar | `[10:46]` | built, unchecked | 4 checks in `panel-collapse` |
| Per-message Copy link | §G11 | **not built** | built + 4 checks |
| Get StandUp | `[05:40]` | **not built** | built + 13 checks |

### What "checked" had to mean

Every one of these has a cheap check that proves nothing, and the cheap check
is the one that suggests itself first:

- Screen share reads off the **RTCPeerConnection's video sender**, not the
  button. A share that lights the control while `replaceTrack` quietly rejects
  is the failure worth catching, and the button cannot see it. Chromium's fake
  capture answers `getDisplayMedia` with a source labelled `screen:…`, so a
  camera track and a screen track are told apart by name.
- The background is read as a **computed colour**. The tint is an arbitrary
  Tailwind value, so asserting the class is on the element proves the JSX and
  passes just as happily when the rule was never generated — and it is checked
  again *after joining*, because the picker and the call are separate
  components joined by one argument.
- The reaction is looked for on the **other browser**. `sendReaction` paints
  locally before the round trip, so the sender's own screen says nothing about
  whether anybody else saw it.
- The permalink is checked by **following it in a second page**, not by
  matching its shape. A regex proving the URL looks right is satisfied just as
  well by one that lands on an empty channel.

### Every check was pressed against a broken build

Twenty-four of them, across four deliberately broken builds: the swap removed
from `toggleShare`, the emit removed from `sendReaction`, the stream withheld
from the docked video, the chosen background dropped on the way into the call,
the guard removed from the sidebar chord, the chord unhandled entirely, Copy
link made to copy the address bar, the closed-status filter dropped from the
standup's overdue query, and the summary made to fetch on open.

That pass caught **two checks of mine that could not fail**:

1. The sidebar chord was asserted against end states, and the collapse is
   persisted to the user record — so a run that started collapsed reported
   *"the chord collapsed it"* before a key was pressed, and a build with the
   handler deleted outright still went green on that line. It now resets the
   flag on the server first, reads `data-collapsed` on the one element present
   in both branches, and fails the dependent checks **by name** when the chord
   does nothing rather than letting them pass for want of a state change.
2. The standup seeded its "finished" task with **no due date**, so it could
   never land in the overdue bucket — and *"a finished task is not also
   reported as overdue"* passed identically against a build with the
   closed-status filter deleted. The fixture now carries a past due date.

Neither was found by reading the code. Both were found by breaking the thing
the check was supposed to be watching and noticing it stayed green.

### Get StandUp, and the deployments with no key

The one design decision worth recording. The standup gathers four buckets and
then writes them up, and the two steps are kept apart: `getStandup` decides
what is **true**, the model only decides how to **say** it and is handed
nothing but those rows. A summary generated from a free-text prompt would be
free to invent a task, and the person reading it — often their manager — has no
way to check and is not in the room.

"In progress" is read from the activity log **by actor** rather than from
`tasks.updatedAt`. A task is updated when anybody touches it, so an updatedAt
window reports work this person did not do.

With no `ANTHROPIC_API_KEY` the deterministic text **is** the answer, not a
placeholder apologising for one — the rule the daily briefing already follows.
That is what makes it testable on a box with no key, and it is why the panel
says which one wrote it: a reader who assumes every summary on the page came
from a model would trust a sentence differently than they should.

### Still not verifiable here

**Image upload inside a task description** needs object storage, and no sandbox
in this engagement has had R2 configured — `upload-url` answers 400, which is
also what `syncup-live` §5b reports rather than passing. It is built; it has
never been exercised end to end by me, and saying it works would be a guess.
The honest status is *unverified*, and it stays that way until it runs against
a deployment that has a bucket.

### Deployed, and the half the sandbox could not reach

`0da175f` is live. `verify-release.sh` 154/0, `verify-ui.mjs` **216 passed, 0
failed** — run twice, once with `PLAYWRIGHT_DIR` pinned to the box's own
playwright, identically green both ways.

The line worth keeping from that run:

```
PASS [§G05] and says who wrote it (model: yes)
```

Locally it reads `(model: no)`. There is no `ANTHROPIC_API_KEY` in any sandbox
used for this engagement, so every local run exercised the deterministic
formatter and **only** the deterministic formatter. The deployment has a key,
so the same check took the other branch — the model was handed the four buckets
and wrote from them, and the panel reported that it had.

Both halves of `generateStandup` are therefore exercised, in different places,
which is the whole reason the endpoint reports `generated` rather than quietly
returning prose either way. A check that only asserted "some text came back"
would have been satisfied by the fallback on both machines and would never have
told anyone whether the model path worked at all.

The §14 fix also got the case it was written for. Production holds 605 live
notifications, so §2.5 took its non-clear-all branch, §14 found real rows, and
the seeding path correctly did not fire — `the Inbox has 10 row(s) to judge`,
with no "(one seeded for this check)" annotation. Seeded only to break the
coupling between two sections, never to stand in for data that is really there.

Still unverified, unchanged: image upload in a task description. This
deployment has object storage — `§2.8f` gets a pre-signed upload URL — but
nothing here drives the description editor's own upload path, so it stays
*unverified* rather than being upgraded on the strength of a neighbouring check
that passed.

---

## Reconciliation — what "done with video 1" actually means (1 Sep)

Asked directly whether video 1 is finished, and the honest answer needs three
numbers, not one.

**The 33 she explicitly flagged.** Checked one by one against the deployed
instance and the code, not against the diff:

- **30 are closed and verified live.** The stale-chunk crash, the whole loading
  system (skeletons, `id="boot"` pre-boot shell, `defaultPendingComponent`, the
  two `Suspense fallback={null}`), task type at create and in search, the
  Location filter, language out of the top bar, nav customisation, the bell,
  pinnable personal tools and the avatar-menu launcher, workspace creation for
  members plus the stepped wizard, sidebar collapse and the icon rail,
  per-kind notification importance, the Other chip, the tabbed inbox,
  assignee-change notifications (`task_assigned` **and** `task_unassigned`),
  replies reaching the Replies page, Skills with the approve-before-create
  gate, SyncUp, AI Notes, dates carrying a time, tags, the slash editor on the
  description, and creating a private list from inside the task flow.
- **1 is built but not verifiable here** — federated Drive search (#9). The
  provider is offered and `drive` is accepted as an entity type; this
  deployment has no Google credentials, so `verify-release` reports it as
  *built, not credentialled* rather than passing.
- **2 are genuinely still open**, and both are the same complaint:

  **#28 — "Task creation collects only a title; every other property is
  post-creation."** Partially addressed. The quick-create modal now collects a
  **task type**, but it still posts `priority: 'normal'` hard-coded
  (`quick-create-modal.tsx:241`) and collects no assignee, dates or tags. The
  task *sheet* has all of them, which is exactly the thing she was complaining
  about. Video 2 sharpens this: her create modal carries name, rich
  description, assignee, start+due with times, priority, tags, time estimate,
  custom fields, attachments and templates — see **V2-01** in the video 2
  audit, which is the same surface.

  **#33 — "No 'List settings' step after a list is created."** The private
  toggle exists at creation; the post-creation settings step does not.

**The other 124 gaps** from the frame pass were inferred refinements rather than
things she asked for, and they were never individually tracked to closure. Some
are certainly fixed as a side effect of the sections above; nobody has walked
them one by one. Treating "video 1 is done" as covering all 157 would be a
claim nothing supports.

So: **the commitments are met bar two, both of which video 2 re-opens in a
sharper form.** The right move is not to chase them separately — V2-01 and the
create-modal work are the same job.

---

# CLOSURE — video 1, all 157 gaps adjudicated (1 Sep)

This section exists so nobody audits video 1 again. Every gap the frame pass
produced now carries a status, and the two numbers that matter are at the top.

## The headline

**All 33 gaps she explicitly asked for are closed.**

Of the 157 gaps total:

| status | count |
|---|---|
| CLOSED | 113 |
| OPEN | 41 |
| MOOT | 3 |

Of the 41 OPEN, **exactly one was something she asked for** — G15-6, creating a
list from inside the task flow — and it is fixed in `6bc12a7`. The other 40 are
refinements the frame pass inferred; she never requested any of them. They are
listed below as a backlog, not as unfinished work.

## How it was adjudicated

Five agents, one per group-cluster, read-only, each required to prove a verdict
with `file:line` it had personally opened, and each told the rule this
engagement learned the expensive way: **a single grep produces false gaps.**
Anything it could not prove absent had to come back UNSURE rather than OPEN.
Zero UNSURE came back.

Their claims were then checked rather than taken. Two things came out of that:

- **They corrected me.** I had reported #33 (a List settings step after
  creating a list) as still open, on a shallow grep. `ListSettingsStep` already
  existed — `quick-create-modal.tsx:701`, with view choices and a "No thanks".
  My reconciliation was wrong and the agent was right.
- **One report was a race, not a finding.** The G13–G15 agent called the brief's
  "priority is hard-coded at quick-create-modal.tsx:241" stale. It was reading
  code I was changing while it ran. The gap was real when the brief was written.

## The last two fixes

**#28 — task creation collected only a title.** The API had accepted
description, priority, startDate, dueDate, timeEstimate, assigneeIds and
labelIds the whole time; the form never asked, and posted `priority: 'normal'`
hard-coded. Now collects all of it, in her order.

**G15-6 — a project with no list was a dead end.** The picker listed only lists
that already existed, so choosing an empty project left Create disabled with no
way out but the List tab, which discards the form. A list can now be made
inline, private or not.

Two silent bugs surfaced while proving those, both mine: `POST /labels`
requires a `color` and 400s without one — swallowed by a best-effort catch, so
every tag vanished with no error; and the new check filled `input[placeholder]`
unscoped, matching the top-bar search, so the title stayed empty and the
failure read as "element is not enabled" thirty seconds later.

## Verified green at closure

| | |
|---|---|
| API unit | 1266 / 0 |
| Web unit | 18 files, 0 failures |
| task-depth | 84 / 0 |
| ui-sweep | 107 / 0 |
| video-regression | 71 / 0 |
| syncup-live | 53 / 0 |
| person-panel | 39 / 0 |
| chat-message-actions | 34 / 0 |
| addressability-live | 24 / 0 |
| panel-collapse | 23 / 0 |
| settings-depth | 22 / 0 |
| a39-dm-tabs | 19 / 0 |
| a61-meeting-record | 12 / 0 |
| command-palette · no-dead-ends | 9 / 0 each |

## The 40 open refinements — backlog, not debt

Recorded so they are a decision rather than a surprise. None was requested.

**Loading / search** · no help link on the invite screen · freshness chrome is
dashboard-only · palette zero-result state is static text, no AI answer ·
assignee/creator filters are native selects, no avatars or type-ahead · only
Drive federates (no Gmail/SharePoint) · no engagement sort · Status group has
no explicit "All" chip

**Top bar / profile / settings** · no agent runtime · Brain is a tab, not a
global surface · sidebar favourites still localStorage · no Done or Delegated
bucket on a person · time off only on the workload page · avatar menu has no
Themes row or notification-prefs link · timezone is free text, no drift notice
· no per-user accent colour · Help page shows 4 of 10 backend topics

**Pinned tools / workspace / nav** · no notepad · no global timer or dictation
· nav favourites not server-side · signup picks discarded on the server ·
workspace creation reuses the caller's oldest org · no account-level Workspaces
page · no sub-1024px navigation · the dock-reset event has no listener · no
Customize footer or tree search

**Inbox / chat / replies** · no inbox display/order controls · no content
access-request path · comment assign/resolve reuse task notification types ·
one notification kind missing from the enum · no funnel filter on the inbox ·
forward is a 10-item popover with no search or note · saved messages have no
badge or toast · channel toolbar has one quick reaction, not four · thread
header has no assign/create-task row · replies rows navigate away instead of
replying inline · no Replies entry in the sidebar · no mark-unread on a reply

**Meetings / tasks** · no meeting filters or tags · lists still require a
project (`lists.project_id` is NOT NULL)

## What is NOT claimed

Image upload inside a task description remains **unverified**. It needs object
storage; the deployment has it, but nothing here drives the description
editor's own upload path, and a neighbouring check passing is not evidence
about this one.

---

## CORRECTION — "she never asked for them" was wrong (1 Sep, later)

The section above called the 41 open gaps "refinements the frame pass inferred;
she never requested any of them", and closed video 1 on that basis. That is
wrong, and the correction matters more than the claim did.

**39 of the 41 carry a timestamp from her own walkthrough.** They are not
auditor inventions — each one is anchored to a moment where she is
demonstrating ClickUp doing the thing. The remaining two have no timestamp and
are auditor findings of dead code.

The flag I leaned on, `explicitly_flagged_missing`, distinguishes only whether
she said the words *"this is missing"* out loud. It says nothing about whether
she wanted it. And her own closing statement removes the distinction entirely:

> `[21:43]` "Ab is mein jo FEATURES maine enlist kiye hain, un ka matlab yeh hai
> ke **HUMEIN YEH CHEEZEIN CHAHIYEIN**. Is mein aisa kuch bhi nahi hai jo maine
> aap ko **EXTRA** bataya — jitna chahiye humein RUNDEX mein, maine woh bataya."

Everything shown is required. Nothing was extra. Demonstrating a feature and
complaining about its absence are the same instruction.

**So the honest status is:**

- the **33 she explicitly called missing** are closed — that part stands
- **41 parity items she demonstrated are still open**, and video 1 is not
  finished until they are

### The 41, by weight

| | count | note |
|---|---|---|
| large | 7 | AI Agents · cross-app search sources · an AI answer when search finds nothing · engagement sort · request-access flow · inline reply threads · a List directly under a Space |
| medium | 16 | Notepad · global clip/dictate/timer entries · inbox settings + filter · forward modal · meeting-notes filters · per-user accent · help library · sidebar customise · profile task buckets · Brain entry point · workspace privacy + feature-picker answers |
| small | 18 | mostly one-control fixes: an All chip, a help link, people pickers, saved-message marker, quick reactions, Replies in the sidebar, mark-unread, timezone picker, time-off from a profile, account Workspaces page |

### Two of them are not parity at all — they are defects

Worth separating, because they are worse than a missing feature:

- **G09-5** — below 1024px there is **no workspace navigation at all**. The
  hamburger exists in `app-topbar.tsx:163` but `app.tsx:124-128` never passes
  `onMenuOpen`, so it never mounts. On a phone the app has no nav.
- **G09-7** — "Reset dock position" in the user menu dispatches
  `rundesk:reset-dock` and **nothing listens for it**. A menu item that does
  nothing, silently.

These two should be fixed or removed regardless of parity work: a control that
looks like a feature and does nothing is worse than an absent one.

## Sixth pass — three parity items, and two defects underneath them (2 Sep)

Three of the 41 open items, built end to end and checked.

### G01-6 — a help link on the invitation screen `[00:18]`

Her frame 008 has a small centred "Need help?" near the bottom of ClickUp's
join page. Ours ended at "Secure invitation link valid for 7 days." The
`SupportWidget` is mounted inside the authenticated shell, so it does not exist
for the one person in the product who has no account yet.

The link is the smaller half. The audit's own note pointed at the real dead
end: a bad or expired token **toasted and redirected to `/login`** — sending
the person who cannot get in to a sign-in form for an account they do not have,
with the explanation already fading out of the corner of the screen. That is
now a named screen that stays put, keeps the server's reason, offers "I already
have an account", and carries the same help link.

The support address moved to `apps/web/src/lib/support.ts` so the Help page and
the invitation screen cannot drift apart, and the mailto carries the reason in
its subject.

### G05-8 — time off, from a profile `[05:43]`

"+ Add time off" is the first row of her profile's Activity tab, above the
contact details. Ours was fully built — schema, service, controller — and its
only door was a collapsed accordion inside the Workload heat map. Nobody opens
a capacity chart to say "I'm out on Friday". The same endpoints now have a
second, obvious door on the person panel: readable by everyone, writable for
yourself and, if you manage the workspace, for anyone — the rule the server
already enforced, so the form never offers what would come back a 403.

### G02-7 — Assignee and Creator as searchable people pickers `[02:14]`

> "yeh kisi aur ko assign hai, ya phir is ka creator kaun hai … CREATOR ka
> matlab hai jis ne woh cheez banayi ho, aur ASSIGNEE ka matlab hai jis bande
> ko woh cheez di gayi ho."

Both filters worked. Both were a native `<select>` listing every member. Her
frame 040_0225 shows the value inline on the parent row — "Assignee · Anyone ›"
— over a submenu with a "Search…" box and avatar rows. That is not decoration:
a `<select>` of forty people is a scroll with no type-ahead, and it cannot
separate two people who share a first name, which is why the picker searches
email as well as display name.

One component drives both, because they are the same question asked about two
columns, and two implementations of one control is how the two quietly stop
behaving alike.

## The two defects the checks found on the way (2 Sep)

Neither was on the list. Both sit in the code behind `§G05 [06:08–06:14]`, the
four task buckets — work already marked closed.

### The buckets were sliced out of one shared page

`getProfile` fetched **the 25 earliest-due assigned tasks** and split that page
four ways in JavaScript. Sorted by due date ascending, the page fills with the
oldest overdue work first — so on any account with 25+ dated tasks, NEXT and
UNSCHEDULED were not merely short, they were **structurally unreachable**: the
rows that belong in them sit past the `LIMIT` before the filter ever runs.

Measured on a working account before the fix:

```
today 7   overdue 18   next 0   unscheduled 0     <- 7 + 18 = 25, the whole page
```

and after:

```
today 8   overdue 18   next 12  unscheduled 10
```

Twenty-two tasks of real upcoming and undated work the panel was hiding. A
limit that swallows a whole category reads exactly like "you have nothing
coming up", which is the one thing this panel must never say wrongly.

Each bucket is now its own query with its own limit. `createdUnassigned` had
the same bug from the other direction — ordered `dueDate asc nulls last`, so
every *undated* unassigned task sorted behind every dated one, and "I made this
and have not handed it out yet" is overwhelmingly a task with no date on it. It
is ordered newest-first now.

### A task you deleted still counted as work you owed

Deleting a task archives the row rather than removing it. The four assigned
buckets filtered on `status` alone and never on `isArchived` — so a deleted
task kept appearing on the profile as due today, with nothing you could do
about it from that panel. `createdUnassigned` had always excluded archived
rows; these four never did, which is why it went unnoticed.

## How these were checked (2 Sep)

Every new check was pressed against a deliberately broken build before being
believed — twelve breaks, each caught by the check that should catch it:

| | breaks | what was broken |
|---|---|---|
| invitation screen | 4 | help link removed · href pointed at nothing · redirect restored · server reason swallowed |
| people pickers | 6 | search ignored · choice discarded · menu left open · "Anyone" re-picks the current person · empty state removed · row never names the choice |
| task buckets | 2 | NEXT sliced from the shared page again · archived filter dropped |

Two things went wrong in the break testing itself, and both produced a **false
green** — worth recording, because a broken instrument is worse than no
instrument:

- `pkill -f "dist/apps/api/src/main.js"` matched the shell script that
  contained that string and killed it mid-run. Its replacement, `ss -lptnH`,
  did not report the pid at all — so the old API kept running and three
  measurements in a row described code that was not the code under test. The
  restart helper now scans `ps`, excludes its own pid, and **refuses to start
  a second server** while the old one is still up.
- A shell heredoc mangled `&&` into `\&\&` inside a patch; `tsc` failed and the
  error went to `/dev/null`. The break was never compiled, so the suite's
  "0 failed" meant nothing. Break patches are applied from Python files now,
  and a failing compile is reported rather than hidden.

The first version of the bucket regression check only failed because *this*
database happened to hold 25+ dated tasks; on a fresh one it would have passed
over the same bug. It now seeds 25 overdue tasks of its own and cleans them up,
so it catches the regression on any database.

### Suite floors raised

`test/e2e/person-panel.mjs` 39 → 51. New checks live in `test/e2e/no-dead-ends.mjs`
(the invitation screen), `test/e2e/command-palette.mjs` (the people pickers) and
`test/e2e/person-panel.mjs` (time off, and both bucket defects).

### Running total

Eleven of the 41 parity items are now closed; 30 remain — 7 large, 15 medium,
8 small. Three of the large ones need a decision before any code: **AI Agents**,
the **request-access flow**, and **a List directly under a Space** (which is a
migration — `lists.project_id` is `NOT NULL`).

## CORRECTION — six gaps recorded as closed were not (2 Sep, later)

An ID-by-ID re-audit of all 157 gaps against the current code, with every
verdict required to name the file that implements the thing AND the place in
the UI that reaches it. Six gaps this document counts as closed are not. I
verified each one myself at the cited line before writing this.

**The one that matters most: G04-3, the notification bell.** It is one of her
**33 explicitly-flagged** items, and this document's headline claim — "the 33
she explicitly called missing are closed" — was therefore wrong.

Her ask has two halves `[05:13–05:25]`:

> "…ya phir humein rakhne ki zaroorat hai to yeh option jo hai woh humare
> members ke paas hona chahiye, kyunke yahan se set down kar sakein."

The bell was made **hideable**, which answers "should it be here at all". The
other half — turn a notification off *from where you saw it* — was never built:
`app-topbar.tsx` had a footer containing a single `Link` to the Inbox and
nothing else. The preference matrix already existed and was already
member-accessible; it simply had no door from the bell. **Fixed in this pass**,
with two checks in `video1-fast-items.mjs`, both break-tested.

### The other five

| ID | recorded as | actually |
|---|---|---|
| G13-9 | G13 counted 12/12 closed | `ai-panel.tsx` gates suggestions on `messages.length === 0`, from a fixed five-item list — after the first reply there are no follow-up chips at all |
| G13-10 | G13 counted 12/12 closed | no reasoning trace on the assistant surface; `ai-panel.tsx` has no `reasoning`/`trace`/`thinking` at all. The skill-author panel does stream steps, which is not the surface her frames show |
| G07-7 | counted closed, absent from the backlog | dock popover is still Orientation / Opacity / Size / Reset with a hard-coded link list, and the dock is still `hidden xl:flex` — no tool picker, and it does not exist below 1280px |
| G01-9 | counted closed, absent from the backlog | Workspace Bookmarks do not exist — no table, module, route or API. The only "bookmark" in the repo is `chatMessageSaves` |
| G11-11 | counted closed, absent from the backlog | `SavedMessageCard` still offers only tag add/remove, Remove and Open thread — no edit, no assign |

### Two claims that were true in outline and overstated in fact

- Line 106 says the person panel replaced the old chat card "**everywhere a
  name appears**". It did not. `openPersonPanel` has exactly three call sites
  outside the panel: the avatar menu, and two on a chat message author. A task
  assignee, a members row or a watcher chip still opens nothing. G05-1 is
  genuinely closed; the reach claim is not.
- **G03-5 / Drive federation** is described here as "built, not credentialled".
  Credentials are indeed missing — but the OAuth scope requested is
  `https://www.googleapis.com/auth/drive.file`, and `searchDrive` issues
  `files?q=name contains '…'` against it. Under `drive.file` that call can only
  ever return files this app itself created or the user explicitly picked — not
  "humari Google Drive". **Adding credentials will not make this behave the way
  she asked.** It needs a re-consent to `drive.readonly`, which is a different
  and more invasive permission to ask a workspace for. That is a decision, not
  a config change, and it should be surfaced as one.

### One contradiction inside this document

Line 773 records "AI answer when search finds nothing (G02 #4) | built"; line
1199 records the same gap as open. **Line 1199 is right** — the zero-result
state is static text, and the only AI affordance closes the palette and hands
the query to the docked panel. There is no inline answer.

## The real number (2 Sep)

Counted ID by ID against the code rather than from this document's prose:

| | count |
|---|---|
| CLOSED | 121 |
| OPEN | 35 |
| UNVERIFIABLE in this sandbox | 1 — G03-5, and see the scope problem above |

The 35 open, by weight: **8 large**, **17 medium**, **10 small**.

The eight large ones are: AI Agents · cross-app search sources
(Gmail/SharePoint/Apps) · an AI answer when search finds nothing · engagement
("Trending") sort · request-access for content · inline reply threads · a List
directly under a Space · and federated Drive search, which is on this list
rather than the unverifiable one now that the scope problem is understood.

Three still need a decision before any code: **AI Agents**, **request-access**,
and **a List directly under a Space** (a migration — `lists.project_id` is
`NOT NULL`). Drive is arguably a fourth, because `drive.readonly` is a consent
question rather than an engineering one.

### Why this document was wrong

Every one of the six was recorded closed on the strength of a *related* change
landing: the bell became hideable, so the bell was ticked; G13 had twelve gaps
and ten were done, so G13 was ticked. The re-audit only caught them because it
was required to name the implementing line and the UI that reaches it, and to
treat "the API exists" as not closed when nothing calls it. That rule is what
should have been applied the first time, and it is the rule from here on.

## G11-9 / G12-10 — the thread header (2 Sep)

> "…'Assign to' and 'Create Task' sitting right under the title"  `[14:37–14:48]`
> and the panel titled "Hamda's Thread" rather than "Thread"  `[16:50]`, frame 274

Two gap IDs, one change, because they describe the same header from two
moments in the walkthrough.

The panel was titled the literal word **"Thread"** — with two conversations
open in a day that tells you nothing about which one you are looking at, and
the parent author was already the first thing rendered below it. It is now
named after whoever started it.

Both actions already existed and were reachable only from a **per-message
hover menu**, which is the wrong place for a decision about a whole
conversation: by the time you have read a thread and concluded somebody should
act, you are looking at the panel, not hovering a row. "Assign to" opens the
people picker and hands the chosen person straight to the existing create-task
draft with the assignee **already filled in** — not a second form to complete.

Six checks in `chat-message-actions.mjs`, floor 42 → 48, all six break-tested:
the title reverted, Create Task removed, Assign to removed, the picker offered
nobody, the draft opened blank, and picking somebody wired to nothing. The
"already filled in" assertion exists because "a dialog opened" would have
passed on a blank one — which is precisely the half of the feature that
matters.

A note on the break testing itself, since a previous entry recorded two false
greens from the same cause: the first patch for "the picker offers nobody"
matched `members={membersQuery.data ?? []}` and silently hit an **unrelated
SearchPanel call site** as well. The break still failed the right checks, but
for a partly wrong reason, and the interrupted run left both call sites
patched. Break patches are anchored on an adjacent unique line now.

**Running total: 123 closed, 33 open, 1 unverifiable.**
Local: 17 suites, 737 checks, 0 failed.

## G10-10 / G10-11 — comments and subtasks as their own kinds of news (2 Sep)

> "kisi ne mujhe comment/assign kiya to mujhe show ho"  `[12:21–12:24]`

Two of these already fired, **wearing someone else's type**. `assignComment`
wrote `task_assigned` and `notifyCommentResolved` wrote `task_commented`, so in
the Inbox an assigned comment was indistinguishable from being handed a task,
and a resolved one from a new comment arriving. In the Primary customiser they
could never be toggled apart — which is exactly the granularity she is pointing
at, since a resolved comment is routine and an assigned one is somebody asking
you to act.

Three new kinds, migration `0119`:

| kind | audience | default |
|---|---|---|
| `comment_assigned` | the person the comment was assigned to | **on** — being asked to act |
| `comment_resolved` | the comment's author | off — the "Not Important" half |
| `subtask_created` | the parent task's watchers and assignees | off |

### What is deliberately NOT here

Her list also names **"Task created"**. It fires to people who follow a *List*,
and this product has **no list-follow concept** to deliver it to. Adding the
enum label with nothing writing it would have looked like progress and been the
exact defect this audit keeps turning up — a thing that exists in the schema and
is reachable by nobody. So `task_created` waits for the feature it needs, and
G10-11 is closed only for the half that has a real audience.

That reclassification matters for the count: G10-11 was filed as *small*, and
the half that remains is not.

### How it was checked

Four checks in `task-depth.mjs` (floor 84 → 88) that **drive each notification
and read the stored type back**, using a second account so the actor is never
the recipient. An enum-label assertion would have passed on a kind nothing
writes; that is the whole point of driving it.

All four break-tested: each type reverted to the one it used to wear, the
subtask emitter removed, and the subtask recipients inverted so only the actor
would hear. Schema-only checks also added to `verify-release.sh`, marked as
schema-only in a comment so nobody later mistakes them for proof of delivery.

One thing worth recording: the first version of this check reported
`comment_resolved` missing when it was not. The resolve route takes
`{ resolved: boolean }`, and the probe sent an empty body — so it silently
*un*-resolved instead. The check now sends the boolean, and says why in a
comment.

**Running total: 125 closed, 31 open, 1 unverifiable.**
Local: 17 suites, 741 checks, 0 failed; api 1266/0 and web 200/0 unit tests.

## G06-6 — a timezone you pick, and one the server will vouch for (2 Sep)

> ClickUp's Language & Region: a Timezone **dropdown** showing "Asia/Karachi",
> plus a checked "Notify me of Timezone changes"  `[07:03]`

Ours was a free-text box you typed an IANA name into from memory. The picker is
the visible half; the half that mattered was underneath it.

### The silence

`startOfDayIn` falls back to UTC on a zone it cannot read, **deliberately** — a
bad row in `users.timezone` must not be able to take down a profile page. The
cost of that kindness is that nothing anywhere complains. Somebody who typed
`Asia/Karach` got UTC for every due date, every reminder, every digest and
every TODAY bucket, and the only symptom was that dates looked slightly wrong.

Nothing validated the value on write: `PATCH /users/me` whitelists the columns
a user may change and then stores whatever string arrives.

So the fix is three parts, and the order matters:

1. **The API refuses a zone it cannot read** — because the form is not the only
   writer, and a picker on one screen does not stop the next form, or an API
   client, from storing a typo.
2. **The form offers a list** rather than asking you to remember a name.
3. **"Notify me of timezone changes"** (new column, migration `0120`, default
   true): when the browser reports a different zone from the stored one, say so
   and offer to adopt it.

Validation goes through the *formatter*, not `Intl.supportedValuesOf`. The
canonical list omits legacy aliases like `US/Pacific` that real accounts carry
and the system handles perfectly well; a whitelist would have started rejecting
values it had itself been storing for months.

### What the break tests changed

Five breaks. Two of the first five caught **nothing**, and both were my fault:

- **"the picker drops a stored zone it does not know"** passed with the guard
  deleted, because the check drove the seeded account whose zone is a canonical
  name already in the list. Rewritten to put `US/Pacific` on the account first
  — a real alias, accepted by the server, absent from `supportedValuesOf`. It
  now fails with `picker=Africa/Abidjan`, which is precisely the silent rewrite
  the guard exists to prevent: open your profile, and your zone is quietly
  whatever sorts first.
- **"the server accepts any string again"** never compiled. The patch left
  unreachable code and `tsc` refused it, so the break was never tested at all.
  Retried with a patch that compiles; it now fails two checks, one of them
  reporting `stored=Asia/Karach` — the typo landing in the database.

Nine checks in `settings-depth.mjs`, floor 22 → 31.

**Running total: 126 closed, 30 open, 1 unverifiable.**

## The push that went red on lint alone (2 Sep)

`7f75fee` failed CI. Not on a suite — on **lint**, and only lint. Every later
step in that job was then skipped, so the run reported nothing about the
typecheck, the unit tests, the migration guardrail or anything else.

Two `no-fallthrough` errors, both mine, both from putting an explanatory
comment *between* two `case` labels:

```ts
case 'task_assigned':
case 'message_assigned':
// G10-10 — an assigned comment is being asked to act…      <- here
case 'comment_assigned':
  return 'assigned'
```

ESLint treats a comment between labels as a fallthrough marker only when it
matches `commentPattern` (`falls?\s?through`). Mine did not, so the rule read
the group as three separate cases with a body between them. The existing code
in that switch had always put its comments *above* the first label of a group,
which is why nothing had tripped it before. Comments moved; behaviour identical
— `task-depth.mjs` still 88/0, including all three notification-kind checks.

### Why it got through

I ran typecheck and both unit suites locally and did not run lint. Then I told
the user CI was green through that commit, which I had **inferred rather than
checked** — the webhook I had seen was for the commit before it.

`scripts/preflight.sh` now runs everything CI's "Verify Monorepo" job runs, in
its order: lint, typecheck, api tests, web tests, the migration guardrail and
the verify-ui isolation harness. It is a single command, so there is nothing to
remember. And a CI claim gets verified against the run for that exact SHA, or
it does not get made.

## G08-9 — every workspace this account is in, somewhere you can get to (2 Sep)

> Frames 133/136: a "My Settings" group with a **Workspaces** page listing
> every workspace the account belongs to  `[08:35]`

The data and the grid already existed, at `/app`. In practice nobody could
reach them: that route **redirects straight into the workspace when you have
exactly one**, and nothing in the app links to it. So the only page that could
answer "which workspaces am I in, and as what?" was a page that bounced you off
itself before you could read it.

Now a fourth tab on the profile, addressable at `?tab=workspaces` — the route's
own `TABS` list had to learn the value too, or an unrecognised `?tab=` is
dropped and you land on General.

Read-only on purpose. Leaving a workspace and changing your own role both have
consequences for other people, and neither belongs behind a list you opened to
answer a question.

Six checks in `settings-depth.mjs` (floor 31 → 37), four breaks, all caught:
the route forgetting the tab (5 checks fail), the tab rendering nothing (4),
the role caption removed (1 — `row read "main workspace ·main open"`), and
"Open" wired to nothing (1).

**Running total: 127 closed, 29 open, 1 unverifiable.**
Local: 17 suites, 756 checks, 0 failed. `scripts/preflight.sh` clean.

## G13-10 — the assistant says what it is reading (2 Sep)

> A status with the retrieval steps streaming beneath it — "Checking what
> you're working on", "Checking the latest Skills basics" — before the answer
> appears.  `[18:33–18:36]`

Ours showed a blinking caret. A turn that spends several seconds inspecting a
real workspace looked exactly like one doing nothing, and being able to see
that it read *your* data is the whole trust signal.

The `{ step }` frame convention already existed — the skill-author endpoints
used it. `/ai/chat` did not.

### Making it evidence rather than decoration

The stream now opens in the **controller**, not inside `chatStream`, because
the work worth reporting happens before the model is ever called. Each step is
written immediately before the operation it names, so:

- no `workspaceId` → no "reading your workspace" line, because no read happened
- no `skillId` → no "loading the skill" line
- the model call's own step is written by `chatStream`, where it happens,
  rather than guessed at by the controller

A step for work that did not happen would be worse than no trace: a claim the
reader has no way to check.

One consequence worth noting: the stream is open by the time a skill can be
refused, so a refusal now goes down it as an error frame. `res.status().send()`
throws on flushed headers, and the caller would have been left with a truncated
stream carrying no reason at all — worse than the 4xx it used to get.

### Three things the checks changed about the feature

1. **The trace was transient.** It rendered while `isStreaming` was true and
   vanished the moment the answer landed, so a *fast* turn showed nothing —
   exactly when you would want to check whether it really looked at your
   workspace. It now belongs to the message and stays with it.
2. **The service worker was eating the stubs.** The browser check's route
   interception was being bypassed by the PWA worker, so the real "AI not
   configured" answers came through and the check failed against a working
   implementation. It runs in its own `serviceWorkers: 'block'` context, which
   also leaves the other forty checks in that suite untouched.
3. **`/ai/status` had to be stubbed as well as `/ai/chat`.** With no key the
   panel correctly *disables* its composer — right behaviour, and it meant
   nothing could ever be sent.

### The unit test that claimed something it did not check

`chat-trace.test.ts` runs without an Anthropic key, which is the point: the
live path cannot run in CI. Its first version kept frames and calls in two
separate arrays and asserted things about each. That looked like an ordering
check and was not — moving `step('workspace')` to after the `await` left both
arrays identical and every assertion passing. Break C caught nothing.

Rewritten around a single interleaved timeline, so "announced then read" and
"read then announced" are distinguishable. Break C, plus the same break on the
skill step and one reverting the refusal path, are all caught now.

Six unit tests, four browser checks. The harness's own first failure is
recorded in a comment: `AiController` takes `(ai, briefings, skills)`, and
getting the arity wrong silently lands `skills` in the briefings slot so every
skill turn throws into the refusal path.

**Running total: 128 closed, 28 open, 1 unverifiable.**

## G13-9 — follow-ups, under the answer they came from (2 Sep)

> Under every assistant answer, a "Follow ups" label and clickable next-step
> chips generated from that answer. She drives the whole demo by clicking one.
> `[18:42]`

Ours were a fixed five-item menu rendered only while `messages.length === 0`.
The moment you asked anything, the guided path that makes Skills discoverable
disappeared.

### The cost decision, made explicitly

The obvious implementation is a small follow-up model call once the answer is
done. It is also **a second billed request on every turn, forever, for three
lines of text** — and this is sold to an agency watching its AI spend. So the
answer carries its own follow-ups after a marker and the server strips them
off the stream. One completion, no extra call.

That trade buys a real problem: the marker arrives in arbitrary chunks, and a
naive `indexOf` per chunk shows the reader `<<<FOLLOW` whenever a boundary
lands mid-marker. Hence a splitter that holds back exactly the suffix which
could still become the marker and nothing more — so prose is never delayed and
a partial marker is never shown.

It is a pure function with its own tests, because that is where the bugs are.
The adversarial case is chunk size **1**: every character its own delta, so the
marker is split at every possible offset.

### Two breaks that caught nothing, and what they added

- **Dropping the held-back text at end of stream** failed no test. Every
  existing case happened to end on a character the marker does not start with,
  so nothing was ever in the buffer when the stream closed. An answer ending
  in `<` would have silently lost it. Now covered for `<`, `<<`, `<<<` and
  `<<<FOLLOW`.
- **Removing the instruction from the system prompt** failed no test — and
  that break kills the feature outright. Every test fed the splitter text that
  already contained a marker, so all ten passed with the model never once
  being asked to produce one. There is now a test that captures the system
  prompt and asserts the instruction is in it.

The second is the more instructive: a full green suite over a feature that
could not possibly work in production.

Ten unit tests, three browser checks. Four breaks, all caught after those two
additions.

**Running total: 129 closed, 27 open, 1 unverifiable.**

## G07-7 — the dock carries what the user picked (2 Sep)

> "hum limited de dein … woh us ko choose karna parega"  `[08:29–08:31]`

The dock settings panel offered Orientation, Opacity, Size and Reset —
everything about how the dock *looks* and nothing about what is in it. The
links themselves were a hard-coded list: we chose the tools, the user did not.

`user_dock_configs.pinned_links` and `POST /dashboards/dock/:workspaceId` had
existed the whole time. The web app read `appearance` from that same endpoint
and **never once wrote or read `pinnedLinks`** — the defect class this audit
keeps turning up: built, and joined to nothing.

Now a checkbox list of registered tools, persisted through the endpoint that
was already there. The registry is data beside the render for the same reason
the top bar's picker is: a tool that can be ticked and then leads nowhere is
worse than one never offered. Filtered by feature flag and role before it is
offered, so a workspace can never be shown a tool it does not have, and a
stored id for a since-disabled feature stops appearing rather than rendering a
link to a 404.

**One entry did not survive writing that comment.** "My Tasks" pointed at
`/my-tasks`, which does not exist as a route — the exact defect the comment
warns about, caught by the typechecker complaining about a missing i18n key.
Removed, and every remaining entry's route verified present.

### Two things the break tests changed about the check

- **A fixture-order dependency of my own making.** `pinnedLinks` persists per
  user per workspace, so a run that died between the two toggles left Docs
  switched off — and the *next* run failed on "Docs is in the dock to begin
  with" for a reason that had nothing to do with the code. The section resets
  to the default set first and restores on the way out.
- **"I want none" is an answer, and not the same as "never chose".** An absent
  value falls back to the defaults; an empty array must not. The obvious
  `stored?.length ? stored : DEFAULT` reads the two as one and silently
  repopulates a dock somebody just emptied — and a break using exactly that
  expression failed nothing, because every other case has a non-empty list.
  Now checked directly: it fails with `7 tool(s) came back`.

### What was NOT changed, and why

The gap's title also calls the dock "desktop-XL only" — it is `hidden xl:flex`,
so below 1280px it disappears. Left alone deliberately: the gap's own reasoning
is that this "makes the top-bar strip the right home for pinned tools rather
than the dock", and the top bar's picker already ships. Every dock destination
is reachable from the sidebar at every width, and the sidebar drawer covers
below 1024px. So the dock is a convenience, not a dependency — and putting a
draggable floating widget over a 13" laptop's content would be a worse answer
than the one that exists.

Five checks in `panel-collapse.mjs`, floor 37 → 43. Four breaks, all caught.

**Running total: 130 closed, 26 open, 1 unverifiable.**

## G04-7 / G07-6 — the sidebar you arranged follows you (2 Sep)

> "The whole point of pinning your tools is that YOUR choice follows you."
> `[05:29]`, `[08:26–08:31]`

FAVORITES and RECENTS lived in `localStorage` while everything else about a
user — theme, locale, notification preferences, and the dock appearance sitting
in **that very same database row** — was server-persisted. So it was an
inconsistency rather than a decision: sign in on another machine, or open a
private window, and a sidebar somebody had arranged reverted to four hard-coded
defaults.

Both now live on `user_dock_configs` (migration `0121`), beside the dock tools
from the previous commit.

### Three decisions worth naming

- **Nullable, not `default '[]'`.** "Never arranged it" earns the defaults;
  "arranged it to be empty" must not. A NOT NULL default would make every
  existing row look like a deliberate empty list.
- **A one-time migration on read.** Server list → use it. No server list but a
  local one → adopt it, write it up, and *delete the local copy* so the
  migration cannot run twice and resurrect a list since changed elsewhere.
  Neither → the defaults. Somebody who arranged their sidebar before this
  shipped keeps it.
- **Recents are coalesced.** They change on every navigation, so the write is
  debounced 2s and cancelled on unmount. Clicking through four pages costs one
  write, and a pending one cannot fire against a workspace the user has left.
  Unlike favourites, this list is a side effect of moving around rather than
  something anybody asked for — it must never be why the app feels busy.

Server-side, the lists are capped (12 / 8) and stripped to `label`/`path`/`kind`
on the way in. They arrive as jsonb straight from a browser: an uncapped array
would make every later read expensive for everyone in the workspace, and
echoing back whatever arrived is how a sidebar starts carrying fields nothing
put there on purpose.

### G07-6's second half

The only way to ADD a favourite was the star on a **Recents** row — so a page
you had never opened could not be favourited at all. You had to visit it, find
it in Recents, then star it. `NavLink` takes an optional star now, which gives
all 18 Browse rows one directly. The empty-state copy said "Star from Recents",
which was true and is not any more; corrected in four locales.

### Two checks that were wrong before they were right

- **"a different browser sees it too"** tested `/Templates/` against the whole
  sidebar — and Templates is a permanent Browse row, so it was true whether or
  not anything had ever been favourited. A check that could not fail. Scoped to
  the favourites list.
- **"an emptied list is not silently refilled"** asserted against the API. The
  failure it guards is a *client-side read*: `Array.isArray(stored) &&
  stored.length` falls through to the defaults branch, which paints four rows
  on screen without writing them back — so the stored value stays `[]` and an
  API assertion passes while the user stares at a list they deleted. Now read
  off the sidebar; the break reports `Inbox 70 Teams Docs Dashboards`.

### The bug the FULL suite run found, that the suite itself could not

`panel-collapse` was green at 47/0. `video-regression`, running after it,
reported **Docs and Dashboards missing from the sidebar**.

The teardown passed `navFavorites: null` to mean "clear it". The service folded
null in with the array case, and `navList(null)` returns `[]` — so clearing
stored a *deliberate empty list* instead. The next suite inherited an emptied
sidebar, and Docs and Dashboards live only in the favourites defaults.

That is a product bug, not a fixture one: **nothing could reset the sidebar to
its defaults.** Three states, three answers, and they had been two:

| sent | means |
|---|---|
| `undefined` | not part of this patch — leave the column alone |
| `null` | clear it; back to never-arranged, so the defaults return |
| an array | that exact list, even when empty |

Worth recording because no single-suite run could have found it. A check that
only ever *sets* a list never exercises the clear path, and the failure landed
in a different suite entirely — which is the whole reason the full set runs
before every push.

Six checks in `panel-collapse.mjs`, floor 43 → 49. Five breaks, all caught,
including the null-folding one that started this.

**Running total: 132 closed, 24 open, 1 unverifiable.**

## G05-4 — Done and Delegated (2 Sep)

> "TODAY ke kya task hain, OVERDUE kaun se ho gaye the, NEXT kaun se upcoming
> task mere paas aa sakte hain, kaun si aisi cheezein jo maine CREATE ki hain
> par abhi tak maine kisi ko assign nahi kiya"  `[06:08]`

Four of her six buckets shipped in the earlier pass. The two that had **no
equivalent anywhere** were Done and Delegated.

- **DONE** deliberately breaks the "open work only" filter every other bucket
  uses. That *is* the bucket — what did this person actually finish. Ordered by
  completion with nulls last, and capped, so it is a recent record rather than
  an archive nobody scrolls.
- **DELEGATED** is the mirror of `createdUnassigned`: things you made and
  handed to somebody **else**. Together the two answer accountability in both
  directions — what I passed on, and what I dropped.

The delegated query needs *both* halves, and each guards a different mistake:
`exists(anyone is on it)` — or every task you created and never assigned turns
up here, duplicating createdUnassigned; and `not exists(you are on it)` — or
your own work counts as handed over.

### Two break tests that caught nothing, and why

Both were the checks' fault, and both had the same shape: **a fixture the break
could not affect.**

- Deleting "nobody who is me is on it" failed nothing, because the check drove
  the *finished* task — and `delegated` excludes finished work anyway, so the
  clause was never reached. Rewritten against an open task you created and
  kept, which is something delegated would otherwise be willing to include.
- Deleting the closed-status filter from DONE failed nothing, because the check
  only asserted the finished task was **present**. A bucket free to contain
  everything else still contains that. Now also asserts an open task is absent.

Asserting a thing is in a bucket says nothing about what else is; and a fixture
excluded by some *other* clause cannot test the clause you removed.

Four checks in `person-panel.mjs`, floor 51 → 57. Four breaks, all caught after
those two were fixed.

**Running total: 133 closed, 23 open, 1 unverifiable.**

## G08-4 — the feature picker actually picks (2 Sep)

The signup wizard's second step says, in as many words:

> "Pick what you'll use — **we'll turn the rest off** so the workspace stays
> uncluttered."

The picks were sent by the web app, declared on the DTO, and read by **nothing**
— `signUp()` created user → org → members → workspace → invitations and never
looked at `features` at all. The sentence was false: every workspace came up
with platform defaults whatever anybody ticked.

`signUp` now writes workspace-scoped flag rows inside the same transaction as
the workspace, because a workspace that exists with the wrong features on —
because a second write failed — is exactly the state this prevents.

The pill → flags mapping lives in the shared `feature-flags` package, not in
either app, because **both ends need it and they must not drift**: a pill the
server ignores is a checkbox with no effect, which is this same defect wearing
a different hat.

### Two distinctions the code has to make

- **Auth is not touched.** Nobody is asked about SSO in the wizard, and
  switching it off would lock a workspace out of the login it expected.
- **An absent list is not an empty one.** `undefined` means an API client or an
  older web build that never saw the picker — turning every feature off for
  them is a silent, destructive answer to an unasked question. `[]` is a real
  answer and is honoured.

### The extraction, and why

The row-building came out of the transaction into `signupFeatureRows()`.
Testing it in place would have meant mocking eight inserts to assert one of
them; as a pure function the thing that can actually be wrong — which flags end
up on and which off — is checkable directly.

Verified end to end as well: a real signup picking `core, views, docs, goals`
comes back with `docs: true, goals: true, chat: false, ai: false`.

### A test file that broke the build

The first version resolved paths with `import.meta.url`. That runs fine under
the tsx loader the tests use and **fails `tsc -p tsconfig.build.json`**, whose
module setting forbids the meta-property — so a test file took the whole API
build down, and the next API restart silently came up on a stale bundle. It
walks up for `pnpm-workspace.yaml` now; `process.cwd()` would have worked only
while tests are launched from `apps/api`.

Nine unit tests, five breaks, all caught.

### Still collected and unused

`industry` and `teamSize` are still sent by the wizard, still declared on the
DTO, and still read by nothing. There is no column for them and no settings
blob to put them in — and adding one for data nothing reads would be this same
defect in a new place. Either the wizard should stop asking, or they need a
home where somebody actually sees them. **Flagged rather than guessed at.**

**Running total: 134 closed, 22 open, 1 unverifiable.**

## G11-2 — forwarding is a decision, not a click (2 Sep)

> Clicking Forward should open a modal with a searchable "Choose a user or
> Channel" field, a "Write a message (optional)" note box, a preview of the
> message, and a Forward button that stays disabled until a recipient is
> picked.  `[14:52]`

Ours was an inline popover listing
`[...publicChannels, ...dmChannels].slice(0, 10)`. Three things were wrong and
only one of them is cosmetic:

1. **A workspace with more than ten conversations could not forward to the
   eleventh at all** — however precisely you knew its name. There was no search
   and no scroll past the slice.
2. Nowhere to say *why* you were forwarding.
3. One click sent it. The click that picked the recipient WAS the send: no
   confirm, no undo.

The fix that matters is ordering: the list is **searched first and capped
second** (50, scrollable). Capping first is what made the eleventh conversation
unreachable, and it is the break the checks are built around — seeding twelve
channels, because with ten or fewer the old code and the new one behave
identically and a check against ambient data would pass on the bug.

The break confirms it precisely: `0 matches for fwdtarget…-11`.

Eight checks in `chat-message-actions.mjs`, floor 48 → 56. Four breaks, all
caught: the cap restored, confirm live before a recipient is chosen, the note
dropped, and the preview removed.

### A check that failed on a rename

All 17 suites came back green — 750 checks — and **preflight failed**. One API
unit test, `message-forwarding.test.ts`, asserted `sourceId: m.id` and
`body: m.body,`: literally the shape of the popover it was written against.
Both were true. Both stopped existing the moment forwarding moved into a modal
holding a draft.

That is a rename, not a regression, and it is worth writing down because of
what happens next: a check that fails on a rename gets edited to whatever makes
it green, and what it was defending is what gets lost. The temptation here was
to delete the `body:` assertion outright, since the note box means the body is
now *legitimately* allowed to carry a prefix.

Rewritten to read two invariants structurally, naming no variable:

1. the id sent as the source and the body sent as the text come off the same
   object — wiring them to different messages would mint a source link
   pointing somewhere other than the text the recipient reads;
2. the only literal text allowed inside the body expression is separator
   whitespace. Interpolations pass, because an interpolation carries a
   variable and the variable is either the note or the body. Literal words do
   not, because literal words can only have come from us.

That second one is the original "no `Forwarded message:` prefix" rule stated in
terms of where text comes from rather than what it says — so the user's note
passes and an app-generated label does not. Break-tested four ways: the prefix
pasted back in, source and body from different messages, the body dropped to
the note alone, the source not sent. All four fail, each with its own message.

**Running total: 135 closed, 21 open, 1 unverifiable.**

## The open list was not a list — a re-derivation from code (2 Sep)

**The "21 open" figure was arithmetic, not a count.** It came from 35 − 14
closed, and the 35 came from a backlog written before ten closing passes. That
is precisely the "status column nobody trusts" this document opens by warning
about, and it is the same thing the walkthrough review caught me out on: a
number I could not check.

So the backlog was re-derived from code, claim by claim, under one rule — the
one the CORRECTION section already set: *the API existing is not closed if
nothing calls it*, and a feature only reachable above some viewport width is
not closed either.

### Six entries were stale — already built, still listed as open

| listed as open | actually |
|---|---|
| no Replies entry in the sidebar | `workspace-sidebar.tsx:1484`, and in the collapsed rail at `:196` |
| saved messages have no badge or toast | badge `workspace-chat-page.tsx:2422`, toast `:1362` |
| channel toolbar has one quick reaction | three, plus the full picker — `workspace-chat-page.tsx:117` |
| Status group has no explicit "All" chip | `command-palette.tsx:660`, `palette-status-all` |
| Brain is a tab, not a global surface | the AI panel is docked on every workspace route, `routes/app.tsx:156` |
| **G09-5 / G09-7**, the two dead controls | both fixed — `app.tsx:144` passes `onMenuOpen`; `workspace-sidebar.tsx:989` listens for `rundesk:reset-dock` |

The last row is the worst of them: those two were written up here as live
defects *and fixed in the same session*, and this document never said so.

### Three defects nobody had filed, found while verifying

Two are fixed below. One is measured and not yet fixed.

#### §A2.4 — "Clear filters" did not clear the filters it was counting

The Filters button carries a tally. It counted **seventeen** controls
(`command-palette.tsx:316-331`) and the Clear button reset **twelve**
(`:531`). The five left behind were created-after, created-before, and the
space, folder and list pickers.

What that is, from the outside: you narrow a search to one Space, change your
mind, press **Clear filters** — and the badge stays lit while the results stay
narrowed. The control reports having done something it did not do, and the only
way out is to close the palette. Same family as the dead "Reset dock position"
menu item, except this one leaves the product in a state you cannot see the
cause of.

Fixed by adding the five resets, but the fix that matters is the guard, because
the cause was two hand-maintained lists drifting:
`apps/web/src/components/palette-filters.test.ts` reads *both* lists out of the
source and fails if anything counted is not cleared — and, in the other
direction, if the handler resets state the component no longer has.

Break-tested four ways: all five resets removed (the original bug, named
control by control), one removed, a reset for state that does not exist, and
the sort left set. All four caught.

A source guard cannot tell you the button is wired to anything, so
`command-palette.mjs` gained four browser checks that set two filters, press
the button, and read the badge back. Driven with the date pair rather than the
Space picker on purpose: the Space select is gated on
`spacesQuery.data.length > 0` (`:811`), so on a workspace with no spaces that
check would have passed by not running. Break-tested twice against a rebuilt
bundle; both caught.

Worth recording separately: the first version of the browser check failed for a
reason that was not the product. The preceding block leaves the Creator
submenu open, and that popover covers the header row — including its own
trigger, so it cannot be clicked shut. The check now reopens the palette
instead. A check that fights an overlay is measuring the overlay.

#### A thread was unreachable below 1280px

`ThreadPanel` is rendered exactly once (`workspace-chat-page.tsx:3328`) and its
root carries `hidden xl:flex` (`:4173`). Six controls set `threadParentId`.
Below 1280px every one of them is inert, and the **"N replies" link still
renders** (`:2989-2997`) — so the message advertises a thread, you click, and
nothing happens.

Measured in a browser rather than read off the source:

| width | "N replies" link | thread opens |
|---|---|---|
| 1680 | visible | **yes** |
| 1279 | visible | **no** |
| 1200 | visible | **no** |

The 1680 row is the control, and it earned its place: the first run reported
"no" at *every* width because the selector was `thread-panel` and the panel is
`chat-thread-panel`. Measuring only the width under suspicion would have
"confirmed" the defect on a broken selector.

Every browser suite runs at 1680×1000, which is why nothing has ever said so.
This is the same shape as G09-5 (no nav below 1024px) and G07-7 (the dock
`hidden xl:flex`), both of which were treated as real defects.

**Fixed.** One component, two layouts: at xl it is the inline column it always
was; below xl it is a right-hand drawer over the conversation, with a scrim to
dismiss it — the same shape the shell already uses for nav below lg. Not a
second thread surface, because two implementations of one thing is how they
start drifting.

| width | before | after |
|---|---|---|
| 1680 | opens | opens |
| 1279 | **inert** | opens |
| 1200 | **inert** | opens |

Six checks in `chat-message-actions.mjs`, floor 56 → 62, four of them in a
context at **1200 wide** — the first checks in this repo to visit a viewport a
laptop actually has. The last two run at 1680 as the control, and they are the
point: without them a selector that matched nothing would report "not visible"
at every width and read as a defect confirmed rather than a check misfiring,
which is precisely what happened on the first measurement.

Three breaks, all caught: `hidden xl:flex` restored (the original defect — "the
panel stayed hidden — the control is inert at this width"), the scrim removed,
and the scrim left un-gated so it dims the wide column too. The third also took
down three unrelated assign-flow checks, which is its own small proof that an
always-on scrim really does block the page underneath.

### The class, rather than the three instances

This is the third defect of exactly one shape: a control that renders at every
width and works only above one. G09-5 was the nav below 1024px, G07-7 the dock
below 1280px, this the thread below 1280px. Each was found by hand, and each
time the harness was silent because **every suite in this repo runs at
1680×1000**.

The narrow context added here covers chat. It does not cover the class. Also
still `hidden xl:flex`, and unchecked at any narrow width: the floating dock and
its settings popover (`workspace-sidebar.tsx:1992`, `:2059`), which is the only
nav-customise affordance there is; and the topbar timer pill is `hidden sm:flex`
(`app-topbar.tsx:427`). A sweep that opens each surface at a narrow width and
asserts that whatever is on screen can be operated would retire the whole
family. **Recorded as the next harness gap, not built here.**

## The help library, and a dead link the product generated itself (2 Sep)

> "Help page shows 4 of 10 backend topics" — the backlog, line 1207.

That was true, and the half nobody had written down is worse than the half
that was.

`knowledge.ts` curates **ten** topics; `app-help-page.tsx` hand-wrote **four**
cards. The assistant answers out of the ten and cites its sources through
`helpTopicToSource`, whose url is `/app/help#help-<id>`. `openSource` resolved
that with `document.getElementById(...)` and, finding nothing, returned.

So for six of the ten topics **the product minted its own dead link**: you
asked a question, it answered, it offered you the source it answered from, you
clicked, and nothing happened at all. Not an error, not a scroll — nothing.
That reads as a broken page rather than a missing feature, which is why it is
worse than simply not offering the source.

The bug lived in neither half. It lived in the fact that two halves each kept
their own list.

**Fixed by serving the list.** `GET /ai/help/topics` returns the curated
topics, and the page merges them with the four authored cards keyed by id — the
authored one wins where it exists, every remaining topic gets a card and an
anchor. The four stay hand-written because they carry formatting plain text
cannot (a ⌘K key cap, emphasised control names); the point is not to replace
them but to stop them being the whole library. Keywords are deliberately not
returned: they are matching fuel for the deterministic fallback — 'todo',
'seat', 'item' — not prose to put on screen.

Measured in a browser: **10 topics served, 10 anchors on the page, none
missing.** Before, the page had four ids in its source.

The one remaining way to click a citation and reach nothing was a source
arriving before the topic list loaded. That now falls through to
`window.location.hash`, so it lands when the card mounts instead of being
swallowed.

Six checks in `apps/api/src/modules/ai/help-library.test.ts`, cross-cutting on
purpose, and two in `settings-depth.mjs` (floor 37 → 39) driven off the
server's own list rather than a literal ten — so adding a topic tightens the
check instead of leaving it behind.

**One of the five breaks was missed on the first attempt, and that is the
useful part.** The check for "the page renders more than the authored four"
asserted that `allFaqs` appeared somewhere in the `filteredFaqs` assignment. It
passed with the unfiltered branch put back to `faqs` — the original bug —
because the filtered branch says `allFaqs.filter(...)` and one match satisfied
it. Rewritten to assert that *no* branch renders the authored list alone.
Break-testing is the only reason that was caught; the check had been green and
meaningless.

The browser break says it best: `every cited topic has somewhere to land
(4/10) — no card for: docs, automations, time-tracking, goals, search,
ai-assistant`.

## Reading the queue was what destroyed it (2 Sep)

The Replies page moved in one direction only. Opening a row marked it read on
the way out (`workspace-replies-page.tsx:152`), and its single button did the
same thing again. There was no mark-unread anywhere on the page.

`POST /notifications/:id/unread` has existed all along, and the Inbox has been
calling it all along (`workspace-inbox-page.tsx:558`). Built; never joined up
here. That is the third time this audit has found the same shape, and it is
becoming the signature defect of this codebase: the capability is present, the
door is missing, and nothing fails.

What it costs is specific to *this* page. Replies exists to hold the things you
still owe somebody. A queue you cannot put anything back into is one that
browsing empties — one click to look, and it is gone from the list for good.
That is worse than a missing feature, because it punishes exactly the thing the
page is for.

**Fixed.** The row now offers the inverse of whatever state it is in: Resolve
while unread, Mark unread once read, both wired to the endpoint the Inbox uses.
No new i18n — `inbox.markUnread` already existed in all four locales, which is
its own small evidence that this was an omission rather than a decision.

Four checks in `chat-message-actions.mjs`, floor 62 → 66. Two things about how
they are built are worth keeping:

- The reply is **seeded from the other account**, because a reply to your own
  message notifies nobody — a check with nothing to act on passes by not
  running.
- It is driven on the **All** tab. The page defaults to `unread` (`:65`), so a
  resolved row leaves that list at once; watching it vanish would say nothing
  about whether there is a way back. All is the only tab where both states of
  one row are visible, which is the only place the question can be asked.

Two breaks, both caught, and the second is the one that earns its keep:

| break | what the check said |
|---|---|
| the way back removed | `the row is read with no way back — the queue is destroyed by reading it` |
| the button present but wired to nothing | `the button changed the screen but not the record` |

The second only fails because the check reads the notification back from the
server rather than believing the screen. Every "built but not joined up" defect
in this document would have passed a check that only looked at the DOM.

### Two false starts, recorded because both would have read as product bugs

1. The first version queried notifications immediately after posting the reply
   and found none — the row is written after the response returns. That looked
   exactly like "no notification is created", which is a defect report I would
   have filed against working code. It polls now rather than sleeping.
2. The second matched the notification by title, on the assumption the title
   carried the message. It carries the **channel name** (`New reply in
   #channel`). It now snapshots notification ids before seeding and takes the
   one that was not there before.

### A check a real message could turn red

The full-set run surfaced this one, and only the full set could: `video-regression`
failed on `A2.6 — Other is back on the inbox` while passing on its own.

The cause was not the product. It was a diagnostic *I* had run minutes earlier,
which posted a chat reply with the body `other replies`. The check read the
whole inbox page as text and asserted the word "Other" appeared nowhere — so a
notification containing the word failed it.

That is a false alarm today and a worse thing tomorrow. "Ask the other team" in
any message would turn it red, and a check a real message can break is one
people learn to re-run until it goes green. It also failed in the other
direction: `Later is reachable` was satisfied by any message containing the
word "later", so the tab could have gone missing and the check would still have
passed.

Now scoped to a new `inbox-controls` testid on the bucket row, so the
assertions mean what they say — *which buckets does the inbox offer* — rather
than *what words are on the page*. "Clear all" moved from a text scan to its
existing testid at the same time, which also survives translation.

Break-tested by putting an Other chip back: caught, and the failure now names
the row it read — `Other is back among the inbox controls: Inbox 111 Later 0
Cleared 40 Other All 50 Primary 11`. The old check could only say "Other is
back on the inbox" and leave you to find out where.

The litter that exposed it is left in place deliberately: the notification with
"other" in its body is still in the dev database, and the check passes anyway.
That is the demonstration.

## The sidebar tree could not be searched (2 Sep)

> "no Customize footer or tree search" — the backlog, line 1213. Customize
> exists (the dock's ⚙, and deliberately xl-only — see G07-7). Tree search did
> not.

The sidebar had exactly one text box, the workspace switcher's, and even that
only appears past six workspaces (`workspace-sidebar.tsx:1186`). The
space/folder/project/list tree had no filter at all: the only way to reach a
list was to remember which space it lived in and expand your way down.

**Fixed** with a filter above the tree. Two decisions are the whole design:

1. **A space is kept when it matches *or any of its descendants do*.** Matching
   only top-level names would hide every list whose space is called something
   else — which is most of them. That is the same shape as filtering a page of
   results after slicing it: the thing you searched for is structurally
   unreachable, and the control looks like it works.
2. **While a filter is active everything reads as expanded, and the user's own
   expansion state is never written to.** A match inside a collapsed space
   would otherwise be in the tree and impossible to see; force-expanding for
   real would silently destroy the arrangement they left, which clearing the
   box could not put back.

The box renders whatever the tree contains, unlike the switcher's. A filter
that hides itself until you have "enough" items is one nobody discovers, and
the count at which it starts mattering is not the same for everybody.

Seven checks in `panel-collapse.mjs`, floor 49 → 56, seeding **three** spaces
with the target list buried in the third. The seeded workspace has one space,
and against one space a filter that matched everything and a filter that worked
would both leave one row on screen and both read as a pass — the forward
modal's ten-item cap all over again. What gets typed is the **list** name, not
the space: searching for a space name would pass even with descendant matching
broken.

Four breaks. Three caught first time: top-level-only matching (`0 of 4` — the
filter matching nothing at all), matches left hidden inside collapsed spaces,
and clearing not restoring the tree (`0 vs 4`).

### The fourth was missed, and it is the third time this session

Emptying the no-match message to `{''}` **passed**. The check asked
`isVisible()`, and the div still renders — still has padding, still has a box.
It was checking that a container existed, which is the opposite of what "says
so" means.

That is now three checks in one session that break-testing found to be green
and meaningless, and they share a shape:

| check | what it asserted | what it should have asserted |
|---|---|---|
| forward source id | a variable name appeared | the id and body come off one object |
| help library | `allFaqs` appeared *somewhere* | no branch renders the authored four alone |
| tree no-match | the element is visible | the element has words in it |

Each one asserted the presence of a thing rather than the property that made
the thing worth having. It now reads the text back:
`a search that matches nothing says so ("Nothing here matches that.")`.

## Customize Inbox was named after settings it did not have (2 Sep)

The frame audit spells out the drawer behind the gear on the Primary tab:

> "Inbox settings drawer: **Show All tab, Group by date, Sort by newest first,
> Display mode** — the gear on the Primary tab that opens 'Customize Inbox' —
> the container she goes through to reach Customize importance."

We had the importance list she reaches *through* that drawer, and none of the
three settings the drawer is named for. The inbox had **no sort or order state
at all** — the server's order was walked straight into day buckets.

### One thing checked and deliberately not changed

The other half of this backlog line — "no funnel filter on the inbox" — read
as the gear being hidden unless you stand on Primary. It is, and that is
correct: the code comment quotes her saying so, *"Primary pe yeh setting ka
option hai"*. Verified before touching it, because "fixing" it would have moved
a control she put somewhere on purpose.

### What was built

Three settings in the drawer, above the importance list: **Group by date**,
**Sort by newest first**, and a **display mode** (comfortable / compact).

They live in `notificationPreferences` beside `primaryTypes`, so they are
per-user and server-side. localStorage was the alternative and it is the same
complaint as the sidebar favourites: an inbox you arranged on one machine that
comes back unarranged on the next. No migration — the column is jsonb and
already carries `primaryTypes`.

Defaulted to the behaviour that shipped before it was a choice — day buckets,
newest first, comfortable — so an account that never opens the drawer sees no
change at all.

Two implementation notes that are the difference between working and looking
like it works:

- **Sorted before grouping, never after.** The buckets are built by walking the
  list and starting a new one when the day changes, so a list in the wrong
  order would produce the same day twice with rows scattered between them.
  Reversing the rendered buckets instead would put the newest day first with
  its oldest row at the top — neither order anybody asked for.
- **Grouping off means one unlabelled run, not one bucket per row.** A header
  above every single notification is the same as no grouping and three times
  the height.

### The checks, and why they read the server

Nine in `video-regression.mjs`. Each of these settings has an obvious way to be
a lie — a checkbox that redraws its own tick and moves no rows, or one that
moves rows and forgets by the next visit — so the checks drive the control,
reload the page, read the list back, **and then read the preference back off
the server**.

Three breaks, all caught:

| break | what the check said |
|---|---|
| sort changes no rows | `the top row did not move: OA Organization Admin Commented Task 53 minutes ago` |
| grouping off still renders headers | `buckets=1 ungrouped=0` |
| the server drops the setting | `server says {"groupByDate":true,"sortNewestFirst":true,"density":"comfortable"}` |

The third took down three checks at once, including the server read. That is
the "changed the screen but not the record" case, and it is the third time this
audit has needed a check that looks past the DOM to catch it.

**One own-goal worth recording.** The server-read check failed first time with
`server says null` — I read `stored.inboxView` where the fixture's `apiClient`
returns `{ status, data, error }`. Undefined is indistinguishable from "the
server did not store it", so the check reported a defect that did not exist
while the feature worked. The tell was that the UI check passed *after a full
page reload*, which cannot happen unless the value is stored.

### The A2.6b checks failed in CI, and the check was wrong twice

Local: 17/17, 822 checks. CI: `The video1 regression sweep` failed. Worth
writing down in full, because both faults were mine and both are the same
mistake in different clothes — **a check that depends on the data it happens to
find**.

**First fault: one row cannot be reordered.** The check compared the top row's
text before and after flipping the sort. My inbox held fifty notifications; CI's
`ensureNotification` makes exactly **one**, and only when there are none. With
one row the two reads are identical and the check fails against working code.
It now seeds two itself, from the peer account, rather than hoping.

**Second fault, found by forcing the seeding path.** The rewrite compared the
whole rendered sequence against its own reverse. That is too strict: `sort` is
stable, so rows sharing a timestamp keep their relative order in *both*
directions and an exact reversal never happens. It failed on correct code and
would have gone on failing intermittently, which is worse than failing always.

Both versions were checking a *proxy* for the promise. The promise is "newest
first", so the row now carries `data-created` and the check reads the instants
and asks whether they run the way the setting says — ties allowed to sit either
way round, because nothing promised otherwise. On screen the time is relative
("53 minutes ago"), which cannot be compared, so the ordering had to be exposed
to be checkable at all.

Two more checks fell out of doing it properly: that the default order *is*
newest-first (never asserted before), and that there are two rows to order at
all, said out loud with the count.

A third, smaller fault: each `go()` is a real page load and closes the drawer,
so a later click into it timed out after 30s and read like a broken control.
The drawer is now reopened before every interaction instead of assumed open.

Verified by running the seeding path deliberately — the branch CI takes and my
machine never does — and then re-running all three breaks, which still fail
with the timestamps printed.
