import { Link, useNavigate, useParams, useRouterState, useSearch } from '@tanstack/react-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSidebarStore } from '../store/sidebar'
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  ArrowLeft,
  LayoutGrid,
  Play,
  Home,
  Inbox,
  Reply,
  MessageCircle,
  FolderOpen,
  Folder,
  Settings,
  Plus,
  Bot,
  FileText,
  LayoutDashboard,
  Frame,
  ClipboardList,
  Zap,
  BarChart3,
  GitBranch,
  Layers,
  PlugZap,
  Star,
  Hash,
  CheckSquare,
  Target,
  Users2,
  Clock3,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  MoreHorizontal,
  ArrowRightLeft,
  Share2,
  FolderPlus,
  Pencil,
  Trash2,
  Archive,
  Lock,
  Globe,
  Users,
  Gem,
  Video,
  CircleCheck,
  CalendarClock,
  ListChecks,
  CalendarDays,
  Import,
  LayoutTemplate,
} from 'lucide-react'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@rundesk/ui'
import { api } from '../lib/api'
import { useUnreadCount } from '../lib/notifications-query'
import { offerUndo, undoLastDelete } from '../lib/undoable-delete'
import { ContainerEditDialog, type ContainerEditValues } from './container-edit-dialog'
import { CreateWorkspaceFlow, type WorkspaceDraft } from './create-workspace-flow'
import { useFavorites, useToggleFavorite, type FavoriteEntityType } from '../lib/use-favorites'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { lastWorkspaceId, rememberWorkspace } from '../lib/last-workspace'
import { useAiChatThreads } from '../lib/skills-api'
import { useAuthStore } from '../store/auth'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { usePermissions } from '../hooks/use-permissions'
import { useCreatable } from '../hooks/use-creatable'
import { MoveDialog, type MovableKind } from './move-dialog'
import { SharePanel, type ShareObjectType } from './share-panel'
import { CreateSpaceWizard } from './create-space-wizard'
import { QuickCreateModal } from './quick-create-modal'
import { SPACE_CREATE_TYPES, type CreateKind } from '../lib/create-types'
import { useResolvedFlags } from '../lib/use-feature-flags'
import { FLAGS, type FlagKey } from '@rundesk/feature-flags'
import { ListSkeleton } from './loading-skeletons'
/** Shown in the toggle's tooltip so the chord is discoverable, not folklore. */
const SIDEBAR_CHORD =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘ \\' : 'Ctrl \\'


function isUuidLike(value: string | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

type NavRecent = { label: string; path: string }

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

function pathsEqual(a: string, b: string) {
  return normalizePath(a) === normalizePath(b)
}

/** Icon for a pinned entity by its type (Plan §2 quick access). */
function pinnedIcon(entityType: FavoriteEntityType) {
  switch (entityType) {
    case 'space': return Layers
    case 'list': return ClipboardList
    case 'task': return CheckSquare
    case 'doc': return FileText
    case 'channel': return Hash
    default: return Star
  }
}

/** True when pathname matches a nav target (exact for workspace home). */
function isNavPathActive(pathname: string, targetPath: string, exact = false) {
  const current = normalizePath(pathname)
  const target = normalizePath(targetPath)
  if (exact) return current === target
  return current === target || current.startsWith(`${target}/`)
}

function navIconForLabel(label: string) {
  const key = label.toLowerCase()
  if (key.includes('inbox')) return Inbox
  if (key.includes('shared')) return Users
  if (key.includes('team') || key.includes('chat')) return MessageCircle
  if (key.includes('doc')) return FileText
  if (key.includes('dashboard')) return LayoutDashboard
  if (key.includes('meeting')) return Video
  if (key.includes('skill')) return Gem
  if (key.includes('ai')) return Bot
  if (key.includes('whiteboard')) return Frame
  if (key.includes('form')) return ClipboardList
  if (key.includes('automation')) return Zap
  if (key.includes('workload')) return BarChart3
  if (key.includes('timeline')) return GitBranch
  if (key.includes('template')) return Layers
  if (key.includes('integration')) return PlugZap
  if (key.includes('setting')) return Settings
  return Home
}

function workspaceNavEntries(workspaceId: string): Array<{ label: string; path: string; exact?: boolean }> {
  const base = `/app/${workspaceId}`
  return [
    { label: 'Home', path: base, exact: true },
    { label: 'Inbox', path: `${base}/inbox` },
    // G12-7 — the Replies page existed and was reachable only from the command
    // palette, so a reply you were told about had no place you could go and
    // look for it. Sits beside the Inbox because it answers the same question.
    { label: 'Replies', path: `${base}/replies` },
    { label: 'Teams', path: `${base}/chat` },
    { label: 'Docs', path: `${base}/docs` },
    { label: 'Dashboards', path: `${base}/dashboard` },
    { label: 'Shared with me', path: `${base}/shared` },
    { label: 'AI', path: `${base}/ai` },
    { label: 'Skills', path: `${base}/skills` },
    { label: 'Meetings', path: `${base}/meetings` },
    { label: 'Whiteboards', path: `${base}/whiteboards` },
    { label: 'Forms', path: `${base}/forms` },
    { label: 'Automations', path: `${base}/automations` },
    { label: 'Workload', path: `${base}/workload` },
    { label: 'Timeline', path: `${base}/timeline` },
    { label: 'Templates', path: `${base}/templates` },
    { label: 'Integrations', path: `${base}/integrations` },
    { label: 'Goals', path: `${base}/goals` },
    { label: 'Sprints', path: `${base}/sprints` },
    { label: 'Reports', path: `${base}/reports` },
    { label: 'Time', path: `${base}/time` },
    { label: 'Mind maps', path: `${base}/mindmaps` },
    { label: 'Clips', path: `${base}/clips` },
    { label: 'Settings', path: `${base}/settings` },
  ]
}

/**
 * §1.3 — the destinations the collapsed rail carries, in sidebar order, with
 * the same feature-flag guards the expanded list uses. Kept as data so the two
 * cannot drift: a flag turned off has to hide the entry in both.
 */
function railEntries(
  workspaceId: string,
  featureEnabled: (flag?: FlagKey) => boolean,
  isAdmin: boolean,
  mayViewReports: boolean,
): Array<{ path: string; label: string; icon: typeof Home; exact?: boolean }> {
  const base = `/app/${workspaceId}`
  const all: Array<{
    path: string
    label: string
    icon: typeof Home
    exact?: boolean
    flag?: FlagKey
  }> = [
    { path: base, label: 'Home', icon: Home, exact: true },
    { path: `${base}/inbox`, label: 'Inbox', icon: Inbox },
    { path: `${base}/replies`, label: 'Replies', icon: Reply },
    // Guarded to match the floating dock, which gates exactly these three. A
    // ClickApp turned off has to disappear from every surface, or the rail
    // becomes the one place a disabled feature is still reachable.
    { path: `${base}/chat`, label: 'Teams', icon: MessageCircle, flag: FLAGS.CHAT },
    { path: `${base}/docs`, label: 'Docs', icon: FileText, flag: FLAGS.DOCS },
    { path: `${base}/dashboard`, label: 'Dashboards', icon: LayoutDashboard, flag: FLAGS.VIEWS_DASHBOARD },
    { path: `${base}/ai`, label: 'AI', icon: Bot, flag: FLAGS.AI },
    // §15 — a skill is an AI surface, so it rides the same ClickApp flag: a
    // workspace with AI turned off must not find Skills still reachable here.
    { path: `${base}/skills`, label: 'Skills', icon: Gem, flag: FLAGS.AI },
    // §2.8 — she puts Meetings directly after Skills [19:12].
    { path: `${base}/meetings`, label: 'Meetings', icon: Video },
    { path: `${base}/shared`, label: 'Shared with me', icon: Users },
    { path: `${base}/whiteboards`, label: 'Whiteboards', icon: Frame },
    { path: `${base}/forms`, label: 'Forms', icon: ClipboardList, flag: FLAGS.FORMS },
    { path: `${base}/automations`, label: 'Automations', icon: Zap, flag: FLAGS.AI_AUTOMATIONS },
    { path: `${base}/workload`, label: 'Workload', icon: BarChart3, flag: FLAGS.VIEWS_WORKLOAD },
    { path: `${base}/timeline`, label: 'Timeline', icon: GitBranch },
    { path: `${base}/goals`, label: 'Goals', icon: ClipboardList, flag: FLAGS.GOALS },
    { path: `${base}/sprints`, label: 'Sprints', icon: Play, flag: FLAGS.SPRINTS },
    { path: `${base}/reports`, label: 'Reports', icon: BarChart3, flag: FLAGS.REPORTING },
    { path: `${base}/time`, label: 'Time', icon: Clock3, flag: FLAGS.TIME_TRACKING },
    { path: `${base}/templates`, label: 'Templates', icon: Layers },
    { path: `${base}/integrations`, label: 'Integrations', icon: PlugZap, flag: FLAGS.INTEGRATIONS },
    { path: `${base}/mindmaps`, label: 'Mind maps', icon: Frame },
    { path: `${base}/clips`, label: 'Clips', icon: MessageCircle },
  ]
  // Reports are `report.view.basic`, which a guest's role does not hold: offered
  // to them, every request on the page was a 403.
  const visible = all.filter(
    (entry) => (!entry.flag || featureEnabled(entry.flag)) && (entry.path !== `${base}/reports` || mayViewReports),
  )
  if (isAdmin) visible.push({ path: `${base}/settings`, label: 'Settings', icon: Settings })
  return visible.map(({ flag: _flag, ...entry }) => entry)
}

function recentFromPathname(pathname: string, workspaceId: string): NavRecent | null {
  const current = normalizePath(pathname)
  const hit = workspaceNavEntries(workspaceId).find((entry) =>
    isNavPathActive(current, entry.path, entry.exact),
  )
  if (hit) return { label: hit.label, path: hit.path }

  // Space / project / list hierarchy
  const listMatch = current.match(
    /^\/app\/[^/]+\/([^/]+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/,
  )
  if (listMatch) {
    const [, spaceId, projectId, listId] = listMatch
    return {
      label: 'Task list',
      path: `/app/${workspaceId}/${spaceId}/${projectId}/${listId}`,
    }
  }
  const projectMatch = current.match(/^\/app\/[^/]+\/([^/]+)\/([^/]+)$/)
  if (projectMatch) {
    const [, spaceId, projectId] = projectMatch
    return { label: 'Project', path: `/app/${workspaceId}/${spaceId}/${projectId}` }
  }
  const spaceMatch = current.match(/^\/app\/[^/]+\/([^/]+)$/)
  if (spaceMatch) {
    const [, spaceId] = spaceMatch
    return { label: 'Space', path: `/app/${workspaceId}/${spaceId}` }
  }
  return null
}

/** Where the floating dock sits before anybody drags it, and where "Reset
 *  dock position" puts it back. */
const DOCK_HOME = { x: 16, y: 16 }

/**
 * G07-7 [08:29–08:31] — "hum limited de dein … woh us ko choose karna parega".
 *
 * The dock carried a hard-coded list: we chose the tools, the user did not. The
 * `pinned_links` column and its endpoint had existed the whole time and nothing
 * in the web app ever wrote to them.
 *
 * Kept as data next to the render for the same reason the top bar's picker is:
 * a tool that can be ticked and then leads nowhere is worse than one that was
 * never offered. Each entry names a route this app actually has, and the flag
 * decides whether it may be offered at all.
 */
const DOCKABLE_TOOLS: Array<{
  id: string
  path: string
  icon: typeof Home
  labelKey: TranslationKey
  flag?: FlagKey
  adminOnly?: boolean
}> = [
  { id: 'home', path: '', icon: Home, labelKey: 'nav.home' },
  { id: 'inbox', path: '/inbox', icon: Inbox, labelKey: 'nav.inbox' },
  { id: 'chat', path: '/chat', icon: MessageCircle, labelKey: 'nav.chat', flag: FLAGS.CHAT },
  { id: 'ai', path: '/ai', icon: Bot, labelKey: 'nav.ai', flag: FLAGS.AI },
  // §V2-02 — the Planner sits at /calendar; see the route file for why the
  // label and the address differ.
  { id: 'planner', path: '/calendar', icon: CalendarDays, labelKey: 'nav.planner' },
  { id: 'docs', path: '/docs', icon: FileText, labelKey: 'nav.docs', flag: FLAGS.DOCS },
  { id: 'dashboards', path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboards', flag: FLAGS.VIEWS_DASHBOARD },
  { id: 'goals', path: '/goals', icon: Target, labelKey: 'nav.goals' },
  /*
   * §V2-12, frame `20:55` — Teams is a DESTINATION, and deliberately not
   * `adminOnly`. Everything it shows already existed inside workspace settings,
   * which redirects any non-admin back to `/app`, so an ordinary member could
   * not see who was on which team or who reported to whom. Marking this admin
   * too would rebuild the wall this item exists to remove.
   */
  { id: 'teams', path: '/teams', icon: Users2, labelKey: 'nav.teams' },
  { id: 'whiteboards', path: '/whiteboards', icon: Frame, labelKey: 'nav.whiteboards' },
  { id: 'settings', path: '/settings', icon: Settings, labelKey: 'nav.settings', adminOnly: true },
]

/** What the dock carries for somebody who has never opened the picker. */
const DEFAULT_DOCK_TOOLS = ['home', 'inbox', 'chat', 'ai', 'docs', 'dashboards', 'settings']

export function WorkspaceSidebar({ drawer = false, onNavigate }: { drawer?: boolean; onNavigate?: () => void } = {}) {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const workspaceId = isUuidLike(params.workspaceId) ? params.workspaceId : undefined
  const { isAdmin, canCreateWorkspace, role: workspaceRole } = useWorkspaceRole(workspaceId)
  // A space's own "+" offers what this person may make THERE (`useCreatable`,
  // the Create menu's own answer): a permission key once held, and for a guest
  // a list only in a space they may add to.
  const permissions = usePermissions(workspaceId)
  const creatable = useCreatable(workspaceId)
  const typesForSpace = (spaceId: string) => SPACE_CREATE_TYPES.filter((type) => creatable(type, spaceId))
  // §5 ClickApps — hide nav entries for features a workspace admin turned off.
  const { featureEnabled } = useResolvedFlags(workspaceId)
  // Whatever the user chose to move — drives the shared Move picker below.
  const [moveItem, setMoveItem] = useState<
    { kind: MovableKind; id: string; name: string; spaceId: string; parentId: string | null } | null
  >(null)
  // Whatever the user chose to share — one panel serves every object type.
  const [shareItem, setShareItem] = useState<{ type: ShareObjectType; id: string; name: string } | null>(null)
  const [openSwitcher, setOpenSwitcher] = useState(false)
  /*
   * §G08 `[08:37]` — finding a workspace in the switcher.
   *
   * A list is fine at three and useless at thirty, and the frames show a search
   * box above it. The filter only appears once there are enough workspaces for
   * scanning to be work, because a search box above four items is furniture.
   */
  const [switcherFilter, setSwitcherFilter] = useState('')
  const collapsed = useSidebarStore((state) => state.collapsed)
  const toggleCollapsed = useSidebarStore((state) => state.toggle)

  /*
   * §1.3 — Ctrl/⌘ + \ collapses the sidebar.
   *
   * "kyunke yeh SPACE leta hai, aur jab hum kaam kar rahe hote hain to it's
   * kind of frustrating" `[10:46]`. Somebody reclaiming the width mid-task is
   * doing it *because* they are mid-task, and making them find a button with
   * the mouse is the part that interrupts. Same chord every editor uses for
   * the same thing.
   *
   * Not while typing: `\` is a character, and a sidebar that collapses because
   * somebody wrote a Windows path into a task title is worse than no shortcut.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '\\' || !(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      toggleCollapsed()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  /*
   * §V2-13, frame `09:10` — the shortcut is printed beside the button, so it
   * is part of the ask rather than a flourish.
   *
   * Guarded the same way as Cmd+\ above: Ctrl+Z inside a text box means undo
   * the typing, and stealing it there would be worse than not having it. It
   * also only swallows the keystroke when there was actually something to undo.
   */
  useEffect(() => {
    const onUndoKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || !(event.metaKey || event.ctrlKey) || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (undoLastDelete()) event.preventDefault()
    }
    window.addEventListener('keydown', onUndoKey)
    return () => window.removeEventListener('keydown', onUndoKey)
  }, [])
  const [spacesExpanded, setSpacesExpanded] = useState(true)
  const [favoritesExpanded, setFavoritesExpanded] = useState(true)
  const [browseExpanded, setBrowseExpanded] = useState(true)
  const [recentsExpanded, setRecentsExpanded] = useState(true)
  const [dockPos, setDockPos] = useState(DOCK_HOME)
  const [draggingDock, setDraggingDock] = useState(false)
  const [showDockSettings, setShowDockSettings] = useState(false)
  const [viewport, setViewport] = useState({ w: 1400, h: 900 })
  const dockRef = useRef<HTMLDivElement | null>(null)
  /**
   * The dock is `fixed` and defaults to the bottom-left corner — which is on
   * top of this sidebar, not beside it. So the last rows of the tree sat under
   * it: hidden, and worse, unclickable, because a fixed z-50 layer takes the
   * click. Closing a space near the bottom of the list and then not being able
   * to reopen it is that, not a broken toggle.
   *
   * Measured rather than assumed: the dock changes size with its orientation
   * setting, and it is `hidden xl:flex`, so below that breakpoint it has no
   * height and this correctly reserves nothing.
   */
  const [dockSize, setDockSize] = useState({ w: 0, h: 0 })
  const { organizations, workspaces, setWorkspaces } = useAuthStore()
  const qc = useQueryClient()
  const [expandedSpaces, setExpandedSpaces] = useState<Record<string, boolean>>({})
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [treeFilter, setTreeFilter] = useState('')
  // §2/§13.4 — the folder/project/list currently being renamed from the tree.
  // One shared dialog serves the whole tree; `null` means it is closed.
  const [treeEdit, setTreeEdit] = useState<
    | { kind: 'folder'; spaceId: string; id: string; name: string; description: string }
    | { kind: 'project'; id: string; name: string }
    | { kind: 'list'; id: string; name: string }
    | null
  >(null)
  const [savingEdit, setSavingEdit] = useState(false)
  // §2.3 — create-or-rename a Space directly from the sidebar tree (parity with
  // the folder/project affordances). `null` = closed; mode drives POST vs PUT.
  const [spaceDialog, setSpaceDialog] = useState<{ mode: 'create' | 'rename'; id?: string; name: string } | null>(null)
  const [savingSpace, setSavingSpace] = useState(false)
  /*
   * §V2-06 frame `08:00` — what the "+" on a space row was chosen from.
   * Carries the space as well as the kind, so the creator opens with the
   * question "which space" already answered.
   */
  const [spaceCreate, setSpaceCreate] = useState<{ spaceId: string; kind: CreateKind } | null>(null)
  // §2.2 — create a new Workspace under the caller's existing org from the
  // switcher (instead of bouncing to the full sign-up/registration flow).
  const [wsDialogOpen, setWsDialogOpen] = useState(false)
  const [savingWs, setSavingWs] = useState(false)

  /*
   * §V2-S12 `[08:23]` — *"[Kuch] cheezein folder mein MOVE kar sakti hoon —
   * DRAG AND DROP ka option hai."* Named outright, and frames `08:35` / `08:55`
   * are the result: the tree and the breadcrumb both read
   * `rundesk › ruruuu (folder) › List`.
   *
   * THE DESTINATION LOGIC AND THE ENDPOINTS ALREADY EXISTED — `move-dialog.tsx`
   * flattens the same tree into rows and posts to the same three routes. What
   * did not exist was the gesture: `draggable`, `onDragStart`, `onDrop`,
   * `DndContext` — none of them appeared anywhere in this file. The list route
   * has dnd-kit for the board and HTML5 drag for the calendar; the sidebar had
   * neither.
   *
   * HTML5 drag, not dnd-kit, because the tree is a scrolling column of links
   * and a pointer-sensor library would have to take over their click handling
   * to tell a drag from a navigation.
   *
   * WHAT MOVES WHERE follows the model, not the picture. Rundesk's `folderId`
   * lives on `projects`, so a folder groups projects and a project owns lists:
   *   · project → folder   `POST /projects/:id/move { spaceId, folderId }`
   *   · project → space    the same route with `folderId: null` — the reverse
   *     gesture, so this is not a one-way trip into a folder
   *   · list → project     `POST /lists/:id/move { projectId }`
   * Dragging the project that owns a list into a folder produces exactly the
   * frame's `space › folder › project › list`.
   */
  /*
   * Exactly what the drop reads, and nothing else. It carried `name` and
   * `parentId` too; `parentId` was the stale value described under `canDropOn`,
   * and once that stopped being consulted both were values written on every
   * drag that no reader honoured.
   */
  type DragPayload = { kind: 'project' | 'list' | 'folder'; id: string }
  const [dragItem, setDragItem] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  /**
   * Can what is being dragged LIVE at this target?
   *
   * A project belongs in a folder or directly under a space; a list belongs in
   * a project. That is the whole rule, and it is deliberately not joined to
   * "…and it is not already there".
   *
   * IT USED TO ASK THAT SECOND QUESTION, and it made the gesture one-way. The
   * only answer available is `dragItem.parentId`, taken from the tree payload's
   * `folderId` — and the tree is a refetch behind the move that just happened,
   * because `dropOn` invalidates the queries AFTER the server has already
   * written the row. So on the drag straight back out:
   *
   *   · into a folder  — `parentId !== target.id` is `null !== <uuid>`, true,
   *     and the drop landed whether or not the client was up to date;
   *   · back to the space — `parentId !== null` is `null !== null`, FALSE, and
   *     the drop was refused for a project that really was in a folder.
   *
   * One stale value, and only the second direction could ever notice it. A drop
   * that lands where the item already is now sends an idempotent move, which is
   * a great deal better than a gesture that silently does nothing because the
   * client is one request behind the truth.
   */
  const canDropOn = (target: { kind: 'folder' | 'space' | 'project'; id: string }) => {
    if (!dragItem) return false
    if (dragItem.kind === 'project') return target.kind === 'folder' || target.kind === 'space'
    if (dragItem.kind === 'list') return target.kind === 'project'
    /*
     * A FOLDER HAS NOWHERE ELSE TO LIVE. It is draggable only so it can be
     * reordered among its siblings (the gaps below), and Rundesk has no route
     * that moves one between spaces.
     *
     * Written as an explicit `false` rather than left to fall through the
     * `list` branch, which is what it used to do the moment `folder` joined
     * this union: `return target.kind === 'project'` would have accepted a
     * folder dropped on a project, and `dropOn`'s else-branch would then have
     * posted it to `/lists/<folderId>/move`. A 404 on a route that does exist,
     * for an id that is not a list.
     */
    return false
  }

  /*
   * §V2-S13 `| M | Sidebar: drag-reorder …` — the OTHER gesture.
   *
   * Dropping ON a row asks "put this inside that" and is the move above.
   * Dropping BETWEEN two rows asks "put this here in the order", which is a
   * different question with a different write — `position`, not `folderId` —
   * so it gets its own targets: a thin strip rendered between siblings, armed
   * only while something of the right kind is in flight.
   *
   * THE PREDICATE ASKS ABOUT THE KIND AND NOTHING ELSE, which is the lesson
   * `canDropOn` above is written out at length for. "Is this item already a
   * sibling of this container" is answerable only from tree data that is a
   * refetch behind every move, and the version of this that asked it refused
   * the drop from the client and sent no request at all. So the gap accepts
   * any project at a project gap, and `dropAtGap` deals with where it came
   * from by MOVING it first — a gesture that lands rather than one that
   * quietly does nothing because the browser is one request behind.
   */
  type Gap = {
    itemKind: 'project' | 'list' | 'folder'
    containerKind: 'space' | 'folder' | 'project'
    containerId: string
    /** The space the container belongs to — needed by `/projects/:id/move`. */
    spaceId: string
    /** Where in the container's current sibling list the item should land. */
    index: number
    /** The sibling ids as this render drew them, in the order it drew them. */
    siblingIds: string[]
  }
  const gapId = (gap: Pick<Gap, 'itemKind' | 'containerId' | 'index'>) =>
    `tree-gap-${gap.itemKind}-${gap.containerId}-${gap.index}`
  const canDropAtGap = (gap: Pick<Gap, 'itemKind'>) => !!dragItem && dragItem.kind === gap.itemKind

  const reorderSiblings = async (
    kind: 'project' | 'list' | 'folder',
    gap: Pick<Gap, 'containerKind' | 'containerId'>,
    orderedIds: string[],
  ) => {
    if (kind === 'list') {
      /*
       * Lists keep the route they already had. `POST /lists/project/:id/reorder`
       * writes `lists.position` and `getListsByProject` orders by it — the
       * project shell page has used both since it was written. A second writer
       * for one column is the duplicated-logic defect, so the sidebar borrows
       * the existing one rather than routing lists through the new endpoint.
       */
      await api(`/lists/project/${gap.containerId}/reorder`, { method: 'POST', body: { orderedIds } })
      return
    }
    await api(`/workspaces/${workspaceId}/sidebar/reorder`, {
      method: 'POST',
      body: {
        kind,
        containerKind: gap.containerKind as 'space' | 'folder',
        containerId: gap.containerId,
        orderedIds,
      },
    })
  }

  const dropAtGap = async (gap: Gap) => {
    const item = dragItem
    setDragItem(null)
    setDropTarget(null)
    if (!item || !canDropAtGap(gap)) return
    try {
      const current = gap.siblingIds
      if (!current.includes(item.id)) {
        /*
         * It came from somewhere else. Move it in FIRST, then place it — so the
         * gesture the person made ("put it here, in this position") is the
         * gesture that happens, rather than a refusal they cannot see.
         */
        if (item.kind === 'project') {
          await api(`/projects/${item.id}/move`, {
            method: 'POST',
            body:
              gap.containerKind === 'folder'
                ? { spaceId: gap.spaceId, folderId: gap.containerId }
                : { spaceId: gap.containerId, folderId: null },
          })
        } else if (item.kind === 'list') {
          await api(`/lists/${item.id}/move`, { method: 'POST', body: { projectId: gap.containerId } })
        } else {
          // No route moves a folder between spaces, and a drop that does
          // nothing in silence is the bug this whole section is about.
          toast.error(t('nav.reorderSameSpaceOnly'))
          return
        }
      }
      const without = current.filter((id) => id !== item.id)
      const next = [...without.slice(0, gap.index), item.id, ...without.slice(gap.index)]
      await reorderSiblings(item.kind, gap, next)
      /*
       * NOTHING IS REDRAWN OPTIMISTICALLY. The order on screen after this is
       * the order the server answered with, because the whole point of the
       * write is that it outlives the tab — a tree that rearranges itself and
       * tells the server nothing is the same picture as one that worked, and
       * the person only finds out on the next load.
       */
      for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'move-targets']) {
        await qc.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('nav.reordered'))
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('nav.reorderFailed'))
    }
  }

  /** The handlers every between-rows reorder strip shares. */
  const gapProps = (gap: Gap) => ({
    'data-testid': gapId(gap),
    'data-gap-kind': gap.itemKind,
    'data-gap-index': String(gap.index),
    onDragOver: (e: React.DragEvent) => {
      if (!canDropAtGap(gap)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move' as const
      const id = gapId(gap)
      if (dropTarget !== id) setDropTarget(id)
    },
    onDragLeave: () => setDropTarget((prev) => (prev === gapId(gap) ? null : prev)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      void dropAtGap(gap)
    },
    'data-drop-active': dropTarget === gapId(gap) && canDropAtGap(gap) ? 'true' : undefined,
  })

  const dropOn = async (target: { kind: 'folder' | 'space' | 'project'; id: string; spaceId: string }) => {
    const item = dragItem
    setDragItem(null)
    setDropTarget(null)
    if (!item || !canDropOn(target)) return
    try {
      if (item.kind === 'project') {
        await api(`/projects/${item.id}/move`, {
          method: 'POST',
          body:
            target.kind === 'folder'
              ? { spaceId: target.spaceId, folderId: target.id }
              : { spaceId: target.id, folderId: null },
        })
      } else {
        await api(`/lists/${item.id}/move`, { method: 'POST', body: { projectId: target.id } })
      }
      toast.success(t('move.moved'))
      // The same keys the Move dialog invalidates, for the same reason: the
      // tree, the move-target list and the per-container caches all describe
      // the arrangement that just changed.
      for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'move-targets']) {
        await qc.invalidateQueries({ queryKey: [key] })
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('move.failed'))
    }
  }

  /** The handlers every drop target in the tree shares. */
  const dropProps = (target: { kind: 'folder' | 'space' | 'project'; id: string; spaceId: string }) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canDropOn(target)) return
      // Without preventDefault the browser refuses the drop and `onDrop` never
      // fires — the commonest way an HTML5 drop target does nothing at all.
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move' as const
      if (dropTarget !== target.id) setDropTarget(target.id)
    },
    onDragLeave: () => setDropTarget((prev) => (prev === target.id ? null : prev)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      void dropOn(target)
    },
    'data-drop-active': dropTarget === target.id && canDropOn(target) ? 'true' : undefined,
  })

  /** The handlers every draggable row in the tree shares. */
  const dragProps = (item: DragPayload) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragItem(item)
      e.dataTransfer.effectAllowed = 'move' as const
      // Firefox will not start a drag without data on the transfer.
      e.dataTransfer.setData('text/plain', `${item.kind}:${item.id}`)
    },
    onDragEnd: () => {
      setDragItem(null)
      setDropTarget(null)
    },
    'data-dragging': dragItem?.id === item.id ? 'true' : undefined,
  })

  /*
   * §2.4's `createProject` stood here: a `window.prompt` behind the "+" on a
   * space row. §V2-06 frame `08:00` replaces it with the Create menu — project
   * is one of that menu's eight items, and it now goes through the same
   * creator every other type does rather than through a browser prompt that
   * could collect a name and nothing else.
   */

  // §2/§13.4 — DELETE /spaces/:spaceId/folders/:folderId removes the folder;
  // its projects fall back to the ungrouped list (they are not deleted).
  const deleteFolder = async (spaceId: string, folderId: string) => {
    try {
      await api(`/spaces/${spaceId}/folders/${folderId}`, { method: 'DELETE' })
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.deleteError'))
    }
  }

  // §2/§13.4 — DELETE /projects/:id archives the project out of the tree.
  const archiveProjectFromTree = async (projectId: string) => {
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' })
      if (workspaceId) {
        offerUndo({
          workspaceId,
          type: 'project',
          id: projectId,
          message: t('trash.projectMoved'),
          undoLabel: t('trash.undo'),
          restoredMessage: t('trash.restored'),
          failedMessage: t('trash.restoreFailed'),
          onRestored: () => qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] }),
        })
      }
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.deleteError'))
    }
  }

  // §2/§13.4 — rename the folder (PATCH), project (PUT) or list (PUT) in `treeEdit`.
  const submitTreeEdit = async (values: ContainerEditValues) => {
    if (!treeEdit) return
    setSavingEdit(true)
    try {
      if (treeEdit.kind === 'folder') {
        /*
         * §V2-S09 `08:25` — `description` goes with the name, and `?? ''` is
         * what makes CLEARING one possible: `ContainerEditValues.description`
         * is absent when the field is not enabled, and an empty string when it
         * is enabled and emptied. Sending `undefined` would leave the old text
         * in place, which is a field that can be written and never erased.
         */
        await api(`/spaces/${treeEdit.spaceId}/folders/${treeEdit.id}`, {
          method: 'PATCH',
          body: { name: values.name, description: values.description ?? '' },
        })
      } else if (treeEdit.kind === 'list') {
        await api(`/lists/${treeEdit.id}`, { method: 'PUT', body: { name: values.name } })
      } else {
        await api(`/projects/${treeEdit.id}`, { method: 'PUT', body: { name: values.name } })
      }
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      setTreeEdit(null)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.saveError'))
    } finally {
      setSavingEdit(false)
    }
  }

  // §2.5 — DELETE /lists/:id removes the list from its project.
  //
  // §V2-13 frame `09:10` — and says so, with the way back. This used to
  // succeed in silence: the list vanished from the tree and the only route
  // home was knowing that Trash is a settings tab.
  const deleteListFromTree = async (listId: string) => {
    try {
      await api(`/lists/${listId}`, { method: 'DELETE' })
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      if (workspaceId) {
        offerUndo({
          workspaceId,
          type: 'list',
          id: listId,
          message: t('trash.listMoved'),
          undoLabel: t('trash.undo'),
          restoredMessage: t('trash.restored'),
          failedMessage: t('trash.restoreFailed'),
          onRestored: () => qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] }),
        })
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.deleteError'))
    }
  }

  // §2 per-item privacy — toggle a list/folder public⇄private from the tree.
  const setListVisibility = async (listId: string, next: 'public' | 'private') => {
    try {
      await api(`/lists/${listId}`, { method: 'PUT', body: { visibility: next } })
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.saveError'))
    }
  }
  const setFolderVisibility = async (spaceId: string, folderId: string, next: 'public' | 'private') => {
    try {
      await api(`/spaces/${spaceId}/folders/${folderId}`, { method: 'PATCH', body: { visibility: next } })
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.saveError'))
    }
  }

  // §2.3 — create (POST) or rename (PUT) a space from the shared space dialog.
  const submitSpaceDialog = async (values: ContainerEditValues) => {
    if (!spaceDialog || !workspaceId) return
    setSavingSpace(true)
    try {
      {
        // §V2-06 — creating no longer comes through here. This dialog renames,
        // which is the one thing a single name field is the right shape for.
        await api(`/spaces/${spaceDialog.id}`, { method: 'PUT', body: { name: values.name } })
        await qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
        await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
        setSpaceDialog(null)
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.saveError'))
    } finally {
      setSavingSpace(false)
    }
  }

  // §2.3 — DELETE /spaces/:id archives the space; if we're viewing it, fall back
  // to the workspace home since the route no longer resolves.
  const deleteSpaceFromTree = async (spaceId: string, name: string) => {
    if (!workspaceId) return
    if (!window.confirm(t('space.deleteConfirm', { name }))) return
    try {
      await api(`/spaces/${spaceId}`, { method: 'DELETE' })
      await qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      offerUndo({
        workspaceId,
        type: 'space',
        id: spaceId,
        message: t('trash.spaceMoved'),
        undoLabel: t('trash.undo'),
        restoredMessage: t('trash.restored'),
        failedMessage: t('trash.restoreFailed'),
        onRestored: async () => {
          await qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
          await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
        },
      })
      if (pathname.startsWith(`/app/${workspaceId}/${spaceId}`)) {
        navigate({ to: '/app/$workspaceId', params: { workspaceId } })
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.deleteError'))
    }
  }

  // §2.2 — create a workspace under the caller's existing organization and add
  // it to the session so the switcher shows it immediately, then navigate in.
  const submitWorkspaceDialog = async (values: WorkspaceDraft) => {
    setSavingWs(true)
    try {
      // §7 — the flow's answers travel with the name. They are declared on
      // CreateWorkspaceDto, or the pipe's whitelist would drop them in transit
      // exactly as it dropped taskTypeId in §1.1.
      const created = await api<{ id: string }>(`/workspaces`, {
        method: 'POST',
        body: {
          name: values.name,
          ...(values.purpose ? { purpose: values.purpose } : {}),
          ...(values.comingFrom ? { comingFrom: values.comingFrom } : {}),
        },
      })
      // Re-read the membership list (now including the new workspace) and push it
      // into the auth store so the switcher + guards see it without a reload.
      const rows = await api<Array<{ workspace: { id: string; name: string; slug: string; organizationId: string }; role: string }>>(
        '/workspaces',
      )
      setWorkspaces(
        rows
          .filter((r) => r.workspace?.id)
          .map((r) => ({
            id: r.workspace.id,
            name: r.workspace.name,
            slug: r.workspace.slug,
            organizationId: r.workspace.organizationId,
            role: r.role,
          })),
      )
      setWsDialogOpen(false)
      navigate({ to: '/app/$workspaceId', params: { workspaceId: created.id } })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('nav.createWorkspaceError'))
    } finally {
      setSavingWs(false)
    }
  }
  const [recentItems, setRecentItems] = useState<Array<{ label: string; path: string }>>([])
  const [favoriteItems, setFavoriteItems] = useState<Array<{ label: string; path: string }>>([])

  /*
   * Unread per workspace, fetched only while the switcher is open.
   *
   * One grouped request rather than one per workspace: the point of the dot is
   * to help somebody choose where to go, and a menu that fires N requests as it
   * opens is slower than the decision it is meant to speed up.
   */
  const switcherUnread = useQuery({
    enabled: openSwitcher,
    queryKey: ['notifications', 'unread-by-workspace'],
    queryFn: () => api<Record<string, number>>('/notifications/unread-by-workspace'),
    staleTime: 30_000,
  })

  const storedWorkspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined
  const currentOrg = storedWorkspace ? organizations.find((o) => o.id === storedWorkspace.organizationId) : undefined

  // §A4.5 — the switcher showed a name and an org and nothing else, so it said
  // nothing about which workspace you are standing in. Both reads are already
  // served: branding for the avatar, the plan endpoint for tier + member count.
  const workspaceBrandQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<{ id: string; name: string; logoUrl?: string | null }>(`/workspaces/${workspaceId}`),
    enabled: !!workspaceId,
  })
  /*
   * The name comes from the live read first, the login payload second.
   *
   * `workspaces` is whatever the auth store was seeded with at sign-in, so a
   * workspace joined since — or simply absent from that payload — is not in it,
   * and `find` returned undefined. The header then fell back to the literal
   * words "Workspace" / "Select workspace" while standing inside a named
   * workspace, and the switcher below (which lists the same array) could not
   * offer it either, so the one escape hatch off /app/profile and /app/help
   * did not work for exactly the people who most needed it.
   *
   * The real name was already fetched and thrown away: this query types `name`
   * and only `logoUrl` was ever read from it.
   */
  const currentWorkspace = storedWorkspace ?? workspaceBrandQuery.data

  /*
   * Drop a breadcrumb on every workspace route, so a page outside the
   * workspace tree can offer a way back to the one you were actually in
   * rather than dumping you at the picker.
   */
  useEffect(() => {
    rememberWorkspace(workspaceId)
  }, [workspaceId])
  const backTo = workspaceId ? null : lastWorkspaceId()

  const workspacePlanQuery = useQuery({
    queryKey: ['workspace-plan', workspaceId],
    queryFn: () =>
      api<{ label: string; usage: { members: number } }>(`/workspaces/${workspaceId}/plan`),
    enabled: !!workspaceId,
  })

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
    enabled: !!workspaceId,
  })
  /*
   * §V2-S01 frame `06:25` — the `1` beside **Personal List**.
   *
   * The section itself was built by `3d81f04`; the count on its third row was
   * not, and a row that is one of three identical-looking links gives no reason
   * to open it. OPEN tasks, not all of them — a badge that never falls as you
   * tick things off is a number about the past.
   *
   * The same query key Home's Personal List card uses, so ticking one there
   * moves this without a second fetch or a second source of truth.
   */
  const personalTasksQuery = useQuery({
    queryKey: ['personal-tasks', workspaceId],
    queryFn: () => api<Array<{ id: string; done: boolean }>>(`/workspaces/${workspaceId}/personal-tasks`),
    enabled: !!workspaceId,
  })
  const openPersonalTasks = (personalTasksQuery.data ?? []).filter((task) => !task.done).length
  const spaceTreeQuery = useQuery({
    queryKey: ['space-tree', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string; icon?: string | null; color?: string | null }>>(
        `/spaces/workspace/${workspaceId}`,
      )
      const projectGroups = await Promise.all(
        spaces.map(async (space) => {
          /*
           * §G15-10 — a space has projects AND lists of its own.
           *
           * `spaceLists` are the ones made by choosing a Space and stopping.
           * They live in the space's hidden container, which `/projects/space`
           * deliberately never returns, so without this call they would exist,
           * be searchable, be openable by URL — and be absent from the one
           * place anybody looks for them.
           */
          const [projects, folders, spaceLists] = await Promise.all([
            api<Array<{ id: string; name: string; folderId?: string | null; position?: number; createdAt?: string }>>(
              `/projects/space/${space.id}`,
            ),
            api<Array<{ id: string; name: string; description?: string | null; visibility?: string | null }>>(
              `/spaces/${space.id}/folders`,
            ).catch(() => []),
            api<Array<{ id: string; name: string; projectId: string; visibility?: string | null }>>(
              `/lists/space/${space.id}`,
            ).catch(() => []),
          ])
          const projectsWithLists = await Promise.all(
            projects.map(async (project) => {
              const lists = await api<Array<{ id: string; name: string; visibility?: string | null }>>(`/lists/project/${project.id}`)
              return { ...project, lists }
            }),
          )
          /*
           * In the order the server keeps: `getProjectsBySpace` orders by
           * `position`, then age. The sidebar sorted for itself while that had
           * no ORDER BY, which made two statements of one order, and every
           * other surface that reads the endpoint drew whatever Postgres
           * answered (`commit-log/log-666f15f-1`).
           */
          return { ...space, projects: projectsWithLists, folders, spaceLists }
        }),
      )
      return projectGroups
    },
  })
  /*
   * Finding something in the tree without opening every space first.
   *
   * The sidebar's only text box was the workspace switcher's, and even that
   * only appears past six workspaces. The space/folder/project/list tree had
   * no filter at all: the only way to find a list was to remember which space
   * it was in and expand your way down to it.
   *
   * Two decisions worth keeping:
   *
   * 1. A space is kept when it matches *or any of its descendants do*.
   *    Matching only the top level would hide every list whose space is named
   *    something else, which is most of them — the same shape as filtering a
   *    page of results after slicing it.
   * 2. While a filter is active everything reads as expanded, but the user's
   *    own expansion state is never written to. A match inside a collapsed
   *    space would otherwise be invisible — present in the tree and impossible
   *    to see — and force-expanding for real would silently destroy the
   *    arrangement they left, which clearing the box could not put back.
   */
  const treeNeedle = treeFilter.trim().toLowerCase()
  const filtering = treeNeedle.length > 0
  const hit = (name: string) => name.toLowerCase().includes(treeNeedle)

  const visibleTree = (() => {
    const tree = spaceTreeQuery.data
    if (!tree || !filtering) return tree
    return tree
      .map((space) => {
        const spaceHit = hit(space.name)
        const projects = space.projects
          .map((project) => {
            const projectHit = spaceHit || hit(project.name)
            const lists = projectHit ? project.lists : project.lists.filter((l) => hit(l.name))
            return projectHit || lists.length > 0 ? { ...project, lists } : null
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
        const folders = spaceHit ? space.folders : space.folders.filter((f) => hit(f.name))
        return spaceHit || projects.length > 0 || folders.length > 0
          ? { ...space, projects, folders }
          : null
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
  })()

  const spaceOpen = (id: string) => filtering || !!expandedSpaces[id]
  const projectOpen = (id: string) => filtering || !!expandedProjects[id]

  const dockConfigQuery = useQuery({
    queryKey: ['user-dock-config', workspaceId],
    queryFn: () => api<any>(`/dashboards/dock/${workspaceId}`),
    enabled: !!workspaceId,
  })
  // Inbox unread badge (Plan §6.12) — this workspace's, as its Inbox is. The
  // same hook as the topbar bell, so the two share one fetch and one cache.
  const unreadCountQuery = useUnreadCount({ workspaceId }, { refetchInterval: 30000, enabled: !!workspaceId })
  const unreadCount = unreadCountQuery.data?.count ?? 0
  const { t } = useTranslation()
  // Localize the fixed set of app-defined nav/recent labels for display, while the
  // stored label stays English (a stable id for icon lookup + persistence). User
  // data (pinned entity names) is never routed through here.
  const navLabel = (label: string): string => {
    switch (label) {
      case 'Home': return t('nav.home')
      case 'Inbox': return t('nav.inbox')
      case 'Replies': return t('nav.replies')
      case 'Teams': return t('nav.teams')
      case 'Docs': return t('nav.docs')
      case 'Dashboards': return t('nav.dashboards')
      case 'AI': return t('nav.ai')
      case 'Skills': return t('nav.skills')
      case 'Meetings': return t('nav.meetings')
      case 'Shared with me': return t('nav.sharedWithMe')
      case 'Whiteboards': return t('nav.whiteboards')
      case 'Forms': return t('nav.forms')
      case 'Automations': return t('nav.automations')
      case 'Workload': return t('nav.workload')
      case 'Timeline': return t('nav.timeline')
      case 'Templates': return t('nav.templates')
      case 'Integrations': return t('nav.integrations')
      case 'Goals': return t('nav.goals')
      case 'Sprints': return t('nav.sprints')
      case 'Reports': return t('nav.reports')
      case 'Time': return t('nav.time')
      case 'Mind maps': return t('nav.mindMaps')
      case 'Clips': return t('nav.clips')
      case 'Settings': return t('nav.settings')
      case 'Task list': return t('nav.taskList')
      case 'Project': return t('nav.project')
      case 'Space': return t('nav.space')
      default: return label
    }
  }
  // Durable pinned items (spaces/lists/tasks/docs/channels) — Plan §2.
  const { data: pinnedItems = [] } = useFavorites(workspaceId)
  const unpinFavorite = useToggleFavorite(workspaceId)
  const [pinnedExpanded, setPinnedExpanded] = useState(true)
  const appearance = dockConfigQuery.data?.appearance ?? {
    size: 'md',
    opacity: 0.9,
    orientation: 'horizontal',
  }
  /*
   * G07-7 — what the dock carries, and what it is allowed to offer.
   *
   * `pinnedLinks` is stored per user per workspace and had never been written
   * to by anything. An absent value means "never chosen", which is not the
   * same as "chose nothing": the first falls back to the default set, and the
   * second is an empty dock somebody asked for.
   *
   * The offerable list is filtered by feature flag and role first, so the
   * picker can never show a tool this workspace does not have — and a stored
   * id that has since been switched off simply stops appearing rather than
   * rendering a link to a 404.
   */
  const offerableTools = DOCKABLE_TOOLS.filter(
    (tool) => (!tool.flag || featureEnabled(tool.flag)) && (!tool.adminOnly || isAdmin),
  )
  const storedDockTools: string[] | null = Array.isArray(dockConfigQuery.data?.pinnedLinks)
    ? (dockConfigQuery.data.pinnedLinks as unknown[]).map(String)
    : null
  const chosenDockTools = storedDockTools ?? DEFAULT_DOCK_TOOLS
  const dockTools = offerableTools.filter((tool) => chosenDockTools.includes(tool.id))

  // Keep dockSize honest as the dock resizes, the orientation setting changes,
  // or the xl breakpoint takes it away entirely (display:none reports 0, which
  // is exactly the reservation we want then).
  useEffect(() => {
    const el = dockRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      setDockSize({ w: 0, h: 0 })
      return
    }
    const measure = () => setDockSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [workspaceId, appearance.orientation, appearance.size, collapsed])

  /**
   * How much room the tree must leave at the bottom so no row ends up under the
   * dock. Only when the dock is actually over the sidebar — drag it out to the
   * canvas and the sidebar gets its full height back.
   */
  const sidebarWidth = collapsed ? 72 : 288
  const dockOverlapsSidebar = dockSize.h > 0 && dockPos.x < sidebarWidth
  const listPadBottom = dockOverlapsSidebar ? dockPos.y + dockSize.h + 12 : 0
  const updateDockConfig = async (patch: {
    appearance?: { size?: string; opacity?: number; orientation?: string }
    /** G07-7 — which tools the dock carries. Stored per user, per workspace. */
    pinnedLinks?: string[]
    /** G04-7 / G07-6 — the sidebar arrangement, on the account not the browser. */
    navFavorites?: Array<{ label: string; path: string }>
    navRecents?: NavRecent[]
  }) => {
    if (!workspaceId) return
    await api(`/dashboards/dock/${workspaceId}`, {
      method: 'POST',
      body: patch,
    })
    await dockConfigQuery.refetch()
  }

  useEffect(() => {
    const sync = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  /*
   * G04-7 [05:29] / G07-6 [08:26–08:31] — the arrangement follows the person.
   *
   * The order matters, and each branch is a different answer:
   *
   *   1. the server has a list        → use it, whatever it is (including empty)
   *   2. this browser has an old one  → adopt it AND write it up, once, so a
   *                                     user who arranged their sidebar before
   *                                     this shipped does not lose it
   *   3. neither                      → the defaults
   *
   * Null and `[]` are deliberately different on the way in: "never arranged
   * it" earns the defaults and "arranged it to be empty" does not.
   */
  useEffect(() => {
    if (!workspaceId || dockConfigQuery.isPending) return
    const stored = dockConfigQuery.data?.navFavorites
    if (Array.isArray(stored)) {
      setFavoriteItems(stored.slice(0, 12))
      return
    }
    const key = `rundesk.navFavorites.${workspaceId}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ label: string; path: string }>
        if (Array.isArray(parsed)) {
          const adopted = parsed.slice(0, 12)
          setFavoriteItems(adopted)
          void updateDockConfig({ navFavorites: adopted })
          // Removed so the migration cannot run twice and resurrect a list the
          // user has since changed on another machine.
          localStorage.removeItem(key)
          return
        }
      }
    } catch {
      // ignore invalid favorites payload
    }
    // sensible defaults until user customizes
    setFavoriteItems([
      { label: 'Inbox', path: `/app/${workspaceId}/inbox` },
      { label: 'Teams', path: `/app/${workspaceId}/chat` },
      { label: 'Docs', path: `/app/${workspaceId}/docs` },
      { label: 'Dashboards', path: `/app/${workspaceId}/dashboard` },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, dockConfigQuery.isPending, dockConfigQuery.data?.navFavorites])

  /*
   * G04-7 / G07-6 — every write goes to the account.
   *
   * Optimistic on screen and persisted behind it: waiting on a round trip to
   * move a favourite up one place would make the arrows feel broken. A failed
   * write costs the arrangement, never the session, and the next load reads
   * whatever the server actually holds.
   */
  const persistFavorites = (next: Array<{ label: string; path: string }>) => {
    if (!workspaceId) return
    void updateDockConfig({ navFavorites: next })
  }
  /**
   * G07-6 — the star props for a Browse row, in one place.
   *
   * The label is the stable English string the nav stores (`navLabel` handles
   * display), so a favourite made in one locale still resolves in another.
   */
  const favoriteProps = (label: string, path: string) => ({
    on: favoriteItems.some((f) => pathsEqual(f.path, path)),
    onToggle: () => toggleFavorite({ label, path }),
    addLabel: t('nav.addFavorite'),
    removeLabel: t('nav.removeFavorite'),
  })
  const toggleFavorite = (item: { label: string; path: string }) => {
    if (!workspaceId) return
    setFavoriteItems((prev) => {
      const exists = prev.some((f) => pathsEqual(f.path, item.path))
      const next = exists
        ? prev.filter((f) => !pathsEqual(f.path, item.path))
        : [item, ...prev.filter((f) => !pathsEqual(f.path, item.path))].slice(0, 12)
      persistFavorites(next)
      return next
    })
  }
  const moveFavorite = (index: number, dir: -1 | 1) => {
    setFavoriteItems((prev) => {
      const nextIndex = index + dir
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      persistFavorites(next)
      return next
    })
  }
  const removeFavorite = (path: string) => {
    setFavoriteItems((prev) => {
      const next = prev.filter((f) => f.path !== path)
      persistFavorites(next)
      return next
    })
  }

  /* G04-7 — recents, read from the account, migrating any local list once. */
  useEffect(() => {
    if (!workspaceId || dockConfigQuery.isPending) return
    const stored = dockConfigQuery.data?.navRecents
    if (Array.isArray(stored)) {
      setRecentItems(stored.slice(0, 8))
      return
    }
    const storageKey = `rundesk.navRecents.${workspaceId}`
    try {
      const raw = localStorage.getItem(storageKey) ?? localStorage.getItem('rundesk.navRecents')
      if (!raw) return
      const parsed = JSON.parse(raw) as NavRecent[]
      if (!Array.isArray(parsed)) return
      const deduped = parsed
        .filter((item, index, arr) => arr.findIndex((other) => pathsEqual(other.path, item.path)) === index)
        .slice(0, 8)
      setRecentItems(deduped)
      void updateDockConfig({ navRecents: deduped })
      localStorage.removeItem(storageKey)
    } catch {
      // ignore invalid cached nav recents
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, dockConfigQuery.isPending, dockConfigQuery.data?.navRecents])

  /*
   * G04-7 — recents change on every navigation, so the write is coalesced.
   *
   * On screen immediately; persisted 2s after the last move. Somebody clicking
   * through four pages should cost one write, not four — and unlike favourites
   * this list is a side effect of moving around rather than something the user
   * asked for, so it must never be the reason the app feels busy.
   */
  const recentsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!workspaceId) return
    const hit = recentFromPathname(pathname, workspaceId)
    if (!hit) return
    setRecentItems((prev) => {
      const next = [hit, ...prev.filter((item) => !pathsEqual(item.path, hit.path))].slice(0, 8)
      if (recentsSaveRef.current) clearTimeout(recentsSaveRef.current)
      recentsSaveRef.current = setTimeout(() => void updateDockConfig({ navRecents: next }), 2000)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, workspaceId])

  // A pending write must not outlive the sidebar, or it fires against a
  // workspace the user has already left.
  useEffect(() => () => {
    if (recentsSaveRef.current) clearTimeout(recentsSaveRef.current)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('rundesk.floatingDockPos')
      if (!raw) return
      const parsed = JSON.parse(raw) as { x?: number; y?: number }
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        setDockPos({ x: Number(parsed.x), y: Number(parsed.y) })
      }
    } catch {
      // ignore corrupted local storage payloads
    }
  }, [])

  /*
   * "Reset dock position", from the avatar menu.
   *
   * The menu item has been dispatching `rundesk:reset-dock` since it shipped
   * and NOTHING has ever listened for it — so the one escape hatch for a dock
   * dragged off-screen did nothing, silently, which is worse than not offering
   * it. The stored position is cleared as well as the state, or the next load
   * would put it straight back where it was.
   */
  useEffect(() => {
    const onReset = () => {
      setDockPos(DOCK_HOME)
      try {
        localStorage.removeItem('rundesk.floatingDockPos')
      } catch {
        // A browser refusing storage is not a reason to leave the dock lost.
      }
    }
    window.addEventListener('rundesk:reset-dock', onReset)
    return () => window.removeEventListener('rundesk:reset-dock', onReset)
  }, [])

  // §1.3 — "agar main is ko off karoon to mujhe bas ICONS show hon — kyunke yeh
  // SPACE leta hai." Collapsed is a genuinely different sidebar rather than the
  // same one squeezed: the tree, the switcher and the section headers have no
  // useful icon-only form, so the rail carries the destinations and nothing
  // else, and the page gets the other 232px.
  // The rail and the full sidebar are one tree, not two returns. As an early
  // return the collapsed branch never reached the floating dock further down —
  // so collapsing silently deleted the quick-nav pill and its settings gear,
  // with no way to get either back short of expanding again.
  const railBody = (
    <>
        <div className="border-b border-border/60 p-2 flex justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={t('nav.expandSidebar')}
                aria-expanded={false}
                data-testid="sidebar-toggle"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('nav.expandSidebar')} · {SIDEBAR_CHORD}</TooltipContent>
          </Tooltip>
        </div>
        {/* min-h-0 is what makes overflow-y-auto real here: without it the flex
            children shrink to fit and 19 icons squash instead of scrolling, so
            the rail silently loses the bottom of the list on a short window. */}
        <nav
          className="flex-1 min-h-0 overflow-y-auto scrollbar-none px-1.5 py-2 flex flex-col items-center gap-0.5"
          style={{ paddingBottom: listPadBottom + 8 }}
        >
          {workspaceId
            ? railEntries(workspaceId, featureEnabled, isAdmin, permissions.can('report.view.basic') === true).map((entry) => {
                  const Icon = entry.icon
                  const active = isNavPathActive(pathname, entry.path, entry.exact)
                  return (
                    <Tooltip key={entry.path}>
                      <TooltipTrigger asChild>
                        <Link
                          to={entry.path}
                          aria-current={active ? 'page' : undefined}
                          data-testid={`rail-${entry.path.split('/').pop()}`}
                          className={cn(
                            'flex w-full shrink-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 transition-colors',
                            active
                              ? 'bg-accent/15 text-foreground'
                              : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {/*
                            §1.3 — "sirf ICONS show hon" was about the wide
                            sidebar eating space, not about hiding what the
                            icons are. The thing she was pointing at when she
                            said it — "yeh NAVIGATION hai IN KI" — labels every
                            icon in its app bar, and without that the rail is a
                            column of pictograms you have to hover to read.
                            Small enough to keep the rail a rail.
                          */}
                          <span className="w-full truncate text-center text-[9px] leading-tight">
                            {navLabel(entry.label)}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      {/* Still worth having: a long label truncates. */}
                      <TooltipContent side="right">{navLabel(entry.label)}</TooltipContent>
                    </Tooltip>
                  )
                })
            : null}
        </nav>
    </>
  )

  return (
    <aside
      data-testid={drawer ? 'workspace-sidebar-drawer' : 'workspace-sidebar'}
      data-collapsed={collapsed ? 'true' : 'false'}
      /*
       * `hidden lg:flex` is right for the docked column and wrong for the
       * drawer — the drawer only ever renders BELOW that breakpoint, so
       * inheriting the hide left the phone with no navigation at all. Any tap
       * inside it closes the drawer, because a nav that stays open over the
       * page it just navigated to is its own dead end.
       */
      onClick={drawer ? onNavigate : undefined}
      className={cn(
        'border-r border-border/60 bg-card/40 backdrop-blur-md h-screen shrink-0 overflow-hidden min-h-0',
        drawer ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
        collapsed && !drawer ? 'w-[72px]' : 'w-72',
      )}
    >
      {/* A drawer is opened deliberately and has the whole screen; showing the
          72px icon rail inside it would be the worst of both. */}
      {collapsed && !drawer && railBody}
      {(!collapsed || drawer) && (
      <>
      <div className="border-b border-border/60 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t('nav.collapseSidebar')}
            aria-expanded
            data-testid="sidebar-toggle"
            title={`${t('nav.collapseSidebar')} · ${SIDEBAR_CHORD}`}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <button
          className="w-full rounded-lg border border-border/60 bg-card px-3 py-2 text-left hover:bg-accent/10 transition-colors"
          data-testid="workspace-switcher"
          aria-expanded={openSwitcher}
          onClick={() => setOpenSwitcher((v) => !v)}
        >
          <div className="flex items-center gap-2.5">
            {workspaceBrandQuery.data?.logoUrl ? (
              <img
                src={workspaceBrandQuery.data.logoUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-gradient-soft text-sm font-semibold text-white">
                {(currentWorkspace?.name ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{currentWorkspace?.name ?? t('common.workspace')}</p>
              {/* "Select workspace" is an instruction, and it is only honest
                  when you are not in one. The organisation is read from the
                  auth store, so inside a workspace whose org the login payload
                  did not carry this line used to tell you to pick a workspace
                  while you were standing in one. Unknown org: say nothing —
                  the plan line below already identifies where you are. */}
              {currentOrg?.name ? (
                <p className="truncate text-xs text-muted-foreground">{currentOrg.name}</p>
              ) : !workspaceId ? (
                <p className="truncate text-xs text-muted-foreground">{t('nav.selectWorkspace')}</p>
              ) : null}
              {/* Guarded field by field: this renders inside the sidebar, which
                  is inside the app shell, so a plan payload missing `usage`
                  took the whole application down to the error boundary rather
                  than dropping one line of small print. */}
              {workspacePlanQuery.data?.usage?.members !== undefined && (
                <p className="truncate text-[10px] text-muted-foreground/80">
                  {t('nav.workspacePlanLine', {
                    plan: workspacePlanQuery.data.label,
                    members: workspacePlanQuery.data.usage.members,
                  })}
                </p>
              )}
            </div>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', openSwitcher && 'rotate-180')} />
          </div>
        </button>
        {workspaceId && isAdmin && (
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => navigate({ to: '/app/$workspaceId/settings', params: { workspaceId } })}
            >
              <Settings className="h-3.5 w-3.5 mr-1" />
              {t('nav.workspaceSettingsShortcut')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() =>
                navigate({
                  to: '/app/$workspaceId/settings',
                  params: { workspaceId },
                  search: { tab: 'members' },
                })
              }
            >
              <Users className="h-3.5 w-3.5 mr-1" />
              {t('nav.workspacePeopleShortcut')}
            </Button>
          </div>
        )}
        {openSwitcher && (
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border/60 bg-card p-1">
            {/* Only once scanning the list is actually work. */}
            {workspaces.length > 5 && (
              <input
                autoFocus
                value={switcherFilter}
                onChange={(e) => setSwitcherFilter(e.target.value)}
                placeholder={t('nav.findWorkspace')}
                data-testid="switcher-filter"
                className="mb-1 w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-accent"
              />
            )}
            {organizations.map((org) => {
              const needle = switcherFilter.trim().toLowerCase()
              const orgWorkspaces = workspaces.filter(
                (w) =>
                  w.organizationId === org.id &&
                  (!needle || w.name.toLowerCase().includes(needle)),
              )
              // An organisation whose workspaces all filtered out should not
              // leave its heading behind as a row that explains nothing.
              if (orgWorkspaces.length === 0) return null
              return (
                <div key={org.id} className="mb-1 last:mb-0">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{org.name}</div>
                  {orgWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/10 flex items-center gap-2',
                        ws.id === workspaceId && 'bg-accent/15 text-foreground',
                      )}
                      onClick={() => {
                        setOpenSwitcher(false)
                        setSwitcherFilter('')
                        navigate({ to: '/app/$workspaceId', params: { workspaceId: ws.id } })
                      }}
                    >
                      {/* An initial, not an image: workspaces have no avatar of
                          their own, and a coloured letter is still something to
                          aim at in a list of similar names. */}
                      <span
                        aria-hidden
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-gradient text-[10px] font-semibold text-white"
                      >
                        {ws.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate flex-1">{ws.name}</span>
                      {(switcherUnread.data?.[ws.id] ?? 0) > 0 && (
                        <span
                          data-testid={`switcher-unread-${ws.id}`}
                          aria-label={t('nav.workspaceUnread', {
                            count: switcherUnread.data?.[ws.id] ?? 0,
                          })}
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        />
                      )}
                      {ws.id === workspaceId && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  ))}
                </div>
              )
            })}
            {/* §7 — a guest cannot create one, so do not offer a button that
                will come back 403. Everyone else can: "baaqi sab create kar
                sakte hain" [09:26]. */}
            {canCreateWorkspace && (
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-1"
                data-testid="new-workspace"
                onClick={() => {
                  setOpenSwitcher(false)
                  setWsDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('nav.newWorkspace')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        // Room for the floating dock, so the last rows can scroll clear of it
        // rather than sitting underneath a layer that eats their clicks.
        style={{ paddingBottom: listPadBottom }}
        data-testid="sidebar-tree"
      >
        {workspaceId && (
          <div className="p-2 space-y-2">
          <NavLink to="/app/$workspaceId" params={{ workspaceId }} icon={Home} label={t('nav.home')} />

          {/*
            §G15 [21:22] — "MY TASKS … ASSIGNED TO ME, TODAY, aur PERSONAL LIST",
            and she reaches the same three from her profile.

            All three existed as buttons inside Home's left card, driven by
            component state: there was no address for "my tasks", so a task you
            had just made had nowhere you could go and look for it. These are
            links now, and each one is a URL you can bookmark or send.
          */}
          <div className="pt-1" data-testid="sidebar-my-tasks">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t('appWorkspace.myTasks')}
            </div>
            <MyTasksLink workspaceId={workspaceId} section="assigned-to-me" icon={CircleCheck} label={t('appWorkspace.assignedToMe')} />
            <MyTasksLink workspaceId={workspaceId} section="today-overdue" icon={CalendarClock} label={t('appWorkspace.todayOverdue')} />
            <MyTasksLink workspaceId={workspaceId} section="personal-list" icon={ListChecks} label={t('appWorkspace.personalList')} badge={openPersonalTasks} />
          </div>

          <div className="pt-1">
            <button
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
              onClick={() => setFavoritesExpanded((v) => !v)}
            >
              <span>{t('nav.favorites')}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', favoritesExpanded && 'rotate-180')} />
            </button>
            {favoritesExpanded && (
              <div className="space-y-1" data-testid="nav-favorites-list">
                {favoriteItems.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">{t('nav.noFavorites')}</div>
                ) : (
                  favoriteItems.map((item, idx) => {
                    const Icon = navIconForLabel(item.label)
                    const favoriteActive = isNavPathActive(
                      pathname,
                      item.path,
                      pathsEqual(item.path, `/app/${workspaceId}`),
                    )
                    return (
                      <div key={item.path} className="group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/10">
                        <Link
                          to={item.path as any}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-1 py-1 text-[13px] flex-1 min-w-0',
                            favoriteActive
                              ? 'bg-accent/15 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">{navLabel(item.label)}</span>
                          {item.path.endsWith('/inbox') && unreadCount > 0 && (
                            <span
                              data-testid="sidebar-inbox-unread"
                              className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-gradient text-white text-[10px] font-semibold flex items-center justify-center tabular-nums"
                              title={t('nav.unreadNotifications', { count: unreadCount })}
                              aria-label={t('nav.unreadNotifications', { count: unreadCount })}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </Link>
                        <button
                          className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/15 opacity-0 group-hover:opacity-100"
                          onClick={() => moveFavorite(idx, -1)}
                          title={t('nav.moveUp')}
                        >
                          <ArrowUp className="h-3.5 w-3.5 mx-auto" />
                        </button>
                        <button
                          className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/15 opacity-0 group-hover:opacity-100"
                          onClick={() => moveFavorite(idx, 1)}
                          title={t('nav.moveDown')}
                        >
                          <ArrowDown className="h-3.5 w-3.5 mx-auto" />
                        </button>
                        <button
                          className="h-6 w-6 rounded text-muted-foreground hover:text-rose-500 hover:bg-accent/15 opacity-0 group-hover:opacity-100"
                          onClick={() => removeFavorite(item.path)}
                          title={t('nav.removeFavorite')}
                        >
                          <X className="h-3.5 w-3.5 mx-auto" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
              onClick={() => setPinnedExpanded((v) => !v)}
            >
              <span>{t('nav.pinned')}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', pinnedExpanded && 'rotate-180')} />
            </button>
            {pinnedExpanded && (
              <div className="space-y-1">
                {pinnedItems.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    {t('nav.noPinned')}
                  </div>
                ) : (
                  pinnedItems.map((item) => {
                    const Icon = pinnedIcon(item.entityType)
                    const active = isNavPathActive(pathname, item.url, false)
                    return (
                      <div key={item.id} className="group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/10">
                        <Link
                          to={item.url as any}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-1 py-1 text-[13px] flex-1 min-w-0',
                            active
                              ? 'bg-accent/15 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">{item.label}</span>
                        </Link>
                        <button
                          className="h-6 w-6 rounded text-amber-400 hover:text-amber-500 hover:bg-accent/15 opacity-0 group-hover:opacity-100"
                          onClick={() => unpinFavorite.mutate({ entityType: item.entityType, entityId: item.entityId })}
                          title={t('nav.unpin')}
                        >
                          <Star className="h-3.5 w-3.5 mx-auto fill-amber-400" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
              onClick={() => setRecentsExpanded((v) => !v)}
            >
              <span>{t('nav.recents')}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', recentsExpanded && 'rotate-180')} />
            </button>
            {recentsExpanded && (
              <div className="space-y-1">
                {recentItems.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">{t('nav.noRecents')}</div>
                ) : (
                  recentItems.map((item) => {
                    const recentActive = isNavPathActive(
                      pathname,
                      item.path,
                      pathsEqual(item.path, `/app/${workspaceId}`),
                    )
                    return (
                    <div key={item.path} className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/10">
                      <Link
                        to={item.path as any}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-1 py-1 text-[13px] flex-1 min-w-0',
                          recentActive
                            ? 'bg-accent/15 text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{navLabel(item.label)}</span>
                      </Link>
                      <button
                        className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/15 flex items-center justify-center"
                        onClick={() => toggleFavorite(item)}
                        title={favoriteItems.some((f) => pathsEqual(f.path, item.path)) ? t('nav.removeFavorite') : t('nav.addFavorite')}
                      >
                        <Star className={cn('h-3.5 w-3.5', favoriteItems.some((f) => pathsEqual(f.path, item.path)) && 'text-amber-400')} />
                      </button>
                    </div>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
              onClick={() => setBrowseExpanded((v) => !v)}
            >
              <span>{t('nav.browse')}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', browseExpanded && 'rotate-180')} />
            </button>
            {browseExpanded && (
              <div className="space-y-1">
                {/*
                  G12-7 — the Replies page shipped and was reachable ONLY from
                  the command palette, so a reply you were notified about had
                  nowhere you could go and look for it. In her sidebar Replies
                  sits just before Skills and Meetings [17:38], which is here.
                  Adding it to workspaceNavEntries was not enough on its own:
                  that list drives label lookup and the collapsed rail, while
                  the expanded column is these hand-written links.
                */}
                <NavLink to={"/app/$workspaceId/replies" as any} params={{ workspaceId }} icon={Reply} label={t('nav.replies')} compact favorite={favoriteProps('Replies', `/app/${workspaceId}/replies`)} />
                {featureEnabled(FLAGS.AI) && (
                  <NavLink to="/app/$workspaceId/ai" params={{ workspaceId }} icon={Bot} label={t('nav.ai')} compact favorite={favoriteProps('AI', `/app/${workspaceId}/ai`)} />
                )}
                {/* §15 — "Skills" sits next to AI, as it does in her sidebar
                    between Replies and Meetings [17:38]. */}
                {featureEnabled(FLAGS.AI) && (
                  <NavLink to={"/app/$workspaceId/skills" as any} params={{ workspaceId }} icon={Gem} label={t('nav.skills')} compact favorite={favoriteProps('Skills', `/app/${workspaceId}/skills`)} />
                )}
                {/* §15 — her "AI Chats" section, frames `296_1817` → `304_1907`:
                    the conversation that authored a skill is still listed after
                    the panel is closed. */}
                {/* §2.8 — "yahan pe aap ko show hongi meetings" [19:16]. Not
                    behind the AI flag: a meeting record is a record, and the
                    page is useful with the assistant switched off. */}
                <NavLink to={"/app/$workspaceId/meetings" as any} params={{ workspaceId }} icon={Video} label={t('nav.meetings')} compact favorite={favoriteProps('Meetings', `/app/${workspaceId}/meetings`)} />
                {featureEnabled(FLAGS.AI) && <AiChatsSection workspaceId={workspaceId} />}
                {/* §V2-S02 frames `00:05` / `06:25`, spoken at `[06:21]`:
                    "yahan saari chats show hoti hain — yeh group communication
                    CHANNELS, direct messages, aur spaces." Directly under AI
                    Chats, exactly as both frames stack them. */}
                {featureEnabled(FLAGS.CHAT) && <ChannelsSection workspaceId={workspaceId} />}
                {/* §V2-S07 frames `00:05` / `06:25` — "…CHANNELS, direct
                    messages, aur spaces" `[06:21]`, in that order, and both
                    frames stack Direct Messages directly under Channels. */}
                {featureEnabled(FLAGS.CHAT) && <DirectMessagesSection workspaceId={workspaceId} />}
                {/* A1.7 — without this row a privately shared list is only
                    reachable by link, since it is hidden from the tree below. */}
                <NavLink to={"/app/$workspaceId/shared" as any} params={{ workspaceId }} icon={Users} label={t('nav.sharedWithMe')} compact favorite={favoriteProps('Shared with me', `/app/${workspaceId}/shared`)} />
                <NavLink to="/app/$workspaceId/whiteboards" params={{ workspaceId }} icon={Frame} label={t('nav.whiteboards')} compact favorite={favoriteProps('Whiteboards', `/app/${workspaceId}/whiteboards`)} />
                {featureEnabled(FLAGS.FORMS) && (
                  <NavLink to="/app/$workspaceId/forms" params={{ workspaceId }} icon={ClipboardList} label={t('nav.forms')} compact favorite={favoriteProps('Forms', `/app/${workspaceId}/forms`)} />
                )}
                {featureEnabled(FLAGS.AI_AUTOMATIONS) && (
                  <NavLink to="/app/$workspaceId/automations" params={{ workspaceId }} icon={Zap} label={t('nav.automations')} compact favorite={favoriteProps('Automations', `/app/${workspaceId}/automations`)} />
                )}
                {featureEnabled(FLAGS.VIEWS_WORKLOAD) && (
                  <NavLink to="/app/$workspaceId/workload" params={{ workspaceId }} icon={BarChart3} label={t('nav.workload')} compact favorite={favoriteProps('Workload', `/app/${workspaceId}/workload`)} />
                )}
                <NavLink to="/app/$workspaceId/timeline" params={{ workspaceId }} icon={GitBranch} label={t('nav.timeline')} compact favorite={favoriteProps('Timeline', `/app/${workspaceId}/timeline`)} />
                {featureEnabled(FLAGS.GOALS) && (
                  <NavLink to={"/app/$workspaceId/goals" as any} params={{ workspaceId }} icon={ClipboardList} label={t('nav.goals')} compact favorite={favoriteProps('Goals', `/app/${workspaceId}/goals`)} />
                )}
                {featureEnabled(FLAGS.SPRINTS) && (
                  <NavLink to={"/app/$workspaceId/sprints" as any} params={{ workspaceId }} icon={Play} label={t('nav.sprints')} compact favorite={favoriteProps('Sprints', `/app/${workspaceId}/sprints`)} />
                )}
                {featureEnabled(FLAGS.REPORTING) && permissions.can('report.view.basic') === true && (
                  <NavLink to={"/app/$workspaceId/reports" as any} params={{ workspaceId }} icon={BarChart3} label={t('nav.reports')} compact favorite={favoriteProps('Reports', `/app/${workspaceId}/reports`)} />
                )}
                {featureEnabled(FLAGS.TIME_TRACKING) && (
                  <NavLink to={"/app/$workspaceId/time" as any} params={{ workspaceId }} icon={Clock3} label={t('nav.time')} compact favorite={favoriteProps('Time', `/app/${workspaceId}/time`)} />
                )}
                <NavLink to="/app/$workspaceId/templates" params={{ workspaceId }} icon={Layers} label={t('nav.templates')} compact favorite={favoriteProps('Templates', `/app/${workspaceId}/templates`)} />
                {featureEnabled(FLAGS.INTEGRATIONS) && (
                  <NavLink to="/app/$workspaceId/integrations" params={{ workspaceId }} icon={PlugZap} label={t('nav.integrations')} compact favorite={favoriteProps('Integrations', `/app/${workspaceId}/integrations`)} />
                )}
                <NavLink to={"/app/$workspaceId/mindmaps" as any} params={{ workspaceId }} icon={Frame} label={t('nav.mindMaps')} compact favorite={favoriteProps('Mind maps', `/app/${workspaceId}/mindmaps`)} />
                <NavLink to={"/app/$workspaceId/clips" as any} params={{ workspaceId }} icon={MessageCircle} label={t('nav.clips')} compact favorite={favoriteProps('Clips', `/app/${workspaceId}/clips`)} />
                {isAdmin && (
                  <NavLink to="/app/$workspaceId/settings" params={{ workspaceId }} icon={Settings} label={t('nav.settings')} compact />
                )}
              </div>
            )}
          </div>
          </div>
        )}

        {/*
          Not every /app route carries a workspace id — /app/profile and
          /app/help do not — and the whole nav above is gated on having one.
          Those pages therefore rendered an empty rail: no Home, no Inbox, no
          My Tasks, and neither page has a back link of its own. The Inbox
          settings gear links directly into /app/profile, so asking "why am I
          getting this?" cost you your place in the app and left the browser
          Back button as the only way out.

          The escape offered before this was the workspace switcher above, but
          it lists the auth store's workspaces — the same stale array that made
          the header read "Select workspace" — so on an account whose workspace
          was missing from the login payload there was no way out at all.

          Rendering the way back here rather than on each page means any route
          added outside the workspace tree gets it without anyone remembering.
        */}
        {!workspaceId && (
          <div className="p-2 space-y-1" data-testid="sidebar-no-workspace">
            {backTo ? (
              <NavLink
                to="/app/$workspaceId"
                params={{ workspaceId: backTo }}
                icon={ArrowLeft}
                label={t('nav.backToWorkspace')}
              />
            ) : null}
            {/* A plain Link, not NavLink: that component is deliberately typed
                to the workspace routes and resolves $workspaceId into the
                path. /app is the picker, and it reads the workspace list from
                the API rather than the auth store, so it is the one
                destination that is never stale. */}
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('nav.yourWorkspaces')}</span>
            </Link>
          </div>
        )}

        <div className="px-2 pt-1 pb-2 border-t border-border/60">
          <button
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
            onClick={() => setSpacesExpanded((v) => !v)}
          >
            <span>{t('nav.spaces')}</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', spacesExpanded && 'rotate-180')} />
          </button>
        </div>
        <div className="px-2 pb-3">
          {spacesExpanded && workspaceId && (
            <div className="space-y-1">
            {/*
              Rendered whatever the tree contains, unlike the workspace
              switcher's box, which only appears past six workspaces. A filter
              that hides itself until you have enough items is one nobody
              discovers, and the count at which it starts mattering is not the
              same for everybody.
            */}
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={treeFilter}
                onChange={(e) => setTreeFilter(e.target.value)}
                placeholder={t('nav.findInTree')}
                aria-label={t('nav.findInTree')}
                data-testid="tree-filter"
                className="w-full rounded-md border border-border/60 bg-background py-1 pl-7 pr-6 text-xs outline-none focus:border-accent"
              />
              {filtering && (
                <button
                  type="button"
                  onClick={() => setTreeFilter('')}
                  aria-label={t('nav.clearFilter')}
                  data-testid="tree-filter-clear"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {filtering && (visibleTree?.length ?? 0) === 0 && (
              <div
                data-testid="tree-filter-empty"
                className="px-2 py-1.5 text-[11px] text-muted-foreground"
              >
                {t('nav.findInTreeEmpty')}
              </div>
            )}
            <div className="px-2 py-1 rounded-md border border-dashed border-border/70 bg-card/40 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              {t('nav.starHint')}
            </div>
            <div className="px-2 py-1 rounded-md border border-dashed border-border/70 bg-card/40 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {t('nav.recentHint')}
            </div>
            {visibleTree?.map((space) => {
              /*
               * §V2-S13 — one reorder strip, wherever siblings are drawn.
               *
               * Four places draw an ordered row of siblings (a space's
               * projects, a folder's projects, a project's lists, a space's
               * folders) and all four get the SAME strip from here rather than
               * four hand-written copies — the ordering rule has to be one
               * fact, or the four drift and three of them are subtly wrong.
               *
               * It is 6px of nothing until a drag of the matching kind starts,
               * and it never renders while the tree filter is on: the filtered
               * tree is a subset, so `siblingIds` there would be a partial
               * order and the write would reorder a list the person cannot
               * see all of.
               */
              const renderGap = (gap: Gap) =>
                filtering ? null : (
                  <div
                    key={gapId(gap)}
                    aria-hidden
                    className={cn(
                      'h-1.5 -my-0.5 rounded transition-colors',
                      canDropAtGap(gap) && 'bg-border/40',
                      dropTarget === gapId(gap) && canDropAtGap(gap) && 'h-1.5 bg-brand-500',
                    )}
                    {...gapProps(gap)}
                  />
                )

              /*
               * §G15-10 — one list row, wherever it hangs.
               *
               * Extracted so a list that lives directly in a Space renders
               * identically to one inside a Project. Copying the row instead
               * would have given space-level lists a subtly different menu the
               * first time either was edited, which is how two things that
               * should be the same drift apart.
               */
              const renderListNode = (
                list: { id: string; name: string; visibility?: string | null },
                ownerProjectId: string,
              ) => {
                        const listPath = resolveRoutePath(
                          '/app/$workspaceId/$spaceId/$projectId/$listId',
                          {
                            workspaceId,
                            spaceId: space.id,
                            projectId: ownerProjectId,
                            listId: list.id,
                          },
                        )
                        const listActive = pathsEqual(pathname, listPath)
                        return (
                        <div
                          key={list.id}
                          className={cn(
                            'group flex items-center gap-1 rounded-md',
                            dragItem?.kind === 'list' && dragItem.id === list.id && 'opacity-50',
                          )}
                          data-testid={`tree-list-${list.id}`}
                          {...dragProps({ kind: 'list', id: list.id })}
                        >
                          <Link
                            to="/app/$workspaceId/$spaceId/$projectId/$listId"
                            params={{ workspaceId, spaceId: space.id, projectId: ownerProjectId, listId: list.id }}
                            className={cn(
                              'flex-1 min-w-0 flex items-center gap-2 rounded-md px-2 py-1 text-[12px] hover:bg-accent/10',
                              listActive
                                ? 'text-foreground font-medium bg-accent/15'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                listActive ? 'bg-brand-500' : 'bg-muted-foreground/50',
                              )}
                            />
                            <span className="truncate">{list.name}</span>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                data-testid={`list-actions-${list.id}`}
                                className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground data-[state=open]:opacity-100"
                                aria-label={t('nav.actionsFor', { name: list.name })}
                              >
                                <MoreHorizontal className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setTreeEdit({ kind: 'list', id: list.id, name: list.name })}>
                                <Pencil className="h-3.5 w-3.5" />
                                {t('container.rename')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void setListVisibility(list.id, list.visibility === 'private' ? 'public' : 'private')
                                }
                              >
                                {list.visibility === 'private' ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                {list.visibility === 'private' ? t('nav.makePublic') : t('nav.makePrivate')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setShareItem({ type: 'list', id: list.id, name: list.name })}
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                {t('share.menuAction')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setMoveItem({
                                    kind: 'list',
                                    id: list.id,
                                    name: list.name,
                                    spaceId: space.id,
                                    parentId: ownerProjectId,
                                  })
                                }
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                {t('move.action')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                data-testid={`list-delete-${list.id}`}
                                onClick={() => {
                                  if (window.confirm(t('list.deleteConfirm', { name: list.name }))) {
                                    void deleteListFromTree(list.id)
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('list.deleteAction')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        )
              }

              const renderProjectNode = (project: (typeof space.projects)[number]) => (
                <div key={project.id} className="space-y-0.5">
                  <div
                    className={cn(
                      'group flex items-center gap-1 rounded-md',
                      dragItem?.kind === 'project' && dragItem.id === project.id && 'opacity-50',
                      dropTarget === project.id &&
                        canDropOn({ kind: 'project', id: project.id }) &&
                        'ring-1 ring-brand-500 bg-accent/20',
                    )}
                    data-testid={`tree-project-${project.id}`}
                    {...dragProps({ kind: 'project', id: project.id })}
                    {...dropProps({ kind: 'project', id: project.id, spaceId: space.id })}
                  >
                    {/* Same split as the space row above, for the same reason. */}
                    <button
                      type="button"
                      onClick={() => setExpandedProjects((prev) => ({ ...prev, [project.id]: !prev[project.id] }))}
                      aria-expanded={projectOpen(project.id)}
                      aria-label={t(projectOpen(project.id) ? 'nav.collapseItem' : 'nav.expandItem', { name: project.name })}
                      data-testid={`project-toggle-${project.id}`}
                      className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10"
                    >
                      <ChevronDown
                        className={cn('h-3 w-3 transition-transform', projectOpen(project.id) && 'rotate-180')}
                      />
                    </button>
                    <Link
                      to="/app/$workspaceId/$spaceId/$projectId"
                      params={{ workspaceId, spaceId: space.id, projectId: project.id }}
                      onClick={() => setExpandedProjects((prev) => ({ ...prev, [project.id]: true }))}
                      data-testid={`project-link-${project.id}`}
                      className="flex-1 min-w-0 flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                    >
                      <span className="truncate">{project.name}</span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground data-[state=open]:opacity-100"
                          aria-label={t('nav.actionsFor', { name: project.name })}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => setTreeEdit({ kind: 'project', id: project.id, name: project.name })}>
                          <Pencil className="h-3.5 w-3.5" />
                          {t('container.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (window.confirm(t('project.archiveConfirm', { name: project.name }))) {
                              void archiveProjectFromTree(project.id)
                            }
                          }}
                        >
                          <Archive className="h-3.5 w-3.5" />
                          {t('project.archiveAction')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setShareItem({ type: 'project', id: project.id, name: project.name })}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          {t('share.menuAction')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setMoveItem({
                              kind: 'project',
                              id: project.id,
                              name: project.name,
                              spaceId: space.id,
                              parentId: project.folderId ?? null,
                            })
                          }
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          {t('move.action')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {projectOpen(project.id) && (
                    <div className="ml-5 space-y-0.5">
                      {project.lists.map((list, i) => (
                        <Fragment key={list.id}>
                          {renderGap({
                            itemKind: 'list',
                            containerKind: 'project',
                            containerId: project.id,
                            spaceId: space.id,
                            index: i,
                            siblingIds: project.lists.map((l) => l.id),
                          })}
                          {renderListNode(list, project.id)}
                        </Fragment>
                      ))}
                      {/* The last gap, so something can be dropped AFTER the
                          final row. Without it the bottom position is the one
                          place in the order nothing can be moved to. */}
                      {project.lists.length > 0 &&
                        renderGap({
                          itemKind: 'list',
                          containerKind: 'project',
                          containerId: project.id,
                          spaceId: space.id,
                          index: project.lists.length,
                          siblingIds: project.lists.map((l) => l.id),
                        })}
                      {project.lists.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-muted-foreground">{t('nav.noLists')}</div>
                      )}
                    </div>
                  )}
                </div>
              )
              const ungrouped = space.projects.filter((p) => !p.folderId)
              return (
              <div key={space.id} className="space-y-0.5">
                {/* The space row is the way BACK OUT of a folder — drop a
                    project here and its `folderId` is cleared, mirroring the
                    Move dialog's "move back". Without it the gesture would be
                    one-way, and a project dragged into a folder by accident
                    would need a different control to undo. */}
                <div
                  className={cn(
                    'group flex items-center gap-1 rounded-md',
                    dropTarget === space.id &&
                      canDropOn({ kind: 'space', id: space.id }) &&
                      'ring-1 ring-brand-500 bg-accent/20',
                  )}
                  data-testid={`tree-space-${space.id}`}
                  {...dropProps({ kind: 'space', id: space.id, spaceId: space.id })}
                >
                  {/*
                    Two targets, not one. This used to be a <Link> nested inside
                    the toggle <button> — invalid HTML, and behaviourally it
                    meant a single click both navigated and toggled, so opening
                    a space you had just closed depended on which half of the
                    row you happened to hit. ClickUp separates them: the chevron
                    expands, the name opens the space.
                  */}
                  <button
                    type="button"
                    onClick={() => setExpandedSpaces((prev) => ({ ...prev, [space.id]: !prev[space.id] }))}
                    aria-expanded={spaceOpen(space.id)}
                    aria-label={t(spaceOpen(space.id) ? 'nav.collapseItem' : 'nav.expandItem', { name: space.name })}
                    data-testid={`space-toggle-${space.id}`}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10"
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', spaceOpen(space.id) && 'rotate-180')} />
                  </button>
                  <Link
                    to="/app/$workspaceId/$spaceId"
                    params={{ workspaceId, spaceId: space.id }}
                    // Opening a space reveals it. Never the reverse: navigating
                    // to something and having it fold away underneath you is
                    // how the tree became unusable.
                    onClick={() => setExpandedSpaces((prev) => ({ ...prev, [space.id]: true }))}
                    data-testid={`space-link-${space.id}`}
                    className="flex-1 min-w-0 flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                  >
                    {space.icon ? (
                      <span className="h-4 w-4 shrink-0 flex items-center justify-center text-sm leading-none">{space.icon}</span>
                    ) : (
                      <FolderOpen className="h-4 w-4 shrink-0" style={space.color ? { color: space.color } : undefined} />
                    )}
                    <span className="truncate">{space.name}</span>
                  </Link>
                  {/*
                    §V2-06 `[07:56]`, frame `08:00` — "Space ke ooper yeh jo
                    PLUS ka option hota hai, us par click karoge to LIST /
                    FOLDER [aata hai]." The frame's menu is headed **Create**
                    and offers eight things.

                    What stood here was a single action: a `window.prompt` for a
                    project name and nothing else. Seven of the eight were
                    unreachable from the one place a person has already decided
                    to create something, and the eighth was chosen for them.

                    The eight come from `lib/create-types.ts`, which the
                    quick-create tab strip renders from as well — one list, two
                    surfaces. Each lands on that type's creator with THIS space
                    already filled in.
                  */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground data-[state=open]:opacity-100"
                        aria-label={t('nav.createInSpace', { name: space.name })}
                        title={t('createMenu.title')}
                        data-testid={`space-create-open-${space.id}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-60" data-testid="space-create-menu">
                      <DropdownMenuLabel data-testid="space-create-menu-title">{t('createMenu.title')}</DropdownMenuLabel>
                      {typesForSpace(space.id).map((type, i, shown) => (
                        // A Fragment, not a <div>: a plain element between
                        // role="menu" and its items is not a menu any more.
                        <Fragment key={type.value}>
                          {/*
                            The frame rules its menu into groups; ours divides
                            the things that go INSIDE a container from the
                            containers themselves.

                            DRAWN WHERE `isContainer` FIRST TURNS TRUE, not at
                            a literal index. This was `{i === 5 && …}`, and the
                            day `form` was inserted at position five the rule
                            moved onto the wrong boundary — separating Dashboard
                            from Form rather than Form from List — with nothing
                            to notice: the array still had every item, in order,
                            with the right labels. A number that means "just
                            before List" only while nothing is inserted above
                            List is a comment pretending to be code.

                            NOT NAMED `space-create-*`. That prefix is the
                            namespace for things this menu can CREATE, and the
                            suite scrapes it to list them — so a rule called
                            `space-create-container-rule` was counted as a
                            tenth menu item the first time this ran.
                          */}
                          {i > 0 && type.isContainer && !shown[i - 1].isContainer && (
                            <DropdownMenuSeparator data-testid="create-menu-container-rule" />
                          )}
                          <DropdownMenuItem
                            data-testid={`space-create-${type.value}`}
                            onClick={() => setSpaceCreate({ spaceId: space.id, kind: type.value })}
                          >
                            <type.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate" data-testid={`space-create-label-${type.value}`}>
                                {t(type.labelKey)}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {t(type.blurbKey)}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        </Fragment>
                      ))}
                      {/*
                        §V2-S09 frame `08:00` — the menu's THIRD group.

                        The frame rules its eight items into three: the two
                        containers with a line of prose each, then Doc ·
                        Dashboard · Whiteboard · Form, then **Imports ›** and
                        **Templates**. `[12:04]` names the middle four and
                        finishes "IMPORT — kuch aur cheezein hum kahin aur se
                        [la] sakte hain", and `[12:10]` "TEMPLATES wali cheez
                        hai … yahan aap use kar sakte hain."

                        These two are NOT `CreateKind`s and must not become
                        them: everything above makes a new empty thing in this
                        space, while these two go and fetch one that already
                        exists somewhere else. Putting them through
                        `SPACE_CREATE_TYPES` would mean inventing a creator for
                        each that only ever navigates away — the dead control,
                        twice. Both destinations have been shipped and reachable
                        from the Browse rail for some time; what was missing is
                        them being offered HERE, at the point where somebody has
                        already decided to put something in this space.
                      */}
                      {/* Both make tasks, which a guest may not: not theirs to be offered. */}
                      {workspaceRole !== 'guest' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            data-testid="space-create-imports"
                            onClick={() =>
                              navigate({ to: '/app/$workspaceId/import', params: { workspaceId } })
                            }
                          >
                            <Import className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t('createMenu.imports')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            data-testid="space-create-templates"
                            onClick={() =>
                              navigate({ to: '/app/$workspaceId/templates', params: { workspaceId } })
                            }
                          >
                            <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t('createMenu.templates')}</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground data-[state=open]:opacity-100"
                        aria-label={t('nav.actionsFor', { name: space.name })}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setSpaceDialog({ mode: 'rename', id: space.id, name: space.name })}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t('container.rename')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShareItem({ type: 'space', id: space.id, name: space.name })}>
                        <Share2 className="h-3.5 w-3.5" />
                        {t('share.menuAction')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void deleteSpaceFromTree(space.id, space.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('space.deleteAction')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {spaceOpen(space.id) && (
                  <div className="ml-6 space-y-0.5">
                    {(space.folders ?? []).map((folder, folderIndex) => {
                      const folderProjects = space.projects.filter((p) => p.folderId === folder.id)
                      const open = filtering || (expandedFolders[folder.id] ?? true)
                      const folderIds = (space.folders ?? []).map((f) => f.id)
                      return (
                        <div key={folder.id} className="space-y-0.5">
                          {renderGap({
                            itemKind: 'folder',
                            containerKind: 'space',
                            containerId: space.id,
                            spaceId: space.id,
                            index: folderIndex,
                            siblingIds: folderIds,
                          })}
                          {/* §V2-S12 `[08:23]` — the folder is the drop target
                              she names. `data-drop-active` only ever appears
                              while a drop here would really move something,
                              so a highlight cannot claim more than the gesture
                              can deliver. */}
                          <div
                            className={cn(
                              'group flex items-center gap-1 rounded-md',
                              dragItem?.kind === 'folder' && dragItem.id === folder.id && 'opacity-50',
                              dropTarget === folder.id &&
                                canDropOn({ kind: 'folder', id: folder.id }) &&
                                'ring-1 ring-brand-500 bg-accent/20',
                            )}
                            data-testid={`tree-folder-${folder.id}`}
                            // A folder is draggable only for the gaps below:
                            // `canDropOn` answers `false` for every row target,
                            // so this can reorder and cannot re-parent.
                            {...dragProps({ kind: 'folder', id: folder.id })}
                            {...dropProps({ kind: 'folder', id: folder.id, spaceId: space.id })}
                          >
                            <button
                              className="flex-1 min-w-0 flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                              onClick={() => setExpandedFolders((prev) => ({ ...prev, [folder.id]: !(prev[folder.id] ?? true) }))}
                            >
                              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                              <Folder className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{folder.name}</span>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  data-testid={`tree-folder-actions-${folder.id}`}
                                  className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground data-[state=open]:opacity-100"
                                  aria-label={t('nav.actionsFor', { name: folder.name })}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                {/*
                                  §V2-S09 `08:25` — the shared dialog now edits a
                                  folder's DESCRIPTION as well as its name, so the
                                  row that opens it no longer says "Rename". A
                                  menu row naming one of the two things behind it
                                  is the stale reason this audit keeps finding.
                                */}
                                <DropdownMenuItem
                                  data-testid="tree-folder-edit"
                                  onClick={() =>
                                    setTreeEdit({
                                      kind: 'folder',
                                      spaceId: space.id,
                                      id: folder.id,
                                      name: folder.name,
                                      description: folder.description ?? '',
                                    })
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  {t('folder.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    void setFolderVisibility(
                                      space.id,
                                      folder.id,
                                      folder.visibility === 'private' ? 'public' : 'private',
                                    )
                                  }
                                >
                                  {folder.visibility === 'private' ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                  {folder.visibility === 'private' ? t('nav.makePublic') : t('nav.makePrivate')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setShareItem({ type: 'folder', id: folder.id, name: folder.name })}
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                  {t('share.menuAction')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setMoveItem({
                                      kind: 'folder',
                                      id: folder.id,
                                      name: folder.name,
                                      spaceId: space.id,
                                      parentId: null,
                                    })
                                  }
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                  {t('move.action')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (window.confirm(t('folder.deleteConfirm', { name: folder.name }))) {
                                      void deleteFolder(space.id, folder.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {t('folder.deleteAction')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {open && (
                            // Named so a check can ask whether a row really is
                            // INSIDE this folder, rather than inferring it from
                            // a database column the tree may not have read yet.
                            <div className="ml-4 space-y-0.5" data-testid={`tree-folder-children-${folder.id}`}>
                              {folderProjects.map((project, i) => (
                                <Fragment key={project.id}>
                                  {renderGap({
                                    itemKind: 'project',
                                    containerKind: 'folder',
                                    containerId: folder.id,
                                    spaceId: space.id,
                                    index: i,
                                    siblingIds: folderProjects.map((p) => p.id),
                                  })}
                                  {renderProjectNode(project)}
                                </Fragment>
                              ))}
                              {folderProjects.length > 0 &&
                                renderGap({
                                  itemKind: 'project',
                                  containerKind: 'folder',
                                  containerId: folder.id,
                                  spaceId: space.id,
                                  index: folderProjects.length,
                                  siblingIds: folderProjects.map((p) => p.id),
                                })}
                              {folderProjects.length === 0 && (
                                <div className="px-2 py-1 text-[11px] text-muted-foreground">{t('nav.emptyFolder')}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {/* After the last folder, so a folder can be moved to the
                        bottom of the space's folder list. */}
                    {(space.folders ?? []).length > 0 &&
                      renderGap({
                        itemKind: 'folder',
                        containerKind: 'space',
                        containerId: space.id,
                        spaceId: space.id,
                        index: (space.folders ?? []).length,
                        siblingIds: (space.folders ?? []).map((f) => f.id),
                      })}
                    {ungrouped.map((project, i) => (
                      <Fragment key={project.id}>
                        {renderGap({
                          itemKind: 'project',
                          containerKind: 'space',
                          containerId: space.id,
                          spaceId: space.id,
                          index: i,
                          siblingIds: ungrouped.map((p) => p.id),
                        })}
                        {renderProjectNode(project)}
                      </Fragment>
                    ))}
                    {ungrouped.length > 0 &&
                      renderGap({
                        itemKind: 'project',
                        containerKind: 'space',
                        containerId: space.id,
                        spaceId: space.id,
                        index: ungrouped.length,
                        siblingIds: ungrouped.map((p) => p.id),
                      })}
                    {/*
                      §G15-10 — the lists that belong to the SPACE, not to a
                      project in it.
                      
                      Rendered at the same depth as a project, because that is
                      where they are in the hierarchy she describes: "pehle
                      space hoti hai, iske baad LIST aati hai." They live in the
                      space's hidden container, which the project endpoint never
                      returns, so without this they would be openable by URL and
                      findable by search and absent from the tree.
                    */}
                    {/*
                      NO REORDER STRIPS HERE, and the reason is recorded rather
                      than left as an unexplained absence. Every one of these
                      lists lives in the space's single hidden container, so
                      their order is `lists.position` within that container and
                      `POST /lists/project/:id/reorder` would in principle do
                      it — but that route demands `orderedIds` contain EVERY
                      list of the project, and `/lists/space/:id` applies a
                      visibility filter this column does not. A viewer who
                      cannot see one of them would send a short list and be
                      refused, every time, with no way to tell why. That is a
                      real gap, not a decision that these cannot be ordered.
                    */}
                    {(space.spaceLists ?? []).map((list) => (
                      <div key={list.id} data-testid={`space-list-${list.id}`}>
                        {renderListNode(list, list.projectId)}
                      </div>
                    ))}
                    {space.projects.length === 0 && (space.spaceLists ?? []).length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">{t('nav.noProjects')}</div>
                    )}
                    {/* A folder is `space.create`'s, as the API files it: a guest's is a 403. */}
                    {permissions.can('space.create') === true && (
                      <button
                        className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                        data-testid={`space-new-folder-${space.id}`}
                        onClick={() => setSpaceCreate({ spaceId: space.id, kind: 'folder' })}
                      >
                        <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                        {t('nav.newFolder')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              )
            })}
            {/* §2.9a — the boot skeleton draws this as shapes; handing over to
                the words "Loading spaces…" is the visible seam. */}
            {spaceTreeQuery.isLoading && (
              <div className="px-2 py-1">
                <ListSkeleton rows={4} rowClassName="h-5" className="space-y-1.5" />
              </div>
            )}
            {!spaceTreeQuery.isLoading && (spacesQuery.data?.length ?? 0) === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('nav.noSpaces')}</p>
            )}
            {/* `space.create`'s, as the API files it: a guest's is a 403. */}
            {permissions.can('space.create') === true && (
              <button
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                data-testid="nav-new-space"
                onClick={() => setSpaceDialog({ mode: 'create', name: '' })}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {t('nav.newSpace')}
              </button>
            )}
            </div>
          )}
        </div>
      </div>
      </>
      )}
      {/* Outside the collapsed/expanded split on purpose: the dock is fixed-
          position chrome, and it belongs to the workspace rather than to the
          sidebar's width. */}
      {workspaceId && (
        <>
          <div
            ref={dockRef}
            data-testid="floating-dock"
            className={cn(
              'fixed z-50 hidden xl:flex rounded-full border border-border/70 bg-card/85 backdrop-blur shadow-lg',
              appearance.orientation === 'vertical' ? 'flex-col p-1.5 gap-1' : 'flex-row px-2 py-1.5 gap-1',
              draggingDock && 'cursor-grabbing',
            )}
            style={{
              left: dockPos.x,
              bottom: dockPos.y,
              opacity: appearance.opacity,
            }}
            onMouseDown={(e) => {
              const target = e.target as HTMLElement
              if (target.closest('a') || target.closest('button')) return
              e.preventDefault()
              setDraggingDock(true)
              const startX = e.clientX
              const startY = e.clientY
              const baseX = dockPos.x
              const baseY = dockPos.y
              let latest = { x: baseX, y: baseY }
              const move = (evt: MouseEvent) => {
                const nextX = Math.min(Math.max(8, baseX + (evt.clientX - startX)), viewport.w - 320)
                const nextY = Math.min(Math.max(8, baseY - (evt.clientY - startY)), viewport.h - 70)
                latest = { x: nextX, y: nextY }
                setDockPos(latest)
              }
              const up = () => {
                setDraggingDock(false)
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
                try {
                  localStorage.setItem('rundesk.floatingDockPos', JSON.stringify(latest))
                } catch {
                  // ignore storage failures
                }
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          >
            {/*
              G07-7 — from what the user chose, not from a list we wrote.
              `dockTools` is already filtered by flag and role, so nothing here
              can render a link the workspace does not have.
            */}
            {dockTools.map((tool) => (
              <DockLink
                key={tool.id}
                to={`/app/$workspaceId${tool.path}`}
                params={{ workspaceId: workspaceId! }}
                icon={tool.icon}
                label={t(tool.labelKey)}
                testId={`dock-tool-${tool.id}`}
              />
            ))}
            <button
              className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] text-muted-foreground border border-border/60 ml-1 hover:bg-accent/15"
              title={t('nav.dockSettings')}
              onClick={() => setShowDockSettings((v) => !v)}
            >
              ⚙
            </button>
            <div className="h-7 px-2 rounded-full flex items-center justify-center text-[10px] text-muted-foreground border border-border/60 ml-1">
              {t('nav.drag')}
            </div>
          </div>
          {showDockSettings && (
            <div
              className="fixed z-[55] hidden xl:block w-72 rounded-xl border border-border/70 bg-card/95 backdrop-blur shadow-xl p-3"
              style={{ left: dockPos.x, bottom: dockPos.y + 62 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">{t('nav.dockSettings')}</div>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowDockSettings(false)}>
                  {t('common.close')}
                </button>
              </div>
              <div className="space-y-3">
                {/*
                  G07-7 [08:29–08:31] — "hum limited de dein … woh us ko choose
                  karna parega". The panel offered Orientation, Opacity, Size
                  and Reset — everything about how the dock LOOKS and nothing
                  about what is in it. The column and the endpoint to store
                  this had existed the whole time, unwritten by anything.

                  Only the tools this workspace actually has are listed, so a
                  box can never be ticked for something that leads nowhere.
                */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('nav.dockTools')}</div>
                  <div className="space-y-0.5" data-testid="dock-tool-picker">
                    {offerableTools.map((tool) => {
                      const on = chosenDockTools.includes(tool.id)
                      return (
                        <label
                          key={tool.id}
                          className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent/10"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            data-testid={`dock-tool-toggle-${tool.id}`}
                            onChange={() =>
                              void updateDockConfig({
                                // Sent as the full list rather than a delta, so
                                // turning the last one off stores an empty
                                // array — "I want none" is an answer, and a
                                // delta API would read it as "never chose".
                                pinnedLinks: on
                                  ? chosenDockTools.filter((id) => id !== tool.id)
                                  : [...chosenDockTools, tool.id],
                              })
                            }
                            className="h-3 w-3 rounded border-border"
                          />
                          <tool.icon className="h-3 w-3 shrink-0 opacity-70" />
                          {t(tool.labelKey)}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('nav.orientation')}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={appearance.orientation === 'horizontal' ? 'gradient' : 'outline'}
                      className="h-7 flex-1 text-xs"
                      onClick={() => updateDockConfig({ appearance: { ...appearance, orientation: 'horizontal' } })}
                    >
                      {t('nav.horizontal')}
                    </Button>
                    <Button
                      size="sm"
                      variant={appearance.orientation === 'vertical' ? 'gradient' : 'outline'}
                      className="h-7 flex-1 text-xs"
                      onClick={() => updateDockConfig({ appearance: { ...appearance, orientation: 'vertical' } })}
                    >
                      {t('nav.vertical')}
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{t('nav.opacity')}</span>
                    <span>{Math.round((appearance.opacity ?? 0.9) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={1}
                    value={Math.round((appearance.opacity ?? 0.9) * 100)}
                    onChange={(e) =>
                      void updateDockConfig({
                        appearance: { ...appearance, opacity: Number(e.target.value) / 100 },
                      })
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('nav.size')}</div>
                  <div className="flex gap-2">
                    {(['sm', 'md', 'lg'] as const).map((size) => (
                      <Button
                        key={size}
                        size="sm"
                        variant={appearance.size === size ? 'gradient' : 'outline'}
                        className="h-7 flex-1 text-xs uppercase"
                        onClick={() => updateDockConfig({ appearance: { ...appearance, size } })}
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    const reset = { x: 16, y: 16 }
                    setDockPos(reset)
                    localStorage.setItem('rundesk.floatingDockPos', JSON.stringify(reset))
                  }}
                >
                  {t('nav.resetPosition')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/*
        §V2-S10 frames `08:25` / `08:55` — the sidebar's "New folder" opens the
        Create menu's Folder form, on this space (`spaceCreate`, below). It had
        a dialog of its own, which asked for a name and posted only that: no
        description, no Make private, no statuses, all of which that form sends
        (`commit-log/log-a0b4108-1`). ClickUp's sidebar opens its one Create
        Folder dialog. The form keeps a refused name in its box and says why,
        which is what the sidebar's own dialog was kept for.
      */}
      <ContainerEditDialog
        open={treeEdit !== null}
        onOpenChange={(next) => {
          if (!next) setTreeEdit(null)
        }}
        title={treeEdit?.kind === 'folder' ? t('folder.editTitle') : t('container.rename')}
        /*
         * §V2-S09 `08:25` — THE READER FOR THE COLUMN. `fields.description`
         * is the flag projects already pass; turning it on for folders is what
         * makes the create dialog's field a round trip rather than a write
         * nothing reads back. Lists and projects reach this dialog by the same
         * `treeEdit` state and are deliberately left as they were.
         */
        fields={treeEdit?.kind === 'folder' ? { description: true } : undefined}
        initial={{
          name: treeEdit?.name ?? '',
          description: treeEdit?.kind === 'folder' ? treeEdit.description : undefined,
        }}
        submitting={savingEdit}
        onSubmit={submitTreeEdit}
      />

      <ContainerEditDialog
        open={spaceDialog !== null && spaceDialog.mode === 'rename'}
        onOpenChange={(next) => {
          if (!next) setSpaceDialog(null)
        }}
        title={t('space.editTitle')}
        initial={{ name: spaceDialog?.name ?? '' }}
        submitting={savingSpace}
        onSubmit={submitSpaceDialog}
      />

      {/*
        §V2-06 — one wizard for creating a space, shared with the quick-create
        modal's Space tab. Before this there were two different name-only
        dialogs for the same action, and neither could reach the description,
        colour and icon `POST /spaces` had accepted all along.
      */}
      {workspaceId && (
        <CreateSpaceWizard
          open={spaceDialog?.mode === 'create'}
          onOpenChange={(next) => {
            if (!next) setSpaceDialog(null)
          }}
          workspaceId={workspaceId}
          onCreated={(space) => {
            setSpaceDialog(null)
            navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId: space.id } })
          }}
        />
      )}

      {/*
        §V2-06 frame `08:00` — the creator the "+" menu chose, opened on that
        type with this space already selected. The quick-create modal IS the
        creator for all eight; routing here to a second set of forms would be
        the duplicated-list defect wearing a different hat.
      */}
      {spaceCreate && (
        <QuickCreateModal
          initialMode={spaceCreate.kind}
          initialSpaceId={spaceCreate.spaceId}
          onClose={() => setSpaceCreate(null)}
        />
      )}

      {shareItem && (
        <SharePanel
          open
          onOpenChange={(next) => { if (!next) setShareItem(null) }}
          objectType={shareItem.type}
          objectId={shareItem.id}
          objectName={shareItem.name}
        />
      )}

      {moveItem && workspaceId && (
        <MoveDialog
          open
          onOpenChange={(next) => { if (!next) setMoveItem(null) }}
          workspaceId={workspaceId}
          kind={moveItem.kind}
          itemId={moveItem.id}
          itemName={moveItem.name}
          currentSpaceId={moveItem.spaceId}
          currentParentId={moveItem.parentId}
          onMoved={() => setMoveItem(null)}
        />
      )}

      <CreateWorkspaceFlow
        open={wsDialogOpen}
        onOpenChange={setWsDialogOpen}
        submitting={savingWs}
        onFinish={submitWorkspaceDialog}
      />
    </aside>
  )
}

function resolveRoutePath(
  to: string,
  params: Record<string, string>,
) {
  let path = to
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`$${key}`, value)
  }
  return path
}

/**
 * One of the three My Tasks destinations.
 *
 * Separate from NavLink because these differ only by `?section=`, and NavLink's
 * `to` is a union of literal paths with no room for search — bending it to take
 * one would complicate every other caller for the sake of these three.
 */
function MyTasksLink({
  workspaceId,
  section,
  icon: Icon,
  label,
  badge,
}: {
  workspaceId: string
  section: 'assigned-to-me' | 'today-overdue' | 'personal-list'
  icon: typeof Home
  label: string
  /** Frame `06:25` puts a count on Personal List. Omitted = no badge at all. */
  badge?: number
}) {
  const search = useSearch({ strict: false }) as { section?: string }
  const pathname = useRouterState({ select: (st) => st.location.pathname })
  // Active only on Home itself: the same query string on a task page would
  // otherwise light this up from somewhere it does not describe.
  const active = pathname === `/app/${workspaceId}` && search.section === section
  return (
    <Link
      to="/app/$workspaceId"
      params={{ workspaceId }}
      search={{ section }}
      data-testid={`sidebar-my-tasks-${section}`}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {/*
        Nothing at zero. A badge reading `0` is a different claim from no badge —
        it says "counted, and the answer is none", which is exactly what an
        empty list looks like from the outside and is not worth a chip.
      */}
      {typeof badge === 'number' && badge > 0 && (
        <span
          data-testid={`sidebar-my-tasks-${section}-count`}
          className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent/40 text-[10px] font-semibold flex items-center justify-center tabular-nums"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

function NavLink({
  to,
  params,
  icon: Icon,
  label,
  compact,
  favorite,
}: {
  to:
    | '/app/$workspaceId'
    | '/app/$workspaceId/inbox'
    | '/app/$workspaceId/chat'
    | '/app/$workspaceId/ai'
    | '/app/$workspaceId/skills'
    | '/app/$workspaceId/meetings'
    | '/app/$workspaceId/docs'
    | '/app/$workspaceId/dashboard'
    | '/app/$workspaceId/whiteboards'
    | '/app/$workspaceId/forms'
    | '/app/$workspaceId/automations'
    | '/app/$workspaceId/workload'
    | '/app/$workspaceId/timeline'
    | '/app/$workspaceId/templates'
    | '/app/$workspaceId/integrations'
    | '/app/$workspaceId/settings'
  params: { workspaceId: string }
  icon: typeof Home
  label: string
  compact?: boolean
  /**
   * G07-6 [08:26–08:31] — starring a place you have not been.
   *
   * The only way to add a favourite was the star on a RECENTS row, so a page
   * you had never opened could not be favourited at all — you had to visit it
   * first, then find it in Recents, then star it. Passing this makes every
   * Browse row starrable directly.
   */
  favorite?: { on: boolean; onToggle: () => void; addLabel: string; removeLabel: string }
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const href = resolveRoutePath(to, params)
  const isActive = isNavPathActive(pathname, href, to === '/app/$workspaceId')

  const link = (
    <Link
      to={to}
      params={params}
      className={cn(
        'flex items-center gap-2 rounded-md hover:bg-accent/10',
        compact ? 'px-2 py-1.5 text-[13px]' : 'px-2 py-1.5 text-sm',
        favorite && 'flex-1 min-w-0',
        isActive
          ? 'bg-accent/15 text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )

  if (!favorite) return link

  return (
    <div className="group/nav flex items-center gap-1">
      {link}
      {/*
        Hidden until hover, except when it is already on — an unlit star on
        every row would turn a nav list into a column of controls, and a lit
        one has to stay visible or you cannot tell what you favourited.
      */}
      <button
        type="button"
        data-testid={`nav-favorite-${href.split('/').pop() || 'home'}`}
        onClick={favorite.onToggle}
        title={favorite.on ? favorite.removeLabel : favorite.addLabel}
        aria-label={favorite.on ? favorite.removeLabel : favorite.addLabel}
        className={cn(
          'h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-accent/15 hover:text-foreground',
          favorite.on ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100 focus:opacity-100',
        )}
      >
        <Star className={cn('h-3.5 w-3.5', favorite.on && 'text-amber-400')} />
      </button>
    </div>
  )
}

function DockLink({
  to,
  params,
  icon: Icon,
  label,
  testId,
}: {
  /*
   * G07-7 — a plain string now that the dock is built from DOCKABLE_TOOLS.
   *
   * The union was a nice guard while the list was hard-coded here, and it
   * cannot survive a list the user composes. The guarantee moves to the
   * registry instead: every entry names a route that exists, checked when it
   * was written, and the picker can only offer what is in it.
   */
  to: string
  params: { workspaceId: string }
  icon: typeof Home
  label: string
  testId?: string
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const href = resolveRoutePath(to, params)
  const isActive = isNavPathActive(pathname, href, to === '/app/$workspaceId')

  return (
    <Link
      to={to as '/app/$workspaceId'}
      params={params}
      data-testid={testId}
      title={label}
      className={cn(
        'h-8 w-8 rounded-full flex items-center justify-center',
        isActive
          ? 'text-white bg-brand-gradient'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/15',
      )}
    >
      <Icon className="h-4 w-4" />
    </Link>
  )
}


/**
 * §15 — the sidebar's "AI Chats" list.
 *
 * Frames `296_1817` → `297_1820` → `304_1907`: a thread starts as "New Chat",
 * renames itself, and is still here after the panel closes. Empty threads are
 * hidden — a list of "New Chat" rows nobody said anything in is worse than no
 * list, and this is exactly what she is looking at when she reopens hers.
 */
/**
 * §V2-S02 frames `00:05` and `06:25` — the sidebar's **Channels** section.
 *
 * The frame draws, under AI Chats: a heading **Channels**, `# General - Leo`
 * (with a hover `⋯`), `# Welcome`, then a `+ Add Channel` row — and **Direct
 * Messages** as a SEPARATE section beneath with its own `+ New message`. At
 * `[06:21]`: *"yahan saari chats show hoti hain — yeh group communication
 * channels, direct messages, aur spaces."*
 *
 * Rundesk had the data and none of the surface. `workspace-sidebar.tsx` carried
 * a channel *icon* in a type map and pinned-favourite handling, and rendered no
 * channel list at all; channels existed only on the chat page, which you had to
 * already be on to see that you had any.
 *
 * PUBLIC CHANNELS ONLY. `GET …/chat/channels` returns both kinds behind one
 * `isDm` flag, and the frame is emphatic that these are two sections with two
 * different creation gestures — folding DMs in here would make `+ Add Channel`
 * the button that also makes a DM, which is not a thing it can do.
 *
 * The rows are links into the chat page's `?channel=` deep link, which has been
 * honoured since §6: this navigates somewhere real rather than re-implementing
 * a conversation in the tree.
 */
function ChannelsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string | null; isDm?: boolean }>>(
        `/workspaces/${workspaceId}/chat/channels`,
      ),
    enabled: !!workspaceId,
  })
  const channels = (channelsQuery.data ?? []).filter((c) => !c.isDm)

  const submit = async () => {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const created = await api<{ id: string }>(`/workspaces/${workspaceId}/chat/channels`, {
        method: 'POST',
        body: { name },
      })
      /*
       * The SAME query key the chat page reads, so the new channel is in both
       * places at once. Invalidating a key nobody else uses would leave the
       * chat page showing a list this section had already moved on from.
       */
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setCreating(false)
      setNewName('')
      if (created?.id) {
        navigate({
          to: '/app/$workspaceId/chat',
          params: { workspaceId },
          search: { channel: created.id },
        })
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('nav.createChannelError'))
    } finally {
      setSaving(false)
    }
  }

  /*
   * Nothing to draw before the first answer arrives, and nothing to draw if it
   * never came. A headed, empty section is a CLAIM — "you have no channels" —
   * and neither "not yet" nor "the request failed" is that claim. The chat
   * routes sit behind a feature flag the client resolves separately, so a 403
   * here is an ordinary outcome rather than a broken build.
   */
  if (channelsQuery.isLoading || channelsQuery.isError) return null

  return (
    <div className="pt-1" data-testid="sidebar-channels" data-count={channels.length}>
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {t('nav.channels')}
      </div>
      {channels.map((channel) => (
        <Link
          key={channel.id}
          to="/app/$workspaceId/chat"
          params={{ workspaceId }}
          search={{ channel: channel.id }}
          data-testid={`sidebar-channel-${channel.id}`}
          title={channel.name ?? ''}
          className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
        >
          <Hash className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{channel.name}</span>
        </Link>
      ))}
      {creating ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <Input
            autoFocus
            data-testid="sidebar-add-channel-name"
            value={newName}
            placeholder={t('nav.channelNamePlaceholder')}
            className="h-7 text-[12px]"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
              if (e.key === 'Escape') {
                setCreating(false)
                setNewName('')
              }
            }}
          />
          <Button
            size="sm"
            className="h-7 px-2 text-[11px]"
            data-testid="sidebar-add-channel-save"
            disabled={!newName.trim() || saving}
            onClick={() => void submit()}
          >
            {t('common.save')}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="sidebar-add-channel"
          onClick={() => setCreating(true)}
          className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('nav.addChannel')}</span>
        </button>
      )}
    </div>
  )
}

/**
 * §V2-S07 frames `00:05` / `06:25` — what a direct message is CALLED.
 *
 * `dmLabel` is every other participant joined with commas for a group DM and
 * the single peer's name for a 1:1; `dmPeerName` is the first peer alone. Four
 * places had this two-step fallback written out by hand — the chat rail, the
 * chat page's header, its forward picker, and the Direct Messages section
 * below — and a fifth copy is how one conversation ends up with two names on
 * two surfaces.
 *
 * IT LIVES HERE RATHER THAN IN `chat-sidebar.tsx`, which is the more obvious
 * home, for a bundling reason worth stating: this file is imported by
 * `routes/app.tsx` and is therefore in the shell chunk on every `/app/*` page,
 * including the chat page. Importing a 20-line helper the other way would have
 * dragged the whole 800-line chat rail into that shell chunk for every page in
 * the product. This direction costs nothing.
 *
 * `fallback` is the caller's word for "a DM with nobody in it", which is a REAL
 * state and not a defensive `?? ''`: `chat.service.ts` builds `peers` by
 * excluding the signed-in user, so a DM whose only remaining member is you
 * arrives with `dmLabel` and `dmPeerName` both null. Frame `06:25` draws that
 * row as `Hamda Tahir — You`; Rundesk cannot create one at all, because
 * `ensureDmChannel` refuses `currentUserId === peerUserId` outright.
 */
export function dmDisplayName(
  channel: { dmLabel?: string | null; dmPeerName?: string | null },
  fallback: string,
) {
  return channel.dmLabel ?? channel.dmPeerName ?? fallback
}

/**
 * §V2-S07 frames `00:05` and `06:25` — **Direct Messages**, the section
 * directly under Channels.
 *
 * Both frames draw TWO sections, not one: `Channels` over `# General - Leo`,
 * `# Welcome` and `+ Add Channel`, then `Direct Messages` over `suleman`,
 * `Hamda Tahir — You` and `+ New message`. `[06:21]`: *"yahan saari chats show
 * hoti hain — yeh group communication channels, DIRECT MESSAGES, aur SPACES."*
 * Named in the same sentence as its sibling and drawn as its own heading.
 *
 * The ledger had this as `P | Sidebar Direct Messages — exists on the chat
 * page, not the workspace tree`, and that was exactly right: `chat_channels.is_dm`
 * is a real column, `GET …/chat/channels` returns both kinds behind it, and the
 * chat page has split them since it was written. The workspace tree rendered
 * neither, then one.
 *
 * WHY NOT ONE SECTION WITH A DIVIDER. The two have different creation
 * gestures — `+ Add Channel` takes a name, `+ New message` takes a PERSON —
 * and folding them together would make one button do a thing it cannot do.
 * They also have different row content: a channel is `#` plus a name, a DM is
 * a face plus whoever is in it.
 *
 * THE SAME QUERY KEY as `ChannelsSection` and as the chat page, deliberately:
 * one request answers all three, and a DM started here appears there without a
 * second fetch or a second idea of what the list contains.
 */
function DirectMessagesSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [starting, setStarting] = useState(false)

  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () =>
      api<
        Array<{
          id: string
          name: string | null
          isDm?: boolean
          dmLabel?: string | null
          dmPeerName?: string | null
          dmPeerAvatarUrl?: string | null
        }>
      >(`/workspaces/${workspaceId}/chat/channels`),
    enabled: !!workspaceId,
  })
  const dms = (channelsQuery.data ?? []).filter((c) => c.isDm)

  /*
   * Only fetched once the picker is open. `+ New message` needs the workspace
   * roster and nothing else on this section does, so a sidebar that nobody
   * starts a DM from should not pay for it on every load.
   */
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api<Array<{ userId: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null }>>(
        `/workspaces/${workspaceId}/members`,
      ),
    enabled: !!workspaceId && picking,
  })
  const needle = query.trim().toLowerCase()
  const candidates = (membersQuery.data ?? []).filter((m) =>
    needle ? `${m.displayName ?? ''} ${m.email ?? ''}`.toLowerCase().includes(needle) : true,
  )

  const startDm = async (peerUserId: string) => {
    if (starting) return
    setStarting(true)
    try {
      const created = await api<{ id: string }>(`/workspaces/${workspaceId}/chat/dms`, {
        method: 'POST',
        body: { peerUserId },
      })
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setPicking(false)
      setQuery('')
      if (created?.id) {
        navigate({
          to: '/app/$workspaceId/chat',
          params: { workspaceId },
          search: { channel: created.id },
        })
      }
    } catch (err) {
      // `ensureDmChannel` refuses a DM with yourself and one with a non-member,
      // in its own words. Showing them beats a generic failure, because both
      // are things the person can act on.
      toast.error(err instanceof Error && err.message ? err.message : t('nav.newMessageError'))
    } finally {
      setStarting(false)
    }
  }

  /*
   * Same rule as Channels: nothing before the first answer and nothing if it
   * never came. A headed, empty "Direct Messages" is the claim "you have no
   * conversations", and neither "not yet" nor "that request failed" is it.
   */
  if (channelsQuery.isLoading || channelsQuery.isError) return null

  return (
    <div className="pt-1" data-testid="sidebar-direct-messages" data-count={dms.length}>
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {t('nav.directMessages')}
      </div>
      {dms.map((dm) => {
        const label = dmDisplayName(dm, t('chat.directMessage'))
        return (
          <Link
            key={dm.id}
            to="/app/$workspaceId/chat"
            params={{ workspaceId }}
            search={{ channel: dm.id }}
            data-testid={`sidebar-dm-${dm.id}`}
            title={label}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
          >
            {dm.dmPeerAvatarUrl ? (
              <img src={dm.dmPeerAvatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full bg-accent/30 text-[8px] font-semibold flex items-center justify-center uppercase">
                {label.slice(0, 1)}
              </span>
            )}
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
      {picking ? (
        <div className="px-2 py-1 space-y-1">
          <Input
            autoFocus
            data-testid="sidebar-new-message-search"
            value={query}
            placeholder={t('nav.newMessagePlaceholder')}
            className="h-7 text-[12px]"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPicking(false)
                setQuery('')
              }
            }}
          />
          <div className="max-h-44 overflow-y-auto space-y-0.5" data-testid="sidebar-new-message-results">
            {/*
              §V2 — A WAIT IS A SHAPE, NOT THE WORD "LOADING".
              This drew the `common.loading` string, and `loading-states.mjs` forbids
              exactly that across the whole app: no locale string a person
              would read as a waiting state may still be referenced by a
              component. It had been green — seventy-nine such sites were
              removed to get it there — and this row, added with the New
              message picker, put the count back to one.
              Three rows because the list it replaces is short, and
              `ListSkeleton` is already imported two hundred lines up: the
              idiom was here and this one spot did not use it.
            */}
            {membersQuery.isLoading && <ListSkeleton rows={3} rowClassName="h-6" className="px-1 py-1" />}
            {!membersQuery.isLoading && candidates.length === 0 && (
              <div className="px-1 py-1 text-[11px] text-muted-foreground" data-testid="sidebar-new-message-empty">
                {t('nav.newMessageNoOne')}
              </div>
            )}
            {candidates.map((m) => (
              <button
                key={m.userId}
                type="button"
                disabled={starting}
                data-testid={`sidebar-new-message-user-${m.userId}`}
                onClick={() => void startDm(m.userId)}
                className="w-full flex items-center gap-2 rounded-md px-1 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-60"
              >
                <span className="h-4 w-4 shrink-0 rounded-full bg-accent/30 text-[8px] font-semibold flex items-center justify-center uppercase">
                  {(m.displayName || m.email || '?').slice(0, 1)}
                </span>
                <span className="truncate">{m.displayName || m.email}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="sidebar-new-message"
          onClick={() => setPicking(true)}
          className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('nav.newMessage')}</span>
        </button>
      )}
    </div>
  )
}

/**
 * How many conversations the section shows before it has to be asked for more.
 *
 * Frame `06:25` draws three rows and a `⋯ More` under them, so five is a
 * PREVIEW, not the extent of the list. Named rather than inlined because the
 * count and the "is there more" test have to be the same number — two `5`s a
 * few lines apart is how an off-by-one hides.
 */
const AI_CHATS_PREVIEW = 5

function AiChatsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: threads = [] } = useAiChatThreads(workspaceId)
  /*
   * §V2-S02 frame `06:25` — the `⋯ More` under this section.
   *
   * This was `.slice(0, 5)` and nothing else: `GET /ai-chats` returns every
   * thread you have, the section rendered the first five, and the sixth
   * conversation onwards was UNREACHABLE FROM THE UI — not collapsed, not
   * paginated, just absent, with no control anywhere that could have shown it.
   * The frame draws the affordance that fixes it, directly under the same
   * section, and her sidebar has the identical `⋯ More` under My Tasks.
   *
   * Expanding is local state, not a refetch: the data is already here. The
   * defect was never that the client lacked the rows.
   */
  const [expanded, setExpanded] = useState(false)
  const all = threads.filter((thread) => thread.messageCount > 0)
  const withContent = expanded ? all : all.slice(0, AI_CHATS_PREVIEW)
  const hidden = all.length - withContent.length
  if (all.length === 0) return null

  return (
    <div className="pt-1" data-testid="ai-chats-section" data-total={all.length} data-shown={withContent.length}>
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {t('nav.aiChats')}
      </div>
      {withContent.map((thread) => (
        <button
          key={thread.id}
          data-testid={`ai-chat-${thread.id}`}
          title={thread.title}
          className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
          onClick={() =>
            navigate({
              to: '/app/$workspaceId/ai',
              params: { workspaceId },
              search: { thread: thread.id } as never,
            })
          }
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{thread.title}</span>
        </button>
      ))}
      {/*
        Frame `06:25`: `⋯ More`, directly under the last conversation.

        Rendered only when something is actually hidden — a "More" that reveals
        nothing is the dead control, and it is worse here than absence because it
        would answer the very question it was added to settle. It says HOW MANY
        for the same reason: "More" on its own cannot tell you whether the
        section is holding one conversation back or forty.
      */}
      {hidden > 0 && (
        <button
          type="button"
          data-testid="ai-chats-more"
          data-hidden={hidden}
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
        >
          <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('nav.moreCount', { count: hidden })}</span>
        </button>
      )}
      {expanded && all.length > AI_CHATS_PREVIEW && (
        <button
          type="button"
          data-testid="ai-chats-less"
          onClick={() => setExpanded(false)}
          className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
        >
          <ChevronDown className="h-3.5 w-3.5 shrink-0 rotate-180" />
          <span className="truncate">{t('nav.showLess')}</span>
        </button>
      )}
    </div>
  )
}
