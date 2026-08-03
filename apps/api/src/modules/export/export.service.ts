import { Injectable, Inject } from '@nestjs/common'
import { and, eq, type SQL } from 'drizzle-orm'
import {
  workspaces,
  workspaceMembers,
  users,
  spaces,
  projects,
  lists,
  tasks,
  goals,
  sprints,
  forms,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { resolveIsManager, taskVisibilityFilter, listVisibilityFilter } from '../../common/permissions/item-visibility'
import { SecurityService } from '../security/security.service'

@Injectable()
export class ExportService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
  ) {}

  async exportWorkspace(workspaceId: string, actor?: { id: string; role?: string }): Promise<{
    workspace: object
    members: object[]
    spaces: object[]
    projects: object[]
    lists: object[]
    tasks: object[]
    goals: object[]
    sprints: object[]
    forms: object[]
    exportedAt: string
  }> {
    // §2 per-item privacy: when an actor is supplied, drop private tasks/lists
    // they may not see. Admin / super-admin exporters resolve as managers
    // (undefined filter) and still get everything.
    let taskVis: SQL | undefined
    let listVis: SQL | undefined
    if (actor) {
      const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)
      taskVis = taskVisibilityFilter(this.db, actor.id, isManager)
      listVis = listVisibilityFilter(actor.id, isManager)
    }

    // Load all workspace data in parallel
    const [
      wsData,
      membersData,
      spacesData,
      projectsData,
      listsData,
      tasksData,
      goalsData,
      sprintsData,
      formsData,
    ] = await Promise.all([
      this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)),
      this.db
        .select({
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          joinedAt: workspaceMembers.joinedAt,
          email: users.email,
          displayName: users.displayName,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId)),
      this.db.select().from(spaces).where(eq(spaces.workspaceId, workspaceId)),
      this.db
        .select()
        .from(projects)
        .innerJoin(spaces, eq(projects.spaceId, spaces.id))
        .where(eq(spaces.workspaceId, workspaceId)),
      this.db
        .select()
        .from(lists)
        .innerJoin(projects, eq(lists.projectId, projects.id))
        .innerJoin(spaces, eq(projects.spaceId, spaces.id))
        .where(and(eq(spaces.workspaceId, workspaceId), listVis)),
      this.db
        .select()
        .from(tasks)
        .innerJoin(lists, eq(tasks.listId, lists.id))
        .innerJoin(projects, eq(lists.projectId, projects.id))
        .innerJoin(spaces, eq(projects.spaceId, spaces.id))
        .where(and(eq(spaces.workspaceId, workspaceId), taskVis)),
      this.db.select().from(goals).where(eq(goals.workspaceId, workspaceId)),
      this.db.select().from(sprints).where(eq(sprints.workspaceId, workspaceId)),
      this.db.select().from(forms).where(eq(forms.workspaceId, workspaceId)),
    ])

    return {
      workspace: wsData[0] ?? {},
      members: membersData,
      spaces: spacesData,
      projects: projectsData.map((r: any) => r.projects ?? r),
      lists: listsData.map((r: any) => r.lists ?? r),
      tasks: tasksData.map((r: any) => r.tasks ?? r),
      goals: goalsData,
      sprints: sprintsData,
      forms: formsData.map((f) => ({ ...f, fields: [] })), // fields loaded separately to keep response lean
      exportedAt: new Date().toISOString(),
    }
  }

  async logExport(
    workspaceId: string,
    actorId: string,
    format: 'json' | 'csv',
    scope: string,
    counts?: Record<string, number>,
    ipAddress?: string,
  ) {
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'data.exported',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Exported workspace ${scope} as ${format.toUpperCase()}`,
      metadata: { format, scope, ...(counts ?? {}) },
      ipAddress,
    })
  }

  /**
   * §A4.1 roster export. Takes the same rows the People screen renders, so the
   * spreadsheet an admin hands to finance or an auditor can never disagree with
   * what is on screen.
   */
  membersToCsv(
    members: Array<{
      displayName: string
      email: string
      role: string
      weeklyCapacityHours?: number | null
      teams?: string[]
      joinedAt?: Date | string | null
      invitedAt?: Date | string | null
      invitedByName?: string | null
      lastSeenAt?: Date | string | null
    }>,
  ): string {
    const headers = [
      'Name',
      'Email',
      'Role',
      'Weekly capacity (h)',
      'Teams',
      'Joined',
      'Invited on',
      'Invited by',
      'Last active',
    ]
    const iso = (value: Date | string | null | undefined) =>
      value ? new Date(value).toISOString() : ''
    const rows = members.map((m) => [
      m.displayName ?? '',
      m.email ?? '',
      m.role ?? '',
      m.weeklyCapacityHours ?? '',
      (m.teams ?? []).join('; '),
      iso(m.joinedAt),
      iso(m.invitedAt),
      m.invitedByName ?? '',
      iso(m.lastSeenAt),
    ])
    const escape = (value: string | number) => {
      const s = String(value ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
  }

  exportToCsv(tasks: any[]): string {
    const headers = ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created At', 'List ID']
    const rows = tasks.map((t: any) => {
      const task = t.tasks ?? t
      return [
        task.id ?? '',
        `"${(task.title ?? '').replace(/"/g, '""')}"`,
        task.status ?? '',
        task.priority ?? '',
        task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        task.createdAt ? new Date(task.createdAt).toISOString() : '',
        task.listId ?? '',
      ].join(',')
    })
    return [headers.join(','), ...rows].join('\n')
  }
}
