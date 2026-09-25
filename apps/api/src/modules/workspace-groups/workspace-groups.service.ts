import { isManagerRole } from '../../common/permissions/workspace-roles'
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { and, eq, inArray, ilike, ne, sql } from 'drizzle-orm'
import {
  workspaceGroups,
  workspaceGroupMembers,
  workspaceMemberProfiles,
  users,
  workspaceMembers,
  tasks,
  taskAssignees,
  lists,
  projects,
  spaces,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { containerVisibilityFilter } from '../../common/permissions/container-access.guard-helper'
import { listVisibilityFilter, resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import { SecurityService } from '../security/security.service'

export type GroupCreateInput = {
  name: string
  description?: string | null
  externalId?: string | null
  alias?: string | null
  memberIds?: string[]
}

export type GroupUpdateInput = {
  name?: string
  description?: string | null
  externalId?: string | null
  alias?: string | null
}

/**
 * §A4.3 — an @-handle has to survive being typed by a human mid-sentence, so it
 * is reduced to the character set a mention parser can bound: lowercase
 * alphanumerics plus `-`/`_`. Returns null when nothing usable survives, which
 * leaves the team un-mentionable rather than reachable under a mangled handle.
 */
export function normalizeGroupAlias(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .trim()
    .replace(/^@+/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32)
  return cleaned.length >= 2 ? cleaned : null
}

@Injectable()
export class WorkspaceGroupsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  async list(workspaceId: string, opts: { search?: string } = {}) {
    const where = opts.search
      ? and(eq(workspaceGroups.workspaceId, workspaceId), ilike(workspaceGroups.name, `%${opts.search}%`))
      : eq(workspaceGroups.workspaceId, workspaceId)
    const groups = await this.db.select().from(workspaceGroups).where(where).orderBy(workspaceGroups.name)
    if (groups.length === 0) return []

    const ids = groups.map((g) => g.id)
    const memberRows = await this.db
      .select({
        groupId: workspaceGroupMembers.groupId,
        userId: workspaceGroupMembers.userId,
        email: users.email,
        displayName: users.displayName,
      })
      .from(workspaceGroupMembers)
      .innerJoin(users, eq(users.id, workspaceGroupMembers.userId))
      .where(inArray(workspaceGroupMembers.groupId, ids))

    const grouped = new Map<string, typeof memberRows>()
    for (const row of memberRows) {
      if (!grouped.has(row.groupId)) grouped.set(row.groupId, [])
      grouped.get(row.groupId)!.push(row)
    }

    return groups.map((g) => ({
      ...g,
      members: (grouped.get(g.id) ?? []).map((r) => ({
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
      })),
      memberCount: grouped.get(g.id)?.length ?? 0,
    }))
  }

  async get(workspaceId: string, groupId: string) {
    const [group] = await this.db
      .select()
      .from(workspaceGroups)
      .where(and(eq(workspaceGroups.id, groupId), eq(workspaceGroups.workspaceId, workspaceId)))
      .limit(1)
    if (!group) throw new NotFoundException(`Group ${groupId} not found`)
    const members = await this.db
      .select({
        userId: workspaceGroupMembers.userId,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(workspaceGroupMembers)
      .innerJoin(users, eq(users.id, workspaceGroupMembers.userId))
      .where(eq(workspaceGroupMembers.groupId, groupId))
    return { ...group, members }
  }

  /** Resolve a group by SCIM externalId or by id, scoped to workspace. */
  async findByIdOrExternal(workspaceId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(workspaceGroups)
      .where(
        and(
          eq(workspaceGroups.workspaceId, workspaceId),
          sql`(${workspaceGroups.id}::text = ${key} OR ${workspaceGroups.externalId} = ${key})`,
        ),
      )
      .limit(1)
    return row ?? null
  }

  async create(workspaceId: string, actorId: string | null, input: GroupCreateInput) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw new BadRequestException('Group name is required')
    // Coerce a non-array memberIds (e.g. a stray string) to empty — otherwise
    // `.length`/`.map` on a non-array threw and surfaced as a 500.
    const memberIds = Array.isArray(input.memberIds) ? input.memberIds : []
    if (memberIds.length > 0) await this.assertMembersOfWorkspace(workspaceId, memberIds)

    // §A4.3 — every team gets a handle, derived from its name when the caller
    // does not supply one, so a group created by SCIM is mentionable too.
    const alias = await this.resolveAlias(workspaceId, normalizeGroupAlias(input.alias) ?? input.name)

    try {
      const [created] = await this.db
        .insert(workspaceGroups)
        .values({
          workspaceId,
          name: input.name.trim(),
          description: input.description ?? null,
          externalId: input.externalId ?? null,
          alias,
          createdById: actorId,
        })
        .returning()

      if (memberIds.length > 0) {
        await this.db
          .insert(workspaceGroupMembers)
          .values(memberIds.map((userId) => ({ groupId: created.id, userId })))
          .onConflictDoNothing()
      }

      await this.security.logAuditEvent({
        workspaceId,
        actorId: actorId ?? undefined,
        action: 'group.created',
        resourceType: 'workspace_group',
        resourceId: created.id,
        description: `Created group "${created.name}"`,
        metadata: { name: created.name, memberCount: memberIds.length },
      })

      return this.get(workspaceId, created.id)
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`A group named "${input.name}" already exists`)
      }
      throw err
    }
  }

  async update(workspaceId: string, groupId: string, actorId: string | null, input: GroupUpdateInput) {
    const existing = await this.get(workspaceId, groupId)
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (input.name !== undefined && input.name.trim() && input.name.trim() !== existing.name) {
      patch.name = input.name.trim()
    }
    if (input.description !== undefined) patch.description = input.description
    if (input.externalId !== undefined) patch.externalId = input.externalId
    if (input.alias !== undefined) {
      const desired = normalizeGroupAlias(input.alias)
      // An explicitly blank alias removes the handle; anything else is claimed,
      // suffixed if a sibling team already answers to it.
      patch.alias = desired ? await this.resolveAlias(workspaceId, desired, groupId) : null
    }

    if (Object.keys(patch).length > 1) {
      await this.db.update(workspaceGroups).set(patch).where(eq(workspaceGroups.id, groupId))
      await this.security.logAuditEvent({
        workspaceId,
        actorId: actorId ?? undefined,
        action: 'group.updated',
        resourceType: 'workspace_group',
        resourceId: groupId,
        description: `Updated group "${existing.name}"`,
        metadata: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') },
      })
    }

    return this.get(workspaceId, groupId)
  }

  async remove(workspaceId: string, groupId: string, actorId: string | null) {
    const existing = await this.get(workspaceId, groupId)
    await this.db.delete(workspaceGroups).where(eq(workspaceGroups.id, groupId))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.deleted',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Deleted group "${existing.name}"`,
    })
    return { ok: true }
  }

  async addMembers(workspaceId: string, groupId: string, actorId: string | null, userIds: string[]) {
    const existing = await this.get(workspaceId, groupId)
    if (userIds.length === 0) return existing
    await this.assertMembersOfWorkspace(workspaceId, userIds)
    await this.db
      .insert(workspaceGroupMembers)
      .values(userIds.map((userId) => ({ groupId, userId })))
      .onConflictDoNothing()
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.members_added',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Added ${userIds.length} member${userIds.length === 1 ? '' : 's'} to "${existing.name}"`,
      metadata: { count: userIds.length },
    })
    return this.get(workspaceId, groupId)
  }

  async removeMember(workspaceId: string, groupId: string, actorId: string | null, userId: string) {
    const existing = await this.get(workspaceId, groupId)
    await this.db
      .delete(workspaceGroupMembers)
      .where(and(eq(workspaceGroupMembers.groupId, groupId), eq(workspaceGroupMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.member_removed',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Removed member from "${existing.name}"`,
      metadata: { userId },
    })
    return this.get(workspaceId, groupId)
  }

  /**
   * Replace the entire member set. Used by SCIM PUT and by admin bulk edits.
   * Returns the refreshed group payload.
   */
  async replaceMembers(workspaceId: string, groupId: string, actorId: string | null, userIds: string[]) {
    const existing = await this.get(workspaceId, groupId)
    if (userIds.length > 0) await this.assertMembersOfWorkspace(workspaceId, userIds)

    await this.db.transaction(async (tx) => {
      await tx.delete(workspaceGroupMembers).where(eq(workspaceGroupMembers.groupId, groupId))
      if (userIds.length > 0) {
        await tx
          .insert(workspaceGroupMembers)
          .values(userIds.map((userId) => ({ groupId, userId })))
          .onConflictDoNothing()
      }
    })

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.members_replaced',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Replaced member set on "${existing.name}" (${userIds.length} members)`,
      metadata: { count: userIds.length },
    })
    return this.get(workspaceId, groupId)
  }

  /**
   * §V2-12 / frame `21:00` — the per-person work preview cards.
   *
   * The frame draws one card per person: avatar, name, job title, then a
   * NUMBERED list of what that person is working on — Priya Gupta's five items
   * beside Sarah Chang's five different ones. So the whole content of the
   * feature is that each card answers for ITS OWN person.
   *
   * WHICH IS THE PART THAT IS EASY TO FAKE, and this audit has found both
   * halves of the fake in shipped code:
   *
   *   - the FACADE: every card rendering the same list (the caller's own work,
   *     or the first person's), which looks perfect until two people have
   *     different work;
   *   - the CONFIDENT ZERO: a count that is always 0 because the grouping keyed
   *     on the wrong id. In the UI that is indistinguishable from a person who
   *     genuinely has nothing on.
   *
   * So: ONE query for everybody's open work, grouped in memory on
   * `task_assignees.user_id` — the key that was selected, not one reconstructed
   * afterwards — and `openCount` is the true total for that person, not the
   * length of the slice the card shows. A card that says 12 and lists 5 is
   * correct; a card that says 5 because it counted its own list is a number
   * that can never disagree with the list, which makes it decoration.
   *
   * Tasks reach a workspace only through list → project → space, the same join
   * chain the person profile and the activity feed use. `isArchived` covers
   * both archived and trashed tasks (see the note in schema/tasks.ts), so
   * neither shows up as somebody's current work.
   */
  async workPreview(
    workspaceId: string,
    opts: { perPerson?: number; actorId: string; globalRole?: string | null },
  ) {
    const limit = Math.min(Math.max(Math.trunc(opts.perPerson ?? 5) || 5, 1), 10)
    /*
     * WHAT THE VIEWER MAY SEE, not what exists. This listed every member's open
     * tasks across the workspace with no viewer at all, so a member kept out of
     * a private space, project or list — or a private task — read its titles
     * and due dates off a teammate's card. The rules are the ones every other
     * task list applies; the count below is of what is shown, since a count of
     * hidden tasks says they exist.
     */
    const isManager = await resolveIsManager(this.db, workspaceId, opts.actorId, opts.globalRole)

    const people = await this.db
      .select({
        userId: workspaceMembers.userId,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        jobTitle: workspaceMemberProfiles.jobTitle,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .leftJoin(
        workspaceMemberProfiles,
        and(
          eq(workspaceMemberProfiles.userId, workspaceMembers.userId),
          eq(workspaceMemberProfiles.workspaceId, workspaceId),
        ),
      )
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(users.displayName)

    if (people.length === 0) return []

    const ids = people.map((p) => p.userId)
    const rows = await this.db
      .select({
        userId: taskAssignees.userId,
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        dueDate: tasks.dueDate,
        listId: tasks.listId,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          inArray(taskAssignees.userId, ids),
          eq(tasks.isArchived, false),
          ne(tasks.statusCategory, 'closed'),
          containerVisibilityFilter(this.db, opts.actorId, isManager),
          listVisibilityFilter(opts.actorId, isManager),
          taskVisibilityFilter(this.db, opts.actorId, isManager),
        ),
      )
      // Soonest first, undated last — the order the card's 1…5 numbering means.
      .orderBy(sql`${tasks.dueDate} asc nulls last`, tasks.position, tasks.title)

    const byPerson = new Map<string, typeof rows>()
    for (const row of rows) {
      const bucket = byPerson.get(row.userId)
      if (bucket) bucket.push(row)
      else byPerson.set(row.userId, [row])
    }

    return people.map((person) => {
      const own = byPerson.get(person.userId) ?? []
      return {
        userId: person.userId,
        displayName: person.displayName,
        email: person.email,
        avatarUrl: person.avatarUrl,
        role: person.role,
        jobTitle: person.jobTitle ?? null,
        /** Everything open, not the slice below. */
        openCount: own.length,
        items: own.slice(0, limit).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          statusCategory: r.statusCategory,
          dueDate: r.dueDate,
          listId: r.listId,
        })),
      }
    })
  }

  /**
   * The job title under the name on a person card.
   *
   * Yours, or anybody's if you administer the workspace. Not a free-for-all:
   * a title is what the org says you do, and letting any colleague rewrite it
   * makes the card unusable as an answer to "who is this".
   *
   * Upsert on (workspace, user) so a second save edits rather than duplicates;
   * clearing it back to NULL is a legitimate answer, distinct from never having
   * been asked, and the card falls back to the workspace role for neither — it
   * simply says nothing.
   */
  async setJobTitle(workspaceId: string, actorId: string, userId: string, rawTitle: string | null) {
    const [actor] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    const isAdmin = !!actor && isManagerRole(actor.role)
    if (actorId !== userId && !isAdmin) {
      throw new ForbiddenException('Only a workspace admin may change somebody else’s job title')
    }

    const [target] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!target) throw new NotFoundException('That person is not a member of this workspace')

    const trimmed = typeof rawTitle === 'string' ? rawTitle.trim().slice(0, 120) : ''
    const jobTitle = trimmed.length > 0 ? trimmed : null

    const [row] = await this.db
      .insert(workspaceMemberProfiles)
      .values({ workspaceId, userId, jobTitle })
      .onConflictDoUpdate({
        target: [workspaceMemberProfiles.workspaceId, workspaceMemberProfiles.userId],
        set: { jobTitle, updatedAt: new Date() },
      })
      .returning()

    return { userId, jobTitle: row?.jobTitle ?? null }
  }

  /**
   * Claim a free handle in this workspace, suffixing `-2`, `-3`… on collision.
   * The unique index is still the authority; this only keeps the common case
   * from surfacing as a 409 the admin has to resolve by hand.
   */
  private async resolveAlias(
    workspaceId: string,
    desired: string | null | undefined,
    excludeGroupId?: string,
  ): Promise<string | null> {
    const base = normalizeGroupAlias(desired)
    if (!base) return null
    const taken = await this.db
      .select({ alias: workspaceGroups.alias, id: workspaceGroups.id })
      .from(workspaceGroups)
      .where(eq(workspaceGroups.workspaceId, workspaceId))
    const used = new Set(
      taken.filter((r) => r.id !== excludeGroupId && r.alias).map((r) => r.alias!.toLowerCase()),
    )
    if (!used.has(base)) return base
    for (let n = 2; n < 100; n++) {
      const candidate = `${base.slice(0, 29)}-${n}`
      if (!used.has(candidate)) return candidate
    }
    return null
  }

  private async assertMembersOfWorkspace(workspaceId: string, userIds: string[]) {
    const valid = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, userIds)))
    const validSet = new Set(valid.map((v) => v.userId))
    const missing = userIds.filter((id) => !validSet.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `These users are not workspace members and cannot be added to a group: ${missing.join(', ')}`,
      )
    }
  }
}
