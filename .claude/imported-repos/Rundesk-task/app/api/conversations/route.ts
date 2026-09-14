import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ChannelType } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/server/current-user";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

const inputSchema = z.object({
  workspaceId: z.string(),
  userIds: z.array(z.string()).min(1).max(20),
});

const includeConversation = {
  channel: true,
  members: {
    include: {
      user: true,
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    const workspaceId =
      request.nextUrl.searchParams.get("workspaceId");

    return NextResponse.json(
      await db.conversation.findMany({
        where: {
          workspaceId: workspaceId ?? undefined,
          members: {
            some: {
              userId: user.id,
            },
          },
        },
        include: includeConversation,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const input = inputSchema.parse(await request.json());

    /*
     * Keep every selected id, including the current user.
     * This allows a useful "message yourself" conversation for
     * single-user/local Rundesk workspaces, while still supporting
     * normal one-to-one and group DMs.
     */
    const selectedIds = [...new Set(input.userIds)];

    if (!selectedIds.length) {
      return NextResponse.json(
        { error: "Choose at least one user" },
        { status: 400 },
      );
    }

    const selectedOtherIds = selectedIds.filter(
      (id) => id !== user.id,
    );

    /*
     * Verify that every selected person other than the current
     * user belongs to the same workspace.
     */
    const others = await db.user.findMany({
      where: {
        id: {
          in: selectedOtherIds,
        },
        workspaceMemberships: {
          some: {
            workspaceId: input.workspaceId,
          },
        },
      },
    });

    if (others.length !== selectedOtherIds.length) {
      return NextResponse.json(
        { error: "One or more selected users were not found in this workspace" },
        { status: 400 },
      );
    }

    const memberIds = [
      ...new Set([
        user.id,
        ...selectedIds,
      ]),
    ];

    const selfOnly =
      memberIds.length === 1 &&
      memberIds[0] === user.id;

    /*
     * Reuse an existing self-DM or one-to-one DM instead of
     * creating duplicates every time the Message button is clicked.
     */
    if (selfOnly || memberIds.length === 2) {
      const candidates =
        await db.conversation.findMany({
          where: {
            workspaceId: input.workspaceId,
            members: {
              some: {
                userId: user.id,
              },
            },
          },
          include: includeConversation,
        });

      const existing = candidates.find((conversation) => {
        const existingIds =
          conversation.members.map(
            (member) => member.userId,
          );

        return (
          existingIds.length === memberIds.length &&
          memberIds.every((id) =>
            existingIds.includes(id),
          )
        );
      });

      if (existing) {
        return NextResponse.json(existing);
      }
    }

    const title = selfOnly
      ? user.name
      : others
          .map((item) => item.name)
          .filter(Boolean)
          .join(", ");

    const channel = await db.channel.create({
      data: {
        workspaceId: input.workspaceId,

        name: selfOnly
          ? `dm-self-${user.id.slice(0, 8)}`
          : `dm-${crypto.randomUUID().slice(0, 8)}`,

        topic: title,
        type: ChannelType.DIRECT,
        isPrivate: true,
        createdById: user.id,

        members: {
          create: memberIds.map((userId) => ({
            userId,
          })),
        },
      },
    });

    const conversation =
      await db.conversation.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: user.id,
          channelId: channel.id,

          title:
            selfOnly || memberIds.length > 2
              ? title
              : null,

          members: {
            create: memberIds.map((userId) => ({
              userId,
            })),
          },
        },
        include: includeConversation,
      });

    return NextResponse.json(
      conversation,
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
