import { ForbiddenException } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { spaces, spaceMembers, objectShares, workspaceMembers } from '@rundesk/db'
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
 * Workspace roles the space default does not narrow. Same set as
 * `item-visibility.WS_MANAGER_ROLES` — stated again rather than imported so a
 * change to one is a deliberate change to the other.
 */
const WS_UNRESTRICTED = new Set(['super_admin', 'workspace_admin', 'manager'])

/** Where an actor's level on a space came from. */
export type SpaceLevelSource = 'workspace-role' | 'space-member' | 'object-share' | 'space-default'

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
  params: { spaceId: string; actorId: string },
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
  if (WS_UNRESTRICTED.has(membership.role as string)) {
    return { level: 'admin', source: 'workspace-role' }
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
  if (WS_UNRESTRICTED.has(membership.role as string)) {
    for (const id of params.spaceIds) out.set(id, { level: 'admin', source: 'workspace-role' })
    return out
  }

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
        : { level: row.defaultPermission, source: 'space-default' },
    )
  }
  return out
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
  },
): Promise<void> {
  const resolved = await resolveSpaceLevel(db, params)
  if (!resolved) return
  if (spaceLevelReaches(resolved.level, params.required)) return
  throw new ForbiddenException(
    resolved.source === 'space-default'
      ? `This space's default permission is "${LEVEL_LABEL[resolved.level]}", which does not allow changing its ${params.kind}`
      : `Your access to this space is "${LEVEL_LABEL[resolved.level]}", which does not allow changing its ${params.kind}`,
  )
}
