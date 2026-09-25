import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The workspace a request NAMES — in its path, its body or its query, the same
 * order `PlanFeatureGuard` resolves it in — must be one the caller belongs to,
 * and not as a guest.
 *
 * WHY IT EXISTS. The AI routes take `workspaceId` in the body or the query,
 * and nothing checked it. The guest guard beside it read the ACCOUNT's role
 * (retired, `guest-guard-reads-the-account-role`), and `PlanFeatureGuard`
 * asks only whether that workspace's plan has the feature.
 * Measured on lane 1 with the model stub: a user of another organisation, who
 * gets 404 on the workspace itself, had AI chat and AI command build their
 * prompts from it (its name, its spaces' and projects' names, its totals, and
 * "Your role: member"), and the command assistant was handed a tool that
 * searches its tasks.
 *
 * A stranger is answered 404, as `WorkspaceMemberGuard` answers, so the route
 * does not confirm the workspace exists. A guest of the workspace is refused
 * with 403: the AI features are not for guests, which the account-wide check
 * could only ever have enforced for accounts whose global role is `guest`. A request
 * that names no workspace passes; it reads nothing of one.
 */
@Injectable()
export class NamedWorkspaceMemberGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    if (!user?.id) throw new ForbiddenException('Not authenticated')

    const named: unknown = req.params?.workspaceId ?? req.body?.workspaceId ?? req.query?.workspaceId
    if (named == null || named === '') return true
    // Not a workspace id at all is not a workspace this caller belongs to; the
    // same answer as a stranger's, and never a database error on a bad uuid.
    if (typeof named !== 'string' || !UUID.test(named)) throw new NotFoundException('Workspace not found')
    if (user.role === 'super_admin') return true

    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, named), eq(workspaceMembers.userId, user.id)))
      .limit(1)
    if (!member) throw new NotFoundException('Workspace not found')
    if (member.role === 'guest') throw new ForbiddenException('Guests cannot use this feature')
    return true
  }
}
