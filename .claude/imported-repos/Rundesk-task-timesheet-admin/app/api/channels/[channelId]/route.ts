import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireWorkspaceMember } from "@/lib/server/access";

const updateChannel = z.object({
  name:
    z.string()
      .trim()
      .min(1)
      .max(80)
      .optional(),

  description:
    z.string()
      .trim()
      .max(500)
      .nullable()
      .optional(),

  topic:
    z.string()
      .trim()
      .max(191)
      .nullable()
      .optional(),

  isPrivate:
    z.boolean()
      .optional(),
});

type Context = {
  params: Promise<{
    channelId: string;
  }>;
};

async function canManageChannel(
  workspaceId: string,
  actorId: string,
  createdById: string,
) {
  if (actorId === createdById) {
    return true;
  }

  const membership =
    await requireWorkspaceMember(
      workspaceId,
      actorId,
    );

  return (
    membership.role === "OWNER" ||
    membership.role === "ADMIN"
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const user =
      await getCurrentUser();

    const { channelId } =
      await params;

    const existing =
      await db.channel.findUnique({
        where: {
          id: channelId,
        },
      });

    if (
      !existing ||
      existing.type !== "CHANNEL"
    ) {
      return NextResponse.json(
        {
          error:
            "Channel not found",
        },
        {
          status: 404,
        },
      );
    }

    if (
      !(await canManageChannel(
        existing.workspaceId,
        user.id,
        existing.createdById,
      ))
    ) {
      return NextResponse.json(
        {
          error:
            "Only the channel creator or a workspace admin can edit it.",
        },
        {
          status: 403,
        },
      );
    }

    const input =
      updateChannel.parse(
        await request.json(),
      );

    if (
      input.name &&
      input.name !== existing.name
    ) {
      const duplicate =
        await db.channel.findFirst({
          where: {
            workspaceId:
              existing.workspaceId,

            type: "CHANNEL",

            name:
              input.name,

            id: {
              not: channelId,
            },
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
    }

    const channel =
      await db.channel.update({
        where: {
          id: channelId,
        },

        data: {
          ...input,

          description:
            input.description === ""
              ? null
              : input.description,

          topic:
            input.topic === ""
              ? null
              : input.topic,
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
      channel,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: Context,
) {
  try {
    const user =
      await getCurrentUser();

    const { channelId } =
      await params;

    const existing =
      await db.channel.findUnique({
        where: {
          id: channelId,
        },
      });

    if (
      !existing ||
      existing.type !== "CHANNEL"
    ) {
      return NextResponse.json(
        {
          error:
            "Channel not found",
        },
        {
          status: 404,
        },
      );
    }

    if (
      !(await canManageChannel(
        existing.workspaceId,
        user.id,
        existing.createdById,
      ))
    ) {
      return NextResponse.json(
        {
          error:
            "Only the channel creator or a workspace admin can delete it.",
        },
        {
          status: 403,
        },
      );
    }

    await db.channel.delete({
      where: {
        id: channelId,
      },
    });

    return new NextResponse(
      null,
      {
        status: 204,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
