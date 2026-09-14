import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { TimeEntryType } from "@/generated/prisma/client";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireWorkspaceMember } from "@/lib/server/access";
import { findLockedTimeOnTask, getActiveTimer } from "@/lib/server/time-tracking";

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

  const isAdmin =
    membership.role === "OWNER" ||
    membership.role === "ADMIN";

  return {
    canEdit:
      creatorId === actorId ||
      assigneeIds.includes(actorId) ||
      isAdmin,

    canDelete:
      creatorId === actorId ||
      isAdmin,

    isAdmin,
  };
}

const taskInclude = {
  assignees: { include: { user: true } },
  channel: true,
} as const;

/**
 * GET /api/tasks/:taskId — one task with the caller's permissions and a time
 * summary. Any workspace member may read it; `time.totalSeconds` covers every
 * user's completed entries (running timers excluded), `myTotalSeconds` only
 * the caller's, and `running` is the caller's timer when it is on this task.
 */
export async function GET(
  _request: NextRequest,
  { params }: Context,
) {
  try {
    const user = await getCurrentUser();
    const { taskId } = await params;

    const task = await db.task.findUnique({
      where: { id: taskId },
      include: taskInclude,
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const permission = await taskPermission(
      task.workspaceId,
      user.id,
      task.createdById,
      task.assignees.map((assignee) => assignee.userId),
    );

    const completed = {
      taskId,
      NOT: { entryType: TimeEntryType.TIMER, endedAt: null },
    };

    const [all, mine, running] = await Promise.all([
      db.timeEntry.aggregate({
        where: completed,
        _sum: { durationSeconds: true },
        _count: { _all: true },
      }),
      db.timeEntry.aggregate({
        where: { ...completed, userId: user.id },
        _sum: { durationSeconds: true },
      }),
      getActiveTimer(user.id),
    ]);

    return NextResponse.json({
      ...task,
      // Like /api/bootstrap: other people's emails only for admins.
      assignees: task.assignees.map((assignee) => ({
        ...assignee,
        user: {
          ...assignee.user,
          email:
            permission.isAdmin || assignee.userId === user.id ? assignee.user.email : "",
        },
      })),
      permissions: { canEdit: permission.canEdit, canDelete: permission.canDelete },
      time: {
        totalSeconds: all._sum.durationSeconds ?? 0,
        myTotalSeconds: mine._sum.durationSeconds ?? 0,
        entriesCount: all._count._all,
        running: running && running.taskId === taskId ? running : null,
      },
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

    // Deleting cascades to time entries; approved or pending time must not vanish.
    const lockedWeek = await findLockedTimeOnTask(taskId);

    if (lockedWeek) {
      return NextResponse.json(
        {
          error:
            "This task has time in a submitted or approved timesheet and can't be deleted.",
          code: "TIMESHEET_LOCKED",
          submission: lockedWeek,
        },
        { status: 409 },
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
