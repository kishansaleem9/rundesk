import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import { db } from "@/lib/server/db";
import {
  getCurrentUser,
} from "@/lib/server/current-user";
import {
  apiError,
} from "@/lib/server/http";
import {
  requireChannelAccess,
} from "@/lib/server/access";

type Context = {
  params: Promise<{
    messageId: string;
  }>;
};

/*
 * The old route used z.enum([...six emojis...]).
 * That rejected 🙌, 🔥, 👏 and every skin-tone variant.
 *
 * MessageReaction.emoji is already VarChar(32), so we can safely
 * accept normal Unicode emoji sequences without a schema change.
 */
const reactionInput =
  z.object({
    emoji: z
      .string()
      .trim()
      .min(1)
      .max(32),
  });

export async function POST(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const user =
      await getCurrentUser();

    const {
      messageId,
    } = await params;

    const {
      emoji,
    } =
      reactionInput.parse(
        await request.json(),
      );

    const message =
      await db.message.findUnique({
        where: {
          id: messageId,
        },
      });

    if (!message) {
      return NextResponse.json(
        {
          error:
            "Message not found",
        },
        {
          status: 404,
        },
      );
    }

    await requireChannelAccess(
      message.channelId,
      user.id,
    );

    const key = {
      messageId_userId_emoji:
        {
          messageId,
          userId:
            user.id,
          emoji,
        },
    };

    const existing =
      await db.messageReaction.findUnique(
        {
          where: key,
        },
      );

    if (existing) {
      await db.messageReaction.delete(
        {
          where: key,
        },
      );
    } else {
      await db.messageReaction.create(
        {
          data: {
            messageId,
            userId:
              user.id,
            emoji,
          },
        },
      );
    }

    const reactions =
      await db.messageReaction.findMany(
        {
          where: {
            messageId,
          },

          include: {
            user: true,
          },

          orderBy: {
            createdAt:
              "asc",
          },
        },
      );

    return NextResponse.json(
      {
        active:
          !existing,
        reactions,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
