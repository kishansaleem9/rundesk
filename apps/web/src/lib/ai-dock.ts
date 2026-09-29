/**
 * The shell's AI dock, as something a surface over the page can point at itself.
 *
 * §V2-S04 frame `03:40` — the task header reads "Created 7 Aug · Brain² · Share
 * · ⋯", and in ClickUp that control opens Brain in a side panel scoped to the
 * task it was opened from — by default Brain sees only the location it was
 * opened from (help.clickup.com, "Use Brain AI on tasks" and "Collaborate with
 * ClickUp Brain anywhere in your Workspace").
 *
 * Rundesk's assistant is the dock the shell mounts (`routes/app.tsx`), and the
 * one way into it from outside the top bar was the palette's `askAi`, handed
 * down as a prop because the shell renders the palette itself. The task sheet
 * is a sheet over the list route, so it cannot be handed a prop by the shell:
 * the same opener comes down as a context instead. Not a window event — a menu
 * item dispatched `rundesk:reset-dock` for months with nothing listening
 * (`workspace-sidebar.tsx`), and a context the sheet cannot find renders no
 * button at all rather than a button that does nothing.
 *
 * WHAT "POINTED AT A TASK" MEANS, EXACTLY. With every turn the dock sends a
 * free-text `currentView`, which the server writes into the grounding context
 * as "Current view: …" (`formatWorkspaceContext`). Pointed at a task, that line
 * names the task — its title and its id — so the model knows which task "this
 * task" is, and may write it as a `[[task:<id>]]` chip, since the id is in its
 * context. And the turn carries the task's id, so the server reads the task
 * itself into the context — its description, activity, subtasks, blockers and
 * comments, what Summarize reads — once it has checked the reader may open it
 * (`found-29-sep/ai-chat-takes-no-task`; until 29 September the id was not
 * sent and the chip claimed only the name).
 */
import { createContext, useContext } from 'react'

export type AiDockScope = { kind: 'task'; id: string; title: string }

export type AiDock = {
  /** What the open dock is pointed at, or null while it is about the page. */
  scope: AiDockScope | null
  /**
   * Open the dock pointed at this — or re-point it, when the sheet moves on to
   * a subtask or the title is edited under it.
   */
  openOn: (scope: AiDockScope) => void
  close: () => void
  /** The surface that pointed it has closed; the dock goes back to the page. */
  release: () => void
}

export const AiDockContext = createContext<AiDock | null>(null)

/** The shell's dock, or null where there is none to open (outside a workspace). */
export function useAiDock(): AiDock | null {
  return useContext(AiDockContext)
}

/**
 * The `currentView` the server is sent: the page's own hint, with the task in
 * it. The title is JSON-quoted so a title with quotes in it still reads as one.
 */
export function viewWithScope(view: string | undefined, scope: AiDockScope | null | undefined): string | undefined {
  if (!scope) return view
  const task = `task ${JSON.stringify(scope.title)} (id ${scope.id})`
  return view ? `${view} / ${task}` : task
}
