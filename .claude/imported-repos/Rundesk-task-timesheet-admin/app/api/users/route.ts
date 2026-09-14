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
    const currentUser = await getCurrentUser();
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }

    const membership = await requireWorkspaceMember(
      workspaceId,
      currentUser.id,
    );

    const canSeeEmail = isWorkspaceAdminRole(membership.role);

    const users = await db.user.findMany({
      where: {
        workspaceMemberships: {
          some: { workspaceId },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      users.map((user) => ({
        ...user,
        email:
          canSeeEmail || user.id === currentUser.id
            ? user.email
            : "",
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}
