import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertMayShapeStatuses, type StatusOwner } from '../../common/permissions/status-access'

/**
 * A STATUS WRITE ASKS WHO MAY SHAPE THE STATUSES, not who may read them
 * (`assertMayShapeStatuses`). Stands on the write routes of a space's, a
 * project's and a list's statuses, and on a list's choice of whose it uses,
 * after `ResourceMemberGuard` has answered the read; the owner is whichever of
 * `:listId`, `:projectId` or `:spaceId` the route names.
 */
@Injectable()
export class StatusShapeGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const actorId = (req.user as { id?: string } | undefined)?.id
    const { listId, projectId, spaceId } = (req.params ?? {}) as Record<string, string | undefined>
    const owner: { kind: StatusOwner; id: string } | null = listId
      ? { kind: 'list', id: listId }
      : projectId
        ? { kind: 'project', id: projectId }
        : spaceId
          ? { kind: 'space', id: spaceId }
          : null
    if (!actorId || !owner) throw new ForbiddenException('Statuses are changed by someone, of something')
    await assertMayShapeStatuses(this.db, { owner: owner.kind, ownerId: owner.id, actorId })
    return true
  }
}
