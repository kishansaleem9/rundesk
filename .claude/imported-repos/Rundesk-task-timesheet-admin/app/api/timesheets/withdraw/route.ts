import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { timeApiError, withdrawTimesheet } from "@/lib/server/time-tracking";
import { isDayKey, startOfWeekKey } from "@/lib/rundesk/time";

const withdrawInput = z.object({
  week: z.string().refine(isDayKey, { message: "week must be YYYY-MM-DD" }),
  workspaceId: z.string().min(1).optional(),
});

/**
 * POST /api/timesheets/withdraw — take back a pending submission.
 * Only a SUBMITTED week can be withdrawn; approved or rejected weeks return
 * 409 `TIMESHEET_CONFLICT`. The week becomes editable again.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const input = withdrawInput.parse(await request.json());

    await withdrawTimesheet({
      actorId: user.id,
      workspaceId: input.workspaceId,
      weekStart: startOfWeekKey(input.week),
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return timeApiError(error);
  }
}
