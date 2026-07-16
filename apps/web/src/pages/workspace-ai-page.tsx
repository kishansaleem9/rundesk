import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import {
  Sparkles,
  Wand2,
  FileText,
  Zap,
  ArrowRight,
  Loader2,
  Copy,
  CheckCircle2,
  Plus,
  MessageSquare,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { AiPanel } from '../components/ai-panel'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type GeneratedTask = {
  title: string
  description: string
  subtasks: string[]
  priority: string
  estimatedHours?: number | null
  customFieldValues?: Array<{ fieldName: string; value: string | number | boolean }>
}

// Editable working copy of a generated task (Plan §7.1) — user tweaks before save.
type EditableTask = {
  title: string
  description: string
  priority: TaskPriority
  subtasks: string[]
  estimatedHours: number | null
}

type GenCustomFieldDef = {
  id: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
  isRequired: boolean
  options: Array<{ label: string; value: string }> | null
}

type GenListOption = { value: string; label: string; projectId: string }

/** Coerce an editable string into the shape the custom-field value API expects. */
function coerceCustomFieldValue(
  type: GenCustomFieldDef['type'],
  raw: string,
): string | number | boolean {
  if (type === 'checkbox') return raw === 'true'
  if (type === 'number' || type === 'money' || type === 'rating') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return raw
}

type ExtractedTask = {
  title: string
  description: string
  assigneeName?: string | null
  dueDate?: string | null
  priority: string
}
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent priority identifier persisted to / compared against the API.
const PRIORITY_OPTIONS = [
  { value: 'urgent', labelKey: 'ai.priorityUrgent' },
  { value: 'high', labelKey: 'ai.priorityHigh' },
  { value: 'normal', labelKey: 'ai.priorityNormal' },
  { value: 'low', labelKey: 'ai.priorityLow' },
] as const

function priorityLabelKey(value: string): TranslationKey {
  switch (value) {
    case 'urgent':
      return 'ai.priorityUrgent'
    case 'high':
      return 'ai.priorityHigh'
    case 'low':
      return 'ai.priorityLow'
    default:
      return 'ai.priorityNormal'
  }
}

// Writing-assistant modes. `id` is the locale-independent value sent to the API;
// `labelKey` is the translated button/label text.
const WRITING_MODES = [
  { id: 'improve', labelKey: 'ai.modeImprove' },
  { id: 'shorten', labelKey: 'ai.modeShorten' },
  { id: 'expand', labelKey: 'ai.modeExpand' },
  { id: 'format', labelKey: 'ai.modeFormat' },
] as const

function writingModeLabelKey(mode: string): TranslationKey {
  return WRITING_MODES.find((m) => m.id === mode)?.labelKey ?? 'ai.modeImprove'
}

export function AiPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/ai' })
  const [activeTab, setActiveTab] = useState<'chat' | 'generate' | 'notes' | 'writing'>('chat')

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow animate-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight">{t('ai.title')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('ai.subtitle')}
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border/40 px-6 gap-1 overflow-x-auto scrollbar-none">
        {(
          [
            { id: 'chat', labelKey: 'ai.tabChat', icon: MessageSquare },
            { id: 'generate', labelKey: 'ai.tabGenerate', icon: Wand2 },
            { id: 'notes', labelKey: 'ai.tabNotes', icon: FileText },
            { id: 'writing', labelKey: 'ai.tabWriting', icon: Zap },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <AiPanel workspaceId={workspaceId} className="h-full" />
        )}
        {activeTab === 'generate' && <TaskGeneratorTab workspaceId={workspaceId} />}
        {activeTab === 'notes' && <MeetingNotesTab workspaceId={workspaceId} />}
        {activeTab === 'writing' && <WritingTab />}
      </div>
    </div>
  )
}

// ─── Task Generator ───────────────────────────────────────────────────────────

function TaskGeneratorTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [targetListId, setTargetListId] = useState('')
  const [result, setResult] = useState<EditableTask | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Destination lists across the workspace (space / project / list), each
  // carrying its projectId so we can resolve the project's custom fields.
  const listOptionsQuery = useQuery({
    queryKey: ['ai-generate-lists', workspaceId],
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`)
      const options: GenListOption[] = []
      for (const space of spaces) {
        const projects = await api<Array<{ id: string; name: string }>>(`/projects/space/${space.id}`)
        for (const project of projects) {
          const lists = await api<Array<{ id: string; name: string }>>(`/lists/project/${project.id}`)
          for (const list of lists) {
            options.push({
              value: list.id,
              label: `${space.name} / ${project.name} / ${list.name}`,
              projectId: project.id,
            })
          }
        }
      }
      return options
    },
  })
  const listOptions = listOptionsQuery.data ?? []
  const selectedProjectId = listOptions.find((o) => o.value === targetListId)?.projectId ?? ''

  // Custom fields defined on the chosen destination project (Plan §7.1) —
  // resolved the same way the task-template instantiate path does.
  const fieldsQuery = useQuery({
    queryKey: ['ai-generate-fields', workspaceId, selectedProjectId],
    queryFn: () =>
      api<GenCustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${selectedProjectId}/custom-fields`),
    enabled: Boolean(selectedProjectId),
  })
  const fields = fieldsQuery.data ?? []

  const generate = useMutation({
    mutationFn: () =>
      api<GeneratedTask>('/ai/task/generate', {
        method: 'POST',
        body: {
          prompt,
          workspaceId,
          customFields: fields.map((f) => ({
            name: f.name,
            type: f.type,
            options: f.options?.map((o) => o.label),
          })),
        },
      }),
    onSuccess: (data) => {
      setResult({
        title: data.title ?? '',
        description: data.description ?? '',
        priority: (['urgent', 'high', 'normal', 'low'].includes(data.priority)
          ? data.priority
          : 'normal') as TaskPriority,
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
        estimatedHours: data.estimatedHours ?? null,
      })
      // Pre-fill editable custom-field values from the AI's suggestions, matched
      // to the project's definitions by name.
      const prefill: Record<string, string> = {}
      for (const cf of data.customFieldValues ?? []) {
        const def = fields.find((f) => f.name === cf.fieldName)
        if (!def) continue
        let v = ''
        if (def.type === 'checkbox') {
          v = cf.value === true || String(cf.value).toLowerCase() === 'true' ? 'true' : 'false'
        } else if (def.type === 'dropdown') {
          const opt = (def.options ?? []).find(
            (o) => o.value === String(cf.value) || o.label.toLowerCase() === String(cf.value).toLowerCase(),
          )
          v = opt?.value ?? ''
        } else {
          v = String(cf.value)
        }
        if (v !== '') prefill[def.id] = v
      }
      setFieldValues(prefill)
      setSaved(false)
      setSaveError(null)
    },
  })

  function updateSubtask(index: number, value: string) {
    setResult((prev) => (prev ? { ...prev, subtasks: prev.subtasks.map((s, i) => (i === index ? value : s)) } : prev))
  }
  function removeSubtask(index: number) {
    setResult((prev) => (prev ? { ...prev, subtasks: prev.subtasks.filter((_, i) => i !== index) } : prev))
  }
  function addSubtask() {
    setResult((prev) => (prev ? { ...prev, subtasks: [...prev.subtasks, ''] } : prev))
  }

  async function saveTask() {
    if (!result) return
    if (!targetListId) {
      setSaveError(t('ai.errorSelectList'))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const created = await api<{ id: string }>('/tasks', {
        method: 'POST',
        body: {
          listId: targetListId,
          title: result.title.trim() || t('ai.untitledTask'),
          description: result.description.trim() ? result.description : null,
          priority: result.priority,
        },
      })
      // Create each non-empty subtask as a child task (Plan §7.1).
      for (const st of result.subtasks.map((s) => s.trim()).filter(Boolean)) {
        await api('/tasks', {
          method: 'POST',
          body: { listId: targetListId, parentTaskId: created.id, title: st },
        })
      }
      // Set any custom-field values against the chosen project's definitions.
      for (const def of fields) {
        const raw = fieldValues[def.id]
        if (raw == null || raw === '') continue
        await api(`/workspaces/${workspaceId}/tasks/${created.id}/custom-fields/${def.id}`, {
          method: 'PUT',
          body: { value: coerceCustomFieldValue(def.type, raw) },
        })
      }
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('ai.taskCreationFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full">
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold mb-1">{t('ai.generateTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('ai.generateDesc')}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t('ai.destinationList')}</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={targetListId}
            onChange={(e) => {
              setTargetListId(e.target.value)
              setFieldValues({})
            }}
          >
            <option value="">{t('ai.selectDestinationList')}</option>
            {listOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">{t('ai.generateListHint')}</p>
        </div>

        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('ai.generatePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && prompt.trim()) generate.mutate()
            }}
            className="flex-1"
          />
          <Button onClick={() => generate.mutate()} disabled={!prompt.trim() || generate.isPending}>
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </Button>
        </div>

        {result && (
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('ai.editBeforeSave')}</p>
              {result.estimatedHours ? (
                <span className="text-xs text-muted-foreground">~{result.estimatedHours}h</span>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('ai.fieldTitle')}</label>
              <Input value={result.title} onChange={(e) => setResult({ ...result, title: e.target.value })} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('ai.fieldPriority')}</label>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={result.priority}
                onChange={(e) => setResult({ ...result, priority: e.target.value as TaskPriority })}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('ai.fieldDescription')}</label>
              <textarea
                value={result.description}
                onChange={(e) => setResult({ ...result, description: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{t('ai.subtasks')}</label>
                <Button variant="ghost" size="sm" onClick={addSubtask}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t('ai.addSubtask')}
                </Button>
              </div>
              {result.subtasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('ai.noSubtasks')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {result.subtasks.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Input value={s} onChange={(e) => updateSubtask(i, e.target.value)} className="flex-1 text-sm" />
                      <button
                        type="button"
                        onClick={() => removeSubtask(i)}
                        className="text-muted-foreground hover:text-destructive"
                        title={t('ai.removeSubtask')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {fields.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t('ai.customFields')}</label>
                {fields.map((def) => (
                  <div key={def.id} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">
                      {def.name}
                      {def.isRequired && <span className="text-destructive"> *</span>}
                    </div>
                    <GenFieldInput
                      def={def}
                      value={fieldValues[def.id] ?? ''}
                      onChange={(v) => setFieldValues((prev) => ({ ...prev, [def.id]: v }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={saveTask} disabled={saving || saved || !targetListId}>
                {saved ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> {t('ai.saved')}
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> {t('common.saving')}
                  </>
                ) : (
                  t('ai.saveAsTask')
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                {t('ai.regenerate')}
              </Button>
              {!targetListId && (
                <span className="text-xs text-amber-700 dark:text-amber-300">{t('ai.selectListToEnable')}</span>
              )}
            </div>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </Card>
        )}
      </div>
    </div>
  )
}

function GenFieldInput({
  def,
  value,
  onChange,
}: {
  def: GenCustomFieldDef
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  if (def.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} />
        {t('ai.enabled')}
      </label>
    )
  }
  if (def.type === 'dropdown') {
    return (
      <select
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('ai.chooseValue')}</option>
        {(def.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  const inputType =
    def.type === 'number' || def.type === 'money' || def.type === 'rating'
      ? 'number'
      : def.type === 'date'
        ? 'date'
        : def.type === 'email'
          ? 'email'
          : def.type === 'url'
            ? 'url'
            : 'text'
  return <Input type={inputType} value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────

function MeetingNotesTab({ workspaceId }: { workspaceId: string }) {
  const { t, tCount } = useTranslation()
  const [notes, setNotes] = useState('')
  const [tasks, setTasks] = useState<ExtractedTask[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [targetListId, setTargetListId] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [failedItems, setFailedItems] = useState<Array<{ title: string; reason: string }>>([])
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<number, string>>({})
  const [bulkAssigneeOverride, setBulkAssigneeOverride] = useState('')
  const [dueDateOverrides, setDueDateOverrides] = useState<Record<number, string>>({})
  const [bulkDueDateOverride, setBulkDueDateOverride] = useState('')
  const [priorityOverrides, setPriorityOverrides] = useState<Record<number, TaskPriority>>({})
  const [bulkPriorityOverride, setBulkPriorityOverride] = useState<TaskPriority>('normal')
  const storageKeyBase = `ai-meeting-notes-defaults:${workspaceId}`
  const [defaultsHydrated, setDefaultsHydrated] = useState(false)
  const membersQuery = useQuery({
    queryKey: ['ai-meeting-notes-members', workspaceId],
    queryFn: () =>
      api<Array<{ userId: string; displayName: string; email: string }>>(
        `/workspaces/${workspaceId}/members`,
      ),
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedListId = window.localStorage.getItem(`${storageKeyBase}:target-list-id`) ?? ''
    const savedBulkAssignee = window.localStorage.getItem(`${storageKeyBase}:bulk-assignee-id`) ?? ''
    const savedBulkDueDate = window.localStorage.getItem(`${storageKeyBase}:bulk-due-date`) ?? ''
    const savedBulkPriority = window.localStorage.getItem(`${storageKeyBase}:bulk-priority`) as TaskPriority | null
    if (savedListId) setTargetListId(savedListId)
    if (savedBulkAssignee) setBulkAssigneeOverride(savedBulkAssignee)
    if (savedBulkDueDate) setBulkDueDateOverride(savedBulkDueDate)
    if (savedBulkPriority === 'urgent' || savedBulkPriority === 'high' || savedBulkPriority === 'normal' || savedBulkPriority === 'low') {
      setBulkPriorityOverride(savedBulkPriority)
    }
    setDefaultsHydrated(true)
  }, [storageKeyBase])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    if (targetListId) window.localStorage.setItem(`${storageKeyBase}:target-list-id`, targetListId)
    else window.localStorage.removeItem(`${storageKeyBase}:target-list-id`)
  }, [storageKeyBase, targetListId, defaultsHydrated])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    if (bulkAssigneeOverride) window.localStorage.setItem(`${storageKeyBase}:bulk-assignee-id`, bulkAssigneeOverride)
    else window.localStorage.removeItem(`${storageKeyBase}:bulk-assignee-id`)
  }, [storageKeyBase, bulkAssigneeOverride, defaultsHydrated])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    if (bulkDueDateOverride) window.localStorage.setItem(`${storageKeyBase}:bulk-due-date`, bulkDueDateOverride)
    else window.localStorage.removeItem(`${storageKeyBase}:bulk-due-date`)
  }, [storageKeyBase, bulkDueDateOverride, defaultsHydrated])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    window.localStorage.setItem(`${storageKeyBase}:bulk-priority`, bulkPriorityOverride)
  }, [storageKeyBase, bulkPriorityOverride, defaultsHydrated])
  const normalizeAssignee = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  const resolveAssignee = (name?: string | null): { userId: string; displayName: string } | undefined => {
    if (!name?.trim()) return undefined
    const needle = normalizeAssignee(name)
    const members = membersQuery.data ?? []
    const exact = members.find(
      (member) =>
        normalizeAssignee(member.displayName) === needle ||
        normalizeAssignee(member.email.split('@')[0] ?? '') === needle,
    )
    if (exact) return { userId: exact.userId, displayName: exact.displayName || exact.email }
    const partial = members.filter(
      (member) =>
        normalizeAssignee(member.displayName).includes(needle) ||
        needle.includes(normalizeAssignee(member.displayName)),
    )
    if (partial.length === 1) {
      return { userId: partial[0].userId, displayName: partial[0].displayName || partial[0].email }
    }
    return undefined
  }

  const listOptionsQuery = useQuery({
    queryKey: ['ai-meeting-notes-lists', workspaceId],
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`)
      const projectsPerSpace = await Promise.all(
        spaces.map(async (space) => ({
          space,
          projects: await api<Array<{ id: string; name: string }>>(`/projects/space/${space.id}`),
        })),
      )
      const options: Array<{ value: string; label: string }> = []
      for (const group of projectsPerSpace) {
        const listsPerProject = await Promise.all(
          group.projects.map(async (project) => ({
            project,
            lists: await api<Array<{ id: string; name: string }>>(`/lists/project/${project.id}`),
          })),
        )
        for (const projectGroup of listsPerProject) {
          for (const list of projectGroup.lists) {
            options.push({
              value: list.id,
              label: `${group.space.name} / ${projectGroup.project.name} / ${list.name}`,
            })
          }
        }
      }
      return options
    },
  })

  const extract = useMutation({
    mutationFn: () => api<ExtractedTask[]>('/ai/meeting-notes', { method: 'POST', body: { notes } }),
    onSuccess: (data) => {
      setTasks(data)
      setSelected(new Set(data.map((_, i) => i)))
      setSavedCount(0)
      setFailedItems([])
      setSaveError(null)
      setAssigneeOverrides({})
      setBulkAssigneeOverride('')
      setDueDateOverrides({})
      setBulkDueDateOverride('')
      setPriorityOverrides({})
    },
  })

  async function saveSelectedTasks() {
    if (!tasks || selected.size === 0) return
    if (!targetListId) {
      setSaveError(t('ai.errorSelectList'))
      return
    }
    setSaving(true)
    setSaveError(null)
    setFailedItems([])
    try {
      const selectedIndexes = [...selected]
      let successCount = 0
      const failures: Array<{ title: string; reason: string }> = []
      const failedIndexes = new Set<number>()
      for (const idx of selectedIndexes) {
        const task = tasks[idx]
        if (!task) continue
        try {
          const assigneeId = assigneeOverrides[idx] || resolveAssignee(task.assigneeName)?.userId
          const dueDate = dueDateOverrides[idx] || task.dueDate || null
          const priority = priorityOverrides[idx] ?? (task.priority as TaskPriority)
          await api('/tasks', {
            method: 'POST',
            body: {
              listId: targetListId,
              title: task.title,
              description: task.description || null,
              priority,
              dueDate,
              assigneeIds: assigneeId ? [assigneeId] : undefined,
            },
          })
          successCount += 1
        } catch (error) {
          failedIndexes.add(idx)
          failures.push({
            title: task.title,
            reason: error instanceof Error ? error.message : t('ai.taskCreationFailed'),
          })
        }
      }
      if (failures.length > 0) {
        setFailedItems(failures)
        setSaveError(tCount('ai.tasksFailed', failures.length))
      }
      setSavedCount(successCount)
      setSelected(failedIndexes)
    } finally {
      setSaving(false)
    }
  }

  const selectedIndexes = [...selected]
  const selectedTasks = selectedIndexes.map((idx) => (tasks ? tasks[idx] : undefined)).filter(Boolean)
  const previewSummary = selectedTasks.reduce(
    (acc, task, index) => {
      const originalIndex = selectedIndexes[index]
      const hasManualAssignee = Boolean(assigneeOverrides[originalIndex])
      const hasAutoAssignee = !hasManualAssignee && Boolean(resolveAssignee(task?.assigneeName)?.userId)
      if (hasManualAssignee) acc.manualAssignee += 1
      else if (hasAutoAssignee) acc.autoAssignee += 1
      else acc.unassigned += 1

      if (dueDateOverrides[originalIndex]) acc.dueOverride += 1
      if (priorityOverrides[originalIndex]) acc.priorityOverride += 1
      return acc
    },
    {
      manualAssignee: 0,
      autoAssignee: 0,
      unassigned: 0,
      dueOverride: 0,
      priorityOverride: 0,
    },
  )

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">{t('ai.notesTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('ai.notesDesc')}
        </p>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('ai.notesPlaceholder')}
        rows={8}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <Button
        onClick={() => extract.mutate()}
        disabled={!notes.trim() || extract.isPending}
      >
        {extract.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('ai.extracting')}</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-1.5" /> {t('ai.extractActionItems')}</>
        )}
      </Button>

      {tasks && tasks.length === 0 && (
        <Card className="p-4 text-center text-muted-foreground text-sm">
          {t('ai.noActionItems')}
        </Card>
      )}

      {tasks && tasks.length > 0 && (
        <div className="space-y-3">
          {selected.size > 0 && (
            <div className="space-y-3">
              <Card className="p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {t('ai.savePreview')}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p>{t('ai.previewSelected')} <span className="font-medium text-foreground">{selected.size}</span></p>
                  <p>{t('ai.previewManualAssignee')} <span className="font-medium text-foreground">{previewSummary.manualAssignee}</span></p>
                  <p>{t('ai.previewAutoAssignee')} <span className="font-medium text-foreground">{previewSummary.autoAssignee}</span></p>
                  <p>{t('ai.previewUnassigned')} <span className="font-medium text-foreground">{previewSummary.unassigned}</span></p>
                  <p>{t('ai.previewDueOverrides')} <span className="font-medium text-foreground">{previewSummary.dueOverride}</span></p>
                  <p>{t('ai.previewPriorityOverrides')} <span className="font-medium text-foreground">{previewSummary.priorityOverride}</span></p>
                </div>
              </Card>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('ai.bulkAssignee')}</p>
                <div className="flex items-center gap-2">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={bulkAssigneeOverride}
                    onChange={(e) => setBulkAssigneeOverride(e.target.value)}
                  >
                    <option value="">{t('ai.chooseMember')}</option>
                    {(membersQuery.data ?? []).map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName || member.email}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!bulkAssigneeOverride}
                    onClick={() => {
                      if (!bulkAssigneeOverride) return
                      setAssigneeOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          next[idx] = bulkAssigneeOverride
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.apply')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAssigneeOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          delete next[idx]
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.clear')}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('ai.bulkDueDate')}</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={bulkDueDateOverride}
                    onChange={(e) => setBulkDueDateOverride(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!bulkDueDateOverride}
                    onClick={() => {
                      if (!bulkDueDateOverride) return
                      setDueDateOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          next[idx] = bulkDueDateOverride
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.apply')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDueDateOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          delete next[idx]
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.clear')}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('ai.bulkPriority')}</p>
                <div className="flex items-center gap-2">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={bulkPriorityOverride}
                    onChange={(e) => setBulkPriorityOverride(e.target.value as TaskPriority)}
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPriorityOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) next[idx] = bulkPriorityOverride
                        return next
                      })
                    }
                  >
                    {t('ai.apply')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPriorityOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) delete next[idx]
                        return next
                      })
                    }
                  >
                    {t('ai.clear')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('ai.destinationList')}</p>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
              >
                <option value="">{t('ai.selectDestinationList')}</option>
                {(listOptionsQuery.data ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {t('ai.destinationRemembered')}
              </p>
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTargetListId('')
                    setBulkAssigneeOverride('')
                    setBulkDueDateOverride('')
                    setBulkPriorityOverride('normal')
                    if (typeof window !== 'undefined') {
                      window.localStorage.removeItem(`${storageKeyBase}:target-list-id`)
                      window.localStorage.removeItem(`${storageKeyBase}:bulk-assignee-id`)
                      window.localStorage.removeItem(`${storageKeyBase}:bulk-due-date`)
                      window.localStorage.removeItem(`${storageKeyBase}:bulk-priority`)
                    }
                  }}
                >
                  {t('ai.resetDefaults')}
                </Button>
              </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{tCount('ai.actionItemsFound', tasks.length)}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                selected.size === tasks.length
                  ? setSelected(new Set())
                  : setSelected(new Set(tasks.map((_, i) => i)))
              }
            >
              {selected.size === tasks.length ? t('ai.deselectAll') : t('ai.selectAll')}
            </Button>
          </div>
          {tasks.map((task, i) => (
            <Card
              key={i}
              className={cn('p-3 cursor-pointer', selected.has(i) && 'border-brand-500 bg-brand-200/10')}
              onClick={() => {
                const next = new Set(selected)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                setSelected(next)
              }}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  readOnly
                  className="mt-0.5 rounded"
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">{task.title}</p>
                  {task.assigneeName && (
                    <p className="text-xs text-muted-foreground">
                      {t('ai.assignedTo')} {task.assigneeName}
                      {resolveAssignee(task.assigneeName) ? (
                        <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                          → {resolveAssignee(task.assigneeName)?.displayName}
                        </span>
                      ) : (
                        <span className="ml-1 text-amber-700 dark:text-amber-300">
                          {t('ai.unmatched')}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="mt-1">
                    <label className="text-[11px] text-muted-foreground block mb-1">{t('ai.assigneeOverride')}</label>
                    <select
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      value={assigneeOverrides[i] ?? ''}
                      onChange={(e) =>
                        setAssigneeOverrides((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    >
                      <option value="">{t('ai.autoUseExtracted')}</option>
                      {(membersQuery.data ?? []).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName || member.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-1">
                    <label className="text-[11px] text-muted-foreground block mb-1">{t('ai.dueDateOverride')}</label>
                    <Input
                      type="date"
                      value={dueDateOverrides[i] ?? ''}
                      onChange={(e) =>
                        setDueDateOverrides((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-[11px] text-muted-foreground block mb-1">{t('ai.priorityOverride')}</label>
                    <select
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      value={priorityOverrides[i] ?? ''}
                      onChange={(e) =>
                        setPriorityOverrides((prev) => ({
                          ...prev,
                          [i]: e.target.value as TaskPriority,
                        }))
                      }
                    >
                      <option value="">{t('ai.autoPriority', { priority: t(priorityLabelKey(task.priority)) })}</option>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  {task.dueDate && (
                    <p className="text-xs text-muted-foreground">{t('ai.due', { date: task.dueDate })}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full shrink-0',
                    task.priority === 'urgent' && 'bg-red-100 text-red-700',
                    task.priority === 'high' && 'bg-orange-100 text-orange-700',
                    task.priority === 'normal' && 'bg-blue-100 text-blue-700',
                    task.priority === 'low' && 'bg-gray-100 text-gray-700',
                  )}
                >
                  {t(priorityLabelKey(task.priority))}
                </span>
              </div>
            </Card>
          ))}
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button onClick={saveSelectedTasks} disabled={saving || !targetListId}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('common.saving')}</>
                ) : (
                  tCount('ai.saveTasks', selected.size)
                )}
              </Button>
              {!targetListId && (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  {t('ai.selectListToEnable')}
                </span>
              )}
              {savedCount > 0 && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  {tCount('ai.savedTasks', savedCount)}
                </span>
              )}
            </div>
          )}
          {saveError && (
            <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
              {saveError}
            </Card>
          )}
          {failedItems.length > 0 && (
            <Card className="p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('ai.failedItems')}</p>
              {failedItems.map((item, idx) => (
                <p key={`${item.title}-${idx}`} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.title}</span>: {item.reason}
                </p>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Writing Assistant ────────────────────────────────────────────────────────

function WritingTab() {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'improve' | 'shorten' | 'expand' | 'format'>('improve')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  const improve = useMutation({
    mutationFn: () => api<{ improved: string }>('/ai/writing/improve', { method: 'POST', body: { text, mode } }),
    onSuccess: (data) => setResult(data.improved),
  })

  function copy() {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">{t('ai.writingTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('ai.writingDesc')}
        </p>
      </div>

      <div className="flex gap-2">
        {WRITING_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium border transition-colors',
              mode === m.id
                ? 'bg-brand-700 text-white border-brand-700'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('ai.writingPlaceholder')}
        rows={6}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <Button
        onClick={() => improve.mutate()}
        disabled={!text.trim() || improve.isPending}
      >
        {improve.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('ai.processing')}</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-1.5" /> {t(writingModeLabelKey(mode))}</>
        )}
      </Button>

      {result && (
        <Card className="p-4 relative">
          <p className="text-sm whitespace-pre-wrap">{result}</p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> {t('ai.copied')}</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1" /> {t('ai.copy')}</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setText(result); setResult('') }}>
              {t('ai.useThisText')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
