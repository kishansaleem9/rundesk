import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireWorkspaceMember } from "@/lib/server/access";

const createChannel = z.object({
  workspaceId:
    z.string().min(1),

  name:
    z.string()
      .trim()
      .min(1)
      .max(80),

  description:
    z.string()
      .trim()
      .max(500)
      .optional()
      .default(""),

  topic:
    z.string()
      .trim()
      .max(191)
      .optional()
      .default(""),

  isPrivate:
    z.boolean()
      .default(false),

  memberIds:
    z.array(z.string())
      .max(100)
      .default([]),
});

export async function GET(
  request: NextRequest,
) {
  try {
    const user =
      await getCurrentUser();

    const workspaceId =
      request.nextUrl.searchParams.get(
        "workspaceId",
      );

    if (!workspaceId) {
      return NextResponse.json(
        {
          error:
            "workspaceId is required",
        },
        {
          status: 400,
        },
      );
    }

    await requireWorkspaceMember(
      workspaceId,
      user.id,
    );

    const channels =
      await db.channel.findMany({
        where: {
          workspaceId,
          type: "CHANNEL",

          OR: [
            {
              isPrivate: false,
            },
            {
              members: {
                some: {
                  userId: user.id,
                },
              },
            },
          ],
        },

        include: {
          _count: {
            select: {
              members: true,
              messages: true,
            },
          },
        },

        orderBy: {
          name: "asc",
        },
      });

    return NextResponse.json(
      channels,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const user =
      await getCurrentUser();

    const input =
      createChannel.parse(
        await request.json(),
      );

    await requireWorkspaceMember(
      input.workspaceId,
      user.id,
    );

    const requestedMembers =
      [
        ...new Set([
          user.id,
          ...input.memberIds,
        ]),
      ];

    const memberCount =
      await db.workspaceMember.count({
        where: {
          workspaceId:
            input.workspaceId,

          userId: {
            in: requestedMembers,
          },
        },
      });

    if (
      memberCount !==
      requestedMembers.length
    ) {
      return NextResponse.json(
        {
          error:
            "Every selected channel member must belong to this workspace.",
        },
        {
          status: 400,
        },
      );
    }

    const duplicate =
      await db.channel.findFirst({
        where: {
          workspaceId:
            input.workspaceId,

          type: "CHANNEL",

          name: input.name,
        },

        select: {
          id: true,
        },
      });

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "A channel with this name already exists.",
        },
        {
          status: 409,
        },
      );
    }

    const channel =
      await db.channel.create({
        data: {
          workspaceId:
            input.workspaceId,

          name:
            input.name,

          description:
            input.description ||
            null,

          topic:
            input.topic ||
            null,

          isPrivate:
            input.isPrivate,

          createdById:
            user.id,

          members: {
            create:
              requestedMembers.map(
                (userId) => ({
                  userId,
                }),
              ),
          },
        },

        include: {
          _count: {
            select: {
              members: true,
              messages: true,
            },
          },
        },
      });

    return NextResponse.json(
      {
        ...channel,
        unreadCount: 0,
        lastReadAt:
          new Date().toISOString(),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
