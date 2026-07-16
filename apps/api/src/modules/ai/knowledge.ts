/**
 * Pure helpers + curated knowledge for the two §14.4 / §15.1 AI surfaces.
 *
 * Kept free of NestJS/DB imports so every piece is unit-testable without a
 * database or a live model:
 *   - §15.1 Knowledge base: id parsing, context assembly, and the deterministic
 *     "matches found" answer used when the model is unavailable. Retrieval is
 *     RETRIEVAL-AUGMENTED over the existing keyword SearchService (not a
 *     vector/embeddings store) — we rank by keyword relevance and cite the
 *     source items verbatim, never fabricating.
 *   - §14.4 Help center: a compact, curated help/FAQ knowledge base embedded as
 *     a constant, plus the keyword matcher that backs the deterministic fallback.
 */

// ─── §15.1 Knowledge base ─────────────────────────────────────────────────────

/** A raw hit as returned by SearchService.search(). */
export type RawSearchHit = {
  id: string
  entityType: string
  title: string
  content: string
  url: string
}

/** A cited source returned to the client. */
export type KnowledgeSource = { type: string; id: string; title: string; url: string }

/**
 * Split a prefixed search id (`task-<uuid>`, `doc-<uuid>`, `comment-<uuid>`, …)
 * into its entity type and raw id. Ids that carry no prefix map to themselves.
 */
export function splitSearchId(id: string): { type: string; rawId: string } {
  const idx = id.indexOf('-')
  if (idx <= 0) return { type: id, rawId: id }
  return { type: id.slice(0, idx), rawId: id.slice(idx + 1) }
}

/** Map a raw search hit to the cited-source shape returned to the client. */
export function hitToSource(hit: RawSearchHit): KnowledgeSource {
  const { type, rawId } = splitSearchId(hit.id)
  return { type, id: rawId, title: hit.title, url: hit.url }
}

/**
 * Assemble the compact, numbered context block fed to the model. Each hit is a
 * `[n]` citation the model is told to reference. Token-bounded: caps to 8 items
 * and trims each snippet to 240 chars.
 */
export function assembleKnowledgeContext(hits: RawSearchHit[]): string {
  return hits
    .slice(0, 8)
    .map((h, i) => {
      const snippet = (h.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
      const label = h.entityType || splitSearchId(h.id).type
      return `[${i + 1}] (${label}) ${h.title}${snippet ? `\n${snippet}` : ''}`
    })
    .join('\n\n')
}

/**
 * Deterministic answer used when the model is unavailable or errors. Reports the
 * matches found and points at the sources — it NEVER fabricates an answer.
 */
export function deterministicKnowledgeAnswer(question: string, sources: KnowledgeSource[]): string {
  const q = question.trim().replace(/\s+/g, ' ')
  if (sources.length === 0) {
    return `No matching items were found in the workspace content you can access${q ? ` for “${q}”` : ''}.`
  }
  const n = sources.length
  return `Found ${n} relevant ${n === 1 ? 'item' : 'items'} in the workspace content you can access${
    q ? ` for “${q}”` : ''
  }. See the cited sources below.`
}

// ─── §14.4 Help center knowledge base ─────────────────────────────────────────

export type HelpTopic = {
  /** Stable slug — also the on-page FAQ anchor for the four headline topics. */
  id: string
  question: string
  answer: string
  keywords: string[]
}

/**
 * Curated help/FAQ knowledge base (§14.4). This is the ONLY ground truth fed to
 * the model, and the corpus the deterministic keyword fallback matches against.
 * The first four ids mirror the on-page FAQ cards so cited sources can deep-link.
 */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'create-task',
    question: 'How do I create a task?',
    answer:
      'Click the New button in the top bar and choose Task, or open any list and use the inline composer at the bottom of a group. You can also press ⌘K (Ctrl K on Windows/Linux), type a title, and press Enter to create a task straight from the command palette.',
    keywords: ['create', 'task', 'new', 'add', 'composer', 'todo', 'item'],
  },
  {
    id: 'invite-members',
    question: 'How do I invite members to my workspace?',
    answer:
      'Open Workspace settings from your avatar menu, go to the Members tab, and send an invite by email. Invitees receive a link to join your workspace with the role you assign (admin, member, or guest).',
    keywords: ['invite', 'member', 'members', 'teammate', 'people', 'user', 'workspace', 'join', 'seat', 'role'],
  },
  {
    id: 'sprints',
    question: 'How do sprints work?',
    answer:
      'Sprints group tasks into time-boxed iterations. Open Sprints in the sidebar to start a new sprint, set its start and end dates, then drag tasks in from your backlog. Progress and burndown update automatically as tasks move through their statuses.',
    keywords: ['sprint', 'sprints', 'agile', 'iteration', 'backlog', 'burndown', 'scrum', 'velocity'],
  },
  {
    id: 'shortcuts',
    question: 'What keyboard shortcuts are there?',
    answer:
      'Press ⌘K (or Ctrl K on Windows/Linux) anywhere to open the command palette — search across tasks, docs and people, jump to any page, or create a task on the fly. Start typing in the top-bar search box to jump straight into search.',
    keywords: ['keyboard', 'shortcut', 'shortcuts', 'hotkey', 'command', 'palette', 'search', 'jump'],
  },
  {
    id: 'docs',
    question: 'How do I write and share docs?',
    answer:
      'Open Docs in the sidebar to create a rich-text document. Docs can live at the workspace level or inside a space; use the share controls to decide who can view or edit. Type “/” inside a doc for the block menu (headings, checklists, tables, and more).',
    keywords: ['doc', 'docs', 'document', 'wiki', 'note', 'notes', 'write', 'share', 'page'],
  },
  {
    id: 'automations',
    question: 'How do automations work?',
    answer:
      'Automations run “when this happens, do that” rules — for example, when a task moves to Done, notify a channel. Open Automations from the workspace sidebar to add a rule from a trigger and one or more actions. The AI page can also suggest useful rules from your recent activity.',
    keywords: ['automation', 'automations', 'rule', 'rules', 'trigger', 'workflow', 'when', 'then'],
  },
  {
    id: 'time-tracking',
    question: 'How do I track time on tasks?',
    answer:
      'Open a task and use the timer in its detail panel to start and stop tracking, or log time manually with a duration and note. Time entries roll up into the Time and Workload views and can be marked billable per project.',
    keywords: ['time', 'timer', 'track', 'tracking', 'hours', 'log', 'timesheet', 'billable', 'duration'],
  },
  {
    id: 'goals',
    question: 'How do goals work?',
    answer:
      'Goals track measurable targets and progress toward them. Open Goals in the sidebar to create a goal, set a target, and link the tasks or metrics that roll up into it. Progress updates as the linked work advances.',
    keywords: ['goal', 'goals', 'objective', 'okr', 'target', 'progress', 'metric'],
  },
  {
    id: 'search',
    question: 'How do I search across my workspace?',
    answer:
      'Use the top-bar search box or press ⌘K to search across tasks, docs, comments, people, and chat you have access to. You can filter by status, priority, assignee, label, due date, and custom-field value, and save frequent searches as presets.',
    keywords: ['search', 'find', 'filter', 'query', 'lookup', 'saved', 'preset'],
  },
  {
    id: 'ai-assistant',
    question: 'What can the AI assistant do?',
    answer:
      'Open the AI page to chat about your workspace, ask the Knowledge base a question grounded in your tasks and docs, generate tasks from a prompt, turn meeting notes into action items, and improve writing. Answers are drawn only from content you can access.',
    keywords: ['ai', 'assistant', 'claude', 'knowledge', 'ask', 'chat', 'generate', 'summarize', 'smart'],
  },
]

// Short, common English stopwords dropped before keyword matching.
const HELP_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'do', 'does', 'how', 'what', 'is', 'are', 'can',
  'i', 'my', 'me', 'we', 'you', 'your', 'with', 'about', 'it', 'this', 'that', 'from', 'get', 'up', 'so', 'if',
  'there', 'any', 'be', 'as', 'at', 'by',
])

/** Tokenize free text into lowercased, de-stopworded terms of length ≥ 3. */
export function helpTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !HELP_STOPWORDS.has(t))
}

/**
 * Deterministic keyword match (§14.4 fallback): score each help topic by how
 * many distinct question terms hit its keywords/title, and return the closest
 * `limit` with score > 0, best first. Ties break by topic order (stable).
 */
export function matchHelpTopics(
  question: string,
  topics: HelpTopic[] = HELP_TOPICS,
  limit = 3,
): Array<HelpTopic & { score: number }> {
  const terms = new Set(helpTokens(question))
  if (terms.size === 0) return []
  const scored = topics.map((topic) => {
    const haystack = new Set([...topic.keywords.map((k) => k.toLowerCase()), ...helpTokens(topic.question)])
    let score = 0
    for (const term of terms) {
      if (haystack.has(term)) score += 2
      else if ([...haystack].some((h) => h.includes(term) || term.includes(h))) score += 1
    }
    return { ...topic, score }
  })
  return scored
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Assemble the curated help KB as the grounding block for the model. */
export function formatHelpKnowledgeBase(topics: HelpTopic[] = HELP_TOPICS): string {
  return topics.map((t) => `Q: ${t.question}\nA: ${t.answer}`).join('\n\n')
}

/** Map a help topic to a cited source that deep-links to the on-page FAQ. */
export function helpTopicToSource(topic: HelpTopic): KnowledgeSource {
  return { type: 'faq', id: topic.id, title: topic.question, url: `/app/help#help-${topic.id}` }
}

export const HELP_NO_MATCH =
  "I couldn't find a matching help topic. Try rephrasing your question, or contact support and we'll be glad to help."
