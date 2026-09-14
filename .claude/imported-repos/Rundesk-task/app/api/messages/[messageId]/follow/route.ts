import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";
import { requireChannelAccess } from "@/lib/server/access";

type Context = { params: Promise<{ messageId: string }> };

async function getMessage(messageId:string,userId:string){
  const message=await db.message.findUnique({where:{id:messageId}});
  if(!message)throw new Error("Message not found");
  await requireChannelAccess(message.channelId,userId);
  return message;
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const { messageId } = await params;
    await getMessage(messageId,user.id);
    const existing=await db.threadFollower.findUnique({where:{messageId_userId:{messageId,userId:user.id}}});
    return NextResponse.json({following:Boolean(existing)});
  } catch (error) { return apiError(error); }
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const { messageId } = await params;
    await getMessage(messageId,user.id);
    const key = { messageId_userId: { messageId, userId: user.id } };
    const existing = await db.threadFollower.findUnique({ where: key });
    if (existing) await db.threadFollower.delete({ where: key });
    else await db.threadFollower.create({ data: { messageId, userId: user.id } });
    return NextResponse.json({ following: !existing });
  } catch (error) { return apiError(error); }
}
