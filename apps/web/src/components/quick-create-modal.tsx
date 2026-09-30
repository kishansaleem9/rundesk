import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  cn,
  toast,
} from '@rundesk/ui'
import { Layers, Upload, X, Bell, Paperclip, Search, Sparkles, Lock, ChevronDown, Check, RefreshCw, Save } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { CreateSpaceWizard } from './create-space-wizard'
import { colorForTagName } from './task-tags'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { useCreatable } from '../hooks/use-creatable'
import { usePermissions } from '../hooks/use-permissions'
import { daysFromToday, localDateTimeValue } from '../lib/local-date'
import { parseEstimate } from '../lib/estimate'
import { CREATE_TYPES, createTypeOf, type CreateKind } from '../lib/create-types'

type Space = { id: string; name: string }
type Project = { id: string; name: string }
// The lists routes answer whole rows; `projectId` is the container a list
// picked under a space alone lives in, which opening its task needs.
type List = { id: string; name: string; projectId?: string }
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
  onClose: onCloseProp,
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
  /*
   * THE CURSOR GOES BACK WHERE IT CAME FROM
   * (`found-29-sep/create-modal-returns-focus-to-nothing`). This is a portal
   * with a document Escape listener, not a dialog, and it restored focus to
   * nothing: whatever had the cursor lost it to `<body>` when the modal
   * unmounted. A dialog gives it back to what had it when it opened, so this
   * remembers that — read on the first render, before the form's title takes
   * the cursor — and every way the modal closes goes through `onClose` below,
   * which hands it back first. Not if it has left the page (a navigation, a
   * sheet that closed): a detached element cannot take the cursor.
   *
   * The menus that open this let the cursor settle on their own "+" before it
   * opens (`CommentPlusMenu`, the space "+" in the sidebar), so that is what
   * it returns to. Given back in the close itself, not in an unmount cleanup:
   * under StrictMode a cleanup also runs on the first mount, and would take the
   * cursor out of the title the moment it arrived.
   */
  const [opener] = useState(() => {
    const el = document.activeElement
    return el instanceof HTMLElement && el !== document.body ? el : null
  })
  const onClose = useCallback(() => {
    if (opener?.isConnected) opener.focus({ preventScroll: true })
    onCloseProp()
  }, [opener, onCloseProp])
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
  // The types this person may make (`useCreatable`, the space menu's own
  // answer): a permission key once held, and for a guest what their row allows.
  const creatable = useCreatable(workspaceId)
  const offered = useMemo(() => CREATE_TYPES.filter((ty) => creatable(ty)), [creatable])
  const { shown: shownTypes, matched: typeMatchCount } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { shown: offered, matched: offered.length }
    const hits = offered.filter(
      (ty) => t(ty.labelKey).toLowerCase().includes(q) || t(ty.blurbKey).toLowerCase().includes(q),
    )
    const keep = new Set(hits.map((ty) => ty.value))
    keep.add(mode)
    return { shown: offered.filter((ty) => keep.has(ty.value)), matched: hits.length }
  }, [query, mode, t, offered])

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
        {mode === 'form' && <FormForm workspaceId={workspaceId} onClose={onClose} initialSpaceId={initialSpaceId} />}
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

  /*
   * A FORM TALLER THAN THE WINDOW SCROLLS (`found-30-sep/create-modal-cuts-off-create`).
   * The backdrop is fixed to the window and the card had no height of its own
   * to scroll in, so whatever of the form fell below the window's edge could
   * not be reached. Measured on the build before this, the Task tab with a
   * list chosen: Create task at 859–891px from the top, out of reach in a
   * window 768 high (a laptop's) and pressable only from about 900 up; the
   * note a chosen template adds (`TemplateMergeNote`) put it out of reach at
   * 1000. The backdrop scrolls now, with room under the card.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/55 backdrop-blur-[1px] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div className="relative z-[10000] mb-10" onClick={(e) => e.stopPropagation()}>{children}</div>
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
  /** The server's sentence for a refusal; `reason` is its code. */
  message?: string
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
          {/* What the planner could not do, said beside what it will: the type
              carried these and nothing drew them. */}
          {(plan.warnings ?? []).map((warning, i) => (
            <p key={i} className="mt-1 text-[11px] text-amber-700 dark:text-amber-400" data-testid={`create-ai-warning-${i}`}>
              {warning}
            </p>
          ))}
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
                {r.message ? (
                  <span className="block text-[11px] text-muted-foreground">{r.message}</span>
                ) : r.reason ? (
                  ` (${r.reason})`
                ) : null}
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
/**
 * What `POST …/task-templates/:id/instantiate` answers: the new task's id as
 * `taskId`, beside the task. Not a task, so it has no `id` of its own.
 */
type InstantiatedTask = { taskId: string; task?: { title?: string } }
/** Which of the Templates menu's two writes has its panel open, and on what. */
type TemplatePanel = { kind: 'save' } | { kind: 'update'; template: TaskTemplate }
type WorkspaceMember = { userId: string; displayName?: string | null; email?: string | null }

/**
 * `ledger-rows/row-1060`, frame `00:52` — the create footer's **Templates**,
 * a menu of four in two groups: **Use Template** and **Create instantly from
 * template**, a divider, then **Save as template** (a floppy) and **Update
 * existing template** (a circular arrow). ClickUp's help centre names the same
 * four for its task creation modal ("Create a task", from search excerpts):
 * "create the task instantly from a template, load a task template, save the
 * task as a template, or update an existing task template".
 *
 * This was one of the four, as a `<select>` that made the submit instantiate
 * the template chosen. Choosing under Use Template still does exactly that, and
 * the choice is on the button, with an X beside it to take it back.
 *
 * OFFERED AS FAR AS IT CAN BE DONE. With no templates there is nothing to use,
 * make from or update, so only Save is left; Save and Update are
 * `template.manage` (the API answers 403 without it,
 * `task-templates.controller.ts`), so a person without it is never offered
 * them; with neither, there is no button. Create instantly needs a list to
 * make the task in, and says so until one is chosen.
 */
function TemplatesMenu({
  templates,
  chosenId,
  mayManage,
  instantBlocked,
  onUse,
  onClear,
  onInstant,
  onSave,
  onUpdate,
  onCloseAutoFocus,
}: {
  templates: TaskTemplate[]
  chosenId: string
  mayManage: boolean
  /** Why Create instantly cannot run now: no list yet, or a create in flight. */
  instantBlocked: 'list' | 'busy' | null
  onUse: (id: string) => void
  onClear: () => void
  onInstant: (template: TaskTemplate) => void
  onSave: () => void
  onUpdate: (template: TaskTemplate) => void
  onCloseAutoFocus: (e: Event) => void
}) {
  const { t } = useTranslation()
  const chosen = templates.find((tpl) => tpl.id === chosenId)
  const any = templates.length > 0
  if (!any && !mayManage) return null
  /*
   * The submenus are portalled like the menu, so each sits above the modal's
   * z-[10000] on its own, and each keeps its Escape: the modal closes on any
   * Escape that reaches the document, and one spent closing a submenu must not
   * throw away the half-filled task (the Create Task ▾ menu's rule, below).
   */
  const keepEscape = (e: KeyboardEvent) => e.stopPropagation()
  const listOf = (prefix: string, pick: (template: TaskTemplate) => void, checked?: string) => (
    <DropdownMenuPortal>
      <DropdownMenuSubContent className="z-[10002] w-60" data-testid={`quick-create-tpl-list-${prefix}`} onEscapeKeyDown={keepEscape}>
        {templates.map((tpl) => (
          <DropdownMenuItem
            key={tpl.id}
            data-testid={`quick-create-tpl-${prefix}-${tpl.id}`}
            onSelect={() => pick(tpl)}
          >
            {checked !== undefined && (
              <Check className={cn('h-3.5 w-3.5 shrink-0', tpl.id === checked ? 'opacity-100' : 'opacity-0')} aria-hidden />
            )}
            <span className="truncate">{tpl.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  )
  return (
    <span className="inline-flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="quick-create-templates"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="max-w-[12rem] truncate">
              {chosen ? t('quickCreate.templateChosen', { name: chosen.name }) : t('quickCreate.templates')}
            </span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-[10001] w-64"
          data-testid="quick-create-tpl-menu"
          onEscapeKeyDown={keepEscape}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {any && (
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger inset data-testid="quick-create-tpl-action-use">
                  {t('quickCreate.templateUse')}
                </DropdownMenuSubTrigger>
                {listOf('use', (tpl) => onUse(tpl.id), chosenId)}
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  inset
                  data-testid="quick-create-tpl-action-instant"
                  disabled={instantBlocked !== null}
                  className="data-[disabled]:opacity-60"
                >
                  <span className="flex flex-col">
                    <span>{t('quickCreate.templateInstant')}</span>
                    {instantBlocked === 'list' && (
                      <span className="text-[11px] text-muted-foreground" data-testid="quick-create-tpl-needs-list">
                        {t('quickCreate.templateNeedsList')}
                      </span>
                    )}
                  </span>
                </DropdownMenuSubTrigger>
                {listOf('instant', onInstant)}
              </DropdownMenuSub>
            </DropdownMenuGroup>
          )}
          {any && mayManage && <DropdownMenuSeparator data-testid="quick-create-tpl-divider" />}
          {mayManage && (
            <DropdownMenuGroup>
              <DropdownMenuItem data-testid="quick-create-tpl-action-save" onSelect={onSave}>
                <Save className="h-3.5 w-3.5" aria-hidden />
                {t('quickCreate.templateSave')}
              </DropdownMenuItem>
              {any && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2" data-testid="quick-create-tpl-action-update">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    {t('quickCreate.templateUpdate')}
                  </DropdownMenuSubTrigger>
                  {listOf('update', onUpdate)}
                </DropdownMenuSub>
              )}
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {chosen && (
        <button
          type="button"
          data-testid="quick-create-templates-clear"
          aria-label={t('quickCreate.templateClear', { name: chosen.name })}
          title={t('quickCreate.templateClear', { name: chosen.name })}
          onClick={onClear}
          className="rounded p-0.5 text-muted-foreground hover:bg-surface-50 hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/**
 * `found-30-sep/template-submit-ignores-the-form` — WHAT CREATE WILL DO WITH THE
 * TEMPLATE CHOSEN, said beside it before Create is pressed. With a template
 * chosen, Create task made the task from the template alone, and everything
 * else typed into the form was dropped without a word.
 *
 * ClickUp's task creation modal offers to "load a task template" (help centre,
 * "Create a task"), and templates "are merged when applied to an existing task"
 * ("Intro to templates"): its merge keeps the target's "tags, priorities,
 * dates … and estimated time", adds the other's description "to the bottom",
 * and adds its assignees ("Merge tasks"). So the form here is the task, and the
 * template is merged into it when it is made: what the person set wins over the
 * template's one values, a typed description comes first with the template's
 * after it, tags and assignees are added to its own, and the rest — checklists,
 * subtasks and custom-field values, which have no place in this form — comes
 * from the template.
 *
 * SAID HERE, NOT COPIED INTO THE FORM. A template's tags and description are
 * added to what the form holds, so copied into its boxes they would read as the
 * person's own: a template tag removed there would come back from the template
 * at Create, and an edited copy of its description would be followed by the
 * template's own. Its dates are days from the day the task is made, and its
 * checklists and subtasks have no box to go in. So the form keeps what the
 * person set, and this says what the template adds to it and what gives way.
 */
function TemplateMergeNote({
  name,
  wins,
  description,
  adds,
}: {
  name: string
  /** The one-value fields set here, by their labels, that the template's give way to. */
  wins: string[]
  /** A description was typed. */
  description: boolean
  /** Tags or assignees were set. */
  adds: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      data-testid="quick-create-tpl-merge"
      className="space-y-0.5 rounded-md border border-dashed border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground"
    >
      <p data-testid="quick-create-tpl-merge-brings">{t('quickCreate.templateMergeBrings', { name })}</p>
      <p data-testid="quick-create-tpl-merge-wins">
        {wins.length
          ? t('quickCreate.templateMergeWins', { fields: wins.join(' · ') })
          : t('quickCreate.templateMergeNothingSet')}
      </p>
      {description && <p data-testid="quick-create-tpl-merge-description">{t('quickCreate.templateMergeDescription')}</p>}
      {adds && <p data-testid="quick-create-tpl-merge-adds">{t('quickCreate.templateMergeAdds')}</p>}
    </div>
  )
}

/**
 * §V2-S01 frame `00:05` — the footer's **Create Task ▾**, a primary `Create
 * Task` with a chevron segment beside it.
 *
 * No frame opens the chevron, so what is behind it is ClickUp's own menu (help
 * centre "Create a task" and "Create tasks and subtasks on mobile", from search
 * snippets): **Create and close**, **Create and open**, **Create and start
 * another** ("resets the task creation modal") and **Create and duplicate**
 * ("keeps its content open in the task creation modal").
 *
 * `main` is the primary button, and it does what it did before there was a
 * menu. The four are the menu. Every one of them makes the task the same way,
 * once; only what happens afterwards differs.
 */
type CreateThen = 'main' | 'close' | 'open' | 'another' | 'duplicate'
const CREATE_THEN: Array<{ value: Exclude<CreateThen, 'main'>; labelKey: TranslationKey }> = [
  { value: 'close', labelKey: 'quickCreate.then.close' },
  { value: 'open', labelKey: 'quickCreate.then.open' },
  { value: 'another', labelKey: 'quickCreate.then.another' },
  { value: 'duplicate', labelKey: 'quickCreate.then.duplicate' },
]
type CreatedTask = { id: string; title?: string }

function TaskForm({
  workspaceId,
  onClose,
  initialSpaceId,
}: { workspaceId: string; onClose: () => void; initialSpaceId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  // Where the next task starts, after "Create and start another" or "…duplicate".
  const titleRef = useRef<HTMLInputElement>(null)
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
   * That reasoning ignored what the frames say: the frame's picker IS
   * searchable, and it lists thirty-two types against the nineteen there were.
   * Twenty-two now, and the remaining ten are recorded as decisions rather
   * than as work — so this list has stopped growing, and the search stays
   * because twenty-two is already past what type-to-jump serves.
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
  /*
   * `ledger-rows/row-1060` — Save as template and Update existing template ask
   * for the template's name here, in the modal, rather than in a browser
   * prompt: `templatePanel` is which of the two is open, and on what.
   */
  const [templatePanel, setTemplatePanel] = useState<TemplatePanel | null>(null)
  const [templateName, setTemplateName] = useState('')
  const templateNameRef = useRef<HTMLInputElement>(null)
  /* Set when a menu item opens the panel, so the closing menu hands the cursor
   * to the name box rather than back to the Templates button. */
  const focusTemplateName = useRef(false)
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
  /*
   * `found-30-sep/template-submit-ignores-the-form` — whether the priority was
   * CHOSEN. Every other field starts empty, so its value says whether it was
   * set; this one starts on Normal, which is also a priority one may choose, so
   * its value cannot. A priority nobody chose must not replace a template's.
   */
  const [priorityTouched, setPriorityTouched] = useState(false)
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

  // The spaces a task may be made in (`useCreatable`, the menus' own answer):
  // a view-only space refused its members the task, and was offered here.
  const creatable = useCreatable(workspaceId)
  const spaces = (useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []).filter((s) => creatable(createTypeOf('task'), s.id))
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
  // Saving and updating a template are `template.manage`, as the API has it.
  const mayManageTemplates = usePermissions(workspaceId).can('template.manage') === true
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

  /*
   * WHAT THE PERSON SET IN THIS FORM, AND ONLY THAT
   * (`found-30-sep/template-submit-ignores-the-form`): a field left as it
   * started is not here. The plain create sends it with the list, the title and
   * the priority; the template's route takes it as what wins over the template
   * (or adds to its description, tags and assignees), and a field that is not
   * here is the template's. `labelIds` are the typed tags, made by then.
   */
  const setInForm = (labelIds: string[]) => {
    const estimate = parseEstimate(estimateHours)
    return {
      ...(priorityTouched ? { priority } : {}),
      ...(taskTypeId ? { taskTypeId } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(assigneeIds.length ? { assigneeIds } : {}),
      // datetime-local has no zone; the browser's own offset is the one she
      // picked it in, so let Date apply it rather than pinning a Z and shifting
      // everybody's 7pm.
      ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      /*
       * §V2-S02 — through the SAME parser the task-detail field uses. This used
       * to be its own `Number(hours) * 3600`, so the two boxes would have
       * disagreed the moment one of them learned what `90m` means. The column
       * is seconds; what somebody may type is `12`, `90m` or `1h 30m`.
       */
      ...(estimate ? { timeEstimate: estimate.seconds } : {}),
      ...(labelIds.length ? { labelIds } : {}),
    }
  }

  /*
   * A task made from a template, in the chosen list, the typed title winning
   * when there is one, and with what else was set in the form (`fields`,
   * `setInForm`); Create instantly sends none of that. The route answers
   * `{ taskId, task }`: the submit read `.id` off that answer, so a task made
   * from a template came back as `undefined` — measured on the old select, its
   * watcher was posted to `/tasks/undefined/watchers` (and its files would have
   * been), and the page went to the list with no task open, the router dropping
   * `task: undefined`.
   */
  const instantiate = async (
    id: string,
    titleOverride: string,
    fields: ReturnType<typeof setInForm> | Record<string, never> = {},
  ): Promise<CreatedTask> => {
    const made = await api<InstantiatedTask>(`/workspaces/${workspaceId}/task-templates/${id}/instantiate`, {
      method: 'POST',
      body: { listId, ...(titleOverride.trim() ? { titleOverride: titleOverride.trim() } : {}), ...fields },
    })
    return { id: made.taskId, title: made.task?.title }
  }

  const create = useMutation({
    // `then` is the Create Task ▾ choice. It changes nothing about the task
    // made here, only what `onSuccess` does once it exists.
    mutationFn: async (_then: CreateThen): Promise<CreatedTask> => {
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
       * nowhere to put. So the server builds the task from it, with what was
       * set here (`found-30-sep/template-submit-ignores-the-form`): the typed
       * title, and every other field the person set, win over the template's,
       * a typed description comes before its own, and tags and assignees are
       * added to its. This sent the title alone, and dropped the rest without
       * a word. What will happen is said beside the template before Create
       * (`TemplateMergeNote`).
       */
      const fields = setInForm(labelIds)
      const task = templateId
        ? await instantiate(templateId, title, fields)
        : await api<{ id: string }>(`/tasks`, {
            method: 'POST',
            // Omit status → backend seeds the list's first/default status.
            // Omit taskTypeId → same, for the list's default type.
            body: { listId, title, priority, ...fields },
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
    onSuccess: (task, then) => {
      qc.invalidateQueries({ queryKey: ['tasks', listId] })
      if (then !== 'main') return createdThen(task, then)
      /*
       * The primary goes to the task it made, wherever its list is. It went
       * only when a project had been picked, so a list picked under a space
       * alone closed the modal and said nothing at all
       * (`found-29-sep/primary-create-silent-under-a-space`). Where no page can
       * be worked out, it says the task was made, as Create and close does.
       */
      const open = opener(task.id)
      if (!open) return createdThen(task, 'close')
      onClose()
      open()
    },
    /*
     * THIS MUTATION HAD NO `onError`, the defect the List and Folder tabs below
     * had and lost: a refused or failed create said nothing, for the primary
     * and all four endings, and the button came back as if nothing had been
     * pressed (`found-29-sep/task-create-fails-silently`). The form keeps what
     * was typed.
     */
    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.taskFailed')),
  })

  /*
   * `ledger-rows/row-1060` — **Create instantly from template**: the task is
   * made from the template the moment it is chosen, in the list this form has
   * chosen, with the typed title if there is one. Nothing else in the form is
   * read (no `setInForm`) and nothing is submitted. It ends as a normal create
   * does: the modal closes, and the toast names the task and its list with a
   * way to open it.
   */
  const instant = useMutation({
    mutationFn: (template: TaskTemplate) => instantiate(template.id, title),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks', listId] })
      createdThen(task, 'close')
    },
    // A refusal (the list not open to them, the template gone) in the
    // server's words, and the form kept, as the submit's own create does.
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : t('quickCreate.taskFailed')),
  })

  /*
   * THE FORM, AS A TEMPLATE'S PAYLOAD (`TaskTemplatePayload`,
   * `packages/db/src/schema/task-templates.ts`): what this form can say, and
   * only that. The estimate goes through the parser the create uses, in
   * seconds; the dates become days from today, which is how a template keeps a
   * date; the tags go by name, which is how a template keeps a tag.
   *
   * Checklists, subtasks and custom-field values are left OUT, not sent empty.
   * A new template starts without them; an updated one keeps its own, because
   * the service merges the payload it is sent over the one it holds, key by
   * key (`TaskTemplatesService.update`). Assignees, the task type, watchers and
   * files are not part of a template at all.
   */
  const formAsTemplate = () => {
    const estimate = parseEstimate(estimateHours)
    return {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      timeEstimate: estimate ? estimate.seconds : null,
      startDateOffsetDays: daysFromToday(startDate),
      dueDateOffsetDays: daysFromToday(dueDate),
      labels: tagNames,
    }
  }

  const openTemplatePanel = (panel: TemplatePanel, name: string) => {
    focusTemplateName.current = true
    setTemplatePanel(panel)
    setTemplateName(name)
  }
  const closeTemplatePanel = () => {
    setTemplatePanel(null)
    setTemplateName('')
  }

  /*
   * **Save as template** makes a new template of this form; **Update existing
   * template** writes it over the one chosen. Neither makes a task, and the
   * form keeps everything in it, so the task can still be made afterwards.
   */
  const saveTemplate = useMutation({
    mutationFn: (panel: TemplatePanel) => {
      const body = { name: templateName.trim(), payload: formAsTemplate() }
      return panel.kind === 'save'
        ? api<TaskTemplate>(`/workspaces/${workspaceId}/task-templates`, { method: 'POST', body })
        : api<TaskTemplate>(`/workspaces/${workspaceId}/task-templates/${panel.template.id}`, { method: 'PATCH', body })
    },
    onSuccess: (saved, panel) => {
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
      const name = saved?.name ?? templateName.trim()
      toast.success(t(panel.kind === 'save' ? 'quickCreate.templateSaved' : 'quickCreate.templateUpdated', { name }))
      closeTemplatePanel()
    },
    onError: (e, panel) =>
      toast.error(
        e instanceof Error
          ? e.message
          : t(panel.kind === 'save' ? 'quickCreate.templateSaveFailed' : 'quickCreate.templateUpdateFailed'),
      ),
  })

  /*
   * Opening a task is going to its list's page with `?task=`, where the sheet
   * lives. Worked out when the task is made, because the toast's View can be
   * pressed after the form has moved on to another list. A list picked under
   * a space alone sits in the space's hidden container, and its row carries
   * that container, so neither Create and open nor the primary button needs a
   * project to have been picked.
   */
  const opener = (taskId: string) => {
    const container = projectId || lists.find((l) => l.id === listId)?.projectId
    if (!spaceId || !container || !listId) return null
    const params = { workspaceId, spaceId, projectId: container, listId }
    return () =>
      navigate({ to: '/app/$workspaceId/$spaceId/$projectId/$listId', params, search: { task: taskId } })
  }

  /*
   * Create and start another — a blank task in the same place. What described
   * the task just made is cleared; the space, project and list are kept, which
   * is the whole difference from closing the modal and opening it again.
   */
  const startAnother = () => {
    setTitle('')
    setDescription('')
    setTaskTypeId('')
    setAssigneeIds([])
    setStartDate('')
    setDueDate('')
    setPriority('normal')
    setPriorityTouched(false)
    setEstimateHours('')
    setTagNames([])
    setTagDraft('')
    setTemplateId('')
    closeTemplatePanel()
    setWatcherIds([])
    setAttachments([])
  }

  /** The four menu endings, each in the state its name says. */
  const createdThen = (task: CreatedTask, then: Exclude<CreateThen, 'main'>) => {
    const open = opener(task.id)
    if (then === 'open' && open) {
      onClose()
      open()
      return
    }
    /*
     * The rest leave the page where it is, so something has to say that the
     * task exists and where: frame `01:20`'s own toast, "Task created — dbgdh ›
     * Personal List", with its View.
     */
    const listName = lists.find((l) => l.id === listId)?.name ?? ''
    toast.success(
      t('quickCreate.taskCreatedIn', { title: task.title ?? title.trim(), list: listName }),
      open ? { action: { label: t('quickCreate.viewTask'), onClick: () => { onClose(); open() } } } : undefined,
    )
    if (then === 'close' || then === 'open') {
      onClose()
      return
    }
    // Duplicate keeps every field as it is: the next press makes the copy.
    if (then === 'another') startAnother()
    titleRef.current?.focus()
  }

  // Both halves of Create Task ▾ ask this: a title, a list, nothing in flight
  // (a Create instantly from template is a create too).
  const canCreate = Boolean(title.trim() && listId) && !create.isPending && !instant.isPending

  /*
   * The template chosen under Use Template, and the one-value fields set here
   * that its own give way to, by their labels (`TemplateMergeNote`) — the same
   * state `setInForm` sends.
   */
  const chosenTemplate = templates.find((tpl) => tpl.id === templateId) ?? null
  const setOverTemplate = [
    priorityTouched && t('quickCreate.priority'),
    taskTypeId && t('quickCreate.selectTaskType'),
    startDate && t('quickCreate.startDate'),
    dueDate && t('quickCreate.dueDate'),
    parseEstimate(estimateHours) && t('quickCreate.timeEstimate'),
  ].filter((label): label is string => typeof label === 'string' && label.length > 0)

  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() && listId) create.mutate('main')
      }}
    >
      <Input
        autoFocus
        ref={titleRef}
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
                /*
                 * THE CHOSEN TYPE, SAID OUT LOUD, because the `<select>` cannot
                 * be trusted to say it. When the search narrows the options and
                 * the chosen type is not among them, a browser reports the
                 * FIRST OPTION as the value — so "did typing select the right
                 * type" read as true even with the selection left behind on
                 * `text`. A break patch that stopped the search reaching the
                 * new types changed nothing the check could see. This attribute
                 * is the state itself.
                 */
                data-selected-type={newFieldType}
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
            onChange={(e) => {
              setPriority(e.target.value as typeof priority)
              setPriorityTouched(true)
            }}
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
        <TemplatesMenu
          templates={templates}
          chosenId={templateId}
          mayManage={mayManageTemplates}
          instantBlocked={!listId ? 'list' : create.isPending || instant.isPending ? 'busy' : null}
          onUse={setTemplateId}
          onClear={() => setTemplateId('')}
          onInstant={(tpl) => instant.mutate(tpl)}
          onSave={() => openTemplatePanel({ kind: 'save' }, title.trim())}
          onUpdate={(tpl) => openTemplatePanel({ kind: 'update', template: tpl }, tpl.name)}
          onCloseAutoFocus={(e) => {
            if (!focusTemplateName.current) return
            focusTemplateName.current = false
            e.preventDefault()
            templateNameRef.current?.focus()
          }}
        />

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

      {chosenTemplate && (
        <TemplateMergeNote
          name={chosenTemplate.name}
          wins={setOverTemplate}
          description={description.trim().length > 0}
          adds={tagNames.length > 0 || assigneeIds.length > 0}
        />
      )}

      {/*
        `ledger-rows/row-1060` — the name, asked for here. ClickUp's own "Save
        as new Template" asks for a name, and its Update existing Template lets
        the template be renamed on the way; what is written, and what is kept,
        is said beside the button that writes it, because an update "cannot be
        reverted to its previous state" (help centre, "Use task templates").
      */}
      {templatePanel && (
        <div
          data-testid="quick-create-tpl-panel"
          data-action={templatePanel.kind}
          className="space-y-1.5 rounded-md border border-dashed border-border/70 px-2 py-1.5"
        >
          <div className="text-[11px] font-medium" data-testid="quick-create-tpl-heading">
            {templatePanel.kind === 'save'
              ? t('quickCreate.templateSave')
              : t('quickCreate.templateUpdateHeading', { name: templatePanel.template.name })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={templateNameRef}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // Enter writes the template. It must not also submit the form,
                // which would make the task.
                e.preventDefault()
                if (templateName.trim() && !saveTemplate.isPending) saveTemplate.mutate(templatePanel)
              }}
              data-testid="quick-create-tpl-name"
              aria-label={t('quickCreate.templateNamePlaceholder')}
              placeholder={t('quickCreate.templateNamePlaceholder')}
              className="h-7 w-52 rounded-md border border-border bg-card px-1.5 text-[11px]"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="quick-create-tpl-confirm"
              disabled={!templateName.trim() || saveTemplate.isPending}
              onClick={() => saveTemplate.mutate(templatePanel)}
            >
              {templatePanel.kind === 'save' ? t('quickCreate.templateSaveConfirm') : t('quickCreate.templateUpdateConfirm')}
            </Button>
            <Button type="button" size="sm" variant="ghost" data-testid="quick-create-tpl-cancel" onClick={closeTemplatePanel}>
              {t('common.cancel')}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground" data-testid="quick-create-tpl-hint">
            {templatePanel.kind === 'save' ? t('quickCreate.templateSaveHint') : t('quickCreate.templateUpdateHint')}
          </p>
        </div>
      )}

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
        <div className="inline-flex">
          <Button
            type="submit"
            size="sm"
            data-testid="quick-create-submit"
            disabled={!canCreate}
            className="rounded-r-none"
          >
            {create.isPending ? t('quickCreate.creating') : t('quickCreate.createTask')}
          </Button>
          {/*
            §V2-S01 frame `00:05` — the chevron half of Create Task ▾. It is live
            exactly when the button is, because everything in its menu creates
            too, and while one create is in flight neither half starts another.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                data-testid="quick-create-chevron"
                aria-label={t('quickCreate.createOptions')}
                title={t('quickCreate.createOptions')}
                disabled={!canCreate}
                className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            {/*
              Portalled to the body, so it has to sit above the modal's
              z-[10000]. And the Escape that closes it goes no further: the
              modal closes on any Escape that reaches the document, and one
              spent closing this menu must not throw away the half-filled task.
              Stopped here rather than read as `defaultPrevented` there, since
              any Radix layer on the page marks its Escape so — a comment's "+"
              menu still unmounting took the one meant for the modal. (That
              menu now opens the modal only once it has gone,
              `found-29-sep/comment-plus-menu-keeps-focus-after-create`.)
            */}
            <DropdownMenuContent
              align="end"
              className="z-[10001] w-56"
              data-testid="quick-create-options"
              onEscapeKeyDown={(e) => e.stopPropagation()}
            >
              {CREATE_THEN.map((item) => (
                <DropdownMenuItem
                  key={item.value}
                  data-testid={`quick-create-then-${item.value}`}
                  disabled={!canCreate}
                  onSelect={() => create.mutate(item.value)}
                >
                  {t(item.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

  // The spaces a list may be made in (`useCreatable`, the menus' own answer):
  // for a guest, only those shared with them to edit. The picker listed every
  // space they could see, and one they only pass through refused the list.
  const creatable = useCreatable(workspaceId)
  const spaces = (useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []).filter((s) => CREATE_TYPES.some((ty) => ty.value === 'list' && creatable(ty, s.id)))
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
      /*
       * AND THE SPACE-SCOPED KEY, which is not the same query.
       *
       * `['lists', projectId]`, `['lists', 'space', spaceId]` and
       * `['lists', 'workspace', workspaceId]` share only the `'lists'`
       * element, and React Query matches invalidation by key PREFIX — so
       * invalidating the first does nothing to the others. With a
       * 30-second `staleTime`, a list created here was then missing from the
       * Form tab's destination picker in the same modal, for half a minute,
       * with no way to tell that the list existed. Found by a check that
       * timed out selecting an option that was never going to appear. The
       * bare prefix is one line and covers every list query there is.
       */
      qc.invalidateQueries({ queryKey: ['lists'] })
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
  /*
   * §V2-S09 frame `08:32` — Settings → Statuses, whose value reads "Use Space
   * statuses". `'space'` is the default because that is what the dialog shows
   * before anybody touches it, and it is the whole point of the row: lists
   * made in this folder read the space's statuses rather than each seeding
   * their own.
   */
  const [statusScope, setStatusScope] = useState<'space' | 'list'>('space')
  /*
   * §V2-S09 frame `08:25` — **Description**, the dialog's second field,
   * "Tell us a bit about your Folder (optional)".
   *
   * IT GOES OUT ON THE CREATE CALL, not on a follow-up PATCH the way `private`
   * does above. That shape exists only because the create route refuses
   * `visibility`; `description` is a column the route accepts, so sending it
   * with the name keeps the folder from existing for a moment without the
   * words the person typed.
   */
  const [description, setDescription] = useState('')

  // The spaces a folder may be made in (`useCreatable`, the menus' own answer):
  // a view-only space refused its members the folder, and was offered here.
  const creatable = useCreatable(workspaceId)
  const spaces = (useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []).filter((s) => creatable(createTypeOf('folder'), s.id))

  const create = useMutation({
    // Folders have no page of their own — they render on their space, which is
    // also where a just-created one is easiest to see.
    mutationFn: async () => {
      const folder = await api<{ id: string }>(`/spaces/${spaceId}/folders`, {
        method: 'POST',
        body: { name, description, statusScope },
      })
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
      {/*
        Frame `08:25` — Description, BETWEEN Name and "Select a Location",
        which is where the frame puts it and why this line is here rather than
        below the Select. A textarea and not an Input: the frame's box is two
        rows deep, and "tell us a bit about" is an invitation to write a
        sentence rather than a label.

        It is not required, so it is not in the submit guard below — the frame
        writes "(optional)" into the placeholder itself.
      */}
      <textarea
        data-testid="quick-create-folder-description"
        placeholder={t('quickCreate.folderDescriptionPlaceholder')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground"
      />
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
      {/*
        Frame `08:32` — **Settings** over a **Statuses** row reading "Use Space
        statuses", with a `›` beside it. The chevron is what says the value is
        changeable, so this is a control and not a caption: a row that named an
        inheritance it could not alter would be the frame's own words on a dead
        control.
      */}
      <div className="rounded-md border border-border/70 px-2.5 py-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t('quickCreate.folderSettings')}
        </span>
        <label className="mt-1.5 flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px]">{t('quickCreate.folderStatuses')}</span>
            <span className="text-[11px] text-muted-foreground">
              {statusScope === 'space'
                ? t('quickCreate.folderStatusesSpaceHint')
                : t('quickCreate.folderStatusesOwnHint')}
            </span>
          </span>
          <select
            data-testid="quick-create-folder-status-scope"
            value={statusScope}
            onChange={(e) => setStatusScope(e.target.value === 'list' ? 'list' : 'space')}
            className="h-8 shrink-0 rounded-md border border-border bg-card px-2 text-[12px]"
          >
            <option value="space">{t('quickCreate.folderStatusesSpace')}</option>
            <option value="list">{t('quickCreate.folderStatusesOwn')}</option>
          </select>
        </label>
      </div>
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
  // The spaces a project may be made in (`useCreatable`, the menus' own answer):
  // a view-only space refused its members the project, and was offered here.
  const creatable = useCreatable(workspaceId)
  const spaces = (useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []).filter((s) => creatable(createTypeOf('project'), s.id))

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
      <Input
        autoFocus
        data-testid="quick-create-doc-title"
        placeholder={t('quickCreate.docTitlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
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
  const [when, setWhen] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)))

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
/**
 * §V2-06 frame `08:00` — Form, between Whiteboard and the rule.
 *
 * NAMED FOR THE CONVENTION, not for how it reads: every panel in this file is
 * `<Kind>Form` and the kind is `form`.
 *
 * IT ASKS WHERE SUBMISSIONS GO, and will not create without an answer. The
 * module behind this has been complete for a long time — builder, public
 * submit page, file uploads, routing — and the one thing that decides whether
 * a form DOES anything is `targetListId`: `FormsService.createTaskForSubmission`
 * returns early when a form has neither that nor a field mapped to it, so a
 * form created with no destination takes submissions and produces nothing,
 * silently, on a page the author never revisits. `CreateFormDto` marks it
 * optional because the builder can set it later; the point of creating a form
 * from a SPACE's "+" is that you already know where it belongs, so this asks
 * then rather than leaving a live form that swallows its first replies.
 *
 * Space then list, with no project picker in between: a third dropdown for a
 * choice the person making an intake form is not thinking about.
 *
 * AND THE LISTS COME FROM `GET /lists/workspace/:id`, FILTERED, NOT FROM
 * `/lists/space/:id`. The second one reads as the obvious choice and answers a
 * different question: `getListsBySpace` resolves the space's hidden DEFAULT
 * CONTAINER and returns that project's lists — the "lists directly under a
 * space" the sidebar draws — so a space whose lists all live in real projects
 * comes back empty. This picker said "This Space has no Lists yet" over a
 * project page that was drawing one at the time, and the screenshot the suite
 * takes on failure is what showed it. The workspace query carries `spaceId`
 * on every row and is one request too.
 */
function FormForm({
  workspaceId,
  onClose,
  initialSpaceId,
}: { workspaceId: string; onClose: () => void; initialSpaceId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [spaceId, setSpaceId] = useState(initialSpaceId ?? '')
  const [targetListId, setTargetListId] = useState('')

  // The spaces a form may be made in (`useCreatable`, the menus' own answer):
  // a view-only space refused its members the form, and was offered here.
  const creatable = useCreatable(workspaceId)
  const spaces = (useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []).filter((s) => creatable(createTypeOf('form'), s.id))
  const listsQuery = useQuery({
    queryKey: ['lists', 'workspace', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string; spaceId: string }>>(`/lists/workspace/${workspaceId}`),
  })
  const lists = (listsQuery.data ?? []).filter((l) => l.spaceId === spaceId)
  /*
   * §G15-10 `[21:49]` — THE DEAD END THIS FILE HAS ALREADY FIXED ONCE, and
   * which this tab reintroduced.
   *
   * The List tab used to keep its own field disabled until you had invented a
   * project, "which is the extra level she does not have". A space with no
   * lists does the same thing here: the destination picker has nothing in it,
   * the button is disabled, and NOTHING SAYS WHY. That is the silent-refusal
   * shape — the person presses a button that does not respond and has no way
   * to find out what is missing. It is also how this was found: the suite's
   * own space had no lists and the check sat on a disabled button for thirty
   * seconds before timing out.
   *
   * The button stays disabled, because a form filed nowhere is worse than no
   * form. What changes is that the reason is on screen.
   */
  const noListsHere = !!spaceId && !listsQuery.isPending && lists.length === 0

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/workspaces/${workspaceId}/forms`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), targetListId }),
      }),
    onSuccess: (form) => {
      qc.invalidateQueries({ queryKey: ['forms', workspaceId] })
      qc.invalidateQueries({ queryKey: ['list-forms', workspaceId, targetListId] })
      onClose()
      /*
       * Into the BUILDER, not back to the index. A form with no fields cannot
       * be submitted, so landing anywhere else would leave the one thing that
       * still has to happen off screen.
       */
      navigate({ to: '/app/$workspaceId/forms/$formId', params: { workspaceId, formId: form.id } })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.formFailed')),
  })

  const ready = !!title.trim() && !!targetListId
  return (
    <form
      className="px-5 py-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        create.mutate()
      }}
    >
      <Input
        autoFocus
        data-testid="quick-create-form-title"
        placeholder={t('quickCreate.formTitlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Select
        data-testid="quick-create-form-space"
        labelKey="quickCreate.selectSpace"
        value={spaceId}
        onChange={(v) => { setSpaceId(v); setTargetListId('') }}
        options={spaces.map((sp) => ({ value: sp.id, label: sp.name }))}
      />
      <Select
        data-testid="quick-create-form-list"
        labelKey="quickCreate.formTarget"
        value={targetListId}
        onChange={setTargetListId}
        options={lists.map((l) => ({ value: l.id, label: l.name }))}
        disabled={!spaceId || noListsHere}
      />
      {noListsHere ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-500" data-testid="quick-create-form-no-lists">
          {t('quickCreate.formNoLists')}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t('quickCreate.formTargetHint')}</p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" data-testid="quick-create-form-submit" disabled={!ready || create.isPending}>
          {t('quickCreate.createForm')}
        </Button>
      </div>
    </form>
  )
}

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
