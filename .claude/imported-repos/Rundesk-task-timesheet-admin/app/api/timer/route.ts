import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/server/current-user";
import { getActiveTimer, timeApiError } from "@/lib/server/time-tracking";

/**
 * GET /api/timer — the caller's running timer, or null.
 * Lets any page recover a timer after a refresh or a new login.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const timer = await getActiveTimer(user.id);

    return NextResponse.json({ timer, serverTime: new Date() });
  } catch (error) {
    return timeApiError(error);
  }
}
