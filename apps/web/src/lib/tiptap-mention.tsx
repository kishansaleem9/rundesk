import { ReactRenderer } from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import type { SuggestionOptions } from '@tiptap/suggestion'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from 'react'

export type MentionMember = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string | null
}

export type MentionPickerHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean
}

type MentionPickerProps = {
  items: MentionMember[]
  command: (props: { id: string; label: string }) => void
}

const MentionPicker = forwardRef(function MentionPicker(
  { items, command }: MentionPickerProps,
  ref: ForwardedRef<MentionPickerHandle>,
) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [items])

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item) return
      command({ id: item.id, label: item.displayName || item.email })
    },
    [items, command],
  )

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent): boolean => {
        if (event.key === 'ArrowDown') {
          setActiveIndex((i) => (i + 1) % Math.max(items.length, 1))
          return true
        }
        if (event.key === 'ArrowUp') {
          setActiveIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1))
          return true
        }
        if (event.key === 'Enter') {
          selectItem(activeIndex)
          return true
        }
        if (event.key === 'Escape') {
          return true
        }
        return false
      },
    }),
    [items, activeIndex, selectItem],
  )

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-xl backdrop-blur">
        No matching members
      </div>
    )
  }

  return (
    <div className="min-w-[220px] max-h-64 overflow-auto rounded-md border border-border/60 bg-card/95 p-1 shadow-xl backdrop-blur">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(e) => {
            e.preventDefault()
            selectItem(index)
          }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
            index === activeIndex
              ? 'bg-accent/15 text-foreground'
              : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-semibold text-white">
            {(item.displayName || item.email).slice(0, 1).toUpperCase()}
          </span>
          <span className="flex-1 truncate">
            <span className="font-medium">{item.displayName || item.email}</span>
            {item.displayName && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">{item.email}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
})

export type MentionSuggestionContext = {
  fetchMembers: (query: string) => Promise<MentionMember[]>
}

/**
 * Build a fully-configured Tiptap Mention extension. Provide a `fetchMembers`
 * callback that returns the candidate workspace members for a given query.
 * The extension exposes the user's UUID as the mention id and the display
 * name as the label, so server-side mention resolution (see
 * `docs.service.ts#resolveMentions`) can match against `@<uuid>` or
 * `@<name>` payloads.
 */
export function createMentionExtension({ fetchMembers }: MentionSuggestionContext) {
  return Mention.configure({
    HTMLAttributes: {
      class:
        'rounded bg-accent/15 px-1 py-0.5 text-accent font-medium [&[data-id]]:cursor-pointer',
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`
    },
    suggestion: buildSuggestionConfig({ fetchMembers }),
  })
}

function buildSuggestionConfig({
  fetchMembers,
}: MentionSuggestionContext): Omit<SuggestionOptions, 'editor'> {
  return {
    char: '@',
    pluginKey: new PluginKey('mention-suggestion'),
    allowSpaces: false,
    items: async ({ query }) => {
      try {
        const results = await fetchMembers(query ?? '')
        return results.slice(0, 8)
      } catch {
        return []
      }
    },
    render: () => {
      let component: ReactRenderer<MentionPickerHandle, MentionPickerProps> | null = null
      let popup: HTMLDivElement | null = null

      const positionPopup = (rect: DOMRect) => {
        if (!popup) return
        popup.style.position = 'absolute'
        popup.style.top = `${rect.bottom + window.scrollY + 6}px`
        popup.style.left = `${rect.left + window.scrollX}px`
        popup.style.zIndex = '60'
      }

      return {
        onStart: (props) => {
          component = new ReactRenderer<MentionPickerHandle, MentionPickerProps>(MentionPicker, {
            props: { items: props.items as MentionMember[], command: props.command },
            editor: props.editor,
          })
          popup = document.createElement('div')
          popup.appendChild(component.element)
          document.body.appendChild(popup)
          const rect = props.clientRect?.()
          if (rect) positionPopup(rect)
        },
        onUpdate: (props) => {
          component?.updateProps({
            items: props.items as MentionMember[],
            command: props.command,
          })
          const rect = props.clientRect?.()
          if (rect) positionPopup(rect)
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup?.remove()
            popup = null
            component?.destroy()
            return true
          }
          return component?.ref?.onKeyDown(props.event) ?? false
        },
        onExit: () => {
          popup?.remove()
          popup = null
          component?.destroy()
          component = null
        },
      }
    },
  }
}
