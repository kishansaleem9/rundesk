# ClickUp Platform Overview — coverage re-audit

Re-audit of the 25:52 walkthrough against the code as it stands today, done by reading
the Roman-Urdu transcript and the video frames together and then checking each claim
against the repository. Supersedes the status columns in
`clickup-platform-overview-spec.md`; that document's *scoping* decisions still stand.

**Method.** Frames pulled at the transcript timestamp where each requirement is stated,
so the audit reads what was on screen at that moment rather than what a summary said
about it. Every "built" verdict below was checked in the code, not recalled — four
verdicts changed as a result (§5).

**Headline.** The spec recorded 41 gaps. **35 are now closed**, none remain open, and 6
are deliberate skips the client's own "to-the-point features" constraint argues against
building. One half-item is out by choice: automatic transcription needs a speech-to-text
provider, and the UI says so rather than implying otherwise.

**Update.** The six that were open when this audit was written have since been built and
live-verified. §3 records how each was closed and what proves it.

---

## 1. Scoreboard

| Area | Entries | Closed since spec | Still open | Deliberate skip |
|---|---|---|---|---|
| A1 Hierarchy & views | 11 | 6 | 0 | 1 |
| A2 Search & inbox | 11 | 8 | 0 | 0 |
| A3 Chat | 11 | 7 | 0 | 3 |
| A4 Admin | 12 | 7 | 0 | 0 |
| A5 Forms / docs / dashboards | 15 | 1 | 0 | 0 |
| A6 AI & meetings | 9 | 6 | 0 | 2 |
| **Total** | **69** | **35** | **0** | **6** |

The remaining 28 entries were already complete when the spec was written and were
re-confirmed, not re-built.

---

## 2. Closed since the spec (29)

Each verified in the current tree.

**Hierarchy & views**

| Ref | Timestamp | What she asked for | Now |
|---|---|---|---|
| A1.2 | 12:37 | Named views as tabs ("Team View"), inline `+ View` | Tab row + `+ View`; frame at 12:37 shows ClickUp's own `Progress Board / Team View / Tasks / Board / + View` strip |
| A1.4 | 12:50 | Filter on assignee, duration, recurring — "har cheez ka layout" | Filter builder beyond the original 3 fields; `Search tasks…` in-view |
| A1.6 | 11:48 | "space ke ooper bhi lock hai" | Padlock renders on tree rows |
| A1.7 | 11:12 | Task or list shared with you appears in one place | `Shared with me` route |
| A1.9 | 15:53 | `+` offers list, folder, doc, whiteboard, form | Create menu offers List and Folder alongside Doc |

**Search & inbox** — the most complete area.

| Ref | Timestamp | What she asked for | Now |
|---|---|---|---|
| A2.1 | 00:40 | "kuch bhi command kar sakte ho" | `/` command mode |
| A2.3 | 00:38 | Ask AI from the search box | `Ask AI · <query>` first row |
| A2.4 | 01:13 | Filters + sort by last update / last created | Creator, location, archived toggle, sort chips |
| A2.5 | — | Search where you already are | Task search inside list views |
| A2.6 | 03:50 | All / Primary / Other / Later / Cleared | 3 buckets + 3 filter chips — same five states, different arrangement (§4) |
| A2.7 | — | Row context and per-row actions | Source label and glyph |
| A2.8 | 04:12 | "status update ho to mujhe us ka inform ho" | Notification carries from → to |
| A2.9 | 04:47 | Replies, unread vs read | Own route with Unread/Read tabs |
| A2.11 | 24:38 | Notification prefs per channel | Delivery preferences + send-test-notification |

**Chat**

| Ref | What she asked for | Now |
|---|---|---|
| A3.2 | Thread that holds a conversation | Timestamps, reactions, mark-unread, follower count — all present |
| A3.3 | Unread handling like Slack | Mark-unread endpoint + divider |
| A3.4 | User-named channel groups (09:32) | `chat_channel_groups` |
| A3.8 | Custom emoji (25:00) | Presign upload path, list, delete |

**Admin** — every gap closed.

| Ref | Timestamp | What she asked for | Now |
|---|---|---|---|
| A4.2 | 22:20 | Security & Permissions policy toggles | Default-space-private, block-public-sharing |
| A4.3 | 22:05 | Teams that are mentionable | `alias` on workspace groups |
| A4.4 | 23:00 | One settings console | Grouped rail (`TAB_GROUPS`) |
| A4.5 | 21:37 | Workspace identity and branding | Switcher shows plan and member count |
| A4.6 | 22:24 | Trash: everyone's vs mine, by type, restore / delete-forever | Full trash with metadata |
| A4.8 | — | Settable status, not just derived presence | `presence_status` |
| A4.9 | 23:47 | Spaces admin index | Spaces tab |
| A4.10 | 24:14 | Work schedule | Migration 0091 — work days, holidays, wired into Workload |

**Forms / AI**

| Ref | Timestamp | What she asked for | Now |
|---|---|---|---|
| A5.1 | 19:01 | "form ka data list mein jaata hai" | Destination list reachable from the UI |
| A6.3 | 20:24 | — | The copy that falsely claimed clips auto-transcribe was corrected |
| A6.4 | 16:20 | AI reachable from anywhere | Docked globally |
| A6.5 | — | Daily briefing | Generate-now action |
| A6.8 | — | AI cost visibility | Admin readout |

Also closed off the skip list, after review: **Task Types** (24:01 — "task, milestone,
campaign"), **reporting line** (22:52 — assigning a manager), **search sort** (01:13),
and the **Primary/Other** inbox split (03:59).

---

## 3. Was open, now closed (6)

Ordered by how much they cost her. Each row names the check that proves it, so the
verdict is re-runnable rather than remembered.

| Ref | Timestamp | Gap as written | How it was closed | Proof |
|---|---|---|---|---|
| **A6.1** | 06:19 | Meeting notes → action items works, but nothing is persisted: no meeting row, no attendees, no link back to the call. The loop runs and forgets. | A `meetings` table (0092) with attendees, notes, transcript and recording, surfaced as a Meeting record panel on the AI page. Reopen a saved meeting and the notes, attendees and recording all come back. | `a61-meeting-record.mjs`, `a61-meeting-loop.py` |
| **A6.2** | 06:22 | Meeting records, recordings, AI Notetaker. Depends on A6.1's entity existing first. | Records and recordings built on A6.1. Action items extracted from a meeting become real tasks that name the call they came from. **Automatic transcription is not built** — it needs a speech-to-text provider, and the panel says so rather than leaving someone waiting. | `a61-meeting-loop.py` |
| **A3.9** | — | DM tabs (Chat / Calendar / Tasks). The cost is the two views behind the tab strip — no shared calendar or task view exists for a person pair. | One endpoint answers both halves: meetings you both attended, and open tasks either of you is assigned. The stream and composer are hidden rather than unmounted, so an unsent draft survives the trip. | `a39-dm-shared.py`, `a39-dm-tabs.mjs` |
| **A3.6** | 25:22 | Mention picker has no Tasks / Docs / Channels tabs. | Link picker with all three tabs and a live search behind each. | `video-regression.mjs` A3.6 |
| **A3.5** | 25:20 | Composer's sparkle rewrites the draft instead of opening a prompt. | Opens a prompt with four modes; the result is staged with Use this / Discard, and the draft is untouched until you pick. | `video-regression.mjs` A3.5 |
| **A1.3** | 12:42 | Board polish: inline column rename, label pill on cards, `+ Add group`. | All three. Rename is guarded off when the board is showing fallback statuses, whose ids are keys rather than rows. | `video-regression.mjs` A1.3 |

### What building them turned up

Closing these surfaced three defects that had nothing to do with the features:

- **`passwordHash` rode along on embedded user rows.** `GET /tasks/:id` returned it
  through assignees, watchers and comment authors. Now behind `PUBLIC_USER_COLUMNS`,
  with a test that fails if a secret column is ever added back to the set.
- **Search sorted by reordering a different result set.** `sort=updated` and
  `sort=created` skipped Meilisearch entirely, so changing the sort changed *which*
  results came back. Only reproducible with a real Meilisearch running, which is why
  every prior local run missed it.
- **`setWorkDays` discarded out-of-range days instead of refusing them.** `[1,2,8]`
  returned 200 and a schedule of `[1,2]`. JavaScript's `getDay()` numbers Sunday 0,
  which is exactly the mistake an integration will make, and the schedule drives
  Workload's capacity — so the day reappears much later as numbers nobody can explain.

---

## 4. Where we differ from ClickUp on purpose

**Inbox tabs.** The frame at 03:50 shows five tabs: All, Primary, Other, Later, Cleared.
Rundesk has three bucket tabs (Inbox / Later / Cleared) and three filter chips
(All / Primary / Other). Every one of the five states exists and is reachable — the
arrangement differs. Skip-list #13 argued the tabs were the bloat, not the buckets, and
that still reads correctly.

**Cross-app search.** At 00:48 she notes ClickUp searches linked outside apps, and the
frame at 01:31 shows tabs for ClickUp / Google Drive / Gmail / Dropbox / SharePoint.
That is skip #6 — per-provider auth, quota and result normalisation, duplicating search
the user already has inside those apps.

**Calls (SyncUp).** 09:44–10:36 demonstrates in-app calling with screen share,
participants and AI notes. Skip #1, and the largest single item in the recording.

**Super Agents and Skills.** 05:33 and 16:35 — "aap ka agent kaam karega… aap ke
replacement pe". Skips #4 and #5: an autonomous-agent platform with its own runtime,
permissions and activity log is a product, not a feature.

---

## 5. Verdicts this audit corrected

Four claims from the earlier pass were wrong and are fixed here.

- **A3.2 thread panel** was recorded as "author name and body only, no timestamp". It
  renders `formatMessageTime(reply.createdAt)`, reactions, mark-unread and a follower
  count. The original grep looked for a `chat/thread-panel.tsx` that does not exist —
  the component lives inside `workspace-chat-page.tsx`. A missing file is not a missing
  feature.
- **A6.3 transcription copy** was flagged as actively false. It has since been corrected;
  the clips subtitle no longer promises a transcript.
- **A4.10 work schedule** was "confirmed by grep — nothing anywhere". True when written,
  closed by migration 0091.
- **A1.4 filters** was "hard-limited to status, priority and assignee". The filter
  builder has since widened it.

The lesson is the same one that produced two search bugs this week: a grep that finds
nothing is evidence about the grep, not about the product. Every verdict above was
confirmed by reading the code it points at.

---

## 6. Re-running this

Two suites are organised by the refs in this document, so a failure points at a row
above rather than at a route:

```
python3 test/e2e/video-regression.py    # 88 checks — what an endpoint can answer for
node    test/e2e/video-regression.mjs   # 68 checks — what she pointed at on screen
```

The split is not arbitrary. "The endpoint answers 200" proves nothing about whether a
tab strip, a padlock or a filter builder is reachable, and a browser check proves
nothing about what a request refuses. The five deliberate skips print as SKIP with the
reason attached; a sweep that quietly omits what it does not cover reads as coverage it
does not have.

Most red in these files, on first run, was the harness guessing a route or a field name
rather than the product being wrong — a form field named `title` and not `name`, a
public submit body keyed `data` and not `values`, a reporting line on its own
`/manager` route. Check the shape against `/api/docs-json` and the DTO before recording
a defect. Three real bugs did come out of it, and they are listed in §3.
