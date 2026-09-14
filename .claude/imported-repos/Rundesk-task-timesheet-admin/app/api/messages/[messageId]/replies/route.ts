import { NextRequest } from "next/server";
import { GET as getMessages, POST as postMessage } from "@/app/api/channels/[channelId]/messages/route";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

type Context = { params: Promise<{ messageId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try { const { messageId } = await params; const message = await db.message.findUnique({ where: { id: messageId } }); if (!message) throw new Error("Message not found"); const url = new URL(request.url); url.searchParams.set("parentMessageId", messageId); return getMessages(new NextRequest(url), { params: Promise.resolve({ channelId: message.channelId }) }); } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest, { params }: Context) {
  try { const { messageId } = await params; const message = await db.message.findUnique({ where: { id: messageId } }); if (!message) throw new Error("Message not found"); const body = await request.json() as { content?: string }; const forwarded = new NextRequest(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, parentMessageId: messageId }) }); return postMessage(forwarded, { params: Promise.resolve({ channelId: message.channelId }) }); } catch (error) { return apiError(error); }
}
