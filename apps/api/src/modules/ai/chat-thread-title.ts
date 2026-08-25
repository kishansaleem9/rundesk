/**
 * §15 — naming a chat from what it is about.
 *
 * Frame `296_1817` shows "New Chat"; by `297_1820` the same thread reads
 * "Skill Definition and Ideas" in the sidebar. The rename is what makes the
 * list usable: five threads called "New Chat" is the same as no list.
 *
 * Pure and DB-free so the rules can be tested without a model — including the
 * one that matters most, which is when NOT to rename.
 */

export const DEFAULT_THREAD_TITLE = 'New Chat'
const MAX_TITLE = 60

/**
 * Whether this thread should be named now.
 *
 * Three conditions, and each exists for a failure that is invisible if you get
 * it wrong. Renaming a thread the person titled themselves loses their words.
 * Renaming after every message makes the sidebar shuffle while they read it.
 * Naming from a single "hi" produces a title about nothing.
 */
export function shouldAutoTitle(thread: {
  title: string
  titleIsAuto: 'yes' | 'no'
  messageCount: number
}): boolean {
  if (thread.titleIsAuto !== 'yes') return false
  if (thread.title !== DEFAULT_THREAD_TITLE) return false
  // One exchange — a question and its answer — is the least that can be about
  // something. Her frame renames somewhere in exactly that window.
  return thread.messageCount >= 2
}

/** Tidy whatever the model returned into something that fits a sidebar row. */
export function cleanTitle(raw: string): string {
  const cleaned = raw
    .trim()
    // Models like to wrap a title in quotes, and a quoted title in a list of
    // unquoted ones looks like a mistake.
    .replace(/^["'`]+|["'`]+$/g, '')
    // A trailing period on a 3-word heading reads as a truncated sentence.
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned.length > MAX_TITLE ? `${cleaned.slice(0, MAX_TITLE - 1).trimEnd()}…` : cleaned
}

/**
 * The title used when no model is configured.
 *
 * Not "Chat 4": the first thing someone asked is a better name for a
 * conversation than its position in a list, and it needs no model to produce.
 */
export function fallbackTitle(firstUserMessage: string): string {
  // Strip the openers REPEATEDLY: "can you help me plan the sprint" has two
  // stacked, and removing one leaves "Help me plan the sprint" — still a title
  // about asking rather than about the sprint.
  let subject = firstUserMessage.replace(/\s+/g, ' ').trim()
  for (;;) {
    const stripped = subject.replace(/^(please|can you|could you|would you|hey|hi|hello|help me|i want to|i need to)\b[,\s]*/i, '')
    if (stripped === subject) break
    subject = stripped
  }
  const words = subject.split(' ').filter(Boolean)
  if (words.length === 0) return DEFAULT_THREAD_TITLE
  const title = cleanTitle(words.slice(0, 7).join(' '))
  if (!title) return DEFAULT_THREAD_TITLE
  // Sentence case: a title that starts lower-case looks like a fragment
  // someone forgot to finish.
  return title.charAt(0).toUpperCase() + title.slice(1)
}
