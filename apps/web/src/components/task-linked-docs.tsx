import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText, Link2, Plus, X } from 'lucide-react'
import { Button, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@rundesk/ui'
import { api } from '../lib/api'

type LinkedDoc = { id: string; docId: string; title: string; icon: string | null; isArchived: boolean }
type WorkspaceDoc = { id: string; title: string; icon?: string | null }

/**
 * "Linked docs" on a task (Plan §4 relationships). Lists the docs attached to a
 * task, opens them in the docs route, and links/unlinks workspace docs.
 */
export function LinkedDocsSection({ taskId, workspaceId }: { taskId: string; workspaceId?: string }) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const linkedQuery = useQuery({
    queryKey: ['task-linked-docs', taskId],
    queryFn: () => api<LinkedDoc[]>(`/tasks/${taskId}/linked-docs`),
  })
  const docsQuery = useQuery({
    queryKey: ['docs', workspaceId],
    enabled: !!workspaceId && pickerOpen,
    queryFn: () => api<WorkspaceDoc[]>(`/workspaces/${workspaceId}/docs`),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['task-linked-docs', taskId] })
  const link = useMutation({
    mutationFn: (docId: string) => api(`/tasks/${taskId}/linked-docs`, { method: 'POST', body: { docId } }),
    onSuccess: invalidate,
  })
  const unlink = useMutation({
    mutationFn: (docId: string) => api(`/tasks/${taskId}/linked-docs/${docId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const linked = linkedQuery.data ?? []
  const linkedIds = new Set(linked.map((l) => l.docId))
  const q = search.trim().toLowerCase()
  const candidates = (docsQuery.data ?? [])
    .filter((d) => !linkedIds.has(d.id))
    .filter((d) => !q || (d.title || 'Untitled').toLowerCase().includes(q))
    .slice(0, 30)

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Linked docs</div>
        {workspaceId && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Link
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <Input
                autoFocus
                placeholder="Search docs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-[13px] mb-1.5"
              />
              <div className="max-h-56 overflow-auto space-y-0.5">
                {candidates.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={link.isPending}
                    onClick={() => {
                      link.mutate(d.id)
                      setSearch('')
                      setPickerOpen(false)
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent/10"
                  >
                    <span className="text-sm">{d.icon ?? '📄'}</span>
                    <span className="truncate">{d.title || 'Untitled'}</span>
                  </button>
                ))}
                {docsQuery.isSuccess && candidates.length === 0 && (
                  <p className="px-2 py-2 text-[12px] text-muted-foreground">
                    {q ? 'No matching docs' : 'No docs to link'}
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked docs.</p>
      ) : (
        <div className="space-y-1">
          {linked.map((l) => (
            <div
              key={l.id}
              className="group flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm hover:bg-accent/5"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Link
                to="/app/$workspaceId/docs"
                params={{ workspaceId: workspaceId ?? '' }}
                search={{ doc: l.docId } as never}
                className={cn('flex items-center gap-1.5 flex-1 min-w-0 hover:underline', l.isArchived && 'text-muted-foreground line-through')}
              >
                <span>{l.icon ?? '📄'}</span>
                <span className="truncate">{l.title || 'Untitled'}</span>
              </Link>
              <button
                type="button"
                title="Unlink"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate(l.docId)}
                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
