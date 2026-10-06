import { isManagerRole } from './workspace-roles'
import { ForbiddenException } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { spaces, spaceMembers, objectShares, projectMembers, workspaceMembers } from '@rundesk/db'
import type { Db, SpaceDefaultPermission } from '@rundesk/db'

/**
 * §V2-06, frame `06:52` — "Default permission  Full edit ▾", and THE READER IT
 * NEVER HAD.
 *
 * `spaces.default_permission` was the mirror defect in its purest form: the
 * wizard asked the question, `createSpace` validated the answer, `updateSpace`
 * validated it again, the controller declared it in two body types, the column
 * is `notNull()` — and `grep -rn defaultPermission apps/api/src` returned
 * nothing outside `spaces.service.ts` and `spaces.controller.ts`. Four rungs
 * stored, no access check anywhere consuming them. The schema comment on the
 * column states a contract:
 *
 *   > What a workspace member gets on this space without an explicit grant.
 *
 * and the product broke it: every workspace member could edit every container
 * in every public space regardless of what the wizard had been told. Worse
 * than a missing feature, because the row in Postgres is evidence the feature
 * exists.
 *
 * This file is the contract's reader, written to the comment's own words:
 *
 *   · "a workspace member"            — so a workspace ADMIN or MANAGER is not
 *                                       narrowed by it. Their role already says
 *                                       they reach everything, and a space
 *                                       setting that could lock an admin out of
 *                                       their own workspace is a foot-gun, not
 *                                       a permission.
 *   · "without an explicit grant"     — so a `space_members` row or an
 *                                       `object_shares` grant on the space WINS.
 *                                       Most-specific-wins, the same rule
 *                                       `SharesService.resolveLevel` already
 *                                       uses. The space's creator is seeded as a
 *                                       `space_members` admin at creation
 *                                       (`spaces.service.ts`), so nobody can set
 *                                       a default that locks them out of the
 *                                       space they just made.
 *   · "gets on this space"            — the rungs are the SAME ladder as
 *                                       `object_shares.level`
 *                                       (view < comment < edit < admin), which
 *                                       is what the schema comment says and what
 *                                       the wizard's own `<select>` renders: it
 *                                       reuses `share.levelView` …
 *                                       `share.levelFull` rather than inventing
 *                                       a second vocabulary.
 *
 * IT CAN ONLY EVER NARROW. `rank(effective) >= rank(required)` hands the
 * decision back to whatever check called us, which may still refuse; below the
 * required rung it refuses outright. A space on `admin` therefore grants
 * NOTHING new — which is the only safe direction for a column that until now
 * nothing read, because every row already in Postgres was written by a UI that
 * believed it was inert.
 *
 * And `edit` — the column's DEFAULT and the wizard's — is exactly the rung the
 * existing container checks require, so every space that exists today behaves
 * byte-for-byte as it did. Only `view` and `comment` change an answer.
 */

/** view < comment < edit < admin. The ladder, weakest first. */
export const SPACE_LEVEL_RANK: Record<SpaceDefaultPermission, number> = {
  view: 0,
  comment: 1,
  edit: 2,
  admin: 3,
}


/**
 * Where an actor's level on a space came from. `item-share` is a guest's share
 * on something inside the space (see `within`); `guest-default` is a guest with
 * nothing shared, who holds "view" whatever the space's default says.
 */
export type SpaceLevelSource = 'workspace-role' | 'space-member' | 'object-share' | 'item-share' | 'project-member' | 'space-default' | 'guest-default'

/**
 * What a guest's level is asked ABOUT, below the space: the item and the
 * containers above it, most specific first (a task, its list, its project, the
 * project's folder). A share on any of them is a guest's grant there. A saved
 * view is such an item too: its share panel chains it view, list, project,
 * folder (`SharesService.locate`), and its writes ask the same chain
 * (`views/view-write.ts`).
 */
export type WithinStep = { type: 'task' | 'view' | 'list' | 'project' | 'folder'; id: string }

export type ResolvedSpaceLevel = {
  level: SpaceDefaultPermission
  source: SpaceLevelSource
}

/** Human wording for the 403, matching the wizard's own labels. */
const LEVEL_LABEL: Record<SpaceDefaultPermission, string> = {
  view: 'View only',
  comment: 'Comment',
  edit: 'Edit',
  admin: 'Full edit',
}

function strongest(
  a: SpaceDefaultPermission | null,
  b: SpaceDefaultPermission | null,
): SpaceDefaultPermission | null {
  if (!a) return b
  if (!b) return a
  return SPACE_LEVEL_RANK[a] >= SPACE_LEVEL_RANK[b] ? a : b
}

/**
 * What this actor holds on this space.
 *
 * `null` means "this check does not apply": either the space is gone, or the
 * actor is not a member of the owning workspace at all. The second case is
 * deliberate — an actor with no `workspace_members` row is a super-admin acting
 * across workspaces or an internal caller, and the caller's own rules (which
 * DO see the global role) must stay the authority for them. Answering `view`
 * for such an actor would narrow a super-admin using a column about members.
 */
export async function resolveSpaceLevel(
  db: Db,
  params: { spaceId: string; actorId: string; within?: WithinStep[] },
): Promise<ResolvedSpaceLevel | null> {
  const [space] = await db
    .select({ workspaceId: spaces.workspaceId, defaultPermission: spaces.defaultPermission })
    .from(spaces)
    .where(eq(spaces.id, params.spaceId))
    .limit(1)
  if (!space) return null

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, space.workspaceId),
        eq(workspaceMembers.userId, params.actorId),
      ),
    )
    .limit(1)
  if (!membership) return null
  if (isManagerRole(membership.role as string)) {
    return { level: 'admin', source: 'workspace-role' }
  }
  const guest = membership.role === 'guest'

  /*
   * A GUEST HOLDS WHAT IS SHARED WITH THEM, AND NOTHING BY DEFAULT.
   *
   * The space's default permission is "what a workspace MEMBER gets without an
   * explicit grant" (the column's own contract, above). It was read for a
   * guest too, so a guest with nothing shared made lists in any open space and
   * commented on its tasks (`found-24-sep/guest-makes-lists-where-nothing-is-shared`);
   * docs alone refused to count it. ClickUp's rule: a guest sees and changes
   * only what is shared with them, at the level it was shared at, and the most
   * specific share decides — so a share on the item or a container above it
   * (`within`) comes first, then a grant on the space, and with neither a
   * guest holds "view": they read an open space here, and change nothing in it.
   */
  if (guest && params.within?.length) {
    const rows = await db
      .select({ objectType: objectShares.objectType, objectId: objectShares.objectId, level: objectShares.level })
      .from(objectShares)
      .where(and(eq(objectShares.userId, params.actorId), inArray(objectShares.objectId, params.within.map((step) => step.id))))
    for (const step of params.within) {
      const hit = rows.find((r) => r.objectType === step.type && r.objectId === step.id)
      if (hit) return { level: hit.level as SpaceDefaultPermission, source: 'item-share' }
    }
  }

  /*
   * A MEMBER'S GRANT BELOW THE SPACE DECIDES FIRST, TOO
   * (`found-25-sep/project-roles-narrow-nothing`). ClickUp: permissions set on
   * a Folder or List override the Space's, and the most specific decides — in
   * either direction. A project's members' roles (the Members sheet) were
   * recorded and read by nothing: a member set to View on a project changed
   * its tasks and made new ones, and one given Edit on a project in a
   * view-only space could change nothing there.
   *
   * A GRANT IS WHAT SOMEBODY GAVE THEM. A project's maker is seeded as its
   * admin member (`projects.service`, added by themselves), and that row says
   * who made it, not what they were given: making something is no exception
   * to its space's level (`assertCanManageContainer`), so it is not read here.
   */
  if (!guest && params.within?.length) {
    const ids = params.within.map((step) => step.id)
    const projectIds = params.within.filter((step) => step.type === 'project').map((step) => step.id)
    const [shares, roles] = await Promise.all([
      db
        .select({ objectType: objectShares.objectType, objectId: objectShares.objectId, level: objectShares.level })
        .from(objectShares)
        .where(and(eq(objectShares.userId, params.actorId), inArray(objectShares.objectId, ids))),
      projectIds.length
        ? db
            .select({ projectId: projectMembers.projectId, role: projectMembers.role, addedById: projectMembers.addedById })
            .from(projectMembers)
            .where(and(eq(projectMembers.userId, params.actorId), inArray(projectMembers.projectId, projectIds)))
        : Promise.resolve([] as Array<{ projectId: string; role: string; addedById: string | null }>),
    ])
    for (const step of params.within) {
      const shared = (shares.find((r) => r.objectType === step.type && r.objectId === step.id)?.level as SpaceDefaultPermission | undefined) ?? null
      const given = step.type === 'project'
        ? ((roles.find((r) => r.projectId === step.id && r.addedById !== params.actorId)?.role as SpaceDefaultPermission | undefined) ?? null)
        : null
      const level = strongest(shared, given)
      if (level) return { level, source: level === given ? 'project-member' : 'item-share' }
    }
  }

  const [member] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, params.spaceId), eq(spaceMembers.userId, params.actorId)))
    .limit(1)
  const [share] = await db
    .select({ level: objectShares.level })
    .from(objectShares)
    .where(
      and(
        eq(objectShares.objectType, 'space'),
        eq(objectShares.objectId, params.spaceId),
        eq(objectShares.userId, params.actorId),
      ),
    )
    .limit(1)

  const memberLevel = (member?.role as SpaceDefaultPermission | undefined) ?? null
  const shareLevel = (share?.level as SpaceDefaultPermission | undefined) ?? null
  const explicit = strongest(memberLevel, shareLevel)
  if (explicit) {
    return { level: explicit, source: explicit === memberLevel ? 'space-member' : 'object-share' }
  }
  if (guest) return { level: 'view', source: 'guest-default' }
  return { level: space.defaultPermission, source: 'space-default' }
}

/**
 * The same question for many spaces at once, for the read paths that have to
 * decide about a whole tree (the Move picker). Three queries whatever the size
 * of the list, rather than three per space.
 *
 * Spaces the actor holds nothing on — because they are not a workspace member —
 * are absent from the map, so a caller that iterates it is filtering rather
 * than authorising and cannot accidentally widen anything.
 */
export async function resolveSpaceLevels(
  db: Db,
  params: { workspaceId: string; spaceIds: string[]; actorId: string },
): Promise<Map<string, ResolvedSpaceLevel>> {
  const out = new Map<string, ResolvedSpaceLevel>()
  if (params.spaceIds.length === 0) return out

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, params.workspaceId),
        eq(workspaceMembers.userId, params.actorId),
      ),
    )
    .limit(1)
  if (!membership) return out
  if (isManagerRole(membership.role as string)) {
    for (const id of params.spaceIds) out.set(id, { level: 'admin', source: 'workspace-role' })
    return out
  }
  // A guest holds what is shared with them: see `resolveSpaceLevel`.
  const guest = membership.role === 'guest'

  const [rows, memberRows, shareRows] = await Promise.all([
    db
      .select({ id: spaces.id, defaultPermission: spaces.defaultPermission })
      .from(spaces)
      .where(inArray(spaces.id, params.spaceIds)),
    db
      .select({ spaceId: spaceMembers.spaceId, role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(inArray(spaceMembers.spaceId, params.spaceIds), eq(spaceMembers.userId, params.actorId))),
    db
      .select({ objectId: objectShares.objectId, level: objectShares.level })
      .from(objectShares)
      .where(
        and(
          eq(objectShares.objectType, 'space'),
          inArray(objectShares.objectId, params.spaceIds),
          eq(objectShares.userId, params.actorId),
        ),
      ),
  ])

  const byMember = new Map(memberRows.map((r) => [r.spaceId, r.role as SpaceDefaultPermission]))
  const byShare = new Map(shareRows.map((r) => [r.objectId, r.level as SpaceDefaultPermission]))
  for (const row of rows) {
    const memberLevel = byMember.get(row.id) ?? null
    const shareLevel = byShare.get(row.id) ?? null
    const explicit = strongest(memberLevel, shareLevel)
    out.set(
      row.id,
      explicit
        ? { level: explicit, source: explicit === memberLevel ? 'space-member' : 'object-share' }
        : guest
          ? { level: 'view', source: 'guest-default' }
          : { level: row.defaultPermission, source: 'space-default' },
    )
  }
  return out
}

/**
 * What is shared with a guest inside the location a write asks about — the
 * outermost of a project, a list or a task below it — or null. The location
 * is the first step of `within` (a list, a project or a folder), or the space.
 */
async function sharedBelow(
  db: Db,
  params: { spaceId: string; actorId: string; within?: WithinStep[] },
): Promise<'project' | 'list' | 'task' | null> {
  const at = params.within?.[0] ?? null
  if (at && at.type !== 'list' && at.type !== 'project' && at.type !== 'folder') return null
  // Where a project, a list and a task of the location are, by the columns that hold them.
  const inPlace = (project: ReturnType<typeof sql>, list?: ReturnType<typeof sql>) =>
    !at ? sql`${project}.space_id = ${params.spaceId}`
      : at.type === 'folder' ? sql`${project}.folder_id = ${at.id}`
      : at.type === 'project' ? sql`${project}.id = ${at.id}`
      : list ? sql`${list}.id = ${at.id}` : sql`false`
  const p = sql.raw('p'), l = sql.raw('l')
  const asks: Array<['project' | 'list' | 'task', ReturnType<typeof sql>]> = [
    ['project', sql`select 1 from object_shares s join projects p on p.id = s.object_id
      where s.object_type = 'project' and s.user_id = ${params.actorId} and ${at?.type === 'list' || at?.type === 'project' ? sql`false` : inPlace(p)} limit 1`],
    ['list', sql`select 1 from object_shares s join lists l on l.id = s.object_id join projects p on p.id = l.project_id
      where s.object_type = 'list' and s.user_id = ${params.actorId} and ${at?.type === 'list' ? sql`false` : inPlace(p, l)} limit 1`],
    ['task', sql`select 1 from object_shares s join tasks t on t.id = s.object_id join lists l on l.id = t.list_id join projects p on p.id = l.project_id
      where s.object_type = 'task' and s.user_id = ${params.actorId} and ${inPlace(p, l)} limit 1`],
  ]
  for (const [kind, ask] of asks) {
    const found = await db.execute(ask)
    if ((Array.isArray(found) ? found : (found as { rows?: unknown[] }).rows ?? []).length > 0) return kind
  }
  return null
}

/** True when `level` reaches `required` on the ladder. */
export function spaceLevelReaches(
  level: SpaceDefaultPermission,
  required: SpaceDefaultPermission,
): boolean {
  return SPACE_LEVEL_RANK[level] >= SPACE_LEVEL_RANK[required]
}

/**
 * Refuse when the actor's level on the space is below `required`.
 *
 * Throws `ForbiddenException` — a 403 out of the API, not a filtered-away row,
 * because the two are different answers: "you may not" is a fact the caller can
 * act on, "it is not there" is a lie that sends them looking for it.
 */
export async function assertSpaceLevel(
  db: Db,
  params: {
    spaceId: string
    actorId: string
    required: SpaceDefaultPermission
    /** What is being acted on, for the message: 'list', 'project', 'space'… */
    kind: string
    /** The item and the containers above it, for a guest's own shares (`WithinStep`). */
    within?: WithinStep[]
    /**
     * What the refusal says was refused: "changing its" (the default),
     * "adding a" for a new one, "deleting this" / "deleting its". Edit changes what is there and
     * does not add or delete, so "does not allow changing" would be false for
     * it (`found-25-sep/full-edit-enforced-nowhere`).
     */
    act?: string
  },
): Promise<void> {
  const resolved = await resolveSpaceLevel(db, params)
  if (!resolved) return
  if (spaceLevelReaches(resolved.level, params.required)) return
  /*
   * A GUEST WHO HOLDS SOMETHING BELOW IS TOLD WHAT
   * (`found-6-oct/a-guest-shared-one-task-told-nothing-is-shared`). The guest's
   * default is reached when nothing on the location or above it is shared with
   * them, and a guest reads a location only when something inside it is: so a
   * guest whose share was a task in a list was refused every list-level write
   * as though nothing were shared — "Nothing here is shared with you".
   */
  const below = resolved.source === 'guest-default' ? await sharedBelow(db, params) : null
  throw new ForbiddenException(
    resolved.source === 'guest-default'
      ? below
        ? `Only a ${below} here is shared with you, and a guest changes only what is shared with them`
        : `Nothing here is shared with you, and a guest changes only what is shared with them`
      : resolved.source === 'item-share'
        ? `What is shared with you here is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? 'changing its'} ${params.kind}`
        : resolved.source === 'project-member'
          ? `Your access to this project is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? 'changing its'} ${params.kind}`
          : resolved.source === 'space-default'
            ? `This space's default permission is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? 'changing its'} ${params.kind}`
            : `Your access to this space is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? 'changing its'} ${params.kind}`,
  )
}
