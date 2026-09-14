import { NextResponse } from "next/server";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { isWorkspaceAdminRole } from "@/lib/server/access";

async function unreadCount(
  channelId: string,
  currentUserId: string,
  lastReadAt: Date | null | undefined,
) {
  return db.message.count({
    where: {
      channelId,
      parentMessageId: null,
      createdAt: {
        gt: lastReadAt ?? new Date(0),
      },
      authorId: {
        not: currentUserId,
      },
    },
  });
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    const membership = await db.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
      },
      include: {
        workspace: true,
      },
      orderBy: {
        joinedAt: "asc",
      },
    });

    if (!membership) {
      throw new Error("Workspace membership not found");
    }

    const canManageWorkspace = isWorkspaceAdminRole(membership.role);

    const [rawUsers, channels, tasks, conversations] = await Promise.all([
      db.user.findMany({
        where: {
          workspaceMemberships: {
            some: {
              workspaceId: membership.workspaceId,
            },
          },
        },
        orderBy: { name: "asc" },
      }),

      db.channel.findMany({
        where: {
          workspaceId: membership.workspaceId,
          type: "CHANNEL",
          OR: [
            { isPrivate: false },
            {
              members: {
                some: {
                  userId: currentUser.id,
                },
              },
            },
          ],
        },
        include: {
          members: {
            where: {
              userId: currentUser.id,
            },
            select: {
              lastReadAt: true,
              notificationsMuted: true,
            },
          },
          _count: {
            select: {
              members: true,
              messages: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),

      db.task.findMany({
        where: {
          workspaceId: membership.workspaceId,
        },
        include: {
          assignees: {
            include: {
              user: true,
            },
          },
          channel: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),

      db.conversation.findMany({
        where: {
          workspaceId: membership.workspaceId,
          members: {
            some: {
              userId: currentUser.id,
            },
          },
        },
        include: {
          channel: {
            include: {
              members: {
                where: {
                  userId: currentUser.id,
                },
                select: {
                  lastReadAt: true,
                  notificationsMuted: true,
                },
              },
              _count: {
                select: {
                  members: true,
                  messages: true,
                },
              },
            },
          },
          members: {
            include: {
              user: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const safeUser = <T extends { id: string; email: string }>(user: T) => ({
      ...user,
      email:
        canManageWorkspace || user.id === currentUser.id
          ? user.email
          : "",
    });

    const users = rawUsers.map(safeUser);

    const channelsWithUnread = await Promise.all(
      channels.map(async (channel) => {
        const currentMembership = channel.members[0];
        const count = await unreadCount(
          channel.id,
          currentUser.id,
          currentMembership?.lastReadAt,
        );

        const { members: _members, ...rest } = channel;

        return {
          ...rest,
          lastReadAt:
            currentMembership?.lastReadAt?.toISOString() ?? null,
          unreadCount: count,
          notificationsMuted:
            currentMembership?.notificationsMuted ?? false,
        };
      }),
    );

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation) => {
        const currentMembership = conversation.channel.members[0];
        const count = await unreadCount(
          conversation.channel.id,
          currentUser.id,
          currentMembership?.lastReadAt,
        );

        const { members: _members, ...channel } = conversation.channel;

        return {
          ...conversation,
          members: conversation.members.map((member) => ({
            ...member,
            user: safeUser(member.user),
          })),
          channel: {
            ...channel,
            lastReadAt:
              currentMembership?.lastReadAt?.toISOString() ?? null,
            unreadCount: count,
            notificationsMuted:
              currentMembership?.notificationsMuted ?? false,
          },
        };
      }),
    );

    const safeTasks = tasks.map((task) => ({
      ...task,
      assignees: task.assignees.map((assignee) => ({
        ...assignee,
        user: safeUser(assignee.user),
      })),
    }));

    return NextResponse.json({
      currentUser,
      currentRole: membership.role,
      canManageWorkspace,
      workspace: membership.workspace,
      users,
      channels: channelsWithUnread,
      tasks: safeTasks,
      conversations: conversationsWithUnread,
    });
  } catch (error) {
    return apiError(error);
  }
}