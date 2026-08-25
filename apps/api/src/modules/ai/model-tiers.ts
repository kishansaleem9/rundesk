/**
 * §15 — the composer's model picker, frames `296_1817` / `301_1836` / `302_1842`.
 *
 * Hers reads "Max ▾". The names are theirs; the trade is real and the same one:
 * a question you want answered now against a question you want answered well.
 *
 * Two tiers, not five. Every extra option here is a decision pushed onto
 * someone who asked a question and wanted an answer — and Rundesk only has two
 * models configured, so a longer list would be a menu of aliases pretending to
 * be choices.
 */
export interface ModelTier {
  id: 'fast' | 'deep'
  /** The Anthropic model this actually resolves to. */
  model: string
  /** Shown in the picker. */
  label: string
  /** One line, so the choice can be made without knowing model names. */
  hint: string
}

export const MODEL_TIERS: readonly ModelTier[] = [
  {
    id: 'fast',
    model: 'claude-haiku-4-5',
    label: 'Fast',
    hint: 'Quick answers, short questions',
  },
  {
    id: 'deep',
    model: 'claude-sonnet-4-6',
    label: 'Deep',
    hint: 'Slower, better at reasoning through your workspace',
  },
] as const

/** What chat used before a picker existed, so the default changes nothing. */
export const DEFAULT_TIER: ModelTier['id'] = 'deep'

/**
 * Resolve a requested tier to a model.
 *
 * Anything unrecognised falls back to the default rather than throwing: a bad
 * value in a query string should not cost someone their answer, and the caller
 * has no better option to offer them than the one they would have got anyway.
 */
export function modelForTier(tier: string | undefined | null): string {
  const found = MODEL_TIERS.find((t) => t.id === tier)
  return (found ?? MODEL_TIERS.find((t) => t.id === DEFAULT_TIER)!).model
}

export function tierFor(tier: string | undefined | null): ModelTier {
  return MODEL_TIERS.find((t) => t.id === tier) ?? MODEL_TIERS.find((t) => t.id === DEFAULT_TIER)!
}
