import {
  CheckSquare,
  ClipboardList,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  LayoutDashboard,
  PenTool,
} from 'lucide-react'
import type { TranslationKey } from './i18n'

/**
 * §V2-06 `[07:56]` — everything Rundesk can create, written down once.
 *
 * > "Space ke ooper yeh jo PLUS ka option hota hai, us par click karoge to
 * > LIST / FOLDER [aata hai]."
 *
 * Frame `08:00` is that menu, open on the space row: a **Create** heading over
 * List *(Track tasks, projects, people & more)* and Folder *(Group Lists, Docs
 * & more)*, a rule, then Doc · Dashboard · Whiteboard · Form, a rule, then
 * Imports › and Templates.
 *
 * Rundesk's "+" on a space was a single action — `workspace-sidebar.tsx` called
 * `createProject(space.id)` behind a `window.prompt`. One of the eight, chosen
 * for you, with no way to reach the other seven from the point where you have
 * just decided to create something.
 *
 * THE LIST LIVES HERE AND NOWHERE ELSE. The quick-create modal's tab strip and
 * the sidebar's "+" menu are two renderings of one set; written out twice they
 * become the duplicated-list defect, which this audit has now found five times
 * (the planner's two settings types, the two field-type pickers, the list
 * route's `ALL_VIEWS`, the wizard's `VIEW_LABEL`, the space views dialog's
 * `VIEWS` — and two of those had already drifted into being wrong).
 */

export type CreateKind =
  | 'task'
  | 'doc'
  | 'reminder'
  | 'whiteboard'
  | 'dashboard'
  | 'list'
  | 'folder'
  | 'project'
  | 'space'

export type CreateType = {
  value: CreateKind
  icon: React.ElementType
  labelKey: TranslationKey
  /** One line under the label, as frame `08:00` writes under List and Folder. */
  blurbKey: TranslationKey
  /**
   * Can this be created INSIDE a space?
   *
   * `space` is the only one that cannot: a space does not nest in a space, and
   * offering it on a space's own "+" would be a menu item that has to ignore
   * the space it was opened from. Everything else either belongs to a space
   * (list, folder, project, task) or belongs to the workspace and is reachable
   * from here as a convenience (doc, reminder, whiteboard, dashboard).
   *
   * Which makes the space menu exactly the eight of frame `08:00`.
   */
  inSpace: boolean
  /**
   * Does the creator take a space, so opening it from a space row can
   * pre-select that space? False for the workspace-level four — Rundesk's docs,
   * reminders, whiteboards and dashboards hang off the workspace, not a space,
   * and pretending otherwise would be a picker that writes a value nobody
   * stores.
   */
  scopedToSpace: boolean
}

/**
 * §G15 `[21:36]` order for the first five — "pehle task, uske baad woh DOCUMENT
 * ka poochta hai, phir REMINDER ka, phir WHITEBOARD ka, phir DASHBOARD ka" —
 * then the containers, largest last.
 */
export const CREATE_TYPES: readonly CreateType[] = [
  { value: 'task', icon: CheckSquare, labelKey: 'quickCreate.tab.task', blurbKey: 'createMenu.blurbTask', inSpace: true, scopedToSpace: true },
  { value: 'doc', icon: FileText, labelKey: 'quickCreate.tab.doc', blurbKey: 'createMenu.blurbDoc', inSpace: true, scopedToSpace: false },
  { value: 'reminder', icon: Clock, labelKey: 'quickCreate.tab.reminder', blurbKey: 'createMenu.blurbReminder', inSpace: true, scopedToSpace: false },
  { value: 'whiteboard', icon: PenTool, labelKey: 'quickCreate.tab.whiteboard', blurbKey: 'createMenu.blurbWhiteboard', inSpace: true, scopedToSpace: false },
  { value: 'dashboard', icon: LayoutDashboard, labelKey: 'quickCreate.tab.dashboard', blurbKey: 'createMenu.blurbDashboard', inSpace: true, scopedToSpace: false },
  { value: 'list', icon: ClipboardList, labelKey: 'quickCreate.tab.list', blurbKey: 'createMenu.blurbList', inSpace: true, scopedToSpace: true },
  { value: 'folder', icon: Folder, labelKey: 'quickCreate.tab.folder', blurbKey: 'createMenu.blurbFolder', inSpace: true, scopedToSpace: true },
  { value: 'project', icon: FolderOpen, labelKey: 'quickCreate.tab.project', blurbKey: 'createMenu.blurbProject', inSpace: true, scopedToSpace: true },
  { value: 'space', icon: Layers, labelKey: 'quickCreate.tab.space', blurbKey: 'createMenu.blurbSpace', inSpace: false, scopedToSpace: false },
]

/**
 * The eight of frame `08:00` — what a space's "+" offers.
 *
 * Derived, not re-listed: adding a tenth creatable type above puts it in both
 * surfaces at once, which is the entire reason this module exists.
 */
export const SPACE_CREATE_TYPES: readonly CreateType[] = CREATE_TYPES.filter((type) => type.inSpace)
