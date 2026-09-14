import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/current-user";
import { deleteEntry, timeApiError, updateEntry } from "@/lib/server/time-tracking";

type Context = {
  params: Promise<{ entryId: string }>;
};

const instant = z
  .string()
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Invalid date" });

const entryPatch = z.object({
  taskId: z.string().min(1).optional(),
  startedAt: instant.optional(),
  /** null switches the entry to duration-only */
  endedAt: instant.nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** PATCH /api/time-entries/:entryId — edit your own entry (admins: anyone's). */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const { entryId } = await params;
    const patch = entryPatch.parse(await request.json());

    const entry = await updateEntry({ actorId: user.id, entryId, patch });

    return NextResponse.json(entry);
  } catch (error) {
    return timeApiError(error);
  }
}

/** DELETE /api/time-entries/:entryId */
export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const { entryId } = await params;

    await deleteEntry({ actorId: user.id, entryId });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return timeApiError(error);
  }
}
