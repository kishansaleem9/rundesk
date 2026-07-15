import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@rundesk/ui'
import { Layers, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type SavedDocTemplate = {
  id: string
  name: string
  description: string | null
  icon: string | null
}

// ── ProseMirror/TipTap content helpers ──────────────────────────────────────
type Node = Record<string, unknown>
const h = (level: 1 | 2 | 3, text: string): Node => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
})
const p = (text = ''): Node => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const bullets = (items: string[]): Node => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [p(t)] })),
})
const todos = (items: string[]): Node => ({
  type: 'taskList',
  content: items.map((t) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(t)] })),
})
const doc = (...content: Node[]): Record<string, unknown> => ({ type: 'doc', content })

export type DocTemplate = {
  id: string
  nameKey: TranslationKey
  emoji: string
  descKey: TranslationKey
  // `title` and `content` are inserted verbatim into the created document
  // (persisted user content), so they stay as data — not localized display.
  title: string
  content: Record<string, unknown>
}

// Built-in document templates. Each produces a ready-to-edit TipTap document.
export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'meeting',
    nameKey: 'docTemplates.name.meeting',
    emoji: '🗣',
    descKey: 'docTemplates.desc.meeting',
    title: 'Meeting notes',
    content: doc(
      h(1, 'Meeting notes'),
      p('Date: '),
      h(3, 'Attendees'),
      bullets(['']),
      h(3, 'Agenda'),
      bullets(['', '']),
      h(3, 'Decisions'),
      bullets(['']),
      h(3, 'Action items'),
      todos(['', '']),
    ),
  },
  {
    id: 'project-brief',
    nameKey: 'docTemplates.name.projectBrief',
    emoji: '📦',
    descKey: 'docTemplates.desc.projectBrief',
    title: 'Project brief',
    content: doc(
      h(1, 'Project brief'),
      h(3, 'Problem'),
      p(''),
      h(3, 'Goals'),
      bullets(['']),
      h(3, 'Scope'),
      p('In scope:'),
      bullets(['']),
      p('Out of scope:'),
      bullets(['']),
      h(3, 'Success criteria'),
      bullets(['']),
    ),
  },
  {
    id: 'sop',
    nameKey: 'docTemplates.name.sop',
    emoji: '📋',
    descKey: 'docTemplates.desc.sop',
    title: 'Standard operating procedure',
    content: doc(
      h(1, 'Standard operating procedure'),
      h(3, 'Purpose'),
      p(''),
      h(3, 'When to use'),
      p(''),
      h(3, 'Steps'),
      { type: 'orderedList', content: [{ type: 'listItem', content: [p('')] }] },
      h(3, 'Owner'),
      p(''),
    ),
  },
  {
    id: 'retro',
    nameKey: 'docTemplates.name.retro',
    emoji: '🔄',
    descKey: 'docTemplates.desc.retro',
    title: 'Sprint retro',
    content: doc(
      h(1, 'Sprint retro'),
      h(3, 'What went well'),
      bullets(['']),
      h(3, 'What didn’t'),
      bullets(['']),
      h(3, 'Start / Stop / Continue'),
      bullets(['Start: ', 'Stop: ', 'Continue: ']),
      h(3, 'Action items'),
      todos(['']),
    ),
  },
  {
    id: 'rfc',
    nameKey: 'docTemplates.name.rfc',
    emoji: '📐',
    descKey: 'docTemplates.desc.rfc',
    title: 'RFC',
    content: doc(
      h(1, 'RFC: '),
      h(3, 'Summary'),
      p(''),
      h(3, 'Motivation'),
      p(''),
      h(3, 'Proposal'),
      p(''),
      h(3, 'Alternatives considered'),
      bullets(['']),
      h(3, 'Risks'),
      bullets(['']),
    ),
  },
  {
    id: 'one-on-one',
    nameKey: 'docTemplates.name.oneOnOne',
    emoji: '💬',
    descKey: 'docTemplates.desc.oneOnOne',
    title: '1:1 agenda',
    content: doc(
      h(1, '1:1 agenda'),
      h(3, 'Topics for today'),
      todos(['', '']),
      h(3, 'Follow-ups'),
      todos(['']),
      h(3, 'Parking lot'),
      bullets(['']),
    ),
  },
]

export function DocTemplatesDialog({
  open,
  onOpenChange,
  onPick,
  workspaceId,
  onPickSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick: (template: DocTemplate) => void
  // Workspace-saved templates (durable, created from real docs).
  workspaceId?: string
  onPickSaved?: (templateId: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const savedQuery = useQuery({
    queryKey: ['doc-templates', workspaceId],
    enabled: open && !!workspaceId && !!onPickSaved,
    queryFn: () => api<SavedDocTemplate[]>(`/workspaces/${workspaceId}/doc-templates`),
  })
  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/doc-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-templates', workspaceId] }),
  })
  const saved = savedQuery.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" /> {t('docTemplates.dialogTitle')}
          </DialogTitle>
        </DialogHeader>

        {saved.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('docTemplates.yourTemplates')}</p>
            <div className="grid grid-cols-2 gap-2">
              {saved.map((tpl) => (
                <div
                  key={tpl.id}
                  className="group relative text-left rounded-lg border border-border/50 bg-card/40 p-3 hover:border-accent/40 hover:bg-card/70 transition-all"
                >
                  <button
                    className="block w-full text-left"
                    onClick={() => {
                      onPickSaved?.(tpl.id)
                      onOpenChange(false)
                    }}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-lg">{tpl.icon ?? '📄'}</span>
                      <span className="text-sm font-medium truncate">{tpl.name}</span>
                    </div>
                    {tpl.description && <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>}
                  </button>
                  <button
                    title={t('docTemplates.deleteTemplate')}
                    className="absolute top-2 right-2 h-6 w-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-500"
                    onClick={() => deleteTemplate.mutate(tpl.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {saved.length > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('docTemplates.builtIn')}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {DOC_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                className="text-left rounded-lg border border-border/50 bg-card/40 p-3 hover:border-accent/40 hover:bg-card/70 transition-all"
                onClick={() => {
                  onPick(tpl)
                  onOpenChange(false)
                }}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-lg">{tpl.emoji}</span>
                  <span className="text-sm font-medium">{t(tpl.nameKey)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t(tpl.descKey)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40 pt-3 mt-1 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
