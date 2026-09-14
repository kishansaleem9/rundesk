import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import {
  requireChannelAccess,
  requireWorkspaceMember,
} from "@/lib/server/access";

const taskInput =
  z.object({
    workspaceId:
      z.string().min(1),

    channelId:
      z.string()
        .nullable()
        .optional(),

    sourceMessageId:
      z.string()
        .nullable()
        .optional(),

    title:
      z.string()
        .trim()
        .min(1)
        .max(200),

    description:
      z.string()
        .trim()
        .max(5000)
        .optional(),

    status:
      z.enum([
        "TODO",
        "IN_PROGRESS",
        "COMPLETE",
      ])
        .default("TODO"),

    priority:
      z.enum([
        "LOW",
        "NORMAL",
        "HIGH",
        "URGENT",
      ])
        .default("NORMAL"),

    dueDate:
      z.string()
        .date()
        .nullable()
        .optional(),

    assigneeIds:
      z.array(z.string())
        .max(20)
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

    const view =
      request.nextUrl.searchParams.get(
        "view",
      );

    const query =
      request.nextUrl.searchParams.get(
        "q",
      ) ?? "";

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

    const endOfToday =
      new Date();

    endOfToday.setHours(
      23,
      59,
      59,
      999,
    );

    const tasks =
      await db.task.findMany({
        where: {
          workspaceId,

          ...(query
            ? {
                OR: [
                  {
                    title: {
                      contains:
                        query,
                    },
                  },
                  {
                    description: {
                      contains:
                        query,
                    },
                  },
                ],
              }
            : {}),

          ...(view === "assigned"
            ? {
                assignees: {
                  some: {
                    userId:
                      user.id,
                  },
                },
              }
            : {}),

          ...(view === "due"
            ? {
                dueDate: {
                  lte:
                    endOfToday,
                },

                status: {
                  not:
                    "COMPLETE",
                },

                assignees: {
                  some: {
                    userId:
                      user.id,
                  },
                },
              }
            : {}),
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
      });

    return NextResponse.json(
      tasks,
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
      taskInput.parse(
        await request.json(),
      );

    await requireWorkspaceMember(
      input.workspaceId,
      user.id,
    );

    const assigneeIds =
      [...new Set(
        input.assigneeIds,
      )];

    if (assigneeIds.length) {
      const memberCount =
        await db.workspaceMember.count({
          where: {
            workspaceId:
              input.workspaceId,

            userId: {
              in:
                assigneeIds,
            },
          },
        });

      if (
        memberCount !==
        assigneeIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "Every assignee must belong to this workspace.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (input.channelId) {
      const channel =
        await requireChannelAccess(
          input.channelId,
          user.id,
        );

      if (
        channel.workspaceId !==
        input.workspaceId
      ) {
        return NextResponse.json(
          {
            error:
              "The selected channel belongs to a different workspace.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (
      input.sourceMessageId
    ) {
      const source =
        await db.message.findUnique({
          where: {
            id:
              input.sourceMessageId,
          },

          include: {
            channel: true,
          },
        });

      if (
        !source ||
        source.channel.workspaceId !==
          input.workspaceId
      ) {
        return NextResponse.json(
          {
            error:
              "Source message not found in this workspace.",
          },
          {
            status: 400,
          },
        );
      }

      await requireChannelAccess(
        source.channelId,
        user.id,
      );

      if (
        input.channelId &&
        source.channelId !==
          input.channelId
      ) {
        return NextResponse.json(
          {
            error:
              "The source message does not belong to the selected channel.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const task =
      await db.task.create({
        data: {
          workspaceId:
            input.workspaceId,

          channelId:
            input.channelId,

          sourceMessageId:
            input.sourceMessageId,

          title:
            input.title,

          description:
            input.description ||
            null,

          status:
            input.status,

          priority:
            input.priority,

          dueDate:
            input.dueDate
              ? new Date(
                  `${input.dueDate}T12:00:00`,
                )
              : null,

          createdById:
            user.id,

          assignees:
            assigneeIds.length
              ? {
                  create:
                    assigneeIds.map(
                      (userId) => ({
                        userId,
                      }),
                    ),
                }
              : undefined,

          messageLinks:
            input.sourceMessageId
              ? {
                  create: {
                    messageId:
                      input.sourceMessageId,
                  },
                }
              : undefined,
        },

        include: {
          assignees: {
            include: {
              user: true,
            },
          },

          channel: true,
        },
      });

    return NextResponse.json(
      task,
      {
        status: 201,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
