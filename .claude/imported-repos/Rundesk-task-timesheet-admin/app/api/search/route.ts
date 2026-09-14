import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import {
  isWorkspaceAdminRole,
  requireWorkspaceMember,
} from "@/lib/server/access";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    const channelId = request.nextUrl.searchParams.get("channelId");
    const hasAttachment =
      request.nextUrl.searchParams.get("hasAttachment") === "true";

    if (!q || !workspaceId) {
      return NextResponse.json({
        messages: [],
        channels: [],
        tasks: [],
        users: [],
      });
    }

    const membership = await requireWorkspaceMember(workspaceId, user.id);
    const canSeeEmail = isWorkspaceAdminRole(membership.role);

    const [messages, channels, tasks, users] = await Promise.all([
      db.message.findMany({
        where: {
          content: { contains: q },
          ...(channelId ? { channelId } : {}),
          ...(hasAttachment ? { attachments: { some: {} } } : {}),
          channel: {
            workspaceId,
            OR: [
              { isPrivate: false },
              { members: { some: { userId: user.id } } },
            ],
          },
        },
        include: {
          author: true,
          channel: true,
        },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),

      db.channel.findMany({
        where: {
          workspaceId,
          name: { contains: q },
          OR: [
            { isPrivate: false },
            { members: { some: { userId: user.id } } },
          ],
        },
        take: 10,
      }),

      db.task.findMany({
        where: {
          workspaceId,
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
          ],
        },
        include: {
          assignees: {
            include: { user: true },
          },
        },
        take: 20,
      }),

      db.user.findMany({
        where: {
          name: { contains: q },
          workspaceMemberships: {
            some: { workspaceId },
          },
        },
        take: 10,
      }),
    ]);

    const safeUser = <T extends { id: string; email: string }>(item: T) => ({
      ...item,
      email:
        canSeeEmail || item.id === user.id
          ? item.email
          : "",
    });

    return NextResponse.json({
      messages: messages.map((message) => ({
        ...message,
        author: safeUser(message.author),
      })),
      channels,
      tasks: tasks.map((task) => ({
        ...task,
        assignees: task.assignees.map((assignee) => ({
          ...assignee,
          user: safeUser(assignee.user),
        })),
      })),
      users: users.map(safeUser),
    });
  } catch (error) {
    return apiError(error);
  }
}