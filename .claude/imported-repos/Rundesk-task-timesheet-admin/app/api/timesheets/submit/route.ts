import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { submitTimesheet, timeApiError } from "@/lib/server/time-tracking";
import { isDayKey, startOfWeekKey } from "@/lib/rundesk/time";

const submitInput = z.object({
  /** Any day of the week; snapped to that week's Monday. */
  week: z.string().refine(isDayKey, { message: "week must be YYYY-MM-DD" }),
  /** IANA zone the week is viewed in; the week stays locked in this zone. */
  tz: z.string().trim().min(1).max(64),
  note: z.string().trim().max(500).nullable().optional(),
  workspaceId: z.string().min(1).optional(),
});

/**
 * POST /api/timesheets/submit — send the caller's week for approval.
 * Locks the week: no entries can be added, edited or deleted and no timer
 * started inside it until an admin rejects it or the caller withdraws.
 * 409 `TIMESHEET_CONFLICT` when already submitted/approved or a timer is
 * running inside the week; 400 for a week that has not started yet.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const input = submitInput.parse(await request.json());

    const submission = await submitTimesheet({
      actorId: user.id,
      workspaceId: input.workspaceId,
      weekStart: startOfWeekKey(input.week),
      timeZone: input.tz,
      note: input.note,
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return timeApiError(error);
  }
}
