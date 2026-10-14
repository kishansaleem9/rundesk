import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { folders, lists, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { assertCanPlaceIn } from '../../common/permissions/container-access'
import { canSeePrivateItem, resolveIsManager } from '../../common/permissions/item-visibility'
import { readableProject, type ReadActor } from '../../common/permissions/read-access'
import { assertCanCreateTaskIn } from '../../common/permissions/task-create'
import { isUuid } from '../../common/validation/uuid'
import type { ImportDestination } from './imports.types'

/**
 * WHERE AN IMPORT MAY PUT WHAT IT IMPORTS (§2.2 "CHOOSE WHERE TO IMPORT YOUR
 * TASKS.") — asked before the job is queued, and asked again when a run
 * starts or resumes, because access can end in between.
 *
 * RUNDESK has one level ClickUp does not: Space → Folder → PROJECT → List. So
 * a Space becomes its hidden list container, a Folder gets a new project, a
 * Project gets a new List, and a List takes the tasks itself. Each asks what
 * creating that thing there asks everywhere else (`assertCanPlaceIn`, and for
 * a List the task create gate), in the words those rules refuse in.
 */
export type ResolvedDestination = ImportDestination & {
  workspaceId: string
  name: string
  /** "Space / Folder / Project / List", for the report header. */
  path: string
  spaceId: string
  folderId: string | null
  /** The folder's own Settings › Statuses: lists made in a 'space'-scoped folder share the space's statuses. */
  folderStatusScope: string | null
  /** The existing project (destination Project, or a List's project). */
  projectId: string | null
  listId: string | null
}

export const NOT_IN_WORKSPACE = 'That location is not in this workspace'

export async function resolveDestination(
  db: Db,
  workspaceId: string,
  dest: ImportDestination | undefined,
  actor: ReadActor,
  rules = { place: assertCanPlaceIn, createTask: assertCanCreateTaskIn },
): Promise<ResolvedDestination> {
  if (!dest || !['space', 'folder', 'project', 'list'].includes(dest.type)) {
    throw new BadRequestException('Choose where to import your tasks.')
  }
  if (typeof dest.id !== 'string' || !isUuid(dest.id)) throw new BadRequestException('Malformed location id')
  const sameWs = (ws: string) => ws.toLowerCase() === workspaceId.toLowerCase()

  if (dest.type === 'space') {
    const [space] = await db
      .select({ id: spaces.id, name: spaces.name, workspaceId: spaces.workspaceId, isArchived: spaces.isArchived })
      .from(spaces)
      .where(eq(spaces.id, dest.id))
      .limit(1)
    if (!space) throw new NotFoundException('Space not found')
    if (!sameWs(space.workspaceId)) throw new ForbiddenException(NOT_IN_WORKSPACE)
    if (space.isArchived) throw new BadRequestException('That space is in the trash.')
    await rules.place(db, { spaceId: space.id, actorId: actor.id, kind: 'list' })
    return {
      ...dest,
      workspaceId,
      name: space.name,
      path: space.name,
      spaceId: space.id,
      folderId: null,
      folderStatusScope: null,
      projectId: null,
      listId: null,
    }
  }

  if (dest.type === 'folder') {
    const [row] = await db
      .select({
        id: folders.id,
        name: folders.name,
        visibility: folders.visibility,
        createdById: folders.createdById,
        isArchived: folders.isArchived,
        statusScope: folders.statusScope,
        spaceId: spaces.id,
        spaceName: spaces.name,
        workspaceId: spaces.workspaceId,
      })
      .from(folders)
      .innerJoin(spaces, eq(spaces.id, folders.spaceId))
      .where(eq(folders.id, dest.id))
      .limit(1)
    if (!row) throw new NotFoundException('Folder not found')
    if (!sameWs(row.workspaceId)) throw new ForbiddenException(NOT_IN_WORKSPACE)
    if (row.isArchived) throw new BadRequestException('That folder is in the trash.')
    const isManager = await resolveIsManager(db, workspaceId, actor.id, actor.role)
    if (!canSeePrivateItem({ visibility: row.visibility, createdById: row.createdById }, { userId: actor.id, isManager })) {
      throw new ForbiddenException('This folder is private')
    }
    await rules.place(db, { spaceId: row.spaceId, actorId: actor.id, kind: 'project' })
    return {
      ...dest,
      workspaceId,
      name: row.name,
      path: `${row.spaceName} / ${row.name}`,
      spaceId: row.spaceId,
      folderId: row.id,
      folderStatusScope: row.statusScope ?? null,
      projectId: null,
      listId: null,
    }
  }

  if (dest.type === 'project') {
    const readable = await readableProject(db, workspaceId, dest.id, actor)
    if (!readable) throw new NotFoundException('Project not found')
    const [row] = await db
      .select({
        name: projects.name,
        isArchived: projects.isArchived,
        isDefault: projects.isDefaultContainer,
        folderId: projects.folderId,
        spaceName: spaces.name,
        folderName: folders.name,
        folderStatusScope: folders.statusScope,
      })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .leftJoin(folders, eq(folders.id, projects.folderId))
      .where(eq(projects.id, dest.id))
      .limit(1)
    if (!row || row.isArchived) throw new BadRequestException('That project is in the trash.')
    await rules.place(db, { spaceId: readable.spaceId, projectId: dest.id, actorId: actor.id, kind: 'list' })
    const path = [row.spaceName, row.folderName, row.isDefault ? null : row.name].filter(Boolean).join(' / ')
    return {
      ...dest,
      workspaceId,
      name: row.isDefault ? row.spaceName : row.name,
      path,
      spaceId: readable.spaceId,
      folderId: row.folderId,
      folderStatusScope: row.folderStatusScope ?? null,
      projectId: dest.id,
      listId: null,
    }
  }

  // A List: the task create gate answers for it (trash, privacy, the space's level).
  const home = await rules.createTask(db, dest.id, actor.id)
  if (!sameWs(home.workspaceId)) throw new ForbiddenException(NOT_IN_WORKSPACE)
  const [row] = await db
    .select({
      name: lists.name,
      projectName: projects.name,
      isDefault: projects.isDefaultContainer,
      spaceName: spaces.name,
      folderName: folders.name,
      folderStatusScope: folders.statusScope,
    })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .leftJoin(folders, eq(folders.id, projects.folderId))
    .where(eq(lists.id, dest.id))
    .limit(1)
  if (!row) throw new NotFoundException('List not found')
  return {
    ...dest,
    workspaceId,
    name: row.name,
    path: [row.spaceName, row.folderName, row.isDefault ? null : row.projectName, row.name].filter(Boolean).join(' / '),
    spaceId: home.spaceId,
    folderId: home.folderId,
    folderStatusScope: row.folderStatusScope ?? null,
    projectId: home.projectId,
    listId: dest.id,
  }
}
