/**
 * §V2-13 — "List moved to trash" · **Undo (Ctrl+Z)**, frame `09:10`.
 *
 * WHAT WAS THERE. Deleting a list, project or space from the tree showed
 * NOTHING — no toast at all, and `window.alert` only if it failed. Trash and
 * restore both existed, and getting back to them meant knowing that Trash was a
 * settings tab, going there, and finding the row. The frame offers it in the
 * second after the mistake, which is the only second in which it is easy.
 *
 * THESE DELETES ARE SOFT, WHICH IS WHY THIS CAN EXIST. `lists`, `projects` and
 * `spaces` set `isArchived`/`archivedAt` rather than removing the row, and the
 * trash endpoint restores exactly that. Checked before building: an undo over a
 * hard delete would be a button that apologises.
 *
 * THE OFFER EXPIRES WITH THE TOAST. `lastUndo` is cleared when the toast goes,
 * so Ctrl+Z cannot resurrect something deleted ten minutes ago — the shortcut
 * means "undo the thing I just did", and a stale one is worse than none.
 */
import { toast } from '@rundesk/ui'
import { api } from './api'

/** The types the trash endpoint can restore — `TRASH_TYPES` on the API. */
export type TrashType = 'space' | 'folder' | 'project' | 'list' | 'task' | 'doc'

/** How long the offer stands. Long enough to notice, short enough that Ctrl+Z
 *  never means something you have forgotten about. */
const UNDO_MS = 8000

let lastUndo: { run: () => Promise<void>; at: number } | null = null

/**
 * Delete something, say so, and offer it straight back.
 *
 * The caller does the deleting: this is about what happens afterwards, and
 * every call site's delete differs (different route, different invalidations).
 */
export function offerUndo(opts: {
  workspaceId: string
  type: TrashType
  id: string
  /** Already-translated, e.g. "List moved to trash". */
  message: string
  undoLabel: string
  restoredMessage: string
  failedMessage: string
  /** Put the thing back on screen once the server has restored it. */
  onRestored: () => void | Promise<void>
}) {
  const run = async () => {
    try {
      await api(`/workspaces/${opts.workspaceId}/trash/${opts.type}/${opts.id}/restore`, {
        method: 'POST',
      })
      await opts.onRestored()
      toast.success(opts.restoredMessage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : opts.failedMessage)
    } finally {
      // Whether it worked or not, the offer is spent — a second press must not
      // fire a second restore.
      lastUndo = null
    }
  }

  lastUndo = { run, at: Date.now() }
  toast.success(opts.message, {
    duration: UNDO_MS,
    action: { label: opts.undoLabel, onClick: () => void run() },
    onAutoClose: () => {
      lastUndo = null
    },
    onDismiss: () => {
      lastUndo = null
    },
  })
}

/**
 * Frame `09:10` shows the shortcut beside the button, so it is part of the ask.
 *
 * Returns whether there was anything to undo, so the caller knows whether to
 * swallow the keystroke — Ctrl+Z with nothing pending should still mean undo to
 * whatever else is listening.
 */
export function undoLastDelete(): boolean {
  if (!lastUndo || Date.now() - lastUndo.at > UNDO_MS) {
    lastUndo = null
    return false
  }
  void lastUndo.run()
  return true
}

/** Test seam, and used when signing out: an offer must not survive the person. */
export function clearUndo() {
  lastUndo = null
}
