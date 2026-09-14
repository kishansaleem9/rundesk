import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { requireChannelAccess } from "@/lib/server/access";

type Context = { params: Promise<{ storageKey: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { storageKey } = await params;
  if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(storageKey)) return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
  try { const user = await getCurrentUser(); const attachment = await db.messageAttachment.findUnique({ where: { storageKey }, include: { message: { select: { channelId: true } } } }); if (!attachment) return NextResponse.json({ error: "File not found" }, { status: 404 }); await requireChannelAccess(attachment.message.channelId, user.id); const directory = path.join(process.cwd(), "storage", "uploads"); const file = await readFile(path.join(directory, storageKey)); const safeName = attachment.originalName.replace(/["\r\n]/g, "_"); return new NextResponse(file, { headers: { "content-type": attachment.mimeType, "content-disposition": `inline; filename="${safeName}"`, "x-content-type-options": "nosniff" } }); } catch { return NextResponse.json({ error: "File not found" }, { status: 404 }); }
}
