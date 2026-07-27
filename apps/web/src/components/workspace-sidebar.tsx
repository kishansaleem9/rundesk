import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Check,
  Home,
  Inbox,
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
  Clock3,
  ArrowUp,
  ArrowDown,
  X,
  MoreHorizontal,
  ArrowRightLeft,
  FolderPlus,
  Pencil,
  Trash2,
  Archive,
  Lock,
  Globe,
} from 'lucide-react'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@rundesk/ui'
import { api } from '../lib/api'
import { ContainerEditDialog, type ContainerEditValues } from './container-edit-dialog'
import { useFavorites, useToggleFavorite, type FavoriteEntityType } from '../lib/use-favorites'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { MoveDialog, type MovableKind } from './move-dialog'
import { useResolvedFlags } from '../lib/use-feature-flags'
import { FLAGS } from '@rundesk/feature-flags'

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
  if (key.includes('team') || key.includes('chat')) return MessageCircle
  if (key.includes('doc')) return FileText
  if (key.includes('dashboard')) return LayoutDashboard
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
    { label: 'Teams', path: `${base}/chat` },
    { label: 'Docs', path: `${base}/docs` },
    { label: 'Dashboards', path: `${base}/dashboard` },
    { label: 'AI', path: `${base}/ai` },
    { label: 'Whiteboards', path: `${base}/whiteboards` },
    { label: 'Forms', path: `${base}/forms` },
    { label: 'Automations', path: `${base}/automations` },
    { label: 'Workload', path: `${base}/workload` },
    { label: 'Timeline', path: `${base}/timeline` },
    { label: 'Templates', path: `${base}/templates` },
    { label: 'Integrations', path: `${base}/integrations` },
    { label: 'Goals', path: `${base}/goals` },
    { label: 'Reports', path: `${base}/reports` },
    { label: 'Time', path: `${base}/time` },
    { label: 'Mind maps', path: `${base}/mindmaps` },
    { label: 'Clips', path: `${base}/clips` },
    { label: 'Settings', path: `${base}/settings` },
  ]
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

export function WorkspaceSidebar() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const workspaceId = isUuidLike(params.workspaceId) ? params.workspaceId : undefined
  const { isAdmin } = useWorkspaceRole(workspaceId)
  // §5 ClickApps — hide nav entries for features a workspace admin turned off.
  const { featureEnabled } = useResolvedFlags(workspaceId)
  // Whatever the user chose to move — drives the shared Move picker below.
  const [moveItem, setMoveItem] = useState<
    { kind: MovableKind; id: string; name: string; spaceId: string; parentId: string | null } | null
  >(null)
  const [openSwitcher, setOpenSwitcher] = useState(false)
  const [spacesExpanded, setSpacesExpanded] = useState(true)
  const [favoritesExpanded, setFavoritesExpanded] = useState(true)
  const [browseExpanded, setBrowseExpanded] = useState(true)
  const [recentsExpanded, setRecentsExpanded] = useState(true)
  const [dockPos, setDockPos] = useState({ x: 16, y: 16 })
  const [draggingDock, setDraggingDock] = useState(false)
  const [showDockSettings, setShowDockSettings] = useState(false)
  const [viewport, setViewport] = useState({ w: 1400, h: 900 })
  const dockRef = useRef<HTMLDivElement | null>(null)
  const { organizations, workspaces, setWorkspaces } = useAuthStore()
  const qc = useQueryClient()
  const [expandedSpaces, setExpandedSpaces] = useState<Record<string, boolean>>({})
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  // §2/§13.4 — the folder/project/list currently being renamed from the tree.
  // One shared dialog serves the whole tree; `null` means it is closed.
  const [treeEdit, setTreeEdit] = useState<
    | { kind: 'folder'; spaceId: string; id: string; name: string }
    | { kind: 'project'; id: string; name: string }
    | { kind: 'list'; id: string; name: string }
    | null
  >(null)
  const [savingEdit, setSavingEdit] = useState(false)
  // §2.3 — create-or-rename a Space directly from the sidebar tree (parity with
  // the folder/project affordances). `null` = closed; mode drives POST vs PUT.
  const [spaceDialog, setSpaceDialog] = useState<{ mode: 'create' | 'rename'; id?: string; name: string } | null>(null)
  const [savingSpace, setSavingSpace] = useState(false)
  // §2.2 — create a new Workspace under the caller's existing org from the
  // switcher (instead of bouncing to the full sign-up/registration flow).
  const [wsDialogOpen, setWsDialogOpen] = useState(false)
  const [savingWs, setSavingWs] = useState(false)

  const createFolder = async (spaceId: string) => {
    const name = window.prompt(t('nav.newFolderPrompt'))?.trim()
    if (!name) return
    try {
      await api(`/spaces/${spaceId}/folders`, { method: 'POST', body: { name } })
      setExpandedSpaces((prev) => ({ ...prev, [spaceId]: true }))
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('nav.createFolderError'))
    }
  }

  // §2.4 — create a project directly under a space from the sidebar (the "+" on
  // a space row), so users don't have to open the global create modal each time.
  const createProject = async (spaceId: string) => {
    if (!workspaceId) return
    const name = window.prompt(t('nav.newProjectPrompt'))?.trim()
    if (!name) return
    try {
      const created = await api<{ id: string }>(`/projects`, { method: 'POST', body: { spaceId, name } })
      setExpandedSpaces((prev) => ({ ...prev, [spaceId]: true }))
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      navigate({ to: '/app/$workspaceId/$spaceId/$projectId', params: { workspaceId, spaceId, projectId: created.id } })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('nav.createProjectError'))
    }
  }


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
        await api(`/spaces/${treeEdit.spaceId}/folders/${treeEdit.id}`, {
          method: 'PATCH',
          body: { name: values.name },
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
  const deleteListFromTree = async (listId: string) => {
    try {
      await api(`/lists/${listId}`, { method: 'DELETE' })
      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
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
      if (spaceDialog.mode === 'create') {
        const created = await api<{ id: string }>(`/spaces`, {
          method: 'POST',
          body: { workspaceId, name: values.name },
        })
        await qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
        await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
        setSpaceDialog(null)
        navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId: created.id } })
      } else {
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
      if (pathname.startsWith(`/app/${workspaceId}/${spaceId}`)) {
        navigate({ to: '/app/$workspaceId', params: { workspaceId } })
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('container.deleteError'))
    }
  }

  // §2.2 — create a workspace under the caller's existing organization and add
  // it to the session so the switcher shows it immediately, then navigate in.
  const submitWorkspaceDialog = async (values: ContainerEditValues) => {
    setSavingWs(true)
    try {
      const created = await api<{ id: string }>(`/workspaces`, { method: 'POST', body: { name: values.name } })
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

  const currentWorkspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined
  const currentOrg = currentWorkspace ? organizations.find((o) => o.id === currentWorkspace.organizationId) : undefined

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
    enabled: !!workspaceId,
  })
  const spaceTreeQuery = useQuery({
    queryKey: ['space-tree', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string; icon?: string | null; color?: string | null }>>(
        `/spaces/workspace/${workspaceId}`,
      )
      const projectGroups = await Promise.all(
        spaces.map(async (space) => {
          const [projects, folders] = await Promise.all([
            api<Array<{ id: string; name: string; folderId?: string | null }>>(`/projects/space/${space.id}`),
            api<Array<{ id: string; name: string; visibility?: string | null }>>(`/spaces/${space.id}/folders`).catch(() => []),
          ])
          const projectsWithLists = await Promise.all(
            projects.map(async (project) => {
              const lists = await api<Array<{ id: string; name: string; visibility?: string | null }>>(`/lists/project/${project.id}`)
              return { ...project, lists }
            }),
          )
          return { ...space, projects: projectsWithLists, folders }
        }),
      )
      return projectGroups
    },
  })
  const dockConfigQuery = useQuery({
    queryKey: ['user-dock-config', workspaceId],
    queryFn: () => api<any>(`/dashboards/dock/${workspaceId}`),
    enabled: !!workspaceId,
  })
  // Inbox unread badge (Plan §6.12). Reuse the topbar bell's exact query key so
  // React Query shares a single fetch/cache instead of duplicating it.
  const unreadCountQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30000,
    enabled: !!workspaceId,
  })
  const unreadCount = unreadCountQuery.data?.count ?? 0
  const { t } = useTranslation()
  // Localize the fixed set of app-defined nav/recent labels for display, while the
  // stored label stays English (a stable id for icon lookup + persistence). User
  // data (pinned entity names) is never routed through here.
  const navLabel = (label: string): string => {
    switch (label) {
      case 'Home': return t('nav.home')
      case 'Inbox': return t('nav.inbox')
      case 'Teams': return t('nav.teams')
      case 'Docs': return t('nav.docs')
      case 'Dashboards': return t('nav.dashboards')
      case 'AI': return t('nav.ai')
      case 'Whiteboards': return t('nav.whiteboards')
      case 'Forms': return t('nav.forms')
      case 'Automations': return t('nav.automations')
      case 'Workload': return t('nav.workload')
      case 'Timeline': return t('nav.timeline')
      case 'Templates': return t('nav.templates')
      case 'Integrations': return t('nav.integrations')
      case 'Goals': return t('nav.goals')
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
  const updateDockConfig = async (patch: { appearance?: { size?: string; opacity?: number; orientation?: string } }) => {
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

  useEffect(() => {
    if (!workspaceId) return
    const key = `rundesk.navFavorites.${workspaceId}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ label: string; path: string }>
        if (Array.isArray(parsed)) {
          setFavoriteItems(parsed.slice(0, 12))
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
  }, [workspaceId])

  const toggleFavorite = (item: { label: string; path: string }) => {
    if (!workspaceId) return
    const key = `rundesk.navFavorites.${workspaceId}`
    setFavoriteItems((prev) => {
      const exists = prev.some((f) => pathsEqual(f.path, item.path))
      const next = exists
        ? prev.filter((f) => !pathsEqual(f.path, item.path))
        : [item, ...prev.filter((f) => !pathsEqual(f.path, item.path))].slice(0, 12)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }
  const persistFavorites = (next: Array<{ label: string; path: string }>) => {
    if (!workspaceId) return
    try {
      localStorage.setItem(`rundesk.navFavorites.${workspaceId}`, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
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

  useEffect(() => {
    if (!workspaceId) return
    const storageKey = `rundesk.navRecents.${workspaceId}`
    try {
      const raw = localStorage.getItem(storageKey) ?? localStorage.getItem('rundesk.navRecents')
      if (!raw) return
      const parsed = JSON.parse(raw) as NavRecent[]
      if (!Array.isArray(parsed)) return
      const deduped = parsed.filter(
        (item, index, arr) => arr.findIndex((other) => pathsEqual(other.path, item.path)) === index,
      )
      setRecentItems(deduped.slice(0, 8))
      if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, JSON.stringify(deduped.slice(0, 8)))
      }
    } catch {
      // ignore invalid cached nav recents
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    const hit = recentFromPathname(pathname, workspaceId)
    if (!hit) return
    const storageKey = `rundesk.navRecents.${workspaceId}`
    setRecentItems((prev) => {
      const next = [
        hit,
        ...prev.filter((item) => !pathsEqual(item.path, hit.path)),
      ].slice(0, 8)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // ignore storage failure
      }
      return next
    })
  }, [pathname, workspaceId])

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

  return (
    <aside className="w-72 border-r border-border/60 bg-card/40 backdrop-blur-md h-screen shrink-0 overflow-hidden hidden lg:flex lg:flex-col min-h-0">
      <div className="border-b border-border/60 p-3">
        <button
          className="w-full rounded-lg border border-border/60 bg-card px-3 py-2 text-left hover:bg-accent/10 transition-colors"
          onClick={() => setOpenSwitcher((v) => !v)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{currentWorkspace?.name ?? t('common.workspace')}</p>
              <p className="truncate text-xs text-muted-foreground">{currentOrg?.name ?? t('nav.selectWorkspace')}</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', openSwitcher && 'rotate-180')} />
          </div>
        </button>
        {openSwitcher && (
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border/60 bg-card p-1">
            {organizations.map((org) => {
              const orgWorkspaces = workspaces.filter((w) => w.organizationId === org.id)
              return (
                <div key={org.id} className="mb-1 last:mb-0">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{org.name}</div>
                  {orgWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/10 flex items-center justify-between',
                        ws.id === workspaceId && 'bg-accent/15 text-foreground',
                      )}
                      onClick={() => {
                        setOpenSwitcher(false)
                        navigate({ to: '/app/$workspaceId', params: { workspaceId: ws.id } })
                      }}
                    >
                      <span className="truncate">{ws.name}</span>
                      {ws.id === workspaceId && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              )
            })}
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-1"
              onClick={() => {
                setOpenSwitcher(false)
                setWsDialogOpen(true)
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('nav.newWorkspace')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {workspaceId && (
          <div className="p-2 space-y-2">
          <NavLink to="/app/$workspaceId" params={{ workspaceId }} icon={Home} label={t('nav.home')} />

          <div className="pt-1">
            <button
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
              onClick={() => setFavoritesExpanded((v) => !v)}
            >
              <span>{t('nav.favorites')}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', favoritesExpanded && 'rotate-180')} />
            </button>
            {favoritesExpanded && (
              <div className="space-y-1">
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
                {featureEnabled(FLAGS.AI) && (
                  <NavLink to="/app/$workspaceId/ai" params={{ workspaceId }} icon={Bot} label={t('nav.ai')} compact />
                )}
                <NavLink to="/app/$workspaceId/whiteboards" params={{ workspaceId }} icon={Frame} label={t('nav.whiteboards')} compact />
                {featureEnabled(FLAGS.FORMS) && (
                  <NavLink to="/app/$workspaceId/forms" params={{ workspaceId }} icon={ClipboardList} label={t('nav.forms')} compact />
                )}
                {featureEnabled(FLAGS.AI_AUTOMATIONS) && (
                  <NavLink to="/app/$workspaceId/automations" params={{ workspaceId }} icon={Zap} label={t('nav.automations')} compact />
                )}
                {featureEnabled(FLAGS.VIEWS_WORKLOAD) && (
                  <NavLink to="/app/$workspaceId/workload" params={{ workspaceId }} icon={BarChart3} label={t('nav.workload')} compact />
                )}
                <NavLink to="/app/$workspaceId/timeline" params={{ workspaceId }} icon={GitBranch} label={t('nav.timeline')} compact />
                {featureEnabled(FLAGS.GOALS) && (
                  <NavLink to={"/app/$workspaceId/goals" as any} params={{ workspaceId }} icon={ClipboardList} label={t('nav.goals')} compact />
                )}
                {featureEnabled(FLAGS.REPORTING) && (
                  <NavLink to={"/app/$workspaceId/reports" as any} params={{ workspaceId }} icon={BarChart3} label={t('nav.reports')} compact />
                )}
                {featureEnabled(FLAGS.TIME_TRACKING) && (
                  <NavLink to={"/app/$workspaceId/time" as any} params={{ workspaceId }} icon={Clock3} label={t('nav.time')} compact />
                )}
                <NavLink to="/app/$workspaceId/templates" params={{ workspaceId }} icon={Layers} label={t('nav.templates')} compact />
                {featureEnabled(FLAGS.INTEGRATIONS) && (
                  <NavLink to="/app/$workspaceId/integrations" params={{ workspaceId }} icon={PlugZap} label={t('nav.integrations')} compact />
                )}
                <NavLink to={"/app/$workspaceId/mindmaps" as any} params={{ workspaceId }} icon={Frame} label={t('nav.mindMaps')} compact />
                <NavLink to={"/app/$workspaceId/clips" as any} params={{ workspaceId }} icon={MessageCircle} label={t('nav.clips')} compact />
                {isAdmin && (
                  <NavLink to="/app/$workspaceId/settings" params={{ workspaceId }} icon={Settings} label={t('nav.settings')} compact />
                )}
              </div>
            )}
          </div>
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
            <div className="px-2 py-1 rounded-md border border-dashed border-border/70 bg-card/40 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              {t('nav.starHint')}
            </div>
            <div className="px-2 py-1 rounded-md border border-dashed border-border/70 bg-card/40 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {t('nav.recentHint')}
            </div>
            {spaceTreeQuery.data?.map((space) => {
              const renderProjectNode = (project: (typeof space.projects)[number]) => (
                <div key={project.id} className="space-y-0.5">
                  <div className="group flex items-center gap-1">
                    <button
                      className="flex-1 min-w-0 flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                      onClick={() => setExpandedProjects((prev) => ({ ...prev, [project.id]: !prev[project.id] }))}
                    >
                      <ChevronDown
                        className={cn('h-3 w-3 transition-transform', expandedProjects[project.id] && 'rotate-180')}
                      />
                      <Link
                        to="/app/$workspaceId/$spaceId/$projectId"
                        params={{ workspaceId, spaceId: space.id, projectId: project.id }}
                        className="truncate hover:text-foreground"
                      >
                        {project.name}
                      </Link>
                    </button>
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
                  {expandedProjects[project.id] && (
                    <div className="ml-5 space-y-0.5">
                      {project.lists.map((list) => {
                        const listPath = resolveRoutePath(
                          '/app/$workspaceId/$spaceId/$projectId/$listId',
                          {
                            workspaceId,
                            spaceId: space.id,
                            projectId: project.id,
                            listId: list.id,
                          },
                        )
                        const listActive = pathsEqual(pathname, listPath)
                        return (
                        <div key={list.id} className="group flex items-center gap-1">
                          <Link
                            to="/app/$workspaceId/$spaceId/$projectId/$listId"
                            params={{ workspaceId, spaceId: space.id, projectId: project.id, listId: list.id }}
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
                                onClick={() =>
                                  setMoveItem({
                                    kind: 'list',
                                    id: list.id,
                                    name: list.name,
                                    spaceId: space.id,
                                    parentId: project.id,
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
                <div className="group flex items-center gap-1">
                  <button
                    className="flex-1 min-w-0 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                    onClick={() => setExpandedSpaces((prev) => ({ ...prev, [space.id]: !prev[space.id] }))}
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expandedSpaces[space.id] && 'rotate-180')} />
                    {space.icon ? (
                      <span className="h-4 w-4 shrink-0 flex items-center justify-center text-sm leading-none">{space.icon}</span>
                    ) : (
                      <FolderOpen className="h-4 w-4 shrink-0" style={space.color ? { color: space.color } : undefined} />
                    )}
                    <Link
                      to="/app/$workspaceId/$spaceId"
                      params={{ workspaceId, spaceId: space.id }}
                      className="truncate hover:text-foreground"
                    >
                      {space.name}
                    </Link>
                  </button>
                  <button
                    className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground"
                    aria-label={t('nav.addProjectTo', { name: space.name })}
                    title={t('nav.newProject')}
                    onClick={() => void createProject(space.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
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
                {expandedSpaces[space.id] && (
                  <div className="ml-6 space-y-0.5">
                    {(space.folders ?? []).map((folder) => {
                      const folderProjects = space.projects.filter((p) => p.folderId === folder.id)
                      const open = expandedFolders[folder.id] ?? true
                      return (
                        <div key={folder.id} className="space-y-0.5">
                          <div className="group flex items-center gap-1">
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
                                  className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent/20 hover:text-foreground data-[state=open]:opacity-100"
                                  aria-label={t('nav.actionsFor', { name: folder.name })}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => setTreeEdit({ kind: 'folder', spaceId: space.id, id: folder.id, name: folder.name })}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  {t('container.rename')}
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
                            <div className="ml-4 space-y-0.5">
                              {folderProjects.map((project) => renderProjectNode(project))}
                              {folderProjects.length === 0 && (
                                <div className="px-2 py-1 text-[11px] text-muted-foreground">{t('nav.emptyFolder')}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {ungrouped.map((project) => renderProjectNode(project))}
                    {space.projects.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">{t('nav.noProjects')}</div>
                    )}
                    <button
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
                      onClick={() => createFolder(space.id)}
                    >
                      <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                      {t('nav.newFolder')}
                    </button>
                  </div>
                )}
              </div>
              )
            })}
            {spaceTreeQuery.isLoading && <p className="px-2 py-1 text-xs text-muted-foreground">{t('nav.loadingSpaces')}</p>}
            {!spaceTreeQuery.isLoading && (spacesQuery.data?.length ?? 0) === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('nav.noSpaces')}</p>
            )}
            <button
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-left text-muted-foreground hover:text-foreground hover:bg-accent/10"
              onClick={() => setSpaceDialog({ mode: 'create', name: '' })}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {t('nav.newSpace')}
            </button>
            </div>
          )}
        </div>
      </div>
      {workspaceId && (
        <>
          <div
            ref={dockRef}
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
            <DockLink to="/app/$workspaceId" params={{ workspaceId: workspaceId! }} icon={Home} label={t('nav.home')} />
            <DockLink to="/app/$workspaceId/inbox" params={{ workspaceId: workspaceId! }} icon={Inbox} label={t('nav.inbox')} />
            {featureEnabled(FLAGS.CHAT) && (
              <DockLink to="/app/$workspaceId/chat" params={{ workspaceId: workspaceId! }} icon={MessageCircle} label={t('nav.chat')} />
            )}
            {featureEnabled(FLAGS.AI) && (
              <DockLink to="/app/$workspaceId/ai" params={{ workspaceId: workspaceId! }} icon={Bot} label={t('nav.ai')} />
            )}
            {featureEnabled(FLAGS.DOCS) && (
              <DockLink to="/app/$workspaceId/docs" params={{ workspaceId: workspaceId! }} icon={FileText} label={t('nav.docs')} />
            )}
            {featureEnabled(FLAGS.VIEWS_DASHBOARD) && (
              <DockLink to="/app/$workspaceId/dashboard" params={{ workspaceId: workspaceId! }} icon={LayoutDashboard} label={t('nav.dashboards')} />
            )}
            {isAdmin && (
              <DockLink to="/app/$workspaceId/settings" params={{ workspaceId: workspaceId! }} icon={Settings} label={t('nav.settings')} />
            )}
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

      <ContainerEditDialog
        open={treeEdit !== null}
        onOpenChange={(next) => {
          if (!next) setTreeEdit(null)
        }}
        title={treeEdit?.kind === 'folder' ? t('folder.renameTitle') : t('container.rename')}
        initial={{ name: treeEdit?.name ?? '' }}
        submitting={savingEdit}
        onSubmit={submitTreeEdit}
      />

      <ContainerEditDialog
        open={spaceDialog !== null}
        onOpenChange={(next) => {
          if (!next) setSpaceDialog(null)
        }}
        title={spaceDialog?.mode === 'create' ? t('nav.newSpace') : t('space.editTitle')}
        initial={{ name: spaceDialog?.name ?? '' }}
        submitting={savingSpace}
        onSubmit={submitSpaceDialog}
      />

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

      <ContainerEditDialog
        open={wsDialogOpen}
        onOpenChange={setWsDialogOpen}
        title={t('nav.newWorkspace')}
        initial={{ name: '' }}
        submitting={savingWs}
        onSubmit={submitWorkspaceDialog}
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

function NavLink({
  to,
  params,
  icon: Icon,
  label,
  compact,
}: {
  to:
    | '/app/$workspaceId'
    | '/app/$workspaceId/inbox'
    | '/app/$workspaceId/chat'
    | '/app/$workspaceId/ai'
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
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const href = resolveRoutePath(to, params)
  const isActive = isNavPathActive(pathname, href, to === '/app/$workspaceId')

  return (
    <Link
      to={to}
      params={params}
      className={cn(
        'flex items-center gap-2 rounded-md hover:bg-accent/10',
        compact ? 'px-2 py-1.5 text-[13px]' : 'px-2 py-1.5 text-sm',
        isActive
          ? 'bg-accent/15 text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

function DockLink({
  to,
  params,
  icon: Icon,
  label,
}: {
  to:
    | '/app/$workspaceId'
    | '/app/$workspaceId/inbox'
    | '/app/$workspaceId/chat'
    | '/app/$workspaceId/ai'
    | '/app/$workspaceId/docs'
    | '/app/$workspaceId/dashboard'
    | '/app/$workspaceId/settings'
  params: { workspaceId: string }
  icon: typeof Home
  label: string
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const href = resolveRoutePath(to, params)
  const isActive = isNavPathActive(pathname, href, to === '/app/$workspaceId')

  return (
    <Link
      to={to}
      params={params}
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
