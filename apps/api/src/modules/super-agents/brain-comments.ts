import { Inject, Injectable, Logger } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { lists, projects, spaces, taskComments, tasks, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import type { CommentEvent } from '../../common/agents/agent-triggers'
import { AiService } from '../ai/ai.service'
import { TasksService } from '../tasks/tasks.service'

/**
 * `@Brain` AS THE PICKER WRITES IT, OR TYPED: the word on its own in any case,
 * not part of an address or a longer word. One rule for the server and the
 * suite, so a comment the web says Brain will answer is one the server answers.
 */
export const BRAIN_MENTION = /(^|[^\w@.])@brain(?![\w-])/i
/** The account Brain answers as: one for the whole product, an agent's account so it is never notified, listed or counted. */
export const BRAIN_EMAIL = 'brain@rundesk.system'

/** Tasks and Docs a comment links by address: Brain may read those even where they are private, when its asker may. */
export function linkedItems(body: string): { taskIds: string[]; docIds: string[] } {
  const uuid = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
  // A task's link opens it as `?task=<id>` on its list, or `/tasks/<id>`; a Doc's as `/docs/<id>`.
  const taskIds = [...body.matchAll(new RegExp(`(?:/tasks?/|[?&]task=)${uuid}`, 'g'))].map((m) => m[1].toLowerCase())
  const docIds = [...body.matchAll(new RegExp(`/docs?/${uuid}`, 'g'))].map((m) => m[1].toLowerCase())
  return { taskIds: [...new Set(taskIds)], docIds: [...new Set(docIds)] }
}

/**
 * @BRAIN IN A COMMENT, AS CLICKUP'S (`ledger-rows/row-745`): mentioned in a
 * task's comment, Brain answers right away, in the same thread, as Brain. It
 * reads the task, the thread and the workspace — what its asker may read, and
 * of that only what is public unless it is where Brain was asked or the
 * comment links it (`AiService.brainKnowledge`) — because the answer is a
 * comment everybody who can open the task reads. It writes where its asker may
 * comment, as an agent does (`actingForId`), and its own words start nothing.
 * Each comment that wants an answer names it: a reply in the thread that does
 * not is not one Brain answers, as in ClickUp.
 */
@Injectable()
export class BrainComments {
  private readonly log = new Logger(BrainComments.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly ai: AiService,
    private readonly tasks: TasksService,
  ) {}

  /**
   * Brain's account, made the first time Brain answers. Read each time, never
   * kept in memory: a process that held an id the database no longer has
   * would write its next answer as nobody.
   */
  async account(): Promise<string> {
    const [found] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, BRAIN_EMAIL)).limit(1)
    if (found) return found.id
    await this.db
      .insert(users)
      .values({ email: BRAIN_EMAIL, displayName: 'Brain', emailVerified: true, isAgent: true } as typeof users.$inferInsert)
      .onConflictDoNothing()
    const [made] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, BRAIN_EMAIL)).limit(1)
    return made.id
  }

  async onComment(e: CommentEvent) {
    if (!BRAIN_MENTION.test(e.body)) return
    // Without a model nothing is answered; the composer said so before it posted.
    if (!this.ai.isAvailable()) return
    const [task] = await this.db
      .select({ title: tasks.title, listId: tasks.listId, workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, e.taskId))
      .limit(1)
    if (!task) return
    const question = e.body.replace(new RegExp(BRAIN_MENTION.source, 'gi'), '$1').trim()
    try {
      const [taskText, thread, knowledge] = await Promise.all([
        this.ai.buildTaskSummaryInput(e.taskId),
        this.threadText(e.threadId, e.commentId),
        this.ai.brainKnowledge(task.workspaceId, e.authorId, question, { listId: task.listId }, linkedItems(e.body)),
      ])
      const text = await this.ai.brainCommentReply(
        { taskTitle: task.title, task: taskText, thread, knowledge, question },
        { userId: e.authorId, workspaceId: task.workspaceId },
      )
      if (!text) return
      await this.tasks.createComment(e.taskId, await this.account(), text, e.threadId, undefined, undefined, { actingForId: e.authorId })
    } catch (err) {
      this.log.warn(`Brain did not answer a comment on ${e.taskId}: ${err instanceof Error ? err.message : err}`)
    }
  }

  /** The thread before this comment, oldest first: what Brain answers is the conversation, not one line of it. */
  private async threadText(rootId: string, thisId: string) {
    const rows = await this.db
      .select({ id: taskComments.id, body: taskComments.body, author: users.displayName, parent: taskComments.parentCommentId })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.authorId))
      .where(eq(taskComments.parentCommentId, rootId))
      .orderBy(asc(taskComments.createdAt))
      .limit(30)
    const [root] = await this.db
      .select({ id: taskComments.id, body: taskComments.body, author: users.displayName })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.authorId))
      .where(eq(taskComments.id, rootId))
      .limit(1)
    return [...(root && root.id !== thisId ? [root] : []), ...rows.filter((r) => r.id !== thisId)].map((r) => `${r.author}: ${r.body}`).join('\n')
  }
}
