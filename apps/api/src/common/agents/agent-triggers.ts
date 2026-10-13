/**
 * WHERE A SUPER AGENT IS STARTED FROM (`ledger-rows/row-852`).
 *
 * ClickUp starts an agent from the product's own moments: it is @mentioned in a
 * comment or a Chat message, sent a direct message, or assigned a task. Those
 * moments live in the tasks and chat modules, and the agents module needs both
 * of them to answer — a threaded comment, a reply in Chat — so a direct import
 * either way would be a cycle. This is the seam instead: the writers say what
 * happened, after their own write is done, and whoever is listening (the agents
 * module, when it is loaded) decides whether an agent was meant.
 *
 * Saying is fire-and-forget and never throws: a comment is saved whether or not
 * an agent answers it, and an agent's failure is recorded on its own run.
 */
export type CommentEvent = {
  taskId: string
  commentId: string
  /** The thread the comment is in: its own id when it starts one. */
  threadId: string
  authorId: string
  body: string
  mentionedUserIds: string[]
}
export type ChatEvent = {
  workspaceId: string
  channelId: string
  messageId: string
  /** The thread's first message, or this one when it starts the thread. */
  threadId: string
  isDm: boolean
  authorId: string
  body: string
  mentionedUserIds: string[]
}
export type AssignEvent = { taskId: string; userId: string; actorId: string }
/** An Automation's "Run Super Agent" action: which agent, on which task, with the action's own instructions. */
export type AutomationEvent = { workspaceId: string; agentId: string; taskId: string; instructions: string; actorId: string | null }

export type AgentTriggerHandler = {
  comment(e: CommentEvent): Promise<void>
  chat(e: ChatEvent): Promise<void>
  assigned(e: AssignEvent): Promise<void>
  automation(e: AutomationEvent): Promise<void>
}

class AgentTriggers {
  private handler: AgentTriggerHandler | null = null

  listen(handler: AgentTriggerHandler) {
    this.handler = handler
  }

  comment(e: CommentEvent) {
    this.say((h) => h.comment(e))
  }

  chat(e: ChatEvent) {
    this.say((h) => h.chat(e))
  }

  assigned(e: AssignEvent) {
    this.say((h) => h.assigned(e))
  }

  automation(e: AutomationEvent) {
    this.say((h) => h.automation(e))
  }

  private say(fn: (h: AgentTriggerHandler) => Promise<void>) {
    const h = this.handler
    if (!h) return
    void fn(h).catch(() => {
      // An agent that could not be started is recorded on its run where one was begun; the writer is never told.
    })
  }
}

export const agentTriggers = new AgentTriggers()
