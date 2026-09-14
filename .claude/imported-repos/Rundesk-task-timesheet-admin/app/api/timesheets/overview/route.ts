import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { getTimesheetOverview, timeApiError } from "@/lib/server/time-tracking";
import { isDayKey, isValidTimeZone, startOfWeekKey, toDayKey } from "@/lib/rundesk/time";

const overviewQuery = z.object({
  /** Any day of the wanted week; snapped to its Monday. Defaults to today in `tz`. */
  week: z.string().refine(isDayKey, { message: "week must be YYYY-MM-DD" }).nullish(),
  tz: z
    .string()
    .trim()
    .max(64)
    .refine(isValidTimeZone, { message: "tz must be a valid IANA time zone" })
    .nullish(),
  channelId: z.string().min(1).nullish(),
  workspaceId: z.string().min(1).nullish(),
});

/**
 * GET /api/timesheets/overview?week=YYYY-MM-DD&tz=Area/City[&channelId=…][&workspaceId=…]
 *
 * Admins only. One row per workspace member with per-day and weekly totals for
 * the week in `tz`, their submission for that week and whether a timer is
 * running. `channelId` restricts the rows to that channel's members.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const params = request.nextUrl.searchParams;
    const query = overviewQuery.parse({
      week: params.get("week") || null,
      tz: params.get("tz") || null,
      channelId: params.get("channelId") || null,
      workspaceId: params.get("workspaceId") || null,
    });

    const timeZone = query.tz || "UTC";

    const overview = await getTimesheetOverview({
      actorId: user.id,
      workspaceId: query.workspaceId,
      weekStart: startOfWeekKey(query.week || toDayKey(new Date(), timeZone)),
      timeZone,
      channelId: query.channelId,
    });

    return NextResponse.json(overview);
  } catch (error) {
    return timeApiError(error);
  }
}
