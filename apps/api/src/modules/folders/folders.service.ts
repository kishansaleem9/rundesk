import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { and, asc, eq, ne, sql, type SQL } from 'drizzle-orm'
import { folders, spaces, projects } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import { resolveIsManager, folderVisibilityFilter } from '../../common/permissions/item-visibility'
import { assertCanManageContainer } from '../../common/permissions/container-access'

@Injectable()
export class FoldersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  async listBySpace(spaceId: string, actor?: { id: string; role?: string }) {
    // §2 per-item privacy: hide private folders the actor may not see.
    let visFilter: SQL | undefined
    if (actor) {
      const [ctx] = await this.db
        .select({ workspaceId: spaces.workspaceId })
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .limit(1)
      if (ctx) {
        const isManager = await resolveIsManager(this.db, ctx.workspaceId, actor.id, actor.role)
        visFilter = folderVisibilityFilter(actor.id, isManager)
      }
    }
    return this.db
      .select()
      .from(folders)
      .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false), visFilter))
      .orderBy(asc(folders.position), asc(folders.name))
  }

  /**
   * §V2-S10 frame `08:25`, spoken at `[08:23]`: *"FOLDER banaya … folder ka bhi
   * SAME NAAM dete hain"* — she deliberately reuses the name, and `[08:55]`
   * narrates the answer: *"agar koi error aata hai to yeh yahan show kar deta
   * hai."*
   *
   * THE SAME RULE LISTS ALREADY HAVE, stated the same way. `assertListNameFree`
   * and migration 0147 gave a list a unique name per project; the sibling
   * container created from the same eight-item menu had neither, so one space
   * could hold three folders called "Clients" and the sidebar gave you nothing
   * but their ids to tell them apart.
   *
   * The constraint lives in migration 0157 — a partial, case-insensitive unique
   * index on `(space_id, lower(name)) where is_archived = false`. This check
   * exists ONLY so the answer is a 409 carrying words a person can read rather
   * than a Postgres unique violation surfacing as a 500.
   *
   *   · case-insensitive — "Clients" and "clients" are the same name to whoever
   *     is reading the tree;
   *   · partial on `is_archived` — a folder in the Trash must not hold its name
   *     hostage, matching `remove()` below, which archives rather than deletes;
   *   · scoped to the SPACE, which is the container the sidebar draws folders
   *     under. Two spaces may each have a "Clients"; one space may not.
   */
  private async assertFolderNameFree(spaceId: string, name: string, exceptFolderId?: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const clash = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.spaceId, spaceId),
          eq(folders.isArchived, false),
          sql`lower(${folders.name}) = lower(${trimmed})`,
          exceptFolderId ? ne(folders.id, exceptFolderId) : undefined,
        ),
      )
      .limit(1)
    if (clash.length > 0) throw new ConflictException('Folder name taken')
  }

  async create(spaceId: string, data: { name: string; color?: string }, actorId?: string) {
    const name = (data.name ?? '').trim()
    if (!name) throw new BadRequestException('Folder name is required')
    await this.assertFolderNameFree(spaceId, name)
    const [row] = await this.db
      .insert(folders)
      .values({
        spaceId,
        name,
        color: data.color || '#354fb0',
        createdById: actorId ?? null,
      })
      .returning()
    return row
  }

  async update(
    spaceId: string,
    folderId: string,
    patch: { name?: string; color?: string; position?: number; visibility?: 'public' | 'private' },
  ) {
    if (patch.visibility !== undefined && patch.visibility !== 'public' && patch.visibility !== 'private') {
      throw new BadRequestException('visibility must be public or private')
    }
    // Rename is the other door onto the same namespace. Guarding only `create`
    // would leave the rule reachable-around: make "Clients 2", rename it to
    // "Clients", and the index — not the API — answers, with a 500.
    if (patch.name !== undefined) await this.assertFolderNameFree(spaceId, patch.name, folderId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) set.name = patch.name.trim()
    if (patch.color !== undefined) set.color = patch.color
    if (patch.position !== undefined) set.position = patch.position
    if (patch.visibility !== undefined) set.visibility = patch.visibility
    const [row] = await this.db
      .update(folders)
      .set(set)
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .returning()
    if (!row) throw new NotFoundException('Folder not found')
    return row
  }

  /**
   * Move a folder into a different space, taking its projects with it.
   *
   * `projects` carries BOTH `spaceId` and `folderId`, so moving only the folder
   * would leave its projects pointing at a space they no longer live in — they
   * would vanish from both spaces. The two are updated together.
   *
   * Cross-workspace moves are rejected: a folder must stay inside the tenant it
   * was created in.
   */
  async move(spaceId: string, folderId: string, targetSpaceId: string, actorId?: string, ipAddress?: string) {
    const [src] = await this.db
      .select({ name: folders.name, createdById: folders.createdById, workspaceId: spaces.workspaceId })
      .from(folders)
      .innerJoin(spaces, eq(spaces.id, folders.spaceId))
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .limit(1)
    if (!src) throw new NotFoundException('Folder not found')

    const [target] = await this.db
      .select({ id: spaces.id, name: spaces.name, workspaceId: spaces.workspaceId, isArchived: spaces.isArchived })
      .from(spaces)
      .where(eq(spaces.id, targetSpaceId))
      .limit(1)
    if (!target) throw new NotFoundException('Target space not found')
    if (target.workspaceId !== src.workspaceId) {
      throw new BadRequestException('A folder can only be moved within its own workspace')
    }
    if (target.isArchived) throw new BadRequestException('Cannot move into a deleted space')
    if (targetSpaceId === spaceId) return { ok: true, movedProjects: 0 }

    /*
     * The THIRD door onto the namespace, and the one that is easy to forget:
     * the index is on `(space_id, lower(name))`, so carrying "Clients" into a
     * space that already has a "Clients" is a unique violation — a 500 out of a
     * move that looked ordinary. Answered here with the same 409 and the same
     * words the other two doors use.
     */
    await this.assertFolderNameFree(targetSpaceId, src.name, folderId)

    if (actorId) {
      await assertCanManageContainer(this.db, {
        workspaceId: src.workspaceId,
        createdById: src.createdById,
        actorId,
        kind: 'folder',
        spaceId,
      })
    }

    const movedProjects = await this.db
      .update(projects)
      .set({ spaceId: targetSpaceId, updatedAt: new Date() })
      .where(eq(projects.folderId, folderId))
      .returning({ id: projects.id })
    await this.db
      .update(folders)
      .set({ spaceId: targetSpaceId, updatedAt: new Date() })
      .where(eq(folders.id, folderId))

    if (actorId) {
      await this.security.logAuditEvent({
        workspaceId: src.workspaceId,
        actorId,
        action: 'folder.moved',
        resourceType: 'folder',
        resourceId: folderId,
        description: `Moved folder "${src.name}" to space "${target.name}"`,
        ipAddress,
        metadata: { fromSpaceId: spaceId, toSpaceId: targetSpaceId, projectsMoved: movedProjects.length },
      })
    }
    return { ok: true, movedProjects: movedProjects.length }
  }

  /**
   * §13.4 — deleting a folder ARCHIVES it (soft delete) so it can be restored
   * from the workspace Trash. It used to be hard-deleted, which made a folder
   * the one container that could never be recovered.
   *
   * The folder's projects keep their `folderId`, so restoring the folder brings
   * its contents back grouped exactly as before; while the folder is archived
   * every read path treats those projects as sitting directly under the space.
   */
  async remove(spaceId: string, folderId: string, actorId?: string, ipAddress?: string) {
    // Resolve name + owning workspace up-front for the §13.3 audit event.
    const [ctx] = await this.db
      .select({ name: folders.name, workspaceId: spaces.workspaceId })
      .from(folders)
      .innerJoin(spaces, eq(spaces.id, folders.spaceId))
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .limit(1)
    if (!ctx) throw new NotFoundException('Folder not found')

    await this.db
      .update(folders)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))

    if (actorId) {
      // §13.3 — audit the container deletion (mirrors space/project/list).
      await this.security.logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId,
        action: 'folder.deleted',
        resourceType: 'folder',
        resourceId: folderId,
        description: `Deleted folder "${ctx.name}"`,
        ipAddress,
      })
    }

    return { ok: true }
  }
}
