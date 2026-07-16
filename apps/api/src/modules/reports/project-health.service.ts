import { Injectable, Inject, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { projectHealthScores, taskComments, tasks, lists, projects, spaces, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { ReportsService } from './reports.service'
import { AiService, type SentimentResult } from '../ai/ai.service'

/**
 * Fixed, documented weight the comment-sentiment component contributes to a
 * project's blended health score (Plan §7.13). The four deterministic signals
 * from ReportsService.getProjectHealth (on-time, overdue, blockers, activity)
 * keep their relative weights, scaled to the remaining 85%.
 */
export const SENTIMENT_WEIGHT = 0.15

export type HealthBand = 'green' | 'yellow' | 'red' | 'empty'

/** Band thresholds shared with getProjectHealth: green ≥ 75, yellow ≥ 50, else red. */
export function bandForScore(score: number): 'green' | 'yellow' | 'red' {
  return score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red'
}

export type HealthComponents = { onTime: number; overdue: number; blockers: number; activity: number }
export type BlendedHealth = {
  score: number
  band: HealthBand
  components: HealthComponents & { sentiment: number }
}

/**
 * Fold a 0–100 comment-sentiment score into a base project-health result with a
 * fixed weight (SENTIMENT_WEIGHT). Empty projects (band 'empty', no tasks) stay
 * at score 0 / band 'empty' — sentiment never resurrects a project with no work.
 * Pure + testable: the scoring math the daily cron persists.
 */
export function foldSentimentIntoHealth(
  base: { score: number; band: string; components: HealthComponents },
  sentimentScore0to100: number,
): BlendedHealth {
  const sentiment = Math.max(0, Math.min(100, Math.round(sentimentScore0to100)))
  const components = { ...base.components, sentiment }
  if (base.band === 'empty') {
    return { score: 0, band: 'empty', components }
  }
  const blended = Math.round(base.score * (1 - SENTIMENT_WEIGHT) + sentiment * SENTIMENT_WEIGHT)
  const score = Math.max(0, Math.min(100, blended))
  return { score, band: bandForScore(score), components }
}

/** UTC calendar-day string (YYYY-MM-DD) for a Date — the `scored_on` key. */
export function utcDayString(now: Date): string {
  return now.toISOString().slice(0, 10)
}

type PersistedScoreRow = typeof projectHealthScores.$inferInsert

/**
 * §7.13 — daily cron that persists one project-health row per active project per
 * day. Reuses ReportsService.getProjectHealth for the deterministic signals,
 * folds in a comment-sentiment component (AiService — deterministic keyword
 * fallback when no model is configured), and upserts keyed by
 * (project_id, scored_on) so re-runs the same day are idempotent. Also serves
 * the persisted 30-day trend read.
 */
@Injectable()
export class ProjectHealthService {
  private readonly logger = new Logger(ProjectHealthService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private reports: ReportsService,
    private ai: AiService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'project-health-daily' })
  async runDaily() {
    return this.scoreAll(new Date())
  }

  /**
   * Score + persist every workspace's active projects for the `now` day.
   * Best-effort per workspace so one failure never blocks the rest. Returns
   * counts so tests/ops can assert coverage without inspecting the table.
   */
  async scoreAll(now: Date = new Date()) {
    const wsRows = await this.db.select({ id: workspaces.id }).from(workspaces)
    let projectsScored = 0
    for (const ws of wsRows) {
      try {
        projectsScored += await this.scoreWorkspace(ws.id, now)
      } catch (err) {
        this.logger.error(`Project-health scoring failed for workspace ${ws.id}: ${(err as Error).message}`)
      }
    }
    if (projectsScored > 0) this.logger.log(`Scored ${projectsScored} project(s) across ${wsRows.length} workspace(s)`)
    return { workspaces: wsRows.length, projectsScored }
  }

  /**
   * Score + upsert all active projects in one workspace. Returns the number of
   * projects written.
   */
  async scoreWorkspace(workspaceId: string, now: Date = new Date()): Promise<number> {
    const health = await this.reports.getProjectHealth(workspaceId)
    if (health.length === 0) return 0

    const commentsByProject = await this.recentCommentsByProject(workspaceId)
    const scoredOn = utcDayString(now)

    let count = 0
    for (const p of health) {
      const comments = commentsByProject.get(p.projectId) ?? []
      const sentiment = await this.ai.analyzeCommentSentiment(comments, { workspaceId })
      const blended = foldSentimentIntoHealth(
        { score: p.score, band: p.band, components: p.components },
        sentiment.score,
      )
      await this.upsertProjectScore({
        projectId: p.projectId,
        workspaceId,
        score: blended.score,
        band: blended.band,
        components: blended.components,
        sentiment,
        scoredOn,
      })
      count += 1
    }
    return count
  }

  /** Idempotent upsert of one project's daily score (ON CONFLICT project_id, scored_on). */
  async upsertProjectScore(row: {
    projectId: string
    workspaceId: string
    score: number
    band: string
    components: HealthComponents & { sentiment: number }
    sentiment: SentimentResult
    scoredOn: string
  }): Promise<void> {
    const values: PersistedScoreRow = {
      projectId: row.projectId,
      workspaceId: row.workspaceId,
      score: row.score,
      band: row.band,
      components: row.components,
      sentiment: row.sentiment,
      scoredOn: row.scoredOn,
    }
    await this.db
      .insert(projectHealthScores)
      .values(values)
      .onConflictDoUpdate({
        target: [projectHealthScores.projectId, projectHealthScores.scoredOn],
        set: {
          score: values.score,
          band: values.band,
          components: values.components,
          sentiment: values.sentiment,
          workspaceId: values.workspaceId,
        },
      })
  }

  /**
   * §7.13 trend read — persisted daily scores for one project over the last
   * `days` (default 30), oldest → newest, for the sparkline.
   */
  async getTrend(workspaceId: string, projectId: string, days = 30) {
    const horizon = Math.min(Math.max(Math.trunc(days) || 30, 1), 365)
    const since = new Date(Date.now() - horizon * 86_400_000)
    const sinceDay = utcDayString(since)
    const rows = await this.db
      .select({
        scoredOn: projectHealthScores.scoredOn,
        score: projectHealthScores.score,
        band: projectHealthScores.band,
        components: projectHealthScores.components,
        sentiment: projectHealthScores.sentiment,
      })
      .from(projectHealthScores)
      .where(
        and(
          eq(projectHealthScores.workspaceId, workspaceId),
          eq(projectHealthScores.projectId, projectId),
          gte(projectHealthScores.scoredOn, sinceDay),
        ),
      )
      .orderBy(asc(projectHealthScores.scoredOn))
    const latest = rows.length ? rows[rows.length - 1] : null
    return {
      projectId,
      days: horizon,
      current: latest ? { score: latest.score, band: latest.band, sentiment: latest.sentiment } : null,
      points: rows.map((r) => ({ date: r.scoredOn, score: r.score, band: r.band })),
    }
  }

  /**
   * Recent (last 14 days) task-comment bodies grouped by project id, bounded to
   * 40 comments per project so the sentiment prompt stays token-safe.
   */
  private async recentCommentsByProject(workspaceId: string): Promise<Map<string, string[]>> {
    const since = new Date(Date.now() - 14 * 86_400_000)
    const rows = await this.db
      .select({ projectId: lists.projectId, body: taskComments.body })
      .from(taskComments)
      .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), gte(taskComments.createdAt, since)))
      .orderBy(sql`${taskComments.createdAt} desc`)
    const byProject = new Map<string, string[]>()
    for (const r of rows) {
      const list = byProject.get(r.projectId) ?? []
      if (list.length < 40 && r.body && r.body.trim()) list.push(r.body)
      byProject.set(r.projectId, list)
    }
    return byProject
  }
}
