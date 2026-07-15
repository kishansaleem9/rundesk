import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BellPlus, Bell, Trash2 } from 'lucide-react'
import { Button, Input, Popover, PopoverContent, PopoverTrigger, cn, toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'

type Reminder = {
  id: string
  taskId: string
  note: string | null
  remindAt: string
  notifiedAt: string | null
}

/** Default the picker to one hour from now, formatted for datetime-local. */
function defaultRemindAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  // datetime-local wants local wall-clock without timezone/seconds.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * "Remind me" control for a task (Plan §4/§10). Sets a personal reminder at a
 * chosen time; when it fires it lands in the notifications inbox. Lists the
 * caller's pending reminders on the task with inline delete.
 */
export function TaskReminderButton({
  workspaceId,
  taskId,
  className,
}: {
  workspaceId?: string
  taskId: string
  className?: string
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState(defaultRemindAt)
  const [note, setNote] = useState('')

  const key = ['task-reminders', taskId]
  const { data: reminders = [] } = useQuery({
    queryKey: key,
    enabled: !!workspaceId && !!taskId && open,
    queryFn: () => api<Reminder[]>(`/workspaces/${workspaceId}/tasks/${taskId}/reminders`),
  })
  const pending = reminders.filter((r) => !r.notifiedAt)

  const create = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/reminders`, {
        method: 'POST',
        body: { taskId, remindAt: new Date(when).toISOString(), note: note.trim() || undefined },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key })
      setNote('')
      setWhen(defaultRemindAt())
      toast.success('Reminder set')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not set reminder'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/reminders/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const valid = !!when && !Number.isNaN(new Date(when).getTime()) && new Date(when).getTime() > Date.now()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Remind me"
          aria-label="Set a reminder"
          className={cn(
            'inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground',
            pending.length > 0 && 'text-violet-500',
            className,
          )}
        >
          {pending.length > 0 ? <Bell className="h-4 w-4 fill-current" /> : <BellPlus className="h-4 w-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2.5">
        <div className="text-[13px] font-semibold text-foreground">Remind me about this task</div>
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">When</label>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-8 text-[13px]"
          />
          <Input
            placeholder="Optional note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 text-[13px]"
          />
          <Button
            size="sm"
            className="h-8 w-full text-xs"
            disabled={!valid || !workspaceId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Setting…' : 'Set reminder'}
          </Button>
        </div>

        {pending.length > 0 && (
          <div className="pt-1 border-t border-border/60 space-y-1">
            <div className="text-[11px] text-muted-foreground">Pending</div>
            {pending.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[12px]">
                <Bell className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">
                    {new Date(r.remindAt).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                  {r.note && <span className="block truncate text-muted-foreground">{r.note}</span>}
                </span>
                <button
                  type="button"
                  title="Delete reminder"
                  onClick={() => remove.mutate(r.id)}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
