import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { createManualEntry, timeApiError } from "@/lib/server/time-tracking";

const instant = z
  .string()
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Invalid date" });

export const manualEntryInput = z.object({
  taskId: z.string().min(1),
  /** ISO instant. For duration-only entries the client sends local midnight. */
  startedAt: instant,
  /** ISO instant; omit or null for a duration-only entry. */
  endedAt: instant.nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * POST /api/time-entries — add time manually against a task.
 * Either `endedAt` (duration derived) or `durationSeconds` is required.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const input = manualEntryInput.parse(await request.json());

    const entry = await createManualEntry({
      userId: user.id,
      taskId: input.taskId,
      startedAt: input.startedAt,
      endedAt: input.endedAt ?? null,
      durationSeconds: input.durationSeconds ?? null,
      note: input.note,
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return timeApiError(error);
  }
}
