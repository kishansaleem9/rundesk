import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, cn, toast } from '@rundesk/ui'
import { Layers, Upload, X, Bell, Paperclip, Search, Sparkles, Lock } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { CreateSpaceWizard } from './create-space-wizard'
import { colorForTagName } from './task-tags'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { parseEstimate } from '../lib/estimate'
import { CREATE_TYPES, type CreateKind } from '../lib/create-types'

type Space = { id: string; name: string }
type Project = { id: string; name: string }
type List = { id: string; name: string }
type TaskType = { id: string; name: string; isDefault?: boolean }

/*
 * §V2-06 — the nine creatable types, their icons and their wording, now live in
 * `lib/create-types.ts`, because the sidebar's "+" menu on a space renders the
 * same set (frame `08:00`). Two hand-kept copies of one list is the
 * duplicated-list defect; this file renders the shared one as a tab strip.
 *
 * A1.9 added List and Folder: both were creatable only by first navigating to
 * the page that owns them. §G15 [21:36] fixed the order of the first five —
 * "pehle task, uske baad woh DOCUMENT ka poochta hai, phir REMINDER ka, phir
 * WHITEBOARD ka, phir DASHBOARD ka".
 */
type Mode = CreateKind

export function QuickCreateModal({
  onClose,
  initialMode,
  initialSpaceId,
}: {
  onClose: () => void
  /*
   * §V2-S05b frame `04:50` — the comment composer's "+" menu offers New Task,
   * New Doc and New Whiteboard, which are three of this modal's own tabs.
   * Opening it on the right one reuses the creator rather than writing three
   * more; the topbar keeps the default.
   */
  initialMode?: Mode
  /*
   * §V2-06 frame `08:00` — opened from the "+" on a space row, so the space is
   * already answered. Without this the menu item lands on a form whose first
   * question is the one the person just answered by choosing WHERE to click,
   * which is the "+ that is really the global create modal" it replaces.
   */
  initialSpaceId?: string
}) {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const workspaceId = params.workspaceId
  const [mode, setMode] = useState<Mode>(initialMode ?? 'task')
  /*
   * §V2-S07 frame `06:40` — the box above the menu, "Describe anything to
   * create".
   *
   * It does two jobs in the frame and both are built here. It NARROWS the list
   * of creatable types as you type — which is what makes a nine-item strip
   * usable and will matter more as the strip grows — and it is the text the AI
   * half is handed, so "describe anything" is not a slogan over a filter.
   *
   * The types come from `CREATE_TYPES`, filtered; they are not re-listed. A
   * search over a second hand-kept copy of the same nine is the duplicated-list
   * defect with a text box in front of it.
   */
  const [query, setQuery] = useState('')

  /*
   * What the strip shows once the box has had its say, IN `CREATE_TYPES`
   * ORDER, and always including the tab that is currently open — otherwise a
   * query that excludes the open tab leaves its form on screen under a strip
   * that does not contain it, with no way back.
   */
  /*
   * ONE filter, two answers. `matched` is how many types the query really hit
   * — which drives the "nothing matched" line — and `shown` is what the strip
   * draws, which is that set PLUS the open tab. Computed together on purpose:
   * two memos running the same predicate is the duplicated-logic defect at its
   * smallest, and the copy that drifts would be the one deciding whether to say
   * "nothing matched" over a strip that is showing something.
   */
  const { shown: shownTypes, matched: typeMatchCount } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { shown: CREATE_TYPES, matched: CREATE_TYPES.length }
    const hits = CREATE_TYPES.filter(
      (ty) => t(ty.labelKey).toLowerCase().includes(q) || t(ty.blurbKey).toLowerCase().includes(q),
    )
    const keep = new Set(hits.map((ty) => ty.value))
    keep.add(mode)
    return { shown: CREATE_TYPES.filter((ty) => keep.has(ty.value)), matched: hits.length }
  }, [query, mode, t])

  if (!workspaceId) {
    return (
      <Backdrop onClose={onClose}>
        <Card>
          <Header onClose={onClose} titleKey="quickCreate.pickWorkspaceTitle" />
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {t('quickCreate.pickWorkspaceBody')}
          </p>
        </Card>
      </Backdrop>
    )
  }

  return (
    <Backdrop onClose={onClose}>
      <Card>
        <Header onClose={onClose} titleKey="quickCreate.title" />
        <div className="px-5 pt-3">
          <label className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 h-9">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="create-search"
              aria-label={t('quickCreate.searchPlaceholder')}
              placeholder={t('quickCreate.searchPlaceholder')}
              className="h-full w-full bg-transparent text-[13px] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                data-testid="create-search-clear"
                aria-label={t('quickCreate.searchClear')}
                onClick={() => setQuery('')}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        </div>
        <div className="px-5 pt-2 pb-2 flex flex-wrap gap-1 border-b border-border">
          {shownTypes.map((tab) => (
            <ModeTab key={tab.value} mode={mode} value={tab.value} setMode={setMode} icon={tab.icon} labelKey={tab.labelKey} />
          ))}
          {typeMatchCount === 0 && (
            <span className="px-1 py-1.5 text-[11px] text-muted-foreground" data-testid="create-search-empty">
              {t('quickCreate.searchNoType')}
            </span>
          )}
        </div>
        <CreateWithAi workspaceId={workspaceId} prompt={query} onClose={onClose} />
        {mode === 'task' && <TaskForm workspaceId={workspaceId} onClose={onClose} initialSpaceId={initialSpaceId} />}
        {mode === 'list' && <ListForm workspaceId={workspaceId} onClose={onClose} initialSpaceId={initialSpaceId} />}
        {mode === 'folder' && <FolderForm workspaceId={workspaceId} onClose={onClose} initialSpaceId={initialSpaceId} />}
        {mode === 'project' && <ProjectForm workspaceId={workspaceId} onClose={onClose} initialSpaceId={initialSpaceId} />}
        {mode === 'space' && <SpaceForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'doc' && <DocForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'reminder' && <ReminderForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'whiteboard' && <WhiteboardForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'dashboard' && <DashboardForm workspaceId={workspaceId} onClose={onClose} />}
        <Footer workspaceId={workspaceId} onClose={onClose} />
      </Card>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  /*
   * ESCAPE, ON THE DOCUMENT.
   *
   * This used to be `onKeyDown` on the backdrop div below — a handler that can
   * never fire, because a plain `<div>` takes no focus and so receives no key
   * events. The modal looked as though it closed on Escape and did not, for
   * anybody: a mouse user could click the backdrop, and a keyboard user was
   * simply stuck. Found while a suite pressed Escape and the backdrop went on
   * swallowing every click behind it.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-[1px] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div className="relative z-[10000]" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="w-[520px] bg-card rounded-lg shadow-2xl border border-border overflow-hidden">{children}</div>
}

function Header({ titleKey, onClose }: { titleKey: TranslationKey; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="px-5 py-3 border-b border-border flex items-center justify-between">
      <h2 className="font-semibold text-sm">{t(titleKey)}</h2>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function ModeTab({
  mode,
  value,
  setMode,
  icon: Icon,
  labelKey,
}: {
  mode: Mode
  value: Mode
  setMode: (m: Mode) => void
  icon: React.ElementType
  labelKey: TranslationKey
}) {
  const { t } = useTranslation()
  const active = mode === value
  return (
    <button
      type="button"
      data-testid={`create-tab-${value}`}
      aria-pressed={active}
      onClick={() => setMode(value)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:bg-surface-50',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(labelKey)}
    </button>
  )
}

/**
 * §V2-S07 frame `06:40` — **Create with AI**, under the search box.
 *
 * THE POINT OF THE BUTTON IS THAT IT CREATES. A row that opens the AI page
 * with the text pre-filled would be a link wearing a verb: the person has
 * already said what they want made, and handing them a second box to say it in
 * is the dead control with an extra step.
 *
 * So it drives the real two-door path the Commands tab uses — `POST
 * /ai/command` plans and mutates NOTHING (its own summary says so), then
 * `POST /ai/command/execute` runs the confirmed actions through
 * TasksService/ListsService/FoldersService with the access checks the REST
 * routes have. `create_task`, `create_list` and `create_folder` are all real
 * tools, so "describe anything to create" genuinely ends in a row.
 *
 * THE CONFIRM STEP IS NOT CEREMONY. The plan is the only place a person can
 * see WHICH space a list is about to land in before it lands there; executing
 * straight off the prompt would make an irreversible guess on their behalf.
 *
 * WHEN THERE IS NO PROVIDER the planner answers 503 and that is shown, in the
 * provider's own words, rather than swallowed. A create surface that goes
 * quiet is indistinguishable from one that is working.
 *
 * SUPER AGENT — the frame's third row — is deliberately absent. Rundesk has no
 * agents (`ai.service.ts` refuses an Agent filter for the same reason, and the
 * ledger records the Brain²/Super Agents hub as missing); a row that names one
 * would be the dead control.
 */
type AiPlanAction = { tool: string; humanLabel: string; args?: Record<string, unknown> }
type AiPlan = { summary: string; actions: AiPlanAction[]; warnings?: string[] }
type AiActionResult = {
  tool: string
  humanLabel: string
  status: 'succeeded' | 'skipped' | 'failed'
  reason?: string
  container?: { kind: 'list' | 'folder'; id: string; name: string; path: string; spaceId: string }
}

function CreateWithAi({
  workspaceId,
  prompt,
  onClose,
}: { workspaceId: string; prompt: string; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [plan, setPlan] = useState<AiPlan | null>(null)
  const [results, setResults] = useState<AiActionResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = prompt.trim()

  const describe = (e: unknown) =>
    e instanceof ApiError ? `${e.status} — ${e.message}` : e instanceof Error ? e.message : String(e)

  const preview = useMutation({
    mutationFn: () =>
      api<AiPlan>('/ai/command', { method: 'POST', body: { workspaceId, message: text } }),
    onSuccess: (data) => { setPlan(data); setResults(null); setError(null) },
    onError: (e) => { setPlan(null); setResults(null); setError(describe(e)) },
  })

  const run = useMutation({
    mutationFn: () =>
      api<{ results: AiActionResult[] }>('/ai/command/execute', {
        method: 'POST',
        body: { workspaceId, actions: plan?.actions ?? [] },
      }),
    onSuccess: (data) => {
      setResults(data.results ?? [])
      setPlan(null)
      setError(null)
      // Whatever it made has to appear in the tree the person is looking at.
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      qc.invalidateQueries({ queryKey: ['spaces', workspaceId] })
    },
    onError: (e) => setError(describe(e)),
  })

  const busy = preview.isPending || run.isPending

  return (
    <div className="px-5 py-2 border-b border-border" data-testid="create-ai-panel">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="create-ai-open"
          disabled={!text || busy}
          onClick={() => preview.mutate()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
            text && !busy
              ? 'bg-accent/15 text-foreground hover:bg-accent/25'
              : 'text-muted-foreground opacity-60',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {preview.isPending ? t('quickCreate.aiPlanning') : t('quickCreate.createWithAi')}
        </button>
        {!text && (
          <span className="text-[11px] text-muted-foreground" data-testid="create-ai-hint">
            {t('quickCreate.aiNeedsText')}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-2 text-[12px] text-destructive" data-testid="create-ai-error">
          {t('quickCreate.aiFailed', { reason: error })}
        </p>
      )}

      {plan && (
        <div className="mt-2 rounded-md border border-border/70 px-2.5 py-2">
          <p className="text-[12px]" data-testid="create-ai-summary">{plan.summary}</p>
          {plan.actions.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="create-ai-nothing">
              {t('quickCreate.aiNothingToCreate')}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {plan.actions.map((action, i) => (
                <li key={`${action.tool}-${i}`} className="text-[12px]" data-testid={`create-ai-step-${i}`}>
                  · {action.humanLabel}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" data-testid="create-ai-cancel" onClick={() => setPlan(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="create-ai-confirm"
              disabled={busy || plan.actions.length === 0}
              onClick={() => run.mutate()}
            >
              {run.isPending ? t('quickCreate.creating') : t('quickCreate.aiConfirm')}
            </Button>
          </div>
        </div>
      )}

      {results && (
        <div className="mt-2 rounded-md border border-border/70 px-2.5 py-2">
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={`${r.tool}-${i}`} className="text-[12px]" data-testid={`create-ai-result-${i}`} data-status={r.status}>
                {r.container ? r.container.path : r.humanLabel} — {t(`quickCreate.aiStatus.${r.status}` as TranslationKey)}
                {r.reason ? ` (${r.reason})` : ''}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" variant="outline" data-testid="create-ai-done" onClick={onClose}>
              {t('spaceWizard.done')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/*
 * §V2-01a — what the field-type picker offers.
 *
 * Everything that can be CREATED. The order follows the frame's picker
 * loosely: the plain ones first, then the ones that hold a list, then the
 * derived one.
 *
 * This comment used to say progress_auto "needs no config, its defaults are
 * the frame's defaults". That was wrong twice over — frame `00:25` is the
 * config panel, and the defaults were only defaults because nothing could
 * change them. The panel is below.
 */
const CREATABLE_FIELD_TYPES: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'text', labelKey: 'taskDetail.fieldType.text' },
  { value: 'long_text', labelKey: 'taskDetail.fieldType.longText' },
  { value: 'number', labelKey: 'taskDetail.fieldType.number' },
  { value: 'money', labelKey: 'taskDetail.fieldType.money' },
  { value: 'date', labelKey: 'taskDetail.fieldType.date' },
  { value: 'checkbox', labelKey: 'taskDetail.fieldType.checkbox' },
  { value: 'url', labelKey: 'taskDetail.fieldType.url' },
  { value: 'email', labelKey: 'taskDetail.fieldType.email' },
  { value: 'phone', labelKey: 'taskDetail.fieldType.phone' },
  { value: 'location', labelKey: 'taskDetail.fieldType.location' },
  { value: 'rating', labelKey: 'taskDetail.fieldType.rating' },
  { value: 'tshirt_size', labelKey: 'taskDetail.fieldType.tshirtSize' },
  { value: 'dropdown', labelKey: 'taskDetail.fieldType.dropdown' },
  { value: 'labels', labelKey: 'taskDetail.fieldType.labels' },
  { value: 'people', labelKey: 'taskDetail.fieldType.people' },
  { value: 'progress_manual', labelKey: 'taskDetail.fieldType.progressManual' },
  { value: 'files', labelKey: 'taskDetail.fieldType.files' },
  { value: 'voting', labelKey: 'taskDetail.fieldType.voting' },
  // 0158 — three more of the frame's list; `formula` sits with the derived one.
  { value: 'tasks', labelKey: 'taskDetail.fieldType.tasks' },
  { value: 'signature', labelKey: 'taskDetail.fieldType.signature' },
  { value: 'progress_auto', labelKey: 'taskDetail.fieldType.progressAuto' },
  { value: 'formula', labelKey: 'taskDetail.fieldType.formula' },
]

/** §G15 frame #12 — what the create footer needs to know about. */
type TaskTemplate = { id: string; name: string }
type WorkspaceMember = { userId: string; displayName?: string | null; email?: string | null }

function TaskForm({
  workspaceId,
  onClose,
  initialSpaceId,
}: { workspaceId: string; onClose: () => void; initialSpaceId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  // §V2-06 frame `08:00` — answered already when this was opened from a space's
  // "+". Still a <select>, so it can be changed; it just is not blank.
  const [spaceId, setSpaceId] = useState(initialSpaceId ?? '')
  const [projectId, setProjectId] = useState('')
  const [listId, setListId] = useState('')
  const [taskTypeId, setTaskTypeId] = useState('')
  /*
   * §V2-01a — creating a custom field without leaving the create modal.
   * `madeFields` is only for saying what happened: the field itself lives on
   * the project the moment it is saved, so nothing here needs to hold it.
   */
  const [makingField, setMakingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')
  /* 0158 — a formula's expression, checked by the API against the project's
   * own fields before it is stored. */
  const [newFieldExpression, setNewFieldExpression] = useState('')
  const [newFieldRequired, setNewFieldRequired] = useState(false)
  /*
   * §V2-S01c frame `00:20` — "a SEARCHABLE FIELD-TYPE PICKER".
   *
   * This was a bare native `<select>`, defended in a comment on the grounds
   * that nineteen types do not need search when the browser can type-to-jump.
   * That reasoning ignored two things the frames and the re-audit both say: the
   * frame's picker IS searchable, and ELEVEN more types are still to build, so
   * the list is heading for thirty. A control that needs replacing at thirty
   * may as well search at nineteen.
   */
  const [fieldTypeQuery, setFieldTypeQuery] = useState('')
  // Frame `00:25`'s expander, over the one real setting behind it.
  const [fieldMoreOpen, setFieldMoreOpen] = useState(false)
  const [newFieldListOnly, setNewFieldListOnly] = useState(false)
  /*
   * What the select contains once the search box has had its say. The CURRENT
   * type is always kept when nothing matches — otherwise a query that matched
   * nothing would empty the select and leave no way back to the chosen type.
   */
  const fieldTypeMatches = useMemo(() => {
    const q = fieldTypeQuery.trim().toLowerCase()
    if (!q) return CREATABLE_FIELD_TYPES
    const matches = CREATABLE_FIELD_TYPES.filter((ft) => t(ft.labelKey).toLowerCase().includes(q))
    if (matches.length > 0) return matches
    const current = CREATABLE_FIELD_TYPES.find((ft) => ft.value === newFieldType)
    return current ? [current] : []
  }, [fieldTypeQuery, newFieldType, t])
  const [madeFields, setMadeFields] = useState<string[]>([])
  /* §V2-01b frame `00:25` — the config the panel collects. Defaulted to all
   * three sources on, which is what the API defaults to, so the panel opens
   * showing the truth rather than a blank it would then contradict. */
  const [progressSources, setProgressSources] = useState({
    subtasks: true, checklists: true, assignedComments: true,
  })
  const [progressDoneIs100, setProgressDoneIs100] = useState(true)
  // §G15 frame #12 — the three footer controls.
  const [templateId, setTemplateId] = useState('')
  const [watcherIds, setWatcherIds] = useState<string[]>([])
  /**
   * §V2-S02 frame `01:10` — the create modal's **Attachments** section, with
   * `Rectangle 25127.png` listed under it and an **X** beside it.
   *
   * This was `File | null` behind a paperclip: one file, no `multiple`, no
   * list, and no way to take one back off. Picking a second file replaced the
   * first with no sign that anything had been dropped — a create surface that
   * loses a file you chose, silently.
   *
   * The UPLOAD still happens after the POST, and has to: the presign is
   * `/tasks/:id/attachments/presign` and there is no task id until the task
   * exists. What the frame's claim is actually about is the STAGING — files
   * gathered, listed and removable while you are still deciding what the task
   * is — and that is what this holds. Each one is reported if it fails, and
   * none of them is allowed to lose you the task.
   */
  const [attachments, setAttachments] = useState<File[]>([])
  const addAttachments = (picked: FileList | null) => {
    if (!picked?.length) return
    /*
     * READ THE FILES NOW, not inside the updater.
     *
     * `input.files` is a LIVE FileList — the same object every time, tied to
     * the input — and the change handler clears `input.value` the instant this
     * returns, because it must: picking the same file again after removing it
     * fires no change event otherwise. Clearing the value empties that very
     * FileList. React runs the `setAttachments` updater below LATER, so an
     * `Array.from(picked)` in there iterated an emptied list and every pick was
     * dropped — the Attachments section never drew a row, for any file, and the
     * paperclip stayed on "Attach a file" with nothing on screen to say a file
     * had been lost. Snapshotting here is what makes the staging real.
     */
    const chosen = Array.from(picked)
    setAttachments((prev) => {
      // Same name AND same size is the same file picked twice; the browser
      // gives no id, and a duplicate row you cannot tell apart is worse than
      // dropping the second pick.
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      const next = [...prev]
      for (const file of chosen) {
        if (seen.has(`${file.name}:${file.size}`)) continue
        seen.add(`${file.name}:${file.size}`)
        next.push(file)
      }
      return next
    })
  }
  /*
   * §G15 [22:55]–[23:31] — the rest of what she fills in BEFORE pressing
   * create: "ASSIGN pe main khud ko assign kar sakti hoon ya kisi aur ko …
   * DUE DATE — maine START DATE rakhi to yeh mujhse TIME bhi pooch raha …
   * PRIORITY — urgent hai, high hai … TAGS aap create kar sakte ho … aur
   * yahan pe TIME ESTIMATE".
   *
   * Her complaint was that task creation collected a title and nothing else,
   * so every other property was something you set afterwards by finding the
   * task again. The API has accepted all of these on create since before the
   * complaint (CreateTaskDto: description, priority, startDate, dueDate,
   * timeEstimate, assigneeIds, labelIds) — only the form never asked.
   *
   * `datetime-local` rather than a date input, because she sets a time on both
   * ends and says so twice.
   */
  const [description, setDescription] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<'urgent' | 'high' | 'normal' | 'low'>('normal')
  const [estimateHours, setEstimateHours] = useState('')
  const [tagNames, setTagNames] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  /*
   * §G15 [21:59]–[22:11] — "yeh isi space se mujhe bol raha hai ke LIST banao
   * pehle — **agar main list nahi banaoongi to yeh nahi create karega**" …
   * "yeh pooch raha ke PRIVATE karni hai ke nahi".
   *
   * A task must live in a list, and the picker only ever listed the lists that
   * already existed. Pick a project with none and the form was a dead end: the
   * Create button stayed disabled, and the only way to make a list was the
   * List tab, which throws away everything typed so far. So the list gets made
   * from here, without leaving the task you are in the middle of describing.
   */
  const [newListName, setNewListName] = useState('')
  const [newListPrivate, setNewListPrivate] = useState(false)
  const [makingList, setMakingList] = useState(false)

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []
  const projects = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
    enabled: !!spaceId,
  }).data ?? []
  /*
   * §G15-10 — the lists you can put a task in.
   *
   * A project's lists when one is chosen; otherwise the space's own. Without
   * the second branch, choosing a Space and nothing else left the List field
   * empty and disabled — the extra mandatory level she does not have.
   */
  const lists = useQuery({
    queryKey: projectId ? ['lists', projectId] : ['lists', 'space', spaceId],
    queryFn: () =>
      projectId
        ? api<List[]>(`/lists/project/${projectId}`)
        : api<List[]>(`/lists/space/${spaceId}`),
    enabled: Boolean(projectId || spaceId),
  }).data ?? []
  // §1.1 — "hum is ko 'task' ka naam nahi de sakte — woh MILESTONE hai."
  // Types are per workspace, so this does not wait on the space/project/list
  // chain; leaving it unset still falls back to the list's default type.
  const taskTypes = useQuery({
    queryKey: ['task-types', workspaceId],
    queryFn: () => api<TaskType[]>(`/workspaces/${workspaceId}/task-types`),
  }).data ?? []

  /*
   * §G15 frame #12 — "Task create karte waqt neeche Templates, attach aur
   * notification (bell) ke controls hon."
   *
   * All three already existed and none of them was reachable from here.
   * Templates could only be applied from the Templates page — and the two
   * links in this modal's footer navigate away, losing the half-filled form,
   * which is the opposite of useful at the moment you are filling it in.
   * Attachments and watchers were detail-sheet-only, so "make the task, then
   * go and find it again" was the only route to either.
   */
  const templates = useQuery({
    queryKey: ['task-templates', workspaceId],
    queryFn: () => api<TaskTemplate[]>(`/workspaces/${workspaceId}/task-templates`),
    enabled: Boolean(workspaceId),
  }).data ?? []
  const members = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
  }).data ?? []

  /*
   * Making the list selects it, so the form carries straight on rather than
   * asking her to find what she just made in a dropdown.
   */
  const makeList = useMutation({
    mutationFn: () =>
      /*
       * §G15-10 [21:49] — "pehle space hoti hai. Iske baad LIST aati hai."
       *
       * A project when one is chosen, the space when none is: making a list no
       * longer requires inventing a Project you did not want. The server puts a
       * space-only list in that space's hidden container, so it is addressable
       * and searchable like any other.
       */
      api<{ id: string; projectId: string }>(`/lists`, {
        method: 'POST',
        body: {
          ...(projectId ? { projectId } : { spaceId }),
          name: newListName.trim(),
          visibility: newListPrivate ? 'private' : 'public',
        },
      }),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['lists', projectId] })
      qc.invalidateQueries({ queryKey: ['lists', 'space', spaceId] })
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      // A space-level list comes back knowing its container, and the task being
      // created has to go into it — otherwise the list is made and the task
      // lands nowhere, which is the dead end this replaced.
      if (!projectId && list.projectId) setProjectId(list.projectId)
      setListId(list.id)
      setMakingList(false)
      setNewListName('')
      setNewListPrivate(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  /**
   * §V2-S11 frame `10:04` — the description placeholder reads **"Add
   * description, or write with ⚡AI"**, and the ⚡AI half is a control, not
   * decoration.
   *
   * Rundesk's placeholder read "Description — what does done look like?" and
   * offered nothing beside the box. Changing only the words would have put a
   * promise in the placeholder with nothing behind it — the facade, in one
   * string.
   *
   * `POST /ai/task/generate` has returned `{ title, description, subtasks,
   * priority, estimatedHours }` since the AI module shipped and the create
   * modal never called it. The TITLE is the prompt, because that is the one
   * thing a person has always typed by this point; with no title there is
   * nothing to write from and the button says so rather than sending an empty
   * prompt and rendering whatever comes back.
   *
   * It FILLS the box rather than replacing what is in it silently: anything
   * already typed is kept and the generated text is appended, so pressing it
   * by accident cannot lose a sentence somebody wrote.
   */
  const writeDescription = useMutation({
    mutationFn: () =>
      api<{ description?: string }>('/ai/task/generate', {
        method: 'POST',
        body: { prompt: title.trim(), workspaceId },
      }),
    onSuccess: (draft) => {
      const written = (draft?.description ?? '').trim()
      if (!written) {
        toast.error(t('quickCreate.aiWriteEmpty'))
        return
      }
      setDescription((prev) => (prev.trim() ? `${prev.trim()}\n\n${written}` : written))
    },
    onError: (e) =>
      toast.error(
        t('quickCreate.aiWriteFailed', {
          reason: e instanceof ApiError ? `${e.status} — ${e.message}` : e instanceof Error ? e.message : String(e),
        }),
      ),
  })

  /*
   * §V2-01a — the field is created on the PROJECT, which is where custom-field
   * definitions live. So it exists for this task and every other one in the
   * project, which is what defining a field means; it is not a per-task
   * scribble.
   */
  const makeField = useMutation({
    mutationFn: () => {
      const needsOptions = newFieldType === 'dropdown' || newFieldType === 'labels'
      return api(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body: {
          name: newFieldName.trim(),
          type: newFieldType,
          /*
           * §V2-S01b frame `00:25` — "Field name*", and she says the name has
           * to come first. `isRequired` has been accepted by this endpoint
           * since custom fields shipped, and the project-shell field form
           * already offers it — this surface, the one the frames actually use,
           * did not. So a field created here could never be a required one,
           * and the required marker the task sheet draws had nothing to draw.
           */
          isRequired: newFieldRequired,
          /*
           * §V2-S01c — the field's SCOPE. `listId` has been accepted and stored
           * since custom fields shipped and honoured by no reader, so a field
           * meant for one list appeared on every task in the project anyway.
           * `getValuesForTask` narrows on it now; this is the control that sets
           * it.
           */
          ...(newFieldListOnly && listId ? { listId } : {}),
          // §V2-01b — the config panel's answers, sent only for the type
          // that has them. The service normalises whatever arrives.
          ...(newFieldType === 'progress_auto'
            ? { config: { sources: progressSources, doneStatusIs100: progressDoneIs100 } }
            : {}),
          // 0158 — the formula's expression travels in the same `config` the
          // progress panel uses, for the same reason: it is type-specific
          // settings that are not an option list.
          ...(newFieldType === 'formula'
            ? { config: { expression: newFieldExpression.trim() } }
            : {}),
          ...(needsOptions
            ? {
                // "High, Low" typed by a person becomes real options. The value
                // is the label lowercased rather than an invented id, so what
                // is stored is readable in the database too.
                options: newFieldOptions
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((label) => ({ label, value: label.toLowerCase().replace(/\s+/g, '-') })),
              }
            : {}),
        },
      })
    },
    onSuccess: () => {
      // The Fields tab on any task in this project reads from this list.
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      // Frame `00:35` — "Created field progress". The field appeared in a list
      // further down the dialog and nothing said it had been created.
      toast.success(t('quickCreate.fieldCreated', { name: newFieldName.trim() }))
      setMadeFields((prev) => [...prev, newFieldName.trim()])
      setMakingField(false)
      setNewFieldName('')
      setNewFieldOptions('')
      setNewFieldExpression('')
      setNewFieldRequired(false)
      setNewFieldListOnly(false)
      setFieldTypeQuery('')
      setFieldMoreOpen(false)
      setNewFieldListOnly(false)
      setFieldTypeQuery('')
      setFieldMoreOpen(false)
      /*
       * THE TYPE RESETS TOO. It used to persist while the options were
       * cleared, so after making a Labels field the next one opened as Labels
       * with an empty options box and a DISABLED Create button — a dead form,
       * for a reason the person had not caused and could not see. Found by a
       * suite whose next click simply never became possible.
       */
      setNewFieldType('text')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.fieldFailed')),
  })

  const create = useMutation({
    mutationFn: async () => {
      /*
       * Tags first, because the task wants ids and she types names —
       * [23:23] "agar aap likh ke enter kar doongi to yeh tag ban jayega".
       * Creating a name that already exists returns the existing label
       * (case-insensitively), so typing "Design" twice does not make two.
       *
       * A tag that will not create must not cost her the task: it is dropped
       * from the payload rather than thrown, the same rule the watcher and
       * attachment loops below already follow.
       */
      const labelIds: string[] = []
      for (const name of tagNames) {
        try {
          // `color` is required by CreateLabelDto — omitting it 400s, and the
          // catch below would then drop the tag silently. Same derivation the
          // task sheet uses, so a tag made here and one made there are the
          // same colour rather than two shades of the same word.
          const label = await api<{ id: string }>(`/workspaces/${workspaceId}/labels`, {
            method: 'POST',
            body: { name, color: colorForTagName(name) },
          })
          if (label?.id) labelIds.push(label.id)
        } catch {
          /* reported below with the other best-effort extras */
        }
      }
      /*
       * A template is not a set of defaults to copy into this form — it
       * carries checklists, subtasks and custom-field values this modal has
       * nowhere to put. So the server builds the task from it and the typed
       * title wins, rather than this form trying to reproduce it.
       */
      const task = templateId
        ? await api<{ id: string }>(`/workspaces/${workspaceId}/task-templates/${templateId}/instantiate`, {
            method: 'POST',
            body: { listId, titleOverride: title },
          })
        : await api<{ id: string }>(`/tasks`, {
            method: 'POST',
            // Omit status → backend seeds the list's first/default status.
            // Omit taskTypeId → same, for the list's default type.
            body: {
              listId,
              title,
              priority,
              ...(taskTypeId ? { taskTypeId } : {}),
              ...(description.trim() ? { description: description.trim() } : {}),
              ...(assigneeIds.length ? { assigneeIds } : {}),
              // datetime-local has no zone; the browser's own offset is the
              // one she picked it in, so let Date apply it rather than
              // pinning a Z and shifting everybody's 7pm.
              ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
              ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
              /*
               * §V2-S02 — through the SAME parser the task-detail field uses.
               * This used to be its own `Number(hours) * 3600`, so the two
               * boxes would have disagreed the moment one of them learned what
               * `90m` means. The column is seconds; what somebody may type is
               * `12`, `90m` or `1h 30m`.
               */
              ...(parseEstimate(estimateHours)
                ? { timeEstimate: parseEstimate(estimateHours)!.seconds }
                : {}),
              ...(labelIds.length ? { labelIds } : {}),
            },
          })

      // Both of these need a task to hang off, so they happen after it exists.
      // Neither is allowed to lose you the task: a watcher that cannot be added
      // or a file that will not upload is reported, not thrown.
      const problems: string[] = []
      for (const userId of watcherIds) {
        try {
          await api(`/tasks/${task.id}/watchers`, { method: 'POST', body: { userId } })
        } catch {
          problems.push(t('quickCreate.watcherFailed'))
        }
      }
      for (const file of attachments) {
        try {
          const contentType = file.type || 'application/octet-stream'
          const presign = await api<{ uploadUrl: string; storageKey: string }>(
            `/tasks/${task.id}/attachments/presign`,
            { method: 'POST', body: { fileName: file.name, contentType, sizeBytes: file.size } },
          )
          const put = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file,
          })
          if (!put.ok) throw new Error(String(put.status))
          await api(`/tasks/${task.id}/attachments`, {
            method: 'POST',
            body: { fileName: file.name, storageKey: presign.storageKey, contentType, sizeBytes: file.size },
          })
        } catch {
          // Named, because "an attachment failed" on a four-file task tells
          // nobody which one to try again.
          problems.push(t('quickCreate.attachmentFailedNamed', { name: file.name }))
        }
      }
      if (problems.length) toast.error(problems.join(' '))
      return task
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks', listId] })
      onClose()
      if (spaceId && projectId && listId) {
        navigate({
          to: '/app/$workspaceId/$spaceId/$projectId/$listId',
          params: { workspaceId, spaceId, projectId, listId },
          search: { task: task.id },
        })
      }
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() && listId) create.mutate()
      }}
    >
      <Input
        autoFocus
        data-testid="quick-create-task-title"
        placeholder={t('quickCreate.taskTitlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <Select data-testid="quick-create-space" labelKey="quickCreate.selectSpace" value={spaceId} onChange={(v) => { setSpaceId(v); setProjectId(''); setListId('') }} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
        <Select data-testid="quick-create-project" labelKey="quickCreate.selectProject" value={projectId} onChange={(v) => { setProjectId(v); setListId('') }} options={projects.map((p) => ({ value: p.id, label: p.name }))} disabled={!spaceId} />
        <Select data-testid="quick-create-list" labelKey="quickCreate.selectList" value={listId} onChange={setListId} options={lists.map((l) => ({ value: l.id, label: l.name }))} disabled={!spaceId} />
      </div>

      {/*
        §G15 [21:59] — a project with no list used to be a dead end here.
        §G15-10 [21:49] — and so was a SPACE with no project: the List field
        stayed disabled until you had invented one, which is the extra level
        she does not have. A space is now enough.
      */}
      {(projectId || spaceId) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/70 px-2 py-1.5">
          {lists.length === 0 && !makingList && (
            <span className="text-[11px] text-muted-foreground">{t('quickCreate.listRequired')}</span>
          )}
          {!makingList ? (
            <button
              type="button"
              data-testid="quick-create-new-list"
              onClick={() => setMakingList(true)}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {t('quickCreate.newListHere')}
            </button>
          ) : (
            <>
              <input
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                data-testid="quick-create-new-list-name"
                placeholder={t('quickCreate.listNamePlaceholder')}
                className="h-7 w-44 rounded-md border border-border bg-card px-1.5 text-[11px]"
              />
              <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={newListPrivate}
                  onChange={(e) => setNewListPrivate(e.target.checked)}
                  data-testid="quick-create-new-list-private"
                  className="h-3 w-3 rounded border-border"
                />
                {t('quickCreate.listPrivate')}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="quick-create-new-list-save"
                disabled={!newListName.trim() || makeList.isPending}
                onClick={() => makeList.mutate()}
              >
                {t('quickCreate.createList')}
              </Button>
            </>
          )}
        </div>
      )}
      {/*
        §V2-01a `[00:12]`–`[00:16]` — "humein ek task ke andar aur bhi option
        chahiye … hum woh FIELD ke through add kar sakte hain."

        SHE CREATES THE FIELD WHILE MAKING THE TASK. That is the whole reason
        the control is on screen at `[00:16]`: you discover you need somewhere
        to put something at the moment you are describing the work, not later in
        a settings page you would have to go and find. Rundesk could only define
        fields from the project page.

        It creates the DEFINITION, not a value. Custom fields belong to the
        project, so the field is there the moment this task is — and on every
        other task in the project too, which is what defining a field means. A
        value cannot be set before the task exists to hang it on.

        Gated on `projectId` because that is what a field belongs to. Picking
        only a space leaves it blank until a list is made, which sets it.
      */}
      {projectId && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/70 px-2 py-1.5">
          {!makingField ? (
            <button
              type="button"
              data-testid="quick-create-new-field"
              onClick={() => setMakingField(true)}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {t('quickCreate.newFieldHere')}
            </button>
          ) : (
            <>
              <input
                autoFocus
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                data-testid="quick-create-new-field-name"
                placeholder={t('quickCreate.fieldNamePlaceholder')}
                className="h-7 w-40 rounded-md border border-border bg-card px-1.5 text-[11px]"
              />
              {/*
                §V2-S01c frame `00:20` — a SEARCHABLE picker.
                
                THE SELECT IS STILL HERE, and deliberately. It is what a suite
                can `selectOption` on, what a screen reader announces as a
                listbox, and what works on a phone; the search box beside it
                narrows what it contains. Replacing it with a bespoke listbox
                would have traded three of those for one.
              */}
              <input
                value={fieldTypeQuery}
                onChange={(e) => {
                  setFieldTypeQuery(e.target.value)
                  /*
                   * Typing moves the selection to the first match, so the
                   * search box is not a filter you then have to act on
                   * separately — one gesture, as in the frame.
                   */
                  const q = e.target.value.trim().toLowerCase()
                  if (!q) return
                  const hit = CREATABLE_FIELD_TYPES.find((ft) =>
                    t(ft.labelKey).toLowerCase().includes(q),
                  )
                  if (hit) setNewFieldType(hit.value)
                }}
                data-testid="quick-create-new-field-type-search"
                placeholder={t('quickCreate.fieldTypeSearch')}
                className="h-7 w-36 rounded-md border border-border bg-card px-1.5 text-[11px]"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value)}
                data-testid="quick-create-new-field-type"
                className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
              >
                {fieldTypeMatches.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {t(ft.labelKey)}
                  </option>
                ))}
              </select>
              {fieldTypeMatches.length === 0 && (
                <span className="text-[11px] text-muted-foreground" data-testid="quick-create-new-field-type-none">
                  {t('quickCreate.fieldTypeNoMatch')}
                </span>
              )}
              {/*
                Dropdown and labels are the two that cannot exist without
                choices, and the API refuses them without — so the input appears
                rather than letting the save fail.
              */}
              {/*
                §V2-01b, frame `00:25` — THE PANEL SHE ACTUALLY FILLS IN.
                The field she demonstrates is Progress (Auto), and the frame is
                not the percentage, it is this configuration: which of three
                sources to count, and what a task with nothing to count should
                read when it is done.

                It was missing, and missing invisibly: the API has accepted
                `config` since the type shipped, so every field was created
                with hard-coded defaults and no way to change them. A setting
                that exists on the server and nowhere on screen is the same
                defect as a switch that changes nothing, seen from the other
                side.
              */}
              {newFieldType === 'progress_auto' && (
                <div
                  data-testid="quick-create-progress-config"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border/60 px-2 py-1.5"
                >
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {t('quickCreate.trackCompletionOf')}
                  </span>
                  {(['subtasks', 'checklists', 'assignedComments'] as const).map((src) => (
                    <label key={src} className="inline-flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={progressSources[src]}
                        data-testid={`quick-create-progress-${src}`}
                        onChange={(e) =>
                          setProgressSources((prev) => ({ ...prev, [src]: e.target.checked }))
                        }
                        className="h-3 w-3 rounded border-border"
                      />
                      {t(`quickCreate.source.${src}` as TranslationKey)}
                    </label>
                  ))}
                  <label className="inline-flex w-full items-center gap-1 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={progressDoneIs100}
                      data-testid="quick-create-progress-done100"
                      onChange={(e) => setProgressDoneIs100(e.target.checked)}
                      className="h-3 w-3 rounded border-border"
                    />
                    {t('quickCreate.doneStatusIs100')}
                  </label>
                </div>
              )}
              {(newFieldType === 'dropdown' || newFieldType === 'labels') && (
                <input
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  data-testid="quick-create-new-field-options"
                  placeholder={t('quickCreate.fieldOptionsPlaceholder')}
                  className="h-7 w-44 rounded-md border border-border bg-card px-1.5 text-[11px]"
                />
              )}
              {/*
                0158 — the expression, for the same reason the options box
                above appears: the API refuses a formula without one, so the
                input is here rather than letting the save fail. The field
                names go in braces and are checked against the project's real
                fields on the way in, so a typo is refused with the name it
                could not find rather than saved as a field that draws blank
                on every task forever.
              */}
              {newFieldType === 'formula' && (
                <input
                  value={newFieldExpression}
                  onChange={(e) => setNewFieldExpression(e.target.value)}
                  data-testid="quick-create-new-field-expression"
                  placeholder={t('quickCreate.fieldExpressionPlaceholder')}
                  className="h-7 w-56 rounded-md border border-border bg-card px-1.5 font-mono text-[11px]"
                />
              )}
              {/*
                Frame `00:25` — the asterisk on "Field name*". A required field
                is a real thing here: the task sheet marks it, and
                "Collapse empty fields" refuses to hide it because an empty
                required field is the one blank somebody has to act on.
              */}
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  data-testid="quick-create-new-field-required"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                {t('quickCreate.fieldRequired')}
              </label>
              {/*
                §V2-S01c frame `00:25` — "More settings and permissions".
                
                NAMED "More settings", not "and permissions", because there are
                no per-field permissions in this product to put behind it —
                `custom_field_definitions` has no permission columns, and an
                expander over nothing is the facade this pass keeps removing.
                What IS behind it is real and was worse than missing: the
                field's SCOPE. `listId` was stored by the API and read by
                nobody, so "only this list" was a promise the product broke
                every time.
              */}
              <button
                type="button"
                data-testid="quick-create-new-field-more"
                onClick={() => setFieldMoreOpen((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('quickCreate.fieldMoreSettings')}
              </button>
              {fieldMoreOpen && (
                <div
                  data-testid="quick-create-new-field-more-panel"
                  className="flex w-full items-center gap-2 rounded border border-border/60 px-2 py-1.5"
                >
                  <span className="text-[11px] text-muted-foreground">
                    {t('quickCreate.fieldAppliesTo')}
                  </span>
                  <select
                    value={newFieldListOnly ? 'list' : 'project'}
                    onChange={(e) => setNewFieldListOnly(e.target.value === 'list')}
                    data-testid="quick-create-new-field-scope"
                    disabled={!listId}
                    className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px] disabled:opacity-50"
                  >
                    <option value="project">{t('quickCreate.fieldAppliesProject')}</option>
                    {/* Offered only when a list is chosen: "only this list" has
                        to have a list to mean. */}
                    <option value="list">{t('quickCreate.fieldAppliesList')}</option>
                  </select>
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="quick-create-new-field-save"
                disabled={
                  !newFieldName.trim() ||
                  makeField.isPending ||
                  ((newFieldType === 'dropdown' || newFieldType === 'labels') &&
                    newFieldOptions.trim() === '') ||
                  (newFieldType === 'formula' && newFieldExpression.trim() === '')
                }
                onClick={() => makeField.mutate()}
              >
                {t('quickCreate.createField')}
              </Button>
              {/*
                Frame `00:25` pairs Create with Cancel. Without it this row was
                one-way: once "+ Create new field" was pressed the only ways out
                were to create a field you had decided against, or to close the
                whole task you were in the middle of writing.
              */}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid="quick-create-new-field-cancel"
                onClick={() => {
                  setMakingField(false)
                  setNewFieldName('')
                  setNewFieldOptions('')
                  setNewFieldRequired(false)
                  setNewFieldListOnly(false)
                  setFieldTypeQuery('')
                  setFieldMoreOpen(false)
                  setNewFieldListOnly(false)
                  setFieldTypeQuery('')
                  setFieldMoreOpen(false)
                }}
              >
                {t('common.cancel')}
              </Button>
            </>
          )}
          {madeFields.length > 0 && (
            <span className="text-[11px] text-muted-foreground" data-testid="quick-create-made-fields">
              {t('quickCreate.fieldsAdded', { names: madeFields.join(', ') })}
            </span>
          )}
        </div>
      )}
      {taskTypes.length > 0 && (
        <Select
          labelKey="quickCreate.selectTaskType"
          value={taskTypeId}
          onChange={setTaskTypeId}
          options={taskTypes.map((type) => ({
            value: type.id,
            label: type.isDefault ? `${type.name} (${t('quickCreate.taskTypeDefault')})` : type.name,
          }))}
          data-testid="quick-create-task-type"
        />
      )}

      {/* §G15 [22:26]–[23:31] — everything she fills in before pressing create. */}
      <div className="relative">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="quick-create-description"
          placeholder={t('quickCreate.descriptionPlaceholder')}
          rows={2}
          className="w-full resize-y rounded-md border border-border bg-card px-2 py-1.5 pr-[5.5rem] text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {/* Frame `10:04`'s "⚡AI", as something you can press. */}
        <button
          type="button"
          data-testid="quick-create-describe-ai"
          disabled={!title.trim() || writeDescription.isPending}
          title={title.trim() ? t('quickCreate.aiWrite') : t('quickCreate.aiWriteNeedsTitle')}
          onClick={() => writeDescription.mutate()}
          className={cn(
            'absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px]',
            title.trim() && !writeDescription.isPending
              ? 'text-muted-foreground hover:bg-surface-50 hover:text-foreground'
              : 'text-muted-foreground/50',
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {writeDescription.isPending ? t('quickCreate.aiWriting') : t('quickCreate.aiWrite')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('quickCreate.startDate')}
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="quick-create-start"
            className="h-8 rounded-md border border-border bg-card px-1.5 text-[12px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('quickCreate.dueDate')}
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            data-testid="quick-create-due"
            className="h-8 rounded-md border border-border bg-card px-1.5 text-[12px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('quickCreate.priority')}
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            data-testid="quick-create-priority"
            className="h-8 rounded-md border border-border bg-card px-1.5 text-[12px] text-foreground"
          >
            <option value="urgent">{t('taskDetail.priority.urgent')}</option>
            <option value="high">{t('taskDetail.priority.high')}</option>
            <option value="normal">{t('taskDetail.priority.normal')}</option>
            <option value="low">{t('taskDetail.priority.low')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('quickCreate.timeEstimate')}
          <input
            type="text"
            value={estimateHours}
            onChange={(e) => setEstimateHours(e.target.value)}
            data-testid="quick-create-estimate"
            placeholder={t('taskDetail.estimatePlaceholder')}
            className="h-8 rounded-md border border-border bg-card px-1.5 text-[12px] text-foreground"
          />
        </label>
      </div>

      {/* [22:55] "ASSIGN pe main khud ko assign kar sakti hoon ya kisi aur ko" —
          assignment is a create-time decision, not an afterthought. */}
      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="quick-create-assignees">
          <select
            value=""
            data-testid="quick-create-assign"
            onChange={(e) => {
              const id = e.target.value
              if (id && !assigneeIds.includes(id)) setAssigneeIds((prev) => [...prev, id])
            }}
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
          >
            <option value="">{t('quickCreate.assign')}</option>
            {members
              .filter((m) => !assigneeIds.includes(m.userId))
              .map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
              ))}
          </select>
          {assigneeIds.map((id) => {
            const m = members.find((x) => x.userId === id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => setAssigneeIds((prev) => prev.filter((x) => x !== id))}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-muted/70"
                title={t('common.remove')}
              >
                {m?.displayName || m?.email || id}
                <X className="h-3 w-3" />
              </button>
            )
          })}
        </div>
      )}

      {/* [23:23] "agar aap likh ke enter kar doongi to yeh tag ban jayega" —
          typed and committed with Enter, exactly as she describes it. */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="quick-create-tags">
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // Enter commits a tag; it must not also submit the half-filled form.
            e.preventDefault()
            const name = tagDraft.trim()
            if (name && !tagNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
              setTagNames((prev) => [...prev, name])
            }
            setTagDraft('')
          }}
          data-testid="quick-create-tag-input"
          placeholder={t('quickCreate.tagPlaceholder')}
          className="h-7 w-36 rounded-md border border-border bg-card px-1.5 text-[11px]"
        />
        {tagNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTagNames((prev) => prev.filter((n) => n !== name))}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-muted/70"
            title={t('common.remove')}
          >
            {name}
            <X className="h-3 w-3" />
          </button>
        ))}
      </div>
      {/*
        §G15 frame #12 — Templates, attach and notify, at the moment you are
        deciding what the task is. Each one is a control over machinery that
        already existed and had no entry point from here.
      */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
        {templates.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              data-testid="quick-create-template"
              className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
            >
              <option value="">{t('quickCreate.noTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </label>
        )}

        <label
          className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          title={t('quickCreate.attachFile')}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <input
            type="file"
            multiple
            className="hidden"
            data-testid="quick-create-attach"
            onChange={(e) => {
              addAttachments(e.target.files)
              // Clear the input, or picking the SAME file after removing it
              // fires no change event and the row never comes back.
              e.target.value = ''
            }}
          />
          <span className="max-w-[9rem] truncate">
            {attachments.length
              ? t('quickCreate.attachCount', { count: attachments.length })
              : t('quickCreate.attachFile')}
          </span>
        </label>

        {members.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            <select
              value=""
              data-testid="quick-create-notify"
              onChange={(e) => {
                const id = e.target.value
                if (id && !watcherIds.includes(id)) setWatcherIds((prev) => [...prev, id])
              }}
              className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
            >
              <option value="">
                {watcherIds.length ? t('quickCreate.notifyCount', { count: watcherIds.length }) : t('quickCreate.notify')}
              </option>
              {members
                .filter((m) => !watcherIds.includes(m.userId))
                .map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                ))}
            </select>
          </label>
        )}
      </div>

      {/*
        Frame `01:10` — the **Attachments** section. It only exists once there
        is something in it, because a permanently-drawn empty panel is the
        `toBeVisible()`-on-a-container shape: it says nothing about whether a
        file was staged.
      */}
      {attachments.length > 0 && (
        <div className="space-y-1.5" data-testid="quick-create-attachments">
          <div className="text-[11px] font-medium text-muted-foreground">
            {t('quickCreate.attachmentsHeading')}
          </div>
          <ul className="space-y-1">
            {attachments.map((file, i) => (
              <li
                key={`${file.name}:${file.size}:${i}`}
                /*
                  TESTID NAMESPACES, the §V2 rule: `quick-create-attachrow-` is
                  ONE ELEMENT PER STAGED FILE and nothing else, so a count of
                  that prefix is a count of files. The name and the X live under
                  their own prefixes rather than joining it — that is exactly
                  how `space-wizard-feature-` came to answer 18 for 6.
                */
                data-testid={`quick-create-attachrow-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-[12px]"
              >
                <span className="min-w-0 truncate" data-testid={`quick-create-attachname-${i}`}>{file.name}</span>
                <button
                  type="button"
                  data-testid={`quick-create-attachremove-${i}`}
                  aria-label={t('quickCreate.attachRemove', { name: file.name })}
                  onClick={() => setAttachments((prev) => prev.filter((_, at) => at !== i))}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-surface-50 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        {/*
          The list tab's submit has had a test id since §V2-S11; the TASK tab's
          — the one people use most — did not, so a suite could fill the whole
          form and then have nothing to press by name.
        */}
        <Button
          type="submit"
          size="sm"
          data-testid="quick-create-submit"
          disabled={!title.trim() || !listId || create.isPending}
        >
          {create.isPending ? t('quickCreate.creating') : t('quickCreate.createTask')}
        </Button>
      </div>
    </form>
  )
}

function ListForm({
  workspaceId,
  onClose,
  initialSpaceId,
}: { workspaceId: string; onClose: () => void; initialSpaceId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [listPrivate, setListPrivate] = useState(false)
  const [createdList, setCreatedList] = useState<{ id: string; name: string } | null>(null)
  // §V2-06 frame `08:00` — "+ → List" on a space means a list in THAT space.
  const [spaceId, setSpaceId] = useState(initialSpaceId ?? '')
  const [projectId, setProjectId] = useState('')

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []
  const projects = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
    enabled: !!spaceId,
  }).data ?? []

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/lists`, {
        method: 'POST',
        body: JSON.stringify({ projectId, name, visibility: listPrivate ? 'private' : 'public' }),
      }),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['lists', projectId] })
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      /*
       * §G15 [22:15] — "list mein aap ko VIEW kaisa chahiye … main filhaal
       * 'no thanks' kar rahi hoon, main is ko baad mein set down karoongi."
       *
       * She declines it on camera, which is the point: the step is offered and
       * skipping it is one click. Both create paths used to navigate straight
       * into an empty list, so a list shipped with views nobody chose at the
       * one moment anybody is thinking about its shape.
       */
      setCreatedList({ id: list.id, name })
    },
    /*
     * §V2-S11 frame `08:50` — the error toast. THIS MUTATION HAD NO `onError`,
     * so a refused create — now including "List name taken" — did nothing at
     * all: the dialog sat there with the button looking un-pressed and the
     * person had no idea why. The frame's toast could not have appeared however
     * the API answered.
     */
    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.listFailed')),
  })

  if (createdList) {
    return (
      <ListSettingsStep
        list={createdList}
        onDone={() => {
          onClose()
          navigate({
            to: '/app/$workspaceId/$spaceId/$projectId/$listId',
            params: { workspaceId, spaceId, projectId, listId: createdList.id },
          })
        }}
      />
    )
  }

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && projectId) create.mutate()
      }}
    >
      <Input autoFocus data-testid="quick-create-list-name" placeholder={t('quickCreate.listNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      {/* §G15 [22:07] — "yeh pooch raha ke PRIVATE karni hai ke nahi". Asked
          while the list is being made, not after: changing it afterwards
          leaves a window in which the wrong people can see it. */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          data-testid="quick-create-list-private"
          checked={listPrivate}
          onChange={(e) => setListPrivate(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border"
        />
        {t('quickCreate.listPrivate')}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Select data-testid="quick-create-list-space" labelKey="quickCreate.selectSpace" value={spaceId} onChange={(v) => { setSpaceId(v); setProjectId('') }} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
        <Select data-testid="quick-create-list-project" labelKey="quickCreate.selectProject" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} disabled={!spaceId} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" data-testid="quick-create-list-submit" disabled={!name.trim() || !projectId || create.isPending}>{t('quickCreate.createList')}</Button>
      </div>
    </form>
  )
}

/**
 * §G15 [22:15] / frame #7 — the step after a list is made.
 *
 * > "List banne ke baad poochhe ke view kaisa chahiye — main abhi 'no thanks'
 * >  karoon aur baad mein set kar loon."
 *
 * Offered, and skippable in one click, because that is exactly what she does
 * with it. What it offers is only what a list really has: views, which are
 * per-list rows with one of them default. It does not offer AI-generated
 * custom fields or a default task type, because neither is a per-list thing
 * here — a step that listed settings this product cannot actually apply to a
 * list would be worse than no step.
 *
 * Nothing is applied unless something is ticked, and the list already exists
 * either way: this is a step ABOUT the list, never a second chance to create it.
 */
const LIST_VIEW_CHOICES = [
  { type: 'list' as const, labelKey: 'quickCreate.viewList' },
  { type: 'board' as const, labelKey: 'quickCreate.viewBoard' },
  { type: 'calendar' as const, labelKey: 'quickCreate.viewCalendar' },
]

function ListSettingsStep({
  list,
  onDone,
}: {
  list: { id: string; name: string }
  onDone: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // List is ticked by default because it is the view a list opens on; the
  // other two are a decision.
  const [chosen, setChosen] = useState<Array<'list' | 'board' | 'calendar'>>(['list'])

  const apply = useMutation({
    mutationFn: async () => {
      let first = true
      for (const type of chosen) {
        const view = await api<{ id: string }>(`/lists/${list.id}/views`, {
          method: 'POST',
          body: { name: t(LIST_VIEW_CHOICES.find((v) => v.type === type)!.labelKey as TranslationKey), type },
        })
        // The first one ticked is the one the list opens on.
        if (first) {
          await api(`/views/${view.id}`, { method: 'PATCH', body: { isDefault: true } })
          first = false
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list-views', list.id] })
      onDone()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  return (
    <div className="px-5 py-4 space-y-3" data-testid="list-settings-step">
      <div>
        <p className="text-sm font-medium">{t('quickCreate.listReady', { name: list.name })}</p>
        <p className="text-xs text-muted-foreground">{t('quickCreate.listSettingsHint')}</p>
      </div>

      <div className="space-y-1.5">
        {LIST_VIEW_CHOICES.map((choice) => (
          <label
            key={choice.type}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs hover:bg-muted/40"
          >
            <input
              type="checkbox"
              data-testid={`list-settings-view-${choice.type}`}
              checked={chosen.includes(choice.type)}
              onChange={(e) =>
                setChosen((prev) =>
                  e.target.checked ? [...prev, choice.type] : prev.filter((c) => c !== choice.type),
                )
              }
              className="h-3.5 w-3.5 rounded border-border"
            />
            {t(choice.labelKey as TranslationKey)}
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {/* Her own words for this button. Skipping applies nothing and leaves
            the list exactly as it was created. */}
        <Button type="button" variant="outline" size="sm" data-testid="list-settings-skip" onClick={onDone}>
          {t('quickCreate.noThanks')}
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="list-settings-apply"
          disabled={chosen.length === 0 || apply.isPending}
          onClick={() => apply.mutate()}
        >
          {apply.isPending ? t('quickCreate.creating') : t('quickCreate.applySettings')}
        </Button>
      </div>
    </div>
  )
}

function FolderForm({
  workspaceId,
  onClose,
  initialSpaceId,
}: { workspaceId: string; onClose: () => void; initialSpaceId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState(initialSpaceId ?? '')
  /**
   * §V2-S09 frame `08:32` — **Make private**, "Only you and invited members
   * have access", on the Create Folder dialog.
   *
   * `folders.visibility` is a real column with a real reader: every folder read
   * path narrows a `private` folder to its creator and the workspace's
   * managers. `PATCH /spaces/:id/folders/:folderId` has accepted `visibility`
   * all along — the CREATE route does not, so this sets it immediately after,
   * on the id the create returned.
   *
   * Two round trips is not free, and the second one is allowed to fail loudly
   * rather than quietly: a folder that was asked to be private and came out
   * public is the one outcome nobody must be left guessing about, so the
   * failure names it and the dialog stays honest about what exists.
   */
  const [isPrivate, setIsPrivate] = useState(false)

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []

  const create = useMutation({
    // Folders have no page of their own — they render on their space, which is
    // also where a just-created one is easiest to see.
    mutationFn: async () => {
      const folder = await api<{ id: string }>(`/spaces/${spaceId}/folders`, { method: 'POST', body: { name } })
      if (isPrivate && folder?.id) {
        try {
          await api(`/spaces/${spaceId}/folders/${folder.id}`, {
            method: 'PATCH',
            body: { visibility: 'private' },
          })
        } catch {
          toast.error(t('quickCreate.folderPrivateFailed', { name }))
        }
      }
      return folder
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      qc.invalidateQueries({ queryKey: ['folders', spaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId } })
    },
    /*
     * §V2-S10 frame `08:25`, spoken at `[08:55]`: "agar koi error aata hai to
     * yeh yahan show kar deta hai."
     *
     * THIS MUTATION HAD NO `onError` — the identical defect commit `88830db`
     * found and fixed on the List tab a few hundred lines up, on the Folder tab
     * standing right beside it. A refused create did nothing at all: the dialog
     * stayed open with the button looking un-pressed, which is indistinguishable
     * from a hang. Now that folder names are unique per space (0157) there is
     * something for it to report, and until this line there was no way for it to
     * reach anybody.
     */
    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.folderFailed')),
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && spaceId) create.mutate()
      }}
    >
      <Input autoFocus data-testid="quick-create-folder-name" placeholder={t('quickCreate.folderNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select data-testid="quick-create-folder-space" labelKey="quickCreate.selectSpace" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
      {/* Frame `08:32`'s toggle, with the frame's own sentence under it. */}
      <label className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-2.5 py-2">
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-[13px]">
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {t('quickCreate.folderPrivate')}
          </span>
          <span className="text-[11px] text-muted-foreground">{t('quickCreate.folderPrivateHint')}</span>
        </span>
        <input
          type="checkbox"
          checked={isPrivate}
          data-testid="quick-create-folder-private"
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" data-testid="quick-create-folder-submit" disabled={!name.trim() || !spaceId || create.isPending}>{t('quickCreate.createFolder')}</Button>
      </div>
    </form>
  )
}

function ProjectForm({
  workspaceId,
  onClose,
  initialSpaceId,
}: { workspaceId: string; onClose: () => void; initialSpaceId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState(initialSpaceId ?? '')
  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []

  const create = useMutation({
    mutationFn: () => api<{ id: string }>(`/projects`, { method: 'POST', body: JSON.stringify({ spaceId, name }) }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects', spaceId] })
      onClose()
      navigate({
        to: '/app/$workspaceId/$spaceId/$projectId',
        params: { workspaceId, spaceId, projectId: project.id },
      })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && spaceId) create.mutate()
      }}
    >
      <Input autoFocus data-testid="quick-create-project-name" placeholder={t('quickCreate.projectNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select data-testid="quick-create-project-space" labelKey="quickCreate.selectSpace" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !spaceId || create.isPending}>{t('quickCreate.createProject')}</Button>
      </div>
    </form>
  )
}

/**
 * §V2-06 — the Space tab hands straight to the wizard.
 *
 * What stood here was a single name input that POSTed `{ workspaceId, name }`.
 * The sidebar's "New space" had its own, different, also-name-only dialog. Two
 * dialogs for one action, and neither could reach the description, colour and
 * icon the API had accepted all along.
 *
 * The wizard opens over this modal and closes it on success, so the person
 * does not end up looking at a create modal behind a created space.
 */
function SpaceForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <CreateSpaceWizard
      open
      onOpenChange={(next) => { if (!next) onClose() }}
      workspaceId={workspaceId}
      onCreated={(space) => {
        onClose()
        navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId: space.id } })
      }}
    />
  )
}

function DocForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/workspaces/${workspaceId}/docs`, {
        method: 'POST',
        body: JSON.stringify({ title: title || 'Untitled' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs', workspaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/docs', params: { workspaceId } })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <Input autoFocus placeholder={t('quickCreate.docTitlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={create.isPending}>{t('quickCreate.createDoc')}</Button>
      </div>
    </form>
  )
}

/**
 * §G15 [21:36] — "phir REMINDER ka".
 *
 * A reminder made here is about nothing in particular, which is the normal
 * case for one: you are creating it, not annotating something that already
 * exists. That was impossible until `reminders.task_id` became nullable — the
 * old code path had to invent a task to hold the text, and refused outright in
 * a workspace with no list.
 */
function ReminderForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  // An hour out, in the reader's own clock: `datetime-local` takes wall time
  // with no zone, so `toISOString()` here would silently show UTC.
  const [when, setWhen] = useState(() => {
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    return new Date(soon.getTime() - soon.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16)
  })

  const create = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/reminders`, {
        method: 'POST',
        body: { remindAt: new Date(when).toISOString(), note },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders', workspaceId] })
      onClose()
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      data-testid="quick-create-reminder"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <Input
        autoFocus
        data-testid="reminder-note"
        placeholder={t('quickCreate.reminderNotePlaceholder')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="block text-[12px] text-muted-foreground">
        {t('quickCreate.reminderWhen')}
        <input
          type="datetime-local"
          data-testid="reminder-when"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="mt-0.5 h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
        />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!note.trim() || !when || create.isPending}>
          {t('quickCreate.createReminder')}
        </Button>
      </div>
    </form>
  )
}

/** §G15 [21:36] — "phir WHITEBOARD ka". A canvas of type `whiteboard`. */
function WhiteboardForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/workspaces/${workspaceId}/canvases`, {
        method: 'POST',
        body: { type: 'whiteboard', title: title.trim() || t('quickCreate.untitled'), data: { items: [] } },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'whiteboard'] })
      onClose()
      navigate({ to: '/app/$workspaceId/whiteboards', params: { workspaceId } })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      data-testid="quick-create-whiteboard"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <Input
        autoFocus
        data-testid="whiteboard-title"
        placeholder={t('quickCreate.whiteboardTitlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={create.isPending}>{t('quickCreate.createWhiteboard')}</Button>
      </div>
    </form>
  )
}

/**
 * §G15 [21:36] — "phir DASHBOARD ka".
 *
 * An empty layout, deliberately. Guessing at cards somebody has not asked for
 * means their first act on a new dashboard is deleting things.
 */
function DashboardForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/dashboards`, {
        method: 'POST',
        body: { workspaceId, name: name.trim() || t('quickCreate.untitled'), layout: [] },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/dashboard', params: { workspaceId } })
    },
  })

  return (
    <form
      className="px-5 py-4 space-y-3"
      data-testid="quick-create-dashboard"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <Input
        autoFocus
        data-testid="dashboard-name"
        placeholder={t('quickCreate.dashboardNamePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={create.isPending}>{t('quickCreate.createDashboard')}</Button>
      </div>
    </form>
  )
}

/**
 * A1.9 — ClickUp's "+" menu ends in Templates and Import. Both pages already
 * exist here; nothing linked to them from the point where you decide to create
 * something, which is the only moment they are useful.
 */
function Footer({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const go = (to: '/app/$workspaceId/templates' | '/app/$workspaceId/import') => {
    onClose()
    navigate({ to, params: { workspaceId } })
  }
  return (
    <div className="px-5 py-2.5 border-t border-border flex items-center gap-3 bg-surface-50/50">
      {/*
        §V2-S09 frame `08:32` draws **Use Templates** in the Create FOLDER
        dialog's own footer. In Rundesk the footer is shared by every tab, so
        the Folder tab has carried it since §V2-S07 — it had no test id, which
        is how a row that is satisfied goes on being recorded as missing.
      */}
      <button
        type="button"
        data-testid="create-footer-templates"
        onClick={() => go('/app/$workspaceId/templates')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Layers className="h-3.5 w-3.5" />
        {t('quickCreate.fromTemplate')}
      </button>
      <button
        type="button"
        data-testid="create-footer-import"
        onClick={() => go('/app/$workspaceId/import')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Upload className="h-3.5 w-3.5" />
        {t('quickCreate.import')}
      </button>
    </div>
  )
}

function Select({
  labelKey,
  value,
  onChange,
  options,
  disabled,
  'data-testid': testId,
}: {
  labelKey: TranslationKey
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  'data-testid'?: string
}) {
  const { t } = useTranslation()
  return (
    <label className="text-xs">
      <span className="text-muted-foreground mb-1 block">{t(labelKey)}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        data-testid={testId}
        className="w-full h-9 px-2 rounded-md border border-border bg-card text-sm disabled:opacity-50"
      >
        <option value="">{t('quickCreate.selectPlaceholder')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
