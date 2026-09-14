import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { listApprovals, timeApiError } from "@/lib/server/time-tracking";
import { isDayKey, startOfWeekKey } from "@/lib/rundesk/time";

const approvalsQuery = z.object({
  status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).nullish(),
  /** "me", "none" (unassigned) or a user id */
  assignedTo: z.string().min(1).nullish(),
  userId: z.string().min(1).nullish(),
  /** Any day of the wanted week; snapped to its Monday. */
  week: z.string().refine(isDayKey, { message: "week must be YYYY-MM-DD" }).nullish(),
  workspaceId: z.string().min(1).nullish(),
});

/**
 * GET /api/timesheets/approvals?status=&assignedTo=me|none|<userId>&userId=&week=[&workspaceId=]
 *
 * Workspace admins only. `submissions` match every filter, newest first;
 * `counts` is per status and honours every filter except `status`; `admins`
 * are the members a submission may be assigned to.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const params = request.nextUrl.searchParams;
    const query = approvalsQuery.parse({
      status: params.get("status") || null,
      assignedTo: params.get("assignedTo") || null,
      userId: params.get("userId") || null,
      week: params.get("week") || null,
      workspaceId: params.get("workspaceId") || null,
    });

    const result = await listApprovals({
      actorId: user.id,
      workspaceId: query.workspaceId,
      status: query.status,
      assignedToId:
        query.assignedTo === "me"
          ? user.id
          : query.assignedTo === "none"
            ? null
            : query.assignedTo,
      unassignedOnly: query.assignedTo === "none",
      userId: query.userId,
      weekStart: query.week ? startOfWeekKey(query.week) : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return timeApiError(error);
  }
}
