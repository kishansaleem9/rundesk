
import { WorkspaceRole } from "@/generated/prisma/client";
import { db } from "./db";

export class AccessError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 | 404 = 403,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export function isWorkspaceAdminRole(role: WorkspaceRole) {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

export async function requireWorkspaceMember(
  workspaceId: string,
  userId: string,
) {
  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!member) {
    throw new AccessError("Workspace membership not found", 403);
  }

  return member;
}

export async function requireWorkspaceAdmin(
  workspaceId: string,
  userId: string,
) {
  const member = await requireWorkspaceMember(workspaceId, userId);

  if (!isWorkspaceAdminRole(member.role)) {
    throw new AccessError("Admin access is required", 403);
  }

  return member;
}

export async function requireWorkspaceOwner(
  workspaceId: string,
  userId: string,
) {
  const member = await requireWorkspaceMember(workspaceId, userId);

  if (member.role !== WorkspaceRole.OWNER) {
    throw new AccessError("Owner access is required", 403);
  }

  return member;
}

export async function requireChannelAccess(
  channelId: string,
  userId: string,
) {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    include: {
      members: {
        where: { userId },
        take: 1,
      },
    },
  });

  if (!channel) {
    throw new AccessError("Channel not found", 404);
  }

  await requireWorkspaceMember(channel.workspaceId, userId);

  if (channel.isPrivate && !channel.members.length) {
    throw new AccessError("Channel not found", 404);
  }

  return channel;
}
