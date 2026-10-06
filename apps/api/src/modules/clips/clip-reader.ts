/**
 * WHO IS ASKING, AS THE CLIP RULE READS THEM, READ ONE WAY FOR EVERY ROUTE THAT
 * ASKS IT (`found-5-oct/guests-read-and-delete-every-clip`, `clip-access.ts`).
 *
 * The library, a clip's link and share, search's clip branch and a task's copy
 * of a clip all ask the one rule. The library read its reader's role from the
 * workspace guard and their address from the token they signed in with, and
 * search read both from the database, so the two could answer one reader two
 * ways: a platform super admin who also held a guest membership was listed
 * every clip and found only their own, and a clip from before its recorder's
 * id (known by address alone) was theirs in one and not the other between an
 * address change and their next token. So each of them reads it here:
 *
 *   - their address as the users table holds it now. It is the one an address
 *     change (SCIM rewrites one) changes at once; the token's is a copy;
 *   - their role as the workspace guards give it (`WorkspaceMemberGuard`,
 *     `ResourceMemberGuard`): a platform super admin is 'super_admin', anybody
 *     else their membership's role, and somebody with neither has none.
 */
import { and, eq } from 'drizzle-orm'
import { users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { ClipReader } from './clip-access'

export async function clipReaderOf(db: Db, workspaceId: string, userId: string): Promise<ClipReader> {
  const [row] = await db
    .select({ email: users.email, platformRole: users.role, role: workspaceMembers.role })
    .from(users)
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.userId, users.id), eq(workspaceMembers.workspaceId, workspaceId)),
    )
    .where(eq(users.id, userId))
    .limit(1)
  return {
    id: userId,
    email: row?.email ?? null,
    role: row?.platformRole === 'super_admin' ? 'super_admin' : (row?.role ?? null),
  }
}
