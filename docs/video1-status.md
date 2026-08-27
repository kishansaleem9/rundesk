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
- **Verified on** `https://rundesk.theaura.agency` — 295 checks across
  `verify-ui.mjs` (186), `verify-release.sh` (72), `syncup-live.mjs` (33),
  `verify-email.sh` (4). Since that run, `verify-release.sh` has grown to 95 and
  two suites are new — `chat-message-actions.mjs` (25) and `task-depth.mjs`
  (23); all three are pending the next deploy.

**Result: 153 of the 157 are closed. 4 remain open, and they cluster.**

*Kept current as work lands — see the shipped list at the bottom for what moved
and when.*

---

## The four that matter most

Ranked by how long she spent on them and how visible the absence is.

### 1. The profile page is not the page she showed — `05:35–06:35`, frames `087`–`092`

A full minute on one panel, and six of the 157 gaps live here (#36, 37, 38, 40,
41, 42).

> "Yeh meri PROFILE hai; yeh mujhe show karti hai ke meri ACTIVITY kya hai, meri
> EMAIL kya hai, mera TIME ZONE kya chal raha hai, main kis ki TEAM MEMBER hoon
> … meri PRIORITIES kya hain … COMMENTS … CALENDAR … aur yahan mujhe
> ORGANIZATION CHART show ho jayega"

The frames show a ~460px panel that **overlays whatever page you are on** and
answers *who is this person and what are they working on*.

Ours (`app-profile-page.tsx`) is an **account-settings form** — password,
sessions, 2FA, bio, danger zone. Same word, different page.

Partly covered: Home already has Assigned to me / Today+overdue / Personal list,
which is the task half. Missing: the panel itself, a person's **local time**
(`users.timezone` is stored and used server-side for quiet hours but never
rendered as a clock), **Priorities**, the **comments/activity feed**, a person's
**calendar**, and the **org chart** — which exists nowhere in the codebase.

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

### 3. The "double navigation" complaint is only half addressed — `10:13`

> "yeh DOUBLE NAVIGATION rakhi hui hai … kyunke yeh SPACE leta hai, aur jab hum
> kaam kar rahe hote hain to it's kind of frustrating"

The **workspace sidebar** collapses to icons — shipped and verified live
(288px → 72px, dock survives, state persists per user).

But the second-level panel — the Chat channel list, the Docs tree — does not
collapse (#79). That column is where the double-navigation cost actually falls,
and it is still there. The keyboard shortcut she'd expect (`Ctrl + \`) is also
shipped since (see below).

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

## The rest of what is open

| # | Gap | `[time]` |
|---|---|---|
| 33 | AI **Agents** — a separate product from Skills, which we did build | `04:44` |
| 48 | Custom status message — text + emoji + duration, not four fixed presences | `06:42` |
| 49 | Mute notifications **for a duration**, not just on/off | `06:53` |
| 54 | High-contrast accessibility mode | `07:03` |
| 56 | Help that can **book a meeting** with the team, not just read docs | `07:33` |
| 72 | Workspace switcher: search box, per-workspace avatars, unread dot | `08:37` |

**Keyboard shortcuts** (#50) turned out to be *built and mounted*
(`app.tsx:159`) — simply not reachable from the avatar menu where she looked, so
that one was a menu entry, not a feature.

> **Correction, same day.** An earlier version of this list claimed archived
> search was API-only with no UI. It is fully built — state, query parameter,
> saved-search persistence and a filter chip in the palette. The check grepped
> case-sensitively for `archived` and missed `includeArchived`. That is exactly
> the failure this document warns about two sections down, made while writing
> it, and it is why every verdict here is a file and a line.

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
| 27 Aug | #104 assign a message | a real assignment with a chip, a notification, an "assigned to me" list and a done tick — not a mention in the composer |
| 27 Aug | #106 `⋯` overflow | the long tail moved off the bar; right-click is no longer the smaller menu |
| 27 Aug | #99 reminder on a message | `reminders.task_id` became nullable with a `message_id` beside it; `/remind` stopped inventing tasks |
| 27 Aug | #116 per-thread mute/follow | `chat_thread_follows`; beats the channel setting both ways, `@mention` still gets through |
| 27 Aug | #107 empty-channel cards | Add people / Track tasks / Add a doc / Start a SyncUp — Slack import deliberately omitted |
| 27 Aug | #147 tags on a task | the endpoints shipped long ago and nothing ever called them; now a type-and-Enter box, and an idempotent create |
| 27 Aug | #148 slash editor | `/` in the description: table, banner, code, lists — writing markdown, with the renderer taught tables and callouts |
| 27 Aug | #149 create-modal tabs | Reminder / Whiteboard / Dashboard, in the order she named them |

---

## Method, and its limits

Each of the 157 gap titles was checked against the current code. Where a check
was ambiguous I resolved it by file and line rather than by commit message —
three of my first-pass results were false negatives caused by grepping the wrong
file, and the sidebar-collapse one would have reported a shipped, live-verified
feature as missing.

What this pass does **not** do is re-watch the video for asks the frame audit
missed. It re-verifies 157 known gaps; it does not look for a 158th.
