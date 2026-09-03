import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import { workspaceBookmarks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/**
 * §G01-9 [00:35] — "save ClickUp items or any URL from around the web".
 *
 * The "any URL" half is what makes this its own thing rather than another
 * favourite, and it is also the half that needs care: a stored link is handed
 * back to a browser, so what may be stored is decided here and not at the point
 * it is clicked.
 */
@Injectable()
export class BookmarksService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  private async assertMember(workspaceId: string, userId: string) {
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!row) throw new NotFoundException('Workspace not found')
  }

  /**
   * What may be saved.
   *
   * An in-app path, or an absolute http(s) URL. Everything else is refused —
   * `javascript:` most of all, because a bookmark is rendered as a link and
   * clicking one would run script on this origin. `data:` and `blob:` go the
   * same way for the same reason. Checked on the way IN so a row that exists is
   * a row that is safe to render, rather than leaving every future read path to
   * remember.
   */
  static normalizeUrl(raw: unknown): string {
    const url = typeof raw === 'string' ? raw.trim() : ''
    if (!url) throw new BadRequestException('a bookmark needs a url')
    if (url.startsWith('/')) return url.slice(0, 2000)
    if (/^https?:\/\//i.test(url)) return url.slice(0, 2000)
    throw new BadRequestException('a bookmark must be an in-app path or an http(s) url')
  }

  async list(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    return this.db
      .select()
      .from(workspaceBookmarks)
      .where(and(eq(workspaceBookmarks.workspaceId, workspaceId), eq(workspaceBookmarks.userId, userId)))
      .orderBy(asc(workspaceBookmarks.position), asc(workspaceBookmarks.createdAt))
  }

  async create(workspaceId: string, userId: string, body: { title?: string; url?: string }) {
    await this.assertMember(workspaceId, userId)
    const url = BookmarksService.normalizeUrl(body?.url)
    /*
     * The URL stands in for a missing title rather than the row being refused.
     * Somebody pasting a link and pressing Add has said everything they meant
     * to; demanding a name as well is a second step for no gain.
     */
    const title = (body?.title ?? '').trim().slice(0, 200) || url
    const [{ next }] = await this.db
      .select({ next: sql<number>`coalesce(max(${workspaceBookmarks.position}), -1) + 1` })
      .from(workspaceBookmarks)
      .where(and(eq(workspaceBookmarks.workspaceId, workspaceId), eq(workspaceBookmarks.userId, userId)))
    const [row] = await this.db
      .insert(workspaceBookmarks)
      .values({ workspaceId, userId, title, url, position: next })
      .returning()
    return row
  }

  async remove(workspaceId: string, userId: string, bookmarkId: string) {
    await this.assertMember(workspaceId, userId)
    /*
     * Scoped by owner as well as id. Without the userId in the WHERE, knowing
     * somebody else's bookmark id would be enough to delete it — the id is the
     * only thing standing between the two people otherwise.
     */
    const deleted = await this.db
      .delete(workspaceBookmarks)
      .where(
        and(
          eq(workspaceBookmarks.id, bookmarkId),
          eq(workspaceBookmarks.workspaceId, workspaceId),
          eq(workspaceBookmarks.userId, userId),
        ),
      )
      .returning({ id: workspaceBookmarks.id })
    if (deleted.length === 0) throw new NotFoundException('Bookmark not found')
    return { ok: true }
  }
}
