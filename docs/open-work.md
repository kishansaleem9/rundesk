# Open work — verified inventory, 23 September 2026

Produced by a read-only sweep: eight lanes (handoff defects, every open ledger row, ClickUp research ×2, suite hygiene, harness, product siblings of tonight's fixes, three days of commit messages), each non-research finding re-read by an adversarial verifier. Only findings the verifier confirmed as still open or partly fixed are listed. The same item can appear under more than one lane; ids are prefixed by lane.

**The ClickUp research could not reach ClickUp.** help.clickup.com, clickup.com and developer.clickup.com are denied by this environment's network policy, so the build specs below that describe ClickUp behaviour rest on the agents' knowledge, not on fetched pages, and must be re-checked against the docs before an item is closed.

**Closed since this inventory was taken:** `product-siblings/cover-storage-key-unvalidated`, `product-siblings/task-listid-mass-assign-cross-workspace-move`, `product-siblings/link-attachment-signed-as-key`, `harness/ci-missing-doc-import` (and its duplicate `commit-log/log-c592545-1`), `suite-hygiene/ci-no-store-for-store-suites`; and, found while fixing those, `harness/ci-suites-read-a-database-that-does-not-exist`, `found-23-sep/watchers-route-open-to-any-account`, `found-23-sep/task-relationship-references-unchecked`, `found-23-sep/doc-import-never-exits` and `found-23-sep/lane-stubs-never-restart`; and `harness/sweep-drain-run-stale-tmp-copies` and `harness/verify-sh-exit-masked`, fixed so the regression sweep could be trusted; then `product-siblings/chat-attachment-key-unvalidated`, `product-siblings/meeting-recording-key-unvalidated`, `product-siblings/meeting-record-panel-overwrites-key-with-signed-url` and `product-siblings/teams-work-preview-ignores-privacy`. The docs item `product-siblings/docs-patch-mass-assign-public-share` is closed below as well. And `resume-defects/resume-1-move` and `resume-defects/resume-1-residual` (container moves and template apply into view-only spaces), with two found beside them; plus `found-23-sep/call-meeting-record-lost` (a regression of mine, found by the sweep and fixed) and `found-23-sep/stale-chunk-recovery-writes-the-shared-tree`. Four more were found and are open: `found-23-sep/assign-someone-who-cannot-see`, `found-23-sep/related-tasks-ignore-private-containers`, `found-23-sep/container-read-rule-twice`, `found-23-sep/labels-editable-by-any-member`. Then `harness/dist-brk-committed` (and its duplicate `commit-log/log-39863ff-2`) and `harness/fleet-scripts-exit-zero-when-down`, with `found-23-sep/fleet-up-never-stopped-the-old-api` and `found-23-sep/fleet-restart-counted-refused-lanes-up` found beside it; `harness/chain-planner-crash-reads-as-clean`, `harness/deps-omit-suite-libs`, `harness/planner-ignores-patch-body`, `harness/rerun-declaration-mirror` and `harness/sweep-until-clean-drops-exit3-guard`, with `found-23-sep/refuses-all-patches-never-built` and `found-23-sep/fixtures-built-through-the-route-under-test` found beside them (their re-runs pending); then `harness/measuredat-counts-nonmeasurements`, `harness/stale-lock-dirs-hang-dispatch`, `harness/verify-scan-blind-to-dollar-filenames` and `harness/verify-staleness-scan-gaps`. Each is marked **closed** where it stands, with its evidence. The section counts below are the inventory's, not what is still open.

## Product defects — 46

### `resume-defects/resume-7` — open, large

**The clip's 'Copy link' still yields an expiring signed URL, and nothing tells the person**

*Evidence:* apps/web/src/components/comment-recorder.tsx:320-351: copyClipLink calls ensureLink, which calls clipShareUrl, and the toast says only t('clipCreated.linkCopied'). apps/web/src/lib/i18n/catalogs.ts:2961 is 'Link copied', with no expiry. apps/web/src/lib/clip-publish.ts:101-117 asks for `expiresInMinutes: 60 * 24`. apps/api/src/modules/clips/clips.service.ts:107-111 caps expiry at 7 days and returns the bare signed URL for mode 'public'. Only the email path states an expiry (email.service.ts:355-370, 'This secure link expires on ...'). The clips-page share dialog signs for 60 minutes (workspace-clips-page.tsx:108-124), shows and copies the URL with no expiry (509-517), and describes itself without one (catalogs.ts:683). Worse: 'Create a task' writes the 24-hour URL into a permanent task description (comment-recorder.tsx:358-373), and clip-created-card.mjs:405-406 asserts that the description holds it. The suite also stubs the share route with a fixed URL (clip-created-card.mjs:64, 246), so nothing checks expiry. The actual lifetime depends on deployment: r2.service.ts:109-121 returns a permanent public URL when a non-R2-API public URL is configured, so the UI cannot even state the expiry truthfully without knowing the mode. task-detail-sheet.tsx:5744-5751 already records this reasoning for not offering Copy link on comment clips. ClickUp research: Clips are shared by a public, unguessable URL that does not expire. Link expiry is an explicit Enterprise-only choice of 7, 30 or 90 days (help.clickup.com 'Share locations and items with a public link'; ClickUp changelog 'Public Sharing: Expiring URL [Enterprise]').

*To close:* Build to ClickUp, which shares the dependency on section 4's clips table (see s4-clip-link). Give each clip a stable, unguessable share token and an app route such as /clips/:token that re-signs the storage object on every view. Copy link, New tab and Create a task then use that route, never a signed URL, so task descriptions stop rotting. If an expiry is offered at all, make it an explicit choice and state it in the toast and dialog. Checks: the copied link still resolves after the signing window (sign with a short TTL in the test); the task description holds the stable route, not a storage URL; if the toast or dialog carries an expiry, it matches the server's.

*Progress:* one of its three uses is gone. Create a task no longer writes a URL into the task: it attaches the clip (`clip-create-task-persists-24h-url`), and `clip-created-card` no longer asserts the description link. Copy link and New tab still hand out the 24-hour signed URL with nothing saying so, which is the rest of this item.

### `product-siblings/avatar-logo-persist-expiring-signed-url` — **closed**, break run pending

**Avatar and workspace-logo uploads persist a 15-minute presigned URL as avatarUrl/logoUrl**

*Evidence:* users.service.ts:298-301 returns `publicUrl = getObjectUrl(key)`. Its comment admits it is only 'stable … with a public R2/CDN domain'. workspaces.service.ts:318-321 does the same. r2.service.ts:109-121 returns a 900-second presigned GET whenever R2_PUBLIC_URL is unset or is the raw r2 endpoint, and R2_PUBLIC_URL is marked Optional in .env.example:66-67 and empty in deploy/env.production.template:50. The web persists it: app-profile-page.tsx:332-335 PATCHes `avatarUrl: presign.publicUrl`, and workspace-settings-page.tsx:708 does `setLogoUrl(presign.publicUrl)`. Nothing re-signs on read (users.service.ts:511 publicProfile). Failure: on a default deployment, an uploaded avatar or logo shows a broken image everywhere 15 minutes later.

*To close:* Store the key (avatar_storage_key / logo_storage_key) and sign on read, as covers and meetings do. Or refuse the upload when no public URL is configured.

*Closed:* not by signing on read — avatars are embedded in every user projection, so that would be a signing call per embed — but by saving an address that does not expire: `/api/v1/public/images/<key>` (`public-images.controller.ts`), which answers each request with a redirect to a freshly signed URL, cached ten minutes (inside the fifteen it lives). Unauthenticated, like the pictures (a logo is drawn on the custom-domain sign-in page); only `avatars/` and `workspace-logos/` keys, checked with `isKeyDirectlyUnder`, so no other object and no `..` is reachable. Both presign answers now return that address. Saved rows are repaired by migration 0161 — presigned URLs only (`X-Amz-Signature`), under the two prefixes; CDN and OAuth avatars untouched — measured by running the SQL against a lane database with a presigned avatar, a presigned logo, a CDN avatar and a Google avatar planted: the first two rewritten, the others left. (CI and the lanes build the schema with `drizzle-kit push`, which never runs data migrations; production applies them with `drizzle-kit migrate`.) `stable-images` 6/6 on lane 1, whose store has no public domain — the default this was about: the saved address has no signature, answers 302 to a signed URL serving the very bytes, the route refuses other prefixes and dot segments, and both pictures are drawn on screen; against the old API 3 of 6 failed (the on-screen pair and the refusal pass there: a fresh presigned URL loads, and a route that does not exist refuses everything). `sti-1..8`, each compiled. Regression: settings-depth, person-panel, object-key-boundaries, task-cover 4/4. *A slip in that commit:* `workspaces.service.test.ts` still expected the logo's public URL to be `getObjectUrl`'s, and the API unit tests were not run before it was committed; preflight caught it, and the test now pins the images address. *Not done:* `avatarUrl` and `logoUrl` accept any string — an avatar can point anywhere, which shows the viewer's address to whatever it points at; restricting both to our own addresses and the OAuth providers' is its own item.

### `product-siblings/chat-history-unreachable` — **closed**

**Chat loads only the newest 100 root messages; the server's `before` cursor has no client**

*Evidence:* chat.controller.ts:273-281 accepts ?before. chat.service.ts:1298-1301 says 'Without this the cursor was a no-op and only the newest limit messages were ever reachable'. The only reader is workspace-chat-page.tsx:584-588, `messages?limit=100` with no before. A search for useInfiniteQuery, fetchNextPage and loadOlder across apps/web found nothing. A search deep link to an older message silently does nothing (:590-597 returns when the id is not in the loaded 100). Threads: chat.service.ts:1760-1762 orders replies oldest-first with limit 100 and the web never sends a limit, so a thread over 100 replies drops its NEWEST replies. ClickUp loads older messages on scroll-up.

*To close:* Use an infinite query keyed by the oldest loaded id (before=). Load around the target message for deep links. For threads, page newest-first or cursor forward.

*Closed (e419039):* a channel pages back 100 at a time by an `(created_at, id)` cursor to its first message, a thread opens on its newest replies with the rest on request, and a link to an old message pages back to it. `chat-history` 14/14; `chx-1..16` 16 of 16 reddened their claims, each run full-length (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `product-siblings/custom-role-permissions-unread-by-web` — open, medium

**GET /workspaces/:ws/roles/me/permissions has no caller; web gating ignores custom-role permissions the server enforces**

*Evidence:* custom-roles.controller.ts:37-47 returns the effective permission set. Searches of apps/web/src for 'me/permissions', 'roles/me' and 'permissions' found no caller. use-workspace-role.ts:5-22 gates on the base role only. The server enforces custom permissions, e.g. task-templates.controller.ts:51 @RequirePermissions('template.manage') and reports.controller.ts:19 'report.view.basic'. Failure: a custom role that revokes report.view.basic from a manager still gets the Reports UI, and every request 403s.

*To close:* Load me/permissions into the role hook and gate the permission-backed controls on it.

### `ledger-rows/defect-mention-picker-200-cap` — **closed**, break run pending

**@ picker Tasks tab fetches limit=200 and filters in the browser — task 201 cannot be mentioned and shows 'no matches'**

*Evidence:* reaudit.md:2706-2718 ('Not fixed'). task-detail-sheet.tsx:5937 and :8965 call `/tasks/workspace/${workspaceId}?limit=200` and filter locally. Locations is searched server-side.

*To close:* Send the typed query to the server, as Locations does, for Tasks/Docs/Whiteboards/Channels.

*Closed (with `commit-log/log-d85dcad-1`):* `GET /tasks/workspace/:id` takes `q` — the title and the list's and project's names, matched in SQL BEFORE the limit, with `%`, `_` and `\` taken as text — and every task picker asks it through one hook, `lib/use-task-search.ts`, with the typed words in the query key and the previous answer kept on screen while the next loads: the @ Tasks tab, chat's mention list and its insert picker, merge, convert to subtask, dependencies, a Tasks custom field (which had no search at all — a `<select>` of 200 — and now names chosen tasks by fetching each, not from the 200) and adding to a sprint. Found on the way and fixed: the convert picker left subtasks out by `parentTaskId`, which the listing never sent, so it offered them (the server then refused); the @ Tasks tab said "No matching tasks" while the search was still in flight. `task-pickers-search` 8/8 on a workspace of 236 tasks whose target is not among the newest 200 — the server's search (the word, `%`, a list's name, `parentTaskId`) and four pickers on screen (@ tab with the search held in flight, merge, convert with the subtask left out, the Tasks field relating and drawing it) — 0 of 8 on the old code. `tps-1..11`, each compiled. `task-menu`'s own-parent check read the list in the same tick it typed, which only worked while filtering was instant; it now waits for that search's answer (37/37). Regression 12/12: task-mentions, task-merge, task-menu, custom-field-types, custom-field-progress, chat-message-actions, comment-plus-menu, doc-task-links, task-depth, task-boundaries, video1-fast-items and the new suite. *Not checked one by one:* chat's two pickers, dependencies and the sprint picker — same hook, same three-line change, no check of their own.

### `product-siblings/export-visible-columns-ignores-view` — **closed**, break run pending

**Export 'Visible columns' never sends ?fields, so it always exports the same five columns**

*Evidence:* tasks.controller.ts:188 accepts `fields`, and :213 passes it through. tasks.service.ts:2553-2561: in 'visible' mode, a missing fields list falls back to title/status/assignees/priority/dueDate. The web export panel builds its query at list route :7318-7332 with columns/format/dateFormat/timeFormat/includeClosed/includeArchived/view and no fields, even though the list hides columns (BUILTIN_COLUMNS :519-525, showCol :4796-4810). The key names also differ (web 'col:due'/'col:created' vs server 'dueDate'/'createdAt'), and custom-field columns are never in COLUMNS (:2535-2547). ClickUp's Export view 'Visible columns' exports what the view shows, including custom fields.

*To close:* Send fields from the view's visible set, mapping the web keys to the server keys, and add custom-field columns to the export. Extend the export suite to hide a column and assert it is absent.

*Closed:* the list computes what "visible" means for the view it is on — the table's shown built-in columns and its shown custom fields, the list's shown built-ins with status (its groups) — as the export's own keys (`EXPORT_KEY_OF_COLUMN`, one map), and the Customize panel sends them as `fields` with Visible columns. The server keeps the view's ORDER, and exports custom fields — `cf:<id>` in `fields`, or every one of the list's in All columns — read per task through `CustomFieldsService.getValuesForTask` (the task panel's own read, so formulas and automatic progress export the number the screen shows), each type written for a spreadsheet: a dropdown or labels by label, a date in the chosen format, people, tasks and files by name, a checkbox as Yes/No. `list-export` 30/30 with five new checks — three on the server (order and a hidden column absent, a dropdown field as its label, All columns carrying the field) and two reading the panel's own request (Priority hidden in the list drops it; the table sends its custom field) — which failed 5 of 5 on the old code. `list-export-4..10`, each compiled. Regression: list-customize, list-view-controls, custom-field-types, gantt-controls 5/5 with the suite. *Not done:* the board download's "visible" is still the default five — a board shows cards, and which card fields count as columns is its own question.

### `commit-log/log-d85dcad-1` — **closed**, break run pending

**The @ picker's Tasks tab loads 200 tasks and filters them in the browser; Docs, Whiteboards and Channels also filter in the browser**

*Evidence:* Commit d85dcad 'Also recorded, not fixed'. It is still true. task-detail-sheet.tsx:5935-5939 and :8965 fetch /tasks/workspace/:ws?limit=200. The same cap appears at workspace-chat-page.tsx:491 and :4451, task-merge-dialog.tsx:72 and task-convert-dialog.tsx:68. Only Locations searches on the server (task-detail-sheet.tsx:5965-5972). Ledger lines 2706-2718 say 'Not fixed'. The 201st task shows 'no matches'.

*To close:* Search on the server with a q parameter, as Locations does, for Tasks, Docs, Whiteboards and Channels, and in the other pickers. Add a check that seeds more than 200 tasks and mentions the newest, with a break patch.

*Closed:* the same fix as `ledger-rows/defect-mention-picker-200-cap`, which carries the evidence and the numbers.

### `resume-defects/resume-8-reply-routing` — open, medium

**The claim that replies to notification emails route by header is false: only inbound Message-IDs are ever recorded**

*Evidence:* apps/api/src/modules/email-to-task/email-to-task.service.ts:35-36 says 'Replies to notification emails are also routed by `In-Reply-To` / `References` headers'. But resolveReplyContext (345-362) matches those headers only against inbound_email_messages.messageId. The only insert into that table is for accepted inbound mail (line 524). Outbound notification mail (notifications.service.ts:1213 sendComment, going through email.service.ts:596-603) sets no Message-ID, records none, and sets no Reply-To, so a reply to a notification goes to `this.from` and cannot match. Header routing works only for replies to mail that was itself inbound.

*To close:* This closes with resume-8. Have send() set and return a Message-ID, and record outbound IDs with their taskId and listId, either in the same table with a direction column or in an outbound table. Make resolveReplyContext consult them. Set Reply-To on notification mail to the task's +task- address. Add an API-level test: send a comment notification, post a synthetic inbound reply whose In-Reply-To is that Message-ID, and assert a comment lands on the task. A patch that stops recording the outbound ID should redden it. Until then, correct the comment at :35-36.

### `product-siblings/standalone-reminders-invisible` — **closed** (the row had stayed open after its fix)

**Reminders made from + Create are never listed or deletable: GET /workspaces/:ws/reminders has no reader**

*Evidence:* reminders.controller.ts:16-20 lists 'the caller's still-pending reminders across the workspace', and :36-46 creates standalone ones. quick-create-modal.tsx:2133-2141 creates one and invalidates ['reminders', ws], which no useQuery in apps/web uses (confirmed by a key-head survey). The only reader is task-scoped (task-reminders.tsx:45-48), and delete is reachable only from there (:68). ClickUp lists reminders (Home reminders card / Inbox) with edit and delete.

*To close:* Add a Reminders list (a Home section or Inbox tab) on GET /workspaces/:ws/reminders, with delete, under the key the modal already invalidates.

*Closed (0c06643):* Home › Reminders reads `GET /workspaces/:ws/reminders` under `['reminders', ws]` — the key `+ Create › Reminder` refreshes — with delete. `home-reminders` 9 checks: made through the modal and listed without a reload, another member's reminder absent, one already gone off not listed as waiting, a delete checked in the row, and the empty state; its 10 patches 10 of 10 reddened (plan-3; `hr-9` re-aimed on the way, `found-23-sep/checks-read-textContent-not-what-is-shown`). Found still open on 23 September by sweeping every open row for a suite that names it: this was the only one.

### `product-siblings/admin-audit-first-workspace-only` — **closed** (f583354, as `found-24-sep/admin-audit-reads-the-first-workspace`)

**The super-admin 'Audit log' shows only the admin's first workspace, with no picker**

*Evidence:* admin-audit-page.tsx:127-133 uses `wsQuery.data?.[0]?.workspace.id` from GET /workspaces. app.admin.tsx:8-14 is the platform console ('Audit log — See who changed what'), limited to super_admin.

*To close:* Add a workspace picker (or a platform-wide audit endpoint).

*Closed (f583354):* the audit log has the console's workspace picker, which it now shares with the users, webhooks, settings and integrations pages. The same defect was found again while closing the exports and recorded as `found-24-sep/admin-audit-reads-the-first-workspace`, without this row being seen; the evidence, the fix and the suite (`admin-audit-page`, 4/4, 0/4 before) are written there.

### `product-siblings/chat-attachment-key-unvalidated` — **closed**

**POST /chat/channels/:id/attachments records any storageKey and returns a signed URL for it**

*Closed (10a1317):* `recordAttachment` requires exactly this channel's presigned shape (`common/storage/object-key-shape.ts`, one safe segment after `chat/<channel>/attachments/`), and one helper, `chatAttachmentUrl`, replaces the four copies of the signing ternary and signs only that shape. Custom emoji had a `startsWith` check `..` walks out of; they use the same rule, at write and at read. `object-key-boundaries` §1–§2, 7 checks; okb-1..7.

*Evidence:* chat.service.ts:176-203 (recordAttachment) checks only `!data.storageKey` (:183), with no prefix check. It signs at :201, and again on every read at :1400, :1854 and :2803. chat.controller.ts:311-318 takes an inline body type, so ValidationPipe checks nothing. The EMPTY-key shape from tonight is NOT reachable here: the column is NOT NULL (packages/db/src/schema/chat.ts:136) and :183 rejects ''. The unvalidated-key shape is reachable: a channel member (or an ex-member of another workspace who kept a key) posts `{storageKey:'workspaces/<other>/tasks/<id>/attachments/<file>'}` and gets a working signed URL. Minor: with R2 unconfigured the raw key comes back as `url`, which is the same branch tasks kept.

*To close:* Require storageKey to start with `chat/${channelId}/attachments/`, the prefix createAttachmentUploadUrl mints at :164.

### `product-siblings/clip-create-task-persists-24h-url` — **closed**, break run pending

**'Create a task' from a clip writes a 24-hour signed URL into the task description and keeps no key**

*Evidence:* comment-recorder.tsx:320-338 ensureLink returns clipShareUrl(...), which clip-publish.ts:108-121 requests with a 24h expiry (clips.service.ts:107-108 signs it). createTaskFromClip at :358-373 POSTs `description: url`. The task keeps no attachment or key reference to the clip. docs/video2-resume.md:244-246 (item 7) covers Copy link's unstated expiry, not this persisted copy. Failure: the next day the task created from a clip has a dead link and no way back to the recording.

*To close:* Attach the clip to the new task as a task attachment (or a clip reference) and render the link by signing on read.

*ClickUp:* the help article on Clip recordings lists the card's actions as "Create a task: Create a new task and attach the Clip", "New tab" and "Copy link", and says every clip is saved in the Clips Hub (web search, 23 September; help.clickup.com itself is blocked here).

*Closed:* Create a task puts the clip in the library (the Clips Hub, reusing the upload if Copy link already made it), creates the task, and has the API attach the clip: `POST /tasks/:id/attachments/from-clip` copies one of the workspace's clips (by shape, `clip-keys.ts`) inside the bucket to the task's own upload prefix, and records it as an attachment with the stored object's type and size (the 100 MB limit applies as for an upload). It is signed on every read, like any other file on the task, and the description carries no link. A copy rather than a reference, so the object has one owner: removing the attachment deletes the task's copy, deleting the clip leaves the task's. If the attach fails, the card says "The task was created, but the clip could not be attached to it", not "Task created". New in `R2Service`: `copyObject`. The lane store serves a copy (and, found doing it, `found-23-sep/lane-store-refused-the-apis-own-uploads`).

*Measured, lane 1:* `clip-created-card` 26/26. It asserted the defect as the spec (a check that the description held the stub's link); that check is gone and six took its place, run against the real store: no link in the description; one attachment under the task's prefix with the recording's type and size; the store's own log shows the copy made from the clip the card uploaded and no second upload; the task's attachment URL serves the recording; the clip is in the library; and a failed attach (the clip deleted from the library between the upload and the press, which the API answers 404) is reported as such. Against the old build: the first five failed, the description holding `http://127.0.0.1:9101/…/clips/…webm?X-Amz-…`, and the library twin passed. (The first version of the failure check armed the store's fail-next-put for the copy; the AWS SDK retried the 500, and the attach went through. That is correct behaviour, so the check uses a failure that is not retried.) `object-key-boundaries` §5 gained the attach route's pair: a key that walks out of the clips is refused with nothing attached, and the workspace's own clip is attached as the task's copy and serves the clip (21/21). `check-s3-stub` 23/23 cases, 19/19 mutations. Break patches, each compiled: `ccc-1`/`ccc-2` re-anchored, `ccc-4` re-aimed (it claimed the removed check), `ccc-5..9` new, `okb-22`/`okb-23` new.

### `product-siblings/contribution-sprint-unselectable` — **closed**

**The contribution report's 'Sprint' period cannot choose a sprint; ?sprintId has no client**

*Evidence:* reports.controller.ts:204-205 accepts sprintId. reports.service.ts:1666-1678 falls back, when it is absent, to the most recently started ACTIVE sprint in the whole workspace. workspace-insights-page.tsx:186-190 sends only period, and :498 offers the 'sprint' chip with no picker. The PDF download at :218-224 does the same. Failure: two spaces run concurrent sprints and the chip always reports whichever started last. A finished sprint can never be reported. ClickUp sprint reports let you pick the sprint.

*To close:* Add a sprint picker that sends sprintId to both the JSON and the PDF endpoints.

*Closed:* the Sprint period offers the workspace's sprints in a picker. Its default is the active sprint begun last, the server's own default. The report and its PDF both ask for the one chosen. Found fixing it: the server resolved a sprint id with no read rule, so a member asking for a private space's sprint was given its name as the period's label. It now reads sprints as the sprints list does (`goalReach`, `sprintVisibilityFilter`), for an id and for the default alike. The new suite `contribution-sprint`, 0 of 3 before on lane 1, 3/3 after: the member's label for a private sprint's id, beside the admin's; the picker, its default and a choice, read from the page's label; and the PDF request's body. `csp-1..4`, each compiled, 4 of 4 reddened on lane 2. Regression: the settings sweep, above. In CI.

### `product-siblings/cover-dangles-after-attachment-delete` — **closed**, break run pending

**Deleting the attachment used as a task's cover deletes the object, but the cover keeps signing its key**

*Evidence:* cover-image-picker.tsx:361 sets the cover to an existing attachment's key (`commit({kind:'stored', storageKey: a.storageKey})`). tasks.service.ts:2902-2911 (removeAttachment) deletes the row and calls r2.deleteObject(storageKey) without touching tasks.cover_storage_key. getTask (:2752-2754) and the list path (:2417) keep signing it. Failure: pick an attachment as the cover, then remove that attachment. The banner and the board card now load a live-looking signed URL to a deleted object, which renders as a broken image.

*To close:* In removeAttachment, clear cover_storage_key where it equals the removed key (or keep the object while referenced).

*ClickUp:* a Board card's cover is the first image attached to the task, or an attachment pinned as the cover ("Pin a Cover Image"; web search, 23 September). The cover IS an attachment, so it goes when the attachment does.

*Closed:* `removeAttachment` clears `cover_storage_key` where it names the removed object, and emits `task.updated` to the list and the task, the events the board refetches its tasks on. Only a stored key: a link cover is its own column, and deleting a link attachment removes no image. A cover uploaded through the picker's Upload tab has no attachment row and is untouched. `task-cover`, 41/41 on lane 1, three new checks: deleting another attachment leaves the cover where it was, still drawn; deleting the one it was picked from takes the cover off the task and off the board's list row; and on screen, removing it in the sheet over the Board takes the image off the card behind, with no reload. Against the unfixed build the first passed and the other two failed: the task still held the key, and it and the board row both carried a signed URL that served nothing; the card still drew it. (The on-screen check first opened `?view=board`, which names a SAVED view, so the Board never drew and the check failed for the wrong reason. It now switches views with the tab.) Regression on lane 1: list-card-cover 26/26, task-attachments 17/17, task-boundaries 45/45. `task-cover-17..19`, each compiled: the cover survives, any attachment takes it, the board is not told. *Break run (lane 1):* 17 and 18 reddened; 19 reddened NOTHING (41/41), because the board behind the sheet also hears the task's event through the sheet's own subscription, so it cannot tell whether the list was told. The list's event is for somebody else's board: the suite now opens a second board at the same time, where nobody touches a sheet (42/42), `task-cover-19` claims that check, and `task-cover-20` (no event at all) claims the first.

### `product-siblings/cover-storage-key-unvalidated` — **closed**

**PATCH /tasks/:id accepts any coverStorageKey and getTask signs it: a signed URL to another tenant's object**

*Closed (edecc0b, 5f687d3, c035b87):* a cover must be one of the task's own objects BY SHAPE — `task-object-keys.ts` `isTaskOwnObjectKey`, exactly one trailing segment in the sanitisers' alphabet, so `..` cannot walk out of the prefix — checked when written (400) and again when signed, in `getTask` and in the list rows, so a row poisoned by any other path is not turned into a URL. A prefix check, as proposed below, would have been bypassable: `getObjectUrl` in public-CDN mode returns the key unencoded and a browser collapses dot segments. `test/e2e/task-boundaries.mjs` §2, 19/19 on lane 1; `tb-3`…`tb-6`, `tb-13`, `tb-16` each redden the check they name.

*Evidence:* tasks.controller.ts:315 accepts coverStorageKey and :347 spreads the whole body into the patch. tasks.service.ts:2954-2961 checks only coverImageUrl and coverOffsetY, and :3011 writes `{...patch}`. The key is then signed at :2752-2754 (getTask) and :2417 (list rows). Compare addAttachment at :2815-2825, which refuses any key outside `workspaces/${ws}/tasks/${taskId}/attachments/` for exactly this threat. cover-image-picker.tsx:172-173 says the cover 'lands in the task's own storage prefix and inherits its access rules', but the server does not enforce that.

*To close:* In updateTask, when coverStorageKey is non-null, require it to start with `workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/` (or to equal the storage_key of an attachment row on this task). Reject anything else with 400. Add a break to task-cover.mjs that sets a foreign key.

### `ledger-rows/defect-ai-create-refusal-and-warnings` — **closed** (with `commit-log/log-462ed70-1`, the same two defects under another id)

**Create-with-AI shows a refusal key instead of the sentence, and never renders plan warnings**

*Evidence:* reaudit.md:2690-2704 ('Not fixed'). ai-containers.ts:108 returns `message: CONTAINER_REFUSAL_TEXT[reason]`, but ai.service.ts:3802-3808 returns only `reason: result.reason`. quick-create-modal.tsx:282-288 AiActionResult has no message, and the result line prints `(${r.reason})`. The AiPlan type declares warnings (:281), but :362-368 renders only create-ai-nothing when actions are empty.

*To close:* Pass result.message through executeOne and render it. Render plan.warnings where the 'nothing to create' line is.

*Closed:* a refused step carries its sentence (`message`, the `CONTAINER_REFUSAL_TEXT` entry for its code) beside the code, and the menu draws the sentence beneath the step. The code is shown in brackets only when a step has no sentence. A plan's `warnings` are drawn under its summary. The new suite `create-ai-results`, 0 of 2 before on lane 1, 2/2 after. The planner's answer is served by route (no model needed): a warning, and a list in a space that is not there. The confirm is the real one and refuses the list. Before, the plan drew no warning and the step read "— skipped (unknown_space)". `car-1..3`, each compiled, 3 of 3 reddened on lane 2. In CI. The regression sweep on lane 1, 18 suites, all green: create-ai-results, planner-gates, planner-onboarding, create-menu-ai, ai-create-containers, planner-settings, planner-rail, planner-views, planner-grid, planner-appearance-toggles, planner-command-bar, planner-upcoming-meeting, calendar-accounts, sidebar-reorder, sidebar-sections, ui-sweep, video1-acceptance, video-regression.

### `ledger-rows/defect-calendar-toggles-before-settings` — **closed**

**Holidays/Time-off calendars read ON and fetch before planner settings arrive**

*Evidence:* reaudit.md:2630-2639 ('Not fixed'). workspace-planner-page.tsx:444-446 derives both from `settings?.hiddenCalendarIds ?? []`, so they are true while settings is undefined. The queries at :562 and :684 are enabled on them without waiting for settings.

*To close:* Gate both queries on settings having loaded, with a check that reddens on a reload with the calendars hidden.

*Closed:* neither calendar is on until the planner's settings have answered, or have failed, which falls back to the defaults. So the holidays and time-off queries wait, and nothing is drawn before them. The new suite `planner-gates`, with the row below. Its first check: with both calendars hidden, a fresh load asks for neither and draws neither. Its twin: the same person with both shown is asked for the holiday and has it drawn. Before, on lane 1, the hidden load asked for `work-schedule` and `time-off`. `pgt-1`, compiled, reddened on lane 2. In CI. The regression sweep on lane 1, 18 suites, all green: create-ai-results, planner-gates, planner-onboarding, create-menu-ai, ai-create-containers, planner-settings, planner-rail, planner-views, planner-grid, planner-appearance-toggles, planner-command-bar, planner-upcoming-meeting, calendar-accounts, sidebar-reorder, sidebar-sections, ui-sweep, video1-acceptance, video-regression.

### `ledger-rows/defect-planner-connect-empty-consent` — **closed**

**Planner onboarding 'Connect Google/Outlook' still posts oauth/start with no readiness check (Zoom row now gated)**

*Evidence:* reaudit.md:2617-2628 ('Not fixed'). Fixed half: planner-settings-dialog.tsx:965-972 derives `available` from provider availability, and :1043-1047 disables Connect when unavailable. Still open: workspace-planner-page.tsx:823-835 connectCalendar POSTs oauth/start and assigns window.location.href with no availability check. integration-connections.service.ts:201-214 builds client_id from cfg.clientId without consulting readiness.

*To close:* Apply the same availability check to connectCalendar (client side, as the ledger says the server-side fix breaks app-catalogue).

*Closed:* the onboarding asks `providers/status` (the key the Zoom row reads) before it offers a connect button. A calendar the server cannot connect is greyed out, with a sentence saying an admin can add it in the App Center, and pressing it starts nothing. `planner-gates`, 1 of 3 before on lane 1: the no-key server offered Google Calendar and pressing it started OAuth; its twin, a server that can connect it, passed both times. 3/3 after. `planner-onboarding`'s own fixture answers every API call. It now says both calendars can be connected, as its connect-flow checks need, and it passes 12/12. `pgt-2..4`, each compiled, 3 of 3 reddened on lane 2. In CI. The regression sweep on lane 1, 18 suites, all green: create-ai-results, planner-gates, planner-onboarding, create-menu-ai, ai-create-containers, planner-settings, planner-rail, planner-views, planner-grid, planner-appearance-toggles, planner-command-bar, planner-upcoming-meeting, calendar-accounts, sidebar-reorder, sidebar-sections, ui-sweep, video1-acceptance, video-regression.

### `ledger-rows/defect-projects-position-unordered` — **closed**

**getProjectsBySpace has no ORDER BY, so a dragged order holds only in the sidebar**

*Evidence:* reaudit.md:2658-2665 ('Not fixed'). projects.service.ts:129-153: both selects have no orderBy on position.

*To close:* orderBy(projects.position, projects.createdAt) in both branches, with a check through a non-sidebar surface.

*Closed:* `getProjectsBySpace` orders by position, then age, in both branches. It had just been rewritten for `found-24-sep/private-folders-unenforced`, so it now has one query per branch. The new suite `project-order`: positions planted by SQL in the reverse of the order the projects were made, two sharing a place. `GET /projects/space/:id`, which every non-sidebar surface reads, came back in the database's order before (lane 1: fourth, first, second, third) and in the dragged order after. `por-1`, compiled, reddened on lane 2. Regression: the settings sweep, above. In CI.

### `product-siblings/docs-patch-mass-assign-public-share` — **closed**

**PATCH /docs/:id spreads the body into the row: a doc can be moved to another workspace, or made public despite blockPublicSharing**

*Closed (66f518a):* proven on lane 1 first — as a member of two workspaces, PATCH moved a doc into the other workspace, rewrote its creator, and minted a public link that answered 200 despite `blockPublicSharing`; create/import/from-template took any space, whose name the doc list then showed; `parentDocId` took any doc, including the doc's own child. `doc-update-fields.ts` is the one list of writable fields (the route refuses the rest by name, pointing at the share route when it is a link); `assertDocSpace` and `assertDocParent` (same workspace, reachable, never a descendant) guard every path; the list, the trash and the AI filter join only the doc's own workspace's space. `doc-boundaries` 17/17; db-1..17; unit tests for both field lists.

*Evidence:* docs.controller.ts:190-206 takes an inline body type and passes it whole. docs.service.ts:~451 `set = {...patch, updatedAt}` (only expectedUpdatedAt is deleted) → db.update(docs).set(set). The docs table (packages/db/src/schema/docs.ts:10-30) has workspaceId, publicShareId, publicShareEnabledAt, createdById and archivedById, all writable this way. enablePublicShare (docs.service.ts:561-577) enforces workspaces.blockPublicSharing, but PATCH {publicShareId:'anything'} skips that check. getByPublicShare (:611-627) then serves the doc anonymously by that slug. PATCH {workspaceId:<other>} re-homes the doc across tenants (FK only).

*To close:* Pick only title/icon/coverImageUrl/content/parentDocId/spaceId/position/isArchived in update. Verify that spaceId and parentDocId belong to the doc's workspace.

### `product-siblings/home-assigned-comments-shows-mentions` — **closed**

**The Home 'Assigned comments' section shows mentions; real assignment notifications and /chat/assigned-to-me are never read**

*Evidence:* app.$workspaceId.tsx:193 filters `['task_mentioned','mention']` and labels the result 'Assigned comments' (:302). The assignment notification types exist: comment_assigned (tasks.service.ts:4656) and message_assigned (chat.service.ts:2423), both declared at notifications.service.ts:174 and :183. GET /workspaces/:ws/chat/assigned-to-me (chat.controller.ts:483-489) has no web reader. workspace-chat-page.tsx:1177, :1189 and :1200 invalidate ['chat-assigned-to-me', ws], which no query uses. Sibling on the same page: 'Assigned to me' (:195) filters `task.status` against 'done'/'cancelled', although the endpoint returns statusCategory precisely because status keys are renamable (tasks.service.ts:1870-1876). Tasks in a renamed closed status stay listed.

*To close:* Filter on comment_assigned/message_assigned (or read /chat/assigned-to-me plus the task comment assignments). Use statusCategory !== 'closed' for Assigned to me.

*Closed (1561b5a, with the Inbox scope item):* the Inbox, Replies, Home and both badges read one workspace's notifications (plus account-level ones), page to the end by cursor, and take their counts from the server; Home's assigned-comment list reads the assignment types. `inbox-scope` 23/23; `ibx-1..24` 24 of 24 reddened, every run all 23 checks long (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `product-siblings/home-today-overdue-includes-closed` — **closed**, break run pending

**Home 'Today & overdue' counts completed tasks, and the member-task read is capped at 100 by updatedAt**

*Evidence:* app.$workspaceId.tsx:196-200: todayAndOverdue keeps any task with a dueDate today or past, with no status or category filter. getTasksForMember (tasks.service.ts:1869-1897) returns closed tasks (only isArchived is excluded) with statusCategory, orders by updatedAt desc and applies .limit(100). Every finished task with a past due date is therefore listed and counted as overdue (HomeItem count :305). A person with 100 recently touched tasks loses older open ones from both 'Assigned to me' and 'Today & overdue', which is a confident count.

*To close:* Filter statusCategory !== 'closed' for both sections. Move the open filter into SQL before the limit, or page it.

*Closed:* `getTasksForMember` returns open work only (category not `closed`), in SQL before the limit; soonest due first, undated last, so a cut takes the least urgent; and `?limit=` (default 500, at most 1000). Home drops its own status-KEY filter (renamable keys: a task in a closed status called "shipped" stayed in Assigned to me), asks for 501, and counts "500+" when the answer runs to the limit; a failed read says "Your tasks could not be loaded." instead of the empty state; rows and counts carry test ids. The same read is also the caller's now: `found-23-sep/workspace-reads-skip-the-container-rule`. New suite `home-my-work`, 7/7 on lane 1: the member's list has nothing finished (a `done` and a `shipped` task) or binned, still has a private task assigned to them, soonest first with `?limit=1` taking the overdue one; on Home, Assigned to me and Today & overdue list and count exactly that, a failed read (held to 500 by route, the route proven to fire) says so, and a 501-row answer is counted "500+". `hmw-1..9`, each compiled. In CI. *A claim withdrawn:* this row first said a binned task was not archived and so stayed on Home, unmeasured. `hmw-2`, which dropped the new `deletedAt` condition, reddened nothing (7/7) and showed why: `binTask` archives as well, so the old read never listed binned tasks. The condition stays (the list reads keep it), the check still guards it, `hmw-2` now drops both filters, and the comment in `restoreTask` that said a binned task is not archived, which is where the assumption came from, is corrected. *Break run (lane 3, aa239bc):* 8 of 9 reddened, the ninth being `hmw-2` as first written.

### `product-siblings/inbox-capped-confident-zero` — **closed**

**The Inbox reads 50 notifications with no pagination; chip counts and 'All caught up' are computed from those 50**

*Evidence:* notifications.service.ts:722 `.limit(opts.limit ?? 50)`. notifications.controller.ts:18-28 exposes no limit, offset or cursor. workspace-inbox-page.tsx:648-651 derives unread and chip counts 'from the list already loaded', and :1057-1059 shows 'All caught up' when those 50 are read, while the server's counts.unread (:645, :770-773) can still be greater than 0.

*To close:* Add a cursor (before=) and progressive loading. Take chip and unread counts from GET /notifications/counts.

*Closed (1561b5a, with the Inbox scope item):* the Inbox, Replies, Home and both badges read one workspace's notifications (plus account-level ones), page to the end by cursor, and take their counts from the server; Home's assigned-comment list reads the assignment types. `inbox-scope` 23/23; `ibx-1..24` 24 of 24 reddened, every run all 23 checks long (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `product-siblings/link-attachment-signed-as-key` — **closed**

**Hyperlink task attachments are stored in storage_key and signed as if they were object keys**

*Closed (51a371b):* `isLinkAttachmentKey` (task-object-keys.ts) is the one rule — no writer produces an object key that starts with a scheme. `attachmentUrl` replaces the three copies of the signing ternary and hands a link back untouched; `removeAttachment` sends nothing to the bucket for a link; both indexers skip links; the API reports each attachment's `kind`, and the cover picker makes a linked image the cover's LINK. Found through a regression: `task-cover` went red on the new cover-key rule because the picker had been writing link URLs into `coverStorageKey` — a cover that was signed as a key and never drew. `task-attachments` 17/17 (a link's url is the link; removing one sends no DELETE, read from the stub's new request log; an upload is a file and removing it deletes exactly its object), `task-cover` 38/38. Break patches tat-9..12 and task-cover-15/16 each redden their check on lane 2/3; unit claims ki-1 and tok-1 redden theirs (check-unit-claims 6/6). No new column: the scheme is the discriminator, which the item's own "or kind" allowed.

*Evidence:* tasks.service.ts:2832 `storageKey = data.storageKey ?? data.url`. :2798, :2877 and :4312 then call getObjectUrl('https://…'), producing `${CDN}/https://…` or a presigned GET for a nonexistent key. The code admits it at :2401-2402 ('is the bug task attachments still have') and :2746-2748. The web posts links this way (task-detail-sheet.tsx:5259-5269) and renders `a.url` as the download href (:5527-5538). Side effects: knowledge-indexer.service.ts:228-232 and ai.service.ts:2597-2600 call r2.getObject('https://…') for contentType 'text/url' (isExtractableAttachment accepts text/*, attachment-text.ts:43), so every reindex logs each link as 'unreadable'. removeAttachment (:2905-2907) calls deleteObject on the URL. No ledger doc lists it; the only mentions are code comments, a migration comment and two e2e headers.

*To close:* Give links their own column or kind (for example external_url) and pass http(s) through untouched, as covers do. Skip link rows in the indexers and in deleteObject.

### `commit-log/log-462ed70-1` — **closed** (as `ledger-rows/defect-ai-create-refusal-and-warnings`)

**The create menu's AI shows the key '(no_permission)' instead of the refusal sentence, and a plan's warnings are never shown**

*Evidence:* Commit 462ed70: 'Five defects recorded from the create-menu work, four unfixed'. ai.service.ts:3721 turns a ForbiddenException into the key 'no_permission' and throws away err.message. quick-create-modal.tsx:401 then prints it as `(${r.reason})`. AiPlan.warnings is declared at quick-create-modal.tsx:281 and read nowhere, so a plan that refuses everything shows create-ai-nothing (:366) instead. Ledger lines 2690-2704 mark both 'Not fixed'.

*To close:* Return the message along with the reason, and render the sentence. Render plan.warnings in the create menu the way workspace-ai-page does. Add checks and break patches.

*Closed:* the same two defects as `ledger-rows/defect-ai-create-refusal-and-warnings` above: the refusal's sentence is carried and drawn, and the plan's warnings are drawn. The evidence is written there.

### `commit-log/log-666f15f-1` — **closed** (with `ledger-rows/defect-projects-position-unordered`)

**Only the sidebar honours projects.position; getProjectsBySpace still has no ORDER BY**

*Evidence:* Commits 666f15f and 462ed70: 'honoured in one surface and contradicted by twenty'. A writer now exists (workspaces.service.ts:1060-1070), and the sidebar sorts in the browser (workspace-sidebar.tsx:1088-1104). projects.service.ts:118-152 getProjectsBySpace still returns rows with no orderBy, while its own comment says 'Fourteen surfaces ... every one of them reads this endpoint' (the Move dialog, pickers, the palette filter).

*To close:* Add orderBy(asc(projects.position), asc(projects.createdAt)) to getProjectsBySpace, drop the sort the sidebar does in the browser, and add a check that reads a second surface.

*Closed:* `getProjectsBySpace` orders by position, then age (`project-order`, with the ledger row named above). The sidebar's own sort is gone. Its comment said the server had no ORDER BY, which was no longer true, and the sort was a second statement of the server's order. `sidebar-reorder` 23/23 and `project-order` 1/1 after it. No patch is aimed at the sort's removal: putting it back draws the same order, and no check could tell. The regression sweep on lane 1, 18 suites, all green: create-ai-results, planner-gates, planner-onboarding, create-menu-ai, ai-create-containers, planner-settings, planner-rail, planner-views, planner-grid, planner-appearance-toggles, planner-command-bar, planner-upcoming-meeting, calendar-accounts, sidebar-reorder, sidebar-sections, ui-sweep, video1-acceptance, video-regression.

### `commit-log/log-a0b4108-1` — **closed**

**The sidebar's inline 'new folder here' dialog posts only {name}**

*Evidence:* Commit a0b4108: 'One asymmetry recorded rather than built'. workspace-sidebar.tsx:751 still sends POST /spaces/:id/folders with body { name } only. The main folder dialog has description, private and status-scope fields (ledger rows 780-781). ClickUp opens its full Create Folder modal from the sidebar.

*To close:* Point the sidebar entry at the same folder dialog, so there is one create surface, or send the same fields. Add a check.

*Closed:* the sidebar's "New folder" opens the Create menu's Folder form on its space, the way its "+" menu opens the other seven types (`spaceCreate`). There is one folder form, and the sidebar's own dialog is gone, with its two strings. The form was already the one the sidebar dialog was kept apart from: it keeps a refused name in its box and says why. `folder-create`'s sidebar path drives that form now, 22 checks: 15 of 22 before on lane 1 (the sidebar opened its own dialog, with no Folder tab and no space chosen), 22/22 after. Two new checks: the form opens on the Folder tab with this space chosen, and the folder saved from the sidebar holds the description and privacy typed into it, read back by SQL. One check passed without testing anything: "a name that is free closes the dialog" held for a dialog that never opened. It now requires the dialog to have been open. Patches: `folder-create-9` claims the sidebar path's refusal too, since it is that form's `onError`; `-10` (the button does nothing) and `-11` (the form closes on a refusal) are re-aimed; `-13..-16` are new (another tab, no space chosen, the description dropped, Make private not applied). Each compiled, and the seven reddened on lane 2, 7 of 7. Regression on lane 1, 9/9: `folder-create`, `folder-dialog`, `space-create-menu`, `sidebar-reorder`, `sidebar-sections`, `private-folder-reach`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `commit-log/log-ea0b946-1` — **closed** (66f518a; this row was not updated then)

**Doc create, import and create-from-template accept a spaceId, and a parentDocId, from another workspace**

*Evidence:* Commit ea0b946: 'neither create nor the import validates that spaceId belongs to the workspace ... could show another tenant's space NAME. Pre-existing, recorded here rather than folded into this change'. It is still true. docs.controller.ts:64-79 passes body.spaceId and body.parentDocId straight through. docs.service.ts:241-244 (create), :300-305 (import) and :399-400 (from template) insert them without checking. The list query at docs.service.ts:111 and :127 left-joins spaces and returns spaceName. Commit a866d86 fixed workspace membership only. Grep of docs/*.md finds no record of this defect, so the commit message is the only place it is written down.

*To close:* In all three writers, refuse a spaceId whose space is not in the path's workspace, and a parentDocId whose doc is not in it. Add an e2e check that uses a second workspace, and a break patch that removes the check.

*Closed (66f518a, 23 September), found still marked open on 24 September while reading the visible-bug list:* every doc writer guards its space and its parent. Create, import and create-from-template call `assertDocSpace`, a space of the path's own workspace that the writer may reach, and `assertDocParent`, a doc of the same workspace, reachable and never a descendant. PATCH writes only the fields in `doc-update-fields.ts` and refuses the rest by name. The evidence is recorded under `product-siblings/docs-patch-mass-assign-public-share` above: `doc-boundaries` 17/17, `db-1..17`. Read again today in docs.service: create at `assertDocSpace` and `assertDocParent`, import and template at `assertDocSpace`, update through `writable` and both guards.

### `product-siblings/meeting-record-panel-overwrites-key-with-signed-url` — **closed**

**The AI page meeting card writes the 15-minute signed recording URL back over the durable key on every Update**

*Closed (10a1317):* `R2Service.keyFromOwnUrl` recognises the URLs our own bucket hands out (public-CDN and path-style presigned); a URL naming the key already stored keeps the key, one naming any other object of ours is refused. The AI card sends the recording only when it was changed. `object-key-boundaries` "the signed URL a meeting hands out, sent back with an edit, leaves the durable key in place"; okb-11, okb-12; unit tests for both URL modes.

*Evidence:* workspace-ai-page.tsx:1092-1095 reads GET /workspaces/:ws/meetings, which signs recordingUrl (meetings.service.ts:214 via withRecordings/playableRecording). :1106 loads that signed URL into the Recording input, and :1124-1127 PATCHes `recordingUrl: recordingUrl.trim() || null` even when the field was never touched. meetings.service.ts:389-391 stores it. :65-69 says 'a signed URL written into this column is a dead link before the meeting notes have been read once'. Failure: a SyncUp-recorded meeting (key written at calls.service.ts:848), opened in the AI meeting card with a notes edit and Update, now has meetings.recording_url set to a presigned GET. 15 minutes later its Recording link is dead permanently when R2_PUBLIC_URL is unset (optional per .env.example:66-67).

*To close:* Web: send recordingUrl only when the user changed the input. Server: reject or ignore a value that is a signature of the stored key (a signed URL for our own bucket), and keep the key.

### `product-siblings/meeting-record-panel-startsat-utc-shift` — **closed**

**The AI page meeting card shifts startsAt by the viewer's UTC offset on every load and save**

*Evidence:* workspace-ai-page.tsx:1104-1105 comments 'datetime-local wants a local wall-clock string, not an ISO instant' and then uses `new Date(m.startsAt).toISOString().slice(0,16)`, which is UTC wall-clock. :1115 saves `new Date(startsAt).toISOString()`, which parses that string as LOCAL time. Failure in UTC+5: a meeting at 10:00Z loads as '10:00' and saves as 05:00Z, moving 5 hours earlier on every Update. quick-create-modal.tsx:2126-2131 does the conversion correctly (subtracts getTimezoneOffset).

*To close:* Use the same local-offset conversion as ReminderForm (or date-fns format(date, "yyyy-MM-dd'T'HH:mm")).

*Closed:* the card fills its box with `localDateTimeValue` (new, `lib/local-date.ts`): the local wall clock, which is what the save reads it as. ReminderForm, the chat's reminder box and the help page's booking slot each wrote the correct conversion out for themselves; all three read the helper now, so the rule is written once. The new suite `local-dates` runs its browser in Asia/Karachi. Its meeting check, on lane 1 before the fix: a meeting at 10:00Z showed "10:00", and one open-and-save moved it to 05:00Z (read back by SQL). After: "15:00", and the meeting stays at 10:00Z. `ldt-2` and `ldt-7` (the helper reading UTC hours), each compiled, and each reddened on lane 2. `cma-2` re-aimed at the chat's line, and reddened on lane 2. In CI. Regression on lane 1, 24 suites, all green: local-dates, the eleven planner suites (planner-rail, planner-views, planner-grid, planner-blocks, planner-priorities, planner-settings, planner-gates, planner-onboarding, planner-appearance-toggles, planner-command-bar, planner-upcoming-meeting), chat-message-actions, home-reminders, task-depth, settings-depth, no-dead-ends, a61-meeting-record, ai-answer-rendering, admin-audit-page, sidebar-reorder, ui-sweep, video1-acceptance and video-regression.

### `product-siblings/meeting-recording-key-unvalidated` — **closed**

**A meeting's recordingUrl with no scheme is treated as a storage key and signed, whatever it names**

*Closed (10a1317):* a client may store nothing, an http(s) link, or the stored value unchanged (`acceptRecordingInput`); keys are the server's to write. Reads sign only a recording of one of the workspace's own calls (`isWorkspaceCallRecordingKey`) and pass through http(s) only — the old `includes('://')` handed `javascript://…` back as a link. `calls.service` `attachRecording` checked a prefix; it checks the exact shape. `object-key-boundaries` §3–§4, 8 checks; okb-8..16.

*Evidence:* meetings.service.ts:71-76 (playableRecording): empty returns null (guarded), '://' passes through, and anything else goes to r2.getObjectUrl. create stores body.recordingUrl unchecked at :321, and update at :389-391. The body types are at meetings.controller.ts:42 and :88. So a member can store 'workspaces/<other-ws>/…' and GET /meetings returns a signed URL for it. calls.service.ts:791 is the correct model: it checks the key against `calls/${workspaceId}/${callId}/`.

*To close:* From clients, accept only http(s) URLs for recordingUrl. Keys should be written only by the server (calls.service.ts:848), or accepted only under `calls/${workspaceId}/`.

### `product-siblings/meetings-tag-filter-client-side` — **closed**

**The meetings page filters tags in the browser over a 200-row list, which the server comment says must not happen**

*Evidence:* meetings.service.ts:180-187 says to filter in SQL, 'not after the limit… would make a tag on the 201st meeting unreachable'. The SQL filter is at :196 and the cap at :202. meetings-api.ts:48-54 never sends ?tag. workspace-meetings-page.tsx:51-85 filters client-side. The chips are de-duplicated case-insensitively (:62-70), but the filter compares exact case (:77), so meetings tagged 'standup' vanish under the chip 'Standup'.

*To close:* Send tag to the server (and include it in the query key). Compare case-insensitively on both sides.

*Closed:* the page asks the server for a tag's meetings (`?tag=`, in the query key), and the server matches the tag whatever its case. The chips come from a new endpoint, `GET /workspaces/:ws/meetings/tags`: the tags on every meeting, one per word whatever its case. The page had built them from the list it loaded, its newest 200, so a tag only an older meeting carried had no chip. The new suite `meeting-tags` plants 200 newer meetings by SQL behind an old one carrying its own tag, and four meetings through the API. On lane 1 before, 0 of 4:
- "standup" found only the lower-case meeting, and "STANDUP" found none;
- the tag list did not exist (400);
- the old tag had no chip;
- the Standup chip showed "Standup" and hid "standup".

After, 4/4. `mtg-1..4`, each compiled. Regression on lane 1, 17 suites: `meeting-tags`, `planner-prefix`, `a61-meeting-record`, `meeting-access`, `object-key-boundaries`, `planner-upcoming-meeting`, `planner-settings`, `planner-appearance-toggles`, `focus-pill`, `tab-title-countdown`, `planner-rail`, `planner-views`, `planner-gates`, `local-dates`, `ui-sweep`, `video1-acceptance` and `video-regression`. 16 passed in the sweep. `planner-upcoming-meeting` threw: its stub answered every `/meetings` URL with meetings, the new tags route included, and the page cannot draw an object as a chip. Its stub answers the tags route now, and it passed 8/8 through `verify.sh` on lane 1. In CI.

### `commit-log/missed-docs-patch-1` — **closed** (66f518a; this row was not updated then)

**PATCH /docs/:docId is a fourth unchecked writer of spaceId and parentDocId, and it also writes undeclared columns**

*Evidence:* docs.controller.ts:190-206 declares the body as an inline type literal. The global ValidationPipe (main.ts:38-46, whitelist:true) does not validate or strip a body whose metatype is plain Object, so every key reaches the service. docs.service.ts:452 then does `const set = { ...patch, updatedAt: new Date() }` and :455 writes it with db.update(docs).set(set). Consequences: (1) spaceId and parentDocId from another workspace are written with no check, the same defect ea0b946 recorded for create and import, through a route the finder did not list. (2) Columns the body never declares, including workspaceId, createdById, publicShareId (docs.ts:27) and plaintext, are also written. (3) There is no cycle check, so a doc can be made its own parent or its descendant's child (searching the docs module for 'cycle' or 'descendant' finds nothing). assertDocAccess (:179-188) checks only membership of the doc's CURRENT workspace, not a role. Reasoned from the code, not run against a live API.

*To close:* Whitelist the patchable fields explicitly, rather than spreading the body. Refuse a spaceId or parentDocId outside the doc's workspace, and refuse a parent that is the doc itself or one of its descendants. Add an edit-permission check. Cover it with an e2e check that uses a second workspace, plus a break patch that restores the spread.

*Closed (66f518a, 23 September), found still marked open on 24 September while reading the visible-bug list:* every doc writer guards its space and its parent. Create, import and create-from-template call `assertDocSpace`, a space of the path's own workspace that the writer may reach, and `assertDocParent`, a doc of the same workspace, reachable and never a descendant. PATCH writes only the fields in `doc-update-fields.ts` and refuses the rest by name. The evidence is recorded under `product-siblings/docs-patch-mass-assign-public-share` above: `doc-boundaries` 17/17, `db-1..17`. Read again today in docs.service: create at `assertDocSpace` and `assertDocParent`, import and template at `assertDocSpace`, update through `writable` and both guards.

### `product-siblings/planner-block-prefix-cannot-clear` — **closed**

**The planner block-title prefix cannot be cleared back to the default**

*Evidence:* planner-settings-dialog.tsx:643 sends `blockPrefix: value.trim() || undefined`, which JSON drops. planner.service.ts:442-452 merges `{...currentPlanner, ...plannerOnly}`, so the old value stays. Failure: set 'Deep work:', clear the field and blur, reload, and it is still 'Deep work:'. The two readers disagree on '' (workspace-planner-page.tsx:964 uses ??, use-focus-tab-title.ts:248 uses ?.trim() ||), so the fix should send null, not ''.

*To close:* Send null. Server: on null, delete the key from the blob (or store null so both readers fall back).

*Closed:* an emptied box sends `null`, and the server keeps null, which both readers fall back from. A loop deleting null keys was written first and taken out: no check could tell it from storing null. The server now validates the prefix: text of at most 40 characters, or null. The new suite `planner-prefix` signs up its own person, since planner settings are per person. On lane 1 before, 1 of 2: "Deep work:" saved, then cleared, and after a reload the server and the box both still said "Deep work:". After, 3/3, with a third check for the new cap (41 characters refused, the held prefix kept). `ppx-1..3`, each compiled. Regression on lane 1, 17 suites: `meeting-tags`, `planner-prefix`, `a61-meeting-record`, `meeting-access`, `object-key-boundaries`, `planner-upcoming-meeting`, `planner-settings`, `planner-appearance-toggles`, `focus-pill`, `tab-title-countdown`, `planner-rail`, `planner-views`, `planner-gates`, `local-dates`, `ui-sweep`, `video1-acceptance` and `video-regression`. 16 passed in the sweep. `planner-upcoming-meeting` threw: its stub answered every `/meetings` URL with meetings, the new tags route included, and the page cannot draw an object as a chip. Its stub answers the tags route now, and it passed 8/8 through `verify.sh` on lane 1. In CI.

### `resume-defects/resume-1-move` — **closed**

**The container create gate has a second side door: moving a list, project or folder INTO a view-only space checks only the source**

*Closed (b523e33, 56f87b2):* `assertCanPlaceIn` (container-access.ts) — the destination's create gate and a container the actor can see — is called by `moveList`, `moveProject` and the folder move. `space-default-permission` 36/36: a member's own list, project and folder are refused the view-only space (the list also a private project) and move into editable ones; the actor is a member given `project.create` by a custom role, so only the destination rule can refuse. sdp-20..24, sdp-30.

*Evidence:* lists.service.ts:362-386 moveList calls assertManageable (:407-430), which runs assertCanManageContainer with the SOURCE list's spaceId. The destination project is checked only for workspace and archived status (:374-383). projects.service.ts:240-290 moveProject calls assertManageable on the source and checks the destination space only for workspace and archived status (:255-267). folders.service.ts:177-215 calls assertCanManageContainer with the source spaceId (:207-214), never targetSpaceId. Routes: POST /lists/:listId/move (lists.controller.ts:114-122) and POST /projects/:projectId/move (projects.controller.ts:57-65) carry no permission requirement. POST folders/:folderId/move needs the role permission space.create (folders.controller.ts:53). So a member with edit in space A and view in space B can make a list in A (the create gate passes) and then move it into B.

*To close:* In moveList, moveProject and folders.move, call assertCanCreateInSpace(db,{spaceId: destinationSpaceId, actorId, kind}) before the update. Add checks to space-default-permission.mjs: moving the member's own list, folder and project into the view-only space is refused, while moving them into an edit space succeeds. Add a break patch for each call.

### `resume-defects/resume-1-residual` — **closed**

**Container create gate: fixed on the three services, but applying a template still creates projects and lists in a space without the gate**

*Closed (b523e33):* template apply calls `assertCanPlaceIn` for list templates (the project's space and the project) and folder templates (the space). Found beside it and closed: a folder template made a project with no `project.create` check — a permission members do not hold, which `POST /projects` enforces — so apply now requires `project.create` (folder) or `space.create` (space); and apply answered 500 for a template list with no `tasks`, now read as empty, with `create` refusing a nameless list or untitled task. `space-default-permission` checks all three; sdp-25..29.

*Evidence:* The fix is present: assertCanCreateInSpace (common/permissions/container-access.ts:148) is called from projects.service.ts:84, folders.service.ts:104 and lists.service.ts:157. But POST /workspaces/:workspaceId/project-templates/apply is guarded only by the class-level JwtAuthGuard and WorkspaceMemberGuard (project-templates.controller.ts:11, 90-107, with no WorkspaceAdminGuard on apply). project-templates.service.ts:711-800 then inserts a project into dto.targetSpaceId (744-773: the space is looked up by workspace only) and inserts lists into dto.targetProjectId (736-743, 790-799), with no assertCanCreateInSpace and no container permission check. So a member in a 'View only' space can create a folder and lists there through the templates page (workspace-templates-page.tsx:663) or the API. I grepped for every `.insert(lists|folders|projects)` in apps/api/src. The other direct inserts are workspace seeding, sample data, and imports behind WorkspaceAdminGuard (clickup-import.controller.ts:26, 54; spreadsheet-import.controller.ts:58), or new-space creation.

*To close:* Call assertCanCreateInSpace(db, {spaceId, actorId: userId, kind}) in apply for targetType 'folder' (the target space) and 'list' (the project's space) before any insert. Add a check to space-default-permission.mjs: a member in a view-only space is refused a template apply there, while the same member in an edit space succeeds. Add a break patch that removes the call.

### `resume-defects/resume-6-list-table` — open, small

**The list Table view's sticky header is the same sticky-in-name-only facade**

*Evidence:* apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx:4838 is `rounded-lg border bg-card overflow-hidden`, :4859 is `<div className="overflow-x-auto">` with no height bound, and :4862-4866 is data-testid list-table-head `sticky top-0`. Rows are bounded only when useTableVirtualization is on (≥120 tasks; TABLE_VIRTUALIZE_THRESHOLD :671; :4929-4931 `max-h-[70vh] overflow-auto`). The header sits outside that rows scroller, so it stays in place without sticky. Below 120 tasks, the header's scrollport is the unbounded overflow-x-auto div, and it scrolls away with the page. In neither mode does `sticky` do anything. The finder's scan missed this because it filtered on glass cards.

*To close:* Bound the table pane (max-height plus overflow-auto on the element that also scrolls horizontally) in both modes, with overflow-clip rather than overflow-hidden on the wrapper. Add a check in list-view-controls that scrolls a list of about 30 rows and measures list-table-head holding offset 0, plus a break patch that removes the bound.

### `resume-defects/resume-6-workload` — open, small

**The sticky-in-name-only header survives on the Workload heat map**

*Evidence:* apps/web/src/pages/workspace-workload-page.tsx:245-249: `<Card variant="glass" className="overflow-hidden p-0">` > `<div className="overflow-x-auto">` (no height bound) > `<div className="flex border-b ... sticky top-0 ...">`. This is the exact shape the timeline page's comment at 787-807 diagnoses: overflow-x:auto forces overflow-y to auto, making that div the header's scrollport, and an unbounded element never scrolls vertically, so the header can never stick. I scanned every .tsx file that uses variant="glass" or card-glass together with `sticky`. The only other hits are dashboard-widget-builder.tsx:266 (the card itself is xl:sticky, which is not this shape), docs-panel.tsx:1251-1253 (an overflow-auto wrapper whose height I did not confirm) and landing-page.

*To close:* Apply the timeline technique. Bound the heat-map pane with a max-height and overflow-auto, and use overflow-clip on the card if the rounded corner is still wanted. Add a check that scrolls the pane and measures that the header stays at offset 0, plus a break patch that removes the bound.

### `product-siblings/sanitize-filename-deref-before-fallback` — **closed**, break run pending

**Three sanitizeFileName copies dereference input before their own fallback; a missing fileName gives a 500**

*Evidence:* tasks.service.ts:765-767, chat.service.ts:130-132 and clips.service.ts:17-19 all do `input.replace(...)… || 'file'`, so the fallback is unreachable for undefined. forms.service.ts:439-441 is the guarded copy (`(input || '')`). The callers take inline body types that ValidationPipe cannot check (tasks.controller.ts:649-659, clips.controller.ts:20-27, chat.controller.ts:302-318, used at chat.service.ts:163, :188 and :1219). A presign with no fileName throws TypeError and returns 500, not 400. This is the same shape clips.remove already fixed for storageKey (clips.service.ts:83-84).

*To close:* Extract one guarded helper (use the forms version) and use it at all sites.

*Closed:* four copies, not three: forms had the guarded one. `common/storage/file-name.ts` `safeFileName(input, fallback)` is that one, and all seven call sites use it: the task attachment presign and clip attach, the clip presign, the chat attachment presign and record, the custom-emoji presign, the form upload. Measured on lane 1 before: all five routes that can take a missing name (task, clip, chat presign, chat record, emoji) answered 500. `object-key-boundaries` §6, 23/23: each now names the key `…-file` (a clip `…-clip.webm`) and the chat record shows "file", beside a named file keeping its name, made safe. Unit tests `file-name.test.ts` (3). `sfn-1..3` compiled; `sfn-4` is a unit claim, shown to fail its named test.

### `product-siblings/task-listid-mass-assign-cross-workspace-move` — **closed**

**PATCH /tasks/:id and POST /tasks/:id/move accept any listId, which moves a task into another workspace; only the bulk path checks the boundary**

*Closed (edecc0b, 5f687d3, c035b87):* `task-update-fields.ts` is the one list of writable fields; the route REFUSES anything else by name (400, and names the move route when it is `listId`) and the service drops it as defence in depth. `moveTask` now resolves the target and requires the same workspace (404), the space's create gate (`assertCanCreateInSpace`, 403) and container visibility (`checkContainerAccess`, 403). Found beside it and closed in the same change: `parentTaskId` on update AND create never asked where the parent lived (now 404 across workspaces, and the parent must be readable), and `addAttachment`'s `startsWith` check let a `..` key through (now `isTaskUploadKey`). `task-boundaries.mjs` §1, §3–§5; 18 break patches, each reddening the check it names on lane 2.

*Evidence:* tasks.controller.ts:29 has only JwtAuthGuard at class level. PATCH :297-351 has no ResourceMemberGuard and spreads the inline body (:347). tasks.service.ts updateTask :3011 `set = {...patch}` → :3046 db.update(tasks).set(set). No key whitelist exists, so listId, statusCategory, completedAt, createdById, taskTypeId and recurrence are all writable. moveTask :3621-3628 checks write access on the SOURCE task only, then sets listId to the body's targetListId. By contrast, bulkUpdateTasks :3244-3256 and :3310 resolve the target list's workspace and 'reject moves that would cross a workspace boundary'. RLS does not help: 0071_row_level_security.sql:8-18 says the app role owns the tables and bypasses RLS. Same unchecked-reference family as coverStorageKey. projects.service.ts:185, spaces.service.ts:447 and users.service.ts:248 already fixed this shape for their own PATCHes.

*To close:* Whitelist updateTask's writable keys. In moveTask (and on PATCH listId, or drop listId from PATCH), resolveWorkspaceForList(target), require it to equal the task's workspace, and assert write access on the target list.

### `product-siblings/task-sheet-refetch-storm` — open, small

**The task sheet invalidates the ['task', id] prefix on every realtime event, then re-invalidates the children it already covered**

*Evidence:* The realtime handler at task-detail-sheet.tsx:1205-1211 invalidates ['task', taskId]. As a prefix that refetches every active sub-query (comments, attachments, activity, time, subtasks, dependency-graph, mention-candidates, email-address, description-history: 35+ keys under this prefix in the file). It then invalidates ['task', taskId, 'comments'] and ['activity'] again, which cancels and restarts them (react-query's default cancelRefetch). One updateTask emits task.updated (tasks.service.ts:3110-3115) and activity.created (:3101 via logActivity :575), and the mutation's own onSuccess invalidates the same prefix (34 sites, e.g. :1043, :1070, :1092). So a single priority change re-fetches each open sub-query about three times, and comments/activity up to four. The attachments panel (:5273-5275, :5313-5315) awaits three sequential invalidations, which fetches attachments and activity twice.

*To close:* Invalidate ['task', taskId] with exact: true for the detail, plus the specific sub-keys per event type. Drop the narrower invalidations that follow a prefix invalidation.

### `product-siblings/teams-work-preview-ignores-privacy` — **closed**

**GET /workspaces/:ws/teams/work-preview returns every member's open task titles with no visibility filter**

*Closed (c7f69d1):* the preview takes the viewer and applies the container rule (new `containerVisibilityFilter`, `checkContainerAccess` as a WHERE fragment, written beside it), the list rule and the task rule; the card's count is of what it shows. `read-visibility` 8/8: of a teammate's five open tasks — public, private space, private project, private list, private task — a plain member sees exactly the public one, while the manager and the teammate see all five. rv-1..10.

*Evidence:* workspace-groups.controller.ts:119-131 uses WorkspaceMemberGuard only and passes no actor. workspace-groups.service.ts:358-380 selects tasks by assignee across the workspace without taskVisibilityFilter or a private space/project check. workspace-groups is absent from the 14 services that call taskVisibilityFilter (rg -l). Failure: a member with no access to a private space sees the titles and due dates of tasks in it on the Teams page.

*To close:* Pass the actor and apply taskVisibilityFilter / resolveIsManager as the other readers do.

### `product-siblings/timeline-projectid-param` — open, small

**Timeline ?projectId (resume §3 item 4): still unsent, and harmless in effect; the from/to options are a reader of nothing**

*Evidence:* tasks.controller.ts:126-137 accepts projectId. workspace-timeline-page.tsx:227-230 never sends it, and filters client-side at :260-263 over an UNCAPPED read (tasks.service.ts:1834-1865 has no limit), so users see the same result. The cost is a whole-workspace payload, filtered in JS for `startDate || dueDate` (:1864). getTimelineForWorkspace declares opts.from and opts.to (:1831) that nothing applies.

*To close:* Send projectId when projectFilter !== 'all' (and put it in the query key), or delete the param. Apply or delete from/to, and move the date filter into SQL.

### `product-siblings/timesheet-mine-includes-everyone` — **closed**

**The time page's 'Mine' timesheet is built from an unfiltered, 500-row list: admins see everyone's hours as their own**

*Evidence:* time-entries.controller.ts:17-31 supports userId and since, and returns ALL users when the caller can moderate and sends no userId. time-entries.service.ts:204-205 filters and :230 applies .limit(500). workspace-time-page.tsx:93-102 sends neither param. weekEntries (:231-234) filters by day only, not by user. The Submit button is gated on it (:415), and 'mine' mode renders it (:509-521). Failures: (a) a workspace admin whose three teammates each logged 8h on Monday sees 32h on their own 'Mine' grid, and Submit is enabled for a week they logged nothing. (b) In any workspace past 500 entries, earlier weeks render as 0h. ClickUp's My timesheet shows only your own entries.

*To close:* For the Mine grid, request userId=<me> with since=<weekStart>, and add an until bound. Keep the 'team' path separate.

*Closed (5fd9718):* "Mine" asks for the viewer's own entries within the week, and the week's figures sum those. `timesheet-mine` 8/8; its 8 patches 8 of 8 reddened (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `product-siblings/workload-csv-dates-shifted-east-of-utc` — **closed**

**Workload CSV headers label each day one day early in UTC+ zones**

*Evidence:* workspace-workload-page.tsx:57-66 builds dates as LOCAL midnights (setHours(0,0,0,0)), and :93 formats them with `d.toISOString().slice(0, 10)`. East of UTC (for example Asia/Karachi, the walkthrough's own zone), local midnight is the previous day in UTC, so every column header is the day before the load it carries. workspace-planner-page.tsx:225-236 documents and fixes exactly this defect for the planner. Same family as the AI meeting card's startsAt shift.

*To close:* Use date-fns format(d, 'yyyy-MM-dd'), or the planner's local-day helper.

*Closed:* the planner's local-day helper moved to `lib/local-date.ts` as `localDayKey`, and the CSV labels its columns with it. Three exports named their files by the UTC day the same way: the workload CSV, "Download my data" and the audit log's Export CSV. Saved before 05:00 in Karachi, each was dated the day before. They use the helper too. `local-dates`, on lane 1 before: the CSV's first column was 2026-09-23 on the 24th in Karachi. With the browser clock held at 02:00 there, the three files were `workload-14d-2026-09-23.csv`, `rundesk-my-data-2026-09-23.json` and `audit-log-2026-09-23.csv`. After: the first column is the 24th, and all three names carry the 24th. The suite measured 0 of 3 before and 3/3 after. `ldt-1`, `ldt-3..6`, each compiled, 5 of 5 reddened on lane 2. In CI. Regression on lane 1, 24 suites, all green: local-dates, the eleven planner suites (planner-rail, planner-views, planner-grid, planner-blocks, planner-priorities, planner-settings, planner-gates, planner-onboarding, planner-appearance-toggles, planner-command-bar, planner-upcoming-meeting), chat-message-actions, home-reminders, task-depth, settings-depth, no-dead-ends, a61-meeting-record, ai-answer-rendering, admin-audit-page, sidebar-reorder, ui-sweep, video1-acceptance and video-regression.

### `product-siblings/workspace-inbox-unscoped-by-workspace` — **closed**

**The workspace Inbox and Home list notifications from every workspace, while the switcher badge counts per workspace**

*Evidence:* notifications table has workspace_id (packages/db/src/schema/notifications.ts:10). NotificationsService.list (notifications.service.ts:707-721) filters only userId, unreadOnly and view. The controller (notifications.controller.ts:18-28) takes no workspaceId. The workspace-scoped pages call it unscoped: workspace-inbox-page.tsx:565 `/notifications?view=${view}` and app.$workspaceId.tsx:125-129 (keyed ['notifications', workspaceId] but fetching `/notifications`). unreadByWorkspace (:875-895), read by workspace-sidebar.tsx:981-982, groups by workspace_id. So workspace A's Inbox shows, counts and 'mark all read's workspace B's items, while B's switcher badge implies they are separate. It is a mirror: the column is stored and the list honours none of it.

*To close:* Add an optional workspaceId filter to list/counts and send it from the Inbox and Home, or state in the UI that the inbox is cross-workspace. ClickUp's inbox is per workspace.

*Closed (1561b5a, with the Inbox scope item):* the Inbox, Replies, Home and both badges read one workspace's notifications (plus account-level ones), page to the end by cursor, and take their counts from the server; Home's assigned-comment list reads the assignment types. `inbox-scope` 23/23; `ibx-1..24` 24 of 24 reddened, every run all 23 checks long (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `found-23-sep/watchers-route-open-to-any-account` — **closed** (found while closing the task-reference items)

**`POST /tasks/:id/watchers` had no access check, in the route or the service: any signed-in account could follow any task by id and was answered with the whole task**

*Evidence:* proven on lane 1 before the change — an account sharing no workspace with the task got `403` from `GET /tasks/:id` and `201` from `POST /tasks/:id/watchers`, whose body carried the task's title and description; the watcher row then routed every later notification to it. `DELETE /tasks/:id/watchers/:userId` was equally open.

*Closed (cdf5fbc):* following needs read access; putting somebody else on, or taking them off, needs write; the person followed must be able to see the task (`assertPersonCanSeeTask`); both routes carry `ResourceMemberGuard`, like the task's own GET. `task-boundaries` §6, 8 checks; tb-19..26.

### `found-23-sep/task-relationship-references-unchecked` — **closed**

**Assignees, labels and dependencies took any id: an outsider could be assigned, another workspace's label worn, and a dependency used to read any task**

*Evidence:* `addAssignee` asserted write on the task and nothing about the person; `createTask` wrote `assigneeIds` and `labelIds` unchecked; `addLabel` took any label; `addDependency` checked nothing about the related task while `getTask` returns each dependency's related task row whole; `removeDependency` took the dependency's id alone, so any member could delete any dependency. The service's `assertTaskReadAccess` ignored item privacy (private lists and tasks), which `ResourceMemberGuard` enforces — so every service path asking "can this person see the task" said yes for a private one.

*Closed (cdf5fbc):* an assignee must be able to see the task (and for `createTask`, the list, checked before anything is written); a label must be the workspace's own; a dependency obeys the parent rule, now one helper `assertTaskReference`; a dependency is removed only through a task it touches; the read check includes item privacy. `getTask` shows parent, subtasks, dependencies and labels only from its own workspace, and the dependency graph stops at the workspace's edge — the read-side twin for rows written before the writes checked. `task-boundaries` §7–§10, 17 checks, the read side against rows poisoned by SQL, each paired with a neighbour that belongs; tb-27..44. API unit tests 1561/1561.

### `found-23-sep/assign-someone-who-cannot-see` — **closed** (the ClickUp behaviour confirmed; no change)

**Assigning a member who cannot see the task is now refused with a reason; ClickUp, as understood, shares the task with them instead**

*Evidence:* the refusal closes the leak (an assignee who cannot open a task was still notified with its title), and is honest — before, the assignment succeeded and the assignee could not open what they were assigned. ClickUp's behaviour for private locations, as I understand it, grants the assignee access to that one task. Unverified: help.clickup.com is unreachable from this environment.

*To close:* confirm ClickUp's rule from its docs; if it shares, add task-level access for assignees to `assertTaskReadAccess` and the guard's item rule, and the list/home reads that filter by container — with checks that the assignee sees exactly that task and nothing else in the container.

*Closed, by research:* ClickUp does not share a task with an assignee who cannot open it. You share the Folder or List with them first, and "assign tasks to any user regardless of Folder/List permissions" is an open feature request on ClickUp's own board (feedback.clickup.com, "Assign Tasks to Any User Regardless of Folder/List Permissions"). A private task shared with someone makes them request access, approved from the Inbox (help.clickup.com "Make Spaces, Folders, Subfolders, Lists, and tasks private"). So the refusal already built, with its reason, is ClickUp's behaviour, and sharing-on-assign would be a feature ClickUp does not have. Held by `task-boundaries` (`tb-45-private-task-assignment-refused`).

### `found-23-sep/related-tasks-ignore-private-containers` — **closed** (security, small)

**A task handed its reader each related task's whole row, a private space's title and description included**

*Evidence, measured on lane 1 (probe `measure-related-tasks`):* a member opening their own task, which the admin had tied to a task in a private space (403 to the member), got two dependency rows. Each carried that task's whole row, its DESCRIPTION too, because `getTask` joined `related: tasks` with no reader. The same task came back from every write that answers with the task. The dependency graph and the blocked notice were fixed this morning (`dependency-read-access`), and `getTask`'s own list was not.

*Closed:* `getTask` takes its reader. It keeps only the related tasks they may open (`readableTaskIds`) and counts the rest (`hiddenDependencies`), so a dependency they cannot see is still known to be there, as the graph reports it. The route passes its caller. Creating, editing, moving, assigning, labelling and following a task answer as their actor sees it, and internal callers pass none. The new suite `related-task-access`, 3/3 (0/3 before), with dependencies planted by SQL: the member's task names nothing of the private one and keeps the open one, counts two left out (the admin, none), and the answer to the member's own edit is as clean. `rta-1..3`, each compiled. API unit tests 1628/1628. Regression: the sweep above, 12/12. In CI.

*Break run (lane 2, 7f37f7b):* `rta-1` and `rta-2` reddened; `rta-3` reddened nothing (3 passed). It changed `updateTask`'s last line, a `return` reached only when the list has no workspace, which no edit reaches; the edit's answer is the read inside the workspace branch. Re-aimed there; its re-run is pending.

### `found-23-sep/container-read-rule-twice` — **closed** (with `found-24-sep/private-folders-unenforced`)

**The container read rule exists in THREE forms: `assertContainerReadAccess` in tasks.service inline, `checkContainerAccess` used by the guard (and its WHERE-fragment twin `containerVisibilityFilter`, written beside it on purpose), and an SQL predicate in ai.service that omits the space-admin case**

*Evidence:* both implement manager bypass, private-space membership, private-project membership or space admin; they agree today (compared on 23 September). Two copies of an access rule is the duplicated-list defect: the day one learns a case, the guard and the service disagree.

*To close:* make `assertContainerReadAccess` call `checkContainerAccess` (keeping its two distinct messages by asking which half failed), and replace ai.service's predicate with `containerVisibilityFilter` — which also gives space admins the private-project access the guard gives them.

*Progress:* the ai.service predicate named here is gone, replaced by the shared filters in `filterAccessibleHits` (`found-24-sep/ai-knowledge-filter-copies-the-container-rule`, above). What remains is `assertContainerReadAccess` in tasks.service, which still restates `checkContainerAccess` to keep its two messages.

*Closed:* the rule learnt a private folder, and the copy would have missed it. `containerRefusal` states the rule once and says which container refused. `checkContainerAccess` is its yes-or-no, and `assertContainerReadAccess` answers with its three messages from it. A third copy, `getProjectsBySpace`'s, asks the shared rule too (`found-24-sep/private-folders-unenforced`, below).

### `found-23-sep/labels-editable-by-any-member` — **closed** (security, small; the policy confirmed from ClickUp's help)

**`PATCH /labels/:id` and `DELETE /labels/:id` needed only workspace membership: any member, and any GUEST, renamed or deleted the workspace's labels**

*Evidence:* labels.controller.ts, class-level `ResourceMemberGuard` resolves `:labelId` to its workspace and checks membership; the service checks nothing else. Measured on lane 1 before the fix: a guest created a tag (201), renamed the admin's (200) and deleted it (200).

*The policy, from ClickUp's help (search snippets: "Default user role permissions", "Manage task tags"):* members may create, edit and delete tags, and "permissions for tags" is a standing feature request there because nothing narrows that. Guests "can't create, edit, or delete tags", though they may add and remove tags on tasks. So a member doing it is ClickUp's behaviour, and a guest doing it was the defect.

*Closed:* the labels service refuses a guest's create, rename and delete (403, "Guests cannot create, rename or delete tags"). Typing an existing tag's name still FINDS it, which a guest may do, since that is how a tag is added to a task. The new suite `label-access`, 3/3 on lane 1 (0/3 before). Tags are planted by SQL and every refusal is read back beside a member doing the same. `lac-1..3`, each compiled. API unit tests 1628/1628. Regression on lane 1, 8/8: the new suite, `task-boundaries` (its label routes), `task-depth`, `space-features`, `template-center`, `clickapps-plan-gating`, `ai-action-categories`, `video1-acceptance`. In CI.

### `found-23-sep/call-meeting-record-lost` — **closed** (a regression introduced and fixed the same day)

**For about an hour, every recorded call ended with no meeting record**

*Evidence:* 10a1317 made `meetings.create` refuse a storage key in the client's `recordingUrl`. `calls.service` end() passed the call's own key through that field, `create` threw, and the `.catch(() => null)` around it swallowed the error. The unit tests mocked `meetings.create` and accepted anything; `object-key-boundaries` never ends a recorded call. The full sweep caught it: `syncup-live` 53/59, "it left a meeting record behind — the call named no record of itself".

*Closed (35f4c6e):* the key travels in a server-only fourth argument the route cannot reach, still checked as one of the workspace's call recordings. `syncup-live` 59/59; unit tests pin the channel. The lesson this adds: a rule that tightens a shared service method has to be run against every internal caller, not only the route it was written for.

### `found-23-sep/clip-keys-checked-by-prefix` — **closed**, break run pending (found reading the clip code for `clip-create-task-persists-24h-url`)

**Sharing or deleting a clip took any key that starts with the workspace's clip prefix, so `..` reached another workspace's objects**

*Evidence:* `clips.service.ts` `share` (:104) and `remove` (:85) checked `storageKey.startsWith('workspaces/<ws>/clips/')`, the prefix check that was replaced by a shape check for task attachments, chat attachments, emoji and call recordings. Measured on lane 1 against the running API: a member of workspace A and B planted a task attachment in B. Then, in A, `POST /workspaces/A/clips/share {storageKey: 'workspaces/A/clips/../../../<B's key>'}` answered 201 with a URL whose path, with its dot segments collapsed as a browser collapses them, is B's object, and fetching it returned B's file. `DELETE /workspaces/A/clips` with the same key answered 200, and B's object was gone from the store. (On R2 a presigned URL would probably fail its signature once the path is normalised. A public-CDN deployment signs nothing, which is the case the other four were fixed for.)

*Closed:* one pure rule, `modules/clips/clip-keys.ts`: a workspace's clip is its prefix plus exactly one safe segment (`isKeyDirectlyUnder`), used by share and remove, and by the task attach below. `object-key-boundaries` §5, 19/19 on lane 1: the walk is not shared and no link comes back; deleting it is refused and B's file is still there, each beside the workspace's own clip being shared (its link serves the clip) and deleted (it leaves the library). Against the old API the two refusals failed ("the link served workspace B's file", "B's file is GONE — the walk deleted it") and the two twins passed. Unit tests: `clip-keys.test.ts` (3) and two in `clips.service.test.ts` (nothing deleted, nothing signed). Break patches: `okb-17..21`, each compiled, run pending (lanes 2 to 4 are in plan-4). `clk-1` and `clk-2` are unit claims, each shown to fail its named test. Regression on lane 1, 4/4: object-key-boundaries, clip-created-card, settings-depth, video-regression.

### `found-23-sep/clip-library-lists-the-oldest-200` — **closed** (found reading `ClipsService.list` for the item above)

**The clip library shows a workspace's 200 OLDEST clips, so from the 201st on, a new clip never appears in it**

*Evidence:* `clips.service.ts` `list` asks `listObjects(prefix, 200)`. ListObjectsV2 returns keys in ascending order, and every clip key starts with `Date.now()`, so the 200 keys it returns are the oldest 200. They are then sorted newest-first for display, which makes the page look current. There is no paging or cursor, and nothing on the page says the list was cut off. Read, not yet measured: the lane store lists in the order objects were written, which is also oldest first, so it can be measured by uploading 201 clips.

*To close:* page through the listing (continuation token) and show the newest, or, as `s4-clip-link` proposes, read a clips table. Check: after 201 uploads the newest is listed.

*Closed:* `R2Service.listAllObjects` reads every page of a listing and follows the continuation token; a token that comes round again ends the walk. The library keeps the newest 200, and only those are looked up one by one. Search's clip branch had the same first page of 200 (`searchClips`). It reads every clip now, newest first. `listObjects`, which read one page, had no other caller and is gone.

The lane store could not have shown any of this: it listed in write order and always said it was not truncated. It now lists in key order, as S3 does, and pages with `max-keys` (1000 at most) and a continuation token. `check-s3-stub` has two new cases for it (five keys written out of order, read two at a time: all five in key order, over three requests). It has three new mutations (write order, never truncated, the token ignored) and one re-anchored. That makes 25/25 cases and 22 of 22 mutations.

The new suite `clip-library` uploads 1001 clips the way the app does, presign then PUT, so the newest is on a second page. On lane 1 before, 0 of 2: the library listed clips 1–200, its first entry clip 200, the newest missing and the oldest present; search found nothing for the newest clip's name. After, 2/2. `clb-1..3` (the oldest kept, the first page only, search's 200), each compiled. The clips unit test's fake store lists through `listAllObjects` now. A new unit test holds the newest 200 of 250, and only those looked up. API unit tests 1635/1635. Regression on lane 1, 12/12, with the new store: `clip-library`, `clip-created-card`, `attach-on-create`, `task-attachments`, `task-cover`, `object-key-boundaries`, `settings-depth`, `search-sources`, `search-read-access`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `found-23-sep/workspace-reads-skip-the-container-rule` — **closed** (security, LARGE; found fixing `home-today-overdue-includes-closed`)

**Routes that read across a workspace are guarded by membership alone, and most do not apply the caller's container access, so a member (and often a guest) reads private spaces they are refused**

*Evidence, measured (lane 1):* a member who gets 403 on a private space's list read that space's task, with the space's and the list's names, through `GET /tasks/workspace/:ws/members/<admin>` (no rule applied at all), and on `GET /tasks/workspace/:ws/timeline` (only the private-item rule). A guest read both too.

*Fixed for those two:* both apply the container rule (`containerVisibilityFilter`, the guard's own SQL twin) and the private-item rule (`taskVisibilityFilter`) in SQL, as the caller. New suite `workspace-read-access`, 6/6 on lane 1: for each read, the member and the guest get the open space's task and neither the private space's nor a private task, and the admin gets all three. `wra-1..7`, each compiled. In CI. The JS filter the workspace read uses (`filterTasksByContainerAccess`) hides a private task from its ASSIGNEES, unlike the canonical rule; noted, not changed here.

*Fixed next: the AI.* Measured on lane 1 with the model stub, whose request log shows each prompt: a user of ANOTHER organisation (404 on the workspace itself) had AI chat and AI command build their prompts from it (its name, its spaces' and projects' names, totals and breakdown, "Your role: member"), and the command assistant was handed its tasks to search. Nothing checked the body's `workspaceId`: `NotGuestGuard` reads only the account-wide role, so a workspace guest passed it too, and `PlanFeatureGuard` asks only about the plan. And a member refused a private space got prompts naming it and its project. `NamedWorkspaceMemberGuard` (the workspace a request names, in path, body or query, as the plan guard resolves it) now stands in front of every AI route: 404 for a stranger, 403 for a guest there. The chat context, the command context and the status breakdown apply the container rule and the private-item rule (a space-only half of the rule, `spaceVisibilityFilter`, now exists for queries that list spaces alone, and `containerVisibilityFilter` is built on it). The command context's spaces were unfiltered on purpose, since the executor refuses the WRITE, but the list is read into the prompt by name. `workspace-read-access` §3, 10/10 on lane 1 both with the model stub and without one: the stranger is refused before any model is asked (404, where a member gets past: 201 with a model, 503 without), and the suite's guest, whose account is a member's, with 403; the breakdown (`/ai/project-status`, no model needed) counts, for the member, only the open space's task, the admin's all three; and where a model answers, the member's chat and command prompts name no refused space and the admin's name it. `wra-8..13`, each compiled (11 and 12 redden only on a lane run with `RUNDESK_LANE_MODEL`); `wra-14` is a unit claim on the guard's own test (`named-workspace-member.guard.test.ts`, 5), shown to fail it. Regression on lanes 1 to 4 with no model, 21/21: every AI suite, the read-access suites, the teams and read-visibility suites.

*Fixed next: chat.* Measured on lane 1: a member refused a DM and a private channel (403 on each) read both through another member's activity (`GET /workspaces/:ws/chat/members/:id/activity`), "DM SECRET" included, since it returned everything the member wrote anywhere. Found beside it: the channel list left out the private-space half of the rule, so a channel of a private space was listed, by name, to a member it refused, and that channel's messages also came through activity. `readableChannelsFilter` (`modules/chat/channel-read-filter.ts`) is the SQL twin of `assertChannelAccess` (private space: its members; private channel or DM: its members, or a share on a private channel), and both reads use it; the list's own filter, written in the browser's image of the rule, is gone. `workspace-read-access` §4, 13/13: the guest, outside the admin's DM and private channel, reads only the admin's public message; the member, inside both, reads them and still not the private space's channel; and the member's channel list omits that channel where the admin's has it. `wra-15..19`, each compiled.

*Fixed next: realtime rooms.* Measured on lane 1 with the app's own socket client: a member refused a private space's list and task (403 on each) subscribed to both rooms, was answered `joined` for both, and heard `task.created` for a task made in that list and `comment.created` for a comment on that task. `canJoinRoom` required workspace membership and nothing else. A list's or a task's room now applies the rules the reads apply (`canReadListOrTask`: the container rule, a private list's rule, and for a task the private-task rule); a doc's and a canvas's rooms follow their resource's own read rule, which is membership today (whether a doc in a private space is readable by any member is its own question, on the list below). `workspace-read-access` §5, 15/15: the member is denied the private list, the private space's task and a private task, and hears nothing from them; the member joins an open list's room and hears a task made there, and the admin joins the private list's room and hears it. `wra-20..22`, each compiled. Regression on four lanes, 18/18: every chat suite, the realtime suites (including `task-cover`'s second board), the read-access suites.

*Fixed next: a person's pages, the list catalogue and the calendar feed.* Measured as a member refused a private space, first by probes on lane 1. Then the suite ran against the build before the fix (lane 2) and failed all 7 of §6's checks as they then stood. The DM Tasks tab's check, added after, failed on lane 1 before its own fix. What leaked:
- the admin's profile, their activity and its search, and their calendar carried the private space's task, and so did the member's DM Tasks tab with the admin (`/people/:id/shared`, private-item rule only);
- their standup listed it, and a private task of theirs, as what they did and what held them up;
- their priorities showed its title, and the member could pin it and the private task (201, two rows) to read both titles back;
- `/lists/workspace/:ws` named its list (private-list rule only);
- the member's own iCal feed carried it, title and description (private-item rule only);
- a member removed from the workspace kept a working feed, which went on serving tasks made after the removal: the token was checked for revocation alone.

The people service now reads every task as the requester may see it (`viewerFilter`: the container rule and the private-item rule, in SQL). That covers the profile's assigned, finished, handed-over and on-nobody buckets, activity, the calendar (and so the planner's team-schedule columns, which read it: `wra-36` removes the calendar's rule, and its run at `e580317` shows the member's calendar and team-schedule column both carrying the private space's task), every standup bucket (the blocked one writes the private rule out over its alias), and priorities; a typed line is always shown, and pinning answers 404 for a task the person may not open. The DM Tasks tab, the list catalogue and the feed apply the container rule too, and a feed token resolves only while its owner is still a member. Found by the suite's admin half on the way: the first draft wrote the priorities rule as `or(isNull(taskId), viewer)`. For a manager the viewer is no condition, drizzle drops the undefined, and the list read "typed lines only", so the admin's own pinned tasks vanished; `wra-31` is that draft. `workspace-read-access` §6, 23/23 on lane 1: each read by the member holds nothing of the private space nor the private task, and the admin's own holds it, bucket by bucket on the profile. `wra-23..40`, each compiled. Unit tests of the five modules, 80/80. Regression on four lanes, 25/25: the person panel, teams, every planner suite, calendar accounts, priorities, quick create and the folder, list and space dialogs that read the catalogue, the DM tabs.

*Fixed next: docs.* Measured on lane 1 before the fix, as a member refused a private space; all 7 of §7's checks failed:
- the member opened the space's doc and the page under it (200 each), and the hub listed and counted all five docs;
- they renamed the private doc (200), commented on it (201), exported it (200), and made a template of it (201), which copies its whole body where every member can read it;
- they filed a new page under it (201) and moved their own doc there (200);
- they joined its realtime room and heard an edit;
- they read its title off a task's linked docs, and linked its page to a task (201);
- the knowledge answer cited the page, because its space-only filter passed a page with no space of its own.

The doc read was workspace membership alone. A doc has no privacy flag; it is read where it lives, as in ClickUp (a Doc inherits its location's permissions, pages inherit the Doc, a share opens it). A doc is out of reach when it, or a doc above it, is in a private space the reader is not in, unless it or a doc above it is shared with them; managers read all.

`common/permissions/doc-access.ts` states that once. `canReadDoc` judges one doc (a bounded parent walk, with a fast path for anybody in every private space), and `hiddenDocIds` serves the lists (one query in the common case). It stands behind:
- the one door every doc route passes (`assertDocAccess`: read, edit, comment, export, share, revisions);
- the hub's list and counts, and save-as-template;
- the parent a page is filed under (create and move);
- the doc's realtime room;
- a task's linked docs, and linking one;
- the knowledge answer's doc filter.

`workspace-read-access` §7, 30/30 on lane 1:
- the member opens an open doc, and a doc and page shared with them, but not the private doc or its page;
- the hub's list and counts agree, and differ from the admin's by exactly those two;
- each write is refused with the doc unchanged and nothing made, while an open doc is renamed;
- filing a page there is refused, while one is filed under an open doc;
- the room is refused, while an open doc's room carries its edit;
- linked docs and linking are refused;
- the knowledge answer cites the shared page and not the private one, while the admin's cites the private one.

`wra-41..51`, each compiled. `doc-access.test.ts` 6/6 (the chain, shares, a page filed in a refused space under an open doc, parent loops, a parent from elsewhere), with `dac-1..3` shown to fail it. The first draft of the loop case let the doc a walk started from decide for the whole loop; `dac-2` is that draft. API unit tests 1621/1621. Regression on four lanes, 18/18: every doc suite (boundaries, import, task links), the template centre, the command palette, and the suites that read docs in passing (addressability, loading states, panel collapse, the stale-chunk recovery, the task AI bar, meeting records, chat message actions, `video-regression`). `addressability-live` first failed on a check made stale by an earlier commit of mine, below.

*Fixed next: search.* Measured on lane 1 before the fix, as a member refused a private space where one word was planted in every kind of item search returns. The member's search returned all nine kinds from that space: its task, a comment, a file, its doc, its folder, a list, the space by its own name, a channel of it and a message there. Read branch by branch:
- tasks, comments and files applied only the private-item rule;
- docs and spaces applied no rule;
- folders and lists applied only their own privacy flag;
- chat had its own copy of the channel rule, which knew public and joined channels but not the space.

Found beside it:
- a search narrowed by a task filter still returned channels, messages, comments and containers, under a comment that said they were "only for a general text search";
- the custom-field list search offers named a refused project's field, and the project;
- any member could rebuild the workspace's search index (201).

Each branch now applies the rule its reads apply: the container rule and the private-item rule for tasks, comments and files; `doc-access.ts` for docs; `readableChannelsFilter` (chat's own) for channels and messages; the space rule, plus their flags, for folders, lists and spaces. The comment on the containers, which said they were "scoped with the same visibility filters every other read path uses", was untrue without the space half and now says so. A task filter returns tasks alone, the field list is scoped, and a rebuild is a manager's (403 for a member).

The Meilisearch path runs on no lane. Its post-filter held task hits to the private-item rule only and let every doc hit through, so it now applies the container rule (joining each task's project and space) and the doc rule. `search.service.test.ts` measures that half with its fake index: a refused space's doc hit dropped and an open one kept, the container rule in the task hits' query, and neither rule for a manager. Adding those tests exposed a flaw in the file's fake database: it credited a WHERE to the table named last, so a condition that builds a subquery (the read rules do) was filed under the subquery's table. Two existing tests then failed to find their predicate. Each chain now keeps its own table.

The checks are a suite of their own, `search-read-access` (4/4 on lane 1; all 4 failed before, measured inside `workspace-read-access` as its §8, then moved so that suite's running break measurements stay current). `sra-1..11` each reddened the check it names at `7314929` (baseline 4/4); `sst-1..2` are unit claims shown to fail their tests. API unit tests 1624/1624. Regression 17/17: the palette, search sources, trending, addressability, mentions, the planner's command bar, the app catalogue, doc import, lists, loading states, meeting records, task covers, `workspace-read-access`, both video-1 suites, `video-regression` and `ui-sweep`. In CI.

*Fixed next: lookups by id, two of them across workspaces.* A route that takes an item's id and answers with its name is a way to read the name. Measured on lane 1 before the fix, as a member refused a private space:
- favourites: the member favourited that space, its list, task and doc, a channel of it, and a private channel they were not in (201 each), and their list named every one. `resolveBatch` gave spaces, docs and channels no rule, and lists and tasks only their private flag. `toggle` checks through the same function, so both reads and adds were open.
- planner blocks, CROSS-TENANT: a member of one workspace (404 on another) put a block on the other's task, and on the refused space's, and read both titles back off the grid. The create path's comment said the task "must be in this workspace"; its query asked only that the task exist.
- sprints, CROSS-TENANT: the same member added both tasks to a sprint of their own (201 each). The sprint listed both titles and counted both: `addTask` took any id, and the listing applied only the private-item rule, never asking which workspace a task was in.
- an AI answer's `[[task:id]]` and `[[list:id]]` chips resolved the refused space's task and list, under a comment that said ids the caller may not see "simply do not come back".

Each now takes the rule the item's own reads take:
- favourites resolve (and so refuse to add) with the space rule, the container rule plus the private flags, the doc rule, and chat's channel rule;
- a block's task must be in the workspace and one its owner may open (404 otherwise), and the grid drops the task's fields from a block made before the check;
- a sprint takes only such a task, and lists and counts its own workspace's tasks with the container rule;
- AI references apply the container rule.

`lookup-read-access`, 8/8 on lane 1 (7 of 8 failed before; the admin's favourites passed both times). `lra-1..12` each reddened the check it names at `7314929` (baseline 8/8). API unit tests 1624/1624. Regression on three lanes, 20/20:
- every planner suite, focus pill, tab-title countdown, team schedules, calendar accounts;
- the favourite menu, the AI answer and container suites;
- task depth, panel collapse, addressability;
- the three read-access suites.

One of those twenty, `ai-answer-rendering`, first threw "fetch failed" at 42 of 51 with lane 1's API up and logging nothing wrong. Run alone straight after, it passed 51/51. That is recorded here as a flake under four busy lanes, not as a pass. In CI.

*Fixed next: custom fields,* a HIGH item of their own below (`found-24-sep/custom-fields-open-to-any-member`).

*Fixed next: dependencies.* A dependency can join a task a member may open to one they may not. It stays real, since the member's task is still blocked, but it must not name the other task. Measured on lane 1 before the fix, as a member whose own task was blocked by a task of a space they were refused:
- the task's dependency graph named the hidden blocker (title and id);
- marking the task done was refused with "Task is blocked by open dependencies: <title> (<id>)";
- the notice sent when the dependency was made said `Blocked by "<title>"`.

Linking a task to the hidden one by id was already refused (403).

The graph now takes its reader. It keeps only tasks they may open, then only what still joins the root, so a task reached through a hidden one does not stand alone and tell of the link. The refusal still refuses: it names the blockers the actor may open and counts the rest ("and 2 tasks you cannot open"). The notice names the blocker to a recipient who may open it and says "Blocked by a task you cannot open" to one who may not.

"May this person open these tasks" is now one function, `readableTaskIds` in `common/permissions/read-access.ts`, and the planner's private copy delegates to it. It was the second copy about to become a third.

The new suite `dependency-read-access`, 3/3 on lane 1 (3 of 3 failed before). Its graph check also plants a task reached only through the hidden one. `dra-1..4`, each compiled (`dra-2` removes only the pruning). The unit test of the notice had its fake database answer every query in order, so the new visibility query drained it. A seam, `canUserSeeTask`, now answers it there, and a new unit test holds the notice to naming the blocker only for the recipient who may open it. API unit tests 1625/1625. Regression on four lanes, 22/22: the planner and lookup suites (for the delegation), task boundaries, merge and depth, notifications and the inbox, doc links, replies, access requests, settings, the pickers, chat actions, loading states, panel collapse, `workspace-read-access`, both video-1 suites and `video-regression`. One, `inbox-scope`, failed first on a race of its own, below, and passed once that was fixed. In CI.

*Fixed next: reports, and the mailer that ran them as nobody.* Measured on lane 1 before the fix, as a member refused a private space holding three tasks:
- the overview, completion, workload, status durations, time by project and the custom report answered the member exactly as they answered the admin, the refused space's tasks counted in (the overview's total 4 for both, where the member may open 1);
- project health listed the refused space's project, the activity feed and a day's workload named its tasks, and a custom report by project named the project;
- any member could rename, re-address, send and delete another person's saved report (200, 201, 200). The mailer ran every report with no actor, the whole workspace, to whatever addresses were typed. So any member could save a report, or take somebody else's, and mail the workspace out.

Every report's task set now takes the container rule, not only the private-item rule. `taskInReachFilter` (next to `containerVisibilityFilter`) states it as a predicate over `tasks.list_id` alone, because three of the report queries apply their filter in a left join's ON clause, or never join a project at all. Project health lists only projects the reader may open. A saved report is its owner's (or a manager's) to edit, send and delete; anyone else gets not-found. The mailer runs each report as its owner, and sends nothing, stamped, for an owner who has left or been deleted.

The new suite `report-read-access`, 6/6 on lane 1 (5 of 6 failed before; the member's own report passed both times). The mailer's half is two unit tests in `scheduled-reports.service.test.ts`, because lanes log a sent email's subject and not its body: it runs a report as its owner, and sends nothing for a departed or deleted one. `rra-1..5`, each compiled; `rra-6..7` are unit claims shown to fail their tests. API unit tests 1627/1627. Five reports still answer a member as the admin in the probe (productivity trend, status durations, time by project, sprints, goals). The first four go through the same filter and had nothing of the space to count (no completions, status changes, time or sprints). Goals take no reader at all and are not measured. Regression on lane 1, 16/16: the new suite, the suites that read reports or the workload (`addressability-live`, `person-panel`, `ai-assign`, `ai-answer-rendering`, `create-menu-ai`), the ones built on the container rule's helper (`request-access`, `space-create-menu`, `space-wizard-views`, `doc-task-links`, `task-depth`, `malformed-ids`, `panel-collapse`), `video1-fast-items`, `video-regression` and `ui-sweep`. In CI.

*Fixed next: goals,* a HIGH item of their own below (`found-24-sep/goals-open-across-workspaces`): measured, they were open across organisations as well.

*Fixed next: meeting action items,* their own item below (`found-24-sep/meeting-action-items-into-any-list`).

*Fixed next: chat events,* a HIGH item of their own below (`found-24-sep/chat-events-broadcast-to-the-workspace`).

*Fixed next: the AI's suggestions and counts,* their own item below (`found-24-sep/ai-suggestions-read-the-whole-workspace`), with a gap in the reports fix above found beside them (`found-24-sep/reach-skipped-private-lists`). That is the last of the audit's list.

*Closed with the last of it.* The JavaScript filter noted in the first fix, which hid a private task from its assignees, is gone. The workspace list asks the database, with the list's own privacy that every task read lacked (`found-24-sep/private-lists-skipped-by-task-reads`, below). What the item leaves open is a folder's privacy, which no read asks: `found-24-sep/private-folders-unenforced`, below, to measure.

*Measured last: the four reports left unmeasured above,* with data in the private space (probe `probe-reports-private`, lane 1). The productivity trend counted 1 completion to the admin's 2, status durations 1 sample to 2, and time and time by project showed only the member's own open-space hour. They are clean. The sprint report was not: it named the private space's sprint, as the sprints module did everywhere. That is `found-24-sep/sprints-open-to-any-member` below, fixed.

### `found-24-sep/custom-fields-open-to-any-member` — **closed** (security, HIGH; found measuring the audit's "custom-field values")

**Every custom-field route checks workspace membership and nothing else: a member refused a private space reads, overwrites, defines, renames and deletes its fields**

*Evidence, measured on lane 1 (probe `measure-custom-fields`), as a member refused a private space (403 on its list and its task):*
- `GET /workspaces/:ws/projects/:projectId/custom-fields` listed the project's field by name (200);
- `GET /workspaces/:ws/tasks/:taskId/custom-fields` returned the task's values with their definitions (200);
- `PUT .../tasks/:taskId/custom-fields/:fieldId` overwrote a value (200);
- `POST .../projects/:projectId/custom-fields` and `POST .../tasks/:taskId/custom-fields` each defined a new field there (201);
- `PATCH .../custom-fields/:fieldId` renamed the field (200), and `DELETE` deleted it, with every task's value in it (200).

The controller has `JwtAuthGuard` and `WorkspaceMemberGuard` only. The service checks that the task or project is in the workspace, and nothing about the space it is in, or about who may edit.

*Closed:* every route now holds the project or task to what the caller may open, not merely to the workspace. `ResourceMemberGuard` could not do it here: it takes the first id a route carries, and on `workspaces/:workspaceId/...` that is the workspace. So `common/permissions/read-access.ts` states the guard's rule for a service to call: `readableProject` (membership and the container rule) and `readableTask` (the same, plus the private-list and private-task rules), each also requiring the named workspace. The service takes the reader on all seven routes and answers not-found otherwise, as for a foreign id. The rename and delete routes, which carry only a field id, check the field's own project. The task export still reads values without a reader, for rows its own route has checked.

Not changed, and why: who may *manage* fields where they may open the project. ClickUp's help (search snippets only; the pages cannot be fetched here) says guests cannot create fields, and that members' default is set by role and custom-role permissions. That is a product rule to research against the real pages, not a leak, so field definitions stay writable by anybody who may open the project, as before. Guests and "view only" spaces are part of that same question, `found-24-sep/doc-writes-are-the-read-rule`'s twin.

The new suite `custom-field-access`, 4/4 on lane 1 (all 4 failed before; the member's delete had removed the field):
- reads refused (404) while an open project's and the admin's go through;
- a value write refused with the value unchanged, while an open task's goes through;
- both ways of defining a field refused with none made, while an open project takes one;
- rename and delete refused with the field untouched, while an open one is renamed.

`cfa-1..7`, each compiled. API unit tests 1624/1624. Regression on lane 1, 14/14: every custom-field suite, including field types, progress, creating a field from a task, and the list export that reads values without a reader; plus the space wizard and features, list view controls, the pickers, the planner's command bar, the task AI bar, and search. In CI.

### `found-24-sep/goals-open-across-workspaces` — **closed** (security, HIGH; found measuring the audit's "goals")

**Goals took no reader: a member read and edited a private space's goals, a guest created and deleted goals, and a user of another organisation edited any workspace's key results**

*Evidence, measured on lane 1 (probe `measure-goals`) before the fix:*
- a member refused a private space listed its goal, opened it, read its history and key results (200 each), and the goals report counted it; the member renamed it, filed new goals in the space and under the goal (201 each), moved an open goal into the space, and deleted the goal's key result;
- a guest listed every goal, created one (201) and deleted one (200);
- a user of ANOTHER organisation, with a workspace and a goal of their own, renamed and deleted this workspace's key results through their own goal's id (200 each). The route carried both ids, `ResourceMemberGuard` checked the goal (theirs), and the service read only the key result's id. The same user filed goals in this workspace's space and under its goal, made a user outside their workspace the owner, and moved their own goal INTO this workspace by patching `workspaceId`: `update` spread the request body into the row, and the body is not a DTO class, so nothing stripped it.

*The rule, from ClickUp's help (search snippets; the pages cannot be fetched here):* goals and goal folders are public to the whole workspace by default, with full permissions for members; a private one is open only to those invited, whatever their role; a guest sees only the goals shared with them. Goals have no sharing here, so a goal filed in a space is read by that space's rule, a goal in no space by every member, and a guest reads none. Whoever may read a goal may edit it.

*Closed:* `read-access.ts` states the rule twice, side by side: `readableGoal`/`mayReadGoalAt` for one goal, and `goalVisibilityFilter` for a list, with `goalReach` (all for a manager, by space for a member, none for a guest or stranger). Every goal route takes its caller. A goal the caller may not read is not found. A key result is found only under the goal the route names. `update` takes each field it may change by name, and so do the key-result writes. A new goal's space must be of the workspace and readable, its parent too, and a sub-goal naming no space is filed in its parent's, so a goal made under a private space's goal is not the whole workspace's. An owner must be someone who can read the goal. Guests get an empty list, not-found by id, and 403 on create. The goals report counts only what its reader may read.

The new suite `goal-access`, 13/13 on lane 1, 0/13 against the build before the fix (lane 4 at 6474be4). Goals and key results are planted by SQL, and every refusal is read back from its row beside a positive twin. `gac-1..13`, each compiled. The API keeps the whitelist in one place, the service, so that the break patch that spreads the body again (`gac-6`) has one layer to break. Regression on lane 1, 12/12: the new suite, `report-read-access` (the goals report), the suites of the other `read-access.ts` readers (`workspace-read-access`, `custom-field-access`, `dependency-read-access`, `lookup-read-access`, `planner-blocks`, `planner-priorities`), `malformed-ids`, `addressability-live`, and `video-regression` and `ui-sweep`, which open the Goals page. In CI.

*Not changed:* ClickUp's goal folders and per-goal sharing are not built, so a guest cannot be given a goal. When a private space is deleted, `goals.space_id` is set to null, and its goals become the whole workspace's. The goals page's own defects, found beside this, are `found-24-sep/goals-page-reads-fields-the-api-never-sends`.

### `found-24-sep/meeting-action-items-into-any-list` — **closed** (security, medium; found measuring the audit's "meeting action items created in any list id")

**A meeting's action items became tasks in whatever list the request named**

*Evidence, measured on lane 2 with the model stub (probe `measure-meetings`) before the fix:*
- a member refused a private space (403 on its list) turned a meeting's notes into a task in that list: `POST /workspaces/:ws/meetings/:id/action-items` with `createIn` answered 201, and the task was there;
- a user of another organisation aimed their own meeting's items at this workspace's list. They were stopped only because their workspace's "meeting" task type did not belong to this one (400, "That task type does not belong to this workspace"), so a workspace that had deleted that type would have been open to it;
- a meeting could be linked to a private task its maker may not open (201): the check asked only that the task was in the workspace.

`createIn` went from the body straight to `createTask`, which asks only whether the caller is a GUEST of the list's workspace. `POST /tasks` gets its list rule from `ResourceMemberGuard`, and nothing stood in for it here.

*Closed:* `readableList` (in `read-access.ts`, next to `readableProject` and `readableTask`) states the guard's rule for a list: in the named workspace, the caller a member, the container rule, the private-list rule. The meeting checks its destination with it BEFORE any model is asked, so a refusal costs nothing and reads the same with or without a model: not found for a list the caller may not open or one elsewhere, 403 for a guest. A meeting links only to a task its maker may open (`readableTask`).

The new suite `meeting-access`, 4/4 on lane 1 both with the model stub and without one (the twins make a task where a model answers, and reach "AI features are not configured" where none does); 0/4 on lane 2 before the fix. With a model it also reads the stub's request log to show that no call was made for a refusal. A unit test in `meeting-task-provenance.test.ts` holds the order: a refused list asks the model nothing (the check sits behind a seam, `assertCanMakeTasksIn`, as the fake database there answers every read). `mtg-1..4`, each compiled; `mtg-5` is a unit claim, shown to fail that test. API unit tests for meetings 16/16. Regression on lane 1, 13/13: the new suite, every suite that touches meetings (`a61-meeting-record`, `syncup-live`, `planner-upcoming-meeting`, `video1-acceptance`, `object-key-boundaries`), the other `read-access.ts` readers (`goal-access`, `custom-field-access`, `dependency-read-access`, `lookup-read-access`, `workspace-read-access`), `person-panel` and `malformed-ids`. In CI.

*Not changed:* whether task creation should also respect a space whose default permission is "view only". `moveTask` applies the space's create gate (`assertCanCreateInSpace`), and its comment says that gate is on the create path, but `createTask` does not call it: a member may make tasks in a view-only space through `POST /tasks` too. Not measured yet; it is `found-24-sep/tasks-created-in-view-only-spaces` below.

### `found-24-sep/chat-events-broadcast-to-the-workspace` — **closed** (security, HIGH; found measuring the audit's "new chat messages broadcast to the whole workspace")

**Every chat event went to the workspace's realtime room: a member heard every DM and private channel as it was written**

*Evidence, measured on lane 1 (probe `measure-chat-broadcast`) before the fix, with the web app's own socket client:* a member refused a DM between two others, a private channel and a private space's channel (403 on each read) joined the workspace room, as every member's socket does, and heard every message in all three with its body, an edit, and the name of a new private channel. A SyncUp's card in a DM ("X started a SyncUp") went the same way.

`ChatService` emitted each chat event with `emitToWorkspace`, 16 places, and `CallsService` emitted the card the same way. The reads had been fixed (`readableChannelsFilter`), and the live copy of what they return had not.

*Closed:* `channelReaders` (`chat/channel-read-filter.ts`, beside `readableChannelsFilter`, the third form of that rule and the one turned round: the people who may read one channel). A public channel outside any private space answers "the workspace", and its events still go to the workspace room. Any other channel's events go to each reader's own `user:` room, which every socket joins on connect, so the web hears them unchanged; it already drops events of another workspace. That covers messages, edits, pins, deletions, reactions, assignments, new and changed channels, and the call card. Membership notices (`chat.channel.members.*`) stay workspace-wide on purpose: they carry only the channel's id, and a person just removed must still hear it.

The new suite `chat-realtime-access`, 6/6 on lane 1, and 5 of 6 failed against the build before the fix (lane 2 at 377acf7; the public twin passed both times). Three sockets listen (an outsider, the admin's DM partner, the admin), and every "hears nothing" has, on the same event, somebody entitled who hears it: the DM and its edit; a private channel's message, edit, pin, reaction and deletion; a private space's channel; a new private channel's name; the call card. A public channel still reaches everyone. `crr-1..7`, each compiled. API unit tests for chat and calls 176/176. Regression on lane 1: 12/13 at first — the new suite, `workspace-read-access`, `call-survives-navigation`, `chat-history`, `chat-message-actions`, `sidebar-dms`, `syncup-live`, `a61-meeting-record`, `replies-inline-thread`, `task-mentions`, `video1-acceptance`, `video-regression` — with `a39-dm-tabs` failing "the meeting both attended is listed". That failure was the suite's own, not this change: it failed the same way on lane 1 with the change taken out, and passed on lane 2. It is `found-24-sep/a39-shared-meeting-keyed-by-title` below, fixed, after which `a39-dm-tabs` is 19/19 on lane 1 with this change in. In CI.

*Not changed:* `call.*` events (started, joined, left, ended, recording) still go to the workspace. They carry ids only (the call, the channel, who), but "these two are in a call in this DM" is still something a member outside it now learns. The web draws call cards and invalidates channel messages from them, so moving them is a change to the call UI, not only to delivery; it is `found-24-sep/call-events-broadcast-to-the-workspace` below.

### `found-24-sep/ai-suggestions-read-the-whole-workspace` — **closed** (security, medium; found measuring the audit's "AI suggest-tasks and workload-balance")

**"Suggest tasks" handed a member a private space's task titles; "workload balance" and "Assign with AI" counted everybody's work in it**

*Evidence, measured on lane 1 (probe `measure-ai-suggest`) before the fix, as a member refused a private space holding a project named like the one being planned, with six tasks:*
- `POST /ai/suggest-tasks` gave the member those six task titles word for word as its suggestions, and the project's name in the "learned from" line. No model is needed for that: the heuristic answer is made of titles from similar projects, and the candidates were every project in the workspace;
- a project named by id was read wherever it was, so its name steered the plan;
- `POST /ai/workload-balance` gave the member exactly the admin's answer: the admin's load counting the private tasks, and two of their ids offered for moving;
- `GET /ai/assignee-suggestion` ("Assign with AI") counts each colleague's open and overdue work across the workspace. Its comment says it deliberately shares the workload panel's read, so it shared the leak.

*Closed:* the candidate projects and their titles are the ones the reader may open (the container rule, the private-list and private-task rules). A project named by id counts only if it is one of those. The workload loads take an optional reader (`readerTaskFilter`: `taskInReachFilter` with the private-task rule): the balance route passes its caller, and Assign with AI passes its asker for all three of its counts. The daily alert to managers passes none, since a manager sees everything anyway.

The new suite `ai-read-access`, 5/5 on lane 1. Every answer in it is the deterministic one a server with no model gives, so it runs as it is in CI. `ars-1..7`, each compiled. The unit test of the heuristic (`suggest-tasks.test.ts`) answers its two reads in order from a fake database, so it now asks as a reader who may open everything and adds no read. API unit tests for AI, permissions and reports 351/351. The new suite also ran 0/5 against the build before the fix (lane 2 at d85a0e2). Regression on lane 1, 12/12: the new suite, the other report and goal suites, `ai-assign`, `ai-answer-rendering`, `person-panel`, `assignee-picker`, `addressability-live`, `workspace-read-access`, `app-catalogue`, `ui-sweep` and `video-regression`. In CI.

### `found-24-sep/reach-skipped-private-lists` — **closed** (security, medium; a gap in this morning's reports fix, found fixing the AI's counts)

**The rule the reports were fixed with stopped at the space and the project, so a private list's tasks were still counted and named**

*Evidence, measured on lane 1 (probe `measure-private-list`):* a member refused a private list in an OPEN space (403 on it). The overview and completion counted its three tasks (total 4, where the member may open 1), and the activity feed named them. `taskInReachFilter`, written for `found-23-sep/workspace-reads-skip-the-container-rule`'s reports, joined lists to projects and spaces and applied the container rule, but not the list's own privacy, which `ResourceMemberGuard` applies to a list. `report-read-access` had no private list in it, so it could not see this.

*Closed:* "reach" includes `listVisibilityFilter`: a private list is its maker's, and a manager's. Every report built on it, and the AI's counts above, follow. `ai-read-access` §4 holds it (the member's overview counts none of the private list's tasks and the feed names none; the admin's count and name them), and `ars-6` removes it again.

### `found-24-sep/a39-shared-meeting-keyed-by-title` — **closed** (test tooling; found by the chat sweep)

**`a39-dm-tabs` found its shared meeting by title alone, so a new DM peer made it assert about somebody else's meeting**

*Evidence:* on lane 1, `the meeting both attended is listed` failed twice, and once more with the chat change taken out; it passed on lane 2. The run's own header said why: "DM with Zoya Outsider 1790174109616". `ensureDm` takes the first other member of the workspace, and a suite had left a "Zoya Outsider" there, so the DM became hers. `ensureShared` then found "A39 Sprint sync with colleague" by its title, which was the meeting with the member before (Organization Admin), and created nothing. Measured directly: the API's `people/:id/shared` for Organization Admin returned the meeting, and a browser on the Organization Admin DM showed it at 2.2 seconds.

*Closed:* `ensureShared` finds the meeting by its title AND its two attendees, and creates one for this pair otherwise. The shared task is assigned to both people on every run, not only when it is made. `a39-dm-tabs` 19/19 on lane 1, with the DM still Zoya's. No break patch: which meeting a title-only lookup finds depends on what earlier runs left, so a revert would redden it only sometimes. That is the defect this closes, not a check it could hold.

### `found-24-sep/call-events-broadcast-to-the-workspace` — **closed** (security, small; found fixing chat events)

**Who was in a call, and in which channel, was told to the whole workspace**

*Evidence, measured on lane 1 (the suite against the build before the fix, 1 of 2; the public twin passed):* a member outside a DM heard a SyncUp in it start, the other person join, and the call end. `calls.service.ts` emitted `call.started`, `call.participant.joined`, `call.participant.left`, `call.ended` and `call.recording` with `emitToWorkspace`, carrying the call's, its channel's and the people's ids.

*Closed:* `emitCallEvent` sends a call's events where its channel's messages go, to `channelReaders` (the workspace for a public channel, each reader's `user:` room otherwise). The call card goes through it too. The web reads call events only to refresh the channel they name, which somebody who cannot read the channel has no copy of. A call in no channel still goes to the workspace, since there is no channel to ask. The new suite `call-realtime-access`, 2/2: the outsider hears nothing of a DM's call while the person in it hears the start, the join and the end, and a public channel's call reaches everyone. `cev-1..2`, each compiled. Regression on lane 1, 12/12 (one sweep for this item and the next): `call-realtime-access`, `related-task-access`, `chat-realtime-access`, `syncup-live`, `call-survives-navigation`, `a61-meeting-record`, `dependency-read-access`, `task-boundaries`, `task-depth`, `video1-acceptance`, `ui-sweep` and `video-regression`. In CI.

### `found-24-sep/tasks-created-in-view-only-spaces` — **closed** (security, medium; found fixing meeting action items) — with `found-24-sep/task-makers-skip-the-list-rule` below

**The space's create gate was on moving a task in, and not on making one**

*Evidence, measured on lane 1 (probe `measure-view-only`) as a plain member:* in a space whose default permission is "view only", and in one set to "comment", `POST /tasks` made a task (201 each). ClickUp's view and comment permissions make none (help.clickup.com "Permissions in detail", search snippets): view only cannot comment or edit, comment may comment and, on a task assigned to them, change its status.

*Closed with the item below,* whose one rule includes the space's create gate. `task-creation-access` §5: a member makes no task in a "view only" or "comment" space (403 each, none made), and makes one in an "edit" space. `tcm-5` removes the gate.

*Still open, measured beside it:* the same member, in a "view only" space, COMMENTED on a task (201) and changed the status of a task assigned to them (200). The space level is asked of containers and now of new tasks, but not of comments or task edits. That is `found-24-sep/view-only-spaces-take-comments-and-edits` below.

### `found-24-sep/task-makers-skip-the-list-rule` — **closed** (security, HIGH; found fixing meeting action items)

**Only `POST /tasks` asked who may make a task in a list: from a chat message, an AI plan or `/task`, anybody could, a user of another organisation included**

*Evidence, measured on lane 1 (probe `measure-task-makers`) before the fix, as a member refused a private list:*
- "create task" on a chat message (`POST /chat/messages/:id/create-task`, whose `listId` comes from the body) made a task in the private list (201). The route has no list guard, and `createTask` asked only whether the maker was a guest;
- an AI plan sent straight to the executor (`POST /ai/command/execute`, `create_task`) made one there too (201, "succeeded"), since the executor asks membership and nothing more;
- a user of ANOTHER organisation made a task in this workspace's list from a message in their own workspace (201). Not a member, so not a guest, so `createTask` let them;
- `/task` in a channel filed the task in the workspace's oldest list whoever asked, and "create task from this" on an AI answer did the same through a second copy of that picker.

Each maker had added its own piece of the rule: the meeting items `readableList`, an inbound webhook the container rule, the executor membership, the chat message nothing. Four statements of one rule, none of them whole.

*Closed:* `TasksService.assertCanCreateTaskIn`, asked by `createTask` itself for the person the task is made by, so every route that makes a task asks it. The maker must be a member of the list's workspace who may open the list (`readableList`: the container rule and the private-list rule), otherwise not found. They must not be a guest (403, as before). The space must let them add to it (`assertCanCreateInSpace`, which `moveTask` already asked of a destination), otherwise 403. A super-admin passes where they are not a member, as every guard lets them. The meeting items delegate to it (and keep their own-workspace check). The two default-list pickers are one, `defaultListFor`: the oldest list the person may make a task in.

The new suite `task-creation-access`, 6/6 on lane 1 (1 of 6 before: the guest was already refused). §1 a message into a private list, §2 the other organisation, §3 an AI plan, §4 `/task` (the workspace's own oldest list made private by SQL, so the member's goes elsewhere and the admin's to it), §5 the space gate, §6 a guest; each refusal read back from the list by SQL beside a twin that makes one. `tcm-1..6`, each compiled; `mtg-3` re-anchored to where the guest rule now lives. API unit tests for every caller of `createTask` (tasks, meetings, chat, AI, templates, webhooks) 623/623. Regression on lane 1, 14/14: the new suite, `meeting-access`, `space-default-permission`, `chat-message-actions`, `task-boundaries`, `task-provenance`, `template-center`, `clip-created-card`, `create-menu-ai`, `workspace-read-access`, both video-1 suites, `ui-sweep` and `video-regression`. In CI.

### `found-24-sep/view-only-spaces-take-comments-and-edits` — **closed** (security, medium; found closing the create gate)

**In a "view only" space a member still commented, and changed the status of a task assigned to them; in a "comment" space an assignee renamed their task**

*Evidence, measured on lane 1 (probe `measure-view-only`, then the suite against the build before the fix, 1 of 5):* in a "view only" space a plain member's `POST /tasks/:id/comments` answered 201, a status change of a task assigned to them 200, and adding a colleague to it 201. In a "comment" space the assignee renamed the task (200). The space's level was asked of containers and, since the item above, of new tasks; not of comments or task edits, which only asked "creator or assignee".

*The rule, ClickUp's* (help.clickup.com "Permissions in detail", search snippets): view only cannot comment or edit; comment may comment and, on a task assigned to them, change its status or its assignees ("comment with task assigned"); edit may do what the item rule allows.

*Closed:* `assertTaskWriteAccess` asks the space too (`assertSpaceAllowsTaskWrite`). "Edit" is needed for any write, except a status change (with the position a board drag carries) or a change of assignees on a task assigned to the editor, which "comment" allows. A comment, and editing one's own, needs "comment" (`assertSpaceAllowsComments`). Both read the level as `resolveSpaceLevel` does, so an explicit grant on the space wins over its default, and a manager is never narrowed.

The new suite `task-space-levels`, 5/5 on lane 1 (1 of 5 before, the grant's twin). The three levels sit side by side, each refusal is read back from the row, and a grant of "edit" on the view-only space lifts it. `tsl-1..5`, each compiled. API unit tests 1628/1628. Regression on lane 1, 13/13: the new suite, `space-default-permission`, `task-creation-access`, `task-boundaries`, `comment-thread`, `replies-inline-thread`, `task-mentions`, `checklists`, `assignee-picker`, `task-header-status`, `video1-acceptance`, `ui-sweep` and `video-regression`. In CI.

*Not changed:* ClickUp's comment level also lets an assignee tick their own checklist items; those go through the edit check here, so a "comment" space's assignee cannot. And deleting one's own comment asks nothing of the space.

### `found-24-sep/goals-page-reads-fields-the-api-never-sends` — **closed** (visible bug; found fixing goal access)

**Every goal card shows 0% and an empty bar, and a guest is offered a "New goal" that fails silently**

*Evidence (code read):* `workspace-goals-page.tsx` types a goal as `{ progress, targetType, … }` and draws each card's bar and percentage from `goal.progress`. The API returns `currentValue`, `targetValue` and `kind`, and no `progress`, so `clampPct(undefined)` makes every card 0% (a confident zero). Creating sends `targetType`, `status` and `progress`, which the API ignores. And since goals are not a guest's (above), a guest's page lists nothing and still offers "New goal" and "Create your first goal": the POST answers 403, and the mutation has no `onError`, so nothing is said.

*To close:* compute the card's progress from `currentValue / targetValue` as the detail page and the report do; hide the create buttons for a guest (`useWorkspaceRole`); give the create mutation an error toast. Check in the browser: a goal at 40 of 100 shows 40% on its card, and a guest's page offers no create.

*Closed:* one rule for a goal's progress, `goalProgress` (`lib/goal-progress.ts`): its current value as a share of its target, 0 to 100. The goals list and the goal page both use it; the list's type is what the API sends. A guest is offered no "New goal" and no "Create your first goal", and their empty page says "No goals have been shared with you." A failed create says "The goal could not be created." The create sends the title alone, which is all the API reads. The new suite `goals-page`, 3/3 on lane 1 (0/3 before, lane 1 with the old bundle). The card is planted at 30 of 60, not 40 of 100: at 100 the raw value and the share read the same, and `gp-2` (the raw value) would pass. A guest and a member are read side by side, and the create is failed by route. `gp-1..6`, each compiled. Regression on lane 1, 14/14, one sweep for this and the two fixes beside it (the console's audit log and the Zoom row): `goals-page`, `admin-audit-page`, `goal-access`, `file-exports`, `webhook-access`, `sw-api-cache`, `settings-depth`, the four planner suites (`planner-appearance-toggles`, `planner-rail`, `planner-settings`, `planner-upcoming-meeting`), `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `found-24-sep/inbox-chip-read-while-loading` — **closed** (a flake, found by the dependency sweep)

**`inbox-scope` waited for one chip's count and then asserted two, so it failed when the second arrived a moment later**

*Evidence:* on lane 3, `the chips count what the server holds — 60 and 59` failed with its own message reading `All reads "60", Primary "59"`, the expected numbers. The check waits until the All chip reads 60, reads both chips for the condition, and reads them again for the message. The Primary count lands separately, so the condition read it still loading, and the message read it a moment later. Nothing in that run touched notifications (the fixture is assignments, comments and test notices).

*Closed:* the wait now holds for both chips. The suite passed in the next sweep.

### `found-24-sep/assignee-me-compared-with-a-narrowed-endpoint` — **closed** (a regression of mine, found by the docs sweep)

**`addressability-live` compared the whole `assigneeId=me` listing with the member endpoint after that endpoint became open work only**

*Evidence:* `assigneeId=me agrees with the member endpoint (13 <= 9)` failed on lane 1. Read row by row in the admin's Main Workspace, the listing held 13 and the member endpoint 9, and the four extra rows were all closed; nothing was in the member endpoint that the listing lacked. `ecd6bb0` (`home-today-overdue-includes-closed`) made that endpoint Home's open work, and its regression sweep did not include this suite. So the suite's premise went stale with the change, not the product.

*Closed:* the check compares on open work, row by row: every open task the listing holds is in the member endpoint. It makes an open task assigned to the admin first (and removes it after), so it is never two empty lists; a fresh database assigns the admin nothing. It passes on lane 1 in the docs sweep.

### `found-24-sep/report-exports-wrapped-in-the-envelope` — **closed** (visible bug; found measuring reports)

**Every file export failed: the CSVs answered 500, and the PDFs downloaded as JSON**

*Evidence, measured on lane 1 as the admin (the suite against the build before the fix: 1 of 8, the twin, and it stopped early):*
- `POST /workspaces/:ws/reports/custom/export` and `GET /workspaces/:ws/audit-logs/export` answered 500: `Attempted to send payload of invalid type 'object'`.
- `POST .../custom/export.pdf` and `.../contribution.pdf` answered with `application/json` and a body beginning `{"data":{"options":{"type":"application/pdf"...`, a description of the file rather than the file. The web saves whatever it is handed, so "Export PDF" saved a `.pdf` of JSON, and the audit page's Export CSV saved nothing (its failure is not caught).

The global `ResponseInterceptor` wrapped every return value as `{ data, meta, error }`, a `StreamableFile` and a string under a declared `text/csv` alike.

*Closed:* the envelope passes a `StreamableFile`, and anything from a handler that declared a non-JSON `Content-Type` (`isRawBody`, in the interceptor), through as it is. Everything else is wrapped as before. The new suite `file-exports`, 8/8 on lane 1. It downloads each export and reads a CSV's content type and header row and a PDF's `%PDF` signature. The twin is that a report run for the screen is still enveloped. Then it clicks the three export buttons in the app (Insights → Download PDF, Reports → custom → Export PDF, Audit log → Export CSV) and reads the file each one saves. Five unit tests for the interceptor (`response.interceptor.test.ts`). `fex-1..8`, each compiled (`fex-6` a web patch); `fex-9..10` are unit claims, each shown to fail its test. API unit tests 1633/1633. Regression on lane 1, 13/13, with `workspace-store-never-filled` below: the two new suites, `report-read-access`, `list-export`, `addressability-live`, `ai-assign`, `person-panel`, `inbox-scope`, `chat-message-actions`, `video1-acceptance`, `video1-fast-items`, `ui-sweep` and `video-regression`. In CI.

The Insights button could not be clicked at first, because nobody was ever offered it. That is `found-24-sep/workspace-store-never-filled` below, fixed with this.

*Break run (lane 2, 3aa69a8):* `fex-1`, `fex-2` and `fex-4..8` reddened the checks they name, 7 of 8. `fex-3` as first written unwrapped every answer, the sign-in's too, so the suite could not sign in and ran 1 check of 8. It is re-aimed at a narrower mistake, the reports controller exempted whole (`fex-3-the-reports-controller-passes-through`); its re-run is pending.

### `found-24-sep/workspace-store-never-filled` — **closed** (visible bug; found closing the exports)

**Three places read a workspace store that nothing in the app ever wrote to: managers were never offered their controls, and support tickets went to the wrong workspace**

*Evidence:* `store/workspace.ts` held a list of workspaces and an "active" one, and no code called its `setWorkspaces` or `setActive` (grep). Its readers:
- Insights' `canManage` was false for everybody: the admin's page drew the contribution section and no "Download PDF", and no manager was offered a workload move's "Accept";
- the dashboard's "Set as workspace default" was offered to a super-admin only, through the account's role, and never to a workspace admin;
- the support widget filed every ticket in the user's FIRST workspace, whichever one was open.
Measured by the suite against the bundle before the fix (lane 2): 0 of 3.

*Closed:* Insights and the dashboard read the role from the signed-in person's own workspaces (`useWorkspaceRole`, as the rest of the app does). The support widget takes the workspace on screen, then the first. The dead store is deleted. The new suite `workspace-role-controls`, 3/3 on lane 1 (0/3 before). It reads the screen as the admin, a workspace admin who is not a super-admin (a super-admin always saw the dashboard's control, so only this one shows the fix), and a member, and reads the ticket's workspace back by SQL. `wrc-1..3`, each compiled; on lane 2 at 3aa69a8, 3 of 3 reddened. Regression on lane 1, 13/13, with the exports above. In CI.

### `found-24-sep/admin-audit-reads-the-first-workspace` — **closed** (visible bug; found closing the exports)

**The console's audit log shows only the admin's first workspace, its Export CSV fails without a word, and a trail that fails to load says there are no events**

*Evidence, measured on lane 2 (the new suite `admin-audit-page` against the build before the fix: 0 of 4):*
- `admin-audit-page.tsx` reads `wsQuery.data?.[0]`, the workspace the admin joined first, and offers no way to pick another. Every other console page that works on one workspace offers the choice (users, webhooks, settings, integrations). Measured: with one event planted in the admin's first workspace and one in a workspace they joined last, the page showed the first's and offered no picker.
- Export CSV is `void downloadFile(…)`. A failure is a rejected promise nobody reads: with the export held to 500 by route, the page said nothing.
- The list has no error state. With the trail held to 500, the page said "No audit events yet." (a confident zero).

*The rule, ClickUp's:* the audit log belongs to one workspace, read by its owner and admins in that workspace's settings, filtered by date, event and user, and exported to CSV. The console here is a platform page with no ClickUp twin, so the workspace is picked as its other pages pick it.

*To close:* the console's pages share one workspace picker (four copies now), and the audit page gets it; the export's failure is a toast; a failed read says "The audit log could not be loaded." Check in the browser: a picked workspace's event is shown and exported and the first's is not; a failed export and a failed read each say so.

*Closed:* one picker for the console, `useAdminWorkspace` and `AdminWorkspacePicker` (`components/admin-workspace-picker.tsx`): the workspace picked, else the first joined. Users, webhooks, settings and integrations use it in place of their four copies, and the audit log uses it too. Picking a workspace there starts the actor filter and the page again, since another workspace has other people. A failed export says "The audit log could not be exported.", and a failed read says "The audit log could not be loaded." in place of the empty state. The new suite `admin-audit-page`, 4/4 on lane 1 (0/4 before). Events are planted by SQL in the admin's first workspace and in one they joined last. It reads the page, and the file Export CSV saves, after picking; the export and the list are failed by route, with the service worker blocked. `aap-1..5`, each compiled. Regression: the goals page's sweep above, 14/14. In CI.

*A duplicate:* this is `product-siblings/admin-audit-first-workspace-only` in the inventory above, found a second time; that row is closed by this one.

*Not changed here:* a workspace admin who is not a super-admin has no audit page at all. The API allows them (`WorkspaceAdminGuard`), and ClickUp shows them the log in the workspace's settings; the web offers it only in the super-admin console. That is a feature to build, `found-24-sep/workspace-audit-log-not-in-settings` in the feature list.

### `found-24-sep/zoom-row-not-connected-while-loading` — **closed** (visible bug; found by the drifted break plan, whose `calendar-accounts` baseline was red)

**The planner's Zoom row says Zoom is not connected, and offers Connect, until its connections list answers**

*Evidence:* the break plan refused `calendar-accounts` on lane 4 (dde1c83): its baseline failed "the row agrees with the App Center", with the row reading `connected=false` against `true`. It passed on lane 1 at 02:43. `ConferencingRow` computes `connected` from the connections query and draws it at once, so while that query is in flight the row is "not connected". The suite reads the row as soon as it is drawn, so a busy lane reads it before the answer. Measured on lane 2 (probe `probe-zoom-row`, the connections list held by route, Zoom staged connected): while held, the row read `data-connected=false`, said "Zoom isn't configured on this server" and offered Connect; once answered, "Connected" and Disconnect. A person who has connected Zoom is told, for a moment or for as long as the list takes, that they have not.

*To close:* until the list answers, the row claims neither state and offers no action (it says it is checking); a list that fails says Zoom's connection could not be checked. `calendar-accounts` waits for the row to settle before it compares, and a new check holds the list and reads that the row claims nothing meanwhile.

*Closed:* the row knows once its list has answered (`known`). Until then it carries no `data-connected`, says "Checking…" and offers neither Connect nor Disconnect. A list that fails says "Zoom's connection could not be checked." `calendar-accounts` waits for the row to settle before it compares (the race that reddened its baseline), and blocks the service worker so a route can hold the list. Its new check holds the list, reads the row, and releases it: 36/37 before (lane 2, the old bundle: while held the row said `connected="false"`, offered Connect and read "Connect Zoom"), 37/37 on lane 1 after. `ca-6..8`, each compiled. Regression: the goals page's sweep above, 14/14, which has the four planner suites. In CI.

### `found-24-sep/doc-writes-are-the-read-rule` — **closed** (security, medium; found fixing docs)

**Anybody who may read a doc could edit, delete and share it: a view-only share, and a guest, included**

*Evidence, measured on lane 1 (probe `measure-doc-writes`):* every doc write (`update`, `deleteForUser`, `enablePublicShare`, `restoreRevision`, comments) passed `assertDocAccess` and nothing more. That is the read rule now, and was membership before it. `object_shares.level` was written by the share dialog and read by no doc route. Measured: a member whose only access to a private space's doc was a VIEW share renamed it (200), commented (201) and made it PUBLIC (201). A guest renamed an open space's doc (200). A member in a "view only" space made (201), renamed (200) and deleted (200) docs there.

*The rule, ClickUp's* (help.clickup.com "Share Docs", "Permissions in detail", search snippets): a doc added to a location inherits the location's permission (view, comment, edit, full edit), a share on the doc overrides it, and a guest edits only where given edit.

*Closed:* `docLevel` (doc-access.ts), most specific first. A workspace manager, or the doc's maker, has full edit. Otherwise a share on the doc, or on the nearest doc above it that has one, gives its level. Otherwise the space it lives in (its own, or the nearest above) gives what `resolveSpaceLevel` gives, and for a guest only a grant counts, not the default. A doc of no space is a member's to edit and a guest's to read. Changing, deleting or restoring a doc needs "edit". Its public link needs "edit" and is never a guest's (as `SharesService.canShare`). Commenting, and editing, resolving or deleting one's comment, needs "comment". Making a doc needs "edit" on its space (`assertCanCreateInSpace`); for a guest, a grant; and a doc of no space is not a guest's to make. A page needs "edit" on the doc above it.

The new suite `doc-write-levels`, 5/5 on lane 1 (0/5 before): view, comment and edit shares side by side, a guest with and without an edit share, a view-only space beside an open one, and a doc of no space. Docs and shares are planted by SQL and every refusal is read back from the row. `dwl-1..7`, each compiled. API unit tests 1628/1628. Regression on lane 1, 15/15: the new suite, `doc-boundaries`, `doc-import`, `doc-task-links`, `workspace-read-access`, `search-read-access`, `ai-answer-rendering`, `template-center`, `comment-slash-commands`, `chat-message-actions`, `panel-collapse`, `addressability-live`, `video1-acceptance`, `ui-sweep` and `video-regression`. In CI.

### `found-24-sep/linked-docs-read-needs-write-access` — **closed** (visible bug; found fixing docs)

**A task's linked docs can be listed only by someone who can edit the task, though the code says read access**

*Evidence, read not run:* `tasks.service.listLinkedDocs` calls `assertTaskWriteAccess` (creator, assignee or manager) under a comment that reads "Requires task read access". A member who can open the task sees its Docs section fail with 403. `workspace-read-access` §7 reads it from the member's own task for that reason.

*To close:* `assertTaskReadAccess` for the list (the doc rule already filters what it names), with a check that a member who is neither creator nor assignee sees the open doc linked.

*Measured before the fix (lane 1, the new suite, 0 of 4):* the member's list answered 403 "Only assignees, creators, managers, and workspace admins can edit this task", and the References tab said "No linked docs.". The section had no error state, so a failed read said the same. It also said it while loading. And a link the server refused (the same 403, since linking is a change to the task) did nothing at all: the mutation had no `onError`.

*Closed:* the list asks the task's read rule, and the doc rule still decides which docs it names. The tab shows a skeleton while loading, and "Linked docs could not be loaded." when the read fails. "No linked docs." appears only once the list is empty. A refused link or unlink says why in the server's words. The new suite `linked-docs-access`, 5/5 on lane 1. The docs and their links are planted by SQL, one doc in an open space and one in a private space the member is not in. It reads the member's list from the API and from the References tab, beside the admin's. It holds the list to read the loading state, fails it to read the error state, and has the member try a link. The loading check was added after the first measurement; `lda-3` restores the old branch it guards. `workspace-read-access` §7 still uses the member's own task, for the link half, and its comment now says why. `lda-1..5`, each compiled. Regression on lane 1, 8/8: the new suite, `doc-task-links`, `workspace-read-access`, `doc-boundaries`, `task-depth`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

*Not changed:* the web still offers "Link" to a member who may not link. The task sheet does not know the write rule (creator, assignee or manager), so the refusal is said rather than the button hidden. That rule is narrower than ClickUp's, which is `found-24-sep/task-edits-narrower-than-clickup` below.

### `found-24-sep/task-edits-narrower-than-clickup` — open, medium (behaviour; found closing the linked-docs item, researched)

**Only a task's creator, an assignee or a manager may change it; in ClickUp, anybody with "edit" on its location may**

*Evidence (code read):* `assertTaskWriteAccess` (tasks.service) refuses every change to a task by a member who neither made it nor is on it: "Only assignees, creators, managers, and workspace admins can edit this task". That covers the title, status, fields, links, labels and attachments. The space's own level is asked after that (`assertSpaceAllowsTaskWrite`), so a member with "edit" on a space still cannot change a colleague's task in it.

*ClickUp's rule* (help.clickup.com "Intro to permissions", "Permissions in detail", "Default user role permissions", search snippets; the pages cannot be fetched here): a member invited to a workspace has full edit on every public location and item by default, and a location's level can be narrowed. "Edit" lets them edit every task and subtask there, including status, assignees, title, attachments, archiving, moving, merging and duplicating. "Full edit" adds creating and deleting. "Comment" allows comments, and on a task assigned to them a change of status or assignees. "View" allows nothing.

*To close:* decide it as ClickUp does. A change to a task asks the level the person holds where the task lives (`resolveSpaceLevel`, a grant winning over the default), not whether they made it or are on it; deleting asks for full edit. This widens who may write, so first measure every suite that relies on the narrower rule (`task-boundaries`, `task-space-levels`, the `workspace-read-access` link half and others that expect a 403 for a member's colleague's task), then change the rule once, in `assertTaskWriteAccess`, with a suite that sets the three levels side by side on a colleague's task.

### `found-24-sep/sprints-open-to-any-member` — **closed** (security, HIGH; found measuring the last four reports of `workspace-reads-skip-the-container-rule`)

**A sprint in a private space is listed, named and opened to every member, and any member, or guest, may make, rename and delete sprints anywhere**

*Evidence, measured on lane 1 (probes `probe-reports-private` and `probe-sprint-writes`), as a member refused a private space, beside a guest:*
- the four reports the container item left unmeasured were clean with data in the private space. The productivity trend counted 1 completion to the admin's 2, status durations 1 sample to 2, and time and time by project showed only the member's own open-space hour. The sprint report was not: it listed the private space's sprint by name and dates, with its task count filtered to 0;
- `GET /workspaces/:ws/sprints` and `GET /sprints/:id` gave the member that sprint's name and goal (200); only its task list was filtered (`[]`);
- the member made sprints (201 each) in the private space, in a "view only" space, and under a space id of ANOTHER workspace: `create` stored whatever `spaceId` it was given;
- the member renamed the private space's sprint (200) and deleted it (200, gone); a guest made a sprint (201) and renamed another (200). `update`, `delete` and `removeTask` take no actor at all; the routes ask only for workspace membership.
- found beside it (probe `probe-sprint-patch`): the rename spread its whole body into the row, so a member who named `spaceId` in it moved a sprint into a private space they were refused (200, moved), and one who named `workspaceId` moved it into ANOTHER workspace (200, moved).

*The rule, ClickUp's:* a sprint is a list in a space's Sprint folder. It is seen by whoever may see its location, and it is made or changed by whoever holds "edit" there; a guest is not given a location's sprints by default. Sprints here have no creator column, so "edit" on the sprint's space is the whole write rule.

*To close:* one rule for a sprint, from its space. It is read by whoever may open that space; a sprint of no space is its workspace's members'; a guest is given none. It is made, changed and deleted by a member (not a guest) holding "edit" on its space, and a sprint's space must be one of its own workspace. The report, the list, the detail and the task list hide or 404 a sprint the reader may not open. A rename takes the fields a sprint has and no others. A suite: the member, the guest and the admin side by side on an open and a private space's sprint, every refusal read back from the row.

*Closed:* a sprint is read as a goal is (`read-access.ts`). The reach is `goalReach`: a guest none, a manager all, a member a sprint of no space and those of the spaces they may open. `readableSprint` judges one sprint and `sprintVisibilityFilter` the lists. The sprints list, the sprint report, a sprint's detail and its tasks all take it, and a sprint the reader may not open is not found. Making, renaming, deleting and moving tasks in or out ask it first. Then they need a member, not a guest, and "edit" on the sprint's space (`assertSpaceLevel`). A new sprint's space must be one of its own workspace that the maker may open and make things in (`assertCanPlaceIn`). A rename takes a sprint's own fields and no others. The new suite `sprint-access`, 7/7 on lane 1, 0/6 before. The seventh check, a rename that also names a space and a workspace, was added from the probe that measured both moves. A guest's rename is not found rather than forbidden, since a guest is given no sprint. `spa-1..11`, each compiled. Regression on lane 1, 9/9: the new suite, `lookup-read-access` (its member's sprint of no space), `report-read-access`, `goal-access` (the read rule's file), `addressability-live` and `task-depth` (the sprints page), `workspace-read-access`, `ai-read-access` and `video1-acceptance`. In CI.

### `found-24-sep/private-lists-skipped-by-task-reads` — **closed** (security, HIGH; found closing `workspace-reads-skip-the-container-rule`)

**The task reads that apply the container rule stop at the space and the project, so a private list's tasks are listed, searched and named to members it refuses; and the workspace list hides a private task from its own assignees**

*Evidence, measured on lane 1 (probe `probe-workspace-tasks`), as a member refused a private list in an open space (403 on the list):*
- `GET /tasks/workspace/:ws`, the list behind the task pickers and the dashboard, named the private list's task, and `?q=` found it by the list's words;
- the timeline (`/tasks/workspace/:ws/timeline`) and a colleague's tasks (`/tasks/workspace/:ws/members/:id`) named it too;
- and a private task ASSIGNED to the member, which they open (200), was missing from their own workspace list.

`containerVisibilityFilter` is the space and project halves of the rule, and a private list's own rule (its maker's, and managers') is a third. `taskInReachFilter` states all three, and it was written for the reports (`found-24-sep/reach-skipped-private-lists`). Every other task read that took `containerVisibilityFilter` inherited the gap: the timeline, a member's tasks and the helpers in tasks.service; the AI's context, suggestions, list names and task search; the meeting task picker; search's task, comment and list branches; and a sprint's tasks. `getTasksForWorkspace` filtered in JavaScript with its own copy of the rule, which had no list rule and a private-item rule that left out assignees, after an over-fetched limit.

*To close:* one rule for a task's reach, used by every task read: `taskInReachFilter` (or a list-aware twin where `lists` is joined) in place of `containerVisibilityFilter` wherever a task, a list or a list's name is read, and the private-item rule where a task is. `getTasksForWorkspace` filters in SQL before its limit, and its JavaScript copy goes. Measure each read before and after with one private list and one private task assigned to the member.

*Closed:* every task read takes a task's reach, `taskInReachFilter`: the space, the project and the list's own privacy. It replaces the space-and-project half, `containerVisibilityFilter`, which now says it is for spaces and projects only. The reads:
- tasks: the workspace list, the timeline, a member's tasks and the dependency graph;
- "may this person open these tasks" (`readableTaskIds`), which the related tasks, the planner and the dependency notices use;
- a person's pages (profile, activity, calendar, standup, priorities) and the tasks two people share;
- search's task, comment and file branches, on both the Postgres path and Meilisearch's;
- a sprint's tasks and the calendar feed;
- the AI's status count, an answer's chips, the command assistant's tasks, and chat's context: its own tasks, its history, its list count and open-task count.
Where the task is aliased (the standup's "held up by"), the list rule is written beside the container rule. `getTasksForWorkspace` asks the database, before its limit, and its JavaScript copy of the rule is gone; the private-item rule there is the canonical one, so a private task is listed to its assignee.

The new suite `private-list-reach`, 13 checks: one private list, made by the admin, its tasks dated, commented on, blocking the member's task, in a sprint and one of them assigned to the member. The member and the admin read each surface above side by side. The thirteenth reads the prompts a model is sent when a model is configured, and the 503 when not. Measured on lane 1, the fix set aside and the API rebuilt, with the lane given the model stub: 0 of 13. Before the fix the member's command prompt named the private list. With the fix, 13 of 13 on the model lane and 12 of 12 without the prompt check. API unit tests: the workspace list's tests now read the query it asks rather than rows it drops, and search's Meili test reads the reach; `sst-2` re-anchored and `sst-3` new, both unit claims. `sst-3` (the reach without the list's rule) first left the test green: the test took the first lists query carrying the list rule, which was the list-name search's own. It now reads the reach itself, the lists query that asks no words, and `sst-3` reddens it. `plr-1..16`, each compiled, `plr-16` to be run on a model lane. Fifteen older patches that took the container rule out at these sites are re-anchored to the new line with the same edit: `dra-1`, `lra-10`, `lra-11`, `sra-1`, `sra-3`, `sra-4`, `wra-1`, `wra-4`, `wra-5`, `wra-7`, `wra-10`, `wra-23`, `wra-24`, `wra-26` and `wra-40`. Regression on lane 1, 21/21: the new suite, `workspace-read-access`, `search-read-access`, `ai-read-access`, `knowledge-read-access`, `lookup-read-access`, `report-read-access`, `dependency-read-access`, `related-task-access`, `sprint-access`, `home-my-work`, `task-pickers-search`, `addressability-live`, `person-panel`, `a39-dm-tabs`, `meeting-access`, `read-visibility`, `task-depth`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `found-24-sep/private-folders-unenforced` — **closed** (security, HIGH; found reading the container rule, then measured)

**A folder's privacy is read by the folder listing and by nothing that reads what is inside it**

*Evidence (code read):* folders sit between a space and its projects (`projects.folderId`), and `folderVisibilityFilter` keeps a private folder from the folder listing. `checkContainerAccess`, `containerVisibilityFilter`, `taskInReachFilter` and `ResourceMemberGuard` never mention a folder. So if a folder can be made private, its projects, lists and tasks are read as if it were open. ClickUp hides a private folder's lists and tasks from those it is not shared with.

*Measured on lane 1 (probe `probe-private-folder`):* the admin made a folder in an open space private (200) and a project, list and task inside it. A member it refuses was kept out of the folder listing only. The project (200), the list's tasks (200), the task (200), the workspace list and search each named what was inside.

*To close:* add the folder to the container rule once. `checkContainerAccess` looks up a project's folder, a private folder being its maker's and the managers', as `folderVisibilityFilter` has it. `containerVisibilityFilter`, which `taskInReachFilter` builds on, asks the same of `projects.folderId`. A suite: the member refused a private folder reads nothing inside it by any route, beside an open folder's project that they read.

*Closed:* the container rule asks a project's folder, in both forms. `containerRefusal` (`container-access.guard-helper.ts`) looks it up and refuses a private folder to anybody but its maker, with the managers let in before. `checkContainerAccess` is now `containerRefusal(...) === null`, so every guard and per-row check has the folder. `containerVisibilityFilter`, which `taskInReachFilter` is built on, keeps projects out of private folders not the reader's, so every list and search does too. Found on the way and closed with it: two private copies of the project rule. The task service's `assertContainerReadAccess` now asks `containerRefusal` and answers in the words of whichever container refused (`found-23-sep/container-read-rule-twice`, above). `getProjectsBySpace` never learnt the folder and listed a private folder's project; it now asks the shared rule. The new suite `private-folder-reach`, 6/6 on lane 1 (0/6 before, the fix set aside): a private folder and an open one, each with a project, a list and a task, read by the member and the admin through the project list, the project, the list catalogue and the list's tasks, the task, the workspace list and search. API unit tests 1633/1633; one attachments test queues the folder lookup's answer. `pfr-1..3`, each compiled. Regression on lane 1, 19/19: the new suite, `private-list-reach`, `workspace-read-access`, `search-read-access`, `read-visibility`, `folder-create`, `folder-dialog`, `sidebar-sections`, `sidebar-reorder`, `space-default-permission`, `space-create-menu`, `list-under-space`, `request-access`, `malformed-ids`, `task-boundaries`, `addressability-live`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

*Not measured by a check:* the task service's own read check sits behind the route guard on every route that reaches it, so no HTTP check can see it alone, and no patch is aimed at it.

### `found-24-sep/workspace-settings-mass-assign` — **closed** (security, HIGH; found reading the workspace logo's path for `avatar-and-logo-accept-any-url`)

**A workspace admin's settings save writes whatever columns its body names: the plan, its limits, and a custom domain's verification**

*Evidence, measured on lane 1 (probe `probe-workspace-mass-assign`), as the admin of their own workspace (not a platform admin):* `PATCH /workspaces/:id` declares seven fields in an inline type, which nothing enforces at runtime, and `update` spreads the body into the row. One PATCH set `plan: "free"`, `planLimits: { seats: 99999 }`, `customDomainVerified: true` and `customDomainToken` to a value the caller chose (200 each, read back from the row). The plan belongs to the platform-admin route (`setWorkspacePlan`, super-admin only). Verification belongs to the DNS check. A verified custom domain is what `resolveByCustomDomain` serves a branded sign-in page for, and what `/public/tls/authorize` tells the proxy to get a certificate for. The first verified match wins, so a workspace could claim a domain it does not own, another customer's included.

*To close:* the service writes the fields a settings save may change and no others (name, logo, colours, custom domain, the two sharing policies). The verified flag and the token change only through the domain's own paths. A suite: the admin's save that names the plan, the limits, the flag and the token changes none of them, beside the name it does change.

*Closed:* `update` writes the name, logo and colours, and the custom domain and the two sharing policies by their own branches, and nothing else. The plan, its limits, the verified flag and the token are no longer a settings save's to write. The new suite `settings-writes`, with the picture item below. Its first check: a workspace admin who is not a platform admin names the plan, the limits, the flag and the token in the same save that renames the workspace. Only the name changes, read back from the row. `stw-1`, compiled, reddened on lane 2. Regression on lane 1, 19/19, one sweep for this batch (settings, pictures, the contribution sprint and project order): `settings-writes`, `contribution-sprint`, `project-order`, `credential-reads`, `stable-images`, `settings-depth`, `file-exports`, `workspace-role-controls`, `person-panel`, `sprint-access`, `sidebar-reorder`, `sidebar-sections`, `space-create-menu`, `list-under-space`, `planner-settings`, `space-wizard`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `found-24-sep/ai-knowledge-filter-copies-the-container-rule` — **closed** (security, medium; a duplicated rule, found fixing docs, measured leaking)

**The AI knowledge answer's filter stated the container rule in its own words, and stopped at spaces and projects: a private list's task and a private task's comment were cited**

*Evidence, measured on lane 1 (probe `measure-knowledge`, then the suite against the build before the fix, 0 of 2):* the retrieval works without any provider, because the local embedder fills the index when an admin reindexes. A member refused a private list in an open space, and a private task (403 on each), asked about them. The answer cited the private list's task and "Comment on a private task", while the admin's cited both, as it should. `filterAccessibleHits` built its own `spaceOk`/`projectOk` predicates. They had no private-list rule, no private-task rule for comments and attachments, and no space admin's reach into a private project.

*Closed:* one predicate, `taskOpen`: `taskInReachFilter` (the container rule with the list's own privacy) and `taskVisibilityFilter` (the private-task rule), for a task, a comment and an attachment alike. The new suite `knowledge-read-access`, 2/2 (0/2 before), with no model needed: the answer's sources are what it reads. `kra-1..2`, each compiled. API unit tests 1628/1628. Regression on lane 1, 8/8: the new suite, `ai-answer-rendering`, `ai-read-access`, `ai-assign`, `workspace-read-access`, `search-read-access`, `create-menu-ai` and `ui-sweep`. In CI.

### `found-24-sep/bulk-edit-answers-unfiltered` — **closed** (security, medium; found judging the second drifted plan's `tb-41`)

**The bulk editor answered with each task read as nobody in particular: its related tasks came back whole, from spaces the caller is refused**

*Evidence, measured on lane 1 (`related-task-access`'s new check, against the build before the fix, 0 of 1):* `bulkUpdateTasks` re-reads each task after a relationship change (an assignee, a label, a dependency) with `getTask(taskId)`, which takes no reader. A task read with no reader keeps every related task, which is how an internal caller reads it. A member assigned the admin to their own task through `PATCH /tasks/bulk/update`. The answer carried the private space's task, its title and its description, twice (its two dependency rows), although `GET /tasks/:id` refused the member that task. The single edit's answer already read as its caller (`rta-3`). The list page's bulk bar ignores the answer, so the leak was to anyone calling the route.

*Found by:* `tb-41` reddened nothing on lanes 3 and 4. It removes the dependency query's own workspace condition, and for any reader the reader rule (`readableTaskIds`, in the task's own workspace) leaves a foreign task out by itself. Looking for a route that reads a task with no reader, to aim it at, found this one.

*Closed:* the re-read passes its caller (`{ id: actorId }`), as every other write's answer does. `related-task-access`, 4/4 after (3/3 before, the new check red). `rta-4` puts the readerless re-read back, and reddened on lane 2. `tb-41` now claims a unit test, `tasks-security.test.ts` "reads a task’s dependencies from its own workspace only, with no reader as with one": the condition is the only rule a readerless caller has, and no route can show it once every route reads with a reader. It reddens that test (`check-unit-claims`, 25 of 25). `tb-46` takes both rules, the condition and the reader rule, so `task-boundaries`' foreign-dependency check is shown to see a foreign task at all; it reddened on lane 2. `rta-4`, `tb-41` and `tb-46`, each compiled. API unit tests pass. No suite drives the list page's bulk bar in a browser; the route is measured directly. Regression on lane 1, 10/10: `related-task-access`, `task-boundaries`, `dependency-read-access`, `task-depth`, `workspace-read-access` (whose no-model branch has its own sentence now, with `found-24-sep/model-patches-measured-without-a-model`), `private-list-reach`, `private-folder-reach`, `ui-sweep`, `video1-acceptance` and `video-regression`.

### `found-24-sep/planner-default-list-read-by-nothing` — open, small (dead control; found fixing the block prefix)

**The planner's Time blocking "Default list" saves, and nothing reads it**

*Evidence, read not run:* `planner-settings-dialog.tsx` draws a Default list picker (`planner-default-list`). Its comment calls it "the answer to the question video 1 left open: where a task made from a message, from /task, or by the AI should land". It writes `defaultListId` into the person's planner settings, and the server checks the list exists. A search of `apps/web/src` and `apps/api/src` finds no other reader. A task made from a chat message, from `/task` or by the AI lands wherever those flows put it, and the picker changes nothing. `planner-settings` checks only that the picker offers the workspace's lists.

*The frame answers what it governs:* `14:20`, Time blocking, "**Default list for new tasks** — *Defaults to your personal list*" (`video2-frame-observations.md`). The gap audit reads it as the answer to video 1's open question: where a task made by `/task`, from a message, or by the AI lands. That is the person's Personal List unless they choose another.

*To close:* have each of those flows read the setting when no list is named: `/task`, a message turned into a task, and the AI's task-making. Add a check per flow that the task lands in the chosen list, and in the personal list when none is chosen.

### `suite-hygiene/branch-checker-confident-zero` — open, medium

**check-suite-check-branches reports 0 because it cannot see bad(), uncounted SKIPs, or unequal branches**

*Evidence:* The checker printed '0 conditional check block(s) with no else, in 0 of 115 suite(s) read.' It has three blind spots. First, CHECK_CALL = /\b(chk|check)\s*\(/ at line 79 never matches bad(…)/ok(…) (a39-dm-tabs:178, ui-sweep:421/461, video-regression:325/328/693/713, list-view-controls:239, list-empty-states:357) or a console.log SKIP (video-regression:465). Second, line 160 only asks whether an `else` exists, never whether both sides report the same count, so every imbalance in finding unbalanced-else-branches passes. Third, its header (187-191: 'ZERO NOW, ACROSS ALL 113 SUITES') and the ledger (docs/video2-reaudit.md:4008-4011: 'Every one of the 113 suites now reports the same number of checks whichever way it goes') are false, and the suite count is now 115.

*To close:* Count reporting calls per branch: chk, check, ok, bad, skip, .step (1 each), with .rest/.skipRest treated as 'fills to declared length'. Flag if/else pairs whose counts differ, and flag loops with literal bounds. Add fixture cases to check-branches-cases.mjs for a bad()-only else and a 9-vs-8 else. Then correct ledger lines 4008-4011.

### `commit-log/log-68c0345-1` — open, medium

**Search indexing cannot be measured on any lane because none runs Meilisearch**

*Evidence:* Commit 68c0345: 'Indexing is unmeasurable in this environment, so it is RECORDED as unmeasurable'. doc-import.mjs:252-267 says so. There is no 'meili' anywhere in scripts/e2e-lanes. This is the same kind of reason that storage and the model both shed this week by getting a stub.

*To close:* Give the lanes a search stub or a real Meilisearch the way s3-stub and model-stub work. Then aim doc-import-2 at indexing again and check indexDocInSearch across docs, tasks and the rest.

### `commit-log/log-ad00a7c-1` — open, medium

**The model stub is wired but off by default, and nothing routes each suite to a lane with or without a model**

*Evidence:* Commits ad00a7c ('still the open piece') and b5a52bc ('the next piece and is not done') record this. lane-env.sh:131-132 still says: 'Wiring that choice into the dispatcher is the next piece of this work and is NOT done.' run-plan.sh:50-74 gives any set to whichever lane is free and never considers the model. Consequences: create-menu-ai and task-ai-bar can only run where no lane has a model. Only ai-create-containers and ai-answer-rendering have been converted. No sweep exercises any AI happy path through the real API with a model, because no lane has one by default (4cb50d3: 'the rewrite is the next piece of work').

*To close:* Give the plan a per-suite requirement: model, no-model, or either. Have run-plan.sh and sweep-until-clean.sh start a mixed fleet (for example RUNDESK_LANE_MODEL='3 4') and send each set to a matching lane. Then write model-lane checks and break patches for the AI surfaces that today are measured only by their refusal.

### `harness/section-enders-blind-to-check-spelling` — **closed** (with its duplicate `suite-hygiene/section-enders-blind-to-check-suites`)

*Closed:* one shared matcher, `scripts/lib/check-call.mjs` — `CHECK_LINE`, `CHECK_CALL` and `checkCalls(src)`, both spellings, and NOT `.check(` (Playwright ticking a checkbox) — used by the section-ender rules, `suite-reads`' message reader and `check-suite-check-branches`. Widened, the checker reported 24 sites across 7 suites; every real one is bounded (`{ timeout: 10_000 }` and a catch on the press, a caught read in a condition or message): person-panel ×5 (and the `user-menu` press beside three of them), settings-depth ×2, task-depth ×3, video1-fast-items ×2 (and its `workspace-switcher` press), emoji-picker ×7, and three in `chat-history`, written today. The two in panel-collapse were false positives — `document.querySelector('[data-testid=…]')?.getAttribute(…)` runs in the page and answers undefined — so rules five and eight now spare exactly that optional-chained DOM read, and still flag the same read through a locator. The tree reports 0. Cases: a `check(`-spelled suite is read (`check-suite-enders`), an optional DOM read is spared at section and file scope while a locator read is not, and a conditional `.check()` is not a conditional check (`check-branches-cases`); mutations restoring `chk(`-only, removing either exemption, and dropping the dot exclusion each redden (enders 32/32, branches 7/7, suite-reads 8/8 after re-anchoring its two).

**check-suite-section-enders only recognises `chk(`, so 13 suites (about 700 checks) spelled `check(` are never scanned**

*Evidence:* Rules 1, 2, 5 and 8 test /^\s*chk\(/ (check-suite-section-enders.mjs:275, 321, 375, 433, 442). Rule 7 uses src.indexOf('chk(') (:690). Rule 6 uses src.indexOf('chk(') in suite-reads.mjs:109. By contrast, check-suite-check-branches.mjs:79 uses /\b(chk|check)\s*\(/. Thirteen suites have zero chk( and define `const check =`: addressability-live, chat-message-actions, comment-thread, emoji-picker, loading-states, panel-collapse, person-panel, settings-depth, stale-chunk-recovery, syncup-live, task-depth, ui-sweep and video1-fast-items. The checker reports '0 site(s)' on the real tree. I copied those 13 into the scratchpad with check( renamed to chk( (line numbers unchanged) and ran it with SUITE_DIR pointed there. It then reports 21 sites across 6 suites. Real sites read by hand: person-panel.mjs:237 (`await page.getByTestId('menu-my-profile').click()` straight after a check that it is visible); settings-depth.mjs:208 (menu-set-status); task-depth.mjs:232; video1-fast-items.mjs:1071 and :1114; emoji-picker.mjs:213, 224 and 238 (page.fill on an asserted emoji-search); task-depth.mjs:980 (an uncaught innerText in a check message). panel-collapse.mjs:471 and :475 are false positives, `?.` inside evaluate. The same blind spot was found and fixed in check-break-coverage (docs/video2-reaudit.md:3673-3677, §8b: 'A suite whose helper is named check( counted zero checks'). This checker was not brought along.

*To close:* Use one shared CHECK_CALL regex (\b(chk|check)\s*\(), exported from a lib and used by section-enders, suite-reads.messageReads and check-suite-check-branches, and consider chain `.step(` too. Add a check( fixture to check-suite-enders.mjs. Then fix the roughly 19 real sites the widened rules report.

### `harness/section-enders-blind-to-variable-locators` — **closed** (one gap kept open, named below)

*Closed:* `withLocatorsResolved` (lib/suite-reads.mjs) writes every locator variable assigned straight from ONE testid (`.first()`/`.last()`/`.nth()` allowed, nothing wider) out as that testid before rules one, five and eight read the file, and rule nine reads any locator variable as rule seven does. Widened, the checker reported 68 sites in 23 suites. Eight were false positives in four shapes the rules now know — a comment mentioning a read, a read on a multi-line check's continuation line (rules six and seven own those; `checkSpanLines`), a read behind a ternary on its own presence, and a read inside a `waitUntil` predicate (rule four and rule nine had not been told) — and the other 60 are bounded in 20 suites: presses and fills with a timeout and a catch, reads with a timeout and a fallback the check below then fails on in its own words. The tree reports 0. `check-suite-reads.mjs` holds the resolver (32 cases, 11/11 mutations: wider selectors resolved, comments read, continuation lines forgotten); `check-suite-enders.mjs` holds the rules (39/39 mutations, each new exemption and the resolution itself). *Not done:* chain steps — `x.step(cond, msg)` is a check to rules one, five and eight, but `check-suite-check-branches` must NOT count it (the chain helper exists to balance conditional steps), so it needs the checkers to take different matchers; the two reads it hid in video1-fast-items are bounded by hand.

**Rules 1, 5, 8 and 9 cannot see a press or read through a locator held in a variable, and 12 real sites sit in that gap**

*Evidence:* Rules 1, 5 and 8 match the literal getByTestId('<id>') or [data-testid="<id>"] on the press line (check-suite-section-enders.mjs:307, 391, 448). Rule 4 only pairs a variable guarded through textOf/attrOf/boxOf, or catch plus click/fill/innerText/getAttribute/boundingBox (:648-651); isVisible, the usual existence check, is not in that list. Rule 9 requires a literal testid in the statement (:517). Yet locatorVars (suite-reads.mjs:84-88) exists and rules 6 and 7 already use it. Real sites where a check asserts the variable's element exists and the next press is bare, with no catch or timeout: activity-rail.mjs:221 (toggle, asserted at :205); call-survives-navigation.mjs:150 (start, asserted at :148); clip-setup.mjs:211 (clipButton, asserted at :205-209); command-palette.mjs:273, 365, 376, 385 and 793 (input, assignee, search, driveRow); replies-inline-thread.mjs:150 (opener); save-comment.mjs:204 and :356 (saveBtn and replyBtn). Rule 9's gap: video1-fast-items.mjs:353 (`await gear.first().getAttribute('href')` after a count check) and emoji-picker.mjs:271 (frequentButtons.first().getAttribute). Found by scratchpad gaps.mjs and each confirmed by reading the file.

*To close:* Resolve each locatorVars name to its testid and treat `await <var>.<verb>(` as that testid in rules 1, 5 and 8. Count `<var>.isVisible()` and `<var>.count()` in a check as asserting the variable. Let rule 9 accept a locator variable as rule 7 does. Add fixtures, then bound the 12 sites with timeout and catch, keeping each check's absence semantics.

### `harness/chain-planner-crash-reads-as-clean` — **closed**

**chain-plan.sh and sweep-until-clean.sh report 'nothing left' when the planner crashes**

*Closed:* the plan-building lines the two scripts each carried — both planner modes, then the merge — are one helper, `scripts/e2e-lanes/build-plan.sh`, which reads all three steps' exit statuses and accepts an EMPTY plan only from a planner that finished: each mode must print its `[never-run-plan] N patch(es)` summary, the last thing it does. Anything else is exit 4, with the reason in the log, and both scripts then say "the PLANNER FAILED — this is not 'nothing left'" and exit 4, a code neither used. Against the real planner it builds the same 29-set plan as before. `scripts/check-build-plan.sh --mutate` (preflight and the verify job) runs five fake planners — one that throws, one that dies after printing its summary (only the exit status tells), one that exits 0 without it (only the summary tells), a genuinely empty one, and two modes naming the same suite — and 4 of 4 mutations of the helper are caught: exit status unread, summary unasked, failure reported as 0, and no merge.

*Evidence:* Both scripts use `set -uo pipefail` without -e (chain-plan.sh:24, sweep-until-clean.sh:28). They run `node never-run-plan.mjs >> "$plan" 2>>"$LOG"` without checking its status (chain-plan.sh:39-40, sweep-until-clean.sh:60-61), and they do the same for the merge `node -` step (chain-plan.sh:44, sweep-until-clean.sh:65). An empty plan gives sets=0, and the scripts then say 'round N: nothing left — every log on disk measured the current tree' and exit 0 (chain-plan.sh:58-62, sweep-until-clean.sh:79-83). Replicated in the scratchpad: a planner that throws gives planner-rc=1, and the script then prints the 'nothing left' sentence. Possible crash triggers include a syntax error in log-tree.mjs or suite-of-patch.mjs, and a missing /tmp/claude-0 (measuredAt's readdirSync throws).

*To close:* Capture each node exit status and on non-zero write 'planner failed' and exit with a distinct code. Also require never-run-plan's '[never-run-plan] N patch(es)' stderr summary to be present for both modes before accepting an empty plan.

### `harness/ci-missing-doc-import` — **closed**

**test/e2e/doc-import.mjs is not in ci.yml, and nothing checks that every suite is**

*Closed:* registered as the ci.yml step "Document import". `scripts/check-suites-registered.mjs` compares `test/e2e/*.mjs` with the `run:` lines of ci.yml (not a grep of the file: a suite named in a comment, a step name or behind a shell `#` is run by nothing) and fails on an empty read; `check-suites-registered-cases.mjs --mutate` plants 12 trees built to fool it and 10 of 10 mutations of the reader and the gate redden a case. Both run in preflight and in the verify job. 116 of 116 suites registered.

*Evidence:* comm of `ls test/e2e/*.mjs` against the test/e2e/*.mjs paths in .github/workflows/ci.yml leaves doc-import. It has 4 break patches and a 13/13 run (f634982). No script in scripts/ ties the suite directory to ci.yml. local-sweep.mjs:10-14 derives its suite list FROM ci.yml, so it also misses doc-import.

*To close:* Add doc-import to the postgres-harnesses job. Add a preflight check that every test/e2e/*.mjs appears in ci.yml, or is listed with a reason.

### `harness/ci-suites-read-a-database-that-does-not-exist` — **closed** (found while registering `task-boundaries`)

**25 CI steps pointed their suite at `rundesk_ci`, a database the job never creates**

*Evidence:* the postgres-harnesses service creates only `rundesk_calls` (`POSTGRES_DB`), and the job-level `DATABASE_URL` names it — the database the API writes. From 2ae54b4 (20 September) onward, 25 steps overrode it per step with `postgres://…@127.0.0.1:5432/rundesk_ci`, each copied from the one before. Nothing creates `rundesk_ci`, so every one of those suites would have failed to connect on the first day CI ran — and had it existed, they would have read a different database from the one the API writes. Unseen because CI has not run since the Actions quota ran out.

*Closed:* the 25 overrides are removed; every step inherits the job's `DATABASE_URL`, and a comment on the job env says not to override it per step.

### `harness/deps-omit-suite-libs` — **closed**

**A measurement's dependencies leave out the test/e2e/lib helpers every suite imports**

*Closed:* `patchDeps(text, suite)` adds `suiteLibs(suite)` — the `test/e2e/lib` files the suite imports, followed through the helpers that import each other (static `from`/`import` and dynamic `import()` alike), cached per suite. So the planner, `check-break-reddened` and `check-break-freshness`, which all read `patchDeps`, now call a log stale when a helper under it changed. `inbox-scope`'s six helpers and `task-cover`'s five (store included) are found. `check-log-tree.mjs` (44 cases) builds a tree holding each import shape, a cycle and a non-helper import, and checks folder-dialog's five real helpers; 12 of 12 mutations bite, three of them new — helpers dropped, helpers of helpers not followed, `import()` not read. Effect on disk: `store.mjs` changed at 13:59 today (7e12844), so the three suites importing it read as drifted where their logs predate that, which is the rule doing its job.

*Evidence:* patchDeps (log-tree.mjs:139-145) adds only files under /home/user/rundesk/(apps|packages)/ plus test/e2e/<suite>.mjs. Suites import ./lib/signin.mjs (97), playwright.mjs (88), local-stack.mjs (87), wait.mjs (79), db.mjs (40), fixture.mjs (36) and chain.mjs (10), counted by git grep over test/e2e/*.mjs. A change to waitUntil or to chain.mjs changes what every importing suite measures. The planner, the reddened checker and freshness all still call those logs current. chain.mjs has changed behaviour before (580793d 'The chain helper had the hole it exists to prevent'). Today's logs postdate the last lib commit (8b788d5, 22 Sep 08:34), so nothing is affected yet.

*To close:* In patchDeps, when a suite is named, add the test/e2e/lib/*.mjs files that suite imports (a static parse of `from './lib/...'`). Add a check-log-tree case.

### `harness/fleet-scripts-exit-zero-when-down` — **closed**

**fleet-up.sh and fleet-restart.sh exit 0 when no lane came up; build-api.sh inherits that**

*Closed:* both scripts end `[ "$ok" = "${#LANES[@]}" ] || exit 1`, and `build-api.sh`, whose last command is `fleet-restart.sh`, exits with it. The PLAUSIBLE half was real and is fixed with it: both now stop the old API through one function, `lane_api_down` in `lane-env.sh` — by port, then WAITED on until nothing listens there, SIGKILL after a grace — before starting the new one, so the health loop can no longer pass against the dying process. Measured: `fleet-restart.sh "9"` on a lane whose database is behind printed `NOT RESTARTED (above)`, `0 of 1 lanes up` and exited 1 in 0.7 s; before, it polled a lane it had refused for 90 s and exited 0. `scripts/check-lane-api-down.sh --mutate` (preflight and the verify job) starts real servers on a spare port — one that exits on SIGTERM, one that ignores it, and none — and requires the port to end free, the polite one BEFORE the grace ran out; 3 of 3 mutations are caught (no wait; no SIGKILL; `fleet-up`'s kill that stops nothing, which only the timing reveals). Two siblings found doing it, below.

*Evidence:* fleet-up.sh:105 (`echo "$ok/${#LANES[@]} lanes up"`) and fleet-restart.sh:158 are each script's last command, so '0 of 4 lanes up' exits 0. build-api.sh:48-51 ends with fleet-restart.sh, so it also exits 0 with every lane down. sweep-until-clean.sh:185 (heal) discards fleet-up's status. PLAUSIBLE, not demonstrated: fleet-restart.sh:113-114 sends kill and relaunches without waiting for the port to free. wt-break.sh:92-99 does wait. So the health loop at :151-154 could pass against the dying old process.

*To close:* `[ "$ok" = "${#LANES[@]}" ] || exit 1` at the end of both scripts. In fleet-restart, wait for health to go down before relaunching, as wt-break's restart() does.

### `commit-log/log-8ac33d9-1` — partly-fixed, small

**A bare lane number means a count in fleet-up.sh, which drops databases, but a single lane in the other scripts**

*Evidence:* Commit 8ac33d9 fixed fleet-restart, so '9' means lane nine (fleet-restart.sh:5, 38-47). RUNDESK_LANE_MODEL=9 also means lane nine (lane-env.sh:147). fleet-up.sh:12 and :29-30 still read '9' as lanes 1 to 9, and that script drops and restores every lane in the range (its own header at :16-18 calls this a mistake you get to make once).

*To close:* Make fleet-up.sh take lists only, as fleet-restart.sh now does (a count must be spelled with seq), so one spelling means one thing everywhere.

### `commit-log/log-a5b6b69-1` — open, small

**The long CI e2e job is still not split, and the suite count in its comment is stale**

*Evidence:* Commit a5b6b69 raised the limit to 180 and deferred the split to 'whoever has a working pipeline'. ci.yml:393-396 says 'ONE HUNDRED AND SEVEN', but the job now has 109 `node test/e2e/` steps (about 120 minutes at 1.1 minutes each, under the 180 limit at :428). A leftover paragraph at :421-423 still argues for 120.

*To close:* When CI can run again (1 October), split the job and validate it. Until then, correct the count and delete the leftover paragraph.

### `commit-log/log-c592545-1` — **closed**

**doc-import.mjs is the one e2e suite not registered in CI, and nothing checks for that**

*Closed:* the same item as `harness/ci-missing-doc-import` above, closed there.

*Evidence:* Commits f634982 and c592545 ran it green (15 of 15, 4 of 4 patches) and closed the Importers row. A loop over test/e2e/*.mjs against ci.yml finds exactly one suite missing: doc-import.mjs. No script compares the two lists (git grep over scripts and .github finds no guard for unregistered suites). The resume doc says 'ALL 113 are registered'.

*To close:* Add doc-import.mjs to postgres-harnesses. Add a checker, run in preflight and CI, that fails when a suite file has no ci.yml step.

### `commit-log/log-d840b55-1` — open, small

**sweep.sh and drain.sh still run copies of scripts from /tmp instead of the committed ones**

*Evidence:* Commit d840b55 deleted break-queue.sh because 'the copy without the guard is the one that would eventually be used by mistake'. Commit 4a43a1d fixed batch.sh calling a verifier in /tmp. sweep.sh:14 still runs `bash /tmp/claude-0/verify.sh`, which skips the committed verify.sh and its stale-build refusals. drain.sh runs /tmp/claude-0/wt-break.sh, reads patches from /tmp/claude-0/breaks, and carries a hard-coded queue from 21 September. docs/video2-resume.md:185 and :285 still tell the next session to use drain.sh.

*To close:* Delete drain.sh and sweep.sh, or point them at scripts/e2e-lanes/*.sh and test/e2e/breaks. Update the resume doc to name run-plan.sh and sweep-until-clean.sh.

### `commit-log/log-d92d58f-1` — open, small

**Nothing stops two builds writing the same per-lane web bundle at once**

*Evidence:* Commit d92d58f: 'verify.sh refuses a stale bundle and nothing refuses two writers to the same one'. grep for lock or flock in verify.sh and refresh-dists.sh finds only the stale-build notes (verify.sh:115, 125).

*To close:* Take a lock per lane around the vite build and the run, in the style of the wt<lane>.lock that wt-break.sh uses.

### `harness/measuredat-counts-nonmeasurements` — **closed**

**measuredAt records PATCH FAILED / MISSING / CHANGED NOTHING / BUILD FAILED lines as measurements at that sha**

*Fixed in log-tree:* `NOT_RUN` (exported beside `CONTROL`) matches the four lines, and `measuredAt` skips them — a failed attempt says nothing, and an older real measurement of the same patch stands or falls by its own drift. It had gone LIVE by the time it was fixed: five "refuses everything" patches (`tb-23`, `sdp-22`, `db-11`, `db-12`, `okb-16`) failed to build in both their runs and were on record as measured; after the fix the planner lists them as unmeasured (42 → 47 patches, 3 → 7 suites). `check-log-tree.mjs` holds the case — all four shapes, and a newer failed attempt that must not overwrite an older real run — and the mutation that removes the skip reddens two cases. And `wt-break.sh` removes `brk-<patch>.log` at the start of each attempt (7b201d5), so a patch that goes no further than MISSING, PATCH FAILED, CHANGED NOTHING or BUILD FAILED leaves no log at all rather than the previous run's, and `check-break-reddened` reads "no usable log" instead of old numbers under a new commit.

*Evidence:* scripts/lib/log-tree.mjs:74-77 accepts any '^== <lowercase-name>' line that CONTROL (:50) does not exclude. wt-break.sh writes '== $b MISSING', '== $b PATCH FAILED', '== $b PATCH CHANGED NOTHING' and '== $b BUILD FAILED' at :383, :389, :403 and :477. Demonstrated with a synthetic log in the scratchpad: measuredAt returned x-1-rotted, x-2-typo, x-3-noop and x-4-gone, each 'measured' at sha 16349c51. On those outcomes wt-break.sh never truncates or rewrites brk-$b.log, which is only written at :433-434 in the OK branch. So check-break-reddened.mjs:323-350 reads the PREVIOUS run's brk log and dates it by the new sha. never-run-plan.mjs:81 skips the patch as measured. The comment in check-break-reddened.mjs:107-108 says wt-break truncates brk-<patch>.log at the start of each patch run, and that is false for these four outcomes. On disk: 9 such lines exist across the break-*.txt logs, and none is currently the newest line for its patch (scratchpad nonmeasure.mjs), so this is latent. classify-break-log.awk:46-48 already knows these outcomes. log-tree does not.

*To close:* measuredAt should skip, or record as outcome:'not-run', any line carrying MISSING, PATCH FAILED, PATCH CHANGED NOTHING or BUILD FAILED, so that the patch reads as unmeasured and the planner schedules it. wt-break.sh should `rm -f brk-$b.log` before each patch attempt. Add a check-log-tree case and a mutation for it.

### `harness/planner-ignores-patch-body` — **closed**

**never-run-plan --drifted ignores a change to a patch's own code, but check-break-reddened treats it as drift**

*Closed:* all three instruments ask one function. `never-run-plan.mjs --drifted` and `check-break-freshness.mjs` call `makeMeasurementCheck` (which `check-break-reddened.mjs` already used) per patch, with the patch's name and text, so a rewritten body is drift everywhere. Measured after the change: `check-plan-population` reports "the plan and the reddened checker agree on all 118 patch(es) needing a run"; freshness now names the six patches whose bodies were rewritten today and the logs that predate `local-stack.mjs`'s last change, which its own copy of the question could not see. No fixture was added to `check-plan-population` — it compares the tools' printed output against the real logs, and with one shared function there is no second implementation for a fixture to catch; the body rule's cases and mutations are in `check-log-tree.mjs`.

*Evidence:* CONFIRMED. scripts/check-break-reddened.mjs:350 calls notCurrent(rec, patchDeps(text, suite), { name, text }), so makeMeasurementCheck (scripts/lib/log-tree.mjs:155-164) reaches patchCodeMoved (log-tree.mjs:191-204) and a changed body (comments stripped) comes back as '<path> <body>'. It also comes back as '<not committed when it ran>' when the patch has no blob at that sha. scripts/e2e-lanes/never-run-plan.mjs:53 imports only makeDriftCheck. At :115-116 it checks drifted(rec.sha, patchDeps(text, suite)), and patchDeps (log-tree.mjs:117-146) leaves the patch file out, so a body-only change is `continue`d. A patch file is only looked at in the declaresRerun branch at :115. scripts/check-break-freshness.mjs:157-167 also leaves out the patch body, so there is a third instrument using the second rule. Demonstrated without editing the repo: /tmp/.../scratchpad/harness/disagree.mjs took po-3-one-provider (rec sha 5f66058c), added one line of code in memory, and got checker = ['test/e2e/breaks/po-3-one-provider.py <body>'] and planner --drifted = 'current (not scheduled)'. Result: chain-plan.sh:58-61 and sweep-until-clean.sh:79-82 would print 'nothing left — every log on disk measured the current tree' while the checker files that patch under drifted. The contradiction is not silent: check-plan-population.mjs:196-209 (preflight step, preflight.sh:36) would fail with 'checkerOnly'. But the chain can never clear it, because the patch is never scheduled, so it needs a manual wt-break run. There are 0 instances today: both tools report 0 drifted and check-plan-population agrees on 0. History: commit 4b16dc4 added patchCodeMoved and changed check-break-reddened.mjs, and never touched never-run-plan.mjs or check-break-freshness.mjs.

*To close:* In never-run-plan.mjs --drifted, replace the drifted(...) test with makeMeasurementCheck({root})(rec, patchDeps(text, suite), { name, text }), keeping the Re-run branch. Give check-break-freshness.mjs the same per-patch body comparison, or have it consume makeMeasurementCheck. Add --mutate entries to scripts/check-log-tree.mjs:312-332 for patchCodeMoved; today none of its mutations touch the body rule or the `if (moved.length || !patch)` line. Add a check-plan-population fixture case in which only a patch body changed.

### `harness/process-exit-remaining` — **closed**

*Closed:* `local-sweep.mjs` (four exits) and `smoke-phase1.mjs` (its `fail` helper, seven callers, and the catch-all) stop through `await bail(…)`; neither calls `process.exit` any more. `bail.mjs`'s numbers are re-measured: 123 suites, 1,094 recorded runs, the largest 11.6KB. Converting them found a defect in `bail` itself — below.

**process.exit() is still used in local-sweep.mjs and smoke-phase1.mjs; bail.mjs's suite count is stale**

*Evidence:* Every checker in preflight uses bail() or process.exitCode: 12 files import bail, and check-plan-population and check-log-tree set exitCode. The remaining calls: local-sweep.mjs:114, 122, 166 and 168, where :168 follows a per-failure listing of up to 12 lines each, so a piped run can lose the tail (bail.mjs:10-20 measured up to 129,904 bytes lost); smoke-phase1.mjs:9 and :167. model-stub.mjs:49 and s3-stub.mjs:54 exit after one short stderr line at startup, which is benign. The SIGINT/SIGTERM handlers (model-stub.mjs:188, s3-stub.mjs:274) are benign. bail.mjs:27-34 says '113 suites' and '945 recorded runs'. test/e2e now holds 115 .mjs, though the largest brk log is still 11.6KB, so the argument holds.

*To close:* Replace the local-sweep and smoke-phase1 exits with bail(). Refresh bail.mjs's counts.

### `harness/rerun-declaration-mirror` — **closed**

**A '# Re-run:' declaration is honoured by the planner and invisible to the reddened checker**

*Closed:* a pending declaration is a reason `makeMeasurementCheck` returns — `<declares Re-run>` while the patch's WORKING COPY differs from its blob at the measured sha, spent by a measurement taken after it — so the planner and the checker share it, and both compare the working copy `wt-break.sh` runs. The planner counts declarations from that reason instead of its own `git diff`. `check-log-tree.mjs`: a declaration written after the measurement is pending though the code is unchanged, and one committed before the measurement is spent; the mutations that hide it and that never spend it each redden a case (48 cases, 15 of 15 mutations).

*Evidence:* never-run-plan.mjs:115 schedules a patch that declares Re-run and whose file changed since its sha. check-break-reddened.mjs:61 does not import declaresRerun. Its body comparison (log-tree.mjs:184-189) strips every '#' line, and '# Re-run:' is one of those lines. So while a Re-run is pending, the checker credits as a current REDDENED measurement a log the patch itself says is not evidence, and check-plan-population.mjs:180-194 fails with planOnly. A second asymmetry: the planner's Re-run test uses git diff sha HEAD, which sees committed changes only. The checker compares the working-copy text, and the working copy is what wt-break.sh:381-385 actually runs. No patch declares Re-run today (grep of test/e2e/breaks/*.py for the declaresRerun regex returned none), so this is latent.

*To close:* Have makeMeasurementCheck return a '<declares Re-run>' reason when declaresRerun(text) holds and the patch file differs from its blob at rec.sha, so both callers share it. Compare the working copy in both.

### `suite-hygiene/section-enders-blind-to-check-suites` — **closed** (the same item as `harness/section-enders-blind-to-check-spelling`; closed there)

**The section-enders pairing rules only read chk(, so 13 check()-style suites are never scanned**

*Evidence:* Rules one, two, five and eight all gate on `/^\s*chk\(/` (check-suite-section-enders.mjs:275, 321, 375, 433, 442). Thirteen suites define `const check =` instead: addressability-live, chat-message-actions, comment-thread, emoji-picker, loading-states, panel-collapse, person-panel, settings-depth, stale-chunk-recovery, syncup-live, task-depth, ui-sweep and video1-fast-items. The checker printed '0 site(s) across 0 suite(s)'. Re-running rule eight's pairing with `check(` (scratch) found the exact rule-one shape: person-panel.mjs:233-237 (check isVisible on menu-my-profile, then a bare `.click()`), also 291, 308, 709, 820; emoji-picker.mjs:200 then 213, 224, 238, 255; task-depth.mjs:219 then 232; settings-depth.mjs:208, 464; video1-fast-items.mjs:1071, 1114. panel-collapse.mjs:1052/1058 (`check(await box.isVisible())` then `box.fill(...)`) is also missed because the rule only pairs literal testids, not locator variables.

*To close:* Match `^\s*(chk|check)\(`, and pair locator variables assigned from getByTestId. Add a fixture suite using check( to the checker's cases so the scope cannot silently shrink again. Then bound or catch the sites found.

### `harness/stale-lock-dirs-hang-dispatch` — **closed**

*Closed (7b201d5):* both locks are taken with `lock_take` (lane-env.sh), which signs the directory with the holder's PID; a lock is HELD only while that process lives (an unsigned one for its first minute), and one whose holder is gone is taken with a line saying so. `run-plan.sh` skips a lane only when it is held by a live process, and when every lane stays held it says so once and gives up after `LANE_WAIT_MAX` (an hour) with exit 5; the round loop waits for the dispatcher the same way, bounded by `LOCK_WAIT_MAX`, exit 5. `scripts/check-locks.sh --mutate`: free, live holder, dead holder, unsigned new, unsigned old, absent — 4 of 4 mutations caught; `check-rounds.sh` adds a dead dispatcher's lock (ignored) and a live one (exit 5), and the mutations restoring the old bare-directory wait and the unbounded wait are caught.

**No lock carries a PID or is ever checked for staleness, so a reaped runner leaves chain-plan waiting silently forever and run-plan spinning silently**

*Evidence:* wt-break.sh:131-137 takes /tmp/claude-0/wt$LANE.lock with mkdir and releases it only in an EXIT trap. run-plan.sh:35-39 does the same for run-plan.lock. git grep '\.lock' in scripts/e2e-lanes finds no code that removes or ages a lock, and no PID is stored in either one. chain-plan.sh:35 does `while [ -d /tmp/claude-0/run-plan.lock ]; do sleep 30; done` without logging. run-plan.sh:62 skips a locked lane on every pass, and when every lane in $LANES is locked, `running` stays 0 while `next` is less than the number of work items, so the loop at :49-85 sleeps 20s forever and logs nothing after 'PLAN:'. sweep-until-clean.sh:5-11 itself records that processes here get reaped mid-round, and a SIGKILL skips the EXIT trap. No lock exists today (ls /tmp/claude-0/*.lock is empty), so this is PLAUSIBLE and latent, not observed.

*To close:* Write $$ into each lock dir, and on contention check `kill -0` on the recorded PID. If the holder is gone, log 'stale lock from PID N, taking it' and take it. In chain-plan.sh:35 and run-plan.sh:62, log once when waiting starts and give up with a distinct exit after a bound.

### `harness/sweep-drain-run-stale-tmp-copies` — **closed**

**sweep.sh and drain.sh still run uncommitted /tmp copies of verify.sh and wt-break.sh**

*Closed:* `sweep.sh` runs the repo's `verify.sh`, from a shared queue with one worker per lane, records each suite's status and exits non-zero when any did not pass; `batch.sh` is a wrapper over it; `drain.sh` is deleted (run-plan.sh supersedes it) and the resume doc's two mentions say so. Proven on lane 1: a sweep of `doc-boundaries` and a suite that does not exist reported "1 of 2 passed", named the failure, and exited 1.

*Evidence:* sweep.sh:14 runs `bash /tmp/claude-0/verify.sh`. batch.sh:6-8 records exactly this defect as fixed ('a committed script whose only action was to invoke something no checkout has'). The /tmp copy exists (4005 bytes, 21 Sep 17:49), and diff against scripts/e2e-lanes/verify.sh shows it lacks the API-staleness refusal (exit 7, repo :88-139). drain.sh:15 and :34 run /tmp/claude-0/wt-break.sh (293 diff lines against the repo copy) over /tmp/claude-0/breaks, which holds 614 patches against 833 in test/e2e/breaks. drain.sh:17-26 also hardcodes an 8-suite QUEUE. Neither script is called by any other script. fleet-up.sh:19 still cites sweep.sh's lane-list shape, and docs/video2-resume.md:185-187 and :284-288 present drain.sh as current tooling.

*To close:* Delete sweep.sh and drain.sh, since run-plan.sh and chain-plan.sh supersede them. Alternatively, repoint them at the repo scripts and at never-run-plan output. Then update fleet-up.sh:19 and resume §2 and §5.

### `harness/sweep-until-clean-drops-exit3-guard` — **closed**

**sweep-until-clean.sh counts a run-plan lock refusal (exit 3) as a round, then stops on 'no progress'**

*Closed:* one round loop, `scripts/e2e-lanes/rounds.sh`, sourced by both scripts — `sweep-until-clean.sh` is now "heal the fleet, then the same loop" (`before_round`). The loop carries chain-plan's exit-3 guard, builds its plan through `build-plan.sh` (the merge copy the two files each carried is gone with it), and ends with one set of codes for both: 0 nothing left, 2 no progress, 3 rounds used up, 4 planner failed (sweep-until-clean used 1 for two of those). `heal` also says when `fleet-up.sh`, which now exits 1 for a lane that stays down, could not bring one back. `scripts/check-rounds.sh --mutate` (preflight, verify job) drives the loop with a fake planner and dispatcher — empty, stuck, BUSY (3, then the same plan, then nothing: it must dispatch twice and end 0), a failed planner, endless — and 4 of 4 mutations are caught, the old sweep-until-clean shape first.

*Evidence:* sweep-until-clean.sh:95-96 runs run-plan.sh and only logs '($?)'. run-plan.sh:37-40 exits 3 when another dispatcher holds /tmp/claude-0/run-plan.lock. The next round's plan is then identical, so sweep-until-clean.sh:85-89 prints 'asked for exactly what round N-1 asked for — stopping rather than looping' and exits 1. chain-plan.sh:74-84 carries the guard ('EXIT 3 IS "SOMEBODY ELSE HAS THE LANES", not a round that happened'). It was added in e9a90d2 on 22 Sep at 07:13. sweep-until-clean.sh was written 12 hours later (593165c, 19:29) without the guard. The two files also carry byte-for-byte copies of the merge script (chain-plan.sh:44-56 and sweep-until-clean.sh:65-77). d840b55 deleted break-queue.sh for exactly this reason ('a lane refusal (exit 3) read as a set that ran').

*To close:* Keep one round loop. Make sweep-until-clean.sh call heal() and then chain-plan's loop, or move the loop and the merge into one sourced function that handles rc 3 the way chain-plan.sh:80-84 does.

### `harness/verify-scan-blind-to-dollar-filenames` — **closed**

*Closed (7b201d5):* both scans use `find … -newer <stamp> -print`, so no path is spliced into a shell string. Measured on lane 1: touching `apps/web/src/routes/app.$workspaceId.inbox.tsx` now refuses with exit 6 naming that file; the old pipeline over the same state printed nothing. mtimes restored afterwards, and a clean run went through (home-reminders 9/9).

**verify.sh's staleness scans pass each path through `sh -c '[ {} -nt … ]'`, so every source file with `$` in its name (77 web files, including the list/board/calendar/Gantt route) is invisible to the exit-6 refusal**

*Evidence:* verify.sh:75-77 runs `find … | xargs -r -I{} sh -c '[ {} -nt "$DIST/index.html" ] && echo {}'`, which substitutes the path unquoted into a shell string, so `$token` and `$workspaceId` expand to empty. `find apps/web/src packages/ui/src packages/feature-flags/src -name '*.ts' -o -name '*.tsx' -o -name '*.css' | grep -c '\$'` gives 77. `echo 'apps/web/src/routes/portal.$token.tsx' | xargs -I{} sh -c 'echo "[{}]"'` prints [apps/web/src/routes/portal..tsx]. I demonstrated it in scratchpad/harness-verify/dollar with a dist/index.html and, touched after it, 'src/app.$workspaceId.tsx' and src/plain.tsx. The verify.sh pipeline reports only src/plain.tsx. So an edit confined to app.$workspaceId.$spaceId.$projectId.$listId.tsx (the file log-tree.mjs:119-137 says 75 patches depend on) never triggers the refusal, and verify.sh measures a stale bundle. This is the same `$` defect log-tree.mjs already fixed for patchDeps. The API scan at :130-131 uses the same construct but has 0 `$` files today.

*To close:* Pass the path as an argument rather than splicing it into the script: `xargs -r -I{} sh -c '[ "$1" -nt "$2" ] && echo "$1"' _ {} "$DIST/index.html"`, or better `find … -newer "$DIST/index.html" -print | head -3`. Do the same for :130-131. Add a fixture (a `$`-named file) to whatever checks verify.sh, or move the scan into node as local-stack.mjs's refuseStaleBundle does.

### `harness/verify-sh-exit-masked` — **closed**

**verify.sh exits 0 when the suite fails or crashes, because its last command is `grep | sed | tail`**

*Closed:* `verify.sh` ends with `exit "$code"`. Proven through the sweep above: the missing suite's run exited 1, which `verify.sh` used to report as 0.

*Evidence:* scripts/e2e-lanes/verify.sh:146-149 captures `code=$?`, echoes 'exit=$code', and ends with `grep -E 'passed,|FAIL' "$OUT" | sed ... | tail -8`. There is no `exit $code` and no pipefail (the script uses only `set -u` at :44). Only the staleness refusals return non-zero: exit 6 at :84 and exit 7 at :137. batch.sh:17 and :31, and sweep.sh:14, never read verify's status either. batch.sh's own exit is sed's.

*To close:* End verify.sh with `exit "$code"` after the summary. Have batch.sh record each suite's status and exit non-zero if any suite failed.

### `harness/verify-staleness-scan-gaps` — **closed**

*Closed (7b201d5):* the API scan includes `packages/feature-flags/src` (measured: touching its `index.ts`, with the bundle made newer so the web check stays quiet, refuses with exit 7 naming it); a lane whose API process STARTED before the build stamp is refused with exit 7 (measured by touching the stamp: "the API on 3021 started at 17:02:20, before the build at 17:03:00"); the web scan includes `apps/web/index.html`, the Vite/Tailwind/PostCSS configs and `public/` (measured on `index.html`, exit 6). `build-api.sh`'s comment now says the running API reads the schema from source when it starts, and the README tabulates exits 6, 7 and 8.

**verify.sh's API staleness scan misses packages/feature-flags and never asks whether the lane was restarted; the web scan misses the non-src inputs**

*Evidence:* API: verify.sh:130 scans only apps/api/src and packages/db/src. apps/api/tsconfig.json paths map @rundesk/feature-flags to ../../packages/feature-flags/src/index.ts, and 13 compiled files require it. At runtime `require.resolve('@rundesk/feature-flags', {paths:[apps/api/dist/...]})` resolves to /home/user/rundesk/packages/feature-flags/src/index.ts, and '@rundesk/db' to packages/db/src/index.ts. Both are loaded from SOURCE under tsx when the process starts, not from dist. So the question that matters is whether the lane PROCESS started after the source changed. verify.sh:127-139 only compares source against the build stamp, and build-api.sh:48-51 builds without restarting unless lanes are named. A build-only run therefore clears the refusal while every lane still serves the old process. build-api.sh:34-36 says 'a column added there is invisible to Drizzle until THIS build runs'. That is a stale reason: the running API reads the schema from source on restart, as e2e-lanes/README.md:52-54 itself says. Web: verify.sh:75-77 scans apps/web/src, packages/ui/src and packages/feature-flags/src. That covers every workspace package the bundle imports (@rundesk/ui 142 and @rundesk/feature-flags 14 imports; apps/web/src does not import @rundesk/db). It misses apps/web/index.html (the Vite entry and in tailwind.config.ts content), tailwind.config.ts, postcss.config.js, vite.config.ts and public/push-sw.js. README.md:44-47 documents exit 6 but not exit 7.

*To close:* Add packages/feature-flags/src to the API scan. Compare the build stamp against the lane API's start time, e.g. `ps -o lstart` of the PID listening on 302k, or a stamp fleet-restart and wt-break touch on launch, and refuse when the process predates the stamp. Add the apps/web root config files and index.html to the web scan. Correct build-api.sh:34-36 and README.

### `harness/wt-break-double-vite-build` — open, small

**wt-break.sh builds the web bundle twice on every restore**

*Evidence:* wt-break.sh:497 and :498 are identical `pnpm -C apps/web exec vite build > /dev/null 2>&1` lines. git blame shows :497 came from f449365, which added the explanatory comment block (:488-496) above the pre-existing :498 from 95b4d67 without removing it. Every set pays one extra vite build.

*To close:* Delete one of the two lines.

### `harness/wt-break-unchecked-restart-and-restore` — open, small

**wt-break.sh ignores restart failures and the restore/sync build and push steps**

*Evidence:* restart() returns 1 when the lane API never answers health (wt-break.sh:121-125). Its return value is ignored at :431, before each API patch's suite run, and also at :261 and :499. A lane that failed to come up for environmental reasons (for example 'too many clients', verify.sh:20-22) then runs the suite against a dead port. Every check fails, and check-break-reddened.mjs:473-479 credits the claim as REDDENED. The sync-block schema push at :243-245 is unchecked, while the per-patch push at :411-415 is checked. The restore steps at :484-487 (push, API tsc) are unchecked, which leaves the lane on the last patch's binary if tsc dies. A same-sha next set then skips the sync block at :236, so nothing rebuilds the API before its baseline.

*To close:* `restart || { echo "== $b API DID NOT COME UP" >> "$OUT"; continue; }`, and add that suffix to the non-measurement list in measuredAt. Check the sync push and the restore tsc, and on failure refuse with exit 4 the way the builds do.

### `found-23-sep/doc-import-never-exits` — **closed**

**`doc-import.mjs` finished its checks and then hung until `timeout` killed it at 900s**

*Evidence:* its teardown called `stack.stop?.()`, and the local stack has no `stop`, only `close` — an optional call on nothing. A handle dump after the run showed the static server and two keep-alive sockets still open. Every run printed "15 passed, 0 failed" and exited 124.

*Closed (da2b4d4):* `stack.close()`. The suite now exits 0 in about four seconds.

### `found-23-sep/lane-stubs-never-restart` — **closed**

**A lane kept serving its stub from before a change: the launchers left any running stub alone**

*Evidence:* after the store stub gained its request log, lane 1's stub answered `/__control/requests` with NoSuchBucket — it was the old process.

*Closed (7e12844):* both stubs report a hash of their own source at `/__control/version`; `lane_store_up` and `lane_model_up` restart a stub whose hash differs from the file on disk. Proven live on lane 1; `check-s3-stub` and `check-model-stub` each carry the case and a mutation that reddens it.

### `found-23-sep/fleet-up-never-stopped-the-old-api` — **closed** (found closing `fleet-scripts-exit-zero-when-down`)

**`fleet-up.sh` stopped a lane's API with a pattern that matches nothing, so the old API went on serving the "fresh" lane**

*Evidence:* it ran `pkill -f "PORTMARK=$k "`. PORTMARK is an environment variable and in no command line — `wt-break.sh` found exactly this in its own restart and fixed it there; the sibling in `fleet-up.sh` was never brought along. The old API kept the port, the new one could not bind, and the health loop reported the old process as the lane coming up: old code, on a database the script had just dropped and restored under it.

*Closed:* `lane_api_down "$PORT"` — the shared stop-and-wait above — in place of the pkill. The third mutation in `check-lane-api-down.sh` is this exact kill, and it is caught.

### `found-23-sep/fleet-restart-counted-refused-lanes-up` — **closed** (found closing `fleet-scripts-exit-zero-when-down`)

**A lane `fleet-restart.sh` refused to restart was still counted UP — on the old build**

*Evidence:* the refusals (database missing, schema behind the newest migration) `continue` before the kill, so the old API is still listening; the final loop then polled every lane, found it answering, and printed `lane k: UP` for a lane this run had refused to put on the new build. With every lane refused, the script still reported them all up.

*Closed:* refused lanes are recorded and reported `NOT RESTARTED (above)` without being polled or counted — measured on lane 9 (behind), which exits 1.

### `found-23-sep/refuses-all-patches-never-built` — **closed** (found in today's break plan)

**Five "refuses everything" patches never compiled, in either of their runs**

*Evidence:* `tb-23`, `sdp-22`, `db-11`, `db-12` and `okb-16` each replaced a guard with an unconditional `throw` or `return`. TypeScript drops every narrowing in unreachable code, so a later `eq(…, actorId)` or `cursor` failed the build (reproduced one by one in a scratch worktree), and each ran as BUILD FAILED — no evidence — twice. Their suites' ledger rows still read as though every patch had reddened.

*Closed:* each condition is now one that is always true at runtime and not provable to the compiler (`if (actorId) throw …` after the `!actorId` return; `if (parentDocId) …`; `if (storageKey) {`), with the reason in the patch header; all five type-check clean. Measured: `tb-23` ran all 45 checks (6 red), `sdp-22` 36 (4), `db-11` 17 (1), `db-12` 17 (3), `okb-16` 15 (1) — each reddening the check it names (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `found-23-sep/fixtures-built-through-the-route-under-test` — **closed**

**Three patches were unreadable because the suite built its fixtures through the very route the patch broke**

*Evidence:* `tb-30` (assignment refuses all) and `tb-37` (dependencies refuse all) broke `task-boundaries`' SETUP, which assigned T2 and made the B dependency through those routes — 1 of 45 checks ran. `sdp-7` (admins narrowed) broke `space-default-permission`'s placement section, whose admin made a project straight into the view-only space — 27 of 36 ran. `check-plan-population` listed all three as needing a person.

*Closed:* the two task rows are inserted by SQL — the rows the routes write, and the shape the suite's own put-back already uses — with the reason at the site; the view-only project is made inside `withEditable`, as that suite's lists already were. Measured: `tb-30` ran all 45 checks (2 red, its own), `tb-37` 45 (4), `sdp-7` 36 (1) — none short (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `found-23-sep/role-editor-offers-unenforced-permissions` — open, large (found reading the custom-role item)

**Seventeen of the 26 permissions the role editor offers are checked nowhere: granting one changes nothing**

*Evidence:* `permission-catalog.ts` lists 26 permissions and `roles-tab.tsx:154` offers every one of them from `/roles/catalog`. The server checks a permission in two ways — `@RequirePermissions` through `PermissionsGuard`, and `CustomRolesService.hasPermission`, which nothing outside `custom-roles` calls — and 9 keys appear in either (space.create, project.create, template.manage, webhook.manage, integrations.manage, integrations.access_requests.manage, sso.manage, workspace.billing, report.view.basic; two of them also in services). The other 17 appear nowhere outside the catalog: workspace.manage, workspace.delete, workspace.audit.view, members.invite, members.remove, members.role.change, roles.manage, security.policy.manage, space.delete, project.delete, list.delete, task.delete.any, doc.publish, doc.delete.any, automation.manage, report.export, time.approval.manage. What actually gates those actions is a role: 90 uses of `WorkspaceAdminGuard`/`@Roles`, and inline lists such as `invitations.controller.ts:40` (`['workspace_admin', 'manager']` for members.invite), `time-entries.service.ts:163` (approvals), `tasks.service.ts:658,764,2141,5114`, and `spaces.service.ts:520` (`adminOnlyDelete: true`, "space.delete not in MANAGER_DELTA"). So a custom role granting a member `space.delete`, `members.invite` or `time.approval.manage` is saved, shown and ignored — the facade class, in the permission system itself. Under-granting only: no role can gain more than its base role this way.

*To close:* make each permission the real gate for the actions it names — replace the role test at each site with `hasPermission(workspace, user, key)`, which by construction gives every base role exactly what it has today (the cascade) and honours custom grants; or take the key out of the editor until it is. Research ClickUp's custom-role permission list for the names and scope. A suite per group, each check paired: the base role unchanged, a member with the grant allowed, without it refused.

### `found-23-sep/bail-returns-and-the-checker-runs-on` — **closed** (found closing `process-exit-remaining`)

**`bail()` returned whenever output was queued — i.e. whenever piped — and eleven checkers ran on past their own refusal**

*Evidence:* with nothing queued it exits at once; with output still queued it scheduled the exit and RETURNED. Measured: a script that printed 200KB and called `bail(3)` mid-file printed the line after the call when piped (`| (sleep 1; cat)`) and not when redirected to a file. CI's output is piped. Every mid-file stop — eleven checkers, twenty calls — was exposed; `check-migration-order`'s `fail` then went on to dereference the filename it had just refused, and could end on "Validated …".

*Closed:* `bail` returns a promise that never settles and every call site is `await bail(…)`, so execution stops there until the exit; the backstop timer is no longer unref'd (a parked caller must not end as an unsettled top-level await, exit 13). `check-migration-order`'s helper is async and awaited at each of its nine call sites. `scripts/check-bail.mjs --mutate` (preflight, verify job): piped with 200KB queued, redirected, and idle — exit 3, every byte delivered, the line after never runs — and 3 of 3 mutations caught (returns instead of parking, exits without draining, forgets the code).

### `found-23-sep/webhook-secrets-readable-by-any-member` — **closed** (found mapping the custom-role routes)

**Any workspace member could read every webhook's target URL and HMAC signing secret, and every delivery's payload**

*Evidence:* `GET /workspaces/:ws/webhooks` and `GET …/webhooks/:id/deliveries` were guarded by workspace membership alone, and the list returned `select()` of the table — `secret` included. Measured on lane 1 before the change: a plain member was answered 200 with the secret the admin had set, and 200 on the delivery log. The manage routes had the opposite problem: an admin-or-manager guard in front of `webhook.manage`, so a custom role granting it to anybody else was saved and useless. The same shape stood in front of `sso.manage` and `integrations.manage`, and SCIM token management had the admin-or-manager guard and NO permission, so every manager held it though the catalog files SCIM under `sso.manage`.

*Closed:* both reads require `webhook.manage`; the list and an edit answer without the secret (`hasSecret` instead) — it is returned once, by the call that creates the webhook; the manage routes are gated by the permission alone. SSO configuration and integration connections lose the guard in front of their permission, and SCIM tokens require `sso.manage`. Hiding the secret moved a duty onto the pages: both pages that make webhooks (workspace settings → Integrations, and `/app/admin/webhooks`) threw the create answer away, so a webhook made in the browser signed with a secret nobody could read. Both now show it once (`WebhookSecretOnce`: copy, the signature header it keys, "I have copied it"). Found on the same card and fixed with it: the list said "No webhooks configured yet" while loading and after failing (now a skeleton, and "Could not load webhooks."); the settings form offered its own ten event ids, raw and four short of the server's fourteen, while the admin page lacked a name for `member.joined` — both now read the server's catalog through one label map (`lib/webhook-events.ts`). Measured on lane 1: `webhook-access` 15/15 (its API half failed 5 of 8 on the old API; the browser half compares the secret shown with the one STORED, and holds and fails the list by route, with the service worker blocked — see `found-23-sep/routes-bypassed-by-the-service-worker`), `permission-guards` 8/8 (6 of 8 failed on the old API). Regression on lane 1, 8/8: app-catalogue, calendar-accounts, integration-error-card, settings-depth, ui-sweep, addressability-live and the two. Break patches: `whk-1..19` (API 1–9, pages 10–19) 19 of 19 reddened; `pgd-1..8` 7 of 8 — `pgd-5`'s run died in setup on the sign-up throttle (`found-23-sep/signup-throttle-killed-a-break-run`) and is re-run in plan-4 (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

*Still open, and its own item:* the web cannot use a custom grant here — settings is admin-only in the router — which is `product-siblings/custom-role-permissions-unread-by-web`.

### `found-23-sep/service-worker-keeps-api-answers` — **closed**, break run pending (found when a route in `webhook-access` never fired)

**The service worker stored every authenticated API answer for a day, keyed by URL alone, and nothing deleted them at sign-out**

*Evidence:* `vite.config.ts`'s workbox `runtimeCaching` sent every `GET /api/v1/*` through `NetworkFirst` into the `rundesk-api` cache (`maxAgeSeconds` one day, `networkTimeoutSeconds: 5`). Measured on lane 1 with a real browser: after signing in as the super admin, `rundesk-api` held `/api/v1/users/me` (with the email), `/ops/metrics`, `/ops/tenant-databases`, `/ops/organizations` and the organisation's workspaces; after the session was cleared it held 11 answers, all still there. The only `caches.delete` in `apps/web/src` was the chunk-reload recovery. So on a shared machine the next person's slow request (over five seconds) or offline request was answered with the previous person's data, and the answers sat on disk for anyone with the profile.

*Closed:* the API rule is gone — an authenticated answer is not a static asset, and "offline reads of recently viewed data" was never measured or asked for; `lib/api-cache.ts` deletes `rundesk-api` at start-up (a worker installed before the change keeps writing there until the new one takes over) and in the auth store's `clear()`, the one path every sign-out and every auth failure takes. `sw-api-cache` runs WITH the worker (the one browser suite that must): the worker controls the page and keeps the app's files — the pairing that makes "no API answer cached" mean something — no API answer in any cache after reading home and the profile, a planted leftover gone after a restart, and one written after start-up gone at sign-out from both the console and the topbar. 5/5 on lane 1; against the old code 1 of 5 (the pairing), the other four naming the defect — 11 API answers cached, the leftover kept, the console session alive, the menu off-screen. `swc-1..7`, each compiled. Two defects found under it, below.

### `found-23-sep/console-sign-out-leaves-the-session` — **closed** (found writing `sw-api-cache`)

**"Sign out" in the super-admin console left a cookie session alive**

*Evidence:* two copies of sign-out. The topbar's always calls `/auth/logout` — "it clears the httpOnly cookies and revokes the refresh session. Cookie sessions have no stored refreshToken" — and the console's (`app.admin.tsx`) called it only `if (refreshToken)`, which a cookie session never has. Measured: after the console's Sign out no logout request was made, and `/auth/refresh` with the cookies left behind (and the CSRF header the app sends) answered 200 — a new session; after the topbar's, 401.

*Closed:* one `signOut()` (`lib/sign-out.ts`) — the endpoint always, then `clear()` — used by both; checked in `sw-api-cache` (refresh answers 401 after each).

### `found-23-sep/dropdowns-taller-than-the-window` — **closed** (found writing `sw-api-cache`)

**A dropdown as tall as its content ran off the window — the user menu's Sign out was out of reach at 1440×900**

*Evidence:* `DropdownMenuContent` (packages/ui) had `overflow-hidden` and no max height. Measured in a 1440×900 window with a fresh account: the user menu spanned 52–951px, `overflow-y: hidden`, `max-height: none`, and "Sign out" sat at 914–946px — below the window, where a click cannot reach it and Playwright could not scroll it into view.

*Closed:* both the content and the sub-content are capped at Radix's `--radix-dropdown-menu-content-available-height` and scroll (`overflow-y-auto`), so every menu fits the space on its side; the topbar check in `sw-api-cache` asserts the menu's bottom is inside the window before it signs out. Every dropdown in the app uses this component, so the suites that drive menus were re-run on lane 1, 16/16: comment-plus-menu, person-panel, planner-priorities, settings-depth, video1-fast-items, ai-activity-filters, ai-model-picker, create-menu-ai, space-create-menu, task-menu, task-menu-favorite-archive, task-delete, task-field-create, template-center, list-under-space and sw-api-cache.

### `found-23-sep/routes-bypassed-by-the-service-worker` — open, medium (test tooling; found with the item above)

**A page route never sees a request the service worker answers, so a suite that holds or fails an API call by route can be looking at an answer that already arrived**

*Evidence:* Playwright's `page.route` is not consulted for requests the service worker intercepts, and the app's worker intercepts every API GET. `webhook-access`'s first run: the route predicate was never called (`held false`), and both loading checks looked at a list that had answered. Twenty suites passed `serviceWorkers: 'block'` before `webhook-access` (21 now, counted with `grep -l serviceWorkers test/e2e/*.mjs`); four route requests without it — `chat-history` (the held first page), `clip-created-card` (3 routes), `create-menu-ai` and `ui-sweep` — and whether their routes fire depends on whether the worker has claimed the page yet.

*To close:* `serviceWorkers: 'block'` in each of the four, and every hold asserts that it held (a flag set in the handler, as `webhook-access` does), so a route that never fires fails its check instead of passing it. A rule in the suite checkers: a `.route(` in a file whose contexts do not block service workers.

*Progress:* `clip-created-card` blocks the worker now (with `clip-create-task-persists-24h-url`), and its handlers catch their own errors. It holds nothing. Its routes stand in for presign and share, and its checks count them, so a route that never fired would fail them rather than pass. `chat-history` too, found when its run died on "route.continue: Route is already handled!": the held first page's handler did not catch, and the route was taken down straight after the release, so Playwright settled the request first. It blocks the worker, its handler catches, the check requires that the hold fired, and the route comes down once the rows are in (18/18 in the chat sweep). Two to go: `create-menu-ai`, `ui-sweep`.

### `found-23-sep/secret-and-credential-reads` — partly-fixed, low now (from a read-only sweep of every credential column, each measured before it was fixed; only admin-side invitation tokens remain)

**Read routes handed credentials to people who should not have them, and an invitation could grant another organisation's workspace**

*Evidence, measured on lane 1 before the change:* (1) `GET /tasks/:taskId/activity` embedded `with: { actor: true }` — a plain member read the admin's whole `users` row: `passwordHash`, `failedLoginAttempts`, `lockedUntil`, `notificationPreferences` and 30 more columns. (2) `GET /lists/:listId/inbound-webhooks` gave a member and a guest the admin's hook token — the only credential for the unauthenticated `POST /inbound/webhook/:token`, which creates tasks as the hook's creator — and a member could delete the admin's hook. (3) `GET /tasks/:taskId/email-address` answered somebody from another organisation 200 with the list's secret inbound address. (4) With `blockPublicSharing` on, a member still made a client portal (201) whose anonymous `/portal/:token` view answered 200, and a guest listed portal tokens. (5) `customDomainToken` reached a member and a guest through `GET /workspaces/:id`, `GET /workspaces` and the sign-in answer. And invitations: the owner of a just-signed-up organisation wrote an invitation (201, token in the answer) naming ANOTHER organisation's workspace as `workspace_admin`; invitations could grant `super_admin` as a workspace role and `owner` of an organisation; a manager could invite a workspace admin; claiming inserted whatever the row named. `update`/`remove` on portals DO re-check membership in the service — the sweep's "no guard at all" overstated that one.

*Closed (1, 3, 5 and invitations):* activity embeds `PUBLIC_USER_WITH` (the only whole-row user embed left — grepped); the email address sits behind `ResourceMemberGuard`; workspaces reach members through `withoutDomainToken` in both lists (so the sign-in answer too), and `GET /workspaces/:id` keeps the token only for `isManagerRole` (`common/permissions/item-visibility.ts` — the roles `WorkspaceAdminGuard` admits; a `WORKSPACE_ADMIN_ROLES` copy made here for a day was folded back into it), which the settings page's DNS record still shows (screenshot). Invitations: `checkedMemberships` refuses a workspace outside the organisation, a role an invitation cannot grant (`INVITE_WORKSPACE_ROLES`, no `super_admin`) and a workspace named twice, before anything is written or sent; `INVITE_ORG_ROLES` has no `owner`; a manager may not invite a workspace admin; and `grantableAtClaim` holds rows written before the rules to them at claim time — foreign grants dropped, `owner` joins as member, `member.joined` fired only for what was granted. `credential-reads` 11/11 on lane 1; 3 passed and 8 failed against the old API, the 3 being the paired grants. 18 patches `crd-1..18`, each compiled against the fix; break run pending. Regression on lane 1, 13/13: activity-rail, ai-activity-filters, ai-value, assignee-picker, gantt-controls, no-dead-ends, task-activity-filter, task-boundaries, task-menu, task-merge, settings-depth, person-panel, credential-reads. API unit tests for tasks, workspaces and both guards 248/248.

*Closed (2 and 4):* a hook's token goes to its creator and to `isManagerRole` — the one list, now also used by `WorkspaceAdminGuard` and `container-access.guard-helper`, which had kept their own copies — and every other hook is still LISTED, by name, with `canManage`; guests may not add a hook; only the creator or a manager deletes one; and `receive` stops when the creator is no longer a member who can see the list (a hook no longer outlives the person it acts as). The list panel lists somebody else's hook by name with "Only its creator and workspace admins see its address.", shows no delete it would be refused, offers guests no "New webhook", and says so when the list fails instead of "no webhooks". Portals: guests are refused all portal management; `create` refuses under `blockPublicSharing` with the docs' own wording, while an existing portal can still be switched off (the setting's own words: "Existing links can still be revoked"); the project page disables the form under the switch and says why, hides the section from guests, and shows a failed list as failed. `hook-portal-access` 11/11 on lane 1 (8 API, 3 on screen); against the old code 0 of 11. `hpa-1..19`, each compiled. *Plan-4 found two of them unreadable:* `hpa-2` (nobody may add a hook) and `hpa-12` (a portal refused whatever the switch says) broke the suite's own fixtures, which were the admin's hook and the member's first portal, made through the routes those patches break. Both runs died making the fixture, before the check each patch names ("the admin could not make a hook: 403", 1 of 11 checks). That is `fixtures-built-through-the-route-under-test` again, in a suite I wrote after it was closed. Both fixtures are written by SQL now, with tokens minted as the services mint them. Regression on lane 1: credential-reads, doc-boundaries, space-features, task-boundaries, task-menu, settings-depth 7/7 with the new suite, custom-field-progress 58/58; unit tests for portals, hooks, guards and workspaces 114/114.

*Closed (federated search):* a connection is one person's Google or Microsoft account, and every member's query ran through it — the connector's mail subjects, senders and snippets, Drive files and SharePoint documents, for anybody in the workspace, guests included. Measured on lane 1 before the change: a member's `/search/sources` reported the admin's Gmail as connected for them. The frame is somebody searching "meri Gmail" — MY Gmail. Now `federatedCredential` and `searchDrive` answer only `connectedById` (which the OAuth callback records), and `listSources` tells each person whose it is (`heldBy`: you / someone-else / none), so the palette says "Connected with someone else's account — its mail and files are searched only for them" rather than promising results, and offers Connect only to admins — for a member it opened settings that sent them back. The query side is proven by unit tests (nothing in a test environment reaches Google): 48/48, three new, each reddened by `fsr-1..3` through `check-unit-claims` (9/9). `search-sources` 10/10 with three new checks, which failed 3 of 3 on the old code; `search-sources-5..7`. `app-catalogue` staged its grants with no connector — a row naming nobody is now connected for nobody — and stages them as the admin's, as the callback would; `search-sources-1/2` and `app-catalogue-5/6/7` re-anchored to the new `listSources`. Regression: app-catalogue, search-sources, command-palette, video1-acceptance 4/4. *Not built:* each member connecting their OWN account (ClickUp's per-person connected search) — today a second member connecting Google replaces the first's connection; that is a feature, listed with the unbuilt ones.

*Still open:* invitation tokens still come back to org admins in the list and create answers (low — the same admins can fetch the link); whether an existing portal's link should die when sharing is blocked is a ClickUp question (today's setting text says existing links stay revocable, and portals now match it).

### `found-23-sep/break-patch-check-died-on-an-exit` — **closed** (found closing the credential item)

**`check-break-patches.py` stopped at the first patch that called `sys.exit`, and reported nothing else**

*Evidence:* six older patches end `sys.exit('anchor %d times' % n)` rather than the assert, and `SystemExit` is not an `Exception`, so it escaped `except Exception` and ended the checker: the whole output was "anchor 0 times" and exit 1 — no patch named, no count. `lwb-1-noorder` had lost its anchor to `findByMember`'s new `return rows.map(`.

*Closed:* the checker reads an exit as the patch's verdict, the same way as the assert — named, counted, `ANCHOR GONE`; a probe patch that exits is now reported by name, where the previous checker printed only its message. `lwb-1-noorder` is re-anchored to the new shape with the same break (no ORDER BY), and says why. 1042/1042 apply.

### `found-23-sep/unit-claims-moved-mtimes` — **closed** (found when lane 1 was refused as stale after a preflight)

**Every preflight made every lane look stale: `check-unit-claims` wrote six unchanged files back and moved their mtimes**

*Evidence:* `verify.sh` refused lane 1 — "dist-1 is older than the source it is built from … person-panel.tsx" — with `git status` clean for that file. Six files had mtimes in one 10-second window, 18:55:44–53: `person-panel.tsx`, `ai-cost.ts`, `ai-containers.ts`, `knowledge-indexer.service.ts`, `task-object-keys.ts`, `planner.service.ts` — exactly the files the six unit-claim patches edit. The checker applies each patch for real, runs the unit test, and writes the bytes back; `verify.sh` judges staleness by mtime.

*Closed:* the bytes AND the times go back — `utimesSync` with the fractional milliseconds (`mtimeMs / 1000`; a `Date` rounded .570933974 UP to .571). Measured: the six mtimes drift at most one microsecond, older, across a run; 6/6 unit claims still redden.

### `found-23-sep/admin-grant-taken-and-not-put-back` — **closed** (found in plan-2)

**`space-default-permission` removed the admin's space grant for one check and never restored it, so `sdp-7` ended the run one section on**

*Evidence:* to test "a workspace admin is not narrowed … with no explicit grant", the suite deletes the admin's seeded `space_members` row on the view-only space. It stayed deleted; the placement section's `withEditable` then leaned on the admin's ROLE alone, which is exactly what `sdp-7` takes away — "could not raise …: 403", 27 of 36 checks ran, even after that section's own project was moved inside `withEditable`.

*Closed:* the grant is put back straight after the check, and a failure to put it back stops the run by name. Measured: `sdp-7` now runs all 36 checks (1 red, its own); `space-default-permission`'s 22 patches 22 of 22 reddened (plan-4 re-measures every one after 5b12a78 changed the shared test libraries).

### `found-23-sep/break-guard-floor-counted-build-output` — **closed** (found by preflight)

**`check-no-break-patches` refused a clean tree: its file floor had been measured on a tree that still held a bundle**

*Evidence:* preflight's first step failed with "the scan read 1311 file(s), below the floor of 2000", and its case file's "run from outside the repository" case with it. The floor came from "Measured 22 September: 2,526 files" — but the walk pruned `dist` by exact name, so that count took in about 1,200 files of the tracked `apps/web/dist-brk` bundle, which 491e1dc deleted. The version before today's `bail` change reads the same 1,311, so the edit did not cause it. And the case file kept its own copy of the number (2000), so re-measuring one would have left the other failing.

*Closed:* re-measured — 884 files in apps, 293 in packages, 134 in test — and the floor is 1,000; `dist-*` is pruned with `dist`, because a bundle is not the tree and one built from a patched tree would be a hit no source file holds; the case reads the guard's floor from its source. `check-no-break-patches` reads 1,311 from the repository and from `/tmp`; `check-patch-guard --mutate` 14/14 cases, 7/7 mutations.

### `found-23-sep/views-role-list-named-no-real-roles` — **closed**, break run pending (found folding the admin-role copies into one)

**A protected view could be changed by a manager and not by a workspace admin: its role list named `owner` and `admin`, which no workspace member is**

*Evidence:* `views.service.ts` kept `MANAGER_ROLES = new Set(['owner', 'admin', 'manager'])` — "Mirrors `item-visibility.ts`", which says `workspace_admin`, `manager`, `super_admin` — and compared it with `workspace_members.role`. Measured on lane 1: renaming a member's protected view answered 403 for a workspace admin (not a super admin) and 200 for a manager. The comment's own rule is "protected: its creator and the workspace's managers". A member's PRIVATE view answered 404 to both, which is right: `loadVisible` hides it before any role is asked.

*Closed:* `isManagerRole`, the one list. `view-visibility` 23/23 with two new checks in a workspace of its own — an admin and a manager may both change a member's protected view; neither may touch the member's private view — the first of which failed on the old API (403 against the manager's 200). `view-visibility-5` (the old list) and `-6` (the lookup that hides a private view). Regression: list-save-view, read-visibility, view-visibility 3/3.

### `found-23-sep/role-lists-copied-per-module` — open, small (found closing the views role list)

**The manager-role list is kept in four more places, and the assignable workspace roles in two**

*Evidence:* `item-visibility.ts` exports `WS_MANAGER_ROLES`/`isManagerRole`; the same three roles are also `WS_MANAGE_ROLES` (`container-members.service.ts:15`) and `WS_STAFF_ROLES` (`support.service.ts:46`) — identical today, which is how `views.service.ts`'s copy drifted into naming roles that do not exist before anybody noticed. `workspaces.service.ts:837` `ASSIGNABLE_ROLES` and `invitations.service.ts` `INVITE_WORKSPACE_ROLES` are one list twice. `container-access.ts:8` `ADMIN_ROLES` (admins only) is a different set and stays.

*To close:* import the one list at each site (no behaviour changes, so: type-check, the modules' unit tests, and a sweep of the suites that exercise each module), and a checker that fails on a new array literal of workspace role names outside `common/permissions`.

### `found-23-sep/signup-throttle-killed-a-break-run` — **closed** (found reading plan-3's logs)

**A break run died in setup on the sign-up rate limit, and measured nothing**

*Evidence:* `brk-pgd-5-scim-mints-nothing.log`: "threw: signup of manager failed: 429", 1 of 8 checks ran. `/auth/signup` allows 10 a minute per IP and every suite is 127.0.0.1; a break plan replays a people-making suite once per patch. The local-stack proxy already waited out a throttled LOGIN (and `signInApi` did so for direct calls), but not a sign-up — 18 suites sign people up. 1 of the 1,170 break logs on this machine died this way; it is the newest suites, making three or four people each, that hit it.

*Closed:* the proxy's retry covers the sign-up POST on the same budget (a 429 is refused before the handler, so a retry makes no second account), and `signUpApi` in `signin.mjs` does the same for the two suites that sign up against the API directly (`search-sources`, `view-visibility`). Measured through the proxy: twelve sign-ups in a burst — 12 × 201 after waiting 48 seconds for the window, where the old proxy handed back 429 to the last four. search-sources, view-visibility, credential-reads, permission-guards 4/4. `pgd-5` is re-run in the next plan.

### `found-23-sep/avatar-and-logo-accept-any-url` — **closed** (security, small; found closing the expiring-avatar item)

**`avatarUrl` and `logoUrl` are saved as whatever string arrives**

*Evidence:* `PATCH /users/me` takes `avatarUrl?: string | null` with no validation (users.controller.ts:24, an inline type, no DTO), and `PATCH /workspaces/:id` the same for `logoUrl`. So a picture can point at any host — every viewer's browser then asks that host for it, handing over the viewer's address and when they looked — or at a string that is no image at all.

*To close:* accept only our own `/api/v1/public/images/…` address and the OAuth providers' avatar hosts (whatever the sign-in flows store), refuse the rest with a 400 in the service, and a suite pairing a refused foreign URL with an accepted upload. Research what ClickUp allows (it takes uploads only).

*Closed:* a picture is one we store, or none. `isPublicImagePath` (`public-images.controller.ts`, beside `publicImagePath`) accepts an upload's own address, one safe key segment under `avatars/` or `workspace-logos/`, so no `..` walks to another object. The sign-in provider writes its picture directly, not through the profile save. A save that sends back the picture already saved keeps it, so a profile form's round trip is not refused, and anything else is a 400. The settings page's logo is an upload with a Remove button; its address box, placeholder "https://…/logo.png", invited what the save now refuses. `settings-writes`: 0 of 4 before on lane 1, 5/5 after. Its checks: the admin's save; a logo at another host refused and not saved, beside the workspace's own upload; a profile picture the same, and none removing it; a provider's picture sent back kept, and a `..` walk refused; and the page offering the logo as an upload only. The page check was added after the first measurement; `stw-6` restores the box it guards. `stw-2..6`, each compiled, 5 of 5 reddened on lane 2. Regression: the sweep above. In CI.

### `found-23-sep/checks-read-textContent-not-what-is-shown` — open, medium (found by `hr-9` reddening nothing)

**A check that reads `textContent` cannot tell a shown message from a hidden one**

*Evidence:* `hr-9` wraps Home's reminders empty state in `<div hidden>` — a blank panel to anybody looking — and `home-reminders` stayed green, because `textContent` includes hidden elements and still read "No reminders waiting". Fixed in that suite (`innerText`, which is what is rendered). The same read appears in 16 suites (`grep -l 'textContent(' test/e2e/*.mjs`, 23 September), and every one that asserts a sentence is SHOWN has the same blind spot to a patch that hides rather than removes.

*To close:* a section-enders-style rule — a check whose condition asserts text through `textContent` — with the fix `innerText` or an explicit visibility check; measure the count first, then convert.

### `found-23-sep/stale-chunk-recovery-writes-the-shared-tree` — **closed**

**`stale-chunk-recovery` edited two shared source files and rebuilt the shared `apps/web/dist` while other lanes were running**

*Evidence:* it appended a marker to `command-palette.tsx` and a lazy route, ran `vite build` in `apps/web`, and wrote the sources back. The content returned, the timestamps did not: the full sweep had 26 suites refused on lanes 2 and 4 as "bundle older than its source" after this suite ran on lane 3. A concurrent build would have baked the marker in; in CI the shared `dist` later steps serve was left as release B.

*Closed (cb13ddd):* the two releases are built in a throwaway copy of `apps/web` beside it (same depth, `node_modules` symlinked), removed afterwards. 27/27.

### `found-23-sep/schema-check-off-after-a-data-migration` — **closed** (a regression of mine, found rebuilding lane 1)

**Lane restarts stopped checking the schema once the newest migration added no column**

*Evidence:* `fleet-restart.sh` reads a column to look for out of the NEWEST migration file and skips the check, with a warning, when it finds none. `0161_public_image_urls.sql` (fdac6bd) is data-only: it rewrites saved image URLs. So from that commit on, every restart printed "could not read a column check out of 0161_public_image_urls.sql — schema NOT verified" and started the API anyway. That is the case the check exists to refuse, a database behind the code.

*Closed:* it walks back to the newest migration that adds a column (today 0160, `folders.description`) and checks that. The warning remains for a tree where no migration adds one. Lane 1 restarted with the check performed and no warning.

### `found-24-sep/killed-break-run-left-a-stale-lane` — **closed** (found when lane 3's baseline failed on fixed code)

**A break run killed mid-sync or mid-patch left its lane serving an old or a patched API, and every later run measured it**

*Evidence:* `wt-break.sh` synced and rebuilt only when the worktree's checkout differed from HEAD, and assumed the API serving the lane had been built from that checkout. Stopping plan-4 killed lane 3's runner after its checkout had moved to d083c3e and before the build and restart. The next run found the checkout at HEAD, skipped the sync, and ran `home-my-work`'s baseline against the old binary: 3 passed, 4 failed, on code that had been fixed and measured 7/7 on lane 1, and the whole set was refused. A run killed during a patch would have left the lane serving the PATCHED build, with the same result, or a baseline that passes on a broken binary.

*Closed:* `/tmp/claude-0/wtN.serving` holds the commit whose UNPATCHED build the lane is serving. It is written only after the sync's restart succeeds (a restart that fails now refuses the set) and after the final restore, and cleared before any patched restart. A missing or different stamp forces the sync. Found beside it: editing `wt-break.sh` while a run is executing it is itself a hazard, since bash reads a running script by byte offset, so the lane-2 run in progress was stopped and the main tree checked for patches (clean).

### `found-24-sep/lane-restart-left-the-break-stamp` — **closed** (found closing `workspace-reads-skip-the-container-rule`)

**A lane restarted onto the main tree's build kept the break runner's stamp, which went on saying the lane served its worktree's build**

*Evidence:* at 01:00 on 24 September `/tmp/claude-0/wt2.serving`, `wt3` and `wt4` all read `aa239bc`, while lanes 2 to 4 had been restarted at 00:39 by `build-api.sh "1 2 3 4"` onto the main tree's `dist`. (`fleet-restart.sh` starts every lane from `apps/api`.) They were restarted again the same way minutes later, with this item's uncommitted work in the build, and the stamps stayed. `wt-break.sh` skips its sync when the stamp matches HEAD, so a break run at the stamped commit would have measured its baseline against the main tree's build. That did not happen only because HEAD had moved on.

*Closed:* `lane_api_down` (lane-env.sh) is the one stop path of `fleet-up.sh` and `fleet-restart.sh`, and it now removes the lane's stamp first, whether or not anything was listening. `fleet-sync.sh` stops every API with `pkill`, so it removes every stamp. `wt-break.sh` stops its own API without that function and, as before, rewrites the stamp once its restart is up. `check-lane-api-down.sh` now requires the stamp to be gone after the polite, stubborn and empty cases, and it catches a mutation that keeps the stamp (4 of 4 mutations caught). The next `build-api.sh "1 2 3 4"` removed all three stale stamps.

### `found-24-sep/two-sweeps-share-one-record` — open, medium (found running the search regression)

**Two sweeps at once write one status file and one results file, and the second truncates the first's**

*Evidence:* `sweep.sh` writes `/tmp/claude-0/sweep-status.txt` and `sweep-results.txt`, fixed paths, and truncates both when it starts. With a sweep running on lane 1 (14 suites recorded passed), a second one started on lanes 3 and 4 for the last two suites emptied both files. The first sweep's end-of-run summary is computed from that status file, so it would report on a mixture. The results survived only because `verify.sh` keeps each suite's own log (`/tmp/claude-0/run-<suite>.log`). This is the same shape as `one-suite-two-lanes-share-a-results-file`, one level up.

*To close:* each sweep writes its own status and results (named by its pid), and the canonical paths become links to the newest, or the script refuses to start while a live sweep holds a lock. Add a self-check that runs two sweeps of stand-in suites at once and requires each summary to count only its own.

### `found-24-sep/killed-suite-left-a-second-web-package` — **closed** (found by preflight after a container restart)

**A `stale-chunk-recovery` run killed mid-build left a copy of apps/web inside `apps/`, and every lint and typecheck in the repo then refused to start**

*Evidence:* after the container restarted during a sweep, preflight's lint and typecheck both failed with turbo's `Failed to add workspace "@rundesk/web" from "apps/.web-release-17764-a/package.json", it already exists`. The suite builds each release from a copy beside apps/web (so the config's relative paths resolve), named `apps/.web-release-<pid>-<marker>`, and removes it in a `finally`. A SIGKILL skips `finally`; pid 17764 was gone. `pnpm-workspace.yaml`'s `apps/*` includes hidden directories as far as turbo is concerned. Reproduced with `turbo run typecheck --dry=json`: exit 1, that message.

*Closed:* `pnpm-workspace.yaml` leaves hidden directories under apps/ out (`!apps/.*`). The same dry run with the copy still present exits 0 and lists each package once. And the suite now removes, at its start, any such copy whose pid is no longer alive, saying so. The next run on lane 1 passed 27/27 and left `apps/` without the copy.

### `found-24-sep/one-suite-two-lanes-share-a-results-file` — **closed** (found planning the `wra-8..40` runs)

**Two break sets of the same suite on two lanes write, and truncate, one results file; neither the runner nor the dispatcher stops it**

*Evidence, read not run:* `wt-break.sh` locks the LANE (`/tmp/claude-0/wt<lane>.lock`), but its results go to `/tmp/claude-0/break-<suite>.txt`, one file per SUITE. It truncates that file once it holds the lane lock (`: > "$OUT"`), and archives it on exit. `run-plan.sh` removes that same file before launching each set, and hands the next plan line to any free lane without asking whether that suite is already running elsewhere. Its header describes this very accident (`ui-sweep` ran on lanes 2 and 3 into one file) and says a single dispatcher cannot race. That holds for one plan line; two lines for one suite still run at once. A set split across lanes by hand has the same problem, and the second set's truncation erases the first set's results mid-run. The generated plans put one line per suite, which is why it has not bitten. The `wra-8..40` runs were kept to one set on one lane for this reason.

*Closed:* `break_locks_take <lane> <suite>` (lane-env.sh) takes the lane lock, then a suite lock (`break-<suite>.lock`). It refuses with exit 3 and says which one was held; on a busy suite it gives the lane back. `wt-break.sh` takes the pair and drops both on exit. `run-plan.sh` no longer takes the next line: a free lane gets the first untaken line whose suite is neither running on another of its lanes (whose child may not have taken the lock yet) nor locked by another run. So a busy suite is passed over, not handed out and refused, which would burn the entry. The waiting message and the give-up count follow.

Held to that twice. `check-locks.sh` has three new cases for the pair (both free; busy lane, suite untouched; busy suite, lane given back and holder untouched) and two mutations: the lane lock alone, and the lane kept on refusal. That makes 6 of 6 mutations caught. The new `check-run-plan.sh` dispatches a five-line plan to a stand-in runner that takes the real locks and traces its hold: three sets of one suite, two others, and one suite held by another run for two seconds. It requires that no two sets of a suite overlap, that the others ran beside them, that the held suite waited, that nothing was refused and that the plan drained 5 of 5. Its three mutations are each caught for their own reason (a second set of the running suite refused; the held suite handed out and refused; plan order losing three sets). Both run in preflight and CI.

### `found-24-sep/model-patches-measured-without-a-model` — **closed** (test tooling; found judging the second drifted plan)

**Two patches that only a model can redden ran on lanes with none and read as reddening nothing, and the suite's no-model branch printed the model's sentence**

*Evidence (the second drifted plan's logs, read by `check-break-reddened`):* `wra-11` and `wra-12` each say in their header "Reddens only where a model answers". The plan ran on lanes 3 and 4, started without `RUNDESK_LANE_MODEL`, so the API had no model and `workspace-read-access` built no prompt. Both came back 0 failed and were listed with the patches that prove nothing. Nothing in the runner read the header; whether a lane had a model was up to whoever started the run. And the suite's branch for a lane with no model printed "the prompt a model is sent names, for a member, no space they are refused — the admin’s names it" after checking only that the chat answered 503. The log said a prompt rule had been measured when no prompt existed.

*Closed:* the break runner asks every patch in a set (`patches_needing_model`, lane-env.sh). When one needs a model, the lane gets one for the whole set, baseline included (`lane_model_add`), and the log says so on a `-- model:` line that no log reader takes for a patch header. The runner's stamp of what a lane serves now carries the model (`lane_serving_id`). A lane serving the right revision without one is re-synced for a set that needs one, and back again for a set that does not. So `create-menu-ai`, which is about the refusal, never inherits a model. The no-model branch has its own sentence, which says the prompt rule is measured only where a model answers. The new `check-model-lanes.sh` holds the header, the lane list (added to, not replaced; `all` left be), the stamp and the runner's wiring, and catches 5 of 5 mutations; before the change it failed on the runner. In preflight and CI. `wra-11` and `wra-12` were re-run with it on lane 2. The log says `-- model: on — needed by wra-11… wra-12…`, the baseline was 30/30 with a model, and each patch reddened the prompt check.

### `found-23-sep/lane-store-refused-the-apis-own-uploads` — **closed** (found giving the store a copy for `clip-create-task-persists-24h-url`)

**Under `--strict`, the lane store refused every PUT the API sends itself, as unsigned**

*Evidence:* `s3-stub.mjs` counted a PUT as signed only if its QUERY carried `X-Amz-Signature`, which is a presigned upload's shape. The SDK signs a request it sends directly in the `Authorization` header, so `putObject` (inbound email attachments) and any copy were answered 403 "the PUT carried no X-Amz-Signature" wherever the stub runs strict, which is how CI runs it. `check-s3-stub.mjs` never sent one, so nothing noticed. A mutation restoring the old rule reddens 5 cases of the new contract.

*Closed:* a signature in either place counts, and an unsigned PUT is still refused. The stub also serves CopyObject (the source's bytes, the requested type under `REPLACE`, `NoSuchKey` for a missing source, the source noted in the request log), which `check-s3-stub` drives through the real `R2Service`: 23/23 cases, 19/19 mutations.

## Test-suite defects (chains, catches, fingerprints, branches) — 21

### `found-24-sep/drifted-plan-three-patches-unaimed` — **closed**, re-runs pending (test tooling; found judging today's drifted break plan)

**The plan that re-measured today's drift (106 sets, 580 patches, lanes 3 and 4) left three patches that prove nothing, and one check that could not fail on this date**

*Evidence (the plan's logs, read by `check-break-reddened`):*
- `prail-3-finished-work-is-still-assigned` reddened nothing (0 failed). It removed the planner rail's own "open work" filter, and the member endpoint the rail reads has returned open work only since `ecd6bb0`. So the client filter restates the server's rule, and removing it changes nothing.
- `pv-2-the-arrows-always-move-a-week` reddened nothing. Its check, "next in Month view moves to a different month", pressed next once and compared labels. On 24 September a week's step also lands in October, so the check passed with the arrow moving a week. It could only fail in the first three weeks of a month.
- `lwb-1-noorder` was unproven: a check failed, not the one it claimed. Without an ORDER BY the database answers in whatever order it holds the rows, so which order-dependent check falls is the database's choice. On 23 September it was the rename check, today the token's binding.
- The plan's other 103 sets ran; `task-cover`'s and `calendar-accounts`' baselines were refused, the second a real defect (`found-24-sep/zoom-row-not-connected-while-loading`, closed) and the first a run under load (42/42 on lanes 1 and 2 since, 20 of 20 patches reddened).

*Closed:* `prail-3` takes the rule out where it lives, the member endpoint's closed filter. `planner-views` presses next twice and needs three different months: two week-long steps cannot cross two month boundaries, and two month-long steps always do. `lwb-1` claims both order-dependent checks. The re-runs are on lane 2, with `calendar-accounts`' own set in the second drifted plan (76 sets, 657 patches, started on lanes 3 and 4 after today's fixes drifted them).

*Re-run on lane 2:* `pv-2` reddened, and `lwb-1` reddened its claim. `prail-3` reddened nothing again. With the server's rule gone, the page's own copy still left the closed task out. Each copy of the rule covered for the other, so neither could be tested. The page's copy is gone now (with `product-siblings/workload-csv-dates-shifted-east-of-utc`'s batch), and the server's is the only one. `prail-2`, which read the page's copy, is re-aimed at the list it now reads. `planner-rail` passes 10/10 without the page's copy, in the 24-suite sweep above. Re-run on lane 2: `prail-2` and `prail-3` each reddened. `prail-3` now proves the server's rule. `sidebar-reorder-2`, re-aimed at the tree drawing the server's order, reddened as well.

### `suite-hygiene/hand-rolled-chains` — open, large

**103 literal check(false, …) calls in 15 suites, plus 5 other hand-rolled chains, instead of lib/chain.mjs**

*Seen again on 23 September:* `person-panel.mjs:818` — an unbounded `page.getByTestId('user-menu').click()` after a reload — turned one slow reload on a loaded lane into a run that ended at 54 of 59 checks. The same suite passed 59/59 on the next run. The click should be bounded and its absence reported as a failing check.

*Evidence:* Literal `(chk|check)(false,` count per suite: chat-message-actions 31, panel-collapse 23, person-panel 8, addressability-live 8, task-depth 7, settings-depth 5, planner-priorities 5, list-statuses-seeded 4, video-regression 3, a61-meeting-record 3, loading-states 2, and 1 each in video1-fast-items, video1-acceptance, planner-settings, emoji-picker. Six of these suites already import makeChain (chat-message-actions, panel-collapse, person-panel, task-depth, video-regression, video1-fast-items). Other hand-rolled chains: video-regression.mjs:927-1000 (G13 with its own `emitted`/`stopped` counters and `while (emitted < G13.length)`), video-regression.mjs:575-613 (A2.6b else re-types three labels), emoji-picker.mjs:406-413 (a literal label array duplicating 439/442/456), and the fixed-count loops list-empty-states.mjs:357 and list-view-controls.mjs:239. Fail branches that report fixture sentences instead of the product claim, which the ledger ruled out at docs/video2-reaudit.md:4030-4034: chat-message-actions.mjs:566-571 ('so "Assign to" was never checked'… against the product sentences at 515-561), :493-494; task-depth.mjs:1025-1028, 964, 994-995; person-panel.mjs:597-602; settings-depth.mjs:424-426, 500-501; addressability-live.mjs:221, 343, 365; panel-collapse.mjs:343-345, 401-402, 413. The first label at panel-collapse.mjs:811 ('a tool can be turned off') has already drifted from its pass twin at 817 ('Docs is in the dock to begin with').

*To close:* Move every one onto makeChain: declare the pass-path sentences once with chain(...), use step() on the pass path, and put the reason in rest(why) on the fail path. Replace the G13 emitted/stopped machinery with makeChain(chk). Consider a checker rule that flags `(chk|check)(false,` and bare `bad('` in suites once converted.

### `suite-hygiene/apiAs-duplicated-62` — open, medium

**62 suites hand-roll an API client in 5 variants beside lib/fixture.mjs apiClient**

*Evidence:* `^const apiAs = ` appears in 62 suites. Hashing the whole function bodies gives 5 variants: 54 copies (activity-rail…), 5 copies (addressability-live…) that always send `authorization: Bearer ${token}`, so an anonymous call sends 'Bearer null'; 1 in task-ai-bar that adds a `message` field; 1 GET-only in malformed-ids; and 1 multi-line in chat-message-actions. lib/fixture.mjs:28-46 apiClient differs again: it parses text and keeps `raw`. syncup-live has a third shape, api(token, method, path, body). The ledger extracted chain.mjs (docs/video2-reaudit.md:4076-4078) for two copies and claim-match.mjs (4071-4075) for two.

*To close:* Export apiAs(base)(token) from lib/fixture.mjs with the null-token rule and the message field, move suites onto it, and have the one copy expose `ok` and a `must(res, what)` helper, which would also remove most of finding unguarded-derefs.

### `suite-hygiene/ci-no-store-for-store-suites` — **closed** (unvalidated on a runner until CI runs again)

**CI runs task-cover and attach-on-create with no object store; task-cover also writes to a sandbox-only path**

*Closed:* the postgres-harnesses job starts `s3-stub.mjs --strict` before the API, waits for its ready line, and gives the API the four variables `lane_store_env` exports. The port is set ONCE, as the job-level `E2E_STORE_PORT`, which `task-cover` and `attach-on-create` already read and the API's `R2_ENDPOINT` is built from. `task-cover` and `doc-import` write their fixtures under `os.tmpdir()`. Cannot be run on a runner before 1 October; the lanes run the same configuration.

*Evidence:* task-cover.mjs:502-520 computes STORE_PORT = 9100 + (API_PORT - 3020), which is 9091 for `--api 3011`, and fails 'the lane has an object store' when nothing answers. attach-on-create.mjs:82-83 and 321 arm `${STORE}/__control/fail-next-put` on the same formula. ci.yml's postgres-harnesses job (383-384, runs on code changes) starts the API with only PORT=3011 (522-541), with no R2_ENDPOINT and no s3-stub, then runs both suites (753, 1803). check-s3-stub runs at ci.yml:336, but only as its own self-test. task-cover.mjs:528 and 624 writeFileSync to `/tmp/claude-0/cover-upload-…png` with no mkdirSync; ci.yml never creates /tmp/claude-0, so this throws ENOENT on a runner. doc-import.mjs:172 and 310 do the same (not in CI). This is inferred from code; I did not read a CI log.

*To close:* In the CI job, start s3-stub.mjs on the port the suites compute (or pass --store) and export R2_ENDPOINT/R2_* to the API, sharing lane_store_env's values. Write fixtures under os.tmpdir() via mkdtempSync instead of /tmp/claude-0.

### `suite-hygiene/inert-catches` — open, medium

**39 inert .catch(() => {}) on apiClient-shaped calls, several restoring shared account state; the recorded count of 292 does not reproduce**

*Evidence:* A paren-matching scan of calls to apiClient/apiAs-bound names found 32 direct `.catch(` sites in 20 suites. It also found 6 cleanup runners `for (const fn of cleanup.reverse()) await fn().catch(() => {})` (doc-task-links:273, list-filters:211, planner-blocks:228, space-default-permission:492, space-presets:177, view-visibility:250), plus video-regression.mjs:452 (`API(...)`, missed by name). All 62 local apiAs copies and lib/fixture.mjs:28-46 return {status,data,error} and never throw on an HTTP status. The worst are restores of shared state that fail silently. video-regression.mjs:482-485 sets the admin's inbox preferences as the starting state, 594 reads them back through an inert catch, and 616-619 restores them for 'every other' suite. video-regression.mjs:452 and video1-acceptance.mjs:324-326 re-mark notifications unread. panel-collapse.mjs:612 clears a seeded notification. ai-value.mjs:317-321 restores the workspace's real benchmark. task-provenance.mjs:169-173 restores a task-type name 'against a real workspace'. Setup: replies-inline-thread.mjs:95 adds the peer to the channel, and the checks below assume that worked. The docs say '292 … across 63 of the 66 suites' (e2e-shared-state-audit.md:105-118, dated 2026-09-20; video2-resume.md:230). Today there are 115 suites and 778 `.catch(() => {})` in total, mostly on Playwright calls that DO reject, so 292 most likely counted those and overstates the inert set.

*To close:* Replace each with a status check. For restores and setup, fail or log loudly with the status. For cleanup, collect non-2xx statuses and print them in the summary. Correct the doc's count to the measured client-call sites and state how it was measured.

### `commit-log/log-944e47f-1` — partly-fixed, medium

**Shared-database hazards in the e2e suites are only partly fixed**

*Evidence:* Commit 944e47f found 46 of 66 suites picking a workspace by index. Now 57 of 115 suites contain workspaces[0], and 26 use pickWorkspace. comment-recording.mjs:353 still switches the shared admin account to Urdu, restoring it only in a finally (:667). apiClient never throws on an HTTP status (fixture.mjs:28-46), and inert .catch(() => {}) calls on it remain, for example addressability-live.mjs:329 and ai-answer-rendering.mjs:856-859. The '292' in resume §3 #3 cannot be re-derived: there are now 778 .catch(() => {}) across 109 files, most of them intended bounds on Playwright calls.

*To close:* Re-measure the catches that follow an apiClient call, then replace them with status assertions. Move the remaining suites to pickWorkspace or a tagged workspace. Give comment-recording its own account.

### `resume-defects/resume-3` — open, medium

**Inert .catch(() => {}) on API clients: the doc's 292 is a miscount; the real figure is 33 direct plus 10 wrapped, and it is still open**

*Evidence:* test/e2e/lib/fixture.mjs:28-46: apiClient returns {status,data,error} for any HTTP status. It does reject when fetch itself rejects (line 32 is unguarded), so each .catch swallows only a dead API, never an HTTP failure. Most suites use a local apiAs(token) of the same shape (e.g. activity-rail.mjs:70-78, chat-message-actions.mjs:157-170), and none of the 16 apiAs I checked throws. THE 292 IS A MISCOUNT: git grep at 944e47f (the commit that wrote docs/e2e-shared-state-audit.md) finds 292 `.catch(() => {})` in 63 suites, but the figure counts every such catch. I parsed each site's call head with a bracket-matching script, using the same method on both trees. At 944e47f only 32 sites (20 suites) were on an API client. The rest were Playwright calls, which do throw and whose bounded `.click().catch(() => {})` form scripts/check-suite-section-enders.mjs:782-783 prescribes, plus postgres tagged templates, browser.close and sql.end. CURRENT TREE (115 suites): 778 `.catch(() => {})` in 109 suites, of which 33 sit directly on an API client in 20 suites (A:24, api:5, rootApi:2, API:1, cleanupA:1), plus video-regression.mjs:594 `.catch(() => null)`. Another 10 wrap closures that call A: `for (const fn of cleanup.reverse()) await fn().catch(() => {})` at doc-task-links:273, list-filters:211, planner-blocks:228, space-default-permission:492, space-presets:177 and view-visibility:250 (14 `cleanup.push(() => A(...))` closures), and `restore?.().catch` at panel-collapse:145, person-panel:138, settings-depth:133 and chat-message-actions:180. The count has not come down. The two newest suites added the pattern (ai-answer-rendering.mjs:856-859, doc-import.mjs:364), and no checker forbids it. WORST CLEANUP THAT SILENTLY DOES NOT CLEAN: task-menu.mjs:509, where an inbound-email alias whose own comment says it 'must not persist into whatever runs next' is DELETEd with a catch and no status read. panel-collapse.mjs:1041-1042 deletes three seeded spaces in the shared workspace, unchecked. assign-to-priorities.mjs:341 and planner-priorities.mjs:314 delete priorities in finally. teams-destination.mjs:259 deletes a group. request-access.mjs:304-307: the comment says 'this is a 404 it ignores', but the code ignores every status. WORST RESTORES OF SHARED ADMIN STATE, never checked: panel-collapse.mjs:183 and 457-458 (PATCH /users/me panelsCollapsed and sidebarCollapsed), settings-depth.mjs:172-176 (presence, mute, highContrast), ai-value.mjs:318-322 ('this workspace's real setting'), task-provenance.mjs:169-173 ('this runs against a real workspace'), and video1-acceptance.mjs:324-325, which re-marks notifications unread after mark-all-read on the shared admin with no after-check. video-regression.mjs:453 has the same shape but is guarded by the chk at 455-460. SETUP THAT DOES NOT SET UP: among the 33 only replies-inline-thread.mjs:95 (adding the peer to a channel), and the chk at 106-110 guards it. The larger instance has no .catch at all: fixture.mjs ensureShared discards the statuses of the assignee POSTs (230, 256), the close PATCH (258, a hard-coded status 'done', which contradicts the fixture's own warning at 105-110) and the solo-meeting POST (281-290). If that last one fails, the negative check its comment at 234-248 exists for passes vacuously again. SEPARATE LIVE CLASS: about 140 postgres cleanups in 38 suites (e.g. assign-to-priorities.mjs:345-347, `sql\`delete ...\`.catch(() => {})`) catch real rejections and discard them.

*To close:* Replace every direct and wrapped site with an explicit acceptable-status assertion, following the audit's own recipe at docs/e2e-shared-state-audit.md:142-151. DELETE cleanup accepts 200/204/404; restores of shared state must succeed. Make a failed restore a counted FAIL (restore closures return the response, and done() or the finally checks it). Change the cleanup.push loops to push closures whose result is checked. Fix fixture.mjs ensureShared to check each POST/PATCH and resolve the closed status from the list's statuses, not 'done'. Add a read-only checker (in the style of check-suite-section-enders) that refuses `.catch(` attached to a call on any identifier bound from apiClient or apiAs, so the count cannot regrow. Correct the 292 in docs/video2-resume.md:230 and docs/e2e-shared-state-audit.md:105,118,194 to the true split: 33 plus 10 on API clients; about 140 SQL swallowers as a separate class; Playwright catches deliberate.

### `suite-hygiene/unbalanced-else-branches` — open, medium

**14 if/else branches report a different number of checks on the failure path; one is a drifted magic count**

*Evidence:* Checks counted per side by hand after a scratch balance scan. list-view-controls.mjs:167-240: the if side has 9 chk calls (168,181,188,191,210,228,230,232,234) and the else is `for (let i = 0; i < 8; i++) bad(...)` at 239. Commit 3a4f426 added the cluster-box check at 210 and raised EXPECTED_CHECKS to 50 (line 53) but left the loop at 8. chat-message-actions.mjs:775-780: no modal gives 4 checks, the modal path gives 3 + 8 = 11 (781,785,799 + 814..869). Two of its else sentences are stale copies: 'with the message it is about' vs 783, and 'and the eleventh conversation is reachable' vs 801. chat-message-actions.mjs:948/982-985 is 2 vs 1: 'and that dialog closes again' at 977 has no else twin. chat-message-actions.mjs:918/993-997 is 5 vs 3. person-panel.mjs:826-828 is 1 vs 3 (829 plus a 2-step chain at 840). task-depth.mjs:943/963-965 is 2 vs 1. a39-dm-tabs.mjs:168/177-179 is 2 vs 1. ui-sweep.mjs:395/420-422 is a 4-label chain vs one bad(). ui-sweep.mjs:443/460-462 is 2 vs 1. video-regression.mjs:266/327-329 is at least 10 vs 1, :645/692-694 is 7 vs 1, :700/712-714 is 4 vs 1, and :410/462-466 is 3 vs 0 (an uncounted console.log SKIP). command-palette.mjs:512-516: `.catch(async () => bad(...))` adds a 44th check only when the click fails. In every case a product regression prints '✗ N of M checks ran — this run stopped early', the exact headline lib/chain.mjs:4-15 was written to remove.

*To close:* Convert each block to makeChain(check) using the pass branch's own sentences, and call .rest(why) in the else. Delete the literal counts and re-typed labels. For command-palette, report the click failure in the detail of the next check rather than as an extra check. After converting, force each else path (for example, remove the testid) and confirm the count still matches EXPECTED_CHECKS.

### `suite-hygiene/unguarded-derefs` — open, medium

**Raw .data.X dereferences after a check that is allowed to fail, and in fixture helpers**

*Evidence:* Classified 160 `.data.X` sites with a scratch script. About 80 are behind explicit throw-guards and 27 are guarded inline. The ones after a null-safe check that may fail: space-default-permission.mjs:271-277 checks `viewList.data?.id`, then 322, 343, 361, 368, 380, 391, 414 and 436 use `viewList/commentList/editList.data.id` bare; one top-level try (99-488) means 15 of 25 checks are lost. task-depth.mjs:476 checks `reuse.data?.id` (the product 500ing on the unique index is the case under test), then 477-478 use `reuse.data.id`/`second.data.id`; one try 161-1146 means up to 58 later check sites are lost. bookmarks.mjs:84-98 checks, then 161 and 170 use `external.data.id`/`internal.data.id`. list-filters.mjs:89 then 200 and 204 (`saved.data.id`). planner-blocks.mjs:91 then 218 and 222 (`made.data.id`). list-name-taken.mjs:105 then 170 (`first.data.id` inside sql). Bare mid-run: task-depth.mjs:1034-1053 (`parent.data.id`, `c1.data.id`, `c2.data.id`, all unchecked creates); chat-message-actions.mjs:424 (`(await A(...)).data.find(...).id`, two throws). Shared fixture: lib/fixture.mjs:226-230 ensureShared uses `task.id` after an unchecked POST. Setup: addressability-live.mjs:112-117 and task-depth.mjs:180-182 (`spaces.data[0].id`), planner-priorities.mjs:181 and planner-views.mjs:106 (`(await A('/users/me')).data.id`). Nothing gates this class: check-suite-section-enders.mjs covers Playwright reads only.

*To close:* At each site, optional-chain the id into a const, and gate what follows on it with a chain whose .rest() names the missing fixture (as folder-dialog now does). In ensureShared, throw a sentence when the POST fails. Consider adding a rule to the section-enders checker: `X.data.` used after a chk whose condition mentions `X.data?.`.

### `suite-hygiene/ai-activity-filters-model-refusal` — open, small

**A fifth suite pins the model refusal; the harness says four**

*Evidence:* ai-activity-filters.mjs:125-135 checks `forced.status === 503` ('asking for a task while AI is unconfigured is refused with a 503'), and :152-156 checks `row?.errorCode === 'not_configured'`. The checks at 139-160 depend on that refusal having produced a failed row, and 166/448 then pass vacuously (see vacuous-absence-on-empty-read). lane-env.sh:88-100 and commit 7c4ac44 say 'FOUR suites … 21 assertions, COUNTED INSIDE chk( CALLS' and list ai-create-containers, create-menu-ai, task-ai-bar and ai-answer-rendering, which omits this one. No dispatcher routes any suite to a modelless lane: grep of scripts/ for create-menu-ai|task-ai-bar|ai-activity-filters|needsModel finds only comments, and lane-env.sh:131-133 says the routing is 'NOT done'. So create-menu-ai and task-ai-bar (known) and this suite would all break on a model lane.

*To close:* Convert this one: the refusal is scenery. Arrange a real provider failure on a model lane via model-stub `POST /__control/next` (model-stub.mjs:103), and on a modelless lane keep the not_configured path. Assert the row's errorCode equals what the configuration predicts (read /ai/status first), so the same checks hold either way. Update the count in lane-env.sh.

### `suite-hygiene/conversion-reintroduced-fingerprint` — open, small

**Tonight's AI-configuration conversions put the fingerprint back on the model-configured branch**

*Evidence:* ai-answer-rendering.mjs:544: `modelConfigured ? beforePlaceholder !== UNAVAILABLE : …`. beforePlaceholder comes from attrOf (line 124), which returns null when the composer is missing, so on a model lane a composer that is absent, empty, or still reading 'Working on it…' passes. This is the absence-of-a-string shape commit 8af9618 removed, reintroduced by b5a52bc. ai-create-containers.mjs:372 and 390: `modelConfigured ? status !== 503 : …` accepts a 404 (route removed) or 500 when a model is configured. The failure message at ai-answer-rendering.mjs:592 still says 'against a disabled' placeholder on a lane where it was not disabled.

*To close:* On the configured branch, assert the resting placeholder string positively (the i18n resting text) and non-null. For the endpoints, assert a 2xx (or the specific success status and shape) when available. Run both on a model lane with a break that removes the composer or the route.

### `suite-hygiene/fingerprint-negations` — open, small

**Facts asserted by the absence of a word from another string**

*Evidence:* ai-answer-rendering.mjs:617 `!/^working$/i.test(stepWords)` means 'its own words' only by lacking the fallback word; if the fallback becomes 'Thinking', a missing translation passes. chat-message-actions.mjs:514 `!/^thread$/i` claims 'named after whoever started the thread' by not being 'Thread', though the suite knows the starter (it posted BODY as A). team-view.mjs:289 `!/Admin|Omar/.test(last)` claims 'unowned work is last' by the absence of two seed names; any third member in the shared lane DB passes. tab-title-countdown.mjs:204 `!/left|\d+m \d+s/i` claims no countdown only by the absence of today's countdown format. list-empty-states.mjs:231 `!/create task/i` claims no create CTA by the absence of today's button copy. no-dead-ends.mjs:167 `!/Something went wrong/i` claims 'does not crash' by the absence of the error-boundary copy, with no positive anchor; the sidebar wait at 163 is caught. ui-sweep.mjs:429 `!/Due date.*checklist item/i`. addressability-live.mjs:150 and command-palette.mjs:298 `!/No matches/i` fingerprint the palette's empty copy; both have positive twins above, so they are weaker.

*To close:* Assert the positive fact. Match the create_list step's expected label exactly; compare the thread title to A's display name; assert the last row is the unassigned row by testid or data attribute; compare the tab title with the base title read before any block; count the CTA testid in the filtered state; assert workspace-sidebar and the notifications panel are visible; check that the checklist item's first control is the assignee picker; check that the cmdk-empty element count is 0.

### `commit-log/log-1e7f092-1` — partly-fixed, small

**team-schedules stubs every API call yet is cited as closing its row, against the 'real API' rule**

*Evidence:* Commit 1e7f092: ts-9 'patched a line nothing in the repository executes'. De-duplication is now unit-tested (team-schedule-columns.test.ts). team-schedules.mjs:162 still intercepts every **/api/** call, so the server endpoint never runs in e2e. Ledger row 821 says 'closed by team-schedules.mjs', while resume :36-37 says a row closes only against a real API and Postgres.

*To close:* Add a real-API section, or a small real-API suite, for the team schedules endpoint, or record on row 821 that it is closed by the browser suite plus the unit test.

### `commit-log/log-30183c3-1` — open, small

**process.exit() is still used at 216 places in the suites; recorded as harmless for now**

*Evidence:* Commit 30183c3 recorded it as 'the wrong pattern that cannot bite today' (11.6 KB of output against a 64 KB pipe buffer). A count now finds 216 calls across 114 suites. Ledger line 6448 says 215, so the count has already grown by one. The checkers were already switched to process.exitCode (ledger 5527).

*To close:* Convert the suites to set process.exitCode, or at least stop the count growing with a ratchet.

### `commit-log/log-641be6c-1` — open, small

**The stale-chunk 'no reload loop' check allows up to three reloads and cannot catch a missing cooldown**

*Evidence:* Commit 641be6c: 'The bound is real and the check is loose'. stale-chunk-recovery.mjs:486 still asserts reloads <= 3. The scr-5 patch header records PASS with 2 loads while the cooldown was removed.

*To close:* Widen the observation window or assert the cooldown directly (for example exactly one recovery reload, then the error boundary), so that scr-5 reddens both checks.

### `commit-log/log-6d8e26f-1` — open, small

**syncup-live skips its storage checks on any error, which a real bug can now trigger; two suites still claim storage is unconfigured**

*Evidence:* Commit 6d8e26f named these as sibling suites 'the sweep will say'. The sweep cannot say, because a skip never turns red. syncup-live.mjs:1142-1147 skips the whole storageChain whenever upload-url answers >= 400. Every lane now has s3-stub, so a product 5xx is recorded as SKIP, which cbb92ab defines as 'a check that cannot fail'. Stale premises remain at syncup-live.mjs:1083 and 1126-1127 ('locally and in CI there is no bucket') and settings-depth.mjs:760-762 ('unconfigured here and in CI').

*To close:* Skip only when the deployment reports storage as unconfigured, never on any error status. Arrange the failure case through s3-stub's fail-next-put. Rewrite the three comments.

### `suite-hygiene/more-hand-rolled-chains` — open, small

**Further hand-rolled chains and literal-count loops the finder did not list**

*Evidence:* panel-collapse.mjs:674-710 hand-rolls a chain: a `drawerChain` label array, a manual `drawerAt` counter incremented before each check (695, 701, 704), and `drawerRest = (why) => { while (drawerAt < drawerChain.length) check(false, drawerChain[drawerAt++], why) }`. The same suite imports makeChain (28) and builds `chain` at 120. panel-collapse.mjs:1097-1106 keeps a literal 6-label array for the seeding-failed path that duplicates the pass sentences at 1052-1095. ui-sweep.mjs:584-587 reports `for (let n = 0; n < 4; n += 1) pal.step(false, …)` instead of a rest. pal is one 16-label chain (534-550) whose later steps continue after this block (sort chips, Docs/Tasks multi-select), so if the ⋯ section gains or loses a step, the literal 4 shifts every later sentence onto the wrong check instead of throwing.

*To close:* Use makeChain for drawerChain. Declare the tree-search sentences once and use rest(). In ui-sweep, split the ⋯ steps into their own chain so a rest() can fill exactly that section, or replace the literal 4 with a count derived from the labels.

### `suite-hygiene/skips-reachable-by-product` — open, small

**Counted skips gated on product state rather than on the machine**

*Evidence:* syncup-live.mjs:1093-1107 skips recordChain as 'the AI Notes entitlement is off' whenever the Record BUTTON is not visible, so a regression that hides the button becomes 3 SKIPs and exit 0 (done() at 268 exits 0 on skips). syncup-live.mjs:1142-1146 skips the 5-step storageChain on ANY upload-url status >= 400. calls.service.ts:769 answers 400 'This call was never recorded' before the storage check at 770, so a recording-start regression, or the exact historical bug that comment 755-767 describes, reads as 'object storage is not configured here'. A 5xx does the same. ui-sweep.mjs:450-459 calls skip('no known card on the board to click') when the Board shows no card, although ensureSweepFixture (lib/fixture.mjs:87-139) guarantees at least 6 tasks, so an empty board is a product failure.

*To close:* syncup-live: read the entitlement from the API and skip only when it is off; if it is on and there is no Record button, fail. For storage, skip only when a configuration read says storage is unconfigured (or an explicit env flag); otherwise step(false) with the status and message. ui-sweep: replace the skip with a chain step that fails.

### `suite-hygiene/syncup-live-dead-peer-branch` — open, small

**syncup-live's 'peer state is not exposed' branch is unreachable and states a stale reason; if reached it would shorten the run**

*Evidence:* syncup-live.mjs:779-781: `if (!peers.instrumented) { console.log('  SKIP  peer state is not exposed for tests — falling back to the rendered tiles') } else { check(...) }` is 0 checks vs 1, and the SKIP is not counted (skip() at 200-203 is not called). But `window.__rundeskPeers` is set unconditionally by the suite's own addInitScript (388-396), and grep finds it nowhere in apps/. So `instrumented` is always true and the branch is dead. Its sentence describes a test-only product hook that the comment at 380-386 says was deliberately NOT built. The same pattern appears at 860-862 in outgoingVideoLabel.

*To close:* Delete the dead branch, or turn it into a failing check that says the instrumentation did not install. Do not print an uncounted SKIP.

### `suite-hygiene/task-depth-inline-list-unbalanced` — open, small

**task-depth's 'project with no list' branch reports 1 check one way and 0 (plus an uncounted log line) the other, and its check never runs on seeded data**

*Evidence:* task-depth.mjs:315-327. When the list select holds 1 option or fewer, `check(offered, 'a project with no list offers to make one right here', …)` reports 1 check. The else (324-327) reports 0 and prints `console.log('  ·  this project already has a list, so the inline creator was not needed')`. On the seeded DB the chosen project has lists, so the normal path is the uncounted one and the inline list-creator (§G15 [21:59]) is never exercised: a confident zero. Against a project with no list the run reports one check more than EXPECTED_CHECKS and prints the 'stopped early' headline. My balance scan found this. It is not among the 14 in unbalanced-else-branches.

*To close:* Arrange the precondition instead of reading it from ambient data: create a project with no list in the fixture and drive the inline creator there, so the check always runs. If it must stay conditional, make both sides report the same labelled check via makeChain(check).rest(why).

### `suite-hygiene/vacuous-absence-on-empty-read` — open, small

**Absence checks that pass when the read came back empty or the fixture id is null**

*Evidence:* video-regression.mjs:381-384 reads controls with `.catch(() => '')`, and 399-403 `!/\bOther\b/i.test(controls)` then passes when the inbox-controls row is gone. task-cover.mjs:181 reads tabsText with `.catch(() => '')`; 182-186 ('nothing that only pretends to work') and 202-208 ('Search tab stays absent') both pass on a missing tablist. panel-collapse.mjs:959-967 reads emptied with `.catch(() => '')` and 'an emptied list is not silently refilled' passes when nav-favorites-list is missing. space-wizard.mjs:386-388 `!/Gantt/.test(row)` passes on an empty row. ai-activity-filters.mjs:166 `!idsOf(succeeded).has(forcedFailureId)` and 448 `[data-run-id="${forcedFailureId}"]` count === 0 both pass when forcedFailureId is null (no failed row was made). That happens on any model lane, and on a regression of the failure write. lib/fixture.mjs:244-247 states the rule these break: 'An absence is a claim only when the thing could have been present.'

*To close:* Carry the precondition into the condition: require controls/tabsText/emptied/row to be non-empty (or the container count to be 1), and require forcedFailureId to be non-null, in the same chk.

### `suite-hygiene/vr-invocation-skip-unreachable` — open, small

**video-regression's counted skip for a WS-given invocation can never run; that path reports 3 checks short**

*Evidence:* NOTIFIED is assigned only inside `if (!WS)` (video-regression.mjs:58-77, line 70). When WS is given, `if (NOTIFIED)` at 410 is false, so the counted skip() calls at 429-432 (which exist for exactly the WS-given case, per 152-163) are unreachable. Execution falls into the else at 462-466, which prints an uncounted 'SKIP … "Clear all" not checked' through console.log and reports 0 of the branch's 3 checks. The comment at 152-163 and the ledger at docs/video2-reaudit.md:4035-4039 describe a fix that never takes effect. A failed ensureNotification (lib/fixture.mjs:177-201 returns null) also shortens the run by 3.

*To close:* Hoist the skip decision: if !API (invocation), skip all 3 via skip(); else if !NOTIFIED, fail all 3 with the reason (arranging a notification failed); otherwise run them. Use makeChain(chk, skip) for the block.

## Unbuilt features (buildable: research ClickUp where the frames stop) — 31

### `found-23-sep/connected-search-per-person` — open, medium (unbuilt; found closing federated search)

**Each member should search their OWN mail and files; today one person's connection is the workspace's only one**

*Evidence:* `workspace_integration_connections` is unique on (workspace, provider), so a second member connecting Google replaces the first's grant — and since 23 September a grant answers only the person who connected it, so everyone else's Gmail, Drive and SharePoint tabs say "Connected with someone else's account". The frame (§V2-11 `19:07`, "meri Gmail pe jaa ke") is a person searching their own mailbox.

*To close:* research ClickUp's Connected Search — which apps each person connects for themselves and which an admin connects for the workspace, and what a member sees of the latter — then store per-person grants beside the workspace one (the calendar accounts already do: `user_calendar_accounts`), connect from the person's own settings, and search with the searcher's own grant. A suite per source: two members, each finding only their own.

### `commit-log/log-214dac0-1` — open, large

**The Brain² hub and everything that depends on it is unbuilt**

*Evidence:* Recorded in commits 214dac0, 4dacd13, 10c3194, d626849, 601eacc and 4cb50d3 ('Brain²'s hub still needs a runtime'). The API has no agents module (ls apps/api/src/modules). quick-create-modal.tsx:275 says 'SUPER AGENT ... is deliberately absent', and task-detail-sheet.tsx:578 says the Brain² button 'does not exist and is not being built'. workspace-ai-page.tsx:123 and 184-196 is a seven-tab strip, not the frame's two-group left nav, and has no Ask|Agents toggle. ai-panel.tsx has no composer '+' and no generated-artifact or slide-deck output. The ledger still counts these rows as M, P or excluded: 743 (task-header Brain²), 745 (@ picker Brain and Agents), 751 ('Brain' in the + menu), 770 (Super Agent), 848 (Agents, excluded), 852 (hub, left nav, Ask|Agents, Super Agents), 853 (composer +, artifacts) and 870 (image generation).

*To close:* Research how ClickUp Brain and Super Agents work: the hub layout, what an agent is, its tools and triggers, and Ask vs Agents. Build an agents table, module and route first, then the hub shell, the toggle and the entry points (task header, + menu, @ picker, create menu). Test on a lane that has the model stub.

### `commit-log/log-601eacc-2` — open, large

**Importers: Basecamp, Confluence and Slack are shown as text only, .xlsx is not read, and document import takes only .md and .txt**

*Evidence:* spreadsheet-import.util.ts:241-258 lists Basecamp ('needs the Basecamp API'), Confluence (exports HTML/XML) and Slack (conversation JSON) with a reason and no control. Monday and Wrike at :148-151 and :216-219 tell the user to 'save as CSV' because .xlsx is not read. Ledger row 816 is P. Commits 68bc188 and 4a1fee7 refused Word import as 'a heavy parser dependency'.

*To close:* Research which files and APIs ClickUp's importers accept for each tool, including .xlsx and .docx. Decide with the owner which to build. Credential-based imports can use a stub the way storage and the model do.

### `commit-log/log-68bc188-1` — open, large

**Activity and Workload view types were researched against ClickUp and are still not built; Map, Mind Map and Timeline are also not offered**

*Evidence:* Commit 68bc188 researched both views against ClickUp and called them 'buildable rather than inventable'. It names the parts already in the tree: task_activity, tasks.timeEstimate, and findOverloadedAssignees for the colour bands. Commit 9609106 then HELD them because 'the walkthrough does not make' the decision. Commits 30183c3 and 716d25c say 'View types is exact at six'. The tree agrees: packages/db/src/schema/enums.ts:162-170 viewTypeEnum is list, board, calendar, gantt, table, team, and apps/web/src/lib/space-views.ts:65 SPACE_VIEW_KEYS holds the same six. Ledger row 777 reads 'View types 6 of 11 ... Map / Mind Map / Timeline deliberately NOT offered ... Activity and Workload remain buildable'. A workspace-level /workload page exists (routes/app.$workspaceId.workload.tsx), but it is not a list view type.

*To close:* Build Activity and Workload as view types to the ClickUp design already written into 68bc188. Workload colour bands must reuse findOverloadedAssignees and must not add a second threshold. Research ClickUp's Map, Mind Map and Timeline views and build each one with a real renderer, so no view is stored that nothing reads. Add a suite and break patches for each view.

### `commit-log/log-713a611-1` — open, large

**'Add to ›' (one task in several lists) is blocked because it is ClickUp's feature rather than the video's**

*Evidence:* Commit 713a611 and ledger row 845: 'The gloss ... a task in more than one list is ClickUp's real product, not anything in the video ... Blocked on the reference'. Under the new instruction, ClickUp's real product is the spec to build to. packages/db/src/schema/tasks.ts:17 has listId as a single notNull foreign key, and no task-to-list join table exists in the schema.

*To close:* Research ClickUp's Tasks in Multiple Lists: the Add to submenu, the home list vs added lists, and how filters, views and moves treat a task in more than one list. Add a join table with readers in every list query, then a suite and break patches.

### `commit-log/log-c980bee-1` — open, large

**Ten custom field types are unbuilt, and the ledger still gives a reason that commit 4cb50d3 retired**

*Evidence:* custom-fields.ts:7-52 has 22 types. Commits c980bee and ac1d0fa recorded ten as decisions: eight AI fields (Summary, Custom Text, Custom Dropdown, Progress Updates, Translation, Sentiment, Categorize, Action Items), plus Relationship and Button. Ledger row 719 still says the AI eight wait because 'ANTHROPIC_API_KEY is empty here and in CI'. Commit 4cb50d3 retired that exact reason ('The reason is retired and the seam is proven'): the SDK reads ANTHROPIC_BASE_URL, and model-stub.mjs answers there. Button waits on 'AutomationsService has no manual trigger'.

*To close:* Research ClickUp's AI fields, Relationship field and Button field. Build the AI fields against the model-stub lane. Replace the stale reason on row 719 now, whatever is built.

### `resume-defects/resume-8` — open, large

**email.service send() still has no replyTo, cc or messageId, and task_comments still has no channel column**

*Evidence:* apps/api/src/modules/email/email.service.ts:584-611: send(opts: {to, subject, html, attachments}) calls transport.sendMail({from, to, subject, html, attachments}). There is no replyTo, cc, bcc, messageId, inReplyTo or headers. packages/db/src/schema/comments.ts:16-29: task_comments has id, taskId, authorId, assignedToUserId, resolvedByUserId, resolvedAt, parentCommentId, body, mentions, editedAt and createdAt, with no channel column and no email metadata. The migrations end at 0160_folder_description.sql, and the only ALTER of task_comments is 0006. Inbound mail becomes a comment with no channel marker (email-to-task.service.ts:284-316, appendComment inserts {taskId, authorId, body}), so today the thread cannot distinguish a comment that arrived by email either. I searched apps/api/src for an outbound composed-body route (`@Post(...email...)`, `this.email.send*` callers in task and comment modules): the only senders are notification templates (notifications.service.ts:1179, 1203, 1213).

*To close:* Extend send() with replyTo, cc, bcc and messageId/headers, and return the Message-ID. Add migration 0161: task_comments.channel ('comment'|'email', default 'comment') plus email metadata (to, cc, subject, message_id). Record outbound Message-IDs where resolveReplyContext can find them (see resume-8-reply-routing). Set the Reply-To to the task's `list-<alias>+task-<id>@domain` address; mint the list alias if none exists, because GET /tasks/:id/email-address (tasks.controller.ts:482-485) is the existing source of that address. Mark inbound appendComment rows channel='email' and render the channel in the thread. That is the mirror-defect guard: a stored channel must have a reader.

### `ledger-rows/row-719` — open, large

**Field types: 10 of the frame's 29 absent; the 'ANTHROPIC_API_KEY is empty' blocker for the 8 AI types is stale**

*Evidence:* reaudit.md:719: the 10 absent are 'not a build'. Eight need a language model and 'ANTHROPIC_API_KEY is empty here and in CI'. Relationship 'would be a second store for what task_doc_links already holds'. Button has no manual trigger. Tree: custom-fields.ts:7-53 has 22 types including 'tasks' (a named task→task reference, 0158). The key reason is retired by the ledger itself (reaudit.md:2843-2863) and by the model stub now being wired into the lanes (commits 6fbd79b, ad00a7c: RUNDESK_LANE_MODEL). For Button: AutomationsService.fire(triggerType, ctx) takes any trigger string (automations.service.ts:209-236), so a button trigger type is an addition, not a missing engine. The Relationship reason names task_doc_links (task↔doc), while the `tasks` field type already stores task→task references.

*To close:* Build the 8 AI field types on ai.service's existing Anthropic path, measured on a model-stub lane. Add Button as a new automation trigger type fired by the field. Decide Relationship against ClickUp's actual Relationship field (list-scoped, rollups) versus the existing `tasks` type. Rewrite the row's reason.

### `ledger-rows/row-770` — open, large

**Create-menu 'Super Agent' — still absent**

*Evidence:* reaudit.md:770 (P): 'Super Agent stays open and is blocked, not pending: Rundesk has no agents'. Confirmed: no agents table in packages/db/src/schema and no agents module in apps/api/src/modules. 'Describe anything to create' and Create with AI are built (create-menu-ai.mjs).

*To close:* Depends on row-852's Super Agents build. Once that exists, a create-menu entry that opens 'Create Agent' is small.

### `ledger-rows/row-777` — open, large

**View types 6 of 11: the premise is partly stale — Workload, Timeline, Mind-map pages and a workspace activity feed already exist**

*Evidence:* The row (reaudit.md:777), §12 (reaudit.md:6191-6250, 6476-6482) and space-views.ts:59-63 ('The five Rundesk does not have (Map, Activity, Mind Map, Timeline, Workload) are not offered') all treat these as absent. SPACE_VIEW_KEYS is six (space-presets.ts:32, space-views.ts:65). But these already exist at WORKSPACE level: (1) Workload: routes/app.$workspaceId.workload.lazy.tsx → workspace-workload-page.tsx (656 lines, people × day heat map, capacity, days off, estimated vs tracked hours), fed by GET /workspaces/:ws/reports/workload and /workload/day (reports.controller.ts:143-163). (2) Timeline: workspace-timeline-page.tsx (1124 lines) over /tasks/workspace/:id/timeline. (3) Mind maps: workspace-mindmaps-page.tsx:71-89 (canvases of type=mindmap, i.e. blank mode, not task mode). (4) Activity: GET /workspaces/:ws/reports/activity (reports.controller.ts:184-192) → reports.service.ts:1323-1353, task_activity joined to actor name/avatar and list/project/space, visibility filtered (used by dashboard-widget-builder.tsx:956). (5) Map: the `location` custom-field type exists (custom-fields.ts:26). There are also TWO rules for 'overloaded' already: the Workload page uses a load/capacity ratio (workspace-workload-page.tsx:85-88, 480-485), while §12 tells the new view to use findOverloadedAssignees (ai.service.ts:817).

*To close:* Treat this as building list/space VIEW TYPES over the existing aggregators, not as greenfield. Add a listId/spaceId filter to /reports/activity and /reports/workload. Add 'activity' and 'workload' (then timeline/map/mind_map, using ClickUp research for their shape) to SPACE_VIEW_KEYS in both places. Settle which overload rule is canonical so the page, the new view and AI assign agree. Fix the space-views.ts comment and the §12 text.

### `ledger-rows/row-852` — partly-fixed, large

**Brain² hub row is still M as a whole, but its main column exists at /app/:ws/ai; only Super Agents, Ask|Agents, nav shape and onboarding are absent**

*Evidence:* reaudit.md:852 is `| M | Brain² hub, /ai/brain, AI-scoped left nav, Ask|Agents toggle, Super Agents |`. The ledger's own read at reaudit.md:6500-6550 says the main column is 'largely built' and that the hub lives at /app/:workspaceId/ai. Tree: routes/app.$workspaceId.ai.tsx → workspace-ai-page.tsx:123 and :188-235 have seven tabs (chat, knowledge, commands, generate, notes, writing, analytics); the shell AI dock is at routes/app.tsx:168-190. There is still no agents table, module or route: packages/db/src/schema lists none, and apps/api/src/modules has no agents module. skills.ts:1-29 separates Skills (built) from ClickUp's Super Agents (instructions, triggers, skills, knowledge, memory). The 16:25 'Personalize Brain²' onboarding appears in no row except inside the Brain² decision (reaudit.md:2774).

*To close:* Split the row. Mark the hub's main column B, then build Super Agents (Create / All / My) plus the Ask|Agents toggle from ClickUp research. Parts to reuse: `skills` (instructions), AutomationsService.fire() (triggers, automations.service.ts:209-236), COMMAND_TOOLS including create_list/create_folder (ai-command.ts), and the model stub lanes (RUNDESK_LANE_MODEL, ad00a7c) to measure it. The /ai/brain URL and left-nav shape are cosmetic.

### `ledger-rows/row-853` — open, large

**Credit meter, rotating placeholder, composer '+', generated artifacts/slide deck — absent; the placeholder's revert reason is weakening now lanes can carry a model**

*Evidence:* reaudit.md:853 (M). ai-panel.tsx testids have no composer-plus. :1817-1823 has three static placeholder states with no rotation (built then reverted in 4ad25f6 because 'the resting state never renders in a lane'). Since 6fbd79b/ad00a7c a lane can be given a model per lane (RUNDESK_LANE_MODEL). TaskAiBar disables 'presentation' because there is 'no slide-deck entity' (task-detail-sheet.tsx:596-600, 625-629). The ai_usage metering exists (reaudit.md:6558-6564). Only the allowance and reset are missing, which the frames never give.

*To close:* Rotating placeholder: rebuild it and measure on a model lane. Credit meter: allowance and reset from ClickUp research, reading ai_usage. Composer '+': contents from ClickUp research (existing parts: knowledge tab, skills, @-mention search). Slide deck: frame 16:50 specifies an inline 4-slide embed; needs an artifact entity plus a renderer.

### `ledger-rows/row-869` — open, large

**Credits (tab, category table, trend chart with limit, Add credits, My Agent Performance) — absent; a recorded decision plus parts no frame opens**

*Evidence:* reaudit.md:869 (M). §3 decision at reaudit.md:889-891. §6 at reaudit.md:2819 says the usage-trend chart is separable and 'STILL OPEN'. Parts that exist: GET /ai/usage (ai.controller.ts:183-190) and an AI Usage settings tab (workspace-settings-page.tsx:1287-1330) with per-user and per-model spend over 7/30/90 days. The response has totals/byUser/byModel and no per-day series, so there is no trend. rollUpByCategory gives the 8 categories (ai-categories.ts). No AI quota exists in PlanLimits.

*To close:* Build the dollar trend chart now: a per-day series from ai_usage. Take the credit unit, allowance and 'Add credits' flow from ClickUp research, and get the owner to reconsider the §3 decision. 'My Agent Performance' waits for Super Agents (row-852).

### `resume-defects/s4-clip-link` — open, large

**Section 4: 'A pasted clip link renders as the clip' is still unbuilt. There is no clips table, no per-clip route and no paste handling**

*Evidence:* No clips table: I grepped packages/db/src/schema for a pgTable named with 'clip', and packages/db/src/migrations for CREATE TABLE with clip, and found nothing. A clip is a storage object. clips.service.ts:21-23 builds the prefix `workspaces/<id>/clips/`, :37 builds the key, and :50-80 lists the clips by listing storage objects, using the storage key as `id` and title and duration from object metadata. The routes are only the library /app/$workspaceId/clips (routeTree.gen.ts:419-423, 591); there is no per-clip route. For paste handling, the comment composer has no onPaste or unfurl: grep of apps/web/src finds unfurl only in chat (chat-message-body.tsx:124-169, 315-328), which unfurls task URLs and OG metadata, not clips. Copy link signs the storage object (clip-publish.ts:111-117), so a pasted link carries no clip identity and no title. The ledger entry is docs/video2-reaudit.md:1307-1330 (status M), with the row at 1532. ClickUp research: clip URLs are stable, unguessable public links (see resume-7).

*To close:* The order is forced. First, a `clips` table (id, workspace_id, storage_key unique, title, duration_seconds, created_by, share_token, created_at), backfilled from the existing storage prefix, with list() reading the table. Second, a stable app route that resolves a token to a freshly signed playback URL, shared with resume-7. Third, paste handling in the comment composer (and chat) that recognises the route, stores a clip reference on the comment rather than a bare URL, and renders the existing comment-video card (task-detail-sheet.tsx:5732-5770) with its processing state. Checks: paste a copied clip link and assert the card shows the clip's title and plays; paste a foreign URL and assert it stays a link. Break patches: the route ignores the token; the paste handler falls back to plain text.

### `resume-defects/s4-composer-email` — open, large

**Section 4: 'The composer posts as Email' is still unbuilt. The mode menu now exists with Email disabled, a suite locks that state in, and the ledger's 'today' text is stale**

*Evidence:* task-detail-sheet.tsx:7202-7260: the `Comment ▾` DropdownMenu has comment-mode-item-comment (ticked) and comment-mode-item-email, which is `disabled` and data-available="no" with no onSelect, carrying the reason catalogs.ts:2717-2718 'Rundesk cannot send a comment as email...'. test/e2e/task-mentions.mjs:357-400 asserts exactly this disabled state ('Comment carries the tick and Email is not selectable', and the reason length is over 30), so building the feature must rewrite those checks. The ledger entry docs/video2-reaudit.md:1252-1270 still says 'There is no mode switch on the comment composer', which is stale now that the switch exists. The row is M at docs/video2-reaudit.md:1532. Plumbing status, verified: the inbound threading exists (email-to-task.service.ts:28-33 and 184-187). Missing: replyTo, cc and bcc on send() (email.service.ts:584-589); a channel column (comments.ts:16-29); any route that sends a composed body; outbound Message-ID recording (resume-8-reply-routing). ClickUp research: in the task comment box, click Comment, then choose Email; fill To/CC/BCC, subject and body, add attachments and a signature, then Send (or schedule it). Responses appear in the task's activity feed, and a reply to an emailed comment can be sent as a comment or as an email (help.clickup.com 'Use Email in ClickUp', 'Create tasks and comments via email').

*To close:* Build to ClickUp. Selecting Email switches the composer into an email form (To, CC and BCC with member and contact suggestions, Subject, body, attachments). Add a route such as POST /tasks/:id/comments/email. It sends through the extended send() with Reply-To set to the task's +task- address, stores the comment with channel='email' and the metadata, and records the outbound Message-ID. The thread renders email comments distinctly, and inbound replies land as channel='email'. Rewrite the task-mentions checks to assert the working mode, not the disabled one. Add e2e checks against a captured transport (the email itself, its Reply-To, and the stored channel read back in the thread), and a break patch for each (drop replyTo; store the channel but do not render it). Update docs/video2-reaudit.md:1260-1270 and the row at 1532.

### `commit-log/log-3943965-1` — open, medium

**Credit meter, Credits tab, usage-trend chart and the metered 'uses have expired' paywall are all unbuilt; the data for them already exists**

*Evidence:* Commit 3943965 found its own blocker stale: ai_usage records every call, and ai.controller.ts:183 @Get('usage') serves it. It re-blocked the work on 'allowance, reset policy, Add credits ... no frame specifies', which is the reason the owner no longer accepts. workspace-settings-page.tsx:1304-1318 shows usage tables only. There is no trend chart with a limit line, and grep for 'credits left', 'creditMeter' and 'usage-trend' finds nothing in apps/web/src. Ledger §6 line 2819 still has the usage-trend chart as STILL OPEN (e07683b, d8d1e04). Row 788's metered state was blocked on the same reason (446cdba). Row 869 counts Credits as M, while §3 lines 889-891 call Credits a decision.

*To close:* Research ClickUp's AI credits: the allowance per plan, reset timing, Add credits, and the usage chart with its limit line. Decide with the owner whether the §3 'no in-app currency' decision still stands. Build the usage-trend chart now, since §6 already says it is separable from credits. Then build the meter and the metered paywall state on top of ai_usage.

### `commit-log/log-601eacc-1` — open, medium

**The cover picker's Search tab is still absent because no photo provider is configured**

*Evidence:* Commits 601eacc, 39863ff, 2ae54b4 and 716d25c keep the tab absent. cover-image-picker.tsx:23-53 says 'SEARCH IS DELIBERATELY ABSENT ... if a photo provider is ever configured'. Ledger row 739 is P. 'No credential configured' is the same kind of reason that went stale twice in this window: storage, fixed by s3-stub, and the model, fixed by model-stub.

*To close:* Research ClickUp's cover Search (it searches a stock-photo library). Add a provider behind an environment variable, give the lanes a stub for it the way s3-stub works, and build a Search tab that really searches, with checks and break patches.

### `commit-log/log-716d25c-1` — open, medium

**'+ Add a new section' in Calendar settings › Sidebar is not built**

*Evidence:* Commits 716d25c and 41f0ec5, and ledger row 835: 'blocked rather than pending ... what a NEW section would contain is a decision no frame makes'. git grep for 'add a new section', 'newSection' and 'customSection' in apps/web/src finds no such control. The rail sections are the fixed list in planner-settings-dialog.tsx.

*To close:* Research how ClickUp's Planner or Calendar sidebar custom sections work: their name and the rule for what falls into them. Build storage for them, show them in the rail, and add checks.

### `harness/model-lane-routing-unbuilt` — partly-fixed, medium

**No suite can be routed to a lane with or without a model; the model stub is wired but no suite exercises it**

*Evidence:* lane-env.sh:126-132 says 'Wiring that choice into the dispatcher is the next piece of this work and is NOT done'. Confirmed open. run-plan.sh:47-68 hands a set to any lane that is free and unlocked, and it never sources lane-env.sh or calls lane_has_model. No suite declares a lane need: a git grep for RUNDESK_LANE_MODEL, needsModel, 'Lane:' and LANE_NEEDS finds only two comments, at ai-create-containers.mjs:343 and ai-answer-rendering.mjs:532. wt-break.sh applies lane_model_env only inside restart() (:105 and :116), and restart runs only on a sync or an API patch. So a lane keeps whatever model configuration its last launcher had. create-menu-ai.mjs:193,323,489 and task-ai-bar.mjs:95,126,245 assert 'not configured' and would red their baseline on a model lane (wt-break exit 5). No suite drives the model stub's /__control seam: the only __control users in test/e2e are the storage stub in attach-on-create.mjs:321 and task-cover.mjs:512,598. So the modelConfigured===true branches in ai-create-containers and ai-answer-rendering have never been measured. Stale around it: fleet-restart.sh:120-121 says 'Off unless RUNDESK_LANE_MODEL=1 ... the six suites'. =1 now means lane 1 only (lane-env.sh:156-160), and there are four suites. lane-env.sh:89-95 says all four flip, but its own :111-116 says two were converted. docs/video2-reaudit.md:6665-6674 says 'It is wired into no lane' and 'Six suites'.

*To close:* Smallest correct routing: (1) each suite declares its need in a greppable header, e.g. `// Lane: no-model` on create-menu-ai and task-ai-bar, and `// Lane: model` on any suite that stages __control/next. (2) run-plan.sh sources lane-env.sh and skips a lane whose lane_has_model answer differs from the suite's declared need. If no lane in $LANES matches, it refuses loudly with a new exit code, so the plan is never silently burned. (3) wt-break.sh, before the baseline, asks the lane's GET /api/v1/ai/status and refuses (new exit) when `available` differs from lane_has_model, or else restarts. (4) A checker asserts that every suite asserting 'not configured' in a chk declares no-model. Then write the model-path checks against model-stub's __control/next, since the frames-do-not-specify reason is no longer accepted.

*Partly fixed, 24 September (with `found-24-sep/model-patches-measured-without-a-model`):* the break runner now chooses for a SET. A set with a patch whose header says it reddens only where a model answers runs with one, baseline included. The runner's stamp of what a lane serves carries the model, so a lane is re-synced whenever its model differs from what the set asked for, and no longer keeps its last launcher's configuration. `check-model-lanes.sh`, 5 of 5 mutations. What is left is routing by SUITE: (1), (2) and (4) above, so that an invoker who puts every lane on a model (`RUNDESK_LANE_MODEL=all`) cannot send `create-menu-ai` or `task-ai-bar` to one. And the model-path checks against `__control/next`. Since this row was written, `create-ai-results` stages the planner's answer by route rather than through the stub, and `workspace-read-access` reads the stub's `__control/seen`.

### `ledger-rows/row-1962` — open, medium

**Calendar Automations (which tasks sync, to which calendar) — held by §3 parking, which is a 'walkthrough never explains' reason**

*Evidence:* reaudit.md:1962-1991 (P, 'contested' against §3). planner-settings-dialog.tsx:66-73 parks Automations because 'the explanation was never given'. Yet frame 14:32 draws the page: the 'Sync ClickUp tasks to Google Calendar' card, the empty state 'Pick a list, folder, or space…' and '+ Add sync'. calendar-sync.service.ts:71-101: pushTask sends every due-dated, non-archived task to every connection, with no scope table and no off switch.

*To close:* Research ClickUp's Calendar Automations. Add a sync-rule table (scope = list/folder/space, target calendar), make pushTask read it, and add the Automations settings page. The default becomes 'nothing is syncing', as the frame shows.

### `ledger-rows/row-745` — open, medium

**@ picker Brain section and Agents — still absent**

*Evidence:* reaudit.md:745 says Brain and Agents are 'blocked rather than pending'. task-detail-sheet.tsx:299-305: MentionTab is 'people'|'tasks'|'docs'|'whiteboards'|'locations'|'channels', and the comment refuses Brain/Agents because 'The Brain² hub is a recorded decision'. The AI service and dock exist (see row-743), so an @Brain mention that asks the AI in the thread has something to call. Agents have nothing: no agents schema or module.

*To close:* @Brain: research how ClickUp's @Brain answers in a comment thread, then build it on ai.service + comment create, measured on a model-stub lane. Agents: wait for row-852's Super Agents.

### `ledger-rows/row-788` — open, medium

**Paywall's metered 'uses have expired' state (B* remainder) — absent, held only because frame 09:30 shows no allowance or reset**

*Evidence:* reaudit.md:788 B*: the metered state is 'blocked on the reference'; reaudit.md:2887-2891 repeats that. Tree: plans.constants.ts:40-55 has PLAN_FEATURES ['teamView','boardExport'] and PlanLimits {maxMembers, maxProjects} only. A grep for expired/usesLeft/feature_uses across feature-gate.tsx, the plans module and billing schema finds nothing. Parts that exist: plan-feature.guard.ts (server refusal), FeatureGateDialog.

*To close:* Research ClickUp's limited-uses model for Free-plan features (the allowance and whether it resets). Add a per-workspace per-feature use counter incremented by the guard's allowed path, and render 09:30's state (preview, sentence, one Contact admin button) when the counter is exhausted.

### `ledger-rows/row-835` — open, medium

**Planner sidebar '+ Add a new section' — absent, held only because no frame says what a new section contains**

*Evidence:* reaudit.md:835 (P): 'blocked rather than pending … what no frame supplies is what a NEW section would contain'. planner-settings-dialog.tsx:233-246 fixes RAIL_SECTIONS at five; :618-630 renders show/hide/reorder over them and has no add control. Parts that exist: the `railSections` planner setting, and saved-filter storage in packages/db/src/schema/list-filter-presets.ts and saved-searches.ts.

*To close:* Research how ClickUp's planner sidebar 'Add a new section' works (custom section contents and rule). Store custom sections next to railSections and render them in the planner rail.

### `ledger-rows/row-845` — open, medium

**Task menu 'Add to ›' — absent, held only because no frame opens the submenu**

*Evidence:* reaudit.md:845 and 2905-2936. Task menu testids (task-detail-sheet.tsx:1619-1788) run from description-history to delete, with no add-to. Parts that exist: tasks.list_id is a single notNull FK (tasks.ts:17), so tasks-in-multiple-lists would need a join table; sprint_tasks join (sprints.ts:22); user_priorities (priorities.ts:32); favorites.

*To close:* Research ClickUp's 'Add to' submenu contents and build to them. If it includes a list (tasks in multiple lists), that is a new join table plus list-read changes. Items like sprint or priorities reuse existing tables.

### `ledger-rows/section3-team-analytics` — open, medium

**§3 'Team analytics' is held only because 'she never opens it', and a suite enforces its absence**

*Evidence:* reaudit.md:892-893: 'the frames list the tab, nothing is behind it, she never opens it. Guarded against by teams-destination.mjs'. teams-destination.mjs:16, :212-235 asserts Analytics must NOT appear. workspace-teams-page.tsx:22-24 and :218-224 give tabs teams/people/chart only. Under the new policy this is an unbuilt feature, and building it will redden teams-destination.mjs by design. Parts that exist: reports workload and activity endpoints, and the time-entries and people modules.

*To close:* Research ClickUp Teams Hub Analytics and build it over the existing reports aggregators. Replace the absence check in teams-destination.mjs with a check of the new tab. Record the row in §2 so it is counted.

### `commit-log/log-4ad25f6-1` — open, small

**The rotating composer placeholder (frames 16:30-16:45) was built and then reverted; the reason for reverting has since gone away**

*Evidence:* Commit 4ad25f6 reverted the rotation because GET /ai/status answers available:false on every lane, so no suite could see it. It said wiring model-stub.mjs would make it measurable. Commit 6fbd79b then wired the stub behind RUNDESK_LANE_MODEL (lane-env.sh:161-177). ai-panel.tsx:1817-1822 still has three fixed placeholder states (working, unavailable, inputPlaceholder) and nothing rotates. Commit 4dacd13 also lists it as absent.

*To close:* Rebuild the four-sentence rotation on the resting state. Measure it on a lane started with RUNDESK_LANE_MODEL, and write a break patch that freezes the rotation. This depends on log-ad00a7c-1 so the suite lands on a lane that has a model.

### `commit-log/log-6b140c5-1` — open, small

**The 'Create Task ▾' chevron menu is missing**

*Evidence:* Commits 6b140c5, 4840344 and 446cdba held this back as 'blocked on the frames'. Ledger row 730 is marked B* with 'Create Task ▾ is the part still missing'. quick-create-modal.tsx:1596 has only the quick-create-submit button, with no chevron segment or menu.

*To close:* Research which options ClickUp's Create Task chevron offers, then build the split button with each option wired to real behaviour, plus checks.

### `ledger-rows/row-730` — open, small

**Comment ▾ is built (B*), but the 'Create Task ▾' menu is still missing, held only because no frame opens the chevron**

*Evidence:* reaudit.md:730 B*: the Email mode is listed but disabled with its reason, and 'Create Task ▾'s menu has no frame behind it'. Tree: task-detail-sheet.tsx:7224-7260 is the comment-mode menu (Comment ticked; Email `disabled`, data-available=no, with comment-mode-reason-email). quick-create-modal.tsx:1593-1600 `quick-create-submit` is a plain submit button with no chevron and no menu. The Email half depends on row-1252.

*To close:* Build the Create Task split button with the menu ClickUp actually offers (research lens: e.g. create-and-open / create-and-start-another / create-and-duplicate). Enable the Email mode once row-1252 lands.

### `resume-defects/row-730-create-task-chevron` — open, small

**Ledger row 730's 'Create Task ▾' is recorded as 'Blocked on the reference', so under the new policy it is simply unbuilt**

*Evidence:* docs/video2-reaudit.md:730 (B*) says '"Create Task ▾" is the part still missing, and its MENU has no frame behind it… Blocked on the reference'. :2822 repeats this. quick-create-modal.tsx:1586-1600 has Cancel and a plain `quick-create-submit` button with no chevron. A grep of apps/web/src for createAndOpen/createAnother finds only the workspace-index string. ClickUp research (help.clickup.com 'Create tasks and subtasks on mobile' and 'Create a task'): the Create Task split button offers Create and close, Create and open, Create and start another, and Create and duplicate. The same row must also be rewritten by the s4-composer-email work. This may belong to the blocked-rows lens rather than this one.

*To close:* Build the chevron menu to ClickUp's four options: close, open the created task's sheet, reset the form keeping list and location, and keep the content for a duplicate. Add checks that each option leaves the modal and route in the stated state and creates exactly one task, plus a break patch per option. Rewrite row 730 without the 'blocked on the reference' reason.

### `ledger-rows/row-743` — open, small

**Task header 'Brain²' button — absent; the reason 'the hub does not exist' is stale because the AI dock it would open exists**

*Evidence:* reaudit.md:743 `| M | Task header "Brain²" button — deliberate: the hub does not exist |`. task-detail-sheet.tsx:1445-1459 builds only the Created chip, and :1452-1454 says 'NOT "Brain²" beside it: that button leads to a hub this product does not have'. That hub now exists at /app/:ws/ai (workspace-ai-page.tsx), and every route has a dock: routes/app.tsx:78 aiAsk state, :91-94 `askAi(question)` opens the dock and asks, :173-190 `<AiPanel currentView=... ask=aiAsk persist>`. The same stale premise is repeated in TaskAiBar's comment at task-detail-sheet.tsx:577-581.

*To close:* Add the header button so it opens the shell AI dock with the task as context, using the same askAi/currentView seam the palette uses. Get the exact ClickUp behaviour (opens Brain scoped to the task) from the ClickUp research lens. Measure it on a model-stub lane. Update the stale comments.

### `ledger-rows/row-751` — open, small

**'Brain' in the comment '+' menu — absent; an AI destination already exists (the comment AI panel), so the reason is stale**

*Evidence:* reaudit.md:751 `| M | "Brain" in the "+" menu — the Brain² hub does not exist |`. CommentPlusMenu (task-detail-sheet.tsx:7298+) renders assign, clip, mention-task, file, slash, emoji, new task/doc/whiteboard and no Brain. The comment AI panel exists: task-detail-sheet.tsx:6982-6995 `comment-ai-panel` (instruction in, draft out, Keep to apply), opened today by a space on an empty composer. The menu's header comment at :7285-7291 is itself stale: it says 'EIGHT are here' and that slash commands are absent, but `comment-plus-slash` is rendered.

*To close:* Add a 'Brain' item that opens comment-ai-panel (ClickUp research for any extra behaviour). Correct the CommentPlusMenu header comment.

### `ledger-rows/row-850` — open, small

**Add to a colleague's priorities — refused on purpose; the frame's prompt names the assignee, so ClickUp research should settle it**

*Evidence:* reaudit.md:850 (M, 'the write takes no :userId, deliberately'). people.controller.ts:100-119: PrioritiesController writes only the caller's own. Reading someone else's already exists at people.controller.ts:90-97 (GET /people/:userId/priorities). task-detail-sheet.tsx:2611-2635 shows the prompt only when `userId === currentUserId`.

*To close:* Decide from ClickUp's behaviour whether assigning someone else offers to add the task to THEIR priorities. If yes, add a permissioned write, for example allowed to managers or the assigner of a task they can see.

### `found-24-sep/workspace-audit-log-not-in-settings` — open, medium (unbuilt; found fixing the console's audit log)

**A workspace's admins cannot read its audit log: the web shows it only in the super-admin console**

*Evidence:* `GET /workspaces/:id/audit-logs` and its export are guarded by `WorkspaceAdminGuard`, so a workspace admin may read them. The only page that reads them is `/app/admin/audit`, and `/app/admin` lets in a super-admin only. ClickUp puts the audit log in the workspace's own settings, for its owner and admins (an Enterprise feature there), with filters by date, event and user, and a CSV export.

*To close:* research ClickUp's audit log page — its event categories, filters and export — then give workspace settings an "Audit log" tab for owners and admins that reads the same routes as the console page. A suite: a workspace admin reads their own workspace's events and not another's, and a member is offered no tab.

## Ledger rows still open — 18

### `harness/ai-rows-blocked-on-empty-key` — open, large

**Ledger rows still give 'ANTHROPIC_API_KEY is empty here and in CI' as the reason the AI field types and AI surfaces are unbuilt or refusal-only**

*Evidence:* docs/video2-reaudit.md:642 ('eight of the ten need a language model and ANTHROPIC_API_KEY is empty here and in CI') and :719 (row P, the 10 absent field types: Summary, Custom Text, Custom Dropdown, Progress Updates, Translation, Sentiment, Categorize, Action Items, plus Relationship and Button). Also :727 (row B: the task AI bar ends in 'not configured'). The same ledger at :2843 says 'The ANTHROPIC_API_KEY half of that reason is now known to be wrong', and scripts/e2e-lanes/model-stub.mjs plus lane_model_env (lane-env.sh:170-177) now supply a model to a lane. Under the owner's policy these rows are UNBUILT, not blocked.

*To close:* Relabel these rows as unbuilt. Build the eight AI field types, and Relationship and Button, to ClickUp's documented behaviour. Measure them on a model lane through model-stub (this depends on model-lane-routing-unbuilt).

### `resume-defects/resume-5` — partly-fixed, large

**Gantt ledger row: the Today part is now true, but on a different surface from the one the frame shows. Zoom, drag and critical path have no check, and there are now two Gantts that have drifted apart**

*Evidence:* Ledger docs/video2-reaudit.md:789 reads `B | Calendar view, Gantt (today line, zoom, drag, critical path)` and names no closing suite. Line 790 reads `B | Gantt: Auto fit, week numbers, collapsible panels, local export`. Neither wording has changed since 39863ff. The Today control now exists and is checked, but only on the WORKSPACE timeline page: workspace-timeline-page.tsx:219-223, 290, 333 (goToToday), 630 (data-testid timeline-today) and 869 (timeline-today-line), checked by gantt-controls.mjs:528-600. Breaks 13 and 14 redden it (/tmp/claude-0/brk-gantt-controls-13-today-noscroll.log, -14-today-onceonly.log), and the 8083f88 baseline was 29/0. But docs/video2-frame-observations.md:230,245-247 places the 09:40 Gantt in the list's five view tabs (line 206). The list's own Gantt tab renders a different component: app.$workspaceId.$spaceId.$projectId.$listId.tsx:3538-3539 renders GanttView (6005-6013). That component has zoom as Day/Week/Month buttons (6307-6308, 6438-6456), a today line only when today is in range (6425-6426, 6518-6523, which is the exact 'Today nowhere on the chart' problem the timeline page solved at 276-290), drag (6063, 6106) and critical path (import at 107). It has no Today button, no Auto fit, no week numbers, no collapsible panel, no export and no data-testid at all, so no suite can check it. Going the other way, the timeline page has no dependency arrows or critical path (grep for depend/critical finds only the comment at line 694). Zoom is used in gantt-controls only as a reset click (536), never checked to change px/day. Drag is unchecked on both surfaces. Critical path has no unit or e2e test (no *.test for apps/web/src/lib/gantt.ts). ClickUp research: the Gantt view defaults to a Week time period, has Auto fit and Export as PDF/PNG (Business plan and up), and a 'Show critical path' toggle that highlights the path in red (help.clickup.com Gantt view and 'Critical Path and Slack Time'). Rundesk's export is CSV.

*To close:* Re-read row 789 against the tree and split it. The Calendar half is closed by list-view-controls, per docs/video2-reaudit.md:1750-1760. For the Gantt half, choose one Gantt, preferably one shared component used by both the list tab and /app/:ws/timeline. Give the list tab the frame's toolbar (Tasks panel toggle, Today, Week ▾ time-scale dropdown, Auto fit, Export) plus week numbers and collapsible panels. Give the timeline page ClickUp's 'Show critical path' toggle and dependency arrows. Add testids and checks on the list tab for zoom (measured px/day changes), drag (a PATCHed start and due date that survive reload), critical path (the red set equals the computed longest dependency chain, and a patch that returns [] reddens it) and Today. Add break patches for each, and name the closing suite in the row. Decide and record whether Export follows ClickUp (PDF/PNG) or keeps CSV.

### `ledger-rows/row-1252` — open, large

**Composer posts as Email — absent (Email mode listed but disabled)**

*Evidence:* reaudit.md:1252-1269 (M); resume.md:247-249 and 253-257. email.service.ts:584-603: the private send() takes {to, subject, html, attachments} with no replyTo or cc. comments.ts has no channel column. The mode menu exists with Email disabled (task-detail-sheet.tsx:7242-7258). The inbound half exists: the email-to-task address (tasks.controller GET /tasks/:id/email-address).

*To close:* Add replyTo (the task's inbound address) and cc to send(), a channel column on task_comments that the thread renders, and a route that sends a composed body. Then enable the Email mode (it also closes row-730's first remainder).

### `ledger-rows/row-1307` — open, large

**A pasted clip link renders as a player — absent**

*Evidence:* reaudit.md:1307-1322 (M); resume.md:258-262. There is no onPaste or unfurl handling in task-detail-sheet.tsx. clips.controller.ts:10-37 has only GET list, POST presign and POST share. There is no clips table in packages/db/src/schema, so a link carries no clip identity. resume §3.7: Copy link expires in 24h and says nothing.

*To close:* Add a clips record plus a stable app route first, then paste detection that renders the clip card/player in comments.

### `ledger-rows/row-2294` — open, large

**The AI acts inside a connected app — absent**

*Evidence:* reaudit.md:2294-2321 (M). COMMAND_TOOLS (ai-command.ts:179-246, plus create_list/create_folder at :118-123 and :265) are all internal. ai-categories.ts:62-78 marks externalActions/externalSearches unsupported with reasons. Parts that exist: calendar-sync's Google event upsert, and the Gmail/SharePoint search providers. The §5 note that AiService injects SearchService and never calls it is FIXED: it was removed (ai.service.ts:915-921).

*To close:* Add connector tools, e.g. book a meeting via calendar-sync, and search/send via Gmail. Measure them on a model-stub lane with provider stubs.

### `ledger-rows/row-816` — open, large

**Import P row (7 of 10 named tools) is still accurate, and it contradicts the B 'Importers' row for the same frame**

*Evidence:* reaudit.md:816 (P): Basecamp needs its API, Confluence exports pages, Slack exports JSON, and Monday/Wrike .xlsx is not read. reaudit.md:817 (B) covers the same submenu and says 'every row of frame 12:08's submenu is now either built or drawn with its reason'. Tree: spreadsheet-import.util.ts:115-230 has seven named presets; :241-277 UNSUPPORTED_SOURCES = basecamp/confluence/slack/documents; monday/wrike hints at :151 and :219 say 'save as CSV'. common/export/xlsx.ts is a dependency-free xlsx WRITER (zlib), so an xlsx READER is its inverse, the same move document import made.

*To close:* Merge 816 and 817 into one row. Build xlsx reading (ClickUp's spreadsheet import accepts XLS/XLSX). Basecamp and Confluence become API importers per ClickUp research. Confluence could target Docs through the existing doc importer.

### `ledger-rows/row-870` — open, large

**Image generation — absent; needs an image-capable provider**

*Evidence:* reaudit.md:870 (M). A grep for generateImage|image generation|dall-e|imagen|gpt-image in apps/api/src and apps/web/src finds only comments (ai-value-panel.tsx:29). ai-categories.ts:42-45 records images as having no code path. The only model client is Anthropic, which outputs no images.

*To close:* Needs the owner's choice of image provider plus a harness stub. After that, a tool in COMMAND_TOOLS and the 'images' category becomes countable.

### `suite-hygiene/task-mentions-pins-unbuilt-email-mode` — open, large

**task-mentions pins the unbuilt 'Comment ▾ → Email' mode as disabled; the ledger row's 'Create Task ▾' half is blocked for a reason the owner no longer accepts**

*Evidence:* task-detail-sheet.tsx:7242-7258 hard-codes `data-testid="comment-mode-item-email" data-available="no" disabled`, with the reason from catalogs.ts:2717-2718 ('Rundesk cannot send a comment as email'). task-mentions.mjs:378-409 asserts `data-available === 'no'`, that a reason is present, and that clicking it does not change the mode, so the suite locks the unbuilt state in. Ledger docs/video2-reaudit.md:730 (row B*) records Email as deliberately disabled and 'Create Task ▾' as 'Blocked on the reference … no frame in the video ever opens that chevron', a reason the owner's policy no longer accepts. I did not research ClickUp's behaviour in this session; the lens was suites.

*To close:* Research how ClickUp's comment composer handles Email and the Create Task split-button menu, build both, then rewrite task-mentions:378-409 to drive the built mode. Re-mark row B* as unbuilt until then.

### `product-siblings/assign-with-ai-picker-unbuilt` — partly-fixed, medium

**'⚡ Assign with AI' is marked B in the ledger but closed only via the API; the assignee picker still says it is not built, for a reason that is no longer true**

*Evidence:* The frame (docs/video2-frame-observations.md:396-399, 15:45) puts the control in the ASSIGNEE PICKER footer. docs/video2-reaudit.md:847 marks it 'B … closed by ai-assign.mjs', but :231-236 of the same doc says 'Not built there, on purpose'. task-detail-sheet.tsx:3256 and :3264-3270 say NOT built because the AI 'cannot CHOOSE the person'. That is stale: ai.service.ts:3036 suggestAssignee does exactly that, and ai.controller.ts:519-540 exposes it 'because the assignee picker is a menu'. The only callers of /ai/assignee-suggestion are test/e2e/ai-assign.mjs:99 and the chat tool (ai.service.ts:1814). No web code calls it (searched 'assignee-suggestion', 'suggestAssignee', 'assign with ai').

*To close:* Add the picker footer item: call GET /ai/assignee-suggestion?taskId, show the pick and its numbers, and assign on confirm. Correct the comments at :786-790 and :3256-3270 and the two contradictory ledger passages. Add a UI check to ai-assign.mjs.

### `ledger-rows/row-1060` — open, medium

**Create-modal Templates menu — 1 of 4 actions (Use Template only)**

*Evidence:* reaudit.md:1060-1088 (P). quick-create-modal.tsx:1478-1494: only a `<select data-testid=quick-create-template>`, instantiated at :868. Save as template exists only on an existing task (task-templates-section.tsx → POST from-task). The API has POST /, PATCH /:id (accepts a payload), from-task, duplicate and instantiate (task-templates.controller.ts:49-123), but the create modal has no one-press 'Create instantly' and no 'Update existing template'. The frame specifies all four.

*To close:* Replace the select with the frame's four-item menu: Use Template, Create instantly (instantiate with no form), Save as template (POST / with a payload snapshotted from the form), Update existing (PATCH /:id with that payload).

### `ledger-rows/row-1874` — open, medium

**Template Center Tags and Created-by facets — absent; created_by_id is written and never read**

*Evidence:* reaudit.md:1874-1896 (M). templates.ts:86 createdById, :103-104 relation. It is written at project-templates.service.ts:636, 675 and 812, and no other createdById reference exists in the module or in workspace-templates-page.tsx. There is no tags column.

*To close:* Add a Created-by facet (count in SQL like the others) and a tags column or join table with a Tags facet.

### `ledger-rows/row-1904` — open, medium

**Planner 'Sync now' — absent, and the service header claims a scheduler that does not exist**

*Evidence:* reaudit.md:1904-1927 (M). No RefreshCw, sync or pullEvents in workspace-planner-page.tsx. pullEvents' only caller is calendar-sync.controller.ts:108. There is no @Cron or @Interval in the calendar-sync module. calendar-sync.service.ts:25 says 'a manual or scheduled pullEvents call'.

*To close:* Add a sync button in the planner header that calls pullEvents for the user's connections, and either add a scheduled pull or correct the comment.

### `ledger-rows/row-739` — open, medium

**Cover 'Search' tab — absent; the reason (no image provider) still holds**

*Evidence:* reaudit.md:739 (P). cover-image-picker.tsx:20-58 records the decision and the grep. Re-running `grep -rliE "unsplash|pexels|pixabay|imageProvider" apps packages .env.example` finds only cover-image-picker.tsx. The frame does draw the tab, so this is not a 'no frame' block: it needs an external provider.

*To close:* Research which photo provider ClickUp's Search tab uses (believed to be Unsplash; the research lens should confirm) and add a server-side proxy with a key. Add a harness stub like s3-stub.mjs/model-stub.mjs so it can be measured. Needs the owner's decision to take a key.

### `commit-log/log-3100ba1-1` — open, small

**The create-modal placeholder and its ⚡AI button are built and tested, but the ledger counts the row as missing**

*Evidence:* Commit 3100ba1 (21 Sep 19:10) wrote 'Left M with the reason on the row'. Ledger row 791 still reads 'M ... Left M rather than built'. The feature went in three hours earlier in 666f15f (16:15). catalogs.ts:2211 has 'Add description, or write with ⚡AI'. quick-create-modal.tsx:703-734 and 1330-1351 wire a live button to /ai/task/generate. create-menu-ai.mjs:449-484 checks both. The frame citations also conflict: the code and the suite cite frame 10:04, while ledger §7 (line 2981) says 09:54-10:08 are all Board view.

*To close:* Re-extract frame 10:04. Then move row 791 to B, or strike it as answering no frame (as the tab-title countdown was), and let check-video2-counts recompute 148/11/14.

### `commit-log/log-6f62af6-1` — partly-fixed, small

**The end of the third Teams carousel card is our own wording and is not checked**

*Evidence:* Commit 6f62af6: the third card is cut off in the frame, 'its tail is written by me' and is not checked. catalogs.ts:2831-2835 reads 'Stay focused with Priorities' / 'Instantly know what each team is working on ...'.

*To close:* Research ClickUp's actual Teams empty-state card copy, use it in all four locales, and check it.

### `ledger-rows/row-2398-remainder` — open, small

**Teams 'All People' count badge — an open remainder inside a B row, counted nowhere**

*Evidence:* reaudit.md:2404 draws 'All People' with a count (2); :2416-2417 says 'The People count badge … is NOT part of this closure and stays open'. workspace-teams-page.tsx:218-241: the tabs teams/people/chart render a label and icon and no count.

*To close:* Add the member count to the People tab and a check for it. Record it as a B* or its own row so it is counted.

### `ledger-rows/row-780-remainder` — open, small

**Sidebar 'new folder here' dialog still posts only {name} — a second create path that the frame's dialog fields never reached**

*Evidence:* reaudit.md:780 (B) says 'The sidebar's own inline "new folder here" dialog still posts { name } alone — recorded rather than built, because it answers no frame'. workspace-sidebar.tsx:745-751 submitCreateFolder does `api(`/spaces/${...}/folders`, { method: 'POST', body: { name } })`. The quick-create Folder tab carries description, private and location.

*To close:* Point the sidebar entry at the shared Create Folder dialog (quick-create-modal FolderForm with initialSpaceId) instead of a second form.

### `ledger-rows/row-835-reorder` — open, small

**Planner rail 'reorder' is recorded as built but does not exist; the stored order is a mirror no reader honours**

*Evidence:* Frame 14:10 draws 'Show, hide and reorder…' with drag handles (video2-frame-observations.md:353-355). reaudit.md:835 and :6617 both say the five sections 'are built there with show, hide and reorder'. planner-settings-dialog.tsx:618-633 renders only a Switch per section, with no drag, sortable, move or arrow code in the file. workspace-planner-page.tsx draws sections in fixed JSX order (railOn gates at :1242, :1336, :1482, :1506, :1550) and reads settings.railSections only via .includes (:1011), so the array's order is read by nothing. The planner-settings.mjs checks (:314-328) assert only on/off. This falsifies the ledger's claim at reaudit.md:6624-6632 that 'Not one error ran the other way — nothing recorded as built turned out to be absent'.

*To close:* Add drag or up/down reorder to the Sidebar settings page. Render the rail in railSections order, with RAIL_SECTIONS as the default order. Add a check that a reordered rail renders in the stored order and survives reload. Correct rows 835 and 6617 and the 'one direction' paragraph.

## Stale documentation — 18

### `harness/break-queue-references-stale` — **closed**

*Closed:* `check-break-freshness.mjs` says `break-queue.sh` was deleted and names what reads these logs now; `break-report.sh` no longer calls the classifier "shared with the runner" — only it calls it, and `log-tree.mjs` holds the same four outcomes as `NOT_RUN`. `wt-break.sh`'s two, edited between plans: the first says `break-queue.sh` was the reader THEN, since deleted; the second names today's readers of a crashed run — `classify-break-log.awk` counts it CRASHED, `check-break-reddened.mjs` as a run that died before its totals (`log-tree.mjs` does not read the marker; checked, not assumed).

**Comments still name the deleted break-queue.sh, and break-report calls the awk classifier 'shared with the runner'**

*Evidence:* d840b55 deleted scripts/e2e-lanes/break-queue.sh, and its message says 'The three comments that referenced it now name the runner'. It changed only break-report.sh, classify-break-log.awk, never-run-plan.mjs and the ledger. wt-break.sh:450 and :461 and check-break-freshness.mjs:132 still name break-queue.sh. break-report.sh:11 says classify-break-log.awk is 'shared with the runner', but no runner uses it: the only callers are break-report.sh:87, :105 and :143.

*To close:* Repoint the comments at break-report.sh / classify-break-log.awk.

### `harness/fleet-up-cites-nonexistent-break-fleet` — **closed**

*Closed:* the sentence points at `wt-break.sh` (per-lane worktrees) and `refresh-dists.sh` (the `/tmp/claude-0/dist-<lane>` bundles `verify.sh` prefers), and says `break-fleet.sh` never existed.

**fleet-up.sh points readers at break-fleet.sh, which has never existed in this repository**

*Evidence:* scripts/e2e-lanes/fleet-up.sh:10-11 says 'Break tests, which must rebuild, get their own dist directory per lane — see break-fleet.sh.' `git log --all -- '*break-fleet.sh'` returns nothing, and `git grep break-fleet` finds only this line. The per-lane break worktrees are wt-break.sh, and the per-lane dists are refresh-dists.sh or verify.sh's /tmp/claude-0/dist-<lane>. The same header's :19 also cites sweep.sh (see sweep-drain-run-stale-tmp-copies).

*To close:* Repoint the sentence at wt-break.sh and refresh-dists.sh.

### `ledger-rows/ledger-defects-fixed-unmarked` — open, small

**'Defects found while checking' carries four entries fixed in code but not marked fixed (one explicitly says 'Not fixed')**

*Evidence:* (1) reaudit.md:2572-2580: ai-value-panel tiles outside the loading guard. Fixed: ai-value-panel.tsx:461-477 'DEFECT, FIXED HERE' plus ai-value-categories-skeleton. (2) reaudit.md:2581-2587: SearchService injected and never called. Removed: ai.service.ts:916-922. (3) reaudit.md:2588-2590: disabled input keeps the ask placeholder. Fixed: ai-panel.tsx:1817-1823. (4) reaudit.md:2641-2645: palette-more-types-menu has no Escape, '*Not fixed.*'. Fixed: command-palette.tsx:705-709 onEscapeKeyDown closes typeMenuOpen and preventDefaults the dialog close. Also reaudit.md:4599-4603 says container create is ungated and 'it is open', while resume.md:201-206 records it FIXED 21 September (assertCanCreateInSpace).

*To close:* Strike each one with the fixing location, so the open-defect list is only what is open.

### `ledger-rows/ledger-model-stub-stale` — open, small

**The ledger still says the model stub is wired into no lane and that six suites assert the refusal, which is the premise behind the placeholder revert and 'AI unmeasurable'**

*Evidence:* reaudit.md:2876-2882 says 'Not wired into the lanes, deliberately'. reaudit.md:6664-6674 says 'It is wired into no lane' and 'Six suites assert the AI-unavailable state'. scripts/e2e-lanes/lane-env.sh:88-175 wires it per lane (RUNDESK_LANE_MODEL=all | list | unset, lane_model_env exports ANTHROPIC_BASE_URL) and counts FOUR suites / 21 assertions. Two are already converted (ai-create-containers 33/33, ai-answer-rendering 51/51, run both ways). Commits 6fbd79b and ad00a7c. What is still genuinely open, per lane-env.sh:131-132: 'Wiring that choice into the dispatcher is the next piece of this work and is NOT done'.

*To close:* Rewrite both ledger passages to the current state and name the one remaining step (dispatcher routes create-menu-ai/task-ai-bar to no-model lanes, the rest to model lanes). That step is what unblocks the rotating placeholder (row 853) and the AI field types (row 719).

### `commit-log/log-666f15f-2` — open, small

**The ledger's B* legend still says those suites have never been run or registered**

*Evidence:* Ledger lines 801-810 say the B* suites 'have not been run' and 'are not registered in ci.yml'. list-customize and list-assignee-filter, cited on the B* rows, are in ci.yml, and resume :94 lists list-customize as a green baseline (762c22d: 'Every suite is registered'). §4 line 947 already uses B* to mean something else: 'built, with the remainder written down'.

*To close:* Replace the legend with the §4 meaning and drop the not-run claim.

### `commit-log/log-ad00a7c-2` — open, small

**Comments still describe the model flag as it was before it changed**

*Evidence:* fleet-restart.sh:120-121 says 'Off unless RUNDESK_LANE_MODEL=1 - see lane-env.sh for the six suites'. Commit 7c4ac44 re-measured it as four suites, and commit ad00a7c changed =1 to mean lane 1 only. lane-env.sh:88 ('GATED ON RUNDESK_LANE_MODEL=1') and :129 ('RUNDESK_LANE_MODEL=1 is read per lane') still present =1 as the on-switch. ai-create-containers.mjs:343 and ai-answer-rendering.mjs:532 use the same spelling.

*To close:* Reword all of these to the list syntax (all, or a list of lane numbers) and to the count of four suites.

### `commit-log/log-e44622e-1` — open, small

**The handoff doc docs/video2-resume.md is stale again in many places**

*Evidence:* Commits e44622e and 10b4086 corrected this doc once already. Now: :41 says '113 suites ... ALL 113 are registered' (there are 115 suite files and doc-import is unregistered). :66-74 has a table of 50 green, 1 refused, 6 unreadable and 44 not run, while check-break-reddened reports 115 of 115 proven and 828 reddened. §3 #4 (:234-236) lists the timeline projectId as open, but commit 07d9208 settled it as not a defect and added a check (gantt-29). §6 :316-322 says 150 minutes and 98 suites and 'Split the job before adding the tenth', while ci.yml:428 is 180 and the job has 109 steps, unsplit. :185 and :285 recommend drain.sh. check-video2-counts guards only the headline count.

*To close:* Rewrite §2, §3, §5 and §6 from the checkers' current output, and consider guarding the suite and registration counts the same way the headline is guarded.

### `harness/log-tree-header-contradicts-body-rule` — **closed**

*Closed:* the header states what a run depends on as the code now asks it — suite, its `test/e2e/lib` helpers, the product files, the patch's own code (comments stripped) and a pending `# Re-run:` — and that `makeMeasurementCheck` is the one question all three instruments ask; freshness's copy of the old premise went with `planner-ignores-patch-body`.

**log-tree.mjs header and check-break-freshness still say the patch file is not a dependency**

*Evidence:* scripts/lib/log-tree.mjs:33-37 says 'WHAT A RUN DEPENDS ON: the suite ... and the product files the patch edits. Not the patch file itself'. The same file at :166-178 says 'THE PATCH'S OWN CODE IS A DEPENDENCY, AND ITS COMMENTS ARE NOT'. scripts/check-break-freshness.mjs:157-160 repeats the old premise ('The patch files themselves are left out') and acts on it. That old premise is what never-run-plan.mjs also still follows (see planner-ignores-patch-body).

*To close:* Rewrite log-tree.mjs:33-37 to state the body rule. Fix freshness in code as part of planner-ignores-patch-body, not by editing the comment only.

### `commit-log/missed-ci-meili-1` — open, small

**ci.yml claims the e2e job runs a real Meilisearch; it runs none**

*Evidence:* ci.yml:405-407 ('duplicating the Postgres + Meilisearch + build setup') and :576-578 ('a real Postgres and a real Meilisearch' for addressability-live) claim a Meilisearch. The job's services block (ci.yml:430-453) defines only postgres. A case-insensitive search for 'meili' across .github/workflows finds only those two comments, with no service and no MEILI environment variable. So search in CI always takes SearchService's database fallback, which means log-68c0345-1's 'unmeasurable' also covers CI.

*To close:* Either add a getmeili/meilisearch service and its environment variables to postgres-harnesses, and then point doc-import at indexing, or correct both comments so they stop claiming coverage that does not exist.

### `commit-log/missed-d840b55-1` — open, small

**d840b55 said every comment naming break-queue.sh was updated; four still name it as a live consumer**

*Evidence:* Commit d840b55 deleted scripts/e2e-lanes/break-queue.sh and says 'The three comments that referenced it now name the runner'. Yet syncup-live.mjs:259 and video-regression.mjs:1055 still say the summary line is kept because `scripts/e2e-lanes/break-queue.sh` parses it. wt-break.sh:461 says 'Named here so `break-queue.sh` can count it'. test/e2e/breaks/emoji-picker-2-data-inlined.py:28 says 'break-queue.sh counts a run with no summary as CRASHED'. In the same class, fleet-up.sh:11 sends the reader to 'break-fleet.sh', which `git log --all` shows never existed.

*To close:* Rename each reference to the real consumer (wt-break.sh plus classify-break-log.awk, or run-plan.sh), and fix the pointer in fleet-up.sh. Consider having check-suite or preflight fail on comments that name a script path that does not exist.

### `harness/resume-doc-harness-stale` — **closed**

*Closed:* §2's drain paragraph had already been corrected (run-plan.sh, never-run-plan.mjs, drain.sh deleted) and §5 is accurate; §6 now gives the dated count (117 when this closed, 119 after `webhook-access` and `permission-guards`), about 1.1 minutes each, `timeout-minutes: 180`, and points at the job comment and `check-suites-registered.mjs` instead of a count that drifts.

**video2-resume.md describes retired harness state**

*Evidence:* docs/video2-resume.md:185-187 says 'drain.sh walks that queue ... The patch scripts themselves live in the scratch directory and do NOT survive the container'. 833 patches are tracked in test/e2e/breaks, and drain.sh runs /tmp copies (see sweep-drain-run-stale-tmp-copies). :284-288 presents drain.sh as current. §6 at :316-322 says postgres-harnesses runs 98 suites under a 150-minute timeout. ci.yml now has 115 test/e2e invocations and timeout-minutes: 180 (ci.yml:428).

*To close:* Rewrite §2's drain paragraph and §5 to point at run-plan.sh, chain-plan.sh and never-run-plan.mjs. Update §6's numbers.

### `ledger-rows/row-2270` — open, small

**§5 row 2270 (P, project-status per-status breakdown) is STALE: the breakdown is built and measured**

*Evidence:* reaudit.md:2270-2286 says P: 'There is no per-statusCategory count anywhere in the context'. Tree: ai.service.ts:176-201 WorkspaceStatusBreakdown and :230-241 emit 'Task status breakdown (EVERY task in this workspace…)' with by-category and by-status lines. It is wired into the chat context at :1996 and :2018, workspaceStatusBreakdown is at :2041, and GET /ai/project-status is at ai.controller.ts:592-599. Measured by ai-create-containers.mjs:425-455. Built in 43f7b57 (2026-09-20). The §5 counts table (reaudit.md:2747) and §4's '4 P' in §5 (reaudit.md:937) still count it P.

*To close:* Re-read and mark it B, keeping only the model-written answer as a remainder, which can be measured on a model-stub lane. Adjust §4 §5 split (P 4 -> 3 or fewer).

### `ledger-rows/row-2374` — open, small

**§5 row 2374 (P, AI busy state in words) is STALE: built and measured; only the frame's exact words differ**

*Evidence:* reaudit.md:2385-2388 says 'a spinner and nothing else' and that the disabled input keeps 'Ask Rundesk AI anything…'. Tree: ai-panel.tsx:523-570 AiBusyState (ai-busy-state, ai-busy-label, states thinking/acting/writing derived from stream signals). :1817-1823 shows 'Working on it…' while streaming and placeholderUnavailable when disabled. Measured by ai-answer-rendering.mjs:577-590 through route interception, so no model is needed. The remaining difference: labels are Thinking/Handling/Writing the answer (catalogs.ts:3691-3693) against the frame's Cookin'/Handling/Brain.

*To close:* Mark B (or B* with the label-wording remainder). Adjust §4. The ledger's separate defect at reaudit.md:2588-2590 (disabled input keeps the ask placeholder) is also fixed.

### `ledger-rows/row-791` — open, small

**Row 791 (M, create-modal placeholder 'Add description, or write with ⚡AI') is STALE: built, measured, and was already built when the row was written**

*Evidence:* reaudit.md:791 reads M: 'Left M rather than built: a string with no frame is a summary'. Tree: catalogs.ts:2211 'quickCreate.descriptionPlaceholder': 'Add description, or write with ⚡AI'. quick-create-modal.tsx:1331 uses it, and :1334-1345 adds a working ⚡AI button (quick-create-describe-ai, writeDescription.mutate) commented as frame `10:04`. It is measured by create-menu-ai.mjs:449-462 and break test/e2e/breaks/cma-14-old-description-placeholder.py. git: the string landed in 5494c0f (2026-09-21 16:03) and the suite in 666f15f (16:15). The row was rewritten to 'left M' in 3100ba1 (19:10 the same day), so it was wrong when written. The suite says frame 10:04 while the ledger says 09:54-10:08 are all Board view, a frame-citation conflict to settle. It is also one of §2's 9 M in the §4 table (reaudit.md:937).

*To close:* Mark row 791 B, closed by create-menu-ai (cite its check count), and move §2/§4 counts 9 M -> 8 M. Reconcile the 10:04 vs Board-view frame claim. Under the new policy ClickUp's own create-task modal settles the placeholder.

### `ledger-rows/row-793-796-798-799` — open, small

**Four B* rows keep an asterisk whose reason ('suite has not been run, not in ci.yml') is no longer true**

*Evidence:* The legend at reaudit.md:801-810 says the suites had not run and were not registered in ci.yml. Now: ci.yml:1748 runs list-customize and :1761 runs list-assignee-filter. Break logs show verified green baselines: /tmp/claude-0/break-list-customize-20260922-205727.txt '== BASELINE (no patch) 37 passed, 0 failed' at ea0b946a; break-list-assignee-filter-20260923-023405.txt '29 passed, 0 failed' at 8083f883. `node scripts/check-break-reddened.mjs` reports '115 of 115 suite(s) have a patch measured against this tree'. Rows 793 and 796 cite 'list-customize 29' while EXPECTED_CHECKS=37 (list-customize.mjs:59). §4 at reaudit.md:947 says 'the four marked B*', but §2 has six (730, 788, 793, 796, 798, 799). check-video2-counts.mjs passes because it checks letters, not the product.

*To close:* Mark 793/796/798/799 plain B with their suites and current counts. Delete or rewrite the B* legend. Fix the §4 'four' to match the two real B* rows (730, 788).

### `suite-hygiene/stale-env-premises` — open, small

**Suite headers, comments and harness notes still state 'no key' or 'no bucket' as facts about the lanes**

*Evidence:* Model: ai-answer-rendering.mjs:51-58 ('NO PROVIDER KEY EXISTS HERE, so /ai/chat 503s'), 551, 766-768. ai-create-containers.mjs:32-37 ('THE MODEL-FACING HALF 503s HONESTLY. There is no provider key in this environment'). Both suites were converted tonight (350743c, b5a52bc) but their headers were not. ai-activity-filters.mjs:22-25 and 119-121; ai-action-categories.mjs:31-33 and ai-value.mjs:148-150 ('a test environment has no API key, so no endpoint can create one'). Storage (lanes have s3-stub): syncup-live.mjs:229-236 ('no bucket is configured (upload-url -> 400)'), 224 ('the total is 58' while EXPECTED_CHECKS is 59 at 246), 1083, 1126-1128, 1143-1145. settings-depth.mjs:760-763 ('unconfigured here and in CI, so the library is empty everywhere'). task-attachments.mjs:21 ('R2 is not configured here or in CI'). comment-recording.mjs:215-216 ('R2 is not configured locally, so the presign step is skipped'). Harness: lane-env.sh:88 ('GATED ON RUNDESK_LANE_MODEL=1'; =1 now means lane 1 only, per 145-147), :89 ('FOUR suites'), :129. fleet-restart.sh:120-121 ('Off unless RUNDESK_LANE_MODEL=1 … the six suites').

*To close:* Restate each as configuration-dependent ('with no model configured …', 'CI starts no store; lanes do'), or delete the premise where the suite now asks /ai/status. Fix syncup-live's 58 to 59. Correct lane-env and fleet-restart to the list spelling and the true suite count.

### `ledger-rows/stale-reason-comments` — open, small

**Code comments still carry blocking reasons that are no longer true**

*Evidence:* task-detail-sheet.tsx:7285-7291: CommentPlusMenu says 'EIGHT are here' and that slash commands are absent, but comment-plus-slash is rendered. task-detail-sheet.tsx:577-581 and :1452-1454: 'Brain² HUB … does not exist', although the /app/:ws/ai hub and the shell AI dock exist. space-views.ts:59-63: 'The five Rundesk does not have (Map, Activity, Mind Map, Timeline, Workload)', although workload/timeline/mindmaps pages exist. calendar-sync.service.ts:25: 'manual or scheduled pullEvents', with no scheduler.

*To close:* Rewrite each comment when its row is built, or now, so the reason no longer blocks investigation.

### `harness/suite-reads-untested-claim-stale` — **closed**

*Closed:* the sentence now says rules one to five are line-based and that `check-suite-enders.mjs` holds their cases and breaks each rule.

**suite-reads.mjs still says rules one to five are untested**

*Evidence:* scripts/lib/suite-reads.mjs:19-21 says 'Rules one to five are still line-based and still untested, which is a gap named in the ledger'. check-suite-enders.mjs was added in 571c7f1 ('Rules one to five get a case file'), and check-suite-section-enders.mjs:163-176 describes those fixtures. The case file names rule one 16 times and rules two to five 2 to 9 times each, and preflight.sh:43 runs it with --mutate.

*To close:* Delete or correct the sentence.

## Stale documentation — 2

### `resume-defects/resume-4` — open, small

**Item 4 (timeline projectId) was resolved as a recorded decision plus a check; the handoff doc still lists it as open**

*Evidence:* docs/video2-resume.md:234-236 still lists it as an open defect. test/e2e/gantt-controls.mjs:193-230 records the reframing: the client is right not to send projectId, because the query has no window and projectOptions derive from the full rows. It then checks that the server narrows on it, using the run's own ids. The client still sends none (workspace-timeline-page.tsx:229 `/tasks/workspace/${workspaceId}/timeline`). The break gantt-29-projectid-ignored reddens it: /tmp/claude-0/break-gantt-controls.txt shows the baseline at 8083f883 at 29/0 and the patch at 28/1. Residue: tasks.service.ts:1832 getTimelineForWorkspace declares opts.from/opts.to, and nothing reads them (body :1834-1867). The controller (tasks.controller.ts:127-137) never passes them. That is a small mirror (class 2).

*To close:* Mark item 4 closed-by-decision in docs/video2-resume.md with the check's name (gantt-controls, the 'really narrows on projectId' check) and its break gantt-29. Either remove the unread from/to from the opts type or wire them to a query param with a check.

### `resume-defects/resume-6` — open, small

**Item 6 (sticky headers inside overflow-hidden) is fixed and has been observed green; the handoff doc's 'not observed' is stale**

*Evidence:* workspace-timeline-page.tsx:696 has Card glass with overflow-clip, and :804-811 is timeline-chart-viewport with maxHeight PANE_MAX_H and overflow-auto, holding the sticky header at :816-820. /tmp/claude-0/break-gantt-controls-20260922-090756.txt shows the baseline at bfe705d6 at 29/0, and the three sticky breaks redden: gantt-controls-15-sticky-unbounded 27/2, -16-sticky-notsticky 28/1, -17-panes-unsynced 28/1. /tmp/claude-0/break-gantt-controls.txt shows a baseline of 29/0 at 8083f883. docs/video2-resume.md:240-243 still says 'the fix has not been observed green'.

*To close:* Update docs/video2-resume.md item 6 to fixed-and-observed, citing the three reddening breaks. Keep the Workload page instance (resume-6-workload) and the list Table view instance below as the open residue of the same class.

## Other — 5

### `commit-log/log-39863ff-1` — open, medium

**Four recorded 'decisions' need owner confirmation: ChatGPT/Gemini, the three AI categories that can never be filled, AI Notetaker, Automations**

*Evidence:* Commit 39863ff 'DECISIONS RECORDED RATHER THAN QUIETLY BUILT'. ChatGPT and Gemini are listed and not selectable (ledger row 860). ai-categories.ts:76-78: images, externalActions and externalSearches are unsupported and print a reason. AI Notetaker (needs a meeting bot) and Automations (parked, [14:29]) are in §3. Automations was parked by the client, so it is not simply unbuilt. The rest are product decisions, not gaps in the frames.

*To close:* Put each one to the owner: which stay parked, and which to research and build now that frame silence is not an accepted reason.

### `harness/dist-brk-committed` — **closed** (one item with `commit-log/log-39863ff-2` below)

**A break-run web bundle (apps/web/dist-brk, 80 files) is committed and not ignored**

*Closed:* both directories removed from the repository — 1,838 files, 16 MB of API build and 6.7 MB of bundle — and `dist-*` added to `.gitignore` beside `dist`, which is why these slipped through. Before removing them: nothing tracked references either directory (`grep -rn dist-brk` outside them finds only this ledger), nothing else tracked matches `dist-*`, and no lane, script or workflow serves them, so whatever they contain could not have reached a deployment. A search of both for the signatures break patches leave (`Exception('No')` and friends) found none.

*Evidence:* `git ls-files apps/web/dist-brk | wc -l` gives 80. It was added in 39863ff. `git check-ignore apps/web/dist-brk/index.html` exits 1, because .gitignore:5 `dist` does not match dist-brk. No tracked file other than the bundle itself references dist-brk.

*To close:* git rm -r --cached apps/web/dist-brk and add `dist-*` to .gitignore.

### `commit-log/log-39863ff-2` — **closed** (the same files as `harness/dist-brk-committed` above; closed there)

**About 1,840 build-output files were committed under apps/*/dist-brk**

*Evidence:* git ls-files lists 1,758 files under apps/api/dist-brk and 80 under apps/web/dist-brk, all added in 39863ff (1,923 files changed, and the commit message does not mention them). Nothing references dist-brk (git grep outside those folders is empty). .gitignore line 5 ignores only 'dist'. The 'brk' suffix suggests a break-test build.

*To close:* Check whether the bundles contain any break patch, git rm them, and add dist-* to .gitignore.

### `commit-log/log-b7ee313-1` — open, small

**Whether a subtask may be merged into its own parent is still an unanswered product question**

*Evidence:* Commits b7ee313 and 13bc7b4 record 'a decision not taken'. task-merge.ts:133 and :149 still refuse with 'A subtask cannot be merged into its own parent', although the ledger says the stated reason never applied (lines 102-115).

*To close:* Research ClickUp's merge rules for a parent and its subtask, then allow or refuse to match, with a check either way.

### `product-siblings/other-get-routes-without-reader` — open, small

**Other GET routes with no web reader: digest preview, webhook deliveries, goal history**

*Evidence:* notifications.controller.ts:45-52 (digest/preview), webhooks.controller.ts:74-80 (:webhookId/deliveries) and goals.controller.ts:105-108 (goals/:goalId/history). Searches of apps/web/src (excluding i18n catalogs) for 'digest/preview', 'deliveries' and '/history' returned nothing. A route survey that matched full paths found 52 GETs without a literal caller, most of them helper-built URLs; these three were checked by hand.

*To close:* Either surface each one (a digest preview in the notification settings, a delivery log under webhooks, history on the goal page) or delete it.

