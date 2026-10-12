import { EventEmitter } from 'node:events'

/**
 * A TASK WAS MADE OR CHANGED, said in-process to whoever listens.
 *
 * `TasksService` says it beside the automations and webhooks it already fires
 * (`fireTaskEvent`, and a comment's own path), and the AI fields that fill and
 * update themselves listen (`AiFieldsService`, `ledger-rows/row-719`). An event
 * rather than an injection because the listener's module imports the tasks
 * module, and the tasks module importing it back would be a cycle; nothing
 * waits on a listener, and a listener that throws is its own problem.
 */
export type TaskChange = {
  /** `task.created`, `task.updated`, `task.status_changed`, `task.comment_added`, … */
  type: string
  workspaceId: string
  taskId: string
  /** Who made the change, where one person did. */
  userId?: string
}

const bus = new EventEmitter()
bus.setMaxListeners(20)

export function emitTaskChange(change: TaskChange): void {
  try {
    bus.emit('change', change)
  } catch {
    // A listener's failure is never the change's.
  }
}

/** Listen; the answer stops listening. */
export function onTaskChange(listener: (change: TaskChange) => void): () => void {
  bus.on('change', listener)
  return () => bus.off('change', listener)
}
