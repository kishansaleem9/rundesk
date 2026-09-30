/**
 * §V2-13 / frame `12:14` — the TEMPLATE CENTER.
 *
 * The re-audit row read "a page, not a modal; no type facet, complexity,
 * use-cases or categories". The page half was already true and stays true —
 * a modal would be a step backwards from a URL you can send somebody. What
 * was missing is everything the frame's left rail does:
 *
 *   · **Template Types**  Space · Folder · List   (checkboxes, with counts)
 *   · **Complexity**      Beginner · Intermediate · Advanced
 *   · top bar **Use Cases** dropdown
 *   · a body grouped into **categories**, each with a count and "See N more"
 *
 * Every one of those is a SERVER query. The page used to fetch the whole
 * corpus and filter the array in the browser, which is the shape that makes a
 * facet count worthless: it counts what the page was handed and says nothing
 * about the corpus, so it is right about the grid and confidently wrong about
 * the database. `GET …/project-templates/browse` returns the narrowed page AND
 * the counts, grouped in SQL over everything visible.
 *
 * The vocabulary and its ORDER come from the server too. This file holds
 * labels, not a second list — three copies of "space, folder, list" is how the
 * third one ends up with four entries nobody notices.
 *
 * `ledger-rows/row-1874` — the frame's top row is a search box and THREE facet
 * buttons, **Use Cases · Tags · Created by**, and only the first was here.
 * ClickUp (help centre, "Find a template"): "click Tags to filter by tags, and
 * click Created by to filter by creator". Both are server facets like the
 * others, counted in SQL over the same corpus, and drawn the way Use Cases is.
 * Tags are set when a template is saved and changed afterwards from its card
 * ("Under the template name, click the tag icon"), by whoever may manage
 * templates.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TaskTemplatesSection } from '../components/task-templates-section'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { usePermissions } from '../hooks/use-permissions'
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Checkbox,
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
  X,
  FolderKanban,
  Boxes,
  List as ListIcon,
  Tag as TagIcon,
} from 'lucide-react'
import { InlineSkeleton } from '../components/loading-skeletons'

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
  targetType: string
  complexity: string
  category: string | null
  useCase: string | null
  /** `ledger-rows/row-1874`: absent from a server older than the column. */
  tags?: string[]
  createdById?: string | null
  payload: { lists: TemplateList[] }
  createdAt: string
}

type FacetBucket = { value: string; count: number }
/** A Created-by bucket: the value is the maker's user id, shown by name. */
type CreatorBucket = FacetBucket & { name: string }
type BrowseResult = {
  templates: ProjectTemplate[]
  total: number
  facets: {
    scope: FacetBucket[]
    type: FacetBucket[]
    complexity: FacetBucket[]
    category: FacetBucket[]
    useCase: FacetBucket[]
    createdBy?: CreatorBucket[]
    tag?: FacetBucket[]
  }
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
  Briefcase: 'linear-gradient(135deg, hsl(190 60% 45%), hsl(160 70% 50%))',
  Sparkles: 'linear-gradient(135deg, hsl(268 70% 58%), hsl(330 80% 60%))',
  Calendar: 'linear-gradient(135deg, hsl(15 85% 60%), hsl(35 95% 60%))',
  GraduationCap: 'linear-gradient(135deg, hsl(217 60% 55%), hsl(160 70% 50%))',
}
const FALLBACK_COVER = 'linear-gradient(135deg, hsl(217 30% 40%), hsl(268 40% 45%))'

/*
 * LABELS ONLY. The values and their order arrive from the server; a value with
 * no entry here renders as itself rather than borrowing a neighbour's string,
 * because a label that silently falls back is the `VIEW_LABEL` "team" defect —
 * two rows reading "List" and every "a label is present" check passing.
 */
const TYPE_LABEL: Record<string, TranslationKey> = {
  space: 'templates.type.space',
  folder: 'templates.type.folder',
  list: 'templates.type.list',
}
const TYPE_ICON: Record<string, React.ElementType> = {
  space: Boxes,
  folder: FolderKanban,
  list: ListIcon,
}
const COMPLEXITY_LABEL: Record<string, TranslationKey> = {
  beginner: 'templates.complexity.beginner',
  intermediate: 'templates.complexity.intermediate',
  advanced: 'templates.complexity.advanced',
}
const CATEGORY_LABEL: Record<string, TranslationKey> = {
  engineering: 'templates.category.engineering',
  marketing: 'templates.category.marketing',
  operations: 'templates.category.operations',
  product: 'templates.category.product',
  other: 'templates.category.other',
}
const USE_CASE_LABEL: Record<string, TranslationKey> = {
  planning: 'templates.useCase.planning',
  launch: 'templates.useCase.launch',
  onboarding: 'templates.useCase.onboarding',
  support: 'templates.useCase.support',
  other: 'templates.useCase.other',
}
const SCOPE_LABEL: Record<string, TranslationKey> = {
  all: 'templates.filterAll',
  builtin: 'templates.builtin',
  custom: 'templates.custom',
}

/** How many cards a category section shows before it offers "See N more". */
const SECTION_CAP = 6

function iconFor(name: string | null): React.ElementType {
  return (name && ICONS[name]) || LayoutTemplate
}
function coverFor(name: string | null): string {
  return (name && COVERS[name]) || FALLBACK_COVER
}
function taskCount(tpl: ProjectTemplate): number {
  return tpl.payload?.lists?.reduce((n, l) => n + (l.tasks?.length ?? 0), 0) ?? 0
}

export function TemplatesPage() {
  const { t, tCount } = useTranslation()
  const params = useParams({ from: '/app/$workspaceId/templates' }) as { workspaceId?: string }
  const workspaceId = isUuidLike(params.workspaceId) ? params.workspaceId : null

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'builtin' | 'custom'>('all')
  const [types, setTypes] = useState<string[]>([])
  const [complexities, setComplexities] = useState<string[]>([])
  const [useCase, setUseCase] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [applyTemplate, setApplyTemplate] = useState<ProjectTemplate | null>(null)
  const [tagsOf, setTagsOf] = useState<ProjectTemplate | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const mayManageTemplates = usePermissions(workspaceId ?? undefined).can('template.manage') === true

  // One request per pause, not one per keystroke — but still a request: the
  // search narrows the corpus the counts are taken over, so it cannot be a
  // client-side pass over what happens to be loaded.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(id)
  }, [query])

  const search = useMemo(() => {
    const p = new URLSearchParams()
    if (debouncedQuery.trim()) p.set('q', debouncedQuery.trim())
    if (scope !== 'all') p.set('scope', scope)
    if (types.length) p.set('type', types.join(','))
    if (complexities.length) p.set('complexity', complexities.join(','))
    if (useCase) p.set('useCase', useCase)
    if (category) p.set('category', category)
    if (tag) p.set('tag', tag)
    if (createdBy) p.set('createdBy', createdBy)
    return p.toString()
  }, [debouncedQuery, scope, types, complexities, useCase, category, tag, createdBy])

  const browseQuery = useQuery({
    queryKey: ['project-templates', 'browse', workspaceId, search],
    queryFn: () =>
      api<BrowseResult>(`/workspaces/${workspaceId}/project-templates/browse${search ? `?${search}` : ''}`),
    enabled: Boolean(workspaceId),
    placeholderData: (prev) => prev,
  })

  const templates = useMemo(() => browseQuery.data?.templates ?? [], [browseQuery.data])
  const facets = browseQuery.data?.facets
  const total = browseQuery.data?.total ?? 0
  const anyFacet =
    types.length > 0 || complexities.length > 0 || Boolean(useCase) || Boolean(category) || Boolean(tag) || Boolean(createdBy)

  /*
   * `ledger-rows/row-1874` — the two open vocabularies. Use Cases' buckets are a
   * fixed list that always holds the chosen value (at 0 when nothing matches);
   * these are whatever the corpus holds, so a chosen tag or maker the search
   * has narrowed away is not among them. It is kept in the menu at 0, as Use
   * Cases keeps its own, or the select would show "All" while still filtering.
   * A maker's name is remembered from when it was last counted.
   */
  const makerNames = useRef(new Map<string, string>())
  useEffect(() => {
    for (const b of facets?.createdBy ?? []) makerNames.current.set(b.value, b.name)
  }, [facets])
  const makerBuckets = useMemo(() => {
    const rows = facets?.createdBy ?? []
    return createdBy && !rows.some((b) => b.value === createdBy)
      ? [...rows, { value: createdBy, count: 0, name: makerNames.current.get(createdBy) ?? createdBy }]
      : rows
  }, [facets, createdBy])
  const tagBuckets = useMemo(() => {
    const rows = facets?.tag ?? []
    return tag && !rows.some((b) => b.value.toLowerCase() === tag.toLowerCase())
      ? [...rows, { value: tag, count: 0 }]
      : rows
  }, [facets, tag])
  const knownTags = useMemo(() => (facets?.tag ?? []).map((b) => b.value), [facets])

  const toggle = (list: string[], value: string, set: (v: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  /*
   * The frame's body: sections, in the server's canonical category order, each
   * with its own heading and count. Only categories that HAVE something in the
   * current result get a section — an empty "Marketing" heading would be a
   * label with nothing behind it.
   */
  const sections = useMemo(() => {
    const order = facets?.category.map((b) => b.value) ?? []
    const byCategory = new Map<string, ProjectTemplate[]>()
    for (const tpl of templates) {
      const key = tpl.category ?? 'other'
      const bucket = byCategory.get(key)
      if (bucket) bucket.push(tpl)
      else byCategory.set(key, [tpl])
    }
    return order
      .filter((key) => (byCategory.get(key)?.length ?? 0) > 0)
      .map((key) => ({ key, rows: byCategory.get(key) ?? [] }))
  }, [templates, facets])

  const labelOf = (map: Record<string, TranslationKey>, value: string) => {
    const key = map[value]
    return key ? t(key) : value
  }

  return (
    <div className="p-6 space-y-7 max-w-[100rem] mx-auto" data-testid="template-center">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('templates.eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <LayoutTemplate className="h-4 w-4" />
            </span>
            {t('nav.templates')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {t('templates.subtitle')}
          </p>
        </div>
        {/* Saving a project as a template asks `template.manage`, as the API does. */}
        {mayManageTemplates && (
          <Button
            variant="gradient"
            size="lg"
            data-testid="templates-save-open"
            onClick={() => setSaveOpen(true)}
            disabled={!workspaceId}
          >
            <LayoutTemplate className="h-4 w-4" /> {t('templates.saveAsTemplate')}
          </Button>
        )}
      </header>

      {/* Search + the frame's top-bar Use Cases · Tags · Created by + the scope rail. */}
      <div className="flex flex-wrap items-center gap-3" data-testid="templates-top-row">
        <div className="relative max-w-sm w-full">
          <Input
            leadingIcon={<Search className="h-4 w-4" />}
            placeholder={t('templates.searchPlaceholder')}
            value={query}
            data-testid="templates-search"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              data-testid="templates-search-clear"
              aria-label={t('templates.clearSearch')}
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">{t('templates.useCases')}</span>
          <select
            data-testid="templates-facet-usecase"
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm text-foreground"
          >
            <option value="">{t('templates.useCasesAll')}</option>
            {(facets?.useCase ?? [])
              .filter((b) => b.count > 0 || b.value === useCase)
              .map((b) => (
                <option key={b.value} value={b.value}>
                  {labelOf(USE_CASE_LABEL, b.value)} ({b.count})
                </option>
              ))}
          </select>
        </label>

        {/*
          `ledger-rows/row-1874` — Tags, then Created by, the frame's order. The
          same control as Use Cases, drawn and counted the same way: one
          request per choice, the count beside each value taken by the server
          over the corpus the search and the scope leave, never the grid.
        */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">{t('templates.tags')}</span>
          <select
            data-testid="templates-facet-tag"
            value={tag ? (tagBuckets.find((b) => b.value.toLowerCase() === tag.toLowerCase())?.value ?? tag) : ''}
            onChange={(e) => setTag(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm text-foreground"
          >
            <option value="">{t('templates.tagsAll')}</option>
            {tagBuckets.map((b) => (
              <option key={b.value.toLowerCase()} value={b.value}>
                {b.value} ({b.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">{t('templates.createdBy')}</span>
          <select
            data-testid="templates-facet-createdby"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm text-foreground"
          >
            <option value="">{t('templates.createdByAll')}</option>
            {makerBuckets.map((b) => (
              <option key={b.value} value={b.value}>
                {b.name} ({b.count})
              </option>
            ))}
          </select>
        </label>

        <div
          className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1"
          data-testid="templates-scope-rail"
        >
          {(facets?.scope ?? [{ value: 'all', count: 0 }, { value: 'builtin', count: 0 }, { value: 'custom', count: 0 }]).map((b) => (
            <button
              key={b.value}
              type="button"
              data-testid={`templates-scope-${b.value}`}
              data-count={b.count}
              aria-pressed={scope === b.value}
              onClick={() => setScope(b.value as 'all' | 'builtin' | 'custom')}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md font-medium transition-all',
                scope === b.value
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
                b.count === 0 && scope !== b.value && 'opacity-45',
              )}
            >
              {labelOf(SCOPE_LABEL, b.value)} ({b.count})
            </button>
          ))}
        </div>

        {anyFacet && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-testid="templates-facet-clear"
            onClick={() => { setTypes([]); setComplexities([]); setUseCase(''); setCategory(''); setTag(''); setCreatedBy('') }}
          >
            <X className="h-3 w-3" /> {t('templates.clearFilters')}
          </Button>
        )}
      </div>

      {workspaceId && <TaskTemplatesSection workspaceId={workspaceId} />}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* The frame's left rail. Counts come from the server, over the corpus. */}
        <aside className="w-full lg:w-60 shrink-0 space-y-6" data-testid="templates-facets">
          <FacetGroup
            name="type"
            title={t('templates.templateTypes')}
            buckets={facets?.type ?? []}
            selected={types}
            onToggle={(v) => toggle(types, v, setTypes)}
            label={(v) => labelOf(TYPE_LABEL, v)}
            icon={(v) => TYPE_ICON[v]}
          />
          <FacetGroup
            name="complexity"
            title={t('templates.complexityTitle')}
            buckets={facets?.complexity ?? []}
            selected={complexities}
            onToggle={(v) => toggle(complexities, v, setComplexities)}
            label={(v) => labelOf(COMPLEXITY_LABEL, v)}
          />
        </aside>

        <div className="flex-1 min-w-0 space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">{t('templates.projectTemplates')}</h2>
            <Badge variant="secondary" className="text-[10px]" data-testid="templates-total">
              {tCount('templates.available', total)}
            </Badge>
          </div>

          {browseQuery.isLoading ? (
            <Card variant="glass" className="p-6 text-sm text-muted-foreground"><InlineSkeleton /></Card>
          ) : templates.length === 0 ? (
            <Card variant="glass" className="p-6 text-sm text-muted-foreground" data-testid="templates-empty">
              {query || scope !== 'all' || anyFacet ? t('templates.noMatch') : t('templates.empty')}
            </Card>
          ) : (
            sections.map(({ key, rows }) => {
              const capped = category ? rows : rows.slice(0, SECTION_CAP)
              const more = rows.length - capped.length
              return (
                <section key={key} className="space-y-3" data-testid={`templates-section-${key}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <button
                      type="button"
                      data-testid={`templates-category-${key}`}
                      data-count={rows.length}
                      aria-pressed={category === key}
                      onClick={() => setCategory(category === key ? '' : key)}
                      className={cn(
                        'font-display text-base font-semibold hover:text-accent transition-colors',
                        category === key && 'text-accent',
                      )}
                    >
                      {labelOf(CATEGORY_LABEL, key)}
                    </button>
                    {more > 0 && (
                      <button
                        type="button"
                        data-testid={`templates-category-more-${key}`}
                        onClick={() => setCategory(key)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('templates.seeMore', { count: more })}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {capped.map((tpl) => (
                      <TemplateCard
                        key={tpl.id}
                        template={tpl}
                        typeLabel={labelOf(TYPE_LABEL, tpl.targetType)}
                        complexityLabel={labelOf(COMPLEXITY_LABEL, tpl.complexity)}
                        onUse={() => setApplyTemplate(tpl)}
                        // The key that saves a template changes its tags, as the
                        // API asks; a built-in is every workspace's, so nobody's.
                        onEditTags={mayManageTemplates && !tpl.isBuiltIn ? () => setTagsOf(tpl) : undefined}
                      />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>
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
          knownTags={knownTags}
        />
      )}
      {workspaceId && (
        <EditTagsDialog
          workspaceId={workspaceId}
          template={tagsOf}
          knownTags={knownTags}
          onClose={() => setTagsOf(null)}
        />
      )}
    </div>
  )
}

/**
 * One checkbox facet. The buckets — values, order and counts — are whatever the
 * server sent; this draws them.
 *
 * A zero bucket is drawn and DISABLED rather than hidden, which is the frame's
 * own treatment (its "Workspace Templates  0" row is greyed, not removed).
 * Hiding it would make the rail change shape as you search, and a checkbox
 * that empties the grid the moment you tick it is worse than one that says so.
 */
function FacetGroup({
  name,
  title,
  buckets,
  selected,
  onToggle,
  label,
  icon,
}: {
  name: string
  title: string
  buckets: FacetBucket[]
  selected: string[]
  onToggle: (value: string) => void
  label: (value: string) => string
  icon?: (value: string) => React.ElementType | undefined
}) {
  return (
    <div className="space-y-2" data-testid={`templates-facet-${name}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">
        {buckets.map((b) => {
          const Icon = icon?.(b.value)
          const empty = b.count === 0 && !selected.includes(b.value)
          return (
            <div
              key={b.value}
              data-testid={`templates-facet-${name}-row-${b.value}`}
              data-value={b.value}
              data-count={b.count}
              data-empty={empty ? 'true' : 'false'}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                empty ? 'opacity-45' : 'hover:bg-card/60',
              )}
            >
              <Checkbox
                data-testid={`templates-facet-${name}-${b.value}`}
                checked={selected.includes(b.value)}
                disabled={empty}
                onCheckedChange={() => onToggle(b.value)}
                id={`facet-${name}-${b.value}`}
              />
              <label htmlFor={`facet-${name}-${b.value}`} className="flex-1 flex items-center gap-1.5 cursor-pointer">
                {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                {label(b.value)}
              </label>
              <span
                data-testid={`templates-facet-${name}-count-${b.value}`}
                className="text-xs tabular-nums text-muted-foreground"
              >
                {b.count}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  typeLabel,
  complexityLabel,
  onUse,
  onEditTags,
}: {
  template: ProjectTemplate
  typeLabel: string
  complexityLabel: string
  onUse: () => void
  /** Absent for whoever may not change them, and for a built-in. */
  onEditTags?: () => void
}) {
  const { t, tCount } = useTranslation()
  const Icon = iconFor(template.icon)
  const lists = template.payload?.lists?.length ?? 0
  const tasks = taskCount(template)
  const tags = template.tags ?? []
  return (
    <Card
      variant="glass"
      className="overflow-hidden p-0 group transition-all hover:shadow-glow hover:border-accent/40"
      data-testid="templates-card"
      data-template-id={template.id}
      data-type={template.targetType}
      data-complexity={template.complexity}
      data-category={template.category ?? 'other'}
      data-use-case={template.useCase ?? 'other'}
      data-created-by={template.createdById ?? ''}
    >
      <div className="relative h-32 overflow-hidden flex items-center justify-center" style={{ background: coverFor(template.icon) }}>
        <div className="absolute inset-0 bg-grid-dim opacity-40" />
        <Icon className="h-12 w-12 text-white/90" />
        <Badge
          variant="soft"
          className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-black/30 text-white border-transparent"
        >
          {template.isBuiltIn ? t('templates.builtin') : t('templates.custom')}
        </Badge>
        <Badge
          variant="soft"
          className="absolute top-2 left-2 text-[10px] backdrop-blur-sm bg-black/30 text-white border-transparent"
        >
          {typeLabel}
        </Badge>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate flex-1">{template.name}</span>
          {/*
            `ledger-rows/row-1874` — ClickUp: "Under the template name, click the
            tag icon and select one or more tags."
          */}
          {onEditTags && (
            <button
              type="button"
              data-testid="templates-card-edit-tags"
              data-template-id={template.id}
              aria-label={t('templates.editTags')}
              title={t('templates.editTags')}
              onClick={onEditTags}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground"
            >
              <TagIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <Badge variant="outline" className="text-[10px] shrink-0">{complexityLabel}</Badge>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5" data-testid="templates-card-tags">
            {tags.map((tg) => (
              <span
                key={tg.toLowerCase()}
                data-testid="templates-card-tag"
                className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent"
              >
                {tg}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[2rem]">
          {template.description}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <ListTree className="h-3 w-3" /> {tCount('templates.listsCount', lists)} · {tCount('templates.tasksCount', tasks)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid="templates-card-use"
            data-template-id={template.id}
            onClick={onUse}
          >
            {t('templates.useTemplate')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * Apply. What the dialog asks for follows the template's own type, because the
 * server does: a space template needs nowhere to go, a folder template needs a
 * space, and a list template needs the project to drop the list into.
 */
function ApplyTemplateDialog({
  workspaceId,
  template,
  onClose,
}: {
  workspaceId: string
  template: ProjectTemplate | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const open = Boolean(template)
  const targetType = template?.targetType ?? 'folder'

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<NamedRow[]>(`/spaces/workspace/${workspaceId}`),
    enabled: open && targetType !== 'space',
  })
  const spaces = spacesQuery.data ?? []

  const [projectName, setProjectName] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [projectId, setProjectId] = useState('')

  // Seed defaults when the dialog opens / data arrives.
  const effectiveName = projectName || template?.name || ''
  const effectiveSpace = spaceId || spaces[0]?.id || ''

  const projectsQuery = useQuery({
    queryKey: ['projects', effectiveSpace],
    queryFn: () => api<NamedRow[]>(`/projects/space/${effectiveSpace}`),
    enabled: open && targetType === 'list' && Boolean(effectiveSpace),
  })
  const projects = projectsQuery.data ?? []
  const effectiveProject = projectId || projects[0]?.id || ''

  const ready =
    Boolean(effectiveName.trim()) &&
    (targetType === 'space' || (targetType === 'list' ? Boolean(effectiveProject) : Boolean(effectiveSpace)))

  const apply = useMutation({
    mutationFn: () =>
      api<{
        project: { id: string; spaceId: string }
        space: { id: string } | null
        targetType: string
        listsCreated: number
        tasksCreated: number
      }>(
        `/workspaces/${workspaceId}/project-templates/apply`,
        {
          method: 'POST',
          body: {
            templateId: template!.id,
            ...(targetType === 'folder' ? { targetSpaceId: effectiveSpace } : {}),
            ...(targetType === 'list' ? { targetProjectId: effectiveProject } : {}),
            projectName: effectiveName,
          },
        },
      ),
    onSuccess: (res) => {
      toast.success(t('templates.appliedToast', { name: effectiveName, lists: res.listsCreated, tasks: res.tasksCreated }))
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
      handleClose()
      navigate({
        to: '/app/$workspaceId/$spaceId/$projectId',
        params: {
          workspaceId,
          spaceId: res.space?.id ?? res.project.spaceId ?? effectiveSpace,
          projectId: res.project.id,
        },
      })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t('templates.applyError')),
  })

  function handleClose() {
    setProjectName('')
    setSpaceId('')
    setProjectId('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent data-testid="templates-apply-dialog" data-target-type={targetType}>
        <DialogHeader>
          <DialogTitle>{t('templates.useTemplateTitle', { name: template?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {targetType === 'space'
              ? t('templates.applyDescriptionSpace')
              : targetType === 'list'
                ? t('templates.applyDescriptionList')
                : t('templates.applyDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              {targetType === 'space'
                ? t('templates.spaceName')
                : targetType === 'list'
                  ? t('templates.listName')
                  : t('templates.projectName')}
            </Label>
            <Input
              data-testid="templates-apply-name"
              placeholder={t('templates.projectNamePlaceholder')}
              value={effectiveName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          {targetType !== 'space' && (
            <div className="space-y-1.5">
              <Label>{t('templates.targetSpace')}</Label>
              {spacesQuery.isLoading ? (
                <p className="text-xs text-muted-foreground"><InlineSkeleton /></p>
              ) : spaces.length === 0 ? (
                <p className="text-xs text-warning">{t('templates.noSpaces')}</p>
              ) : (
                <select
                  data-testid="templates-apply-space"
                  value={effectiveSpace}
                  onChange={(e) => { setSpaceId(e.target.value); setProjectId('') }}
                  className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {targetType === 'list' && (
            <div className="space-y-1.5">
              <Label>{t('templates.targetProject')}</Label>
              {projectsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground"><InlineSkeleton /></p>
              ) : projects.length === 0 ? (
                <p className="text-xs text-warning">{t('templates.noProjects')}</p>
              ) : (
                <select
                  data-testid="templates-apply-project"
                  value={effectiveProject}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" data-testid="templates-apply-cancel" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            data-testid="templates-apply-submit"
            onClick={() => apply.mutate()}
            disabled={apply.isPending || !ready}
          >
            <Check className="h-3.5 w-3.5" /> {apply.isPending ? t('templates.applying') : t('templates.applyTemplate')}
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
  knownTags,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  knownTags: string[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [spaceId, setSpaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [useCase, setUseCase] = useState('')
  const [tags, setTags] = useState<string[]>([])

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

  /*
   * Category and use-case are the two the person genuinely knows. Complexity
   * is NOT asked for: the server reads it off the snapshot, because "is this
   * advanced?" is a question about a thing that does not exist yet.
   */
  const save = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/project-templates/save-from-project`, {
        method: 'POST',
        body: {
          projectId: effectiveProject,
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          useCase: useCase || undefined,
          // `ledger-rows/row-1874` — ClickUp saves a template with "a template
          // name, description, tags"; the server cleans them or refuses them.
          tags,
        },
      }),
    onSuccess: () => {
      toast.success(t('templates.savedToast'))
      qc.invalidateQueries({ queryKey: ['project-templates'] })
      reset()
      onOpenChange(false)
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : t('templates.saveError')),
  })

  function reset() {
    setSpaceId('')
    setProjectId('')
    setName('')
    setDescription('')
    setCategory('')
    setUseCase('')
    setTags([])
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent data-testid="templates-save-dialog">
        <DialogHeader>
          <DialogTitle>{t('templates.saveAsTemplate')}</DialogTitle>
          {/*
            `found-30-sep/template-save-dialog-says-admin-only` — who may save,
            by the key the route asks (`template.manage`), under the name the
            Roles tab gives it. It said "(admin only)" to managers and to
            members granted the key, who are the people it is shown to.
          */}
          <DialogDescription>
            {t('templates.saveDescription', { permission: t('rolesTab.perm.templateManage') })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('templates.space')}</Label>
            {spaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">{spacesQuery.isLoading ? <InlineSkeleton width="6rem" /> : t('templates.noSpacesShort')}</p>
            ) : (
              <select
                data-testid="templates-save-space"
                value={effectiveSpace}
                onChange={(e) => { setSpaceId(e.target.value); setProjectId('') }}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t('templates.project')}</Label>
            {projectsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground"><InlineSkeleton /></p>
            ) : projects.length === 0 ? (
              <p className="text-xs text-warning">{t('templates.noProjects')}</p>
            ) : (
              <select
                data-testid="templates-save-project"
                value={effectiveProject}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t('templates.templateName')}</Label>
            <Input
              data-testid="templates-save-name"
              placeholder={t('templates.templateNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('templates.descriptionOptional')}</Label>
            <Input
              data-testid="templates-save-description"
              placeholder={t('templates.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('templates.categoryTitle')}</Label>
              <select
                data-testid="templates-save-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                <option value="">{t('templates.categoryNone')}</option>
                {(['engineering', 'marketing', 'operations', 'product'] as const).map((c) => (
                  <option key={c} value={c}>{t(CATEGORY_LABEL[c])}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('templates.useCases')}</Label>
              <select
                data-testid="templates-save-usecase"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                className="w-full h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm"
              >
                <option value="">{t('templates.categoryNone')}</option>
                {(['planning', 'launch', 'onboarding', 'support'] as const).map((u) => (
                  <option key={u} value={u}>{t(USE_CASE_LABEL[u])}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('templates.tagsOptional')}</Label>
            <TagsInput testId="templates-save-tags" value={tags} onChange={setTags} suggestions={knownTags} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            data-testid="templates-save-cancel"
            onClick={() => { reset(); onOpenChange(false) }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            data-testid="templates-save-submit"
            onClick={() => save.mutate()}
            disabled={save.isPending || !effectiveProject || !name.trim()}
          >
            <Check className="h-3.5 w-3.5" /> {save.isPending ? t('common.saving') : t('templates.saveTemplate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `ledger-rows/row-1874` — a template's tags as chips. Type one and press
 * Enter (or a comma); × takes one off, and Backspace in the empty box takes
 * the last. The words already in use are offered as you type.
 *
 * Cleaned here as the server cleans them — trimmed, a run of spaces made one,
 * one per word whatever its case — so the chips show what will be kept. The
 * BOUNDS are not copied here: forty characters and twenty tags are the
 * server's to refuse, in its own words, and a second copy of them in the
 * browser is one that drifts.
 */
function TagsInput({
  testId,
  value,
  onChange,
  suggestions,
}: {
  testId: string
  value: string[]
  onChange: (next: string[]) => void
  suggestions: string[]
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const listId = useId()
  const has = (tag: string) => value.some((v) => v.toLowerCase() === tag.toLowerCase())
  const add = (raw: string) => {
    let next = value
    for (const part of raw.split(',')) {
      const tag = part.trim().replace(/\s+/g, ' ')
      if (tag && !next.some((v) => v.toLowerCase() === tag.toLowerCase())) next = [...next, tag]
    }
    if (next !== value) onChange(next)
    setDraft('')
  }
  return (
    <div
      data-testid={testId}
      className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1.5"
    >
      {value.map((tag) => (
        <span
          key={tag.toLowerCase()}
          data-testid={`${testId}-chip`}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
        >
          {tag}
          <button
            type="button"
            data-testid={`${testId}-remove`}
            aria-label={t('templates.removeTag', { tag })}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="rounded-full hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        data-testid={`${testId}-input`}
        list={listId}
        value={draft}
        placeholder={value.length === 0 ? t('templates.tagsPlaceholder') : undefined}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          // An IME's Enter picks a character; it is not the end of a tag.
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        // A word typed and left, then Save pressed, is a tag too.
        onBlur={() => { if (draft.trim()) add(draft) }}
        className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !has(s)).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}

/**
 * `ledger-rows/row-1874` — a template's tags, changed after it was saved.
 * ClickUp: "You can add or edit tags in the Template Center at any time". The
 * list sent replaces the list held (`PATCH …/project-templates/:id/tags`), and
 * the route asks `template.manage`, which is why only a manager's cards offer
 * the tag icon that opens this.
 */
function EditTagsDialog({
  workspaceId,
  template,
  knownTags,
  onClose,
}: {
  workspaceId: string
  template: ProjectTemplate | null
  knownTags: string[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [tags, setTags] = useState<string[]>([])
  // Seeded from the template each time the dialog opens on one.
  useEffect(() => { setTags(template?.tags ?? []) }, [template])

  const save = useMutation({
    mutationFn: () =>
      api<ProjectTemplate>(`/workspaces/${workspaceId}/project-templates/${template!.id}/tags`, {
        method: 'PATCH',
        body: { tags },
      }),
    onSuccess: () => {
      toast.success(t('templates.tagsSavedToast'))
      // The facet counts move with the tags, so the whole browse is re-asked.
      qc.invalidateQueries({ queryKey: ['project-templates'] })
      onClose()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t('templates.tagsSaveError')),
  })

  return (
    <Dialog open={Boolean(template)} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="templates-tags-dialog" data-template-id={template?.id}>
        <DialogHeader>
          <DialogTitle>{t('templates.editTagsTitle', { name: template?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('templates.editTagsDescription')}</DialogDescription>
        </DialogHeader>
        <TagsInput testId="templates-tags" value={tags} onChange={setTags} suggestions={knownTags} />
        <DialogFooter>
          <Button variant="outline" data-testid="templates-tags-cancel" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button data-testid="templates-tags-save" onClick={() => save.mutate()} disabled={save.isPending}>
            <Check className="h-3.5 w-3.5" /> {save.isPending ? t('common.saving') : t('templates.saveTags')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
