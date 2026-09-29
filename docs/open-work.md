# Open work — verified inventory, 23 September 2026

> **Current state and where to start: `docs/resume-2026-09-28.md`** — 354 items, 41 open, 7 partly fixed, 306 closed, counted from this file's headings on 29 September.

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

### `product-siblings/custom-role-permissions-unread-by-web` — **closed** (the second half, 25 September), medium

**GET /workspaces/:ws/roles/me/permissions has no caller; web gating ignores custom-role permissions the server enforces**

*Evidence:* custom-roles.controller.ts:37-47 returns the effective permission set. Searches of apps/web/src for 'me/permissions', 'roles/me' and 'permissions' found no caller. use-workspace-role.ts:5-22 gates on the base role only. The server enforces custom permissions, e.g. task-templates.controller.ts:51 @RequirePermissions('template.manage') and reports.controller.ts:19 'report.view.basic'. Failure: a custom role that revokes report.view.basic from a manager still gets the Reports UI, and every request 403s.

*To close:* Load me/permissions into the role hook and gate the permission-backed controls on it.

*A correction to the evidence:* a custom role cannot revoke. `effectiveCascade` gives a role its tier's keys and custom roles add to them — `GET /roles/me/permissions` is the union — so "a custom role that revokes report.view.basic from a manager" cannot happen. What did, measured on lane 1: the web offered a member Project (a 403) and a guest Space, Folder and Reports (403s), "Save as template" to anybody, and a key a custom role granted went unused.

*Partly fixed, 24 September.* The web reads the answer. `hooks/use-permissions.ts` fetches `GET /roles/me/permissions` (the role's keys and whatever custom roles add), and `can()` is null until it has loaded, so nothing is offered on a guess. What the API files under a key is offered only to somebody holding it:

- `project.create`: Project, in the Create menu and on a space's own "+" menu;
- `space.create`: Space and Folder in those menus, the sidebar's New space, and a space's New folder row. `requires` on each row of `lib/create-types.ts` is the one list both menus draw from;
- `template.manage`: "Save as template", and a template's rename and delete;
- `report.view.basic`: Reports, as the sidebar link and as the rail's entry.

The new suite `role-permissions-web` has 5 checks: a member; a guest; the member once custom roles grant `project.create` and `template.manage`; and Folder, with a guest who can see the space. That last check also reads the API's 403 for the guest's folder and the member's 201.

- Before, against the committed web code on lane 1: 1 of 5 passed. The Project grant passed only because everybody was offered Project.
- After: 5/5.
- The New space condition was added last and measured separately: it failed on the build without its gate.

`rpw-1..9`, each compiled. `rpw-2` was re-aimed within the day, because the Folder row made its anchor ambiguous. `form-2-rule-by-index` was re-aimed because the space's menu now draws the filtered list.

`space-wizard` stubs the whole API, and its catch-all answered the permissions read with `[]`. The Create menu then offered no Space, and the wizard could not be opened: 1 of 8, then a thrown fill. The stub now answers with every catalog key, read from `permission-catalog.ts` by `test/e2e/lib/permissions.mjs` so it cannot drift from the catalog: 23/23. None of the other fifteen suites that stub the API wholesale draws a gated control.

Regression on lanes 1 and 2: 29 of 30 at first (`space-wizard`, as above). Then 13/13 on the final build: `role-permissions-web`, `space-wizard`, `clickapps-plan-gating`, `sidebar-sections`, `space-create-menu`, `folder-create`, `create-menu-ai`, `space-wizard-views`, `ui-sweep`, `video-regression`, `video1-acceptance`, `no-dead-ends` and `command-palette`. In CI.

*Still open then:*

- `webhook.manage` (Integrations → Webhooks) and `sso.manage` (SSO). Workspace settings is admin-only in the router, so the API honours a custom role granting either key and the web never reaches it.
- `integrations.manage`. Slack's routes ask for a workspace admin, not the key the catalog says covers Slack. The App Center offers every member a Connect switch that `POST …/oauth/start` refuses without the key.

*Measured, 25 September, lane 5 (the new suite against HEAD's API and bundle):* the avatar menu and the palette offered every member Workspace settings, and the route sent a plain member back to `/app`. It sent the holder of `webhook.manage` back too, with no way to their webhooks, as it did the holders of `sso.manage` and `integrations.manage`. The holder of `integrations.manage` was refused Slack (403). In the App Center, the plain member's Slack switch was live, with Connect, and said nothing of who connects apps. Found on the way:

- The palette's Connect, for a search source not yet connected, went to Settings → General, which connects no source. `search-sources` checked only that the link was there.
- The SSO tab seeded its forms from the saved connection once, when the form mounted, and the connections loaded after that. After a reload a saved OIDC connection showed an empty issuer under an "Update" button, which would save those blanks over it (probe on HEAD's bundle: saved `https://idp-….example.invalid`, shown `""`, button "Update").

ClickUp (search snippets; the help pages cannot be fetched here): workspace-level connections are the owners' and admins', or a role's given the permission, and a member without it finds the connect option unavailable or disabled. Personal connections are a separate permission, which is `found-24-sep/personal-calendar-connect-needs-integrations-manage`'s question.

*Closed, 25 September:*

- **One answer to "may this person open settings, and which tabs"** (`hooks/use-settings-access.ts`): every tab for an admin; for anybody else, the tabs their keys serve (Integrations for `webhook.manage` or `integrations.manage`, SSO for `sso.manage`). The route asks it before the page renders (`permissionsQuery`, the same cache the hook reads). Anybody else goes to `/app`, and a holder lands on their own tab. The page draws only their tabs.
- **Every way in asks the same question:** the avatar menu, the palette's Settings command, the dock's tool, the browse list's link, the switcher's shortcut (People stays an admin's), and the collapsed rail.
- **The Integrations tab shows each card to its key:** Webhooks to `webhook.manage`, Slack to `integrations.manage`. The importer and the data export stay an admin's, as their routes are.
- **Slack's write routes ask `integrations.manage`** (`PermissionsGuard`), the key the catalog files Slack under, instead of `WorkspaceAdminGuard`. An admin holds it through their role.
- **In the App Center, a tile the viewer cannot connect is a request, not a switch.** The switch is live only for `integrations.manage`. The tile says in words who connects apps (four locales), and its action is Request access. A connected tile they cannot manage offers no action.
- **The palette's Connect** is offered by `integrations.manage` and opens the App Center at that source's own app (`?app=`, which prefills the catalogue's search).
- **The SSO forms wait for what is saved** (a skeleton while loading, keyed by the connection), and a failed read says so (`ssoTab.loadFailed`, four locales) instead of drawing empty forms.

The new suite `settings-role-grants`, 6 checks: a plain member and the holders of each key, the avatar menu, palette, dock, browse list, switcher and rail, the tabs and cards, a webhook made and an OIDC connection saved from Settings (each read back by SQL; the form after a reload, and a failed read), Slack by the key, and the App Center's Slack tile.

- Before (HEAD's API and bundle, lane 5): 0 of 6. Each check was measured failing on a condition it still holds; conditions were added afterwards (the sidebar's four ways in, the failed SSO read).
- After: 6/6.

`search-sources` gains a check (11): its Connect lands on the App Center, searched for Gmail. 10 of 11 before (it led to `/settings`), 11/11 after.

*Break run, lane 1 (0eea3b9):* `srg-1..18`, 18 of 18 reddened; `search-sources-4`, `-7`, `-8` and `-9`, 4 of 4; the re-aimed `app-catalogue-11` and `-13`, and `whk-10` and `-13`, 4 of 4.

`srg-1..18` and `search-sources-8..9`, one per mechanism, each compiled; `search-sources-7` and `-4` re-aimed at the key. `app-catalogue-11` and `-13` (the tile's action is `asks` now) and `whk-10` and `-13` (the webhooks card is inside its condition) were re-aimed at the new text. Regression on lane 5, 45/45: `settings-role-grants`, `search-sources`, `role-permissions-web`, `guest-create-menu`, `space-wizard`, `sidebar-sections`, `space-create-menu`, `activity-rail`, `addressability-live`, `app-catalogue`, `calendar-accounts`, `command-palette`, `focus-pill`, `folder-dialog`, `integration-error-card`, `panel-collapse`, `permission-guards`, `person-panel`, every planner suite (13), `settings-depth`, `settings-writes`, `stable-images`, `sw-api-cache`, `tab-title-countdown`, `task-cover`, `task-delete`, `team-schedules`, `teams-destination`, `webhook-access`, `video1-fast-items`, `no-dead-ends`, `ui-sweep`, `video-regression` and `video1-acceptance`. In CI.

*Not changed, recorded:*

- A member cannot connect their own calendar: `found-24-sep/personal-calendar-connect-needs-integrations-manage`.
- The Meetings page's Connect Calendar goes to a settings tab with no calendar: `found-24-sep/meetings-connect-calendar-goes-to-settings`.
- (Corrected 25 September: the Invite step is done once a second person is in, so no manager is ever shown it undone; it starts on Members now. Inviting asks `members.invite` — `role-editor-offers-unenforced-permissions`, its sixth group.) The onboarding checklist's Invite step opens Settings, General tab, and a manager, who may invite, is sent back. Invitations are role-listed (`['workspace_admin', 'manager']`) rather than asked of `members.invite`, which is `found-23-sep/role-editor-offers-unenforced-permissions`'s territory.
- A person's dock empties after their first page: `found-25-sep/dock-empties-after-the-first-page`, below.

*Found beside it:* `found-24-sep/guest-makes-lists-where-nothing-is-shared` (security) and `found-24-sep/create-menu-offers-guests-what-they-cannot-make`, both below.

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

### `resume-defects/resume-8-reply-routing` — **closed**

**The claim that replies to notification emails route by header is false: only inbound Message-IDs are ever recorded**

*Evidence:* apps/api/src/modules/email-to-task/email-to-task.service.ts:35-36 says 'Replies to notification emails are also routed by `In-Reply-To` / `References` headers'. But resolveReplyContext (345-362) matches those headers only against inbound_email_messages.messageId. The only insert into that table is for accepted inbound mail (line 524). Outbound notification mail (notifications.service.ts:1213 sendComment, going through email.service.ts:596-603) sets no Message-ID, records none, and sets no Reply-To, so a reply to a notification goes to `this.from` and cannot match. Header routing works only for replies to mail that was itself inbound.

*To close:* This closes with resume-8. Have send() set and return a Message-ID, and record outbound IDs with their taskId and listId, either in the same table with a direction column or in an outbound table. Make resolveReplyContext consult them. Set Reply-To on notification mail to the task's +task- address. Add an API-level test: send a comment notification, post a synthetic inbound reply whose In-Reply-To is that Message-ID, and assert a comment lands on the task. A patch that stops recording the outbound ID should redden it. Until then, correct the comment at :35-36.

*Closed:*
- A comment notification now gets a Message-ID of its own (`<notify.<random uuid>@<inbound domain>>`), kept with its task, list and recipient in a new table, `outbound_email_messages` (migration 0162). The id is random, so knowing a task does not let anybody guess one.
- Where the task's list takes email, the notification's Reply-To is the task's own address. `send()` hands both to the transport.
- `resolveReplyContext` looks in the new table before the inbound one. The header comment's claim, which was untrue, is true now and says so.
- The address format lives in one place, `task-address.ts`, read by the inbound handler, the task sheet's address and the Reply-To.

The new suite `email-reply-routing` uses no mail server. It reads the kept id and posts a reply to the inbound webhook, as a provider would. On lane 1 before, 1 of 4: nothing was kept, the reply was `rejected_no_alias`, and there was no Reply-To (the twin passed). After, 4/4:
- the id is kept;
- a reply naming it lands as the watcher's comment;
- a reply naming an id this server never sent lands nowhere;
- the Reply-To is the task's address once its list takes email.

The transport half is a unit test, `email.service.test.ts`, with a recording transport: the Message-ID and Reply-To reach `sendMail`, and neither is set when not given. Patches: `err-1` (nothing kept), `err-2` (replies match inbound mail only), `err-3` (no Reply-To) and `err-4`, a unit claim (the transport is never told); each compiled, and `err-1..3` reddened on lane 2, 3 of 3. Resolved-comment and mention notifications do not carry a thread yet. `err-4` reddens its unit test (`check-unit-claims`). Regression on lane 1, 13/13: `email-reply-routing`, `credential-reads`, `task-boundaries`, `task-menu`, `inbox-scope`, `notification-gaps`, `comment-thread`, `replies-inline-thread`, `activity-rail`, `task-depth`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

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

After, 4/4. `mtg-1..4`, each compiled, 4 of 4 reddened on lane 2. Regression on lane 1, 17 suites: `meeting-tags`, `planner-prefix`, `a61-meeting-record`, `meeting-access`, `object-key-boundaries`, `planner-upcoming-meeting`, `planner-settings`, `planner-appearance-toggles`, `focus-pill`, `tab-title-countdown`, `planner-rail`, `planner-views`, `planner-gates`, `local-dates`, `ui-sweep`, `video1-acceptance` and `video-regression`. 16 passed in the sweep. `planner-upcoming-meeting` threw: its stub answered every `/meetings` URL with meetings, the new tags route included, and the page cannot draw an object as a chip. Its stub answers the tags route now, and it passed 8/8 through `verify.sh` on lane 1. In CI.

### `commit-log/missed-docs-patch-1` — **closed** (66f518a; this row was not updated then)

**PATCH /docs/:docId is a fourth unchecked writer of spaceId and parentDocId, and it also writes undeclared columns**

*Evidence:* docs.controller.ts:190-206 declares the body as an inline type literal. The global ValidationPipe (main.ts:38-46, whitelist:true) does not validate or strip a body whose metatype is plain Object, so every key reaches the service. docs.service.ts:452 then does `const set = { ...patch, updatedAt: new Date() }` and :455 writes it with db.update(docs).set(set). Consequences: (1) spaceId and parentDocId from another workspace are written with no check, the same defect ea0b946 recorded for create and import, through a route the finder did not list. (2) Columns the body never declares, including workspaceId, createdById, publicShareId (docs.ts:27) and plaintext, are also written. (3) There is no cycle check, so a doc can be made its own parent or its descendant's child (searching the docs module for 'cycle' or 'descendant' finds nothing). assertDocAccess (:179-188) checks only membership of the doc's CURRENT workspace, not a role. Reasoned from the code, not run against a live API.

*To close:* Whitelist the patchable fields explicitly, rather than spreading the body. Refuse a spaceId or parentDocId outside the doc's workspace, and refuse a parent that is the doc itself or one of its descendants. Add an edit-permission check. Cover it with an e2e check that uses a second workspace, plus a break patch that restores the spread.

*Closed (66f518a, 23 September), found still marked open on 24 September while reading the visible-bug list:* every doc writer guards its space and its parent. Create, import and create-from-template call `assertDocSpace`, a space of the path's own workspace that the writer may reach, and `assertDocParent`, a doc of the same workspace, reachable and never a descendant. PATCH writes only the fields in `doc-update-fields.ts` and refuses the rest by name. The evidence is recorded under `product-siblings/docs-patch-mass-assign-public-share` above: `doc-boundaries` 17/17, `db-1..17`. Read again today in docs.service: create at `assertDocSpace` and `assertDocParent`, import and template at `assertDocSpace`, update through `writable` and both guards.

### `product-siblings/planner-block-prefix-cannot-clear` — **closed**

**The planner block-title prefix cannot be cleared back to the default**

*Evidence:* planner-settings-dialog.tsx:643 sends `blockPrefix: value.trim() || undefined`, which JSON drops. planner.service.ts:442-452 merges `{...currentPlanner, ...plannerOnly}`, so the old value stays. Failure: set 'Deep work:', clear the field and blur, reload, and it is still 'Deep work:'. The two readers disagree on '' (workspace-planner-page.tsx:964 uses ??, use-focus-tab-title.ts:248 uses ?.trim() ||), so the fix should send null, not ''.

*To close:* Send null. Server: on null, delete the key from the blob (or store null so both readers fall back).

*Closed:* an emptied box sends `null`, and the server keeps null, which both readers fall back from. A loop deleting null keys was written first and taken out: no check could tell it from storing null. The server now validates the prefix: text of at most 40 characters, or null. The new suite `planner-prefix` signs up its own person, since planner settings are per person. On lane 1 before, 1 of 2: "Deep work:" saved, then cleared, and after a reload the server and the box both still said "Deep work:". After, 3/3, with a third check for the new cap (41 characters refused, the held prefix kept). `ppx-1..3`, each compiled, 3 of 3 reddened on lane 2. Regression on lane 1, 17 suites: `meeting-tags`, `planner-prefix`, `a61-meeting-record`, `meeting-access`, `object-key-boundaries`, `planner-upcoming-meeting`, `planner-settings`, `planner-appearance-toggles`, `focus-pill`, `tab-title-countdown`, `planner-rail`, `planner-views`, `planner-gates`, `local-dates`, `ui-sweep`, `video1-acceptance` and `video-regression`. 16 passed in the sweep. `planner-upcoming-meeting` threw: its stub answered every `/meetings` URL with meetings, the new tags route included, and the page cannot draw an object as a chip. Its stub answers the tags route now, and it passed 8/8 through `verify.sh` on lane 1. In CI.

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

### `resume-defects/resume-6-list-table` — **closed**

**The list Table view's sticky header is the same sticky-in-name-only facade**

*Evidence:* apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx:4838 is `rounded-lg border bg-card overflow-hidden`, :4859 is `<div className="overflow-x-auto">` with no height bound, and :4862-4866 is data-testid list-table-head `sticky top-0`. Rows are bounded only when useTableVirtualization is on (≥120 tasks; TABLE_VIRTUALIZE_THRESHOLD :671; :4929-4931 `max-h-[70vh] overflow-auto`). The header sits outside that rows scroller, so it stays in place without sticky. Below 120 tasks, the header's scrollport is the unbounded overflow-x-auto div, and it scrolls away with the page. In neither mode does `sticky` do anything. The finder's scan missed this because it filtered on glass cards.

*To close:* Bound the table pane (max-height plus overflow-auto on the element that also scrolls horizontally) in both modes, with overflow-clip rather than overflow-hidden on the wrapper. Add a check in list-view-controls that scrolls a list of about 30 rows and measures list-table-head holding offset 0, plus a break patch that removes the bound.

*Closed:* one bounded pane (`max-h-[70vh] overflow-auto`) in both modes, the element that also scrolls sideways. It holds the header, so the header sticks. It is the virtualiser's scroll element too, so the virtualised mode has one scroller where it had two. The wrapper keeps `overflow-hidden`: `overflow-clip` was written first and taken out, because with the pane bounded the header resolves against the pane, and no check could tell the wrapper's overflow apart. The new suite `sticky-headers` scrolls whatever really scrolls under each header and reads where the header is afterwards. On lane 1 before, 0 of 2 for the table: scrolling the page moved the header from 261 to −139 with 30 rows. With 150 (virtualised), it moved from 261 to 94, and the last task was never drawn. After, both held at their pane's top, and the pane reached the 150th row. `sth-1` (the pane unbounded) and `sth-2` (the virtualiser watching no scroller), each compiled, and each reddened on lane 2. Regression on lane 1, 10/10: `sticky-headers`, `list-view-controls`, `custom-field-types`, `list-export`, `list-customize`, `local-dates`, `ai-assign`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `resume-defects/resume-6-workload` — **closed**

**The sticky-in-name-only header survives on the Workload heat map**

*Evidence:* apps/web/src/pages/workspace-workload-page.tsx:245-249: `<Card variant="glass" className="overflow-hidden p-0">` > `<div className="overflow-x-auto">` (no height bound) > `<div className="flex border-b ... sticky top-0 ...">`. This is the exact shape the timeline page's comment at 787-807 diagnoses: overflow-x:auto forces overflow-y to auto, making that div the header's scrollport, and an unbounded element never scrolls vertically, so the header can never stick. I scanned every .tsx file that uses variant="glass" or card-glass together with `sticky`. The only other hits are dashboard-widget-builder.tsx:266 (the card itself is xl:sticky, which is not this shape), docs-panel.tsx:1251-1253 (an overflow-auto wrapper whose height I did not confirm) and landing-page.

*To close:* Apply the timeline technique. Bound the heat-map pane with a max-height and overflow-auto, and use overflow-clip on the card if the rounded corner is still wanted. Add a check that scrolls the pane and measures that the header stays at offset 0, plus a break patch that removes the bound.

*Closed:* the heat map scrolls in a bounded pane (`max-h-[70vh] overflow-auto`), and its header sticks to it. The card keeps `overflow-hidden`, for the reason given under the list table: the pane decides it. The header row has a testid now (`workload-heat-head`). "Teammate" also heads the time-reporting table above it, and the suite's first reading measured that table by mistake. `sticky-headers`' heat-map check plants 30 teammates, more than the pane holds (15 fitted inside it, so nothing scrolled under the header). On lane 1 before: scrolling the page moved the header from 1542 to 1242. After, it held. `sth-3` (the pane unbounded), compiled, reddened on lane 2. Regression on lane 1, 10/10: `sticky-headers`, `list-view-controls`, `custom-field-types`, `list-export`, `list-customize`, `local-dates`, `ai-assign`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

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

### `product-siblings/task-sheet-refetch-storm` — **closed**

**The task sheet invalidates the ['task', id] prefix on every realtime event, then re-invalidates the children it already covered**

*Evidence:* The realtime handler at task-detail-sheet.tsx:1205-1211 invalidates ['task', taskId]. As a prefix that refetches every active sub-query (comments, attachments, activity, time, subtasks, dependency-graph, mention-candidates, email-address, description-history: 35+ keys under this prefix in the file). It then invalidates ['task', taskId, 'comments'] and ['activity'] again, which cancels and restarts them (react-query's default cancelRefetch). One updateTask emits task.updated (tasks.service.ts:3110-3115) and activity.created (:3101 via logActivity :575), and the mutation's own onSuccess invalidates the same prefix (34 sites, e.g. :1043, :1070, :1092). So a single priority change re-fetches each open sub-query about three times, and comments/activity up to four. The attachments panel (:5273-5275, :5313-5315) awaits three sequential invalidations, which fetches attachments and activity twice.

*To close:* Invalidate ['task', taskId] with exact: true for the detail, plus the specific sub-keys per event type. Drop the narrower invalidations that follow a prefix invalidation.

*Closed:* it was worse than the row counted. The list page's own handler also invalidated the task's whole prefix, plus comments and activity, for every event. `task.updated` goes to the list's room AND the task's, so a page in both receives it twice. So one priority change set off:
- the editing sheet's own save;
- `task.updated` twice, through two handlers each;
- `activity.created`.

Measured with the new suite `task-sheet-fetches` on lane 1 (two sheets open on one task, one changing its priority): the editing sheet fetched the task and its attachments 6 times each, and the watching sheet 5. Comments, activity and time are not mounted until their tabs open, so the suite counts what the sheet has open.

Now the sheet makes one pass per burst, 150 ms after its first event. That pass invalidates the whole prefix, except when only an activity entry arrived, which refreshes just the activity. Narrowing further per event type was left out, because a task's fields show in any panel and a stale panel is worse than one extra fetch. The list page refreshes its list once a burst. It MARKS a task's queries stale (`refetchType: 'none'`) and no longer refetches them, so a sheet opened later still reads them afresh from a cache that would otherwise be 30 seconds fresh. After: the editing sheet fetched each twice (its save, and the burst) and the watching sheet once. It still showed the new priority. `tsf-1` (every event refetches), `tsf-2` (the list page refetches the sheet) and `tsf-3` (a burst refreshes nothing), each compiled, 3 of 3 reddened on lane 2. `ct-8` (comment-thread: nothing refreshes a task's comments) is re-aimed: the list route refetches nothing now, so it takes the two refreshes left, the panel's own and the sheet's pass. It reddened on lane 2 (11 of 13). Regression on lane 1, 12/12: `task-sheet-fetches`, `activity-rail`, `addressability-live`, `task-depth`, `list-view-controls`, `list-customize`, `task-cover`, `task-attachments`, `sticky-headers`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `product-siblings/teams-work-preview-ignores-privacy` — **closed**

**GET /workspaces/:ws/teams/work-preview returns every member's open task titles with no visibility filter**

*Closed (c7f69d1):* the preview takes the viewer and applies the container rule (new `containerVisibilityFilter`, `checkContainerAccess` as a WHERE fragment, written beside it), the list rule and the task rule; the card's count is of what it shows. `read-visibility` 8/8: of a teammate's five open tasks — public, private space, private project, private list, private task — a plain member sees exactly the public one, while the manager and the teammate see all five. rv-1..10.

*Evidence:* workspace-groups.controller.ts:119-131 uses WorkspaceMemberGuard only and passes no actor. workspace-groups.service.ts:358-380 selects tasks by assignee across the workspace without taskVisibilityFilter or a private space/project check. workspace-groups is absent from the 14 services that call taskVisibilityFilter (rg -l). Failure: a member with no access to a private space sees the titles and due dates of tasks in it on the Teams page.

*To close:* Pass the actor and apply taskVisibilityFilter / resolveIsManager as the other readers do.

### `product-siblings/timeline-projectid-param` — **closed** (clean-up, small)

**Timeline ?projectId (resume §3 item 4): still unsent, and harmless in effect; the from/to options are a reader of nothing**

*Evidence:* tasks.controller.ts:126-137 accepts projectId. workspace-timeline-page.tsx:227-230 never sends it, and filters client-side at :260-263 over an UNCAPPED read (tasks.service.ts:1834-1865 has no limit), so users see the same result. The cost is a whole-workspace payload, filtered in JS for `startDate || dueDate` (:1864). getTimelineForWorkspace declares opts.from and opts.to (:1831) that nothing applies.

*To close:* Send projectId when projectFilter !== 'all' (and put it in the query key), or delete the param. Apply or delete from/to, and move the date filter into SQL.

*Closed, 25 September:*
- **`projectId` stays, unsent, and that is right.** `gantt-controls` recorded why (its check "the timeline endpoint really narrows on `projectId`, which no client sends"). The page holds every dated task, and builds its project list from those rows. Narrowing on the server would shrink the list to the one project already chosen. So the parameter is API surface, exercised by that check, not dead wiring.
- **`from` and `to` are deleted.** Both were declared on `getTimelineForWorkspace` and read by nothing. The page fits its range to the tasks it holds.
- **The date filter is in SQL.** The read has no limit, so an undated task was read with the rest of the workspace and then dropped in JavaScript. It is no longer read at all.

The answer is the same either way, so there is no before and after to measure at the route. `gantt-controls` gained a check (30 now) that the timeline carries only what it can draw: this run's task with neither date is in neither read. `gantt-controls-18`, compiled, takes the filter out of the SQL, with none after it, and must redden that check.
- After: 30/30, on lanes 5 and 4.
- *Break run* (lane 1, on `8ba0bac`): the whole set of 19, with `gantt-controls-18`, reddened the check each claims. `gantt-controls-18`'s run then stops at 3 of 30, and the patch now declares it (`Expect: SHORT`). The undated task it lets through reaches the page, whose bars no longer narrow to one project, so the suite's own setup for the page sections throws. The page drawing only dated work is what the filter protects.
- Regression on lanes 2 to 5, the four suites that read the timeline or open its page: 4/4.

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

The new suite `clip-library` uploads 1001 clips the way the app does, presign then PUT, so the newest is on a second page. On lane 1 before, 0 of 2: the library listed clips 1–200, its first entry clip 200, the newest missing and the oldest present; search found nothing for the newest clip's name. After, 2/2. `clb-1..3` (the oldest kept, the first page only, search's 200), each compiled, 3 of 3 reddened on lane 2. The clips unit test's fake store lists through `listAllObjects` now. A new unit test holds the newest 200 of 250, and only those looked up. API unit tests 1635/1635. Regression on lane 1, 12/12, with the new store: `clip-library`, `clip-created-card`, `attach-on-create`, `task-attachments`, `task-cover`, `object-key-boundaries`, `settings-depth`, `search-sources`, `search-read-access`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

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

The new suite `report-read-access`, 6/6 on lane 1 (5 of 6 failed before; the member's own report passed both times). The mailer's half is two unit tests in `scheduled-reports.service.test.ts`, because lanes log a sent email's subject and not its body: it runs a report as its owner, and sends nothing for a departed or deleted one. `rra-1..5`, each compiled; `rra-6..7` are unit claims shown to fail their tests. `rra-1`, re-aimed onto `taskReadFilterFor` in `viewer-scope.ts` by `time-page-answers-whose-hours-twice`, reddened the overview check at `818f919` (lane 3, baseline 6/6, 28 September). API unit tests 1627/1627. Five reports still answer a member as the admin in the probe (productivity trend, status durations, time by project, sprints, goals). The first four go through the same filter and had nothing of the space to count (no completions, status changes, time or sprints). Goals take no reader at all and are not measured. Regression on lane 1, 16/16: the new suite, the suites that read reports or the workload (`addressability-live`, `person-panel`, `ai-assign`, `ai-answer-rendering`, `create-menu-ai`), the ones built on the container rule's helper (`request-access`, `space-create-menu`, `space-wizard-views`, `doc-task-links`, `task-depth`, `malformed-ids`, `panel-collapse`), `video1-fast-items`, `video-regression` and `ui-sweep`. In CI.

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

### `found-24-sep/task-edits-narrower-than-clickup` — **closed** (behaviour, medium; found closing the linked-docs item, researched)

**Only a task's creator, an assignee or a manager may change it; in ClickUp, anybody with "edit" on its location may**

*Evidence (code read):* `assertTaskWriteAccess` (tasks.service) refuses every change to a task by a member who neither made it nor is on it: "Only assignees, creators, managers, and workspace admins can edit this task". That covers the title, status, fields, links, labels and attachments. The space's own level is asked after that (`assertSpaceAllowsTaskWrite`), so a member with "edit" on a space still cannot change a colleague's task in it.

*ClickUp's rule* (help.clickup.com "Intro to permissions", "Permissions in detail", "Default user role permissions", search snippets; the pages cannot be fetched here): a member invited to a workspace has full edit on every public location and item by default, and a location's level can be narrowed. "Edit" lets them edit every task and subtask there, including status, assignees, title, attachments, archiving, moving, merging and duplicating. "Full edit" adds creating and deleting. "Comment" allows comments, and on a task assigned to them a change of status or assignees. "View" allows nothing.

*To close:* decide it as ClickUp does. A change to a task asks the level the person holds where the task lives (`resolveSpaceLevel`, a grant winning over the default), not whether they made it or are on it; deleting asks for full edit. This widens who may write, so first measure every suite that relies on the narrower rule (`task-boundaries`, `task-space-levels`, the `workspace-read-access` link half and others that expect a 403 for a member's colleague's task), then change the rule once, in `assertTaskWriteAccess`, with a suite that sets the three levels side by side on a colleague's task.

*Measured, lane 5, on HEAD:* in a space the member may edit, they were refused every change to a colleague's task: its title and status, its assignees, archiving and deleting (403 each, the rows unchanged), with "Only assignees, creators, managers, and workspace admins can edit this task". The comment-only and view-only spaces and a private list's task refused them as they should.

ClickUp (help centre, search snippets): "Edit" lets a person edit all tasks and subtasks in the location, "status, assignee, title of the task, any ClickApps", remove attachments, archive, move, merge and duplicate; "Full edit" adds deleting and creating. Members hold full edit on public locations by default. "Comment" is comments, and "comment with task assigned" a change of status on a task assigned to them; "View" nothing.

*Closed, 25 September:* a change to a task asks the level its space gives the person (`assertSpaceAllowsTaskWrite`, as before), not whether they made it or are on it. First the read rule (`readableTask`): a task in a private list, project or folder they are not in is refused as it is to every read (404), whatever the space lets them do. That had been implied by the creator-or-assignee rule, and no longer is. Guests are unchanged: they edit no task (their edit on a task shared with them is `found-25-sep/guests-edit-no-shared-task`, below).

Rundesk's "edit" is the space default and already makes tasks, as ClickUp's default full edit does, so it is read that way here, deleting included. A space narrowed to ClickUp's "Edit", which archives and does not delete, has no level of its own here.

The new suite `task-edit-levels`, 5 checks: in an edit space, a colleague's task's title, status, assignees, archive and delete; a comment-only space, a colleague's task and one assigned to the member; a view-only space; a private list's task in an edit space, beside the admin's change; and what a refusal says. Each change is read back by SQL.

- Before (HEAD, lane 5): 3 of 5. The comment-only, view-only and private-list checks passed, as they must after the change too.
- After: 5/5.

`tel-1..4`, each compiled: creators and assignees only, writes that skip the read rule, the space's level not asked, and everybody taken for an assignee. Break run, lane 1 (`ddbd509`): 4 of 4 reddened, on a green baseline (5/5); `tel-1`, `-3` and `-4` were re-aimed the same day at the call that passes the task's chain (`project-roles-narrow-nothing`). Regression on lanes 2 to 5, the 64 suites that change a task through the API: 60 passed in the sweep. Two read a member refused a colleague's task as one who "may only read" it, in a space the member may edit, and are pointed at a task they may only read now: `linked-docs-access`'s space is comment-only (5/5), and `task-boundaries`' watcher checks use a task in its view-only space (45/45). `task-depth` and `addressability-live` failed in the sweep and passed on their own, 91/91 and 28/28 (`found-24-sep/three-suites-fail-under-a-full-sweep`). In CI (178).

*Found beside it:*
- A project's members' roles narrow nothing for a member: the Members sheet sets a member to View or Comment on a project, and every rule asks the space (`found-25-sep/project-roles-narrow-nothing`).
- The task sheet offers every edit to anybody who can open the task, and a comment-only or view-only reader is refused each one (`found-25-sep/task-sheet-offers-refused-edits`).

### `found-25-sep/project-roles-narrow-nothing` — **closed** (security, medium; found closing `task-edits-narrower-than-clickup`)

**A project's members' roles narrow nothing for a member**

*Evidence, measured on lane 5:* the admin made a space (edit, the default), a project, a list and a task, and put a member on the project as View (`POST /projects/:id/members`, 201; the Members sheet lists them as View). The member then changed the admin's task (200) and made a task in the list (201). Every rule a member meets asks the space: `resolveSpaceLevel` reads a project's grants for a guest (`within`) and not for a member. So the role the Members sheet sets for a member on a project is recorded and read by nothing. With `task-edits-narrower-than-clickup` closed, that View member may change any task in the project, where before only their own.

*ClickUp's rule* (help centre, search snippets): a location's permission can be set per Space, Folder and List, and the most specific one decides.

*To close:* a member's grant on the project (and on the list, where a list has members) decides before the space's level, as a guest's share does. Pass the chain from the task's writes, the task and list create gates and the container rules. Measure every suite that sets a project member's role.

*Measured, lane 5, on `ddbd509`:* the new suite below, 0 of 5. A member given View on a project changed the admin's task (200) and made a task (201) there; given Comment, they changed its title (200); given Edit on a project in a view-only space, they could change nothing (403). Only the list's rename was refused, by the list's own maker rule.

ClickUp (help centre, search snippets): permissions set on a Folder or List override the Space's, and the most specific decides ("full edit on the List but edit on the Folder"), in either direction.

*Closed, 25 September:* `resolveSpaceLevel` reads a member's grants on the item and the containers above it (`within`) before the space, as it read a guest's: their role on the project, and a share on the task, list, project or folder. The most specific decides, either way. A project's maker is seeded as its admin member, added by themselves, and that row is not a grant: making something is no exception to its space's level, as `assertCanManageContainer` already has it for a list's maker. The chain is passed from a task's writes, the container rule (a project's and a list's rename, archive and delete, and the project page's capabilities), and the status rule. The task and list create gates already passed it, for guests. A refusal by a project's grant says so ("Your access to this project is …").

The new suite `project-member-levels`, 5 checks: View on a project in an ordinary space (the task, a new task, the list, beside a project with no grant); Comment; Edit on a project in a view-only space (beside a project with no grant); the maker's seed row, then the same row given by the admin; and what the refusal says. Every change is read back by SQL.

- Before: 0 of 5.
- After: 5/5.

`pml-1..5`, each compiled: the member's grants unread, the maker's seed taken for a grant, the task's writes and the list's rule asking the space alone, and the refusal naming the space. Re-aimed at the new lines: `tel-1`, `-3` and `-4`, `tsl-2`, `sdp-2`, `sdp-5`, `swa-2`, `ppc-6`, and `gsl-3` and `gsl-6` (a member's grants have a loop of their own now; these are the guest's). Regression on lanes 2 to 5, 39 suites that set members or shares or change what a member reaches: 38 passed. `folder-create` failed on lane 4 because lane 4's database had drifted from the migrations (`found-25-sep/lane-databases-drift-from-the-migrations`, below), and passed there once repaired, 22/22. In CI (179).

*Break run, lane 1 (`72c5bb7`):* `pml-1`, `-2`, `-3` and `-5` reddened, on a green baseline (5/5). `pml-4` (the list rule asking the space alone) left the suite green: its list was the admin's, and the maker rule refuses a member that rename whatever the project says, so the check could not tell. The check renames a list the member made now, planted by SQL, beside one in the project with no grant. Run again on it (lane 1, `b986949`), all five reddened on a green baseline (5/5), `pml-4` now on that check. The re-aimed `tel-1`, `-3` and `-4`, `tsl-2`, `sdp-2`, `sdp-5`, `swa-2`, `ppc-6` and `gsl-3`, 10 of 10 (`gsl-6` is a unit claim, red in preflight).

*Not changed, recorded:* a member given Full on a project still cannot rename or archive it unless they made it: the container rule asks its maker, an admin or a manager after the level. ClickUp's full edit on a folder allows it. This is the container rule's own question, left as it is here.

### `found-25-sep/lane-databases-drift-from-the-migrations` — **closed** (test tooling, small; found closing `project-roles-narrow-nothing`)

**Lanes 2 to 4's databases lacked four unique indexes and a dropped default; lanes 6 to 10 lacked two migrations**

*Evidence, measured:* `folder-create` failed on lane 4 ("the database accepted it") and passed on lane 5. Comparing each lane's indexes and columns with lane 5's: `rundesk_v2`, `v3` and `v4` had no `uq_folders_space_name_active` (0157), `uq_lists_project_name_active` (0147), `uq_saved_searches_user_ws_name` (0040) or `uq_task_calendar_links_task_provider_user` (0021), and `user_dock_configs.pinned_links` still defaulted to `'[]'`, which 0163 drops. That is the default the dock bug came from, so `dock-defaults` would have read a different product there. `rundesk_v6` to `v10` had neither 0160 nor 0162. `fleet-restart.sh`'s witness checks the newest migration that adds a column or a table, and a missing index or default is neither.

*Repaired by hand, 25 September:* the four constraints (no duplicates on any lane) and the default on lanes 2 to 4, and 0160 and 0162 on lanes 6 to 10. Every lane database now matches lane 5's and the pristine database's indexes, columns and defaults.

*To close:* a gate before a lane is used (`fleet-restart.sh`, and `verify.sh`'s staleness refusal) that compares the lane's indexes, constraints, columns and defaults with the pristine database, and refuses one that differs. Show that it catches a dropped index.

*Closed, 28 September.* Measured first: the pristine database was not a sound reference. It lacked 0164's default (`spaces.default_permission` `'edit'`, where the source and 0164 say `'admin'`), and so did lanes 6 to 10, which were restored from it. Lanes 2 and 4 had lost two foreign keys (`skill_connections.connection_id`, `workspace_member_custom_roles.workspace_member_id`).

The reference is `rundesk_schema_ref` instead: the pristine dump with the current schema source pushed onto it. That is what `fleet-sync.sh` does to a lane, and how CI builds its database. It is rebuilt, under a lock, when the schema source or the migrations change (16s).

`lane_schema_drift` (`lane-env.sh`) compares a database with the reference, line by line:
- columns (type, nullability, default), indexes, constraints and enums;
- leaving out index and constraint names, since push's `…_fk` and a migration's `…_fkey` are the same key.

It prints each `missing:` / `extra:` line. The gate is used in three places:
- `verify.sh` refuses a drifted lane with exit 9, naming what differs.
- `fleet-restart.sh` refuses to start one.
- The sweep's summary and the README list the new exit code.

Repaired on 28 September:
- lanes 2 and 4: the two foreign keys (no orphans);
- pristine and lanes 8 to 10: 0164 applied;
- lanes 6 and 7: the default (their rows' 0164 update waited for the suites running on them).

All eleven databases then read as no drift, and `pristine.dump` was re-dumped.

`schema-drift-selfcheck.sh`, in preflight: 6/6 on copies of the reference.
- The copy itself: no drift.
- A dropped `uq_folders_space_name_active`: named as missing.
- `pinned_links`'s `'[]'` default put back: named as extra.
- A foreign key dropped: named as missing.
- The same key renamed: not drift.
- A database that cannot be read: exit 2, not a pass. The first run of the self-check found the gate reading such a database as "everything missing", because `psql` was piped straight into `sort`. It reads psql's own status now.

End to end, the case this item was found by: with `uq_folders_space_name_active` dropped on lane 10, `verify.sh folder-create 10` refused with exit 9, naming the index, before the suite ran. The index was put back and lane 10 reads as no drift again.

### `found-28-sep/folders-changed-by-any-reader` — **closed** (security, HIGH; found by the deletion research for `role-editor-offers-unenforced-permissions`)

**Any reader of a space renamed, made private and deleted its folders, whoever made them and whatever the space's level**

*Evidence, measured on lane 1 (the build of `818f919`), probe then suite:* folders are changed through `spaces/:spaceId/folders`, guarded by `ResourceMemberGuard` (can read the space) and `space.create`, which every member holds. `FoldersService.update` took no actor, and `remove` asked no rule. So a member of a view-only space renamed an admin's folder, made it private and deleted it (200 each). A member in a space at Full edit did the same to folders an admin made. Only moving a folder asked the container rule ("This space's default permission is "View only"…", "Only the creator or a workspace admin can modify this folder"). Making a folder private hides its projects from everyone not named on it, so a reader could hide an admin's work from the rest of the workspace.

ClickUp (help centre "Permissions FAQ", "Set permissions on individual locations", search snippets): View changes nothing, Edit changes a location, Full edit deletes it.

*Fixed, 28 September:* `update` and `remove` ask the container rule as `move` did (`assertMayChange`). That is Edit to change a folder and Full edit to delete it; a grant on the folder decides before the space; the creator rule and managers' own spaces apply as for projects and lists. The route passes the actor.

`folder-change-rule`, 4 checks:
- Before: 2 of 4 on lane 1. The member's changes in the view-only space and to an admin's folder at Full edit were all 200.
- Unit tests: `folders.service.test.ts` 5/5. The delete test now asserts that the rule is asked at its delete level; update and remove refused by the rule write and audit nothing.
- Patches `fcr-1..4`; `fcr-4` is a unit claim.
- In CI.

*After:* 4/4 on the rebuilt lanes (sweep 18079). `folder-create`, `folder-dialog` and `private-folder-reach` pass in the regression; `folder-dialog`'s one miss under load passed alone. `fcr-1..3` each reddened the check it names (lane 1, at `72a8208`, baseline 4/4).

### `found-28-sep/doc-archive-and-delete-at-two-levels` — **closed** (permissions, small; found by the deletion research)

**A doc reaches the Trash at Edit through one route and at Full edit through the other**

*Evidence, read not run:* `PATCH /docs/:id {isArchived: true}` is allowed at Edit (`doc-update-fields.ts:29`, `docs.service.ts:595-616`) and lands the doc in the Trash (`trash.service.ts:171`). `DELETE /docs/:id` asks Full edit for the same result. ClickUp's snippets put archiving and deleting a Doc at Edit ("Anyone, including guests, with Edit permissions can archive and unarchive Docs"; "Guests with edit permissions can edit and delete Docs and pages").

*To close:* one level for both. Measure both routes at Edit and at Full edit, before and after.

*Closed, 28 September.* ClickUp (help centre "Archive and unarchive a Doc", from search snippets): "Anyone, including guests, with Edit permissions can archive and unarchive Docs", and "Guests with edit permissions can edit and delete Docs and pages". Docs are the exception to the location rule, where Edit changes and Full edit deletes. `full-edit-enforced-nowhere` had put a doc's delete at Full edit with the rest; this corrects it for docs.

Measured on lane 7 at `ad97e31`, `doc-trash-level` passed 2 of 5. The two that passed pin what stays: a Comment share neither deletes nor archives, and unarchiving at Edit works. The three failures:
- A member with an Edit share was refused deleting the doc (403, "that takes Full edit"), while archiving it through the doc was allowed.
- Archiving through the doc (`PATCH {isArchived: true}`) wrote the flag alone, with no date and no archiver. The doc sat in the Trash as nobody's, out of the archiver's own Trash and past their restore.
- A guest with an Edit share was refused deleting it.

Now:
- `DELETE /docs/:id` asks Edit, as archiving does. The "takes Full edit" refusal is gone with its only caller.
- Archiving through the doc records who and when, as deleting does, and unarchiving clears both.
- The share dialog explains a doc's Edit as "can change it, archive it and delete it", in the four locales.
- `full-edit-levels`' doc check is rewritten for the rule: a doc shared at Edit is renamed and deleted. `fel-11`, which made deleting ask Edit, is re-aimed to restore Full edit, and `dwl-7` onto the new line.

`doc-trash-level`, 5 checks:
- Before: 2 of 5 on lane 7.
- After: 5/5 on lane 7.
- Patches `dtl-1..5` each reddened the check they name (lane 1, at `96305b3`, baseline 5/5). The re-aimed `fel-11` reddened `full-edit-levels`' doc check and `dwl-7` `doc-write-levels`' (lane 2, baselines 8/8 and 5/5).
- Regression on lane 7, 10/10: `doc-trash-level`, `full-edit-levels`, `doc-write-levels`, `doc-boundaries`, `doc-import`, `doc-task-links`, `share-levels`, `trash-rules`, `undo-delete` and `ui-sweep`, which reads the share dialog's level explanations.
- API unit tests 1704/1704.
- In CI (222).

Left beside it, as their own items: the web offers no way to archive or delete a doc (`found-28-sep/docs-offer-no-archive-or-delete`), and the doc editor takes typing from people who may only read or comment (`found-28-sep/doc-editor-open-to-readers`).

### `found-28-sep/docs-offer-no-archive-or-delete` — **closed** (feature, small; found closing `doc-archive-and-delete-at-two-levels`)

**The docs panel has an Archived scope and no control that archives or deletes a doc**

*Evidence (reading, 28 September):* `docs-panel.tsx` lists "Archived" docs in its rail and offers nothing that sends a doc there: no Archive or Delete in the doc's header, the rail or a menu. The API has both routes, at Edit. ClickUp archives a Doc "from Docs Hub, the Home Sidebar and Spaces Sidebar, Doc views, or from Docs Home".

*To close:* an Archive (and Delete) in the doc's menu, offered at Edit — which needs the caller's level on the doc in its payload — and Unarchive on an archived one. Measure a member at Edit and at Comment.

*Closed, 29 September,* with `doc-editor-open-to-readers` below. The level comes from the doc's capabilities (`GET /docs/:id/capabilities`, the checks its routes ask, which the share button already read), one query for the page and the button. The doc's header has a menu, drawn when there is something in it: Archive at Edit (the doc then opens in the Archived bucket, where the menu offers Unarchive, which brings it back to All), and Delete at Edit on a live doc, which sends it to the Trash and opens the next doc. Both land the doc in the Trash of whoever did it (`doc-archive-and-delete-at-two-levels`), so an archived doc is not offered Delete, which would change nothing. Four locales.

Measured on lane 2 at `f8a799d` before: a member with an Edit share was offered no menu at all, and nothing on the page archived or deleted a doc. After: the Edit share's menu offers Archive and Delete; Archive archives it as the editor's doing and Unarchive restores it; Delete puts it in the editor's own Trash; View and Comment shares get no menu. Checks 3–5 of `doc-level-controls` (below); patches `dlc-5..9`, `dlc-11`.

### `found-28-sep/doc-editor-open-to-readers` — **closed** (mirror, small; found closing `doc-archive-and-delete-at-two-levels`)

**The doc editor takes typing from someone who may only read or comment, and a refused save says nothing**

*Evidence (reading, 28 September):* the docs panel knows nothing of the caller's level: the editor is editable for everyone who can open the doc. `saveDoc`'s `onError` speaks only for a 409 (a teammate's edit); the 403 a View or Comment share gets is dropped, so the typing looks saved until the doc reloads.

*To close:* the caller's level in the doc payload, a read-only editor below Edit, and a refused save said. Measure a View share typing.

*Closed, 29 September.* Measured on lane 2 at `f8a799d` before: a View share and a Comment share were each shown an editable editor that took their typing, with Save and the formatting tools; and when an Edit share was lowered to View while the doc was open, Save answered 403 and the page said nothing. ClickUp: View and Comment read a Doc; Edit changes it.

The editor starts read only and is made editable only when the doc's capabilities say Edit; below Edit the formatting tools, the AI tools and Save are not drawn, and a "Read only" pill says why. A save refused for any reason but a teammate's edit (409, as before) is said with the API's own sentence ("Your access to this doc does not allow changing it"), and the level is asked again, so the page turns read only. Four locales.

`doc-level-controls`, 7 checks, a View, a Comment and an Edit share on one doc:
- Before: 1/7 on lane 2 (the API's capabilities, which were right).
- After: 7/7 on lane 2.
- Patches `dlc-1..11`, one or more per check: all eleven redden (lane 3, at `0911c6e`, baseline 7/7).
- In CI (229).
- Regression on lanes 1, 2, 3 and 7 at once, 49 suites: every suite that opens a doc, reads announcements, flags, the home page or the planner's What's new, and the 19 of `three-suites-fail-under-a-full-sweep`: 49/49.
- 29 September, under a four-lane sweep: the Edit member's check read the editor before the doc's capabilities had answered (`contenteditable` still "false", though the typing then took). The editor is read only until they answer, and says nothing meanwhile, which outlasted the network lull the suite waited for. It now waits until the read-only pill is drawn or the editor is editable (15 s at most), and fails in its own words if neither comes.

### `found-28-sep/trash-deletes-for-good-wider-than-clickup` — **closed** (permissions, small; found by the deletion research)

**Members delete for good what they sent to the Trash, and managers act on everything in it**

*Evidence, read not run:* `trash.service.ts:60` and `:235-238`. ClickUp (help centre "Restore items from the Trash", snippet): "The Workspace owner and admins can see, restore, or permanently delete any public items. Members and guests can only see and restore items they have deleted." Guests cannot permanently delete or empty the Trash.

*To close:* permanent deletion is the admins'; members and guests restore their own. Measure each role before and after.

*Measured on lane 7 (build of `b835872`), suite `trash-rules`, before:* 1 of 4.
- A member deleted for good a task they had deleted (200).
- A manager listed the admin's deletions, restored one, deleted one for good and emptied the whole Trash (200 each). `resolveScope` counted a manager as an admin.

*Closed, 28 September:*
- The Trash is the workspace's for an admin (`isAdminRole`); anyone else, a manager included, lists and restores what they deleted.
- Deleting for good and emptying the Trash are an admin's alone, even for what the caller deleted.
- The web Trash tab was already an admin's.
- The web has no Trash for a member, which ClickUp gives them: that is `found-28-sep/members-have-no-trash-to-open`.

`trash-rules`, 4 checks:
- Before: 1 of 4. After: 4/4 on lane 7.
- Patches `trr-1..3`: each reddened the check it names (lane 4, at `5086fe0`, baseline 4/4).
- Regression on lane 7, the 8 suites that send to, read or empty the Trash: 8/8.
- In CI (218).

### `found-28-sep/members-have-no-trash-to-open` — **closed** (feature, small; found closing `trash-deletes-for-good-wider-than-clickup`)

**A member cannot see or restore what they deleted anywhere in the web**

ClickUp: "Members and guests can only see and restore items they have deleted." The API does exactly that (`GET /workspaces/:ws/trash` lists the caller's own; restore of their own is allowed), but Settings → Trash opens to admins alone, so a member who deletes a list has no way back.

*To close:* open the Trash tab to every member but a guest (as Archived is), with Restore on their own rows and no Delete forever or Empty. Measure a member and an admin.

*Closed, 28 September,* with `members-see-no-clickapps-list` and `settings-blank-on-a-slow-permission-read` (one suite, `member-settings-tabs`). Measured on lane 7 before the change: a plain member had no Trash tab, and neither did a manager — whom the tab, had they reached it, offered Empty trash (`canEmpty` read the manager role), which the API refuses them since `trash-deletes-for-good-wider-than-clickup`.

Now:
- Trash opens to every member but a guest (`OPEN_TABS`), listing what they deleted, as the API answers.
- Delete forever, Empty trash and the Deleted-by filter are an admin's (`isAdmin`); the deleters list is asked only for an admin.
- A plain member lands on Archived (`landingTab`: General where it opens, else the first tab a key opens, else Archived), in the route and the page alike.
- `settings-tabs-by-key` and `settings-role-grants` read a plain member's tabs as Features, Archived and Trash now; their two sentences and the eight patches quoting them follow. `ata-6` is re-aimed onto the new list.

`member-settings-tabs`, 7 checks (its Trash, Features and slow-read sections):
- Before: 1 of 6 on lane 7, the guest's refusal passing (the slow-read check came after; see that item). The suite's first reads were found reading a closing menu's aria-hidden page as "not offered", and were made to wait for the menu to close and the flags to settle before the after run.
- After: 7/7 on lane 7.
- Patches `mst-1..7` (`mst-7` against `settings-tabs-by-key`); the web ones typecheck applied. Each reddened the check it names (lanes 2 and 3, at `ebe20cf`, baselines 7/7 and 8/8), and so did `ata-6`, re-aimed onto the three open tabs (baseline 7/7), `cka-8` on its rewritten sentence (7/7), and `stp-11` and `srg-1..7` on theirs (8/8 and 6/6).
- Regression on lane 7, 22 suites with the menu, Trash, Features, landing and dashboard changes together: `member-settings-tabs`, `menu-offers`, `dashboard-own-copy`, `settings-tabs-by-key`, `settings-role-grants`, `archived-tasks-access`, `trash-rules`, `undo-delete`, `clickapp-flags-access`, `settings-depth`, `teams-destination`, `role-permissions-web`, `workspace-role-controls`, `people-calendar-access`, `user-group-access`, `announcement-access`, `client-access`, `default-dashboard-access`, `container-delete-keys`, `job-title-rule`, `retired-permission-keys` and `admin-only-keys`, 22/22. Three had read the old tab sets and were updated for the three open tabs: `settings-tabs-by-key` and `settings-role-grants` set the open tabs aside as they had set Archived aside, and `clickapp-flags-access` now expects the manager and the plain member on a read-only Features (its sentence changed, and `cka-8`'s claim with it). Twelve runs were refused on the way as a stale build, twice — a rebuild by another session, and the preflight's unit claims patching the API — and passed when re-run.
- In CI (224).

### `found-28-sep/delete-and-public-link-offered-to-everyone` — **closed** (visible bug, medium; found by the deletion research)

**The sidebar and the space page offer Delete on every space, folder, project and list, and the docs panel offers the public-link switch to readers and guests**

*Evidence, read not run:*
- The sidebar offers Delete with no permission read (`workspace-sidebar.tsx` near 2248 list, 2315 project, 2573 space, 2697 folder), and so does the space page (`workspace-space-shell-page.tsx:219-230`). The API refuses most of those people, so the control is dead for them. Only the project page asks first.
- The docs panel shows its public-link toggle to everyone, guests and view-only readers included (`docs-panel.tsx:824`, `:1963`). The API refuses them.
- Spaces have no capabilities endpoint to ask.

*To close:* each control is offered by the rule its route asks (a capabilities read per container, as projects and tasks have). Measure a member, a guest and an admin on each.

*Closed, 28 September.* Measured on lane 7 at `96305b3`, `menu-offers` passed 1 of 9; the one that passed pins what stays, the admin offered Delete. The eight failures:
- No capabilities to ask for a space, a folder, a list or a doc (404).
- A plain member was offered Delete and Rename on the admin's list, Delete on the admin's space and folder and Archive on the admin's project, all of which the routes refuse (403).
- The space page's menu offered the member Delete, and said nothing about what they may do.
- The docs panel drew the public-link switch on a doc the member could only view.

Now:
- `GET /spaces/:id/capabilities`, `/spaces/:id/folders/:folderId/capabilities`, `/lists/:id/capabilities` and `/docs/:id/capabilities` answer with the very checks their routes ask (`allowedBy`, `common/permissions/capability.ts`, now shared with the project page's capabilities). A folder's answer includes `space.create`, which every folder write asks through its guard. A doc's public link has one rule, `assertMayPublish`, for the two routes and the answer; deleting one has `assertMayDelete`.
- The sidebar's four menus and the space page's ask when they open (`WithMenuOffers`, `components/menu-offers.tsx`): a refused row is not drawn, a row still being asked is drawn disabled, and if the question fails the row is offered and the route answers for itself. Rename, privacy and Move follow `manage`; Delete and Archive follow `delete`. Share is left to the share dialog's own rule.
- The space page says so when there is nothing for the reader to change ("You can open this space, but not change or delete it", four locales).
- The docs panel draws its link switch by the doc's `makeLink` / `revokeLink`; the copy button stays for anyone who sees an existing link.
- Guests: the doc link is measured for a guest at Edit (refused, as ClickUp's guests never share publicly). A guest's container menus follow the same rules, whose guest refusals `container-delete-keys` and `guest-space-level` measure at the routes.

`menu-offers`, 9 checks, read by the rows' visible names so the old build is measured the same way:
- Before: 1 of 9 on lane 7.
- After: 9/9 on lane 7.
- Patches `mno-1..7`; the three web ones typecheck applied. Each reddened the check it names (lane 1, at `ebe20cf`, baseline 9/9). `dwl-6`, re-aimed onto `assertMayPublish`, reddened `doc-write-levels` again (lane 4, baseline 5/5).
- API unit tests 1704/1704.
- In CI (223).

### `found-28-sep/client-delete-cascades-invoices` — **closed** (data loss, medium; found implementing `client.manage`)

**Deleting a client deletes its invoices and their lines, and returns their time to unbilled**

*Evidence:* `client_invoices.client_id` is `ON DELETE CASCADE`, and so are the line items (`0077_client_invoices.sql:6,27`). The invoices' time entries go back to unbilled (`client_invoice_id` set null, `:39-43`). A holder of `client.manage` (every manager, by default) who does not hold `workspace.billing` can therefore destroy billing records. `DELETE /clients/:id` also answers `{ok:true}` for an id that matched nothing.

*To close:* Refuse to delete a client with invoices, or archive it, and ask `workspace.billing` for anything that touches invoices. A missing id is a 404. Measure a manager and an admin before and after.

*Measured on lane 7 (build of `0aea7f6`), suite `client-delete-keeps-invoices`, before:* 1 of 3.
- A manager deleted a client with an invoice, and the invoice went with it (200).
- A client that is not there answered 200.

*Closed, 28 September:*
- A client with invoices is not deleted: 409, naming how many invoices and that they must be voided or removed first.
- A client that is not in the workspace is 404.
- A client without invoices is deleted as before.
- Nothing that touches invoices is reachable by `client.manage` alone any more, so `workspace.billing` stays the invoices' key.

`client-delete-keeps-invoices`, 3 checks:
- Before: 1 of 3. After: 3/3 on lane 7.
- Patches `cki-1..2`: each reddened the check it names (lane 4, at `5086fe0`, baseline 3/3).
- Regression: `client-access` and `oauth-start-readiness` 2/2.
- In CI (219).

### `found-28-sep/clients-cannot-be-edited` — **closed** (feature, small; found implementing `client.manage`)

**No page renames a client, changes its contact email or deletes it**

*Evidence:* There is no update route. The contact email the invoice prints (`client-invoicing.service.ts:125`) can only be set through the API.

*To close:* An edit and a delete in the web, asking `client.manage`.

*Closed, 29 September.* Measured on lane 7 at `0911c6e` before: `PATCH` a client answered 404 (no route), and the project page's client row made a client by name and did nothing else. ClickUp has no clients; its nearest library, the Custom Field Manager, is changed by whoever may manage it.

- `PATCH /workspaces/:id/clients/:clientId` asks `client.manage`: a name sent is required and unique in the workspace (a taken one is a 400, "already exists", not the index's 500), a contact email must be an address, and an empty one clears it.
- The project page's client row offers a holder of `client.manage` Manage clients: a dialog listing every client, each with its name and contact email to save, and Delete (a client with invoices is refused its delete, and the refusal is shown). Four locales.

`client-edit`, 6 checks:
- Before: 1/6 on lane 7 (a plain member was offered nothing, which held).
- After: 6/6 on lane 7.
- Patches `cle-1..8`: all eight redden (lane 2, at `d86220d`, baseline 6/6); `cki-2`, re-aimed onto the delete's own line, reddens (lane 2, at `d86220d`, baseline 3/3).
- Regression on lanes 5, 6 and 7: the client, invoice, billable-time and project-page suites, 8/8.
- In CI (232).

### `found-28-sep/project-folder-unchecked-across-workspaces` — **closed** (security, small; found implementing `client.manage`)

**`PUT /projects/:id` copies a `folderId` without asking that the folder is in the project's workspace**

*Evidence:* Read, not run: `projects.service.ts` `updateProject` takes the body's `folderId` as it takes `clientId` (now checked). A folder of another workspace would be accepted, with only the foreign key checking it.

*To close:* Measure it; refuse a folder that is not in the project's space (400).

*Measured on lane 5 (build of `4ba95d3`), probe then suite:*
- `PUT /projects/:id` took another workspace's folder, and another space's of the same workspace, and set it (200 each). The project stayed in its space under a folder that lives elsewhere, and the other tenant's folder's privacy then read as the project's.
- `POST /projects` with another workspace's `folderId` made the project (201).
- Only moving a project asked where its folder was.

*Closed, 28 September:* `assertFolderOfSpace` (`projects.service.ts`) asks that the folder exist, sit in the project's space and not be deleted. It is asked on make, update and move, which had its own copy. `null` takes a project out of its folder without a lookup.

- `project-folder-home`, 4 checks: before 1 of 4 on lane 5, after 4/4.
- Unit tests: `projects.service.test.ts` 11/11 (4 new).
- Patches `pfh-1..3`, and `pfh-4`, a unit claim. `pfh-1..3` each reddened the check it names (lane 1, at `5086fe0`, baseline 4/4).
- Regression on lane 5, the 9 suites that make, move or update projects and folders: 9/9.
- In CI (217).

### `found-28-sep/billable-switch-offered-to-readers` — **closed** (visible bug, small; found by the client research)

**The project page's "Billable by default" switch is offered to a member who may not change the project**

*Evidence:* `workspace-project-shell-page.tsx:1165-1170`: the PUT answers 403 (`container-access.ts:120`) and the switch quietly flips back.

*To close:* Offer it by the project's capabilities, as the page's other controls are.

*Closed, 28 September.* The clients agent fixed the web in 4ba95d3: `ProjectTimeSettingsSection` locks the switch unless `caps.edit` is true, as it does the client picker. I opened this item from the research notes without seeing that. Nothing checked it, so `client-access` gained a seventh check: the switch is live for the manager, who may change the project, and disabled for a plain member.
- `client-access` 7/7 on lane 7.
- Patch `bsw-1` makes the lock ignore the edit rule, and reddened the new check (lane 4, at `5086fe0`, baseline 7/7).

### `found-28-sep/announcement-views-counted-per-click` — **closed** (visible bug, small; found by the announcement research)

**An announcement's views count every call, and paused or expired ones accept views and dismissals**

*Evidence:* `POST /announcements/:id/view` adds 1 per call with no per-user record, and the home page's "Mark seen" adds 1 per click and changes nothing visible. `view` and `dismiss` check only the workspace and the id.

*To close:* One view per person; refuse paused and expired announcements; give Mark seen an effect or remove it.

*Closed, 29 September.* Measured on lane 1 at `f8a799d` before the change: one member's three views and another's one counted 4; a paused and an expired announcement each took a view and a dismissal (200s, counts 1); a dismissal recorded no view; the home banner offered Mark seen, which counted a click and changed nothing on the page; showing the banner or What's new recorded nothing. ClickUp has no workspace banner (its nearest is a Chat post), so the rule is the product's own: a view is a person.

- A view is a row per person, `announcement_views` (migration `0165`, unique on the announcement and the person, as `announcement_dismissals` already was), and the count moves only when the row is new. The counts recorded before are kept.
- `view` and `dismiss` take a live announcement only (published, not paused, not expired), else 404, as for somebody who was never shown it; a dismissal is a view too, and both are written with `ON CONFLICT DO NOTHING`, so two at once are one rather than the unique index's 500.
- The web records a view when it shows the announcement: the home banner, and each one What's new lists (the banner shows only the newest, so the older ones are seen there). Mark seen is gone, in four locales.

`announcement-views`, 9 checks:
- Before: 0/9 on lane 1.
- After: 9/9 on lane 1.
- Patches `anv-1..10`, one or more per check: all ten redden (lane 4, at `0911c6e`, baseline 9/9). `ana-6`, re-aimed onto the banner's paused-and-expired rule, reddens (lane 3, at `394d3f9`, baseline 8/8).
- In CI (229).
- Regression on lanes 1, 2, 3 and 7 at once, 49 suites: every suite that opens a doc, reads announcements, flags, the home page or the planner's What's new, and the 19 of `three-suites-fail-under-a-full-sweep`: 49/49.

### `found-28-sep/announcements-flag-gates-nothing` — **closed** (facade, small; found by the announcement research)

**The `chat.announcements` feature flag gates nothing**

*Evidence:* `packages/feature-flags/src/registry.ts:52` declares it; no announcements route or page reads it. The platform console's workspace picker also lists only the workspaces the super admin belongs to.

*To close:* Gate announcements by the flag, or remove it from the registry.

*Closed, 29 September: removed.* Gating by it would have hidden every live banner in a workspace whose newcomer left Chat unticked at sign-up (sign-up writes the whole Chat category from that pick, `chat.announcements` with it), and no workspace setting could turn it back on: the switch was offered only in the platform console, where it read off by default while announcements worked everywhere. ClickUp has no ClickApp for announcements. So the flag leaves the registry and Chat's category, the console no longer draws the switch, and migration `0165` deletes its stored switches and asks. Announcements stay governed by `announcement.manage` and membership, as they were.

Measured on lane 1 at `f8a799d` before: switching it off answered 200 and the banner was served as before; a newcomer picking Chat got a `chat.announcements` switch. After: the switch is refused as a feature this build does not have (400), and sign-up writes no such switch. Two checks in `announcement-views` (above); patches `anv-9`, `anv-10`.

The platform console's announcements page still lists only the workspaces its super admin belongs to; a workspace's announcements are managed from its own Settings → Announcements now.

### `found-28-sep/role-flags-read-the-account-role` — **closed** (visible bug, small; found by the ClickApps research)

**A role-scoped feature flag matches the account's role in the navigation and the workspace role in the ask**

*Evidence:* `resolveForUserRequest` passes `user.role` (`feature-flags.service.ts:70`), while `requestFlag` resolves with the membership's role (`:215-219`). A role-scoped flag can therefore read differently in the nav and in "Contact your admin".

*To close:* Resolve with the workspace role in both, and measure a manager with a role-scoped override.

*Closed, 29 September,* with `platform-flag-switches-apply-nowhere` below. Measured on lane 5 at `c55a088` before: a platform override turning Forms off for managers in a workspace left the manager told Forms was on (the navigation matched the account's role, `user`) and its routes answering 200; the guard passed the account's role too. Now resolution reads the caller's role in the workspace itself whenever it knows the workspace and the person, so the navigation, the guard and "Contact your admin" read one role. After: the manager is told off and the routes answer 404, a plain member keeps Forms, and the manager's ask goes out rather than saying Forms is already on.

`flag-resolution`, 5 checks (two for this item):
- Before: 1/5 on lane 5 (the workspace's own switch, which worked).
- After: 5/5 on lane 7.
- Patches `flr-1..4`: all four redden (lane 1, at `394d3f9`, baseline 5/5).
- In CI (231).

### `found-29-sep/platform-flag-switches-apply-nowhere` — **closed** (facade, small; found closing `role-flags-read-the-account-role`)

**The platform console's feature switches applied in no workspace, and each one added a row**

*Evidence, measured on lane 5 at `c55a088`:* the console switches a feature for the whole platform (`PUT /feature-flags/:flag`, `scope: 'global'`, no workspace). Turning Forms off answered 200, and a workspace went on resolving Forms on and serving its routes: a workspace read loaded only that workspace's rows (`resolveFromDb`), so a row with no workspace was never read. And the unique key ran over nullable columns with NULLs distinct, so the upsert never matched a platform row: each switch inserted another, and which one a read applied was the table's order. Forms had nine platform rows on lane 5.

*Closed:* a workspace read loads the platform's rows and the workspace's, and applies them platform first, then the workspace's, a role's, a person's — the more specific wins. A switch updates its own row, found with NULLs equal, under a lock per flag, and makes one only when there is none. Migration `0166` keeps the newest of each duplicate and makes the key NULLS NOT DISTINCT. The drizzle schema cannot say NULLS NOT DISTINCT: drizzle-kit 0.31 does not read it back, and tried to rebuild the key, asking about the table's rows, on every lane push, which failed without a terminal. So the rule is kept in code, and a database built by `drizzle-kit push` (CI's) holds one row too.

The seeded platform rows are all on (the default-enabled flags), so applying them changes nothing by itself; a feature the console had switched off would now be off in every workspace that says nothing of its own. Three checks in `flag-resolution` (above); patches `flr-1`, `flr-2`, `flr-4`.

### `found-29-sep/failing-checks-print-only-their-reason` — **closed** (test tooling, small; found by the break runs for `c55a088`)

**23 suites printed a failing check's reason alone, so a patch whose reason was built from the run reddened no check the checker could name**

*Evidence, 29 September:* `check-plan-population.mjs` stopped the preflight on three patches "that need a person": `fd-7-toggle-latches`, `af-3-no-failure-recorded` and `sdp-4-refuses-everyone` read as `unreadable`. `folder-dialog` and `ai-activity-filters` printed `FAIL <reason>` without the check's sentence — `af-3`'s reason is built from the run's numbers ("0 new failed rows appeared …"), and `fd-7`'s is two strings joined — so `check-break-reddened.mjs` could not map either back to the check a claim names. 21 more suites had the same helper. `sdp-4`'s claim listed two sentences with no `or`, a shape the checker does not read.

*Closed:* every suite's `chk` prints the sentence, then the reason (the 70 that were fixed on 26 September, and now these 23); `sdp-4`'s claim is in the checker's shape. After: `check-plan-population.mjs` agrees with the reddened checker on every patch (1703 needing a run), with none needing a person; the re-runs of the 23 suites follow in the break backlog. The three read again: `fd-7` and `af-3` redden (lanes 1 and 4, at `0911c6e`), and `sdp-4` reddens (lane 2, at `d86220d`, baseline 36/36).

### `found-29-sep/lane-push-errors-read-as-synced` — **closed** (test tooling, small; found closing `platform-flag-switches-apply-nowhere`)

**A schema push that stops on an error is reported as synced**

*Evidence, 29 September:* drizzle-kit 0.31 asks before adding a unique key to a table with rows, and with no terminal it prints "Error: Interactive prompts require a TTY terminal" and exits 0, having applied nothing. `fleet-sync.sh` pipes `yes` into the push, reads no status and no log, and said "7/7 lanes synced and up"; `schema_ref_ensure` (`lane-env.sh`) trusts the same exit status, so the schema reference was built without the table migration 0165 adds, and `build-api.sh` then refused every lane as drifted — the right answer, from the wrong database.

*To close:* read the push's log for an error as well as its status, in both places, and fail loudly; prove it with a push that is made to stop.

*Closed, 29 September:* `push_log_ok` (`lane-env.sh`) reads a push as done only when its log says the schema was applied or nothing changed, and holds no error. `fleet-sync.sh` reads every lane's log and pristine's before it stops anything: one that stopped is named, with its first error line, and nothing is restarted (exit 1), so the lanes keep serving what they served. `schema_ref_ensure` refuses to build the reference on a stopped push.
- `scripts/e2e-lanes/push-log-selfcheck.sh --mutate` (preflight, and CI's verify job — it needs no database): six push logs in the shapes real ones take — applied, nothing to change, stopped on the question (its line verbatim from 29 September), a database error, empty, missing — only the first two read as done; and a `push_log_ok` that trusts the exit status is caught by four of them.
- Before, on 29 September: `fleet-sync.sh 7` answered "7/7 lanes synced and up" over a push that had stopped; after, the same log reads as stopped. The real logs on disk now (lanes 1 and 7, pristine, the reference) read as done.

### `found-29-sep/workspace-delete-leaves-stored-files` — **closed** (found closing `workspace-permanent-delete-unbuilt`)

**Deleting a workspace for good leaves its stored files in the store**

*Evidence, read:* `deleteForGood` (workspaces.service) deletes the workspace's rows by cascade; the objects those rows pointed at in the store (attachments, clips, covers, the logo) are not touched. `R2Service` deletes one object by key (`deleteObject`) and cannot list a prefix, so nothing here could find them. ClickUp's own delete offers to remove the Workspace's data from its third-party processors too.

*To close:* collect the workspace's object keys before the rows go (or list the workspace's prefix, once the store can), delete them after, and check against the store stub that none is left.

*Closed, 29 September.* ClickUp's own delete offers to remove the Workspace's data from its third-party processors as well; here the store is ours, and deleting for good now empties it. `deleteForGood` reads what the store holds for the workspace before its rows go, and deletes it after:
- The keys its rows name: task attachments and covers, chat attachments and custom emoji, call recordings.
- The prefixes the workspace names: `workspaces/<id>/` (its tasks' files, and its clips, which have no table), `calls/<id>/`, `chat/<id>/` and its logos. `R2Service.listAllObjects`, added for `clip-library-lists-the-oldest-200`, reads every page of a prefix, so "cannot list a prefix" had stopped being true.
- Best effort, and counted: an object that will not go is counted in the audit record (`objectsRemoved`, `objectsLeft`, `prefixesUnlisted`) instead of failing a deletion whose rows are already gone. A store that is not configured holds nothing of the workspace's.

`workspace-delete-for-good`, check 5, stages an attachment (presigned, PUT to the store stub, recorded on a task) and a clip (named only by its prefix), deletes for good, and reads the stub's DELETE requests for both keys:
- Before 4/5 (the store untouched), after 5/5 on lane 7.
- Patches `wdg-9..11` (the store untouched; the prefixes unread; the keys read after the rows): each reddens check 5 (4/5; lane 1, `096fa62`, baseline 5/5).
- The suite read the deletion's record as soon as the row had gone. With the store emptied between the row going and the record being written, a loaded lane read 0 records (lane 6, in the batch's sweep); it reads once the deletion has answered now, 5/5 on lane 6.
- In CI with the suite. Regression: the batch's sweep on the final bundles, 57 suites on five lanes at once (1,289 checks): 53 green, and the four that were not are accounted for — `brain-entry-points` twice (its fourteenth check counted answers, which a regenerate keeps level, and a cookie card drawn late covered the scope chip on lane 1; both fixed in the suite, 14/14 on lanes 1, 3 and 7), `workspace-delete-for-good` once (below), and `chat-message-actions` under the load (`found-29-sep/chat-message-actions-reads-after-fixed-waits`; 73/73 on an idle lane).

### `found-29-sep/rail-sections-kept-as-sent` — **closed** (API rule, small; found closing `ledger-rows/row-835-reorder`)

**The planner kept any rail order it was sent**

*Evidence, 29 September:* `updateSettings` (planner.service) validated every other planner setting and had no rule for `railSections`, which `PlannerSettings` did not declare. The web passes over a name that is no section and a repeat when it draws the rail, but the server stored them: measured on lane 5, a PATCH of `["priorities","nonsense"]` and one of `["backlog","backlog"]` each answered 200, and Postgres held `["backlog","backlog"]`.

*Closed, 29 September:* the planner service stores the rail's five sections (`RAIL_SECTIONS`, the web's list), each at most once, and refuses anything else with the reason ("The rail's sections are …", "The rail names a section twice"). `PlannerSettings` declares `railSections`. Every value the Sidebar page has ever written is a subset of the five, so no stored order is made unwritable. `rail-reorder` check 13: before 12/13, after 13/13 on lane 5; patch `rro-10` reddens it (12/13; lane 1, `096fa62`, baseline 13/13).

### `found-29-sep/ui-sweep-stars-the-wrong-type` — **closed** (test tooling, small; raised as a suggested task from this session's sweeps)

**`ui-sweep` starred the wrong task type, passed whichever it starred, and read its settings writes after fixed sleeps**

*Evidence, 29 September:*
- Section 13 pressed `getByRole('button', { name: /Make this the default/i }).first()`. That is the first row not already the default, not the type the section had just made. It then counted any `aria-pressed="true"` button on the page.
- Measured with `us-5`, which makes every star make the first type the default: the old check passed ("PASS and marked it the default", 107/107 on lane 5), and the workspace's default moved to the first type. Every run did that to the shared workspace.
- Sections 12, 13, 13b, 14, 16 and 16b read what they had written after fixed sleeps of 1.3–3.2 s. Four runs at once:
  - section 12 counted 0 member rows on lanes 1 and 6 (three checks);
  - section 13b's click after its reload landed on the task sheet the address was bringing back, and the run threw on lane 7.

*Closed, 29 September:*
- Section 13 finds the new type's row by its rename box and presses that row's star. It waits for the star to read pressed, and for the server to hold the new type as the only default (`GET /workspaces/:ws/task-types`).
- The default it found is put back before 16b deletes the type. A failed put-back is printed as cleanup left behind.
- Every read in sections 12, 13, 13b, 14, 16 and 16b waits for what it reads. A deleted type is gone before the next is read, and the member count waits for the list to stop growing. `openAnyTask` waits for a sheet the address brings back, and Saturday's toggle, when it fails, says what the server's week holds.
- After: 107/107 on lanes 1, 5 and 7, three runs at once. `us-5` reddens "and marked it the default" alone (106/107, lane 6).
- Sections 1–11 and 15 still wait fixed times. They were not seen failing, and they are not claimed here.

### `found-29-sep/space-create-menu-keeps-focus-after-create` — **closed** (visible bug, small; found closing `found-29-sep/comment-plus-menu-keeps-focus-after-create`)

**The sidebar's space "+" menu opens the creator while it closes around the cursor**

*Evidence, measured on lane 2, 29 September:* Task from a space's "+" (`space-create-<type>` in `workspace-sidebar.tsx`, opened from `onClick`) puts the cursor in the closing menu (+16 ms), then on `<body>` (+256 ms), then on the space's "+" (+322 ms). A name typed straight after left the title empty, its space opened the space menu again under the modal, and one Escape closed both.

*To close:* open the creator from that menu's `onCloseAutoFocus`, as the comment "+" does now; a typing check in `space-create-menu`.

*Closed, 29 September.* Measured on lane 2 at `e5501c8` before: Task from a space's "+" left the cursor in the closing menu and then on the space's "+" behind the creator, so "Plan the launch review", typed the moment the creator showed, left its title empty. The menu's items record the choice, and the menu opens the creator from `onCloseAutoFocus`, as the comment "+" does. By then the menu, its focus trap and its Escape layer have gone, Radix has put the cursor on the "+", and the title takes it as the creator opens (measured after: the item at 5ms, the "+" at 201ms, the title at 290ms). Reopening a menu before it has finished closing drops the choice.

`space-create-menu`, 29 → 32 checks, in a last section: the name typed at once lands whole, one Escape closes the creator, and the cursor goes back to the space's "+".
- Before: 31/32 on lane 2 (the typing). One Escape closed the creator before too, and the cursor stayed on the "+" because it had never left it.
- After: 32/32 on lane 2.
- Patches `scf-1..3` redden what they name (lane 2, baseline 32/32). `scf-1` and `scf-3` redden only their own; `scf-2` also reddens the cursor check, because the creator stays open. `space-create-menu-1..5` still redden theirs.
- Regression on lane 2, 34 suites that open the comment composer, its "+", the space "+", Brain or the create modal: every suite ran its full count; 725 of 726 checks passed, the one failure being `brain-entry-points` check 16 on lane 2's stale API.
- In CI already.
- In main after the merge (lanes 6 and 7, `brain-entry-points` now 20 checks with the task actions): `brain-entry-points` 20/20 on both, `comment-plus-menu` 19/19, `space-create-menu` 32/32, and eight more suites that open the create modal, the task menu or the sidebar green.
- Break verdicts at `15e2681`: `scf-1` 31/32, `scf-2` 30/32, `scf-3` 31/32, each reddening what it names; `space-create-menu-1..5` and `form-1..5` redden too, against a 32/32 baseline.

### `found-29-sep/brain-loses-early-typing` — **closed** (visible bug, small; found closing `found-29-sep/comment-plus-menu-keeps-focus-after-create`)

**Brain in the comment "+" menu loses what is typed before its prompt has the cursor**

*Evidence, measured on lane 2, 29 September:* the comment AI panel opens at the choice and the cursor follows when the menu has gone; "Summarize the thread" typed as the panel appeared reached the prompt as "ize the thread", and whole when typed 1.5 s later.

*To close:* open the panel from the menu's `onCloseAutoFocus` too (the creator rows' fix); a typing check in `brain-entry-points`.

*Closed, 29 September.* Measured on lane 2 at `e5501c8` before: "Summarize the thread for the team", typed as Brain's panel appeared, reached the prompt as "S". Brain's row records the choice, and the menu opens the panel from `onCloseAutoFocus`, with `preventDefault` so that Radix does not move the cursor to the "+" afterwards. The opener it shares with the space bar draws the panel with `flushSync` and puts the cursor in the prompt in the same step; it used to focus a frame later. Measured after: typed as the panel appears, the whole instruction lands.

`brain-entry-points`, 16 → 17 checks: a last section on a fresh page, where Brain is chosen from the "+", the instruction typed at once, and the prompt read for all of it.
- Before: 15/17 on lane 2.
- After: 16/17 on lane 2. The one failure is check 16, the server refusing a turn about a missing or foreign task before it streams. It fails because lane 2's API process started at 05:38, before `0e4f0c0` changed `/ai/chat`. It fails the same before, after and under every patch, and needs the lane's API restarted.
- Patch `blt-1` (the panel opens as the row is chosen, as it did) reddens the new check (lane 2, baseline 16/17). `bep-10`, `bep-11` and `cpm-1`, re-aimed at the new rows, redden theirs; `bep-12..14` still redden theirs.
- Regression: as above.
- In CI already.
- In main after the merge (lanes 6 and 7, `brain-entry-points` now 20 checks with the task actions): `brain-entry-points` 20/20 on both, `comment-plus-menu` 19/19, `space-create-menu` 32/32, and eight more suites that open the create modal, the task menu or the sidebar green.
- Break verdict at `15e2681`: `blt-1` 19/20, against a 20/20 baseline. The rest of `brain-entry-points` measured again there: `bep-1..21` each redden (`bep-17` with a model; `bep-7`, `bep-13` and `bep-14` without).

### `found-29-sep/create-modal-returns-focus-to-nothing` — **closed** (accessibility, small; found closing `found-29-sep/comment-plus-menu-keeps-focus-after-create`)

**The create modal gives the cursor back to nobody when it closes**

*Evidence, 29 September:* after Escape from a creator opened by the comment "+", the cursor is on `<body>`. Read in the code: the modal is a portal with a document Escape listener, not a Radix Dialog, and restores focus to nothing when it unmounts.

*To close:* remember what had the focus when the modal opened and give it back on close (unless that is gone), as a dialog does; a check from the comment "+" and from the sidebar.

*Closed, 29 September.* Measured on lane 2 at `e5501c8` before: after Escape the cursor was on `<body>`, both from the comment "+" and from the topbar's New. The create modal now remembers what had the cursor on its first render, before its title takes it, and every way it closes gives the cursor back first, unless that element has left the page. This is done in the close itself, not in an unmount cleanup, which StrictMode also runs on the first mount. The comment "+" and the space "+" let Radix put the cursor on their "+" before the creator opens, so that is what gets it back. Measured after: one Escape returns the cursor to the comment "+", the space's "+" and the topbar's New (by click and by keyboard). There was no ClickUp research, because the dialog rule decides this.

`comment-plus-menu`, 18 → 19 checks: after one Escape, the cursor is on the "+" the creator was opened from. `space-create-menu`'s last check does the same from the space "+".
- Before: 18/19 on lane 2 (the cursor on `<body>`).
- After: 19/19 on lane 2.
- Patches `cmr-1` (the creator gives the cursor to nothing) and `cmr-2` (the comment "+" keeps the cursor from its trigger) each redden the new check alone (lane 2, baseline 19/19). `cmr-1` also reddens `space-create-menu`'s cursor check alone (31/32). `cpf-1..5` and `cpm-2..4` still redden theirs; `cpf-2` now also reddens the New Task cursor check, and its header says why.
- Regression: as above.
- In CI already.
- In main after the merge (lanes 6 and 7, `brain-entry-points` now 20 checks with the task actions): `brain-entry-points` 20/20 on both, `comment-plus-menu` 19/19, `space-create-menu` 32/32, and eight more suites that open the create modal, the task menu or the sidebar green.
- Break verdicts at `15e2681`: `cmr-1` and `cmr-2` 18/19 each, against a 19/19 baseline; `cpf-1..5` and `cpm-1..4` measured again there, each reddening.

### `found-29-sep/no-model-patches-run-with-a-model` — **closed** (test tooling, small; found by the break runs for `0e4f0c0`)

**A break set holding a patch that needs a model and ones that need none ran all of them with a model**

*Evidence, 29 September:* `wt-break.sh` gave the lane a model when any patch in the set said "Reddens only where a model answers". `brain-entry-points` holds either way, and its set carried `bep-17` (model) beside `bep-7`, `bep-13` and `bep-14`, which break the refusal a lane without a model gives. Run as one set on lane 4 at `0e4f0c0`, with the model on, those three read 16/16: they reddened nothing, for the lane's reason, not the product's.

*Closed, 29 September:*
- A patch aimed at the refusal says `# Reddens only where no model answers` (`patches_needing_no_model`, lane-env.sh); the three are marked.
- `wt-break.sh` refuses a set holding both kinds ("run them as two sets", exit 4), and takes the model away for a set that needs none.
- `build-plan.sh` writes a suite whose patches want both as two sets.
- `check-model-lanes.sh --mutate`: the no-model header is named, and the runner asks it, refuses the mixture and takes the model away; 8 of 8 mutations caught. `check-build-plan.sh --mutate`: a mixed suite comes out as two sets; 5 of 5 caught.
- Measured: the mixed set is refused on lane 4. Without the model at `d15081f`, `bep-7` reddens (14/16) and `bep-13` and `bep-14` (15/16 each), against a 16/16 baseline.
- Only these three are marked. Other patches aimed at a refusal in a suite that holds either way would still run with a model if their set holds one that needs it; none is known.

### `found-29-sep/stub-mutants-time-out-unnamed` — **closed** (test tooling, small; found by the preflight for `commit-log/log-b7ee313-1`)

**Under load, a stub gate's mutant run could fail without saying why, and the gate called it "proves nothing"**

*Evidence, 29 September:* in a full preflight beside two agents' runs (load ~10), `check-s3-stub.mjs --mutate` reported "the list is empty whatever is in the bucket — it exited non-zero but named no case"; a second run with the model-stub gate beside it reported two others the same way; alone, 22 of 22 bite. Each mutant re-runs the whole gate: it waits 15 s for its stub to announce itself and is given 180 s in all, and a run ended by either limit exits non-zero with no case named, which the gate cannot tell from a harness fault.

*Closed, 29 September:* both stub gates (`check-s3-stub.mjs`, `check-model-stub.mjs`) wait 60 s for a stub to announce itself and give a mutant's run 300 s. A run ended by the timeout says so ("its run was ended after 300 s (SIGTERM): a loaded machine, not the rule"; shown with the limit set to 2 s), and one that exits unnamed prints its last two lines, so the next one names its cause rather than leaving it to be guessed. Both still count as not biting.
- The next preflight caught the cause. The run printed "(it said: at ChildProcess._handle.onexit …)": the mutant's stub had exited on EADDRINUSE. The gates drew their ports from their pid, `9300 + pid % 400` and `9500 + pid % 300`. Those ranges overlap each other, and stubs left by ended mutant runs were still listening in them (`found-29-sep/killed-mutants-outlive-their-run`). Both gates now take a port the OS chose (`scripts/lib/free-port.mjs`).
- `STUB_GATE_MUTANT_TIMEOUT_MS` sets the limit for a slower machine.
- After: the two gates together, 22 of 22 and 11 of 11, at load ~10.

### `found-29-sep/priority-readd-answers-a-ticked-off-row` — open (visible bug, small; found closing `ledger-rows/row-850`)

**Adding a task that is on a list but ticked off says it was added, and it stays off the rail**

*Evidence, 29 September:* the unique index on (owner, workspace, task) holds one row, and the insert answers a duplicate with the row that is there. A ticked-off row does not stop the prompt, because a done task may be offered again. So pressing Add answers with the done row. The toast says "Task added to … Priorities." while the task stays off the open rail. The owner's own add behaved the same before `ledger-rows/row-850`, which only inherited it.

*To close:* find out from ClickUp what adding a task already done on a priorities list does, and make the add do that, whether reopening the row or saying it is done. Check it from the prompt and from the route.

### `found-29-sep/priority-added-at-on-hover-only` — open (parity, small; found closing `ledger-rows/row-850`)

**When a colleague added a priority is shown only on hover**

*Evidence, 29 September:* ClickUp's expanded Personal Priorities view has "Added by" and "Added at" columns. The Planner rail and the person panel draw "Added by <name>" and give the time only as the row's `title` attribute, which a touch screen cannot show.

*To close:* draw when a row was added, beside who added it, in the rail and the panel. The time is the row's `createdAt`, in the viewer's locale. Check that it is drawn, not only present.

### `found-29-sep/priority-field-adds-to-nobody-else` — open (feature, small; found closing `ledger-rows/row-850`)

**A task's Priority field cannot add it to somebody's priorities**

*Evidence, 29 September:* ClickUp's Priority field has "Add to Personal Priorities", with a person's avatar to pick. Here the only ways a task reaches a colleague's list are the prompt after assigning and the route. The task menu's Add to › Someone's Priorities is `ledger-rows/row-845`.

*To close:* the Priority field's menu offers the workspace's members (not to a guest), and posts to `POST /workspaces/:ws/people/:userId/priorities`, or to the caller's own list. Check it end to end, with the route's refusals said in words.

### `found-29-sep/standup-check-reads-the-stubs-words` — **closed** (test tooling, small; found by the regression for `ledger-rows/row-850` on lane 7)

**`person-panel`'s check that a model's standup was written from real work read the length of the stub's reply**

*Evidence, 29 September:* with a model configured, "and the sentence was written from real work, not from an empty week" asked for more than 20 characters and no "no recorded task activity". On a lane the reply is the model stub's own sentence, "A stubbed reply.", 16 characters, whatever the product sent. So the check failed on every model lane (59/60), and on none could it pass. A longer stub sentence would have made it pass on an empty week just as well. The check means that the model was handed the person's real rows, which the reply cannot show.

*Closed, 29 September:*
- The check reads what the model was handed. The lane's stub records every call (`/__control/seen`, as `ai-task-reads` reads it), and the call that wrote the standup has to carry the finished task's title. The sentence is unchanged.
- Only a deployment elsewhere, whose model records nothing the suite can read, still falls back to the reply.
- `person-panel` 60/60 on lane 7, where it was 59/60.
- `person-panel-5` (new) hands the model an empty week while the API still returns the true rows: 59/60, reddening this check, which says the call "did NOT carry" the title. With the old check the same patch was also 59/60, failing on the stub's 16 characters as the true product did, so the two could not be told apart.

### `found-29-sep/innertext-reads-left-for-later` — **closed** (test tooling, small; left by `found-29-sep/innertext-reads-hidden-leaves`)

**15 `innerText` reads in four suites still decide a "shown" check with nothing on the read**

*Evidence, 29 September:* `assign-to-priorities` (4), `doc-import` (3), `person-panel` (4) and `planner-priorities` (4) were being changed by other work while the rest were converted, so they were left. `check-suite-text-reads.mjs` holds each at its count (`LEFT_FOR_LATER`): a new unguarded read there fails the gate, and a conversion has to lower the number with it. The notes of the conversion list each line and the edit that closes it. `ui-sweep`'s ten, left with them, were converted once its fixed waits were (`found-29-sep/ui-sweep-reads-after-fixed-waits`).

*To close:* guard each read as the other 197 were (`.filter({ visible: true })` on the element read), measure each suite before and after, and take the suites out of `LEFT_FOR_LATER`.

*Closed, 29 September,* once the priorities work that had been changing them (`ledger-rows/row-850`) was merged:
- 18 reads guarded: the 15 held here, and 3 more that the priorities work added to `assign-to-priorities` (the colleague's prompt, and "Added by" in the panel and the rail). Each has `.filter({ visible: true })` on the element read or on the locator handed to `readText`. `planner-priorities`' check that a done priority has left the rail is an absence, so it reads the rail whole and carries the `absence` marker, outside its check's arguments. Every check sentence is as before.
- `LEFT_FOR_LATER` is empty, and `check-suite-text-reads.mjs` passes with nothing held.
- After, with the product unchanged: `assign-to-priorities` 22/22 and `person-panel` 60/60 on lane 7, `doc-import` 16/16 and `planner-priorities` 10/10 on lane 5.
- Three leaves hidden (`display: none`) in scratch builds, each suite run twice against it: once as it is, once with only that read's filter taken off.
  - The Planner's priority counter: 22/22 unfiltered, and 21/22 filtered, reddening "with the counter the frame shows".
  - The person panel's clock: 60/60 unfiltered, and 59/60 filtered, reddening "and their LOCAL TIME as a clock, not a zone name".
  - The import panel's accepted-formats line: 16/16 unfiltered, and 15/16 filtered, reddening "the panel names the formats it accepts".

### `found-29-sep/video-regression-finds-the-composer-by-its-old-words` — **closed** (test tooling, small; found by the `innerText` conversion's runs on lane 6 and the priorities work's on lane 7)

**video-regression looked for the AI composer by the placeholder "Ask Rundesk", which `2c78436` retired, so seven of its checks failed on every lane**

*Evidence, 29 September:* `video-regression` 87/94 on lanes 1, 6 and 7, the same seven each time. G13-10 found the composer with `input[placeholder*="Ask Rundesk" i]`. Since `2c78436` (`commit-log/log-4ad25f6-1`) the resting composer turns through four invitations, none of them "Ask Rundesk", so the locator matched nothing. Asked whether nothing was disabled, the read's catch answered yes: the chain reported "the composer stayed disabled" and skipped its other six checks. The regression for `2c78436` ran the 16 suites that open the dock and not this one, which reaches it from the video's G13 row.

*Closed, 29 September:*
- The composer is found by its own `data-testid="ai-composer-input"`, and waited for until it is shown, instead of a fixed 1.5 s.
- Before 87/94, after 94/94, on lane 1.
- `vr-5` (the composer disabled whatever `/ai/status` says) is new: 87/94 with a scratch build, reddening the check it names; the six after it are skipped by the chain. Nothing claimed that check before. While the chain stopped there, `vr-2` and `vr-3`, which claim checks after it, could only redden by the skip; their runs come with this commit.
- The break set at `f179b3d`, lane 1, against a 94/94 baseline:
  - `vr-1` 91/94 (the inbox view's order and grouping, read back from the server);
  - `vr-2` 92/94 (no trace survived the answer);
  - `vr-3` 93/94 (the chip did not send its suggestion);
  - `vr-4` 85/94 (no dock handle, and the chain's skips after it);
  - `vr-5` 87/94 (the composer stayed disabled).

  Each reddens what it names. `vr-2` and `vr-3` now redden their own checks, where before they reached them only through the chain's skip.

### `found-29-sep/ui-sweep-reads-after-fixed-waits` — **closed** (test tooling, medium; found by the break run for `6a31a5f`)

**ui-sweep still reads after 45 fixed sleeps in sections 0–11 and 15, and a loaded lane outlasts them**

*Evidence, 29 September:* the break set for `ui-sweep` on lane 3 at `6a31a5f`, beside three other break runs, stopped at its baseline, 90/107. Section 9 pressed Ctrl+K, slept 1.2 s and counted the palette once; it had not drawn yet, so the section reported "Ctrl+K did not open the palette" and skipped its other 16 checks. The run before stopped on 16b's teardown for the same kind of read (`found-29-sep/ui-sweep-teardown-skips-the-press`). Sections 12–16b wait for what they read since `d15081f`; sections 0–11 and 15 still hold 45 `waitForTimeout` calls, each a guess at how long the next read needs.

*To close:* every remaining fixed wait becomes a bounded wait for what the next line reads or presses. The palette hotkey toggles, so it is pressed once, after the dialog before it has gone. The check count and every sentence stay as they are. Measure before and after under load, and let the `ui-sweep` break set run to its verdicts.

*Closed, 29 September:*
- All 45 fixed waits are gone; `waitForTimeout` is left only in the header comment. Each became a wait of 10–20 s for what the next line reads or presses. Where a value decides a check, the wait is for the value the check expects, and the check reads once more, so a wait that runs out decides nothing and the check fails in its own words. 107 checks, the same chains and every sentence as before.
- What the sleeps had been covering:
  - The list opens with its default saved view, which resets the grouping when it lands, so §1 waits for that view's own tab to be current.
  - A chip press empties the palette while its search is in flight, and "No task group" is true in that gap. So §9 waits for the response its own press caused, told apart by `q`, `types` and `sort`, and then for one of its hits to be drawn.
  - The list shows the board's statuses and task, so §7 waits for the board's own columns and this run's card on them.
  - §15's "more than 200 characters" was met by the app's shell alone, so each surface is read once its text stops changing. `networkidle` was measured and fired on Docs before anything was drawn.
  - The palette hotkey is pressed once, after the dialog before it has gone.
- With the waits gone, its `innerText` reads were guarded: the ten left for later by `found-29-sep/innertext-reads-hidden-leaves`, and one the conversion added (the wait for the subtasks panel). The header row is guarded by `checkVisibility()` in page code. The tab bodies, the panel and a chip's count are guarded by `.filter({ visible: true })`. A select's chosen option is read off the select, only while the select is shown (`chosenLabel`, as `full-edit-levels` does). `ui-sweep` has left `LEFT_FOR_LATER`.
- Measured by an agent on lane 5, 4 CPUs, other lanes busy:
  - The committed file was 107/107 at every load it chose: 6 and 8 burners in one session, 8 in sessions of their own, and the sweep confined to two CPUs beside them.
  - It was 106/107 once, at load 44: §11 read `?tab=archived` 1.9 s after its `goto` and found the page still blank. That is the failure this removes.
  - It also passed early where it passed: `?tab=spaces` on "Spaces · 0", a heading drawn before its count loaded.
  - The converted file was 107/107 in all 13 runs, under the same loads.
  - Under the confined load: §1b 13.7 → 5.9 s, §9 24.2 → 15.3 s, §12 32.3 → 23.2 s. §15 is slower (102.8 → 168.2 s), because it now reads a finished page, not one 1.9 s after its address changed.
- On the integrated tree: 107/107 on lane 5, in 90 s.
- The `ui-sweep` break set at `f179b3d`, lane 2, against a 107/107 baseline:
  - `us-2` 106 (the buckets did not change on regrouping);
  - `us-3` 106 (share levels listed without their meaning);
  - `us-4` 105 (the field search narrowed nothing);
  - `us-5` 106 (the star did not land on its own type).

  Each reddens what it names. `us-1` names its check in another form ("Reddens: ui-sweep, the `status` iteration of …"), so the plan built from the headers missed it; it runs with the next set.

### `found-29-sep/ui-sweep-teardown-skips-the-press` — **closed** (test tooling, small; found by the break run for `15e2681`)

**ui-sweep pressed Saturday back only if the button said so the moment it was drawn, so a six-day week could stay behind**

*Evidence, 29 September:* the break set for `ui-sweep` on lane 3, beside three other break runs, stopped at its baseline, 106/107. The teardown found "Saturday left as aria-pressed=true". At the end of section 14 the suite read the Sat button once, as soon as the settings page had drawn it, and pressed it only if that read said "true". A button drawn before the week has loaded says "false", so the press was skipped and the shared workspace kept a six-day week for every run after it. The teardown's own read had the same hole the other way: a button read before the week loads also says "false".

*Closed, 29 September:*
- The press back is decided by what the server holds (`GET /workspaces/:id/work-schedule`, Saturday is ISO day 6). The button is waited for until it shows the six-day week, pressed, and the server is waited for until it no longer holds Saturday.
- The teardown's check asks the server as well as the button, and puts the week back through the API when the press failed, so a failed run no longer leaves the next one a six-day week.
- After: 107/107 on lane 3 beside three break runs, two regression runs and an agent's (load about 13). The failing run was the break set's baseline under the same kind of load; its set is queued again on the next commit.

### `found-29-sep/unit-claims-patch-the-main-checkout` — **closed** (test tooling, small; found integrating an agent's work)

**`check-unit-claims.mjs`, run from another checkout, patched the main one and restored its own**

*Evidence, 29 September:*
- Committing `b0ccb1d` (ledger only), `git status` showed 29 files under `apps/` modified by nobody's edit: security and correctness rules turned off (`&& Boolean(0)`, `shared: false`, a guest check dropped). Each was written about three seconds after the last, between 18:48:51 and 18:51:02.
- An agent working in its own worktree had run `node scripts/check-unit-claims.mjs` there, as an extra check. Every patch writes `/home/user/rundesk/…`, the gate ran each as written, and it backed up and restored the files under its own root. So 41 patches wrote the main checkout; the worktree was "restored" untouched, its tests passed, and every claim read green.
- `check-no-break-patches.mjs` called the tree clean: these patches leave no signature.
- Nothing reached a commit: `b0ccb1d` was committed from the index, which held the two ledger files. The 29 files went back to `HEAD` at once, and the agents were told to run no patch-applying gate from a worktree.

*Closed, 29 September:*
- `scripts/lib/patch-root.mjs` aims a patch's text at the checkout that runs it, as `check-break-patches.py` (`_here()`) and `wt-break.sh` already do. `check-unit-claims.mjs` runs each claim through a copy aimed at its own root, in the temp directory.
- Run anywhere but the main checkout, the gate also compares the main checkout's `git status` before and after, and fails, naming the files, if it moved.
- Measured from a scratch worktree of `b0ccb1d` with the fix: the main checkout's status identical before and after, 45 of 45 claims reddened in the worktree, and the worktree restored.
- `check-patch-root.mjs --mutate` is in preflight and CI: 6 cases, 4 of 4 mutations caught (a patch run as written, only the first path moved, a path that only begins the same moved too, the root compared as spelled).

### `found-29-sep/killed-mutants-outlive-their-run` — **closed** (test tooling, small; found committing `found-29-sep/stub-mutants-time-out-unnamed`)

**A mutant run ended by its timeout left its stub listening and its probe file in apps/api, and `git add -A` staged the probes**

*Evidence, 29 September:*
- Before this commit, `git add -A` had staged eleven `apps/api/.s3-stub-probe-<pid>.ts` files.
- Sixteen mutant stubs (`.s3-stub-mutant-*.mjs --port 9301…9661`) were still listening. The run that ended them had finished 46 minutes earlier; it was the 2 s check of the timed-out message.
- The cause: spawnSync's timeout signals the mutant alone, so its stub, its `tsx` probe and the probe file it names after its pid all outlived it. A mutant that throws before stopping its stub leaves the stub the same way.
- The stubs left behind held ports in the gates' own ranges.

*Closed, 29 September:*
- `scripts/lib/run-mutant.mjs` runs a mutant as the leader of its own process group. When the run returns, however it ended, the runner ends the group and removes what the caller says the child names after its pid.
- The two stub gates run their mutants through it, and so does `proveMutationsBite`, which 17 gates use.
- `.gitignore` keeps mutants and probes out of a commit.
- `check-run-mutant.mjs --mutate` is in preflight and CI. A run its timeout ends leaves nothing running and no file, and so does one that exits by itself. 6 cases; 5 of 5 mutations caught.
- Measured with the limit at 1.5 s, which ends every one of the S3 gate's 22 mutant runs. With the runner at `2c78436`, 22 stubs were still listening afterwards and 22 probe files were in apps/api. With this one, none were; all 22 runs said they had been ended. `git add -A --dry-run` staged none of the 22 probes once `.gitignore` held them.
- At full limits, the two gates bite 22 of 22 and 11 of 11 and leave nothing running.

### `found-29-sep/task-brain-offers-list-starters` — **closed** (feature, small; found closing `found-29-sep/ai-chat-takes-no-task`)

**Brain opened from a task offers the list's starters, and Brain in a comment drafts no reply from the thread**

*Evidence, 29 September:* with the dock pointed at a task, the starter cards are the list's (`starterSurface` maps any view but `list` to the workspace's, and `isStarterSurface` refuses `task`, a surface its comment says no caller could send — Brain² sends one now). ClickUp offers Summarize, Progress update and Find similar tasks from a task's Brain, and from a comment's Brain a reply drafted from the thread (help centre, search summaries). The comment AI panel's modes are four writing modes over a typed instruction, and Summarize this task.

*To close:* a `task` starter surface (Summarize this task, Write a progress update, Find similar tasks, and a floor card), chosen when the dock is pointed at a task, each sending through the turn that now carries the task; and a "Draft a reply" mode in the comment panel that sends the task (its comments are in `buildTaskSummaryInput`) and lands in the box only by Keep. Checks for both, on a lane with a model and one without.

*Closed, 29 September.* ClickUp, read through search summaries of the help centre ("Use Brain AI on tasks", "Summarize task and location activity with Brain AI", "Use Brain on task comments"): a task's Brain offers Summarize, Progress update and Find similar tasks, and Brain on a comment crafts a reply.
- The starters have a `task` surface. `isStarterSurface` accepts it, and its catalogue puts Summarize this task, Progress update and Find similar tasks first; the fourth card is chosen by the facts, as on any surface. The dock asks for it when it is pointed at a task. Each card's prompt goes out through the turn that carries the task (`found-29-sep/ai-chat-takes-no-task`), so the answer reads the task. The starters' unit test holds the order, and holds that the three are never offered elsewhere.
- The comment AI panel has a sixth mode, Draft a reply. `POST /ai/comment-reply` checks the task first, before whether a model is configured: none named is 400, a task that is not there 404, one the reader may not open 403. It then drafts one plain-text reply from the task and its thread (`buildTaskSummaryInput`, which holds the comments), with what was typed going along as what the reply should say. The draft reaches the box only by Keep. It is metered as `comment.reply`, a comment. Four locales.

`brain-entry-points` checks 4, 17 and 18 (19 checks now):
- Before 16/19 on lanes 6 and 7: the list's cards were drawn, there was no reply mode, and there was no route.
- After 19/19 on both lanes. On lane 7 the draft shown is the one the server sent.
- `bep-19` (the task surface never asked for) and `bep-20` (the ask dropped) each redden their check alone (18/19, lanes 6 and 7). `bep-21` (a reply for any task; its first version also dropped the missing-id check and did not build, so it takes the task rule alone now) reddens its check (18/19, lane 4, `2c78436`).
- Regression, 8 suites on lanes 6 and 7 (the comment menu, the task's AI bar, the palette, AI reads, the create menu's AI, the dock's answers, the activity filters, AI value): all green.

### `found-29-sep/model-stub-never-streams` — **closed** (test tooling, small; found measuring `ledger-rows/row-743` on a model lane)

**The model stub answered a streamed call with JSON, so no streamed AI answer was ever measured**

*Evidence, 29 September:* `model-stub.mjs` answered every `/v1/messages` call with one JSON message. The chat dock and the other streamed routes call `messages.stream`, which sends `stream: true` and reads server-sent events; the SDK found none, and every streamed turn on a model lane ended in "request ended without sending any chunks". Measured on lane 7: `brain-entry-points` 11/13, its dock turn answered by a stream carrying only that error. `ai-answer-rendering` passed there without a streamed answer to read. `brain-entry-points`' own model branch had never run: it expected 200 where the routes answer a POST 201.

*Closed, 29 September:* a `stream: true` call is answered with the Messages API's own events in its order (`message_start`, a text block whose reply goes out in several deltas, `message_delta` with the stop reason and usage, `message_stop`). `check-model-stub.mjs` streams through the real SDK, as the service does: the deltas join to the scripted reply, the SDK's final message agrees, and it is ended and metered; 12 cases, and 11 of 11 mutations bite (two new: a streamed call answered as JSON, and the reply sent in one delta). `brain-entry-points`' model branch asserts the 201 and that the dock shows exactly the deltas the stream carried; its summarize check, that the panel shows the draft the server sent. On lane 7 with the streaming stub, its dock turn passes.

### `found-29-sep/dock-answers-a-failed-stream-with-nothing` — **closed** (visible bug, small; found measuring `ledger-rows/row-743` on a model lane)

**A turn whose provider failed after the stream opened was answered with an empty bubble**

*Evidence, 29 September:* `chatStream` writes its steps, and when the provider fails its catch records the failure and writes `data: {"error": …}`. The dock's stream reader handled steps, follow-ups, created containers and deltas, and not that frame, so it finalized an answer with no text: the person saw an empty reply and no reason, and the empty turn was not kept, so nothing on reopening said it had failed either. Measured with `brain-entry-points` check 14 on lane 7 (the model stub failing the calls, as often as the SDK retries): the stream carried the error and the dock drew an empty answer, 13/14. On lane 6 (no model, the server's frames handed to the dock): 13/14 the same way.

*Closed, 29 September:* an `{ error }` frame marks the turn failed. The dock answers it with its house line ("Sorry, I encountered an error. Please try again."), after whatever text came before the failure; the provider's message is not the person's to act on. A failed turn is not written to the thread, where what came before the failure would read as the whole answer. Check 14: after 14/14 on lanes 1, 3 and 7. Its first version counted the dock's answers, and a regenerate drops the answer it replaces, so it failed on the fixed build too: the before above was read by that version. It reads what the last answer says now, and the before is `bep-15`'s run (the frame unread, built and run on lanes 6 and 7): 13/14 on each, check 14 alone.

### `found-29-sep/stale-model-stub-never-replaced` — **closed** (test tooling, small; found restarting lane 7's model stub for `model-stub-never-streams`)

**A lane's stale model stub was never stopped, so its replacement died and the old one kept answering**

*Evidence, 29 September:* `lane_model_up` compares the running stub's source with the file and restarts a stale one: it ran `pkill -f "model-stub.mjs --port $port "`, with a space after the port. The store stub's command line goes on past its port (`--bucket …`), so its copy of that line matched; the model stub's ends at the port, so this one never did. Measured on lane 7: `lane_model_up 7` printed "the model stub never announced itself on 9207", its log held EADDRINUSE, and 9207 went on answering with source `562fad040c30` while the file read `bc096d578862`.

*Closed, 29 September:* `stub_down` (lane-env.sh) stops a stub by its port matched as a whole word, and returns once nothing answers on it; the model and store launchers and `fleet-up.sh` use it. After: `lane_model_up 7` answered, and 9207 reports `bc096d578862`. `scripts/e2e-lanes/stub-down-selfcheck.sh --mutate` (preflight, and CI's verify job — no lane): the real model and store stubs on spare ports are both stopped, and a stub on a port that begins with the same digits is left alone; the old pattern and a pattern with no end to the port are each caught.

### `found-29-sep/primary-create-silent-under-a-space` — **closed** (visible bug, small; found building `commit-log/log-6b140c5-1`)

**The create modal's Create task closed and said nothing when the list was picked under a space alone**

*Evidence, 29 September:* the primary button's `onSuccess` went to the task only when a project had been picked (`spaceId && projectId && listId`). A list made under a space alone sits in the space's hidden container, and picking it leaves the project empty, so the modal closed, the page stayed where it was, and nothing said the task had been made. Measured on lane 5 with `create-task-chevron` check 8: one task made, the modal closed, the page `/app/<ws>`, no sheet.

*Closed, 29 September:* the primary opens the task through the same `opener` Create and open uses, which reads the list row's container when no project was picked; where no page can be worked out it says the task was made, as Create and close does. Check 8: before failed on lane 5 (7/9 with check 9), after 9/9 on lane 3. Patch `ctc-13` (the primary needs a project again) reddens check 8 alone (8/9, lane 1).

### `found-29-sep/task-create-fails-silently` — **closed** (visible bug, small; found building `commit-log/log-6b140c5-1`)

**A refused or failed task create said nothing**

*Evidence, 29 September:* the task tab's create mutation had no `onError`, the defect the List and Folder tabs beside it had and lost ("THIS MUTATION HAD NO `onError`", twice in the same file). A refused POST, for the primary and all four endings, left the modal as it was with the button back, which reads as a press that did not register. Measured on lane 5 with `create-task-chevron` check 9, the server's 403 answered in the page: no toast, the form kept.

*Closed, 29 September:* the refusal is said in the server's words (or "That task could not be created." when there are none; four locales), and the form keeps what was typed. Check 9: before failed on lane 5, after 9/9 on lane 3. Patch `ctc-14` (no `onError`) reddens check 9 alone (8/9, lane 3).

### `found-29-sep/comment-plus-menu-keeps-focus-after-create` — **closed** (visible bug, small; found building `commit-log/log-6b140c5-1`)

**After New Task, New Doc or New Whiteboard from a comment's "+" menu, the menu stays mounted and holds the focus**

*Evidence, 29 September (the chevron build's regression, instrumented):* choosing one of the three opens the create modal, and the comment's "+" menu stays mounted, `data-state="closed"`, with the focus still in it, until an Escape dismisses it. Its Radix layer takes that first Escape and marks it handled, so an Escape meant for the modal went to the menu (which is why the create modal's first Escape guard broke `comment-plus-menu`'s New Doc section).

*To close:* close the "+" menu before the create modal opens (or open the modal from the menu's `onCloseAutoFocus`, as Brain opens the comment AI panel), so the modal's title has the focus; a check that typing straight after New Task lands in the title, and that one Escape closes the modal.

*Closed, 29 September.* Measured on lane 2 at `096fa62` before: after New
Task, New Doc or New Whiteboard from a comment's "+" menu, the creator opened
at once while the menu closed around the cursor, and the menu handed it
185–254ms later to the "+" behind the modal. A name typed at once went into
the closing menu; typed a moment later, into the "+", whose first space opened
the menu again under the modal. The menu did not stay mounted until an Escape:
the suite's New Doc section pressed its Escape inside that window. ClickUp
(help centre "Create tasks from task, Inbox, and Doc comments" and "Use
keyboard shortcuts", from search snippets; the pages are refused by this
machine's proxy): the creator opens to be named, and Esc closes the topmost
layer; nothing found says where the cursor goes.

- The three rows record which creator was chosen, and the menu opens it from
  `onCloseAutoFocus`, once it has unmounted with its focus trap and Escape
  layer, without putting the cursor back on the "+". The creator's title keeps
  the cursor its `autoFocus` gives it, and the first Escape is the creator's.
  The creator appears about a quarter of a second after the choice (the menu's
  closing animation) instead of at once. Brain is unchanged. The Doc form's
  title has a test id.

`comment-plus-menu`, 13 → 18 checks: the cursor in the doc's title after New
Doc; New Whiteboard followed to its form, the cursor in its title; New Task
with a name typed the moment the creator shows, then the cursor in the title,
the whole name in it, and one Escape closing it.
- Before: 14/18 on lane 2 (the four cursor and typing checks; one Escape closed
  the creator before too, the modal ignoring the menu's mark).
- After: 18/18 on lane 2.
- Patches `cpf-1..5` each redden what they name (lane 2, baseline 18/18),
  `cpf-2..5` that alone and `cpf-1` its check and the typing one; `cpm-4`,
  re-aimed at the rows' new shape, reddens its check and the doc-cursor one;
  `cpm-1..3` still redden theirs.
- Regression on lane 2, the 33 suites that open the comment composer, its "+"
  or the create modal: 33/33, 694 checks.
- In CI already.
- In main after the merge: `comment-plus-menu` 18/18 on lane 5, and 10 suites that open the composer, its "+", the create modal or Brain green on lanes 5 and 6.
- On the committed tree (lane 4, `e5501c8`, baseline 18/18): `cpf-1..5` and `cpm-1..4` each redden again.
- Found beside it: the sidebar's space "+" menu hands the creator's cursor on the same way (`found-29-sep/space-create-menu-keeps-focus-after-create`); Brain loses what is typed before its prompt has the cursor (`found-29-sep/brain-loses-early-typing`); the creator gives the cursor back to nobody when it closes (`found-29-sep/create-modal-returns-focus-to-nothing`).

### `found-29-sep/chat-message-actions-reads-after-fixed-waits` — **closed** (test tooling, medium; found by this batch's regression sweep)

**`chat-message-actions` reads what it checks after fixed waits, and fails under load**

*Evidence, 29 September:* in a sweep of 57 suites on five lanes at once it failed three checks on lane 3 ("landing on /chat puts the channel it chose in the address", and the two Mark unread checks after it); alone on lane 3 a different one ("the empty channel shows action cards"); on an idle lane 5, 73/73. The suite waits a fixed time and then reads, 53 times (`waitForTimeout(4000)` before the empty channel's cards, `3500` before the address): the pattern already taken out of 20 other suites.

*To close:* each read waits for what it reads (`waitUntil` on the element or the address), the fixed waits go, and the suite holds 73/73 on four lanes at once.

*Closed, 29 September.* The suite waits for what it reads.
- Its 53 fixed sleeps (85.8 s a run) are gone, and none is kept: nothing its checks read is debounced or timed.
- Each read waits, bounded, for its own target: the empty channel's cards, the address `/chat` writes, each menu, picker, dialog and draft as it opens or closes, the clipboard, and the Replies row's controls.
- Each press the server answers is read back once the server has it: the assignee's list, the reminders, the thread's mute, the forward, and the reply's `readAt`.
- The 73 checks, their sentences and both sides of every branch are unchanged. A run takes 51–56 s instead of 107–112 s.

Before:
- One copy with three CPU hogs, all pinned to one core: 59, 60 and 59 of 73, failing the empty channel's cards, the thread link at 1200 and 1680 (with the checks after each) and the Replies row's resolve.
- An idle lane: 73/73.

Three more defects in the same suite, found and fixed while closing it:
- **The Replies section took any new unread reply notification as its own**, so two runs on one lane could take each other's. Measured with the interleaving arranged: the old match took the other run's. It keeps the id of the reply it posted now, and takes the notification that names it.
- **The five hover-toolbar checks passed on a toolbar that never shows.** Playwright counts opacity 0 as visible, and a build keeping it hidden passed 73/73. Each now reads the control with `checkVisibility({ opacityProperty: true })`, hidden with the pointer off the row and shown after the hover. New patch `cma-5` reddens those five and nothing else (68/73).
- **"and it will not send until somebody is chosen" read a missing Forward button as disabled**, and the unbounded press after it ended the run at 55 of 73. It requires the button to be shown and disabled now, and the press is bounded, so a missing button fails its checks in their own words and the run reaches its end.

After:
- 73/73 three times under the pinned load, and idle.
- Three copies at once on lane 5: 73/73 each.
- Four lanes at once in main (lanes 1, 2, 4 and 5, load ~19): 73/73 on each.
- `cma-1..5` each redden exactly what they claim (67, 70, 72, 72 and 68 of 73, lane 5).
- Measured again at `15e2681` on lane 1: baseline 73/73; `cma-1..5` 67, 70, 72, 72 and 68 of 73.

### `found-29-sep/ai-chat-takes-no-task` — **closed** (feature, small; found closing `ledger-rows/row-743`)

**The AI dock pointed at a task knows its title and id, not its contents**

*Evidence, 29 September:* Brain² opens the dock pointed at the task, and each turn names the task to the server (`list / task "<title>" (id <uuid>)`). `POST /ai/chat` takes no `taskId`, so the model never reads the task's description, comments or subtasks. ClickUp's task Brain reads the location it is opened from, and offers Summarize, Progress update and Find similar tasks there (help centre, through search summaries). The comment panel's Summarize this task already reads the task, through `/ai/summarize`.

*To close:* take an optional `taskId` on `POST /ai/chat`, resolved before the stream opens the way `skillId` is: `assertTaskReadable`, then `buildTaskSummaryInput` appended to the context, and a `step('task')` line in the trace. The web sends the `scope.id` it already holds. Then the task-surface starters (`GET /ai/starters?surface=task&taskId=`: Progress update, Find similar tasks), and a reply drafted from the comment thread (`POST /ai/comment-draft`), both of which need the first.

*Closed, 29 September.* ClickUp ("Use Brain AI on tasks", "Collaborate with ClickUp Brain anywhere in your Workspace", read through search summaries): Brain opened from a task reads that task, the location it was opened from. `POST /ai/chat` takes the task's id now:
- Before anything else, and before whether a model is configured, the reader must be able to open the task (`assertTaskReadable`) and it must be in the workspace the turn names. A refusal is a status code (404, 403 or 400) and nothing is streamed.
- Then what Summarize reads — the task's title, status, priority, description, recent activity, open subtasks, blockers and comments (`buildTaskSummaryInput`) — goes into the context under "The task this conversation is about", with a `task` step in the trace ("Reading this task", four locales).
- The dock sends the id of the task it is pointed at, beside the view it already sent.

`brain-entry-points` checks 15 and 16:
- Before 14/16 on lanes 6 and 7: no id on the wire, and a turn about a task that is not there answered 503 with no model and a streamed 201 with one.
- After 16/16 on both; on lane 7 the model's prompt holds the task's description.
- `bep-16` (the dock keeps the id to itself) reddens check 15 alone on lanes 6 and 7. `bep-17` (the task named, not read) reddens it on a lane with a model and `bep-18` (no task rule) check 16, each alone (18/19, lane 4, `85ab443`).
- Regression, 16 suites on lanes 5, 6 and 7 (the AI surfaces, the palette, the task's AI bar, the create menu's AI, the comment menu, `video-regression`): all green.
- Two suite defects found by these runs and fixed: check 14 staged its failure before the turn before it had called the model (lane 7), and read the other workspace from the wrong field.

What ClickUp offers from a task beyond reading it — its own actions, and a reply drafted from the thread — is `found-29-sep/task-brain-offers-list-starters`.

### `found-29-sep/innertext-reads-hidden-leaves` — **closed** (test tooling, medium; found closing `checks-read-textContent-not-what-is-shown`)

**A check that reads an element's `innerText` still reads a hidden element's whole text**

*Evidence, measured 29 September in the lanes' Chromium:* `innerText` leaves out hidden text inside an element that is drawn, but an element that is itself hidden (`hidden`, `display: none`) answers with its whole text, as `textContent` does; only `visibility: hidden` answers empty. There are 252 `innerText` / `allInnerTexts` reads in 86 suites, and about 35 have a visibility check on the same line. A read of a leaf — a count, a chip, a label — that stands for "shown" cannot fail on a patch that hides the leaf rather than removing it. `task-menu`'s print checks read the printed id out of a copy that is hidden on screen by design, so they say what the copy holds, not what paper shows.

*To close:* measure which `innerText` reads decide a check that text is shown, and give `check-suite-text-reads.mjs` the same three outs for them (a message, a visibility guard on the read, a marker with a reason); convert; and read `task-menu`'s print checks under print media.

*Closed, 29 September.* Measured first, at `15e2681`, each suite lexed with its comments stripped: 266 `innerText` / `allInnerTexts` / `.innerText` reads in 90 suites (the ledger's 252 in 86, counted on an earlier tree), and 130 more through `readText(locator)`, which is `lib/wait.mjs`'s `innerText` and which no grep for `innerText` sees: 396 reads in 115 suites. 121 already had an out; 32 read the page's own body and 10 asked the same element's visibility first, both of which do read what is drawn. 197 decided a check that text is SHOWN with nothing on the read (counts, chips, toasts, labels, rows, panels, 6 of them `<option>`s), 10 asserted an absence, 1 was page code already guarded by its own box, and 25 sat in five suites other work was changing.

In the lanes' Chromium a hidden leaf (`hidden`, `display: none`) answers `innerText` with its whole text, `visibility: hidden` and a closed `<details>` answer empty, the body answers with only what is drawn, and Playwright counts no `<option>` as visible.

- `check-suite-text-reads.mjs --mutate` (preflight, and CI's verify job) reads `innerText`, `allInnerTexts`, the `.innerText` property and `readText(locator)` with the same three outs as `textContent`. The visibility guard has to be on the element read, not an ancestor (`<option>`s excepted, guarded on their select). For `innerText` alone, the page's body and the same element asked first (`isVisible()`, or a `waitFor` for it shown, gating the read) count as guards too. 42 planted cases; 28 of 28 mutations bite.
- 197 reads guarded in 84 suites: `.filter({ visible: true })` on the element read or on the locator handed to `readText`, and on the `<select>` for the six option reads. 7 of them got the catch a hidden element now needs. 12 reads carry a marker: the 10 absence reads, and the two reads `ai-answer-rendering`'s helper used to make unfiltered, its answer (`absence`) and a card's label (`key`). `a39-dm-tabs`'s `main, body` is written as the body it always was, and `loading-states` names `checkVisibility()` beside its box check. Every check sentence is byte-for-byte as before: 1802 check calls in 86 suites.
- `task-menu`'s print checks read under print media: the `print()` stub leaves the dialog open; the suite reads the copy and its id filtered to visible under `emulateMedia({ media: 'print' })`, restores screen media, then fires `afterprint` itself.
- Break sets for the 87 changed suites run after the commit, two lanes at a time (642 patches). The first, `task-menu` at `f179b3d` against 37/37, gave 33, 35, 34 and 36 of 37 for `task-menu-1..4`, each reddening what it names.
- Lane 6, the git original and then this tree: 85 of the 86 changed suites green both times with their full counts (1763 checks). `video-regression` is 87/94 both times with the same seven: its G13-10 chain looks for the composer by "Ask Rundesk", a placeholder `2c78436` retired.
- Six leaves hidden in scratch builds: `task-menu`'s printed id, `activity-rail`'s created chip, `checklists`' open count, `planner-grid`'s backlog rows, `bookmarks`' list, and an integration's error title. Each check stayed green on the git original with its leaf hidden and reddened after the change.
- Left for later: 25 reads in `assign-to-priorities` (4), `doc-import` (3), `person-panel` (4), `planner-priorities` (4) and `ui-sweep` (10), which other work was changing. The gate holds each suite at that count (`LEFT_FOR_LATER`): a new unguarded read fails, and a conversion has to bring the number down with it.
- Integrated at `15049dd` with the rest of the tree since `15e2681`; the regression on the integrated tree ran on lanes 1–3. 85 of the 86 changed suites were green on the first run (1856 checks), among them `video-regression` at 94/94 with its composer fix. `task-cover` failed 1 of 42 there, a check this change does not touch (its 12 s wait for the cover band, at load 15), and was 42/42 run again on lane 2. `ui-sweep`, the 87th, was 107/107 on lane 5. Of the 25 reads left for later, `ui-sweep`'s ten were converted in the same batch, after its fixed waits (`found-29-sep/ui-sweep-reads-after-fixed-waits`); the other 15 are `found-29-sep/innertext-reads-left-for-later`.

### `found-29-sep/unit-claims-read-a-nested-checkout` — **closed** (test tooling, small; found by the preflight for `workspace-audit-log-not-in-settings`)

**The unit claims patched this tree and ran an agent worktree's copy of the test**

*Evidence, 29 September:* the preflight's "and the unit claims redden too" read 0 of 41 claims as reddening — 16 "still passed with the patch applied", 25 failed without the test's name — where every earlier run read 41. `check-unit-claims.mjs` found the test file a claim names by walking the whole repository, skipping only `node_modules`, `dist` and `.git`. Two agent worktrees sat under `.claude/worktrees/`, each a whole copy of the repository, and `.claude` sorts before `apps`: the walk returned their copy of every test. The patch went into this tree; the test that ran was theirs, unpatched.

*Closed, 29 September:* the walk is `scripts/lib/find-in-tree.mjs`, which passes over any directory below the root that holds a `.git` (a worktree's file or a clone's directory): a nested checkout is another tree.
- `scripts/check-find-in-tree.mjs --mutate` (preflight, and CI's verify job): a throwaway tree holds the same test file in its own place and inside a nested checkout that sorts first; the walk must return the tree's own, and a copy of the walker without the rule must return the nested one.
- Before: 0 of 41 with the two worktrees in place. After, the same worktrees in place: 41 of 41 reddened, 0 did not, 0 unreadable.

### `found-28-sep/copy-points-admins-to-the-console` — **closed** (stale reason, small; found by the ClickApps research)

**Sign-up copy and the feature gate's sent message point workspace admins to the platform console**

*Evidence:* `signUp.featuresSubtitle` says "Admin → Features", the super-admin console, where a workspace admin's switches are Settings → Features. `gate.sent` says "Your workspace admins have been asked", though the ask now reaches whoever holds `workspace.clickapps.manage`.

*To close:* Correct the copy in four locales.

*Closed, 28 September.* Sign-up's Features step says the choice is changed later in Settings → Features (Ajustes, الإعدادات, ترتیبات), and the gate's four answers — sent, muted, nobody to ask, failed — name the people who manage ClickApps rather than "your admins", in four locales. The gate opens only on a plan-locked action, so its answers are read by a web unit test (`lib/i18n/clickapps-copy.test.ts`, every locale); the sign-up step by a suite.

`clickapps-copy`, 1 check:
- Before: 0 of 1 on lane 7, the step reading "…later in Admin → Features".
- After: 1/1 on lane 7, twice. The suite waits for each step's counter and for step one's fields to leave before filling step two: filling on the counter alone typed into the field sliding out.
- Patches `cac-1` (the sign-up line) and `cac-2` (a unit claim on the gate's answer). Both redden: `cac-1` on lane 1 at `f8a799d` (0/1, the step said "Admin → Features" again), and `cac-2` in the unit claims.
- In CI (227).

### `found-28-sep/members-see-no-clickapps-list` — **closed** (feature, small; found by the ClickApps research)

**A member cannot see which ClickApps are on**

*Evidence:* ClickUp: "Members can view, but not activate or deactivate ClickApps." RunDesk shows the Features tab to key holders only, so a member learns what is off only when the navigation hides it.

*To close:* Open Features read-only to every member but a guest, with the switches offered by the key.

*Closed, 28 September,* in `member-settings-tabs` with `members-have-no-trash-to-open`. Features opens to every member but a guest; the tab already drew every switch disabled with its reason for someone without `workspace.clickapps.manage`, and live for a holder. Measured: before, a plain member had no Features tab; after, they see all twelve ClickApps with every switch disabled and "Only workspace admins, and members granted Manage ClickApps, can change these settings", and the admin's twelve are live. `mst-5` closes the tab again and `mst-6` makes the switches live for everyone.

### `found-28-sep/settings-blank-on-a-slow-permission-read` — **closed** (visible bug, medium; found by the flaky-suite work on `three-suites-fail-under-a-full-sweep`)

**Opening Settings as a non-admin went blank when the permission read was slow**

*Evidence, measured 28 September:* the settings route's `beforeLoad` awaited `GET /roles/me/permissions` and then threw its redirect (to the landing tab, or away). With the read held back 4.5 s (`page.route`, a scratch probe on lane 7), a plain member's Settings went blank on 6 loads of 6: the URL moved to `?tab=archived`, the body was empty, no tab was drawn, and the page threw a value with no name and no message — the late redirect escaping the router after the load had been superseded. It is one of the reasons `settings-role-grants` missed under a sweep's load; no test-side wait could fix it. Only this route awaited a request before a redirect.

*Closed:* the route decides only from an answer it already holds and asks for the answer without waiting (`prefetchQuery`); the page makes the same decision when the answer lands — nobody with no tab stays, and a tab that is not theirs, or none, takes them to their landing tab. Tab content was already drawn only for a tab the person may open (`shown`), so nothing shows early.
- The probe after: 0 blank of 6, each load on `?tab=archived` with three tabs and nothing thrown.
- `member-settings-tabs`' slow-read check: three loads of three land on Archived with the read held back 4.5 s.
- Patches `sbs-1` (the route awaits again) and `sbs-2` (the page never decides); both typecheck applied, and both reddened the slow-read check (lane 2, at `ebe20cf`). `srg-1` is re-aimed onto `settingsTabsFor`, which both now read, and reddened its check.

### `found-28-sep/own-capacity-not-self-service` — **closed** (feature, small; found by the people-and-calendar research)

**A member cannot set their own weekly capacity**

*Evidence:* ClickUp lets every member set their own capacity in Workload. `PATCH members/:userId/capacity` refuses a member even for themselves (it asks `members.profile.manage`), and no page offers it.

*To close:* Let a member set their own, and keep others' behind the key.

*Closed, 29 September.* Measured on lane 1 at `c55a088` before: a plain member setting their own weekly capacity was refused (403, "Missing required permission: members.profile.manage"), and the Workload page drew every capacity as a figure, for everyone. ClickUp ("Set capacity limits in Workload view"): "Workspace members can set capacity for themselves, while Admins, Workspace owners, and managers can set capacity for themselves and others", by clicking the capacity beside the name.

- `PATCH members/:userId/capacity` takes a member's own from any member but a guest ("A guest has no capacity to set"); somebody else's asks `members.profile.manage`, refused as "Setting somebody else’s capacity takes the Set member profiles permission", and the rank rule stays.
- The Workload page's capacity beside a name is a button on the reader's own row, and on everyone's for a holder of the key: it opens a weekly-hours field and saves. Four locales.

`own-capacity`, 6 checks:
- Before: 1/6 on lane 1 (a manager setting a member's, and refused an admin's, which held).
- After: 6/6 on lane 1.
- Patches `ocp-1..7`: all seven redden (lane 2, at `0911c6e`, baseline 6/6); `pca-6`, re-aimed onto the inline key, reddens (lane 4, at `d86220d`, baseline 8/8).
- In CI (231).

### `found-28-sep/archived-tasks-unarchived-in-place` — **closed** (feature, small; found by the archived-tasks research)

**An archived task is restored only from Settings → Archived**

*Evidence:* The task sheet and the list page's archived rows offer no Unarchive, though the API lets whoever may change the task restore it. ClickUp puts Unarchive on the task. `listArchivedTasks` also asks the write rule once per row (up to 200).

*To close:* Offer Unarchive where the row is shown, by `canRestore`, and batch the rule.

*Closed, 29 September.* Measured on lane 5 at `394d3f9` before: an archived task opened in its sheet (from search or a link) said nothing of being archived and offered no way back, and its capabilities carried no answer for restoring it. ClickUp: Unarchive is on the task, and unarchiving needs Edit on its location.

- The task's capabilities carry `restore`: an archived task, not one in the Trash, that `POST /tasks/:id/restore` would take from this person (`taskRestorable`, the rule the route asks).
- The sheet says "This task is archived." on one, with Unarchive where `restore` allows, which restores it in place. Four locales. The list page shows no archived rows, so the sheet is where an archived task is shown outside Settings → Archived.
- Settings → Archived asks the rule once for a role that decides it: an admin restores every listed row, a manager the rows of the spaces they belong to (one read), and only a member's or guest's answer, which turns on each task's own shares and assignees, is still asked per row.

`unarchive-in-place`, 5 checks:
- Before: 1/5 on lane 5 (Settings → Archived's answers, which the batching keeps).
- After: 5/5 on lane 7.
- Patches `uip-1..8`: all eight redden (lane 2, at `d86220d`, baseline 5/5); `ata-4` and `tsc-1`, re-aimed, redden (lane 2, at `d86220d`, baselines 7/7 and 5/5).
- In CI (233).

### `found-28-sep/job-title-rule-and-message-disagree` — **closed** (permissions, small; found by the user-group research)

**Changing a colleague's job title asks the manager role and says it is an admin's**

*Evidence:* `setJobTitle` (`workspace-groups.service.ts` near :444-453) asks `isManagerRole`; its message says "Only a workspace admin may change somebody else's job title"; the Teams page offers the edit only to the person themselves. Also: `?search=` goes into `ilike` unescaped, and `removeMember` audits a removal that removed nothing.

*To close:* Choose the rule (ClickUp: a person's own profile), state it once, and measure.

*Closed, 28 September.* ClickUp (help centre "Intro to profiles", from search snippets): "You can add and update your own title on your profile", and "the Workspace owner and admins can edit everyone's titles", from "Add description" under the person's name.

Measured on lane 7 at `5086fe0`, `job-title-rule` passed 3 of 11. The three that passed pin what stays: your own title, an admin setting anyone's, and a plain member offered the pencil on their own card only. The eight failures:
- The refusal said "Only a workspace admin may change somebody else's job title", while the route let managers through.
- A member granted `members.profile.manage` was refused (403).
- A manager retitled an admin (200).
- The Teams page offered the pencil on your own card only, so an admin or a manager, whom the API allowed, could not set a title from the page.
- A save that failed said nothing: the draft stayed open with no reason.
- A team search for "50%" also found "cut 500 now", and "a_b" found "axb": the query went into ILIKE as a pattern.
- Removing somebody who was not in a team wrote a `group.member_removed` line to the audit log.

Now:
- Somebody else's title asks `members.profile.manage`, the key capacity and reports-to ask: an admin's and a manager's by default, grantable by a custom role. Its rank rule applies too, so nobody sets the title of somebody above their own role. The refusal names the permission.
- The key's label is "Set member profiles" and its description names the job title, in the catalog and the four locales.
- The Teams page offers the pencil by the same rule (`withinRank`, `usePermissions`), labelled with the person's name on another's card. A failed save says why on the card and keeps the draft.
- The team search is literal through `likeContaining` (`common/sql/like.ts`), with a unit test. The other LIKE sites are `found-28-sep/like-patterns-escaped-four-ways`, below.
- A removal is audited only when it removed somebody.

`job-title-rule`, 11 checks:
- Before: 3 of 11 on lane 7.
- After: 11/11 on lane 7.
- Patches `jtr-1..10`; `jtr-10` is a unit claim. `jtr-1..6`, `jtr-8` and `jtr-9` each reddened the check they name (lane 2, at `ad97e31`, baseline 11/11); `jtr-10` reddens its unit test. `jtr-7` did not build — it left `void (…,)` — and, re-aimed to send the reason to the console instead, reddened its check (lane 3, at `96305b3`).
- Regression on lane 7: `teams-person-cards` 17/17, `user-group-access` 8/8, `people-calendar-access` 8/8.
- In CI (221).

### `found-28-sep/like-patterns-escaped-four-ways` — **closed** (visible bug, small; found closing `job-title-rule-and-message-disagree`)

**A search containing % or _ matches more than was typed in three places, and the escape is written four different ways**

*Evidence (reading, 28 September):* `%` and `_` are LIKE wildcards, and `\` is the escape.
- Unescaped: global search (`search.service.ts:499`, every branch that uses `like`: tasks, docs, people, comments, channels, messages, folders, lists, spaces, meetings, attachments) and saved chat messages (`chat.service.ts:2806`). A search for "50%" there finds "500".
- Escaped four ways: `chat.service.ts` has a private `escapeLike`, `tasks.service.ts:2268` and `activity.service.ts:47` inline copies, and `project-templates.service.ts:485` a copy that leaves the backslash itself unescaped, so a template search ending in `\` escapes the closing `%`.
- The team search was a third unescaped site; it uses `likeContaining` now.

*To close:* every site through `common/sql/like.ts`, and a suite that searches each surface for a literal `%` and `_`.

*Closed, 28 September.* Fixing it found four more unescaped sites than the evidence listed: global search's extras path (people, comments, channels, meetings), its custom-field value filter, the platform user directory (`organizations.service.ts`) and a person's activity search (`people.service.ts`). Every LIKE site in the API now goes through `likeContaining`; `chat.service.ts`'s private `escapeLike` and the inline copies in tasks, activity and templates are gone, and no `` `%${…}%` `` remains.

`like-literal`, 5 checks, each surface given two names a pattern cannot tell apart ("cut 50% now", "cut 500 now"):
- Before: 0 of 5 on lane 7 — the workspace search, saved messages, a person's activity and the user directory each found both names, and a template search ending in `\` found nothing.
- After: 5/5 on lane 7.
- Patches `lik-1..5`, one per surface; `taf-4` and `tps-2`, which removed the old inline escapes, are re-aimed onto `likeContaining`. Run on lane 1 at `f8a799d`, all seven redden: `like-literal` 4/5 under each of `lik-1..5` (the search, saved messages and a person's activity found the 500 row beside the 50% one, the directory both people, and the template search ending in `\` nothing), `task-activity-filter` 15/16 under `taf-4`, `task-pickers-search` 7/8 under `tps-2`.
- Regression on lane 7, 20/20 with the copy change: `like-literal`, `clickapps-copy`, `search-read-access`, `task-activity-filter`, `task-pickers-search`, `template-center`, `activity-rail`, `ai-activity-filters`, `guest-chat-scope`, `guest-read-scope`, `private-folder-reach`, `private-list-reach`, `workspace-read-access`, `task-mentions`, `trending-sort`, `clip-library`, `app-catalogue`, `list-under-space`, `job-title-rule` and `clickapp-flags-access`.
- In CI (226).

### `found-28-sep/verify-hides-the-first-failures` — **closed** (test tooling, small; found measuring `job-title-rule`)

**`verify.sh` printed the last eight lines of a run's failures, so a run with eight failures showed seven**

*Evidence, 28 September:* `job-title-rule` failed 8 checks before its fix. `verify.sh` printed `grep 'passed,|FAIL' | tail -8`, which is seven FAIL lines and the count, so the first failure — the refusal that still said "Only a workspace admin" — was only in the log. The summary did not say lines were missing. The log was also one file per suite (`/tmp/claude-0/run-<suite>.log`), so the same suite run on two lanes at once wrote into one file.

*Closed:* `verify.sh` prints every FAIL line and the count, names the whole log when the run failed, and keeps one log per suite and lane (`run-<suite>-lane<N>.log`). Nothing reads the old path; `sweep.sh` counts exit statuses, not these lines. Measured on lane 7 with a throwaway suite printing nine failures: all nine lines, the count and the log's path were printed, and the exit was 1.

### `found-28-sep/e2e-proxy-advertises-the-apis-keep-alive` — **closed** (test tooling, small; found by the flaky-suite work on `three-suites-fail-under-a-full-sweep`)

**The e2e proxy told clients to keep a socket for 72 s and closed it after 5, so a suite's own request after a pause died with "fetch failed"**

*Evidence, measured 28 September:* `test/e2e/lib/local-stack.mjs` serves the bundle and proxies `/api` to a lane, forwarding the API's response headers as they came, `Keep-Alive: timeout=72` among them, while its own `http.Server` closes an idle socket after Node's default 5 s. A client keeps a socket as long as it is told, so a suite's `fetch` through the proxy after a pause of 5–72 s went out on a socket the proxy had closed: with a stand-in API saying `timeout=72` and 6 s idle gaps, 1 of 4 requests died with `UND_ERR_SOCKET`. `list-empty-states`, `ai-answer-rendering` and `create-menu-ai` each recorded a `fetch failed` of this shape in sweeps, with nothing wrong in the API's log.

*Closed:* the proxy passes only end-to-end headers (`endToEndHeaders`, RFC 9110 §7.6.1): `Connection`, `Keep-Alive` and the other hop-by-hop headers — and any the `Connection` header names — describe the connection they arrived on and are not forwarded, so a client sees the proxy's own keep-alive. The same stand-in after: `timeout=5` advertised, 0 of 4 failed.
- `scripts/check-local-stack-keepalive.mjs --mutate` (preflight, and CI's verify job): three requests 6 s apart through the proxy, each advertising no longer a keep-alive than the proxy keeps; and a copy of the proxy that forwards the upstream headers, which it must catch ("advertised a 72 s keep-alive, and this proxy keeps 5 s").
- Every browser suite goes through this proxy. The sweep on lane 7 with it (`three-suites-fail-under-a-full-sweep`) passed 19/19, the three suites that had died with `fetch failed` among them (23/23, 51/51, 24/24).

### `found-28-sep/dashboard-edit-offered-on-others-presets` — **closed** (dead control, small; found by the dashboard research)

**The widget builder offers Edit and Save layout on a dashboard the viewer does not own**

*Evidence:* `dashboard-widget-builder.tsx:228`, `:178-181` offer it on any active preset, including the workspace default shown to a member. `PUT /dashboards/:id` is the owner's (`dashboards.service.ts:130-135`), so the save answers 404.

*To close:* Measure; offer editing to the owner, and say so otherwise.

*Closed, 28 September.* Measured on lane 7 before the change: on the admin's workspace default (what a member sees before they have a dashboard of their own, in the dashboard's Custom mode), a plain member was offered Edit dashboard, and Save layout answered `PUT 404` "Preset not found", losing the arrangement. ClickUp (from search snippets): a dashboard is changed by those with edit access to it; anybody else duplicates it.

Now the builder knows whose dashboard it shows (`isOwner`, which the list already carried): the owner is offered Edit dashboard and saves to it; anybody else is offered Make my own copy, with a hint that the changes are saved as a dashboard of their own, and Save makes one (`POST /dashboards`, their default). Four locales.

`dashboard-own-copy`, 3 checks:
- Before: 1 of 3 on lane 7 (the owner's Edit, which stays).
- After: 3/3 on lane 7. The suite reads the button once the staged dashboard's name is drawn: before the dashboards load, the builder has none and offers Edit.
- Patches `ddo-1..2`: each reddened the check it names (lane 4, at `ebe20cf`, baseline 3/3).
- In CI (225).

### `found-28-sep/unit-claims-leave-a-patch-on-a-kill` — **closed** (test tooling, small; found stopping a preflight)

**A preflight stopped during "the unit claims redden too" left a break patch applied to the product, with a fresh time on the file**

*Evidence, 28 September:* the preflight was stopped during `check-unit-claims.mjs`. `apps/api/src/modules/tasks/tasks.service.ts` was left with a unit patch applied: the dependency read had lost its workspace condition. The patch also gave the file a new mtime, so every lane then refused its API build as stale (`verify.sh` exit 7). `video-regression` was refused that way in a sweep. The restore was a `finally`, which a signal skips. The file was restored by hand, with its old time.

*Fixed, 28 September:* `check-unit-claims.mjs` holds the files it is patching in `pending` and restores them, bytes and times, on SIGINT, SIGTERM and SIGHUP before exiting. A synchronous child (the unit run) finishes first, and then the restore runs.

*To close:* stop a run mid-patch and read the tree. It must be unchanged in content and in time. Not measured yet: the check patches the shared tree, and agents were editing it.

*Closed, 28 September, measured.* A run was started, and SIGTERM was sent while a patch was applied (`ai-containers.ts` modified). The run finished its 37 claims and exited 0. The tree was identical to before in the contents and times of every tracked file under `apps/` and `packages/`.

This works differently from what the fix first said. With a handler registered, node delivers the signal on its event loop, and the claims loop is synchronous. So the signal waits for the loop, and every file is restored by its own `finally`. Stopping this step now takes as long as the step; it no longer leaves a patch behind. The comment says so. SIGKILL still cannot be caught.

The full run on the clean tree: 37 of 37 unit claims redden, the five new ones included (`cla-12`, `cla-13`, `fcr-4`, `uga-13`, `uga-14`).

### `found-25-sep/task-sheet-offers-refused-edits` — **closed** (visible bug, medium; found closing `task-edits-narrower-than-clickup`)

**The task sheet offers every change to anybody who can open the task, and a comment-only or view-only reader is refused each one**

*Evidence, read not run:* `task-detail-sheet.tsx` gates no control on what the person may do: no capability read, no read-only state. Title, status, assignees, fields, dates, archive and delete are drawn for a reader whose space is view-only or comment-only, and each is refused by the API (403) after it is pressed. The project page had the same defect, closed by asking the API (`GET /projects/:id/capabilities`, `found-24-sep/project-page-offers-guests-its-managers-buttons`).

*To close:* the sheet asks what this person may do to this task (the write rule's own answer: edit, comment-level changes as an assignee, or nothing), and draws only those controls, read-only otherwise.

*Measured, lane 5, on `72c5bb7`:* the new suite below, 1 of 5. A member reading an admin's task in a view-only space was offered the title (it opened for editing), the status and the dates, Archive and Delete in the menu, and a comment box, and each change was refused (403) after they made it. The same held in a comment-only space, and on a task assigned to them there. `GET /tasks/:id/capabilities` did not exist (404). Only the space they may edit passed.

ClickUp (help centre, search snippets): "View" is read-only; "Comment" adds comments, and on a task assigned to the person a change of its status; "Edit" changes every task in the location.

*Closed, 25 September:*

- **`GET /tasks/:id/capabilities`** answers what the routes would: `edit` (the write rule at "edit"), `progress` (its status and assignees: the write rule at "comment", which an assignee passes in a comment-only space) and `comment` (the comment rule, now one private method for the route and this answer). A refusal is `false`; anything else is thrown.
- **The sheet asks it with the task**, and shows its loading state until both have answered, so no control is drawn and then switched off. A read that fails, or an answer that is not one (a stubbed API's catch-all), offers what the sheet always did, and the routes still refuse.
- **What it draws by the answer:** the title opens for editing only with `edit`; the status select and its next and complete buttons, the assignee chips and picker with `edit` or `progress`; priority, the dates and their presets, repeat, estimate, the description, Add fields, the type picker, the cover, duplicate, archive, visibility and milestone with `edit`. The menu's Convert, Merge, Custom fields, Archive and Delete are there only with `edit`. The Fields and Checklists tabs sit in a disabled fieldset without `edit`. The subtask rows' controls and their add form, the dependencies' Remove and add form, and the attachments' upload, link and Remove need `edit`. The comment box needs `comment`; without it the tab says the reader may read the comments and not add one (four locales).
- The capabilities are read again when the task's assignees change, since `progress` depends on being one.

The new suite `task-sheet-capabilities`, 5 checks: a member on four of the admin's tasks, in a view-only space, a comment-only space (one assigned to them, whose status they move, read back by SQL), and a space they may edit (a new title, read back); and the API's four answers.

- Before: 1 of 5 (the edit space).
- After: 5/5.

`tsc-1..10`, each compiled: the API answering edit to all, progress and comment from the edit rule; the sheet ignoring the answer, the title, status, dates, Archive and the comment box offered to everybody, and the status asked of edit alone. `task-delete-1`, `tfc-6` and `ths-6` re-aimed at the lines that read the answer. *Break run, lane 1 (`b986949`):* `tsc-1..10`, 10 of 10 reddened on a green baseline (5/5), and the three re-aims 3 of 3 (15/15, 18/18, 15/15 without them). Regression on lanes 2 to 5, the 37 suites that open the task sheet with `task-edit-levels`, `ui-sweep`, `video-regression`, `video1-acceptance` and `no-dead-ends`, 41/41. The first sweep drew the controls disabled until the answer came, and three suites failed under the load (`custom-field-progress`, `task-menu`, `task-depth`) and passed on their own. A hand quick enough to act in that gap is the defect's cousin, so the sheet now waits for both answers, and the second sweep was 41/41. In CI (180).

*Not changed, recorded:* the Time tab, the AI bar's actions, a task's linked work, adding somebody else as a watcher, and Share, Save as template and reminders keep their own rules and are drawn as before. A subtask's row is drawn by its parent's answer; the subtask's own answer (its own assignee, say) is not asked per row.

### `found-25-sep/guests-edit-no-shared-task` — **closed** (behaviour, small; found closing `task-edits-narrower-than-clickup`)

**A guest cannot change a task shared with them to edit**

*Measured, lane 5, on `4f51162`:* the new suite below, 0 of 5. A guest with a task shared at Edit, and with a list shared at Edit, renamed neither: 403, "Guests cannot edit tasks". An assignee with a task shared at Comment could not move its status. The sheet drew them nothing to change. The task shared with nobody answered 403 with the same sentence, which told the guest it exists.

The write rule refused every guest before any share was read. The create gate and the comment gate read the same shares (`guest-space-level`).

ClickUp (help centre, "Use ClickUp as a guest", "Guest-type user roles", search snippets): a guest holds the level of what is shared with them.
- Edit updates a task's details and changes its status and assignees.
- Comment comments, and completes a task assigned to them.
- View changes nothing.
- Deleting takes Full edit (`full-edit-enforced-nowhere`).

*Closed, 25 September:*
- The flat refusal is gone from `assertTaskWritable`. A guest's change runs the same rule as a member's.
- The read rule comes first: a guest reads only what is shared with them, and anything else is not found.
- Then the level their shares give, read by `resolveSpaceLevel`'s guest branch: the task, its list, its project, its folder. The refusal names the share ("What is shared with you here is "View only"…").
- The sheet draws a guest what the answer allows, since `/capabilities` asks the same rule.

The new suite `guest-task-edits`, 5 checks: a guest with tasks shared at View, at Comment, at Comment and assigned, at Edit, a list shared at Edit, and one task shared with nobody. What they change is read back by SQL.
- Before: 0 of 5.
- After: 5/5.

`gte-1`, `-2`, `-4` and `-5`, each compiled: the flat refusal back, guests skipping the read rule, guests changing at any share, and a guest never counted as the assignee they are.

*Break run, lane 1 (`a0a0d70`):* `gte-1`, `-2`, `-4` and `-5`, 4 of 4 reddened, on a green baseline (5/5).

Regression on lanes 2 to 5, 20/20:
- the six guest suites (`guest-task-edits`, `guest-space-level`, `guest-read-scope`, `guest-create-menu`, `guest-chat-scope`, `guest-canvas-scope`);
- the suites that write tasks by a level (`task-edit-levels`, `task-space-levels`, `task-boundaries`, `task-sheet-capabilities`, `task-rows-by-id`, `field-writes-by-level`, `full-edit-levels`, `project-member-levels`);
- `credential-reads`, `hook-portal-access`, `doc-write-levels`, `task-menu`, `task-delete` and `task-depth`.

The external-links unit test that expected a guest to be refused for being one now expects the read rule's not-found. API unit tests 1649/1649. In CI (184).

*Not changed:* a guest still makes no task (`Guests cannot create tasks`), whatever they hold (`found-25-sep/guests-with-full-edit-make-no-tasks`).

### `found-25-sep/guests-with-full-edit-make-no-tasks` — **closed** (behaviour, small; found closing `guests-edit-no-shared-task`)

**A guest with Full edit on a list cannot add a task to it**

*Evidence, read not run:* `createTask` refuses every guest ("Guests cannot create tasks") before the create gate reads their shares. So does the Create menu, which offers a guest no task (`guest-create-menu`, `found-24-sep/create-menu-offers-guests-tasks`). ClickUp ("Permissions in detail"): Full edit creates tasks and subtasks, and a guest may hold Full edit on what is shared with them.

*To close:*
- Research whether ClickUp lets a guest make tasks with Full edit on every plan.
- If it does: a guest's new task asks the create gate with their shares, as a list does, and the Create menu offers a task where `/writable` says yes.
- Measure a guest at Edit and at Full edit on a list.

ClickUp (help centre, "Permissions in detail"; the feature request "Option for guests to have access to create tasks in a list but not be able to delete the list"; search snippets):
- Full edit creates tasks and subtasks, and a guest may hold it on what is shared with them.
- The request asks for a level that adds without deleting. So a guest at Full edit adds tasks, and Edit adds none.
- No plan limit on it was found.

*Measured, lane 5, on `baa7d3e`:* the new suite below, 0 of 3.
- A guest with a list shared at Full edit was refused a task in it (403), as was one given a whole space at Full edit.
- The list page offered neither of them an add row.

*Closed, 25 September:*
- **The create gate reads a guest's shares**, on the list and the containers above it, as it does a member's grants. It adds where that is Full edit, and a guest at Edit, or with nothing shared, is refused as before. The flat refusal went, with a guest-only check nothing called.
- **The Create menu and a space's "+" offer a guest a task where a space is theirs at Full edit**, as they do a list. The list page offers the add rows by the list's own answer, which reads a share on the list itself.
- `guest-create-menu` said "and still no task" for a guest at Full edit on a space, and that the API refused them one. Both checks now say they are offered and make one, and a task where they pass through is refused. The comments in `task-creation-access` and `meeting-access` say what refuses their guest now: the level (Edit), not a guest rule.

The new suite `guest-task-making`, 3 checks, read back by SQL:
- a guest adds a task to lists shared at Full edit, at Edit, and not at all;
- a guest adds one in a space given whole at Full edit;
- the list page offers them the add rows.

Results:
- Before (lane 5, `baa7d3e`): 0 of 3.
- After: 3/3, on lanes 5 and 4.

`gtm-1..3`, each compiled: every guest refused first, as before; a guest's share counting as Full edit whatever its level; the list's answer refusing guests. Re-aimed, each compiled:
- `gcm-2` offers the task to every guest.
- `tcm-6` and `mtg-3` count a guest's share as Full edit. Their guests hold Edit, and the guest line they removed is gone.

*Break run* (lane 1, `plan-gtm`):
- `guest-task-making`, on `2425c08`: 3 of 3 reddened.
- `task-creation-access`, on `67a4f60`: `tcm-2..6` reddened, the re-aimed `tcm-6` among them.
- `tcm-1` did not build. It restored the guest-only check this change removed as dead. Re-aimed so that `createTask` asks nothing, it compiles, and it is queued again.
- `guest-create-menu`, run again on `a3361d7`: `gcm-1..11` all reddened. The run caught `gcm-11` claiming check 6 as it read before this change. A five-word fragment of the old sentence still matched, so both gates counted it verified, but the check that actually failed was the restated one. The claim was re-aimed (`claims-confirmed-by-a-fragment`).
- `meeting-access`, on `a3361d7`: `mtg-1`, `mtg-3` and `mtg-4` reddened.
- The re-aimed `tcm-1`, on `14c789f`: reddened.

Regression on lanes 2 to 5: the 18 suites that have guests make or be refused things, or make tasks through the gate, and the new suite. Result: 19/19. Under the sweep's load, `video1-acceptance` did not get its bookmark back after a reload, as recorded before, and passed alone (18/18). In CI (193).

### `found-25-sep/task-rows-changed-by-id-anywhere` — **closed** (security, HIGH; found by reading every write that hangs off a task, route by route, after closing `task-sheet-offers-refused-edits`)

**A task's routes changed rows of other tasks by their ids, another organisation's included, and several asked only membership or nothing**

*Measured, lane 5, on `b986949` (probe `measure-task-subwrites`):*
- **Checklists across organisations.** Somebody from another organisation named a task of their own in the URL. With it they renamed an admin's checklist (200) and added an item to it (201). They edited and ticked an item (200). They moved an item into a checklist of their own (200), because the item's update wrote the raw body, `checklistId` included. They deleted an item (200) and a checklist (200). The checklist routes' guard asked about the task in the URL, and the service never matched the checklist or item to that task.
- **Reactions and old descriptions.** The same person reacted to the admin's comment through their own task (201), and its author was notified. They also read the admin's task's old descriptions (200): `GET /tasks/:id/description-history` had no guard at all.
- **A private space.** A member refused a private space still reached a task in it:
  - read its old descriptions (200);
  - saved its checklist as a workspace template, with the items' words in it (201);
  - added a checklist to it from a template (201);
  - cleared its type (200);
  - made a reminder on it, with its title in the answer (201);
  - pushed it to the workspace's calendars (201).

  Each of these asked only for membership of the workspace.
- **A view-only space.** A member in a view-only space made a checklist on a task there (201), ticked an item (200) and changed the task's type (200). Renaming the task was refused (403).

ClickUp (help centre, search snippets): "View" can't comment or edit. A like is a comment-level act. A task's checklists are part of the task, so changing them is editing it.

*Closed, 25 September:*
- **Checklists** are found through the task in the URL. A checklist or item on another task is not found (404). Every change asks the task's write rule: making, renaming, reordering or deleting a checklist, and adding, editing, ticking or deleting an item. The item's update writes only an item's own fields: words, done, position, due date and assignee.
- **A reaction** must be to a comment on the task in the URL (404 otherwise), and it asks the comment rule.
- **A task's old descriptions** are read as the task is (`ResourceMemberGuard`).
- **Templates.** A template can be made only from a checklist its maker may read (404 otherwise). A template's checklist can be added only where the task's write rule allows.
- **A task's type** asks the write rule. The module's other services reach that rule through `TasksService.assertMayEditTask`.
- **A reminder on a task and a calendar push** ask that the task may be read. Otherwise they answer 404, and no title is told.

The new suite `task-rows-by-id`, 6 checks. Every refusal is read back by SQL beside the same act allowed: the admin on their own task, and a member in an open space.
- Before: 0 of 6.
- After: 6/6.

`trb-1..13`, each compiled. Each undoes one rule:
- checklists or items found by id alone;
- the item's update taking the whole body;
- checklists or items changed without the write rule;
- a reaction to any comment, or one asking no level;
- old descriptions unguarded;
- a template made from an unread checklist;
- a template applied, or a type set, without the write rule;
- a reminder or a push on an unread task.

*Break run, lane 1 (`2e8d168`):* 13 of 13 reddened, on a green baseline (6/6). `trb-10` broke both of the checks it claims.

Regression on lanes 2 to 5: the 20 suites that reach these routes, and ten more that open tasks as members, readers and guests (`video-regression`, `video1-acceptance`, `ui-sweep`, `no-dead-ends`, `task-sheet-capabilities`, `task-edit-levels`, `task-boundaries`, `task-space-levels`, `guest-read-scope`, `guest-space-level`), plus `credential-reads`. Result: 30/30. Under the sweep's load, 28 of 30 passed the first time. `task-depth` (a tag's removal) and `video1-acceptance` (a bookmark, and the assistant's follow-up) failed on things this change does not touch, and each passed on its own right after (91/91, 18/18). Both are recorded under `three-suites-fail-under-a-full-sweep`. The API unit tests for the template and type services now run with the write rule given. In CI (181).

*Found beside it* (the same reading, then measured or read):
- A reader who may not change a task sets its custom fields and defines new ones (`found-25-sep/field-values-written-by-readers`).
- The time routes mean to refuse guests and refuse none: the guard reads the account's role. ClickUp would let both a view-only reader and a guest track time by default (`found-25-sep/guest-guard-reads-the-account-role`).
- A comment sent by mail skips the comment rule (`found-25-sep/inbound-email-comments-skip-the-comment-rule`).
- A task one may only read can be blocked, or made a parent, from one they may edit (`found-25-sep/read-only-tasks-blocked-and-parented`).
- An assignee in a comment-only space cannot tick their own checklist item, which ClickUp allows (`found-25-sep/assigned-checklist-items-need-edit`).
- A calendar pull overwrites linked tasks for any member (`found-25-sep/calendar-pull-for-any-member`).

### `found-25-sep/field-values-written-by-readers` — **closed** (security, small; found closing `task-rows-changed-by-id-anywhere`)

**A reader who may not change a task sets its custom fields, and defines new ones**

*Evidence, measured on lane 5 (`b986949`):*
- A member in a view-only space set a task's custom field value (200, read back).
- The same member defined a new field from the task (201).
- A guest with only a view share on a task defined a field from it (201).

`setValue` and `createDefinitionForTask` asked only the read rule (`readableTask`). So did the project routes that define, rename and delete fields, and deleting a field takes every task's value in it.

ClickUp (help centre, "Custom Field permissions", "Use Voting Custom Fields", search snippets):
- A custom field's value is part of the task, changed with "Edit".
- Guests with edit change values and create no fields.
- Anybody who can see a task may vote on it.

*Closed, 25 September:*
- **The task write rule is written once**, in `common/permissions/task-write.ts` (`assertTaskWritable`, and `assertTaskNotInBin`). `TasksService`'s method delegates to it. `CustomFieldsService` could not ask the service's copy, because `TasksService` injects it.
- **A value** asks the write rule. A Voting field keeps the read rule, since the vote is the voter's own.
- **Defining, renaming and deleting a field** ask `edit` on the project (and on its list, for a list's field) through `assertSpaceLevel` with the project's chain, so a grant on the project counts. A guest is refused with "Guests cannot define custom fields".

The new suite `field-writes-by-level`, 5 checks, every value and definition read back by SQL:
- A member in a view-only space beside an open one: values, defining from a task and on the project, renaming and deleting.
- A vote in the view-only space.
- A guest with a project shared to edit and a task shared to view.

Results:
- Before: 1 of 5. Only the vote passed, as it should either way.
- After: 5/5.

`fwl-1..6`, each compiled:
- values asking the read rule;
- votes asking the write rule;
- defining, renaming or deleting asking nothing;
- guests defining fields.

Re-aimed at the moved rule, each compiled: `td-bin-1`, `tel-1..4`, `tsl-2` and `pml-3`. Two custom-field patches changed too:
- `cfa-4`'s anchor now holds the define rule.
- `cfa-2` claims the values read, since setting one is now also refused by the write rule's own read check.

*Break run, lane 1 (`d8471cf`):* `fwl-1..6`, 6 of 6 reddened on a green baseline (5/5). The re-aims all reddened too, 9 of 9: `tel-1..4`, `tsl-2`, `pml-3`, `td-bin-1` (3 of `task-depth`'s 91), and `cfa-2` on the values read and `cfa-4`.

Regression on lanes 2 to 5: the 15 suites that touch custom fields, and 15 that write tasks through the moved rule (`task-edit-levels`, `task-space-levels`, `task-boundaries`, `project-member-levels`, `task-depth` with its bin checks, `task-menu`, `task-merge`, `task-delete`, `task-header-status`, `task-sheet-capabilities`, `task-rows-by-id`, `guest-space-level`, `video1-acceptance`, `video-regression`, `ui-sweep`). Result: 30/30. Under the sweep's load 29 of 30 passed the first time: `video1-acceptance` failed the same check as in the last sweep (the assistant's way forward), then passed on its own right after (18/18). It is recorded under `three-suites-fail-under-a-full-sweep`. API unit tests 202/202 for the task and custom-field modules. In CI (182).

### `found-25-sep/guest-guard-reads-the-account-role` — **closed** (facade, small; found closing `task-rows-changed-by-id-anywhere`)

**The time routes mean to refuse guests and refuse none, and ClickUp would not refuse them**

*Evidence, measured on lane 5 (`b986949`):* a guest with only a view share on a task started a timer on it (201). A member in a view-only space logged time on a task there (201).

The time routes carry `NotGuestGuard`, which says "Guests cannot use this feature". It reads the ACCOUNT's role (`common/guards/not-guest.guard.ts`), and a person invited to a workspace as a guest keeps the account role `member`, so it refuses nobody who is a guest of a workspace. `NamedWorkspaceMemberGuard` says as much about it. The AI knowledge routes (`knowledge.controller.ts`) rely on it alone.

ClickUp (help centre, "Manage individual permissions for view only users", search snippets): view-only users and guests have four individual permissions, one of them time tracking. It is on by default, and an owner or admin can turn it off per person. So the view-only member's timer is ClickUp's default, and so is the guest's. The guard's intent is narrower than ClickUp, and it enforces nothing.

*To close:*
- Take the guard off the time routes, as ClickUp's default. The per-person permission is its own unbuilt item.
- Measure what a workspace guest reaches through the knowledge routes, and give them the workspace's role there.
- Make the guard read the role in the workspace, or retire it.

*Measured, lane 5, on `67a4f60`* (the suite below, 3 of 4):
- A workspace's guest with a view share tracked time on the task: started, stopped and logged it by hand (201 each). A member of a view-only space did the same. The guard let both through, which is ClickUp's default.
- The only accounts the guard refused were ones whose own role is `guest`. The enum allows that value, but no product path sets it (no insert or update writes it, nor does a migration or the seed), and none of the 406 accounts on lane 5 has it. One such account, made by SQL and a member of the workspace, was refused a timer and the knowledge base (403, "Guests cannot use this feature"), whatever the workspace made it.
- A workspace's guest was refused both the knowledge answer and the reindex (403 each), by other checks, not this one. The answer is refused by `NamedWorkspaceMemberGuard`, which reads the role in the workspace; the route requires a `workspaceId`. The reindex is refused by the handler's own manager check, which also reads the workspace role.

*Closed, 25 September:*
- **The guard is retired.** It is off the time routes, the AI controller and the knowledge controller, and the file is gone. Nothing in the API or the web reads the account's role as guest now.
- **Time is tracked by whoever may read the task**, through the class's read rule (`ResourceMemberGuard`), which admits a guest only where the task is shared with them. The sheet's Time tab was never gated, so it now agrees with the API by rule rather than by accident.
- **The AI routes refuse a workspace's guests by their role there**, as before.
- **The unit test is restated.** `time-entries.guard.test.ts` asserted that the guard was wired on, so it passed while the guard refused nobody. It now asserts the read rule on every route of a task's time, and nothing beside it.
- **Comments corrected** where they named the guard: the named-workspace guard's comment, and the spec's citation in `clickup-platform-overview-spec.md`.
- **Not built:** ClickUp's per-person switch for a view-only member's or guest's time tracking. It is its own item, `found-25-sep/view-only-individual-permissions`.

The new suite `time-tracking-readers`, 4 checks, with time entries and the knowledge index read back by SQL:
- A guest tracks time on a task shared with them at View, and not on one that is not (403, none made). A view-only member tracks time too.
- An account marked guest on its own, and a member of the workspace, tracks time and asks the knowledge base.
- A workspace's guest neither asks nor reindexes, and a member does not reindex (nothing indexed); its admin reindexes.
- The sheet offers the guest Start timer, and the timer runs.

Results:
- Before (lane 5, `67a4f60`): 3 of 4.
- After: 4/4, on lanes 5 and 4.

Patches `ttr-1..8`, each compiled:
- time asks the edit rule;
- the account's role refuses a timer, as the guard did;
- the time routes ask no read rule;
- the knowledge base refuses by the account's role;
- the named-workspace guard lets guests in;
- reindexing asks no role;
- the sheet offers Start timer to editors only;
- `ttr-8`, which claims the unit test: the controller guarded by the sign-in alone.

`wra-8` was re-aimed onto the AI controller's guard line without the retired guard.

*Break run* (lane 1, on `14c789f`): `ttr-1..7` all reddened the check they claim, and `ttr-8` reddens its unit test. The re-aimed `wra-8` reddened `workspace-read-access`.

Regression on lanes 2 to 5: the 25 suites that use the AI routes, the knowledge base or time entries, and the new suite. Result: 26/26.
- Under the sweep's load, two suites failed. `ai-activity-filters` found no row under its Failed filter, and `a61-meeting-record` lost a save and a recording.
- Each passed alone: 34/34 on lane 2, 25/25 on lane 3.

In CI (195).

### `found-25-sep/ai-task-paths-skip-the-read-rule` — **closed** (security, HIGH once measured; found closing `guest-guard-reads-the-account-role`)

**The AI routes that take a task by id ask only that the caller belongs to its workspace**

*Evidence:* `assertTaskWorkspaceAccess` (`ai.service.ts`) asks only `memberRole`. So a guest of the workspace passes it, and so does a member refused the task's private list.
- `summarize` and `task/deadline` read the task through it. When the request names no workspace, `NamedWorkspaceMemberGuard` lets it through. The guard's comment says a request that names no workspace "reads nothing of one"; this one reads a task.
- `assignee-suggestion` refuses guests but asks nothing else.

Measured on lane 2, which has no model (probe `probe-ai-task-paths`): a member got an assignee suggestion for a task in a private list they are refused. The route answered 200, `ok: true`, with a pick; reading the task itself was 403. The guest was refused (`no_permission`). `summarize` and `task/deadline` answered 503 there, for want of a model, so the prompts they build are still to be measured on a lane with the model stub.

*To close:*
- Measure `summarize` and `task/deadline` with the model, by what the stub is sent.
- Make every AI path that takes a task ask the task's read rule, as the task routes do.
- Correct the guard's sentence.

*Measured, on `e7e8748`* (the suite below, 0 of 4 on lane 2 with the model stub, and 0 of 4 on lane 5 without a model):
- **Summaries.** A guest of the workspace with nothing shared, refused the task itself (403), had it summarised (201). The prompt the model was sent carried its title and description. The summary's input also carries the task's activity, open subtasks, blockers and comments. A member refused the task's private list got the same, and so did the streamed summary.
- **Deadlines.** A deadline was suggested for both (201). For a member, the workload it weighs counted all three of a colleague's open tasks, two of them in a list the member is refused.
- **Assignees.** The member was suggested an assignee for the task in the private list (200, `ok: true`, with a pick).
- **With no model configured,** every one of these answered 503 "not configured", so the refusal was never asked.

That made it high severity, not a gap in a rule: with a model configured, anybody in a workspace could read any task in it through its summary, by id.

ClickUp (help centre, "What is ClickUp Brain?", search snippets): Brain only surfaces information the person already has permission to see.

*Closed, 25 September:*
- **A task by id is read only as its reader may open it.** `assertTaskReadable` asks the task routes' own rule (`readableTask`): the container, a guest's reach, a private list or task. It replaces `assertTaskWorkspaceAccess`, which asked only for the workspace. A task id that is not a uuid is no task.
- **The routes ask it first.** Summarising, streaming a summary and suggesting a deadline ask it before the model's availability, so a refusal reads the same with a model or without.
- **The deadline's workload** counts each assignee's open tasks among those the asker may open, as the workload panel counts them.
- **The assignee suggestion** asks the same rule, and answers `no_permission` with no pick.
- **The named-workspace guard's comment** said that a request naming no workspace "reads nothing of one". It now says what such a route asks instead.

The new suite `ai-task-reads`, 4 checks. Where a model answers, the prompts the stub is sent are read back; where none does, each refusal must come before the 503.
- A summary is refused to the guest and to the member refused the private list, with nothing of the task sent to a model; a member who reads the task gets one.
- A streamed summary, the same.
- A deadline is refused the same way, and the workload it weighs counts, for the member, one of the colleague's three tasks, where the admin's counts all three.
- An assignee suggestion is refused on the private list's task, and given on the open one.

Results:
- Before (`e7e8748`): 0 of 4 on lane 2 with the model, and 0 of 4 on lane 5 without one.
- After: 4/4 on both.

Patches `atr-1..6`, each compiled:
- the task asks the workspace alone;
- the summary asks the model first;
- the streamed summary asks nothing;
- the deadline asks nothing;
- the workload counts every task (it can redden only where a model answers, and says so);
- the assignee suggestion asks the role alone.

*Break run* (lane 1, on `14c789f`): `atr-1..6` all reddened the check they claim. `atr-1..4` and `atr-6` ran without a model. `atr-5` ran with one, its set's model switched on by the runner because the patch declares it needs one.

Regression on lanes 2 to 5: the 24 suites that use the AI routes, and the new suite. Result: 25/25.
- Under the sweep's load, `ai-activity-filters` and `a61-meeting-record` failed as in the sweep before, with the same failures.
- Each passed alone: 34/34 on lane 4, 25/25 on lane 2.

In CI (196).

### `found-25-sep/view-only-individual-permissions` — open, feature, medium (found closing `guest-guard-reads-the-account-role`)

**ClickUp's four individual permissions for view-only members and guests are not built**

ClickUp (help centre, "Manage individual permissions for view only users", search snippets): view-only members and guests have four individual permissions.
- On by default: time estimates and time tracking.
- Off by default: adding or removing tags, and creating views.
- An owner or admin turns each on or off per person, on the Unlimited plan and above.

Here:
- Time tracking follows reading, with no switch.
- A time estimate asks the task's write rule, so a view-only member cannot set one where ClickUp's default lets them.
- Tags ask the write rule, which matches ClickUp's default.
- Making views is not measured.

*To close:*
- Measure time estimates and views for a view-only member and a guest.
- Build the four switches per person, with ClickUp's defaults, on the member's row of the workspace's people settings.

### `found-25-sep/inbound-email-comments-skip-the-comment-rule` — **closed** (security, HIGH once measured; found closing `task-rows-changed-by-id-anywhere`)

**A comment sent by mail to a task's address skipped the comment rule, and the address itself**

*Measured, lane 5, on `5916541`* (probe `measure-inbound-comments`, then the suite below, 1 of 5):
- **The address.** `POST /inbound/email` to `list-<anything>+task-<id>@…` commented on any task whose id somebody had. The task's list's alias, the secret half of the address, was never compared (201).
- **The author.** A stranger's mail was put down as a member's comment. The author fell back to "the workspace's owner", which was whichever member the lookup found: once the view-only member, once the guest.
- **The level.** A view-only member, and a guest with nothing shared, each commented by mail where the app refuses them (403).
- **Replies.** A reply to a notification (by `In-Reply-To`) did the same.

That made it a high-severity hole, not the small one it was recorded as: anybody who could send mail and had seen a task's id could post on it in a member's name.

*Closed, 25 September:*
- **A task's address is its list's.** The `+task-<id>` path takes the task only when the address's alias is its list's live alias. A task id that is not a uuid is no task, where it had been a database error.
- **A comment by mail is its sender's.** It is written only when the From address is an account that may comment on the task.
- **That permission is asked by `taskCommentAllowed`** (`common/permissions/task-write.ts`): not in the bin, the read rule, and "comment" along the task's chain, the three things the app's route asks.
- **Anybody else's mail is refused.** It is recorded as `rejected_not_allowed`, and no comment is written in somebody else's name. Replies go the same way.

The new suite `mail-comments-by-level`, 5 checks, each read back by SQL, both the comment and the recorded outcome:
- the admin and a member to the task's own address;
- the task's id under another list's alias and under a made-up one;
- a stranger with an account elsewhere, and an address with none;
- a view-only member, a guest with nothing shared, and a guest with the task shared to comment;
- replies to a notification from the view-only member and the admin.

Results:
- Before: 1 of 5. Only the first passed, as it should either way.
- After: 5/5.

`mcl-1..4`, each compiled: the alias not compared, any account commenting, the old fallback author, and the mail path's rule asking no level.

*Break run, lane 1 (`a0a0d70`):* `mcl-1..4`, 4 of 4 reddened, on a green baseline (5/5).

Regression on lanes 2 to 5: the 14 suites that send mail or comment on tasks (`mail-comments-by-level`, `email-reply-routing`, `credential-reads`, `hook-portal-access`, `task-boundaries`, `task-depth`, `task-menu`, `guest-space-level`, `guest-task-edits`, `task-rows-by-id`, `task-sheet-capabilities`, `task-edit-levels`, `notification-gaps`, `activity-rail`). Result: 14/14. `task-menu` missed its top four rows twice: in the sweep, and once alone while lane 1's break runs held the machine (load 5). It passed alone on lane 4 (37/37), and is recorded under `three-suites-fail-under-a-full-sweep`. In CI (185).

*Not changed:* a new task by mail to a list's alias still comes from anybody who has the address, put down as its sender if they are a member and as the alias's maker otherwise. The alias is the list's secret, as a form's link is, and that is the feature. The service's comment rule and `taskCommentAllowed` state the same chain; the first was left as it is because two break patches read it.

### `found-25-sep/read-only-tasks-blocked-and-parented` — **closed** (integrity, small; found closing `task-rows-changed-by-id-anywhere`)

**A task one may only read can be blocked, or given a subtask, from a task one may edit**

*Evidence, read not run:*
- A `blocks` dependency from a task you may edit onto one you may only read asks only the read rule of the second. That task then cannot be closed.
- A subtask can be hung under a parent you may only read.

*To close:* research ClickUp's rule for dependencies and subtasks across levels. Then a change that alters another task asks that task's rule.

*Measured, lane 3, on `e09125a`:*
- A member marked their own task as blocking the admin's task in a view-only space (201). The admin then could not close their own task (400, "blocked by open dependencies"): a reader could stop a task being completed.
- The same member moved their task under the admin's read-only task as a subtask (200).
- They made a new subtask under it (201).

ClickUp (help centre, "Intro to Dependency Relationships", "Permissions in detail", search snippets):
- Creating a dependency takes edit permission, guests' included.
- Full edit creates tasks and subtasks, and the sheet here already asks it before offering "Add subtask" (`caps.full`).

*Closed, 25 September:*
- **A task that another blocks asks its own write rule.** A task cannot be closed while its blocker is open, so blocking it is a change to it. A task may still wait on one its owner only reads (`blocked_by`), and be related to it (`related_to`): neither binds anybody else's task.
- **A subtask's parent asks Full edit where it lives**, both for a new subtask and for a task moved under it. The service said it asked the read rule alone because a subtask edits none of the parent's own fields. But a subtask counts toward its parent and closes with it, and the sheet asked Full edit before offering one; that reason went with the rule.

The new suite `other-task-rules`, 2 checks, read back by SQL:
- blocking the admin's read-only task, and waiting on it;
- subtasks under a read-only parent, under one at Edit, and under one at Full edit.

Results:
- Before (lane 5, `e09125a`): 0 of 2.
- After: 2/2, on lanes 5 and 4.

`otr-1..4`, each compiled: blocking asking nothing of the other task; waiting asking it too; a parent asked for reading, as before; a parent asked Edit.

*Break run* (lane 1, run again after the edit that broke the first run, `lane-scripts-read-as-they-run`): `otr-1..4` all reddened the check they claim.

Regression on lanes 2 to 5: the 20 suites that add dependencies or subtasks, read them, or build on subtasks, and the new suite. Result: 21/21.
- Under the sweep's load, `task-menu` found its menu's rows late, and `task-depth` a tag's removal, both as recorded before.
- `task-depth` passed alone (91/91). `task-menu` passed on lane 3 (37/37); alone on lane 2, while lane 1's break runs held the machine, Send email to task was once more late.

In CI (194).

### `found-25-sep/assigned-checklist-items-need-edit` — **closed** (behaviour, small; found closing `task-rows-changed-by-id-anywhere`)

**An assignee in a comment-only space cannot tick their own checklist item**

ClickUp (search snippets): "Comment" lets a person "complete or mark complete assigned checklist items". Since `task-rows-changed-by-id-anywhere`, every checklist change here asks the write rule at "edit", so the person cannot tick the item, and the sheet's Checklists tab is disabled for them.

*To close:*
- Ticking an item assigned to the person asks the write rule at "comment", with the item's assignee counted as the task's would be.
- The sheet offers that tick.

*Measured, lane 5, on `4135abd`:* a member in a comment-only space was refused ticking the item assigned to them (403, "does not allow changing its tasks"). The sheet's Checklists tab was one disabled fieldset for them.

*Closed, 25 September:*
- **A tick of one's own item asks the comment rule** (`taskCommentAllowed`): the bin, the read rule, and "comment" along the task's chain. The tick must be alone in the change, on an item assigned to the person. Anything else asks Edit, as before: another's item, or the words, assignee or date of one's own.
- **The sheet offers that tick.** The Checklists tab is disabled only for a reader without "comment". Inside it, every editing control sits in a fieldset of its own for editors (`EditorsOnly`, with no box of its own, so each row keeps its layout). An item's checkbox is free for an editor, and for a commenter on their own item.

The new suite `checklist-assignee-ticks`, 3 checks: a member in a comment-only space with two of the admin's items assigned to them and one to the admin, and in a view-only space with one. Read back by SQL.
- Before (lane 5, `4135abd`): 1 of 3 (the view-only control).
- After: 3/3, on lanes 5 and 4.

`cat-1..8`, each compiled:
- every tick asking Edit;
- a commenter ticking anybody's item;
- a commenter changing anything on their own;
- no level asked;
- the sheet's tick for editors only, or for every commenter;
- the editing controls free;
- the tab one disabled fieldset again.

`trb-13` re-aimed at the new branch.

*Break run, lane 1 (`baa7d3e`):* `cat-1..8`, 8 of 8 reddened, on a green baseline (3/3). `task-rows-by-id`'s thirteen, `trb-13` re-aimed, 13 of 13 (6/6).

Regression on lanes 2 to 5: the 8 suites that use checklists, with `task-sheet-capabilities`, `task-edit-levels`, `guest-task-edits`, `video1-acceptance` and the new suite. Result: 13/13. In CI (192).

### `found-25-sep/calendar-pull-for-any-member` — **closed** (security, small; found closing `task-rows-changed-by-id-anywhere`)

**A calendar pull overwrites linked tasks for any member**

*Evidence, read not run:* `POST /workspaces/:id/calendar-sync/:provider/pull` asks only for membership. It overwrites the title, description and dates of every task linked to an event in the workspace's calendars (`calendar-sync.service.ts`).

*To close:* measure what a member who may not change those tasks changes through it, and what it answers them. Then decide who may pull.

*Measured, lane 5, on `a3361d7`* (the suite below, 1 of 3):
- A member, and a guest, each pulled the workspace's Google Calendar. Each pull reached Google with the workspace connection's stored token: the API's log shows "Google Calendar LIST 401" for the staged token, from `listGoogleEvents`. With a token that worked, the pull would have made tasks from the admin's calendar in the inbox list, and overwritten every task linked to one of its events, for anybody in the workspace.
- The integrations page's Calendar sync dialog offered the member "Sync now".
- Read, not run: the pull looked each event's link up by the provider's event id alone, in any workspace. So a pull in one workspace could overwrite a task in another that carries a link with the same event id: the same calendar connected in two workspaces, or an id the calendar's owner chose.

ClickUp (help centre, "Google Calendar integration", search snippets): the integration is private, and no one else in the workspace can reach a person's calendar through it. Guests and limited members connect their own. Here, a person's own calendar is the planner's Accounts, and the workspace's connection is made and removed under `integrations.manage`.

*Closed, 25 September:*
- **Pulling the workspace's calendar asks `integrations.manage`**, as connecting and disconnecting it do. A custom role's grant counts.
- **A pull looks each event's link up among its own workspace's links.**
- **The Calendar sync dialog** still shows everybody whose calendar is connected, and offers "Sync now" only to those who may pull.

The new suite `calendar-pull-access`, 3 checks. The connection is staged by SQL and the inbox read back. No lane can reach the provider with a token that works, so a pull let through ends at the provider's failure and a refused one at 403; that difference is what is measured.
- A member, and a guest, are refused before the connection is used, and nothing is made.
- A member granted `integrations.manage`, and the admin, are let through.
- The dialog offers Sync now to the member who manages integrations, and not to the member who does not.

A unit test in `calendar-sync.service.test.ts` stubs the provider and reads back the link lookup's SQL: it asks the pulling workspace.

Results:
- Before (lane 5, `a3361d7`): 1 of 3.
- After: 3/3, on lanes 5 and 4.

Patches `cpa-1..5`, each compiled:
- the pull asks membership alone;
- the pull asks another key;
- the dialog offers Sync now to everyone;
- the dialog asks another key;
- `cpa-5`, which claims the unit test: the link lookup asks no workspace.

*Break run* (lane 1, on `14c789f`): `cpa-1..4` all reddened the check they claim, and `cpa-5` reddens its unit test.

Regression on lanes 2 to 5: the 18 suites that touch calendars, integrations or custom-role grants, and the new suite. Result: 19/19.

In CI (197).

### `found-25-sep/full-edit-enforced-nowhere` — **closed** (security, large; found closing `field-values-written-by-readers`, before letting guests edit)

**"Full edit" is offered everywhere and asked for nowhere, so an Edit grant creates and deletes, and a new space's default says Edit where the frame says Full edit**

*Evidence, measured on lane 5 (`d8471cf`):* a member in a view-only space deleted a task to the Trash (201, read back) through each kind of grant at "edit":
- a task shared with them at Edit;
- a space-member role of Edit;
- a project role of Edit.

Archiving with an Edit share went through (200). ClickUp allows that.

*Read:*
- No API rule asks for `admin` (Full edit). `grep` finds no `required: 'admin'` and no `spaceLevelReaches(…, 'admin')`.
- The share panel says "`admin` is ClickUp's 'Full edit' — the only level that may delete the item" (`share-panel.tsx`), and so does the permissions spec (`docs/share-and-permissions-spec.md`): "Full edit → our `admin`", "Edit … cannot delete the item", "public locations default to full edit".
- The create gate's comment says the opposite: "`admin` on this ladder is the rung that may re-share an object" (`container-access.ts`). So does the spaces schema: "ClickUp's 'Full edit' is this ladder's `edit`".
- Frame `06:52` shows the space wizard's default as **Full edit**. The wizard preselects Edit (`create-space-wizard.tsx`, `useState('edit')`), and the column defaults to `edit`.

ClickUp (help centre, "Permissions in detail", search snippets): Edit changes every task and subtask (status, assignees, title, ClickApps), removes attachments, archives, moves, merges and duplicates. Full edit adds creating tasks and subtasks, adding attachments and deleting.

*Closed, 25 September:*
- **A space is Full edit unless told otherwise.** The column defaults to `admin`, the API falls back to it, and the wizard preselects it (frame `06:52`). Migration 0164 moves every existing `edit` default to `admin`. Those spaces always behaved as Full edit, so nothing their members may do changes.
- **Creating in a location asks Full edit**: tasks, lists, projects, folders, forms and docs (`assertCanCreateInSpace`). So do the spaces the "+" and the Move picker offer (`/writable`, `move-targets`).
- **Deleting asks Full edit.** This covers a task sent to the Trash (the write rule's new `full` rung), a list, project or folder (the container rule's `delete`), and a doc. Changing and archiving keep asking Edit.
- **A refusal says what was refused**: "does not allow adding a task", "deleting its tasks", "deleting this list" (`assertSpaceLevel`'s `act`). Before, every refusal said "changing", which an Edit holder may do.
- **The task sheet** reads a fourth answer, `full`, from `/capabilities`. Its menu draws Delete, and its subtask form, only with Full edit.
- **The stale reasons are corrected**: the schema's "Full edit is `edit`", the create gate's "`admin` is the re-share rung" (sharing asks `edit`), the container rule's "`edit` for both", and the task rule's "Edit … deleting".
- **Spaces are listed in the order they were made.** `GET /spaces/workspace/:id` had no ORDER BY, so the sidebar, the Move picker and every space picker drew spaces in the order Postgres stored the rows. An UPDATE moves a row: renaming a space could move it, and 0164 would have reshuffled every workspace's sidebar. It did so to lane 4's, which put an empty leftover space first and broke every suite that builds its fixture in the first space.

The new suite `full-edit-levels`, 8 checks, each read back by SQL:
- the default (API, stored, and the wizard's own preselection);
- a space whose default is Edit beside a Full edit one;
- grants at Edit (a task share, a space role, a project role) beside a share at Full edit;
- what each refusal says;
- the sheet's menu and `/capabilities`;
- the "+" and the Move picker;
- deleting a list of one's own;
- a doc shared at Edit and at Full edit.

Results:
- Before (lane 1, `d8471cf`, unmigrated): 0 of 8.
- After: 8/8.

`fel-1..11`, each compiled. Each undoes one rule:
- the default, or the wizard, back to Edit;
- adding, deleting a task, the Full edit rung, deleting a container, or deleting a doc asking Edit again;
- the sheet's Delete drawn for Edit;
- `/writable` at Edit;
- adding said as "changing";
- the sheet's `full` taken from the Edit rule.

Re-aimed, each compiled: `dwl-7`, `sdp-2`, `-4`, `-5`, `-9` and `-19`, `space-default-permission-1`, `tsc-1` and `task-delete-1`.

*Break run, lane 1 (`4f51162`, then `ee661b7` and `a0a0d70`):*
- `fel-1..11`: 11 of 11 reddened, on a green baseline (8/8).
- The re-aims: `space-default-permission`'s 22 patches, the six re-aimed among them, 22 of 22 on a green baseline (36/36). `dwl-7` (4 of 5 passed), `tsc-1` (1 of 5) and `task-delete-1` (14 of 15) reddened, each on a green baseline.
- The restated suites, on their own patches: `guest-create-menu` 11 of 11 (6/6), `guest-space-level` 5 of 5 (5/5; `gsl-6` claims the unit test and stayed green here, as it should), `project-member-levels` 5 of 5 (5/5).

*Suites restated for the new model, none weakened.* Each asked Edit to make or delete something:
- `task-boundaries` and `hook-portal-access` build their spaces at Full edit.
- `guest-space-level` and `guest-create-menu` give the guest Full edit where it makes lists, and say so.
- `project-member-levels` check 3 has an Edit role that changes the task and makes none, beside a Full edit role that makes one.
- `space-default-permission` keeps its Edit space for renaming, and makes and moves things in a new Full edit space. Its Move-picker check asserts the Full edit space survives.

The patches quoting the changed sentences were updated with them.

Regression, a full sweep of all 189 suites on lanes 2 to 5 after 0164 was applied to their databases: 175 passed.
- Ten of the fourteen failures died in the shared fixture on lane 4. The migration's UPDATE had reordered lane 4's spaces, which is the missing ORDER BY above.
- `guest-create-menu` still gave its guest Edit to make lists, and was restated.
- After the ordering fix all fourteen ran again with `full-edit-levels`, and eleven passed.
- `a61-meeting-record`, `list-empty-states`, `addressability-live` and `chat-message-actions` failed under load, on different checks each time. Each passed on its own right after (25/25, 23/23, 28/28, 73/73), and they are recorded under `three-suites-fail-under-a-full-sweep`.

All 190 pass: the 189 and `full-edit-levels`. In CI (183).

*Not changed, recorded:*
- ClickUp's Full edit also "adds attachments". Here adding one asks Edit, as before.
- Duplicating a task makes one, so it asks Full edit; ClickUp's Edit may duplicate.
- A doc's pages still ask Edit.
- Lane databases were migrated by hand (lanes 1 to 5), since the lanes build their schema with `push` (`lane-databases-drift-from-the-migrations`).

*Found beside it:*
- The list page offers its add row and inline edits to anybody who can open the list (`found-25-sep/list-page-offers-refused-edits`).
- A subtask's "Delete" archives it (`found-25-sep/subtask-delete-archives`).
- The sweep fixture helper walks every space to pick a workspace, then builds in the first space whatever it holds (`found-25-sep/fixture-builds-in-a-space-it-did-not-check`).

### `found-25-sep/list-page-offers-refused-edits` — **closed** (visible bug, medium; found closing `full-edit-enforced-nowhere`)

**The list page offers its add row and its inline edits to anybody who can open the list**

*Evidence, read not run:* the list page (`app.$workspaceId.$spaceId.$projectId.$listId.tsx`) creates tasks and changes their fields inline, and asks nothing about what the reader may do: no `useCreatable`, no capabilities. `task-sheet-offers-refused-edits` closed this for the sheet, and `view-only-space-menus` for the space's "+". A view-only or comment-only reader, or one whose Edit adds nothing, is offered the add row and the inline status, dates and assignees, and each is refused (403) after it is used.

*To close:*
- Measure a view-only, a comment-only and an Edit reader on the list page.
- Draw the add row by the answer `/writable` gives for the list's space, and the inline edits by what the list's reader may change.

*Measured, lane 5, on `a0a0d70`:* the new suite below, 1 of 7 as first written.
- In a view-only space the member was offered Add task, four add rows, and a done circle, priority, due date and selection box on every row, with Statuses and Create field.
- In an Edit space they were offered the same, Add task included, which takes Full edit.
- In a comment-only space they were offered a done circle on the task not assigned to them as well.
- The Table view offered every cell and its add row. The Board offered its add row, Add group, the column names and a drag on every card.
- `GET /tasks/list/:listId/capabilities` did not exist (404). Only the Full edit space passed.

With the web page at `a0a0d70` against the new API, the nine checks the suite ended with: 2 of 9 (the Full edit space and the API's answer). On the Gantt a view-only member's drag moved the bar, and the move was refused.

ClickUp (help centre, "Permissions in detail" and "Manage task statuses", search snippets):
- View changes nothing.
- Comment comments, and completes a task assigned to the person.
- Edit changes every task in the location — its status, assignees, title — and adds none.
- Full edit adds and deletes.
- Owners, admins and members manage statuses by default.

*Closed, 25 September:*
- **`GET /tasks/list/:listId/capabilities`** answers what the list's routes would, once for the page:
  - `add`, the create gate;
  - `edit` and `comment`, the level the write rule reads at the list;
  - `statuses`, the status routes' own rule (`assertMayShapeStatuses`);
  - `fields`, the field routes' own rule. That rule moved to `common/permissions/field-access.ts`, so the answer asks the rule the routes ask, not a copy of it.
- **The page asks it with the tasks**, and draws nothing that changes the list until it answers. A read that fails, or an answer that is not one, offers what the page always did, and the routes still refuse.
- **What it draws by the answer:**
  - `add`: Add task, a group's add row, the Table's and the Board's add rows, a calendar day's Add, and the empty list's Create task.
  - `edit`, or `comment` on a task assigned to the reader: a row's done circle, the Table's status and assignee cells, and a Board card's drag.
  - `edit`: a row's priority, due date and selection box, and the bulk bar; the Table's other cells, its titles and its field cells; a subtask's done circle; the Calendar's and the Gantt's drag. A press on a Gantt bar the reader may not move opens the task.
  - `statuses`: Statuses, the Board's column names and Add group.
  - `fields`: Create field.
- A row, cell or card the reader may not change still says what it holds: a done task is still drawn done.
- `status-access.ts` said a space's default is `edit`. It has been Full edit since 0164; the sentence says so now.

The new suite `list-page-levels`, 9 checks. A member reads four lists of the admin's, one per level: View; Comment, with the first task assigned to them; Edit; Full edit. Each list has a subtask, a text field and an empty list beside it. The suite reads the List, Table, Board, Calendar and Gantt views, and every change the member makes is read back by SQL:
- a priority in the Edit list;
- a status from the Edit table;
- a task added through a group's row at Full edit;
- the assigned task completed at Comment;
- a Gantt bar dragged at Full edit, and one pressed at View.

Results:
- Before: 1 of 7 as first written (the old API and web); 2 of 9 with the web at `a0a0d70` against the new API.
- After: 9/9, on lanes 5 and 4.

`lpl-1..33`, each compiled, at least one per check:
- the API answering `add`, `edit`, `comment`, `statuses` or `fields` to everybody, or reading the space's default instead of the reader's level;
- the page ignoring the answer;
- Add task, a group's add row, a row's done circle, priority and due date, and its selection box offered to everybody;
- the done circle for a comment-only reader on any task, or on none;
- a subtask's done circle, Statuses and Create field offered to everybody;
- each Table cell, its titles, field cells, add row and selection boxes offered to everybody;
- the Board's add row, drag, Add group and column names offered to everybody;
- the Calendar's drag and Add, the Gantt's drag, and the empty list's Create task offered to everybody.

`fwl-6` re-aimed at the moved rule. `fwl-3`, `-4` and `-5` and `cfa-4` compile unchanged. `b7-rowgate` (`list-view-controls`) re-aimed at the row's due date, which reads `mayEdit` now; the gate is the same.

*Break run, lane 1 (`39acc88`):*
- `lpl-1..33`: 33 of 33 reddened, on a green baseline (9/9).
- `field-writes-by-level`'s six, whose set the re-aim left stale: 6 of 6 (5/5).
- `list-view-controls`' thirteen: 13 of 13 (50/50).
- `cfa-4`: reddened (4/4).

Regression on lanes 2 to 5: the 71 suites that open a list page, define fields or change statuses. That is the 60 whose steps reach the list route, with `custom-field-access`, `field-writes-by-level`, `folder-dialog`, `list-statuses-seeded`, `project-page-controls`, `status-write-access`, `space-presets`, `no-dead-ends`, `video-regression`, `task-edit-levels` and `gantt-controls`.
- Result: 71/71.
- Under the sweep's load, 70 passed the first time. `video-regression` found no list from the space page on lane 4 ([A1.2]), as it has once before. It passed alone on lanes 4 and 2 (93/93), and is recorded under `three-suites-fail-under-a-full-sweep`.
- API unit tests: 1649/1649.

In CI (187). The job's limit is 240 minutes now: 187 suites is about 206 minutes, against 210.

*Not changed, recorded:*
- Saved views and saved filters are made by any reader (201 at every level), as before. They change what the reader sees, not the list.
- Share and the Email panel's address follow the list's maker rule (`sharing-asks-the-maker-not-the-level`, below).
- The bulk bar's own gate, and a row's shift-click select, sit behind the selection box. That box is not drawn without `edit`, so no check can reach them.
- Until the answer comes, nothing that changes the list is drawn, and no check measures that gap.

*Found beside it:*
- A member who may not add tasks makes an inbound webhook, and every delivery to it is refused (`found-25-sep/inbound-hooks-made-where-their-maker-cannot-add`).
- Sharing a list, and giving it an email address, is for its maker or a manager (`found-25-sep/sharing-asks-the-maker-not-the-level`).

### `found-25-sep/inbound-hooks-made-where-their-maker-cannot-add` — **closed** (visible bug, small; dead control; found closing `list-page-offers-refused-edits`)

**A member who may not add tasks to a list makes an inbound webhook on it, and every delivery to it is refused**

*Measured, lane 3, on the working tree after `a0a0d70`:* a member of a view-only, a comment-only and an Edit space each made a hook on the admin's list there (201). A POST to each hook's address was refused (403, "This space's default permission is … which does not allow adding a task"), and no task was made. Asking the list directly was refused the same way (403). The Email panel offers the hook to them.

`InboundWebhooksService.create` asks only that its maker is not a guest. Its own comment says "a hook adds tasks as its creator, so its creator must be somebody who may add tasks here", and then asks less. Delivery asks the create gate, through `createTask`, so nothing is added where it should not be: the hook is dead from the start, and nothing tells its maker.

*To close:* making a hook asks the create gate for its maker (Full edit, not a guest), and the Email panel offers it by the same answer. Check with a view-only, an Edit and a Full edit member.

*Closed, 25 September:*
- **Making a hook asks the create gate** for its maker (`assertCanCreateTaskIn`: the list read, not a guest, Full edit). A guest is refused by the same gate, so the separate guest line went: one rule, not two.
- **A delivery asks the same gate** (`canCreateTaskIn`), and refuses in the hook's own words when its maker can no longer add. It asked a restatement of an older rule (a member, not a guest, who could see the list), and the gate was asked again inside `createTask`. The restatement went, with the visibility columns only it read.
- **The Email panel offers a new webhook by the list's answer** (`add`), which the page passes it. It read the workspace role and offered the hook to every member: a copy of the server's old rule.

The new suite `inbound-hook-makers`, 3 checks: a member makes a hook in a view-only, a comment-only and an Edit space, and at Full edit; a delivery to the Full edit one; and the Email panel in three of the lists. Hooks and tasks are read back by SQL.
- Before (lane 5, `39acc88`): 1 of 3 (the Full edit control). All three refused levels made hooks (201, stored), and the panel offered a new webhook in every list.
- After: 3/3, on lanes 5 and 4.

`ihm-1..5`, each compiled: making asks nothing; making asks only "not a guest", as it did; the panel offers to everybody; the page passes the panel `edit` for `add`; every delivery refused. Re-aimed at the new lines, each compiled: `hpa-1`, `hpa-2` and `hpa-15`. `hpa-18` and `-19` apply unchanged.

*Break run, lane 1 (`af5ab5a`):* `ihm-1..5`, 5 of 5 reddened, on a green baseline (3/3). `hook-portal-access`'s nineteen, the re-aims among them, 19 of 19 (11/11).

Regression on lanes 2 to 5: the 9 suites that make, list or deliver to hooks or read the Email panel (`hook-portal-access`, `credential-reads`, `mail-comments-by-level`, `email-reply-routing`, `space-features`, `task-boundaries`, `task-depth`, `task-menu`, the new suite), with `list-page-levels`, `list-empty-states`, `ui-sweep` and `no-dead-ends`. Result: 13/13. In CI (188).

### `found-25-sep/list-address-read-by-those-who-may-not-add` — **closed** (security, medium; found closing `inbound-hooks-made-where-their-maker-cannot-add`)

**A list's email address makes a task for whoever mails it, and every reader of the list could read it — or cut it out of any task's address**

*Measured, lane 3, on `3646991`:*
- A guest with only a view share on a list read its address (`GET /lists/:id/inbound-email`, 200), mailed it, and a task was made in the list as them (`task_created`).
- A member of a view-only space did the same. `POST /tasks` refuses them one there (403).
- A stranger's mail made a task put down as the admin's, the address's maker.
- A task's address was `list-<the list's alias>+task-<id>`. It goes to everybody who may read the task (the task menu's "Send email to task", and the Reply-To of every notification). Cutting off its `+task-<id>` left the list's address.

ClickUp (help centre, "Create tasks and comments via email", search snippets): Email to List's address is the permission. A guest "can create tasks and add comments via email if the unique email address is shared with them", and cannot see it in ClickUp.

*Closed, 25 September:*
- **The address is read by those who may add tasks to the list**, the create gate. Anybody else is refused (403). The create gate moved to `common/permissions/task-create.ts`, since `TasksService` depends on the email module and the email module could not ask it; `TasksService.assertCanCreateTaskIn` asks it there.
- **A task's address carries a tag of the alias**, not the alias: an HMAC of the task id under it (`taskAddressTag`). The tag names that task, cannot be turned back into the alias, and changes when the alias is rotated. Mail answering an address given out before tags still lands, since its sender already had the alias.
- **The Email panel shows the address only to those who may add**, by the list's answer. For anybody else it says why there is none, with nothing to generate (four locales).

*Not changed, recorded:* mail to the list's address still makes a task for whoever sends it: its sender if they are a member of the workspace, else the address's maker. That is ClickUp's Email to List. The address is what is kept, and whoever is given it may use it.

The new suite `list-address-readers`, 3 checks:
- who reads the address: a member of a view-only space, a member at Full edit, and a guest with a view share;
- what a task's address holds: mail to it, to its old form, and to it with its task cut off, read back by SQL;
- the Email panel, in both lists.

Results:
- Before (lane 5, `3646991`): 0 of 3.
- After: 3/3, on lanes 5 and 4.

`lar-1..5`, each compiled: the address for every reader; the task's address carrying the alias; tags refused; old addresses refused; the panel showing every reader the address. Re-aimed at the moved gate, each compiled: `tcm-2`, `-3`, `-5` and `-6`, and `mtg-3`. `mcl-1` re-aimed at the tag's comparison.

*Break run, lane 1 (`3d959fc`):*
- `lar-1..5`: 5 of 5 reddened, on a green baseline (3/3).
- `mail-comments-by-level`'s four, `mcl-1` re-aimed: 4 of 4 (5/5).
- `task-creation-access`: 5 of 6 (6/6). `meeting-access`: 2 of 3 (4/4).
- `tcm-6` and `mtg-3` stayed green. They took the guest refusal away, and each suite's guest held only Edit, which the level refuses anyway. They are re-aimed under `guests-with-full-edit-make-no-tasks`, below, where the guest refusal went.

Regression on lanes 2 to 5:
- the mail suites: `mail-comments-by-level`, `email-reply-routing`, `credential-reads`, `task-menu`, `task-menu-favorite-archive` and `task-boundaries`;
- the suites that make tasks by the moved gate: `task-creation-access`, `meeting-access`, `hook-portal-access`, `inbound-hook-makers`, `full-edit-levels`, `guest-space-level`, `guest-create-menu`, `list-page-levels` and `space-default-permission`;
- the new suite.

Result: 16/16. In CI (189).

### `found-25-sep/sharers-raise-their-own-level` — **closed** (security, HIGH; found closing `sharing-asks-the-maker-not-the-level`)

**A member who may share raises themselves: they share the place with themselves at Full edit, and give it to others above their own level**

*Measured, lane 3, on `af5ab5a`:*
- A member with a list in a view-only space shared to them at Edit was refused a task in it (403).
- They shared the list with themselves at Full edit (201), or changed their own share to it (200), and made the task (201).
- They gave Full edit to another member (201).
- They lowered, and then removed, a Full edit share the admin had given another member (200 each).

Sharing asked only whether the sharer could share: never what level they gave, or whose share they changed. Fixing `sharing-asks-the-maker-not-the-level` alone would have let every Edit member do it: they could share by the space's default.

*Closed, 25 September:* nobody gives, changes or removes more than they hold, their own share included. A share, a change of level (the new level and the old) and a removal are each capped at the sharer's own level (`assertWithinOwnLevel`). One rule covers raising oneself and raising others: a raise is above one's own level either way. The Share panel offers the levels up to the reader's own. A row they may not touch, their own or one above them, is drawn and not changed.

The suite and patches are shared with the item below (`share-levels`, checks 1 to 3 and 6; `shl-1..4`, `shl-8` and `shl-9`).

### `found-25-sep/sharing-asks-the-maker-not-the-level` — **closed** (behaviour, small; found closing `list-page-offers-refused-edits`)

**Sharing a list, and giving it an email address, is for its maker or a manager, and the list page offers both to every reader**

*Measured, lane 3, on the working tree after `a0a0d70`:* a member with Full edit, the space's default, was refused sharing the admin's list (403) and giving it an email address (403). Each succeeded (201) on a list they had made. A member of an Edit space was refused both too. The list page draws Share for every reader, and the Email panel draws its address button.

ClickUp (help centre, "Share Spaces, Folders, Subfolders, Lists, and tasks", search snippets): edit permissions on a location let a member share it; a guest shares nothing, at any level.

*To close:*
- Decide the share rule by the location's level, as ClickUp does: Edit or Full edit, never a guest.
- Decide the address rule to match.
- Have the list page draw Share and the address button by the answer.
- Check with a member at each level, on a list they did not make.

*Closed, 25 September:*
- **Sharing reads the level the sharer holds** (`actorLevel`). That is their own grant on the place or the nearest one above it. Without one, it is what the place's space gives them: its default, their grant on it, a project role (`resolveSpaceLevel`, the level the write rules read). Managers hold Full edit. Edit or above shares; a guest never does. A doc, a channel or a dashboard is its maker's, as before.
- **The share route says the reader's level from the same answer.** It read their grants alone, so a member at Edit by the space's default was told they held nothing.
- **A list's address is given, rotated and revoked by those who may add tasks to it**, the create gate, as reading it is (`list-address-read-by-those-who-may-not-add`). It was the list's maker's or a manager's.
- The list page's Share opens the panel, which offers sharing by the answer or says why not. The Email panel shows the address, and its buttons, to those who may add.

The new suite `share-levels`, 6 checks. A member reads four lists of the admin's: one in a view-only space shared to them at Edit, and one each by the default at View, Edit and Full edit. Another member and a guest are shared to. Every share and address is read back by SQL.
- Before (lane 5, `af5ab5a`): 0 of 6.
- After: 6/6, on lanes 5 and 4.

`shl-1..9`, each compiled:
- a share given at any level;
- sharing over a higher share;
- a level changed, or a share removed, above one's own;
- the space's level unread;
- a guest sharing;
- the address given by anybody who reads the list;
- the panel offering every level;
- the reader's level from their grants alone.

*Break run, lane 1 (`3d959fc`):*
- `shl-1..9`: 8 of 9 reddened, on a green baseline (6/6). `request-access`' four: 4 of 4 (9/9). `ui-sweep`'s three: 3 of 3 (107/107).
- `shl-6` (guests share) stayed green. The check's guest shared the list with a member who already held Full edit on it, so the cap refused them before the guest rule could.
- The guest now shares with an outsider's address, and no invite row may be made. The suite passed again (6/6).
- Run again on lane 1 (on `14c789f`, after the edit that broke the first run, `lane-scripts-read-as-they-run`): `shl-1..9` all reddened the check they claim, `shl-6` among them.

Regression on lanes 2 to 5: the 18 suites that share, or set shares up, and `request-access`, `ui-sweep` and `project-member-levels`. Result: 21/21.
- Under the sweep's load, 19 passed the first time.
- `request-access` did not find its notification among the admin's latest 50, which the other suites were filling. It passed alone, 9/9.
- `space-default-permission` was refused a signup by the rate limit (429) before its first check. It passed alone, 36/36.
- Both are recorded under `three-suites-fail-under-a-full-sweep`.

In CI (190).

### `found-25-sep/subtask-delete-archives` — **closed** (visible bug, small; found closing `full-edit-enforced-nowhere`)

**A subtask's "Delete" in the task sheet archives it**

*Evidence, read not run:* the subtask row's "Delete" (`common.delete`) calls `DELETE /tasks/:id`, which is Archive. The task's own menu keeps the two apart (Archive, then Delete to the Trash), and the subtask row says Delete and archives.

*To close:* decide it as the task menu does. Either offer Archive and Delete on the row, or call it Archive. Then check which one happened.

*Measured, lane 5, on `3d959fc`:* the admin's subtask row offered one button, Delete. Pressing it archived the subtask (`is_archived` true, `deleted_at` null): the task menu's Archive, under the menu's other name. A member at Edit was offered the same button.

ClickUp (help centre, "Archive a task", "Delete a task", search snippets): a subtask's menu offers both. Archive clears it from view, and a filter finds it. Delete moves it to the Trash, restorable for thirty days.

*Closed, 25 September:* the row offers both, as the task's menu does.
- **Archive** (`DELETE /tasks/:id`) at Edit.
- **Delete** (`POST /tasks/:id/trash`) at Full edit, with the menu's Undo.

Each says what happened in the menu's words.

The new suite `subtask-row-actions`, 2 checks, read back by SQL:
- the admin archives one subtask and deletes another;
- a member at Edit is offered Archive and not Delete.

Results:
- Before (lane 5, `3d959fc`): 0 of 2.
- After: 2/2, on lanes 5 and 4.

`srw-1..4`, each compiled: Delete archiving, as it did; Archive trashing; Delete offered at Edit; no Archive.

*Break run, lane 1 (`4135abd`):* `srw-1..4`, 4 of 4 reddened, on a green baseline (2/2).

Regression on lanes 2 to 5: the 12 suites that open the sheet's subtasks, its menu, the Trash or archiving, and the new suite. Result: 13/13. In CI (191).

### `found-25-sep/fixture-builds-in-a-space-it-did-not-check` — **closed** (test tooling, small; found closing `full-edit-enforced-nowhere`)

**The sweep fixture picks a workspace by walking every space, then builds in the first space whatever it holds**

*Evidence:* `pickWorkspace` (`test/e2e/lib/fixture.mjs`) accepts a workspace when any of its spaces has a project with a list. `ensureSweepFixture` then takes `spaces[0]` and throws "space has no projects" when that one is empty. On lane 4 a space left by an interrupted `space-default-permission` run came first, and nine suites died before their first check. The two helpers answer one question two ways.

*To close:* one walk for both, so the fixture builds where the workspace was picked for. A leftover empty space should not end a run.

*Closed, 28 September:* `firstSweepList` (`test/e2e/lib/fixture.mjs`) walks spaces, their projects and their lists in order and returns the first list found. `pickWorkspace` accepts a workspace by it, and `ensureSweepFixture` builds in what it returns. So a space or project left empty is passed over by both. A workspace with nothing to build in says so ("no space of this workspace has a project with a list") instead of failing on its first space.

`scripts/check-sweep-fixture-cases.mjs` drives the fixture against an in-memory API, 5 cases:
- HEAD's fixture: 2 of 5. It failed on "space has no projects" and "project has no lists".
- Now: 5/5, and `--mutate` 4 of 4 bite.
- In preflight and CI.
- The 11 suites that build with it ran in the regression sweep of 28 September.

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

### `found-24-sep/planner-default-list-read-by-nothing` — partly-fixed, small (dead control; found fixing the block prefix)

**The planner's Time blocking "Default list" saves, and nothing reads it**

*Evidence, read not run:* `planner-settings-dialog.tsx` draws a Default list picker (`planner-default-list`). Its comment calls it "the answer to the question video 1 left open: where a task made from a message, from /task, or by the AI should land". It writes `defaultListId` into the person's planner settings, and the server checks the list exists. A search of `apps/web/src` and `apps/api/src` finds no other reader. A task made from a chat message, from `/task` or by the AI lands wherever those flows put it, and the picker changes nothing. `planner-settings` checks only that the picker offers the workspace's lists.

*The frame answers what it governs:* `14:20`, Time blocking, "**Default list for new tasks** — *Defaults to your personal list*" (`video2-frame-observations.md`). The gap audit reads it as the answer to video 1's open question: where a task made by `/task`, from a message, or by the AI lands. That is the person's Personal List unless they choose another.

*To close:* have each of those flows read the setting when no list is named: `/task`, a message turned into a task, and the AI's task-making. Add a check per flow that the task lands in the chosen list, and in the personal list when none is chosen.

*Partly fixed, 24 September.* A chosen list now decides where all three land. `defaultListFor` (tasks.service), which `/task` and the AI's "Create task from this" already asked, reads the person's chosen list first. It uses it when the list is in this workspace and they may add to it (`canCreateTaskIn`), and otherwise takes the oldest list they can add to, as before. The chat page chose the first list of the first project of the first space itself and always named it. It names none now, and `create-task` from a message asks `defaultListFor`, as `/task` does. Three strings for the page's own lookup went with it.

The new suite `planner-default-list`, 6 checks. On lane 1 before, 1 of 4 (the first four): `/task`, a message and an AI answer each landed in the oldest list with a list chosen, and the twin (none chosen: the oldest) passed. After, 6/6, with two more for the guards on the chosen list:
- a list chosen in another workspace is not used here (a message's words would have crossed into the other workspace);
- a member's chosen list in a private space they are not in is passed over, not refused.

`pdl-1..4` (the choice ignored, the page picking the list, any workspace, no create rule), each compiled, 4 of 4 reddened on lane 2.

*What is left:* the frame's default, "your personal list". This product's personal tasks are a separate table, not a list, so there is no personal list to default to. The empty choice was labelled "My personal list" over a behaviour that is the oldest list the person can add to. It says so now ("The first list I can add to", in the four locales). A personal list per person, as ClickUp has, is unbuilt. Regression on lane 1, 12/12: `planner-default-list`, `chat-message-actions`, `chat-history`, `replies-inline-thread`, `task-creation-access`, `lookup-read-access`, `ai-answer-rendering`, `planner-settings`, `task-mentions`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

### `found-24-sep/guest-makes-lists-where-nothing-is-shared` — **closed** (security, medium; found closing `custom-role-permissions-unread-by-web`)

**A guest with no grant on a space makes a list in it**

*Evidence, measured on lane 2 (a probe, deleted after):* a guest of the workspace with no grant on the space posted `POST /lists` into a project there, and was answered 201. The same guest is refused a task ("Guests cannot create tasks"), a doc with no space ("Guests cannot create docs here"; a doc in a space granted to them at edit is 201) and a folder (`space.create`).

`lists.service` asks `assertCanCreateInSpace`, which reads the space's level through `resolveSpaceLevel`. For somebody with no grant, that level is the space's DEFAULT, which is the members'. Docs refuse to count the default for a guest ("for a GUEST, a grant of it, since a space's default is its members'"), and a guest is by definition somebody things are shared with.

*To close:* one rule for a guest making anything in a space: a grant of edit there, never the default. Ask it where the create gate is asked, so it covers lists and everything else that takes `assertCanCreateInSpace` for a guest. Measure every creator a guest can reach. Research ClickUp's rule for guests before settling it: their guests create in what is shared with them at edit or full.

*ClickUp's rule* (help.clickup.com "Use ClickUp as a guest or limited member", "Permissions in detail"; search snippets, since the pages cannot be fetched here): a guest sees and changes only what is shared with them, at the level it was shared at — view, comment, edit or full edit — set per item, and the most specific share decides.

*Closed, 24 September.* The rule now lives in the resolver every gate asks: `resolveSpaceLevel`, and `resolveSpaceLevels` for the Move picker. A guest holds what is shared with them, and "view" when nothing is. What counts, most specific first:

1. a share on the item or on a container above it (`within`);
2. a grant on the space.

The create gate passes a list's project and folder, and the comment gate a task's list, project and folder, so a guest invited to one of those works there. The refusal says so: "Nothing here is shared with you, and a guest changes only what is shared with them". Docs kept two copies of the guest rule of their own; both are gone, since the resolver now states it.

The new suite `guest-space-level` has 5 checks. Every refusal is read back by SQL beside a member doing the same, and beside the guest doing it where a grant allows. Measured on lane 1:

- before, with the fix stashed: 1 of 5. The guest made a list and commented in an open space nothing was shared from, the Move picker offered them that space, and a task beside the ones shared with them took their comment. Only the reads-unchanged check passed;
- after: 5/5.

Its reads check, that the guest still read the open space, went when a guest's reads narrowed too (`found-24-sep/guests-read-every-open-space`, below): what a guest reads is `guest-read-scope`'s. The suite has 4 checks now.

Four unit tests, in `space-default-permission.test.ts`: a guest with nothing shared, a member's default, a guest's grant on the space, and the most specific share first.

`gsl-1..6`, each compiled; `gsl-6` claims the unit test, since no suite shares one guest two levels on one chain. Re-aimed at the moved code, and compiled: `dwl-3`, `dwl-5`, `sdp-5`, `sdp-7`, `sdp-19` and `tsl-5`. The 51 other patches on the changed files compile too.

Regression on lane 1, 28/28: `guest-space-level`, `doc-write-levels`, `space-default-permission`, `task-space-levels`, `workspace-read-access`, `task-creation-access`, `label-access`, `goal-access`, `sprint-access`, `meeting-access`, `task-boundaries`, `view-visibility`, `credential-reads`, `hook-portal-access`, `task-pickers-search`, `space-presets`, `video1-fast-items`, `goals-page`, `comment-plus-menu`, `comment-thread`, `save-comment`, `doc-boundaries`, `doc-task-links`, `private-folder-reach`, `private-list-reach`, `ui-sweep`, `video1-acceptance` and `video-regression`. In CI.

*Not changed:*

- the read side. A guest here reads every open space, as `workspace-read-access` asserts, where ClickUp's guest sees only what is shared with them. That is `found-24-sep/guests-read-every-open-space`, below;
- a MEMBER's level. The task gates read a member's level on the space alone, so a share on a task or list does not change it; ClickUp's most-specific rule is everybody's. Recorded, not changed.

### `found-24-sep/guests-read-every-open-space` — **closed** (security, large; found closing `guest-makes-lists-where-nothing-is-shared`)

**A guest reads every open space: its tasks, lists, docs and comments**

*Evidence, read not run:* the container rule treats a guest as a member. `containerRefusal` passes every public container, and `workspace-read-access` asserts that "the member and the guest get the open space's task". Docs give a guest "view" on an open space's docs. Goals and sprints are the exception: they give a guest none, because "in ClickUp a guest sees only what has been shared with them" (`read-access.ts`). So a guest invited to one list reads every other open space in the workspace.

*ClickUp's rule* (help.clickup.com "Use ClickUp as a guest or limited member"; search snippets): "A guest sees only the tasks, lists, or folders they have been invited to."

*To close:* one read rule for a guest: a container, doc or task is theirs to read only through a share on it or above it, or a grant on its space. It has to hold across the whole container rule (`containerRefusal`, `containerVisibilityFilter`, `taskInReachFilter`, `spaceVisibilityFilter`), docs, search and the realtime rooms. Measure it through every read a guest can reach, and change the suites that assert a guest reads the open space along with it.

*ClickUp's rule* (help.clickup.com "Share Spaces, Folders, Subfolders, Lists, and tasks" and "Use ClickUp as a guest or limited member"; search snippets): what is inside a shared item comes with it, a shared task's subtasks included. A guest's sidebar is a "Shared with Me" section of their own.

*Closed, 24 September.* The rule lives in one file, `common/permissions/guest-reach.ts`, and answers two questions for a guest of a workspace:

- REACH is what they read. That is everything under a grant on its space (a space membership or a share of the space), its folder, or its project (a project membership or a share of it); a list shared with them; and a task shared with them, with its subtasks.
- PATH is the containers above anything in reach. They are listed, so the tree can be walked to what is shared, and nothing else in them is.

Each predicate is self-contained SQL over its own table. It lets every row through unless its reader is a guest of the row's workspace, so it drops into any query without a role being passed. The per-row check (`guestMayRead`) asks the same SQL of one row. Where it is asked:

- the SQL twins of the container rule: spaces and projects by path, tasks by reach, both in `taskInReachFilter` and in the private-task filter every task listing asks;
- the list and folder listings;
- the spaces listing, which had its own copy of the space rule. It asks `spaceVisibilityFilter` now;
- `ResourceMemberGuard`: a task by reach; a space, project, list or view by path;
- the task service's own read check, and `readableProject`, `readableList` and `readableTask`;
- the realtime rooms: a task by reach, and a list only when the whole list is in reach, since its room carries every task in it;
- the doc rule. For a guest, `refusedSpaceIds` is every space not granted them, plus the workspace's own docs: a chain of docs located in no space at all.

The new suite `guest-read-scope`, 12 checks, planted by SQL. The workspace has an open space nothing is shared from, a space shared with the guest whole, and a space holding a shared project, a shared list beside an unshared one, a shared task (with a subtask) beside an unshared one, and a project nothing in is shared. Each read is asked beside a member. The checks cover: by id; the spaces, projects and lists listings; the tasks of a list; the workspace's task listing and search; docs by id and in the hub; the realtime rooms and what is heard in them; and in the browser, the sidebar, and the list the guest only passes through, which opens on their one task with no request on the page failing.

- Before, with the change stashed, on lane 1: 1 of 12. Only the granted space's reads passed.
- After: 12/12.

Unit tests: the doc walk's guest case (`doc-access.test.ts`), and two test mocks taught to read the query that ran rather than a subquery a read rule built on the same table (`search.service.test.ts`, `tasks-security.test.ts`). API unit tests 1642/1642.

`grs-1..15`, each compiled, at least one per check. Re-aimed at the moved lines: `rra-2` and `wra-25`.

`dwl-3` is retired. Its mutation (a guest holds the space's default) became `gsl-1`'s line, and no doc check can see it now: a guest reaches no unshared doc's write level, because the read refuses first.

*Regression:* the full sweep, 172 suites on lanes 1–4: 162 passed at first. Six asserted the old rule, and each is changed to the new one:

- `doc-write-levels`' guest is refused as not found;
- `guest-space-level` drops its reads check, which is this suite's subject now;
- `hook-portal-access`, `meeting-access`, `task-creation-access` and `workspace-read-access` share their guest what their checks read, so each still asks what it asked: hooks without addresses, "guests may not make tasks", hidden things beside visible ones.

The other four, taken in turn:

- `local-dates` was a defect of mine, `found-24-sep/local-dates-expected-the-day-of-now` below;
- `addressability-live`, `request-access` and `task-menu` passed alone (28/28, 9/9, 37/37), `found-24-sep/three-suites-fail-under-a-full-sweep` below.

The eight changed suites then passed together, 8/8. In CI.

*The break run, and what it found (plan-drifted-3, lanes 2–4):* `grs-1..15` reddened 14 of 15, `hook-portal-access` 11 of 11 and `doc-write-levels` 6 of 6. Five patches stayed green, and each showed a check that could no longer see its code:

- `gsl-1` and `gsl-2` (the write rule's guest default, one space and many): the read rule now refuses a guest the open space before the write rule is asked. `guest-space-level` gains a fifth check where it IS asked: a guest who only passes through a space, to a list shared with them in it, makes no list beside it, and the Move picker does not offer them the space. Both are re-aimed there.
- `mtg-3` and `tcm-6` (a guest makes tasks): their suites shared the list with the guest to view, so the list's level refused first. They share it to edit now, so "guests may not make tasks" is the refusal left. The task create gate passes the list, project and folder as its chain, as the list gate does, so an edit share on the way counts for a guest there too. `tcm-5` is re-aimed at the gate's new call.
- `grs-5` (the guest's half of `taskInReachFilter`): every read of tasks asks the private-task filter beside it, and that filter carries the same half. The copy was shadowed in every read. It is gone, and `grs-5` with it.

Rerun on lane 1, 8/8: `guest-space-level` (5), `meeting-access`, `task-creation-access`, `guest-read-scope`, `search-read-access`, `report-read-access`, `private-list-reach` and `workspace-read-access`. API unit tests for the touched modules 284/284.

*Not changed, and each its own item:* `found-24-sep/guests-read-every-open-channel` and `found-24-sep/guests-list-every-whiteboard`, below. A guest's sidebar is still the tree, cut down to the way to what is shared, not ClickUp's "Shared with Me" section. And a guest assigned a task nothing shares with them no longer reads it; ClickUp asks to share it when assigning. Recorded, not built.

### `found-24-sep/guests-read-every-open-channel` — **closed** (security, medium; found closing `guests-read-every-open-space`)

**A guest reads every public chat channel of the workspace**

*Evidence, read not run:* `readableChannelsFilter` (`modules/chat/channel-read-filter.ts`) keeps a private space's channels for its members, and a private channel or a DM for its own members. Every other channel is every workspace member's, a guest's included. `workspace-read-access`'s activity check asserts that the guest reads the admin's message in a public channel. ClickUp's guests see the channels they are added to.

*To close:* a guest reads a channel they are a member of, one shared with them, or one of a space granted them. Measure it through the channel list, messages, search, activity and the realtime rooms.

*ClickUp's rule* (help.clickup.com "Guest-type user roles", "Permissions in detail"; search snippets): guests use the channels they are invited to and the chats of locations shared with them, cannot create channels, and at view-only cannot send messages.

*Measured on lane 1, before, worse than the evidence said:* a guest was listed and read every public channel, search found its messages, and their socket joined the workspace's room, where a public channel's messages are broadcast whole. They could join any public channel and make channels. And the notifications leaked on their own. Posting told every member row of the channel, with the message's first 180 characters, and a public channel's rows are only people having opened it, a guest's among them. A mention told anybody named, a member outside a private channel too.

*Closed, 24 September.* A public channel reaches a guest through a share of it or a grant on its space (`channelReachesGuest`). A private channel or a DM reaches them through its membership, which for those is an invitation. A public channel's membership is only somebody having opened it (`markChannelRead`), so it counts for nothing. The rule is asked in each of its three statements:

- the SQL filter (`readableChannelsFilter`), which the channel list, activity and search read;
- the per-channel check (`assertChannelAccess`), which reading, posting and joining ask;
- who hears an event (`channelReaders`). It now answers `{ workspace, users }`: the workspace's room, which a guest may no longer join, and each guest a public channel reaches, told in their own room.

Two more rules:

- A message's notifications go only to those who may read its channel, member rows and mentions alike.
- A guest makes no channel. Listing the channels as a guest no longer makes #general, which answered the guest 403.

The new suite `guest-chat-scope`, 7 checks planted by SQL: the list, the messages (with a legacy member row on the workspace's channel), search, the socket and what it hears, what the guest and a member are told when named, joining, and making a channel.

- Before, with the change stashed, on lane 1: 0 of 7.
- After: 7/7.

`gcs-1..9`, one at least per check. Re-aimed at the readers' new answer, the same mistakes: `crr-1`, `crr-5`, `crr-6`, `crr-7` and `sl-3`. `workspace-read-access`' activity check shares its public channel with its guest, since that is how a guest reads one now.

Regression on lane 1, 25/25: `guest-chat-scope`, `chat-realtime-access`, `call-realtime-access`, `workspace-read-access`, `chat-history`, `chat-message-actions`, `sidebar-dms`, `replies-inline-thread`, `syncup-live`, `call-survives-navigation`, `search-read-access`, `lookup-read-access`, `task-mentions`, `a39-dm-tabs`, `a61-meeting-record`, `inbox-scope`, `task-creation-access`, `planner-default-list`, `object-key-boundaries`, `panel-collapse`, `sidebar-sections`, `video1-fast-items`, `video1-acceptance`, `video-regression` and `ui-sweep`. In CI.

*Not changed, each recorded:*

- A guest may still open a DM with anybody in the workspace. ClickUp limits a guest's DMs to people who share a channel with them.
- A member may make a channel scoped to a private space they are not in: `createChannel` checks the space's workspace, not the maker's reach.
- Old member rows of guests on public channels stay in the table. They open nothing now.

### `found-24-sep/guests-list-every-whiteboard` — **closed** (security, small; found closing `guests-read-every-open-space`)

**Whiteboards are listed and opened by any member of the workspace, a guest included**

*Evidence, read not run:* `CanvasesService.list(workspaceId, type)` reads every canvas of the workspace with no reader. The realtime gateway says a canvas's room "follows the canvas's own read rule, which is membership today".

*To close:* a guest reads a whiteboard shared with them, and nothing else. Research whether a member's access to a whiteboard follows its location in ClickUp.

*Measured on lane 1, before, wider than the evidence:* a guest listed, opened, renamed and deleted any whiteboard or mind map, made their own, and joined any board's realtime room. Both pages offered them "New".

*Closed, 24 September.* No share can name a canvas: a share names a space, folder, project, list, task, doc, channel, dashboard or view. So, as with goals, a guest has none. `CanvasesService` lists a guest none, finds them none by id, and refuses them making, changing or deleting one (403, "Guests have no whiteboards or mind maps"). The realtime gateway refuses them a canvas's room, as it now refuses them the workspace's. Both pages tell a guest that none is shared with them, in the four locales, and offer no "New board" or "New mind map".

The new suite `guest-canvas-scope`, 5 checks, planted by SQL and read back beside a member: the listing, open/rename/delete, making, the room, and both pages.

- Before, with the change stashed and lane 1's API and bundle rebuilt from it: 0 of 5.
- After: 5/5.

`gcv-1..8`, each compiled, at least one per check. Regression on lane 1, 14/14: `guest-canvas-scope`, `task-creation-access`, `ai-answer-rendering`, `comment-plus-menu`, `create-menu-ai`, `space-create-menu`, `task-depth`, `task-mentions`, `video1-fast-items`, `guest-chat-scope`, `chat-realtime-access`, `video1-acceptance`, `video-regression` and `ui-sweep`. In CI.

*The same commit, from the chat rule's first break run:* `tcm-6` (a guest makes tasks) stayed green because `task-creation-access` planted the guest's message in a workspace channel nobody had shared with them, so the new channel rule refused first. The suite shares that channel with its guest, to view.

*Not changed:* a member's access to a canvas is still membership. ClickUp files whiteboards in locations and reads them by the location's rule, and a canvas here has no location. That is a feature (location and sharing for canvases), not built.

### `found-24-sep/forms-open-across-workspaces` — **closed** (security, HIGH; found closing `create-menu-offers-guests-what-they-cannot-make`)

**A form by id was anybody's, through a workspace of their own; and a form filed tasks into lists its maker was refused**

*Evidence, measured on lane 1:*

- Every route of `WorkspaceFormsController` that names a form (read, update, duplicate, archive, delete, fields, submissions and their files, retry) took the id alone. `WorkspaceMemberGuard` checked membership of the workspace in the path, and the service acted on whatever form the id named. A user of another organisation, through a workspace of their own, read a form and the submissions strangers had typed into it, renamed it, gave it a field, copied it and archived it (200 and 201 on each).
- A field was changed or deleted by its own id, under any form. Its update spread the request body into the row, so a `formId` in the body moved it onto another form.
- A form's target list, and the lists a routing field offers, were never checked against the form's maker. A member refused a private list routed a public form into it, so every anonymous submission filed a task there. A guest, who may not make tasks, made forms and read their submissions.

*Closed, 24 September:*

- `FormInWorkspaceGuard` stands after the membership guard on the whole controller. A form must be the path workspace's, and a field its form's: not found otherwise, since whether another workspace's form exists is not the caller's to learn. A submission's routes (retry, its history, its files) already find it under its form, so the guard does not ask that twice.
- A guest has no form, since none can be shared with them. They are listed none and refused every other route.
- A form files tasks only where its maker could make one: `readableList` and the space's create gate, asked of the target list on create, update and duplicate, and of every list a routing field offers.
- A routing field is a dropdown or a multi-select, as the builder offers it, so an answer is always one of its options. The submission already checks a choice against them.
- A field update sets named columns only.

The new suite `form-access`, 6 checks, across two organisations. Every refusal is read back by SQL beside the same call succeeding for someone it is theirs to make.

- Before, on lane 1: 1 of 6. The one that passed is the submission's own check that an answer is one of the field's options.
- After: 6/6.

`fma-1..10`, each compiled, at least one per check. Regression on lane 1, 10/10: `form-access`, `task-provenance`, `space-create-menu`, `object-key-boundaries`, `request-access`, `space-default-permission`, `checklists`, `video-regression`, `ui-sweep` and `video1-acceptance`. In CI.

*Not changed, recorded:*

- The forms list names each form's target list, a private one included, to any member. ClickUp's forms are views of their list.
- A form keeps filing into its list after its maker loses access to it.
- An anonymous submitter may name a task's assignee by email (`assigneeEmail`).

Each is its own question.

### `found-24-sep/local-dates-expected-the-day-of-now` — **closed** (test tooling; a defect of mine, found by the full sweep)

**`local-dates` expected the meeting on Karachi's date of NOW, and failed every evening**

*Evidence:* the meeting is made at 10:00 UTC on today's UTC date, and the expected wall time was `${todayIn('Asia/Karachi')}T15:00`. From 19:00 UTC, Karachi is already on the next day, so the check said the card was a day out while the card was right (it showed 2026-09-24T15:00 for 2026-09-24T10:00Z, and expected 2026-09-25T15:00).

*Closed:* the expected day is the meeting instant's own day in the zone (`todayIn(ZONE, at)`). 3/3 at 20:40 UTC, the hour it failed.

### `found-24-sep/three-suites-fail-under-a-full-sweep` — **closed** (test tooling, small; found by the full sweep)

**`addressability-live`, `request-access` and `task-menu` failed during a four-lane full sweep and passed on their own**

*Evidence:*

- `addressability-live`: the palette showed no result for a word in a task's description, 2.5 fixed seconds after typing it.
- `request-access`: no request-access card on the locked-out task.
- `task-menu`: New tab, Convert to and Send email to task were missing from the menu.
- `video-regression`, 25 September, a four-lane sweep: [A1.2] no list reached from the space page, and [A2.3] no Ask AI row in search. It passed on its own, 93/93. Again the same day, in the sweep for `list-page-offers-refused-edits`: [A1.2] on lane 4, then 93/93 alone on lanes 4 and 2.
- `settings-role-grants`, 25 September, the sweep for `managers-grant-themselves-admin`: the integrations grant's tabs read as none before its grants had loaded. It passed alone (6/6).
- `panel-collapse` and `role-permissions-web`, 25 September, the sweep for `role-lists-copied-per-module`. `panel-collapse` listed no spaces to begin with (0), and `role-permissions-web` did not offer Save as template after the grant. Each passed alone (56/56, 5/5).
- `ai-activity-filters` and `a61-meeting-record` again, 25 September, the sweep for `ai-task-paths-skip-the-read-rule`, with the same failures on other lanes (4 and 2). Each passed alone again (34/34, 25/25). The same two in two sweeps running is not chance: both read fixed waits.
- `ai-activity-filters` and `a61-meeting-record`, 25 September, the sweep for `guest-guard-reads-the-account-role`. `ai-activity-filters` listed no row under its Failed filter on the page, though the same filter's API read had found the row. `a61-meeting-record` kept offering Save after a save, and lost the recording's address. Each passed alone (34/34, 25/25). `a61-meeting-record` is here for the third time.
- `task-menu` and `task-depth`, 25 September, the sweep for `read-only-tasks-blocked-and-parented`: the menu's rows late, and the tag's removal. `task-depth` passed alone (91/91). `task-menu` passed on lane 3 (37/37), after once more missing Send email to task alone on lane 2 while lane 1's break runs held the machine.
- `request-access` and `space-default-permission`, 25 September, the sweep for `sharing-asks-the-maker-not-the-level`. `request-access` did not find its notification among the admin's latest 50 rows, which the other suites were filling. `space-default-permission` was refused a signup by the rate limit (429) before its first check. Each passed alone, 9/9 and 36/36.
- `task-depth` and `video1-acceptance`, 25 September, the four-lane sweep for `task-rows-changed-by-id-anywhere`. `task-depth`: "and pressing it takes the tag off" still listed the tag. `video1-acceptance`: the bookmark did not come back after a reload, and the assistant's answer had no way forward. Neither touches what that change did. Each passed on its own on lane 4 right after (91/91, 18/18). `video1-acceptance` failed the same way again in the next sweep (`field-values-written-by-readers`), and again passed alone (18/18).
- `a61-meeting-record`, `chat-message-actions`, `list-empty-states` and `addressability-live`, 25 September, the full sweep for `full-edit-enforced-nowhere` and its re-run. `a61-meeting-record` had no attendee chips, twice. `chat-message-actions` found no thread panel, and once no reaction. `list-empty-states` had a fetch that failed mid-run. `addressability-live` showed quick actions for a word no title held. Each passed on its own on lane 3 right after (25/25, 73/73, 23/23, 28/28). Two in both sweeps is no longer chance: they read fixed waits, like the rest here.
- `task-menu`, 25 September, the sweep for `inbound-email-comments-skip-the-comment-rule`, and once alone on lane 3 while lane 1's break runs held the machine (load 5): Copy ID, New tab, Convert to and Send email to task were not yet in the menu when it was read. It passed alone on lane 4 right after (37/37).
- `person-panel`, 25 September, the sweep for the time-approvals group: "shows their email" missed under load. It passed alone (59/59).
- `folder-dialog`, `settings-depth` and `addressability-live`, 28 September, the five-lane regression of `admin-guard-admits-managers-where-the-web-says-admin`. The folder's edit dialog did not open while the sidebar tree drew late (the same run's second attempt opened it). A note did not survive a reload. Landing on docs did not name the doc. Each passed on its own right after (28/28 for `addressability-live`).
- `list-export`, 25 September, twice: in the sweeps for `billing-open-to-managers-and-every-member` and for the data slice of `admin-guard-admits-managers-where-the-web-says-admin`. "In the table it asks for the custom fields the table shows" saw no request under load, both times. It passed alone both times (30/30).

Each passed alone right after, on this build (28/28, 9/9, 37/37). The failing checks read the page after fixed waits.

*To close:* make each wait for what it reads (the search's answer, the task's refusal, the menu's full render), not a fixed time, and prove it under a full sweep's load.

*Partly fixed, 28 September:* the 17 suites named here wait for what they read, each bounded so a check still fails with its own sentence when the thing never comes:

- `addressability-live`: the palette's answer for the typed word, not 2.5 fixed seconds twice.
- `request-access`: the card, drawn once the task's read has come back refused, not six fixed seconds; its notification by id rather than among the admin's latest 50.
- `task-menu`: each row read with the menu open (`aria-expanded`), opening it again if something shut it.
- `video-regression`: each hop's link on the page that draws it, not 3.5 seconds after landing; the Ask AI row once the search has answered.
- `panel-collapse`: the tree once it has drawn its search box and the spaces joined.
- `role-permissions-web`: Save as template counted once the member's keys have answered.
- `ai-activity-filters`: a filter's rows once the list has drawn its answer, rows or empty state.
- `a61-meeting-record`: the attendee chip, and the save's answer before Save is read again.
- `task-depth`: the badge's control on the reloaded sheet, then the task's labels until the tag has gone.
- `space-default-permission`: signs up through `signUpApi`, which waits out the rate limit (`Retry-After`) instead of dying on a 429.
- `video1-acceptance`: the reload after the bookmark's save has been answered; the assistant's way forward once its answer is drawn.
- `chat-message-actions`: the thread panel once `thread=` is in the address, and the reaction once drawn.
- `list-empty-states`: its own calls go straight to the API; the browser keeps the proxy.
- `person-panel`: the email once the person's profile has answered.
- `list-export`: the Download button on screen, and the request waited for from the press that makes it.
- `folder-dialog`: the edit dialog opened until the folder is drawn, not pressed once.
- `settings-depth`: the note asked of the server until it holds the words, before the reload.

The `fetch failed` in `list-empty-states`, `ai-answer-rendering` and `create-menu-ai` was the proxy's keep-alive, closed as `e2e-proxy-advertises-the-apis-keep-alive`. Each suite passed alone on lane 5, and a sweep of the 17 with `ai-answer-rendering` and `create-menu-ai` on lane 7 at `f8a799d` passed 19/19 (28/28, 9/9, 37/37, 93/93, 56/56, 5/5, 34/34, 25/25, 91/91, 36/36, 18/18, 73/73, 23/23, 59/59, 30/30, 29/29, 61/61, 51/51, 24/24).

*Closed, 29 September:* the same 19 under a four-lane sweep's load (lanes 1, 2, 3 and 7 at once on four cores, which is where they failed), with 30 more suites in the same sweep: 49/49 at `c55a088`. Each read the same numbers as alone.

The break runs for `c55a088` found one wait that had cost a check its bite: `role-permissions-web` counted Save as template two frames after the member's keys answered, and the sheet still showed its skeleton then, so `rpw-5` (the button offered to everybody) ran 0 failed. The absence is now counted once the sheet has drawn the task (its cover band); `rpw-5`'s run follows the commit.

*Break runs, 29 September* (lanes 1–4, at `0911c6e`, `394d3f9` and `d86220d`, every baseline green): in 16 of the 17 suites every patch reddens the check it names — `folder-dialog` 24 of 24, `space-default-permission` 22 of 22, `list-export` 10 of 10, `ai-activity-filters` 10 of 10, `role-permissions-web` 9 of 9 (`rpw-5` among them, at `d86220d`: the wait above gave it its bite back), `addressability-live`, `panel-collapse`, `person-panel`, `task-menu`, `task-depth`, `video-regression`, `request-access`, `a61-meeting-record`, `settings-depth` and `chat-message-actions` 4 of 4 each, `video1-acceptance` 1 of 1.

`list-empty-states` was not measured: its baseline was red under the four runners' load (22 of 23 at `394d3f9`). The empty state read "No tasks yet" without its Create task, which the page draws once the list's access (`list-caps`) has answered, and under load that answer comes after the rows. Alone on lane 7 it passed 23/23 three times. It now waits (10 s at most) for the invitation before reading it, so a patch that takes the invitation away still fails the check; its set runs after the commit.

*29 September, at a load average near 20 (three agents' suites, two break runners and a regression at once on four cores):* three more reads that waited a fixed time, each found by a break set's red baseline. `list-empty-states` read its second empty state before the list's access had answered (the same race as its first read, fixed earlier today); `task-depth` read the tag's create offer, the save and the badge after 0.5, 2.5 and 0.8 fixed seconds; `video-regression` [A2.6b] reloaded 1.6 s after a toggle, before the choice was stored, and read the old grouping. Each now waits for what it reads, bounded: the invitation, the offer, the task's labels, the badge, the stored preference and then the rows. Alone on lane 7 afterwards: 23/23, 91/91, 94/94. `video-regression` [A2.6] (Clear all after mark-all-read) missed its 20 s bound once at the same load and passed on the re-run; it already waits for the control. Two more, in the four-lane sweep of the suite-hygiene merge the same day: `panel-collapse` read the dock 1.8 s after switching a tool off, and `ui-sweep` §14 pressed Saturday 2 s after the page opened and read it 1.6 s later (and pressed it back the same way, which could have left the shared week at six days). Each now waits for the stored choice and the drawn state; alone afterwards, 57/57 and 107/107.

### `found-24-sep/create-menu-offers-guests-what-they-cannot-make` — **closed** (visible bug; found closing `custom-role-permissions-unread-by-web`)

**The Create menu offers a guest Task, which is always a 403, and a workspace Doc, also a 403**

*Evidence, measured on lane 2 (the same probe):* a guest's Create menu offers task, doc, reminder, whiteboard, dashboard, form and list (`role-permissions-web`'s own output). What the API answers a guest for each:

- task: 403, "Guests cannot create tasks", whatever is shared with them;
- a doc of no space: 403;
- a doc in a space granted to them at edit: 201;
- a whiteboard: 201;
- a list: 201 at the time. That was the item above, now closed: a list needs a grant of edit.

Reminder, dashboard and form answered 400 to the probe's thin bodies, so they are unmeasured.

*To close:* settle the guest rule above first. Then offer a guest only what they may make: a task never, as the rule stands (ClickUp lets a guest make tasks where they have edit, which is `found-24-sep/task-edits-narrower-than-clickup`'s question), and a doc only into a space granted to them. Measure each type.

*Measured again once the guest rules above had closed, lane 1:* the Create menu offered a guest task, doc, reminder, whiteboard, dashboard, form and list. A space's "+" offered the same, plus Imports and Templates, on a space the guest only passes through (a list in it shared with them to view). The List form's space picker named that space. A project's page there offered "Add list", and so did an empty project's own empty state. The API refused each of them: a task (403), a doc of the workspace (403; the Doc form makes no other), a whiteboard and a form (403, since `guests-list-every-whiteboard` and `forms-open-across-workspaces`), and a list where they pass through (403).

*Closed, 24 September:*

- Each create type says what a guest may do with it (`guests`, `create-types.ts`). A reminder, yes: it is their own. A list, only in a space shared with them to edit. Everything else, never: a task, a doc, a whiteboard, a dashboard, a form, and the containers the permission keys already withhold.
- One hook, `useCreatable`, answers the Create menu, a space's "+", the List form's space picker and a project's "Add list" (the header's and the empty state's). The spaces a guest may add to are the Move picker's own answer (`move-targets`: the spaces the API lets them write, by the same resolver), under the same query key, so the menus cannot disagree with the API or with each other.
- A space's "+" does not offer a guest Imports or Templates; both make tasks.
- A refused "Add list" on a project's page said nothing: the card sat there with its button looking un-pressed. It says why now, as the List form does.

The new suite `guest-create-menu`, 6 checks. A guest first passes through one space and may add to none, then is given another space to edit. Each menu is read beside a member's, each read of the guest's waits for the answer about their spaces, and the API is asked the same things the menus answer.

- Before, on lane 1 (HEAD's bundle): 1 of 6. The one that passed is the API's own.
- After: 6/6.

`gcm-1..11`, each compiled, at least one per check: the hook's guest branch, the task and reminder rows, a list in any space and with no space, Imports and Templates, the picker, the project page's two buttons, the question never asked, and the API's guest default. `form-1`, `form-2`, `rpw-1`, `rpw-2`, `rpw-3`, `rpw-7` and `sidebar-sections-8` were re-aimed at the new rows and hook. Regression on lane 1, 28/28: `guest-create-menu`, `role-permissions-web`, `space-create-menu`, `create-menu-ai`, `folder-create`, `folder-dialog`, `sidebar-sections`, `space-wizard`, `space-wizard-views`, `list-name-taken`, `attach-on-create`, `comment-plus-menu`, `create-ai-results`, `custom-field-progress`, `custom-field-types`, `home-reminders`, `task-depth`, `time-estimate`, `ai-create-containers`, `guest-space-level`, `guest-read-scope`, `guest-chat-scope`, `guest-canvas-scope`, `form-access`, `clickapps-plan-gating`, `ui-sweep`, `video-regression` and `video1-acceptance`. In CI.

*Break run, lane 1 (bbf19f2):* `gcm-1..11`, 11 of 11 reddened. `form-1`, `form-2`, `rpw-1`, `rpw-3` and `sidebar-sections-8` reddened. `rpw-2` and `rpw-7` stayed green: each dropped the `space.create` key, and `guests: 'no'` now withholds Space and Folder from the same people, because custom roles only add keys and every tier but a guest's holds `space.create`. Both now drop the two; re-run on lane 1 (0eea3b9), both reddened.

*Not changed, recorded:*

- A guest given edit on a folder or a project, rather than its space, may make a list there (the create gate reads their share on the way, `within`), but no menu offers it: the menus read grants on spaces. That offers less than the API allows, not more.
- A member is offered the same things on a view-only space's "+", and refused each of them. Recorded as `found-24-sep/view-only-space-offers-members-what-it-refuses`, below.
- The API still makes a guest a dashboard (a preset of their own; no route asks the role). The menus no longer offer one, as ClickUp offers guests none.
- A project's page still offers a guest Statuses, Members and Suggest tasks, where they only pass through. Recorded as `found-24-sep/project-page-offers-guests-its-managers-buttons`, below.

### `found-24-sep/patches-that-measured-nothing` — **closed** (test tooling; found judging the second and third drifted plans)

**Six break patches stayed green or never built, each for its own reason**

*Evidence, from the plans' own records:*

- `sti-7-redirect-to-nowhere` (stable-images): green twice. It sent the picture's redirect to `${url}-gone`, which only lengthens the signature's value. The lanes' storage stub answers a key whatever its signature says, so the picture still loaded.
- `sti-8-logos-not-served` (stable-images): BUILD FAILED twice. It dropped `'workspace-logos/'` from the `as const` tuple, which narrowed the tuple's type, and the workspace service's typed call no longer compiled.
- `search-sources-4-the-notice-names-no-way-out`: BUILD FAILED twice. The palette's Connect button has since been wrapped in a condition, and deleting the button alone left an empty `&& ( )`.
- `mtg-2-list-of-any-workspace` (meeting-access): green twice. A meeting keeps its own check that the list is its workspace's, so the list rule's workspace, which the patch removed, is the second of two there.
- `ars-3-any-project-by-id` (ai-read-access): green. The member had one candidate project, so a private project's name leaking into the plan had nothing to reorder, and the answer was the same as naming none. The positive twin passed for a reason of its own: naming the open project removes it from the candidates.
- `plr-16-the-prompts-stop-at-the-project` (private-list-reach): green in plan 3, on a lane with no model. Its header said in prose that only a model's prompts can show the leak. The runner reads a model need from one line (`# Reddens only where a model answers`, `patches_needing_model`), which this patch lacked, so no model was started for it.

*Closed, 24 September:*

- `sti-7` damages the object's path instead, which the stub answers 404 for.
- `sti-8` refuses logos at the serving route, which compiles.
- `search-sources-4` fails the condition.
- `mtg-2` is now `fma-11`, claiming a new `form-access` check: a form made in another organisation's workspace and aimed at this workspace's list is not found, made or changed, and a form aimed at their own list is made. There, the list rule's workspace is the only defence, because the space's create gate has no level to read for someone who is not a member of the space's workspace and lets them through.
- `ai-read-access` gains a second open project named like nothing there, so a leaked name keeps only the project it matches.
- `plr-16` carries the line the runner reads. It was the only patch that described a model need in prose and lacked the line; `wra-11` and `wra-12` have it.

Each patch compiles. On lane 1: `form-access` 7/7 and `ai-read-access` 5/5 on the current build.

*Break run, lane 1 (bbf19f2):* `sti-7`, `sti-8`, `search-sources-4`, `fma-11` and `plr-16` reddened (`plr-16` on a lane its marker started a model on). `ars-3` stayed green again. The second project had no task, and the plan's basis names only projects that have tasks, so the answers were the same with or without it. It has one now (unassigned; the overview totals become 3 and 12). `ai-read-access` is 5/5, and `ars-3`, re-run on lane 1 (0eea3b9), reddened.

*Recorded:* the create gate passing non-members (`assertSpaceLevel` returns when `resolveSpaceLevel` has no membership to read) is deliberate, so that a super-admin and internal callers pass. It makes every caller's own workspace check load-bearing. That is a hardening question, not a defect today.

### `found-24-sep/personal-calendar-connect-needs-integrations-manage` — **closed** (behaviour, medium; found reading `custom-role-permissions-unread-by-web`)

**A member cannot connect their own calendar: the planner's Connect asks for the workspace's integration key**

*Evidence, read not run:* the planner's calendar connect (onboarding and the Accounts page) posts `…/integrations/connections/{gcal|outlook}/oauth/start`, which requires `integrations.manage`, an admin's key unless a custom role grants it. Its buttons gate only on whether the provider is configured, so a member is offered Connect and refused. The callback records the grant as the connecting person's own account (`user_calendar_accounts`, §V2-14: a person manages their OWN accounts), and also as the workspace's connection. ClickUp separates the two: workspace connections are the admins', and a member connects a personal account when their role allows Personal Integrations.

*To close:* measure a member's connect. Then decide, with ClickUp's model, whether a calendar is a personal connection (asked of the person, not of `integrations.manage`) and what the workspace row then means.

*Measured, lane 5, on HEAD:* a member's calendar connect is the workspace's `oauth/start`, and they were answered 403. Pressing "Add account" (a server routed to have the keys) left them on the Accounts page with "Missing permission". The admin's connect from the planner was the workspace's grant: its state carried no mark of whose calendar it was, and its callback wrote the workspace's calendar connection, which the task push and pull run on. A grant that failed was written onto the App Center's Google Calendar card, and the person was sent to the App Center.

ClickUp (help centre, search snippets): the Google Calendar and Outlook Calendar integrations are private — "No one else in your Workspace can access your Google Calendar through this integration" — and "Guests and limited members can use" them. Only personal connections are supported for Google Calendar. The admin approval ClickUp names is the provider's (a Google or Microsoft admin approving the scopes), not a workspace role.

*Closed, 25 September:*

- **A person connects their own calendar**: `POST /workspaces/:id/calendar-sync/connect/:provider`, asked of membership (guests included), for Google Calendar and Outlook only. Its grant carries `personal` in its signed state.
- **A personal grant's callback writes the person's account and nothing of the workspace's**: not the connection row the task push and pull run on, which stays the admin's, from the App Center. The account is written as the result, not best-effort. The audit log records `calendar_account.connected`, without the account's address.
- **It lands on the planner's Accounts page**, which lists the new calendar. A personal grant that fails lands there too, and the page says why (`calendarError` on the address, gone when the dialog closes). It is no longer written onto the workspace's card.
- **The planner's connects use it**: the onboarding panel and "Add account" (`useCalendarConnect`). The App Center's Google Calendar and Outlook tiles are still the workspace's grant, `integrations.manage`.

`planner-gates`, `planner-onboarding` and `meetings-connect-calendar` route or stub the connect; they route the personal one now.

The new suite `personal-calendar-connect`, 6 checks: a member's and a guest's grant (the state they are handed, read and not followed); the workspace's connection, asked by the member and the admin; somebody outside the workspace; a grant whose code the provider refuses, personal and the workspace's, with the card read back by SQL; and in the browser, the member's "Add account" to the provider's page, and the failure said on the Accounts page. The unit test `integration-connections.personal.test.ts` holds which rows each grant writes; a code exchange cannot succeed here.

- Before (HEAD's API and bundle, lane 5): 1 of 6. The one that passed is the workspace's connection, which holds the change to its edge and passes both ways. On `080102d`'s bundle, the browser check failed the same way: the member's "Add account" was refused and went nowhere.
- After: 6/6.

`pcc-1..9`, each compiled. `pcc-3` (the callback takes a personal grant for the workspace's) and `pcc-7` (any provider "for oneself") are unit claims, and each fails the unit test it names. `mcc-5` re-aimed at the close that clears the reason too. Regression on lanes 2 to 5: `personal-calendar-connect`, `meetings-connect-calendar`, `planner-gates`, `planner-onboarding`, `calendar-accounts`, `app-catalogue`, `credential-reads`, `integration-error-card`, `permission-guards`, `search-sources`, `settings-role-grants`, `planner-settings`, `planner-upcoming-meeting`, `planner-rail`, `planner-views`, `webhook-access`, `addressability-live`, `no-dead-ends`, `ui-sweep` and `video1-acceptance`, 20/20 in the sweep; `video-regression` failed two checks in the sweep ([A1.2] no list reached from the space page, [A2.3] no Ask AI row in search) and passed on its own, 93/93 (`found-24-sep/three-suites-fail-under-a-full-sweep`). In CI (177).

*Break run, lane 1 (4ce717b):* `pcc-1`, `-2`, `-4`, `-5`, `-6`, `-8` and `-9`, 7 of 7 reddened, on a green baseline (6/6). `pcc-3` and `pcc-7` fail the unit test they name.

*Found beside it, not changed:* `found-25-sep/oauth-start-answers-for-no-application` and `found-25-sep/ledger-ids-cited-unchecked`, below.

### `found-25-sep/oauth-start-answers-for-no-application` — **closed** (behaviour, small; found closing `personal-calendar-connect-needs-integrations-manage`)

**A grant's start answers a consent address whatever the server's keys: with no client id, one for no application**

*Evidence, measured on lane 5:* `POST …/integrations/connections/gcal/oauth/start` on a server with no Google keys answered 201 with `https://accounts.google.com/o/oauth2/v2/auth?client_id=&…`. Google answers that with an error page. `getOAuthStartUrl` builds the address from `getProviderConfig` and never asks `getMissingProviderEnv`, which `providers/status` does. The web asks `providers/status` before it offers a button (`ledger-rows/defect-planner-connect-empty-consent`), so no button reaches it, but the API does not refuse it either.

*To close:* the start refuses (400, "not set up on this server") where `providers/status` says the provider is unavailable. The suites that read a grant's state on a server with no keys (`personal-calendar-connect`, `app-catalogue`'s scope checks) then need a lane with keys that are not real.

*Measured, lane 5, on `14c789f`* (the suite below, 1 of 2): a start for each of the five providers the lane holds no keys for (GitLab, Linear, Salesforce, Dropbox, Zoom) answered 201 with `client_id=` empty.

*Closed, 25 September:*
- **The start refuses a provider this server holds no keys for** (400), asking what `providers/status` asks. The refusal says the provider is not configured, names the missing configuration, and answers no consent address. `calendar-accounts`' Zoom check already accepted that answer.
- **The lanes and CI hold keys that are not real for Google, Microsoft and GitHub** (`lane_oauth_env` in `lane-env.sh`, called by all four launchers; the same six on CI's API step). These are the providers whose starts the suites read. Each provider refuses them at the code exchange, which is the failure path those suites already follow. Sign-in reads other names, so no sign-in button appears. The rest stay keyless, so the refusal is measured on the same lanes.
- **Two suites said "this server has no calendar keys" and read the server's own status for it.** `planner-gates` and `meetings-connect-calendar` now route that answer, as they already routed the twin that can connect. Whether the server's status and its start agree is the new suite's to measure.
- **The unit tests** of a personal grant run with Google keys for their duration. A new unit test states the refusal.

The new suite `oauth-start-readiness`, 2 checks. Each provider is judged by what `providers/status` says of it:
- every provider it calls unavailable is refused, saying why, with no address;
- every provider it calls available answers an address with a client id and a signed state.

Results:
- Before (lane 5, `14c789f`): 1 of 2.
- After: 2/2, on lanes 5 and 4.

Patches `osr-1..4`, each compiled:
- the start asks for no keys;
- the refusal says nothing of why;
- every provider is refused;
- `osr-4`, which claims the unit test: the start asks for no keys.

*Break run* (lane 1, on `d277fd5`): `osr-1..3` reddened, and `osr-4` reddens its unit test. The restated suites' sets did too: `pgt-1..4`, and all eleven `mcc` patches.

Regression on lanes 2 to 5: the 21 suites that start grants, read provider status, or draw the App Center, the planner's connects and the walkthroughs, and the new suite. Result: 22/22.
- `planner-gates` and `meetings-connect-calendar` failed first: they read the lane's keys as "cannot connect". Restated as above, they passed (3/3, 5/5).
- `video-regression` missed [A2.3] and [A1.2] under load, as recorded before, and passed alone (93/93).

In CI (198).

### `found-25-sep/lane-scripts-read-as-they-run` — **closed** (test tooling, small; found closing `oauth-start-answers-for-no-application`)

**A lane script edited while it runs breaks the run in flight**

*Measured, 25 September:* `wt-break.sh` was edited in place, one line added, while the break chain ran on lane 1. Bash reads a script by offset as it goes, so the two sets that started around the edit read shifted lines. `share-levels` and `other-task-rules` each stopped at "syntax error near unexpected token `('", at the baseline line, before any patch. Both are queued again.

*To close:*
- Wrap each long-running lane script's body in a function called on its last line, so bash parses the whole script before running any of it: `wt-break.sh`, `sweep.sh`, `verify.sh`, the fleet scripts and the set runner.
- Add a preflight check that they stay shaped that way.
- Until then, change a script that may be running by writing a new file over it, never in place.

*Closed, 25 September:*
- **Every script the lanes execute keeps its body in one brace group ending in `exit`.** That is thirteen of them, `wt-break.sh`, `sweep.sh`, `verify.sh` and the fleet scripts among them. Bash parses a group whole before running any of it, and nothing after it is ever read. Each was written as a new file and moved over the old, so a run in flight kept its own copy.
- **Exempt, by name:** `lane-env.sh` and `rounds.sh`, which are libraries that are sourced and never run, and `batch.sh`, one `exec` line.
- **The gate.** `scripts/check-lane-scripts-whole.mjs` fails on a lane script whose code does not open with `{` and end with `exit` and `}`. It also fails on a directory with no scripts. It reads 16 scripts.
- **Its cases.** `check-lane-scripts-whole-cases.mjs` first measures the premise: a line inserted in place while a script sleeps breaks the plain script's run, and the wrapped one finishes as written. It then plants six directories for the gate. `--mutate` breaks the gate six ways, and every mutation reddens a case (7 cases).
- **Both run in the preflight and in CI.**

Measured with the wrapped scripts:
- `verify.sh` and `sweep.sh` ran suites as before (2/2, and a two-lane sweep 2/2).
- The next break set, `space-default-permission`'s, was the first started from the wrapped `wt-break.sh`.
- `build-api.sh`, `refresh-dists.sh` and the fleet scripts are run by the next build.

### `found-25-sep/claims-confirmed-by-a-fragment` — **closed** (test tooling, medium; found reading `gcm-11`'s run)

**A claim whose check has changed still reads as verified, and as reddened, on a five-word fragment**

*Measured, 25 September:* `gcm-11` claimed `guest-create-menu`'s check 6 as it read before `guests-with-full-edit-make-no-tasks` restated it. The old sentence is in no suite. Yet `check-break-claims` counted the claim verified, and the reddened checker would count the run a reddening: both ask `findsClaim` (`scripts/lib/claim-match.mjs`), which accepts any five consecutive words of a claim found in the text. "the API makes the guest what the menus offer" is eight. The run had reddened the restated check, which is the patch's intent, so the verdict was right and the claim was stale. Only an exact reading of the report showed it. The matcher's own comment names this limit ("a fragment long enough not to appear by accident is not the same as a fragment that pins the meaning").

An exact scan of every suite's latest report counted 305 of 990 claims not found word for word among their own section's FAIL lines. It does not normalise as `norm` does (quotes, dashes, interpolated values), so that number is an upper bound, not a count of stale claims.

*To close:*
- For a claim with no interpolation in its check, require the whole normalised sentence: in `check-break-claims`, and in the reddened checker against FAIL lines. Keep the fragment rule only where the suite's sentence is a template.
- Then re-aim what that finds.

*Measured, 28 September (all 2,002 quoted claims of every patch against its suite's source, with continuation markers stripped):*
- **The five-word rule** confirms all but 1.
- **The claim as a substring of the suite's normalised text:** 1,943 match exactly and 54 fully match a template sentence. Only 4 are confirmed by a fragment alone:
  - `ac-3`, "laid out as two rows of four", where the check says "and lays the eight tiles out…";
  - `list-customize-4`, whose claim writes `\u2019` where the suite has the apostrophe itself;
  - `app-catalogue-5` and `-6`, which do match their template.
- **Whole-sentence equality** (the claim equals one of the suite's string literals, or fully matches one of its template literals, a template with at least 16 literal characters): 392 fail. These are patches that quote a clause of a longer check sentence ("each opening its OWN tab of that list"), or a label the page shows ("Find Blockers").

That is the size of the re-aim this item asks for.

*Progress, 28 September:* 241 claims in 209 patches were re-aimed mechanically. A clause found in exactly one of its suite's literal sentences is rewritten to that whole sentence. Only headers changed, and a header is a comment, so no measurement moves:
- `check-break-claims` still verifies every claim;
- `check-break-patches` still applies the same patches;
- `check-break-reddened` reads 746 reddened before and after.

84 are left for reading: 74 that no single sentence holds, and 10 fragments of template sentences under five words. The gate itself (whole sentences only) comes with them.

*Closed, 28 September.* The 84 were re-aimed by reading, headers only. Some of the mechanical rewrites were wrong, and the tokenizer below found them. The old regex scanner lost its place in suites with an unbalanced backtick or apostrophe in a comment. So 45 of the committed rewrites (8e398c1) had replaced a clause with a run of code. They were restored and re-aimed.

- **`sentencesOf` (`scripts/lib/claim-match.mjs`)** is a small tokenizer now:
  - it skips comments and regex literals;
  - it reads string and template literals;
  - it joins a sentence built with `+`;
  - it keeps a template's source form too.
- **`claimedWhole`** accepts only:
  - a whole literal sentence;
  - a template sentence matched with its values, where the template has at least 16 literal characters;
  - a template quoted in its source form;
  - five or more words of a template sentence, whose values cannot be quoted in advance.
- **`check-break-claims`** asks `claimedWhole`: 1,785 verified, 7 in another suite, 0 not found.
- **`check-break-reddened`** counts a claimed sentence missing from the passes only when it is one of the suite's whole sentences. Many suites print only the failure's detail on a FAIL line, so "not among the passes" is how most reddenings are read, and it is evidence only for a sentence the suite still says. 0 unproven.
- **`check-claim-match.mjs`:** 31 assertions (a clause of a literal sentence refused, `+` joined, a comment's lone backtick harmless, template values and source form accepted, four template words refused). 13 of 13 mutations bite.

### `found-25-sep/ledger-ids-cited-unchecked` — **closed** (test tooling, small; found closing `personal-calendar-connect-needs-integrations-manage`)

**A ledger id cited in the code is never checked against the ledger**

*Evidence, measured:* I cited `found-25-sep/meetings-upcoming-reads-no-calendar` in `workspace-meetings-page.tsx` and in `meetings-connect-calendar`, and named the ledger item `found-25-sep/connected-calendars-read-by-nothing`. Nothing noticed, and it was committed in `080102d`; it is corrected in the next commit. Across `apps/`, `test/`, `scripts/`, `deploy/` and `packages/`, 74 distinct ids are cited. That one named no ledger item, and one more is a citation wrapped over two comment lines (`found-23-sep/clip-library-lists-the-` / `oldest-200`).

*To close:* a gate, in preflight and CI, that reads every id cited in the code against the ledger's headings, joining a citation wrapped at a hyphen. Show that it catches a misnamed id.

*Closed, 28 September:* `scripts/check-ledger-ids.mjs` reads every id cited under `apps/`, `test/`, `scripts/`, `deploy/`, `packages/` and `.github/` and fails on one that is no heading of this ledger. It joins a citation wrapped at a hyphen over two comment lines before reading it. A path running through a section name (`test/harness/…`) is not a citation, and `node_modules` and `dist` are not read. A ledger with no headings, or a tree citing nothing, fails rather than passes.
- On this tree: ok, 101 ids cited, all among the 293 headings. The wrapped `clip-library-lists-the-` / `oldest-200` joins and passes.
- On `080102d`'s tree: it fails, naming `found-25-sep/meetings-upcoming-reads-no-calendar` at `workspace-meetings-page.tsx:217` and `meetings-connect-calendar.mjs:17`. That is the miss this item was found by.
- `check-ledger-ids-cases.mjs`: 9 cases; `--mutate` 8 of 8 bite.
- Both are in preflight and CI.

### `found-24-sep/meetings-connect-calendar-goes-to-settings` — **closed** (visible bug, small; found reading `custom-role-permissions-unread-by-web`)

**"Connect Calendar" on the Meetings page opens Settings → Integrations, which connects no calendar**

*Evidence, read not run:* `workspace-meetings-page.tsx` links the empty "Upcoming" state to `settings?tab=integrations`. That tab holds webhooks, Slack, the importer and data export. Calendars connect in the planner's Accounts page, a tab of the planner's settings dialog, which has no address. A member is sent back to `/app` by the settings route.

*To close:* give the Accounts page an address, aim the link there, and read where it lands.

*Measured, lane 5, on HEAD's bundle:* the admin's "Connect Calendar" landed on Settings → Integrations, and a member's on `/app`. `/calendar?settings=accounts` opened nothing. A member with a calendar connected was still offered Connect Calendar, beside "Connect a calendar and your meetings will show up here". The Accounts page's own "+ Add account" was a link to the same Settings tab (`found-25-sep/add-account-goes-to-settings`, below), so the way to a calendar stopped one page later even with the link aimed right.

ClickUp (help centre, search snippets): the AI Notetaker needs the Planner connected to Google or Outlook, and a calendar connects from the Planner's calendar settings. Video 1's row: the Connect Calendar prompt shows "when no calendar is connected".

*Closed, 25 September:*

- **The planner settings dialog's pages have an address**, `/calendar?settings=<page>`. One list of the pages (`lib/planner-settings-pages.ts`) serves the dialog's nav and the route, and the route takes only a page on it. Arriving on the address opens the dialog on that page; closing the dialog takes it off the address.
- **"Connect Calendar" goes to `/calendar?settings=accounts`**, for the admin and a member alike. It is offered to whoever has no calendar connected, once their accounts have answered. One read of a person's accounts (`calendarAccountsQuery`) serves the Accounts page, the onboarding panel and the Meetings page.
- **The empty "Upcoming" says "Nothing scheduled."** (four locales). Its promise that a connected calendar's meetings would show up there was untrue: nothing reads a calendar into this list (`found-25-sep/connected-calendars-read-by-nothing`, under the unbuilt features).
- **"Add account" connects a calendar.** There is a button per calendar, greyed out with the reason where the server has no keys, and it runs the onboarding panel's own connect (`useCalendarConnect`, one hook for both).
- `deploy/verify-ui.mjs` took "Connect Calendar or meetings" as the block's contents. It reads the empty sentence now, and checks the door against the person's accounts and where it leads.

The new suite `meetings-connect-calendar`, 5 checks: the admin and a member follow Connect Calendar; the address, after a reload, closed, and naming no page; the empty "Upcoming" with no calendar and with one (planted by SQL); "Add account" on this server, which has no calendar keys, and on one routed to have them.

- Before (HEAD's bundle, lane 5): 0 of 5. The first four were measured before the fifth was added, and failed the same way again with it.
- After: 5/5.

`mcc-1..11`, each compiled. `planner-settings-1` re-aimed at the page list, which the nav is drawn from; `pgt-4` and `planner-onboarding-1` re-aimed at the connect hook. Regression on lanes 2 to 5, 33/33: `meetings-connect-calendar`, `calendar-accounts`, every planner suite (`planner-appearance-toggles`, `planner-blocks`, `planner-command-bar`, `planner-default-list`, `planner-gates`, `planner-grid`, `planner-onboarding`, `planner-prefix`, `planner-priorities`, `planner-rail`, `planner-settings`, `planner-upcoming-meeting`, `planner-views`), `focus-pill`, `tab-title-countdown`, `team-schedules`, `a61-meeting-record`, `meeting-access`, `meeting-tags`, `local-dates`, `assign-to-priorities`, `object-key-boundaries`, `syncup-live`, `addressability-live`, `workspace-read-access`, `private-list-reach`, `no-dead-ends`, `ui-sweep`, `video-regression`, `video1-acceptance` and `video1-fast-items`. In CI (176).

*Not changed, recorded:* a member's connect is refused, since `oauth/start` asks `integrations.manage`: `found-24-sep/personal-calendar-connect-needs-integrations-manage`.

*Break run, lane 1 (080102d):* `mcc-1..4` and `-6..11`, 10 of 10 reddened, on a green baseline (5/5). `mcc-5`, re-aimed within the day, on `4ce717b`, reddened too. The re-aimed `planner-settings-1`, `pgt-4` and `planner-onboarding-1`, 3 of 3.

### `found-25-sep/add-account-goes-to-settings` — **closed** (dead control, small; found closing `meetings-connect-calendar-goes-to-settings`)

**The planner Accounts page's "+ Add account" was a link to Settings → Integrations**

*Evidence, read and measured:* `planner-accounts-page.tsx` drew "+ Add account" as `<a href="/app/:ws/settings?tab=integrations">`. Its comment said the Integrations tab "is where the OAuth grant is done". That tab holds webhooks, Slack, the importer and the export, and connects no calendar. A member is sent back to `/app` by the settings route. The onboarding panel's comment said its connect was "the SAME `oauth/start` the App Center and the Accounts page use"; the Accounts page used none. `calendar-accounts` checked that "Add account" was on the page, and not where it led.

*Closed with it:* see above. "Add account" is a button per calendar running `useCalendarConnect`. Check 5 of `meetings-connect-calendar`; `mcc-9..11`.

### `found-25-sep/statuses-written-by-readers` — **closed** (security, medium; found probing `project-page-offers-guests-its-managers-buttons`)

**Anybody who may read a space, a project or a list may create, rename, delete and reorder its statuses**

*Evidence, measured on lane 5:* a guest with one list shared with them to view passes through its project. They were answered 201 creating a status on that project, and the row was made. The three status controllers (`spaces/:id/statuses`, `projects/:id/statuses`, `lists/:id/statuses`, `scoped-statuses.controller.ts` and `list-statuses.controller.ts`) are guarded by `ResourceMemberGuard` alone, which asks whether the caller may READ the container. Their services take no actor. Deleting a status reassigns every task in it, so a reader can change other people's tasks. The same reader rename of the project was 404, and changing its visibility was 403.

*To close:* research who manages statuses in ClickUp. Then ask of every status write the rule that already guards the container's own settings. Measure a guest, a member of a view-only space and a member who may edit, each refusal read back by SQL beside its positive twin.

*Measured in full, lane 5, on HEAD's API:* the guest passing through the project made a status (201), renamed the admin's (200) and DELETED it (200; the row is gone). A member of a view-only space made statuses on it, its project and its list (201 each), and switched the list onto its project's statuses (200). A guest given a list to edit made a status on it.

ClickUp (help centre, search snippets): owners, admins and members create, edit and delete statuses by default, because a location's default permission is Full edit. Guests do so only where an advanced permission allows it (Business Plus and Enterprise).

*Closed, 25 September:* every status write, and a list's choice of whose statuses it uses, is guarded by `StatusShapeGuard` after the read guard. The guard asks `assertMayShapeStatuses` (`common/permissions/status-access.ts`):

- the space's level must reach `edit`, the create gate's rung and a space's default, so a member of an ordinary space manages statuses as before, and a view-only or comment-only space refuses them;
- a guest is refused whatever is shared with them (403, "Guests do not change statuses").

The routes: space, project and list statuses (create, rename, delete, reorder) and `PATCH /lists/:id/status-scope`. The services take no actor and stay as they were.

The new suite `status-write-access`, 4 checks, every refusal read back by SQL beside the same write for somebody it is theirs to make. The four cases: a guest passing through a project; a member of a view-only space on its space, project and list; a guest given a list and then a whole space to edit, where only the guest rule refuses; and a list's status scope.

- Before (HEAD's API): 0 of 4.
- After: 4/4.

`swa-1..7`, each compiled, one per rule and route; break run on lane 1 (f9be035), 7 of 7 reddened. Regression on lane 5, 22/22: `status-write-access`, `list-statuses-seeded`, `task-header-status`, `task-space-levels`, `space-presets`, `list-customize`, `list-empty-states`, `list-card-cover`, `list-assignee-filter`, `folder-dialog`, `ai-create-containers`, `paywall-sites`, `teams-person-cards`, `space-default-permission`, `guest-space-level`, `guest-read-scope`, `guest-create-menu`, `task-creation-access`, `permission-guards`, `ui-sweep`, `video-regression` and `video1-acceptance`. In CI.

*Left for the web:* a view-only member or a guest is still shown the status manager, and every change there is now refused. That is `found-24-sep/project-page-offers-guests-its-managers-buttons`, next.

### `found-25-sep/dock-empties-after-the-first-page` — **closed** (visible bug, small; found closing `custom-role-permissions-unread-by-web`)

**A person's dock loses its default tools as soon as they visit any page**

*Evidence, read, and seen once:* in `settings-role-grants`, a member who had never opened the dock picker had no tool in their dock after a few pages. The web keeps the default set (`DEFAULT_DOCK_TOOLS`) for "never chosen", which it reads as `pinnedLinks` being absent. But the first write of anything else to the dock row creates the row with `pinned_links = []`, and the sidebar records recents on navigation. The column is `NOT NULL DEFAULT '[]'` and the insert writes `patch.pinnedLinks ?? []`, so "never arranged" becomes "arranged to hold nothing". The same service already keeps that difference for `navFavorites` and `navRecents`, which stay null until arranged.

*To close:* measure it (a new member, one page, the dock). Then let `pinned_links` hold null for "never arranged": a migration dropping the NOT NULL and the default, and the insert leaving it null when absent. Read it back in the browser.

*Measured, lane 5, on HEAD:* a new member's dock carried no tool after three pages, with `[]` stored. Ticking one tool (Goals) left Goals alone, not the defaults plus Goals. Clearing the choice (`pinnedLinks: null`) stored `[]`, so there was no way back to the defaults.

*Closed, 25 September:* `pinned_links` holds null for "never arranged", and an array for a choice, even an empty one. This is the three states `navFavorites` and `navRecents` already had.

- Migration 0163 drops the NOT NULL and the default, and turns the `[]` rows into null. Nothing tells the bug's rows from a dock emptied on purpose; the second is one untick away from being made again, and the first had no way back.
- The insert leaves the column null when absent, and an update takes null as "clear".
- The web already read null as the default tools.
- 0163 was applied by hand to the pristine database and lanes 1 to 10. It adds no column or table, so the restart witness walks past it.

The new suite `dock-defaults`, 3 checks: a new member's dock after three pages (on screen, and the row by SQL); the picker's first tick; an empty choice held, and a cleared one back to the defaults.

- Before: 0 of 3.
- After: 3/3.

`dkd-1..3`, each compiled: the insert, the clear, and the web reading an empty choice as none. Regression on lane 5, 12/12: `dock-defaults`, `panel-collapse`, `settings-role-grants`, `sidebar-sections`, `guest-create-menu`, `role-permissions-web`, `video1-fast-items`, `addressability-live`, `no-dead-ends`, `ui-sweep`, `video-regression` and `video1-acceptance`. In CI.

*Break run, lane 1 (685ab9d):* `dkd-1..3`, 3 of 3 reddened, on a green baseline (3/3).

### `found-24-sep/view-only-space-offers-members-what-it-refuses` — **closed** (visible bug, small; found closing `create-menu-offers-guests-what-they-cannot-make`)

**A view-only space's "+" offers a member a list, a task, a folder and the rest, and the API refuses each**

*Evidence, read not run:* `useCreatable` asks a space only for a guest. A member's answer is the permission keys alone. The API's create gate (`assertCanCreateInSpace`) needs edit on the space, and a space whose default is view or comment gives a member neither. The Move picker already answers which spaces a member may write (`move-targets`); the menus do not ask it for a member.

*To close:* measure a member's menus on a view-only space. Then have `useCreatable` ask every person's writable spaces for the types a space holds (task, list, folder, project, form). ClickUp's own rule for a view-only location is to research first: whether it hides "+" or offers only what the level allows.

*Measured, lane 5, on HEAD's bundle:* a member's "+" on a view-only space offered task, form, list and folder. Folder was there because a member's tier holds `space.create`. The Task, List, Folder and Form creators each named the view-only space among their spaces. The API refused a list and a task there (403, none made).

ClickUp (help centre, search snippets): in a view-only location the create entry leads to a "Request edit access" modal, not to a thing made. Rundesk has no request for a space's access, so the menus withhold what the space refuses, as they do a guest's.

*Closed, 25 September:*

- `GET /spaces/workspace/:id/writable` returns the ids of the spaces this person may add to: the create gate's own answer, the Move picker's resolver without its folders, projects and lists.
- `useCreatable` asks it for everyone. A type that goes in a space (`scopedToSpace`: task, form, list, folder, project) is offered on a space's "+" only where that space answers yes, and in the Create menu only when some space does. Until the answer arrives, a member is offered what they were before (a menu opened at once still has its tasks), and a guest nothing that goes in a space.
- The Task, Folder, Project and Form creators' space pickers ask the same question as the List form's (`createTypeOf`).

The new suite `view-only-space-menus`, 3 checks: a member's "+" on a view-only space and on an open one, beside the admin's; the four creators' pickers; and the API.

- Before: 1 of 3 (the API).
- After: 3/3.

`vsm-1..6`, each compiled: the hook, the endpoint, and each picker. `gcm-1`, `gcm-4`, `gcm-5` and `gcm-10` re-aimed at the rewritten hook. Regression on lane 5, 29/29: `view-only-space-menus`, `guest-create-menu`, `attach-on-create`, `comment-plus-menu`, `create-ai-results`, `create-menu-ai`, `custom-field-progress`, `custom-field-types`, `folder-create`, `folder-dialog`, `home-reminders`, `list-name-taken`, `role-permissions-web`, `sidebar-sections`, `space-create-menu`, `space-wizard-views`, `space-wizard`, `task-depth`, `time-estimate`, `video1-fast-items`, `ai-create-containers`, `project-page-controls`, `space-default-permission`, `form-access`, `clickapps-plan-gating`, `no-dead-ends`, `ui-sweep`, `video-regression` and `video1-acceptance`. In CI.

*Break run, lane 1 (6979047):* `vsm-1..6`, 6 of 6 reddened, on a green baseline (3/3). The re-aimed `gcm-1`, `-4`, `-5` and `-10`, 4 of 4, on a green baseline (6/6).

### `found-24-sep/project-page-offers-guests-its-managers-buttons` — **closed** (visible bug, small; found closing `create-menu-offers-guests-what-they-cannot-make`)

**A project's page offers a guest who only passes through Statuses, Members and Suggest tasks**

*Evidence, read not run:* the header draws all three for anyone who can open the page. A guest reaches a project's page when a list in it is shared with them. Each of the three writes to the project or its tasks, and whether the API refuses each is unmeasured.

*To close:* measure what the API answers a guest for each, then offer each only where it is answered.

*Measured, lane 5:* it was wider than the guest. A member who did not make the project was offered Edit project, Archive project, Rename and Delete on the admin's list, and the Members sheet's add, role and remove controls, as was the guest passing through, who was also offered Statuses and Suggest tasks. Each route refused them: renaming the project 403, the admin's list 403, adding a member 403 (the member's own list 200); a status 403 for the guest since `statuses-written-by-readers`; suggestions 403. The first probe had measured nothing on two of these: it used PATCH, and the routes are PUT, and a member role of `member`, which `assertRole` refuses as 400 before any permission is asked.

ClickUp (help centre, search snippets): a view-only person or a guest cannot rename, delete or change a location's settings, and Edit (below Full edit) may not delete one.

*Closed, 25 September:* the page asks the API what this person may do there. `GET /projects/:id/capabilities?lists=…` returns `edit`, `archive`, `members`, `statuses` and `suggest`, and each list's `rename` and `delete`. Each answer comes from the rule its own route asks: the container manage rule for manage and for delete, `assertCanManageProject`, `assertMayShapeStatuses`, and not a guest for the AI. The page draws Statuses, Suggest tasks, the project's menu items and each list's menu items only where the answer is yes, and nothing on a guess before it has answered. The Members sheet takes `canManage`: without it, it lists who has access and the visibility, and offers no add, role, remove or visibility change.

The new suite `project-page-controls`, 4 checks: the admin (every control), a member who made one list and not the project, a guest passing through, and what each route answers.

- Before (HEAD's API and bundle): 2 of 4 (the admin and the routes).
- After: 4/4.

`ppc-1..10`, each compiled: the answers (six) and the page's use of them (four); break run on lane 1 (09c87d5), 10 of 10 reddened. Regression on lane 5, 22/22: `project-page-controls`, `guest-create-menu`, `ai-create-containers`, `custom-field-progress`, `task-depth`, `team-schedules`, `planner-command-bar`, `planner-grid`, `planner-onboarding`, `hook-portal-access`, `space-default-permission`, `private-folder-reach`, `private-list-reach`, `read-visibility`, `workspace-role-controls`, `request-access`, `status-write-access`, `role-permissions-web`, `no-dead-ends`, `ui-sweep`, `video-regression` and `video1-acceptance`. In CI.

*Not changed, recorded:* the space's Members sheet still offers its changes to everybody (the default `canManage`), and the project page's time, invoice and client-portal sections have their own controls, unmeasured here.

### `found-24-sep/restart-witness-blind-to-new-tables` — **closed** (test tooling; found adding migration 0162)

**A lane restart proved a database current by the newest migration that adds a column, so a migration that creates a table was never checked**

*Evidence, read not run:* `fleet-restart.sh` walks back to the newest migration with `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, and checks the lane has that column. 0162 creates `outbound_email_messages` and adds no column, so the check stayed on 0160's `folders.description`. A lane without the new table would have been started, and 500'd on its first write to it. The patterns matched `[a-z_]+` too, so a table or column with a digit in its name could never be a witness.

*Closed:* `newest_schema_witness` (lane-env.sh) names the newest migration that adds a column OR creates a table, walking past data-only ones. `fleet-restart.sh` checks a table's existence when that is the witness. The patterns take digits. The new `check-schema-witness.sh` holds four cases (a table, a column past a data-only migration, nothing, and the script's wiring) and catches 4 of 4 mutations. In preflight and CI. 0162 was applied by hand to the pristine database and lanes 1 to 4.

### `found-25-sep/search-reach-test-passes-without-the-reach` — **closed** (test tooling, small; found by preflight's unit claims)

**Search's unit test for a task hit's reach passed with the reach taken out**

*Evidence, measured:* preflight's unit-claims step, 25 September: `sst-2` (the Meili task hits lose `taskInReachFilter`) left `search.service.test.ts` green, 26 of 27 claims reddening. Every preflight before the guest read rule had it red. The test found the reach in the wrong places. It asked for `"tasks"."list_id" in` anywhere in the task query, and the guest rule's clause in `taskVisibilityFilter` says that too. It asked every lists query the search built for the three visibility rules, and the comment search builds a reach of its own. With the task hits' reach gone, both were still there.

*Closed:* the test reads the reach from the task query's own subqueries. The fake database keeps each query's predicates on the query (a subquery reaches the outer query as a parameter), so the assertion asks what THAT query was built with. The clean tree passes, 47/47. With `sst-2` applied, "no reach on the task hits"; with `sst-3` (the reach without the list's rule), "the reach has no list rule". `check-unit-claims`: 27 of 27 redden.

### `suite-hygiene/branch-checker-confident-zero` — **closed** (test tooling, medium)

**check-suite-check-branches reports 0 because it cannot see bad(), uncounted SKIPs, or unequal branches**

*Evidence:* The checker printed '0 conditional check block(s) with no else, in 0 of 115 suite(s) read.' It has three blind spots. First, CHECK_CALL = /\b(chk|check)\s*\(/ at line 79 never matches bad(…)/ok(…) (a39-dm-tabs:178, ui-sweep:421/461, video-regression:325/328/693/713, list-view-controls:239, list-empty-states:357) or a console.log SKIP (video-regression:465). Second, line 160 only asks whether an `else` exists, never whether both sides report the same count, so every imbalance in finding unbalanced-else-branches passes. Third, its header (187-191: 'ZERO NOW, ACROSS ALL 113 SUITES') and the ledger (docs/video2-reaudit.md:4008-4011: 'Every one of the 113 suites now reports the same number of checks whichever way it goes') are false, and the suite count is now 115.

*To close:* Count reporting calls per branch: chk, check, ok, bad, skip, .step (1 each), with .rest/.skipRest treated as 'fills to declared length'. Flag if/else pairs whose counts differ, and flag loops with literal bounds. Add fixture cases to check-branches-cases.mjs for a bad()-only else and a 9-vs-8 else. Then correct ledger lines 4008-4011.

*Closed, 29 September.* `check-suite-check-branches.mjs` counts each side of an `if` instead of asking whether an
`else` exists. It reads code with comments, strings, regexes and template text blanked (a file whose brackets then
do not balance is refused by name); counts `chk`, `check`, and `ok`/`bad`/`skip` where the suite defines them to
report, a chain's `.step` one each, `.rest`/`.skipRest` filling to the chain's declared length from where the flow
got to, loops by a literal bound, and a suite's own reporting functions by their bodies; and reports four findings
under one ratchet: an `if` with no `else` that reports, an `if`/`else` whose sides differ (a chain that a later
`.rest()` fills is left out — `syncup-live`'s `bgChain`), a loop re-typing a count, and a check inside a `.catch`.
Before, on `d5ef040`: the old rule read "0 … in 0 of 242 suite(s)"; the new one read **23 findings in 11 of 242**
over the same tree (19 unequal pairs of 126, 3 literal loops, 1 `.catch`). After: **0, over 124 pairs.** 238 of 242
suites walk to exactly their `EXPECTED_CHECKS`. `check-branches-cases.mjs`: 39 cases, the ledger's `bad()`-only
else and 9-vs-8 else among them; 23 of 23 mutations redden one; 25 of the 39 fail against the old rule.
`BRANCHES_TRACE=<suite>.mjs` prints every pair it compared. The header's "ZERO NOW, ACROSS ALL 113 SUITES" and the
re-audit's "Every one of the 113 suites now reports the same number of checks whichever way it goes" are corrected
where they stand. *Not done:* a `switch`, a check on either side of `?:` or behind `&&` is not read — no suite
reports that way today — and conditions are not tracked, so a `.rest()` able to run after an `if` is assumed to
complete its chain on every path.

### `commit-log/log-68c0345-1` — **closed** (test tooling, medium)

**Search indexing cannot be measured on any lane because none runs Meilisearch**

*Evidence:* Commit 68c0345: 'Indexing is unmeasurable in this environment, so it is RECORDED as unmeasurable'. doc-import.mjs:252-267 says so. There is no 'meili' anywhere in scripts/e2e-lanes. This is the same kind of reason that storage and the model both shed this week by getting a stub.

*To close:* Give the lanes a search stub or a real Meilisearch the way s3-stub and model-stub work. Then aim doc-import-2 at indexing again and check indexDocInSearch across docs, tasks and the rest.

*Closed, 29 September.* `scripts/e2e-lanes/meili-stub.mjs` is an in-memory Meilisearch speaking the subset `SearchService` uses:
- index create and get, settings, documents added and deleted by id and by filter, tasks, and search with `attr = "value"`/`OR` filters, sort, limit and offset;
- an unknown index is a 404, a filter form the service does not build is a 400, and the master key is enforced;
- `POST /__control/away` drops every product request unanswered, as a Meilisearch that has stopped does, until it is asked back or reset.

`check-meili-stub.mjs --mutate` drives the real service and the real client against it: 30 cases, 35 of 35 mutations caught. It runs in preflight and CI, on a port the OS chose, through the mutant runner (`scripts/lib/run-mutant.mjs`).

A lane that `RUNDESK_LANE_SEARCH` names gets the stub on 93k and an API started against it, and is reported up only once that API has connected. `check-model-lanes.sh` holds the wiring (14 of 14 search mutations). A break patch headed `# Reddens only where Meilisearch answers` gets a searching lane from the runner.

`doc-import` asks which engine answers and asserts the index's half or the database's, 16 checks either way. `search-index` does the same for a task made, edited, given a file, put in the Trash and archived, and for a workspace rebuild; its section 6 holds what a hit is held to. `guest-read-scope` and `search-read-access` plant rows by SQL, which nothing indexes, so each rebuilds its workspace's index after planting (nothing where Postgres answers).

Measuring with the stub found four defects in the product, each an item of its own and closed with this one: `found-29-sep/meili-file-hits-skip-the-read-rule`, `found-29-sep/meili-finds-deleted-docs`, `found-29-sep/meili-gone-after-boot-fails-every-search` and `found-29-sep/files-of-binned-tasks-found`. The measurements are there.

Regression, after the fix: every suite that searches (24, `search-index` and `doc-import` among them) on lane 5, where the stub answers, and on lane 6, where Postgres does. 24 of 24 green on each, every run its full count (477 checks a lane). `guest-read-scope` and `search-read-access`, which failed on a search lane before they rebuilt their index, are green on both.
Break verdicts at `6a31a5f`, through `wt-break.sh`, which gave the lanes the stub from the patches' headers: `search-index-1..6` 8, 11, 8, 11, 11 and 11 of 12, against 12/12; `doc-import-5` 14/16 and `doc-import-1..4` 15, 15, 14 and 15 of 16, against 16/16. `guest-read-scope` (`grs-1..15`) and `search-read-access` (`sra-1..11`), which now rebuild their index, measured again on a lane without the stub: every patch reddens, against 12/12 and 4/4.

### `found-29-sep/meili-file-hits-skip-the-read-rule` — **closed** (security, small; found measuring `commit-log/log-68c0345-1` with the new search stub)

**Where Meilisearch answers, a member refused a private space finds the files on its tasks by name**

*Evidence, 29 September:* measured on lane 3 with the search stub. A member of the workspace, refused a private space, opened its task and was refused (403); their search withheld the task, its list and the space, and returned the file attached to the task. `dropUnsearchableTaskHits` held doc and task hits to the read rules; file hits "pass through untouched". On Postgres, `searchTaskAttachments` holds a file to its task's container and private-item rules, and the same search withheld it.

*Closed, 29 September:* a file hit is held to its task's rules, as the database's file search is: the task's reach and privacy, the bin, and the workspace. One query over the attachments joined to their task, list, project and space; a hit whose row is gone is dropped.
- Measured with `search-index` section 6 on lane 5, where the stub answers: before, the member's search found the file (8/12 in all); after, it does not while the admin's does (12/12).
- Unit: "holds a file hit to its task’s reach, privacy and bin, and drops one the database does not return" (47/51 before, 51/51 after). Patches `sst-4` (unit) and `search-index-7` (suite).
- Break verdict at `6a31a5f`, on a lane the runner gave the stub: `search-index-7` 10/12, reddening the refused space's file and the binned task's file, against a 12/12 baseline.

### `found-29-sep/meili-finds-deleted-docs` — **closed** (visible bug, small; found measuring `commit-log/log-68c0345-1`)

**Where Meilisearch answers, a deleted doc is still found**

*Evidence, 29 September:* measured on lane 3 with the search stub. After `DELETE /docs/:id`, which archives the doc, a plain search still returned `doc-<id>`. Nothing removes a doc from the index, and a doc hit was held to the doc rule alone, and for non-managers only; the archived rule never. On Postgres the same search withheld it.

*Closed, 29 September:* a doc hit is held to the archived rule, for managers too, as a task hit is, and dropped when its doc is gone; the doc rule still applies to everyone else. The read is the authority, so nothing has to remember to take a doc out of the index.
- Measured on lane 5: before, the deleted doc was found; after, it is found before its delete and not after (`search-index` section 6).
- Unit: "holds a doc hit to the archived rule, a manager’s too, and drops one the database does not return". Patches `sst-5` and `search-index-8`. `sst-1` is re-aimed onto the new doc rule.
- Break verdict at `6a31a5f`: `search-index-8` 11/12, against a 12/12 baseline with the stub.

### `found-29-sep/meili-gone-after-boot-fails-every-search` — **closed** (visible bug, small; found measuring `commit-log/log-68c0345-1`)

**A Meilisearch that stops after the API started makes every plain search a 500**

*Evidence, 29 September:* measured on lane 3. With the lane's stub stopped under the running API, a plain search answered 500 "Internal server error", while a task-filtered search, which takes the Postgres path, answered 200. Only a failed init fell back to Postgres; the search itself had no fallback.

*Closed, 29 September:* the Meilisearch half of a search is caught; the search is answered from Postgres, a warning is logged, and the next search asks Meilisearch again.
- Measured on lane 5 with the stub sent away under the running API: before, 500; after, 200 with the task found, and the API's log says "Meilisearch search failed, answered from Postgres: fetch failed".
- Unit: "answers from Postgres when Meilisearch fails after boot". Patches `sst-6` and `search-index-9`.
- Break verdict at `6a31a5f`: `search-index-9` 11/12, against a 12/12 baseline with the stub.

### `found-29-sep/files-of-binned-tasks-found` — **closed** (visible bug, small; found reading the search stub's notes, measured on lane 1)

**Search withholds an archived or binned task and still finds the file on it**

*Evidence, 29 September:* measured on lane 1, where Postgres answers. A task with a file; once the task was archived (`DELETE /tasks/:id`), and on another task once it was put in the Trash, a search no longer found the task and still found its file. `searchTaskAttachments` asked nothing of the task's archived flag. The index drops such a file at a rebuild (`reindexWorkspace` reads live tasks), so the two engines disagreed as well. In ClickUp, "any files that are attached to the task will also be archived", and a search finds archived items only when its Archived filter, or the setting to always include them, asks for them (help centre, "Archive a task").

*Closed, 29 September:* a file goes where its task goes. Both engines withhold the file of an archived or binned task unless archived work is asked for.
- Measured: before, lane 6 (Postgres) 11/12 and lane 5 (index) 8/12 with this check red on both; after, 12/12 on both.
- Unit: "withholds the file of an archived or binned task unless archived work is asked for". Patches `sst-7` and `search-index-10`, which takes both engines' rule out and so reddens on either.
- Break verdict at `6a31a5f`: `search-index-10` 11/12 on the stub lane. The Postgres half's run comes with the next set on a lane without the stub.

### `commit-log/log-ad00a7c-1` — **closed** (test tooling, medium; the same work as `harness/model-lane-routing-unbuilt`)

**The model stub is wired but off by default, and nothing routes each suite to a lane with or without a model**

*Evidence:* Commits ad00a7c ('still the open piece') and b5a52bc ('the next piece and is not done') record this. lane-env.sh:131-132 still says: 'Wiring that choice into the dispatcher is the next piece of this work and is NOT done.' run-plan.sh:50-74 gives any set to whichever lane is free and never considers the model. Consequences: create-menu-ai and task-ai-bar can only run where no lane has a model. Only ai-create-containers and ai-answer-rendering have been converted. No sweep exercises any AI happy path through the real API with a model, because no lane has one by default (4cb50d3: 'the rewrite is the next piece of work').

*To close:* Give the plan a per-suite requirement: model, no-model, or either. Have run-plan.sh and sweep-until-clean.sh start a mixed fleet (for example RUNDESK_LANE_MODEL='3 4') and send each set to a matching lane. Then write model-lane checks and break patches for the AI surfaces that today are measured only by their refusal.

*Partly fixed, 24 September:* a break set whose patch needs a model now gets one, and the runner's stamp re-syncs a lane whose model differs from what the set asked for. See `harness/model-lane-routing-unbuilt`, which records what is left: routing by suite.

*Closed, 29 September,* with `harness/model-lane-routing-unbuilt`: suites declare their lane need, `verify.sh` asks the running API and refuses a mismatch, and the break runner takes the model away from a no-model suite's lane.

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

### `commit-log/log-8ac33d9-1` — **closed**

**A bare lane number means a count in fleet-up.sh, which drops databases, but a single lane in the other scripts**

*Evidence:* Commit 8ac33d9 fixed fleet-restart, so '9' means lane nine (fleet-restart.sh:5, 38-47). RUNDESK_LANE_MODEL=9 also means lane nine (lane-env.sh:147). fleet-up.sh:12 and :29-30 still read '9' as lanes 1 to 9, and that script drops and restores every lane in the range (its own header at :16-18 calls this a mistake you get to make once).

*To close:* Make fleet-up.sh take lists only, as fleet-restart.sh now does (a count must be spelled with seq), so one spelling means one thing everywhere.

*Closed:* one reading for a lane argument, `lane_list` (lane-env.sh): "3" is lane three, "9 10" is lanes nine and ten, and anything but a lane from 1 to 10 is refused with exit 2. `fleet-up.sh` and `fleet-restart.sh` both read their lanes through it; `fleet-restart.sh` had its own copy of the rule. Found closing it: `sweep-until-clean.sh` heals its down lanes with `fleet-up.sh "${down[*]}"`. With one lane down, say 3, that was a count: lanes 1 to 3 dropped and restored, including lane 1. The README's `fleet-up.sh 4` is `fleet-up.sh "1 2 3 4"`. The new `check-lane-lists.sh` holds the readings and the two scripts' wiring, and catches 5 of 5 mutations. Against the scripts before the change it failed on every one. In preflight and CI.

### `commit-log/log-a5b6b69-1` — partly-fixed, small

**The long CI e2e job is still not split, and the suite count in its comment is stale**

*Evidence:* Commit a5b6b69 raised the limit to 180 and deferred the split to 'whoever has a working pipeline'. ci.yml:393-396 says 'ONE HUNDRED AND SEVEN', but the job now has 109 `node test/e2e/` steps (about 120 minutes at 1.1 minutes each, under the 180 limit at :428). A leftover paragraph at :421-423 still argues for 120.

*To close:* When CI can run again (1 October), split the job and validate it. Until then, correct the count and delete the leftover paragraph.

*Partly fixed, 24 September:* the count is kept with each suite added (160 in the long job, `grep` over it agrees). The leftover paragraph arguing for 120 is gone, as is a second copy of the paragraph on splitting. The limit is 210. The split waits for a working pipeline.

### `commit-log/log-c592545-1` — **closed**

**doc-import.mjs is the one e2e suite not registered in CI, and nothing checks for that**

*Closed:* the same item as `harness/ci-missing-doc-import` above, closed there.

*Evidence:* Commits f634982 and c592545 ran it green (15 of 15, 4 of 4 patches) and closed the Importers row. A loop over test/e2e/*.mjs against ci.yml finds exactly one suite missing: doc-import.mjs. No script compares the two lists (git grep over scripts and .github finds no guard for unregistered suites). The resume doc says 'ALL 113 are registered'.

*To close:* Add doc-import.mjs to postgres-harnesses. Add a checker, run in preflight and CI, that fails when a suite file has no ci.yml step.

### `commit-log/log-d840b55-1` — **closed** (already fixed; this row was not updated)

**sweep.sh and drain.sh still run copies of scripts from /tmp instead of the committed ones**

*Evidence:* Commit d840b55 deleted break-queue.sh because 'the copy without the guard is the one that would eventually be used by mistake'. Commit 4a43a1d fixed batch.sh calling a verifier in /tmp. sweep.sh:14 still runs `bash /tmp/claude-0/verify.sh`, which skips the committed verify.sh and its stale-build refusals. drain.sh runs /tmp/claude-0/wt-break.sh, reads patches from /tmp/claude-0/breaks, and carries a hard-coded queue from 21 September. docs/video2-resume.md:185 and :285 still tell the next session to use drain.sh.

*To close:* Delete drain.sh and sweep.sh, or point them at scripts/e2e-lanes/*.sh and test/e2e/breaks. Update the resume doc to name run-plan.sh and sweep-until-clean.sh.

*Closed, found already done on 24 September:* `scripts/e2e-lanes/sweep.sh` runs the committed `verify.sh` (`bash "$HERE/verify.sh"`, since `5985ce7`), and its header records the old `/tmp` call as history. `drain.sh` is in no committed directory; a copy remains only in `/tmp` on this machine. `video2-resume.md` names `run-plan.sh` and `never-run-plan.mjs`, and mentions `drain.sh` only as deleted on 23 September.

### `commit-log/log-d92d58f-1` — **closed** (test tooling, small)

**Nothing stops two builds writing the same per-lane web bundle at once**

*Evidence:* Commit d92d58f: 'verify.sh refuses a stale bundle and nothing refuses two writers to the same one'. grep for lock or flock in verify.sh and refresh-dists.sh finds only the stale-build notes (verify.sh:115, 125).

*To close:* Take a lock per lane around the vite build and the run, in the style of the wt<lane>.lock that wt-break.sh uses.

*Closed, 29 September.* Nothing held a lane's bundle: `verify.sh` refused a stale one, and two `refresh-dists.sh` for the same lane, or one started while a suite was reading it, emptied the directory under the other (`--emptyOutDir`). Now each lane's bundle has one writer or any number of readers (`dist_lock_*`, lane-env.sh): `verify.sh` holds it shared from before its staleness check to the end of the run (the suite inherits the descriptor), and `refresh-dists.sh` takes it exclusive for each build. A build waits for the runs reading the bundle, a run waits for a build writing it, and a second build of a lane waits for the first; 20 minutes without the lock is a refusal (`verify.sh` exit 6, as for a stale bundle). It is a `flock`, so the kernel lets go when a holder dies, and nothing is left held after a kill.
- `scripts/e2e-lanes/bundle-lock-selfcheck.sh --mutate` (preflight, and CI's verify job — no lane, no build): three orderings on a stand-in bundle, each read from the order its steps write to a log (a build started under a run, a second build under a first, a run started under a build); with helpers that take nothing, which is the state before, all three fail.
- Demonstrated on lane 2: a `refresh-dists.sh` building for 23.6 s, and a `verify.sh` asked 4 s in; the suite's log was written at 24.1 s, after the build, and the run passed on the fresh bundle. The lock is taken before `verify.sh` looks for `index.html`, because a build empties the directory when it starts writing, and a run asked then would otherwise fall back to the shared bundle without it.

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

### `harness/wt-break-double-vite-build` — **closed** (small)

**wt-break.sh builds the web bundle twice on every restore**

*Evidence:* wt-break.sh:497 and :498 are identical `pnpm -C apps/web exec vite build > /dev/null 2>&1` lines. git blame shows :497 came from f449365, which added the explanatory comment block (:488-496) above the pre-existing :498 from 95b4d67 without removing it. Every set pays one extra vite build.

*To close:* Delete one of the two lines.

*Closed, 28 September:* the restore builds the bundle once, and that build is checked now (below).

### `harness/wt-break-unchecked-restart-and-restore` — **closed** (small)

**wt-break.sh ignores restart failures and the restore/sync build and push steps**

*Evidence:* restart() returns 1 when the lane API never answers health (wt-break.sh:121-125). Its return value is ignored at :431, before each API patch's suite run, and also at :261 and :499. A lane that failed to come up for environmental reasons (for example 'too many clients', verify.sh:20-22) then runs the suite against a dead port. Every check fails, and check-break-reddened.mjs:473-479 credits the claim as REDDENED. The sync-block schema push at :243-245 is unchecked, while the per-patch push at :411-415 is checked. The restore steps at :484-487 (push, API tsc) are unchecked, which leaves the lane on the last patch's binary if tsc dies. A same-sha next set then skips the sync block at :236, so nothing rebuilds the API before its baseline.

*To close:* `restart || { echo "== $b API DID NOT COME UP" >> "$OUT"; continue; }`, and add that suffix to the non-measurement list in measuredAt. Check the sync push and the restore tsc, and on failure refuse with exit 4 the way the builds do.

*Closed, 28 September:* the line numbers above had moved, and the three gaps were as described.
- **The sync block's schema push** is checked: `== SCHEMA PUSH FAILED`, exit 4.
- **A patch's restart** is checked. If the API does not come up, the patch is recorded as `== <patch> API DID NOT COME UP on <port> — not measured` and the suite does not run. The lane stays dirty, so the next patch rebuilds and restarts it. `NOT_RUN` (`scripts/lib/log-tree.mjs`), `classify-break-log.awk` (UNBUILT) and `check-break-freshness.mjs` count that line as a patch that never ran. `check-log-tree.mjs` gained the case: 48 cases, 15 of 15 mutations bite.
- **The restore** checks the push, the API build, the one bundle build and the restart. On any failure it writes `== RESTORE FAILED: …`, leaves the stamp unwritten (so the next run syncs) and exits 4 instead of printing DONE.
- `bash -n` passes and `check-lane-scripts-whole` still reads it whole. The set runs of 28 September went through the new restore; the failure branches are verified by reading only.
- **The full preflight found what the single gates had not.** `check-model-lanes.sh`'s mutation 5 was anchored on the restore's old last line, `restart && echo "$SERVING" > "$STAMP"`, so after 8e398c1 it changed nothing and the step failed. It is re-aimed onto the stamp line itself: 5 of 5 caught.

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

### `found-23-sep/role-editor-offers-unenforced-permissions` — **closed** (large; found reading the custom-role item)

**Seventeen of the 26 permissions the role editor offers are checked nowhere: granting one changes nothing**

*Evidence:* `permission-catalog.ts` lists 26 permissions and `roles-tab.tsx:154` offers every one of them from `/roles/catalog`. The server checks a permission in two ways — `@RequirePermissions` through `PermissionsGuard`, and `CustomRolesService.hasPermission`, which nothing outside `custom-roles` calls — and 9 keys appear in either (space.create, project.create, template.manage, webhook.manage, integrations.manage, integrations.access_requests.manage, sso.manage, workspace.billing, report.view.basic; two of them also in services). The other 17 appear nowhere outside the catalog: workspace.manage, workspace.delete, workspace.audit.view, members.invite, members.remove, members.role.change, roles.manage, security.policy.manage, space.delete, project.delete, list.delete, task.delete.any, doc.publish, doc.delete.any, automation.manage, report.export, time.approval.manage. What actually gates those actions is a role: 90 uses of `WorkspaceAdminGuard`/`@Roles`, and inline lists such as `invitations.controller.ts:40` (`['workspace_admin', 'manager']` for members.invite), `time-entries.service.ts:163` (approvals), `tasks.service.ts:658,764,2141,5114`, and `spaces.service.ts:520` (`adminOnlyDelete: true`, "space.delete not in MANAGER_DELTA"). So a custom role granting a member `space.delete`, `members.invite` or `time.approval.manage` is saved, shown and ignored — the facade class, in the permission system itself. Under-granting only: no role can gain more than its base role this way.

*To close:* make each permission the real gate for the actions it names — replace the role test at each site with `hasPermission(workspace, user, key)`, which by construction gives every base role exactly what it has today (the cascade) and honours custom grants; or take the key out of the editor until it is. Research ClickUp's custom-role permission list for the names and scope. A suite per group, each check paired: the base role unchanged, a member with the grant allowed, without it refused.

*Partly fixed, 25 September: the members group.* Mapping the gates showed something the evidence above missed. `WorkspaceAdminGuard` admits managers (it asks `isManagerRole`), so the "role test" in front of most of these keys let managers through the API, while the web offered the controls to admins only. On the members group that was a privilege escalation, closed as `found-25-sep/managers-grant-themselves-admin` below. `members.invite`, `members.role.change`, `members.remove` and `roles.manage` are the real gates now.

*Partly fixed, 25 September: the second group, the admin-only keys.* Measured on lane 5 (`7a9ff90`), a manager did all of the following, where the catalog and the web give each to admins; `admin-only-keys` was 0 of 4:
- renamed and archived the workspace;
- read and exported the audit log;
- changed the security policy and made an API key;
- made an automation.

A member granted each key by a custom role was refused every one of these. Each route now asks its key through `PermissionsGuard`:
- `workspace.manage`: rename, logo, domain, archive and restore;
- `workspace.audit.view`: the audit log and its export;
- `security.policy.manage`: security settings, and making, revoking and deleting API keys;
- `automation.manage`: making, changing and deleting automations.

The security module reaches the guard through a `forwardRef`, since the custom-roles module imports it in turn.

The automations page had offered New automation, Use, the toggle and Delete to everybody. It offers them by `automation.manage` now, and still lists every rule to every member.

`admin-only-keys`, 5 checks, the page among them:
- Before: 0 of 4 on lane 5; the page check was added after, and `aok-5` restores the ungated page.
- After: 5/5 on lanes 5 and 4.
- Patches `aok-1..6`: each reddened the check it names (lane 1, baseline 5/5 at `0b2db8e`).
- Regression: the 20 suites that touch these routes, and the new one, 21/21.
- In CI (200).

`workspace.delete` has no route, since the only "delete" is the archive, which the catalog files under `workspace.manage`. So the key still gates nothing.

*Partly fixed, 25 September: the third group, time approvals.* Measured on lane 5 (`0b2db8e`), the three rules disagreed as mapped:
- A manager approved a timesheet (201). The approvals page asked `canModerateApprovals`, which said admins only, so it showed that manager a read-only page with only their own sheets.
- A member granted `time.approval.manage` by a custom role was refused approving and sending back (403, "Workspace admin or manager role required"). Nobody told them a timesheet awaited approval.
- The "awaiting approval" notice went to managers and admins by their role.

Measuring it also found that an approver could approve the timesheet of someone outside the workspace (201, with a row written for that person).

ClickUp (help centre "Timesheet approvals", from search snippets; the page is not reachable from here): an owner or admin sets approvals up and names each submitter's approvers. Approvers see the timesheets they review, and approve them or send them back. The "All timesheets" tab is the owner's and the admins'.

Now:
- Approving and sending back ask `time.approval.manage` through `PermissionsGuard`.
- The approvals list asks the same key (`mayApprove`). An approver is shown every member's timesheets; anyone else sees their own.
- An entry on a task the approver may not open is shown by its hours, without its project or its note. The key can be granted to a member who is refused a private list.
- The notice goes to the key's holders (`CustomRolesService.holdersOf`), custom grants included.
- Only a member's timesheet is approved (404 otherwise).
- The Time page's everyone-views stay the admins' (`seesEveryonesTime`), as ClickUp's "All timesheets" is. Those are the team week, the monthly rollup, and anybody's entries.
- The API says which rule applies (`canModerate`, `seesEveryone`), and the monthly "all members" label follows the second.
- The approvals page no longer says only admins approve; it names the permission.

`time-approval-rule`, 9 checks:
- Before: 1 of 9 against the old API (lane 1, at `0b2db8e`). The one that passed pins the everyone-views, which the fix leaves as they were. On lane 5, with the old page as well, the page check read "only workspace admins can approve".
- After: 9/9 on lanes 5 and 4.
- Patches `tar-1..10`: each reddened the check it names (lane 1, baseline 9/9 at `9588fa0`). `tar-8`, re-aimed onto `timeReach` by `time-page-answers-whose-hours-twice`, reddened it again at `818f919` (lane 3, 28 September).
- Regression: the 15 suites that touch time, roles, permissions or notices, and the new one. 15 of 16 passed in the sweep; `person-panel` missed "shows their email" under the sweep's load and passed alone (59/59).
- API unit tests 1652/1652, web 305/305.
- In CI (201).

Measuring this also found `found-25-sep/time-page-answers-whose-hours-twice` below.

*Partly fixed, 25 September: the fourth group, `report.export`.* The reports API asked `report.view.basic` of every route, and `report.export` of none. The reports page (Export CSV, Print / PDF) and the report builder (Export PDF, Export CSV) offered their exports to everyone who could open them. So a custom role separated viewing from exporting in name only. Measured on lane 5 (`9588fa0`), a guest granted `report.view.basic` alone:
- downloaded a custom report as CSV (201) and as PDF (201);
- was offered all four exports on the two pages.

`report-export-key` was 1 of 5; the one that passed is the pairing below.

ClickUp (help centre "Default user role permissions", "Export List and Table views", from search snippets): exporting is its own permission, "Export Views", which covers dashboard cards among the rest. A guest exports nothing by default.

Now:
- The three export routes (`custom/export`, `custom/export.pdf`, `contribution.pdf`) ask `report.view.basic` and `report.export`. Running a report and reading the overview ask viewing alone.
- The reports page, the report builder and the insights page's contribution PDF offer their exports by `report.export`.
- A member holds both keys by default and a guest neither, so only a custom role draws the line.

`report-export-key`, 5 checks:
- Before: 1 of 5 on lane 5.
- After: 5/5 on lanes 5 and 4.
- Patches `rek-1..5`: each reddened the check it names (lane 1, baseline 5/5 at `a382582`).
- `contribution.pdf` also asks managers or admins, who hold `report.export` by default, so no check can separate the key there.
- Regression: the 14 suites that open the reports, insights, roles or exports, and the new one. 14 of 15 passed in the sweep; `video-regression` found no list from the space page under the sweep's load and passed alone (93/93).
- In CI (202).

*Partly fixed, 25 September: the fifth group, `workspace.delete`, and a gate.* The editor offered "Delete workspace — permanently delete the workspace and all data", and nothing asked it. No route deletes a workspace for good, and archiving is `workspace.manage`'s. Measured on lane 5 (`a382582`):
- the catalog offered it;
- a role was made with it (201);
- a member holding it resolved it;
- the editor listed it.

`retired-permission-keys` was 0 of 4. ClickUp, from search snippets: only the owner deletes a workspace.

Now:
- The key is out of the catalog until a permanent delete exists (`found-25-sep/workspace-permanent-delete-unbuilt`, below).
- Its strings are out of the editor, and `pgd-4` is re-aimed onto `workspace.billing`, another admin-only key.
- The service already ignored a stored key the catalog lacks, except in one place: the grant check (`permissionsOfRole`) read a role's stored keys unfiltered. So a role saved while the key was offered would have been unassignable by anyone, admins included. It filters them now.

`scripts/check-permission-keys-asked.mjs` fails on any key the editor offers that no `@RequirePermissions`, `hasPermission` or `holdersOf` names. It exempts only keys listed with the open item that owns them, and fails on a stale exemption.
- On `7a9ff90` it names the seven keys these groups wired up. On `a382582` it names `workspace.delete` alone, and on this tree it passes: 25 offered, 19 asked, 6 exempt (the deletion keys and `doc.publish`, owned by this item).
- `check-permission-keys-asked-cases.mjs --mutate`: 11 cases and 8 of 8 mutations bite. Both are in the preflight and CI.

`retired-permission-keys`, 4 checks:
- Before: 0 of 4.
- After: 4/4 on lanes 5 and 2.
- Patches `rpk-1..4`: each reddened the check it names (lane 1, baseline 4/4 at `1707248`). The re-aimed `pgd-4` still reddens its check (baseline 8/8).
- Regression: the 11 suites that make, grant or ask roles and keys, and the new one: 12/12.
- In CI (203).

*Partly fixed, 25 September: the sixth group, the settings page and invitations.* Measured on lane 5 (`fd1737d`), `settings-tabs-by-key` was 1 of 7:
- Settings opened to admins, and to holders of the integrations and SSO keys. The route sent everyone else to the start: a manager, who holds `members.invite`, and members granted `roles.manage`, `workspace.manage` or `security.policy.manage`.
- Inviting asked the manager role list instead of `members.invite`, and so did copying, resending and cancelling an invitation. A member granted the key was refused all four (403).

Now:
- Each tab opens to the keys it serves (`use-settings-access`): General `workspace.manage`, Members any of the three members keys, Roles `roles.manage`, Security `security.policy.manage`.
- Inside Members each control asks its own key: the invite form `members.invite`, a member's role `members.role.change`, Remove `members.remove`. No one is offered a role above their own (`withinRank`, the web's one rank table beside the role lists).
- Capacity, reports-to and the roster's CSV stay a manager's and up; they stand behind `WorkspaceAdminGuard`, which `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin` maps.
- The billing card on General asks `workspace.billing`.
- Inviting and handling an invitation ask `members.invite`. The rank rule (`roleRank`) replaces the hand-written "a manager invites no admin", so a member granted the key invites no manager.
- The onboarding checklist's Invite step starts on Members, where the invite form is, instead of General. The step is done once a second person is in (`counts.members > 1`), so only a workspace's lone maker, its admin, ever sees it undone. The earlier note that a manager following it was "sent back" could not happen: a manager is the second person.
- `crd-8`, `crd-9` and `gin-3` are re-aimed onto the new lines.

`settings-tabs-by-key`, 8 checks:
- Before: 1 of 7 on lane 5; the one that passed is the plain member, sent away before and after. The eighth, the Invite step, was measured on the previous commit's bundle: it led to `/settings`, which is General.
- After: 8/8 on lanes 5 and 4.
- Patches `stp-1..12`: each reddened the check it names (lane 1, baseline 8/8 at `39c0a4e`).
- `crd-8`, `crd-9` and `gin-3`, re-aimed onto the new lines, redden theirs (baselines 11/11 and 2/2).
- Regression, in two sweeps: the suites that open settings, invite, grant or ask roles, or draw the onboarding checklist. 26 distinct suites, all green. The first sweep's last seven were refused as run on a stale bundle, after a web edit mid-sweep, and passed when re-run.
- In CI (205).

This was the last group the map could close. What stays open below is blocked on ClickUp's deletion table.

*Was still open after the sixth group,* per the map (routes and lines in that item's notes):
- **The content deletion keys, and `doc.publish`, meet the location levels.** `space.delete`, `project.delete`, `list.delete`, `task.delete.any` and `doc.delete.any` say "delete any", while Full edit on a location already lets its holder delete there (`full-edit-enforced-nowhere`). Those two models have to be reconciled before any of them gates anything. ClickUp's own table still cannot be read here (25 September: the help centre is denied, and the snippets carry no table). What the snippets do say: deleting a List or a task takes Full edit on it ("Permissions FAQ"), and only the owner deletes a workspace. `check-permission-keys-asked.mjs` exempts these six keys under this item until then.

*Researched, 28 September: the deletion keys.* The ClickUp help centre is blocked here, so this rests on search snippets, quoted with their queries in the research notes:
- **Deletion follows the location level, not the creator.**
  - Full edit deletes; Edit changes and archives (Permissions FAQ: "no permission level that lets users delete a task but doesn't let them delete a List … set … the List to edit so they are prevented from deleting it, then … each task … to full edit").
  - Members and admins have Full edit on public locations by default.
  - Guests never delete a Space.
  - Deleting a Doc takes Edit ("Guests with edit permissions can edit and delete Docs").
  - Guests never share publicly.
- **No workspace-wide "who can delete" switch** was found among the advanced permissions. No custom-role permission named for deleting spaces, tasks or docs could be confirmed.

The proposal, built as written below:
- **Keep `space.delete`, `project.delete` and `list.delete`,** asked for deleting a container somebody else made. Each is ANDed with Full edit and replaces the role tests in `container-access.ts`, so no base role changes.
- **Retire `task.delete.any`.** Deleting a task already asks Full edit with no creator rule, as ClickUp does.
- **Retire `doc.delete.any`.** A doc's level decides.
- **Retire `doc.publish`.** It is a member default, and the only thing it could add is letting a guest publish, which ClickUp forbids.

Four defects found beside it are items of their own:
- `found-28-sep/folders-changed-by-any-reader` (security, HIGH);
- `found-28-sep/doc-archive-and-delete-at-two-levels`;
- `found-28-sep/trash-deletes-for-good-wider-than-clickup`;
- `found-28-sep/delete-and-public-link-offered-to-everyone`.

*Closed, 28 September: the deletion keys.* Measured on lane 6 at `4778778`, before the change, `container-delete-keys` passed 2 of 9. The two that passed pin what stays: a manager deletes only in a space they belong to, and a key never reaches past the level. The seven failures:
- Members granted `list.delete`, `project.delete` or `space.delete` were refused (403, "Only the creator or a workspace admin can modify this list"), and nothing went to the Trash.
- The project page's capabilities told those grantees `archive: false` and `deleteList: false`.
- The catalog still offered `task.delete.any`, `doc.delete.any` and `doc.publish`, and a role naming any of them was made (201).
- A member holding a role saved with them resolved all three.
- The editor offered all three, and described the kept keys as "Permanently delete", while every one of those routes sends to the Trash.

Now (`common/permissions/container-access.ts`):
- Deleting a space, project or list asks the level first, unchanged: Full edit there.
- The maker deletes what they made. Anyone else needs the kind's key, asked by `CustomRolesService.hasPermission`. That replaces `adminOnlyDelete` and the manager branch, so base roles are unchanged: an admin holds all three keys, a manager `project.delete` and `list.delete`, a member and a guest none.
- A manager still deletes only in a space they belong to, with or without a key.
- A guest never deletes a space, whatever a custom role grants and whatever level a share gives (ClickUp: "Guests cannot archive, unarchive, and delete any Space"). This guard was added while integrating: the key alone would have let a guest with Full edit delete one.
- A folder has no key and keeps the base-role rule (an admin, or a manager in their own space).
- The services pass their `CustomRolesService`. A keyed delete called without one throws an Error, not a quiet refusal. The project page's capabilities ask through the same rule, so its Archive and each list's Delete follow the routes.
- `task.delete.any`, `doc.delete.any` and `doc.publish` are out of the catalog, the deltas, the editor and the four locales, as `workspace.delete` went. Stored keys on older roles are filtered as before. The kept keys' descriptions say "Move … to the Trash, where you have Full edit".
- `check-permission-keys-asked.mjs` exempts nothing now: 31 keys offered, 31 asked. An exemption can be planted only with a planted tree (`PERMISSION_KEYS_EXEMPT` beside `PERMISSION_KEYS_ROOT`). Its cases: 12, with 9 of 9 mutations biting.

`container-delete-keys`, 10 checks:
- Before: 2 of 9 on lane 6. The tenth, the guest, came with the guard; `cdk-16` removes the guard, and its run follows the commit.
- After: 9/9 on lane 6, and 10/10 on lane 7 with the guest.
- API unit tests 1703/1703. 15 are new: 9 in `container-access.test.ts`, and 2 each in the lists, spaces and projects services, which check the key is asked of the service's roles. Web units pass.
- Patches `cdk-1..16`; `cdk-15` is a unit claim, the guard's twin of `cdk-16`. The fifteen e2e patches each reddened the check they name (lane 1, at `ad97e31`, baseline 10/10), and `cdk-15` reddens its unit test (`check-unit-claims`, 40 of 40).
- Regression, on lane 6 before the guard: the 13 suites that delete, restore, grant or ask roles and keys, 13/13. On lane 7 with it: those, the new suite and the two guest suites.
- In CI (220).

What the item listed as open is closed; the editor offers no key that nothing asks. Left beside it, as their own items: the sidebar and space page still offer Delete to everyone (`found-28-sep/delete-and-public-link-offered-to-everyone`), and renaming or archiving a container stays its maker's, an admin's or a manager's, even for someone at Full edit.

### `found-25-sep/managers-grant-themselves-admin` — **closed** (security, HIGH; found mapping `role-editor-offers-unenforced-permissions`)

**A manager could make themself a workspace admin, and give themself every permission**

*Measured, lane 5, on `694a2fc`* (the suite below, 0 of 5):
- A manager changed their own role to workspace admin (200; the row read `workspace_admin`), and a member's to manager.
- The same manager made a custom role holding `webhook.manage`, `sso.manage`, `roles.manage` and `members.role.change` (201), and assigned the admin's own role to themself (201).
- The manager removed a member (200).
- A member was added with the role `super_admin`, the platform's own (201). The role was stored as whatever string arrived.
- A member granted `roles.manage` and `members.role.change` by the admin could do none of it (403, "Workspace admin or manager role required"). That grant was the facade.

All of it came in through `WorkspaceAdminGuard`, which admits managers, with nothing asked after it.

ClickUp (help centre, "Manage Custom Role permissions", "Intro to user roles", search snippets): only the owner and admins change roles, and by default only the owner makes custom roles, delegating that to custom admins.

*Closed, 25 September:*
- **Each route asks its catalog key through `PermissionsGuard`.** Adding a member asks `members.invite`, changing a role `members.role.change`, removing a member `members.remove`, and making, editing, deleting, assigning or taking away a custom role `roles.manage`. The catalog's defaults give a manager `members.invite` and an admin all four. A custom grant counts.
- **Nobody gives a permission they do not hold** (`CustomRolesService.assertMayGive`). A role is written, deleted, assigned or taken away only within the actor's own permissions. Otherwise `roles.manage` would be every key.
- **Nobody adds, sets or removes above their own role** (`assertWithinRank`, on the one rank table now in `workspace-roles.ts`). A member granted `members.role.change` moves people up to member and no further, and a manager adds no admin.
- **An added member's role must be one a workspace gives** (400 otherwise). The platform's role is not one.
- **Admins hold every key** and outrank every assignable role, so they lose nothing. The custom-role unit tests act as a platform admin, since they are about validation.

The new suite `member-role-grants`, 5 checks, read back by SQL:
- a manager changes nobody's role;
- a manager makes no custom role and assigns none;
- the delegate gives only what they hold, and up to their own rank;
- a manager removes nobody;
- the roles a member may be added under.

Results:
- Before (lane 5, `694a2fc`): 0 of 5.
- After: 5/5, on lanes 5 and 4.

Patches `mrg-1..6`, each compiled:
- the role change asks the admin guard again;
- making a role asks a key every member holds;
- a role may give what its maker does not hold;
- the rank is asked of nobody;
- removing asks the invite key;
- any role string is added.

*Break run* (lane 1): at `7a9ff90` five of the six reddened the check they name. `mrg-2` reddened nothing: its role held keys the manager does not have, so `assertMayGive` refused it even with `roles.manage` asked of every member. Check 2 now also asks for a role holding only `members.invite`, a key the manager has, so the refusal it measures can only be the missing `roles.manage`. Re-run at `0b2db8e` (baseline 5/5): all six reddened the check they name.

Regression on lanes 2 to 5: the 23 suites that add, change or remove members, make or grant custom roles, or invite, and the new suite. Result: 24/24. `settings-role-grants` read its tabs before the grants had loaded, under the sweep's load, and passed alone (6/6). API unit tests 1652/1652. In CI (199).

### `found-25-sep/time-page-answers-whose-hours-twice` — **closed** (visible bug, small; found closing the time-approvals group of `role-editor-offers-unenforced-permissions`)

**The Time page shows a manager their team's hours on one tab, and only their own on the next**

*Measured* (lane 5, on the tree of `time-approval-rule`): a manager who is a member of a space was shown a member's hours in that space on the Time page's Reports tab. That tab reads `/reports/time`, whose viewer scope is the manager's spaces and projects. The same manager was not shown those hours on the Team week or Monthly tabs (`time-team-week`, `time-monthly`), which are the admins'. One page answers "whose hours may a manager see" in two ways: the duplicated-rule class.

*To close:* one rule for the page's views. The reports' viewer scope is the finer of the two: admins see everyone, a manager their team's spaces and projects, a member their own. In ClickUp, "All timesheets" is the owner's and the admins', and a custom role's "View time tracked by other users" widens it; that has no key here. Decide which rule, then have the team week and the monthly rollup read through that one scope, with a check for each role.

*Closed, 26 September.* Measured on lane 5 (`b82dd8a`), `time-page-reach` was 2 of 6; the two that passed pin the Reports tab's rule and the member's and admin's reach:
- The Team week and Monthly tabs gave a manager their own hours alone (their team's rows missing), while the Reports tab gave them their team's.
- Measuring showed a second fault under the first: both tabs summed every time entry of the workspace's members, wherever it was logged. A member's five hours in another workspace were counted here (7h shown where 2h were logged).

The rule is stated once now: `common/permissions/viewer-scope.ts` holds `viewerScopeOf`, `containerScopeCondition` and `taskReadFilterFor`. The reports delegate to it, with nothing changed; `reports-scope` passes 18/18. The Time page's team week and monthly rollup read through it (`TimeEntriesService.hoursReach`):
- an admin sees everyone, a manager their team (the spaces and projects they belong to, and their own), anyone else their own;
- only tasks the reader may open;
- only this workspace's projects.

The approvals response says the reach (`timeReach`: all, team or own). The monthly header reads "all members" or "your team" (four locales) and shows the Member column for either. Filtering the entry list by anybody stays the admins' (`seesEveryonesTime`). `rra-1` and `tar-8` are re-aimed onto the moved lines.

`time-page-reach`, 6 checks:
- Before: 2 of 6.
- After: 6/6 on lanes 5 and 4.
- Patches `tpr-1..6`: each reddened the check it names (lane 1, baseline 6/6 at `818f919`, 28 September). The re-aimed `rra-1` reddened `report-read-access`'s overview check (lane 3, baseline 6/6), and `tar-8` reddened `time-approval-rule`'s rollup label (lane 3, baseline 9/9).
- Regression, in two sweeps: the 12 suites that read time or reports, the 6 that read the workload report through the moved helper, and the new one. 19/19.
- API unit tests 1652/1652.
- In CI (208).

### `found-25-sep/workspace-permanent-delete-unbuilt` — **closed** (feature, medium; found closing the fifth group of `role-editor-offers-unenforced-permissions`)

**Nothing deletes a workspace for good**

*Evidence:* `DELETE /workspaces/:workspaceId` archives the workspace (a soft delete), under `workspace.manage`, and `restore` brings it back. Nothing removes a workspace and its data permanently. The role editor offered `workspace.delete` for that action until it was taken out of the catalog, because nothing asked it.

*ClickUp* (search snippets from "Transfer Workspace ownership"): only the owner deletes a workspace. Here no member is the owner; the creator is recorded, and admins manage the workspace.

*To close:* decide who may delete for good (the creator, or an admin holding a restored `workspace.delete`), and after what — an archive first, and a typed confirmation. Build the route, the cascade, and a check that archived data is gone. The key returns to the catalog with the route that asks it, and `check-permission-keys-asked.mjs` holds the two together.

*Closed, 29 September.* ClickUp ("Delete a Workspace"): only the Workspace owner, from the Workspace's Settings, checks that it goes for good, types the Workspace's name to confirm, and it cannot be recovered. A workspace here belongs to an organization, and the organization has owners (whoever creates a workspace in a new organization is made one; only an owner makes another, and the last is not demoted), so they are its owners, with a platform admin. No permission key: a key would let a role grant what ClickUp keeps for the owner, so `workspace.delete` stays out of the catalog.

- `DELETE /workspaces/:id/permanent` with `{ confirmName }`: 403 for anyone but an owner of its organization or a platform admin, 400 for a workspace that is not archived (archiving is the step that can be undone), 400 for a name that is not the name exactly. It deletes the workspace row, and every row that hangs off it goes with it: 77 of the 78 keys to `workspaces` cascade (measured first by deleting a workspace of 8 spaces and 8 members in a transaction on lane 6 and rolling it back), and `ai_usage` keeps its rows for the bill with the workspace cleared. The deletion is recorded (`workspace.deleted`) with no workspace, because the workspace's own trail goes with it.
- Settings → Archived: `GET /workspaces/archived` says of each archived workspace whether its reader may delete it for good (the route's own rule), and there the owner is offered Delete for good, a dialog whose button stays off until the name is typed exactly. Four locales.

`workspace-delete-for-good`, 4 checks (the owner a fresh sign-up who owns their own organization, the refused admin one of another):
- Before: 0/4 on lane 7 (no button; the route 404).
- After: 4/4 on lane 7.
- Patches `wdg-1..8`: offered to every admin, offered to nobody, any member deletes, a live workspace deleted, the name not compared, the button on without the name, "delete" archiving again, the deletion not recorded. `crd-15` is re-aimed onto the archived list's new return. Their runs follow the commit.
- In CI (237).
- What it leaves: the workspace's stored files (attachments, clips, covers, logos) stay in the store, their rows gone — `found-29-sep/workspace-delete-leaves-stored-files`.

### `found-25-sep/billing-open-to-managers-and-every-member` — **closed** (security, medium; found mapping `WorkspaceAdminGuard` after the fifth group of `role-editor-offers-unenforced-permissions`)

**Every member, guests too, read the workspace's invoices and their Stripe links, and a manager could change its plan**

*Measured, lane 5, on `1707248`* (`billing-key` was 0 of 3):
- `GET /workspaces/:id/billing` asked only membership. It gave a guest and a manager the last twenty invoices, each with its Stripe hosted page and PDF, and the subscription row.
- Checkout and the billing portal were behind `WorkspaceAdminGuard`, which admits managers. A manager passed both, and was stopped only because Stripe is not configured on the lanes (400).
- A member granted `workspace.billing` was refused both (403).

The catalog says `workspace.billing` is "view invoices, change plan, manage payment method" and gives it to admins. The web shows billing on an admin's settings tab. ClickUp (search snippets): billing is the owner's and the admins'.

*Closed, 25 September:*
- Checkout and the portal ask `workspace.billing` through `PermissionsGuard`.
- The status gives the plan to every member, since the web gates features by it. It gives the subscription and the invoices only to a holder of the key.
- The status's comment in the controller no longer calls the manager guard admin-gated.

The new suite `billing-key`, 3 checks:
- Before: 0 of 3.
- After: 3/3 on lanes 5 and 4.
- Patches `bil-1..4`: each reddened the check it names (lane 1, baseline 3/3 at `fd1737d`).
- Billing unit tests 27/27.
- Regression: the 9 suites that read plans, billing, settings or roles, and the new one. 9 of 10 passed in the sweep; `list-export` saw no fields request under the sweep's load and passed alone (30/30).
- In CI (204).

### `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin` — **closed** (permissions, medium; found closing `billing-open-to-managers-and-every-member`)

**Thirty-one routes still stand behind `WorkspaceAdminGuard`, which admits managers, where the web or the catalog says admin**

*Evidence (reading, 25 September):* `WorkspaceAdminGuard` asks `isManagerRole`. The groups of `role-editor-offers-unenforced-permissions` moved every route with a catalog key off it. What is left:
- **The whole workspace's data:**
  - `GET /workspaces/:id/export/json`, and `csv/tasks` and `csv/members`;
  - the ClickUp and spreadsheet imports (`import/clickup`, `jobs/:jobId/enrich`, `import/spreadsheet`);
  - `sample-data/seed`.
- **ClickApps:** `GET /feature-flags/workspace/:id`.
- **The workspace's people and calendar:** a member's capacity and reports-to, the work schedule, holidays, and `archived-tasks`, all on `workspaces.controller`.
- **User groups:** make, rename, delete, and set their members (six routes).
- **Project templates:** save, make, delete. `template.manage` exists, and task templates ask it; project templates do not.
- **The rest:** clients (make, delete), announcements (four routes), and the workspace's default dashboard (set, clear).

For each, the web offers the control to admins only, on the admin settings tabs, or the catalog names a key. So a manager does by the API what no page offers them, and a member granted the matching key cannot.

*To close:* take each group through ClickUp's rule:
- Exporting and importing a workspace, and billing, are the owner's and admins' (search snippets).
- Project templates ask `template.manage`.
- The people-and-calendar group, groups, announcements, clients and the dashboard default: decide per group whether managers keep them, then make the web offer them to exactly those.

Measure a manager and a granted member on each, before and after, as `admin-only-keys` did. The route map is in this item's evidence.

*Partly fixed, 25 September: project templates.* Measured on lane 5 (`39c0a4e`), `project-template-key` was 0 of 4:
- a member granted `template.manage` could not save a project as a template, make one, or delete one (403 each), while task templates asked that key;
- the templates page offered Save as template to everybody, and the API then refused a plain member.

Measuring also showed that saving copied every list and task of the project and asked only that the project be in the workspace. That was harmless while only managers and admins could save, since they read everything. It is not harmless for a member granted the key, and a template is shown to the whole workspace.

Now:
- Saving, making and deleting ask `template.manage` through `PermissionsGuard`.
- Saving asks the read rule of the project (`readableProject`; 404 otherwise) and copies only the lists and tasks its saver may open (`listVisibilityFilter`, `taskVisibilityFilter`).
- The templates page offers Save as template by the key.

`project-template-key`, 4 checks:
- Before: 0 of 4 on lane 5.
- After: 4/4 on lanes 5 and 4.
- Patches `ptk-1..6`: each reddened the check it names (lane 1, baseline 4/4 at `e6189ca`).
- Regression: the 8 suites that save, apply or browse templates or open settings, and the new one: 10/10 (with `settings-tabs-by-key` again).
- In CI (206).

*Partly fixed, 25 September: the workspace's data.* Measured on lane 5 (`e6189ca`), `data-transfer-keys` was 0 of 6:
- A manager exported the whole workspace as JSON, every task as CSV, and the people as CSV (200 each).
- A manager passed the gates of the spreadsheet and ClickUp imports and of the sample-data seed.
- The web offered the export to admins alone, but the import page and the sample-data card to everybody.
- No key could hand any of it to anyone.

ClickUp (help centre "Import and export feature availability and limits", "How do I export my Workspace's data?", from search snippets): exporting the workspace's task data and its people list is the owner's and the admins'. Importing is too, and a custom role can grant it.

Now:
- The catalog has `workspace.export` and `workspace.import`, each an admin's by default and grantable.
- The export routes ask `workspace.export`. The imports (ClickUp, its enrichment, spreadsheet) and the sample-data seed ask `workspace.import`.
- Settings offers the data export on Integrations by `workspace.export`, and Integrations opens to it. The roster's CSV asks it too.
- The import page offers the spreadsheet and ClickUp imports by `workspace.import` and says so otherwise; documents stay anyone's.
- The sample-data card offers Load demo data by `workspace.import`.

`data-transfer-keys`, 6 checks:
- Before: 0 of 5 on lane 5. The sixth, the sample-data card, was measured on an earlier bundle: it offered the manager Load demo data.
- After: 6/6 on lanes 5 and 4.
- Patches `dtk-1..9`: each reddened the check it names (lane 1, baseline 6/6 at `b82dd8a`).
- `check-permission-keys-asked` reads 27 keys offered, 21 asked.
- Regression: the 13 suites that import, export, open settings or grant roles, and the new one. 13 of 14 passed in the sweep; `list-export` missed its fields request under load and passed alone (30/30), recorded under `three-suites-fail-under-a-full-sweep`.
- In CI (207).


*Closed, 28 September: the remaining groups.* Each group was researched and measured by its own agent. Each has a suite written for the AFTER state and run BEFORE the change. The rule was then built, and the suites run AFTER on lanes 1 to 5 (sweep 18079). The seven new keys are in the catalog, the role editor (four locales) and the web's permission type; each is an admin's by default unless noted, and a custom role can grant each.

| Group | Rule now | ClickUp | Suite: before → after |
|---|---|---|---|
| ClickApps | `GET /feature-flags/workspace/:id` and the workspace-scope `PUT` ask `workspace.clickapps.manage`, not the role spelled out by hand. What is on (`/resolved`) stays every member's. | "Only Workspace owners and admins can activate or deactivate ClickApps. Members can view…" | `clickapp-flags-access` 3/7 → 7/7 |
| The work week and holidays | `PATCH work-schedule`, `POST`/`DELETE holidays` ask `workspace.schedule.manage`; reading them stays open. | The work week is set by owners and admins | `people-calendar-access` 3/8 → 8/8 |
| A member's capacity and reports-to | Ask `members.profile.manage` (managers and up by default). The holder may not touch someone who outranks them (`assertWithinRank`, unit-tested). | — | (same suite) |
| Archived tasks | `GET archived-tasks` is every member's, filtered by `taskReadFilterFor`. Each row says `canRestore` from the task write rule (`common/permissions/task-restore.ts`). Settings → Archived opens to every member but a guest. Archived workspaces stay an admin's. | Show archived follows the location's access | `archived-tasks-access` 2/7 → 7/7 |
| User groups | Making, renaming and deleting groups, and setting their members, ask `groups.manage`; reading stays open. | Owners and admins manage User Groups; a custom role can grant it | `user-group-access` 1/8 → 8/8 |
| Clients | Making and deleting ask `client.manage` (managers and up); a guest reads no client list. | No clients object; reasoned from what the web promises | `client-access` 0/6 → 6/6 |
| Announcements | Publishing, pausing, deleting and the full list ask `announcement.manage`, from Settings → Announcements (a new tab). The live banner stays every member's. | Posting to everyone is an admin's | `announcement-access` 3/8 → 8/8 |
| The workspace dashboard | Setting and clearing ask `dashboard.workspace_default.manage`. They disagreed before: a manager cleared what they could not set. | Default views for everyone are an owner's and admins' | `default-dashboard-access` 4/8 → 8/8 |

Fixed on the way, each inside its group:
- **ClickApps:**
  - `PUT /feature-flags` refuses an unknown key (400) and a scope that is not its workspace.
  - "Contact your admin" reaches the holders of the key and opens Settings → Features, not the platform console. A holder is offered the switch itself.
- **Clients:** `PUT /projects/:id` takes a client of its own workspace only (unit-tested).
- **User groups:**
  - The web API no longer writes a group's `externalId`; provisioning keeps its own path.
  - Removing a group or a member reports a failure.
- **Announcements:**
  - A title is required (400, not a 500), and so are a valid tone and date.
  - Save draft saves the announcement paused instead of doing nothing.
  - "No expiry" replaces "Invalid Date".
  - Every action reports a failure.
- **Dashboard:**
  - Only a dashboard its setter may read can become the workspace default, so a colleague's unshared one is never published by id.
  - A member with no dashboard of their own lands on the workspace default, as the page promised.

**Managers lose** the work week and holidays, ClickApps, user groups, announcements and the workspace dashboard. They kept all of these only because `WorkspaceAdminGuard` admitted them, and the web offered none of them. An admin can grant each by a custom role. **Every member but a guest is now offered Settings,** landing on Archived: `settings-tabs-by-key` and `settings-role-grants` were rewritten for it, and the latter measures a guest too.

- **Break patches:** `cka-1..9`, `pca-1..10`, `ata-1..10`, `uga-1..14`, `cla-1..13`, `ana-1..11`, `dda-1..9` (four of them unit claims: `uga-13`, `uga-14`, `cla-12`, `cla-13`). Re-aimed: `srg-1..7`, `stp-4`, `stp-11`, `wrc-2`, `td-1`.
  - Run on lanes 1 to 4, every baseline green: `pca-1..10` and `ata-1..10` at `4ba95d3`; `cka-1..9`, `uga-1..12`, `ana-1..11` and `dda-1..9` at `72a8208`; `cla-1..11` at `4ba95d3`. Each reddened the check it names (61 of 61).
  - The re-aimed `stp-4`, `stp-11`, `wrc-2` and `td-1` reddened theirs at `5086fe0` (`settings-tabs-by-key` 8/8, `workspace-role-controls` 3/3 and `teams-destination` 14/14 at baseline).
  - `srg-1..18`, the seven re-aimed among them, reddened theirs at `5086fe0` (lane 3, `settings-role-grants` 6/6 at baseline). The unit claims are measured by `check-unit-claims` in the preflight.
  - `dda-1` reddened its check, but the run ended there: the suite put the admin's dashboard back through the route `dda-1` breaks, and threw when it was refused, so the gate counted the run as unreadable. The suite restores by SQL when the route refuses now (8/8 on lane 7), and `dda-1` reddened its check again in a full run of all eight (lane 3, at `ad97e31`).
- **Gates:** `check-permission-keys-asked` reads 34 keys offered, 28 asked and 6 exempt.
- **Tests:** API unit tests 1684/1684, web 305/305.
- **In CI:** 216 suites.
- **Regression, 63 suites** (every suite that opens settings, grants roles, reads archived tasks, flags, groups, clients, announcements or dashboards, or edits folders), on lanes 1 to 5:
  - 57 passed in the sweep.
  - Three failed because of this change and pass after it. `teams-destination` and `settings-role-grants` assumed a member reaches no Settings, and are rewritten for Archived (Settings still shows a member no people). `loading-states` refused the new panel's "Loading…" text, which is skeletons now.
  - `folder-dialog`, `settings-depth` and `addressability-live` passed alone. They are load flakes, recorded under `three-suites-fail-under-a-full-sweep`.
- **Preflight:** every step passes except the three that wait on the break runs.

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

### `found-23-sep/routes-bypassed-by-the-service-worker` — **closed** (medium, test tooling; found with the item above)

**A page route never sees a request the service worker answers, so a suite that holds or fails an API call by route can be looking at an answer that already arrived**

*Evidence:* Playwright's `page.route` is not consulted for requests the service worker intercepts, and the app's worker intercepts every API GET. `webhook-access`'s first run: the route predicate was never called (`held false`), and both loading checks looked at a list that had answered. Twenty suites passed `serviceWorkers: 'block'` before `webhook-access` (21 now, counted with `grep -l serviceWorkers test/e2e/*.mjs`); four route requests without it — `chat-history` (the held first page), `clip-created-card` (3 routes), `create-menu-ai` and `ui-sweep` — and whether their routes fire depends on whether the worker has claimed the page yet.

*To close:* `serviceWorkers: 'block'` in each of the four, and every hold asserts that it held (a flag set in the handler, as `webhook-access` does), so a route that never fires fails its check instead of passing it. A rule in the suite checkers: a `.route(` in a file whose contexts do not block service workers.

*Progress:* `clip-created-card` blocks the worker now (with `clip-create-task-persists-24h-url`), and its handlers catch their own errors. It holds nothing. Its routes stand in for presign and share, and its checks count them, so a route that never fired would fail them rather than pass. `chat-history` too, found when its run died on "route.continue: Route is already handled!": the held first page's handler did not catch, and the route was taken down straight after the release, so Playwright settled the request first. It blocks the worker, its handler catches, the check requires that the hold fired, and the route comes down once the rows are in (18/18 in the chat sweep). Two to go: `create-menu-ai`, `ui-sweep`.

*Closed, 28 September.*
- `create-menu-ai` blocks the worker. Its stood-in plan counts the times it was served, and the plan check requires that it was.
- `ui-sweep` blocks the worker too; its route is a filter, not a hold.

The rule is `scripts/check-suite-routes.mjs`. Every `newContext(…)` / `browser.newPage(…)` of a suite that calls `.route(` says what the worker does: `serviceWorkers: 'block'`, or `'allow'` where the worker is meant. Options held in a variable are followed.

It found three contexts the grep had not counted:
- two in `stale-chunk-recovery`, which keeps the worker because the worker is part of what it tests (`'allow'`, said now);
- `video-regression`'s main context, which routes nothing (`'allow'`); its AI section already opened a blocking one.

Measured:
- On HEAD's suites the gate names all five contexts. Now: ok, 34 routing suites, 38 contexts.
- `check-suite-routes-cases.mjs`: 11 cases, 8 of 8 mutations bite.
- The four suites on lanes 1 and 3: `create-menu-ai` 24/24, `stale-chunk-recovery` 27/27, `ui-sweep` 107/107, `video-regression` 93/93.
- `create-menu-ai` with its route aimed at a path nobody asks for: the plan check fails, "the stood-in plan was never asked for: the route did not fire".
- In preflight and CI.

### `found-23-sep/secret-and-credential-reads` — **closed** (from a read-only sweep of every credential column, each measured before it was fixed)

**Read routes handed credentials to people who should not have them, and an invitation could grant another organisation's workspace**

*Evidence, measured on lane 1 before the change:* (1) `GET /tasks/:taskId/activity` embedded `with: { actor: true }` — a plain member read the admin's whole `users` row: `passwordHash`, `failedLoginAttempts`, `lockedUntil`, `notificationPreferences` and 30 more columns. (2) `GET /lists/:listId/inbound-webhooks` gave a member and a guest the admin's hook token — the only credential for the unauthenticated `POST /inbound/webhook/:token`, which creates tasks as the hook's creator — and a member could delete the admin's hook. (3) `GET /tasks/:taskId/email-address` answered somebody from another organisation 200 with the list's secret inbound address. (4) With `blockPublicSharing` on, a member still made a client portal (201) whose anonymous `/portal/:token` view answered 200, and a guest listed portal tokens. (5) `customDomainToken` reached a member and a guest through `GET /workspaces/:id`, `GET /workspaces` and the sign-in answer. And invitations: the owner of a just-signed-up organisation wrote an invitation (201, token in the answer) naming ANOTHER organisation's workspace as `workspace_admin`; invitations could grant `super_admin` as a workspace role and `owner` of an organisation; a manager could invite a workspace admin; claiming inserted whatever the row named. `update`/`remove` on portals DO re-check membership in the service — the sweep's "no guard at all" overstated that one.

*Closed (1, 3, 5 and invitations):* activity embeds `PUBLIC_USER_WITH` (the only whole-row user embed left — grepped); the email address sits behind `ResourceMemberGuard`; workspaces reach members through `withoutDomainToken` in both lists (so the sign-in answer too), and `GET /workspaces/:id` keeps the token only for `isManagerRole` (`common/permissions/item-visibility.ts` — the roles `WorkspaceAdminGuard` admits; a `WORKSPACE_ADMIN_ROLES` copy made here for a day was folded back into it), which the settings page's DNS record still shows (screenshot). Invitations: `checkedMemberships` refuses a workspace outside the organisation, a role an invitation cannot grant (`INVITE_WORKSPACE_ROLES`, no `super_admin`) and a workspace named twice, before anything is written or sent; `INVITE_ORG_ROLES` has no `owner`; a manager may not invite a workspace admin; and `grantableAtClaim` holds rows written before the rules to them at claim time — foreign grants dropped, `owner` joins as member, `member.joined` fired only for what was granted. `credential-reads` 11/11 on lane 1; 3 passed and 8 failed against the old API, the 3 being the paired grants. 18 patches `crd-1..18`, each compiled against the fix; break run pending. Regression on lane 1, 13/13: activity-rail, ai-activity-filters, ai-value, assignee-picker, gantt-controls, no-dead-ends, task-activity-filter, task-boundaries, task-menu, task-merge, settings-depth, person-panel, credential-reads. API unit tests for tasks, workspaces and both guards 248/248.

*Closed (2 and 4):* a hook's token goes to its creator and to `isManagerRole` — the one list, now also used by `WorkspaceAdminGuard` and `container-access.guard-helper`, which had kept their own copies — and every other hook is still LISTED, by name, with `canManage`; guests may not add a hook; only the creator or a manager deletes one; and `receive` stops when the creator is no longer a member who can see the list (a hook no longer outlives the person it acts as). The list panel lists somebody else's hook by name with "Only its creator and workspace admins see its address.", shows no delete it would be refused, offers guests no "New webhook", and says so when the list fails instead of "no webhooks". Portals: guests are refused all portal management; `create` refuses under `blockPublicSharing` with the docs' own wording, while an existing portal can still be switched off (the setting's own words: "Existing links can still be revoked"); the project page disables the form under the switch and says why, hides the section from guests, and shows a failed list as failed. `hook-portal-access` 11/11 on lane 1 (8 API, 3 on screen); against the old code 0 of 11. `hpa-1..19`, each compiled. *Plan-4 found two of them unreadable:* `hpa-2` (nobody may add a hook) and `hpa-12` (a portal refused whatever the switch says) broke the suite's own fixtures, which were the admin's hook and the member's first portal, made through the routes those patches break. Both runs died making the fixture, before the check each patch names ("the admin could not make a hook: 403", 1 of 11 checks). That is `fixtures-built-through-the-route-under-test` again, in a suite I wrote after it was closed. Both fixtures are written by SQL now, with tokens minted as the services mint them. Regression on lane 1: credential-reads, doc-boundaries, space-features, task-boundaries, task-menu, settings-depth 7/7 with the new suite, custom-field-progress 58/58; unit tests for portals, hooks, guards and workspaces 114/114.

*Closed (federated search):* a connection is one person's Google or Microsoft account, and every member's query ran through it — the connector's mail subjects, senders and snippets, Drive files and SharePoint documents, for anybody in the workspace, guests included. Measured on lane 1 before the change: a member's `/search/sources` reported the admin's Gmail as connected for them. The frame is somebody searching "meri Gmail" — MY Gmail. Now `federatedCredential` and `searchDrive` answer only `connectedById` (which the OAuth callback records), and `listSources` tells each person whose it is (`heldBy`: you / someone-else / none), so the palette says "Connected with someone else's account — its mail and files are searched only for them" rather than promising results, and offers Connect only to admins — for a member it opened settings that sent them back. The query side is proven by unit tests (nothing in a test environment reaches Google): 48/48, three new, each reddened by `fsr-1..3` through `check-unit-claims` (9/9). `search-sources` 10/10 with three new checks, which failed 3 of 3 on the old code; `search-sources-5..7`. `app-catalogue` staged its grants with no connector — a row naming nobody is now connected for nobody — and stages them as the admin's, as the callback would; `search-sources-1/2` and `app-catalogue-5/6/7` re-anchored to the new `listSources`. Regression: app-catalogue, search-sources, command-palette, video1-acceptance 4/4. *Not built:* each member connecting their OWN account (ClickUp's per-person connected search) — today a second member connecting Google replaces the first's connection; that is a feature, listed with the unbuilt ones.

*Closed, the last of it (25 September):* an invitation's token reaches only those who may copy its link. The create answer goes to the workspace admin or manager who made it. The organisation's pending list is `OrganizationAdminGuard`'s. The workspace's pending list carries no token (id, email, role, status, expiry). `GET /invitations/:id/link` refuses a member (403) and answers an admin, measured on lane 5 and now checked by `guest-invitations`.

Reading that list found something else: it answered a guest every pending invitee and the role they were offered (`found-25-sep/guests-read-pending-invitations`, closed below).

Whether an existing portal's link should die when sharing is blocked stays as the setting's own text says: existing links stay revocable, and portals match it.

### `found-25-sep/guests-read-pending-invitations` — **closed** (security, small; found closing `secret-and-credential-reads`)

**A guest read every pending invitation: who was invited, and to what role**

*Measured, lane 5, on `ee661b7`:* `GET /invitations/workspace/:id` asks only for membership, and answered a guest every pending invitee's email and the role they were offered (a workspace admin's, in the probe). Members read the list on purpose: the task sheet's assignee picker and the chat's mention and DM pickers offer people who were invited. A guest sees no people list (ClickUp; `guest-read-scope`).

*Closed, 25 September:* a guest's answer is empty. The list never carried tokens, and now a check says so.

The new suite `guest-invitations`, 2 checks:
- A guest reads no invitation, and a member reads them.
- The token is in no list, and the link is refused to a member and given to the admin.

Results:
- Before: 1 of 2. The token check passes either way.
- After: 2/2.

`gin-1..3`, each compiled: guests reading the list, the list carrying the token, and the link for any member.

*Break run, lane 1 (`a0a0d70`):* `gin-1..3`, 3 of 3 reddened, on a green baseline (2/2).

Regression on lanes 2 to 5: `guest-invitations`, `assignee-picker`, `credential-reads`, `no-dead-ends`, `guest-read-scope` and `guest-create-menu`, 7/7. In CI (186).

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

### `found-23-sep/role-lists-copied-per-module` — **closed** (duplicated list, small; found closing the views role list)

**The manager-role list is kept in four more places, and the assignable workspace roles in two**

*Evidence:* `item-visibility.ts` exports `WS_MANAGER_ROLES`/`isManagerRole`; the same three roles are also `WS_MANAGE_ROLES` (`container-members.service.ts:15`) and `WS_STAFF_ROLES` (`support.service.ts:46`) — identical today, which is how `views.service.ts`'s copy drifted into naming roles that do not exist before anybody noticed. `workspaces.service.ts:837` `ASSIGNABLE_ROLES` and `invitations.service.ts` `INVITE_WORKSPACE_ROLES` are one list twice. `container-access.ts:8` `ADMIN_ROLES` (admins only) is a different set and stays.

*To close:* import the one list at each site (no behaviour changes, so: type-check, the modules' unit tests, and a sweep of the suites that exercise each module), and a checker that fails on a new array literal of workspace role names outside `common/permissions`.

*Closed, 25 September.* A scan of the API found more copies than were listed here, 21 in all:
- the managers (admins, managers and platform admins) nine times;
- the admins alone eight times;
- the roles a person may be given four times;
- the invitations controller's two-role list, which left out `super_admin`. No membership row holds that role (no path writes one), so that list and the managers' behave the same on rows.

Each set is stated once now, in `common/permissions/workspace-roles.ts`: `WS_MANAGER_ROLES` with `isManagerRole`, `WS_ADMIN_ROLES` with `isAdminRole`, and `ASSIGNABLE_WORKSPACE_ROLES` with `isAssignableWorkspaceRole`.
- **Every site imports them.** That is fourteen modules, the sign-up DTO's `@IsIn` among them. `item-visibility` re-exports for the modules that always imported from there.
- **`space-default-permission`'s copy is gone.** It had been kept on purpose "so a change to one is a deliberate change to the other", which a single list makes true by itself.
- **The web's one copy is gone too.** The teams page's `MAY_CREATE_TEAM` asks the role hook's `isManagerOrAbove` now. The hook, like the API's `WorkspaceAdminGuard`, counts a platform admin.

**The gate.** `scripts/check-role-lists.mjs` fails on an array literal holding two or more workspace role names anywhere in `apps/api/src` outside `common/permissions`, or in `apps/web/src` outside `hooks/use-workspace-role.ts`. Unit tests are exempt. It also fails on a source directory that is missing or holds no TypeScript. It reads 912 files.
- `check-role-lists-cases.mjs` plants trees to fool it: split, double-quoted, `Set`, `inArray` and web lists; the allowed places; the empty trees. That is 8 cases. `--mutate` breaks the gate eight ways, and every mutation reddens a case.
- Both run in the preflight and in CI.

Measured:
- API typecheck clean, and the web's.
- API unit tests 1652/1652. One source-level test had asserted the literal `'workspace_admin', 'super_admin'` in the integrations service; it asserts the service reads `WS_ADMIN_ROLES` now.
- `gte-1` and `sdp-7` anchored on the literals, and were re-aimed onto `isManagerRole(...)`; each compiled. They are queued (`plan-rl`).
- Regression on lanes 2 to 5, the 32 suites that exercise the fourteen modules: 32/32. `panel-collapse` and `role-permissions-web` failed under the sweep's load and passed alone (56/56, 5/5). The five teams suites passed after the web change (5/5).

### `found-23-sep/signup-throttle-killed-a-break-run` — **closed** (found reading plan-3's logs)

**A break run died in setup on the sign-up rate limit, and measured nothing**

*Evidence:* `brk-pgd-5-scim-mints-nothing.log`: "threw: signup of manager failed: 429", 1 of 8 checks ran. `/auth/signup` allows 10 a minute per IP and every suite is 127.0.0.1; a break plan replays a people-making suite once per patch. The local-stack proxy already waited out a throttled LOGIN (and `signInApi` did so for direct calls), but not a sign-up — 18 suites sign people up. 1 of the 1,170 break logs on this machine died this way; it is the newest suites, making three or four people each, that hit it.

*Closed:* the proxy's retry covers the sign-up POST on the same budget (a 429 is refused before the handler, so a retry makes no second account), and `signUpApi` in `signin.mjs` does the same for the two suites that sign up against the API directly (`search-sources`, `view-visibility`). Measured through the proxy: twelve sign-ups in a burst — 12 × 201 after waiting 48 seconds for the window, where the old proxy handed back 429 to the last four. search-sources, view-visibility, credential-reads, permission-guards 4/4. `pgd-5` is re-run in the next plan.

### `found-23-sep/avatar-and-logo-accept-any-url` — **closed** (security, small; found closing the expiring-avatar item)

**`avatarUrl` and `logoUrl` are saved as whatever string arrives**

*Evidence:* `PATCH /users/me` takes `avatarUrl?: string | null` with no validation (users.controller.ts:24, an inline type, no DTO), and `PATCH /workspaces/:id` the same for `logoUrl`. So a picture can point at any host — every viewer's browser then asks that host for it, handing over the viewer's address and when they looked — or at a string that is no image at all.

*To close:* accept only our own `/api/v1/public/images/…` address and the OAuth providers' avatar hosts (whatever the sign-in flows store), refuse the rest with a 400 in the service, and a suite pairing a refused foreign URL with an accepted upload. Research what ClickUp allows (it takes uploads only).

*Closed:* a picture is one we store, or none. `isPublicImagePath` (`public-images.controller.ts`, beside `publicImagePath`) accepts an upload's own address, one safe key segment under `avatars/` or `workspace-logos/`, so no `..` walks to another object. The sign-in provider writes its picture directly, not through the profile save. A save that sends back the picture already saved keeps it, so a profile form's round trip is not refused, and anything else is a 400. The settings page's logo is an upload with a Remove button; its address box, placeholder "https://…/logo.png", invited what the save now refuses. `settings-writes`: 0 of 4 before on lane 1, 5/5 after. Its checks: the admin's save; a logo at another host refused and not saved, beside the workspace's own upload; a profile picture the same, and none removing it; a provider's picture sent back kept, and a `..` walk refused; and the page offering the logo as an upload only. The page check was added after the first measurement; `stw-6` restores the box it guards. `stw-2..6`, each compiled, 5 of 5 reddened on lane 2. Regression: the sweep above. In CI.

### `found-23-sep/checks-read-textContent-not-what-is-shown` — **closed** (test tooling, medium; found by `hr-9` reddening nothing)

**A check that reads `textContent` cannot tell a shown message from a hidden one**

*Evidence:* `hr-9` wraps Home's reminders empty state in `<div hidden>` — a blank panel to anybody looking — and `home-reminders` stayed green, because `textContent` includes hidden elements and still read "No reminders waiting". Fixed in that suite (`innerText`, which is what is rendered). The same read appears in 16 suites (`grep -l 'textContent(' test/e2e/*.mjs`, 23 September), and every one that asserts a sentence is SHOWN has the same blind spot to a patch that hides rather than removes.

*To close:* a section-enders-style rule — a check whose condition asserts text through `textContent` — with the fix `innerText` or an explicit visibility check; measure the count first, then convert.

*Closed, 29 September.* Measured first, each suite lexed with its comments stripped: 69 `textContent` / `allTextContents` reads in 28 suites, not 16 — most are property reads in page code and `allTextContents()` calls, which the grep did not see. 55 fed a check that text IS SHOWN (in the condition, or through a helper, a variable or the `waitUntil` before it), one more reads `task-menu`'s printed id out of a copy that is hidden on screen by design, and 13 decided nothing about showing (7 in a check's message, 1 in a variable only a message uses, 4 reading a row's text to find the row, 1 asserting absence).

`innerText` alone is not the fix, measured in the lanes' Chromium: it leaves out hidden text INSIDE an element that is drawn (the `hr-9` shape, where `home-reminders` reads the panel), but an element that is itself hidden answers `innerText` with its whole text, as `textContent` does. So a read that stands for "shown" is now a visibility check on the element read (`.filter({ visible: true })` on the locator, `checkVisibility()` in page code) and `innerText` for anything hidden inside it.

- 55 reads converted in 25 suites; 6 carry a marker saying why they may read hidden text (`key` 4, `absence` 1, `not-rendered` 1); `home-reminders` had two more unguarded reads (the reminder labels and the nav count). Every check sentence is byte-for-byte as before.
- After: 21 reads in 14 suites, none resting a check that text is shown on text that may be hidden: 7 in a message, 1 in a message-only variable, 7 behind a visibility guard, 6 marked.
- `scripts/check-suite-text-reads.mjs --mutate` (preflight, and CI's verify job): every read is in a message, visibility-guarded on the read itself, or marked with a known reason on its own line; unknown reasons, markers that exempt nothing, and fewer than 100 suites read all fail. 14 of 14 mutations bite, and a planted `hr-9`-shaped read is caught while the same read filtered to visible and read with `innerText` passes.
- Demonstrated on lane 5: with a reminder's label hidden in the live page, `allTextContents()` and `allInnerTexts()` both still list it and the converted read drops it; with `hr-9` applied, `panel.textContent()` still says "No reminders waiting" and `panel.innerText()` is empty. In `timesheet-mine`, a hidden "Total this week" reads "1h 00m" through both properties, and `null` through the converted read.
- The 28 changed suites on lanes 1, 3 and 5 at once, at this tree: 27 of 28 at first. `task-depth` read its add-tag control after a fixed 3.8 s, before the task's capabilities had drawn it under the three lanes' load; it now waits for the control (20 s at most), and a new patch, `td-tags-2`, takes the control away. Then 91/91.
- Their break sets were measured before the change and run again after the commit.

Not in this item, the same blind spot one step on: 252 `innerText` / `allInnerTexts` reads in 86 suites, about 35 with a visibility check on the same line. A leaf read among them cannot see a hidden element either (`found-29-sep/innertext-reads-hidden-leaves`).

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

### `found-24-sep/two-sweeps-share-one-record` — **closed** (medium; found running the search regression)

**Two sweeps at once write one status file and one results file, and the second truncates the first's**

*Evidence:* `sweep.sh` writes `/tmp/claude-0/sweep-status.txt` and `sweep-results.txt`, fixed paths, and truncates both when it starts. With a sweep running on lane 1 (14 suites recorded passed), a second one started on lanes 3 and 4 for the last two suites emptied both files. The first sweep's end-of-run summary is computed from that status file, so it would report on a mixture. The results survived only because `verify.sh` keeps each suite's own log (`/tmp/claude-0/run-<suite>.log`). This is the same shape as `one-suite-two-lanes-share-a-results-file`, one level up.

*To close:* each sweep writes its own status and results (named by its pid), and the canonical paths become links to the newest, or the script refuses to start while a live sweep holds a lock. Add a self-check that runs two sweeps of stand-in suites at once and requires each summary to count only its own.

*Closed, 28 September.* Reading it again found a third shared file: the QUEUE. A second sweep overwrote the first's, so the first sweep's workers could take the second's suites.

Now each sweep keeps its status, results, queue and lock in `sweeps/<pid>/`, and says so on its first line. `sweep-status.txt` and `sweep-results.txt` are links to the newest sweep's files.

`sweep-selfcheck.sh` runs two sweeps of stand-in suites at once in a scratch directory: six passing on two lanes, and three (one passing) on a third lane, started under the first. Nothing is shared between them, and no lane is touched.
- HEAD's `sweep.sh`, its fixed paths moved into the scratch directory: 0 of 6. The first sweep summed "3 of 5 passed" and "5 of 6 suites reported", the second "2 of 3".
- Now: 6/6.
- In preflight and CI.

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

### `suite-hygiene/hand-rolled-chains` — **closed** (test tooling, large)

**103 literal check(false, …) calls in 15 suites, plus 5 other hand-rolled chains, instead of lib/chain.mjs**

*Seen again on 23 September:* `person-panel.mjs:818` — an unbounded `page.getByTestId('user-menu').click()` after a reload — turned one slow reload on a loaded lane into a run that ended at 54 of 59 checks. The same suite passed 59/59 on the next run. The click should be bounded and its absence reported as a failing check.

*Evidence:* Literal `(chk|check)(false,` count per suite: chat-message-actions 31, panel-collapse 23, person-panel 8, addressability-live 8, task-depth 7, settings-depth 5, planner-priorities 5, list-statuses-seeded 4, video-regression 3, a61-meeting-record 3, loading-states 2, and 1 each in video1-fast-items, video1-acceptance, planner-settings, emoji-picker. Six of these suites already import makeChain (chat-message-actions, panel-collapse, person-panel, task-depth, video-regression, video1-fast-items). Other hand-rolled chains: video-regression.mjs:927-1000 (G13 with its own `emitted`/`stopped` counters and `while (emitted < G13.length)`), video-regression.mjs:575-613 (A2.6b else re-types three labels), emoji-picker.mjs:406-413 (a literal label array duplicating 439/442/456), and the fixed-count loops list-empty-states.mjs:357 and list-view-controls.mjs:239. Fail branches that report fixture sentences instead of the product claim, which the ledger ruled out at docs/video2-reaudit.md:4030-4034: chat-message-actions.mjs:566-571 ('so "Assign to" was never checked'… against the product sentences at 515-561), :493-494; task-depth.mjs:1025-1028, 964, 994-995; person-panel.mjs:597-602; settings-depth.mjs:424-426, 500-501; addressability-live.mjs:221, 343, 365; panel-collapse.mjs:343-345, 401-402, 413. The first label at panel-collapse.mjs:811 ('a tool can be turned off') has already drifted from its pass twin at 817 ('Docs is in the dock to begin with').

*To close:* Move every one onto makeChain: declare the pass-path sentences once with chain(...), use step() on the pass path, and put the reason in rest(why) on the fail path. Replace the G13 emitted/stopped machinery with makeChain(chk). Consider a checker rule that flags `(chk|check)(false,` and bare `bad('` in suites once converted.

*Closed, 29 September.* No suite reports a check with a literal `false`. The 103
sites in 15 suites, and the five hand-rolled chains beside them, are on
`lib/chain.mjs`: each chain's sentences are declared once, and its failure branch
fails the rest under the pass path's own sentences with its reason. The seven
branches that reported fewer checks than the path beside them report the same
number now, so a product failure there reads as failures and not as a short run.
Every changed suite ran at its `EXPECTED_CHECKS` on lane 6 with 0 failed. Forced
down its failure path in a copy outside the repository, every converted chain
kept its suite's count and failed its later checks with the reason; with the same
forcing, the original chat-message-actions and panel-collapse ran 66 of 73 and 54
of 57 and passed two checks about things that never happened.

### `suite-hygiene/apiAs-duplicated-62` — open, medium

**62 suites hand-roll an API client in 5 variants beside lib/fixture.mjs apiClient**

*Evidence:* `^const apiAs = ` appears in 62 suites. Hashing the whole function bodies gives 5 variants: 54 copies (activity-rail…), 5 copies (addressability-live…) that always send `authorization: Bearer ${token}`, so an anonymous call sends 'Bearer null'; 1 in task-ai-bar that adds a `message` field; 1 GET-only in malformed-ids; and 1 multi-line in chat-message-actions. lib/fixture.mjs:28-46 apiClient differs again: it parses text and keeps `raw`. syncup-live has a third shape, api(token, method, path, body). The ledger extracted chain.mjs (docs/video2-reaudit.md:4076-4078) for two copies and claim-match.mjs (4071-4075) for two.

*To close:* Export apiAs(base)(token) from lib/fixture.mjs with the null-token rule and the message field, move suites onto it, and have the one copy expose `ok` and a `must(res, what)` helper, which would also remove most of finding unguarded-derefs.

### `suite-hygiene/ci-no-store-for-store-suites` — **closed** (unvalidated on a runner until CI runs again)

**CI runs task-cover and attach-on-create with no object store; task-cover also writes to a sandbox-only path**

*Closed:* the postgres-harnesses job starts `s3-stub.mjs --strict` before the API, waits for its ready line, and gives the API the four variables `lane_store_env` exports. The port is set ONCE, as the job-level `E2E_STORE_PORT`, which `task-cover` and `attach-on-create` already read and the API's `R2_ENDPOINT` is built from. `task-cover` and `doc-import` write their fixtures under `os.tmpdir()`. Cannot be run on a runner before 1 October; the lanes run the same configuration.

*Evidence:* task-cover.mjs:502-520 computes STORE_PORT = 9100 + (API_PORT - 3020), which is 9091 for `--api 3011`, and fails 'the lane has an object store' when nothing answers. attach-on-create.mjs:82-83 and 321 arm `${STORE}/__control/fail-next-put` on the same formula. ci.yml's postgres-harnesses job (383-384, runs on code changes) starts the API with only PORT=3011 (522-541), with no R2_ENDPOINT and no s3-stub, then runs both suites (753, 1803). check-s3-stub runs at ci.yml:336, but only as its own self-test. task-cover.mjs:528 and 624 writeFileSync to `/tmp/claude-0/cover-upload-…png` with no mkdirSync; ci.yml never creates /tmp/claude-0, so this throws ENOENT on a runner. doc-import.mjs:172 and 310 do the same (not in CI). This is inferred from code; I did not read a CI log.

*To close:* In the CI job, start s3-stub.mjs on the port the suites compute (or pass --store) and export R2_ENDPOINT/R2_* to the API, sharing lane_store_env's values. Write fixtures under os.tmpdir() via mkdtempSync instead of /tmp/claude-0.

### `suite-hygiene/inert-catches` — **closed** (test tooling, medium)

**39 inert .catch(() => {}) on apiClient-shaped calls, several restoring shared account state; the recorded count of 292 does not reproduce**

*Evidence:* A paren-matching scan of calls to apiClient/apiAs-bound names found 32 direct `.catch(` sites in 20 suites. It also found 6 cleanup runners `for (const fn of cleanup.reverse()) await fn().catch(() => {})` (doc-task-links:273, list-filters:211, planner-blocks:228, space-default-permission:492, space-presets:177, view-visibility:250), plus video-regression.mjs:452 (`API(...)`, missed by name). All 62 local apiAs copies and lib/fixture.mjs:28-46 return {status,data,error} and never throw on an HTTP status. The worst are restores of shared state that fail silently. video-regression.mjs:482-485 sets the admin's inbox preferences as the starting state, 594 reads them back through an inert catch, and 616-619 restores them for 'every other' suite. video-regression.mjs:452 and video1-acceptance.mjs:324-326 re-mark notifications unread. panel-collapse.mjs:612 clears a seeded notification. ai-value.mjs:317-321 restores the workspace's real benchmark. task-provenance.mjs:169-173 restores a task-type name 'against a real workspace'. Setup: replies-inline-thread.mjs:95 adds the peer to the channel, and the checks below assume that worked. The docs say '292 … across 63 of the 66 suites' (e2e-shared-state-audit.md:105-118, dated 2026-09-20; video2-resume.md:230). Today there are 115 suites and 778 `.catch(() => {})` in total, mostly on Playwright calls that DO reject, so 292 most likely counted those and overstates the inert set.

*To close:* Replace each with a status check. For restores and setup, fail or log loudly with the status. For cleanup, collect non-2xx statuses and print them in the summary. Correct the doc's count to the measured client-call sites and state how it was measured.

*Closed, 29 September.* Measured with a parser (acorn over every suite, each caught promise traced back to the call that made it, and that call's head checked against the names the file binds to an API client: `apiAs`/`apiClient` results, fetch-calling helpers, aliases, `.as` properties). The 239 suites held 1,544 `.catch(() => {})` (a grep finds 1,549; five are in comments). 158 were on an API client, in 133 suites: 136 on a client call, 11 on a closure or loop that calls one (six `cleanup.reverse()` runners, three `restore?.()`, one `cleanup?.()`, one `platformOn()`), and 11 on a raw `fetch` to the API. 111 of the 158 were one copied line, the teardown `DELETE` of the suite's own workspace. The 115-suite counts above (32, then 33 plus 10) were right for their day; the suites added since copied the teardown line. The rest of the 1,544 are on Playwright, SQL and browser teardown, which do reject.

- Every one of the 158 is a status check now. A cleanup accepts 200, 204 or 404 and prints anything else as `cleanup left behind: …` above the totals, uncounted. A restore of shared state is a counted check, one in each of ten suites (`panel-collapse`, `person-panel`, `settings-depth`, `video-regression`, `video1-acceptance`, `task-provenance`, `ai-value`, `flag-resolution`, `planner-default-list`, `comment-recording`), each suite's `EXPECTED_CHECKS` one higher. Setup that could not stage its row throws a sentence naming what (`bookmarks`, `comment-recording`, `replies-inline-thread`, `video-regression`).
- `lib/fixture.mjs` `ensureShared` reads every write and closes its task with the list's own closed status, not `done`.
- Found doing it, and fixed: 67 suites closed their proxy before the teardown `DELETE`, which goes through that proxy, so those workspaces were never archived (ECONNREFUSED, swallowed); `stack.close()` now comes after it. Five teardowns in four suites answered 400, because their clients sent `content-type: application/json` on a bodyless `DELETE`; they send it only with a body now. `replies-inline-thread` sent `{ userId }` where the route reads `userIds[]`, so its peer was never added (2xx, `added: 0`); it sends the list and requires `added === 1`.
- Demonstrated: a teardown pointed at a wrong workspace printed `cleanup left behind: DELETE /workspaces/… answered 400` above `1 passed, 0 failed`.
- `scripts/check-suite-api-catches.mjs --mutate` (preflight, and CI's verify job) keeps it so. It reads each suite as code (comments, strings, regex literals and template text blanked), resolves the names the file binds to an API client (factories, aliases, fetch-calling helpers, `.as` properties, curried calls), and refuses an empty handler on a client call, on a closure or loop that calls one, or on a raw `fetch`, and a null handler whose result nothing reads. It found 158 at `d86220d` (136 direct, 11 wrapped, 11 fetch), line for line what the scanner found, and 0 now. 24 of 24 mutations bite, over 24 planted cases (18 it must catch, 6 it must pass: Playwright, SQL, teardown, a handler that does something, the shape inside a comment, string or regex, and `waitUntil`).
- It also caught the three suites added since that base (`audit-log-settings`, `routes-with-readers`, `assign-with-ai-picker`), which had the old teardown and closed their proxy first. `routes-with-readers` put the admin's digest setting back through the closed proxy too, so the restore never happened (lane 7's admin was left on a weekly digest); it now restores before closing and treats no answer as a failed restore, and lane 7's setting is back to the default.
- `docs/e2e-shared-state-audit.md` §3 and its table, and `docs/video2-resume.md` §3, carry the measured split instead of 292.
- The 133 suites on lane 6 at the agent's tree: each `N passed, 0 failed` at its `EXPECTED_CHECKS`. At this tree, with the text-read and stale-doc changes merged in, on lanes 1, 3, 5 and 7 at once: 137 of 138 (the changed suites and `a39-dm-tabs`, whose fixture changed). `doc-level-controls` read its editor before the doc's capabilities had answered under that load; it now waits for them (see `doc-editor-open-to-readers`), then 7/7.

### `commit-log/log-944e47f-1` — partly-fixed, medium

**Shared-database hazards in the e2e suites are only partly fixed**

*Evidence:* Commit 944e47f found 46 of 66 suites picking a workspace by index. Now 57 of 115 suites contain workspaces[0], and 26 use pickWorkspace. comment-recording.mjs:353 still switches the shared admin account to Urdu, restoring it only in a finally (:667). apiClient never throws on an HTTP status (fixture.mjs:28-46), and inert .catch(() => {}) calls on it remain, for example addressability-live.mjs:329 and ai-answer-rendering.mjs:856-859. The '292' in resume §3 #3 cannot be re-derived: there are now 778 .catch(() => {}) across 109 files, most of them intended bounds on Playwright calls.

*To close:* Re-measure the catches that follow an apiClient call, then replace them with status assertions. Move the remaining suites to pickWorkspace or a tagged workspace. Give comment-recording its own account.

### `resume-defects/resume-3` — **closed** (test tooling, medium)

**Inert .catch(() => {}) on API clients: the doc's 292 is a miscount; the real figure is 33 direct plus 10 wrapped, and it is still open**

*Evidence:* test/e2e/lib/fixture.mjs:28-46: apiClient returns {status,data,error} for any HTTP status. It does reject when fetch itself rejects (line 32 is unguarded), so each .catch swallows only a dead API, never an HTTP failure. Most suites use a local apiAs(token) of the same shape (e.g. activity-rail.mjs:70-78, chat-message-actions.mjs:157-170), and none of the 16 apiAs I checked throws. THE 292 IS A MISCOUNT: git grep at 944e47f (the commit that wrote docs/e2e-shared-state-audit.md) finds 292 `.catch(() => {})` in 63 suites, but the figure counts every such catch. I parsed each site's call head with a bracket-matching script, using the same method on both trees. At 944e47f only 32 sites (20 suites) were on an API client. The rest were Playwright calls, which do throw and whose bounded `.click().catch(() => {})` form scripts/check-suite-section-enders.mjs:782-783 prescribes, plus postgres tagged templates, browser.close and sql.end. CURRENT TREE (115 suites): 778 `.catch(() => {})` in 109 suites, of which 33 sit directly on an API client in 20 suites (A:24, api:5, rootApi:2, API:1, cleanupA:1), plus video-regression.mjs:594 `.catch(() => null)`. Another 10 wrap closures that call A: `for (const fn of cleanup.reverse()) await fn().catch(() => {})` at doc-task-links:273, list-filters:211, planner-blocks:228, space-default-permission:492, space-presets:177 and view-visibility:250 (14 `cleanup.push(() => A(...))` closures), and `restore?.().catch` at panel-collapse:145, person-panel:138, settings-depth:133 and chat-message-actions:180. The count has not come down. The two newest suites added the pattern (ai-answer-rendering.mjs:856-859, doc-import.mjs:364), and no checker forbids it. WORST CLEANUP THAT SILENTLY DOES NOT CLEAN: task-menu.mjs:509, where an inbound-email alias whose own comment says it 'must not persist into whatever runs next' is DELETEd with a catch and no status read. panel-collapse.mjs:1041-1042 deletes three seeded spaces in the shared workspace, unchecked. assign-to-priorities.mjs:341 and planner-priorities.mjs:314 delete priorities in finally. teams-destination.mjs:259 deletes a group. request-access.mjs:304-307: the comment says 'this is a 404 it ignores', but the code ignores every status. WORST RESTORES OF SHARED ADMIN STATE, never checked: panel-collapse.mjs:183 and 457-458 (PATCH /users/me panelsCollapsed and sidebarCollapsed), settings-depth.mjs:172-176 (presence, mute, highContrast), ai-value.mjs:318-322 ('this workspace's real setting'), task-provenance.mjs:169-173 ('this runs against a real workspace'), and video1-acceptance.mjs:324-325, which re-marks notifications unread after mark-all-read on the shared admin with no after-check. video-regression.mjs:453 has the same shape but is guarded by the chk at 455-460. SETUP THAT DOES NOT SET UP: among the 33 only replies-inline-thread.mjs:95 (adding the peer to a channel), and the chk at 106-110 guards it. The larger instance has no .catch at all: fixture.mjs ensureShared discards the statuses of the assignee POSTs (230, 256), the close PATCH (258, a hard-coded status 'done', which contradicts the fixture's own warning at 105-110) and the solo-meeting POST (281-290). If that last one fails, the negative check its comment at 234-248 exists for passes vacuously again. SEPARATE LIVE CLASS: about 140 postgres cleanups in 38 suites (e.g. assign-to-priorities.mjs:345-347, `sql\`delete ...\`.catch(() => {})`) catch real rejections and discard them.

*To close:* Replace every direct and wrapped site with an explicit acceptable-status assertion, following the audit's own recipe at docs/e2e-shared-state-audit.md:142-151. DELETE cleanup accepts 200/204/404; restores of shared state must succeed. Make a failed restore a counted FAIL (restore closures return the response, and done() or the finally checks it). Change the cleanup.push loops to push closures whose result is checked. Fix fixture.mjs ensureShared to check each POST/PATCH and resolve the closed status from the list's statuses, not 'done'. Add a read-only checker (in the style of check-suite-section-enders) that refuses `.catch(` attached to a call on any identifier bound from apiClient or apiAs, so the count cannot regrow. Correct the 292 in docs/video2-resume.md:230 and docs/e2e-shared-state-audit.md:105,118,194 to the true split: 33 plus 10 on API clients; about 140 SQL swallowers as a separate class; Playwright catches deliberate.

*Closed, 29 September,* with `suite-hygiene/inert-catches` (the measurement, the 158 status checks, the gate, and `ensureShared` reading every write and closing by the list's own status). The 292 in `docs/video2-resume.md` and `docs/e2e-shared-state-audit.md` is corrected to the measured split. The SQL swallowers this item counted as a separate class (`sql`...`.catch(() => {})` in cleanups) are out of the gate's scope; they do reject, and each discards a real error, so they remain a class of their own.

### `suite-hygiene/unbalanced-else-branches` — **closed** (test tooling, medium)

**14 if/else branches report a different number of checks on the failure path; one is a drifted magic count**

*Evidence:* Checks counted per side by hand after a scratch balance scan. list-view-controls.mjs:167-240: the if side has 9 chk calls (168,181,188,191,210,228,230,232,234) and the else is `for (let i = 0; i < 8; i++) bad(...)` at 239. Commit 3a4f426 added the cluster-box check at 210 and raised EXPECTED_CHECKS to 50 (line 53) but left the loop at 8. chat-message-actions.mjs:775-780: no modal gives 4 checks, the modal path gives 3 + 8 = 11 (781,785,799 + 814..869). Two of its else sentences are stale copies: 'with the message it is about' vs 783, and 'and the eleventh conversation is reachable' vs 801. chat-message-actions.mjs:948/982-985 is 2 vs 1: 'and that dialog closes again' at 977 has no else twin. chat-message-actions.mjs:918/993-997 is 5 vs 3. person-panel.mjs:826-828 is 1 vs 3 (829 plus a 2-step chain at 840). task-depth.mjs:943/963-965 is 2 vs 1. a39-dm-tabs.mjs:168/177-179 is 2 vs 1. ui-sweep.mjs:395/420-422 is a 4-label chain vs one bad(). ui-sweep.mjs:443/460-462 is 2 vs 1. video-regression.mjs:266/327-329 is at least 10 vs 1, :645/692-694 is 7 vs 1, :700/712-714 is 4 vs 1, and :410/462-466 is 3 vs 0 (an uncounted console.log SKIP). command-palette.mjs:512-516: `.catch(async () => bad(...))` adds a 44th check only when the click fails. In every case a product regression prints '✗ N of M checks ran — this run stopped early', the exact headline lib/chain.mjs:4-15 was written to remove.

*To close:* Convert each block to makeChain(check) using the pass branch's own sentences, and call .rest(why) in the else. Delete the literal counts and re-typed labels. For command-palette, report the click failure in the detail of the next check rather than as an extra check. After converting, force each else path (for example, remove the testid) and confirm the count still matches EXPECTED_CHECKS.

*Closed, 29 September.* All fourteen sites, found by the counter where they now stand, and six more blocks it found
beside them, converted to `makeChain` with the pass side's own sentences and `.rest(why)` where the other side re-typed
labels, counted in a literal loop, or printed a `SKIP`: `list-view-controls` (9·8), `chat-message-actions` (the
forward modal's 4·11 as one chain of eleven, dropping two stale sentences; the narrow thread's 5·3 and 2·1 as two
chains, since the dialog's two can stop while the drawer's last check runs), `person-panel` (1·3), `task-depth`
(2·1), `a39-dm-tabs` (2·1), `ui-sweep` (4·1, 2·1, and the ⋯ section's literal loop of four, now its own chain),
`video-regression` (12·1, 7·1, 4·1, and Clear all's 3·0, which now decides first — no client skips all three,
counted; a client with nothing arranged fails them with that reason), and `command-palette` (the `bad()` in a
`.catch` is the reason on the check below it). Beside them: `panel-collapse`'s hand-rolled drawer chain, its
dock-toggle block (4·5) and favourites block (3·5); `list-empty-states`' re-typed loop of three; `syncup-live`'s dead
peer branch (0·1), now the check failed with its reason. No pass sentence and no `EXPECTED_CHECKS` changed; claims 0
failing. Before and after on lane 2, each at its constant (chat-message-actions' one baseline failure is in a section
this does not touch and did not recur). Every converted else path, forced in a copy of its suite, reported its
suite's full count, the forced checks failing with their reasons (and video-regression's invocation path three
counted skips).

### `suite-hygiene/unguarded-derefs` — **closed** (test tooling, medium)

**Raw .data.X dereferences after a check that is allowed to fail, and in fixture helpers**

*Evidence:* Classified 160 `.data.X` sites with a scratch script. About 80 are behind explicit throw-guards and 27 are guarded inline. The ones after a null-safe check that may fail: space-default-permission.mjs:271-277 checks `viewList.data?.id`, then 322, 343, 361, 368, 380, 391, 414 and 436 use `viewList/commentList/editList.data.id` bare; one top-level try (99-488) means 15 of 25 checks are lost. task-depth.mjs:476 checks `reuse.data?.id` (the product 500ing on the unique index is the case under test), then 477-478 use `reuse.data.id`/`second.data.id`; one try 161-1146 means up to 58 later check sites are lost. bookmarks.mjs:84-98 checks, then 161 and 170 use `external.data.id`/`internal.data.id`. list-filters.mjs:89 then 200 and 204 (`saved.data.id`). planner-blocks.mjs:91 then 218 and 222 (`made.data.id`). list-name-taken.mjs:105 then 170 (`first.data.id` inside sql). Bare mid-run: task-depth.mjs:1034-1053 (`parent.data.id`, `c1.data.id`, `c2.data.id`, all unchecked creates); chat-message-actions.mjs:424 (`(await A(...)).data.find(...).id`, two throws). Shared fixture: lib/fixture.mjs:226-230 ensureShared uses `task.id` after an unchecked POST. Setup: addressability-live.mjs:112-117 and task-depth.mjs:180-182 (`spaces.data[0].id`), planner-priorities.mjs:181 and planner-views.mjs:106 (`(await A('/users/me')).data.id`). Nothing gates this class: check-suite-section-enders.mjs covers Playwright reads only.

*To close:* At each site, optional-chain the id into a const, and gate what follows on it with a chain whose .rest() names the missing fixture (as folder-dialog now does). In ensureShared, throw a sentence when the POST fails. Consider adding a rule to the section-enders checker: `X.data.` used after a chk whose condition mentions `X.data?.`.

*Closed, 29 September.* No cited `.data.X` is read after a check that may have
found it missing. Each id is optional-chained into a const, and the checks that
need it fail naming the fixture that was never made, instead of ending the run
with a `TypeError`; a setup read every check depends on throws a sentence naming
the read. `ensureShared` was already fixed in the snapshot (`must()`) and is
unchanged.

### `suite-hygiene/ai-activity-filters-model-refusal` — **closed** (test tooling, small)

**A fifth suite pins the model refusal; the harness says four**

*Evidence:* ai-activity-filters.mjs:125-135 checks `forced.status === 503` ('asking for a task while AI is unconfigured is refused with a 503'), and :152-156 checks `row?.errorCode === 'not_configured'`. The checks at 139-160 depend on that refusal having produced a failed row, and 166/448 then pass vacuously (see vacuous-absence-on-empty-read). lane-env.sh:88-100 and commit 7c4ac44 say 'FOUR suites … 21 assertions, COUNTED INSIDE chk( CALLS' and list ai-create-containers, create-menu-ai, task-ai-bar and ai-answer-rendering, which omits this one. No dispatcher routes any suite to a modelless lane: grep of scripts/ for create-menu-ai|task-ai-bar|ai-activity-filters|needsModel finds only comments, and lane-env.sh:131-133 says the routing is 'NOT done'. So create-menu-ai and task-ai-bar (known) and this suite would all break on a model lane.

*To close:* Convert this one: the refusal is scenery. Arrange a real provider failure on a model lane via model-stub `POST /__control/next` (model-stub.mjs:103), and on a modelless lane keep the not_configured path. Assert the row's errorCode equals what the configuration predicts (read /ai/status first), so the same checks hold either way. Update the count in lane-env.sh.

*Closed, 29 September.* ai-activity-filters no longer stands on the refusal. It
reads `/ai/status` before causing its failed run: with no model, the product's
own "not configured" 503; with one, a provider failure arranged through the
model stub's `POST /__control/next` (a 500, staged to outlast the client's
retries, the stub reset before and after), which the product records as
`provider_error` and answers with a 500. The row's `errorCode` must be the one
the configuration predicts, and the two absence checks require the row to
exist. Measured on lane 4, which has no model: 34/34; the flipped prediction
fails "and carries WHY"; the model path where no stub answers fails in words
and causes nothing; with the row deleted, the two absence checks that passed
before now fail. The staging was checked against a scratch stub with the
product's client: three attempts, a 500 carrying the staged message, nothing
left staged. The model path end to end still needs a model lane.
`lane-env.sh:142-146, 176-181, 186-189` still count this suite among those that
need a lane without a model.

### `suite-hygiene/conversion-reintroduced-fingerprint` — **closed** (test tooling, small)

**Tonight's AI-configuration conversions put the fingerprint back on the model-configured branch**

*Evidence:* ai-answer-rendering.mjs:544: `modelConfigured ? beforePlaceholder !== UNAVAILABLE : …`. beforePlaceholder comes from attrOf (line 124), which returns null when the composer is missing, so on a model lane a composer that is absent, empty, or still reading 'Working on it…' passes. This is the absence-of-a-string shape commit 8af9618 removed, reintroduced by b5a52bc. ai-create-containers.mjs:372 and 390: `modelConfigured ? status !== 503 : …` accepts a 404 (route removed) or 500 when a model is configured. The failure message at ai-answer-rendering.mjs:592 still says 'against a disabled' placeholder on a lane where it was not disabled.

*To close:* On the configured branch, assert the resting placeholder string positively (the i18n resting text) and non-null. For the endpoints, assert a 2xx (or the specific success status and shape) when available. Run both on a model lane with a break that removes the composer or the route.

*Closed, 29 September, the configured branch shown in a copy rather than on a
model lane.* Where a model is configured, the composer must rest on its
invitation, `/ai/command` must answer with a plan and `/ai/chat` must open a
stream; the absence of a 503, or of the unavailable sentence, passes for none of
them. Told a model was configured, with the composer and both routes removed, the
original assertions passed all three and the new ones fail all three, naming
what they expected.

### `suite-hygiene/fingerprint-negations` — **closed** (test tooling, small)

**Facts asserted by the absence of a word from another string**

*Evidence:* ai-answer-rendering.mjs:617 `!/^working$/i.test(stepWords)` means 'its own words' only by lacking the fallback word; if the fallback becomes 'Thinking', a missing translation passes. chat-message-actions.mjs:514 `!/^thread$/i` claims 'named after whoever started the thread' by not being 'Thread', though the suite knows the starter (it posted BODY as A). team-view.mjs:289 `!/Admin|Omar/.test(last)` claims 'unowned work is last' by the absence of two seed names; any third member in the shared lane DB passes. tab-title-countdown.mjs:204 `!/left|\d+m \d+s/i` claims no countdown only by the absence of today's countdown format. list-empty-states.mjs:231 `!/create task/i` claims no create CTA by the absence of today's button copy. no-dead-ends.mjs:167 `!/Something went wrong/i` claims 'does not crash' by the absence of the error-boundary copy, with no positive anchor; the sidebar wait at 163 is caught. ui-sweep.mjs:429 `!/Due date.*checklist item/i`. addressability-live.mjs:150 and command-palette.mjs:298 `!/No matches/i` fingerprint the palette's empty copy; both have positive twins above, so they are weaker.

*To close:* Assert the positive fact. Match the create_list step's expected label exactly; compare the thread title to A's display name; assert the last row is the unassigned row by testid or data attribute; compare the tab title with the base title read before any block; count the CTA testid in the filtered state; assert workspace-sidebar and the notifications panel are visible; check that the checklist item's first control is the assignee picker; check that the cmdk-empty element count is 0.

*Closed, 29 September.* None of the nine checks asserts a fact by the absence of
a word. Each asserts the fact: a step's own label, the starter's name, the row
holding the unowned task, the title the page shipped, the controls a state
offers, the panel that drew, the picker that comes first, the palette's own empty
element. Where the product gives the fact no testid, the check's comment says so
and it reads the structure instead.

### `commit-log/log-1e7f092-1` — **closed** (test tooling, small)

**team-schedules stubs every API call yet is cited as closing its row, against the 'real API' rule**

*Evidence:* Commit 1e7f092: ts-9 'patched a line nothing in the repository executes'. De-duplication is now unit-tested (team-schedule-columns.test.ts). team-schedules.mjs:162 still intercepts every **/api/** call, so the server endpoint never runs in e2e. Ledger row 821 says 'closed by team-schedules.mjs', while resume :36-37 says a row closes only against a real API and Postgres.

*To close:* Add a real-API section, or a small real-API suite, for the team schedules endpoint, or record on row 821 that it is closed by the browser suite plus the unit test.

*Closed, 29 September:* a small real-API suite, `team-schedules-api`, asks the endpoint the page calls (`GET /planner/:workspaceId/team-schedules`) through the real API and Postgres, with the browser suite's fixture: Sara with three dated tasks, Omar with one.
- One column per person, in the order asked: Sara, Omar, Sara answers Sara then Omar.
- Each column is its own person's day, by task id.
- Someone outside the workspace is refused in their own column, with a reason, while the others draw.
- Nine people are a 400 that names the limit of eight, and Sara named nine times is one column, not a refusal.
- 5/5 on lane 5. Registered in CI's `postgres-harnesses` job, which now runs 243 suites; the comment that counts them had stayed at 241.
- `tsa-1..4` are API patches: the de-duplication dropped (as `ts-9`, which the browser suite could never redden), every column read as the first person's, one refused column failing the whole schedule, and the limit gone. At `3186ab8` on lane 3, against a 5/5 baseline: `tsa-1` 3/5 and `tsa-2` 3/5, each reddening the two checks it names, `tsa-3` 4/5 and `tsa-4` 4/5.

### `commit-log/log-30183c3-1` — **closed** (test tooling, small)

**process.exit() is still used at 216 places in the suites; recorded as harmless for now**

*Evidence:* Commit 30183c3 recorded it as 'the wrong pattern that cannot bite today' (11.6 KB of output against a 64 KB pipe buffer). A count now finds 216 calls across 114 suites. Ledger line 6448 says 215, so the count has already grown by one. The checkers were already switched to process.exitCode (ledger 5527).

*To close:* Convert the suites to set process.exitCode, or at least stop the count growing with a ratchet.

*Closed, 29 September, by the item's ratchet rather than a conversion.* Counted with the suites lexed (comments, strings, regex literals and template text left out): 215 `process.exit()` calls in 113 suites, where 129 suites already set `process.exitCode`. A call is harmless where a suite writes to a file, as the lanes and the break runner do, and loses the end of the output where it writes to a pipe, as CI's steps do (`scripts/lib/bail.mjs` measured the loss). Converting is not free: a suite that ends in `process.exit()` may depend on it to stop a handle nothing closed, and would then hang until CI's timeout, so each conversion wants its own run.
- `scripts/check-suite-process-exit.mjs --mutate` (preflight, and CI's verify job): more than 215 fails, naming the suites; fewer fails too, until the number in it comes down, so a conversion stays converted. The mutation checks that a call in a comment or a string is not counted and that a planted one over the baseline fails.

### `commit-log/log-641be6c-1` — **closed** (test tooling, small)

**The stale-chunk 'no reload loop' check allows up to three reloads and cannot catch a missing cooldown**

*Evidence:* Commit 641be6c: 'The bound is real and the check is loose'. stale-chunk-recovery.mjs:486 still asserts reloads <= 3. The scr-5 patch header records PASS with 2 loads while the cooldown was removed.

*To close:* Widen the observation window or assert the cooldown directly (for example exactly one recovery reload, then the error boundary), so that scr-5 reddens both checks.

*Closed, 29 September.* The stale-chunk suite asserts the cooldown: one recovery
reload, and no second while it lasts, where it allowed three. `scr-5`, which
takes the cooldown out of the automatic recovery, reddens both of section 4's
checks — 25 and 2 against 27 of 27 unpatched, on the suite's own releases built
outside the repository — and its header claims both.

### `commit-log/log-6d8e26f-1` — **closed** (test tooling, small)

**syncup-live skips its storage checks on any error, which a real bug can now trigger; two suites still claim storage is unconfigured**

*Evidence:* Commit 6d8e26f named these as sibling suites 'the sweep will say'. The sweep cannot say, because a skip never turns red. syncup-live.mjs:1142-1147 skips the whole storageChain whenever upload-url answers >= 400. Every lane now has s3-stub, so a product 5xx is recorded as SKIP, which cbb92ab defines as 'a check that cannot fail'. Stale premises remain at syncup-live.mjs:1083 and 1126-1127 ('locally and in CI there is no bucket') and settings-depth.mjs:760-762 ('unconfigured here and in CI').

*To close:* Skip only when the deployment reports storage as unconfigured, never on any error status. Arrange the failure case through s3-stub's fail-next-put. Rewrite the three comments.

*Closed, 29 September.* syncup-live's storage chain skips only where both the
machine and the deployment say there is no storage: nothing answers on the
run's store port (`lib/store.mjs`; the section resets the stub, which is also
its own start-of-section rule) and upload-url answers the API's own 400 "Storage
is not configured". Any other refusal fails the five with its status and
message, and so does "not configured" on a machine that gave the API a store.
The failure case is arranged through `s3-stub`'s `fail-next-put`: armed before
the page's PUT, the PUT and the playback fail and the run is 59 of 59; a
never-recorded call's 400, five SKIPs and exit 0 before, is five FAILs after.
The two syncup-live comments and settings-depth's had been corrected in
`d5ef040`; 5b's now states the new rule. syncup-live 59/59 on lane 4.

### `suite-hygiene/more-hand-rolled-chains` — **closed** (test tooling, small)

**Further hand-rolled chains and literal-count loops the finder did not list**

*Evidence:* panel-collapse.mjs:674-710 hand-rolls a chain: a `drawerChain` label array, a manual `drawerAt` counter incremented before each check (695, 701, 704), and `drawerRest = (why) => { while (drawerAt < drawerChain.length) check(false, drawerChain[drawerAt++], why) }`. The same suite imports makeChain (28) and builds `chain` at 120. panel-collapse.mjs:1097-1106 keeps a literal 6-label array for the seeding-failed path that duplicates the pass sentences at 1052-1095. ui-sweep.mjs:584-587 reports `for (let n = 0; n < 4; n += 1) pal.step(false, …)` instead of a rest. pal is one 16-label chain (534-550) whose later steps continue after this block (sort chips, Docs/Tasks multi-select), so if the ⋯ section gains or loses a step, the literal 4 shifts every later sentence onto the wrong check instead of throwing.

*To close:* Use makeChain for drawerChain. Declare the tree-search sentences once and use rest(). In ui-sweep, split the ⋯ steps into their own chain so a rest() can fill exactly that section, or replace the literal 4 with a count derived from the labels.

*Closed, 29 September.* panel-collapse's phone drawer and tree search, and
ui-sweep's ⋯ section, are chains of `lib/chain.mjs`, with no hand-kept counter,
no second copy of the sentences and no literal count. The ⋯ has a chain of its
own, so without it exactly its four checks fail, with the reason, and the checks
after it keep their own sentences.

### `suite-hygiene/skips-reachable-by-product` — **closed** (test tooling, small)

**Counted skips gated on product state rather than on the machine**

*Evidence:* syncup-live.mjs:1093-1107 skips recordChain as 'the AI Notes entitlement is off' whenever the Record BUTTON is not visible, so a regression that hides the button becomes 3 SKIPs and exit 0 (done() at 268 exits 0 on skips). syncup-live.mjs:1142-1146 skips the 5-step storageChain on ANY upload-url status >= 400. calls.service.ts:769 answers 400 'This call was never recorded' before the storage check at 770, so a recording-start regression, or the exact historical bug that comment 755-767 describes, reads as 'object storage is not configured here'. A 5xx does the same. ui-sweep.mjs:450-459 calls skip('no known card on the board to click') when the Board shows no card, although ensureSweepFixture (lib/fixture.mjs:87-139) guarantees at least 6 tasks, so an empty board is a product failure.

*To close:* syncup-live: read the entitlement from the API and skip only when it is off; if it is on and there is no Record button, fail. For storage, skip only when a configuration read says storage is unconfigured (or an explicit env flag); otherwise step(false) with the status and message. ui-sweep: replace the skip with a chain step that fails.

*Closed, 29 September.* Both of syncup-live's recording gates now ask the
configuration and never the product. The entitlement is read from
`/feature-flags/resolved` (`ai.meeting_notes`) and only an explicit `false`
skips; with it on, a call that offers no Record control fails all three
recording checks in a sentence. Storage is item 2. ui-sweep's board section is
one chain: a board that does not draw the task this run added fails "clicking a
card opens the task", and a missing Board tab fails both checks instead of one.
Measured on lane 4 against scratch copies (no product change): a hidden Record
control read `51 passed, 0 failed, 8 skipped`, exit 0, before, and
`51 passed, 8 failed`, 59 of 59, after; the board's missing card read SKIP
before and FAIL after, 107 of 107. The tenant and deployment gates still skip,
counted: `51 passed, 0 failed, 8 skipped`. syncup-live 59/59 and ui-sweep
107/107 on lane 4.

### `suite-hygiene/syncup-live-dead-peer-branch` — **closed** (test tooling, small)

**syncup-live's 'peer state is not exposed' branch is unreachable and states a stale reason; if reached it would shorten the run**

*Evidence:* syncup-live.mjs:779-781: `if (!peers.instrumented) { console.log('  SKIP  peer state is not exposed for tests — falling back to the rendered tiles') } else { check(...) }` is 0 checks vs 1, and the SKIP is not counted (skip() at 200-203 is not called). But `window.__rundeskPeers` is set unconditionally by the suite's own addInitScript (388-396), and grep finds it nowhere in apps/. So `instrumented` is always true and the branch is dead. Its sentence describes a test-only product hook that the comment at 380-386 says was deliberately NOT built. The same pattern appears at 860-862 in outgoingVideoLabel.

*To close:* Delete the dead branch, or turn it into a failing check that says the instrumentation did not install. Do not print an uncounted SKIP.

*Closed, 29 September.* The branch for a missing peer wrapper is gone. The
wrapper is the suite's own init script, so its absence now fails "the two
browsers reach a connected peer connection" with that reason instead of
printing an uncounted SKIP about a product hook that was never built, and the
share chain's first sender step says the same. Measured on lane 4 with the
wrapper removed in a scratch copy: "58 of 59 checks ran" before, 59 of 59 with
the failure named after. syncup-live 59/59.

### `suite-hygiene/task-depth-inline-list-unbalanced` — **closed** (test tooling, small)

**task-depth's 'project with no list' branch reports 1 check one way and 0 (plus an uncounted log line) the other, and its check never runs on seeded data**

*Evidence:* task-depth.mjs:315-327. When the list select holds 1 option or fewer, `check(offered, 'a project with no list offers to make one right here', …)` reports 1 check. The else (324-327) reports 0 and prints `console.log('  ·  this project already has a list, so the inline creator was not needed')`. On the seeded DB the chosen project has lists, so the normal path is the uncounted one and the inline list-creator (§G15 [21:59]) is never exercised: a confident zero. Against a project with no list the run reports one check more than EXPECTED_CHECKS and prints the 'stopped early' headline. My balance scan found this. It is not among the 14 in unbalanced-else-branches.

*To close:* Arrange the precondition instead of reading it from ambient data: create a project with no list in the fixture and drive the inline creator there, so the check always runs. If it must stay conditional, make both sides report the same labelled check via makeChain(check).rest(why).

*Closed, 29 September.* The precondition is arranged rather than read from ambient data: `task-depth` makes a project
with no list, selects its space and it by value in the create form, and asserts every run that a project with no
list offers to make one right here, then makes the list inline and creates the task in it; the project is archived
after. `EXPECTED_CHECKS` 91 → 92. Before (lane 2, `d5ef040`): 91/91, with "this project already has a list, so the
inline creator was not needed" — the check had never run on the seeded data and the creator had never been driven.
After: 92/92, the check among the passes.

### `suite-hygiene/vacuous-absence-on-empty-read` — **closed** (test tooling, small)

**Absence checks that pass when the read came back empty or the fixture id is null**

*Evidence:* video-regression.mjs:381-384 reads controls with `.catch(() => '')`, and 399-403 `!/\bOther\b/i.test(controls)` then passes when the inbox-controls row is gone. task-cover.mjs:181 reads tabsText with `.catch(() => '')`; 182-186 ('nothing that only pretends to work') and 202-208 ('Search tab stays absent') both pass on a missing tablist. panel-collapse.mjs:959-967 reads emptied with `.catch(() => '')` and 'an emptied list is not silently refilled' passes when nav-favorites-list is missing. space-wizard.mjs:386-388 `!/Gantt/.test(row)` passes on an empty row. ai-activity-filters.mjs:166 `!idsOf(succeeded).has(forcedFailureId)` and 448 `[data-run-id="${forcedFailureId}"]` count === 0 both pass when forcedFailureId is null (no failed row was made). That happens on any model lane, and on a regression of the failure write. lib/fixture.mjs:244-247 states the rule these break: 'An absence is a claim only when the thing could have been present.'

*To close:* Carry the precondition into the condition: require controls/tabsText/emptied/row to be non-empty (or the container count to be 1), and require forcedFailureId to be non-null, in the same chk.

*Closed, 29 September.* An absence in these five suites is asserted only where
the read found the thing that could have held it — a row, strip or list that is
on the page and was read, or a row that exists. A missing container, or a row
never made, fails the check with that reason instead of passing it.

### `suite-hygiene/vr-invocation-skip-unreachable` — **closed** (test tooling, small)

**video-regression's counted skip for a WS-given invocation can never run; that path reports 3 checks short**

*Evidence:* NOTIFIED is assigned only inside `if (!WS)` (video-regression.mjs:58-77, line 70). When WS is given, `if (NOTIFIED)` at 410 is false, so the counted skip() calls at 429-432 (which exist for exactly the WS-given case, per 152-163) are unreachable. Execution falls into the else at 462-466, which prints an uncounted 'SKIP … "Clear all" not checked' through console.log and reports 0 of the branch's 3 checks. The comment at 152-163 and the ledger at docs/video2-reaudit.md:4035-4039 describe a fix that never takes effect. A failed ensureNotification (lib/fixture.mjs:177-201 returns null) also shortens the run by 3.

*To close:* Hoist the skip decision: if !API (invocation), skip all 3 via skip(); else if !NOTIFIED, fail all 3 with the reason (arranging a notification failed); otherwise run them. Use makeChain(chk, skip) for the block.

## Unbuilt features (buildable: research ClickUp where the frames stop) — 31

*Closed, 29 September.* The Clear-all decision is taken before anything is
read, in one `makeChain(…, skip)` of its three sentences: a run given `WS` has
no client and skips the three, counted; a discovering run whose notification
could not be arranged fails the three, each naming itself, because arranging
state through the product is the product. Measured on lane 4: given `WS`, the
block went from an uncounted SKIP line and no checks (88 of 94) to three
counted skips (91 of 94 — the remainder is A3.9's unbalanced `else`, which is
`unbalanced-else-branches`' `video-regression.mjs:700/712-714`, not this); with
the notification not arranged, from "91 of 94 checks ran" to 94 of 94 with three
FAILs. video-regression 94/94.

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

### `resume-defects/resume-8` — partly-fixed, large

**email.service send() still has no replyTo, cc or messageId, and task_comments still has no channel column**

*Evidence:* apps/api/src/modules/email/email.service.ts:584-611: send(opts: {to, subject, html, attachments}) calls transport.sendMail({from, to, subject, html, attachments}). There is no replyTo, cc, bcc, messageId, inReplyTo or headers. packages/db/src/schema/comments.ts:16-29: task_comments has id, taskId, authorId, assignedToUserId, resolvedByUserId, resolvedAt, parentCommentId, body, mentions, editedAt and createdAt, with no channel column and no email metadata. The migrations end at 0160_folder_description.sql, and the only ALTER of task_comments is 0006. Inbound mail becomes a comment with no channel marker (email-to-task.service.ts:284-316, appendComment inserts {taskId, authorId, body}), so today the thread cannot distinguish a comment that arrived by email either. I searched apps/api/src for an outbound composed-body route (`@Post(...email...)`, `this.email.send*` callers in task and comment modules): the only senders are notification templates (notifications.service.ts:1179, 1203, 1213).

*To close:* Extend send() with replyTo, cc, bcc and messageId/headers, and return the Message-ID. Add migration 0161: task_comments.channel ('comment'|'email', default 'comment') plus email metadata (to, cc, subject, message_id). Record outbound Message-IDs where resolveReplyContext can find them (see resume-8-reply-routing). Set the Reply-To to the task's `list-<alias>+task-<id>@domain` address; mint the list alias if none exists, because GET /tasks/:id/email-address (tasks.controller.ts:482-485) is the existing source of that address. Mark inbound appendComment rows channel='email' and render the channel in the thread. That is the mirror-defect guard: a stored channel must have a reader.

*Partly fixed, 24 September (with `resume-8-reply-routing`):* `send()` takes a Message-ID and a Reply-To and hands both to the transport. A comment notification's Message-ID is kept where `resolveReplyContext` finds it. Its Reply-To is the task's address when the list has an alias; none is minted. Left: cc and bcc; the comment's channel column and its reader; email metadata on a comment; minting an alias; and carrying a thread on the other notifications.

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

*To close:* Rotating placeholder: built 29 September (`commit-log/log-4ad25f6-1`). Credit meter: allowance and reset from ClickUp research, reading ai_usage. Composer '+': contents from ClickUp research (existing parts: knowledge tab, skills, @-mention search). Slide deck: frame 16:50 specifies an inline 4-slide embed; needs an artifact entity plus a renderer.

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

*Researched, 29 September* (help centre, through search excerpts). Not settled:
- The help centre documents the Planner sidebar's categories as fixed: Priorities, Assigned to me, Today & overdue, and Backlog. Backlog alone is configured (a List and filters). "Meet with" is a people search. Categories collapse and expand, and the whole sidebar hides. Planner settings have no Sidebar page ("Appearance, Accounts, Upcoming meetings, Time blocking, and AI Notetaker").
- The "+ Add a new section" the frame shows has no documented counterpart for the Planner or Calendar. The nearest is ClickUp 4.0's Home Sidebar custom sections: made with + › Section, named with an optional emoji, filled by hand (spaces, lists, tasks, docs, channels), each item in one section at a time, reordered in Customize › Sections, deleted without deleting what they hold.
- The Planner's help pages are moving under "Calendar" names, so the docs may lag the app. What a new Calendar section would hold stays a decision for the owner: hand-picked tasks, as the Home Sidebar does, or a filter, as Backlog does.

### `harness/model-lane-routing-unbuilt` — **closed** (test tooling, medium)

**No suite can be routed to a lane with or without a model; the model stub is wired but no suite exercises it**

*Evidence:* lane-env.sh:126-132 says 'Wiring that choice into the dispatcher is the next piece of this work and is NOT done'. Confirmed open. run-plan.sh:47-68 hands a set to any lane that is free and unlocked, and it never sources lane-env.sh or calls lane_has_model. No suite declares a lane need: a git grep for RUNDESK_LANE_MODEL, needsModel, 'Lane:' and LANE_NEEDS finds only two comments, at ai-create-containers.mjs:343 and ai-answer-rendering.mjs:532. wt-break.sh applies lane_model_env only inside restart() (:105 and :116), and restart runs only on a sync or an API patch. So a lane keeps whatever model configuration its last launcher had. create-menu-ai.mjs:193,323,489 and task-ai-bar.mjs:95,126,245 assert 'not configured' and would red their baseline on a model lane (wt-break exit 5). No suite drives the model stub's /__control seam: the only __control users in test/e2e are the storage stub in attach-on-create.mjs:321 and task-cover.mjs:512,598. So the modelConfigured===true branches in ai-create-containers and ai-answer-rendering have never been measured. Stale around it: fleet-restart.sh:120-121 says 'Off unless RUNDESK_LANE_MODEL=1 ... the six suites'. =1 now means lane 1 only (lane-env.sh:156-160), and there are four suites. lane-env.sh:89-95 says all four flip, but its own :111-116 says two were converted. docs/video2-reaudit.md:6665-6674 says 'It is wired into no lane' and 'Six suites'.

*To close:* Smallest correct routing: (1) each suite declares its need in a greppable header, e.g. `// Lane: no-model` on create-menu-ai and task-ai-bar, and `// Lane: model` on any suite that stages __control/next. (2) run-plan.sh sources lane-env.sh and skips a lane whose lane_has_model answer differs from the suite's declared need. If no lane in $LANES matches, it refuses loudly with a new exit code, so the plan is never silently burned. (3) wt-break.sh, before the baseline, asks the lane's GET /api/v1/ai/status and refuses (new exit) when `available` differs from lane_has_model, or else restarts. (4) A checker asserts that every suite asserting 'not configured' in a chk declares no-model. Then write the model-path checks against model-stub's __control/next, since the frames-do-not-specify reason is no longer accepted.

*Partly fixed, 24 September (with `found-24-sep/model-patches-measured-without-a-model`):* the break runner now chooses for a SET. A set with a patch whose header says it reddens only where a model answers runs with one, baseline included. The runner's stamp of what a lane serves carries the model, so a lane is re-synced whenever its model differs from what the set asked for, and no longer keeps its last launcher's configuration. `check-model-lanes.sh`, 5 of 5 mutations. What is left is routing by SUITE: (1), (2) and (4) above, so that an invoker who puts every lane on a model (`RUNDESK_LANE_MODEL=all`) cannot send `create-menu-ai` or `task-ai-bar` to one. And the model-path checks against `__control/next`. Since this row was written, `create-ai-results` stages the planner's answer by route rather than through the stub, and `workspace-read-access` reads the stub's `__control/seen`.

*Closed, 29 September:* routing by suite, (1), (2) and (4) above, with the refusal placed where every runner passes rather than in `run-plan.sh` alone.
- (1) A suite declares its need in its header: `// Lane: no-model — <why>` on `create-menu-ai` and `task-ai-bar`, the two that assert the assistant's refusal; `// Lane: model` for one that stages the stub. `suite_lane_need` (lane-env.sh) reads it.
- (2) `verify.sh` asks the RUNNING API — `/ai/status`, signed in as the lane's admin (`lane_api_has_model`), not `RUNDESK_LANE_MODEL`, which says what the launcher meant — and refuses a lane whose model the suite cannot pass on (exit 10; `sweep.sh` counts 6 to 10 as refusals). The break runner takes the model away from a set's lane when its suite declares no-model (`lane_model_remove`), and refuses a set whose patches need a model its suite refuses.
- (4) `scripts/check-suite-lane-need.mjs --mutate` (preflight, CI's verify job): a suite that tests an `/ai/` route's answer for "not configured" and never reads `/ai/status` must declare no-model; a declared need is one of the two; a no-model header over a suite that asserts no refusal is stale. On the suites before the headers: 2, `create-menu-ai` and `task-ai-bar`; now 0; 7 of 7 cases hold. `scripts/e2e-lanes/lane-need-selfcheck.sh --mutate` (the same two places): 14 cases — the need read from a header and not from an inline comment, every pair of need and lane answer, a lane taken out of a list and out of `all` — and 3 of 3 mutations caught.
- On lane 7 restarted with the model stub: `create-menu-ai` and `task-ai-bar` refused (exit 10), and the model paths measured for the first time — `ai-activity-filters` 34/34 (a provider failure staged through `__control/next`), `ai-create-containers` 33/33 and `ai-answer-rendering` 51/51, each reading `/ai/status` as configured. Lane 7 without a model again: `create-menu-ai` 24/24.

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

### `commit-log/log-4ad25f6-1` — **closed** (small)

**The rotating composer placeholder (frames 16:30-16:45) was built and then reverted; the reason for reverting has since gone away**

*Evidence:* Commit 4ad25f6 reverted the rotation because GET /ai/status answers available:false on every lane, so no suite could see it. It said wiring model-stub.mjs would make it measurable. Commit 6fbd79b then wired the stub behind RUNDESK_LANE_MODEL (lane-env.sh:161-177). ai-panel.tsx:1817-1822 still has three fixed placeholder states (working, unavailable, inputPlaceholder) and nothing rotates. Commit 4dacd13 also lists it as absent.

*To close:* Rebuild the four-sentence rotation on the resting state. Measure it on a lane started with RUNDESK_LANE_MODEL, and write a break patch that freezes the rotation. This depends on log-ad00a7c-1 so the suite lands on a lane that has a model.

*Closed, 29 September.* The frames are ClickUp's own. From `16:30` to `16:45`, the Brain² prompt's placeholder turns through four sentences with nobody touching the page: "Need help? Ask, search or create." / "From quick questions to big projects…" / "Type your request. I'll search, answer, or build it for you." / "Curious about something? Ask away." (`docs/video2-frame-observations.md`).
- The dock's composer, resting and ready, turns through the four every 3.8 s in the frame's order (four locales). A timer runs only while the composer rests on the invitation. Busy ("Working on it…") and unavailable ("AI is not configured on this server") keep their precedence, and nobody typing sees a placeholder.
- The reason it was reverted on 23 September is gone: lane 7 has a model (`log-ad00a7c-1`), so the resting state renders and can be read.

`ai-answer-rendering`:
- Its placeholder check asked for "Ask Rundesk AI anything…" where a model answers, and now takes any of the four. A new check reads two turns, each the next of the four, and where no model answers, that the refusal holds still.
- Before 50/52 on lane 7 (the old invitation, never turning) and 52/52 on lane 6. After 52/52 on both.
- `aar-24` (no timer; model lane) reddens the new check alone (51/52). `aar-10`, re-aimed onto the new resting state, reddens its check again with the two that follow from it (49/52). The same on the committed tree (lane 4 with a model, `2c78436`).
- Regression on lane 7: `brain-entry-points` 19/19, `command-palette` 43/43, `ai-create-containers` 33/33.
- Row 853 of the reaudit keeps its `M` for the credit meter, the composer "+" and the generated artefacts (`ledger-rows/row-853`).

### `commit-log/log-6b140c5-1` — **closed** (small)

**The 'Create Task ▾' chevron menu is missing**

*Evidence:* Commits 6b140c5, 4840344 and 446cdba held this back as 'blocked on the frames'. Ledger row 730 is marked B* with 'Create Task ▾ is the part still missing'. quick-create-modal.tsx:1596 has only the quick-create-submit button, with no chevron segment or menu.

*To close:* Research which options ClickUp's Create Task chevron offers, then build the split button with each option wired to real behaviour, plus checks.

*Closed, 29 September.* ClickUp (help centre "Create a task" and "Create tasks and subtasks on mobile", from search snippets; the pages themselves are refused by this machine's proxy): Create and close, Create and open, Create and start another ("resets the task creation modal") and Create and duplicate ("keeps its content open in the task creation modal"); on the web the button itself creates and closes, and its dropdown holds the other three. Here the button already went to the task it made, and still does, so the chevron beside it offers all four, and each makes the task once, the same way: Create and close closes the modal and leaves the page where it was, with frame `01:20`'s toast ("Task created — ‹title› › ‹list›", with View task); Create and open closes it and opens the task's sheet on its list, which for a list picked under the space alone the primary button never did; Create and start another leaves the modal open on a blank form in the same space, project and list; Create and duplicate leaves it open with everything kept. Both halves are live only with a title and a list and nothing in flight, the menu is drawn over the modal, and Escape on the menu closes the menu, not the modal. Four locales. `create-task-chevron`, 7 checks: before 1/7 on lane 2's current bundle (the primary button, which held); after 7/7 on lane 2; patches `ctc-1..12` each redden what they name and nothing else (lane 2, baseline 7/7); regression on lane 2, the 20 suites that open the create modal, 20/20, once a first Escape guard that cost `comment-plus-menu` its last section (11 of 13 ran) was replaced; in CI (241).
- In main after the merge, two defects found beside it are fixed and checked (`found-29-sep/primary-create-silent-under-a-space`, `found-29-sep/task-create-fails-silently`), so the suite has 9 checks: before 7/9 on lane 5 (checks 8 and 9), after 9/9 on lane 3. `ctc-1` is re-aimed onto the primary's new close-and-open, and reddens checks 1 and 8 (7/9, lane 5); `ctc-13` reddens check 8 and `ctc-14` check 9 (8/9 each, lanes 1 and 3), each a bundle built with the patch and the source put back.

### `ledger-rows/row-730` — **closed** (small)

**Comment ▾ is built (B*), but the 'Create Task ▾' menu is still missing, held only because no frame opens the chevron**

*Evidence:* reaudit.md:730 B*: the Email mode is listed but disabled with its reason, and 'Create Task ▾'s menu has no frame behind it'. Tree: task-detail-sheet.tsx:7224-7260 is the comment-mode menu (Comment ticked; Email `disabled`, data-available=no, with comment-mode-reason-email). quick-create-modal.tsx:1593-1600 `quick-create-submit` is a plain submit button with no chevron and no menu. The Email half depends on row-1252.

*To close:* Build the Create Task split button with the menu ClickUp actually offers (research lens: e.g. create-and-open / create-and-start-another / create-and-duplicate). Enable the Email mode once row-1252 lands.

*Closed, 29 September.* The Create Task ▾ half is built to ClickUp's menu and measured, as `commit-log/log-6b140c5-1` records: `create-task-chevron`, 7 checks, 1/7 before and 7/7 after on lane 2, patches `ctc-1..12`. The row keeps its `B*` in `docs/video2-reaudit.md`, and the asterisk now records the Email mode alone, listed and disabled with its reason. Enabling it is `ledger-rows/row-1252`'s, whose own To close says so ("it also closes row-730's first remainder"): nothing here sends a composed comment out, so the mode stays as it is until outbound mail lands.

### `resume-defects/row-730-create-task-chevron` — **closed** (small)

**Ledger row 730's 'Create Task ▾' is recorded as 'Blocked on the reference', so under the new policy it is simply unbuilt**

*Evidence:* docs/video2-reaudit.md:730 (B*) says '"Create Task ▾" is the part still missing, and its MENU has no frame behind it… Blocked on the reference'. :2822 repeats this. quick-create-modal.tsx:1586-1600 has Cancel and a plain `quick-create-submit` button with no chevron. A grep of apps/web/src for createAndOpen/createAnother finds only the workspace-index string. ClickUp research (help.clickup.com 'Create tasks and subtasks on mobile' and 'Create a task'): the Create Task split button offers Create and close, Create and open, Create and start another, and Create and duplicate. The same row must also be rewritten by the s4-composer-email work. This may belong to the blocked-rows lens rather than this one.

*To close:* Build the chevron menu to ClickUp's four options: close, open the created task's sheet, reset the form keeping list and location, and keep the content for a duplicate. Add checks that each option leaves the modal and route in the stated state and creates exactly one task, plus a break patch per option. Rewrite row 730 without the 'blocked on the reference' reason.

*Closed, 29 September.* Built to the four, as `commit-log/log-6b140c5-1` records, and each is checked for the modal, the page and the count, the count read by SQL in the list and by title: Create and close makes one task, closes the modal, leaves the page as it was and says so in a toast; Create and open makes one, closes the modal and opens the task's sheet on its list, here a list picked under the space alone; Create and start another makes one and leaves the modal open on a blank form in the same space, project and list; Create and duplicate makes one and leaves the modal open with the same title, description and priority. Patches per option: `ctc-4` and `ctc-5` (close goes to the task; close says nothing), `ctc-6` and `ctc-7` (open goes nowhere; open needs a project), `ctc-8` and `ctc-9` (another keeps the title; another drops the list), `ctc-10` (duplicate clears the form), and `ctc-11` (every item posts twice), which reddens all four; each reddened only what it names (lane 2, baseline 7/7). Row 730 (`docs/video2-reaudit.md:736` at `3ccd85d`) is rewritten without "blocked on the reference", and the B\* legend, §7's list of rows held back by the reference and a second "*Corrected 29 September*" paragraph say the same.

### `ledger-rows/row-743` — **closed** (small)

**Task header 'Brain²' button — absent; the reason 'the hub does not exist' is stale because the AI dock it would open exists**

*Evidence:* reaudit.md:743 `| M | Task header "Brain²" button — deliberate: the hub does not exist |`. task-detail-sheet.tsx:1445-1459 builds only the Created chip, and :1452-1454 says 'NOT "Brain²" beside it: that button leads to a hub this product does not have'. That hub now exists at /app/:ws/ai (workspace-ai-page.tsx), and every route has a dock: routes/app.tsx:78 aiAsk state, :91-94 `askAi(question)` opens the dock and asks, :173-190 `<AiPanel currentView=... ask=aiAsk persist>`. The same stale premise is repeated in TaskAiBar's comment at task-detail-sheet.tsx:577-581.

*To close:* Add the header button so it opens the shell AI dock with the task as context, using the same askAi/currentView seam the palette uses. Get the exact ClickUp behaviour (opens Brain scoped to the task) from the ClickUp research lens. Measure it on a model-stub lane. Update the stale comments.

*Closed, 29 September.* ClickUp ("Use Brain AI on tasks" and "Collaborate with ClickUp Brain anywhere in your Workspace", read through search summaries because this session's proxy refuses help.clickup.com): the task's upper-right Brain opens Brain in a side panel that by default reads only the task it was opened from, and offers Summarize, Progress update and Find similar tasks there. The row's reason was stale. The dock existed, and every turn it sends carries a view that the server writes into the model's context. Measured on lane 6 before, on the lane's own bundle: the Created chip was followed by the activity-rail toggle, and nothing on the sheet opened the dock (0 of 8).

- Brain², straight after the Created chip, opens the shell's AI dock through the palette's seam: `openAiOn` beside `askAi` in the shell, handed to the sheet as a context. The dock is pointed at the task. A chip names the task, and each turn names it to the server as `list / task "<title>" (id <uuid>)`. Pressed again, Brain² closes the dock.
- The dock stands beside the sheet. It is lifted to the sheet's z-50, and the sheet moves over by the dock's 380px; without the lift the dock opened under the sheet (`bep-4`). The dock follows the sheet to a subtask, and closing the task hands it back to the page. Four locales.
- The dock does not read the task's description or comments, because `POST /ai/chat` takes no task id. Reading them is an API change: a `taskId` resolved before the stream opens, checked with `assertTaskReadable` and read with `buildTaskSummaryInput`. Reported, not made.
- Found on the way: the dock read a refused turn's reason and answered "Sorry, I encountered an error. Please try again." in its place, and it read only the chat route's own error shape. It now answers in the server's words ("AI features are not configured" on a lane with no model).
- The comments that said the button could not be built now say what it does: at the Created chip, at the TaskAiBar, and in ai-panel on the starter surface.

`brain-entry-points`, 13 checks when it was built (14 since: the dock's answer to a failed stream, `found-29-sep/dock-answers-a-failed-stream-with-nothing`), of which 1–8 and 14 are this row's:
- Before: 0/13 on lane 6.
- After: 13/13 on lane 6.
- Patches `bep-1..9`: all nine redden their checks (lane 6, baseline 13/13).
- In CI (240).
- Regression on lane 6, 19 suites (the task menu and depth, the task header and rail, the comment composer, its menu, thread and recorder, the AI bar, the dock and the palette): 19/19.
- In main after the merge: 14/14 on lanes 1, 3 and 7 (7 has a model; the model branch ran for the first time), and the batch's sweep on the final bundles, 57 suites on five lanes at once (1,289 checks): 53 green, and the four that were not are accounted for — `brain-entry-points` twice (its fourteenth check counted answers, which a regenerate keeps level, and a cookie card drawn late covered the scope chip on lane 1; both fixed in the suite, 14/14 on lanes 1, 3 and 7), `workspace-delete-for-good` once (below), and `chat-message-actions` under the load (`found-29-sep/chat-message-actions-reads-after-fixed-waits`; 73/73 on an idle lane).

### `ledger-rows/row-751` — **closed** (small)

**'Brain' in the comment '+' menu — absent; an AI destination already exists (the comment AI panel), so the reason is stale**

*Evidence:* reaudit.md:751 `| M | "Brain" in the "+" menu — the Brain² hub does not exist |`. CommentPlusMenu (task-detail-sheet.tsx:7298+) renders assign, clip, mention-task, file, slash, emoji, new task/doc/whiteboard and no Brain. The comment AI panel exists: task-detail-sheet.tsx:6982-6995 `comment-ai-panel` (instruction in, draft out, Keep to apply), opened today by a space on an empty composer. The menu's header comment at :7285-7291 is itself stale: it says 'EIGHT are here' and that slash commands are absent, but `comment-plus-slash` is rendered.

*To close:* Add a 'Brain' item that opens comment-ai-panel (ClickUp research for any extra behaviour). Correct the CommentPlusMenu header comment.

*Closed, 29 September.* ClickUp ("Use Brain on task comments", read through search summaries): Brain opens from a task comment, by the Brain icon in the comment field or Space in an empty comment, to summarize the context, take action or craft a reply. That destination was already here. The row's reason ("the Brain² hub does not exist") had never been about it; the destination is the comment AI panel, which the space bar opens. Measured on lane 6 before, on the lane's own bundle: the "+" menu ran nine items and no Brain (0 of 5).

- Brain sits beside Add emoji, as frame `04:50` draws it, and opens the panel through the one opener the space bar also calls. Its first build left the cursor nowhere: the closing menu took focus from the prompt and let it fall to the page. The menu now puts the cursor in the prompt as it closes (`bep-11`).
- The panel's Summarize this task sends the task's id to `POST /ai/summarize`, which drafts from the task's description, activity, subtasks, blockers and comments. The four writing modes still send only the instruction. Nothing reaches the comment box without Keep. Four locales.
- CommentPlusMenu's header says ten of ten and why it stood at nine. The composer's and the catalogue's comments are corrected too.
- `comment-plus-menu` had a check that Brain stayed out ("and Brain, which has nothing behind it, is still absent"). It now follows Brain to the panel. `cpm-1`, re-aimed, unwires the row and reddens that check (baseline 13/13).

`brain-entry-points`, 13 checks when it was built (14 since), of which 9–13 are this row's:
- Before: 0/13 on lane 6.
- After: 13/13 on lane 6.
- Patches `bep-10..14`: all five redden their checks (lane 6, baseline 13/13).
- In CI (240).
- Regression: shared with row 743's, 19/19.
- In main after the merge: shared with row 743's.

### `ledger-rows/row-850` — **closed**, small

**Add to a colleague's priorities — refused on purpose; the frame's prompt names the assignee, so ClickUp research should settle it**

*Evidence:* reaudit.md:850 (M, 'the write takes no :userId, deliberately'). people.controller.ts:100-119: PrioritiesController writes only the caller's own. Reading someone else's already exists at people.controller.ts:90-97 (GET /people/:userId/priorities). task-detail-sheet.tsx:2611-2635 shows the prompt only when `userId === currentUserId`.

*To close:* Decide from ClickUp's behaviour whether assigning someone else offers to add the task to THEIR priorities. If yes, add a permissioned write, for example allowed to managers or the assigner of a task they can see.

*Researched, 29 September* (help centre, read through search excerpts; the hosts are not reachable from this environment). ClickUp settles it:
- "Members, Admins, and Owners can add tasks to other people's priorities" ("What are Personal Priorities?"; LineUp is now Personal Priorities). A guest cannot.
- A task's Priority field has "Add to Personal Priorities": pick a person's avatar. The task menu has Add to › Someone's Priorities.
- My Settings has "Ask to add task to priorities after assigning: Show a prompt asking if you'd like to add the task to the assigned member's priorities."
- The expanded view shows who added each task and when ("Added by", "Added at").
- A colleague's priorities are shown on their profile and in Teams Hub; a task the viewer cannot open reads "Private task".

*Closed, 29 September.* ClickUp settles it, so the refusal is gone. `POST /workspaces/:ws/people/:userId/priorities` adds a task to a colleague's list when:
- the caller is a member and not a guest (403);
- the colleague is a member (404);
- the body is a task, not a typed line (400);
- both of them can open the task, asked of each by `readableTask`: 404 for the caller, 403 for the colleague. ClickUp's sources do not say whether a task the colleague cannot open may be added, so the safe rule is taken.

A second add answers with the row that is there. Every row records who added it (`user_priorities.added_by_id`, migration 0167), and the list returns `addedBy`. Ticking, ordering and removing stay the owner's: the one who added a row gets 404.

Assigning a colleague now offers their priorities by name ("Add this task to <name>'s priorities?"). The offer follows the same "Don't ask again", is not made when the task is already open on their list, and is never made to a guest. The toast says whose list the task went on and opens their panel. The Planner rail and the person panel say "Added by" under a row somebody else added. Four locales.

`assign-to-priorities`, 10 checks, now 22. "Assigning a teammate raises no prompt" is replaced by the colleague half:
- Before: 9/22 on lane 7. The nine kept checks pass. The thirteen new ones fail: there is no prompt, and the route answers 404 "Cannot POST".
- After: 22/22 on lane 7, in each of four runs.
- `acp-1..29` are new. The 13 aimed at the suite each redden what they name, against the 22/22 baseline. The 16 unit claims each redden their test: 8 in `people.service.test.ts` (new, 8 tests) and 8 in `use-priorities.test.ts`.
- `a2p-1`, `a2p-2` and `a2p-5` are re-aimed. `a2p-1`'s teammate prompt now writes onto your own list, and reddens six checks.
- Regression on lanes 5–7 after the merge: 46 suites, each one that reads priorities, assignees, the Planner or the person panel, and `doc-import`. All 46 green, 1031 checks, among them `person-panel` 60/60 and `video-regression` 94/94 on the model lane.

Found while building it: `found-29-sep/priority-readd-answers-a-ticked-off-row`, `found-29-sep/priority-added-at-on-hover-only` and `found-29-sep/priority-field-adds-to-nobody-else`. The task menu's Add to › Someone's Priorities stays with `ledger-rows/row-845`; the route built here is the one it would call. The agent's note that the prompt could offer a colleague who cannot open the task does not hold: assigning refuses anybody who cannot see the task, judged as an assignee (`assertPersonCanSeeTask`), and the prompt follows only a successful assignment. So it is not recorded as a defect.

So the write takes a person: a member, admin or owner may add a task they can see to anyone's priorities, and the prompt after assigning offers the assignee's. Not settled by the sources: whether a task the colleague cannot open may be added; the safe rule is to refuse it.

### `found-24-sep/workspace-audit-log-not-in-settings` — **closed** (unbuilt, medium; found fixing the console's audit log)

**A workspace's admins cannot read its audit log: the web shows it only in the super-admin console**

*Evidence:* `GET /workspaces/:id/audit-logs` and its export are guarded by `WorkspaceAdminGuard`, so a workspace admin may read them. The only page that reads them is `/app/admin/audit`, and `/app/admin` lets in a super-admin only. ClickUp puts the audit log in the workspace's own settings, for its owner and admins (an Enterprise feature there), with filters by date, event and user, and a CSV export.

*To close:* research ClickUp's audit log page — its event categories, filters and export — then give workspace settings an "Audit log" tab for owners and admins that reads the same routes as the console page. A suite: a workspace admin reads their own workspace's events and not another's, and a member is offered no tab.

*Closed, 29 September.* ClickUp ("Workspace audit logs"): generated in the Workspace's Settings, each event with its date, user, role, event and status, filtered by user, event type and date. The routes already asked `workspace.audit.view` (since `role-editor-offers-unenforced-permissions`); what was missing was a page. Measured on lane 7 at `d86220d` before: a workspace admin who is no platform admin, and a member granted the key, were offered no Audit log tab (the address sent the member to Archived), and nothing in Settings read the trail.

- The console's page is now a panel, `AuditLogPanel`: the trail's filters (date range, actor, event group, search), its rows and Export CSV. The console hands it its workspace picker; Settings hands it none.
- Settings has an Audit log tab, keyed by `workspace.audit.view` (an admin's by default, and a custom role's where one grants it), reading the workspace's own trail. Four locales.

`audit-log-settings`, 4 checks:
- Before: 1/4 on lane 7 (a plain member refused, which held).
- After: 4/4 on lane 7.
- Patches `als-1..5`; `aap-2` is re-aimed onto the console's picker. Their runs follow the commit.
- In CI (234).
- Regression on lane 7, 16 suites (the console's audit page, Settings' tabs by key, custom-role grants, the admin-key pages): 16/16.

### `found-25-sep/connected-calendars-read-by-nothing` — open, unbuilt (large; found closing `meetings-connect-calendar-goes-to-settings`)

**A connected calendar's events are read by nothing, and three sentences say they are**

*Evidence, read:* the Meetings page's "Upcoming" reads the `meetings` table, which only calls and `POST /meetings` fill (`MeetingsService.upcoming`). The planner's grid draws `task_time_blocks`. The only reads of a person's calendar accounts are the picker's list and free/busy (`externalBusyWindows`, for the people panel). The inbound pull (`pullEvents`) turns the WORKSPACE connection's events into tasks, and nothing calls it on a schedule (`ledger-rows/row-1874`, the sync button). Nothing writes an event to the default account ("New events go here").

The sentences:
- Meetings: "Connect a calendar and your meetings will show up here." Corrected with the item above.
- Accounts page, `plannerAccounts.noneHint`: "Connect one and your events appear on the Planner, and your tasks can go the other way."
- Accounts page, `plannerAccounts.subtitle`: "One is where new events are created".

ClickUp (help centre, search snippets): the Planner "syncs with your connected Google or Outlook Calendar", two-way, and upcoming meetings come from it (the AI Notetaker joins the meetings on the connected calendar).

*To close:* read each connected account's events for a window (Google `events.list`, Graph `calendarView`), with the providers' base addresses overridable so a lane stub can answer, and draw them on the grid and in "Upcoming". Write a new event to the default account. Until then, correct the two Accounts page sentences.

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

### `product-siblings/assign-with-ai-picker-unbuilt` — **closed** (unbuilt control, medium)

**'⚡ Assign with AI' is marked B in the ledger but closed only via the API; the assignee picker still says it is not built, for a reason that is no longer true**

*Evidence:* The frame (docs/video2-frame-observations.md:396-399, 15:45) puts the control in the ASSIGNEE PICKER footer. docs/video2-reaudit.md:847 marks it 'B … closed by ai-assign.mjs', but :231-236 of the same doc says 'Not built there, on purpose'. task-detail-sheet.tsx:3256 and :3264-3270 say NOT built because the AI 'cannot CHOOSE the person'. That is stale: ai.service.ts:3036 suggestAssignee does exactly that, and ai.controller.ts:519-540 exposes it 'because the assignee picker is a menu'. The only callers of /ai/assignee-suggestion are test/e2e/ai-assign.mjs:99 and the chat tool (ai.service.ts:1814). No web code calls it (searched 'assignee-suggestion', 'suggestAssignee', 'assign with ai').

*To close:* Add the picker footer item: call GET /ai/assignee-suggestion?taskId, show the pick and its numbers, and assign on confirm. Correct the comments at :786-790 and :3256-3270 and the two contradictory ledger passages. Add a UI check to ai-assign.mjs.

*Closed, 29 September.* Frame `15:45` puts "⚡ Assign with AI" in the assignee picker's footer; `GET /ai/assignee-suggestion` already chose (each person who may take the task, ranked by the open work they carry — in the task's list, which counts for them, and overall — with the reason in their own numbers, needing no model). Measured on lane 7 at `d86220d` before: the picker had no such footer (0 of 2).

- The picker's footer asks the route when pressed (not with the picker: it reads the workspace's open work), then shows the pick by name with the reason, the runner-up, and a button that assigns the pick. Nothing is assigned until it is pressed. A refusal (nobody else may take it, no permission) is said in the route's words. Four locales.
- The comments at the picker that said it was not built "because the AI cannot CHOOSE the person" now say it is; `docs/video2-reaudit.md` no longer says both (its "not built there, on purpose" passage and its row say the same thing now).
- The UI check is its own suite rather than a section of `ai-assign.mjs`, which stays the route's.

`assign-with-ai-picker`, 2 checks:
- Before: 0/2 on lane 7 (the picker had no footer).
- After: 2/2 on lane 7. Its first run staged the other members' open work in the task's own list and read the busy member as the pick: work in the same list counts for whoever carries it (they hold the thread). That is the route's rule, and `ai-assign.mjs` stages its load in another list for the same reason; the suite now does too.
- Patches `awa-1..6`: the footer gone, the runner-up offered as the pick, the reason dropped, the pick assigned before anybody confirms, the confirm dead, the confirm assigning the runner-up. Their runs follow the commit.
- In CI (236).
- Regression on lane 7, 22 suites (webhooks, goals, notification settings, the assignee picker, the AI assignment routes, settings tabs), with both new suites: 22/22.

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

### `commit-log/log-3100ba1-1` — **closed** (already fixed, small)

**The create-modal placeholder and its ⚡AI button are built and tested, but the ledger counts the row as missing**

*Evidence:* Commit 3100ba1 (21 Sep 19:10) wrote 'Left M with the reason on the row'. Ledger row 791 still reads 'M ... Left M rather than built'. The feature went in three hours earlier in 666f15f (16:15). catalogs.ts:2211 has 'Add description, or write with ⚡AI'. quick-create-modal.tsx:703-734 and 1330-1351 wire a live button to /ai/task/generate. create-menu-ai.mjs:449-484 checks both. The frame citations also conflict: the code and the suite cite frame 10:04, while ledger §7 (line 2981) says 09:54-10:08 are all Board view.

*To close:* Re-extract frame 10:04. Then move row 791 to B, or strike it as answering no frame (as the tab-title countdown was), and let check-video2-counts recompute 148/11/14.

*Closed, 29 September, as already fixed:* `ledger-rows/row-791` did what this asks. Frames 10:02 to 10:06, re-extracted from the video, show the create-task modal with its placeholder, so row 791 is `B` (closed by `create-menu-ai`), §7's "all Board view" is corrected, and `check-video2-counts.mjs` holds the recomputed totals, 151 · 9 · 13 of 173.

### `commit-log/log-6f62af6-1` — partly-fixed, small

**The end of the third Teams carousel card is our own wording and is not checked**

*Evidence:* Commit 6f62af6: the third card is cut off in the frame, 'its tail is written by me' and is not checked. catalogs.ts:2831-2835 reads 'Stay focused with Priorities' / 'Instantly know what each team is working on ...'.

*To close:* Research ClickUp's actual Teams empty-state card copy, use it in all four locales, and check it.

*Researched, 29 September:* not settled by public sources. ClickUp's pages describe Priorities in Teams Hub ("see what each person is working on", "share and compare priorities") but not the empty state's carousel copy, and no page quotes the third card. The frame's beginning stays, and the tail stays ours until the owner or a later frame gives the real one.

### `ledger-rows/row-2398-remainder` — **closed** (small)

**Teams 'All People' count badge — an open remainder inside a B row, counted nowhere**

*Evidence:* reaudit.md:2404 draws 'All People' with a count (2); :2416-2417 says 'The People count badge … is NOT part of this closure and stays open'. workspace-teams-page.tsx:218-241: the tabs teams/people/chart render a label and icon and no count.

*To close:* Add the member count to the People tab and a check for it. Record it as a B* or its own row so it is counted.

*Closed, 29 September.* Measured on lane 4 before: All People drew its label
and icon and no number; `teams-people-count` 2/6, the two that hold when nothing
is drawn. Frame `21:00`: All People, and no other entry, carries `2`, muted at
the right of the row. ClickUp (help centre, from search snippets): All people is
for viewing the people who have joined the Workspace, and people invited who
have not joined are under Pending. The People tab now carries the number of
members it lists, from the same query, drawn once the list has answered (a 0
while it loads would say the workspace is empty), not narrowed by a search, and
said in full to a reader ("4 people in this workspace"); four locales. It is its
own row in `video2-reaudit.md` §2 (S18–S22), `B`, so §4 moves to 174 rows, 152
built, and the handoff document's headline with it; `check-video2-counts` read
the handoff's total as a literal 173 and compares it with §4 now.
`td-2-analytics-appears` is re-aimed onto the `</button>` that closes the tab
map and reddens both its checks (lane 4, baseline 14/14).
`teams-people-count`, 6 checks: 6/6 after, on lane 4; patches `tpc-1..6` each
reddened the check it names (lane 4, `3ccd85d` with this change, baseline 6/6);
regression as above, 24/24. In CI (240).
- In main after the merge: shared with `row-835-reorder`'s.

### `ledger-rows/row-780-remainder` — **closed** (already fixed, small)

**Sidebar 'new folder here' dialog still posts only {name} — a second create path that the frame's dialog fields never reached**

*Evidence:* reaudit.md:780 (B) says 'The sidebar's own inline "new folder here" dialog still posts { name } alone — recorded rather than built, because it answers no frame'. workspace-sidebar.tsx:745-751 submitCreateFolder does `api(`/spaces/${...}/folders`, { method: 'POST', body: { name } })`. The quick-create Folder tab carries description, private and location.

*To close:* Point the sidebar entry at the shared Create Folder dialog (quick-create-modal FolderForm with initialSpaceId) instead of a second form.

*Closed, 29 September, as already fixed:* `commit-log/log-a0b4108-1` did it. The sidebar's "New folder" opens the Create menu's Folder form on its space (`spaceCreate`, `initialSpaceId` in `workspace-sidebar.tsx`), the way its "+" menu opens the other types, and the sidebar's own `{name}`-only dialog is gone. `folder-create` drives the sidebar path. There is one folder form, with the frame's fields.

### `ledger-rows/row-835-reorder` — **closed** (small)

**Planner rail 'reorder' is recorded as built but does not exist; the stored order is a mirror no reader honours**

*Evidence:* Frame 14:10 draws 'Show, hide and reorder…' with drag handles (video2-frame-observations.md:353-355). reaudit.md:835 and :6617 both say the five sections 'are built there with show, hide and reorder'. planner-settings-dialog.tsx:618-633 renders only a Switch per section, with no drag, sortable, move or arrow code in the file. workspace-planner-page.tsx draws sections in fixed JSX order (railOn gates at :1242, :1336, :1482, :1506, :1550) and reads settings.railSections only via .includes (:1011), so the array's order is read by nothing. The planner-settings.mjs checks (:314-328) assert only on/off. This falsifies the ledger's claim at reaudit.md:6624-6632 that 'Not one error ran the other way — nothing recorded as built turned out to be absent'.

*To close:* Add drag or up/down reorder to the Sidebar settings page. Render the rail in railSections order, with RAIL_SECTIONS as the default order. Add a check that a reordered rail renders in the stored order and survives reload. Correct rows 835 and 6617 and the 'one direction' paragraph.

*Closed, 29 September.* Measured on lane 4 before, against its bundle: with an
order stored Backlog first, the rail drew Priorities, Meet with, Team schedules,
Assigned to me, Today & overdue and Backlog, as it always had, and the Sidebar
page drew five switches and no grip; `rail-reorder` 0/12. The page is drawn at
`14:13`–`14:16`, not `14:10`: a box and a grip on each of the five, and at
`14:13` the open hand over Priorities' name. ClickUp (help centre, from search
snippets): the Home Sidebar's sections are reordered by drag and drop; no
snippet describes the Planner's Sidebar page. `railSectionsShown`
(`planner-settings-dialog.tsx`) is now the one reader of `railSections` — the
shown sections in the stored order, the frame's five when nothing is stored, a
name that is no section or a repeat passed over — and the rail and the Sidebar
page both draw what it returns. The page draws the frame's heading and sentence
and a row per section with a box, its name and a grip; a row is dragged by
itself, or moved a place with ↑/↓ on its grip, and the save is optimistic, so
the row and the rail behind the dialog move at once and a refusal puts them
back. A cleared row sinks under the shown ones with no grip and, ticked again,
joins the rail at the foot; Team schedules rides under Meet with, and at the
foot when Meet with is hidden. Four locales, no API change. The sidebar row, the
sharpened-reason paragraph and the "one direction" paragraph of
`video2-reaudit.md` are corrected where they stand, the wrong words quoted.
`rail-reorder`, 12 checks: 12/12 after, on lane 4; patches `rro-1..9` each
reddened the check it names (lane 4, `3ccd85d` with this change, baseline
12/12); regression on lane 4, the 24 suites that open the planner, its settings
or the Teams page, 24/24. In CI (240).
- The server's half, which the build left open (`found-29-sep/rail-sections-kept-as-sent`): `railSections` was kept as sent. `updateSettings` now stores the five sections, each at most once, and refuses anything else, saying which. The check that the rail passes over a stranger and a repeat writes them in Postgres now, and a thirteenth check reads the refusal: before 12/13 on lane 5 (the server stored `["backlog","backlog"]`), after 13/13. Patch `rro-10` reddens it (12/13; lane 1, `096fa62`), and `rro-1..9`, re-run there, redden again.
- In main after the merge: `rail-reorder` 13/13 and `teams-people-count` 6/6, and the batch's sweep on the final bundles, 57 suites on five lanes at once (1,289 checks): 53 green, and the four that were not are accounted for — `brain-entry-points` twice (its fourteenth check counted answers, which a regenerate keeps level, and a cookie card drawn late covered the scope chip on lane 1; both fixed in the suite, 14/14 on lanes 1, 3 and 7), `workspace-delete-for-good` once (below), and `chat-message-actions` under the load (`found-29-sep/chat-message-actions-reads-after-fixed-waits`; 73/73 on an idle lane).

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

### `ledger-rows/ledger-defects-fixed-unmarked` — **closed** (stale doc, small)

**'Defects found while checking' carries four entries fixed in code but not marked fixed (one explicitly says 'Not fixed')**

*Evidence:* (1) reaudit.md:2572-2580: ai-value-panel tiles outside the loading guard. Fixed: ai-value-panel.tsx:461-477 'DEFECT, FIXED HERE' plus ai-value-categories-skeleton. (2) reaudit.md:2581-2587: SearchService injected and never called. Removed: ai.service.ts:916-922. (3) reaudit.md:2588-2590: disabled input keeps the ask placeholder. Fixed: ai-panel.tsx:1817-1823. (4) reaudit.md:2641-2645: palette-more-types-menu has no Escape, '*Not fixed.*'. Fixed: command-palette.tsx:705-709 onEscapeKeyDown closes typeMenuOpen and preventDefaults the dialog close. Also reaudit.md:4599-4603 says container create is ungated and 'it is open', while resume.md:201-206 records it FIXED 21 September (assertCanCreateInSpace).

*To close:* Strike each one with the fixing location, so the open-defect list is only what is open.

*Closed, 29 September.* The five entries are struck where they stand, each with
the commit that fixed it and where: the category grid inside the loading branch
and its own skeleton (`43f7b57`), the `SearchService` injection removed
(`43f7b57`), the composer's three placeholders (`43f7b57`, reddened by
`aar-10-placeholder-never-changes`), the palette menu's Escape (`5d224bb`,
checked by `command-palette.mjs`), and container create gated by
`assertCanCreateInSpace` (`59062a8`, `space-default-permission.mjs` 18 → 22
checks, 36 now). The text as found stays under each. No suite names the tiles'
skeleton. Three other entries under "Added 21 September" still read *Not
fixed* although the ledger closes them under other ids
(`ledger-rows/defect-calendar-toggles-before-settings`,
`ledger-rows/defect-projects-position-unordered`,
`found-25-sep/oauth-start-answers-for-no-application`); they were left for those
items.

### `ledger-rows/ledger-model-stub-stale` — **closed** (stale doc, small)

**The ledger still says the model stub is wired into no lane and that six suites assert the refusal, which is the premise behind the placeholder revert and 'AI unmeasurable'**

*Evidence:* reaudit.md:2876-2882 says 'Not wired into the lanes, deliberately'. reaudit.md:6664-6674 says 'It is wired into no lane' and 'Six suites assert the AI-unavailable state'. scripts/e2e-lanes/lane-env.sh:88-175 wires it per lane (RUNDESK_LANE_MODEL=all | list | unset, lane_model_env exports ANTHROPIC_BASE_URL) and counts FOUR suites / 21 assertions. Two are already converted (ai-create-containers 33/33, ai-answer-rendering 51/51, run both ways). Commits 6fbd79b and ad00a7c. What is still genuinely open, per lane-env.sh:131-132: 'Wiring that choice into the dispatcher is the next piece of this work and is NOT done'.

*To close:* Rewrite both ledger passages to the current state and name the one remaining step (dispatcher routes create-menu-ai/task-ai-bar to no-model lanes, the rest to model lanes). That step is what unblocks the rotating placeholder (row 853) and the AI field types (row 719).

*Closed, 29 September.* Both passages state what is true now. The stub has been
wired per lane since 23 September (`6fbd79b`, then `ad00a7c`): a lane gets it
when `RUNDESK_LANE_MODEL` names it, and a break set whose patch needs a model
gets one, baseline included. `ai-create-containers` and `ai-answer-rendering` ask
`/ai/status` and hold either way. The six of the old count were four, and the
count missed `ai-activity-filters`, so three suites stand on the refusal today:
`create-menu-ai`, `task-ai-bar` and `ai-activity-filters`. Both passages name the
one step left, routing each suite to a lane by that need
(`harness/model-lane-routing-unbuilt`), and say it is what the rotating
placeholder and the AI field types wait on.

### `commit-log/log-666f15f-2` — **closed** (stale doc, small)

**The ledger's B* legend still says those suites have never been run or registered**

*Evidence:* Ledger lines 801-810 say the B* suites 'have not been run' and 'are not registered in ci.yml'. list-customize and list-assignee-filter, cited on the B* rows, are in ci.yml, and resume :94 lists list-customize as a green baseline (762c22d: 'Every suite is registered'). §4 line 947 already uses B* to mean something else: 'built, with the remainder written down'.

*To close:* Replace the legend with the §4 meaning and drop the not-run claim.

*Closed, 29 September.* The legend says what the asterisk means, the meaning §4
uses: a built row that also records something the frame asks for and Rundesk
lacks. It names the two rows that carry one, the Comment split button and the
plan-tier paywall. The not-run meaning is recorded as history: `2b7897a`
registered both suites green on 21 September, and on 24 September they ran 37 of
37 and 29 of 29 with every break patch reddening. The §0 entry that first made
the claim is struck with the same facts.

### `commit-log/log-ad00a7c-2` — **closed** (stale doc, small)

**Comments still describe the model flag as it was before it changed**

*Evidence:* fleet-restart.sh:120-121 says 'Off unless RUNDESK_LANE_MODEL=1 - see lane-env.sh for the six suites'. Commit 7c4ac44 re-measured it as four suites, and commit ad00a7c changed =1 to mean lane 1 only. lane-env.sh:88 ('GATED ON RUNDESK_LANE_MODEL=1') and :129 ('RUNDESK_LANE_MODEL=1 is read per lane') still present =1 as the on-switch. ai-create-containers.mjs:343 and ai-answer-rendering.mjs:532 use the same spelling.

*To close:* Reword all of these to the list syntax (all, or a list of lane numbers) and to the count of four suites.

*Closed, 29 September.* Every comment that spelled the switch `=1` spells it as
the list it has been since `ad00a7c`: `all`, or lane numbers, and unset is none.
The count is not repeated in `fleet-restart.sh`; it points at `lane-env.sh`,
which now says four suites asserted the refusal when they were counted on 23
September, that two have since been re-aimed, and that the count missed
`ai-activity-filters`: three stand on the refusal today. The item asked for
"four", and four is no longer true.

### `commit-log/log-e44622e-1` — **closed** (stale doc, small)

**The handoff doc docs/video2-resume.md is stale again in many places**

*Evidence:* Commits e44622e and 10b4086 corrected this doc once already. Now: :41 says '113 suites ... ALL 113 are registered' (there are 115 suite files and doc-import is unregistered). :66-74 has a table of 50 green, 1 refused, 6 unreadable and 44 not run, while check-break-reddened reports 115 of 115 proven and 828 reddened. §3 #4 (:234-236) lists the timeline projectId as open, but commit 07d9208 settled it as not a defect and added a check (gantt-29). §6 :316-322 says 150 minutes and 98 suites and 'Split the job before adding the tenth', while ci.yml:428 is 180 and the job has 109 steps, unsplit. :185 and :285 recommend drain.sh. check-video2-counts guards only the headline count.

*To close:* Rewrite §2, §3, §5 and §6 from the checkers' current output, and consider guarding the suite and registration counts the same way the headline is guarded.

*Closed, 29 September.* The handoff's counts are the checkers' own, dated 29
September at `d86220d`: 239 suites, all 239 registered (233 of them in
`postgres-harnesses` and 6 in `browser-suites`, by the jobs' `run:` lines), 3,643
checks, no suite without a patch, and 62 suites with a patch measured against
this tree, 259 such patches reddening what they claim and 1,657 measured against
a tree that has moved.
The 21 September figures stay, marked as that day's. §3 item 4 is closed by
decision (`07d9208`, `gantt-29-projectid-ignored` 29/1 at `8ba0bacd`), with its
residue removed in `8ba0bac`; item 8 is partly fixed; item 3's count is dated.
§5 spells `fleet-up.sh` as a list. §6 gives 233 suites and 300 minutes and
points at the job's comment for the history instead of keeping a second copy.
The item's suggestion to guard the suite and registration counts the way the
headline is guarded was not taken up.

### `harness/log-tree-header-contradicts-body-rule` — **closed**

*Closed:* the header states what a run depends on as the code now asks it — suite, its `test/e2e/lib` helpers, the product files, the patch's own code (comments stripped) and a pending `# Re-run:` — and that `makeMeasurementCheck` is the one question all three instruments ask; freshness's copy of the old premise went with `planner-ignores-patch-body`.

**log-tree.mjs header and check-break-freshness still say the patch file is not a dependency**

*Evidence:* scripts/lib/log-tree.mjs:33-37 says 'WHAT A RUN DEPENDS ON: the suite ... and the product files the patch edits. Not the patch file itself'. The same file at :166-178 says 'THE PATCH'S OWN CODE IS A DEPENDENCY, AND ITS COMMENTS ARE NOT'. scripts/check-break-freshness.mjs:157-160 repeats the old premise ('The patch files themselves are left out') and acts on it. That old premise is what never-run-plan.mjs also still follows (see planner-ignores-patch-body).

*To close:* Rewrite log-tree.mjs:33-37 to state the body rule. Fix freshness in code as part of planner-ignores-patch-body, not by editing the comment only.

### `commit-log/missed-ci-meili-1` — **closed** (stale doc, small)

**ci.yml claims the e2e job runs a real Meilisearch; it runs none**

*Evidence:* ci.yml:405-407 ('duplicating the Postgres + Meilisearch + build setup') and :576-578 ('a real Postgres and a real Meilisearch' for addressability-live) claim a Meilisearch. The job's services block (ci.yml:430-453) defines only postgres. A case-insensitive search for 'meili' across .github/workflows finds only those two comments, with no service and no MEILI environment variable. So search in CI always takes SearchService's database fallback, which means log-68c0345-1's 'unmeasurable' also covers CI.

*To close:* Either add a getmeili/meilisearch service and its environment variables to postgres-harnesses, and then point doc-import at indexing, or correct both comments so they stop claiming coverage that does not exist.

*Closed, 29 September.* Both `ci.yml` comments stop claiming a Meilisearch: the
split would duplicate the Postgres, object-store and build setup, and
`addressability-live` runs against a real API and a real Postgres, with search
on `SearchService`'s Postgres fallback because no lane and no CI job starts
Meilisearch or sets `MEILISEARCH_URL`. The suite's own header says the same.
Nothing was added to CI, so the Meilisearch path stays unmeasured there.

### `commit-log/missed-d840b55-1` — **closed** (stale doc, small)

**d840b55 said every comment naming break-queue.sh was updated; four still name it as a live consumer**

*Evidence:* Commit d840b55 deleted scripts/e2e-lanes/break-queue.sh and says 'The three comments that referenced it now name the runner'. Yet syncup-live.mjs:259 and video-regression.mjs:1055 still say the summary line is kept because `scripts/e2e-lanes/break-queue.sh` parses it. wt-break.sh:461 says 'Named here so `break-queue.sh` can count it'. test/e2e/breaks/emoji-picker-2-data-inlined.py:28 says 'break-queue.sh counts a run with no summary as CRASHED'. In the same class, fleet-up.sh:11 sends the reader to 'break-fleet.sh', which `git log --all` shows never existed.

*To close:* Rename each reference to the real consumer (wt-break.sh plus classify-break-log.awk, or run-plan.sh), and fix the pointer in fleet-up.sh. Consider having check-suite or preflight fail on comments that name a script path that does not exist.

*Closed, 29 September.* No comment names `break-queue.sh` as a live reader any
more. The two suites name what parses their summary line today, the patch names
what counts a run with no summary as crashed, and the classifier's header no
longer claims a runner calls it. `wt-break.sh` and `fleet-up.sh` had already been
corrected by the two `harness/` items closed before this one. The suggested gate
(check-suite or preflight failing on a comment that names a script path that
does not exist) was not added.

### `harness/resume-doc-harness-stale` — **closed**

*Closed:* §2's drain paragraph had already been corrected (run-plan.sh, never-run-plan.mjs, drain.sh deleted) and §5 is accurate; §6 now gives the dated count (117 when this closed, 119 after `webhook-access` and `permission-guards`), about 1.1 minutes each, `timeout-minutes: 180`, and points at the job comment and `check-suites-registered.mjs` instead of a count that drifts.

**video2-resume.md describes retired harness state**

*Evidence:* docs/video2-resume.md:185-187 says 'drain.sh walks that queue ... The patch scripts themselves live in the scratch directory and do NOT survive the container'. 833 patches are tracked in test/e2e/breaks, and drain.sh runs /tmp copies (see sweep-drain-run-stale-tmp-copies). :284-288 presents drain.sh as current. §6 at :316-322 says postgres-harnesses runs 98 suites under a 150-minute timeout. ci.yml now has 115 test/e2e invocations and timeout-minutes: 180 (ci.yml:428).

*To close:* Rewrite §2's drain paragraph and §5 to point at run-plan.sh, chain-plan.sh and never-run-plan.mjs. Update §6's numbers.

### `ledger-rows/row-2270` — **closed** (stale doc, small)

**§5 row 2270 (P, project-status per-status breakdown) is STALE: the breakdown is built and measured**

*Evidence:* reaudit.md:2270-2286 says P: 'There is no per-statusCategory count anywhere in the context'. Tree: ai.service.ts:176-201 WorkspaceStatusBreakdown and :230-241 emit 'Task status breakdown (EVERY task in this workspace…)' with by-category and by-status lines. It is wired into the chat context at :1996 and :2018, workspaceStatusBreakdown is at :2041, and GET /ai/project-status is at ai.controller.ts:592-599. Measured by ai-create-containers.mjs:425-455. Built in 43f7b57 (2026-09-20). The §5 counts table (reaudit.md:2747) and §4's '4 P' in §5 (reaudit.md:937) still count it P.

*To close:* Re-read and mark it B, keeping only the model-written answer as a remainder, which can be measured on a model-stub lane. Adjust §4 §5 split (P 4 -> 3 or fewer).

*Closed, 29 September.* The row is `B`, closed by `ai-create-containers`, 33 of
33: `GET /ai/project-status` answers with no model, its two breakdowns add up to
its own total, and one in-progress task moves it by exactly one, and two patches
redden those checks. The same object is written into the chat's context and
served by the endpoint, and two more suites check it counts only what the reader
may open. What stays open is the answer itself: nothing yet reads the breakdown
in a prompt or in what a model writes, which a suite sent to a lane with the
model stub can. §5 moves from 32 · 4 · 5 to 34 · 2 · 5 with the busy-state row
below.

### `ledger-rows/row-2374` — **closed** (stale doc, small)

**§5 row 2374 (P, AI busy state in words) is STALE: built and measured; only the frame's exact words differ**

*Evidence:* reaudit.md:2385-2388 says 'a spinner and nothing else' and that the disabled input keeps 'Ask Rundesk AI anything…'. Tree: ai-panel.tsx:523-570 AiBusyState (ai-busy-state, ai-busy-label, states thinking/acting/writing derived from stream signals). :1817-1823 shows 'Working on it…' while streaming and placeholderUnavailable when disabled. Measured by ai-answer-rendering.mjs:577-590 through route interception, so no model is needed. The remaining difference: labels are Thinking/Handling/Writing the answer (catalogs.ts:3691-3693) against the frame's Cookin'/Handling/Brain.

*To close:* Mark B (or B* with the label-wording remainder). Adjust §4. The ledger's separate defect at reaudit.md:2588-2590 (disabled input keeps the ask placeholder) is also fixed.

*Closed, 29 September.* The row is `B*`, closed by `ai-answer-rendering`, 51 of
51: a word above the step log that comes from what the stream has sent, and a
composer that says "Working on it…" while a request is out and invites typing
only when it takes it, measured without a model and reddened by three patches.
The asterisk records the frame's own words: it draws Cookin' and Brain where
Rundesk says Writing the answer and then nothing; Handling and "Working on it…"
match. The separate defect for the disabled composer's placeholder is struck
with it (`ledger-defects-fixed-unmarked`).

### `ledger-rows/row-791` — **closed** (stale doc, small)

**Row 791 (M, create-modal placeholder 'Add description, or write with ⚡AI') is STALE: built, measured, and was already built when the row was written**

*Evidence:* reaudit.md:791 reads M: 'Left M rather than built: a string with no frame is a summary'. Tree: catalogs.ts:2211 'quickCreate.descriptionPlaceholder': 'Add description, or write with ⚡AI'. quick-create-modal.tsx:1331 uses it, and :1334-1345 adds a working ⚡AI button (quick-create-describe-ai, writeDescription.mutate) commented as frame `10:04`. It is measured by create-menu-ai.mjs:449-462 and break test/e2e/breaks/cma-14-old-description-placeholder.py. git: the string landed in 5494c0f (2026-09-21 16:03) and the suite in 666f15f (16:15). The row was rewritten to 'left M' in 3100ba1 (19:10 the same day), so it was wrong when written. The suite says frame 10:04 while the ledger says 09:54-10:08 are all Board view, a frame-citation conflict to settle. It is also one of §2's 9 M in the §4 table (reaudit.md:937).

*To close:* Mark row 791 B, closed by create-menu-ai (cite its check count), and move §2/§4 counts 9 M -> 8 M. Reconcile the 10:04 vs Board-view frame claim. Under the new policy ClickUp's own create-task modal settles the placeholder.

*Closed, 29 September.* The row is `B`, closed by `create-menu-ai`, 24 checks,
four of them this row's, 24 of 24 on 24 September with each of its four patches
reddening. The frame question is settled by the frames: `10:02` to `10:06` draw
the create-task modal over the Board with the placeholder showing, and `10:00`
and `10:08` are the Board before it opens and after it closes, so the suite's
`10:04` is right and §7's reading was wrong. §7, §6 and row 730 are corrected to
match. §2 moves from 116 · 7 · 9 to 117 · 7 · 8. Not measured: the button's
success path, which needs a suite on a lane with a model. ClickUp's own modal
was not needed to settle it. `docs/clickup-research.md:107` still says "No
frame shows it" and was not changed here.

### `ledger-rows/row-793-796-798-799` — **closed** (stale doc, small)

**Four B* rows keep an asterisk whose reason ('suite has not been run, not in ci.yml') is no longer true**

*Evidence:* The legend at reaudit.md:801-810 says the suites had not run and were not registered in ci.yml. Now: ci.yml:1748 runs list-customize and :1761 runs list-assignee-filter. Break logs show verified green baselines: /tmp/claude-0/break-list-customize-20260922-205727.txt '== BASELINE (no patch) 37 passed, 0 failed' at ea0b946a; break-list-assignee-filter-20260923-023405.txt '29 passed, 0 failed' at 8083f883. `node scripts/check-break-reddened.mjs` reports '115 of 115 suite(s) have a patch measured against this tree'. Rows 793 and 796 cite 'list-customize 29' while EXPECTED_CHECKS=37 (list-customize.mjs:59). §4 at reaudit.md:947 says 'the four marked B*', but §2 has six (730, 788, 793, 796, 798, 799). check-video2-counts.mjs passes because it checks letters, not the product.

*To close:* Mark 793/796/798/799 plain B with their suites and current counts. Delete or rewrite the B* legend. Fix the §4 'four' to match the two real B* rows (730, 788).

*Closed, 29 September.* The four rows are plain `B`. The board's Customize
switches and the export caption are closed by `list-customize` (37 checks, 37 of
37 on 24 September), and the avatar picker and "Tasks where I have assigned" by
`list-assignee-filter` (29 checks, 29 of 29), with every break patch in both
sets reddening. §2 now holds two `B*` rows, 730 and 788, and §4 says two. The
totals do not move, since `B*` already counted as built.

### `suite-hygiene/stale-env-premises` — **closed** (stale doc, small)

**Suite headers, comments and harness notes still state 'no key' or 'no bucket' as facts about the lanes**

*Evidence:* Model: ai-answer-rendering.mjs:51-58 ('NO PROVIDER KEY EXISTS HERE, so /ai/chat 503s'), 551, 766-768. ai-create-containers.mjs:32-37 ('THE MODEL-FACING HALF 503s HONESTLY. There is no provider key in this environment'). Both suites were converted tonight (350743c, b5a52bc) but their headers were not. ai-activity-filters.mjs:22-25 and 119-121; ai-action-categories.mjs:31-33 and ai-value.mjs:148-150 ('a test environment has no API key, so no endpoint can create one'). Storage (lanes have s3-stub): syncup-live.mjs:229-236 ('no bucket is configured (upload-url -> 400)'), 224 ('the total is 58' while EXPECTED_CHECKS is 59 at 246), 1083, 1126-1128, 1143-1145. settings-depth.mjs:760-763 ('unconfigured here and in CI, so the library is empty everywhere'). task-attachments.mjs:21 ('R2 is not configured here or in CI'). comment-recording.mjs:215-216 ('R2 is not configured locally, so the presign step is skipped'). Harness: lane-env.sh:88 ('GATED ON RUNDESK_LANE_MODEL=1'; =1 now means lane 1 only, per 145-147), :89 ('FOUR suites'), :129. fleet-restart.sh:120-121 ('Off unless RUNDESK_LANE_MODEL=1 … the six suites').

*To close:* Restate each as configuration-dependent ('with no model configured …', 'CI starts no store; lanes do'), or delete the premise where the suite now asks /ai/status. Fix syncup-live's 58 to 59. Correct lane-env and fleet-restart to the list spelling and the true suite count.

*Closed, 29 September.* No suite header or comment states "no key" or "no
bucket" as a fact about the lanes. Each says what happens with no model or no
store configured, and where one is: the lanes and CI start the object store,
and a lane gets the model when `RUNDESK_LANE_MODEL` names it. `syncup-live`'s
total reads 59, as `EXPECTED_CHECKS` does. `ai-activity-filters` now says it
needs a lane without a model, and `lane-env.sh` counts it among the three that
stand on the refusal. `comment-recording` keeps registering its row directly and
says why that still holds with a store. Two premises were already right and are
unchanged. Seen and not changed, because it is executable: `syncup-live.mjs:1150`
skips the storage chain on any `upload-url` answer of 400 or above, so where a
store is configured a failing presign would read as "not configured here"
rather than as a failure.

### `ledger-rows/stale-reason-comments` — **closed** (stale doc, small)

**Code comments still carry blocking reasons that are no longer true**

*Evidence:* task-detail-sheet.tsx:7285-7291: CommentPlusMenu says 'EIGHT are here' and that slash commands are absent, but comment-plus-slash is rendered. task-detail-sheet.tsx:577-581 and :1452-1454: 'Brain² HUB … does not exist', although the /app/:ws/ai hub and the shell AI dock exist. space-views.ts:59-63: 'The five Rundesk does not have (Map, Activity, Mind Map, Timeline, Workload)', although workload/timeline/mindmaps pages exist. calendar-sync.service.ts:25: 'manual or scheduled pullEvents', with no scheduler.

*To close:* Rewrite each comment when its row is built, or now, so the reason no longer blocks investigation.

*Closed, 29 September.* Each comment says what exists and what does not, so none
blocks the investigation that would build the row. The plus menu holds nine of
the frame's ten items, and the tenth, Brain, waits on a chat that takes a task
(`docs/clickup-research.md`, clickup-ai item 8). The task bar and the header say
the same about Brain²: the AI page and the dock exist, `/ai/brain` and agents do
not. `space-views.ts` says the five views are not offered because no list can
draw them, and that three exist as workspace pages. The calendar service says
`pullEvents` runs only when asked, points at the open "Sync now" row, and no
longer claims a schedule.

### `harness/suite-reads-untested-claim-stale` — **closed**

*Closed:* the sentence now says rules one to five are line-based and that `check-suite-enders.mjs` holds their cases and breaks each rule.

**suite-reads.mjs still says rules one to five are untested**

*Evidence:* scripts/lib/suite-reads.mjs:19-21 says 'Rules one to five are still line-based and still untested, which is a gap named in the ledger'. check-suite-enders.mjs was added in 571c7f1 ('Rules one to five get a case file'), and check-suite-section-enders.mjs:163-176 describes those fixtures. The case file names rule one 16 times and rules two to five 2 to 9 times each, and preflight.sh:43 runs it with --mutate.

*To close:* Delete or correct the sentence.

## Stale documentation — 2

### `resume-defects/resume-4` — **closed** (stale doc, small)

**Item 4 (timeline projectId) was resolved as a recorded decision plus a check; the handoff doc still lists it as open**

*Evidence:* docs/video2-resume.md:234-236 still lists it as an open defect. test/e2e/gantt-controls.mjs:193-230 records the reframing: the client is right not to send projectId, because the query has no window and projectOptions derive from the full rows. It then checks that the server narrows on it, using the run's own ids. The client still sends none (workspace-timeline-page.tsx:229 `/tasks/workspace/${workspaceId}/timeline`). The break gantt-29-projectid-ignored reddens it: /tmp/claude-0/break-gantt-controls.txt shows the baseline at 8083f883 at 29/0 and the patch at 28/1. Residue: tasks.service.ts:1832 getTimelineForWorkspace declares opts.from/opts.to, and nothing reads them (body :1834-1867). The controller (tasks.controller.ts:127-137) never passes them. That is a small mirror (class 2).

*To close:* Mark item 4 closed-by-decision in docs/video2-resume.md with the check's name (gantt-controls, the 'really narrows on projectId' check) and its break gantt-29. Either remove the unread from/to from the opts type or wire them to a query param with a check.

*Closed, 29 September:* `docs/video2-resume.md`'s item 4 is marked closed by decision, naming the check (`gantt-controls`, "the timeline endpoint really narrows on `projectId`, which no client sends") and its patch `gantt-29-projectid-ignored`. The unread `from`/`to` had already left `getTimelineForWorkspace`'s options (`timeline-projectid-param`); nothing in the web sends them.

### `resume-defects/resume-6` — **closed**

**Item 6 (sticky headers inside overflow-hidden) is fixed and has been observed green; the handoff doc's 'not observed' is stale**

*Evidence:* workspace-timeline-page.tsx:696 has Card glass with overflow-clip, and :804-811 is timeline-chart-viewport with maxHeight PANE_MAX_H and overflow-auto, holding the sticky header at :816-820. /tmp/claude-0/break-gantt-controls-20260922-090756.txt shows the baseline at bfe705d6 at 29/0, and the three sticky breaks redden: gantt-controls-15-sticky-unbounded 27/2, -16-sticky-notsticky 28/1, -17-panes-unsynced 28/1. /tmp/claude-0/break-gantt-controls.txt shows a baseline of 29/0 at 8083f883. docs/video2-resume.md:240-243 still says 'the fix has not been observed green'.

*To close:* Update docs/video2-resume.md item 6 to fixed-and-observed, citing the three reddening breaks. Keep the Workload page instance (resume-6-workload) and the list Table view instance below as the open residue of the same class.

*Closed:* `video2-resume.md` item 6 says fixed and observed green now. It cites `gantt-controls` 29/29, with its three sticky patches reddening, 18 of 18 in the set on 24 September at `3a0630f`. The two residues are closed beside it (`resume-6-list-table`, `resume-6-workload`).

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

### `commit-log/log-b7ee313-1` — **closed** (small)

**Whether a subtask may be merged into its own parent is still an unanswered product question**

*Evidence:* Commits b7ee313 and 13bc7b4 record 'a decision not taken'. task-merge.ts:133 and :149 still refuse with 'A subtask cannot be merged into its own parent', although the ledger says the stated reason never applied (lines 102-115).

*To close:* Research ClickUp's merge rules for a parent and its subtask, then allow or refuse to match, with a check either way.

*Closed, 29 September, allowed.* ClickUp (help centre "Merge tasks", "Manage subtasks in a task window using the Bulk Action Toolbar" and "Work with subtasks from tasks", read through search summaries because the proxy refuses the pages): subtasks are merged into another task from the parent's own subtask toolbar, or from a subtask's menu, and nothing excludes the parent. Merging carries descriptions, assignees, comments, attachments and subtasks into the task merged into.
- The refusal went. Its reason had described the opposite merge since it was written, and nothing points into the bin when a subtask is merged into its parent: its comments, files and the rest land on the parent, and the binned subtask was the parent's child anyway. Merging a task into its OWN subtask is still refused, by the nesting rule, as before.
- `mergeRefusal` loses the rule and its now-unused argument; the unit test holds that the merge is allowed.
- `task-merge`: the check that asserted the refusal ("and a subtask merged into its parent is refused in those words") became "and a subtask merged into its own parent is merged, as in ClickUp: its comment lands on the parent and the subtask goes to the bin", on a pair of its own so the fixtures the rest of the suite reads are untouched. Before 27/28 on lane 6 (400, "A subtask cannot be merged into its own parent"); after 28/28 on lane 7.
- `task-merge-2`, re-aimed, puts a refusal back: 27/28 at `15e2681` on lane 1, reddening the merge check alone. `task-merge-1` 16/28 and `task-merge-3` 27/28 there, against a 28/28 baseline.

### `product-siblings/other-get-routes-without-reader` — **closed** (unread routes, small)

**Other GET routes with no web reader: digest preview, webhook deliveries, goal history**

*Evidence:* notifications.controller.ts:45-52 (digest/preview), webhooks.controller.ts:74-80 (:webhookId/deliveries) and goals.controller.ts:105-108 (goals/:goalId/history). Searches of apps/web/src (excluding i18n catalogs) for 'digest/preview', 'deliveries' and '/history' returned nothing. A route survey that matched full paths found 52 GETs without a literal caller, most of them helper-built URLs; these three were checked by hand.

*To close:* Either surface each one (a digest preview in the notification settings, a delivery log under webhooks, history on the goal page) or delete it.

*Closed, 29 September: each is surfaced where it belongs.* ClickUp: a webhook's health is on the webhook (a failing delivery is retried five times, then counted in its `fail_count`, and at 100 the webhook is suspended); a Goal's history or activity says when its targets changed; notifications offer a daily summary email at a chosen time. Measured on lane 7 at `d86220d` before: no page asked any of the three routes (0 of 3).

- Settings → Integrations → Webhooks: each webhook offers Deliveries, its last 50 — the event, delivered or failed, the answer's status, the attempts when there was more than one, and for a failed delivery the start of the endpoint's reply, or the error when nothing answered. Four locales.
- A goal's page: History, each change of its value (from → to, right to left in Arabic and Urdu), by whom and when, newest first. `GET /goals/:goalId/history` now answers each change with its author's id and name instead of bare rows, at most 100.
- Profile → Notifications, with the digest on: Preview the digest, asked for (it reads the person's whole window), showing the total and each group as the email groups them, or that there is nothing to send.

`routes-with-readers`, 3 checks:
- Before: 0/3 on lane 7.
- After: 3/3 on lane 7.
- Patches `rwr-1..5`: one or more per check (the toggle gone, the panel asking a route that is not there, the page reading no history, the history oldest first, the preview gone). Their runs follow the commit.
- In CI (235).
- Regression on lane 7, 22 suites (webhooks, goals, notification settings, the assignee picker, the AI assignment routes, settings tabs), with both new suites: 22/22.

