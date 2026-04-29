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

export const Route = createFileRoute('/app/')({
  component: WorkspacePicker,
})

type WorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

function WorkspacePicker() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // If the user has exactly one workspace, jump straight in.
  useEffect(() => {
    if (data && data.length === 1) {
      navigate({
        to: '/app/$workspaceId',
        params: { workspaceId: data[0].workspace.id },
        replace: true,
      })
    }
  }, [data, navigate])

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
      setCreateError(err instanceof ApiError ? err.message : 'Could not create workspace')
    } finally {
      setCreating(false)
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8">Loading workspaces…</p>
  }

  if (error) {
    return <p className="text-destructive p-8">Failed to load workspaces.</p>
  }

  const hasWorkspaces = (data?.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-semibold text-foreground">
          {hasWorkspaces ? 'Your workspaces' : 'Create your first workspace'}
        </h1>
        <p className="text-muted-foreground">
          {hasWorkspaces
            ? 'Pick a workspace to get started.'
            : 'A workspace is a home for your team, spaces, projects, and tasks.'}
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
                  Role: {entry.role.replace('_', ' ')}
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
          <CardTitle>{hasWorkspaces ? 'Create another workspace' : 'New workspace'}</CardTitle>
          <CardDescription>
            You&apos;ll become the workspace admin automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Inc"
              />
            </div>
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? 'Creating…' : 'Create workspace'}
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
