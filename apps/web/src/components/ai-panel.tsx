import { Fragment, createContext, useContext, useMemo, useState, useRef, useEffect, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, cn, toast } from '@rundesk/ui'
import {
  Sparkles,
  Send,
  X,
  Loader2,
  Bot,
  User,
  Clipboard,
  CheckCircle2,
  Wand2,
  Gem,
  CheckSquare,
  FileOutput,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Star,
  Ban,
  FolderPlus,
  ListTree,
  LayoutGrid,
  Brain,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { renderInlineMarkdown, renderMarkdownBlocks } from './markdown'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { viewLabelKey } from '../lib/space-views'
import { useSpeechRecognition, MicButton } from '../lib/use-speech-recognition'
import { useAiChatActions, useAiChatThread, useAiMessageActions } from '../lib/skills-api'

/**
 * §V2-S18 frame `[17:16]` — what `GET /ai/models` answers with.
 *
 * TWO LISTS WITH DIFFERENT SHAPES, ON PURPOSE. A `ModelTier` carries the tier
 * id the composer sends; an `UnavailableModel` has no such field, so there is
 * nothing for a later refactor to accidentally put in the request body. The
 * frame offers ChatGPT and Gemini; `apps/api` has no OpenAI or Google client,
 * and a pickable row that quietly answers from Claude is the facade this audit
 * exists to catch.
 */
type ModelTier = {
  id: string
  label: string
  hint: string
  provider: string
  group: string
  /** 1–5, the frame's hover-card bars. Relative to each other, not absolute. */
  speed: number
  intelligence: number
}

type UnavailableModel = {
  id: string
  label: string
  provider: string
  /** A translation key, so the reason is readable in all four locales. */
  reasonKey: string
}

type ModelCatalog = {
  /** Every routable tier. The trigger's label is looked up here. */
  models: ModelTier[]
  /** `[17:16]`'s three rows, and what its **Show more** reveals. Server-cut. */
  best: ModelTier[]
  more: ModelTier[]
  unavailable: UnavailableModel[]
}

/** §V2-S18 `[17:32]` — the preferred AI, stored per person per workspace. */
type ModelPreference = { preferredTier: string; isSet: boolean; updatedAt: string | null }

/**
 * §V2-S17/S22 frames `16:32` / `21:15` — what `GET /ai/starters` answers with.
 *
 * Keys rather than sentences, the same reason `UnavailableModel` carries a
 * `reasonKey`: this is read by a person in four locales. `because` is not for
 * reading — it is the fact that selected the card, carried onto the DOM so the
 * change in the set is attributable rather than merely visible.
 */
type StarterCard = {
  id: string
  titleKey: string
  subtitleKey: string
  promptKey: string
  because: string
}
type StarterResponse = {
  cards: StarterCard[]
  /** How many of the four something other than the floor rule chose. */
  contextual: number
  facts: { surface: string; overdue: number; assignedOpen: number; workspaceOpen: number }
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  id: string
  /** §15 — a vote already cast, restored when a thread is reopened. */
  feedback?: 'up' | 'down' | null
  /**
   * G13-10 — what the server said it read to produce this answer.
   *
   * Kept ON THE MESSAGE rather than only in transient state. A first version
   * rendered the trace while `isStreaming` was true and dropped it the moment
   * the answer landed, which meant a fast turn showed nothing at all — and the
   * fast turns are exactly the ones where you would want to check whether it
   * really looked at your workspace or just answered from the question.
   */
  steps?: string[]
  /**
   * G13-9 [18:42] — next steps generated from THIS answer.
   *
   * On the message rather than in panel state, so scrolling back to an earlier
   * answer still offers the path it suggested — which is the point of a guided
   * flow, as opposed to a menu that only exists for the newest reply.
   */
  followUps?: string[]
  /**
   * §V2-S16 `[18:48]` — containers this turn actually brought into existence,
   * as the SERVER reported them on the wire (`{created: …}`), not as parsed out
   * of the answer's prose.
   *
   * The distinction is the whole row. A model can write "Done, created the
   * list" having called nothing; these entries exist only because a tool
   * returned an id that came back from an insert. So this is the evidence, and
   * the sentence beside it is the account.
   */
  created?: CreatedContainer[]
}

type CreatedContainer = { kind: 'list' | 'folder'; id: string; name: string; path: string }

// ─── §V2-S16 frame `20:10` — inline references, resolved live ───────────────

/**
 * `[[task:<uuid>]]` / `[[list:<uuid>]]`, the reference syntax an answer carries.
 *
 * Deliberately not a link and not a name: the frame's chips each show the
 * task's own **status badge** inline in the prose, and an answer is a record of
 * what was true when it was written. A status copied into the text would be
 * wrong the moment anybody moved the task — and wrong in the most confident
 * way, inside a sentence. So the answer stores an id and nothing else, and
 * every chip is hydrated from the database at render time.
 */
const REF_TOKEN =
  /\[\[(task|list|view):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?::([a-z]+))?\]\]/g

type ResolvedTask = {
  id: string
  title: string
  status: string
  statusCategory: string
  listId: string
  listName: string
}
/**
 * §V2-S16 `18:48` — a list, with enough to OPEN it.
 *
 * `path` is what the chip reads; `spaceId` / `projectId` are what makes it a
 * link, because Rundesk addresses a list as
 * `/app/:workspaceId/:spaceId/:projectId/:listId` and a chip holding only the
 * list id can be drawn but not pressed. `views` is which tabs that page
 * actually has, read live — the same reason a task chip's badge is read live.
 */
type ResolvedList = {
  id: string
  name: string
  path: string
  spaceId: string
  projectId: string
  views: string[]
}
type RefResponse = { tasks: ResolvedTask[]; lists: ResolvedList[] }

type RefIndex = {
  tasks: Map<string, ResolvedTask>
  lists: Map<string, ResolvedList>
  /** True while the batch is in flight, so a chip can be a skeleton not a gap. */
  pending: boolean
  /** The workspace the chips' links are built in. '' outside a panel. */
  workspaceId: string
}

const EMPTY_REFS: RefIndex = { tasks: new Map(), lists: new Map(), pending: false, workspaceId: '' }
const AiRefs = createContext<RefIndex>(EMPTY_REFS)

/**
 * Every distinct id an answer refers to, by kind. Pure, and cheap to re-run.
 *
 * A `view` reference resolves THROUGH ITS LIST — there is no view row to fetch,
 * a view is a tab on the list's page — so its id joins the list ids. Sending it
 * as its own kind would ask the server for something that does not exist and
 * get an empty answer back, which draws as a permanent skeleton.
 */
function collectRefs(texts: string[]): { taskIds: string[]; listIds: string[] } {
  const taskIds = new Set<string>()
  const listIds = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    // `matchAll` on a /g regex needs a fresh lastIndex per use; a new iterator
    // from the same literal is safe because the literal is re-evaluated never —
    // so reset explicitly rather than relying on it.
    REF_TOKEN.lastIndex = 0
    for (const m of text.matchAll(REF_TOKEN)) {
      ;(m[1] === 'task' ? taskIds : listIds).add(m[2].toLowerCase())
    }
  }
  return { taskIds: [...taskIds].sort(), listIds: [...listIds].sort() }
}

/**
 * §V2-06 — the view's name, from the module that owns the view vocabulary.
 *
 * Imported rather than restated. The `team` defect is what this avoids: two
 * hand-kept copies of the view map were missing that key and rendered the word
 * "List" on a Team row, and every check of the form "the row has a label"
 * passed on it. `viewLabelKey` returns `null` for a key this build does not
 * know, and the raw key is rendered instead — ugly, visible, and impossible to
 * mistake for a working chip.
 */
function viewLabel(view: string, t: (k: TranslationKey) => string): string {
  const key = viewLabelKey(view)
  return key ? t(key) : view
}

/**
 * The frame's status badge: the CATEGORY drives the colour, the status key is
 * the word.
 *
 * Category rather than the key, because a workspace can rename "Done" to
 * anything and a colour keyed on the word would go grey the moment it did —
 * the same drift `resolveStatusForList` exists to prevent on the server.
 */
const STATUS_TONE: Record<string, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  closed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

/**
 * One chip, resolving itself.
 *
 * THREE STATES, AND THE THIRD IS THE IMPORTANT ONE. Pending draws the frame's
 * grey skeleton; resolved draws the name and the live badge; UNRESOLVED draws
 * the reference as plain text. Unresolved is not a failure to paper over — an
 * id the reader may not see, or one the model invented, must not become a chip
 * that asserts a title, so it degrades to something visibly inert.
 */
function AiRefChip({ kind, id, view }: { kind: 'task' | 'list' | 'view'; id: string; view?: string }) {
  const refs = useContext(AiRefs)
  // `translate`, not `t`: the resolved task below is already bound to `t`, and
  // shadowing it here would be a rename away from a very quiet bug.
  const { t: translate } = useTranslation()
  const navigate = useNavigate()
  const task = kind === 'task' ? refs.tasks.get(id) : undefined
  const list = kind === 'task' ? undefined : refs.lists.get(id)

  if (!task && !list) {
    if (refs.pending) {
      return (
        <span
          data-testid={`ai-ref-skeleton-${id}`}
          data-ref-kind={kind}
          aria-busy="true"
          className="mx-0.5 inline-block h-4 w-20 animate-pulse rounded bg-muted align-middle"
        />
      )
    }
    return (
      <span
        data-testid={`ai-ref-unresolved-${id}`}
        data-ref-kind={kind}
        className="mx-0.5 rounded bg-muted/60 px-1 py-px font-mono text-[10px] text-muted-foreground"
      >
        {kind}:{id.slice(0, 8)}
      </span>
    )
  }

  if (list) {
    /*
     * §V2-S16 `18:48` — THE CHIP IS A DESTINATION.
     *
     * *"Use the `rundesk > ddddd > List` for task details or the `rundesk >
     * ddddd > Board` to manage work by status."* Both halves of that sentence
     * are instructions to go somewhere, and until this it drew a `<span>`: a
     * path that looked like a link, could not be pressed, could not be
     * middle-clicked and did not appear to a keyboard at all. The dead control,
     * in the one place the answer is telling you to act.
     *
     * A real `href` rather than an `onClick` alone, so the browser's own
     * affordances work; the click is intercepted for client-side routing.
     */
    const viewEnabled = !view || list.views.includes(view)
    const href = refs.workspaceId
      ? `/app/${refs.workspaceId}/${list.spaceId}/${list.projectId}/${list.id}` +
        (view && viewEnabled ? `?view=${view}` : '')
      : ''
    /*
     * A view the space no longer enables is NOT offered as that view. The chip
     * degrades to the list it belongs to — a place that does exist — rather
     * than linking to a tab the page will not draw. `data-view-enabled` says
     * which happened, because "the chip is there" must not be the only
     * observable, and the tab set is read at render time exactly so this can
     * change after the answer was written.
     */
    const label = view && viewEnabled ? `${list.path} > ${viewLabel(view, translate)}` : list.path
    const testId = view ? `ai-ref-view-${id}-${view}` : `ai-ref-list-${id}`
    const className =
      'mx-0.5 inline-flex max-w-full items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-px align-middle text-[11px] hover:bg-muted hover:border-border'
    const body = (
      <>
        {view ? (
          <LayoutGrid className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ListTree className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{label}</span>
      </>
    )
    if (!href) {
      // No workspace in context means no route can be built. Inert and saying
      // so beats an anchor to "" that reloads the page onto itself.
      return (
        <span data-testid={testId} data-ref-kind={view ? 'view' : 'list'} data-ref-path={label} className={className}>
          {body}
        </span>
      )
    }
    return (
      <a
        href={href}
        data-testid={testId}
        data-ref-kind={view ? 'view' : 'list'}
        data-ref-path={label}
        data-ref-view={view ?? ''}
        data-view-enabled={view ? String(viewEnabled) : ''}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          void navigate({ to: href })
        }}
        className={className}
      >
        {body}
      </a>
    )
  }

  const t = task!
  return (
    <span
      data-testid={`ai-ref-task-${id}`}
      data-ref-kind="task"
      data-ref-status={t.status}
      data-ref-status-category={t.statusCategory}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-px align-middle text-[11px]"
    >
      <CheckSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{t.title}</span>
      <span
        data-testid={`ai-ref-task-badge-${id}`}
        className={cn('rounded px-1 text-[9px] font-semibold uppercase tracking-wide', STATUS_TONE[t.statusCategory] ?? STATUS_TONE.open)}
      >
        {t.status}
      </span>
    </span>
  )
}

/**
 * §V2-S16 `20:10` — the inline renderer an AI answer is parsed with.
 *
 * Splits out references FIRST, then hands every remaining run to the markdown
 * renderer this product already ships. Wrapping it rather than forking it is
 * the point: `markdown.tsx` is one implementation used by comments, task
 * descriptions and now answers, and a second "show the text" would be the
 * duplicated list — which is exactly what the answer bubble was before this,
 * rendering `{message.content}` as a string while a block renderer sat one
 * import away.
 */
function renderAiInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let k = 0
  REF_TOKEN.lastIndex = 0
  for (const m of text.matchAll(REF_TOKEN)) {
    const at = m.index ?? 0
    if (at > cursor) nodes.push(...renderInlineMarkdown(text.slice(cursor, at), `${keyPrefix}-t${k++}`))
    nodes.push(
      <AiRefChip
        key={`${keyPrefix}-r${k++}`}
        kind={m[1] === 'task' ? 'task' : m[1] === 'view' ? 'view' : 'list'}
        id={m[2].toLowerCase()}
        view={m[1] === 'view' ? m[3] : undefined}
      />,
    )
    cursor = at + m[0].length
  }
  if (cursor < text.length) nodes.push(...renderInlineMarkdown(text.slice(cursor), `${keyPrefix}-t${k++}`))
  return nodes
}

/**
 * An answer, rendered.
 *
 * `renderMarkdownBlocks` with our inline renderer, so headings, lists, tables,
 * code fences and bold all work — frame `20:10` has four distinct bold runs in
 * one paragraph — and a reference inside any of them still becomes a chip.
 */
function AiAnswer({ content, testId }: { content: string; testId: string }) {
  return (
    <div data-testid={testId} className="ai-answer text-sm [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
      {renderMarkdownBlocks(content, renderAiInline)}
    </div>
  )
}

type AiPanelProps = {
  workspaceId: string
  /** Optional hint about where the user is (e.g. "list Backlog", "dashboard"),
   * forwarded so the server grounds answers to the current view (Plan §7.15). */
  currentView?: string
  /** §A6.4 — a question handed in from elsewhere (the palette's Ask AI row, an
   * `/ai?prompt=` link). `id` separates two identical asks so the second one is
   * still sent instead of being read as a re-render of the first. */
  ask?: { text: string; id: number }
  /** Fired once the `ask` has been sent, so the caller can drop it and a later
   * re-mount of the panel does not replay a stale question. */
  onAskHandled?: () => void
  onClose?: () => void
  className?: string
  /** §15 — answer as this skill. The server enforces that the caller can see
   * it and that it is enabled; this only says which one to ask for. */
  skillId?: string
  /** Shown on the composer chip, from frame `296_1817`. Display only. */
  skillName?: string
  /**
   * §15 — the thread this panel is showing. When set the conversation is
   * loaded from it and every turn is written back, so closing the panel no
   * longer discards what was said (frames `296_1817` → `304_1907`).
   */
  threadId?: string | null
  /**
   * §G13-8 — keep what is said here.
   *
   * When no `threadId` is supplied and this is set, the panel mints one on the
   * FIRST message. The dock had neither, so its conversations vanished on close
   * and every per-message action stayed greyed out. Off by default: a caller
   * that wants a scratch conversation should get one.
   */
  persist?: boolean
  /** Fired when a thread names itself, so the sidebar can show the new title. */
  onThreadTitled?: (title: string) => void
}

// Stable catalog-key identifiers; the localized text is both shown and sent
// as the chat message when a suggestion is clicked.
/**
 * G13-10 — the trace, wherever it is shown.
 *
 * One component for the live case and the finished one, so the two cannot
 * drift into showing different things about the same turn.
 */
function AiTrace({ steps, t }: { steps: string[]; t: (k: TranslationKey) => string }) {
  if (steps.length === 0) return null
  return (
    <div className="flex items-start gap-2" data-testid="ai-trace">
      <div className="h-6 w-6 shrink-0" />
      <div className="space-y-0.5">
        {steps.map((s, i) => (
          <div
            key={`${s}-${i}`}
            data-testid={`ai-trace-step-${s}`}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <Check className="h-3 w-3 shrink-0 opacity-60" />
            {t(AI_STEP_LABEL[s] ?? 'aiPanel.stepWorking')}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * G13-10 — the server's step names, mapped to something a person reads.
 *
 * The wire carries short stable keys (`workspace`, `skill`, `writing`) rather
 * than prose, so the API is not a translation table and an unknown step from a
 * newer server still renders as something honest instead of vanishing.
 */
const AI_STEP_LABEL: Record<string, TranslationKey> = {
  workspace: 'aiPanel.stepWorkspace',
  skill: 'aiPanel.stepSkill',
  writing: 'aiPanel.stepWriting',
  // §V2-S16 frame `18:45` — *"Creating the new rundesk list"*. Written by the
  // server immediately before the write, so a step that is here is a write that
  // was attempted; what came of it is in the answer.
  create_list: 'aiPanel.stepCreatingList',
  create_folder: 'aiPanel.stepCreatingFolder',
}

/**
 * §V2-S16 — the steps that mean the assistant is ACTING rather than reading.
 *
 * Kept as a set derived from the same map above, so a step added there and
 * forgotten here is impossible to introduce by adding one line: a new action
 * step has to be listed, and a retrieval step has to not be.
 */
const ACTION_STEPS: ReadonlySet<string> = new Set(['create_list', 'create_folder'])

/**
 * §V2-S16 frames `18:00` / `18:45` / `20:10` — the busy state, in words.
 *
 * Above the step log the frames draw a status word that changes with what is
 * happening: **Handling** at `18:45` while a container is being made, **Cookin'**
 * at `20:10` while the answer streams, settling to **Brain** at `18:48` when it
 * lands. Rundesk drew a bare spinner, so a turn spending four seconds writing
 * into your workspace looked exactly like a turn that had not started.
 *
 * DERIVED FROM REAL SIGNALS, NEVER FROM A TIMER. The three states come from
 * what the server has actually sent — an action step, a text delta, or neither
 * yet — so the word is a report and not an animation with vocabulary. A state
 * that cycled on a timer would be the facade: it would look identical on a turn
 * that had already died.
 */
type BusyState = 'acting' | 'writing' | 'thinking'

function busyStateFor(steps: string[], hasText: boolean): BusyState {
  // Text first: once prose is arriving, "Handling" would describe a tool call
  // that has already finished.
  if (hasText) return 'writing'
  if (steps.some((s) => ACTION_STEPS.has(s))) return 'acting'
  return 'thinking'
}

const BUSY_LABEL: Record<BusyState, TranslationKey> = {
  acting: 'aiPanel.busyActing',
  writing: 'aiPanel.busyWriting',
  thinking: 'aiPanel.busyThinking',
}

function AiBusyState({ state, t }: { state: BusyState; t: (k: TranslationKey) => string }) {
  return (
    <div className="flex items-center gap-2" data-testid="ai-busy-state" data-state={state}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-700 to-brand-500">
        <Brain className="h-3.5 w-3.5 text-white" />
      </div>
      <span
        className="text-xs font-medium text-muted-foreground"
        aria-live="polite"
        data-testid="ai-busy-label"
      >
        {t(BUSY_LABEL[state])}
      </span>
    </div>
  )
}

/**
 * §V2-S18 frames `17:42` / `17:46` / `17:50` — INLINE WORD SUGGESTIONS.
 *
 * WHAT THE THREE FRAMES DRAW, read rather than remembered. A small dark pill
 * bar floats just above the composer, holding exactly THREE words, and it moves
 * with the caret:
 *
 *   `create a `                      → **new** · **list** · **list of**
 *   `create a folder name as `       → **the** · **a**   · **you**
 *   `create a folder name as ddddd on ` → **the** · **a** · **this**
 *
 * Two things follow from reading all three rather than one. The suggestions
 * CHANGE with what is typed — a fixed three would have photographed identically
 * at `17:42` and is the facade — and the first set is DOMAIN-AWARE: "list" is
 * offered after "create a" because a list is a thing this product makes, and
 * "list of" shows the offer is a phrase and not a token.
 *
 * SO THE TABLE IS TWO TABLES. `NEXT_WORD` is what the product can be asked to
 * do, keyed on the word before; `GENERIC_NEXT` is ordinary English for
 * everything else. The frames' own three sets are the entries for `a`, `as` and
 * `on`, because the frame is the specification.
 *
 * AND THE THIRD BEHAVIOUR, which the frames of video 1 show (`020_0124`: a
 * bubble offering "vn" and "vnjf" while "vnjfv" is being typed): a HALF-TYPED
 * word completes from the vocabulary instead of predicting the next one.
 * Completing what somebody is in the middle of is worth more than guessing
 * what comes after it.
 */
const AI_VOCAB: readonly string[] = [
  // The nouns the AI's own tools accept, so a completion is a thing it can do.
  'assignee',
  'board',
  'calendar',
  'checklist',
  'comment',
  'description',
  'doc',
  'folder',
  'gantt',
  'list',
  'overdue',
  'priority',
  'space',
  'status',
  'subtask',
  'summarize',
  'table',
  'task',
  'template',
  'timeline',
  'workspace',
]

const NEXT_WORD: Record<string, readonly string[]> = {
  // `17:42`, exactly as drawn.
  a: ['new', 'list', 'list of'],
  // `17:46` and `17:50`, exactly as drawn.
  as: ['the', 'a', 'you'],
  on: ['the', 'a', 'this'],
  create: ['a', 'the', 'a new'],
  make: ['a', 'the', 'a new'],
  add: ['a', 'the', 'a new'],
  new: ['list', 'task', 'folder'],
  show: ['me', 'all', 'the'],
  find: ['all', 'the', 'every'],
  all: ['tasks', 'lists', 'my'],
  my: ['tasks', 'lists', 'overdue'],
  the: ['list', 'task', 'space'],
  in: ['the', 'my', 'this'],
  to: ['the', 'me', 'a'],
  for: ['the', 'me', 'this'],
  this: ['list', 'task', 'week'],
  summarize: ['my', 'this', 'all'],
  assign: ['this', 'the', 'it'],
  move: ['this', 'all', 'the'],
}

const GENERIC_NEXT: readonly string[] = ['the', 'a', 'this']

/** The frame draws three. Three is the contract. */
const WORD_SUGGESTION_COUNT = 3

/**
 * Up to three continuations for what has been typed so far. PURE.
 *
 * Returns `[]` for an empty composer: a bar of guesses over an empty box is
 * noise, and neither frame shows one before anything has been typed.
 */
export function nextWordSuggestions(text: string): string[] {
  if (!text) return []
  const endsMidWord = !/\s$/.test(text)
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const last = tokens[tokens.length - 1].toLowerCase()

  if (endsMidWord) {
    // Mid-word: complete it. A single-letter stem matches most of the
    // vocabulary and would offer three arbitrary words, so it waits for two.
    if (last.length < 2) return []
    return AI_VOCAB.filter((w) => w.startsWith(last) && w !== last).slice(0, WORD_SUGGESTION_COUNT)
  }

  const next = NEXT_WORD[last] ?? GENERIC_NEXT
  // Never offer the word that was just typed — pressing it would produce
  // "the the", which is the one suggestion guaranteed to be wrong.
  return next.filter((w) => w.toLowerCase() !== last).slice(0, WORD_SUGGESTION_COUNT)
}

/**
 * Apply a suggestion to the composer's text.
 *
 * Two cases, and they are not the same edit: mid-word REPLACES the stem
 * ("fol" + "folder" → "folder", not "fol folder"), while after a space it
 * APPENDS. Getting that wrong is invisible in a screenshot and obvious the
 * first time anybody uses it.
 */
export function applyWordSuggestion(text: string, word: string): string {
  if (/\s$/.test(text) || text === '') return `${text}${word} `
  const cut = text.replace(/\S+$/, '')
  return `${cut}${word} `
}

/**
 * §V2-S18 frame `[17:16]` — ONE ROW OF THE MODEL PICKER, AND ITS HOVER CARD.
 *
 * WHAT THE FRAME DRAWS, zoomed rather than remembered: the row itself is just a
 * glyph, a name, a badge and a tick. Hovering it opens a dark card to the RIGHT
 * of the popover carrying the model's name, ONE LINE saying what it is for
 * (*"Fast, lightweight GPT-5.6 model"*), a rule, and two labelled meters —
 * **Speed** at full track, **Intelligence** at about three quarters. The two
 * bars are different lengths, and that is the whole point of drawing them: two
 * bars at the same length are a decoration with a label on it.
 *
 * WHY THIS REPLACED AN INLINE COPY. The previous build put the line and the
 * bars inside every row, always visible, reasoning that a measurement you have
 * to hover to see is one nobody compares. That reason is real and it is also
 * not what `[21:43]` asks for — the frame is the specification. It also made
 * the rows three lines tall each, so three of them plus a disclosure could not
 * fit the popover the frame draws. The card keeps the comparison possible: it
 * opens on FOCUS as well as hover, so tabbing down the list walks the cards.
 *
 * The card is rendered inside the row's own wrapper and positioned `left-full`,
 * exactly where the frame puts it.
 */
function ModelPickerRow({
  model,
  selected,
  preferred,
  hovered,
  onHover,
  onPick,
  t,
}: {
  model: ModelTier
  selected: boolean
  preferred: boolean
  hovered: boolean
  onHover: (id: string | null) => void
  onPick: () => void
  t: (k: TranslationKey) => string
}) {
  return (
    <div
      className="relative"
      onMouseEnter={() => onHover(model.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        role="option"
        aria-selected={selected}
        data-testid={`ai-model-option-${model.id}`}
        data-available="true"
        data-selected={selected ? 'true' : 'false'}
        data-preferred={preferred ? 'true' : 'false'}
        onFocus={() => onHover(model.id)}
        onBlur={() => onHover(null)}
        onClick={onPick}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{model.label}</span>
          {preferred && (
            <span
              data-testid={`ai-model-preferred-badge-${model.id}`}
              className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[10px] text-primary"
            >
              <Star className="h-2.5 w-2.5" />
              {t('aiModels.preferred')}
            </span>
          )}
        </span>
        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
      </button>
      {hovered && (
        <div
          data-testid={`ai-model-card-${model.id}`}
          role="tooltip"
          className="pointer-events-none absolute left-full top-0 z-[70] ml-2 w-56 rounded-lg border border-border bg-popover p-3 shadow-xl"
        >
          <p className="text-xs font-semibold text-foreground">{model.label}</p>
          <p data-testid={`ai-model-hint-${model.id}`} className="mt-0.5 text-[11px] text-muted-foreground">
            {model.hint}
          </p>
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            {(
              [
                ['speed', model.speed, t('aiModels.speed')],
                ['intelligence', model.intelligence, t('aiModels.intelligence')],
              ] as const
            ).map(([key, score, label]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>
                {/*
                  A TRACK AND A FILL, as the frame draws them: the unfilled
                  remainder is visible, so "Intelligence 4" reads as four out of
                  five rather than as a bar of unknown scale. The fill is what
                  carries the testid, because the track is the same width on
                  every row and measuring it would measure nothing.
                */}
                <span className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span
                    data-testid={`ai-model-bar-${key}-${model.id}`}
                    data-score={score}
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(Math.max(score, 0), 5) * 20}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AiPanel({
  workspaceId,
  currentView,
  ask,
  onAskHandled,
  onClose,
  className,
  skillId,
  skillName,
  threadId = null,
  persist = false,
  onThreadTitled,
}: AiPanelProps) {
  const { t, locale } = useTranslation()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<Message[]>([])
  const chat = useAiChatActions(workspaceId)
  /*
   * §G13-8 — a thread the panel minted for itself.
   *
   * The /ai page owns a thread and hands it down; the DOCK was rendered with
   * none, so every conversation held in it vanished on close and all four
   * per-message actions — create task, save to doc, regenerate, thumbs — were
   * `disabled={!threadId}` permanently. The dock is the surface most people
   * use, so the actions were greyed out for most people all the time.
   *
   * Minted on the first message rather than on open, and that ordering is the
   * whole design: creating on open would file an empty thread in the sidebar
   * every time somebody pressed the assistant icon and thought better of it.
   */
  const [ownThreadId, setOwnThreadId] = useState<string | null>(null)
  const activeThreadId = threadId ?? ownThreadId
  const threadQuery = useAiChatThread(workspaceId, activeThreadId)
  // Which thread the on-screen messages belong to, so switching threads
  // replaces the conversation instead of appending to it.
  const loadedThreadRef = useRef<string | null>(null)
  const [input, setInput] = useState('')
  /*
   * §V2-S18 `17:42`–`17:50` — the three words above the composer.
   *
   * Derived from the input rather than held in state: there is no version of
   * this that can be stale, and a `useState` mirror of a `useState` is how a
   * suggestion bar ends up a keystroke behind the text it is suggesting for.
   */
  const wordSuggestions = useMemo(() => nextWordSuggestions(input), [input])
  /*
   * §15 / §V2-S18 — her composer's "Max ▴", frames `296_1817` / `301_1836` and
   * the one this row is about, `[17:16]`.
   *
   * THE DEFECT THIS REPLACES. The tier lived in `localStorage` under
   * `rundesk.aiTier` and nowhere else. `[17:32]` calls it *setting your
   * preferred AI*, and a preference that does not survive a second browser is
   * not a preference, it is a habit this one browser happens to remember. It
   * is a row now (`ai_model_preferences`, migration 0150) and `localStorage` is
   * gone rather than kept as a mirror — two sources of truth for one setting is
   * how they drift.
   *
   * `null` until the server answers, so the picker cannot flash the default and
   * then jump to what you actually chose.
   */
  const [tier, setTier] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** The frame's "Show more" disclosure, closed on arrival as it is there. */
  const [showMoreModels, setShowMoreModels] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  /*
   * G13-10 [18:33–18:36] — what the server says it is reading, as it reads it.
   *
   * Transient by design: this is process, not content. Once the answer is on
   * screen the steps have done their job, and keeping them would turn every
   * past turn into a pile of scaffolding.
   */
  const [steps, setSteps] = useState<string[]>([])
  const [streamBuffer, setStreamBuffer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  /** The picker's root, so an outside click can be told from an inside one. */
  const pickerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Voice dictation for the chat composer (Plan §15.2) — a final transcript is
  // appended to the input; the user reviews it, then sends as usual.
  const voice = useSpeechRecognition({
    locale,
    onResult: (transcript) =>
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  })

  /*
   * The tiers come from the server so the labels and the models they resolve
   * to have one home — and, since §V2-S18, so do the providers it CANNOT
   * reach. Two lists, because they are two different things: `models` route,
   * `unavailable` are named in frame `[17:16]` and have no client in this
   * product. Rendering the second as pickable would be the facade.
   */
  const { data: modelCatalog } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => api<ModelCatalog>('/ai/models'),
    staleTime: Infinity,
    retry: false,
  })
  const modelTiers = modelCatalog?.models ?? []
  const unavailableModels = modelCatalog?.unavailable ?? []
  /*
   * §V2-S18 `[17:16]` — WHERE THE POPOVER IS CUT, decided on the server.
   *
   * The frame heads three rows "Best models" and puts the rest behind **Show
   * more**. The bound is `BEST_MODELS_VISIBLE`, and it is served rather than
   * re-derived here on purpose: a `slice(0, 3)` in this component plus a 3 in
   * `model-tiers.ts` is one fact with two copies, and the copies drift the day
   * a fourth tier lands. `models` is still the whole catalogue — the trigger's
   * label is looked up in it, and a tier hidden behind the disclosure is still
   * a tier you may already have chosen.
   */
  const bestModels = modelCatalog?.best ?? []
  const moreModels = modelCatalog?.more ?? []
  /**
   * §V2-S18 `[17:16]` — which row's HOVER CARD is open.
   *
   * One at a time, held here rather than in each row, because two cards up at
   * once is not a state the frame has and would overlap illegibly.
   */
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)
  /** The composer, so a word suggestion can put focus back where it was. */
  const inputRef = useRef<HTMLInputElement>(null)

  /*
   * §V2-S17/S22 frames `16:32` / `21:15` — the starter cards, for this surface.
   *
   * THE SURFACE IS PART OF THE KEY, and so is the workspace, because the cards
   * differ by both and a shared key would serve a list's cards on the
   * workspace page. `currentView` is the hint the panel is already given about
   * where it was opened — `describeCurrentView(routeId)` in the app shell — and
   * it is mapped to the server's two surfaces here rather than sent raw, so a
   * new view string cannot silently become a surface the server does not know.
   *
   * TWO surfaces, because two is what the shell can produce. The list route's
   * segments are all parameters, so the hint there is the literal `'list'`; the
   * /ai page passes no hint at all. A task is a sheet over the list route, not
   * a route, so there is no task hint to map — and a third surface nothing
   * could send would be a branch that exists only to be listed.
   *
   * `staleTime` is the global 30s. That is right for this: the overdue count
   * moves over a day, not over a keystroke, and a starter row that re-fetched
   * on every render would flicker between two sets while somebody read it.
   */
  const starterSurface: 'workspace' | 'list' = currentView === 'list' ? 'list' : 'workspace'
  const { data: starters } = useQuery({
    queryKey: ['ai-starters', workspaceId, starterSurface],
    queryFn: () =>
      api<StarterResponse>(`/ai/starters?workspaceId=${workspaceId}&surface=${starterSurface}`),
    enabled: !!workspaceId,
    retry: false,
  })

  /** §V2-S18 `[17:32]` — the preferred AI, read from the server, not the browser. */
  const preferenceQuery = useQuery({
    queryKey: ['ai-model-preference', workspaceId],
    queryFn: () => api<ModelPreference>(`/ai/preferences?workspaceId=${workspaceId}`),
    retry: false,
  })
  const preferredTier = preferenceQuery.data?.isSet ? preferenceQuery.data.preferredTier : null

  /*
   * Adopt the stored preference ONCE, and only while nothing has been chosen
   * in this session. Keying the effect on the query data instead would undo
   * somebody's in-session choice on the next refetch — the model silently
   * changing back under them mid-conversation.
   */
  useEffect(() => {
    if (tier !== null) return
    if (preferenceQuery.isPending) return
    setTier(preferenceQuery.data?.preferredTier ?? 'deep')
  }, [tier, preferenceQuery.isPending, preferenceQuery.data?.preferredTier])

  const savePreference = useMutation({
    mutationFn: (preferred: string) =>
      api<ModelPreference>(`/ai/preferences?workspaceId=${workspaceId}`, {
        method: 'PUT',
        body: JSON.stringify({ preferredTier: preferred }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-model-preference', workspaceId] })
      toast.success(t('aiModels.preferredSaved'))
    },
    onError: () => toast.error(t('aiModels.preferredFailed')),
  })

  /*
   * Close the picker on an outside click. Without it the popover sits over the
   * composer and swallows the first click anywhere else on the panel, which
   * reads as the panel being frozen.
   */
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ available: boolean }>('/ai/status'),
    retry: false,
  })

  /*
   * §V2-S16 frame `20:10` — the chips' live data, fetched ONCE for the whole
   * conversation rather than once per chip.
   *
   * The key is the id list itself, so it changes exactly when the set of things
   * being referred to changes: reopening a thread with the same six tasks is
   * one request, and a seventh reference is a new key rather than a stale
   * answer. `staleTime` is 30s globally, which is the right trade here — a
   * badge is re-read on every mount, and a status changed in another tab
   * appears on the next visit rather than mid-sentence.
   *
   * The streaming buffer is included, so a chip in a half-written answer starts
   * resolving while the rest of the sentence is still arriving — which is what
   * the frame's row of grey skeletons is.
   */
  const refIds = useMemo(
    () => collectRefs([...messages.map((m) => m.content), streamBuffer]),
    [messages, streamBuffer],
  )
  const refsQuery = useQuery({
    queryKey: ['ai-refs', workspaceId, refIds.taskIds.join(','), refIds.listIds.join(',')],
    queryFn: () =>
      api<RefResponse>('/ai/refs', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, taskIds: refIds.taskIds, listIds: refIds.listIds }),
      }),
    enabled: !!workspaceId && (refIds.taskIds.length > 0 || refIds.listIds.length > 0),
    retry: false,
  })
  const refIndex = useMemo<RefIndex>(
    () => ({
      tasks: new Map((refsQuery.data?.tasks ?? []).map((t) => [t.id, t])),
      lists: new Map((refsQuery.data?.lists ?? []).map((l) => [l.id, l])),
      // `isFetching` rather than `isPending`: a disabled query is "pending"
      // forever, and every chip would be a skeleton that never resolves.
      pending: refsQuery.isFetching,
      workspaceId,
    }),
    [refsQuery.data, refsQuery.isFetching, workspaceId],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  /**
   * Load a thread's history when it changes.
   *
   * Keyed on the thread id rather than the query data: the query refetches, and
   * re-seeding on every settle would wipe a turn that is still streaming.
   *
   * AND THE FIRST SEED COULD WIPE ONE THAT HAD ALREADY FINISHED. The guard
   * above stops RE-seeding; it says nothing about the one seed it does allow.
   * Arriving with `?thread=X&prompt=Y` starts a turn on mount, and if the
   * history request settles after that turn lands — a slow first fetch is
   * enough — this replaced `messages` wholesale and the answer the person just
   * watched arrive disappeared, along with the step log above it explaining
   * what it did. Nothing was broken afterwards: the next thread switch loads
   * the stored copy. The answer simply vanished off the screen.
   *
   * `ai-answer-rendering` is where this surfaced. Its busy-state section holds
   * the `/ai/chat` response open, asserts the in-flight state, releases it and
   * then looks for the `create_list` step — a step the finished message carries
   * in `msg.steps`. The check had never passed, and the suite had never once
   * run to its own declared length, so its twenty-one break patches were all
   * measured against short runs.
   *
   * So the history is MERGED over what this mount produced rather than
   * replacing it. Nothing is duplicated: the seed runs once per thread, so the
   * server's own copy of the turn is never shown beside the local one, and the
   * local one is dropped at the next thread switch.
   *
   * AND THE PARAGRAPH ABOVE OVERSTATED WHAT THIS FIXED, which is worth leaving
   * in rather than quietly editing. Two things were changed together to make
   * that suite green — an unbounded `innerText()` was bounded, and this seed
   * stopped replacing a turn it had not seen — and the measurement says the
   * first was the whole of it. `aar-24-history-seed-replaces-the-turn` restored
   * the wholesale replace and all 52 checks still passed, through three
   * different attempts to catch it: a delayed request (the server then answers
   * late, with the turn already in the history it returns), a stale snapshot
   * served three seconds after the answer lands, and the same again reading
   * only the FINALISED answer rather than the streaming element. The stale
   * history was verified to have actually been served in the last of those, so
   * the race was staged and the turn survived it.
   *
   * The merge stays, because "a turn already on screen is not removed" is the
   * behaviour a reader expects and the seed runs once per thread so it cannot
   * duplicate. But it is a conservative choice that nothing measures, not a fix
   * for the check above, and the audit does not get to claim it as one.
   */
  useEffect(() => {
    if (!threadId) {
      if (loadedThreadRef.current !== null) {
        loadedThreadRef.current = null
        setMessages([])
      }
      return
    }
    if (loadedThreadRef.current === threadId) return
    const loaded = threadQuery.data
    if (!loaded || loaded.id !== threadId) return
    loadedThreadRef.current = threadId
    const history = loaded.messages.map((m) => ({
      role: m.role,
      content: m.content,
      id: m.id,
      feedback: m.feedback ?? null,
    }))
    setMessages((prev) => {
      const known = new Set(history.map((m) => m.id))
      return [...history, ...prev.filter((m) => !known.has(m.id))]
    })
  }, [threadId, threadQuery.data])

  /**
   * §15 — the loop icon. Drops the last answer and asks the same question
   * again, rather than appending a second answer below the first: the point is
   * to replace one you did not like, and leaving both makes the panel a log of
   * attempts.
   */
  function regenerate() {
    if (isStreaming) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    setMessages((prev) => {
      const cut = [...prev]
      while (cut.length > 0 && cut[cut.length - 1].role === 'assistant') cut.pop()
      return cut
    })
    void sendMessage(lastUser.content, { skipEcho: true })
  }

  async function sendMessage(content: string, opts: { skipEcho?: boolean } = {}) {
    if (!content.trim() || isStreaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content, id: Date.now().toString() }
    // A regenerate re-uses the question already on screen, so echoing it again
    // would show it twice.
    if (!opts.skipEcho) setMessages((prev) => [...prev, userMsg])
    // Written alongside, not awaited: the message is already on screen, and
    // blocking the answer on a write nobody is waiting for would make the
    // assistant feel slower than it is. A failed write loses one turn of
    // history, never the reply.
    /*
     * Awaited, unlike the append below it: the id it returns is what every
     * later write and every per-message action hangs off, so racing past it
     * would drop the first turn of a conversation on the floor and leave the
     * action row disabled until the second.
     */
    let writeTo = activeThreadId
    if (!writeTo && persist) {
      writeTo = await chat
        .create(skillId)
        .then((thread) => thread.id)
        .catch(() => null)
      if (writeTo) setOwnThreadId(writeTo)
    }
    if (writeTo && !opts.skipEcho) void chat.append(writeTo, 'user', content).catch(() => {})
    setIsStreaming(true)
    setStreamBuffer('')
    setSteps([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = useAuthStore.getState().accessToken
      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          // Send the real workspaceId so the server builds a grounded context
          // via buildWorkspaceContext (Plan §7.6), plus the current-view hint.
          workspaceId,
          currentView,
          // §15 — omitted entirely when absent, so a normal chat turn is
          // byte-identical to what it was before skills existed.
          ...(skillId ? { skillId } : {}),
          // Omitted rather than sent as null while the stored preference is
          // still in flight: the server falls back to DEFAULT_TIER, which is
          // the same answer, and a null in the body would read as a choice.
          ...(tier ? { tier } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        // A refused skill comes back as JSON with a reason ("This skill is
        // disabled", "Skill not found"). Swallowing it and saying "Stream
        // request failed" would hide the one thing the person can act on.
        const reason = await response
          .clone()
          .json()
          .then((body: { error?: string }) => body?.error)
          .catch(() => undefined)
        throw new Error(reason || 'Stream request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      // A local alongside the state: setSteps is async, and the message is
      // finalized in this same tick, so reading the state here would attach
      // whatever it held one render ago.
      const collectedSteps: string[] = []
      let collectedFollowUps: string[] = []
      /*
       * §V2-S16 — containers the SERVER said it created, kept apart from the
       * prose on purpose. These are ids that came back from an insert; the
       * sentence beside them is the model's account of the same event, and only
       * one of the two is evidence.
       */
      const collectedCreated: CreatedContainer[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              // G13-10 — the retrieval trace, ahead of any text.
              if (parsed.step) {
                collectedSteps.push(String(parsed.step))
                setSteps((prev) => [...prev, String(parsed.step)])
              }
              // G13-9 — one frame, at the end, after the marker was stripped
              // server-side. Nothing here has to know the marker exists.
              if (Array.isArray(parsed.followUps)) {
                collectedFollowUps = parsed.followUps.map((f: unknown) => String(f))
              }
              // §V2-S16 `[18:48]` — a row that now exists, named on the wire.
              if (parsed.created?.id && (parsed.created.kind === 'list' || parsed.created.kind === 'folder')) {
                collectedCreated.push({
                  kind: parsed.created.kind,
                  id: String(parsed.created.id),
                  name: String(parsed.created.name ?? ''),
                  path: String(parsed.created.path ?? ''),
                })
              }
              if (parsed.delta) {
                accumulated += parsed.delta
                setStreamBuffer(accumulated)
              }
            } catch {
              // Ignore malformed stream frames and continue.
            }
          }
        }
      }

      // Finalize
      const assistantMsg: Message = {
        role: 'assistant',
        content: accumulated,
        id: Date.now().toString(),
        steps: collectedSteps.length ? collectedSteps : undefined,
        followUps: collectedFollowUps.length ? collectedFollowUps : undefined,
        created: collectedCreated.length ? collectedCreated : undefined,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamBuffer('')
      if (writeTo && accumulated.trim()) {
        void chat
          .append(writeTo, 'assistant', accumulated)
          // This is the turn that can trigger the rename, per `shouldAutoTitle`.
          .then((r) => { if (r?.title) onThreadTitled?.(r.title) })
          .catch(() => {})
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: t('aiPanel.errorMessage'),
            id: Date.now().toString(),
          },
        ])
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  // §A6.4 — a handed-in question is sent as if the user had typed it. The ref
  // holds the ask already dispatched, so re-renders (or a panel that stays
  // mounted while the user navigates) never replay it.
  const sentAskRef = useRef<number | null>(null)
  useEffect(() => {
    if (!ask || sentAskRef.current === ask.id || !ask.text.trim()) return
    sentAskRef.current = ask.id
    void sendMessage(ask.text)
    onAskHandled?.()
    // sendMessage is re-created every render; the ref above is the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.id, ask?.text])

  function stopStreaming() {
    abortRef.current?.abort()
    setIsStreaming(false)
    if (streamBuffer) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: streamBuffer, id: Date.now().toString() },
      ])
      setStreamBuffer('')
    }
  }

  const aiAvailable = statusQuery.data?.available !== false
  const busy = busyStateFor(steps, streamBuffer.length > 0)

  return (
    <AiRefs.Provider value={refIndex}>
    <div className={cn('flex flex-col h-full bg-card', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Rundesk AI</p>
          <p className="text-xs text-muted-foreground">
            {aiAvailable ? t('aiPanel.statusOnline') : t('aiPanel.statusNotConfigured')}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2 text-sm max-w-xs">
                {t('aiPanel.greeting')}
              </div>
            </div>
            {/*
              §V2-S17/S22 frames `16:32` and `21:15` — THE STARTER CARDS.

              Four cards, each a title over one line, in a grid — and, between
              those two frames, four DIFFERENT cards on the same surface in the
              same session. The set is the feature; the wording is not.

              What was here was `SUGGESTED_PROMPT_KEYS`: five translation keys
              in a `const` array, the same five in every workspace, for every
              person, for ever. There was no input that could have changed
              them. Now the set comes from `GET /ai/starters`, which reads how
              much of YOUR work is overdue, how much is open, and which surface
              asked — and each card arrives with the fact that put it there.

              `data-because` carries that fact onto the DOM. Without it, "the
              cards changed" is only ever two different lists of ids, which is
              also exactly what a set rotating on a timer would look like.
            */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-8">{t('aiPanel.tryAsking')}</p>
              {/*
                A NEAR-MISS ON PURPOSE, and it needs saying: the container is
                `ai-starters` and each card is `ai-starter-<id>`, so a prefix
                query for `ai-starter-` does NOT match the container — the
                character after `ai-starter` is `s`, not `-`. One rename to
                `ai-starter-row` and every count of the cards is off by one, in
                the direction that still looks plausible. A testid prefix is a
                namespace; this one has a wall in it exactly one byte thick.
              */}
              <div
                className="ml-8 grid grid-cols-2 gap-2"
                data-testid="ai-starters"
                data-contextual={starters?.contextual ?? 0}
                data-surface={starterSurface}
              >
                {(starters?.cards ?? []).map((card) => (
                  <button
                    key={card.id}
                    data-testid={`ai-starter-${card.id}`}
                    data-because={card.because}
                    onClick={() => sendMessage(t(card.promptKey as TranslationKey))}
                    className="rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="block text-xs font-medium text-foreground">
                      {t(card.titleKey as TranslationKey)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {t(card.subtitleKey as TranslationKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <Fragment key={msg.id}>
            {/* G13-10 — above the answer it explains, and it stays there. */}
            {msg.role === 'assistant' && <AiTrace steps={msg.steps ?? []} t={t} />}
          <MessageBubble
            key={msg.id}
            message={msg}
            workspaceId={workspaceId}
            threadId={activeThreadId}
            // Only the LAST answer can be regenerated: re-asking from the
            // middle of a conversation would silently discard everything said
            // after it, which is not what a refresh icon promises.
            onRegenerate={
              !isStreaming && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id
                ? () => regenerate()
                : undefined
            }
          />
            {/*
              G13-9 [18:42] — "Follow ups", under the answer they came from.

              She drives the entire demo by clicking one of these, which is the
              part our static cold-start menu could never do: it rendered only
              while `messages.length === 0`, so the moment you asked anything
              the guided path disappeared.

              Rendered only when the model offered some. Most turns should have
              none — it is told to omit them rather than invent a next step,
              and three chips of filler under every reply would train people to
              stop reading them.
            */}
            {msg.role === 'assistant' && (msg.followUps?.length ?? 0) > 0 && (
              <div className="ml-8 space-y-1" data-testid={`ai-followups-${msg.id}`}>
                <p className="text-[11px] text-muted-foreground">{t('aiPanel.followUps')}</p>
                <div className="flex flex-col items-start gap-1">
                  {msg.followUps!.map((suggestion, i) => (
                    <button
                      key={`${msg.id}-f${i}`}
                      type="button"
                      data-testid={`ai-followup-${msg.id}-${i}`}
                      disabled={isStreaming}
                      onClick={() => sendMessage(suggestion)}
                      className="rounded-full border border-border/70 px-2.5 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Fragment>
        ))}

        {/*
          G13-10 [18:33–18:36] — the trace, above the answer.

          Rendered only while streaming, and only from steps the server
          actually sent. Nothing here is invented client-side: if the server
          skipped a piece of work, its line is absent, which is what makes this
          evidence rather than a loading animation with words on it.
        */}
        {/*
          §V2-S16 frames `18:45` / `20:10` — the word, ABOVE the step log,
          exactly where the frames put it. It replaces nothing: the step log is
          the honest half and stays as it is. This is the state before the first
          step arrives, which is the half that was a bare spinner.
        */}
        {isStreaming && <AiBusyState state={busy} t={t} />}
        {isStreaming && <AiTrace steps={steps} t={t} />}

        {/* Streaming */}
        {isStreaming && streamBuffer && (
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2 max-w-xs">
              {/*
                The same renderer as a settled answer, so a heading or a chip
                does not pop into a different shape the instant the stream ends.
                A partially-arrived `[[task:` is simply not a match yet and
                renders as the text it currently is.
              */}
              <AiAnswer content={streamBuffer} testId="ai-answer-streaming" />
              <span className="inline-block w-1 h-3.5 bg-brand-700 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}
        {isStreaming && !streamBuffer && (
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        {!aiAvailable && (
          <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
            <Wand2 className="h-3.5 w-3.5" />
            {t('aiPanel.configHint')}
          </p>
        )}
        {voice.supported && (voice.listening || voice.interimTranscript) && (
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden />
            <span className="font-medium">{t('ai.voiceListening')}</span>
            {voice.interimTranscript && <span className="italic truncate">{voice.interimTranscript}</span>}
          </p>
        )}
        {voice.error && (
          <p className="mb-2 text-xs text-amber-600" role="alert">
            {voice.error === 'not-allowed' || voice.error === 'service-not-allowed'
              ? t('ai.voicePermissionDenied')
              : t('ai.voiceError')}
          </p>
        )}
        {/* §15 — the composer's context chip, frame `296_1817`. It is not
            decoration: it is the only thing on screen that says this answer is
            coming from a skill rather than the generic assistant, and it must
            stay visible while the reply streams. */}
        <div className="mb-2 flex items-center gap-2">
          {skillId && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground"
              data-testid="ai-skill-chip"
            >
              <Gem className="h-3 w-3 text-primary" />
              <span className="truncate max-w-[14rem]">{skillName ?? t('skills.title')}</span>
            </div>
          )}
          {/*
            §V2-S18, frame `[17:16]` — her model picker, built as the frame
            draws it and NOT as the frame promises.

            What it draws: a popover headed "Best models", rows with a provider
            glyph, a tick on the current one, per-model Speed / Intelligence
            bars, and a "Show more" disclosure under a rule.

            What it promises, and this product cannot keep: routing to ChatGPT
            or Gemini. There is no OpenAI or Google client anywhere in the API.
            So they are listed — silence would be read as "not yet, soon" —
            under the disclosure, unselectable, each saying why. The inversion
            of the frame, where Claude was the hidden one, is deliberate: what
            is hidden here is what cannot be done.

            Disabled mid-answer, because changing it then would look like it
            applied to the reply already streaming.
          */}
          <div className="relative ml-auto" ref={pickerRef}>
            <button
              type="button"
              data-testid="ai-model-tier"
              data-tier={tier ?? ''}
              data-open={pickerOpen ? 'true' : 'false'}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              disabled={isStreaming || !tier}
              title={modelTiers.find((m) => m.id === tier)?.hint ?? ''}
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              <span>{modelTiers.find((m) => m.id === tier)?.label ?? t('aiModels.loading')}</span>
              {pickerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>

            {pickerOpen && (
              <div
                data-testid="ai-model-menu"
                role="listbox"
                aria-label={t('aiModels.bestModels')}
                className="absolute bottom-full right-0 z-[60] mb-2 w-[19rem] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
              >
                <p
                  data-testid="ai-model-group-best"
                  className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground"
                >
                  {t('aiModels.bestModels')}
                </p>
                {bestModels.map((m) => (
                  <ModelPickerRow
                    key={m.id}
                    model={m}
                    selected={tier === m.id}
                    preferred={preferredTier === m.id}
                    hovered={hoveredModel === m.id}
                    onHover={setHoveredModel}
                    onPick={() => {
                      // Choosing changes THIS conversation. Persisting is the
                      // separate, explicit act below — `[17:28]`–`[17:32]`
                      // describes both, and conflating them means every idle
                      // experiment silently rewrites your default.
                      setTier(m.id)
                      setPickerOpen(false)
                    }}
                    t={t}
                  />
                ))}

                <div className="border-t border-border">
                  <button
                    type="button"
                    data-testid="ai-model-show-more"
                    aria-expanded={showMoreModels}
                    onClick={() => setShowMoreModels((s) => !s)}
                    className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60"
                  >
                    {showMoreModels ? (
                      <ChevronsUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronsDown className="h-3.5 w-3.5" />
                    )}
                    {showMoreModels ? t('aiModels.showLess') : t('aiModels.showMore')}
                  </button>
                  {showMoreModels && (
                    <div data-testid="ai-model-more" className="pb-1">
                      {/*
                        `[17:20]` — what the disclosure reveals. In ClickUp it
                        is more MODELS; here it is both, and in that order: any
                        routable tier past the frame's three, then the two
                        providers this product has no client for. The same row
                        component draws the routable ones, so a tier cannot
                        behave differently for having been hidden.
                      */}
                      {moreModels.map((m) => (
                        <ModelPickerRow
                          key={m.id}
                          model={m}
                          selected={tier === m.id}
                          preferred={preferredTier === m.id}
                          hovered={hoveredModel === m.id}
                          onHover={setHoveredModel}
                          onPick={() => {
                            setTier(m.id)
                            setPickerOpen(false)
                          }}
                          t={t}
                        />
                      ))}
                      {unavailableModels.map((m) => (
                        <div
                          key={m.id}
                          data-testid={`ai-model-option-${m.id}`}
                          data-available="false"
                          aria-disabled="true"
                          className="flex items-start gap-2 px-3 py-2 opacity-70"
                        >
                          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium text-muted-foreground line-through">
                              {m.label}
                            </span>
                            {/*
                              The reason, in the person's language. Without it
                              a greyed-out row says "broken"; with it, it says
                              what would have to change.
                            */}
                            <span
                              data-testid={`ai-model-reason-${m.id}`}
                              className="mt-0.5 block text-[11px] text-muted-foreground"
                            >
                              {t(m.reasonKey as TranslationKey)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/*
                  `[17:32]` "apna [preferred] AI bhi set down karna hai." The
                  separate, explicit act — and the one that goes to the server,
                  so the answer follows the person to another browser.
                */}
                <div className="border-t border-border p-2">
                  <button
                    type="button"
                    data-testid="ai-model-set-preferred"
                    data-preferred-tier={preferredTier ?? ''}
                    disabled={!tier || preferredTier === tier || savePreference.isPending}
                    onClick={() => tier && savePreference.mutate(tier)}
                    className="w-full rounded-md bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {preferredTier === tier ? t('aiModels.isPreferred') : t('aiModels.setPreferred')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* relative z-50 lifts the composer above the fixed support-widget launcher
            (bottom-6 right-6 z-40), which otherwise intercepts clicks on the Send button. */}
        {/*
          §V2-S18 `17:42`–`17:50` — the word bar, above the input as the frames
          put it.

          Three words, and they change as you type. Rendered only while there is
          something to continue and while the composer can be typed in at all: a
          bar of suggestions over a disabled input is a control that cannot be
          used, floating above the one place that already says so.

          `onMouseDown` with `preventDefault` rather than `onClick`, because a
          click steals focus from the input first and the caret would jump to
          the end of the text — which is the wrong place when the suggestion is
          completing a half-typed word.
        */}
        {wordSuggestions.length > 0 && aiAvailable && !isStreaming && (
          <div
            /* The same one-byte wall as `ai-starters` above: the bar is
               `ai-word-suggestions`, each word is `ai-word-suggestion-<word>`,
               and the prefix query misses the bar only because `s` follows.
               Do not rename this to `ai-word-suggestion-bar`. */
            data-testid="ai-word-suggestions"
            data-count={wordSuggestions.length}
            className="relative z-50 mb-1 inline-flex items-center gap-1 rounded-lg bg-foreground px-2 py-1 shadow-lg"
          >
            {wordSuggestions.map((word) => (
              <button
                key={word}
                type="button"
                data-testid={`ai-word-suggestion-${word.replace(/\s+/g, '-')}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setInput((prev) => applyWordSuggestion(prev, word))
                  inputRef.current?.focus()
                }}
                className="rounded px-2 py-0.5 text-xs text-background hover:bg-background/20"
              >
                {word}
              </button>
            ))}
          </div>
        )}
        <div className="relative z-50 flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            /*
             * THE COMPOSER HAD NO `onChange`, AND SO COULD NOT BE TYPED INTO.
             *
             * `value={input}` with no handler is a fully controlled input:
             * React writes `input` back into the DOM node on every render, so
             * each keystroke was reverted before it could be seen. Measured,
             * not inferred — with the composer enabled, editable and visible:
             *
             *     FILL OK; inputValue after fill: ""
             *     inputValue after TYPING:        ""
             *     word bar count:                 0
             *
             * React does not warn here, because it only warns for `value`
             * without `onChange` when `readOnly` is absent AND the input is not
             * `disabled` at first render — and this one mounts disabled while
             * `/ai/status` is in flight. So the one signal that would have
             * caught it was suppressed by an unrelated correct behaviour.
             *
             * It survived because nothing that worked went through this box:
             * the starter cards call `sendMessage` with their own prompt, and
             * the mic button writes the transcript into `input` directly. The
             * dead control was the one the placeholder invites you to use.
             *
             * `nextWordSuggestions` is pure and was always right; it had simply
             * never been called with anything but `''`.
             */
            onChange={(e) => setInput(e.target.value)}
            data-testid="ai-composer-input"
            /*
             * §V2-S16 frames `18:45` / `20:10` — the composer reads **"Working
             * on it…"** while the answer is being produced, and goes back to
             * the invitation afterwards.
             *
             * THE DEFECT THIS FIXES, separately from the frame. The input is
             * `disabled` one line below while streaming and while AI is not
             * configured, and it kept saying *"Ask Rundesk AI anything…"*
             * throughout — a dead control inviting you to type into it. Three
             * states now, and each says what is true: busy, unavailable, ready.
             *
             * BUSY WINS OVER UNAVAILABLE, in that order. An answer in flight is
             * the more specific fact and it is the one the frame shows; the
             * configuration notice is the resting state and it is still on
             * screen above the composer while a request is out.
             */
            placeholder={
              isStreaming
                ? t('aiPanel.placeholderWorking')
                : !aiAvailable
                  ? t('aiPanel.placeholderUnavailable')
                  : t('aiPanel.inputPlaceholder')
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            disabled={!aiAvailable || isStreaming}
            className="text-sm"
          />
          <MicButton
            controller={voice}
            disabled={isStreaming}
            labels={{
              start: t('ai.voiceStart'),
              stop: t('ai.voiceStop'),
              unsupported: t('ai.voiceUnsupported'),
            }}
          />
          {isStreaming ? (
            <Button variant="outline" size="icon" onClick={stopStreaming} title={t('aiPanel.stop')}>
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              disabled={!input.trim() || !aiAvailable}
              onClick={() => sendMessage(input)}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
    </AiRefs.Provider>
  )
}

function MessageBubble({
  message,
  workspaceId,
  threadId,
  onRegenerate,
}: {
  message: Message
  workspaceId: string
  threadId: string | null
  onRegenerate?: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<'task' | 'doc' | null>(null)
  const [vote, setVote] = useState<'up' | 'down' | null>(message.feedback ?? null)
  const isUser = message.role === 'user'
  const actions = useAiMessageActions(workspaceId, threadId)

  function copy() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          isUser ? 'bg-brand-200' : 'bg-gradient-to-br from-brand-700 to-brand-500',
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-accent" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-white" />
        )}
      </div>
      <div className="group max-w-xs relative">
        <div
          data-testid={isUser ? `ai-question-${message.id}` : undefined}
          className={cn(
            'rounded-xl px-3 py-2 text-sm',
            isUser
              ? 'bg-brand-700 text-white rounded-tr-sm whitespace-pre-wrap'
              : 'bg-muted rounded-tl-sm',
          )}
        >
          {/*
            §V2-S16 frame `20:10` — *"**Project status:** 13 open tasks total:
            **11 To Do, 1 In Progress, 1 Complete**…"*, four bold runs in one
            paragraph, plus the chips that follow it.

            An answer goes through the renderer this product already ships for
            comments and descriptions; a QUESTION does not. What you typed is
            what you typed — running your own words through a markdown parser
            would silently eat an asterisk out of a question about globbing,
            and there is nothing to gain from formatting your own input.
          */}
          {isUser ? message.content : <AiAnswer content={message.content} testId={`ai-answer-${message.id}`} />}
        </div>
        {/*
          §V2-S16 `[18:48]` — what this turn actually brought into existence.

          Rendered from the ids the SERVER reported on the wire, beside the
          sentence rather than inside it. The row exists whatever the answer
          says about it, and if the answer says something and this is empty,
          the difference is visible instead of buried.
        */}
        {!isUser && (message.created?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1" data-testid={`ai-created-${message.id}`}>
            {message.created!.map((c) => (
              <span
                key={c.id}
                data-testid={`ai-created-${c.kind}-${c.id}`}
                data-created-kind={c.kind}
                className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[11px] text-emerald-700 dark:text-emerald-400"
              >
                {c.kind === 'folder' ? <FolderPlus className="h-3 w-3" /> : <ListTree className="h-3 w-3" />}
                <span className="truncate">{c.path || c.name}</span>
              </span>
            ))}
          </div>
        )}
        {/* §15 — her six-icon row, frames `302_1842` / `303_1858`: copy, create
            task, save to doc, regenerate, thumbs up, thumbs down.
            Only under an ANSWER: "save this to a doc" under your own question
            would save the question. */}
        <div
          className={cn(
            'flex items-center gap-2 pt-1 text-muted-foreground transition-opacity',
            // A vote is a state, not a hover affordance — hiding it would make
            // it impossible to tell you had already voted.
            vote ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          data-testid={isUser ? undefined : 'ai-message-actions'}
        >
          <IconAction onClick={copy} title={t('aiPanel.copy')} testid="ai-action-copy">
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" />
            )}
          </IconAction>

          {!isUser && (
            <>
              <IconAction
                title={t('aiPanel.createTask')}
                testid="ai-action-task"
                disabled={!threadId || busy !== null}
                onClick={async () => {
                  setBusy('task')
                  try {
                    const { task } = await actions.createTask(message.id)
                    toast.success(t('aiPanel.taskCreated', { title: task.title }))
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('aiPanel.errorMessage'))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === 'task' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
              </IconAction>

              <IconAction
                title={t('aiPanel.saveToDoc')}
                testid="ai-action-doc"
                disabled={!threadId || busy !== null}
                onClick={async () => {
                  setBusy('doc')
                  try {
                    await actions.saveToDoc(message.id)
                    toast.success(t('aiPanel.savedToDoc'))
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('aiPanel.errorMessage'))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === 'doc' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileOutput className="h-3.5 w-3.5" />}
              </IconAction>

              {onRegenerate && (
                <IconAction title={t('aiPanel.regenerate')} testid="ai-action-regenerate" onClick={onRegenerate}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconAction>
              )}

              <IconAction
                title={t('aiPanel.thumbsUp')}
                testid="ai-action-up"
                disabled={!threadId}
                onClick={async () => {
                  // Optimistic, and pressing the same one again clears it —
                  // the server applies the identical rule, so a failed write
                  // just leaves the two briefly disagreeing.
                  const next = vote === 'up' ? null : 'up'
                  setVote(next)
                  await actions.setFeedback(message.id, 'up').catch(() => setVote(vote))
                }}
              >
                <ThumbsUp className={cn('h-3.5 w-3.5', vote === 'up' && 'text-emerald-500')} />
              </IconAction>

              <IconAction
                title={t('aiPanel.thumbsDown')}
                testid="ai-action-down"
                disabled={!threadId}
                onClick={async () => {
                  const next = vote === 'down' ? null : 'down'
                  setVote(next)
                  await actions.setFeedback(message.id, 'down').catch(() => setVote(vote))
                }}
              >
                <ThumbsDown className={cn('h-3.5 w-3.5', vote === 'down' && 'text-destructive')} />
              </IconAction>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function IconAction({
  children,
  onClick,
  title,
  testid,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  testid: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      data-testid={testid}
      disabled={disabled}
      className="hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}
