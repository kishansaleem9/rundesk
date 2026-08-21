import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
  toast,
} from '@rundesk/ui'
import { Search, Layers, Folder, FolderKanban, Check, CornerUpLeft } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

/** What can be moved, and therefore what the picker offers as destinations. */
export type MovableKind = 'folder' | 'project' | 'list' | 'task'

type TargetSpace = {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  folders: { id: string; name: string }[]
  projects: { id: string; name: string; folderId: string | null }[]
  lists?: { id: string; name: string; projectId: string }[]
}

/** One selectable destination row, flattened from the space → folder/project tree. */
type Destination =
  | { kind: 'space'; id: string; label: string; spaceId: string; depth: 0 }
  | { kind: 'folder'; id: string; label: string; spaceId: string; depth: 1 }
  | { kind: 'project'; id: string; label: string; spaceId: string; depth: 1 }
  // Only reachable when moving a task, which nests one level deeper.
  | { kind: 'list'; id: string; label: string; spaceId: string; depth: 2 }

export function MoveDialog({
  open,
  onOpenChange,
  workspaceId,
  kind,
  itemId,
  itemName,
  currentSpaceId,
  currentParentId,
  onMoved,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId: string
  kind: MovableKind
  itemId: string
  itemName: string
  /** Space the item lives in today — used to mark the current location. */
  currentSpaceId?: string | null
  /** Folder (for a project) or project (for a list) it currently sits in. */
  currentParentId?: string | null
  onMoved?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const targetsQuery = useQuery({
    queryKey: ['move-targets', workspaceId],
    queryFn: () => api<TargetSpace[]>(`/spaces/workspace/${workspaceId}/move-targets`),
    enabled: open,
  })

  // Flatten the tree into selectable rows. A folder can only move to a space; a
  // project can move to a space or one of its folders; a list moves into a project.
  const rows = useMemo<Destination[]>(() => {
    const spaces = targetsQuery.data ?? []
    const out: Destination[] = []
    for (const sp of spaces) {
      out.push({ kind: 'space', id: sp.id, label: sp.name, spaceId: sp.id, depth: 0 })
      if (kind === 'project') {
        for (const f of sp.folders) out.push({ kind: 'folder', id: f.id, label: f.name, spaceId: sp.id, depth: 1 })
      }
      if (kind === 'list') {
        for (const pr of sp.projects) out.push({ kind: 'project', id: pr.id, label: pr.name, spaceId: sp.id, depth: 1 })
      }
      // A task lands in a list, so show projects as headers and their lists under them.
      if (kind === 'task') {
        for (const pr of sp.projects) {
          out.push({ kind: 'project', id: pr.id, label: pr.name, spaceId: sp.id, depth: 1 })
          for (const li of (sp.lists ?? []).filter((l) => l.projectId === pr.id)) {
            out.push({ kind: 'list', id: li.id, label: li.name, spaceId: sp.id, depth: 2 })
          }
        }
      }
    }
    if (kind === 'task') return out
    // A list can only land in a project, so bare spaces are not selectable there.
    return kind === 'list' ? out.filter((r) => r.kind === 'project' || sp2HasProjects(spaces, r)) : out
  }, [targetsQuery.data, kind])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    // Keep a space header when one of its children matches, so results stay grouped.
    const matching = rows.filter((r) => r.label.toLowerCase().includes(term))
    const spaceIds = new Set(matching.map((r) => r.spaceId))
    return rows.filter((r) => matching.includes(r) || (r.kind === 'space' && spaceIds.has(r.spaceId)))
  }, [rows, search])

  const isCurrent = (r: Destination) => {
    if (kind === 'folder') return r.kind === 'space' && r.id === currentSpaceId
    if (kind === 'project') {
      return currentParentId ? r.kind === 'folder' && r.id === currentParentId
        : r.kind === 'space' && r.id === currentSpaceId
    }
    return r.kind === 'project' && r.id === currentParentId
  }

  const move = useMutation({
    mutationFn: async (dest: Destination) => {
      if (kind === 'folder') {
        return api(`/spaces/${currentSpaceId}/folders/${itemId}/move`, {
          method: 'POST',
          body: { targetSpaceId: dest.id },
        })
      }
      if (kind === 'project') {
        return api(`/projects/${itemId}/move`, {
          method: 'POST',
          body: dest.kind === 'folder' ? { spaceId: dest.spaceId, folderId: dest.id } : { spaceId: dest.id, folderId: null },
        })
      }
      if (kind === 'task') {
        return api(`/tasks/${itemId}/move`, { method: 'POST', body: { listId: dest.id } })
      }
      return api(`/lists/${itemId}/move`, { method: 'POST', body: { projectId: dest.id } })
    },
    onSuccess: () => {
      toast.success(t('move.moved'))
      for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'move-targets']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onOpenChange(false)
      onMoved?.()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('move.failed')),
  })

  /** "Move back" — take a project out of its folder, back to the space root. */
  const moveOutOfFolder = useMutation({
    mutationFn: () => api(`/projects/${itemId}/move`, { method: 'POST', body: { folderId: null } }),
    onSuccess: () => {
      toast.success(t('move.movedOut'))
      for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'move-targets']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onOpenChange(false)
      onMoved?.()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('move.failed')),
  })

  const titleKey =
    kind === 'folder' ? 'move.titleFolder' : kind === 'project' ? 'move.titleProject' : 'move.titleList'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(titleKey, { name: itemName })}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('move.searchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>

        {/* A project sitting in a folder can be pulled back out to the space root. */}
        {kind === 'project' && currentParentId && (
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={moveOutOfFolder.isPending}
            onClick={() => moveOutOfFolder.mutate()}
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
            {t('move.outOfFolder')}
          </Button>
        )}

        <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
          {targetsQuery.isLoading ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground"><InlineSkeleton /></p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">{t('move.noTargets')}</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((r) => {
                const current = isCurrent(r)
                // A space row is only a destination for folders/projects.
                const selectable =
                  kind === 'task' ? r.kind === 'list' : kind === 'list' ? r.kind === 'project' : true
                const Icon = r.kind === 'space' ? Layers : r.kind === 'folder' ? Folder : FolderKanban
                return (
                  <li key={`${r.kind}:${r.id}`}>
                    <button
                      type="button"
                      disabled={!selectable || current || move.isPending}
                      onClick={() => move.mutate(r)}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                        r.depth === 1 && 'pl-7',
                        current
                          ? 'text-muted-foreground cursor-default'
                          : selectable
                            ? 'hover:bg-accent/15 text-foreground'
                            : 'text-muted-foreground cursor-default',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{r.label}</span>
                      {current && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px]">
                          <Check className="h-3 w-3" />
                          {t('move.currentLocation')}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A space header is kept in the list-move picker only when it has projects. */
function sp2HasProjects(spaces: TargetSpace[], row: Destination) {
  if (row.kind !== 'space') return true
  return (spaces.find((s) => s.id === row.spaceId)?.projects.length ?? 0) > 0
}
