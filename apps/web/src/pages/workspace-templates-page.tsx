import { useMemo, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TaskTemplatesSection } from '../components/task-templates-section'
import { api, ApiError } from '../lib/api'
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  cn,
  toast,
} from '@rundesk/ui'
import {
  Search,
  LayoutTemplate,
  Rocket,
  Sparkles,
  Megaphone,
  Bug,
  ListChecks,
  Calendar,
  Code2,
  Briefcase,
  Users,
  GraduationCap,
  Check,
  ListTree,
} from 'lucide-react'

function isUuidLike(value?: string): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

type TemplateTask = { title: string; description?: string | null; priority?: string; status?: string }
type TemplateList = { name: string; position?: number; tasks: TemplateTask[] }
type ProjectTemplate = {
  id: string
  workspaceId: string | null
  name: string
  description: string | null
  icon: string | null
  isBuiltIn: boolean
  payload: { lists: TemplateList[] }
  createdAt: string
}

type NamedRow = { id: string; name: string }

const ICONS: Record<string, React.ElementType> = {
  Code2, Users, Megaphone, Rocket, ListChecks, Bug, Calendar, Sparkles, GraduationCap, Briefcase,
}
const COVERS: Record<string, string> = {
  Code2: 'linear-gradient(135deg, hsl(217 60% 55%), hsl(268 88% 60%))',
  Users: 'linear-gradient(135deg, hsl(160 70% 50%), hsl(190 80% 55%))',
  Megaphone: 'linear-gradient(135deg, hsl(330 88% 60%), hsl(15 85% 60%))',
  Rocket: 'linear-gradient(135deg, hsl(35 95% 60%), hsl(330 88% 60%))',
  ListChecks: 'linear-gradient(135deg, hsl(268 88% 60%), hsl(217 60% 55%))',
  Bug: 'linear-gradient(135deg, hsl(0 70% 55%), hsl(35 95% 60%))',
}
const FALLBACK_COVER = 'linear-gradient(135deg, hsl(217 30% 40%), hsl(268 40% 45%))'

function iconFor(name: string | null): React.ElementType {
  return (name && ICONS[name]) || LayoutTemplate
}
function coverFor(name: string | null): string {
  return (name && COVERS[name]) || FALLBACK_COVER
}
function taskCount(t: ProjectTemplate): number {
  return t.payload?.lists?.reduce((n, l) => n + (l.tasks?.length ?? 0), 0) ?? 0
}

export function TemplatesPage() {
  const params = useParams({ from: '/app/$workspaceId/templates' }) as { workspaceId?: string }
  const workspaceId = isUuidLike(params.workspaceId) ? params.workspaceId : null
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'builtin' | 'custom'>('all')
  const [applyTemplate, setApplyTemplate] = useState<ProjectTemplate | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)

  const templatesQuery = useQuery({
    queryKey: ['project-templates', workspaceId],
    queryFn: () => api<ProjectTemplate[]>(`/workspaces/${workspaceId}/project-templates`),
    enabled: Boolean(workspaceId),
  })

  const templates = templatesQuery.data ?? []
  const counts = useMemo(
    () => ({
      all: templates.length,
      builtin: templates.filter((t) => t.isBuiltIn).length,
      custom: templates.filter((t) => !t.isBuiltIn).length,
    }),
    [templates],
  )
  const filtered = templates.filter((t) => {
    if (filter === 'builtin' && !t.isBuiltIn) return false
    if (filter === 'custom' && t.isBuiltIn) return false
    const q = query.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Workspace templates
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <LayoutTemplate className="h-4 w-4" />
            </span>
            Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Spin up a project from a battle-tested starting point, or save an existing project as a reusable template.
          </p>
        </div>
        <Button variant="gradient" size="lg" onClick={() => setSaveOpen(true)} disabled={!workspaceId}>
          <LayoutTemplate className="h-4 w-4" /> Save project as template
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          leadingIcon={<Search className="h-4 w-4" />}
          placeholder="Search templates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
          {(['all', 'builtin', 'custom'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md font-medium transition-all capitalize',
                filter === f
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {f === 'all' ? 'All' : f === 'builtin' ? 'Built-in' : 'Custom'} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {workspaceId && <TaskTemplatesSection workspaceId={workspaceId} />}

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Project templates</h2>
          <Badge variant="secondary" className="text-[10px]">{templates.length} available</Badge>
        </div>

        {templatesQuery.isLoading ? (
          <Card variant="glass" className="p-6 text-sm text-muted-foreground">Loading templates…</Card>
        ) : filtered.length === 0 ? (
          <Card variant="glass" className="p-6 text-sm text-muted-foreground">
            {query || filter !== 'all'
              ? 'No templates match your search.'
              : 'No templates yet. Save a project as a template to get started.'}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} onUse={() => setApplyTemplate(t)} />
            ))}
          </div>
        )}
      </div>

      {workspaceId && (
        <ApplyTemplateDialog
          workspaceId={workspaceId}
          template={applyTemplate}
          onClose={() => setApplyTemplate(null)}
        />
      )}
      {workspaceId && (
        <SaveTemplateDialog
          workspaceId={workspaceId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
        />
      )}
    </div>
  )
}

function TemplateCard({ template, onUse }: { template: ProjectTemplate; onUse: () => void }) {
  const Icon = iconFor(template.icon)
  const lists = template.payload?.lists?.length ?? 0
  const tasks = taskCount(template)
  return (
    <Card variant="glass" className="overflow-hidden p-0 group transition-all hover:shadow-glow hover:border-accent/40">
      <div className="relative h-32 overflow-hidden flex items-center justify-center" style={{ background: coverFor(template.icon) }}>
        <div className="absolute inset-0 bg-grid-dim opacity-40" />
        <Icon className="h-12 w-12 text-white/90" />
        <Badge
          variant="soft"
          className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-black/30 text-white border-transparent"
        >
          {template.isBuiltIn ? 'Built-in' : 'Custom'}
        </Badge>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate flex-1">{template.name}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[2rem]">
          {template.description}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <ListTree className="h-3 w-3" /> {lists} {lists === 1 ? 'list' : 'lists'} · {tasks} {tasks === 1 ? 'task' : 'tasks'}
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onUse}>
            Use template
          </Button>
        </div>
      </div>
    </Card>
  )
}

function ApplyTemplateDialog({
  workspaceId,
  template,
  onClose,
}: {
  workspaceId: string
  template: ProjectTemplate | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const open = Boolean(template)

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<NamedRow[]>(`/spaces/workspace/${workspaceId}`),
    enabled: open,
  })
  const spaces = spacesQuery.data ?? []

  const [projectName, setProjectName] = useState('')
  const [spaceId, setSpaceId] = useState('')

  // Seed defaults when the dialog opens / data arrives.
  const effectiveName = projectName || template?.name || ''
  const effectiveSpace = spaceId || spaces[0]?.id || ''

  const apply = useMutation({
    mutationFn: () =>
      api<{ project: { id: string }; listsCreated: number; tasksCreated: number }>(
        `/workspaces/${workspaceId}/project-templates/apply`,
        { method: 'POST', body: { templateId: template!.id, targetSpaceId: effectiveSpace, projectName: effectiveName } },
      ),
    onSuccess: (res) => {
      toast.success(`Created “${effectiveName}” (${res.listsCreated} lists, ${res.tasksCreated} tasks)`)
      handleClose()
      navigate({
        to: '/app/$workspaceId/$spaceId/$projectId',
        params: { workspaceId, spaceId: effectiveSpace, projectId: res.project.id },
      })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to apply template'),
  })

  function handleClose() {
    setProjectName('')
    setSpaceId('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use template: {template?.name}</DialogTitle>
          <DialogDescription>
            Creates a new project — with all lists and task stubs — inside the space you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Project name</Label>
            <Input
              placeholder="Name for the new project"
              value={effectiveName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target space</Label>
            {spacesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading spaces…</p>
            ) : spaces.length === 0 ? (
              <p className="text-xs text-warning">No spaces yet — create a space first, then apply a template.</p>
            ) : (
              <select
                value={effectiveSpace}
                onChange={(e) => setSpaceId(e.target.value)}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => apply.mutate()}
            disabled={apply.isPending || !effectiveName.trim() || !effectiveSpace}
          >
            <Check className="h-3.5 w-3.5" /> {apply.isPending ? 'Applying…' : 'Apply template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SaveTemplateDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [spaceId, setSpaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<NamedRow[]>(`/spaces/workspace/${workspaceId}`),
    enabled: open,
  })
  const spaces = spacesQuery.data ?? []
  const effectiveSpace = spaceId || spaces[0]?.id || ''

  const projectsQuery = useQuery({
    queryKey: ['projects', effectiveSpace],
    queryFn: () => api<NamedRow[]>(`/projects/space/${effectiveSpace}`),
    enabled: open && Boolean(effectiveSpace),
  })
  const projects = projectsQuery.data ?? []
  const effectiveProject = projectId || projects[0]?.id || ''

  const save = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/project-templates/save-from-project`, {
        method: 'POST',
        body: { projectId: effectiveProject, name: name.trim(), description: description.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success('Saved as template')
      qc.invalidateQueries({ queryKey: ['project-templates', workspaceId] })
      reset()
      onOpenChange(false)
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : 'Failed to save template'),
  })

  function reset() {
    setSpaceId('')
    setProjectId('')
    setName('')
    setDescription('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save project as template</DialogTitle>
          <DialogDescription>
            Snapshot an existing project’s lists and tasks into a reusable template (admin only).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Space</Label>
            {spaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">{spacesQuery.isLoading ? 'Loading…' : 'No spaces yet.'}</p>
            ) : (
              <select
                value={effectiveSpace}
                onChange={(e) => { setSpaceId(e.target.value); setProjectId('') }}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            {projectsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading projects…</p>
            ) : projects.length === 0 ? (
              <p className="text-xs text-warning">No projects in this space.</p>
            ) : (
              <select
                value={effectiveProject}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Template name</Label>
            <Input placeholder="e.g. Engineering sprint" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input placeholder="What is this template for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !effectiveProject || !name.trim()}
          >
            <Check className="h-3.5 w-3.5" /> {save.isPending ? 'Saving…' : 'Save template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
