import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AiService, findOverloadedAssignees } from './ai.service'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * §7.12 — proactive workload alerts. A daily guarded check that, per workspace
 * with open work, flags anyone significantly overloaded relative to the team and
 * notifies that workspace's managers/admins with a `workload_alert` notification
 * deep-linking to the insights page. Deduped so the same overloaded person can't
 * spam managers day after day (a prior alert within the dedupe window suppresses
 * a re-send). All computation reuses AiService's real per-assignee load query and
 * the pure `findOverloadedAssignees` selector, so it is testable without a model.
 */
@Injectable()
export class WorkloadAlertService {
  private readonly logger = new Logger(WorkloadAlertService.name)

  constructor(
    private ai: AiService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'workload-alert-daily' })
  async runDaily() {
    return this.dispatch(new Date())
  }

  /**
   * Scan every workspace with open work, alert managers about overloaded
   * teammates, and skip anyone alerted within the dedupe window. Returns counts
   * so tests/ops can assert selection. Best-effort per workspace.
   */
  async dispatch(now: Date = new Date()) {
    const workspaceIds = await this.ai.workspacesWithOpenWork()
    let alerts = 0
    for (const workspaceId of workspaceIds) {
      try {
        alerts += await this.checkWorkspace(workspaceId, now)
      } catch (err) {
        this.logger.error(`Workload alert check failed for ${workspaceId}: ${(err as Error).message}`)
      }
    }
    if (alerts > 0) this.logger.log(`Sent ${alerts} workload alert(s) across ${workspaceIds.length} workspace(s)`)
    return { workspaces: workspaceIds.length, alerts }
  }

  /** Alert managers about newly-overloaded teammates in one workspace. Returns # alerted people. */
  async checkWorkspace(workspaceId: string, now: Date = new Date()): Promise<number> {
    const loads = await this.ai.collectWorkloadLoads(workspaceId)
    const overloaded = findOverloadedAssignees(loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open })))
    if (overloaded.length === 0) return 0

    // Dedupe: don't re-alert about the same person within ~20h (daily cron).
    const cutoff = new Date(now.getTime() - 20 * 3_600_000)
    const alreadyAlerted = await this.ai.recentlyWorkloadAlerted(workspaceId, cutoff)
    const fresh = overloaded.filter((o) => !alreadyAlerted.has(o.userId))
    if (fresh.length === 0) return 0

    const managers = await this.ai.workspaceManagers(workspaceId)
    if (managers.length === 0) return 0

    let count = 0
    for (const person of fresh) {
      for (const mgr of managers) {
        // Don't notify the overloaded person about themselves.
        if (mgr.userId === person.userId) continue
        await this.notifications.create({
          userId: mgr.userId,
          workspaceId,
          type: 'workload_alert',
          title: `${person.name} is overloaded`,
          body: `${person.name} has ${person.open} open tasks (team average ${person.average}). Consider rebalancing their workload.`,
          target: { entityType: 'workload', entityId: person.userId, url: `/app/${workspaceId}/insights` },
        })
      }
      count += 1
    }
    return count
  }
}
