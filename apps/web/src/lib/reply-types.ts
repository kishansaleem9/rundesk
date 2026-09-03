/**
 * §G12-1 — what counts as "a reply".
 *
 * The Replies page and workspace Home each carried their own list, and they
 * disagreed. Home filtered `['task_commented', 'comment']`: `comment` is in the
 * notification enum but no service ever emits it, and `chat_reply` and
 * `doc_commented` — which are emitted — were absent. So Home's Replies badge
 * counted task comments only, and a workspace whose replies were all in chat
 * showed a badge of zero next to a page listing them.
 *
 * One list, imported by both, so the next reply type added has one place to be
 * added and cannot be half-added again.
 */
export const REPLY_TYPES: ReadonlySet<string> = new Set([
  'task_commented',
  'doc_commented',
  'chat_reply',
])

export const isReplyNotification = (type: string): boolean => REPLY_TYPES.has(type)
