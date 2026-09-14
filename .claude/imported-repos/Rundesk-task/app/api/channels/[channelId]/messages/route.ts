import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireChannelAccess } from "@/lib/server/access";

const attachmentInput =
  z.object({
    originalName:
      z.string().min(1),

    storageKey:
      z.string().min(1),

    mimeType:
      z.string().min(1),

    size:
      z.number()
        .int()
        .nonnegative(),

    url:
      z.string().min(1),
  });

const createMessage =
  z.object({
    content:
      z.string()
        .trim()
        .max(10000)
        .default(""),

    parentMessageId:
      z.string()
        .nullable()
        .optional(),

    attachments:
      z.array(
        attachmentInput,
      )
        .max(10)
        .optional(),
  })
    .refine(
      (input) =>
        Boolean(
          input.content.trim(),
        ) ||
        Boolean(
          input.attachments?.length,
        ),
      {
        message:
          "A message or attachment is required",
      },
    );

type Context = {
  params: Promise<{
    channelId: string;
  }>;
};

const messageInclude = {
  author: true,

  reactions: {
    include: {
      user: true,
    },
  },

  attachments: true,

  mentions: {
    include: {
      user: true,
    },
  },

  taskLinks: {
    include: {
      task: {
        include: {
          assignees: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  },

  assignments: {
    include: {
      assignee: true,
    },
  },

  _count: {
    select: {
      replies: true,
    },
  },
} as const;

export async function GET(
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

    const parent =
      request.nextUrl.searchParams.get(
        "parentMessageId",
      );

    const messages =
      await db.message.findMany({
        where: {
          channelId,

          parentMessageId:
            parent,
        },

        include:
          messageInclude,

        orderBy: {
          createdAt: "asc",
        },
      });

    return NextResponse.json(
      messages,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const user =
      await getCurrentUser();

    const { channelId } =
      await params;

    const input =
      createMessage.parse(
        await request.json(),
      );

    const channel =
      await requireChannelAccess(
        channelId,
        user.id,
      );

    if (
      input.parentMessageId
    ) {
      const parent =
        await db.message.findFirst({
          where: {
            id:
              input.parentMessageId,

            channelId,
          },

          select: {
            id: true,
          },
        });

      if (!parent) {
        return NextResponse.json(
          {
            error:
              "Parent message not found",
          },
          {
            status: 400,
          },
        );
      }
    }

    /*
     * MentionPicker inserts the person's display name, so resolve
     * mentions against real workspace users rather than trying to
     * guess one- or two-word names with a fragile regex.
     */
    const workspaceUsers =
      input.content.includes("@")
        ? await db.user.findMany({
            where: {
              workspaceMemberships: {
                some: {
                  workspaceId:
                    channel.workspaceId,
                },
              },
            },

            select: {
              id: true,
              name: true,
            },
          })
        : [];

    const mentionedUsers =
      workspaceUsers.filter(
        (candidate) =>
          input.content.includes(
            `@${candidate.name}`,
          ),
      );

    const message =
      await db.message.create({
        data: {
          channelId,

          authorId:
            user.id,

          content:
            input.content,

          parentMessageId:
            input.parentMessageId,

          sentAt:
            new Date(),

          attachments:
            input.attachments?.length
              ? {
                  create:
                    input.attachments,
                }
              : undefined,

          mentions:
            mentionedUsers.length
              ? {
                  create:
                    mentionedUsers.map(
                      (item) => ({
                        userId:
                          item.id,
                      }),
                    ),
                }
              : undefined,
        },

        include:
          messageInclude,
      });

    return NextResponse.json(
      message,
      {
        status: 201,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
