import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Plus, Trash2, X } from 'lucide-react'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, cn } from '@rundesk/ui'
import { api } from '../lib/api'

type StatusCategory = 'open' | 'in_progress' | 'closed'

type ListStatus = {
  id: string
  listId: string
  key: string
  name: string
  color: string
  category: StatusCategory
  position: number
}

const PRESET_COLORS = [
  '#94a3b8', '#64748b', '#3b82f6', '#06b6d4', '#10b981',
  '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#f43f5e',
]

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  open: 'Not started',
  in_progress: 'Active',
  closed: 'Closed',
}

export function ListStatusesManager({
  listId,
  open,
  onOpenChange,
}: {
  listId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const { data: statuses = [] } = useQuery({
    queryKey: ['list-statuses', listId],
    queryFn: () => api<ListStatus[]>(`/lists/${listId}/statuses`),
    enabled: open,
  })

  const [reassignFor, setReassignFor] = useState<{ id: string; name: string } | null>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['list-statuses', listId] })
    void qc.invalidateQueries({ queryKey: ['tasks', listId] })
  }

  const createStatus = useMutation({
    mutationFn: (input: { name: string; color: string; category: StatusCategory }) =>
      api(`/lists/${listId}/statuses`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })

  const updateStatus = useMutation({
    mutationFn: ({ statusId, patch }: { statusId: string; patch: Partial<ListStatus> }) =>
      api(`/lists/${listId}/statuses/${statusId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  })

  const deleteStatus = useMutation({
    mutationFn: ({ statusId, reassignToStatusId }: { statusId: string; reassignToStatusId?: string }) =>
      api(
        `/lists/${listId}/statuses/${statusId}${
          reassignToStatusId ? `?reassignToStatusId=${reassignToStatusId}` : ''
        }`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      setReassignFor(null)
      invalidate()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage list statuses</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Statuses define how work moves through this list. Renaming a status
            updates it everywhere; deleting one prompts you to move its tasks first.
          </p>

          <div className="space-y-2">
            {statuses
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((status) => (
                <StatusRow
                  key={status.id}
                  status={status}
                  onPatch={(patch) => updateStatus.mutate({ statusId: status.id, patch })}
                  onDelete={() => deleteStatus.mutate({ statusId: status.id }, {
                    onError: (err: any) => {
                      // 400 means there are still tasks referencing this status
                      // — surface the reassignment picker.
                      if (typeof err?.message === 'string' && err.message.includes('still use it')) {
                        setReassignFor({ id: status.id, name: status.name })
                      }
                    },
                  })}
                />
              ))}
          </div>

          <AddStatusForm
            onAdd={(input) => createStatus.mutate(input)}
            isPending={createStatus.isPending}
          />
        </div>

        {reassignFor && (
          <ReassignDialog
            open
            sourceName={reassignFor.name}
            options={statuses.filter((s) => s.id !== reassignFor.id)}
            onCancel={() => setReassignFor(null)}
            onConfirm={(toId) =>
              deleteStatus.mutate({ statusId: reassignFor.id, reassignToStatusId: toId })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusRow({
  status,
  onPatch,
  onDelete,
}: {
  status: ListStatus
  onPatch: (patch: Partial<ListStatus>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(status.name)
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1.5">
      <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0" />
      <ColorSwatch color={status.color} onChange={(color) => onPatch({ color })} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim()
          if (trimmed && trimmed !== status.name) onPatch({ name: trimmed })
          else setName(status.name)
        }}
        className="h-8 text-sm flex-1 border-0 shadow-none focus-visible:ring-0 px-1"
      />
      <select
        value={status.category}
        onChange={(e) => onPatch({ category: e.target.value as StatusCategory })}
        className="h-7 rounded border border-border/70 bg-background px-2 text-xs"
        aria-label="Status category"
      >
        {(Object.entries(CATEGORY_LABELS) as Array<[StatusCategory, string]>).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onDelete}
        aria-label={`Delete ${status.name}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  )
}

function ColorSwatch({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        className={cn('h-5 w-5 rounded-full border border-border/70')}
        style={{ backgroundColor: color }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick colour"
      />
      {open && (
        <div
          className="absolute z-30 mt-1 grid grid-cols-5 gap-1 rounded-md border border-border bg-popover p-2 shadow-md"
        >
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn('h-5 w-5 rounded-full border border-border/40', color === c && 'ring-2 ring-ring')}
              style={{ backgroundColor: c }}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
              aria-label={`Use colour ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AddStatusForm({
  onAdd,
  isPending,
}: {
  onAdd: (input: { name: string; color: string; category: StatusCategory }) => void
  isPending: boolean
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[2])
  const [category, setCategory] = useState<StatusCategory>('open')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, color, category })
    setName('')
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border/70 px-2 py-1.5">
      <Plus className="h-4 w-4 text-muted-foreground/70 shrink-0" />
      <ColorSwatch color={color} onChange={setColor} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add status…"
        className="h-8 text-sm flex-1 border-0 shadow-none focus-visible:ring-0 px-1"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as StatusCategory)}
        className="h-7 rounded border border-border/70 bg-background px-2 text-xs"
      >
        {(Object.entries(CATEGORY_LABELS) as Array<[StatusCategory, string]>).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={isPending || !name.trim()}>
        Add
      </Button>
    </div>
  )
}

function ReassignDialog({
  open,
  sourceName,
  options,
  onCancel,
  onConfirm,
}: {
  open: boolean
  sourceName: string
  options: ListStatus[]
  onCancel: () => void
  onConfirm: (toId: string) => void
}) {
  const [toId, setToId] = useState(options[0]?.id ?? '')
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move tasks before deleting</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tasks currently set to <span className="font-medium text-foreground">{sourceName}</span> need a new home before this status can be removed.
        </p>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
        >
          {options.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} size="sm">
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button onClick={() => onConfirm(toId)} size="sm" disabled={!toId}>
            Move &amp; delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
