import { WS_ADMIN_ROLES } from '../../common/permissions/workspace-roles'
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { and, eq, inArray } from 'drizzle-orm'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { NotificationsService } from '../notifications/notifications.service'
import { PlansService } from './plans.service'
import { PLAN_FEATURES, type PlanFeature } from './plans.constants'

/**
 * §V2-13, frame `09:26` — the button under the paywall.
 *
 * The frame's call to action is **"Contact your admin"**, and it is the whole
 * reason the modal is worth building: a person who cannot buy anything is being
 * shown a price, so the only useful thing the dialog can do is put the ask in
 * front of somebody who can.
 *
 * A PLAN feature is not a feature FLAG, so `POST /feature-flags/request/:key`
 * could not serve this — it validates against the flag registry and 400s on
 * anything else. Rather than invent a flag that mirrors a plan tier (the
 * duplicated-list defect, in its most expensive form: two switches for one
 * capability that drift), this is the same ask against the plan model, and it
 * answers in the SAME `{ status, notified }` shape the flag route does so the
 * dialog's outcome strings and its "can I press it again" rule are shared.
 *
 * `already_asked` is deliberately NOT a state here. The flag route has a
 * `feature_flag_requests` table to read a recent ask out of; there is no
 * equivalent for plans, and inventing a throttle that no row backs would be a
 * rule that silently never fires.
 */
@ApiTags('plans')
@ApiBearerAuth()
@Controller()
export class PlanRequestsController {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly plans: PlansService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post('workspaces/:workspaceId/plan/request')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask this workspace’s admins to unlock a plan feature' })
  async request(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { feature?: string },
    @CurrentUser() user: any,
  ): Promise<{ status: 'sent' | 'already_enabled' | 'no_admins'; notified: number }> {
    const feature = body?.feature
    if (!feature || !(PLAN_FEATURES as readonly string[]).includes(feature)) {
      throw new BadRequestException(`Unknown plan feature "${feature ?? ''}"`)
    }

    // Asking for something the workspace already has would send an admin
    // chasing a purchase they have already made.
    const plan = await this.plans.getWorkspacePlan(workspaceId)
    if (plan.features[feature as PlanFeature] === true) {
      return { status: 'already_enabled', notified: 0 }
    }

    const admins = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, [...WS_ADMIN_ROLES]),
        ),
      )
    const recipients = admins.map((a) => a.userId).filter((id) => id !== user?.id)
    if (recipients.length === 0) return { status: 'no_admins', notified: 0 }

    const who = (user?.name as string)?.trim() || (user?.email as string) || 'Someone'
    let notified = 0
    for (const userId of recipients) {
      // DELIVERY, not the row — see the same note in feature-flags.service.ts.
      // An admin who reads notifications by email only has `create()` return
      // null, and counting rows would tell the asker nobody heard them.
      const outcome = await this.notifications.createWithOutcome({
        userId,
        workspaceId,
        actorId: user?.id,
        type: 'access_requested',
        title: `${who} asked to unlock ${feature}`,
        body:
          `${who} hit the paywall for "${feature}". The ${plan.label} plan does not include it — ` +
          'upgrading the workspace turns it on.',
        target: { entityType: 'plan_feature', entityId: feature, url: `/app/${workspaceId}/settings/plan` },
      })
      if (outcome?.delivered) notified++
    }
    return { status: 'sent', notified }
  }
}
