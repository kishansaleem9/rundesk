import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { TaskTemplatesSection } from '../components/task-templates-section'
import {
  Card,
  Button,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
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
} from 'lucide-react'

function isUuidLike(value?: string): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

type Template = {
  id: string
  name: string
  description: string
  category: 'project' | 'task' | 'doc'
  popular?: boolean
  builtIn?: boolean
  icon: React.ElementType
  cover: string
  uses: number
}

const TEMPLATES: Template[] = [
  {
    id: 'sw-sprint',
    name: 'Software sprint',
    description: 'Lists, statuses & automations tuned for engineering teams. Includes burndown.',
    category: 'project',
    popular: true,
    builtIn: true,
    icon: Code2,
    cover: 'linear-gradient(135deg, hsl(217 60% 55%), hsl(268 88% 60%))',
    uses: 142,
  },
  {
    id: 'client-onboarding',
    name: 'Client onboarding',
    description: 'Kickoff → discovery → handoff. Built-in checklists for each phase.',
    category: 'project',
    popular: true,
    builtIn: true,
    icon: Users,
    cover: 'linear-gradient(135deg, hsl(160 70% 50%), hsl(190 80% 55%))',
    uses: 98,
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing campaign',
    description: 'Content calendar, briefs, design review, launch checklist.',
    category: 'project',
    builtIn: true,
    icon: Megaphone,
    cover: 'linear-gradient(135deg, hsl(330 88% 60%), hsl(15 85% 60%))',
    uses: 67,
  },
  {
    id: 'product-launch',
    name: 'Product launch',
    description: 'Cross-functional plan with go/no-go gates, PR tasks, ops readiness.',
    category: 'project',
    builtIn: true,
    icon: Rocket,
    cover: 'linear-gradient(135deg, hsl(35 95% 60%), hsl(330 88% 60%))',
    uses: 54,
  },
  {
    id: 'okr-quarterly',
    name: 'OKR quarterly cycle',
    description: 'Set objectives, draft key results, run weekly check-ins.',
    category: 'project',
    builtIn: true,
    icon: ListChecks,
    cover: 'linear-gradient(135deg, hsl(268 88% 60%), hsl(217 60% 55%))',
    uses: 39,
  },
  {
    id: 'bug-triage',
    name: 'Bug triage flow',
    description: 'Severity tags, repro template, reproduction-steps custom field.',
    category: 'task',
    builtIn: true,
    icon: Bug,
    cover: 'linear-gradient(135deg, hsl(0 70% 55%), hsl(35 95% 60%))',
    uses: 213,
  },
  {
    id: 'standup-doc',
    name: 'Daily standup',
    description: 'Three-line template: yesterday / today / blockers.',
    category: 'doc',
    builtIn: true,
    icon: Calendar,
    cover: 'linear-gradient(135deg, hsl(217 60% 55%), hsl(160 70% 50%))',
    uses: 421,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Attendees, agenda, decisions, action items — auto-extract via AI.',
    category: 'doc',
    popular: true,
    builtIn: true,
    icon: GraduationCap,
    cover: 'linear-gradient(135deg, hsl(190 80% 55%), hsl(268 88% 60%))',
    uses: 312,
  },
  {
    id: 'one-on-one',
    name: '1:1 agenda',
    description: 'Persistent agenda + parking lot. Continuous notes between meetings.',
    category: 'doc',
    builtIn: true,
    icon: Briefcase,
    cover: 'linear-gradient(135deg, hsl(35 95% 60%), hsl(160 70% 50%))',
    uses: 189,
  },
  {
    id: 'sprint-retro',
    name: 'Sprint retrospective',
    description: 'Start / Stop / Continue with action items rolled into next sprint.',
    category: 'doc',
    builtIn: true,
    icon: Sparkles,
    cover: 'linear-gradient(135deg, hsl(330 88% 60%), hsl(268 88% 60%))',
    uses: 76,
  },
]

export function TemplatesPage() {
  const params = useParams({ from: '/app/$workspaceId/templates' }) as { workspaceId?: string }
  const workspaceId = isUuidLike(params.workspaceId) ? params.workspaceId : null
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'project' | 'task' | 'doc'>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [applySuccess, setApplySuccess] = useState<string | null>(null)
  const filtered = TEMPLATES.filter((t) => {
    if (filter !== 'all' && t.category !== filter) return false
    return t.name.toLowerCase().includes(query.toLowerCase()) || t.description.toLowerCase().includes(query.toLowerCase())
  })

  const counts = {
    all: TEMPLATES.length,
    project: TEMPLATES.filter((t) => t.category === 'project').length,
    task: TEMPLATES.filter((t) => t.category === 'task').length,
    doc: TEMPLATES.filter((t) => t.category === 'doc').length,
  }

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
            Spin up a project, task or doc from a battle-tested starting point.
          </p>
        </div>
        <Button variant="gradient" size="lg">
          <LayoutTemplate className="h-4 w-4" /> Save current as template
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
          {(['all', 'project', 'task', 'doc'] as const).map((f) => (
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
              {f === 'all' ? 'All' : f === 'doc' ? 'Docs' : `${f}s`} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {workspaceId && <TaskTemplatesSection workspaceId={workspaceId} />}

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Starter templates</h2>
          <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onUse={() => setSelectedTemplate(t)} />
          ))}
        </div>
      </div>

      <Dialog open={Boolean(selectedTemplate)} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use template: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              Create a new {selectedTemplate?.category} from this template with prefilled defaults.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name for new item" defaultValue={selectedTemplate?.name} />
            <Input placeholder="Owner / assignee (optional)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedTemplate) return
                  setApplySuccess(selectedTemplate.name)
                  setSelectedTemplate(null)
                }}
              >
                Apply template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {applySuccess && (
        <Card className="p-3 text-sm text-emerald-300 border-emerald-600/40">
          Template applied successfully: {applySuccess}
        </Card>
      )}
    </div>
  )
}

function TemplateCard({ template, onUse }: { template: Template; onUse: () => void }) {
  const Icon = template.icon
  return (
    <Card variant="glass" className="overflow-hidden p-0 group transition-all hover:shadow-glow hover:border-accent/40">
      <div
        className="relative h-32 overflow-hidden flex items-center justify-center"
        style={{ background: template.cover }}
      >
        <div className="absolute inset-0 bg-grid-dim opacity-40" />
        <Icon className="h-12 w-12 text-white/90" />
        {template.popular && (
          <Badge variant="soft" className="absolute top-2 left-2 text-[10px] backdrop-blur-sm bg-black/30 text-white border-transparent">
            <Sparkles className="h-3 w-3" /> Popular
          </Badge>
        )}
        <Badge variant="soft" className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-black/30 text-white border-transparent capitalize">
          {template.category}
        </Badge>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate flex-1">{template.name}</span>
          {template.builtIn && (
            <Badge variant="soft" className="text-[9px] uppercase">
              Built-in
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {template.description}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            <Check className="h-3 w-3 inline" /> {template.uses} uses
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onUse}>
            Use template
          </Button>
        </div>
      </div>
    </Card>
  )
}
