import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { organizationMembers, organizations } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

@Injectable()
export class OrganizationAdminGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    const organizationId: string | undefined = req.params?.organizationId

    if (!user?.id) {
      throw new ForbiddenException('Not authenticated')
    }
    if (!organizationId) {
      throw new ForbiddenException('Organization context required')
    }

    if (user.role === 'super_admin') {
      const [org] = await this.db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1)
      if (!org) throw new NotFoundException('Organization not found')
      req.organizationMember = { userId: user.id, organizationId, role: 'owner' }
      return true
    }

    const [member] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, user.id),
          inArray(organizationMembers.role, ['owner', 'admin']),
        ),
      )
      .limit(1)

    if (!member) {
      throw new ForbiddenException('Admin permissions required for this organization')
    }

    req.organizationMember = member
    return true
  }
}
