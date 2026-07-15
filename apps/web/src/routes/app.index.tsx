import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'

export const Route = createFileRoute('/app/')({
  component: WorkspacePicker,
})

type WorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

function WorkspacePicker() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { data, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // If the user has exactly one workspace, jump straight in.
  useEffect(() => {
    if (user?.role === 'super_admin') {
      navigate({ to: '/app/admin', replace: true })
      return
    }
    if (data && data.length === 1) {
      navigate({
        to: '/app/$workspaceId',
        params: { workspaceId: data[0].workspace.id },
        replace: true,
      })
    }
  }, [data, navigate, user])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const ws = await api<{ id: string }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      navigate({ to: '/app/$workspaceId', params: { workspaceId: ws.id } })
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : t('appIndex.createError'))
    } finally {
      setCreating(false)
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8">{t('appIndex.loadingWorkspaces')}</p>
  }

  if (error) {
    return <p className="text-destructive p-8">{t('appIndex.loadError')}</p>
  }

  const hasWorkspaces = (data?.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-semibold text-foreground">
          {hasWorkspaces ? t('appIndex.yourWorkspaces') : t('appIndex.createFirstTitle')}
        </h1>
        <p className="text-muted-foreground">
          {hasWorkspaces
            ? t('appIndex.pickPrompt')
            : t('appIndex.createFirstBody')}
        </p>
      </div>

      {hasWorkspaces && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data!.map((entry) => (
            <Card
              key={entry.workspace.id}
              className="cursor-pointer transition-all hover:border-brand-500 hover:shadow-md"
              onClick={() =>
                navigate({
                  to: '/app/$workspaceId',
                  params: { workspaceId: entry.workspace.id },
                })
              }
            >
              <CardHeader>
                <CardTitle className="text-xl">{entry.workspace.name}</CardTitle>
                <CardDescription className="capitalize">
                  {t('appIndex.role', { role: entry.role.replace('_', ' ') })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">
                  {entry.workspace.slug}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>{hasWorkspaces ? t('appIndex.createAnother') : t('appIndex.newWorkspace')}</CardTitle>
          <CardDescription>
            {t('appIndex.adminNote')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="workspace-name">{t('appIndex.nameLabel')}</Label>
              <Input
                id="workspace-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('appIndex.namePlaceholder')}
              />
            </div>
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? t('appIndex.creating') : t('appIndex.createWorkspace')}
            </Button>
          </form>
          {createError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {createError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
