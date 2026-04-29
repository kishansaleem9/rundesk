import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Card,
  Button,
  Badge,
  Input,
  Textarea,
  Label,
  Switch,
  cn,
} from '@rundesk/ui'
import {
  Type,
  AlignLeft,
  ChevronDown,
  Calendar,
  Hash,
  Mail,
  Upload,
  Link as LinkIcon,
  CheckSquare,
  GripVertical,
  Trash2,
  Plus,
  Sparkles,
  Eye,
  Share2,
  Settings as SettingsIcon,
  Check,
} from 'lucide-react'

type FieldType = 'short' | 'long' | 'select' | 'multi' | 'date' | 'number' | 'email' | 'file' | 'url' | 'checkbox'

type FormField = {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  required?: boolean
  options?: string[]
  helpText?: string
  mappedTo?: string
}

const FIELD_TYPES: Array<{ type: FieldType; label: string; icon: React.ElementType }> = [
  { type: 'short', label: 'Short text', icon: Type },
  { type: 'long', label: 'Long text', icon: AlignLeft },
  { type: 'select', label: 'Dropdown', icon: ChevronDown },
  { type: 'multi', label: 'Multi-select', icon: CheckSquare },
  { type: 'date', label: 'Date', icon: Calendar },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'url', label: 'URL', icon: LinkIcon },
  { type: 'file', label: 'File upload', icon: Upload },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
]

const TASK_FIELD_OPTIONS = ['Title', 'Description', 'Priority', 'Assignee', 'Due date', 'Custom field']

export function FormBuilder({
  initialFields = DEFAULT_FIELDS,
}: {
  initialFields?: FormField[]
}) {
  const [fields, setFields] = useState<FormField[]>(initialFields)
  const [active, setActive] = useState<string | null>(initialFields[0]?.id ?? null)
  const [previewMode, setPreviewMode] = useState(false)
  const [title, setTitle] = useState('Bug report intake')
  const [description, setDescription] = useState(
    'Spotted a bug? Tell us what happened — we\'ll triage within a day.',
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    setFields((items) => {
      const oldIndex = items.findIndex((i) => i.id === a.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  function addField(type: FieldType) {
    const f: FormField = {
      id: crypto.randomUUID(),
      type,
      label:
        type === 'short' ? 'Short answer'
        : type === 'long' ? 'Long answer'
        : type === 'select' ? 'Dropdown'
        : type === 'multi' ? 'Multi-select'
        : type === 'date' ? 'Date'
        : type === 'number' ? 'Number'
        : type === 'email' ? 'Email'
        : type === 'url' ? 'Link'
        : type === 'file' ? 'Upload'
        : 'Yes / no',
      required: false,
      options: type === 'select' || type === 'multi' ? ['Option 1', 'Option 2'] : undefined,
    }
    setFields((arr) => [...arr, f])
    setActive(f.id)
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((arr) => arr.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    setFields((arr) => arr.filter((f) => f.id !== id))
    if (active === id) setActive(null)
  }

  const activeField = fields.find((f) => f.id === active)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_280px] gap-4 h-[720px]">
      {/* Field palette */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="px-4 py-3 border-b border-border/40">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Drag to add
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {FIELD_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => addField(t.type)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 p-2">
          <Button variant="gradient" size="sm" className="w-full">
            <Sparkles className="h-3.5 w-3.5" /> AI suggest fields
          </Button>
        </div>
      </Card>

      {/* Canvas */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
            <button
              onClick={() => setPreviewMode(false)}
              className={cn(
                'text-xs px-3 py-1 rounded-md font-medium transition-all',
                !previewMode
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'hover:bg-card/60 text-muted-foreground',
              )}
            >
              Build
            </button>
            <button
              onClick={() => setPreviewMode(true)}
              className={cn(
                'text-xs px-3 py-1 rounded-md font-medium transition-all',
                previewMode
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'hover:bg-card/60 text-muted-foreground',
              )}
            >
              <Eye className="h-3 w-3 inline mr-1" /> Preview
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
            <Button variant="gradient" size="sm">
              Publish
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-card/10">
          <div className="max-w-xl mx-auto">
            <div className="mb-5">
              {previewMode ? (
                <>
                  <h2 className="font-display text-2xl font-semibold mb-1">{title}</h2>
                  {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </>
              ) : (
                <>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Form title"
                    className="font-display text-xl font-semibold border-transparent bg-transparent px-0 focus-visible:ring-0"
                  />
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description visible to people filling out the form"
                    className="border-transparent bg-transparent px-0 mt-1 resize-none focus-visible:ring-0"
                    rows={2}
                  />
                </>
              )}
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {fields.map((field) => (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      isActive={active === field.id}
                      previewMode={previewMode}
                      onSelect={() => setActive(field.id)}
                      onRemove={() => removeField(field.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {!previewMode && (
              <button
                onClick={() => addField('short')}
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-3 text-sm text-muted-foreground hover:border-accent hover:text-foreground hover:bg-card/40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add field
              </button>
            )}

            {previewMode && (
              <Button variant="gradient" className="mt-6 w-full" size="lg">
                Submit
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Inspector */}
      <Card variant="glass" className="overflow-hidden p-0 flex flex-col">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-1.5">
          <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {activeField ? 'Field settings' : 'Form settings'}
          </span>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {activeField ? (
            <>
              <div>
                <Label>Question</Label>
                <Input
                  value={activeField.label}
                  onChange={(e) => updateField(activeField.id, { label: e.target.value })}
                />
              </div>
              <div>
                <Label>Help text</Label>
                <Input
                  value={activeField.helpText ?? ''}
                  onChange={(e) => updateField(activeField.id, { helpText: e.target.value })}
                  placeholder="Optional context shown below the field"
                />
              </div>
              {(activeField.type === 'select' || activeField.type === 'multi') && (
                <div>
                  <Label>Options (one per line)</Label>
                  <Textarea
                    rows={4}
                    value={(activeField.options ?? []).join('\n')}
                    onChange={(e) =>
                      updateField(activeField.id, {
                        options: e.target.value.split('\n').filter(Boolean),
                      })
                    }
                  />
                </div>
              )}
              <div>
                <Label>Map to task field</Label>
                <select
                  value={activeField.mappedTo ?? ''}
                  onChange={(e) => updateField(activeField.id, { mappedTo: e.target.value || undefined })}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">— Don't map —</option>
                  {TASK_FIELD_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/40 mt-3">
                <Label htmlFor="req" className="m-0">Required</Label>
                <Switch
                  id="req"
                  checked={activeField.required ?? false}
                  onCheckedChange={(v) => updateField(activeField.id, { required: v })}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>After submit</Label>
                <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                  <option>Show thank-you screen</option>
                  <option>Redirect to URL</option>
                </select>
              </div>
              <div>
                <Label>Send to project</Label>
                <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                  <option>Onboarding · To do</option>
                  <option>Bugs · Triage</option>
                  <option>Marketing · Inbox</option>
                </select>
              </div>
              <div>
                <Label>Visibility</Label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-accent" />
                    Public link
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:bg-card/60">
                    Workspace only
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

function SortableFieldRow({
  field,
  isActive,
  previewMode,
  onSelect,
  onRemove,
}: {
  field: FormField
  isActive: boolean
  previewMode: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        'group relative rounded-xl border bg-card/40 p-4 transition-all',
        isActive && !previewMode && 'border-accent/60 shadow-glow',
        !isActive && 'border-border/40 hover:border-border',
        isDragging && 'opacity-60 scale-[0.99]',
      )}
    >
      {!previewMode && (
        <div className="absolute -left-7 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button {...attributes} {...listeners} className="p-1 cursor-grab text-muted-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Label className="flex items-center gap-2 mb-2">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
        {!previewMode && field.mappedTo && (
          <Badge variant="info" className="text-[9px] uppercase">
            → {field.mappedTo}
          </Badge>
        )}
      </Label>
      {field.helpText && !previewMode && (
        <p className="text-xs text-muted-foreground mb-2">{field.helpText}</p>
      )}
      <FieldRenderer field={field} />
    </div>
  )
}

function FieldRenderer({ field }: { field: FormField }) {
  switch (field.type) {
    case 'short':
    case 'email':
    case 'url':
      return <Input placeholder={field.placeholder ?? `Type your answer…`} type={field.type === 'email' ? 'email' : 'text'} />
    case 'long':
      return <Textarea rows={3} placeholder="Type a longer answer…" />
    case 'number':
      return <Input type="number" placeholder="0" />
    case 'date':
      return <Input type="date" />
    case 'select':
      return (
        <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
          <option value="">Choose…</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )
    case 'multi':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {field.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-card/60">
              <input type="checkbox" />
              {o}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" /> Yes
        </label>
      )
    case 'file':
      return (
        <button className="w-full h-20 rounded-lg border border-dashed border-border/60 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground hover:bg-card/40">
          <Upload className="h-4 w-4" />
          Drop a file or click to upload
        </button>
      )
  }
}

const DEFAULT_FIELDS: FormField[] = [
  { id: '1', type: 'short', label: 'What\'s the bug?', placeholder: 'Short summary', required: true, mappedTo: 'Title' },
  { id: '2', type: 'long', label: 'Steps to reproduce', helpText: 'List the exact steps so we can reproduce.', mappedTo: 'Description' },
  { id: '3', type: 'select', label: 'Severity', options: ['Critical', 'Major', 'Minor', 'Cosmetic'], required: true, mappedTo: 'Priority' },
  { id: '4', type: 'file', label: 'Screenshot or video' },
  { id: '5', type: 'email', label: 'Your email (so we can follow up)', required: true },
]
