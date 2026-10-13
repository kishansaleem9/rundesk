import { Injectable, Inject, Optional, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, asc, isNull, desc, inArray, isNotNull, notInArray, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { docs, docComments, docRevisions, docTemplates, users, objectShares, spaces, workspaces, taskDocLinks, tasks } from '@rundesk/db'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { resolveIsManager, taskVisibilityFilter, isManagerRole } from '../../common/permissions/item-visibility'
import { checkContainerAccess } from '../../common/permissions/container-access.guard-helper'
import { canReadDoc, docLevel, docLevelReaches, type DocLevel, hiddenDocIds } from '../../common/permissions/doc-access'
import { allowedBy } from '../../common/permissions/capability'
import { assertCanCreateInSpace } from '../../common/permissions/container-access'
import { READ_REFUSALS } from '../../common/permissions/read-access'
import { isUuid } from '../../common/validation/uuid'
import { pickDocUpdatable } from './doc-update-fields'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'
import { NotificationsService } from '../notifications/notifications.service'
import { tiptapToMarkdown, tiptapToPlainLines, splitTitleFromMarkdown } from './tiptap-markdown'
import { renderReportPdf } from '../reports/pdf'
import { downloadName } from '../../common/export/download-name'
import { decodeText } from '../../common/import/text-decode'
import { ImportFilesService } from '../integrations/clickup-import/import-files'
import { docxToDoc, DocxReadError } from './docx-tiptap'
import { htmlFileToDoc, type DocNode } from './html-tiptap'
import { readConfluenceExport, ConfluenceReadError, MAX_CONFLUENCE_PAGES } from './confluence-export'

type TiptapNode = { type: string; content?: TiptapNode[]; text?: string; attrs?: Record<string, unknown> }

/** Docs-hub buckets (A5.6). `all` excludes archived, matching the old default. */
export const DOC_SCOPES = ['all', 'mine', 'shared', 'archived'] as const
export type DocScope = (typeof DOC_SCOPES)[number]

// Extract plaintext for denormalized search.
function extractPlaintext(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const node = content as TiptapNode
  if (node.text) return node.text
  if (Array.isArray(node.content)) {
    return node.content.map((n) => extractPlaintext(n)).filter(Boolean).join(' ')
  }
  return ''
}

/**
 * The import panel's own words (`import.docAccepted`), said when a file it
 * cannot read is sent anyway. ClickUp's Docs import reads Word, HTML and
 * Markdown (`commit-log/log-601eacc-2`), and so does this one, with plain text.
 */
export const DOC_IMPORT_ACCEPTS = 'Accepts Word (.docx), HTML (.html, .htm), Markdown (.md, .markdown) and plain text (.txt).'

/** What a document file is, by its name: the readers below, one each. */
export function docFileKind(name: string): 'docx' | 'html' | 'markdown' | null {
  if (/\.docx$/i.test(name)) return 'docx'
  if (/\.(html?|xhtml)$/i.test(name)) return 'html'
  if (/\.(md|markdown|txt)$/i.test(name)) return 'markdown'
  return null
}

@Injectable()
export class DocsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private search: SearchService,
    private notifications: NotificationsService,
    @Optional() private readonly files?: ImportFilesService,
  ) {}

  private async indexDocInSearch(docId: string) {
    try {
      const [row] = await this.db.select().from(docs).where(eq(docs.id, docId))
      if (!row) return
      await this.search.indexDoc({
        id: row.id,
        title: row.title,
        plaintext: row.plaintext,
        workspaceId: row.workspaceId,
        spaceId: row.spaceId,
        createdAt: row.createdAt,
        // See indexTask: an edited doc must move under a "last updated" sort.
        updatedAt: row.updatedAt,
      })
    } catch {
      // best-effort
    }
  }

  /**
   * A5.6 / A5.7 — the hub buckets are filters over columns that already exist,
   * not a new model: `mine` reads `createdById`, `archived` flips the
   * `isArchived` predicate the tree relies on, and `shared` is the reverse
   * `object_shares` lookup. Every row also carries what an index table needs
   * (creator, location, subpage count, sharing state) so the table and the tree
   * are the same read.
   */
  async list(
    workspaceId: string,
    opts: {
      spaceId?: string | null
      parentDocId?: string | null
      scope?: DocScope
      userId?: string
    } = {},
  ) {
    const scope = opts.scope ?? 'all'
    const sharedIds = scope === 'shared' ? await this.docIdsSharedWith(workspaceId, opts.userId) : null
    // A share grant on a doc nobody has shared means an empty bucket, not the
    // whole workspace — bail before the `inArray` would degenerate.
    if (sharedIds && sharedIds.length === 0) return []
    // Only what the reader may open: see `doc-access.ts`. No reader, no docs.
    if (!opts.userId) return []
    const hidden = await this.docsHiddenFrom(workspaceId, opts.userId)

    const where = and(
      eq(docs.workspaceId, workspaceId),
      hidden.length ? notInArray(docs.id, hidden) : undefined,
      eq(docs.isArchived, scope === 'archived'),
      scope === 'mine' && opts.userId ? eq(docs.createdById, opts.userId) : undefined,
      sharedIds ? inArray(docs.id, sharedIds) : undefined,
      opts.spaceId === null ? isNull(docs.spaceId) : opts.spaceId ? eq(docs.spaceId, opts.spaceId) : undefined,
      opts.parentDocId === null ? isNull(docs.parentDocId) : opts.parentDocId ? eq(docs.parentDocId, opts.parentDocId) : undefined,
    )
    return this.db
      .select({
        id: docs.id,
        workspaceId: docs.workspaceId,
        spaceId: docs.spaceId,
        parentDocId: docs.parentDocId,
        createdById: docs.createdById,
        title: docs.title,
        icon: docs.icon,
        coverImageUrl: docs.coverImageUrl,
        content: docs.content,
        plaintext: docs.plaintext,
        position: docs.position,
        isArchived: docs.isArchived,
        publicShareId: docs.publicShareId,
        publicShareEnabledAt: docs.publicShareEnabledAt,
        createdAt: docs.createdAt,
        updatedAt: docs.updatedAt,
        createdByName: users.displayName,
        createdByEmail: users.email,
        spaceName: spaces.name,
        // Correlate on the outer row in SQL text — a bound `${docs.id}` would
        // collapse to one parameter and give every row the same count.
        subpageCount: sql<number>`(
          select count(*)::int from docs child
          where child.parent_doc_id = docs.id and child.is_archived = false
        )`,
        shareCount: sql<number>`(
          select count(*)::int from object_shares os
          where os.object_type = 'doc' and os.object_id = docs.id
        )`,
      })
      .from(docs)
      // Left: the creator may have been removed (createdById is set null), and
      // a workspace-level doc has no space.
      .leftJoin(users, eq(users.id, docs.createdById))
      // The doc's OWN workspace's space only: a spaceId written before the
      // write paths checked could name another tenant's space, and this join
      // put that space's name in the list.
      .leftJoin(spaces, and(eq(spaces.id, docs.spaceId), eq(spaces.workspaceId, docs.workspaceId)))
      .where(where)
      .orderBy(asc(docs.position), asc(docs.createdAt))
  }

  /**
   * Per-bucket totals for the docs hub rail (A5.6). Counted directly rather
   * than by length of `list()` — that would fetch every doc's jsonb body four
   * times to produce four integers.
   */
  async scopeCounts(workspaceId: string, userId: string) {
    const sharedIds = await this.docIdsSharedWith(workspaceId, userId)
    // Counted as listed: a count that includes what the list leaves out is a
    // number the reader can see move when somebody writes a doc they cannot.
    const hidden = await this.docsHiddenFrom(workspaceId, userId)
    const count = async (extra?: ReturnType<typeof and>) => {
      const [row] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(docs)
        .where(and(eq(docs.workspaceId, workspaceId), hidden.length ? notInArray(docs.id, hidden) : undefined, extra))
      return row?.n ?? 0
    }
    const [all, mine, shared, archived] = await Promise.all([
      count(eq(docs.isArchived, false)),
      count(and(eq(docs.isArchived, false), eq(docs.createdById, userId))),
      sharedIds.length === 0
        ? Promise.resolve(0)
        : count(and(eq(docs.isArchived, false), inArray(docs.id, sharedIds))),
      count(eq(docs.isArchived, true)),
    ])
    return { all, mine, shared, archived }
  }

  /** Doc ids in this workspace explicitly granted to `userId` (A1.7's table). */
  private async docIdsSharedWith(workspaceId: string, userId?: string): Promise<string[]> {
    if (!userId) return []
    const rows = await this.db
      .select({ objectId: objectShares.objectId })
      .from(objectShares)
      .where(
        and(
          eq(objectShares.workspaceId, workspaceId),
          eq(objectShares.objectType, 'doc'),
          eq(objectShares.userId, userId),
        ),
      )
    return rows.map((r) => r.objectId)
  }

  async get(docId: string) {
    const [row] = await this.db.select().from(docs).where(eq(docs.id, docId))
    if (!row) throw new NotFoundException('Doc not found')
    return row
  }

  /** The docs of this workspace the person may not open (`doc-access.ts`). */
  private async docsHiddenFrom(workspaceId: string, userId: string) {
    return hiddenDocIds(this.db, workspaceId, userId, await resolveIsManager(this.db, workspaceId, userId))
  }

  /**
   * THE ONE DOOR to a doc for a person: every read, edit, comment, export,
   * share and revision passes it. Workspace membership, then where the doc
   * lives (`doc-access.ts`) — membership alone let a member refused a private
   * space open, edit and export its docs.
   *
   * REFUSED IN THE READ'S WORDS (`found-6-oct/doc-refusals-answer-not-found`).
   * It answered "Doc not found" either way, so a probe could not tell "not
   * yours to read" from "does not exist" — the rule tasks, lists, projects and
   * spaces kept until the owner's of 1 October: 403 with the reason, and 404
   * for an id naming nothing. A doc follows it, in the guard's sentences
   * (`READ_REFUSALS`): somebody of another workspace is not a member of it, a
   * guest is not shared it, and a member is refused the private space it lives
   * in.
   */
  private async assertDocAccess(docId: string, userId: string) {
    const [row] = await this.db.select().from(docs).where(eq(docs.id, docId))
    if (!row) throw new NotFoundException('Doc not found')
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(workspaceMembers.userId, userId)))
    if (!membership) throw new ForbiddenException(READ_REFUSALS.notMember)
    if (!(await canReadDoc(this.db, row, userId, isManagerRole(membership.role as string)))) {
      throw new ForbiddenException(membership.role === 'guest' ? READ_REFUSALS.notShared : READ_REFUSALS.privateContainer)
    }
    return row
  }

  async getForUser(docId: string, userId: string) {
    return this.assertDocAccess(docId, userId)
  }

  /**
   * The read rule, and then the LEVEL the write needs (`docLevel`): "edit" to
   * change, archive or delete a doc, "comment" to comment. A doc the caller may read
   * but not write this way is refused with 403 — they can see it, so saying
   * so hides nothing.
   */
  private async assertDocLevel(docId: string, userId: string, need: DocLevel) {
    const doc = await this.assertDocAccess(docId, userId)
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, doc.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    const level = await docLevel(this.db, doc, { id: userId, workspaceRole: membership?.role as string | undefined })
    if (!docLevelReaches(level, need)) {
      throw new ForbiddenException(
        need === 'comment'
          ? 'Your access to this doc does not allow commenting'
          : 'Your access to this doc does not allow changing it',
      )
    }
    return { doc, level, role: membership?.role as string | undefined }
  }

  /**
   * MAKING A DOC is adding to where it goes: "edit" on its space (the create
   * gate lists and projects face, `assertCanCreateInSpace`), where a GUEST
   * holds only what is granted them, since a space's default is its members'
   * (`resolveSpaceLevel`'s rule); and a doc of no space is the workspace's, a
   * member's to make and not a guest's.
   */
  private async assertMayMakeDocIn(workspaceId: string, spaceId: string | null | undefined, actorId: string) {
    if (!spaceId) {
      const [membership] = await this.db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
        .limit(1)
      if (membership?.role === 'guest') throw new ForbiddenException('Guests cannot create docs here')
      return
    }
    await assertCanCreateInSpace(this.db, { spaceId, actorId, kind: 'doc' })
  }

  /**
   * A doc's SPACE is where it lives: in the doc's own workspace, and one the
   * caller can reach. Every path that sets it — create, import, from a
   * template, PATCH — took any id. A doc in workspace A filed under workspace
   * B's space put B's space NAME in A's doc list (the list joins it), and a
   * private space in A accepted docs from people it keeps out.
   *
   * NOT FOUND either way, so a caller probing ids cannot tell "another
   * workspace's" or "private to you" from "does not exist".
   */
  private async assertDocSpace(spaceId: string, workspaceId: string, actorId: string) {
    const [space] = await this.db
      .select({ workspaceId: spaces.workspaceId, visibility: spaces.visibility })
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1)
    if (!space || space.workspaceId !== workspaceId) throw new NotFoundException('Space not found')
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    const reachable = await checkContainerAccess(
      this.db,
      { spaceId, spaceVisibility: space.visibility },
      { userId: actorId, workspaceRole: member?.role },
    )
    if (!reachable) throw new NotFoundException('Space not found')
  }

  /**
   * A doc's PARENT is another doc in the same workspace — and, when a doc is
   * MOVED, never one of its own descendants. The workspace half is the space
   * rule's twin: a parent in another workspace joined two tenants' doc trees.
   * The descendant half is older and quieter: hanging a doc under its own
   * child made a loop, and a tree walk over it never ends.
   */
  private async assertDocParent(parentDocId: string, workspaceId: string, actorId: string, movingDocId?: string) {
    const [parent] = await this.db
      .select({ id: docs.id, workspaceId: docs.workspaceId, spaceId: docs.spaceId, parentDocId: docs.parentDocId })
      .from(docs)
      .where(eq(docs.id, parentDocId))
      .limit(1)
    if (!parent || parent.workspaceId !== workspaceId) throw new NotFoundException('Parent doc not found')
    // And one the actor may open. A page lives where the doc above it lives,
    // so filing one under a doc you cannot read hid it from you and named the
    // doc (measured: 201 for a new page, 200 for a move, under a doc of a
    // space the member was refused).
    if (!(await canReadDoc(this.db, parent, actorId, await resolveIsManager(this.db, workspaceId, actorId)))) {
      throw new NotFoundException('Parent doc not found')
    }
    if (!movingDocId) return
    // Walk up from the new parent. Reaching the doc being moved means the
    // parent is inside it. Bounded, so a loop already in the data cannot hang
    // the request that would have made another.
    let cursor: string | null = parentDocId
    for (let depth = 0; cursor && depth < 256; depth += 1) {
      if (cursor === movingDocId) throw new BadRequestException('A doc cannot be moved inside itself')
      const [up] = await this.db.select({ parentDocId: docs.parentDocId }).from(docs).where(eq(docs.id, cursor)).limit(1)
      cursor = up?.parentDocId ?? null
    }
  }

  /**
   * §V2-10 — the tasks linked to this doc.
   *
   * `[06:15]` "acha, is document ka yeh task hai" — she describes reading the
   * relationship FROM THE DOCUMENT. Rundesk has had `task_doc_links` since
   * relationships shipped and read it in exactly one direction:
   * `where(taskDocLinks.taskId)` in `tasks.service.listLinkedDocs`. A task knew
   * its docs; a doc knew nothing. Half a relationship is not a relationship —
   * linking from the task and then opening the doc showed no sign it had
   * happened.
   *
   * Visibility is filtered rather than assumed. Doc access is workspace
   * membership, but a linked task may be PRIVATE, and a doc that lists it would
   * be a way to read titles somebody is not allowed to see. So the same filter
   * the task lists use is applied here — a manager sees everything, everyone
   * else sees public tasks plus their own.
   */
  async listLinkedTasks(docId: string, userId: string, globalRole?: string | null) {
    const doc = await this.assertDocAccess(docId, userId)
    const isManager = await resolveIsManager(this.db, doc.workspaceId, userId, globalRole)
    const visible = taskVisibilityFilter(this.db, userId, isManager)
    return this.db
      .select({
        id: taskDocLinks.id,
        taskId: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        listId: tasks.listId,
        linkedAt: taskDocLinks.createdAt,
      })
      .from(taskDocLinks)
      .innerJoin(tasks, eq(tasks.id, taskDocLinks.taskId))
      .where(visible ? and(eq(taskDocLinks.docId, docId), visible) : eq(taskDocLinks.docId, docId))
      .orderBy(desc(taskDocLinks.createdAt))
  }

  async create(data: {
    workspaceId: string
    spaceId?: string | null
    parentDocId?: string | null
    title?: string
    icon?: string
    createdById: string
  }) {
    if (data.spaceId) await this.assertDocSpace(data.spaceId, data.workspaceId, data.createdById)
    if (data.parentDocId) {
      await this.assertDocParent(data.parentDocId, data.workspaceId, data.createdById)
      // A page is part of the doc above it: adding one is editing that doc.
      await this.assertDocLevel(data.parentDocId, data.createdById, 'edit')
    } else {
      await this.assertMayMakeDocIn(data.workspaceId, data.spaceId, data.createdById)
    }
    const [row] = await this.db
      .insert(docs)
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId ?? null,
        parentDocId: data.parentDocId ?? null,
        // Coerce defensively: a non-string title (e.g. a number from a
        // malformed client) would throw on `.trim()` and surface as a 500.
        title: (typeof data.title === 'string' ? data.title.trim() : '') || 'Untitled',
        icon: data.icon,
        createdById: data.createdById,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        plaintext: '',
      })
      .returning()
    await this.snapshotRevision(row, data.createdById)
    this.realtime.emitToWorkspace(data.workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /**
   * Export a doc as Markdown. Access-checked; the title becomes the top H1
   * unless the body already opens with one.
   */
  async exportDocMarkdown(docId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const [doc] = await this.db.select().from(docs).where(eq(docs.id, docId)).limit(1)
    if (!doc) throw new NotFoundException('Doc not found')
    const body = tiptapToMarkdown(doc.content)
    const markdown = body.startsWith('# ') ? body : `# ${doc.title}\n\n${body}`
    // Named as every download is (`downloadName`): the whole title in `filename*`.
    // This kept `[a-zA-Z0-9._-]` alone, so "Überblick" was "berblick.md", and
    // the page worked the name out again (`found-30-sep/list-export-saved-as-list-csv`).
    const { fileName, disposition } = downloadName(doc.title, '.md', 'document')
    return { fileName, disposition, markdown }
  }

  /**
   * §V2-S13 frame `12:05` — Imports › **Document files**.
   *
   * THE INVERSE OF `exportDocMarkdown` ABOVE, deliberately and line for line.
   * That method prepends `# <title>` when the body does not already start with
   * an H1, so this one CONSUMES a leading H1 as the title — otherwise a doc
   * exported and imported back would grow a duplicate heading each trip, which
   * is the kind of drift nobody notices until the third round.
   *
   * With no leading H1 the file name carries the title, because that is the
   * only other thing a plain `.md` on disk tells us about itself. `Untitled`
   * is the last resort rather than the first: a doc named after its content is
   * findable, and a wall of "Untitled" is not.
   */
  async importDocFromMarkdown(
    workspaceId: string,
    userId: string,
    opts: { fileName?: string; markdown: string; spaceId?: string | null },
  ) {
    const raw = typeof opts.markdown === 'string' ? opts.markdown : ''
    if (!raw.trim()) throw new BadRequestException('The file is empty, so there is nothing to import')
    /*
     * A FILE THAT IS NOT TEXT IS REFUSED IN THE PAGE'S OWN WORDS
     * (`found-6-oct/doc-import-answers-500-to-a-binary-file`). The name is all
     * the route was asking, and an .xlsx's bytes or a legacy .xls's, sent as a
     * .md, answered 500: the database refused their NULs. A NUL, which no
     * Markdown or plain text holds and every binary format here does — a zip's
     * header (an .xlsx, a .docx), an .xls's — says it is not a text file,
     * whatever it is called.
     */
    if (raw.includes('\u0000')) throw new BadRequestException(DOC_IMPORT_ACCEPTS)

    // The title rule lives in `tiptap-markdown.ts` beside both converters, so
    // the unit test exercises the rule this uses rather than a copy of it.
    const { title, content } = splitTitleFromMarkdown(raw, opts.fileName ?? '')
    if (opts.spaceId) await this.assertDocSpace(opts.spaceId, workspaceId, userId)
    await this.assertMayMakeDocIn(workspaceId, opts.spaceId, userId)
    return this.insertImportedDoc(workspaceId, userId, { spaceId: opts.spaceId ?? null, title, content })
  }

  /**
   * AN IMPORTED DOC, WRITTEN AS `create` WRITES ONE: the row, and the three
   * follow-ups `create` does — and leaving them out was a real gap rather than
   * a tidiness point. Without them an imported doc:
   *
   *   · is NOT IN THE SEARCH INDEX — you import a document and then cannot
   *     find it, which is the whole reason to import it;
   *   · does not appear for anyone already looking at the workspace until
   *     they reload;
   *   · has no opening revision, so the first edit has nothing to diff
   *     against and the document's history starts after its content.
   *
   * Found by reading `create` beside this rather than by any test: every one
   * of these fails SILENTLY. The import returns the row and looks correct.
   * Every import goes through here: a Markdown or text file, a Word or HTML
   * file, and each page of a Confluence space.
   */
  private async insertImportedDoc(
    workspaceId: string,
    userId: string,
    doc: { spaceId: string | null; title: string; content: { type: 'doc'; content: unknown[] }; parentDocId?: string | null; position?: number },
  ) {
    const [row] = await this.db
      .insert(docs)
      .values({
        workspaceId,
        spaceId: doc.spaceId,
        parentDocId: doc.parentDocId ?? null,
        position: doc.position ?? 0,
        title: doc.title,
        createdById: userId,
        content: doc.content as unknown as Record<string, unknown>,
        plaintext: extractPlaintext(doc.content),
      })
      .returning()
    await this.snapshotRevision(row, userId)
    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /**
   * A WORD, HTML, MARKDOWN OR TEXT FILE AS A DOC, read from the file itself
   * (`commit-log/log-601eacc-2`). ClickUp's Docs import reads .docx, HTML and
   * Markdown; a Word document is a zip and cannot be sent as text, so the page
   * uploads every file this way (`import-files.ts`) and names it by its key.
   * Who may make the doc, and where, is asked before the file is read; the
   * file is gone once it has been read, whatever came of it.
   */
  async importDocFile(
    workspaceId: string,
    userId: string,
    opts: { fileKey: unknown; fileName?: string; spaceId?: string | null },
  ) {
    const name = typeof opts.fileName === 'string' ? opts.fileName : ''
    const kind = docFileKind(name)
    if (!kind) throw new BadRequestException(`${DOC_IMPORT_ACCEPTS} "${name}" is not one of those.`)
    const files = this.files
    if (!files) throw new BadRequestException('Files to import are not read on this server')
    if (opts.spaceId) await this.assertDocSpace(opts.spaceId, workspaceId, userId)
    await this.assertMayMakeDocIn(workspaceId, opts.spaceId, userId)
    try {
      const bytes = await files.read(workspaceId, userId, opts.fileKey, 'doc')
      let doc: { title: string; content: { type: 'doc'; content: unknown[] } }
      if (kind === 'docx') {
        doc = docxToDoc(bytes, name)
      } else {
        const text = decodeText(bytes)
        if (!text.trim()) throw new BadRequestException('The file is empty, so there is nothing to import')
        // Not text, whatever it is called (`found-6-oct/doc-import-answers-500-to-a-binary-file`).
        if (text.includes('\u0000')) throw new BadRequestException(DOC_IMPORT_ACCEPTS)
        doc = kind === 'html' ? htmlFileToDoc(text, name) : splitTitleFromMarkdown(text, name)
      }
      return await this.insertImportedDoc(workspaceId, userId, { spaceId: opts.spaceId ?? null, title: doc.title, content: doc.content })
    } catch (e) {
      if (e instanceof DocxReadError) throw new BadRequestException(e.message)
      throw e
    } finally {
      await files.discard(workspaceId, userId, opts.fileKey)
    }
  }

  /**
   * A CONFLUENCE SPACE, FROM ITS HTML EXPORT, AS ONE DOC WITH ITS PAGES IN IT
   * (`commit-log/log-601eacc-2`). ClickUp makes the export a Doc in the Docs
   * hub; here the Doc is named for the space and each page is a page of it
   * (`parentDocId`), nested as the space's page tree nests them, in its order
   * (`confluence-export.ts`). Asked as any doc import is: who may make a doc
   * there, before the file is read. A page the export's tree names and its
   * zip lacks is reported by name rather than made empty.
   */
  async importConfluence(
    workspaceId: string,
    userId: string,
    opts: { fileKey: unknown; spaceId?: string | null },
  ) {
    const files = this.files
    if (!files) throw new BadRequestException('Files to import are not read on this server')
    if (opts.spaceId) await this.assertDocSpace(opts.spaceId, workspaceId, userId)
    await this.assertMayMakeDocIn(workspaceId, opts.spaceId, userId)
    try {
      const bytes = await files.read(workspaceId, userId, opts.fileKey, 'confluence')
      const space = readConfluenceExport(bytes)
      if (!space.pages.length) throw new BadRequestException('The Confluence export holds no pages to import')
      const spaceId = opts.spaceId ?? null
      const root = await this.insertImportedDoc(workspaceId, userId, {
        spaceId,
        title: space.name.slice(0, 500),
        content: { type: 'doc', content: [] as DocNode[] },
      })
      const byFile = new Map<string, string>()
      const position = new Map<string, number>()
      try {
        for (const page of space.pages) {
          const parentDocId = (page.parent && byFile.get(page.parent)) || root.id
          const at = position.get(parentDocId) ?? 0
          position.set(parentDocId, at + 1)
          const row = await this.insertImportedDoc(workspaceId, userId, {
            spaceId,
            title: page.title,
            content: page.content,
            parentDocId,
            position: at,
          })
          byFile.set(page.file, row.id)
        }
      } catch (e) {
        // A space half imported is taken away whole: its pages go with the Doc they are in.
        await this.db.delete(docs).where(eq(docs.id, root.id)).catch(() => undefined)
        throw e
      }
      return {
        doc: { id: root.id, title: root.title },
        pagesImported: space.pages.length,
        missing: space.missing,
        // Said when the space was larger than one import takes.
        limit: space.missing.length && space.pages.length >= MAX_CONFLUENCE_PAGES ? MAX_CONFLUENCE_PAGES : null,
      }
    } catch (e) {
      if (e instanceof ConfluenceReadError) throw new BadRequestException(e.message)
      throw e
    } finally {
      await files.discard(workspaceId, userId, opts.fileKey)
    }
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */
  async exportDocPdf(docId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const [doc] = await this.db.select().from(docs).where(eq(docs.id, docId)).limit(1)
    if (!doc) throw new NotFoundException('Doc not found')
    const pdf = renderReportPdf(doc.title || 'Untitled', tiptapToPlainLines(doc.content))
    const { fileName, disposition } = downloadName(doc.title, '.pdf', 'document')
    return { fileName, disposition, pdf }
  }

  // ─── Doc templates ─────────────────────────────────────────────────────────

  /** Reusable doc templates in a workspace, most-recent first. */
  async listDocTemplates(workspaceId: string) {
    return this.db
      .select({
        id: docTemplates.id,
        name: docTemplates.name,
        description: docTemplates.description,
        icon: docTemplates.icon,
        createdById: docTemplates.createdById,
        createdAt: docTemplates.createdAt,
        updatedAt: docTemplates.updatedAt,
      })
      .from(docTemplates)
      .where(eq(docTemplates.workspaceId, workspaceId))
      .orderBy(desc(docTemplates.updatedAt))
  }

  /** Snapshot an existing doc's content into a reusable template. */
  async saveDocAsTemplate(
    workspaceId: string,
    userId: string,
    data: { docId: string; name: string; description?: string },
  ) {
    // Coerce non-string name/description so `.trim()` can't throw a 500.
    const name = (typeof data.name === 'string' ? data.name : '').trim()
    if (!name) throw new ForbiddenException('Template name is required')
    // Through the door every read uses: a template is the doc's whole body,
    // copied where every member can read it (measured: 201 from a member
    // refused the doc's space).
    const docId = typeof data.docId === 'string' ? data.docId : ''
    if (!isUuid(docId)) throw new NotFoundException('Doc not found in this workspace')
    const doc = await this.assertDocAccess(docId, userId)
    if (doc.workspaceId !== workspaceId) throw new NotFoundException('Doc not found in this workspace')
    const [row] = await this.db
      .insert(docTemplates)
      .values({
        workspaceId,
        name,
        description: (typeof data.description === 'string' ? data.description.trim() : '') || null,
        icon: doc.icon,
        content: doc.content,
        plaintext: doc.plaintext,
        createdById: userId,
      })
      .returning()
    return row
  }

  /** Create a brand-new doc from a template's snapshot content. */
  async createDocFromTemplate(
    workspaceId: string,
    userId: string,
    templateId: string,
    opts: { spaceId?: string | null; title?: string } = {},
  ) {
    const [template] = await this.db.select().from(docTemplates).where(eq(docTemplates.id, templateId)).limit(1)
    if (!template || template.workspaceId !== workspaceId) throw new NotFoundException('Template not found in this workspace')
    if (opts.spaceId) await this.assertDocSpace(opts.spaceId, workspaceId, userId)
    await this.assertMayMakeDocIn(workspaceId, opts.spaceId, userId)

    const [row] = await this.db
      .insert(docs)
      .values({
        workspaceId,
        spaceId: opts.spaceId ?? null,
        title: opts.title?.trim() || template.name,
        icon: template.icon,
        createdById: userId,
        content: template.content,
        plaintext: template.plaintext,
      })
      .returning()
    await this.snapshotRevision(row, userId)
    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /** Delete a doc template (workspace-scoped). */
  async deleteDocTemplate(workspaceId: string, templateId: string) {
    const [row] = await this.db
      .delete(docTemplates)
      .where(and(eq(docTemplates.id, templateId), eq(docTemplates.workspaceId, workspaceId)))
      .returning({ id: docTemplates.id })
    if (!row) throw new NotFoundException('Template not found')
    return { ok: true }
  }

  async update(
    docId: string,
    userId: string,
    patch: {
      title?: string
      icon?: string | null
      coverImageUrl?: string | null
      content?: Record<string, unknown>
      parentDocId?: string | null
      spaceId?: string | null
      position?: number
      isArchived?: boolean
      expectedUpdatedAt?: string
    },
  ) {
    const { doc } = await this.assertDocLevel(docId, userId, 'edit')
    // Only the columns this route may write — see doc-update-fields.ts. The
    // route refuses anything else by name; this is the service's own copy of
    // the rule for its other callers (revision restore).
    const writable = pickDocUpdatable(patch)
    if (writable.spaceId) await this.assertDocSpace(writable.spaceId, doc.workspaceId, userId)
    if (writable.parentDocId) await this.assertDocParent(writable.parentDocId, doc.workspaceId, userId, docId)
    if (patch.expectedUpdatedAt) {
      const [current] = await this.db
        .select({ updatedAt: docs.updatedAt })
        .from(docs)
        .where(eq(docs.id, docId))
      if (!current) throw new NotFoundException('Doc not found')
      const expected = new Date(patch.expectedUpdatedAt).getTime()
      const actual = current.updatedAt ? new Date(current.updatedAt).getTime() : NaN
      if (!Number.isFinite(expected) || expected !== actual) {
        throw new ConflictException('Doc was updated by a teammate. Refresh and retry your save.')
      }
    }
    const set: Record<string, unknown> = { ...writable, updatedAt: new Date() }
    if (writable.content) set.plaintext = extractPlaintext(writable.content)
    // Archiving here is deleting: the Trash lists a doc by who sent it there and
    // when, as `deleteForUser` records. The flag alone left it in the Trash as
    // nobody's, out of the archiver's own Trash and past their restore.
    if (writable.isArchived === true && !doc.isArchived) {
      set.archivedAt = new Date()
      set.archivedById = userId
    }
    if (writable.isArchived === false) {
      set.archivedAt = null
      set.archivedById = null
    }
    const [row] = await this.db.update(docs).set(set).where(eq(docs.id, docId)).returning()
    if (!row) throw new NotFoundException('Doc not found')
    if (patch.content) await this.snapshotRevision(row, userId)
    this.realtime.emitToDoc(docId, { type: 'doc.updated', docId, patch: set as Record<string, unknown> })
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { updated: true } })
    if (patch.title || patch.content) void this.indexDocInSearch(docId)
    return row
  }

  // ─── Version history ───────────────────────────────────────────────────────

  // Snapshot the given doc state. Consecutive saves by the same editor within a
  // 2-minute window coalesce into the latest snapshot so history stays readable.
  private async snapshotRevision(
    doc: { id: string; workspaceId: string; title: string; content: Record<string, unknown>; plaintext: string },
    editorId: string,
  ) {
    const [latest] = await this.db
      .select({ id: docRevisions.id, editorId: docRevisions.editorId, updatedAt: docRevisions.updatedAt })
      .from(docRevisions)
      .where(eq(docRevisions.docId, doc.id))
      .orderBy(desc(docRevisions.updatedAt))
      .limit(1)
    const within = latest?.updatedAt ? Date.now() - new Date(latest.updatedAt).getTime() < 2 * 60 * 1000 : false
    if (latest && latest.editorId === editorId && within) {
      await this.db
        .update(docRevisions)
        .set({ title: doc.title, content: doc.content, plaintext: doc.plaintext, updatedAt: new Date() })
        .where(eq(docRevisions.id, latest.id))
      return
    }
    await this.db.insert(docRevisions).values({
      docId: doc.id,
      workspaceId: doc.workspaceId,
      editorId,
      title: doc.title,
      content: doc.content,
      plaintext: doc.plaintext,
    })
  }

  async listRevisions(docId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const rows = await this.db
      .select({
        id: docRevisions.id,
        title: docRevisions.title,
        createdAt: docRevisions.createdAt,
        updatedAt: docRevisions.updatedAt,
        editor: { id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl },
      })
      .from(docRevisions)
      .leftJoin(users, eq(users.id, docRevisions.editorId))
      .where(eq(docRevisions.docId, docId))
      .orderBy(desc(docRevisions.updatedAt))
      .limit(100)
    return rows
  }

  async getRevision(docId: string, revisionId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const [row] = await this.db
      .select()
      .from(docRevisions)
      .where(and(eq(docRevisions.id, revisionId), eq(docRevisions.docId, docId)))
      .limit(1)
    if (!row) throw new NotFoundException('Revision not found')
    return row
  }

  // Restore a past revision by writing its content back through the normal
  // update path (which itself snapshots the pre-restore state).
  async restoreRevision(docId: string, revisionId: string, userId: string) {
    const rev = await this.getRevision(docId, revisionId, userId)
    return this.update(docId, userId, { title: rev.title, content: rev.content })
  }

  async delete(docId: string, actorId?: string) {
    const [row] = await this.db
      .update(docs)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(docs.id, docId))
      .returning()
    if (!row) throw new NotFoundException('Doc not found')
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { archived: true } })
    return { ok: true }
  }

  async deleteForUser(docId: string, userId: string) {
    await this.assertMayDelete(docId, userId)
    const [row] = await this.db
      .update(docs)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: userId, updatedAt: new Date() })
      .where(eq(docs.id, docId))
      .returning()
    if (!row) throw new NotFoundException('Doc not found')
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { archived: true } })
    return { ok: true }
  }

  private async assertMayDelete(docId: string, userId: string) {
    // Edit deletes a doc, as it archives one: docs are ClickUp's exception to
    // the location rule, where Edit changes and Full edit deletes ("Anyone,
    // including guests, with Edit permissions can archive and unarchive Docs";
    // "Guests with edit permissions can edit and delete Docs and pages").
    // This asked Full edit while archiving through `update` asked Edit, for the
    // same result (found-28-sep/doc-archive-and-delete-at-two-levels).
    await this.assertDocLevel(docId, userId, 'edit')
  }

  // ─── Public anonymous share ─────────────────────────────────────────────────

  /**
   * Turn on public read-only sharing for the doc. Returns the slug for the
   * /d/<slug> route. Idempotent: returns the existing slug if already shared.
   */
  /**
   * Who may turn a doc's public link on (`making`) or off: Edit on it, and not
   * a guest (ClickUp: guests never share publicly). Making one also asks the
   * workspace — §A4.2, it can withdraw the right to mint anonymous links at
   * all — unless the link already exists. Revoking stays possible, which is why
   * `making: false` skips it. One rule for the two routes and for what the docs
   * panel offers (`capabilities`).
   */
  private async assertMayPublish(docId: string, userId: string, making: boolean) {
    const { doc, role } = await this.assertDocLevel(docId, userId, 'edit')
    if (role === 'guest') throw new ForbiddenException('Guests cannot share docs')
    if (making && !doc.publicShareId) {
      const [workspace] = await this.db
        .select({ blockPublicSharing: workspaces.blockPublicSharing })
        .from(workspaces)
        .where(eq(workspaces.id, doc.workspaceId))
        .limit(1)
      if (workspace?.blockPublicSharing) {
        throw new ForbiddenException('Public sharing is disabled for this workspace')
      }
    }
    return doc
  }

  /**
   * What this person may do to the doc, each answered by the check its own
   * route asks: `edit` (PATCH), `delete` (DELETE, and archiving), and the
   * public link's `makeLink` and `revokeLink`. The docs panel offers the link
   * switch by these, not to everyone who can open the doc
   * (found-28-sep/delete-and-public-link-offered-to-everyone).
   */
  async capabilities(docId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const [edit, remove, makeLink, revokeLink] = await Promise.all([
      allowedBy(this.assertDocLevel(docId, userId, 'edit')),
      allowedBy(this.assertMayDelete(docId, userId)),
      allowedBy(this.assertMayPublish(docId, userId, true)),
      allowedBy(this.assertMayPublish(docId, userId, false)),
    ])
    return { edit, delete: remove, makeLink, revokeLink }
  }

  async enablePublicShare(docId: string, userId: string) {
    const doc = await this.assertMayPublish(docId, userId, true)
    if (doc.publicShareId) {
      return { publicShareId: doc.publicShareId, publicShareEnabledAt: doc.publicShareEnabledAt }
    }
    const slug = randomBytes(12).toString('base64url')
    const [row] = await this.db
      .update(docs)
      .set({ publicShareId: slug, publicShareEnabledAt: new Date(), updatedAt: new Date() })
      .where(eq(docs.id, docId))
      .returning()
    this.realtime.emitToWorkspace(doc.workspaceId, {
      type: 'doc.updated',
      docId,
      patch: { publicShareId: row.publicShareId },
    })
    return { publicShareId: row.publicShareId, publicShareEnabledAt: row.publicShareEnabledAt }
  }

  async disablePublicShare(docId: string, userId: string) {
    const doc = await this.assertMayPublish(docId, userId, false)
    if (!doc.publicShareId) return { ok: true }
    await this.db
      .update(docs)
      .set({ publicShareId: null, publicShareEnabledAt: null, updatedAt: new Date() })
      .where(eq(docs.id, docId))
    this.realtime.emitToWorkspace(doc.workspaceId, {
      type: 'doc.updated',
      docId,
      patch: { publicShareId: null },
    })
    return { ok: true }
  }

  /**
   * Anonymous lookup by share slug. Returns only the fields safe for public
   * viewers: title, icon, cover, content, updated_at. Comments, ACL state,
   * and member identity are deliberately excluded.
   */
  async getByPublicShare(slug: string) {
    if (!slug || slug.length > 64) throw new NotFoundException('Doc not found')
    const [row] = await this.db
      .select({
        id: docs.id,
        title: docs.title,
        icon: docs.icon,
        coverImageUrl: docs.coverImageUrl,
        content: docs.content,
        updatedAt: docs.updatedAt,
        publicShareId: docs.publicShareId,
        isArchived: docs.isArchived,
      })
      .from(docs)
      .where(and(eq(docs.publicShareId, slug), isNotNull(docs.publicShareId)))
      .limit(1)
    if (!row || row.isArchived) throw new NotFoundException('Doc not found')
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      coverImageUrl: row.coverImageUrl,
      content: row.content,
      updatedAt: row.updatedAt,
    }
  }

  // ─── Comments ───────────────────────────────────────────────────────────────

  async listComments(docId: string, userId: string, opts: { includeResolved?: boolean } = {}) {
    const doc = await this.assertDocAccess(docId, userId)
    const rows = await this.db
      .select({
        id: docComments.id,
        docId: docComments.docId,
        workspaceId: docComments.workspaceId,
        authorId: docComments.authorId,
        parentCommentId: docComments.parentCommentId,
        body: docComments.body,
        selection: docComments.selection,
        isResolved: docComments.isResolved,
        resolvedById: docComments.resolvedById,
        resolvedAt: docComments.resolvedAt,
        createdAt: docComments.createdAt,
        updatedAt: docComments.updatedAt,
        authorName: users.displayName,
        authorEmail: users.email,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(docComments)
      .leftJoin(users, eq(users.id, docComments.authorId))
      .where(eq(docComments.docId, docId))
      .orderBy(asc(docComments.createdAt))
    const filtered = opts.includeResolved === false ? rows.filter((r) => !r.isResolved) : rows
    return { docId: doc.id, workspaceId: doc.workspaceId, comments: filtered }
  }

  async createComment(
    docId: string,
    userId: string,
    body: { body: string; parentCommentId?: string | null; selection?: { from: number; to: number; quote?: string } | null },
  ) {
    const { doc } = await this.assertDocLevel(docId, userId, 'comment')
    const trimmed = body.body?.trim()
    if (!trimmed) throw new ConflictException('Comment body is required')
    if (body.parentCommentId) {
      const [parent] = await this.db
        .select({ id: docComments.id, docId: docComments.docId })
        .from(docComments)
        .where(eq(docComments.id, body.parentCommentId))
        .limit(1)
      if (!parent || parent.docId !== docId) {
        throw new NotFoundException('Parent comment not found')
      }
    }
    const [created] = await this.db
      .insert(docComments)
      .values({
        docId,
        workspaceId: doc.workspaceId,
        authorId: userId,
        parentCommentId: body.parentCommentId ?? null,
        body: trimmed,
        selection: body.selection ?? null,
      })
      .returning()
    this.realtime.emitToDoc(docId, {
      type: 'doc.comment.created',
      docId,
      commentId: created.id,
      parentCommentId: created.parentCommentId,
    })
    void this.notifyDocCommentRecipients(doc, created, userId, trimmed)
    return created
  }

  /**
   * Notify the doc creator, the parent comment author (for replies), and any
   * @-mentioned workspace members. Always best-effort.
   */
  private async notifyDocCommentRecipients(
    doc: typeof docs.$inferSelect,
    comment: typeof docComments.$inferSelect,
    actorId: string,
    bodyText: string,
  ) {
    try {
      const recipients = new Map<string, 'mention' | 'reply' | 'author'>()

      if (doc.createdById && doc.createdById !== actorId) {
        recipients.set(doc.createdById, 'author')
      }

      if (comment.parentCommentId) {
        const [parent] = await this.db
          .select({ authorId: docComments.authorId })
          .from(docComments)
          .where(eq(docComments.id, comment.parentCommentId))
          .limit(1)
        if (parent?.authorId && parent.authorId !== actorId) {
          recipients.set(parent.authorId, 'reply')
        }
      }

      const mentionedIds = await this.resolveMentions(doc.workspaceId, bodyText)
      for (const userId of mentionedIds) {
        if (userId !== actorId) recipients.set(userId, 'mention')
      }

      if (recipients.size === 0) return

      const docTitle = doc.title || 'Untitled doc'
      const snippet = bodyText.slice(0, 240)
      for (const [userId, kind] of recipients) {
        const type = kind === 'mention' ? 'doc_mentioned' : 'doc_commented'
        const title =
          kind === 'mention'
            ? `You were mentioned in "${docTitle}"`
            : kind === 'reply'
            ? `Reply to your comment on "${docTitle}"`
            : `New comment on "${docTitle}"`
        await this.notifications.create({
          userId,
          workspaceId: doc.workspaceId,
          actorId,
          type,
          title,
          body: snippet,
          target: {
            entityType: 'doc',
            entityId: doc.id,
            url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
          },
          emailContext: { commentSnippet: snippet },
        })
      }
    } catch (err) {
      // best-effort; never break the comment write
      // eslint-disable-next-line no-console
      console.error('[docs.notifyDocCommentRecipients] failed:', err)
    }
  }

  /**
   * Extract @-mentions from a comment body and resolve them to workspace
   * member user ids. Mentions match common formats:
   *   - @[Display Name](user:uuid)
   *   - @email@example.com
   *   - bare @username substrings against workspace display names
   */
  private async resolveMentions(workspaceId: string, text: string): Promise<string[]> {
    if (!text || text.length < 2) return []
    const ids = new Set<string>()

    const refMatches = text.matchAll(/@\[[^\]]+\]\(user:([0-9a-f-]{36})\)/gi)
    for (const m of refMatches) ids.add(m[1])

    const emailMatches = text.matchAll(/@([\w.+-]+@[\w-]+\.[\w.-]+)/g)
    const emails = Array.from(emailMatches, (m) => m[1].toLowerCase())
    if (emails.length > 0) {
      const rows = await this.db
        .select({ userId: users.id, email: users.email })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(users.email, emails)))
      for (const r of rows) ids.add(r.userId)
    }

    const nameTokens = Array.from(text.matchAll(/@([a-zA-Z][\w-]{1,40})/g), (m) => m[1].toLowerCase())
    if (nameTokens.length > 0) {
      const memberRows = await this.db
        .select({ userId: users.id, name: users.displayName, email: users.email })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
      for (const token of nameTokens) {
        for (const row of memberRows) {
          const normalizedName = (row.name ?? '').toLowerCase().replace(/\s+/g, '')
          const localPart = (row.email ?? '').split('@')[0].toLowerCase()
          if (normalizedName.includes(token) || localPart === token) {
            ids.add(row.userId)
          }
        }
      }
    }

    return Array.from(ids)
  }

  async updateComment(commentId: string, userId: string, patch: { body?: string }) {
    const [existing] = await this.db.select().from(docComments).where(eq(docComments.id, commentId)).limit(1)
    if (!existing) throw new NotFoundException('Comment not found')
    await this.assertDocLevel(existing.docId, userId, 'comment')
    if (existing.authorId && existing.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this comment')
    }
    const trimmed = patch.body?.trim()
    if (!trimmed) throw new ConflictException('Comment body is required')
    const [updated] = await this.db
      .update(docComments)
      .set({ body: trimmed, updatedAt: new Date() })
      .where(eq(docComments.id, commentId))
      .returning()
    this.realtime.emitToDoc(existing.docId, {
      type: 'doc.comment.updated',
      docId: existing.docId,
      commentId,
    })
    return updated
  }

  async setCommentResolution(commentId: string, userId: string, resolved: boolean) {
    const [existing] = await this.db.select().from(docComments).where(eq(docComments.id, commentId)).limit(1)
    if (!existing) throw new NotFoundException('Comment not found')
    await this.assertDocLevel(existing.docId, userId, 'comment')
    const [updated] = await this.db
      .update(docComments)
      .set({
        isResolved: resolved,
        resolvedById: resolved ? userId : null,
        resolvedAt: resolved ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(docComments.id, commentId))
      .returning()
    this.realtime.emitToDoc(existing.docId, {
      type: 'doc.comment.resolution_changed',
      docId: existing.docId,
      commentId,
      isResolved: resolved,
    })

    if (resolved) {
      void this.notifyDocCommentResolved(existing, userId)
    }

    return updated
  }

  private async notifyDocCommentResolved(
    comment: typeof docComments.$inferSelect,
    actorId: string,
  ) {
    try {
      const [doc] = await this.db.select().from(docs).where(eq(docs.id, comment.docId)).limit(1)
      if (!doc) return

      const recipientIds = new Set<string>()
      if (comment.authorId && comment.authorId !== actorId) recipientIds.add(comment.authorId)

      if (comment.parentCommentId) {
        const [parent] = await this.db
          .select({ authorId: docComments.authorId })
          .from(docComments)
          .where(eq(docComments.id, comment.parentCommentId))
          .limit(1)
        if (parent?.authorId && parent.authorId !== actorId) recipientIds.add(parent.authorId)
      }

      if (recipientIds.size === 0) return

      const docTitle = doc.title || 'Untitled doc'
      const snippet = comment.body.slice(0, 240)
      const target = {
        entityType: 'doc' as const,
        entityId: doc.id,
        url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
      }

      for (const userId of recipientIds) {
        await this.notifications.create({
          userId,
          workspaceId: doc.workspaceId,
          actorId,
          type: 'doc_commented',
          title: `Your comment was resolved on "${docTitle}"`,
          body: snippet,
          target,
          emailContext: { commentSnippet: snippet },
        })
      }
    } catch {
      // Best-effort
    }
  }

  async deleteComment(commentId: string, userId: string) {
    const [existing] = await this.db.select().from(docComments).where(eq(docComments.id, commentId)).limit(1)
    if (!existing) throw new NotFoundException('Comment not found')
    await this.assertDocLevel(existing.docId, userId, 'comment')
    if (existing.authorId && existing.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this comment')
    }
    await this.db.delete(docComments).where(eq(docComments.id, commentId))
    this.realtime.emitToDoc(existing.docId, {
      type: 'doc.comment.removed',
      docId: existing.docId,
      commentId,
    })
    return { ok: true }
  }
}
