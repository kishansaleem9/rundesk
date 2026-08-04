# ClickUp Platform Overview — coverage re-audit

Re-audit of the 25:52 walkthrough against the code as it stands today, done by reading
the Roman-Urdu transcript and the video frames together and then checking each claim
against the repository. Supersedes the status columns in
`clickup-platform-overview-spec.md`; that document's *scoping* decisions still stand.

**Method.** Frames pulled at the transcript timestamp where each requirement is stated,
so the audit reads what was on screen at that moment rather than what a summary said
about it. Every "built" verdict below was checked in the code, not recalled — four
verdicts changed as a result (§5).

**Headline.** The spec recorded 41 gaps. **29 are now closed**, 6 remain genuinely open,
and 6 are deliberate skips the client's own "to-the-point features" constraint argues
against building.

---

## 1. Scoreboard

| Area | Entries | Closed since spec | Still open | Deliberate skip |
|---|---|---|---|---|
| A1 Hierarchy & views | 11 | 5 | 1 (polish) | 1 |
| A2 Search & inbox | 11 | 8 | 0 | 0 |
| A3 Chat | 11 | 4 | 3 | 3 |
| A4 Admin | 12 | 7 | 0 | 0 |
| A5 Forms / docs / dashboards | 15 | 1 | 0 | 0 |
| A6 AI & meetings | 9 | 4 | 2 | 2 |
| **Total** | **69** | **29** | **6** | **6** |

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

## 3. Genuinely open (6)

Ordered by how much they cost her.

| Ref | Timestamp | Gap | Size |
|---|---|---|---|
| **A6.1** | 06:19 | Meeting notes → action items works, but nothing is persisted: no meeting row, no attendees, no link back to the call. The loop runs and forgets. | medium |
| **A6.2** | 06:22 | Meeting records, recordings, AI Notetaker. Depends on A6.1's entity existing first. | large |
| **A3.9** | — | DM tabs (Chat / Calendar / Tasks). The cost is the two views behind the tab strip — no shared calendar or task view exists for a person pair. | large |
| **A3.6** | 25:22 | Mention picker has no Tasks / Docs / Channels tabs. The task-comment picker already does this and could be ported. | small |
| **A3.5** | 25:20 | Composer's sparkle rewrites the draft instead of opening a prompt. | small |
| **A1.3** | 12:42 | Board polish: inline column rename, label pill on cards, `+ Add group`. Frame at 12:37 shows all three in ClickUp. | small |

Three of these are an afternoon each. The two meeting items are one piece of work —
A6.2 is unbuildable until A6.1 has an entity to hang off.

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
