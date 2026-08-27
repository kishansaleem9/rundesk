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
  `verify-email.sh` (4)

**Result: 133 of the 157 are closed. 24 remain open, and they cluster.**

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

### 2. Task creation is much shallower than the flow she walked — `21:36–23:31`

> "jab task banate hain to pehle task ke baad woh DOCUMENT ka poochta hai, phir
> REMINDER ka, phir WHITEBOARD ka, phir DASHBOARD ka"

Our quick-create modal offers **task / doc / list**. Reminder, Whiteboard and
Dashboard are not there (#149).

> "main SLASH click karoongi, phir table bana loon, banners rakhoon … jis tarah
> document ko aap design karte hain, exactly wohi same feature hai"

The slash-command editor exists in **docs** and **chat** — not in the task
description (#148). `task-detail-sheet.tsx` has no tiptap editor at all.

Everything else in that stretch is built: space → list, private at creation,
view choice, assign, **start/due with times**, priority, estimate, dependencies
(own tab), subtasks, checklist.

One naming mismatch worth a decision (#147): she says **TAGS**; we ship
**labels**. Same behaviour — type, press enter, it exists. Different word in
every screen and string.

### 3. The "double navigation" complaint is only half addressed — `10:13`

> "yeh DOUBLE NAVIGATION rakhi hui hai … kyunke yeh SPACE leta hai, aur jab hum
> kaam kar rahe hote hain to it's kind of frustrating"

The **workspace sidebar** collapses to icons — shipped and verified live
(288px → 72px, dock survives, state persists per user).

But the second-level panel — the Chat channel list, the Docs tree — does not
collapse (#79). That column is where the double-navigation cost actually falls,
and it is still there. The keyboard shortcut she'd expect (`Ctrl + \`) is also
absent (#76).

### 4. Chat message actions stop short of what the frames show — `13:59–15:47`

Built: the full emoji library, reply-into-thread, forward **with provenance**,
save → surfaces in Later, copy link, mark unread.

Open: **"Assign" on a message does not assign anything** (#104) — the control
exists in the frames and she names it; there is no assignment behind it. Also
missing: a reminder on a saved message (#99), the `⋯` overflow on the message
toolbar (#106), per-thread mute/follow (#116), and onboarding cards on an empty
channel (#107).

---

## The rest of what is open

| # | Gap | `[time]` |
|---|---|---|
| 10 | Query suggestions / recent-search history | `01:12` |
| — | **Archived** results: the API takes `includeArchived`, no UI ever sends it | `03:52` |
| 15 | "Decline invite" on the invitation screen | `00:18` |
| 33 | AI **Agents** — a separate product from Skills, which we did build | `04:44` |
| 48 | Custom status message — text + emoji + duration, not four fixed presences | `06:42` |
| 49 | Mute notifications **for a duration**, not just on/off | `06:53` |
| 51 | "Download app" in the avatar menu | `07:28` |
| 54 | High-contrast accessibility mode | `07:03` |
| 56 | Help that can **book a meeting** with the team, not just read docs | `07:33` |
| 72 | Workspace switcher: search box, per-workspace avatars, unread dot | `08:37` |

Two of these are near-free. **Archived search** is a toggle wired to a parameter
that already works. **Keyboard shortcuts** (#50) turned out to be *built and
mounted* (`app.tsx:159`) — it is simply not reachable from the avatar menu where
she looked, so that one is a menu entry, not a feature.

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

## Method, and its limits

Each of the 157 gap titles was checked against the current code. Where a check
was ambiguous I resolved it by file and line rather than by commit message —
three of my first-pass results were false negatives caused by grepping the wrong
file, and the sidebar-collapse one would have reported a shipped, live-verified
feature as missing.

What this pass does **not** do is re-watch the video for asks the frame audit
missed. It re-verifies 157 known gaps; it does not look for a 158th.
