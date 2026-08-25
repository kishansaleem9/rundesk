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

**It is a stale-chunk crash, and the cause is on our side in three places** (the `file:line`
references below describe the code *as it was when the video was recorded* — §0.1 has what
it looks like now):

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

Everything else in this document is a feature. This one is a live outage on the primary
navigation control, and it should go first.

### 0.1 Reproduced, then fixed

Her note that *"in my browser it was opening fine"* is not a contradiction — it is the
diagnosis. A browser that loads the page **after** a deploy fetches the current manifest and
asks for chunks that exist. Only a session that predates the deploy asks for a deleted one.

Reproduced locally end to end (`test/e2e/stale-chunk-recovery.mjs`): two real builds, a tab
opened on the first, the server flipped to the second underneath it. Clicking search produced
the video's screen character for character —

```
Something went wrong
Failed to fetch dynamically imported module: …/assets/command-palette-C0vgjVgR.js
Try again  Go home
```

Three things the reproduction turned up that the read-only pass had not:

- **The blast radius is the whole app, not search.** Every screen is a dynamic import —
  47 generated lazy routes plus the palette and the AI dock. Search is simply what she
  clicked. In the negative-control run, clicking a sidebar link went blank instead.
- **The service worker made a plain reload useless.** `vite-plugin-pwa` defaults
  `workbox.navigateFallback` to `index.html`, which registers a `NavigationRoute` *ahead of*
  everything in `runtimeCaching`. So every navigation was answered from the worker's own
  precached shell, and the `NetworkFirst` HTML rule written in `vite.config.ts` had never
  matched a single request. A recovery reload landed straight back on the stale shell, whose
  entry chunk 404s too — a blank page.
- **`globPatterns` precached all 60 chunks**, directly against the intent of the comment
  above it ("Don't precache the JS bundle on every release — it breaks updates"). With
  `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches`, a new release activated under an
  open tab and deleted the chunks that tab was still importing.

**What changed** (all verified by the 19-check suite below, which fails 5 checks when the
recovery path is disabled):

| | |
|---|---|
| `apps/web/src/lib/chunk-reload.ts` | new. Recognises a chunk-load failure in any engine, retires the service worker and its caches, then reloads — once per 30s, so a genuinely broken deploy fails honestly instead of spinning. |
| `apps/web/src/main.tsx` | listens for `vite:preloadError` and chunk-shaped `unhandledrejection`, which is what covers all 47 generated routes without touching the generated file. |
| `apps/web/src/components/route-error-boundary.tsx` | a stale chunk now reads "Updating Rundesk…", not "Something went wrong". |
| `apps/web/vite.config.ts` | `navigateFallback: undefined` so navigations go to the network; chunks out of the precache and into a runtime `CacheFirst`. Precache: 69 entries → 6. |
| `deploy/nginx/…conf` | `index.html` and the worker files get `Cache-Control: no-cache`. They had no cache headers at all, so browsers applied heuristic freshness. |
| `deploy/lib/publish-web-dist.sh` | both deploy scripts publish through it. It keeps two generations of chunks on disk — this build's and the previous build's — so an open tab never 404s in the first place: no reload, no interruption. Shared, because `deploy.sh rebuild` is what the GitHub Actions deploy actually runs and a fix in only one script never reaches production. |

### 0.2 It took two goes to land

The first deploy of this carried the old chunks over and then deleted them one
line later:

```bash
cp -an apps/web/assets.prev/. apps/web/dist/assets/     # carry the old release over
find apps/web/dist/assets -type f -mtime +14 -delete    # …and immediately bin it
```

The preceding build was 15 days old, so `-mtime +14` matched every carried file.
The verification caught it — `assets on disk (was 61) : 61`, and the chunk an
open tab needed still answering `HTTP 404` — but only because the check was
written to look at the outcome rather than at whether the code ran.

File age was never the right signal, twice over: deploys here can be weeks
apart, and `--output type=local` writes the mtimes baked into the Docker layer,
so a *cached* `vite build` layer exports files stamped with whenever that layer
was first built. Generations are tracked by manifest now
(`apps/web/.build-assets`), and `test/deploy/publish-web-dist.test.sh` publishes
three releases in a row and asserts what survives — it fails on exactly the
prune that shipped.

**The harness gap is closed too.** `deploy/verify-ui.mjs` always opens a fresh page, so it
structurally cannot see this; the new suite stages two releases and runs in CI.

---

### 0.3 The waiting states were three bugs, not one

§2.9a read as "use the Skeleton component we already built". Driving the app
with each response held open found four separate blank waits, three of which
were invisible from the code:

- **`<head>` blocked the parser outright.** `vite-plugin-pwa` injects a
  *classic* `<script src="/registerSW.js">` as the last thing in `<head>`, and a
  classic script waits on any stylesheet still in flight. `<body>` could not be
  parsed — `document.body` was measurably `null` — let alone painted, until both
  the app CSS and that script had landed. No skeleton anywhere in the app could
  have shown, because the app's markup did not exist yet.
- **Deep links rendered nothing at all.** Landing on `/app/:ws/docs` with that
  chunk held for four seconds left `<body>` completely empty: no sidebar, no top
  bar. `RouterProvider` renders nothing until the first match resolves, so no
  in-router fallback covers it.
- **`defaultPendingComponent` does not fire for our routes.** Every route is a
  `.lazy()` chunk with no loader, so the match never enters the status that
  option keys off. Navigating left the *previous* page frozen on screen for the
  whole fetch.

Plus the one the audit did predict, worse than described: pages reading
`query.data ?? []` rendered their **empty state** while the request was in
flight — telling you your inbox was empty before knowing.

`test/e2e/loading-states.mjs` holds each response open and looks at the screen
while it is outstanding: 17 checks, 16 of which fail against the previous build.


### 0.4 Two things only the deployed instance would tell us

Both suites were green against a local build, and both of these were still
broken on the server.

**Task types existed and no workspace had any.** The feature shipped with a
working API and an empty table — nothing ever created a default set. The picker
added to the create modal hides itself when a workspace has no types, so §1.1
was invisible on production while passing every local check: the local test
seeded two types in its stub, which is precisely why it passed there. Migration
0093 backfills Task and Milestone; workspace creation seeds them going forward.
The check no longer reports "nothing to check" — an absent feature is a
failure, not a skip.

**A migration can ship, deploy, and do nothing.** `drizzle-kit migrate` works
from `meta/_journal.json`, not from the files on disk, and ignores any `.sql`
not listed there — silently, still printing *migrations applied successfully*.
0093 went out that way: file present, CI green, migration never executed.
`scripts/check-migration-order.mjs` validated filenames and sequence
contiguity only, so it could never have caught it; it now cross-checks every
file against the journal in both directions.

The pattern in both, and in the `-mtime` prune in §0.2, is the same: a step that
runs, reports success, and changes nothing. Checking the outcome rather than
whether the code ran is what found all three.


### 0.5 What auditing against her words, not the diff, turned up

Every one of the six "fast" items passed its own tests and its own production
verification, and every one of them was incomplete. The audit that found this
read her transcript and the code together; the tests could not have found it,
because each test asserted the thing that had been built.

The pattern, in every case: **the requirement was larger than the summary of
it.** Three examples that cost the most:

- §1.5 was recorded as "drop the language dropdown, rethink the bell". What she
  said was three things: remove the bell *"[Default par]"*, put the choice with
  *"humare members"*, and — underneath both — *"humare paas NAV BAR ko set down
  karne ka option nahi hai"*. The answer was not a bell flag but the nav-bar
  control she said did not exist.
- §2.9a was recorded as "show skeletons". The blank screen she named was the
  one after *"new workspace mein le ke aata"* — the workspace Home — and that
  was the one screen left rendering "Nothing here yet" mid-request.
- §1.1 was recorded as "UI over a working API". The API silently dropped the
  field, because the create DTO had no `taskTypeId` and the pipe runs
  `whitelist: true`.

Two smaller lessons worth keeping:

- **A feature nobody can reach is not shipped.** Task types existed with a
  working API and an empty table; every control hid itself; the local test
  seeded types in its stub and passed.
- **A step that reports success is not a step that ran.** Migration 0093 was not
  in the drizzle journal and never executed, while the log said "migrations
  applied successfully". The `-mtime` prune deleted the chunks it had just
  carried over. Both were found by checking the outcome rather than the code.


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

**Us.** Saved messages exist (`GET /workspaces/:ws/chat/saved`) and **forward does too** —
`workspace-chat-page.tsx:888` has a `forwardMutation` and a channel picker. My first pass
called forward missing because there is no `forward` in the chat controller; it is
implemented client-side as a re-post, which is why the grep came up empty.

The real gaps here are narrower and were found by reading the frames: a forwarded message
**carries no provenance** — no original author, no source channel, no "View message" link
back (frames `235_1500`, `236_1503` show ClickUp's) — and **saved messages never surface in
Inbox → Later**, which is the entire point of saving one.

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

**Us.** ~~Nothing — no `Skill` anywhere in `apps/web/src/pages`.~~ **Built** (25 Aug 2026),
first slice: `skills` / `skill_memories` / `skill_connections` (migration `0103`), a
`SkillsService` + controller scoped by workspace membership, a hub at
`/app/:workspaceId/skills` with her `+ New Skill`, starter carousel, three tabs and empty
state, a skill page carrying the playbook + **Memory** `[18:42]` + **Connections** `[18:58]`,
and `?skillId=` scoping a chat so a skill actually shapes the reply.

**The boundary, stated deliberately.** A skill is a named, reusable playbook — a persona plus
instructions — and it **does not act unattended**. Nothing in the video shows one doing so:
every frame is a person asking and the assistant answering, down to the approval gate at
`[18:58]` ("Approve this approach and I'll create it"). Building autonomous action would be
inventing an authority nobody granted. When it is wanted, it should be granted explicitly, on
a surface built for it.

**Corrected 25 Aug 2026, after re-reading the raw transcript and pulling frames directly.**
The first pass built the starter cards — which she calls EXAMPLES `[18:03]` — and skipped the
mechanism she actually demonstrates. `[18:17]–[18:42]`: *"main is ko sab cheezein batati
jaoongi… Pehle to woh apna [data sketch] out karega jo main kaam kar rahi hoon… phir woh meri
poori ki poori SKILL create karega… main yahan pe likhoongi: 'create a personal task organizer
skill', to yeh poori ki poori skill ban jayegi."* That is now built: ask in words, it reports
the lookups it performs, drafts the whole skill grounded in them, and stops on her sentence —
*"Approve this approach and I'll create it, or tell me one tweak you want first"* — with the
follow-up chips that change per answer.

**The boundary, settled from ClickUp's own documentation (25 Aug).** `[17:46]` — *"woh aap ka
AGENT kar sakta hai; aap REPLACE ho sakte ho"* — reads as if a skill should act. It does not,
and this is not our judgement call: in ClickUp these are **two different products**.

> **AI Skills** — "reusable instructions that allow Brain to load the right workflow, format,
> or expertise on demand instead of rewriting the same prompt every time. Think of a Skill as
> a saved playbook… you define the steps, context, and style one time, and Brain follows it
> every time the Skill is used." Invoked by the person: "the /Slash Command for AI Skills
> appears for everyone in the Workspace."
>
> **Autopilot / Super Agents** — the layer that ACTS. They "perform actions based on defined
> triggers and conditions", run on Lists, Folders, Spaces and Chat Channels, and are configured
> with "instructions, triggers, skills, knowledge, and memory" — where "the Skills section
> holds all of your Super Agent's tools."

So a Skill is a **component an Agent uses**, not a small Agent. Her sentence names the
category; the Skills Hub she is demonstrating is the instructions half. An Agent product is a
separate, larger build — and Rundesk already has most of its machinery in `ai-command.ts`
(a bounded tool set, a pure planner, `executeActions`) behind the same propose→confirm gate.

**Corrected the same day:** the library's **Enabled** tab was reading `skills.enabled`, the
author's flag. ClickUp's hub is where you "browse, **install**, and manage" skills, so Enabled
is the set *this person installed* — otherwise three tabs over one library are two views of
authorship and none of use. `skill_installs` (migration `0104`) fixes that; `skills.enabled`
keeps its real meaning as the author's kill-switch over their own skill for everyone.

**Built since:** the **slash command** (`/brand-voice draft the release note` — ClickUp's
primary invocation path: "the /Slash Command for AI Skills appears for everyone in the
Workspace"), per-user **install** so Enabled means what the hub means, **Skills Miner** (reads
the tasks and docs you actually made, and carries the lines that suggested each result), and
**team discovery** ("skills created across your workspace" — a plain query, not a model call).

**All twelve Skills findings are now built.** The nearest thing left is a
different product: ClickUp's **Autopilot / Super Agents**, the layer that acts on
triggers. Rundesk already has most of its machinery in `ai-command.ts` — a bounded
tool set, a pure planner, `executeActions` — behind the same propose→confirm gate a
skill uses. That is a scoping conversation, not a gap in this section.

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
| a | Loading state must show skeletons/icons, never a blank screen | `00:00–00:14` | **We built a `Skeleton` component and never used it** — `packages/ui/src/components/skeleton.tsx`, exported at `packages/ui/src/index.ts:9`, imported by **zero** files in `apps/web/src`. The router has no `defaultPendingComponent`, so ~40 lazy route chunks load into nothing, and `app.tsx:119`/`:132` use `<Suspense fallback={null}>` |
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
0. ~~Stale-chunk crash on search (§0).~~ **Done** — reproduced, fixed in the app, the
   worker, the vhost and the deploy, and covered by `test/e2e/stale-chunk-recovery.mjs`
   in CI. Ships with the next deploy. See §0.1.

**Fast, high visible value — done**
1. ~~Task type in the create modal (§1.1)~~ — **done**. Not only UI: the create
   DTO had no `taskTypeId` and the pipe runs `whitelist: true`, so the client's
   choice was stripped in transit and every task got the list's default. Type
   also added as a search filter, end to end.
2. ~~Remove "Other" from Inbox (§2.2); language dropdown out of the top bar
   (§1.5)~~ — **done**. Language moved to personal settings, not deleted.
3. ~~Sidebar collapse to icons (§1.3)~~ — **done**, persisted, and the boot
   skeleton reads the same preference.
4. ~~30-day retention for cleared notifications (§2.5)~~ — **done**. Measured
   from `dismissedAt`, never `createdAt`; the Cleared view now says so.
5. ~~Never a blank screen while waiting (§2.9a)~~ — **done**, and bigger than it
   looked: see §0.3.

**All of the above are now closed end to end.** An audit of the six against her
transcript — rather than against the diff — found 20 further gaps, of which two
were holes opened by the fixes themselves (a `taskTypeId` accepted from any
workspace, and signup-born workspaces still getting no task types). All are
fixed; §0.5 records what the audit taught.

**Still open**

**Substantial but well-understood**
6. Workspace creation for members, guests/viewers excluded (§1.2)
7. Pinned personal tools (§1.4)
8. Search: Location + Task types filters, Folders/Lists/Spaces as types, the ⋯ chip
   customiser (§2.1)
9. Notification importance model (§2.3); message forward (§2.4)
10. Profile panel (§2.6)

**Scope first**
11. Skills (§2.7), SyncUp (§2.8), Google Drive search (§2.9b)

---

*Frames live in the session scratchpad; the frame↔timestamp map is `/tmp/v1_kept.json`.
Every "we have this" line above was verified by opening the file cited.*

---

## 6. The frame-by-frame pass, and what it changed

The first draft of this document came from reading ~45 frames by hand. A second pass then read
**all 139** — one agent per section, each also opening the code — and produced **143 frame
descriptions, 161 spec items, 272 status rows and 157 distinct gaps**, of which **33 are ones
she flags outright**. The full inventory is the appendix below.

It corrected me in three places, which is the main reason it was worth running:

- **Forward already exists.** I had called it missing on the strength of a grep for `forward`
  in the chat controller. It is implemented client-side as a re-post
  (`workspace-chat-page.tsx:888`), so the grep was evidence about the grep. The real gaps are
  that a forwarded message carries no provenance, and that saved messages never reach Later.
- **The loading gap is much more specific than "audit the app shell".** We *have* a
  `Skeleton` component. It is exported from `packages/ui` and imported by **nothing**. Add the
  router's missing `defaultPendingComponent` and the two `<Suspense fallback={null}>` and the
  fix is mostly wiring something that already exists.
- **Replies is not the finished feature I called it.** The route and its Unread/Read/All tabs
  are real — my browser test confirmed the tabs render — but the page queries
  `/notifications?view=all`, and nothing creates a notification when someone replies in a
  thread. The tabs work; the pipeline behind them does not. That is precisely the shape of
  failure a UI check congratulates you for.

Two agent findings I have **not** promoted into the sections above, because they need
checking against the live instance rather than the repo:

- *"Ship the tabbed inbox to the deployed instance."* Our code has the buckets and chips, but
  frames `014_0053` and `057_0337` show our deployed inbox as a flat `UNREAD · 32` list with
  no tab strip, and she says *"humare paas sirf yeh notification layout hai"*. Either the
  deployed build predates the tabs or they are not rendering there. Confirm before building
  anything.
- *"Start and due dates cannot carry a time of day."* The detail sheet has two
  `datetime-local` inputs (`task-detail-sheet.tsx:4368`) and the DTO takes ISO strings, so
  this is at most true of the **create/quick-add** path, not the product.


## Appendix — every gap the frame-by-frame pass produced

One row per finding, 15 sections, produced by reading all 139 frames against the code.
`!` = she says outright it is missing on our end. Sizes are the agent's estimate, not a quote.

### Search  ·  10 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | small | Command palette chunk fails to load and takes the whole app down | "Agar Rundex search mein open karein to yahan pe bhi ek search bar hai… Filhaal is feature ka masla hai — I don't know kya" — she opens our search, th |
|  | medium | Location filter — scope search to a space, folder or list | "LOCATION ka matlab yeh hota hai ke woh kis space mein para hai, ya kis list mein para hai." |
|  | medium | Folders (and Lists / Spaces) are not searchable entity types | "To yeh 3 DOTS dekh rahe hain? Main yahan se aur points pe click out kar ke, let's suppose ke mujhe FOLDERS mein search karna hai, to folders yahan pe |
|  | large | No AI answer when search finds nothing | "jaise ke maine search kiya par mujhe koi cheez show nahi hui, like for example just mentioned that ke nahi hai" — she narrates the zero-result case a |
|  | small | Entity-type chips are hidden behind a collapsed "Filters" button | "main \"Task\" par click karoongi na — to agar aap yeh dekh rahe ho to yeh GRAY COLOR ho gaya, to woh task mein is cheez ko search karna start ho jaye |
|  | medium | No "⋯" overflow picker to add more entity types to the chip row | "agar lage ke yeh jo ooper unhon ne option diya, us mein se woh cheez nahi hai jo mujhe chahiye — maybe it's on other point — to yeh 3 DOTS dekh rahe  |
|  | small | Assignee and Creator use bare <select> dropdowns instead of searchable people pickers | "Phir yahan se FILTER mein bhi hum jaa sakte hain ke acha, yeh kisi aur ko assign hai, ya phir is ka creator kaun hai… CREATOR ka matlab hai jis ne wo |
|  | small | Task types filter missing from search | Visible in the filter panel she walks through — the row "Task types — Any ›" sits between Status and Archived. |
|  | large | No cross-app source tabs (Google Drive / Gmail / SharePoint / Apps) | Not narrated, but present on screen for the whole section — the tab strip "All \| ClickUp \| Google Drive \| Gmail \| SharePoint \| Apps" sits directl |
|  | small | No query suggestions or recent-search history | Not narrated. Visible in frame 020_0124: a floating bubble above the modal offering "vn" and "vnjf" as clickable completions while she types "vnjfv". |

### Loading & first paint  ·  9 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | large | Kill the blank screen: ship a skeleton loading system using the Skeleton component that already exists but is never imported | "Humare end pe bhi waiting ka jo time period hai woh BLANK SCREEN na ho — woh icons hi hon." While the app is waiting to bring the user into the new w |
| **!** | small | Add a pre-boot app-shell splash to index.html so the very first frame is never an empty dark rectangle | The waiting period must not be a blank screen — same instruction, applied to the cold-load window before any JS runs. |
| **!** | small | Give the router a defaultPendingComponent — all ~40 lazy route chunks currently load into nothing | No blank gap while moving between screens; show the shell/icons during the wait. |
| **!** | small | Replace the two `<Suspense fallback={null}>` with real placeholders | Same rule — the wait shows something, not nothing. |
|  | medium | Add a 'Decline invite' action to the invitation screen (UI + API) | She walks the invite-confirmation screen at 00:18 ("ab yeh mujh se again confirmation le raha hai") — ClickUp's confirmation offers Accept and Decline |
|  | small | Put a 'Need help?' link on the invitation screen | Visible at the bottom of ClickUp's join-team page in frame 008. |
|  | small | Add a global route-transition progress bar | Implied by the same 00:06 instruction — the user should always be able to see that something is happening during a wait. |
|  | medium | Extend the freshness / auto-refresh chrome beyond the Dashboard | ClickUp's Overview toolbar shows '↻ Refreshed: just now', '🕐 Auto refresh: On', 'Customize', 'Add card' — visible in frame 010 alongside the skeleton  |
|  | medium | Workspace Bookmarks — save any Rundesk item or external URL | ClickUp's Overview carries a 'Bookmarks' card: 'Bookmarks make it easy to save ClickUp items or any URL from around the web.' + 'Add Bookmark'. |

### Task types, filters & Drive  ·  9 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | small | No task-type selector in the Create modal (and POST /tasks silently drops taskTypeId) | "Rundex mein, so if we have to create a task, so yahan pe humein woh option hi [nahi] deta ke hum task type ko select kar sakein — jo mujhe add karne  |
|  | small | Task types are invisible in a fresh workspace — no seeded Task/Milestone and the picker self-hides at zero types | Her whole argument is that a member must be able to see at a glance whether a row is a same-day task or a month-long MILESTONE. That only works if the |
| **!** | medium | Search cannot filter by task type | Frames 047/052/061 show "Task types — Any >" as a first-class row in ClickUp's search Filters panel, sitting right beside Status — and she opens the s |
| **!** | medium | Search has no Location filter — every query is workspace-wide | ClickUp's Filters panel offers "Location — Any >" (frames 047/052/061) to scope a search to a space, folder or list. |
| **!** | large | No federated search across connected apps — Google Drive results never appear in the palette | "GOOGLE DRIVE ClickUp ka part nahi hai — woh ek outsourced / outer part hai... Lekin hum is ko LINK kar sakte hain apne ClickUp ke saath. Agar hum Goo |
|  | large | No engagement-based sort modes (Trending In Workspace / Trending For You) | ClickUp's Sort menu (frame 066_0412) offers five modes; Rundesk implements three of them. |
|  | small | Date filtering in search covers due dates only — no created/updated range | "yahan se bhi hum log search kar sakte hain ke abhi hua tha yeh — last created date kya thi — dates ke lehaz par." |
|  | medium | Task type is never shown on a task row — only inside the detail sheet | Her stated purpose for types is at-a-glance CLARITY "kisi bhi member ko" about a row's time horizon. That requires the badge to be on the row, not two |
|  | small | Status filter has no explicit "All" chip | ClickUp's Status submenu (frames 047/052) lists "All ✓ / Active / Closed" — All is a visible, check-marked default. |

### Top bar & AI chats  ·  7 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | small | Remove the language dropdown from the top bar and default the app to English | "Yahan se English/Urdu — yeh cheez hata sakte hain; is ko hum logon ko yahan se REMOVE karna chahiye. Default par." — the language selector should not |
| **!** | medium | No way to configure the nav / top bar — add a nav customization setting | "Lekin humare paas NAV BAR ko set down karne ka option nahi hai; lekin ClickUp pe humein option diya jaata hai." — ClickUp lets you configure what sit |
| **!** | small | Notification bell duplicates the Inbox and offers members no way to configure notifications from it | "Hum notification yahan le ke jaa rahe hain, to humein yahan bhi rakhne ki zaroorat nahi hai — just access; ya phir humein rakhne ki zaroorat hai to y |
|  | large | AI chats are not saved — no conversation list, no "Ask, Build, Create" | "Yeh AI CHATS hain… AI ka involvement bohot zyada hai — naya ClickUp ka vision mainly AI par depend karta hai." ClickUp keeps AI chats as durable obje |
|  | large | No AI Agents product | "AI — in ki CHATS hain, AI AGENTS hain, aur BRAIN hai. Unhon ne teen apne software launch kiye hain." ClickUp exposes an "Agents" control in every vie |
|  | medium | Brain has no branded, always-present entry point | ClickUp puts "✳ Brain²" in the view header of every surface, and names it in the AI Chats tooltip ("Open your AI Brain² Chats"), so the knowledge laye |
|  | small | Sidebar favourites and recents are device-local, so any nav customization is lost on another browser | Implied by the nav-customization ask — a nav you "set down" should stay set down. |

### Profile  ·  12 findings

| | Size | Gap | Her ask |
|---|---|---|---|
|  | large | No person profile panel — /app/profile is an account-settings form, not a profile | 'Yeh meri profile hai; yeh mujhe show karti hai ke meri activity kya hai, meri email kya hai, mera time zone kya chal raha hai, main kis ki team membe |
|  | small | A person's local time is never shown | 'Mera time zone kya chal raha hai' — the profile shows '5:28 pm local time' for the person you are looking at. |
|  | medium | Priorities — no 'today's most important tasks' list | 'Meri priorities kya hain — yaani ke aaj ke din mein mere kaun se important task hain jo karne hain', with a '+ Add' and the empty state '+ Add your m |
|  | medium | Tasks buckets: Next, Unscheduled, Done and Delegated are missing; Today and Overdue are merged | 'Yahan bhi bata raha hai ke TODAY ke kya task hain, OVERDUE kaun se ho gaye the, NEXT kaun se upcoming task mere paas aa sakte hain, kaun si aisi chee |
|  | medium | Org chart is admin-only, hidden by default, and not on a person | 'Yahan mujhe ORGANIZATION CHART show ho jayega' — the person's reporting line drawn as manager node → arrow → their card, with a 'No manager' placehol |
|  | medium | No calendar on a person, and Google Calendar sync is not discoverable from the profile | 'CALENDAR — mera hi calendar show ho sakta hai, Google Calendar sync up kar sakti hoon.' |
|  | medium | No per-person task activity feed (and no search/filter on activity) | 'Jis jis task ko open kiya hoga, jis document pe kaam kiya hoga — bas woh yahan pe show honge', with a search icon and a filter icon on the feed heade |
|  | small | 'Add time off' is not reachable from a profile | '+ Add time off' sits as the first row of the profile's Activity tab, right above the person's contact details. |
|  | small | 'Set status' — no custom status message, only four fixed presence values | A 'Set status' row in the avatar menu, separate from online/offline, plus the status pill on the profile header ('⊘ Offline'). |
|  | small | Team membership is not visible or selectable from a person's profile | 'Main kis ki TEAM MEMBER hoon — yahan pe main woh select down kar sakti hoon.' |
|  | medium | No 'Get StandUp' — no per-person work summary | A '✦ Get StandUp' button sitting next to the message button in the profile header, generating what this person has been doing. |
|  | medium | Avatar menu is thin: no Notifications, Themes, Keyboard shortcuts, or Personal Tools section | The dropdown behind the avatar carries Set status, Mute notifications, Settings, Notifications, Themes, Keyboard shortcuts, Download app, Help, then a |

### Status & settings  ·  10 findings

| | Size | Gap | Her ask |
|---|---|---|---|
|  | large | Custom status message: text + emoji + duration, with recents and presets | 'SET STATUS ka matlab yeh hota hai ke main break pe jaa rahi hoon… mere team member ko nahi pata ke main break pe jaa rahi hoon; agar unhon ne group m |
|  | small | Mute notifications for a duration (submenu), not just on/off | 'NOTIFICATIONS, Mute ka option hai' — the ClickUp row carries a '>' chevron, i.e. mute for a chosen length of time. |
|  | small | Keyboard shortcuts are unreachable from the UI | 'yahan pe SHORTCUTS ke baare mein bataya hai — shortcuts jo hain woh ClickUp ne diye hain ke aap kis tareeqe se woh cheez jaldi kar sakte ho; yeh unho |
|  | small | 'Download app' entry in the profile menu | 'ClickUp app download ka option hai' — a permanent menu row that opens the app download in a new window. |
|  | small | Language picker missing from the personal settings page | 'setting different layout pe jaati hai: apna name, email aur woh sab cheezein, aur neeche se themes wagera, languages, time format — yeh sab cheezein  |
|  | small | Timezone is a free-text box, and there is no timezone-change notice | ClickUp's Language & Region section: a Timezone dropdown showing 'Asia/Karachi' plus a checked 'Notify me of Timezone changes'. |
|  | medium | No high-contrast accessibility mode | ClickUp Preferences > Contrast: 'Turn on and off high contrast text and borders' → toggle 'High Contrast for increased accessibility'. |
|  | medium | Per-user accent colour theme (and a 'Themes' entry in the profile menu) | 'themes wohi ke hum log kya themes rakh sakte hain' — the ClickUp 'Themes' menu item opens Customize > Themes with a named colour palette: Black, Purp |
|  | medium | Help cannot book a meeting with the Rundesk team | 'agar Help pe click karti hoon to main ClickUp ki team se — ya to yeh documents read se koi bhi information le sakti hoon, ya phir main ClickUp ki tea |
|  | medium | Help page is four hard-coded FAQs, not a documentation library | 'ya to yeh documents read se koi bhi information le sakti hoon' — read the docs to get any information you need. |

### Pinned tools  ·  7 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | large | Per-user pinnable tools in the top bar (pin/unpin from a Personal Tools menu) | Users should decide which tools sit in the top bar for easy access and which do not — instead of us shipping a fixed limited set they have to live wit |
| **!** | medium | "Personal Tools" launcher section in the user/avatar menu | When you click your profile there should be a TOOLS list — task creation, timing, notepad, clip recording, voice, doc, whiteboard, dashboard — each wi |
|  | medium | Notepad — personal scratch notes | One of the seven icons she pinned is the Notepad; it is a first-class Personal Tool in ClickUp's list. |
|  | medium | Standalone reminder not bound to a task | "Create Reminder" appears in ClickUp's Personal Tools list as a top-level thing you can make from anywhere. |
|  | medium | Global entry points for Record a Clip, Talk to Text and Track Time | Loom-style recording, voice recordings and timing are three of the icons she has pinned in the top bar — one click from anywhere. |
|  | small | Sidebar nav Favorites are browser-local, not account-level | The whole point of pinning your tools is that YOUR choice follows you. ClickUp's pin state is on the account. |
|  | small | Dock settings has no tool picker and is desktop-XL only | The user chooses what goes in the quick-access strip; today we choose for them. |

### Workspace creation  ·  9 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | medium | Workspace creation is super-admin-only; must be opened to member/manager/admin and closed to guest (and viewer) | "Workspace ka option jo hai humein SELECT DOWN karna hai: ke agar member hai woh create kar sakta hai; admin to obviously create kar sakta hai; lekin  |
| **!** | large | No in-app create-workspace wizard — 'New workspace' is a bare one-field name dialog | "Main 'New Workspace' par click karoongi, main new workspace bana sakti hoon — phir same layout jo aap ne abhi kiya tha [signup ke waqt]." … "To works |
|  | small | Workspace-purpose step (Work / Personal / School) does not exist | "Phir poochega — 'xyz' likhoongi to meri new workspace ka naam hai" preceded by the purpose question "What will you use this Workspace for? Work / Per |
|  | medium | Feature-picker answers are collected and then silently thrown away | Implicit in "same layout jo aap ne abhi kiya tha" — the feature picker she demonstrates (Automations, CRM, Chat, Dashboards, Clips, Goals & OKRs, Form |
|  | medium | No 'skip / which tool are you coming from' step in the creation flow | "Skip [ya] step, aur yahan se different tool search kar sakti hoon." |
|  | medium | A workspace a member creates is not private to them — it is attached to the caller's existing organization | "Ab agar maine workspace banayi to yeh mere par dependent hai ke maine apne members ko share karna hai ya nahi karna, kyunke woh meri email pe ban rah |
|  | medium | A newly created workspace is completely empty — no default Space, List, or channels | Implicit from frames 146/147 — after Finish the new ClickUp workspace already contains Space > List, All Tasks, and the General + Welcome channels, so |
|  | small | Workspace switcher has no search box, no per-workspace avatars, and no unread indicator | On-screen in frames 146 and 149: the "Switch Workspaces" section header carries a magnifier icon, and every workspace row shows a colored letter-avata |
|  | small | No account-level 'Workspaces' page under user settings | Visible in frames 133 and 136: ClickUp's account settings has a "My Settings" group containing Preferences, Notifications, Workspaces, Chat, Referrals |

### Navigation  ·  8 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | medium | Sidebar collapse arrow — click to close the whole nav column | "yahan par ARROW ka option aaye aur main navigation CLOSE kar sakoon — mujhe nahi chahiye to space le… arrow mein is ko click karti hoon, yeh navigati |
| **!** | medium | Icon-only rail when the sidebar is collapsed | "agar main is ko off karoon to mujhe bas ICONS show hon" / "warna humein sirf ICONS show honge" |
|  | small | Keyboard shortcut + tooltip for the sidebar toggle (Ctrl + \) | Not spoken — read off frame 175, where ClickUp's expand button tooltips "Open sidebar  Ctrl  \". |
|  | small | Persist the collapsed state per user and per workspace | Implied by "humari navigation ek baar mein chali jaye" — she wants it to stay gone, not re-open on every navigation. |
|  | small | Below 1024px there is no workspace navigation at all — the hamburger is dead code | Not spoken — found while verifying the collapse work. |
|  | medium | Second-level panel (Chat / Docs) also needs a collapse — this is where Rundesk's "double navigation" actually costs space | "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai" |
|  | small | "Reset dock position" in the user menu does nothing | Not spoken — it is on screen in this section's own Rundesk frames (158, 166). |
|  | medium | Sidebar footer "Customize Sidebar" and in-sidebar search / filter | Not asked in this section — read off frames 160, 164, 172 while transcribing the ClickUp control cluster she was pointing at. |

### Inbox & notifications  ·  13 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | large | Customize importance: user-controlled Important / Not Important per notification type | 'Primary pe yeh setting ka option hai... yeh mujh se poochta hai ke mujhe kya cheezein show karwani hain. Phir yahan pe CUSTOMIZE hai: mention... comm |
| **!** | small | Drop the 'Other' chip from the inbox | 'Ab yahan jo OTHERS wala option hai — yeh mujhe NAHI CHAHIYE humari list mein, kyunke yahan bhi same All wale hi hain — to yeh nahi chahiye. Lekin LAT |
| **!** | small | Ship the tabbed inbox to the deployed instance | 'humare wale jo inbox hai — agar is pe click karte hain to humare paas sirf yeh notification layout hai. Balke teen hain...' |
|  | medium | Inbox settings drawer: Show All tab, Group by date, Sort by newest first, Display mode | The gear on the Primary tab that opens 'Customize Inbox' — the container she goes through to reach Customize importance. |
|  | small | Notify people when their follower/watcher status changes | 'FOLLOWER CHANGE — yaani ke agar mere hi task pe koi follower add ho' — listed as an Important notification type in ClickUp's panel. |
| **!** | small | Notify on assignee change, including being removed from a task | 'kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar diya to mujhe woh cheez show ho' — ClickUp's 'Assignee change'. |
|  | medium | Reaction notifications | 'Ab neeche se REACTIONS mujhe na show hon' — a togglable type in ClickUp's importance list. |
|  | small | 'Shared with me' notification when someone shares an item with you | '[shared with] mujhe na show ho' — a togglable type in ClickUp's importance list. |
|  | large | Request-access flow for content, plus its notification | 'agar ACCESS REQUEST — agar kisi ne koi access maanga to mujhe show ho' |
|  | small | Give assigned comments and resolved comments their own notification types | 'kisi ne mujhe comment/assign kiya to mujhe show ho' — ClickUp lists 'Assigned comments' and 'Resolved comments' as separately togglable rows. |
|  | small | 'Task created' / 'Subtask created' notification types | Rows in ClickUp's Customize importance list, defaulted to Not Important. |
|  | small | 'Clear all' bulk action on the inbox | Visible top-right of ClickUp's inbox toolbar in every frame of this section, beside the gear. |
|  | medium | 'Filter' control on the inbox | The funnel-icon 'Filter' button at the left of ClickUp's inbox toolbar. |

### Chat  ·  13 findings

| | Size | Gap | Her ask |
|---|---|---|---|
|  | medium | Forwarded messages carry no provenance — no original author, no source channel, no "View message" link | Forward a message and, on the receiving side, the message should arrive as a quoted card showing who originally wrote it and when, with a footer "Forw |
|  | medium | Forward is a 10-item dropdown, not a "Forward this message" modal | Clicking Forward should open a modal with a searchable "Choose a user or Channel" field, a "Write a message (optional)" note box, a preview of the mes |
|  | large | Saved chat messages never reach Inbox → Later | Save a message, then go to Inbox → "Later" and find it there under a "Saved" heading, with the tab showing a "1 Saved" sub-count and each row reading  |
|  | small | A saved message shows no persistent marker — no toast, no "Later" badge, no row tint | Saving should confirm itself: a toast "Message saved for later" with a link into Later, an inline "🔖 Later" badge next to the message timestamp, and a |
|  | medium | No "Set reminder" on a saved message — reminders cannot attach to chat | The save confirmation should offer "Set reminder", so an important message can nudge you at a chosen time rather than sitting silently in a list. |
|  | small | Emoji picker offers 6 emoji, not the full library | Clicking the add-reaction button should open the whole emoji list — "poori ki poori emoji icons ki list" — searchable and categorised. |
|  | small | Only one quick reaction (👍) in the hover toolbar, and it is drawn as an icon not an emoji | The toolbar should lead with three one-tap emoji reactions — 👍 ✅ 🔥 — rendered as the actual emoji. |
|  | small | No permalink to an individual message ("Copy link") and no /t/<messageId> route | Every message should have a copyable link that opens that message in its channel — the same link the Forward modal offers via "Copy link" and that "Vi |
|  | small | Thread panel header has no "Assign to" / "Create Task" buttons, and is titled generically | Opening a thread should show "<Author>'s Thread" with "Assign to" and "Create Task ⌄" sitting right under the title, so you can turn the conversation  |
|  | medium | "Assign" on a message does not assign anything | The person-with-arrow action on a message should assign that message to someone as an action item — the consultant lists assign among the things you c |
|  | medium | Saved messages cannot be edited or assigned from the saved surface | From the saved item you should be able to edit the message, assign it, and open its thread — all three, without navigating back into the channel. |
|  | small | No "…" overflow menu on the message toolbar; the right-click menu carries only 3 items | The message action bar should end in a "…" that opens the long tail of actions, so the visible bar stays short. |
|  | small | Empty channel shows a bare headline instead of onboarding action cards | A new channel should offer "+ Add People", "Import from Slack", and cards for "Track Tasks", "Add Doc" and "Start SyncUp" (DM variant: "View Calendar" |

### Retention & replies  ·  10 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | large | Chat thread replies never reach the Replies page | Replies should be the one place you check for thread replies across every channel — 'ek person 90 chats mein hai, 90 groups mein hai … ab us ko har ba |
|  | large | Replies rows are link-outs, not inline threads with a reply box | Read and answer a thread from the Replies list itself: parent message, '1 Reply', the reply, and a composer with an 'Also send to #General' checkbox — |
|  | small | Cleared notifications are never purged — no 30-day retention | 'after 30 DAYS baad woh saare notifications automatically VANISH ho jayenge … jaise hi aap ne clear kar diya, 30 days tak rahega aur delete ho jayega' |
|  | small | No 30-day retention banner on the Cleared tab — and current copy promises the opposite | Tell the user, on the Cleared tab, that these will be permanently deleted after 30 days, with a way to read more. |
|  | small | No 'Clear all' bulk action on the Inbox | 'mere paas jitne bhi notifications hain main yahan se clear kar sakti hoon. Maine sab clear kiye — woh yahan pe chale jayenge' — one button that clear |
|  | medium | Saved chat messages don't appear in the Inbox 'Later' tab | Flag a message '🔖 Later' in a channel and find it under Inbox → Later, listed under a 'Saved' header as 'Saved in #General - Leo' with the message pre |
|  | small | 'Replies' is not in the sidebar — only reachable from the command palette | Replies sits second in the Home sidebar, right under Inbox, and is where the user goes instead of opening 10 channels. |
|  | small | No 'Mark unread' for a notification or a reply thread | 'agar to maine READ kiya hai to yeh is tarah se chala jayega' — read moves it to the Read tab; the 'Mark unread' button on the thread header pushes it |
|  | medium | No per-thread mute or follow/unfollow | The Replies thread header carries a mute-thread (bell-with-slash) icon and a bookmark icon next to 'Mark unread', so a noisy thread in one of your 10  |
|  | small | Thread panel header lacks the name and the Assign to / Create Task row | The thread panel is titled "Hamda's Thread" and puts 'Assign to' and 'Create Task' directly under the title. |

### Skills (AI)  ·  12 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| ✅ | large | Skills: a library of named, reusable AI playbooks (page, schema, API, nav) — **built** | "Ab yeh jo SKILL wali cheez hai na, yeh ek ClickUp ka NEW FEATURE hai — is ka matlab yeh hai ke aap jo kaam karte ho woh aap ka AGENT kar sakta hai; a |
| ✅ | medium | Skills empty state and starter carousel on the hub — **built** | The hub's first screen when you own nothing: a centred "Skills teach Brain how you work" empty state and a row of starter cards — Skills Miner, For yo |
| ✅ | medium | Prebuilt skill templates: Delegate Like Me, Brand Voice, Triage Tasks Like Me — **built** | Coloured template cards that create a skill by interviewing you: "Delegate Like Me — Assigns and hands off work the way you would"; "Brand Voice — Int |
| ✅ | large | Skills Miner — turn repeat work into skills automatically — **built** | "Skills Miner / Turn repeat work into skills — Scan your tasks, docs, and chats to surface workflows worth saving" behind a "Find my Skills" button; p |
| ✅ | large | AI-authored skill creation in chat, with an approve-before-create gate — **built** | Ask the assistant "Help me create a skill", have it explain what skills are, recommend specific ones grounded in your actual workspace, then propose a |
| ✅ | medium | Skill Memory — per-skill context that accumulates from conversation — **built** | "Yeh MEMORY hai — yeh hum jo bhi baat karenge woh STORE karega apne andar." Everything you tell a skill is retained by that skill, so it never has to  |
| ✅ | large | Skill Connections — bind a skill to external systems — **built** | "Aur yeh CONNECTIONS hai — agar main is ko build karoongi to main is ko kisi bhi system mein CONNECT kar sakti hoon." A skill can be wired to any conn |
| ✅ | medium | Persisted, auto-named AI chat threads in the sidebar — **built** | The chat that authored the skill starts as "New Chat", renames itself to "Skill Definition and Ideas", and stays in the sidebar's AI Chats list after  |
| ✅ | small | Answer-aware follow-up chips ("Follow ups") — **built** | Under every assistant answer, a "Follow ups" label and clickable next-step chips generated from that answer — e.g. "Create a Personal Task Organizer s |
| ✅ | small | Visible reasoning trace while the assistant works — **built** | A "Pondering" status with the retrieval steps streaming beneath it — "Checking what you're working on", "Checking the latest Skills basics" — before t |
| ✅ | medium | Per-message actions beyond copy (create task, save to doc, regenerate, thumbs up/down) — **built** | The six-icon row under each assistant answer: copy, create task, save to doc, regenerate, thumbs up, thumbs down. |
| ✅ | medium | Composer scope chip and model picker — **built** | The composer carries a "Skills" context chip (scoping the conversation to the surface you are on) and a model selector reading "Max ▾", plus a "+" att |

### Meetings & calls  ·  15 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | large | SyncUp: in-app voice/video calls started from a channel | Start a call from inside the workspace the way ClickUp's SyncUp does — a call button in the channel header and a 'Start SyncUp — Jump on a voice call  |
|  | medium | Pre-join preview dialog with device pickers and background effects | Before joining, show a preview with camera on/off, a background/colour picker ('BACKGROUND colours wagera select down kar sakte ho'), a mic device dro |
|  | medium | In-call screen share (tab / window / entire screen) | From inside a call, share a browser tab, a window, or the entire screen — 'yeh mujhe poochta hai ke koi tab share karni hai, window share karni hai, y |
|  | medium | Call participants panel with 'Invite people' | An in-call Participants panel listing who is on the call, with an invite control that can pull in existing members and add new ones — 'main PARTICIPAN |
|  | small | Call thread — 'Every SyncUp has a thread' | A message thread attached to the call itself, so what was posted during the call survives it, with an 'Also send to #General' checkbox on each reply. |
|  | small | In-call reactions overlay | Send an emoji reaction during a call and have it show up on the call surface — 'Agar main koi reaction doongi to woh yahan pe show ho jaata hai.' |
|  | small | Emoji picker: search, Frequently Used, categories, add-custom '+' | The picker she opens has a 'Search...' field, a 'Frequently Used' section, a 'Smiles & People' grid, a bottom category tab strip, and a '+' to add a c |
|  | medium | Minimise a running call to a docked picture-in-picture | Collapse the call and keep talking while browsing — 'main THREAD ko MINIMIZE kar sakti hoon yahan se, aur phir woh is tarah se show hota hai' — a smal |
|  | medium | Call cards in the channel and a call-started notification with Join | When a call starts, everyone gets a notification and can join straight from it — 'aap ko notification aa raha hoga ke CALL ka option aaya… aap chaho t |
| **!** | large | AI Notes: record the call and auto-generate meeting notes | An 'AI Notes' toggle inside the call that, once switched on server-side, records the whole call and writes the notes for you — 'main record karoongi a |
|  | small | Entitlement upsell modal for gated meeting AI ('Contact your admin') | Turning on a capability the workspace has not purchased should explain itself rather than fail silently: 'Unlock AI Notetaker: Automatic meeting notes |
| ✅ | medium | Meetings hub page and sidebar entry | A 'Meetings' item in the Home sidebar (between Skills and My Tasks) opening a page where 'yahan pe aap ko show hongi meetings' — the place all meeting |
| ✅ | medium | Meeting notes list: Filters / My notes / Tags / Search + empty state | On the meetings page, a toolbar with 'Filters', a 'My notes' pill, 'Tags:', and a right-aligned 'Search', over a list of notes; when empty, 'No Meetin |
| ✅ | medium | Upcoming Meetings section with Join, countdown and Connect Calendar | An 'Upcoming Meetings' block with a 'Join' pill, the meeting title, a proximity badge ('in 5m'), a day timeline, and — when no calendar is connected — |
| ✅ | medium | Meeting-scoped AI ask-box with starter prompts, and meetings in the AI/search index | 'Hey {name}! Ready to dive into your meetings?' with a composer ('Get instant answers and insights from your meetings') and four chips: 'Summarize my  |

### Task creation  ·  13 findings

| | Size | Gap | Her ask |
|---|---|---|---|
| **!** | large | Task creation collects only a title — every other property is post-creation | Task banate waqt hi name, description, assign, start/due date + time, priority, tags, time estimate, dependency, subtasks aur checklist sab ek hi dial |
| **!** | medium | Start and due dates cannot carry a time of day | Start date daali to time bhi poochhe (7 PM), due date daali to us ka bhi time (9:15) — 'proper duration' bane |
| **!** | medium | No way to put a tag on a task anywhere in the product | Tags create kar saken — task ke ooper feature ke lehaz se tag rakh sakein, likh ke Enter dabao to naya tag ban jaye (YouTube jaisa) |
| **!** | large | Task description has no slash-command editor (no table, banner, image or embed) | Description mein slash click karke table bana loon, banners rakhoon, image embed karoon — bilkul document ki tarah design kar sakoon |
|  | small | Create modal is missing Reminder, Whiteboard and Dashboard tabs | Task banane ke baad woh Document ka poochta hai, phir Reminder ka, phir Whiteboard ka, phir Dashboard ka — sab ek hi jagah se |
| **!** | medium | Cannot create a List from inside the task-create flow, and cannot mark it private at creation | Space select karo to woh khud bole 'pehle list banao' — list na banao to task create hi na ho; wahin se list bane aur poochhe ke PRIVATE karni hai ke  |
| **!** | medium | No 'List settings' step after a list is created | List banne ke baad poochhe ke view kaisa chahiye — main abhi 'no thanks' karoon aur baad mein set kar loon |
|  | small | Task type cannot be chosen while creating a task | Task banate waqt hi upar 'Task ⌄' se decide ho ke yeh Task hai ya Milestone |
|  | medium | Date picker has no natural-language presets and no recurrence entry point | Date choose karte waqt Today / Tomorrow / This weekend / Next week / 2 weeks / 4 weeks aur 'Set Recurring' wahin milein |
|  | large | A List cannot live directly under a Space — a Project is always required | Pehle space hoti hai, is ke baad space ke andar LISTS hoti hain |
|  | medium | 'My Tasks' is buried inside Home instead of being a sidebar group with its own routes | My Tasks sidebar mein ho, us ke neeche Assigned to me / Today & Overdue / Personal List — aur profile pe click karo to bhi wahin se pahunch sakein |
|  | small | Create dialog footer has no template picker, attachment or notify control | Task create karte waqt neeche Templates, attach aur notification (bell) ke controls hon |
|  | small | Dead start-date state in the list quick-add | — |

