import {
  CheckSquare,
  ClipboardList,
  // §V2-06 frame `08:00` — the Form row's clipboard-with-lines glyph.
  ClipboardType,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  LayoutDashboard,
  PenTool,
} from 'lucide-react'
import type { TranslationKey } from './i18n'
import type { WorkspacePermission } from '../hooks/use-permissions'

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
  | 'form'
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
   * (Not "exactly the eight of frame `08:00`", which is what this said: the
   * frame's eight are a different set — see the note on `SPACE_CREATE_TYPES`.)
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
  /**
   * Does this make a CONTAINER — something other things then live in?
   *
   * DECLARED PER ROW BECAUSE THE SIDEBAR'S RULE IS DRAWN FROM IT. Frame
   * `08:00` divides its menu with rules, and the sidebar draws its own between
   * the things that go inside a container and the containers themselves. That
   * separator used to be `{i === 5 && <DropdownMenuSeparator />}` — a literal
   * index into THIS array — so inserting `form` at position five moved the
   * rule silently onto the wrong boundary, which no typecheck and no existing
   * check could notice. A boundary computed from what each row IS cannot drift
   * when the array does.
   */
  isContainer: boolean
  /**
   * The permission the API asks before making one (`@RequirePermissions`).
   * Offered only to somebody who holds it, by role or by a custom role: the
   * menus offered Project to a member and Space to a guest, each a 403
   * (`product-siblings/custom-role-permissions-unread-by-web`).
   */
  requires?: WorkspacePermission
  /**
   * What a GUEST may do with it, as the API has it: `yes` (a reminder is their
   * own), `no` (a task, a doc of the workspace — the form makes no other —
   * a whiteboard, a dashboard, a form, and the containers the permission keys
   * already withhold), or `where-writable`, a list, only in a space shared
   * with them to edit. Offered otherwise, each was a 403
   * (`found-24-sep/create-menu-offers-guests-what-they-cannot-make`).
   */
  guests: 'yes' | 'no' | 'where-writable'
}

/**
 * §G15 `[21:36]` order for the first five — "pehle task, uske baad woh DOCUMENT
 * ka poochta hai, phir REMINDER ka, phir WHITEBOARD ka, phir DASHBOARD ka" —
 * then the containers, largest last.
 */
export const CREATE_TYPES: readonly CreateType[] = [
  { value: 'task', icon: CheckSquare, labelKey: 'quickCreate.tab.task', blurbKey: 'createMenu.blurbTask', inSpace: true, scopedToSpace: true, isContainer: false, guests: 'no' },
  { value: 'doc', icon: FileText, labelKey: 'quickCreate.tab.doc', blurbKey: 'createMenu.blurbDoc', inSpace: true, scopedToSpace: false, isContainer: false, guests: 'no' },
  { value: 'reminder', icon: Clock, labelKey: 'quickCreate.tab.reminder', blurbKey: 'createMenu.blurbReminder', inSpace: true, scopedToSpace: false, isContainer: false, guests: 'yes' },
  { value: 'whiteboard', icon: PenTool, labelKey: 'quickCreate.tab.whiteboard', blurbKey: 'createMenu.blurbWhiteboard', inSpace: true, scopedToSpace: false, isContainer: false, guests: 'no' },
  { value: 'dashboard', icon: LayoutDashboard, labelKey: 'quickCreate.tab.dashboard', blurbKey: 'createMenu.blurbDashboard', inSpace: true, scopedToSpace: false, isContainer: false, guests: 'no' },
  /*
   * §V2-06 frame `08:00` — Form, beside Doc · Dashboard · Whiteboard in the
   * frame's middle group, and absent from this list until now.
   *
   * `scopedToSpace` because a form's whole job is to file a submission into a
   * LIST: `FormsService.createTaskForSubmission` returns early when a form has
   * neither a `targetListId` nor a field mapped to one, so a form created
   * without a destination accepts submissions and makes nothing — the
   * confident zero, on a surface where nobody would go looking for it. The
   * creator therefore asks which space and which list, and refuses without.
   */
  { value: 'form', icon: ClipboardType, labelKey: 'quickCreate.tab.form', blurbKey: 'createMenu.blurbForm', inSpace: true, scopedToSpace: true, isContainer: false, guests: 'no' },
  { value: 'list', icon: ClipboardList, labelKey: 'quickCreate.tab.list', blurbKey: 'createMenu.blurbList', inSpace: true, scopedToSpace: true, isContainer: true, guests: 'where-writable' },
  { value: 'folder', icon: Folder, labelKey: 'quickCreate.tab.folder', blurbKey: 'createMenu.blurbFolder', inSpace: true, scopedToSpace: true, isContainer: true, requires: 'space.create', guests: 'no' },
  { value: 'project', icon: FolderOpen, labelKey: 'quickCreate.tab.project', blurbKey: 'createMenu.blurbProject', inSpace: true, scopedToSpace: true, isContainer: true, requires: 'project.create', guests: 'no' },
  { value: 'space', icon: Layers, labelKey: 'quickCreate.tab.space', blurbKey: 'createMenu.blurbSpace', inSpace: false, scopedToSpace: false, isContainer: true, requires: 'space.create', guests: 'no' },
]

/**
 * What a space's "+" offers — every `CreateKind` except `space`.
 *
 * NOT "the eight of frame `08:00`", which is what this said while being a
 * different set. The frame's eight are List · Folder · Doc · Dashboard ·
 * Whiteboard · Form · Imports · Templates; Rundesk additionally makes Tasks,
 * Reminders and Projects in a space, and Imports and Templates are not
 * `CreateKind`s at all — they navigate to something that already exists, and
 * the sidebar draws them below the rule for that reason.
 *
 * Derived, not re-listed: adding a tenth creatable type above puts it in both
 * surfaces at once, which is the entire reason this module exists.
 */
export const SPACE_CREATE_TYPES: readonly CreateType[] = CREATE_TYPES.filter((type) => type.inSpace)

/** The row for a kind, for a creator asking `useCreatable` about its own. */
export function createTypeOf(kind: CreateKind): CreateType {
  const type = CREATE_TYPES.find((ty) => ty.value === kind)
  if (!type) throw new Error(`no create type ${kind}`)
  return type
}
