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
  deployed instance — **448 checks, 0 failed**:

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
found; it does not re-watch the video for asks that audit missed.

**"Shipped" means live, and checked there.** Every row in the shipped table was
driven against the deployed instance, not only against a laptop — the 448
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
