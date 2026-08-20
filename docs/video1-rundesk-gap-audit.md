# video1 — what she asked for, and where we actually stand

**Source.** `video1.mp4`, 24:05, 1920×1080, recorded **7 Aug 2026** — i.e. *after* the last
deploy on 5 Aug, so everything she shows is the build that is live now. Roman-Urdu
transcript with English tech terms. Whisper mis-hears "Rundesk" as "Rundex"; same product.

**Method.** 386 timestamped lines parsed out of the transcript, a frame extracted at each
(+1.2s, because the screen catches up a beat after the sentence starts), de-duplicated to
**139 visually distinct frames** with a density floor so a menu opening is never dropped for
being a small pixel change. Frames and transcript were then read *together*, section by
section, and every claim about what we already have was checked by opening the file — the
`file:line` references below are things that were read, not recalled.

Roughly a third of the frames are **our own app**, not ClickUp: she has
`rundesk.theaura.agency` open in a second tab and flips between them. Those frames are the
most useful in the whole recording, because they are her, live, hitting our product.

---

## 0. Stop everything: search is crashing the app in production

This is not a feature request. At **01:01** she clicks our search and gets a full-page crash.

> *"Agar Rundex search mein open karein to yahan pe bhi ek search bar hai… **Filhaal is
> feature ka masla hai — I don't know kya**"*
> ("If we open search in Rundesk there's a search bar here too… right now this feature has
> a problem — I don't know what.")

Frame `015_0101.jpg` shows our error boundary, verbatim:

```
⚠  Something went wrong
   Failed to fetch dynamically imported module:
   https://rundesk.theaura.agency/assets/command-palette-NaNmjPLK.js
   [ Try again ]  [ Go home ]
```

**It is a stale-chunk crash, and the cause is on our side in three places:**

| | Evidence |
|---|---|
| The palette is a lazy dynamic import | `apps/web/src/routes/app.tsx:8` — `const CommandPalette = lazy(async () => { const mod = await import('../components/command-palette') … })` |
| **So is the AI dock** — same failure mode, same blast radius | `apps/web/src/routes/app.tsx:15` — `const AiPanel = lazy(async () => { const mod = await import('../components/ai-panel') … })` |
| Nothing handles a chunk that fails to load | no `ChunkLoadError` / retry / reload guard anywhere in `apps/web/src` |
| The failure is caught by the route boundary, which replaces the page | `apps/web/src/components/route-error-boundary.tsx` (`routeError.goHome` in the catalog) |
| Every deploy deletes the previous hashed chunks | `deploy/deploy-prod.sh:103` — `rm -rf apps/web/dist` |
| A service worker caches the shell across deploys | `apps/web/vite.config.ts:22` — `VitePWA({ registerType: 'autoUpdate' })` |

So: a tab that was open across a deploy (or a service-worker-cached `index.html`) still
points at `command-palette-<oldhash>.js`. That file no longer exists on disk. The dynamic
import 404s, the rejection is unhandled, and the error boundary replaces **the entire app** —
not just the palette. **Opening the AI dock in that same stale tab would do exactly the same
thing**, so the recording almost certainly under-reports how often this is being hit.

**Why our own testing never caught it.** `deploy/verify-ui.mjs` and the browser suites always
open a *fresh* page, so they always fetch a current manifest. This failure only exists for a
session that predates the deploy. That is a real hole in the harness, not just in the app.

**The fix is three small independent changes**, and all three are worth doing:

1. **Retry, then reload once** — wrap dynamic imports so a chunk-load failure triggers a
   single hard reload, guarded by a `sessionStorage` flag so it can never loop.
2. **Stop deleting old assets** — keep the previous build's `assets/` alongside the new one
   so in-flight sessions can still resolve the chunk they were promised. Cheap; a few MB.
3. **Tell the user a new version exists** rather than letting them discover it by crashing.

Everything else in this document is a feature. This one is a live outage on the primary
navigation control, and it should go first.

---

## 1. What she explicitly called missing

These are the ones where she says outright it is absent on our end — the phrases
"humare end par MISSING", "yeh feature bhi missing hai", "humein bhi dena chahiye".

### 1.1 Task types / milestones — `[03:00–03:45]` · size: medium

> *"Koi task aisa bhi ho sakta hai jo ke MILESTONE par jaye… 30 days mein se 22-23 days
> humare working days hain. Ab in 23 days ke liye hum is ko 'task' ka naam nahi de sakte —
> woh MILESTONE hai."* … *"so if we have to create a task, so yahan pe humein woh option hi
> [nahi] deta ke hum task type ko select kar sakein"*

**ClickUp** (frames `343_2145`, `373_2316`): the create modal carries a type selector right
next to the list picker — `[ Personal List ▾ ] [ Task ▾ ]` — and Task types is also a filter
row in search.

**Us.** The backend has task types: `POST /workspaces/:ws/task-types`, and
`PATCH /tasks/:taskId/task-type` (`apps/api/src/modules/tasks/task-types.controller.ts:57`).
The **create modal does not expose it** — `apps/web/src/components/quick-create-modal.tsx`
offers Task/List/Project/Space/Doc tabs and Space→Project→List selects, and no type control.
Frame `058_0340` is our modal with the gap visible.

**So this is a UI gap over a working API,** not new plumbing. Add the selector to the create
modal, and add Task types to the search filter panel.

### 1.2 Workspace creation is admin-only — `[08:35–10:05]` · size: medium

> *"Workspace ka option jo hai humein SELECT DOWN karna hai: ke agar member hai woh create
> kar sakta hai; admin to obviously create kar sakta hai; [lekin] jo GUEST hai sirf woh
> create NAHI kar sakta, aur agar koi VIEWER side pe hai to woh bhi nahi."*
> … *"To **YEH FEATURE BHI MISSING HAI** aap ke [end] par."*

**Us.** `apps/api/src/modules/workspaces/workspaces.controller.ts:41` throws
`ForbiddenException('Only a Super Admin can create additional workspaces')`. That is the
exact opposite of what she is asking for.

**Her rule, precisely:** admin ✓, member ✓, **guest ✗, viewer ✗**. And the new-workspace flow
should mirror signup — ClickUp's is a wizard (frame `137_0843`: *"What will you use this
Workspace for?"* → Work / Personal / School, with a progress bar and the warning *"Keep in
mind info can't be transferred across Workspaces"*).

### 1.3 Sidebar will not collapse — `[10:08–11:20]` · size: small

> *"Yahan par ARROW ka option aaye aur main navigation CLOSE kar sakoon… agar main is ko off
> karoon to mujhe bas ICONS show hon — kyunke yeh SPACE leta hai."*

**ClickUp** (frames `160_1028`, `161_1030`): a chevron collapses the second sidebar entirely;
only the icon rail remains and the content area widens. Re-expanding restores it.

**Us.** Collapse exists in `chat-sidebar.tsx` and the list route, but **not in the main
workspace sidebar** — no `isCollapsed` / `PanelLeftClose` anywhere in
`apps/web/src/components/workspace-sidebar.tsx`.

### 1.4 Pinned personal tools in the top bar — `[07:48–08:33]` · size: medium

> *"Main yahan koi bhi tool PIN kar sakti hoon… **YEH FEATURE HUMEIN BHI DENA CHAHIYE**, ke
> woh kaun si cheezein hain jo top [nav] mein rakhna chahta hai, as compared to hum limited
> [de dein]."*

**ClickUp** (frame `120_0748`): the profile menu has a **Personal Tools** list, each row with
a pin toggle — Create task 📌, My Work, Track Time 📌, Notepad 📌, Record a Clip 📌, Talk to
Text 📌, Create Reminder, Create Doc 📌, Create Whiteboard, View People, Create Dashboard 📌.
Pinned ones appear as icons in the top bar; unpinning removes them immediately.

**Us.** Nothing — no `pinnedTools` / `personalTools` anywhere in `apps/web/src`. Our top-bar
icon set is fixed.

### 1.5 Top bar: drop the language dropdown, rethink the bell — `[05:03–05:34]` · size: small

> *"Yahan se English/Urdu — yeh cheez [hata] sakte [hain]; **is ko hum logon ko yahan se
> REMOVE karna chahiye**."* … *"notification yahan le ke jaa rahe hain, to humein yahan bhi
> rakhne ki zaroorat nahi hai."*

**Us.** `apps/web/src/components/app-topbar.tsx:109` renders `<LanguageSwitcher>` in the top
bar. Frames `057_0337` / `166_1043` show it live next to the theme toggle and the bell.

Her point is that the top bar is prime real estate spent on a setting nobody changes twice,
while notifications already have a home in Inbox. Move language into Settings (where ClickUp
keeps it — frame `115_0728`, Preferences → Language & Region), and either drop the duplicate
bell or let members choose via 1.4.

---

## 2. Gaps she demonstrated without labelling them

### 2.1 Search is far thinner than what she walked through — `[00:44–04:35]` · size: large

Frames `016`–`045` are the richest sequence in the recording. ClickUp's modal has, in order:

- **query row** — large text, `×` clear, **Ask AI** pill
- **source tabs** — `All | ClickUp | Google Drive | Gmail | SharePoint | Apps`
- **entity chips** — `Tasks · Docs · Agents · Channels · Messages` + **⋯** + `Filter` + `Sort`
  — clicking a chip fills it grey; clicking again unselects (she demonstrates this twice)
- **⋯ overflow** — a searchable **Shown / Hidden** list letting you choose *which* chips
  appear: Hidden holds Clips, Comments, Dashboards, Files, **Folders**, Forms, Lists, People,
  Spaces. Ticking Folders promotes it into the chip row (frames `035`, `040`)
- **Filter panel** — Assignee `Anyone ›`, Creator `Anyone ›`, Location `Any ›`,
  Status `Any ›`, **Task types** `Any ›`, **Archived** (toggle). Assignee/Creator open
  searchable people lists; Location offers *Suggested: Current location, Personal List* and
  *Browse: Space, Team Space*; Status is `All ✓ / Active / Closed`
- **zero-result behaviour** — *"No exact matches found, but here's a relevant answer from
  ✳ Brain"*, a live reasoning trace (*"Checking what 'vnjfv' points to…"*), the answer, then
  copy / 👍 / 👎 and **Continue with Brain**
- **footer** — *"Press `/` to see all available commands, hit `Tab` to see additional actions"*
- **while typing** — a floating bubble offers prefix completions (`vn`, `vnjf`)

**What we already have** (`apps/web/src/components/command-palette.tsx`): type filters, sort
(relevance/updated/created), status, priority, label, **assignee**, **creator**, archived
toggle, due-date range, custom fields, `/` command mode, and an **Ask AI** row (line 659).
That is a lot — more than I expected before reading it.

**What is genuinely absent:** the source tabs (Drive/Gmail/SharePoint), the ⋯ Shown/Hidden
chip customiser, Folders/Lists/Spaces as searchable types, a **Location** filter, **Task
types** as a filter, the inline AI answer on zero results, and typed-query suggestions.

### 2.2 Inbox: "Other" should go, "Later" should stay — `[11:20–13:20]`, `[13:49–13:58]` · size: small

> *"Ab yahan jo 'OTHERS' wala option hai — yeh mujhe NAHI CHAHIYE humari list mein, kyunke
> yahan bhi same 'All' wale hi [hain] — to yeh nahi chahiye. **Lekin 'LATER' ka chahiye.**"*

**ClickUp** (frame `178_1123`): five tabs — `All | Primary | Other | Later | Cleared` — plus
Filter, a gear, and Clear all.

**Us.** `apps/web/src/pages/workspace-inbox-page.tsx:194` — `InboxFilter = 'all' | 'primary'
| 'other'` chips over `inbox | later | cleared` buckets. **We have an "Other" and she does
not want one.** Removing the chip is a few lines; the interesting part is that our
arrangement was a deliberate call in the earlier audit, and she has now overruled it.

### 2.3 Notification importance is far more granular than ours — `[11:44–12:45]` · size: medium

**ClickUp** (frames `185_1151`, `190_1211`) — a **Customize Inbox** panel:
Show All tab ⬤ · Group by date ⬤ · Sort by newest first ⬤ ·
**Customize importance  11/42 ›** · Display mode **Fullscreen | Inline** ·
Notification settings · Keyboard shortcuts.

Behind *Customize importance*: a searchable list of **42 notification types** split
**Important / Not Important**, each a toggle — Mentioning me, New comments, Assigned to me,
Assigned to my Team, Added to my priorities, Reactions, Shared with me, Access requests,
Assigned comments, Assignee change, **Follower change** … and under Not Important: Resolved
comments, Task created, Subtask created, Status change … with **Reset to default** and the
note *"Any changes to these settings will only take effect on new notifications."*

**Us.** `GET/POST /notifications/preferences` exists — but not this shape. Worth checking
whether ours can express "this type is important" per user, or only channel on/off.

### 2.4 Chat message actions — `[13:59–15:50]` · size: medium

**ClickUp** (frame `225_1416`): hovering a message reveals quick reactions 👍 ✅ 🔥 😊 then
reply, **forward**, **save**, assign, resolve, AI, ⋯. Replies thread *under* the message
(*"1 reply Today at 5:37 PM"*, frame `237_1507`). Saved messages get a 🔖 **Later** flag and
show up in Inbox → Later, where they can be opened, edited, assigned, or jumped into thread.

**Us.** Saved messages exist (`GET /workspaces/:ws/chat/saved`). **Forward does not** — no
`forward` anywhere in `apps/api/src/modules/chat/chat.controller.ts`.

### 2.5 Cleared notifications should age out after 30 days — `[15:51–16:40]` · size: small

> *"after 30 DAYS baad woh saare notifications automatically VANISH ho jayenge. ClickUp ka
> storage [system] TRASH ki tarah hi hai."*

**Us.** No retention/purge logic in `apps/api/src/modules/notifications/`. Cleared
notifications accumulate forever. (Trash already has this concept; notifications do not.)

### 2.6 Profile page is much richer than ours — `[05:35–06:35]` · size: large

**ClickUp** (frames `093`, `098`, `103`) — a right-hand profile panel with tabs
**Activity | Tasks | Comments | Calendar | Org Chart**:

- Activity: **+ Add time off**, email, **local time**, **manager** ("No manager assigned"),
  a **Priorities** block (*"Add your most important tasks here"*), then an activity feed
- Tasks: **Today / Overdue / Next / Unscheduled / Done / Delegated**, each with a count
- Org Chart: reporting line rendered as a tree, with *"Explore the full org chart —
  1 person in your reporting line"*
- Header: **Get StandUp** button, presence, description

**Us.** We have presence and a reporting line (`managerId`), and a Workload page, but no
consolidated profile panel of this shape.

### 2.7 Skills — an agent that does your job — `[17:38–19:15]` · size: very large

> *"is ka matlab yeh hai ke aap jo kaam karte ho woh aap ka AGENT kar sakta hai; aap REPLACE
> ho sakte ho… Aur yeh skill humein create karni hai — same on the Rundesk."*

**ClickUp** (frames `290`, `296`, `301`): a **Skills** page — `+ New Skill`, a carousel of
starters (**Skills Miner** "Turn repeat work into skills" → *Find my Skills*; **For your
team** → *Scan my workspace*; **Start from scratch**; **Delegate Like Me**; **Brand Voice**;
**Triage Tasks Like Me**), tabs *All Skills / Enabled / Created by me*, table + grid view
toggles, and an empty state: *"Skills teach Brain how you work — turn a repetitive workflow
into a skill that Brain reuses, so you never explain it again."* Alongside it, an AI chat
panel with a reasoning trace, a **Skills** context chip and a **model picker (Max ▾)**.
She also names **Memory** (stores what you discuss) and **Connections** (connect a skill to
any system).

**Us.** Nothing — no `Skill` anywhere in `apps/web/src/pages`. This is a product in its own
right, not a feature; it needs scoping before it needs building.

### 2.8 SyncUp — calls inside the app — `[19:16–21:15]` · size: very large

**ClickUp** (frames `311`, `319`, `329`): a pre-join dialog (camera preview, mic/camera/
background buttons, device pickers with a live level meter, *"Always show preview before
joining"*, **Start SyncUp**), then an in-call UI with participant tiles, screen share
(Chrome Tab / Window / Entire Screen + system audio), invite participants, reactions, chat,
thread minimise, **Leave**, and an **AI Notes: Off** toggle that — once enabled server-side —
records the call and writes the notes.

**Us.** No calling anywhere. This was skip #1 in the previous audit and it remains the single
largest item in either recording. The **meeting record** work already shipped (migration
0092) is the half that *does* exist — and it is exactly the place AI Notes would land.

### 2.9 Smaller, concrete asks

| # | Ask | Timestamp | Where we stand |
|---|---|---|---|
| a | Loading state must show skeletons/icons, never a blank screen | `00:00–00:14` | 7 files use `animate-pulse`; needs an app-shell audit for the routes she'd hit |
| b | Google Drive linked so Drive files show in search results | `04:04–04:30` | No Drive integration in `apps/api/src/modules` |
| c | Theme: Light / Dark / **Auto** + an accent palette | `07:11` (frame `113_0716`) | We have a light/dark toggle; no Auto, no accent colours |
| d | Keyboard shortcuts list, Download app, Help → docs *and* live chat | `07:16–07:45` | Not present in our profile menu (frame `166_1043` shows ours: Profile / Workspace settings / Help & support / Reset dock position / Sign out) |
| e | Set status + Mute notifications from the avatar menu | `06:36–06:53` | `presenceStatus` exists in `app-topbar.tsx:789`; no "Set status" or "Mute" entry in the menu |
| f | Followers on a task via a bell, without assigning | `13:22–13:47` | **Already built** — `POST/DELETE /tasks/:taskId/watchers` |
| g | Replies with Unread / Read | `16:41–17:30` | **Already built** — `workspace-replies-page.tsx:26` |
| h | Task detail: time estimate, subtasks, checklist, dependencies | `23:31` | estimate + subtasks + checklist built; **dependencies were deliberately reverted** pending her clarification |

---

## 3. Things she showed that we already have

Worth stating plainly so none of this gets rebuilt:

- Task **watchers/followers** with a bell — §2.9f
- **Replies** route with Unread/Read/All — §2.9g
- **Saved messages** → surfaced in Later
- Search: assignee, creator, status, priority, label, archived, due-date range, custom
  fields, sort, `/` command mode, **Ask AI** row
- Inbox buckets (inbox/later/cleared) and a Primary/Other split
- Presence status, reporting line (`managerId`), list `visibility: public | private`
- Task dates with **times** (`datetime-local`, `task-detail-sheet.tsx:4368`)
- Meeting **records** with attendees, recording URL, notes → action items (migration 0092)

---

## 4. Needs a decision from her, not code

1. **Dependencies** were reverted last round awaiting her example. She mentions them again at
   23:31 only in passing. Worth closing out.
2. **Skills** and **SyncUp** are each larger than everything else in this document combined.
   They need a scope conversation and a budget, not an estimate.
3. **"Other" tab** — she wants it gone; our previous audit argued for keeping the state. Her
   call wins, but the underlying notifications still need somewhere to go.

---

## 5. Suggested order

**Now — it is broken in production**
0. Stale-chunk crash on search (§0). Three small changes, plus a harness gap to close.

**Fast, high visible value**
1. Task type in the create modal (§1.1) — UI over a working API
2. Remove "Other" from Inbox (§2.2); language dropdown out of the top bar (§1.5)
3. Sidebar collapse to icons (§1.3)
4. 30-day retention for cleared notifications (§2.5)

**Substantial but well-understood**
5. Workspace creation for members, guests/viewers excluded (§1.2)
6. Pinned personal tools (§1.4)
7. Search: Location + Task types filters, Folders/Lists/Spaces as types, the ⋯ chip
   customiser (§2.1)
8. Notification importance model (§2.3); message forward (§2.4)
9. Profile panel (§2.6)

**Scope first**
10. Skills (§2.7), SyncUp (§2.8), Google Drive search (§2.9b)

---

*Frames live in the session scratchpad; the frame↔timestamp map is `/tmp/v1_kept.json`.
Every "we have this" line above was verified by opening the file cited.*
