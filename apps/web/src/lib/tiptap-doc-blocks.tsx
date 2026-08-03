import {
  Node,
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { api } from './api'
import { useTranslation } from './i18n'

/**
 * A5.8 — the block types the slash palette was missing. Table and divider come
 * from Tiptap/StarterKit; these two do not exist upstream:
 *
 *  • Callout — a titled panel for the "read this first" paragraph every brief
 *    has. Plain block content, so the whole toolbar keeps working inside it.
 *  • List embed — the block that carries the real weight: a project brief that
 *    embeds a live List stops going stale, because the tasks are fetched at
 *    render time instead of being pasted in as text.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docCallout: {
      toggleCallout: () => ReturnType
    }
    docListEmbed: {
      insertListEmbed: (attrs: { listId: string; listName?: string | null }) => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0]
  },

  addCommands() {
    return {
      toggleCallout: () => ({ commands }) => commands.toggleWrap(this.name),
    }
  },
})

export const ListEmbed = Node.create({
  name: 'listEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      listId: { default: null },
      // Cached so the block reads correctly before the fetch resolves, and
      // still names something if the list is later deleted.
      listName: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-list-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-list-embed': '' })]
  },

  addCommands() {
    return {
      insertListEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ListEmbedView)
  },
})

/**
 * Same schema, no node view: for the anonymous public-share viewer, which has
 * no token to read the list with. Registering it keeps the block from being
 * stripped when the shared doc is parsed; the cached name is what a visitor
 * sees.
 */
export const ListEmbedStatic = ListEmbed.extend({
  addNodeView: undefined,

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-list-embed': '', class: 'rd-list-embed' }),
      `↗ ${node.attrs.listName || 'Embedded list'}`,
    ]
  },
})

type EmbeddedTask = {
  id: string
  title: string
  statusCategory?: 'open' | 'in_progress' | 'closed'
  dueDate?: string | null
}

const MAX_EMBEDDED_TASKS = 8

function ListEmbedView(props: NodeViewProps) {
  const { t } = useTranslation()
  const listId = props.node.attrs.listId as string | null
  const listName = props.node.attrs.listName as string | null

  const tasksQuery = useQuery({
    queryKey: ['doc-list-embed', listId],
    enabled: Boolean(listId),
    queryFn: () => api<EmbeddedTask[]>(`/tasks/list/${listId}`),
  })

  const tasks = tasksQuery.data ?? []
  const open = tasks.filter((task) => task.statusCategory !== 'closed')

  return (
    <NodeViewWrapper className="my-3 rounded-lg border border-border/70 bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 text-xs">
        <ClipboardList className="h-3.5 w-3.5 text-accent shrink-0" />
        <span className="font-medium truncate">{listName || t('docs.embeddedList')}</span>
        <span className="text-muted-foreground tabular-nums ms-auto shrink-0">
          {t('docs.embedOpenCount', { open: open.length, total: tasks.length })}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {tasksQuery.isLoading && (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('common.loading')}</p>
        )}
        {tasksQuery.isError && (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('docs.embedUnavailable')}</p>
        )}
        {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('docs.embedEmpty')}</p>
        )}
        {tasks.slice(0, MAX_EMBEDDED_TASKS).map((task) => (
          <div key={task.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                task.statusCategory === 'closed' ? 'bg-emerald-500' : 'bg-brand-700'
              }`}
            />
            <span className={`truncate flex-1 ${task.statusCategory === 'closed' ? 'line-through opacity-60' : ''}`}>
              {task.title}
            </span>
            {task.dueDate && (
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        ))}
        {tasks.length > MAX_EMBEDDED_TASKS && (
          <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
            {t('docs.embedMore', { count: tasks.length - MAX_EMBEDDED_TASKS })}
          </p>
        )}
      </div>
    </NodeViewWrapper>
  )
}
