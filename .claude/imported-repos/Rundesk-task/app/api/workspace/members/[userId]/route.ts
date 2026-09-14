import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { WorkspaceRole } from "@/generated/prisma/client";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireWorkspaceAdmin } from "@/lib/server/access";

const updateRoleInput = z.object({
  workspaceId: z.string().min(1),
  role: z.enum(["MEMBER", "ADMIN"]),
});

type Context = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const currentUser = await getCurrentUser();
    const { userId } = await params;
    const input = updateRoleInput.parse(await request.json());

    const actor = await requireWorkspaceAdmin(
      input.workspaceId,
      currentUser.id,
    );

    if (actor.role !== WorkspaceRole.OWNER) {
      return NextResponse.json(
        { error: "Only the workspace owner can change member roles." },
        { status: 403 },
      );
    }

    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot change your own owner role here." },
        { status: 400 },
      );
    }

    const target = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId,
        },
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Workspace member not found" },
        { status: 404 },
      );
    }

    if (target.role === WorkspaceRole.OWNER) {
      return NextResponse.json(
        { error: "The workspace owner role cannot be changed from this screen." },
        { status: 400 },
      );
    }

    const updated = await db.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId,
        },
      },
      data: {
        role: input.role as WorkspaceRole,
      },
      include: {
        user: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const currentUser = await getCurrentUser();
    const { userId } = await params;
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }

    const actor = await requireWorkspaceAdmin(
      workspaceId,
      currentUser.id,
    );

    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the admin screen." },
        { status: 400 },
      );
    }

    const target = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Workspace member not found" },
        { status: 404 },
      );
    }

    if (target.role === WorkspaceRole.OWNER) {
      return NextResponse.json(
        { error: "The workspace owner cannot be removed." },
        { status: 400 },
      );
    }

    if (
      actor.role === WorkspaceRole.ADMIN &&
      target.role !== WorkspaceRole.MEMBER
    ) {
      return NextResponse.json(
        { error: "Admins can remove members, but not owners or other admins." },
        { status: 403 },
      );
    }

    await db.$transaction([
      db.channelMember.deleteMany({
        where: {
          userId,
          channel: { workspaceId },
        },
      }),
      db.conversationMember.deleteMany({
        where: {
          userId,
          conversation: { workspaceId },
        },
      }),
      db.taskAssignee.deleteMany({
        where: {
          userId,
          task: { workspaceId },
        },
      }),
      db.workspaceMember.delete({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      }),
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}