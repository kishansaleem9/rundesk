import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'workspace_admin',
  'manager',
  'member',
  'guest',
])

export const flagScopeEnum = pgEnum('flag_scope', [
  'global',
  'workspace',
  'role',
  'user',
])

export const oauthProviderEnum = pgEnum('oauth_provider', [
  'google',
  'microsoft',
])

export const orgRoleEnum = pgEnum('org_role', [
  'owner',
  'admin',
  'billing',
  'member',
])

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  // The SENDER cancelled it.
  'revoked',
  'expired',
  /*
   * The RECIPIENT said no — `[00:18]` "Decline".
   *
   * Deliberately not folded into `revoked`. "I withdrew this invitation" and
   * "they turned it down" are different facts about different people, and an
   * admin looking at why somebody never joined is owed the difference.
   */
  'declined',
])

export const taskPriorityEnum = pgEnum('task_priority', [
  'urgent',
  'high',
  'normal',
  'low',
])

export const activityActionEnum = pgEnum('activity_action', [
  'created',
  'updated',
  'deleted',
  'archived',
  'restored',
  'status_changed',
  'priority_changed',
  'assigned',
  'unassigned',
  'commented',
  'label_added',
  'label_removed',
  'due_date_changed',
  'dependency_added',
  'dependency_removed',
  'checklist_item_toggled',
  // §V2-S03 frame `02:47` — ticking an item was logged, adding one was not, so
  // a checklist could grow by ten lines with nothing in the activity feed.
  'checklist_item_added',
  'attachment_added',
  'attachment_removed',
  'subtask_added',
  'moved',
  // §V2-08 — merging one task into another leaves an entry on BOTH: the
  // survivor's log says what arrived, the binned task's says where its work
  // went. One entry would leave whoever opens the old task looking at an
  // archived page with no explanation.
  'merged_in',
  'merged_away',
  // `commit-log/log-713a611-1` — a task added to another list, or taken out of one (Tasks in Multiple Lists).
  'list_added',
  'list_removed',
])

export const dependencyTypeEnum = pgEnum('dependency_type', [
  'blocks',
  'blocked_by',
  'related_to',
])

export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'task_mentioned',
  'task_commented',
  'task_due_soon',
  'task_overdue',
  'task_status_changed',
  'task_updated',
  'chat_message',
  // §14 [16:50] — "Agar aap bhi yahan reply karte ho na … to phir jo hai woh
  // mujhe yahan show hoga UNREAD mein." A reply into a thread is its own kind:
  // typed as a plain chat_message it could never reach the Replies page, which
  // only ever looked for task and doc comments.
  'chat_reply',
  'doc_mentioned',
  'doc_commented',
  'approval_needed',
  // §4.4 — fired when a blocking dependency leaves a task blocked.
  'task_blocked',
  // §7.11 — daily AI briefing delivered as an in-app notification.
  'ai_briefing',
  // §7.12 — proactive alert to managers when a teammate is significantly overloaded.
  'workload_alert',
  // §14.1 — Stripe dunning: a failed payment left the subscription past_due.
  // Written to workspace admins by the billing webhook handler.
  'billing_past_due',
  // §2.2 — five kinds she named in the Primary customiser that had no type at
  // all, so the customiser could not have offered them however good it was.
  /** Someone took you off a task you were assigned to. */
  'task_unassigned',
  /** A follower/watcher was added to or removed from a task you are on. */
  'task_follower_changed',
  /** Someone reacted to your message. */
  'message_reaction',
  /** Something was shared with you. */
  'shared_with_me',
  /** Someone asked for access to something you control. */
  'access_requested',
  // §A2.11 — self-served "send me a test" from the delivery-preferences panel.
  'test_notification',
  // §2.8 [19:25] — "aap ko notification aa raha hoga ke CALL ka option aaya…
  // aap chaho to wahan se direct call join ho jaoge". A SyncUp starting in a
  // channel, delivered to that channel's members with a way in.
  'call_started',
  // §G11 [15:36] — a chat message assigned to you as an action item. Distinct
  // from task_assigned: nothing was created, and the thing you are being asked
  // about is a line in a conversation, so the link has to land on the message.
  'message_assigned',
  // §G11 [15:19] — a reminder you set on a saved message coming due. It reads
  // as task_due_soon only if you squint, and clicking it must open the message.
  'message_reminder',
  // G10-10 [12:21–12:24] — "kisi ne mujhe comment/assign kiya to mujhe show
  // ho". Both of these already fired, wearing somebody else's type: an
  // assigned comment arrived as `task_assigned` and a resolved one as
  // `task_commented`. In the Inbox they were indistinguishable from a task
  // assignment and a new comment, and in the Primary customiser they could
  // never be toggled apart — which is the whole point of listing them
  // separately, since a resolved comment is routine and an assigned one is
  // somebody asking you to do something.
  'comment_assigned',
  'comment_resolved',
  // G10-11 [12:38–12:41] — a subtask appearing under a task you are on. Off by
  // default; it belongs in the "Not Important" half of her panel.
  //
  // Her list also has "Task created", which is deliberately NOT here: it fires
  // to people who follow a List, and this product has no list-follow concept
  // to deliver it to. Adding the label with no emitter behind it is the exact
  // defect this audit keeps finding, so it waits for the feature it needs.
  'subtask_created',
])

export const viewTypeEnum = pgEnum('view_type', [
  'list',
  'board',
  'calendar',
  'gantt',
  'table',
  // §V2-13, frames `07:10` / `07:40` / `09:25` — work by the person doing it.
  'team',
  // The other five of frame `07:10`'s eleven, each a tab a list draws
  // (`commit-log/log-68bc188-1`, `ledger-rows/row-777`, migration 0188).
  'activity',
  'workload',
  'timeline',
  'mindmap',
  'map',
])

// Container-level (space / project) membership role and visibility.
export const containerRoleEnum = pgEnum('container_role', [
  'admin',
  'edit',
  'comment',
  'view',
])

export const containerVisibilityEnum = pgEnum('container_visibility', [
  'public',
  'private',
])
