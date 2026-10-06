import { and, eq } from 'drizzle-orm'
import { chatChannels, chatMessages, docs, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { readableTask } from '../../common/permissions/read-access'
import { canReadDoc } from '../../common/permissions/doc-access'
import { isManagerRole } from '../../common/permissions/item-visibility'
import { readableChannelsFilter } from '../chat/channel-read-filter'

/*
 * A NOTIFICATION ABOUT AN ITEM GOES ONLY TO SOMEONE WHO MAY READ THE ITEM NOW
 * (`found-6-oct/an-open-socket-outlives-its-access`).
 *
 * A task's followers and assignees, a doc's author, the person a reminder is
 * for: each was chosen when they could read the item, and nothing asked again
 * when that ended. Measured on lane 2, a member removed from the workspace, a
 * member lowered to guest, a guest whose share of a list was removed, and
 * members of a list and of a space made private each went on being notified
 * about a task they followed — a comment on it, its new title in the
 * notification's own title — on their open socket (their own `user:` room,
 * which no room sweep takes away), in their inbox, and by mail, while their
 * read of the task answered 403. ClickUp: "When you remove someone from your
 * ClickUp Workspace, the person immediately loses access to all Workspace
 * content" (help centre, "Remove someone from a Workspace"); "Adding followers
 * does not change task permissions. Users still need appropriate Workspace
 * permissions or sharing access to open the task" ("Add and remove task
 * followers"); both read through search excerpts.
 *
 * So before a notification about a task, a doc or a chat message is written,
 * sent or mailed, its recipient is asked the item's own read rule, as a route
 * would ask them: `readableTask` (membership, the container rule, a guest's
 * reach, the private-list and private-task rules), `canReadDoc` after
 * membership, and the channel rule (`readableChannelsFilter`) after
 * membership. A notification about anything else — a timesheet to approve, a
 * workload alert, a request for access — names no item to read and is left as
 * it was. Rows already written are not taken back.
 */

export type NotificationTarget = { entityType: string; entityId: string } | null | undefined
export type Recipient = { id: string; role?: string | null }

/** The read rule of each kind of item a notification can be about. */
export type NotificationReachRules = {
  task: (db: Db, workspaceId: string, taskId: string, recipient: Recipient) => Promise<boolean>
  doc: (db: Db, workspaceId: string, docId: string, recipient: Recipient) => Promise<boolean>
  chatMessage: (db: Db, workspaceId: string, messageId: string, recipient: Recipient) => Promise<boolean>
}

async function workspaceRole(db: Db, workspaceId: string, userId: string): Promise<string | null> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return (member?.role as string | undefined) ?? null
}

export const NOTIFICATION_REACH: NotificationReachRules = {
  task: async (db, workspaceId, taskId, recipient) => (await readableTask(db, workspaceId, taskId, recipient)) !== null,
  doc: async (db, workspaceId, docId, recipient) => {
    const [doc] = await db
      .select({ id: docs.id, workspaceId: docs.workspaceId, spaceId: docs.spaceId, parentDocId: docs.parentDocId })
      .from(docs)
      .where(and(eq(docs.id, docId), eq(docs.workspaceId, workspaceId)))
      .limit(1)
    if (!doc) return false
    // A super_admin passes, as in every guard.
    if (recipient.role === 'super_admin') return true
    const role = await workspaceRole(db, workspaceId, recipient.id)
    if (!role) return false
    return canReadDoc(db, doc, recipient.id, isManagerRole(role))
  },
  chatMessage: async (db, workspaceId, messageId, recipient) => {
    if (recipient.role === 'super_admin') return true
    if (!(await workspaceRole(db, workspaceId, recipient.id))) return false
    const [message] = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .where(and(eq(chatMessages.id, messageId), eq(chatChannels.workspaceId, workspaceId), readableChannelsFilter(db, recipient.id, workspaceId)))
      .limit(1)
    return !!message
  },
}

/** Whether `recipient` may be told about `target` in `workspaceId`: the item's own read rule, or yes when it names no item. */
export async function mayBeToldAbout(
  db: Db,
  recipient: Recipient,
  workspaceId: string | null | undefined,
  target: NotificationTarget,
  rules: NotificationReachRules = NOTIFICATION_REACH,
): Promise<boolean> {
  if (!workspaceId || !target?.entityId) return true
  if (target.entityType === 'task') return rules.task(db, workspaceId, target.entityId, recipient)
  if (target.entityType === 'doc') return rules.doc(db, workspaceId, target.entityId, recipient)
  if (target.entityType === 'chat_message') return rules.chatMessage(db, workspaceId, target.entityId, recipient)
  return true
}
