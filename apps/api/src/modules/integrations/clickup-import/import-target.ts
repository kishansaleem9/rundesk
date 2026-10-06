import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { assertCanPlaceIn } from '../../../common/permissions/container-access'
import { isUuid } from '../../../common/validation/uuid'

/**
 * WHERE AN IMPORT MAY PUT WHAT IT IMPORTS
 * (`found-5-oct/import-writes-into-another-workspace`).
 *
 * Both importers took `targetSpaceId` as given and inserted their project
 * into it. The route's guard proves membership of `:workspaceId` and nothing
 * about the space, so a workspace admin sent `POST /workspaces/W1/import/
 * spreadsheet {targetSpaceId: <a space of W2>}` from a workspace of their own
 * and wrote a project, a list and a task into a workspace they are not in
 * (measured on lane 6 and again on lane 4; the ClickUp import the same). And
 * inside their own workspace an import made a project where its maker may
 * add nothing: a member granted `workspace.import` imported into a view-only
 * space, and into a private space they cannot open.
 *
 * ClickUp's importer puts what it imports into a location of the Workspace
 * being imported into, chosen on its Import Destination page ("select a
 * Space, Folder, or List from the Select location dropdown", help centre,
 * "Use the Spreadsheets Importer").
 *
 * So, BEFORE ANYTHING IS WRITTEN — the job row included — the space must:
 *   · be one: an id naming nothing is 404;
 *   · be a space of THIS workspace: one of another workspace is 403 with its
 *     reason, not a 404 that hides it (the owner's decision of 1 October:
 *     what a caller may not use is refused with why);
 *   · and take what the import makes there: a project, put in a space, faces
 *     what putting one there faces everywhere else — a space the importer can
 *     see, and the space's create gate (`assertCanPlaceIn`, as applying a
 *     template into a space asks it).
 */
export async function assertImportTarget(
  db: Db,
  params: { workspaceId: string; spaceId: unknown; actorId: string },
  place: typeof assertCanPlaceIn = assertCanPlaceIn,
): Promise<void> {
  if (typeof params.spaceId !== 'string' || !isUuid(params.spaceId)) {
    throw new BadRequestException('Malformed space id')
  }
  const [space] = await db
    .select({ id: spaces.id, workspaceId: spaces.workspaceId })
    .from(spaces)
    .where(eq(spaces.id, params.spaceId))
    .limit(1)
  if (!space) throw new NotFoundException('Space not found')
  // Ids as Postgres compares them — whatever their case: the guards take a
  // workspace named in capitals, and a string comparison then refused that
  // workspace's own space for a reason that was not true.
  if (space.workspaceId.toLowerCase() !== params.workspaceId.toLowerCase()) {
    throw new ForbiddenException('That space is not in this workspace')
  }
  await place(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' })
}
