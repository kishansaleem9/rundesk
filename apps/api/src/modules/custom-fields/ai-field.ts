/**
 * CLICKUP'S AI FIELDS (`commit-log/log-c980bee-1`, `ledger-rows/row-719`,
 * `harness/ai-rows-blocked-on-empty-key`).
 *
 * ClickUp's AI fields live within its Short Text, Long Text and Dropdown
 * fields: Sentiment is a Short Text; Summary, Progress Updates, Action Items
 * and Translation are Long Text; Categorize is a Dropdown; and Custom Text and
 * Custom Dropdown follow an instruction their maker writes. So are these: an
 * AI field is a `text`, `long_text` or `dropdown` definition whose
 * `config.ai` says which, and its value is that type's value, written by the
 * model when somebody asks (or, as ClickUp's "fill" settings say, when a task
 * is made or changes). Pure, so the rules are unit-tested without a database.
 */

export const AI_FIELD_KINDS = [
  'summary',
  'progress_updates',
  'action_items',
  'translation',
  'sentiment',
  'categorize',
  'custom_text',
  'custom_dropdown',
] as const
export type AiFieldKind = (typeof AI_FIELD_KINDS)[number]

/** The field types an AI field can live within. */
export type AiBaseType = 'text' | 'long_text' | 'dropdown'
export const AI_BASE_TYPES: ReadonlySet<string> = new Set<AiBaseType>(['text', 'long_text', 'dropdown'])

/** Which type each kind lives within, as ClickUp's do. */
export const AI_FIELD_BASE: Record<AiFieldKind, readonly AiBaseType[]> = {
  summary: ['long_text'],
  progress_updates: ['long_text'],
  action_items: ['long_text'],
  translation: ['long_text'],
  sentiment: ['text'],
  categorize: ['dropdown'],
  custom_text: ['text', 'long_text'],
  custom_dropdown: ['dropdown'],
}

export type AiFieldConfig = {
  kind: AiFieldKind
  /** Custom Text's and Custom Dropdown's instruction, in their maker's words. */
  prompt?: string
  /** Translation's language, e.g. `French`. */
  language?: string
  /** ClickUp's "Autofill new tasks": a task made where the field is gets its value. */
  autofill: boolean
  /** ClickUp's "Auto-update": a task that changes gets its value again. */
  autoUpdate: boolean
}

export class AiFieldConfigError extends Error {}

const PROMPT_MAX = 2000
const LANGUAGE_MAX = 60

/**
 * `config.ai` as sent, checked for the type it is to live within. Every refusal
 * says which rule, because "invalid config" tells the person filling the form
 * nothing they can act on.
 */
export function toAiConfig(type: string, raw: unknown): AiFieldConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AiFieldConfigError('An AI field’s settings are an object naming its kind')
  }
  const r = raw as Record<string, unknown>
  const kind = r.kind
  if (typeof kind !== 'string' || !(AI_FIELD_KINDS as readonly string[]).includes(kind)) {
    throw new AiFieldConfigError(`An AI field is one of: ${AI_FIELD_KINDS.join(', ')}`)
  }
  const k = kind as AiFieldKind
  if (!(AI_FIELD_BASE[k] as readonly string[]).includes(type)) {
    throw new AiFieldConfigError(
      `A ${k.replace(/_/g, ' ')} AI field is a ${AI_FIELD_BASE[k].map((b) => b.replace('_', ' ')).join(' or ')} field, not ${type.replace('_', ' ')}`,
    )
  }
  const out: AiFieldConfig = { kind: k, autofill: r.autofill === true, autoUpdate: r.autoUpdate === true }
  if (k === 'custom_text' || k === 'custom_dropdown') {
    const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : ''
    if (!prompt) throw new AiFieldConfigError('A custom AI field needs the instruction it follows')
    if (prompt.length > PROMPT_MAX) throw new AiFieldConfigError(`An AI field’s instruction is at most ${PROMPT_MAX} characters`)
    out.prompt = prompt
  }
  if (k === 'translation') {
    const language = typeof r.language === 'string' ? r.language.trim() : ''
    if (!language) throw new AiFieldConfigError('A Translation field needs the language it translates into')
    if (language.length > LANGUAGE_MAX) throw new AiFieldConfigError(`A language is at most ${LANGUAGE_MAX} characters`)
    out.language = language
  }
  return out
}

/** A stored definition's AI settings, or null for a field that is not an AI field. */
export function aiConfigOf(type: string, config: unknown): AiFieldConfig | null {
  if (!AI_BASE_TYPES.has(type)) return null
  const ai = (config as { ai?: unknown } | null | undefined)?.ai
  if (!ai) return null
  try {
    return toAiConfig(type, ai)
  } catch {
    return null
  }
}

export const SENTIMENTS = ['Positive', 'Neutral', 'Negative'] as const

const LONG_TEXT_MAX = 10_000
const SHORT_TEXT_MAX = 1_000

/**
 * WHAT THE MODEL ANSWERED, as the value the field holds — or why it holds
 * nothing. A Dropdown takes one of its own options and nothing else: an answer
 * that names none is refused rather than stored as a value the field does not
 * define, and rather than guessed at. Sentiment is one of its three words.
 */
export function aiFieldValue(
  base: AiBaseType,
  kind: AiFieldKind,
  answer: string,
  options: ReadonlyArray<{ label: string; value: string }> | null,
): { value: string } | { refused: string } {
  const said = answer.trim()
  if (!said) return { refused: 'The AI answered nothing — nothing was saved' }
  if (base === 'dropdown') {
    const bare = said.replace(/^["'“‘]+|["'”’.!]+$/g, '').trim().toLowerCase()
    const opts = options ?? []
    const hit =
      opts.find((o) => o.label.trim().toLowerCase() === bare) ??
      opts.find((o) => o.value.trim().toLowerCase() === bare)
    return hit
      ? { value: hit.value }
      : { refused: `The AI answered “${said.slice(0, 80)}”, which is not one of this field’s options — nothing was saved` }
  }
  if (kind === 'sentiment') {
    const word = SENTIMENTS.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(said))
    return word
      ? { value: word }
      : { refused: `The AI answered “${said.slice(0, 80)}”, not Positive, Neutral or Negative — nothing was saved` }
  }
  if (base === 'text') return { value: said.replace(/\s+/g, ' ').slice(0, SHORT_TEXT_MAX) }
  return { value: said.slice(0, LONG_TEXT_MAX) }
}
