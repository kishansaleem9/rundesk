import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import {
  isWorkspaceAdminRole,
  requireChannelAccess,
  requireWorkspaceMember,
} from "@/lib/server/access";

type Context = {
  params: Promise<{ channelId: string }>;
};

const addInput = z.object({
  userIds: z.array(z.string()).min(1).max(50),
});

const preferenceInput = z.object({
  notificationsMuted: z.boolean(),
});

async function canManageMembers(
  workspaceId: string,
  actorId: string,
  createdById: string,
) {
  if (actorId === createdById) return true;

  const membership = await requireWorkspaceMember(workspaceId, actorId);
  return isWorkspaceAdminRole(membership.role);
}

async function memberList(
  channelId: string,
  viewerId: string,
  workspaceId: string,
) {
  const viewerMembership = await requireWorkspaceMember(workspaceId, viewerId);
  const canSeeEmail = isWorkspaceAdminRole(viewerMembership.role);

  const members = await db.channelMember.findMany({
    where: { channelId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });

  return members.map((member) => ({
    ...member,
    user: {
      ...member.user,
      email:
        canSeeEmail || member.userId === viewerId
          ? member.user.email
          : "",
    },
  }));
}

export async function GET(
  _request: NextRequest,
  { params }: Context,
) {
  try {
    const user = await getCurrentUser();
    const { channelId } = await params;
    const channel = await requireChannelAccess(channelId, user.id);

    return NextResponse.json(
      await memberList(channelId, user.id, channel.workspaceId),
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
    const actor = await getCurrentUser();
    const { channelId } = await params;
    const channel = await requireChannelAccess(channelId, actor.id);

    if (channel.type !== "CHANNEL") {
      return NextResponse.json(
        { error: "Direct-message membership cannot be changed from the channel member panel." },
        { status: 400 },
      );
    }

    if (
      !(await canManageMembers(
        channel.workspaceId,
        actor.id,
        channel.createdById,
      ))
    ) {
      return NextResponse.json(
        { error: "Only the channel creator or a workspace admin can add members." },
        { status: 403 },
      );
    }

    const { userIds } = addInput.parse(await request.json());
    const uniqueIds = [...new Set(userIds)];

    const workspaceMemberCount = await db.workspaceMember.count({
      where: {
        workspaceId: channel.workspaceId,
        userId: { in: uniqueIds },
      },
    });

    if (workspaceMemberCount !== uniqueIds.length) {
      return NextResponse.json(
        { error: "Every person must belong to this workspace before being added to the channel." },
        { status: 400 },
      );
    }

    await db.channelMember.createMany({
      data: uniqueIds.map((userId) => ({ channelId, userId })),
      skipDuplicates: true,
    });

    return NextResponse.json(
      await memberList(channelId, actor.id, channel.workspaceId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const user = await getCurrentUser();
    const { channelId } = await params;
    const channel = await requireChannelAccess(channelId, user.id);
    const input = preferenceInput.parse(await request.json());

    const membership = await db.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId,
          userId: user.id,
        },
      },
      update: {
        notificationsMuted: input.notificationsMuted,
      },
      create: {
        channelId,
        userId: user.id,
        notificationsMuted: input.notificationsMuted,
      },
      include: { user: true },
    });

    const workspaceMembership = await requireWorkspaceMember(
      channel.workspaceId,
      user.id,
    );

    return NextResponse.json({
      ...membership,
      user: {
        ...membership.user,
        email:
          isWorkspaceAdminRole(workspaceMembership.role)
            ? membership.user.email
            : membership.user.id === user.id
              ? membership.user.email
              : "",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: Context,
) {
  try {
    const actor = await getCurrentUser();
    const { channelId } = await params;
    const channel = await requireChannelAccess(channelId, actor.id);

    if (channel.type !== "CHANNEL") {
      return NextResponse.json(
        { error: "Direct-message membership cannot be changed from this endpoint." },
        { status: 400 },
      );
    }

    const userId = request.nextUrl.searchParams.get("userId") ?? actor.id;

    if (userId !== actor.id) {
      const canManage = await canManageMembers(
        channel.workspaceId,
        actor.id,
        channel.createdById,
      );

      if (!canManage) {
        return NextResponse.json(
          { error: "Not authorized" },
          { status: 403 },
        );
      }
    }

    if (userId === channel.createdById) {
      return NextResponse.json(
        { error: "The channel creator cannot leave or be removed." },
        { status: 400 },
      );
    }

    await db.channelMember.delete({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}