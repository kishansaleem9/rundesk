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
