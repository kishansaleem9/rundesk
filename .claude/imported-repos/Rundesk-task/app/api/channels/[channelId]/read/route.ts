import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireChannelAccess } from "@/lib/server/access";

type Context = {
  params: Promise<{
    channelId: string;
  }>;
};

const markUnreadInput =
  z.object({
    before:
      z.string().datetime(),
  });

export async function POST(
  _request: Request,
  { params }: Context,
) {
  try {
    const user =
      await getCurrentUser();

    const { channelId } =
      await params;

    await requireChannelAccess(
      channelId,
      user.id,
    );

    const readAt =
      new Date();

    await db.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId,
          userId:
            user.id,
        },
      },

      update: {
        lastReadAt:
          readAt,
      },

      create: {
        channelId,

        userId:
          user.id,

        lastReadAt:
          readAt,
      },
    });

    return NextResponse.json({
      readAt,
    });
  } catch (error) {
    return apiError(error);
  }
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

    await requireChannelAccess(
      channelId,
      user.id,
    );

    const { before } =
      markUnreadInput.parse(
        await request.json(),
      );

    const readAt =
      new Date(
        new Date(
          before,
        ).getTime() - 1,
      );

    await db.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId,
          userId:
            user.id,
        },
      },

      update: {
        lastReadAt:
          readAt,
      },

      create: {
        channelId,

        userId:
          user.id,

        lastReadAt:
          readAt,
      },
    });

    return NextResponse.json({
      readAt,
    });
  } catch (error) {
    return apiError(error);
  }
}
