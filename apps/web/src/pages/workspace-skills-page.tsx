import { useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Button, Input, Badge, cn, toast } from '@rundesk/ui'
import { Gem, Plus, Search, Sparkles, UserCheck, CheckCircle2, Loader2 } from 'lucide-react'
import { SkillAuthorPanel } from '../components/skill-author-panel'
import { useTranslation } from '../lib/i18n'
import { ListSkeleton } from '../components/loading-skeletons'
import { useAuthStore } from '../store/auth'
import {
  useCreateSkill,
  useSkillCounts,
  useSkillTemplates,
  useSkills,
  type Skill,
  type SkillTab,
  type SkillTemplate,
} from '../lib/skills-api'

/**
 * §15 — the Skills hub, from frames `285_1743`, `290_1756`, `304_1907`.
 *
 * Her page is a header with `+ New Skill`, a row of starter cards, three tabs
 * (All Skills / Enabled / Created by me) and — because she had saved none — an
 * empty state that explains the idea rather than apologising for the blank.
 *
 * The starter cards come from the server, so the copy on them has one home.
 */

const TONE: Record<SkillTemplate['tone'], string> = {
  neutral: 'border-border/70 bg-card',
  coral: 'border-transparent bg-gradient-to-br from-rose-500/15 to-orange-500/10',
  green: 'border-transparent bg-gradient-to-br from-emerald-500/15 to-teal-500/10',
  blue: 'border-transparent bg-gradient-to-br from-sky-500/15 to-indigo-500/10',
}

const TONE_ICON: Record<SkillTemplate['tone'], typeof Gem> = {
  neutral: Gem,
  coral: UserCheck,
  green: CheckCircle2,
  blue: CheckCircle2,
}

export function SkillsPage() {
  const { workspaceId } = useParams({ strict: false }) as { workspaceId: string }
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)

  const [tab, setTab] = useState<SkillTab>('all')
  const [query, setQuery] = useState('')
  // Frame `t1122`: the hub reflows to two-thirds beside the panel rather than
  // being covered by it — you keep watching the library while it drafts.
  const [authoring, setAuthoring] = useState(false)

  const skillsQuery = useSkills(workspaceId, tab)
  const { data: counts } = useSkillCounts(workspaceId)
  const { data: templates = [] } = useSkillTemplates(workspaceId)
  const create = useCreateSkill(workspaceId)

  // `?? []` inside the deps would be a fresh array every render, so the memo
  // would never actually memoise. Read the query data directly instead.
  const skills = skillsQuery.data
  const filtered = useMemo(() => {
    const rows = skills ?? []
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.description ?? '').toLowerCase().includes(needle),
    )
  }, [skills, query])

  /**
   * Creating from a card lands you in the skill rather than leaving you on the
   * hub wondering whether it worked. A duplicate name is the one failure a
   * person can act on, so it is surfaced verbatim from the server.
   */
  const startFrom = (template: SkillTemplate) => {
    create.mutate(
      { name: template.title, archetype: template.archetype },
      {
        onSuccess: (skill) =>
          navigate({
            to: '/app/$workspaceId/skills/$skillId' as never,
            params: { workspaceId, skillId: skill.id } as never,
          }),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : t('skills.loadFailed')),
      },
    )
  }

  const TABS: Array<{ key: SkillTab; label: string; count?: number }> = [
    { key: 'all', label: t('skills.tab.all'), count: counts?.all },
    { key: 'enabled', label: t('skills.tab.enabled'), count: counts?.enabled },
    { key: 'mine', label: t('skills.tab.mine'), count: counts?.mine },
  ]

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-6" data-testid="skills-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Gem className="h-5 w-5 text-primary" />
            {t('skills.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">{t('skills.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
        <Button
          variant="outline"
          data-testid="build-with-ai"
          onClick={() => setAuthoring(true)}
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {t('skills.author.build')}
        </Button>
        <Button
          data-testid="new-skill"
          onClick={() => startFrom(templates.find((x) => x.archetype === 'scratch') ?? templates[0])}
          disabled={create.isPending || templates.length === 0}
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-1.5" />
          )}
          {t('skills.new')}
        </Button>
        </div>
      </header>

      {/* Starter carousel. Horizontal scroll rather than paging chevrons: the
          chevron in her frame exists because the cards are fixed-width and clip
          — a scroll container gets to the same cards with fewer moving parts. */}
      {templates.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" data-testid="skill-starters">
          {templates.map((template) => {
            const Icon = TONE_ICON[template.tone]
            return (
              <div
                key={template.archetype}
                className={cn(
                  'shrink-0 w-64 rounded-xl border p-4 flex flex-col gap-2',
                  TONE[template.tone],
                )}
                data-testid={`skill-starter-${template.archetype}`}
              >
                <Icon className="h-5 w-5 text-primary" />
                <div className="font-medium leading-tight">{template.title}</div>
                <p className="text-xs text-muted-foreground flex-1">{template.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-1"
                  disabled={create.isPending}
                  onClick={() => startFrom(template)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('skills.create')}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60">
        <div className="flex items-center gap-1">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              data-testid={`skills-tab-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                tab === key
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {count !== undefined && (
                <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative pb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('skills.searchPlaceholder')}
            className="pl-8 h-8 w-56"
            data-testid="skills-search"
          />
        </div>
      </div>

      {skillsQuery.isLoading ? (
        <ListSkeleton rows={3} />
      ) : skillsQuery.isError ? (
        <p className="text-sm text-destructive">{t('skills.loadFailed')}</p>
      ) : filtered.length === 0 ? (
        <SkillsEmptyState
          searching={query.trim().length > 0}
          query={query.trim()}
          onCreate={() => startFrom(templates.find((x) => x.archetype === 'scratch') ?? templates[0])}
          onBuildWithAi={() => setAuthoring(true)}
          creating={create.isPending}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="skills-list">
          {filtered.map((skill) => (
            <SkillCard key={skill.id} skill={skill} workspaceId={workspaceId} mine={skill.createdById === me} />
          ))}
        </div>
      )}

      {/* The boundary, stated where people will actually read it. */}
      <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
        {t('skills.boundary')}
      </p>
      </div>
      {authoring && (
        <SkillAuthorPanel
          workspaceId={workspaceId}
          onClose={() => setAuthoring(false)}
          className="w-full max-w-md shrink-0 fixed inset-y-0 right-0 z-40 md:static md:z-auto"
        />
      )}
    </div>
  )
}

function SkillCard({
  skill,
  workspaceId,
  mine,
}: {
  skill: Skill
  workspaceId: string
  mine: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <button
      data-testid={`skill-${skill.id}`}
      className="text-left rounded-xl border border-border/70 bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
      onClick={() =>
        navigate({
          to: '/app/$workspaceId/skills/$skillId' as never,
          params: { workspaceId, skillId: skill.id } as never,
        })
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gem className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium truncate">{skill.name}</span>
        </div>
        {!skill.enabled && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {t('skills.disabled')}
          </Badge>
        )}
      </div>
      {skill.description && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{skill.description}</p>
      )}
      <div className="flex items-center gap-1.5 mt-3">
        <Badge variant="secondary" className="text-[10px]">
          {skill.visibility === 'workspace' ? t('skills.shared') : t('skills.private')}
        </Badge>
        {mine && (
          <Badge variant="outline" className="text-[10px]">
            {t('skills.tab.mine')}
          </Badge>
        )}
      </div>
    </button>
  )
}

/**
 * Her empty state, near-verbatim: a gem in a rounded tile, the headline, the
 * one-line explanation, and a second way in. "Brain" becomes "Rundesk AI" —
 * the only word changed, because it names their product and not ours.
 */
function SkillsEmptyState({
  searching,
  query,
  onCreate,
  onBuildWithAi,
  creating,
}: {
  searching: boolean
  query: string
  onCreate: () => void
  onBuildWithAi: () => void
  creating: boolean
}) {
  const { t } = useTranslation()
  if (searching) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center" data-testid="skills-no-matches">
        {t('skills.noMatches', { query })}
      </p>
    )
  }
  return (
    <div className="py-12 flex flex-col items-center text-center gap-3" data-testid="skills-empty">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <Gem className="h-6 w-6 text-primary" />
      </div>
      <h2 className="text-base font-medium">{t('skills.empty.title')}</h2>
      <p className="text-sm text-muted-foreground max-w-md">{t('skills.empty.body')}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onBuildWithAi} data-testid="skills-empty-build">
          <Sparkles className="h-4 w-4 mr-1.5" />
          {t('skills.author.build')}
        </Button>
        <Button variant="outline" onClick={onCreate} disabled={creating} data-testid="skills-empty-create">
          {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
          {t('skills.create')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('skills.author.nothingSaved')}</p>
    </div>
  )
}
