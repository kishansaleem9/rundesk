import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/server/current-user";
import { getTimesheet, timeApiError } from "@/lib/server/time-tracking";
import { isDayKey, startOfWeekKey, toDayKey } from "@/lib/rundesk/time";

/**
 * GET /api/timesheets?week=YYYY-MM-DD&tz=Area/City[&userId=…][&workspaceId=…]
 *
 * Weekly timesheet: every task assigned to the user, the week's completed
 * entries, per task/day/week totals and the running timer, if any.
 * `week` is any day; it is snapped to that week's Monday. `userId` other than
 * the caller requires workspace admin.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const params = request.nextUrl.searchParams;

    const timeZone = params.get("tz") || "UTC";
    const weekParam = params.get("week") || toDayKey(new Date(), timeZone);

    if (!isDayKey(weekParam)) {
      return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
    }

    const timesheet = await getTimesheet({
      actorId: user.id,
      targetUserId: params.get("userId"),
      workspaceId: params.get("workspaceId"),
      weekStart: startOfWeekKey(weekParam),
      timeZone,
    });

    return NextResponse.json(timesheet);
  } catch (error) {
    return timeApiError(error);
  }
}
