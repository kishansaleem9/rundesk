import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireWorkspaceMember } from "@/lib/server/access";

type Context = {
  params: Promise<{
    taskId: string;
  }>;
};

const taskUpdate =
  z.object({
    title:
      z.string()
        .trim()
        .min(1)
        .max(200)
        .optional(),

    description:
      z.string()
        .trim()
        .max(5000)
        .nullable()
        .optional(),

    status:
      z.enum([
        "TODO",
        "IN_PROGRESS",
        "COMPLETE",
      ])
        .optional(),

    priority:
      z.enum([
        "LOW",
        "NORMAL",
        "HIGH",
        "URGENT",
      ])
        .optional(),

    dueDate:
      z.string()
        .date()
        .nullable()
        .optional(),

    assigneeIds:
      z.array(z.string())
        .max(20)
        .optional(),
  });

async function taskPermission(
  workspaceId: string,
  actorId: string,
  creatorId: string,
  assigneeIds: string[],
) {
  const membership =
    await requireWorkspaceMember(
      workspaceId,
      actorId,
    );

  return {
    canEdit:
      creatorId === actorId ||
      assigneeIds.includes(actorId) ||
      membership.role === "OWNER" ||
      membership.role === "ADMIN",

    canDelete:
      creatorId === actorId ||
      membership.role === "OWNER" ||
      membership.role === "ADMIN",
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const user =
      await getCurrentUser();

    const { taskId } =
      await params;

    const existing =
      await db.task.findUnique({
        where: {
          id: taskId,
        },

        include: {
          assignees: true,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Task not found",
        },
        {
          status: 404,
        },
      );
    }

    const permission =
      await taskPermission(
        existing.workspaceId,
        user.id,
        existing.createdById,
        existing.assignees.map(
          (assignee) =>
            assignee.userId,
        ),
      );

    if (!permission.canEdit) {
      return NextResponse.json(
        {
          error:
            "Only the creator, an assignee, or a workspace admin can edit this task.",
        },
        {
          status: 403,
        },
      );
    }

    const input =
      taskUpdate.parse(
        await request.json(),
      );

    const {
      assigneeIds,
      dueDate,
      ...data
    } = input;

    const uniqueAssigneeIds =
      assigneeIds
        ? [
            ...new Set(
              assigneeIds,
            ),
          ]
        : undefined;

    if (
      uniqueAssigneeIds
    ) {
      const memberCount =
        await db.workspaceMember.count({
          where: {
            workspaceId:
              existing.workspaceId,

            userId: {
              in:
                uniqueAssigneeIds,
            },
          },
        });

      if (
        memberCount !==
        uniqueAssigneeIds.length
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

    const task =
      await db.task.update({
        where: {
          id: taskId,
        },

        data: {
          ...data,

          ...(dueDate !==
          undefined
            ? {
                dueDate:
                  dueDate
                    ? new Date(
                        `${dueDate}T12:00:00`,
                      )
                    : null,
              }
            : {}),

          ...(uniqueAssigneeIds
            ? {
                assignees: {
                  deleteMany:
                    {},

                  create:
                    uniqueAssigneeIds.map(
                      (userId) => ({
                        userId,
                      }),
                    ),
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
      });

    return NextResponse.json(
      task,
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

    const { taskId } =
      await params;

    const task =
      await db.task.findUnique({
        where: {
          id: taskId,
        },

        include: {
          assignees: true,
        },
      });

    if (!task) {
      return NextResponse.json(
        {
          error:
            "Task not found",
        },
        {
          status: 404,
        },
      );
    }

    const permission =
      await taskPermission(
        task.workspaceId,
        user.id,
        task.createdById,
        task.assignees.map(
          (assignee) =>
            assignee.userId,
        ),
      );

    if (
      !permission.canDelete
    ) {
      return NextResponse.json(
        {
          error:
            "Only the task creator or a workspace admin can delete it.",
        },
        {
          status: 403,
        },
      );
    }

    await db.task.delete({
      where: {
        id: taskId,
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
