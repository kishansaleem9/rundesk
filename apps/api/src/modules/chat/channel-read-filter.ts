import { and, eq, inArray, isNull, notInArray, or, type SQL } from 'drizzle-orm'
import { chatChannels, chatChannelMembers, objectShares, spaces, spaceMembers, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'

/**
 * THE CHANNELS A USER CAN READ, as a WHERE fragment over unaliased
 * `chat_channels`: the SQL twin of `ChatService.assertChannelAccess`, for a
 * query that reads messages from many channels at once. Workspace membership
 * is the caller's to check, as it is before that method's own rules:
 *
 *   · a channel in a PRIVATE space needs membership of the space;
 *   · a private channel or a DM needs membership of the channel, or, for a
 *     private channel only, a share granted on that channel (a DM is never
 *     shareable);
 *   · anything else is readable by the workspace.
 *
 * It exists because the per-member activity read had no rule at all: every
 * message the member wrote anywhere, DMs and private channels included, went
 * to whoever asked.
 */
export function readableChannelsFilter(db: Db, userId: string, workspaceId: string): SQL {
  const memberChannels = db
    .select({ id: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.userId, userId))
  const sharedChannels = db
    .select({ id: objectShares.objectId })
    .from(objectShares)
    .where(
      and(
        eq(objectShares.objectType, 'channel'),
        eq(objectShares.userId, userId),
        eq(objectShares.workspaceId, workspaceId),
      ),
    )
  const privateSpaces = db.select({ id: spaces.id }).from(spaces).where(eq(spaces.visibility, 'private'))
  const memberSpaces = db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, userId))
  return and(
    or(isNull(chatChannels.spaceId), notInArray(chatChannels.spaceId, privateSpaces), inArray(chatChannels.spaceId, memberSpaces)),
    or(
      and(eq(chatChannels.isPrivate, false), eq(chatChannels.isDm, false)),
      inArray(chatChannels.id, memberChannels),
      and(eq(chatChannels.isDm, false), inArray(chatChannels.id, sharedChannels)),
    ),
  ) as SQL
}

/**
 * WHO MAY READ ONE CHANNEL — the same rule a third time, turned round: not
 * "which channels may this person read" but "which people may read this
 * channel", for a realtime event about it. `'workspace'` when anyone in the
 * workspace may (a public channel outside any private space), else the ids:
 *
 *   · workspace members only, as `assertChannelAccess` requires first;
 *   · of a private space's channel, the space's members;
 *   · of a private channel, its members and the people it is shared with; of
 *     a DM, its members (a DM is never shareable).
 *
 * It exists because every chat event went to the whole workspace's room:
 * measured, a member refused a DM, a private channel and a private space's
 * channel (403 on each) heard every message in them as it was written, every
 * edit, and the name of each new private channel
 * (`found-24-sep/chat-events-broadcast-to-the-workspace`).
 */
export async function channelReaders(
  db: Db,
  channel: { id: string; workspaceId: string; spaceId: string | null; isPrivate: boolean; isDm: boolean },
): Promise<'workspace' | string[]> {
  let privateSpace = false
  if (channel.spaceId) {
    const [space] = await db.select({ visibility: spaces.visibility }).from(spaces).where(eq(spaces.id, channel.spaceId)).limit(1)
    privateSpace = space?.visibility === 'private'
  }
  if (!privateSpace && !channel.isPrivate && !channel.isDm) return 'workspace'

  const conditions: SQL[] = [eq(workspaceMembers.workspaceId, channel.workspaceId)]
  if (privateSpace) {
    conditions.push(
      inArray(
        workspaceMembers.userId,
        db.select({ id: spaceMembers.userId }).from(spaceMembers).where(eq(spaceMembers.spaceId, channel.spaceId as string)),
      ),
    )
  }
  if (channel.isPrivate || channel.isDm) {
    const members = db.select({ id: chatChannelMembers.userId }).from(chatChannelMembers).where(eq(chatChannelMembers.channelId, channel.id))
    const shared = db
      .select({ id: objectShares.userId })
      .from(objectShares)
      .where(and(eq(objectShares.objectType, 'channel'), eq(objectShares.objectId, channel.id), eq(objectShares.workspaceId, channel.workspaceId)))
    conditions.push(channel.isDm ? inArray(workspaceMembers.userId, members) : (or(inArray(workspaceMembers.userId, members), inArray(workspaceMembers.userId, shared)) as SQL))
  }
  const rows = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(...conditions))
  return rows.map((r) => r.userId)
}
