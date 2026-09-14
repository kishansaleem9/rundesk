import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { startTimer, timeApiError } from "@/lib/server/time-tracking";

const startInput = z.object({
  taskId: z.string().min(1),
  note: z.string().trim().max(500).nullable().optional(),
  /** Stop any running timer first instead of failing with 409. */
  replaceRunning: z.boolean().optional(),
});

/**
 * POST /api/timer/start — start a timer on a task.
 * 409 with `{ running }` when another timer is active and replaceRunning is not set.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const input = startInput.parse(await request.json());

    const result = await startTimer({
      userId: user.id,
      taskId: input.taskId,
      note: input.note,
      replaceRunning: input.replaceRunning,
    });

    return NextResponse.json({ ...result, serverTime: new Date() }, { status: 201 });
  } catch (error) {
    return timeApiError(error);
  }
}
