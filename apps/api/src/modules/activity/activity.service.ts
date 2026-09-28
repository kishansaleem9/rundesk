import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { taskActivity, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { likeContaining } from '../../common/sql/like'

export type ActivitySearchOptions = {
  /** Free text. Matched against the action, the actor and the entry's meta. */
  q?: string
  /** Zero or more action keys. Empty means "every action". */
  actions?: string[]
  limit?: number
}

/** What the feed asks for when nobody has narrowed it, and the ceiling on `limit`. */
export const ACTIVITY_DEFAULT_LIMIT = 100
export const ACTIVITY_MAX_LIMIT = 500

/**
 * §V2-S07 frames `01:55` / `05:20` / `15:20` — the Activity panel header draws a
 * magnifier and a filter beside the watcher bell. Neither existed.
 *
 * WHY THIS IS A SERVER QUERY AND NOT AN `Array.filter` ON THE PANEL.
 *
 * `TasksService.listActivity` answers `GET /tasks/:id/activity` with
 * `limit = 100`, newest first, and the controller passes no limit — so the
 * panel has never held more than the hundred most recent entries. A filter
 * applied to that array searches the hundred it happens to have and reports
 * "no matches" for everything older, which is indistinguishable in the UI from
 * a task where the thing really never happened. That is this audit's *confident
 * zero*, and a search box is exactly the control people trust to settle the
 * question.
 *
 * So the narrowing happens in SQL, BEFORE the limit, and the action list the
 * filter offers is a `GROUP BY` over the whole table rather than a tally of
 * what the page happened to fetch.
 */
@Injectable()
export class ActivityService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * `%` and `_` are wildcards in `LIKE`. Unescaped, searching for "100%" matches
   * every entry beginning "100" and the reader is told there are more hits than
   * there are.
   */
  private static likePattern(raw: string): string {
    return likeContaining(raw)
  }

  static normalizeActions(raw?: string | string[]): string[] {
    const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
    const seen = new Set<string>()
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed) seen.add(trimmed)
    }
    return [...seen]
  }

  static normalizeLimit(raw?: string | number): number {
    const n = typeof raw === 'number' ? raw : raw ? Number.parseInt(raw, 10) : NaN
    if (!Number.isFinite(n) || n <= 0) return ACTIVITY_DEFAULT_LIMIT
    return Math.min(Math.trunc(n), ACTIVITY_MAX_LIMIT)
  }

  /**
   * The feed, optionally narrowed.
   *
   * Shape matches `TasksService.listActivity` so the panel renders one kind of
   * row whether or not a filter is on — an unfiltered call here and a call to
   * the older endpoint return the same entries in the same order.
   */
  async search(taskId: string, opts: ActivitySearchOptions = {}) {
    const conds: SQL[] = [eq(taskActivity.taskId, taskId)]

    const actions = opts.actions ?? []
    if (actions.length > 0) {
      /*
       * `action` is a Postgres enum. An unknown member in `IN (...)` is a cast
       * error (22P02), not an empty result, so the whole request 500s because
       * somebody typed a stale key into the query string. Compared as text it
       * simply matches nothing, which is the honest answer.
       */
      conds.push(inArray(sql`${taskActivity.action}::text`, actions))
    }

    const q = (opts.q ?? '').trim()
    if (q) {
      const pattern = ActivityService.likePattern(q)
      const textMatch = or(
        ilike(sql`${taskActivity.action}::text`, pattern),
        ilike(sql`coalesce(${taskActivity.meta}::text, '')`, pattern),
        ilike(sql`coalesce(${users.displayName}, '')`, pattern),
        ilike(sql`coalesce(${users.email}, '')`, pattern),
      )
      if (textMatch) conds.push(textMatch)
    }

    const rows = await this.db
      .select({
        id: taskActivity.id,
        action: taskActivity.action,
        meta: taskActivity.meta,
        createdAt: taskActivity.createdAt,
        actorId: users.id,
        actorName: users.displayName,
        actorEmail: users.email,
        actorAvatar: users.avatarUrl,
      })
      .from(taskActivity)
      .leftJoin(users, eq(users.id, taskActivity.actorId))
      .where(and(...conds))
      .orderBy(desc(taskActivity.createdAt))
      .limit(ActivityService.normalizeLimit(opts.limit))

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      meta: r.meta,
      createdAt: r.createdAt,
      actor: r.actorId
        ? { id: r.actorId, displayName: r.actorName, email: r.actorEmail, avatarUrl: r.actorAvatar }
        : null,
    }))
  }

  /**
   * Which actions this task actually has, and how many of each.
   *
   * COUNTED OVER EVERY ROW, not over the page the panel is holding. A filter
   * whose options came from the loaded entries could not offer the one action
   * that only happened on day one, which is the entry somebody opening a search
   * box is most likely looking for.
   */
  async actions(taskId: string) {
    const rows = await this.db
      .select({
        action: sql<string>`${taskActivity.action}::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .groupBy(taskActivity.action)
      .orderBy(desc(sql`count(*)`))
    return rows.map((r) => ({ action: r.action, count: Number(r.count) }))
  }
}
