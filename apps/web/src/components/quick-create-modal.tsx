import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, cn, toast } from '@rundesk/ui'
import { CheckSquare, ClipboardList, Folder, FolderOpen, FileText, Layers, Upload, X, Clock, PenTool, LayoutDashboard, Bell, Paperclip } from 'lucide-react'
import { api } from '../lib/api'
import { CreateSpaceWizard } from './create-space-wizard'
import { colorForTagName } from './task-tags'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type Space = { id: string; name: string }
type Project = { id: string; name: string }
type List = { id: string; name: string }
type TaskType = { id: string; name: string; isDefault?: boolean }

type Mode =
  | 'task'
  | 'list'
  | 'folder'
  | 'project'
  | 'space'
  | 'doc'
  | 'reminder'
  | 'whiteboard'
  | 'dashboard'

/*
 * The `value` is the persisted Mode identifier; `labelKey` references an i18n
 * catalog entry resolved at render time. A1.9 adds List and Folder: both were
 * creatable only by first navigating to the page that owns them.
 *
 * §G15 [21:36] — "jab task banate hain to pehle task, uske baad woh DOCUMENT ka
 * poochta hai, phir REMINDER ka, phir WHITEBOARD ka, phir DASHBOARD ka." The
 * last three are the order she named them in, and all three already existed as
 * whole features — reachable only by first navigating to the page that owns
 * them, which is the same complaint List and Folder answered.
 */
const MODE_TABS = [
  { value: 'task', icon: CheckSquare, labelKey: 'quickCreate.tab.task' },
  { value: 'doc', icon: FileText, labelKey: 'quickCreate.tab.doc' },
  { value: 'reminder', icon: Clock, labelKey: 'quickCreate.tab.reminder' },
  { value: 'whiteboard', icon: PenTool, labelKey: 'quickCreate.tab.whiteboard' },
  { value: 'dashboard', icon: LayoutDashboard, labelKey: 'quickCreate.tab.dashboard' },
  { value: 'list', icon: ClipboardList, labelKey: 'quickCreate.tab.list' },
  { value: 'folder', icon: Folder, labelKey: 'quickCreate.tab.folder' },
  { value: 'project', icon: FolderOpen, labelKey: 'quickCreate.tab.project' },
  { value: 'space', icon: Layers, labelKey: 'quickCreate.tab.space' },
] as const

export function QuickCreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const workspaceId = params.workspaceId
  const [mode, setMode] = useState<Mode>('task')

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
        <div className="px-5 pt-3 pb-2 flex flex-wrap gap-1 border-b border-border">
          {MODE_TABS.map((tab) => (
            <ModeTab key={tab.value} mode={mode} value={tab.value} setMode={setMode} icon={tab.icon} labelKey={tab.labelKey} />
          ))}
        </div>
        {mode === 'task' && <TaskForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'list' && <ListForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'folder' && <FolderForm workspaceId={workspaceId} onClose={onClose} />}
        {mode === 'project' && <ProjectForm workspaceId={workspaceId} onClose={onClose} />}
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

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-[1px] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
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

/*
 * §V2-01a — what the field-type picker offers.
 *
 * Everything that can be CREATED, which is everything except `progress_auto`'s
 * siblings that need config this row has no space for — and progress_auto
 * itself is here because its defaults are the frame's defaults, so it needs
 * none. The order follows the frame's picker loosely: the plain ones first,
 * then the ones that hold a list, then the derived one.
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
  { value: 'progress_auto', labelKey: 'taskDetail.fieldType.progressAuto' },
]

/** §G15 frame #12 — what the create footer needs to know about. */
type TaskTemplate = { id: string; name: string }
type WorkspaceMember = { userId: string; displayName?: string | null; email?: string | null }

function TaskForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [spaceId, setSpaceId] = useState('')
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
  const [madeFields, setMadeFields] = useState<string[]>([])
  // §G15 frame #12 — the three footer controls.
  const [templateId, setTemplateId] = useState('')
  const [watcherIds, setWatcherIds] = useState<string[]>([])
  const [attachment, setAttachment] = useState<File | null>(null)
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
      setMadeFields((prev) => [...prev, newFieldName.trim()])
      setMakingField(false)
      setNewFieldName('')
      setNewFieldOptions('')
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
              // The column is seconds; the field asks for hours because that
              // is the unit she says out loud ("12 hours").
              ...(Number(estimateHours) > 0
                ? { timeEstimate: Math.round(Number(estimateHours) * 3600) }
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
      if (attachment) {
        try {
          const contentType = attachment.type || 'application/octet-stream'
          const presign = await api<{ uploadUrl: string; storageKey: string }>(
            `/tasks/${task.id}/attachments/presign`,
            { method: 'POST', body: { fileName: attachment.name, contentType, sizeBytes: attachment.size } },
          )
          const put = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: attachment,
          })
          if (!put.ok) throw new Error(String(put.status))
          await api(`/tasks/${task.id}/attachments`, {
            method: 'POST',
            body: { fileName: attachment.name, storageKey: presign.storageKey, contentType, sizeBytes: attachment.size },
          })
        } catch {
          problems.push(t('quickCreate.attachmentFailed'))
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
      <Input autoFocus placeholder={t('quickCreate.taskTitlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
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
                A native select rather than a search box. The frame's picker is
                searchable because it lists twenty-nine types; this lists the
                ones that exist, and a browser's own type-to-jump already
                handles that many without a second search UI to keep in step.
              */}
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value)}
                data-testid="quick-create-new-field-type"
                className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
              >
                {CREATABLE_FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {t(ft.labelKey)}
                  </option>
                ))}
              </select>
              {/*
                Dropdown and labels are the two that cannot exist without
                choices, and the API refuses them without — so the input appears
                rather than letting the save fail.
              */}
              {(newFieldType === 'dropdown' || newFieldType === 'labels') && (
                <input
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  data-testid="quick-create-new-field-options"
                  placeholder={t('quickCreate.fieldOptionsPlaceholder')}
                  className="h-7 w-44 rounded-md border border-border bg-card px-1.5 text-[11px]"
                />
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
                    newFieldOptions.trim() === '')
                }
                onClick={() => makeField.mutate()}
              >
                {t('quickCreate.createField')}
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
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        data-testid="quick-create-description"
        placeholder={t('quickCreate.descriptionPlaceholder')}
        rows={2}
        className="w-full resize-y rounded-md border border-border bg-card px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
      />

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
            type="number"
            min="0"
            step="0.5"
            value={estimateHours}
            onChange={(e) => setEstimateHours(e.target.value)}
            data-testid="quick-create-estimate"
            placeholder={t('quickCreate.hours')}
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
          title={attachment ? attachment.name : t('quickCreate.attachFile')}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <input
            type="file"
            className="hidden"
            data-testid="quick-create-attach"
            onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
          />
          <span className="max-w-[9rem] truncate">
            {attachment ? attachment.name : t('quickCreate.attachFile')}
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

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!title.trim() || !listId || create.isPending}>
          {create.isPending ? t('quickCreate.creating') : t('quickCreate.createTask')}
        </Button>
      </div>
    </form>
  )
}

function ListForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [listPrivate, setListPrivate] = useState(false)
  const [createdList, setCreatedList] = useState<{ id: string; name: string } | null>(null)
  const [spaceId, setSpaceId] = useState('')
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
      <Input autoFocus placeholder={t('quickCreate.listNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
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
        <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={(v) => { setSpaceId(v); setProjectId('') }} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
        <Select labelKey="quickCreate.selectProject" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} disabled={!spaceId} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !projectId || create.isPending}>{t('quickCreate.createList')}</Button>
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

function FolderForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState('')

  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
  }).data ?? []

  const create = useMutation({
    // Folders have no page of their own — they render on their space, which is
    // also where a just-created one is easiest to see.
    mutationFn: () => api(`/spaces/${spaceId}/folders`, { method: 'POST', body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })
      qc.invalidateQueries({ queryKey: ['folders', spaceId] })
      onClose()
      navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId } })
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
      <Input autoFocus placeholder={t('quickCreate.folderNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !spaceId || create.isPending}>{t('quickCreate.createFolder')}</Button>
      </div>
    </form>
  )
}

function ProjectForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState('')
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
      <Input autoFocus placeholder={t('quickCreate.projectNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select labelKey="quickCreate.selectSpace" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} />
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
      <button
        type="button"
        onClick={() => go('/app/$workspaceId/templates')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Layers className="h-3.5 w-3.5" />
        {t('quickCreate.fromTemplate')}
      </button>
      <button
        type="button"
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
