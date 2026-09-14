import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { assignTimesheet, timeApiError } from "@/lib/server/time-tracking";

type Context = {
  params: Promise<{ submissionId: string }>;
};

const assignInput = z.object({
  /** An admin/owner of the workspace, or null to unassign. */
  assigneeId: z.string().min(1).nullable(),
});

/**
 * PATCH /api/timesheets/approvals/:submissionId/assignee — assign, reassign
 * or unassign the admin responsible for reviewing. Admins only; allowed in
 * every status. 400 when the assignee is not an admin of the workspace.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const { submissionId } = await params;
    const input = assignInput.parse(await request.json());

    const submission = await assignTimesheet({
      actorId: user.id,
      submissionId,
      assigneeId: input.assigneeId,
    });

    return NextResponse.json({ submission });
  } catch (error) {
    return timeApiError(error);
  }
}
