import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { reviewTimesheet, timeApiError } from "@/lib/server/time-tracking";

type Context = {
  params: Promise<{ submissionId: string }>;
};

const reviewInput = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500).nullable().optional(),
});

/**
 * PATCH /api/timesheets/approvals/:submissionId — approve or reject.
 * Admins only. A pending week can be approved or rejected; an approved week
 * can be rejected again to reopen it. Anything else is 409 `TIMESHEET_CONFLICT`.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const { submissionId } = await params;
    const input = reviewInput.parse(await request.json());

    const submission = await reviewTimesheet({
      actorId: user.id,
      submissionId,
      status: input.status,
      reviewNote: input.reviewNote,
    });

    return NextResponse.json({ submission });
  } catch (error) {
    return timeApiError(error);
  }
}
