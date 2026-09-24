import { and, eq, inArray, isNull, notInArray, or, type SQL } from 'drizzle-orm'
import { chatChannels, chatChannelMembers, objectShares, spaces, spaceMembers } from '@rundesk/db'
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
