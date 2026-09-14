import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { WorkspaceRole } from "@/generated/prisma/client";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireWorkspaceAdmin } from "@/lib/server/access";

const addMemberInput = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(191),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});

const includeMember = {
  user: true,
} as const;

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

    const actor = await requireWorkspaceAdmin(
      workspaceId,
      currentUser.id,
    );

    const members = await db.workspaceMember.findMany({
      where: { workspaceId },
      include: includeMember,
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    });

    return NextResponse.json({
      currentRole: actor.role,
      members,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const input = addMemberInput.parse(await request.json());

    const actor = await requireWorkspaceAdmin(
      input.workspaceId,
      currentUser.id,
    );

    if (
      actor.role === WorkspaceRole.ADMIN &&
      input.role !== "MEMBER"
    ) {
      return NextResponse.json(
        { error: "Admins can add members, but only the owner can grant admin access." },
        { status: 403 },
      );
    }

    const normalizedEmail = input.email.toLowerCase();

    const user = await db.user.upsert({
      where: { email: normalizedEmail },
      update: {
        name: input.name,
      },
      create: {
        name: input.name,
        email: normalizedEmail,
      },
    });

    const existing = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This user is already a workspace member." },
        { status: 409 },
      );
    }

    const member = await db.workspaceMember.create({
      data: {
        workspaceId: input.workspaceId,
        userId: user.id,
        role: input.role as WorkspaceRole,
      },
      include: includeMember,
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}