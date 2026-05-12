import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from '@rundesk/ui'
import {
  Sparkles,
  FolderTree,
  CheckCircle2,
  FileText,
  Target,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

/**
 * Empty-workspace welcome card with a one-click "Load demo data" CTA.
 * Renders nothing (passes through children if provided) when the
 * workspace already has any spaces.
 *
 * Used on the Dashboard route as the gate between a brand-new
 * workspace and the empty-stats screen.
 */
export function DemoDataEmptyState({
  workspaceId,
  children,
}: {
  workspaceId: string
  children?: React.ReactNode
}) {
  const qc = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(`rd:demo-dismissed:${workspaceId}`) === '1'
    } catch {
      return false
    }
  })

  // Cheap "is the workspace empty?" check — reuses the existing
  // spaces endpoint so we don't add a dedicated probe route.
  const spacesQuery = useQuery({
    queryKey: ['spaces-for-empty-state', workspaceId],
    queryFn: () => api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}`),
  })

  const seed = useMutation({
    mutationFn: () =>
      api<{ ok: true; summary: Record<string, number> }>(
        `/workspaces/${workspaceId}/sample-data/seed`,
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      const s = res.summary
      toast.success(
        `Demo loaded: ${s.spaces} spaces, ${s.projects} projects, ${s.tasks} tasks, ${s.docs} docs.`,
      )
      // Nuke every workspace-scoped query so the freshly seeded data
      // surfaces everywhere immediately.
      qc.invalidateQueries()
      setConfirmOpen(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load demo data')
    },
  })

  // While we don't yet know whether the workspace is empty, render
  // children so the page doesn't flash a blank box.
  if (spacesQuery.isLoading) return <>{children}</>
  if ((spacesQuery.data?.length ?? 0) > 0) return <>{children}</>
  if (dismissed) return <>{children}</>

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <Card className="p-10 text-center bg-gradient-to-b from-card to-card/40 border-border/50">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow mb-5">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-semibold mb-2">
          Welcome to your workspace
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-7">
          This workspace is empty. Load a curated demo so you can explore tasks, custom statuses,
          docs, goals, and labels right away — or start from scratch.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7 text-left max-w-2xl mx-auto">
          <Feature icon={FolderTree} label="3 spaces, 6 projects" />
          <Feature icon={CheckCircle2} label="40+ tasks with subtasks" />
          <Feature icon={FileText} label="4 starter docs" />
          <Feature icon={Target} label="3 quarterly goals" />
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            size="lg"
            variant="gradient"
            onClick={() => setConfirmOpen(true)}
            disabled={seed.isPending}
          >
            {seed.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Load demo data
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={() => {
              // Manual escape: dismiss with a per-workspace localStorage flag
              // so this card stops appearing even if the workspace stays empty.
              try {
                window.localStorage.setItem(`rd:demo-dismissed:${workspaceId}`, '1')
              } catch {
                // Ignore — non-essential.
              }
              setDismissed(true)
            }}
          >
            Start from scratch
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(v) => !seed.isPending && setConfirmOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load demo data?</DialogTitle>
            <DialogDescription>
              This adds 3 spaces (Engineering, Design, Marketing) with realistic projects, lists,
              tasks, subtasks, labels, checklists, docs and goals — all owned by you. The action
              is one-shot: it only runs while the workspace is empty.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={seed.isPending}>
              Cancel
            </Button>
            <Button
              variant="gradient"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
            >
              {seed.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading…
                </>
              ) : (
                'Load demo data'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Feature({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-xs">
      <Icon className="h-4 w-4 text-accent shrink-0" />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
