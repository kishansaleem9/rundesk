import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";

type Context = { params: Promise<{ messageId: string }> };
const updateMessage = z.object({ content: z.string().trim().min(1).max(10000) });

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser(); const { messageId } = await params;
    const message = await db.message.findUnique({ where: { id: messageId } });
    if (!message) throw new Error("Message not found");
    if (message.authorId !== user.id) return NextResponse.json({ error: "You can only edit your own messages" }, { status: 403 });
    const input = updateMessage.parse(await request.json());
    return NextResponse.json(await db.message.update({ where: { id: messageId }, data: { content: input.content, editedAt: new Date() }, include: { author: true, reactions: { include: { user: true } }, attachments: true, _count: { select: { replies: true } } } }));
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser(); const { messageId } = await params;
    const message = await db.message.findUnique({ where: { id: messageId } });
    if (!message) throw new Error("Message not found");
    if (message.authorId !== user.id) return NextResponse.json({ error: "You can only delete your own messages" }, { status: 403 });
    await db.message.delete({ where: { id: messageId } });
    return new NextResponse(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
