import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const [mentions, reactions, assignments, threads] = await Promise.all([
      db.messageMention.findMany({ where: { userId: user.id }, include: { message: { include: { author: true, channel: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
      db.messageReaction.findMany({ where: { message: { authorId: user.id }, userId: { not: user.id } }, include: { user: true, message: { include: { channel: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
      db.messageAssignment.findMany({ where: { assigneeId: user.id }, include: { assignedBy: true, message: { include: { channel: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
      db.message.findMany({ where: { parentMessageId: { not: null }, parent: { followers: { some: { userId: user.id } } }, authorId: { not: user.id } }, include: { author: true, channel: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    return NextResponse.json({ mentions, reactions, assignments, threads });
  } catch (error) { return apiError(error); }
}
