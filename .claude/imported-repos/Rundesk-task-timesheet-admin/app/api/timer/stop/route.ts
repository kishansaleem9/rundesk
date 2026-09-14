import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { stopTimer, timeApiError } from "@/lib/server/time-tracking";

const stopInput = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * POST /api/timer/stop — stop the caller's running timer.
 * Returns the finished entry, or `{ entry: null }` if nothing was running.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.text();
    const input = stopInput.parse(body ? JSON.parse(body) : {});

    const entry = await stopTimer({ userId: user.id, note: input.note });

    return NextResponse.json({ entry });
  } catch (error) {
    return timeApiError(error);
  }
}
