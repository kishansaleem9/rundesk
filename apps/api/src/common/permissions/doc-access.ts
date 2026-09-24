import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { docs, objectShares, spaces, spaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { isManagerRole } from './item-visibility'
import { resolveSpaceLevel } from './space-default-permission'
import { spacesRefusedToGuest } from './guest-reach'

/*
 * WHO MAY READ A DOC.
 *
 * A doc has no privacy of its own; it lives somewhere, and it is read as that
 * place is. ClickUp's rule, which this follows: a Doc in a location inherits
 * the location's permissions, a page inherits the Doc it lives in, and sharing
 * a Doc with somebody opens it, pages and all. Here a doc's location is its
 * space, and a page is a doc with a `parentDocId` — made by the docs hub with
 * NO space of its own, so the doc above it is the only thing that says where
 * it lives. Hence the chain: a doc is out of a person's reach when it, or any
 * doc above it, is filed in a private space they are not a member of — unless
 * it, or a doc above it, was shared with them directly (`object_shares`,
 * `doc`). Managers read everything, as they reach every container
 * (`containerVisibilityFilter`).
 *
 * The read was workspace membership alone: measured on lane 1, a member
 * refused a private space opened, listed, counted, edited, exported and
 * templated its doc and the page under it, and joined its realtime room
 * (`found-23-sep/workspace-reads-skip-the-container-rule`).
 *
 * Workspace membership itself is the caller's to check; these answer only the
 * question inside it.
 */

/** Depth bound for a parent walk: a loop already in the data must not hang a read. */
const MAX_DEPTH = 256

/**
 * What a doc of NO location is refused under: a chain with no space anywhere on
 * it is the workspace's, its members' to read and not a guest's.
 */
const NO_SPACE = ''

/**
 * The private spaces of this workspace the person is not a member of. For a
 * GUEST, every space not granted them, and the workspace's own docs
 * (`NO_SPACE`): a guest reads what is shared with them (`guest-reach.ts`).
 */
async function refusedSpaceIds(db: Db, workspaceId: string, userId: string): Promise<Set<string>> {
  const toGuest = await spacesRefusedToGuest(db, workspaceId, userId)
  if (toGuest) return new Set([...toGuest, NO_SPACE])
  const memberSpaces = db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, userId))
  const rows = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.visibility, 'private'), notInArray(spaces.id, memberSpaces)))
  return new Set(rows.map((r) => r.id))
}

/** Doc ids of this workspace shared with the person directly. */
async function sharedDocIds(db: Db, workspaceId: string, userId: string, among?: string[]): Promise<Set<string>> {
  if (among && among.length === 0) return new Set()
  const rows = await db
    .select({ id: objectShares.objectId })
    .from(objectShares)
    .where(
      and(
        eq(objectShares.workspaceId, workspaceId),
        eq(objectShares.objectType, 'doc'),
        eq(objectShares.userId, userId),
        among ? inArray(objectShares.objectId, among) : undefined,
      ),
    )
  return new Set(rows.map((r) => r.id))
}

/**
 * Whether the person may read this doc. `doc` is the doc's own row (its id,
 * workspace, space and parent); the walk up reads only docs of that workspace,
 * so a parent written before the write paths checked cannot pull another
 * tenant's tree into the answer.
 */
export async function canReadDoc(
  db: Db,
  doc: { id: string; workspaceId: string; spaceId: string | null; parentDocId: string | null },
  userId: string,
  isManager: boolean,
): Promise<boolean> {
  if (isManager) return true
  const refused = await refusedSpaceIds(db, doc.workspaceId, userId)
  // Outside no private space: nothing in this workspace can be out of reach.
  if (refused.size === 0) return true
  const chain: string[] = [doc.id]
  let outside = doc.spaceId != null && refused.has(doc.spaceId)
  let located = doc.spaceId != null
  let cursor = doc.parentDocId
  const seen = new Set<string>([doc.id])
  for (let depth = 0; cursor && !seen.has(cursor) && depth < MAX_DEPTH; depth += 1) {
    seen.add(cursor)
    const [up] = await db
      .select({ id: docs.id, spaceId: docs.spaceId, parentDocId: docs.parentDocId })
      .from(docs)
      .where(and(eq(docs.id, cursor), eq(docs.workspaceId, doc.workspaceId)))
      .limit(1)
    if (!up) break
    chain.push(up.id)
    if (up.spaceId != null && refused.has(up.spaceId)) outside = true
    if (up.spaceId != null) located = true
    cursor = up.parentDocId
  }
  if (!located && refused.has(NO_SPACE)) outside = true
  if (!outside) return true
  return (await sharedDocIds(db, doc.workspaceId, userId, chain)).size > 0
}

/**
 * Every doc of the workspace the person may NOT read, for a query that lists
 * docs: `notInArray(docs.id, hidden)` when it is not empty. Empty for a
 * manager, and for anybody who is a member of every private space — the
 * common case, answered with one query.
 */
export async function hiddenDocIds(db: Db, workspaceId: string, userId: string, isManager: boolean): Promise<string[]> {
  if (isManager) return []
  const refused = await refusedSpaceIds(db, workspaceId, userId)
  if (refused.size === 0) return []
  const rows = await db
    .select({ id: docs.id, spaceId: docs.spaceId, parentDocId: docs.parentDocId })
    .from(docs)
    .where(eq(docs.workspaceId, workspaceId))
  return docsOutOfReach(rows, refused, await sharedDocIds(db, workspaceId, userId))
}

/**
 * The walk itself, over rows already read: a doc is out of reach when it or a
 * doc above it is in a refused space, and none of them is shared. Each doc is
 * decided once (a parent's answer is reused by every page under it), and a
 * parent loop in the data ends the walk instead of hanging it.
 */
export function docsOutOfReach(
  rows: Array<{ id: string; spaceId: string | null; parentDocId: string | null }>,
  refused: Set<string>,
  shared: Set<string>,
): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  type Reach = { outside: boolean; shared: boolean; located: boolean }
  const own = (row: { id: string; spaceId: string | null }): Reach => ({
    outside: row.spaceId != null && refused.has(row.spaceId),
    shared: shared.has(row.id),
    located: row.spaceId != null,
  })
  const join = (a: Reach, b: Reach): Reach => ({ outside: a.outside || b.outside, shared: a.shared || b.shared, located: a.located || b.located })
  // Per doc: does its chain touch a refused space, and does it hold a share.
  const memo = new Map<string, Reach>()
  const walk = (id: string): Reach => {
    const known = memo.get(id)
    if (known) return known
    const path: string[] = []
    const onPath = new Map<string, number>()
    let cursor: string | null = id
    let tail: Reach = { outside: false, shared: false, located: false }
    // Up to the first doc already decided, the top, a loop, or the bound.
    while (cursor && path.length < MAX_DEPTH) {
      const decided = memo.get(cursor)
      if (decided) { tail = decided; break }
      const at = onPath.get(cursor)
      if (at !== undefined) {
        // A LOOP: every doc on it is above every other, so they share one
        // answer. Taking the walk's starting point as the top instead made
        // the answer depend on which doc of the loop was listed first.
        const loop = path.slice(at)
        tail = loop.reduce((acc, loopId) => join(acc, own(byId.get(loopId)!)), tail)
        for (const loopId of loop) memo.set(loopId, tail)
        path.length = at
        break
      }
      const row = byId.get(cursor)
      if (!row) break
      onPath.set(cursor, path.length)
      path.push(cursor)
      cursor = row.parentDocId
    }
    // Back down, each doc taking what is above it.
    for (let i = path.length - 1; i >= 0; i -= 1) {
      tail = join(tail, own(byId.get(path[i])!))
      memo.set(path[i], tail)
    }
    return memo.get(id) ?? tail
  }
  // A chain located nowhere is the workspace's: out of reach where that is refused (a guest's).
  const unlocatedRefused = refused.has(NO_SPACE)
  return rows.filter((r) => {
    const at = walk(r.id)
    return (at.outside || (unlocatedRefused && !at.located)) && !at.shared
  }).map((r) => r.id)
}

/*
 * WHAT A PERSON MAY DO TO A DOC THEY MAY READ.
 *
 * Every doc write (edit, delete, the public link, revisions, comments) asked
 * the read rule and nothing more. Measured on lane 1: a member whose only
 * access to a private space's doc was a VIEW share renamed it, commented on it
 * and made it public; a guest renamed a doc of an open space; a member in a
 * space whose default is "view only" made, renamed and deleted docs there
 * (`found-24-sep/doc-writes-are-the-read-rule`).
 *
 * ClickUp's rule (help.clickup.com "Share Docs", "Permissions in detail",
 * search snippets): a doc added to a location inherits that location's
 * permission — view, comment, edit, full edit — and a share on the doc itself
 * overrides it; a guest edits only where they have been given edit.
 *
 * So, most specific first:
 *   - a workspace manager, or the doc's own maker: full edit;
 *   - a share on the doc, or on the nearest doc above it that has one: its level;
 *   - the space it lives in (its own, or the nearest one above it): the level
 *     `resolveSpaceLevel` gives — the space's default, or a grant on it; for a
 *     GUEST, a grant only ("view" without one), since a location's default is
 *     its members' — the resolver's own rule now, for every gate that asks it;
 *   - a doc of no space: the workspace's, a member's to edit and a guest's to read.
 */
export type DocLevel = 'view' | 'comment' | 'edit' | 'admin'
const DOC_LEVEL_RANK: Record<DocLevel, number> = { view: 0, comment: 1, edit: 2, admin: 3 }
export const docLevelReaches = (have: DocLevel, need: DocLevel): boolean => DOC_LEVEL_RANK[have] >= DOC_LEVEL_RANK[need]

export async function docLevel(
  db: Db,
  doc: { id: string; workspaceId: string; spaceId: string | null; parentDocId: string | null; createdById?: string | null },
  actor: { id: string; workspaceRole: string | null | undefined },
): Promise<DocLevel> {
  if (isManagerRole(actor.workspaceRole)) return 'admin'
  if (doc.createdById && doc.createdById === actor.id) return 'admin'

  // The doc and the docs above it, nearest first, and the first space among them.
  const chain: string[] = [doc.id]
  let spaceId: string | null = doc.spaceId
  let cursor: string | null = doc.parentDocId
  const seen = new Set<string>([doc.id])
  for (let depth = 0; cursor && !seen.has(cursor) && depth < MAX_DEPTH; depth += 1) {
    seen.add(cursor)
    chain.push(cursor)
    const [up] = await db.select({ parentDocId: docs.parentDocId, spaceId: docs.spaceId }).from(docs).where(eq(docs.id, cursor)).limit(1)
    if (!up) break
    spaceId = spaceId ?? up.spaceId
    cursor = up.parentDocId
  }

  const shares = await db
    .select({ objectId: objectShares.objectId, level: objectShares.level })
    .from(objectShares)
    .where(
      and(
        eq(objectShares.workspaceId, doc.workspaceId),
        eq(objectShares.objectType, 'doc'),
        eq(objectShares.userId, actor.id),
        inArray(objectShares.objectId, chain),
      ),
    )
  const byDoc = new Map(shares.map((s) => [s.objectId, s.level as DocLevel]))
  for (const id of chain) {
    const level = byDoc.get(id)
    if (level) return level
  }

  const guest = actor.workspaceRole === 'guest'
  if (spaceId) {
    const resolved = await resolveSpaceLevel(db, { spaceId, actorId: actor.id })
    if (!resolved) return 'view'
    return resolved.level as DocLevel
  }
  return guest ? 'view' : 'edit'
}
