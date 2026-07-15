import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { Webhook, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

type WorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

type Hook = {
  id: string
  name: string
  url: string
  events: string[]
  successCount: number
  failureCount: number
}

// Display labels for the server's webhook event identifiers. The raw event
// string stays the canonical value sent to / stored by the API; only the
// rendered label is localized. Unknown events fall back to their raw id.
const EVENT_LABEL_KEYS: Record<string, TranslationKey> = {
  'task.created': 'adminWebhooks.event.taskCreated',
  'task.updated': 'adminWebhooks.event.taskUpdated',
  'task.deleted': 'adminWebhooks.event.taskDeleted',
  'task.status_changed': 'adminWebhooks.event.taskStatusChanged',
  'task.assigned': 'adminWebhooks.event.taskAssigned',
  'task.assignee_changed': 'adminWebhooks.event.taskAssigneeChanged',
  'comment.created': 'adminWebhooks.event.commentCreated',
  'project.created': 'adminWebhooks.event.projectCreated',
  'project.updated': 'adminWebhooks.event.projectUpdated',
  'member.invited': 'adminWebhooks.event.memberInvited',
  'member.removed': 'adminWebhooks.event.memberRemoved',
  'time.logged': 'adminWebhooks.event.timeLogged',
  'form.submitted': 'adminWebhooks.event.formSubmitted',
}

export function AdminWebhooksPage() {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const eventLabel = (event: string) => {
    const key = EVENT_LABEL_KEYS[event]
    return key ? t(key) : event
  }
  const [workspaceId, setWorkspaceId] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })
  const resolvedWorkspaceId = workspaceId || workspaces.data?.[0]?.workspace.id || ''

  const eventCatalog = useQuery({
    queryKey: ['webhook-events', resolvedWorkspaceId],
    queryFn: () => api<string[]>(`/workspaces/${resolvedWorkspaceId}/webhooks/events`),
    enabled: Boolean(resolvedWorkspaceId),
  })
  const hooks = useQuery({
    queryKey: ['admin-webhooks', resolvedWorkspaceId],
    queryFn: () => api<Hook[]>(`/workspaces/${resolvedWorkspaceId}/webhooks`),
    enabled: Boolean(resolvedWorkspaceId),
  })

  const createHook = useMutation({
    mutationFn: () =>
      api(`/workspaces/${resolvedWorkspaceId}/webhooks`, {
        method: 'POST',
        body: { name, url, events },
      }),
    onSuccess: async () => {
      setName('')
      setUrl('')
      setEvents([])
      await qc.invalidateQueries({ queryKey: ['admin-webhooks', resolvedWorkspaceId] })
    },
  })
  const testHook = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${resolvedWorkspaceId}/webhooks/${id}/test`, { method: 'POST' }),
  })
  const deleteHook = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${resolvedWorkspaceId}/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-webhooks', resolvedWorkspaceId] })
    },
  })

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Webhook className="h-5 w-5 text-accent" />
          {t('adminWebhooks.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('adminWebhooks.subtitle')}</p>
      </header>

      <Card className="p-4 space-y-3">
        <select
          value={resolvedWorkspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm w-full md:w-auto"
        >
          {(workspaces.data ?? []).map((entry) => (
            <option key={entry.workspace.id} value={entry.workspace.id}>
              {entry.workspace.name} ({entry.workspace.slug})
            </option>
          ))}
        </select>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('adminWebhooks.namePlaceholder')} />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('adminWebhooks.urlPlaceholder')} />
        </div>
        <div className="flex flex-wrap gap-1">
          {(eventCatalog.data ?? []).map((eventName) => {
            const selected = events.includes(eventName)
            return (
              <button
                key={eventName}
                onClick={() =>
                  setEvents((prev) => (prev.includes(eventName) ? prev.filter((e) => e !== eventName) : [...prev, eventName]))
                }
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full border',
                  selected ? 'bg-brand-700 border-brand-700 text-white' : 'border-border text-muted-foreground',
                )}
              >
                {eventLabel(eventName)}
              </button>
            )
          })}
        </div>
        <Button
          size="sm"
          onClick={() => createHook.mutate()}
          disabled={!name.trim() || !url.trim() || events.length === 0 || createHook.isPending}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('adminWebhooks.createWebhook')}
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          {tCount('adminWebhooks.configuredCount', (hooks.data ?? []).length)}
        </div>
        {hooks.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('adminWebhooks.loadingWebhooks')}</div>
        ) : (hooks.data ?? []).length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('adminWebhooks.noWebhooks')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {(hooks.data ?? []).map((hook) => (
              <li key={hook.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{hook.name}</div>
                  <div className="text-xs font-mono text-muted-foreground truncate">{hook.url}</div>
                  <div className="text-xs text-muted-foreground truncate">{hook.events.map(eventLabel).join(', ')}</div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  <span className="text-emerald-600">{hook.successCount}✓</span> <span className="text-destructive">{hook.failureCount}✗</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => testHook.mutate(hook.id)} disabled={testHook.isPending}>
                  {t('adminWebhooks.test')}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteHook.mutate(hook.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
